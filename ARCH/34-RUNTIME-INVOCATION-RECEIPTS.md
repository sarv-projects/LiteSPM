# Runtime, Invocation Engine & Receipts

Status: **`WIRED` for the invocation registry, the engine and the receipts; `DESIGNED` for §4 (provider health and the circuit breaker) and §7 (cross-provider fallback).** The invocation registry, the invocation engine and the receipt chain **exist and are reachable from production code** as of 2026-10-19: `internal/receipts` is the one durable registry (one JSON line per invocation, one hash chain per provider instance), `internal/invocation` is the engine around it (deadline, per-provider concurrency limit, queue backpressure, cooperative cancellation, redaction, bounded output), and the daemon's `invocation.get` / `invocation.cancel` answer from it. **§4's health states and circuit breaker are not implemented, and §7's cross-provider fallback is not implemented** — a provider that dies is not restarted and not triped, and no call is ever substituted across providers.

**Reality today:** `internal/provider` start/stop/probe is `WIRED`, `internal/discover` writes real `providers` and `capabilities` rows, and `provider.invoke` calls a tool through the policy gate — every call now runs inside the invocation engine, so it leaves a receipt behind and the response carries an `invocationId`. `invocation.get` and `invocation.cancel` (and the Bridge `get_invocation` / `cancel_invocation`) **resolve**: an id that was never issued is a typed `LPSM-INVOCATION-NOT-FOUND` (-32602), never a `-32601` stub. What remains `DESIGNED` is stated above and in §3, §4 and §7 below.

---

## 1. Capability Registry

A single registry maps a `(capabilityId, schemaFingerprint)` to a runnable provider instance. It is the missing bridge between "a tool the model wants" and "a process that can run it".

```go
type CapabilityRecord struct {
    CapabilityID      string  // e.g. mcp:…:postgres/server/query
    ListingID         string
    InstallID         string
    Kind              string  // tool | mcp-provider | …
    Transport         string  // stdio | streamable-http | sse
    InputSchemaJSON   string
    SchemaFingerprint string  // SHA-256 of canonicalised inputSchema
    ProviderInstance  string  // supervisor handle for the running provider
    Status            string  // see §4
}
```

Invariants:

* A capability is invocable only when a **live** provider instance backs it and the runtime tuple matches an active `CapabilityGrant`: `(capabilityId, schemaFingerprint, casTreeDigest)` for local stdio, or `(capabilityId, schemaFingerprint, endpointOrigin, serverVersionDigest)` for remote ([14 §4.1](14-BRIDGE-PROVIDER-MCP.md), [15](15-POLICY-APPROVALS.md)).
* The registry is populated from the **install path**, not by tests. Populating `providers`/`capabilities` on install is the concrete next step (`m4`, `STATUS.md` §4).
* `search_capabilities` and `describe_capability` read the registry; they must not fabricate rows when it is empty.

---

## 2. Invocation API

Daemon IPC methods and their Bridge tool equivalents:

| IPC method | Bridge tool | Contract |
|---|---|---|
| `provider.invoke` | `invoke_capability` | Submit a capability call; returns an `invocationId` and initial state. |
| `invocation.get` | `get_invocation` | Fetch state/result/receipt for an `invocationId`. |
| `invocation.cancel` | `cancel_invocation` | Request cooperative cancellation by `invocationId`. |
| `capabilities.search` | `search_capabilities` | Search the registry. |
| `capabilities.describe` | `describe_capability` | Describe one capability incl. schema fingerprint. |

```go
type InvokeParams struct {
    CapabilityID      string          `json:"capabilityId"`
    Arguments         json.RawMessage `json:"arguments"`
    DeadlineMs        int             `json:"deadlineMs,omitempty"`   // bounded; server clamps
    IdempotencyKey    string          `json:"idempotencyKey,omitempty"`
}

type InvocationState struct {
    InvocationID string          `json:"invocationId"`   // invocation_<26>
    State        string          `json:"state"`          // queued|running|succeeded|failed|cancelled|deadline_exceeded
    Result       json.RawMessage `json:"result,omitempty"`
    Error        *ErrorEnvelope  `json:"error,omitempty"`
    Receipt      *InvocationReceipt `json:"receipt,omitempty"`
}
```

Rules:

* Every handler validates the capability, the grant, and the schema fingerprint **before** dispatch; a `-32601` remains correct only for an unimplemented method, never for a missing registry row. *(Implemented 2026-10-19: the grant and schema checks stay in `internal/discover` — the engine wraps the call, it is never a way around them.)*
* `arguments` are validated against `InputSchemaJSON` before the provider sees them.
* Invocation IDs use the same Crockford base32 scheme as plan IDs ([23 §2](23-SCHEMAS-EXAMPLES.md)).

**`provider.invoke` is synchronous by default and has two modes** (2026-10-19). The contract in
[06 §4](06-API-CONTRACTS.md) is unchanged: the default call runs to completion in the request and
returns `{"output", "isError"}`. It now also returns `invocationId` and the `receipt` the call
produced, and accepts two optional fields: `deadlineMs` (clamped by the server) and `async: true`,
which returns `{"invocationId", "state"}` immediately and lets the call outlive the request. A failed
call returns the `invocationId` in the error's `data`, so a caller can still fetch its receipt.

---

## 3. Invocation Engine

```text
 submit ──▶ validate(capability, grant, schema) ──▶ queue ──▶ dispatch ──▶ provider
                                                            │              │
                                   deadline/cancel ◀────────┘              │
                                                                           ▼
                        receipt + bounded result ◀── redact/normalize ◀── raw output
```

Required behaviours:

* **Deadline.** Every invocation has a bounded deadline (client-supplied, server-clamped to a maximum). Expiry cancels the call and yields `deadline_exceeded` with a receipt. **Implemented** (`internal/invocation` `clampDeadline`; a request larger than the maximum is clamped down).
* **Cancellation.** `invocation.cancel` propagates through the Go context to the provider child process (kill on timeout), and is idempotent. **Implemented** — the cancel is recorded in the store, the call's context is cancelled, the child is stopped by the supervisor, and a repeated cancel returns the same terminal invocation.
* **Concurrency.** A per-provider concurrency limit bounds in-flight calls; excess calls queue with backpressure rather than pile up unbounded. **Implemented** (`providerSlot`, one slot per provider).
* **Backpressure.** When the queue is full, `provider.invoke` fails fast with a typed `LPSM-PROVIDER-BUSY` rather than growing memory or blocking the daemon. **Implemented.**
* **Restart.** A crashed provider is restarted under the supervisor; in-flight invocations fail with a typed error and are **not** transparently retried across a restart unless the call is declared idempotent by the caller (`idempotencyKey`). See §7. **Not implemented (2026-10-19):** the engine does not restart a provider. A provider that dies fails its invocation with a typed error, and the call is not retried anywhere — so the "not retried" half holds by construction, and the "restarted" half does not. `idempotencyKey` is not read.
* **Schema drift.** If the provider's live `inputSchema` fingerprint no longer matches the grant, the invocation is denied with `LPSM-PROVIDER-SCHEMA-DRIFT` before dispatch (reusing the existing grant-check logic in [15 §4](15-POLICY-APPROVALS.md)). **Implemented** — this check predates the engine and still runs inside it.
* **Redaction.** Provider stdout/stderr and result payloads pass a redaction pass (known secret patterns, connection strings, tokens) before persisting or returning. Redaction failures fail closed. **Implemented** (`internal/invocation/redact.go`; GitHub, `sk-`, AWS and `Bearer` token forms, and `scheme://user:password@host` connection strings).

---

## 4. Provider Health & Circuit Breaker

Health states (superset of the current probe output):

```text
STARTING ──▶ READY ──▶ DEGRADED ──▶ UNHEALTHY ──▶ BACKOFF ──▶ STOPPED
    │           ▲           │             │            │
    └───────────┴───────────┴─────────────┴────────────┘
                  (recovery / successful probe)
```

| State | Meaning |
|---|---|
| `STARTING` | Process launched, handshake not complete. |
| `READY` | Handshake complete; probes healthy. |
| `DEGRADED` | Some probes failing or latency above threshold; calls still attempted. |
| `UNHEALTHY` | Consecutive failures exceed threshold; calls refused. |
| `BACKOFF` | Restart delayed by exponential backoff. |
| `STOPPED` | Intentionally stopped; not invocable. |

The circuit breaker trips on consecutive failures/timeouts into `UNHEALTHY`, then `BACKOFF`, and closes again only after a successful probe. Health is derived from observed probe results — never fabricated ([AGENTS.md](../AGENTS.md) Tab 4). `doctor` reports the observed state, not a claim.

**Not implemented (2026-10-19).** None of the states above is derived anywhere: there is no health
field on the provider row, no `DEGRADED`/`UNHEALTHY`/`BACKOFF` transition, and no breaker that opens
on consecutive failures. A provider that fails fails its invocation; nothing observes the pattern.
The state names above stay a design, and no surface may report them.

---

## 5. Bounded Output

Provider output is untrusted and potentially unbounded.

* stdout/stderr are captured into a **bounded ring buffer**; overflow truncates with an explicit marker and a byte count, never a silent drop.
* **Provider stderr is never piped into model context.** It may inform error envelopes and the receipt, after redaction.
* Output is rate-limited, ANSI-stripped, binary-detected, and UTF-8-validated before any consumer sees it.
* Result size is bounded; an oversized result is truncated with `truncated: true` and the original digest, rather than returned whole.

These rules are the missing half of the existing bounded-buffer work ([31 §9](31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md)).

**Implemented 2026-10-19** for the invocation result: `internal/invocation/bounds.go` truncates an
oversized result with an explicit marker and the original byte count, records `truncated: true` and
the digest of the **original** bytes, and the provider's stderr is redacted and never returned in a
result. The provider supervisor's own 64 KiB rotating stderr buffer is unchanged.

---

## 6. Tamper-Evident Invocation Receipts

Every completed invocation produces a receipt bound to the authorization and the runtime state.

```go
type InvocationReceipt struct {
    InvocationID      string    `json:"invocationId"`
    CapabilityID      string    `json:"capabilityId"`
    PackageDigest     string    `json:"packageDigest"`      // CAS tree digest
    SchemaFingerprint string    `json:"schemaFingerprint"`
    ProviderInstance  string    `json:"providerInstance"`
    PolicyDecisionID  string    `json:"policyDecisionId"`
    ApprovalID        string    `json:"approvalId,omitempty"`
    Outcome           string    `json:"outcome"`            // succeeded|failed|cancelled|deadline_exceeded
    StartedAt         time.Time `json:"startedAt"`
    EndedAt           time.Time `json:"endedAt"`
    InputDigest       string    `json:"inputDigest"`        // digest of canonicalised arguments
    OutputDigest      string    `json:"outputDigest"`
    PrevReceiptHash   string    `json:"prevReceiptHash"`    // hash-chain link
    ReceiptHash       string    `json:"receiptHash"`
}
```

Tamper-evidence:

* `ReceiptHash` is a digest over the canonical-JSON projection of all fields except itself.
* `PrevReceiptHash` chains each receipt to the previous one for the same provider instance, so deletion/reordering is detectable.
* Receipts are appended to the audit log ([20](20-ERRORS-AUDIT-DOCTOR.md)); outputs are represented by digest, not necessarily retained.
* `audit --ci` ([36](36-ENTERPRISE-POLICY-AND-AUDIT.md)) verifies the chain.

---

## 7. Cross-Provider Fallback

Governed by the binding decision in [15 §5](15-POLICY-APPROVALS.md):

* **Same-provider restart/retry is allowed** within the deadline and circuit-breaker state; a retry consumes the same grant and policy decision.
* **Blind cross-provider semantic fallback is forbidden for writes.** No automatic substitution among providers for any effectful capability.
* **Read-only equivalence declarations only.** A cross-provider substitute requires a read-only capability plus an explicit, individually approvable equivalence declaration asserting equivalent schemas and semantics. Similarity of names/descriptions is never sufficient.

**Not implemented (2026-10-19).** No call is ever substituted across providers, and no call is
retried — which satisfies the second and third rules by doing nothing, but leaves the first
(`same-provider restart/retry`) unimplemented along with the restart it depends on (§3). The
equivalence declaration has no schema and no storage.

---

## 8. Acceptance Test Sketch

1. Installing a capability populates `providers` and `capabilities` from non-test code; `search_capabilities` returns it and `describe_capability` returns its fingerprint.
2. `invoke_capability` against a fake MCP server returns a result and a receipt whose `ReceiptHash` verifies; `get_invocation` returns the same receipt.
3. A call exceeding its deadline returns `deadline_exceeded`; `cancel_invocation` stops an in-flight call and is idempotent.
4. A schema change at the provider blocks invocation with `LPSM-PROVIDER-SCHEMA-DRIFT` before dispatch.
5. Provider stderr is absent from result/model context and appears only, redacted, in the error/receipt.
6. Circuit breaker trips after N consecutive failures and closes after a successful probe.
7. A write call that fails is **not** retried against a different provider; a read-only call with a declaration may be.

---

## 9. Related Documents

* Provider supervisor, launch specs, drift binding: [14 — Bridge, Provider Supervisor & MCP](14-BRIDGE-PROVIDER-MCP.md).
* Policy, grants, fallback decision: [15 — Policy & Approvals](15-POLICY-APPROVALS.md).
* IPC transport and `$/cancelRequest`: [11 — Local Runtime & IPC](11-LOCAL-RUNTIME-IPC.md).
* Receipts in the audit log: [20 — Errors, Audit & Doctor](20-ERRORS-AUDIT-DOCTOR.md).
* Audit replay and chain verification: [36 — Enterprise Policy & Audit](36-ENTERPRISE-POLICY-AND-AUDIT.md).
* Runtime adapters and materialisation: [17 §5](17-SOURCE-ARTIFACT-RUNTIME-ADAPTERS.md).
