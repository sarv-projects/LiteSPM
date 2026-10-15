# Delivery Plan & Quality Gates

> **Status:** informative, per [ARCH/00 §1](00-INDEX.md#1-document-status--precedence). This document
> plans delivery; it does not certify state. Every "current" statement below cites
> [STATUS.md](../STATUS.md) (the single source of truth) or the file that demonstrates it, and uses
> the vocabulary of [ARCH/31 §2](31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md#2-evidence-vocabulary-binding-repo-wide).

## 1. Staged Delivery Methodology

To ensure stability and prevent architectural regressions, LiteSPM follows a **9-phase** delivery sequence (Phase A through Phase I). Each phase begins in a **Proposed** state and advances to **Verified** and **Accepted** only when automated quality gates and test suites pass.

**Phase-count reconciliation.** The count is nine — Phase A through Phase I — and that is what
[ARCH/00 §2](00-INDEX.md#2-document-registry) records for this document and what
[README §1](../README.md#1-project-status--in-progress-roadmap) tabulates. There is no second,
differently-numbered phase scheme in the architecture set; the *ordered forward backlog*
([ARCH/31 §12](31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md#12-ordered-backlog), phases 0–9) is a
separate, later ordering of future work and does not renumber these phases.

```text
[Phase A] Architecture Freeze & Schemas
    │
    ▼
[Phase B] Domain, SQLite Storage & Local IPC
    │
    ▼
[Phase C] Source Ingestion & Static Catalog Builder
    │
    ▼
[Phase D] Safe Extraction, DFS Resolver & Skill Store
    │
    ▼
[Phase E] Process Supervision, Bridge Shim & Host Adapters
    │
    ▼
[Phase F] MCP Protocols (Streamable HTTP), Secrets & OAuth
    │
    ▼
[Phase G] Marketplace Federation, In-Agent /marketplace & CLI TUI
    │
    ▼
[Phase H] Cross-Platform Build, Conformance & Packaging
    │
    ▼
[Phase I] Golden Fixtures, Self-Update & Migrations
```

### 1.1 Where each phase actually stands

Highest honest state per phase, with the subsystem rows that back it in [STATUS.md](../STATUS.md):

| Phase | Highest honest state | Blocking gap (STATUS citation) |
|---|---|---|
| A — Architecture Freeze & Schemas | `DESIGNED` | `ARCH/00`–`ARCH/38` exist; the specification is written, not verified |
| B — Foundations, Storage & IPC | `TESTED` | `domain` / `state` / `ipc` tests bind; no independent falsification pass yet (STATUS §1) |
| C — Static Catalog & Discovery | `SHIPPED` for the compiler, `catalog build` and `catalog sync` | the release tree is published and `catalog sync` was verified against the live origin; the origin now names **`rel-2026-10-11-02`** (sequence 147, 69,376 items, sharded — probe 2026-10-13), and the `rel-2026-10-05-01` tree the 2026-10-05 probe cited has since been replaced. `index.json`/`shards/` remain `DESIGNED`; transport sharding is `IMPLEMENTED` (STATUS §2) |
| D — Extraction, Resolver & Skills | `WIRED` (resolver, skills); `IMPLEMENTED` (install engine); `TESTED` (artifact) | skills and MCP servers install end to end through `/marketplace`; `install.execute` still has no artifact source for plugins (STATUS §3) |
| E — Supervision, Bridge & Hosts | `WIRED` for hosts; `IMPLEMENTED` for provider runtime | provider rows are written at install time (`m4` closed 2026-10-13, `state.SaveProviderExec` inside the install transaction); `autostart` stays `0`, so nothing starts a provider at boot (STATUS §4) |
| F — MCP profiles, Secrets & OAuth | `WIRED` (secrets, mcpclient) / `IMPLEMENTED` (auth) | `mcpclient`'s first production importer is `internal/discover`; `auth` still has zero production importers (STATUS §1, §4) |
| G — Marketplace, `/marketplace`, wizard | `WIRED` for read tools and the web marketplace | `request_install` completes for skills and MCP servers; plugins need artifact ingestion; two bridge tools (`get_invocation`, `cancel_invocation`) answer `-32601` (STATUS §3, §4) |
| H — Build, Conformance & Packaging | `IMPLEMENTED` | the npm installer is fail-closed on every checksum path (missing manifest/entry, unreadable manifest, mismatch); `LICENSE`/`NOTICE` are listed in the npm `files` allowlist and staged by `release.yml` before publish, but no npm publish has happened yet — `npm/package.json` says `0.4.1` and the tag is not pushed (STATUS §1) |
| I — Fixtures, Self-Update & Migrations | `WIRED` (self-update) / `TESTED` (state) | self-update verifies SHA-256 fail-closed and then the release's keyless Sigstore bundle when one is published; `v0.4.0` (2026-10-11) is the first tag to publish one for every asset; earlier tags are checksum-only with a stated note (STATUS §1) |

**Not yet true, and not claimed here:** provider autostart; plugin installation (no artifact
source); an async invocation registry (`get`/`cancel` return `-32601`); TUF-style catalog signing;
bundle verification in the npm installer; and any isolation level beyond process supervision.
Several items this paragraph used to list are now true and are stated as such above: the release
tree is published and `catalog sync` succeeds against the live origin; an agent-driven install
completes for skills and MCP servers; provider rows are written at install time; a project
manifest + lockfile exist; releases are signed (`v0.4.0`, 2026-10-11); and runtime policy is
enforced at invocation ([STATUS.md](../STATUS.md), "Not yet true, and not claimed").

---

## 2. Phase Breakdown and Acceptance Gates

Each gate below is stated as written when the phase was planned, then assessed against STATUS. A gate
that is not met is **not** met, regardless of how much of the deliverable exists.

### Phase A: Architecture Freeze & Schemas (Prerequisite)
*   **Deliverables:**
    *   Author normative LLD specifications `ARCH/10` through `ARCH/38` (the index was `ARCH/10`–`ARCH/24` when this plan was first drafted; `ARCH/25`–`ARCH/31` are contract/status documents and `ARCH/32`–`ARCH/38` are `DESIGNED` addenda).
    *   Draft 2020-12 JSON Schemas for `listing`, `version`, `source`, `install-plan`, `catalog-release`, `errors` — all six exist under `schemas/`.
    *   Publish hostile archive test fixtures and golden host configuration files (`fixtures/hosts/`, `fixtures/source/`).
*   **Gate:** all schema validation suites pass; no unresolved architectural questions remain.
*   **Current state:** the documents and schemas exist (`DESIGNED`). The gate's second half is **not** met: at least one unresolved contract mismatch is recorded openly in
    [ARCH/06 §2.2](06-API-CONTRACTS.md#22-known-mismatches-go-type-vs-schemasinstall-planschemajson)
    (`domain.InstallPlan` does not satisfy `schemas/install-plan.schema.json`), and `D4` remains
    contested ([ARCH/31 §4.3](31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md#43-decision-d4-is-contradicted-by-the-repository--there-are-two-catalog-builders)).

### Phase B: Foundation & Storage Layer
*   **Deliverables:**
    *   `internal/domain`: pure types, canonical JSON (RFC 8785), SHA-256 hashing.
    *   `internal/config`: platform-standard paths across Windows, macOS, and Linux, plus legacy-name adoption.
    *   `internal/state`: SQLite 3 in WAL mode, migration runner, 22 relational tables (verified: 22 `CREATE TABLE` statements in `internal/state/migrations/001_initial_schema.sql`, including `auth_profiles` and `operation_trees`).
    *   `internal/ipc`: Windows Named Pipe and Unix domain socket JSON-RPC 2.0 transport.
*   **Gate:** unit coverage on pure domain types; migration tests pass forward and backward; IPC throughput shows sub-millisecond local latency.
*   **Current state:** `TESTED` (STATUS §1) — `domain`/`state`/`ipc` contract and recovery tests bind, and the daemon halts on recovery failure with `Fatal: startup recovery failed` → **exit 1** (`cmd/litespm/main.go:1173-1175`; `70` is a `doctor` category code, `ARCH/20` §2). The explicit numeric coverage and latency targets are **not** recorded as measured results anywhere in the repository (`TODO.md` `LPSM-B001`: CI runs no coverage gate); treat them as still to be demonstrated.

### Phase C: Static Catalog & Discovery Plane
*   **Deliverables:**
    *   `internal/source`: source adapters for the official MCP registry, agent skills, and five marketplaces — 8 adapters, `IMPLEMENTED` with test-only callers (STATUS §2).
    *   `internal/catalogbuild`: deterministic compiler emitting `v1/current.json` + `v1/releases/<id>/{listings,versions,manifest}.json` — `TESTED`, non-test caller `litespm catalog build` (STATUS §2).
    *   `internal/catalog`: client release fetcher with pointer→manifest→listings digest verification and local index — `SHIPPED` (verified syncing against the live origin 2026-10-05).
    *   Deployment workflow with strict dist allowlist (`scripts/deploy-pages.sh`, including the `_headers` cache policy).
*   **Gate:** two successive builds from identical fixtures are byte-for-byte identical; public deployment reveals zero private repository files.
*   **Current state:** byte-determinism is demonstrated for the Go compiler
    (`TODO.md` `LPSM-C002`), the deploy allowlist/leak audit exists (`deploy-pages.sh`), and the
    **user-visible gate — a `catalog sync` that succeeds against the live origin — passes**
    (verified 2026-10-05: release `rel-2026-10-05-01`, 5,814 indexed — that tree has since been replaced, so the figures record that run; the origin now serves `rel-2026-10-11-02`; STATUS §2).
    Two builders also remain in tree (D4 contested).

### Phase D: Safe Artifact Extraction & Skill Management
*   **Deliverables:**
    *   `internal/artifact`: bounded spooling and extraction enforcing the documented caps — 256 MiB download, 1 GiB extracted, 20,000 files, 128 MiB per file, 1,024-byte paths, case-fold checks, canonical tree digests, path-traversal rejection — `TESTED` (STATUS §3). **The 100:1 compression-ratio (zip-bomb) check is not implemented** ([ARCH/05 §2.1](05-SECURITY.md#21-extraction-safety-thresholds)).
    *   `internal/resolver`: pure dependency resolver with constraint intersection and cycle detection — `WIRED` (STATUS §3).
    *   `internal/install`: two-phase atomic staging, CAS rollback, SQLite commit — `IMPLEMENTED`; refuses an `Execute` with neither `TreeSource` nor `ArchiveSource` (`internal/install/engine.go:204-207`).
    *   `internal/skills`: atomic skill install/update/remove with provenance ledger — `WIRED` (STATUS §1).
*   **Gate:** extraction harness rejects hostile zip-slip, zip-bomb, and symlink-escape fixtures; aborted installations leave zero orphaned files.
*   **Current state:** traversal/symlink/case-collision/size rejections are exercised by unit tests
    and rollback is recovery-tested (`TESTED`), but the zip-bomb half of the gate depends on the
    absent ratio check, and archive-kind installs have no artifact source to abort: skills install
    end to end (STATUS §3), plugin installs still cannot.

### Phase E: Process Supervision, Bridge Shim & Host Adapters
*   **Deliverables:**
    *   `internal/provider`: process supervisor — Windows Job Object (kill-on-close only), Unix process group + `PR_SET_PDEATHSIG` / watchdog pipe. No cgroups and no resource caps ([ARCH/05 §1](05-SECURITY.md#1-core-security-invariant)).
    *   `internal/policy`: 17-action effect taxonomy and approval engine with effect provenance.
    *   `internal/bridge`: stdio MCP shim exposing the 12 core Bridge tools.
    *   `internal/host`: adapter framework with automated config discovery — 6 bespoke + 44 generic `BridgeTarget`s (50 total) plus 81 skill targets, **MCP-entry merge only** (STATUS §1).
*   **Gate:** terminating the daemon terminates all child provider processes; host adapters merge Bridge entries into golden fixtures without altering unrelated keys.
*   **Current state:** host merge is `WIRED` and backup/inverse (`host remove`) exist; provider
    lifecycle is `IMPLEMENTED` — provider rows are now written at install time (`m4` closed
    2026-10-13), but `autostart` stays `0` and nothing starts a provider at boot, so the
    daemon-termination gate has no production child process to observe (STATUS §4).

### Phase F: MCP Protocol Profiles, Secrets & OAuth
*   **Deliverables:**
    *   `internal/mcpclient`: dual-protocol client (2026-07-28 Streamable HTTP; 2025-11-25 legacy) — `WIRED`; its first production importer is `internal/discover` (STATUS §4).
    *   Capability schema fingerprinting and drift invalidation — `IMPLEMENTED` and reachable: `litespm grant` writes `capability_grants` and `internal/discover` writes provider/capability rows, so a real invocation can trigger a drift refusal ([ARCH/05 §5](05-SECURITY.md#5-capability-schema-drift-defense)); the denial is recorded to `audit_events` by `recordAudit` (wired 2026-10-13, STATUS §1).
    *   `internal/secrets`: native OS keystore backends (DPAPI `master.key`, macOS Keychain, `secret-tool`), fail-closed open — `WIRED` (STATUS §1).
    *   `internal/auth`: OAuth 2.0 PKCE loopback broker — `IMPLEMENTED`, zero production importers (STATUS §4).
*   **Gate:** dual-protocol conformance passes against mock MCP servers; synthetic canary tokens confirm zero secret leaks in logs, database dumps, or error responses.
*   **Current state:** secrets open fail-closed and the doctor runs a canary round-trip, but the
    conformance gate runs only inside tests; `mcpclient` **is** reachable from a production path
    (`internal/discover`, STATUS §4 — stdio for a launched server, the HTTP/legacy profiles for a
    remote endpoint entry) while `internal/auth` still is not.

### Phase G: Marketplace Federation, In-Agent `/marketplace` & CLI TUI
*   **Deliverables:**
    *   Federated marketplace adapters for Claude Code, Codex, and Grok Build manifests (rejecting `command` sources) — `IMPLEMENTED`, test-only (STATUS §2).
    *   Interactive setup & management wizard (`litespm` with no arguments opens `runSetup`,
        `cmd/litespm/main.go:53-61`; `litespm setup --agent <host-id>` is the non-interactive form,
        `:537-578`; the wizard itself is `cmd/litespm/wizard.go`). The *first-class* TUI is
        a separate, `DESIGNED` deliverable ([ARCH/37](37-TUI-AND-COMPLETION.md)).
    *   In-agent `/marketplace` workflow over the 12-tool Bridge surface.
    *   `internal/doctor`: 10 checks, `--repair`, category exit codes — `WIRED` (STATUS §1).
*   **Gate:** `litespm` allows agent selection and configuration; agents can invoke `/marketplace` to search and propose installations.
*   **Current state:** search/plan/skill-read tools resolve and propose; the install action
    completes for skill and MCP-server listings (skills ledger / host-config registration) and
    fails closed for plugins, which have no artifact source (STATUS §3).

### Phase H: Cross-Platform Build, Conformance & Packaging
*   **Deliverables (matching `.github/workflows` as it exists):**
    *   **`scripts/build-release.sh` cross-compiles six targets** — `windows/amd64`, `windows/arm64`, `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64` — and emits `SHA256SUMS.txt`.
    *   **`.github/workflows/ci.yml`** (push/PR to `main`): `static-checks` (gofmt, `go vet ./...`, `bash -n scripts/*.sh`, `py_compile` of Python scripts, `node --check` of the two npm entry points, `npm test`, the dataset-reproduces-the-released-tree check, and the generated-host-data gate); `test-go` (`go test -race ./...` on Ubuntu and macOS, `go test ./...` on Windows); `build-web` (catalog coherence, Node 20, `npm ci`, `tsc --noEmit`, the four lint gates, `next build`, `web/out/index.html` assertion, then `deploy-pages.sh` packaging + leak audit + Pages budget). Go version: 1.26.
    *   **`.github/workflows/release.yml`** (tags `v*`, Ubuntu only): `go test ./...`, `scripts/build-release.sh`, web static build, GitHub Release with `release-assets/*` (binaries + `SHA256SUMS.txt` + `litespm-web-static.tar.gz`), npm version/tag equality check, staging `LICENSE`/`NOTICE` into `npm/`, then `npm publish --provenance` only when `NPM_TOKEN` is set.
    *   npm distribution package (`litespm`) with the platform-binary `postinstall` installer.
*   **Gate:** full CI matrix green across Windows, Ubuntu, and macOS runners; npm package boots via `npx litespm`.
*   **Current state:** the CI matrix above is the matrix — there is no separate macOS/Windows
    *release* build job (release binaries come from the Ubuntu cross-compile script). Packaging
    caveats that remain open: the npm installer verifies only the checksum, not the release's
    Sigstore bundle, and no npm publish has happened yet — `LICENSE`/`NOTICE` are in the `files`
    allowlist and staged by `release.yml`, but the published tarball listing is unproven
    (STATUS §1). A missing checksum entry is **not** a caveat: `verifyDownloadedBinary` refuses it
    (`npm/scripts/install-binary.js:258`).

### Phase I: Golden Fixtures, Self-Update & Migrations
*   **Deliverables:**
    *   Golden host-configuration fixture corpus (`fixtures/hosts/`, `fixtures/source/`).
    *   `self-update` with fail-closed SHA-256 verification, Sigstore bundle verification when the release publishes one (`cmd/litespm/main.go:391-438`), downgrade guard, and atomic replace (`internal/update`) — `WIRED`. **`v0.4.0` is the first tag to publish one** (8 bundles, one per asset), so the checksum-only branch with a stated note now applies only to older tags.
    *   Transactional migrations with downgrade prevention (`internal/state/migrations.go:57` → `LPSM-STATE-VERSION-INCOMPATIBLE`).
*   **Gate:** fixture-backed adapter tests pass offline; update without a published checksum is refused; higher-schema databases halt.
*   **Current state:** the three stated checks hold. Signed releases **are** shipped — `v0.4.0`
  (2026-10-11) published a keyless bundle for every asset and the updater verifies it; what remains
  `DESIGNED` is the TUF-style catalog envelope ([ARCH/36 §4](36-ENTERPRISE-POLICY-AND-AUDIT.md)),
  and the npm installer still verifies the checksum only ([SECURITY.md](../SECURITY.md)).

---

## 3. Explicitly Deferred Features (Non-Goals for v1)

Deliberately excluded from the initial release to maintain architectural focus and security:

*   Hosted cloud execution or proxying of third-party MCP servers.
*   Cloud-hosted credential brokering or SaaS token management.
*   Dynamic, third-party executable adapter scripting.
*   General SAT dependency solvers with backtracking.
*   Native connector runtimes for proprietary SaaS APIs — the existing `internal/connector` package was **deleted** under decision `D1` ([ARCH/07 D-021](07-DECISIONS.md#d-021-delete-the-connector-package-re-wiring-requires-a-new-decision)); any future connector executor starts from the [ARCH/29](29-CONNECTOR-SYSTEM-DESIGN.md) design record and a fresh `D1` decision.
*   User telemetry, tracking, or popularity ranking metrics.
*   Silent automatic extension updates by default.
*   Full OS kernel sandboxing claims without platform sandbox integration — no tier is declared yet (`DESIGNED`, [STATUS.md](../STATUS.md) §5).

### 3.1 The `DESIGNED` backlog this plan does not schedule

The items above are *non-goals*. Separately, a large set of features is specified but not built;
they are scheduled in [ARCH/31 §12](31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md#12-ordered-backlog)
(phases 1–9, each with a real-workflow gate) and specified in `DESIGNED` documents: manifest +
lockfile + frozen install + interop ([ARCH/32](32-MANIFEST-LOCK-INTEROP.md)), deployment ledger +
three-way reconciliation ([ARCH/33](33-DEPLOYMENT-LEDGER-RECONCILIATION.md)), capability registry +
invocation engine + receipts ([ARCH/34](34-RUNTIME-INVOCATION-RECEIPTS.md)), profiles + capability
leases ([ARCH/35](35-PROFILES-AND-CAPABILITY-LEASES.md)), policy inheritance + `policy explain` +
`audit --ci`/SARIF + advisories/quarantine + TUF/SBOM/Sigstore/SLSA + air-gapped bundles
([ARCH/36](36-ENTERPRISE-POLICY-AND-AUDIT.md)), and TUI/dashboard/completion/`why`
([ARCH/37](37-TUI-AND-COMPLETION.md)). Their status rows live in
[STATUS.md](../STATUS.md) §5–§6; this delivery plan neither advances nor claims them.
