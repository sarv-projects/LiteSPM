# ARCH-40 — LiteCowork and External Local Consumer Interoperability

**Status: TARGET machine-interface contract, not a released/version-qualified consumer SDK or a qualified LiteCowork installation.**
**Companion:** [LiteCowork interop LLD](https://github.com/sarv-projects/litecowork/blob/main/docs/LITESPM-LITECOWORK-INTEROP-LLD.md) (may be on a PR branch pending merge).
**Binding authority:** This file specifies LiteSPM-owned operations; upstream implementations and `STATUS.md` remain the source of observed shipped state. LiteCowork cannot own or directly edit LiteSPM package/host-install tables.

## 1. Why local consumers need this contract

LiteSPM's role is **Find → Observe → Acquire → Manage → Expose/Prove** the capabilities usable by compatible native agent hosts. The user may already have MCP configurations, skills and extensions in Codex, OpenCode, Claude Code, Pi, HorizonCode or other eligible agents. A read-only observation must never automatically claim LiteSPM ownership or permission to mutate the native file. New installations, native observations, adopted entries and other manager-owned files are distinct.

LiteCowork is a consumer desktop/work orchestration UI. It needs a safe machine protocol for catalog, native inventory, preview, apply and operation status; it must not parse a human CLI table, assume the browser website knows local inventory, or write the daemon's SQLite DB. The host's native authentication and the LiteCowork Task/Coworker execution grant are outside LiteSPM package installation ownership.

## 2. Current source facts vs target

| Operation | Actual code evidence | Still required |
|---|---|---|
| Catalog/list/inventory | `cmd/litespm/list.go`, `internal/host` adapters and state ledger | Versioned list contract, exact host/kind/OS qualifications, stable pagination |
| Existing native MCP adoption | `cmd/litespm/adopt.go`, `adopt_test.go`; `main.go` `adopt` and `adopt.execute`; Bridge adapter calls it | Host/scope qualification, operation receipt/unknown recovery, additional capability kinds |
| Cross-agent copy | `cmd/litespm/copy.go`, canonical host representation and conflict planner | Real mixed-host conformance, secrets and unsupported feature reporting |
| Import from other manifest formats | `cmd/litespm/import.go` supports specified manifest formats | Importing a manifest is **not** executing a package install or taking ownership |
| Ledger and reconcile | `internal/deployment/ledger.go`, `cmd/litespm/lifecycle_wire.go` | Crash-window intent journal, atomic update/unmanage semantics |
| Invoke | `internal/discover`, `internal/provider`, `internal/mcpclient`, ARCH/34 | Lease enforcement, per-provider health, assurance and invocation receipts in real consumer |
| Connector auth/runtime | ARCH/29 designed, `internal/connector` removed under D1 | D1 policy decision, real provider/writer/credential custody and tests |

**Adopt supports existing eligible MCP registration**, not automatic adoption of all skills/plugins/hooks/commands or opaque cloud extensions. CLI/Bridge source existence does not equal real host/OS product qualification.

## 3. Owner separation

| Object/action | Single owning authority |
|---|---|
| Listing/source identity, hashes, declared host compatibility | LiteSPM catalog/source |
| Existing native entry read-only observation, original scope/fingerprint | LiteSPM host adapter |
| Package plan, host config write, update/adoption ledger, unmanage/install remove | LiteSPM local package service |
| Native agent session, native configuration options/credentials, internal plugins/subagents | Native harness / qualified HostAdapter read/write surface |
| LiteCowork Workspace/Coworker assignment, Connection and policy | LiteCowork owner services |
| Task/Conversation invocation grant, mediated Effect and Evidence | LiteCowork Trust/Invocation/Effect, or native host with explicitly classified external assurance |

Native users' credential material stays under native agent or qualified credential broker ownership. Neither adoption nor Copy silently transfers secrets, installs extensions in every detected host, or claims that LiteCowork can supervise all native subagent side effects.

## 4. Local service descriptor

Target `ServiceDescriptor`: protocol-version set, exact build, install/service identity, authenticated OS user/peer binding, endpoint, maximum message/response limits, read/write operation capabilities, supported host+version+kind+scope matrix, readiness observation freshness, schema digests and error version.

For a desktop client:
- Require OS-bound endpoint authentication and principal/scope checks before reading private local config.
- Read-only inventory needs a separate authority class from install/adopt/remove mutation.
- Operation support is negotiated by exact version. Unsupported verbs do not silently downgrade to shell.
- No implicit public-web access to local inventory; the static catalog may link to locally authorized commands without asserting installation.
- Never put native credentials, token values or private package arguments in public catalog/telemetry, preview logs, receipt responses or model context.

## 5. Canonical operations (semantic families; exact wire methods to be published)

| Family | Input | Output, guarantee and refusal |
|---|---|---|
| `service.describe` | version/nonce/host principal | service identity, schema, supported operations |
| `inventory.observe` | exact host IDs, user/project scopes, cursor/freshness | timestamped native+managed+adopted items, provenance, explicit unavailable |
| `package.describe` | catalog ref/native observed ref | source, package kind, compatibility, risk and fetchability |
| `management.prepare` | verb, host/scope/locator, current fingerprint, resolution preference | immutable plan digest, exact structural diff, expiry, hazards and no writes |
| `management.apply` | plan digest, expected state, idempotency/owner approval | durable operation receipt; refuse stale/expired/conflicting preconditions |
| `management.get` | operation id | committed, failed, or UNKNOWN for reconciliation; never a fabricated “done” |
| `management.reconcile` | owned locator and current image | three-way comparison; default keep local; read-only until separate approval |
| `management.unmanage` | owned/adopted ref and exact expected image | detach LiteSPM ownership, **leave originally external native entry** |
| `provider.health` / `invocation` | exact qualified provider/lease/grant route | observed health or actual runtime result with assurance; never equate install and grant |

These are **new target semantic names**, not claimed currently served RPC method names. Existing `adopt.execute` is real source-backed, but publishing a general client protocol requires versioned schema contracts and security/conformance tests. Do not hardcode the target method names in a consumer before agreement.

## 6. Existing setup adoption, provenance and update

Observe → inspect host entry → offer `Adopt` only if exact host/kind/scope supports it → preview no-write ownership operation → explicit user approval → re-read fingerprint → create owned adoption/InstallRecord/DeploymentMutation in one transaction → read-back unchanged config → operation receipt.

An adopted entry originally existed and remains present if the user later **stops managing**. A package installed by LiteSPM may have an owned config locator eligible for uninstall. User edits after adoption must not be overwritten or deleted by default. For C != post-image, return structural diff and keep-local/detach/use-package alternatives; only approved strategy may write.

Cross-host Copy must inspect both native agent configurations, distinguish project versus user scopes, preserve source/target credentials and unsupported native constructs, and produce a plan **before** any changes. Generic BridgeTargets do not imply skills/plugin/native feature parity. Read-back must use the actual native host.

## 7. Crash/unknown operation reconciliation

Files and DB are different atomic media. A crash after host-file mutation but before receipt commit is an acknowledged ARCH/33 gap; recovery requires durable intent/journal (or equivalent), owned-locator inspection, fingerprint recheck and idempotent compensation. Until implemented, surface `UNKNOWN` or blocked recovery and prohibit blind duplicate retries. Never restore a whole-file backup over unrelated user edits.

Required injected interruptions: before plan read, between plan/approval and apply, after first config write, before ledger commit, after commit before client acknowledgement, during rollback, after external native edit, during unmanage. For each, verify either exact pre-state or a reconciled owned post-state; no missing-row invisible modification.

## 8. Credential and invocation separation

Package install/adopt operation approval grants **configuration management** only. A LiteCowork CoworkerCapabilityAssignment is a allowlist ceiling, not live tool permission. Actual invocation must be admitted through a qualified runtime path with a current native/Task grant/lease and correct scope; direct native tool execution must be marked reported/observed unless the harness enforces an equivalent tested admission.

LiteSPM may expose a provider supervisor for packages it truly controls. It cannot promise control over private native AgentSessions, inherited plugins or provider-hosted connectors just because it observed a file.

## 9. Conformance and release gate

1. Observe a native MCP without touching bytes; duplicate names across user/project/host remain distinct.
2. Adopt eligible MCP without modifying native config; record original image; undo management leaves native resource.
3. Reject nonexistent host/entry and stale fingerprint; edited adopted native entry is preserved; no accidental removal of comments/siblings.
4. Copy between two real supported native hosts with conflict preview; independently verify target loads and existing config remains valid.
5. Install/update/remove only exact owned locator with consistent rollback and unknown operation handling.
6. Reject any unauthorized LiteCowork local caller, replayed mutation, stale schema or expired approval.
7. Report exact host × OS × package kind × scope × operation support; generic adapters do not imply all kinds.
8. Confirm native installation does not automatically authorize LiteCowork Coworker/Task execution.
9. Real packed binary/client and actual native host CODE + SYSTEM + user acceptance (unit tests alone do not qualify).
10. Record source/credential boundary and connector runtime unresolved status truthfully.

## 10. Implementation order

1. Publish machine schemas/capability negotiation and local authenticated identity contract, keeping existing `adopt.execute` as an explicitly versioned supported operation where valid.
2. Extend existing host/ledger logic for per-host/kind/scope inventory and source-qualified adoption; add safe explicit unmanage.
3. Implement and fault-test crash-window reconciliation/update intent journal.
4. Wire actual management receipt and invocation lease checks, provider health/probe and stable errors.
5. Integrate LiteCowork client and UI without duplicating LiteSPM package database or native auth.
6. Pass real host/OS/client acceptance before advertising universal native management.

**Nothing in ARCH-40 makes an unimplemented connector, package kind or LiteCowork runtime integration supported.**
