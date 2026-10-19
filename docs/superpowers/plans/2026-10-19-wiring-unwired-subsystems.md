# Wiring — The Unwired Subsystems — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `IMPLEMENTED`-but-unwired subsystems a real production caller, and say plainly where no honest caller exists yet.

**Architecture:** Six packages were written, tested, and never reached from production code (`internal/auth`, `internal/source`, `internal/profiles`, `internal/receipts`, `internal/compat`, `internal/manager`). `internal/receipts` is wired by the ARCH/34 track (program Track 1); this track wires the rest and adds the three governance surfaces that depend on them: secret injection at provider launch, the `adopt` ownership flow, and `audit --ci`.

**Tech Stack:** Go 1.26.0, the existing `internal/secrets` vault, `internal/auth` PKCE broker, `internal/lifecycle` transaction, `internal/deployment` ledger, `internal/doctor` check engine.

**Spec:** `STATUS.md` §4–§5, `TODO.md` Phase E/F rows (`LPSM-E002`, `LPSM-E006`, `LPSM-F003`, `LPSM-F004`), `ARCH/19-SECRETS-OAUTH.md`, `ARCH/36-ENTERPRISE-POLICY-AND-AUDIT.md` §3, `REMEDIATION-PLAN.md` `P5` (adopt), `ARCH/31 §9` (doctor timing).

## Global Constraints

- **A caller that has no data is theatre.** A wiring task is only done when the new caller runs on data that actually exists. Where no data source exists, the honest outcome is to say so in `STATUS.md` and stop — not to build a caller that always sees an empty table.
- **Secrets never reach a file, a plan, a log, or a receipt.** A resolved secret value exists only in the child process's environment, in memory, for the life of the call.
- **A secret reference is not a secret value.** `secret:<ns>/<key>` is a pointer; the launcher resolves it at the last possible moment.
- **Adoption is ownership, and ownership is reversible.** An adopted node is recorded in the deployment ledger with the pre-image that existed before, so a later removal restores what was there and never deletes something LiteSPM did not create.
- **Fail closed.** A provider that cannot be launched, a secret that cannot be resolved, an OAuth flow that cannot complete — each is a typed error, never a silent fallback to an unauthenticated or empty configuration.
- **The install path stays the only writer of install state.** A new caller writes through the same transactions (`lifecycle.InstallTxn`, `state.DB.WithTx`).
- **No publication.** Nothing here tags, deploys, or publishes.

## Review Focus

1. **A secret reference that cannot be resolved** → the launch fails with a typed error; it does not start the provider with the reference string in its environment, and it does not start it with the variable simply absent.
2. **A revoked or expired lease** → the invocation is refused; the refusal is audited.
3. **An OAuth token that cannot be refreshed** → the remote call is refused; it is not made unauthenticated, and the failure is not swallowed.
4. **An adopted node the user then edits** → a later removal keeps the edited node and restores what it replaced, exactly like a LiteSPM-installed node.

---

## Task 1: Secrets reach the provider process (F003 / `ResolveLaunchSecrets`)

**Files:**
- Modify: `internal/discover/discover.go` (the `provider.LaunchSpec` construction, around line 601) — add a `SecretStore` option and resolve refs into the child env
- Modify: `cmd/litespm/main.go` (the daemon's `discover.Invoke` call site) — open the vault and pass the store
- Test: `internal/discover/discover_test.go`, `cmd/litespm/main_test.go`

**Interfaces:**
- Consumes: `secrets.ResolveLaunchSecrets(ctx, store, secretRefs map[string]string) (map[string]string, error)`, `secrets.ParseSecretRef(uri)`, `provider.LaunchSpec.Env`, the provider row's recorded env.
- Produces: `discover.WithSecretStore(store secrets.SecretStore) Option`; a launch whose env contains the *resolved value* for a `secret:<ns>/<key>` entry, and never the reference.

- [ ] **Step 1: Write the failing test.**
  `TestLaunchResolvesSecretReferences`: a fake `secrets.SecretStore` holding one key; a provider row whose env maps `API_KEY` to `secret:acme/api-key`; assert the spawned child process received `API_KEY=<the value>` and that neither the reference string nor the value appears in any state row, log line, or error message.
- [ ] **Step 2: Run it and watch it fail** — the value never reaches the child today.
- [ ] **Step 3: Implement the resolution.**
  Add `WithSecretStore` to `internal/discover`; in the launch path, split the env into plain values and `secret:` references; resolve the references with `ResolveLaunchSecrets`; pass the merged map as `LaunchSpec.Env`. A reference that fails to resolve returns a typed error (`LPSM-AUTH-VAULT-UNAVAILABLE` or a new `LPSM-SECRET-UNRESOLVED`) and the provider is **not** started.
- [ ] **Step 4: Run it and watch it pass**, then `go test ./internal/discover/ ./cmd/litespm/ && go test ./...`.
- [ ] **Step 5: Commit.**
  ```bash
  git add internal/discover cmd/litespm
  git commit -m "feat(discover): a secret reference is resolved at launch, into the child env only"
  ```

---

## Task 2: `litespm auth` — the production path for the OAuth broker (F004)

**Files:**
- Create: `cmd/litespm/auth.go` (the verbs) and `cmd/litespm/auth_test.go`
- Modify: `cmd/litespm/main.go` (dispatch)
- Modify: `internal/discover/discover.go` (`dialRemote` — send the stored token as the `Authorization` header)
- Test: `cmd/litespm/auth_test.go`, `internal/discover/discover_test.go`

**Interfaces:**
- Consumes: `auth.NewAuthBroker(db, secretStore, httpClient)`, `StartAuth(ctx, req, listener)`, `CompleteAuth(ctx, sessionID, tokenRes)`, `RefreshAuth(ctx, profileID, tokenURL, clientID, clientSecret)`, `GetAuthStatus(ctx, providerID)`, `auth.StartLoopbackListener()`.
- Produces: `litespm auth login <provider>`, `litespm auth status [provider]`, `litespm auth logout <profile>`; and a remote provider launch that sends the stored bearer token.

- [ ] **Step 1: Write the failing test — `auth status` reports the stored profile.**
  `TestAuthStatusReportsAStoredProfile`: seed an `auth_profiles` row (the state schema already has the table), run `runAuthStatus`, assert the output names the provider and the profile id, and that no token material is printed.
- [ ] **Step 2: Run it and watch it fail** — the verb does not exist.
- [ ] **Step 3: Implement `auth status` and `auth logout`.** Both are read/purge paths over `auth_profiles`; `logout` revokes the token through the broker and deletes the profile row. Neither prints a token.
- [ ] **Step 4: Write the failing test — `auth login` completes a PKCE loopback.**
  `TestAuthLoginCompletesTheLoopback`: a local HTTPS token endpoint (use `httptest.NewTLSServer` and inject the client) that answers the token exchange; assert a profile row is written and that the authorization code never appears in the output.
- [ ] **Step 5: Run it and watch it fail**, then implement `auth login` with `StartLoopbackListener` + `StartAuth` + `CompleteAuth`, and the store in the vault.
- [ ] **Step 6: Write the failing test — a remote provider sends the token.**
  `TestRemoteDialSendsTheStoredBearerToken`: a fake streamable-HTTP server that requires `Authorization: Bearer <token>`; assert the call succeeds with a stored profile and is **refused** (not made anonymously) when the profile is absent or revoked.
- [ ] **Step 7: Run it and watch it fail**, then implement the header in `dialRemote`.
- [ ] **Step 8: Run the package and the tree**, then commit.**
  ```bash
  git add cmd/litespm internal/discover
  git commit -m "feat(auth): a login verb, and a remote provider that uses the stored token"
  ```

---

## Task 3: The `adopt` ownership flow (P5)

**Files:**
- Create: `cmd/litespm/adopt.go`, `cmd/litespm/adopt_test.go`
- Modify: `internal/host/entry_state.go` (read a node's current image) and `internal/deployment` (record an ownership row)
- Test: `cmd/litespm/adopt_test.go`, `internal/deployment/*_test.go`

**Interfaces:**
- Consumes: `host.DetectPreExistingComponents`, `host.ReadServerEntryState`, `deployment` ledger upsert, `lifecycle.PlanRemove`.
- Produces: `litespm adopt <name> --host <host-id>` — records the named pre-existing server as owned, with its **current** image as the pre-image, so a later `install remove` restores it instead of deleting it.

- [ ] **Step 1: Write the failing test — adopting records an ownership row with the pre-image.**
  `TestAdoptRecordsOwnershipWithTheCurrentImage`: a host config with a pre-existing `mcpServers.github` entry; adopt it; assert the deployment ledger has a row for that locator whose pre-image is the entry as it was.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement `adopt`.** It must refuse a name LiteSPM does not see in the host's config (`LPSM-HOST-CONFIG-NOT-FOUND`), and it must never write to the host config — adoption changes LiteSPM's ledger only.
- [ ] **Step 4: Write the failing test — removing an adopted node restores it.**
  `TestRemovingAnAdoptedNodeRestoresThePreImage`: adopt, then remove; assert the host config is byte-identical to what it was before the adoption.
- [ ] **Step 5: Run it and watch it fail**, then make the removal path honour adopted rows (this is the point of the feature).
- [ ] **Step 6: Run the tree and commit.**
  ```bash
  git add cmd/litespm internal/host internal/deployment
  git commit -m "feat(adopt): adopt a pre-existing server without writing to the host"
  ```

---

## Task 4: `audit --ci` + SARIF, and a static content scan (ARCH/36 §3)

**Files:**
- Create: `internal/scan/scan.go`, `internal/scan/scan_test.go`
- Create: `cmd/litespm/audit.go`, `cmd/litespm/audit_test.go`
- Modify: `cmd/litespm/main.go` (dispatch)
- Test: as above

**Interfaces:**
- Consumes: the dataset rows (`web/data/catalog.json` shape), the `audit_events` table, `receipts.Store.VerifyChain()`.
- Produces: `litespm audit --ci [--sarif <path>]`, which (a) verifies the receipt chain, (b) scans the catalog rows for content that must never ship (a fabricated command/version, a `metadata.internal` skill exposed publicly, a credential-looking string), and (c) writes SARIF 2.1.0 findings.

- [ ] **Step 1: Write the failing test — the scanner refuses a fabricated row.**
  `TestScanRefusesAFabricatedCommand`: a row carrying a `command` while `installability` is `discovery_only` — the exact shape the producer is forbidden to emit; assert the scanner reports it with a rule id and a severity.
- [ ] **Step 2: Run it and watch it fail**, then implement `internal/scan` with a rule per finding, each rule id stable and documented.
- [ ] **Step 3: Write the failing test — `audit --ci` writes SARIF.**
  `TestAuditCIWritesSARIF`: run `runAuditCI` against a temp dataset and a temp state dir; assert the file parses as SARIF 2.1.0 and has a `runs` array with a tool driver named `litespm`.
- [ ] **Step 4: Run it and watch it fail**, then implement the command.
- [ ] **Step 5: Make the command fail closed:** findings with severity `error` exit non-zero; `warning` does not. A chain that does not verify is an error.
- [ ] **Step 6: Run the tree and commit.**
  ```bash
  git add internal/scan cmd/litespm
  git commit -m "feat(audit): audit --ci, a static content scan, and SARIF output"
  ```

---

## Task 5: `doctor` timing instrumentation (ARCH/31 §9)

**Files:**
- Modify: `internal/doctor/engine.go` (record each check's duration)
- Modify: `cmd/litespm/main.go` (the doctor JSON output)
- Test: `internal/doctor/engine_test.go`, `cmd/litespm/main_test.go`

- [ ] **Step 1: Write the failing test** — the doctor JSON carries a per-check duration and a total.
- [ ] **Step 2: Run it and watch it fail**, then implement.
- [ ] **Step 3: Run the tree and commit.**
  ```bash
  git add internal/doctor cmd/litespm
  git commit -m "feat(doctor): every check reports how long it took"
  ```

---

## Task 6: The Go ingest path (`internal/source` reaches production) — K009, second half

**Files:**
- Modify: `cmd/litespm/main.go` (a `catalog ingest --source <id> --out <path>` verb)
- Modify: `internal/source/` (the MCP-registry adapter's installability classification — see the note below)
- Test: `internal/source/*_test.go`, `cmd/litespm/catalog_build_test.go`

- [ ] **Step 1: Write the failing test — the Go path and the producer agree on installability.**
  The producer marks an endpoint-backed row `metadata_verified`; the Go ingest path still classifies the same record `discovery_only`, so the two paths disagree about what is installable. Pin the agreement: for a registry record with a `remotes[]` endpoint and a published version, the Go adapter must produce the same installability the producer does. Today it does not — that is the defect, and this test is the fix's proof.
- [ ] **Step 2: Run it and watch it fail**, then fix the classification in `internal/source/mcp_registry.go`.
- [ ] **Step 3: Implement `catalog ingest`** for the MCP-registry adapter only: it fetches through the snapshot-obtain path, writes a dataset file in the same shape the producer writes, and refuses to write when the snapshot is missing.
- [ ] **Step 4: Run the tree and commit.**
  ```bash
  git add cmd/litespm internal/source
  git commit -m "feat(catalog): a Go ingest path, and one installability rule instead of two"
  ```

---

## Task 7: The two that have no honest caller yet

`internal/identity` (the canonical alias graph) and `internal/compat` (the host × OS × version × date × test matrix) have no data source in the tree: the dataset carries no alias edges and no test records, so any caller would read an empty table. `internal/manager` has a real caller only behind an explicit `EnableExec` opt-in.

- [ ] **Step 1: Do not build a caller.** Record the honest state instead: in `STATUS.md` §4, change these rows from "library `IMPLEMENTED`, unwired" to a sentence that says *what data would make them meaningful* and *what would consume them*. The program's final reconciliation owns that edit.
- [ ] **Step 2: Close the row in `TODO.md`** the same way — the "wire it" backlog row becomes "the data source is the blocker", not "the code is the blocker".
- [ ] **Step 3: Commit.**
  ```bash
  git add STATUS.md TODO.md
  git commit -m "docs: two libraries are waiting for data, not for a caller"
  ```

---

## Self-review

**Spec coverage.** F003 → Task 1; F004 → Task 2; P5 (adopt) → Task 3; ARCH/36 §3 (audit/SARIF/scan) → Task 4; ARCH/31 §9 (doctor timing) → Task 5; K009's second half → Task 6; `internal/identity`/`internal/compat`/`internal/manager` → Task 7 (an honest statement, not a fake caller); `internal/receipts` → the ARCH/34 track; `internal/profiles` leases → the invocation gate, which is written in the ARCH/34 track's own plan because it needs the registry that track builds.

**Step scan.** Every step names a file, a test name, and a command.

**Type consistency.** `discover.WithSecretStore`, `secrets.SecretStore`, `auth.AuthBroker`, `litespm auth login|status|logout`, `litespm adopt`, `litespm audit --ci`, `internal/scan` rules, `litespm catalog ingest` are the names the later tracks and the docs cite.
