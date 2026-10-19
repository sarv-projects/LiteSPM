# ARCH/34 — Invocation Engine, Registry & Receipts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `invocation.get` and `invocation.cancel` real (they return JSON-RPC `-32601` today), give every invocation a durable tamper-evident receipt, and add the deadline / cancellation / concurrency / backpressure / redaction / bounded-output behaviours `ARCH/34` specifies.

**Architecture:** `internal/receipts` is already a durable invocation registry with a per-provider receipt hash chain (`Open`, `RegisterPending`, `Get`, `Cancel`, `Record`, `VerifyChain`). This plan **extends that package** rather than adding a second registry, and adds one new package `internal/invocation` that owns the engine: deadline, per-provider concurrency limit, queue backpressure, redaction and bounded output. The daemon owns the engine; the Bridge tools call the daemon.

**Tech Stack:** Go 1.26.0, `modernc.org/sqlite` (unchanged), the existing `internal/ipc` JSON-RPC framing, `internal/policy` for grant checks, `internal/discover` for the actual tool call.

**Spec:** `ARCH/34-RUNTIME-INVOCATION-RECEIPTS.md` (the governing design), `ARCH/15-POLICY-APPROVALS.md` §4 (grant + drift), `ARCH/06-API-CONTRACTS.md` §4 (the existing `provider.invoke` contract), `STATUS.md` §4.

## Global Constraints

- **Do not break the synchronous contract.** `provider.invoke` stays synchronous by default and keeps returning `{"output", "isError"}`. It gains `invocationId` and `receipt` fields alongside. ARCH/06 §4 is amended, not silently replaced.
- **One registry.** There is exactly one invocation registry in the tree: `internal/receipts.Store`. A second one is a defect.
- **Fail closed.** An unknown invocation id is `LPSM-INVOCATION-NOT-FOUND`, never an empty success. A queue at capacity is `LPSM-PROVIDER-BUSY`. A redaction failure fails the invocation closed. A provider that dies mid-call fails the invocation with a typed error — it never returns empty output as success.
- **Provider stderr never reaches model context.** It may inform the error envelope and the receipt, after redaction.
- **Bounded output.** An oversized result is truncated with `truncated: true`, an explicit marker and the original digest — never returned whole, never silently dropped.
- **Cancellation is real and idempotent.** A cancelled invocation stops the provider child, records a `cancelled` receipt, and the receipt chain still verifies afterwards.
- **Every completed invocation writes a receipt** whose `ReceiptHash` verifies via `Store.VerifyChain()`.
- **Evidence states:** a row is `WIRED` only when a non-test caller reaches it. Tests alone are `TESTED`.

## Review Focus

1. **A provider that dies mid-call** → the invocation fails with a typed error and a `failed` receipt; it does not return empty output as success.
2. **Cancellation while the provider is mid-call** → the child process is actually stopped, the receipt says `cancelled`, and `VerifyChain()` still passes afterwards.
3. **A result larger than the output bound** → truncated with `truncated: true` and the original digest preserved.
4. **A queue at capacity** → `LPSM-PROVIDER-BUSY`, fast, without unbounded growth.
5. **A provider that writes a token to stderr** → the token never appears in the result, the error envelope, or the receipt.

---

## Task 1: Extend `internal/receipts` to a complete registry

**Files:**
- Modify: `internal/receipts/receipts.go`
- Test: `internal/receipts/receipts_test.go`

**Interfaces:**
- Consumes: the existing `Receipt`, `Invocation`, `Store`, `Open`, `Record`, `Get`, `Cancel`, `RegisterPending`, `VerifyChain`, and the `State*` / `Outcome*` constants.
- Produces:
  - `func (s *Store) RecordReceipt(r Receipt) (*Invocation, error)` — records a fully-populated receipt: sets `PrevReceiptHash` from the provider instance's last hash, computes `ReceiptHash` over the canonical projection, chains it, persists it. The existing `Record(...)` becomes a thin wrapper over it.
  - `func (s *Store) SetState(id, state string) error` — moves a pending invocation to `queued` / `running`. Rejects unknown ids with `LPSM-INVOCATION-NOT-FOUND` and rejects a transition out of a terminal state.
  - `func (s *Store) AttachCancel(id string, cancel func()) error` — attaches the in-flight cancellation function to a pending invocation. Attaching to a terminal invocation is a no-op; attaching twice replaces the func.
  - `func (s *Store) Pending() []*Invocation` — every non-terminal invocation, newest last.

- [ ] **Step 1: Write the failing test — a full receipt round-trips and its chain verifies.**
  In `internal/receipts/receipts_test.go` add `TestRecordReceiptCarriesEveryFieldAndVerifies`: open a memory store, call `RecordReceipt` with a receipt carrying `PackageDigest`, `SchemaFingerprint`, `PolicyDecisionID`, `ApprovalID`, `Truncated: true`, then assert the returned invocation's receipt has identical field values, that `ReceiptHash` is non-empty, that `VerifyChain()` returns nil, and that the receipt's `PrevReceiptHash` equals the previous receipt's `ReceiptHash` for the same provider instance.
- [ ] **Step 2: Run the test and watch it fail.**
  Run: `go test ./internal/receipts/ -run TestRecordReceiptCarriesEveryFieldAndVerifies -v`
  Expected: FAIL — `s.RecordReceipt undefined`.
- [ ] **Step 3: Implement `RecordReceipt`.**
  In `internal/receipts/receipts.go`, add `RecordReceipt(r Receipt) (*Invocation, error)`: validate `r.Outcome` against the existing `Outcome*` set (same error string `LPSM-RECEIPTS-OUTCOME` the current `Record` uses), set `r.PrevReceiptHash = s.lastHashLocked(r.ProviderInstance)`, compute `r.ReceiptHash = hashReceipt(&r)`, build the `Invocation` with `State: r.Outcome`, store it, append to `s.order[r.ProviderInstance]`, and persist via `appendLocked`. Rewrite the existing `Record(...)` to build a `Receipt` and delegate.
  Note: `hashReceipt` must cover every field except `ReceiptHash` itself — check what it currently hashes and add `PackageDigest`, `SchemaFingerprint`, `PolicyDecisionID`, `ApprovalID` and `Truncated` if they are missing.
- [ ] **Step 4: Run the test and watch it pass.**
  Run: `go test ./internal/receipts/ -run TestRecordReceiptCarriesEveryFieldAndVerifies -v`
  Expected: PASS.
- [ ] **Step 5: Write the failing test — state transitions and cancel attachment.**
  Add `TestSetStateRejectsTerminalAndUnknown` (a pending invocation moves `queued`→`running`; a terminal one refuses with an error; an unknown id returns `LPSM-INVOCATION-NOT-FOUND`) and `TestAttachCancelIsCalledOnceAndIsIdempotent` (attaching a cancel func, then `Cancel(id)`, invokes the func exactly once; a second `Cancel(id)` returns the same terminal invocation and does not invoke it again).
- [ ] **Step 6: Run them and watch them fail.**
  Run: `go test ./internal/receipts/ -run 'TestSetState|TestAttachCancel' -v`
  Expected: FAIL — `s.SetState undefined`, `s.AttachCancel undefined`.
- [ ] **Step 7: Implement `SetState`, `AttachCancel` and `Pending`.**
  `SetState` locks, looks the id up (unknown → `LPSM-INVOCATION-NOT-FOUND`), refuses a move out of `StateSucceeded`/`StateFailed`/`StateCancelled`/`StateDeadlineExceeded`, otherwise sets `State` and `UpdatedAt`. `AttachCancel` stores the func in a `map[string]func()` on the `Store`; `Cancel` calls it after flipping the state, exactly once, and deletes it so a repeat call is a no-op. `Pending` returns every invocation whose state is not terminal.
- [ ] **Step 8: Run the whole package and the whole tree.**
  Run: `go test ./internal/receipts/ -v && go test ./...`
  Expected: PASS, with no other package affected.
- [ ] **Step 9: Commit.**
  ```bash
  git add internal/receipts
  git commit -m "feat(receipts): a registry that records every receipt field and a real cancel"
  ```

---

## Task 2: `internal/invocation` — the engine

**Files:**
- Create: `internal/invocation/engine.go`
- Create: `internal/invocation/redact.go`
- Create: `internal/invocation/bounds.go`
- Test: `internal/invocation/engine_test.go`, `internal/invocation/redact_test.go`, `internal/invocation/bounds_test.go`

**Interfaces:**
- Consumes: `receipts.Store` (the registry), `receipts.Receipt`, `receipts.State*`; `domain` error codes.
- Produces:
  ```go
  package invocation

  type Invoker func(ctx context.Context, capabilityID string, arguments json.RawMessage) (Output, error)
  type Output struct {
      Text      string          `json:"text"`
      IsError   bool            `json:"isError"`
      Truncated bool            `json:"truncated,omitempty"`
      Digest    string          `json:"digest,omitempty"`
      Stderr    string          `json:"-"` // redacted provider stderr; never returned in a result
  }

  type Options struct {
      MaxConcurrentPerProvider int           // default 4
      MaxQueuedPerProvider     int           // default 16
      MaxOutputBytes           int           // default 1 MiB
      MaxDeadline              time.Duration // default 60s
      Store                    *receipts.Store
      Clock                    func() time.Time
  }

  type Engine struct { /* ... */ }
  func NewEngine(opts Options) *Engine
  func (e *Engine) Submit(ctx context.Context, capabilityID string, arguments json.RawMessage, deadline time.Duration) (*Invocation, error)
  func (e *Engine) Cancel(id string) (*receipts.Invocation, error)
  func (e *Engine) Get(id string) (*receipts.Invocation, error)
  ```
  `Submit` returns immediately with a `queued` invocation carrying an `invocationId`; the call runs on the engine's goroutine. A synchronous convenience `SubmitAndWait(ctx, ...) (*Invocation, error)` blocks until the terminal state and is what the daemon's `provider.invoke` uses by default.

- [ ] **Step 1: Write the failing test — a successful call produces a verifiable receipt.**
  `TestSubmitAndWaitProducesVerifiableReceipt`: an `Engine` with a fake `Invoker` returning `Output{Text: "ok"}`; call `SubmitAndWait`; assert the returned invocation is `succeeded`, its receipt's `ReceiptHash` is non-empty, its `InputDigest` and `OutputDigest` are non-empty, and `engine.Store.VerifyChain()` returns nil.
- [ ] **Step 2: Run it and watch it fail.**
  Run: `go test ./internal/invocation/ -run TestSubmitAndWaitProducesVerifiableReceipt -v`
  Expected: FAIL — the package does not exist.
- [ ] **Step 3: Implement the engine skeleton.**
  Create `internal/invocation/engine.go` with `Options`, `Engine`, `NewEngine`, `Submit`, `SubmitAndWait`, `Cancel`, `Get`. The engine holds the `receipts.Store`, a per-provider semaphore (channel-based) and a per-provider queue depth counter. `Submit` allocates an id in the `invocation_<26>` Crockford base32 form (reuse the scheme `internal/domain` uses for plan ids — check `internal/domain/identifiers.go` for the existing generator and use it rather than writing a second one), registers a pending invocation in the store with state `queued`, attaches the cancel func, and starts a goroutine that acquires the per-provider slot, dispatches, and completes.
  Default the options when a field is zero: 4 concurrent, 16 queued, 1 MiB output, 60s deadline.
- [ ] **Step 4: Run the test and watch it pass.**
  Run: `go test ./internal/invocation/ -run TestSubmitAndWaitProducesVerifiableReceipt -v`
  Expected: PASS.
- [ ] **Step 5: Write the failing test — the queue bound fails fast.**
  `TestQueueBoundReturnsProviderBusy`: an engine with `MaxConcurrentPerProvider: 1, MaxQueuedPerProvider: 1`; a fake `Invoker` that blocks on a channel; submit three calls for the same provider; assert the third returns an error whose message contains `LPSM-PROVIDER-BUSY` and that it returns within a second (fast, not blocking).
- [ ] **Step 6: Run it and watch it fail.**
  Run: `go test ./internal/invocation/ -run TestQueueBoundReturnsProviderBusy -v`
  Expected: FAIL — no bound is enforced.
- [ ] **Step 7: Implement the concurrency limit and backpressure.**
  In `Submit`, before starting the goroutine, take the provider's slot non-blockingly: if the semaphore is full, check the queue depth against `MaxQueuedPerProvider`; when the queue is also full, return an error `fmt.Errorf("LPSM-PROVIDER-BUSY: provider %s has %d in flight and %d queued", provider, inFlight, queued)`. The goroutine releases the slot when it finishes.
- [ ] **Step 8: Run it and watch it pass.**
  Run: `go test ./internal/invocation/ -run TestQueueBoundReturnsProviderBusy -v`
  Expected: PASS.
- [ ] **Step 9: Write the failing test — a deadline is enforced.**
  `TestDeadlineExceededIsRecorded`: an engine with a 50ms max deadline and a fake `Invoker` that sleeps 2s; assert the invocation reaches state `deadline_exceeded`, its receipt outcome is `deadline_exceeded`, and the elapsed wall time is under 1s.
- [ ] **Step 10: Run it and watch it fail.**
  Run: `go test ./internal/invocation/ -run TestDeadlineExceededIsRecorded -v`
  Expected: FAIL — the call runs to completion.
- [ ] **Step 11: Implement the deadline.**
  In `Submit`, clamp the requested deadline to `Options.MaxDeadline` (a request larger than the max is clamped to the max; a zero request uses the max). Create a `context.WithTimeout` on the caller's context, pass it to the `Invoker`, and when the context expires before the call returns, complete the invocation with `receipts.StateDeadlineExceeded` and outcome `deadline_exceeded`.
- [ ] **Step 12: Run it and watch it pass.**
  Run: `go test ./internal/invocation/ -run TestDeadlineExceededIsRecorded -v`
  Expected: PASS.
- [ ] **Step 13: Write the failing test — cancellation stops the call.**
  `TestCancelStopsAnInFlightCallAndRecordsCancelled`: a fake `Invoker` that waits on `ctx.Done()` and reports whether the context was cancelled; submit, wait until it is running, call `engine.Cancel(id)`, assert the invocation state is `cancelled`, the receipt outcome is `cancelled`, the fake observed the cancellation, and `engine.Store.VerifyChain()` still returns nil.
- [ ] **Step 14: Run it and watch it fail.**
  Run: `go test ./internal/invocation/ -run TestCancelStopsAnInFlightCallAndRecordsCancelled -v`
  Expected: FAIL — cancellation does not reach the call.
- [ ] **Step 15: Implement cancellation.**
  The engine's cancel func cancels the invocation's context; `Cancel(id)` calls the store's `Cancel(id)` (which flips the state, writes the cancellation receipt and invokes the attached func) and then cancels the context. The dispatch goroutine, when it observes a cancelled context, does **not** overwrite the terminal state — it records nothing further. Make `Cancel` idempotent: a second call returns the same terminal invocation.
- [ ] **Step 16: Run it and watch it pass.**
  Run: `go test ./internal/invocation/ -run TestCancelStopsAnInFlightCallAndRecordsCancelled -v`
  Expected: PASS.
- [ ] **Step 17: Write the failing test — a dead provider is a typed failure, not empty success.**
  `TestProviderFailureIsRecordedAsFailed`: a fake `Invoker` returning an error; assert the invocation state is `failed`, the receipt outcome is `failed`, and the error is surfaced to the caller.
- [ ] **Step 18: Write the failing test — the output bound truncates.**
  `TestOversizedOutputIsTruncatedWithDigest`: a fake `Invoker` returning 2 MiB of text with `MaxOutputBytes: 1024`; assert the recorded output is at most 1024 bytes plus an explicit truncation marker, `truncated` is true, and the recorded digest is the digest of the **original** bytes.
- [ ] **Step 19: Run them and watch them fail.**
  Run: `go test ./internal/invocation/ -run 'TestProviderFailure|TestOversizedOutput' -v`
  Expected: FAIL.
- [ ] **Step 20: Implement failure handling and `internal/invocation/bounds.go`.**
  `bounds.go` exposes `func BoundOutput(text string, limit int) (string, bool, string)` returning the (possibly truncated) text, a `truncated` flag and the digest of the original bytes; truncation appends a marker naming the original byte count. In the engine, a failed call completes the invocation with `receipts.StateFailed` and outcome `failed`.
- [ ] **Step 21: Run them and watch them pass.**
  Run: `go test ./internal/invocation/ -run 'TestProviderFailure|TestOversizedOutput' -v`
  Expected: PASS.
- [ ] **Step 22: Write the failing test — redaction keeps tokens out of every artifact.**
  `TestRedactionRemovesSecretsFromResultAndStderr`: a fake `Invoker` returning `Output{Text: "token=ghp_abcdefghijklmnopqrstuvwxyz012345", Stderr: "Authorization: Bearer sk-1234567890abcdef"}`; assert the recorded result, the receipt and any returned error contain neither the token nor the bearer secret.
- [ ] **Step 23: Run it and watch it fail.**
  Run: `go test ./internal/invocation/ -run TestRedactionRemovesSecretsFromResultAndStderr -v`
  Expected: FAIL — no redaction exists.
- [ ] **Step 24: Implement `internal/invocation/redact.go`.**
  `redact.go` exposes `func Redact(s string) (string, error)`. It masks, at minimum: `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_` GitHub tokens, `sk-`-prefixed API keys, `Bearer <token>` header values, `AKIA`-prefixed AWS keys, and `scheme://user:password@host` connection strings. Every match is replaced with a fixed marker that names the kind (`[REDACTED:github-token]`) and never the matched length. If the redaction pass itself fails (a regex compile error is impossible, but a nil-safe guard must exist), return an error and fail the invocation closed — the engine must not persist an unredacted payload.
  Apply redaction to: the result text, the provider stderr, and the error string before it is stored or returned.
- [ ] **Step 25: Run it and watch it pass.**
  Run: `go test ./internal/invocation/ -run TestRedactionRemovesSecretsFromResultAndStderr -v`
  Expected: PASS.
- [ ] **Step 26: Run the package and the tree.**
  Run: `go test ./internal/invocation/ -v && go test ./...`
  Expected: PASS.
- [ ] **Step 27: Commit.**
  ```bash
  git add internal/invocation
  git commit -m "feat(invocation): deadlines, cancellation, backpressure, redaction and bounded output"
  ```

---

## Task 3: Wire the daemon

**Files:**
- Modify: `cmd/litespm/main.go` (the `provider.invoke` handler near line 3070; the two `-32601` handlers at 3089 and 3098)
- Modify: `cmd/litespm/help.go` (if a new CLI verb is added)
- Test: `cmd/litespm/main_test.go`

**Interfaces:**
- Consumes: `invocation.NewEngine`, `invocation.Engine.Submit/SubmitAndWait/Cancel/Get`, `receipts.Store`, `discover.Invoke`.
- Produces: three working IPC methods — `provider.invoke` (now also returning `invocationId` and `receipt`), `invocation.get`, `invocation.cancel`.

- [ ] **Step 1: Write the failing test — the daemon answers `invocation.get`.**
  In `cmd/litespm/main_test.go` add `TestInvocationGetReturnsARecordedInvocation`: build the daemon the way the existing handler tests do (reuse the harness in that file), call `provider.invoke` against a capability the test installs, capture the returned `invocationId`, then call `invocation.get` with it and assert the response's `state` is a terminal state and its `receipt.receiptHash` is non-empty.
- [ ] **Step 2: Run it and watch it fail.**
  Run: `go test ./cmd/litespm/ -run TestInvocationGetReturnsARecordedInvocation -v`
  Expected: FAIL — `invocation.get` returns `-32601`.
- [ ] **Step 3: Implement the daemon wiring.**
  In `runDaemonServe` (or wherever the server is constructed — find where the other handlers are registered), open a `receipts.Store` at a path under the data root (`<DATA_ROOT>/receipts.jsonl`; use the same path-resolution helper the daemon already uses for other state files — check `internal/config` for the runtime-root accessor), construct `invocation.NewEngine` with that store, and:
  - `provider.invoke`: keep the current synchronous behaviour and its `{"output", "isError"}` response, and add `invocationId` and `receipt` to the response map. The call goes through `engine.SubmitAndWait` so the receipt is always written. The policy gate stays exactly where it is — the engine must not be a way around `discover.WithPolicy`.
  - `invocation.get`: parse `{"invocationId": "..."}`, call `engine.Get(id)`, return the invocation as JSON. An unknown id is `ipc.CodeInvalidParams` with the message `LPSM-INVOCATION-NOT-FOUND: "<id>"` — **not** `-32601`.
  - `invocation.cancel`: parse `{"invocationId": "..."}`, call `engine.Cancel(id)`, return the invocation. Unknown id → `ipc.CodeInvalidParams` with the same typed message.
- [ ] **Step 4: Run it and watch it pass.**
  Run: `go test ./cmd/litespm/ -run TestInvocationGetReturnsARecordedInvocation -v`
  Expected: PASS.
- [ ] **Step 5: Write the failing test — cancellation over IPC.**
  `TestInvocationCancelOverIPC`: as above, but call `invocation.cancel` while the capability is running (use a test capability that blocks), assert the response state is `cancelled` and that a second `invocation.cancel` returns the same state without an error (idempotent over the wire).
- [ ] **Step 6: Run it and watch it fail.**
  Run: `go test ./cmd/litespm/ -run TestInvocationCancelOverIPC -v`
  Expected: FAIL.
- [ ] **Step 7: Implement whatever the test needs** (the handler exists from step 3; this step normally passes immediately — if it does not, fix the handler, not the test).
- [ ] **Step 8: Run the package and the tree.**
  Run: `go test ./cmd/litespm/ && go test ./...`
  Expected: PASS.
- [ ] **Step 9: Commit.**
  ```bash
  git add cmd/litespm
  git commit -m "feat(daemon): invocation.get and invocation.cancel are real"
  ```

---

## Task 4: Wire the Bridge tools

**Files:**
- Modify: `internal/bridge/shim.go` (the two tools that return `-32601`)
- Test: `internal/bridge/shim_test.go`

**Interfaces:**
- Consumes: the daemon's `invocation.get` / `invocation.cancel` methods; the existing `request_install` shape as the model for how a Bridge tool renders a daemon result.
- Produces: `get_invocation` and `cancel_invocation` tools that forward to the daemon and render the invocation as JSON.

- [ ] **Step 1: Write the failing test — the Bridge tool forwards.**
  In `internal/bridge/shim_test.go` add `TestGetInvocationToolForwardsToTheDaemon`: point the shim at a fake daemon that answers `invocation.get` with a known invocation; call the `get_invocation` tool; assert the tool's text contains the invocation id and the receipt hash, and that the fake daemon received the id.
- [ ] **Step 2: Run it and watch it fail.**
  Run: `go test ./internal/bridge/ -run TestGetInvocationToolForwardsToTheDaemon -v`
  Expected: FAIL — the tool returns "not implemented".
- [ ] **Step 3: Implement the two tools.**
  Replace the `-32601` bodies with calls to the daemon: `get_invocation` takes `{"invocationId": "..."}` and renders the returned invocation; `cancel_invocation` takes the same and renders the cancelled invocation. When the daemon is unreachable, keep the existing standalone failure behaviour (`LPSM-IPC-DAEMON-UNREACHABLE`) — do not invent a local registry.
- [ ] **Step 4: Run it and watch it pass.**
  Run: `go test ./internal/bridge/ -run TestGetInvocationToolForwardsToTheDaemon -v`
  Expected: PASS.
- [ ] **Step 5: Add the cancel-tool test** (`TestCancelInvocationToolForwardsToTheDaemon`), run it, and fix the implementation if it fails.
- [ ] **Step 6: Run the package and the tree.**
  Run: `go test ./internal/bridge/ && go test ./...`
  Expected: PASS.
- [ ] **Step 7: Commit.**
  ```bash
  git add internal/bridge
  git commit -m "feat(bridge): get_invocation and cancel_invocation reach the daemon"
  ```

---

## Task 5: Status reconciliation for this track (owner: the orchestrator, not a subagent)

**Files:**
- Modify: `ARCH/34-RUNTIME-INVOCATION-RECEIPTS.md` (the header status block, §2's table row for `provider.invoke`, and the §5/§6 wording that says the pieces do not exist)
- Modify: `STATUS.md` §4 (the `invocation.get` / `invocation.cancel` row, the "Only these two are the only -32601 handlers left" wording, and §"Not yet true, and not claimed")
- Modify: `TODO.md` (the Phase E rows that name the invocation registry as missing, and the Overhaul backlog row that names ARCH/34 as a blocker)

- [ ] **Step 1: Update `ARCH/34`'s status block to the state the code now supports**, and amend §2 to describe the dual mode (`provider.invoke` synchronous by default with an `invocationId` and receipt; `async: true` returns `{invocationId, state}` immediately). Say plainly which parts of §4 (health states, circuit breaker) and §7 (cross-provider fallback) are still `DESIGNED` — those are not implemented by this plan and the document must not imply they are.
- [ ] **Step 2: Update `STATUS.md` §4**: the `invocation.get` / `invocation.cancel` row moves from `IMPLEMENTED` (returning `-32601`) to the honest state the evidence supports — `WIRED` if a non-test caller reaches it (the daemon handlers and the Bridge tools do), `TESTED` if only tests do. Remove the "these two are the only `-32601` handlers left" claim if it is now false, and add the new limitation: the provider health/circuit-breaker states of ARCH/34 §4 are still `DESIGNED`, and a provider restart is still not automatic.
- [ ] **Step 3: Update `TODO.md`**: the rows that list the invocation registry as a blocker now name the gate that is actually left (ARCH/34 §4 health/circuit breaker, and the cross-provider fallback decision), not the registry itself.
- [ ] **Step 4: Verify the documents against the code.**
  Run: `grep -rn "32601\|not implemented" internal/bridge/shim.go cmd/litespm/main.go | grep -i invocation` → no matches.
  Run: `go test ./...` → PASS.
- [ ] **Step 5: Commit.**
  ```bash
  git add ARCH/34-RUNTIME-INVOCATION-RECEIPTS.md STATUS.md TODO.md
  git commit -m "docs: ARCH/34 is wired where it says it is, and says where it is not"
  ```

---

## Self-review

**Spec coverage.** ARCH/34 §1 (capability registry) is *not* implemented by this plan — the registry that exists is the invocation registry (`internal/receipts`), and the capability registry is `internal/state`'s `providers`/`capabilities` tables, which already exist. §2 is covered by Tasks 3–4. §3 (engine: deadline, cancellation, concurrency, backpressure, restart, drift, redaction) is covered by Task 2, except **restart** (a crashed provider is not auto-restarted; the invocation fails with a typed error — that is the honest subset, and ARCH/34 must say so). §4 (health/circuit breaker) is explicitly out of scope and must remain `DESIGNED`. §5 (bounded output) is Task 2. §6 (receipts) is Task 1 + Task 2. §7 (cross-provider fallback) is out of scope and remains `DESIGNED`. §8's acceptance sketch maps to: (1) already true before this plan, (2) Task 3, (3) Task 2, (4) already true, (5) Task 2, (6) out of scope, (7) out of scope.

**Step scan.** Every step names a file, a function signature or an exact behaviour, and a command with its expected output.

**Type consistency.** `invocation.Options`, `invocation.Engine`, `invocation.Invoker`, `invocation.Output`, `receipts.Store.RecordReceipt`, `receipts.Store.SetState`, `receipts.Store.AttachCancel`, `receipts.Store.Pending` are the names every later step and every later track uses.

**Review Focus.** All five lines are pinned: dead provider (Task 2 step 17), mid-call cancel (Task 2 step 13), oversized result (Task 2 step 18), redaction (Task 2 step 22), and the queue bound (Task 2 step 5).
