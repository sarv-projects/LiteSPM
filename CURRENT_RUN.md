# Current Run Handover

## Active Goal

Website work on the agent-host surfaces: every agent host now carries a description and capabilities **read from that vendor's own documentation** (never composed), its **own official logo**, and its **exact vendor name** where the registry row differs. Agents whose vendors have ended the product were removed from the landing-page chooser, the agent atlas and the `/agents/` index. The previous guarded `feed:skills-sh` replay and defect-remediation work is unchanged and still open below.

Preserve producer-owned data, source snapshots, the pre-session stash, and the CLI sandbox. **Do not stage, commit, push, publish, or promote any further work** — this session deliberately left its changes uncommitted (see the newest section at the end of this file).

## Repository State at Audit Close

- Repository: `/home/sarvesh/business_Dev/liteSPM`.
- HEAD and `origin/main`: `57a5ff950d2c8fb5a8fa9583a4edb5624cfa0811` (rechecked after the end-to-end pass; aligned).
- Preserve producer-owned dirty paths; do not stage, overwrite, or dump the generated catalog diff:
  - Modified: `internal/catalogbuild/dataset_test.go`, `scripts/build_full_catalog.py`, `web/data/catalog.json`, `web/data/release.json`, `web/lib/telemetry.ts`.
  - Untracked: `scripts/test_snapshot_lifecycle.py`.
- Before remediation, `CURRENT_RUN.md` was the only audit-authored repository file; no product code was changed during the audit. Remediation orchestration has since added `.gitignore`/`.ignore` entries and `.slim/deepwork/fix-audit-findings.md`. Product changes from the active lanes are not yet reconciled.
- **Audit side effect:** the npm wrapper test built into pre-existing, gitignored `dist/litespm-linux-amd64`, overwriting that local binary. The directory is not tracked by HEAD. Its prior bytes were not backed up; the local checksum manifest currently does not match that rebuilt binary. This is not evidence of a published-artifact problem.
- Root `AGENTS.md`, `ARCH/00-INDEX.md`, `TODO.md`, and `STATUS.md` were read. `STATUS.md` is the subsystem-state authority; distinguish implemented behavior, documented design, and dirty-tree-only behavior.

## Reviewers (All Completed; Read-Only)

- Architecture/contracts: `ses_ee7fb1d99ffeRgCGegmH0hl7eI`.
- CLI/core/security: `ses_ee7fb1d6fffesx9krGMmzza8oE`.
- Website/UI: `ses_ee7fb1d55ffejwDdY3XorpQGcx`.
- Ingestion/release/supply chain: `ses_ee7fb1d3affexGAMxe4JLdjLNq`.

Their findings were reconciled with local source where noted below. Reports were static unless explicitly described. Do not describe unverified risks as runtime-reproduced.

## Highest-Priority Findings to Report

1. **High — release materialization reuses an immutable release identity for changed inputs.** `cmd/litespm/main.go:1219-1319` reuses the previous pointer's release ID, sequence, and time in `--materialize` without comparing the newly compiled manifest digest to `prev.ManifestDigest`. Reproduced: the clean HEAD dataset materialized byte-for-byte to the committed `rel-2026-10-07-01` tree; the dirty 46,166-row dataset also materialized under that same ID/sequence/time with a different manifest digest, and `--verify` accepted the newly generated tree because it verifies that tree against its own pointer. The code path can therefore emit changed bytes under a CDN-immutable identity; the committed-input case itself reproduces correctly.
2. **High — explicit policy deny is bypassed by MCP install.** Reproduced end-to-end with a local synthetic catalog and isolated home/data root: adding `{"effect":"package.install"}` to `policy-deny.json` did not stop `litespm install mcp:acme:demo-server --host opencode`; the command returned success and wrote the server entry. A focused test in `/tmp/opencode/head-check` confirmed the same policy engine returns `deny` for that operation, while `installMCPFromListing` still succeeds. The existing skills policy test denies the same effect, confirming an MCP/skills enforcement asymmetry. `ARCH/15-POLICY-APPROVALS.md:73-84` makes explicit deny non-overridable.
3. **High — MCP install approval does not bind the exact host target set (and may not bind the command/runtime descriptor).** Plan creation captures registered hosts (`cmd/litespm/main.go:2596-2628`), but execution calls `installMCPFromListing(..., nil, ...)` (`main.go:2023-2028`); `cmd/litespm/install_mcp.go:117-124` re-resolves current registered hosts when empty. `install_authz.go:100-169` checks persisted plan identity/hash/expiry and listing/scope/version but does not revalidate hosts. Architecture review also found empty `HostChange.ValueJSON` / unpopulated provider launch records and approval prompt omits command/targets (`install_authz.go:310-316`). A target or descriptor change between approval and execution may exceed approved effects. Static finding; not reproduced.
4. **High — catalog ingestion fetches are insufficiently constrained.** `scripts/build_full_catalog.py:318-340` `_http_get` reads response bodies without a byte cap and follows default redirects; sitemap-derived URLs have substring checks rather than strict host/IP validation (dirty/current script paths around `:1240-1247,1334-1342`). `scripts/snapshot_store.py:106-120` requires HTTPS but does not host/IP allowlist. Subagent noted `internal/catalog/client.go:107-154` similarly accepts arbitrary HTTPS hosts and blocks downgrade/hop excess but not private destinations. Threat includes SSRF to private services and unbounded response consumption; source-derived, not dynamically tested.
5. **High/Medium — dirty producer dataset is incoherent with the checked-in release tree.** HEAD and the live origin contain 5,825 rows; dirty `web/data/catalog.json` has 46,166, and dirty `web/data/release.json` describes the larger dataset while checked-in `web/public/v1/current.json` still names the 5,825-row release `rel-2026-10-07-01`, sequence 145. Building from the dirty dataset under that identity was reproduced. This is local working-tree evidence, not a claim that the live origin is incoherent. Do not publish the dirty data until the release is deliberately cut and all artifacts agree.

## Other Material Findings

- **Source provenance is lost across Go release compilation.** Producer adds explicit row `source` IDs, but `internal/catalogbuild/dataset.go:31-48` has no `Source`; `convertRow` (`:172-227`) infers `SourceID` from the second colon-separated listing-ID component. `DatasetSnapshotID` (`:131-137`) is synthetic from whole-dataset bytes, not the actual fetch snapshot ID. Source row cannot reliably trace to its upstream feed/fetch snapshot.
- **Stale/partial ingestion lacks structured completeness state.** `obtain()` (`scripts/build_full_catalog.py:356-424`) returns prior bytes after refresh failure with a STALE log; snapshot store may preserve healthy state when prior content/count remains. Output may not expose stale/completeness. Current dirty script supports source skipping; treat that as dirty-only unless comparing against HEAD.
- **Snapshot store/history/schema concerns.** `scripts/snapshot_store.py` keys by URL and replaces old content for a URL (`:172-230`) rather than immutable historical snapshots; docs say source schema matches snapshot record, but actual record includes `sourceId` while `schemas/source.schema.json` disallows extras and omits it. Verify schema version/consumer before treating compatibility impact as proven.
- **Schema drift:** release ID schema pattern differs from Go-generated `rel-YYYY-MM-DD-NN`; listing schema requires `sourceType`/`manifestFormat` while `domain.SourceReference` exposes `sourceId`/`upstreamId`/`url`. No actual JSON-schema validation in the release path was found by reviewers.
- **The current live release is searchable but not installable:** `catalog sync` from the live origin succeeded and indexed 5,825 rows. All 4,079 MCP and 1,108 skill rows are `discovery_only`; the 638 plugins are `metadata_verified`, but the synced `versions.json` has zero `runtime.command` entries. Search works; `prepare_install` fails with no versions, and both MCP and skill CLI installs fail closed as not installable. The live package page nevertheless shows an `litespm install skill:anthropics:docx` command, which the CLI rejects with `LPSM-NOT-INSTALLABLE`.
- **CLI/core:** import uses a manifest snapshot loaded before interactive approval and writes via direct `os.WriteFile` (`cmd/litespm/import.go:202-260,313-325,418-436`), risking lost concurrent edits/truncation; MCP host config install has read/merge/write without compare-and-swap (`internal/host/entry_install.go:401-483`); install compensation does not survive process death (documented in `internal/lifecycle/txn.go:19-26`); `install --workspace` is parsed but not consumed (`main.go:925-999,1115-1148`); capabilities `--host`/flag ordering mismatch docs (`capabilities.go:22-33,72-87,123-124,241-265`); self-update binary download lacks deadline (`main.go:261,311-316`, unlike updater manifest 30s timeout); SemVer parser accepts malformed forms (`internal/resolver/semver.go:35-90`).
- **Dependency metadata claim is not a confirmed defect.** Production sync does load `versions.json` as `[]*domain.VersionRecord` and calls `SearchIndex.Replace` (`internal/catalog/client.go:229-243`); however `internal/catalogbuild/dataset.go:244-250` constructs current producer VersionRecords with empty dependencies by design, while CLI resolver adapter only copies version strings (`main.go:2543-2565`). Classify as current product/data-model limitation or latent capability gap only after checking real release version records and resolver contract; do not overstate.
- **UI:** Live browser search for `postgres` rendered 82/5,825 rows. Broad query `a` rendered **5,659 result cards** with no window/pagination (DOM text was ~1.05 MB); `SearchResults` places the entire list inside `aria-live="polite"` (`HomeView.tsx:97-100,134-145`; `SearchResults.tsx:51,90-97`; `search.worker.ts:123-137`). On a live package page, five of six inactive tabs referenced nonexistent `aria-controls` targets; clicking a tab replaces the one `tabpanel`, so all remaining inactive references stay dangling (`PackageTabs.tsx:554-584`). Other candidates: loading/deferred-query mismatch; search keyboard shortcuts only on Home/Explore; mobile Categories reserves hidden 130px third grid track. Dirty registry rows are labeled vendor-listed despite registry source being distinct from publisher marketplace provenance (dirty producer output only).
- **Docs drift:** `ARCH/25` theme/kind-tab contract inconsistencies; architecture docs misstate `catalog build`/artifact fetcher, MCP install needs, HTTPS redirect controls, self-update verification, IPC peer authentication. Reconcile with STATUS and preserve documented open gaps.
- **Web dependency audit:** `npm audit --json` in the clean HEAD copy reported 10 affected packages (2 moderate, 7 high, 1 critical). Direct `next@15.1.7` is in npm's critical range with many advisories; npm reports `15.5.27` as a non-major fix. Direct `tailwindcss@3.4.17` is also flagged high, with the suggested fix requiring a major update to 4.x. The site is exported as static files, so do not imply Next server-only advisories are directly exploitable on the deployed static origin; the build dependency is nevertheless stale/vulnerable, and CI has no `npm audit` gate. SBOM is uploaded without detached signature/checksum entry; installer checksum behavior remains as previously reviewed.

## Website/UI Positive Evidence and Limits

- Static export wired: Next 15.1.7 `output:"export"`, trailing slashes, static slices plus full `/data/catalog.json`, lazy full-data client fetch, worker fallback. Theme/reduced-motion, skip link, focus styles, labeled search/mobile controls exist.
- `npx tsc --noEmit` passed in the current checkout. In the isolated clean HEAD copy, `npm ci && npm run build` and full `scripts/deploy-pages.sh` passed, including materialization, digest verification, and strict Pages bundle allowlist/leak audit. The build warned about the 10 npm audit findings above. Live browser navigation/search/package detail were exercised; this proves the current live origin behavior, not every browser/OS combination. No dedicated web test script exists.

## Tooling, Verification, and Limitations

- Git/GitHub MCP confirmed local/remote HEAD alignment and remote STATUS; DeepWiki has no repository index. `agent-browser` CLI unavailable; Chrome DevTools browser MCP was used for the live site.
- Optional codebase indexer dependencies (`tree-sitter-language-pack`, `pathspec`) were absent; no package install and no `.code-intelligence/` index was generated.
- Verification executed: current checkout `gofmt -l .`, `go vet ./...`, `bash -n scripts/*.sh`, `python3 -m py_compile scripts/*.py`, Node syntax checks, `cd npm && npm test`, `python3 scripts/build_full_catalog.py --check`, `python3 scripts/snapshot_store.py` (26 checks), untracked producer `python3 scripts/test_snapshot_lifecycle.py` (15 checks), `npx tsc --noEmit`, and `git diff --check` passed. Current dirty-tree `go test -race -count=1 ./...` fails only `TestCatalogRelease_EndToEnd`: dirty release listings are 40,939,053 bytes and versions 21,978,015 bytes, exceeding `internal/catalog`'s 16 MiB response limit. In a clean archive of HEAD, `go test -race -count=1 ./...` passed all packages. The clean copy's web production build and deploy bundle audit also passed.
- Live origin `/v1/current.json`, manifest, listings, and versions all returned HTTP 200 and the pointer matched checked-in HEAD. Live `catalog sync`, search, browser rendering, and isolated daemon/Bridge JSON-RPC calls were exercised. Bridge initialized and exposed 12 tools; search worked; `get_invocation`/`cancel_invocation` returned their documented `-32601` not-implemented errors. Daemon testing used a temporary `secret-tool` shim under `/tmp` because the environment has no native Secret Service; no OS/user configuration was changed.
- Dynamic tests reproduced MCP deny bypass and changed-input materialization as above. The approval/host-target binding gap remains source-derived only; no host-target mutation test, SSRF probe, crash injection, Windows/macOS runtime acceptance, or real live-catalog install success was performed (the live release has no installable rows).
- All findings are candidates prioritized by severity and evidence, not an assertion that every risk was reproduced. Separate committed HEAD issues from dirty producer observations and from docs-only drift.

## Website Link-Breakage Fix (2026-10-08 evening)

User reported: "check the website, the links not working."

### Root cause (found via two-browser reproduction + dev-mode `pageerror` capture)

`web/app/HomeView.tsx:97` / `web/app/explore/ExploreView.tsx:158` passed `full ?? []` into
`useCatalogSearch` — before the catalog loads, `full` is `null`, so **`[]` was a fresh array every
render**. That churned the hook's drive-effect deps (`[listings, ...]`) every render, and its
`!worker` branch (`web/lib/useCatalogSearch.ts`) called `setResults(new array)` **without the
`lastKeyRef` guard the fallback branch has** → infinite `setState`-in-effect loop → React logged
`Maximum update depth exceeded` forever, which **starved the router's transition so every
client-side `<Link>` navigation silently never committed** (no fetch when prefetched, no
`pushState`, no error — dead links). Typing in search loaded the catalog (`full` became stable),
the loop stopped, and navigation flushed — matching every observed behavior (links "worked" only
after typing or from `/package/`).

### Fix (uncommitted, on top of `29643c3`)

`web/lib/useCatalogSearch.ts` only:
1. Normalizes empty row sets to one shared `EMPTY_LISTINGS` identity (kills dep churn from any caller).
2. Key-gates the `!worker` branch with `lastKeyRef` exactly like the fallback branch (kills the unguarded `setResults`).

Call sites unchanged; `npx tsc --noEmit` passes.

### Evidence

- **Dev** (`next dev`): full click-through — nav Explore/Agents/Categories/Coverage, footer, card→`/package/?slug=agent-rail`, logo→home — all navigate; 0 update-depth errors.
- **Prod** (fresh `npm run build` static export served on :8795): same 7/7 click-through navigates; **0 console errors**; search still returns "Showing 24 of 46,166 results".
- Reproduced BEFORE the fix in **both** chrome-devtools and Playwright Chromium; dev `pageerror` capture showed `Maximum update depth exceeded` ×40+ plus a `useId` hydration warning.
- The `useId` hydration warning (`_R_…` id mismatch on `SearchBar`, `/` and `/explore/`) appears in **dev only** (0 errors in prod) and matches the Next 15.5 known-issue class (radix-ui/primitives#3700); `SearchBar` is the app's only `useId`. Cosmetic in dev; no prod impact. Not fixed — documented.

### Working-tree note (IMPORTANT)

During the 18:45 server restart the tree was committed by an external actor: **`29643c3 "Commit"`
(sarvesh, 2026-10-08 17:55, 120 files, +914,387)** contains ALL session work (remediation + waves
1-5 + B1 + docs). Not an agent action — nothing was rewritten. Current dirty state is exactly:
`web/lib/useCatalogSearch.ts` (this fix) + `web/next-env.d.ts` (build artifact, restore after the
final web build) + this handover update. A **pre-session stash** `stash@{0} "WIP on main: 927e244
commit"` (yesterday 04:29, zero session markers) exists and was deliberately left untouched.

## Final Next Steps

1. **Producer rebuild is running** as detached PID `2456`; log: `/tmp/opencode/rebuild.log`. Last observed in replay mode at `skills.sh: 500/19,388 processed (384 added)`, after 764/1,114 skill rows had been verified/promoted. The process may have progressed since that observation. It will then enrich remaining feeds and crawl mcpmarket (≤2,000 pages/run, 1 s crawl delay, robots-permitted paths only). Wait for the completion notification from watcher `sh_11cf03444001V0ABq3JIDQxSHo`; then inspect final ingestion completeness/stale status, skill verification totals, endpoint-drop counts, and source rows before cutting a release.
2. **Release cut** (explicitly authorized): `go run ./cmd/litespm catalog build` from the completed producer dataset; verify the resulting release ID/sequence/digests and synced `web/data/release.json` + `web/public/v1/current.json`, then run `go run ./cmd/litespm catalog build --verify web/public`. Expected next sequence is 146 from the current 145 pointer, but confirm the pointer at execution time rather than assume it.
3. Run the final full Go/Python checks and web type-check/build after the dataset lands. Serve the final export on a fresh port and click-test routes plus promoted skill/remote-MCP pages. Restore only the generated `web/next-env.d.ts` route-types line after the last build. Leave the existing commit untouched; keep subsequent changes unstaged, uncommitted, and unpublished as requested.
4. If catalog sync must work behind an egress proxy, revisit the deliberate proxy bypass in `internal/catalog/client.go` (see Closeout decisions).
5. Open follow-ups recorded below: private-literal LAN endpoint opt-in (plan-time refusal has no consent flag), ingest-path `metadata_verified` alignment for remote-only records, `mcpmarket` accumulation across runs, residual shim.go line-cite drift in older docs.

## Limitations-Fixing Waves (2026-10-08, after closeout)

User selected ALL five open limitations (docs drift, release cut, installability metadata, mcpmarket source, snapshot history) and explicitly approved **implementing remote (URL) MCP install** when the bucket-(b) scope question was surfaced.

### Waves 1-2 (parallel lanes, all reconciled)

- **Docs drift**: `ARCH/00,01,03,04,05,06,07,08,09,10,11,17,22,25,36` + `STATUS.md` reconciled against source (catalog-client egress now enforced, self-update bounded+checksummed, `catalog build`/artifact-fetcher status, ARCH/25 internal contradictions).
- **Snapshot history**: `scripts/snapshot_store.py` now archives every superseded fetch under `history/<key>/<entry>/` (hard-linked, write-once, retention ≤8 entries/32 MiB per URL, prune-before-add fail-closed, lazy legacy migration). Self-test 50 checks, lifecycle 23 checks.
- **mcpmarket.com source**: integrated producer-side (`feed:mcpmarket-com` in `build_full_catalog.py` + `internal/source/sources.go`); robots.txt permits `/` (API disallowed, never used), sitemap patterns strict-fullmatch, exact-host allowlist (apex+www), per-run fetch budget `MCPMARKET_DEFAULT_MAX_PAGE_FETCHES=2000` @ 1 s delay. New suite: 105 checks.
- **Installability research** → `.slim/deepwork/installability-research.md` (681 lines): kind×source matrix, three buckets (wire-now / needs-consumer / fail-closed-forever).
- **A2 version-less resolution**: resolver owns the `discovery` implicit pin (`ImplicitVersion`); wildcards/exact-pin only, real ranges still fail closed; nothing synthesized into plan hash. `ARCH/13` §1.2 + `STATUS.md` note; real release row exercised in `plan_fields_test`.
- **A1+A3 skill promotion**: producer promotes a skill row to `metadata_verified` ONLY after a genuine build-time `SKILL.md` read (frontmatter name+description, sanitizer, mismatch gate, ≤3 probes depth ≤2); officialskills.sh pages adopt the published GitHub tree link as `skillSource`; askills slug self-collision fixed; enrichment instead of first-wins discard. New suite: 186 checks. **Promotion counts land with the rebuild.**
- **B2 registry schema**: `internal/source/mcp_registry.go` + `internal/interop` aligned to the live server.json schema (verbatim live fixtures), `litespm import` of real registry docs now produces a preview plan instead of `LPSM-IMPORT-004`; negative tests pin that no command is ever derived from a coordinate.

### B1 remote (URL) MCP install — Phases 0-5, all implemented

- **Phase 0** `internal/egress` extracted from `internal/catalog/client.go` (policy: https-only + loopback-http, no URL credentials, ≤3 redirects, same-origin for remote policy, checked-IP dial, proxy off, `DialTLSContext` cleared, link-local/metadata/CGNAT refused unconditionally, RFC1918 behind `AllowPrivate`); catalog delegates; `mcpclient` nil/caller clients wrapped fail-closed. 16 egress + 4 guard tests.
- **Phase 1** producer reads `remotes[]` (first `streamable-http` else first; drops logged; non-https sanitized → stays `discovery_only`); `DatasetRow.url` → `RuntimeDescriptor.Endpoint`; `ParseDataset` requires `Transport && (Command || URL)` + rejects `discovery_only`+`url`; `RuntimeForListing` accepts endpoint-only components. Suite: `test_remote_endpoints.py` 77 checks.
- **Phase 2** `RemoteEntrySpec` + `BridgeTarget.Remote`; `ServerEntry.Endpoint`; golden JSON/TOML entries for the 8 verified-capable hosts (claude-code, cline, opencode, codex, grok-build, pi-agent, cursor, zed); 8/42 matrix test (mass-enable fails); read-back transports both shapes; `--env` refused (`LPSM-REMOTE-ENV-REFUSED`); both-set refused; copy/porting wire endpoint + refuse incapable targets (`LPSM-COPY-002`); `hosts.json` gains `remote:true` ×8; `web/lib/hosts.ts` optional field.
- **Phase 3** plan-time `egress.CheckURL` + literal-IP classification (private literals refused, no opt-in flag yet); capability-filtered host sets with typed drop list; sealed-plan replay validates endpoint; `entryDigest` separates stdio vs remote; approval prompt prints a mandatory `endpoint : "https://…" (transport)` line; `install.execute` result carries `endpoint`+`transport`. Decision 6 honored (no targeted `network.outbound` policy input). E2E: plan→approve→execute→golden entry→ledger→remove→byte-identical restore on JSON + TOML hosts.
- **Phase 4** `discover` remote dial via `dialRemote` → `ConnectStreamableHTTP`/`ConnectLegacy` on guarded clients; typed `LPSM-PROVIDER-REMOTE-AUTH`/`-CONNECT`; zero rows on failure (Decision 8: unconnected health stays `— Unknown`); `state` `launchSpec.endpoint` (no migration, `mode=remote-http`/`legacy-sse`); capabilities prints the endpoint it dials. Fixtures: stateless 2026-07-28 wire shape (0 `initialize`) + legacy handshake (1 `initialize`), 401 → typed auth + zero rows, `169.254.169.254` refused pre-dial.
- **Phase 5** docs: `ARCH/05` §3.1/§3.2 corrected (egress enforced; genuinely-open bullets remain), `ARCH/07` D-030/D-031 recorded, `ARCH/16` §3.7.4 remote-entry model, `ARCH/01/03/08/09/14/20/00` re-cited, `STATUS.md` §3 rows updated, `TODO.md` LPSM-A008/F001, migrate-script docstring+print. (No `SPEC-CHANGELOG.md` exists here; ARCH/07 is the normative ADR record per `ARCH/00-INDEX`.)

### Verification after Waves 1-5

`go test ./... -count=1` **TEST_EXIT=0 (42 packages)** · `go vet`/`gofmt`/`git diff --check` clean · Python: `--check` OK + 77/31/186/105/23/50 checks · `cd web && npx tsc --noEmit` OK · combined re-run green after every wave.

### Decisions & gotchas (this phase)

- Bucket (c) unchanged: awesome-list MCP claims, registry coordinates without observed start, plugins without artifact locators, 7 non-git-host skills — all stay fail-closed forever.
- Remote rows classify `metadata_verified` from the publisher's own `remotes[]`; **no install-time probe** (Decision 7a); `runtime_verified` still means observed start.
- Plan-time policy: `Policy{AllowLoopbackHTTP:true, SameOriginRedirects:true, MaxRedirects:3}`, `AllowPrivate:false` → literal private-IP LAN endpoints refused at plan time (hostname-based LAN endpoints pass plan-time by design — no DNS at plan — and are checked at dial).
- Two interrupted lanes (server restart) were gap-audited and completed by a dedicated B1-GAP lane; all their required tests now exist.
- The engram memory MCP server dropped mid-session — handover lives entirely in this file.

## Active Remediation Lanes (all returned and reconciled)

- CLI/security and release identity: `ses_ee56fc947ffe5K5ipTieNPmCNb` — done, reviewed, tested.
- Registry/fetch safety: `ses_ee56fa6caffeliNSjnOfbFFacd` — done, reviewed, tested; producer hunks preserved.
- Website behavior: `ses_ee56fb9ebffey9J4D73iCd5438` — done, reviewed, browser-verified twice (pre- and post-Tailwind).
- Dependency security: `ses_ee56f988bffeVDVdsb0omxjSEN` — Next 15.5.27 + PostCSS override; superseded by the authorized Tailwind v4 migration from the website lane.
- Verification/coordination state: `.slim/deepwork/fix-audit-findings.md`. No Oracle reviewer is available; independent review and executable regression evidence are the substitute gate.

## Remediation Closeout (2026-10-08)

### Changed (all uncommitted; nothing staged)

- **Authorization/release identity:** `cmd/litespm/install_authz.go`, `install_mcp.go`, `main.go`, `catalog_build_test.go`, `plan_fields_test.go` and related tests. Explicit `package.install` denies now stop MCP installs; the approved plan seals the exact host set, config paths, runtime descriptor, env names and force flag in each `HostChange.ValueJSON`, execution reads only the sealed plan (`LPSM-PLAN-STALE` if a target moved or the catalog changed), and `--materialize` refuses a changed manifest digest instead of reusing the prior immutable release identity.
- **Config-write concurrency:** `internal/host/backup.go`, `entry_install.go`, `entry_state.go`; `cmd/litespm/import.go`. Cross-process config lock, compare-before-replace writes, rollback that refuses to clobber edits made after the install, and an import snapshot/lock so a manifest edited between preview and approval is never overwritten.
- **Fetch/ingestion boundary:** `scripts/build_full_catalog.py` (on top of the producer's own hunks), `internal/catalog/client.go`, `internal/catalogbuild/dataset.go`, plus new `scripts/test_catalog_ingestion_safety.py` and `internal/catalog/{client_body_test,client_egress_test}.go`. Per-source host allowlist, HTTPS/port/credential refusal, DNS→public-IP validation pinned to the dialled address, redirect re-validation, 16 MiB bounded source responses, structured stale/incomplete run status, registry pagination/status hardening, and public-IP-checked catalog dials. Provenance: a row's `sourceSnapshotId` is only copied when the producer supplied a real one; the whole-dataset fingerprint is no longer stamped onto rows as if it were an upstream snapshot.
- **Website:** `SearchResults.tsx` (24 cards + "Show more", count-only live region), `PackageTabs.tsx` (all six panels mounted, `aria-controls` always resolves), `AddSteps.tsx` (fail-closed messaging, no `litespm install <id>` for discovery-only/unclassified/plugin rows).
- **Dependencies:** `web/package.json`, `web/package-lock.json`, `web/postcss.config.js`, `web/app/globals.css` — Next 15.1.7→15.5.27, Tailwind v3→4.3.3 (`@tailwindcss/postcss`, legacy config kept via `@config`), autoprefixer dropped (v4 handles prefixes). `npm audit` 10 findings (1 critical) → 0.
- **Other CLI candidates:** `capabilities.go` flag/command validation, strict SemVer parsing (`internal/resolver/semver.go`), self-update download deadline, `--workspace` rejected as unimplemented (docs updated in `README.md`, `ARCH/01`, `ARCH/04`).
- **Test-only flake fix:** `internal/catalog/integrity_test.go` pins `compileSampleRelease`'s `createdAt`.

### Verification (run in this tree unless noted)

- `go test ./... -count=1` — pass, all packages. The dirty 46,166-row `TestCatalogRelease_EndToEnd` now passes because manifest-declared listings/versions are bounded at 64 MiB instead of the 16 MiB metadata cap (previously the audit's dirty-tree failure).
- `go test -race ./cmd/litespm ./internal/host ./internal/resolver ./internal/catalog -count=1` — pass; **full `go test -race ./... -count=1` — pass, all packages** (including `internal/catalogbuild` 288s, `test` 248s, `cmd/litespm` 170s).
- `go vet ./...`, `gofmt -l cmd internal test`, `git diff --check` — clean.
- Python: `py_compile`, `build_full_catalog.py --check` (CHECK OK), `test_catalog_ingestion_safety.py` (31 checks), producer `test_snapshot_lifecycle.py` (15), `snapshot_store.py` self-test (26) — pass.
- Isolated web copy (`/tmp/opencode/litespm-web-final.hKCZ33`, never shared `node_modules`): `npm ci` → 0 vulnerabilities, `npm audit` → 0 advisories, `npx tsc --noEmit`, `npm run build` static export — pass.
- Independent browser check of that build (Chrome DevTools MCP): query `a` → "Showing 24 of 39,643 results · 46,166 entries", "Show 24 more" → 48; package page → 6 tabs / 6 panels, all `aria-controls` resolve, exactly one visible panel; discovery-only entry shows `LPSM-NOT-INSTALLABLE` copy with zero item install commands; console 0 errors, 4 known font-preload warnings; screenshot `/tmp/opencode/pkg-page-tailwind4.png` shows the design intact.
- `cd npm && npm test` — all wrapper tests pass (no `dist/` binary was rebuilt this time).

### Decisions & gotchas

- **Catalog client bypasses environment proxies** (`clone.Proxy = nil`): a proxy would resolve destinations outside the new IP pinning. Deliberate fail-closed trade-off — proxy-dependent environments lose proxied catalog sync until a reviewed proxy-aware design exists.
- **Redirect cap is now 3 hops**: the code previously refused at 3 (`>= 3`) while `ARCH/03 §5` documents a cap of 3; the fix aligns code with the documented bound, so one extra redirect is permitted versus HEAD.
- **`internal/catalogbuild/dataset_test.go`**: only HEAD's synthetic-snapshot assertions (`snap-deadbeef`) were updated; the producer's K002 `source`-provenance hunk is intact.
- **The pre-existing `TestSyncUnavailableVerifierRespectsRequireFlag` flake**: `pointerFor` and `signedReleaseFiles` compile the same fixture independently, `CompileRelease` stamps `createdAt` at RFC3339 *second* precision, so a wall-clock second tick between the two compiles made the digest chain fail once during a full-suite run. Fixture time is now pinned; `-count=10` passes.
- Nothing was staged or committed; producer-owned `web/data/*`, `web/lib/telemetry.ts`, and their hunks in `scripts/build_full_catalog.py` are untouched by closeout.

### Not changed (open by decision, not by oversight)

- Dirty dataset vs checked-in release identity (finding 5): needs a deliberate release cut; `catalog build --materialize` now *refuses* to paper over it.
- No installable MCP/skill runtime metadata exists upstream; every path stays fail-closed and no launch facts were synthesized.
- `mcpmarket.com` was not added as a source (user informed; no explicit instruction to add it).
- `scripts/snapshot_store.py` untouched: it performs no network fetches, so the fetch policy belongs in the producer (now enforced there); its one-snapshot-per-URL replacement behavior and the broader docs drift remain open.

## Source Inventory Check

- Producer working tree integrates `mcpservers.org` and `skills.sh`; the dirty generated catalog has 255 rows with `source=feed:mcpservers-org` and zero rows with `source=feed:skills-sh` (all observed skills.sh candidates deduplicate against earlier rows). Neither integration is in the checked-in release yet.
- `mcpmarket.com` is absent from `scripts/build_full_catalog.py`, `internal/source/sources.go`, and both current dataset/release. User asked whether it was added; answered that it was not, and did not expand remediation to add a new source without explicit confirmation.

## Tailwind v4 Migration Handover (2026-10-08)

### Active Goal

- Complete the authorized LiteSPM website Tailwind v3-to-v4 migration while preserving the existing search, package-tab, and installability UI fixes and producer-owned data/telemetry work.

### Where We Stopped

- Updated `web/package.json`, `web/package-lock.json`, `web/postcss.config.js`, and `web/app/globals.css` for Tailwind CSS 4.3.3 and `@tailwindcss/postcss`.
- Kept `web/tailwind.config.js` and the existing `@layer components` CSS; `@config` compatibility loads the legacy design tokens. Added v3-compatible default border color and changed only utilities whose v4 equivalents differ.
- Updated migration-required utility classes in `web/app/explore/ExploreView.tsx`, `web/app/package/PackageView.tsx`, `web/components/catalog/CapabilityCard.tsx`, `web/components/catalog/ExtensionGrid.tsx`, `web/components/hero/HeroSection.tsx`, `web/components/home/LandingHero.tsx`, `web/components/layout/SiteFooter.tsx`, `web/components/navigation/SearchBar.tsx`, and `web/components/package/PackageTabs.tsx`.
- Verified `npm ci` (zero vulnerabilities), `npm audit --json` (zero advisories), `npx tsc --noEmit`, `npm run build` (static export), and `git diff --check`.
- Browser-tested the built export: query `a` showed 24 of 39,643 matches, then 48 after Show more; all six tabs referenced existing panels and only the selected panel was visible; discovery-only and plugin entries displayed their correct fail-closed errors without LiteSPM item-install commands. Desktop screenshot/DOM comparison preserved layout; 390px viewport had no horizontal overflow.
- `web/next-env.d.ts` was restored after Next's build generated a route-types reference; it is not part of the migration diff. Producer-owned catalog/release JSON and telemetry were not edited. No files were staged or committed.

### Next Exact Steps

1. No further Tailwind migration changes are required. During final reconciliation, review the full cross-lane diff without staging, committing, or overwriting producer-owned paths.

### Decisions & Gotchas

- Tailwind v4's official upgrader was run only in `/tmp/opencode`; its broad template/CSS rewrite was not copied wholesale. The focused migration keeps the old config via `@config` and preserves CSS component-layer ordering.
- Next 15.5.27 emitted a workspace-root warning because it sees `/home/sarvesh/business_Dev/package-lock.json`; this did not prevent static export. Browser console had zero errors and four font-preload warnings.
- Do not stage/commit this lane; the user explicitly requested that it remain uncommitted.

## Safe Catalog Retry Handover (2026-10-08)

### Active Goal

Resume the catalog rebuild after `skills.sh` HTTP 429 responses, honoring retry timing, avoiding duplicate rows, and only cutting a release from a complete build. Preserve current producer data and leave all follow-up changes unstaged, uncommitted, and unpublished.

### Where We Stopped

- The previous producer PID `2456` was SIGSTOP-paused with old code loaded. It was terminated via SIGTERM/SIGCONT; its durable snapshots under `source-snapshots/` were retained.
- `scripts/build_full_catalog.py` now honors `Retry-After` delay-seconds and HTTP-dates; absent/invalid headers use a 60-second wait. Automatic waits are bounded to one hour; an excessive delay fails closed. One retry is allowed after a source's first 429; a persistent/later 429 opens the source circuit, marks it incomplete, and stops that feed instead of hammering it.
- Skills.sh and mcpservers.org sitemap IDs are deduplicated before queuing fetches; a final unique-listing-ID invariant aborts before writing output if any duplicates remain.
- `scripts/test_skill_promotion.py` adds duplicate sitemap and snapshot replay checks plus 429 retry/circuit-breaker checks.
- Focused verification passed: `scripts/test_skill_promotion.py` (211), `scripts/test_catalog_ingestion_safety.py` (31), `scripts/test_snapshot_lifecycle.py` (23), `scripts/test_remote_endpoints.py` (77), `scripts/test_mcpmarket_source.py` (105), `build_full_catalog.py --check`, `py_compile`, and `git diff --check`.
- The replacement producer shell `sh_11d4dbbf1001SZnq9OtHhWiYvb` completed, writing only to `/tmp/opencode/litespm-catalog-rebuild-20261008-retry1`; log: `/tmp/opencode/rebuild-retry1.log`. It did not write production `web/data/`.
- After that run started, `obtain()` was also tightened so refresh-mode 429s propagate to `_obtain_bulk` instead of being mistaken for stale-cache fallback. The active run uses default replay mode (not `--refresh`), so this follow-up does not change its behavior; the refresh path has its own regression check.
- Completion gate failed: `CATALOG_INGESTION_STATUS` is `incomplete` for `feed:skills-sh` and the deliberately bounded `feed:mcpmarket-com`. `skills.sh` reported 19,239 not-yet-catalogued skills (612 already present, 586 to enrich), then returned HTTP 429 again after the single 60-second `Retry-After` recovery; the producer stopped that feed as designed. Do not promote this output or cut a release.
- Source-policy investigation found `https://skills.sh/robots.txt` disallows `/api/`; the old producer's `/api/download/...` route was therefore not retried. A permitted sample listing page exposes the full description as `SoftwareApplication` JSON-LD.
- `scripts/build_full_catalog.py` now reads the sitemap-listed public skill pages, extracts their JSON-LD description (description-meta fallback), refuses `/api/`, `/internal/`, `/debug-security/`, `/search`, foreign hosts, query-bearing page URLs, and traversal paths, and preserves discovery-only installability. `scripts/test_skill_promotion.py` and `scripts/test_snapshot_lifecycle.py` cover the new page/snapshot behavior; `ARCH/03-CATALOG-SOURCES.md` and `ARCH/27-CAPABILITY-SOURCE-SUPPORT-MATRIX.md` document the source policy.
- Offline verification after the source change passed: `scripts/test_skill_promotion.py` (221), `scripts/test_snapshot_lifecycle.py` (23), `scripts/test_catalog_ingestion_safety.py` (31), `scripts/test_remote_endpoints.py` (77), `scripts/test_mcpmarket_source.py` (105), producer `--check`, and `py_compile`.
- An initial live `--only-source feed:skills-sh --refresh` attempt (`sh_11f13b8a5001hFd2lDikdsgOQO`) was terminated with exit 143 after review found it had started just before the complete robots path/redirect guard was added. Its log `/tmp/opencode/litespm-skills-sh-pages-20261009/producer.log` shows it reached the skill URL queue (19,792 URLs) and wrote no catalog; any source snapshots it recorded are retained. The refreshed sitemap snapshots can now be replayed under the complete guard.
- The first guarded replay-mode source-only pass (`sh_11f173757001toDXZ6sar6qXDu`) was canceled by a session/server restart. Its `/tmp/opencode` log directory was cleared by that restart; no producer process remains. Durable `source-snapshots/` data survived: 3,847 `feed:skills-sh` snapshots (3,599 partial from the interrupted pass, 248 healthy), latest fetch at `2026-10-09T06:11:32Z`. The production catalog/release/pointer timestamps remain unchanged (catalog and release from Oct 7; pointer from Oct 7).
- The first managed resume (`sh_11f4f686c0012J2GPKNiqld2x0`) was also canceled by a server restart. Its `/tmp/opencode` log path disappeared and no producer process remained. The durable snapshot store advanced from 3,847 to 9,397 skills.sh records (9,149 partial, 248 healthy), latest fetch `2026-10-09T07:19:38Z`; production data timestamps remained unchanged.
- To survive another shell-manager restart, relaunched the same default replay-mode source-only command as detached PID `286397` (its SID/PGID are independent of the invoking shell). PID file: `tmp-catalog-replay-20261010/producer.pid`; persistent log: `tmp-catalog-replay-20261010/producer.log`. Startup confirms replay mode, scope `feed:skills-sh`, and no catalog/release writes. It reuses recorded bodies and fetches only missing URLs; do not start a second producer while this PID is alive. Completion watcher is shell `sh_126f50305001Y4imwMJhNFD18i`; if a server restart cancels the watcher, the detached producer should survive.
- The permitted mcpmarket partial crawl added 2,000 rows, deferred 414,727, and reported 0 fetch failures, 0 rows missing name/summary, and 19 non-listing URLs. This is the documented bounded-partial case, but it does not waive the separate skills.sh completeness gate.
- Isolated output has 48,417 rows (46,418 MCP, 1,361 skills, 638 plugins), SHA-256 `cc2ff8aaf701859ebf39f953ead554327bf7b3b2c010ced64c91b4f29da52043`; all 48,417 IDs are unique and temporary `release.json` count/digest reconcile. Remote MCP check: 25,401 URL+transport rows are `metadata_verified`, all pass the static publishability rule, and none invent command/args. Registry summary records 509 multi-endpoint rows with extra endpoints dropped by the one-endpoint schema and 14 rows whose selected endpoint was refused; no duplicate registry IDs.
- Existing production inputs remain unchanged: current pointer is still `rel-2026-10-07-01`, sequence 145, 5,825 items; `web/data/release.json` still describes the 46,166-row producer dataset. The temporary 48,417-row output was not copied into `web/data/` and no release was built.

### Next Exact Steps

1. Wait for detached producer PID `286397`'s completion watcher; inspect `tmp-catalog-replay-20261010/producer.log` and source status once. If the server restarts, check this PID first and reattach a watcher if it is alive; only resume the source-only command if the PID is gone and the source pass did not finalize. Require no incomplete/stale `feed:skills-sh` and no rate-limit circuit before rebuilding.
2. If the source-only replay completes cleanly, run the full producer in replay mode into a new isolated output directory; retain both earlier temp outputs. The mcpmarket source may remain bounded-partial only with the exact deferred count and zero fetch/layout failures.
3. Inspect completeness, unique IDs, endpoint safety, counts, and digest/stats of the new full output. Do not promote if any core source is incomplete or stale.
4. Only after the gate passes, confirm production `web/data/catalog.json` and `web/data/release.json` remain the existing 46,166-row data, transfer the accepted output, then cut and verify the release. Confirm the current pointer before assuming sequence 146; run final Go/Python checks, web build, and browser checks.
5. Leave the pre-session stash untouched; do not stage, commit, push, or publish.

### Decisions & Gotchas

- The temporary producer output protects the existing producer dataset from a run that finishes with an incomplete/rate-limited source. `--output` directs both `catalog.json` and producer stats into that directory; the producer still replays/fetches snapshots from the repository snapshot store.
- A complete HTTP fetch/build is not release evidence by itself: inspect the machine-readable completeness report before promoting output. The accepted mcpmarket crawl budget can produce an intentionally partial source; distinguish this from an accidental skills.sh rate-limit stop.
- Existing browser-only dev `useId` hydration warning remains documented above; it is not part of this rate-limit change.

## Terminal CLI Recheck (2026-10-08)

### Active Goal

Recheck LiteSPM's terminal CLI, local daemon/MCP bridge, stateful workflows, and repository checks in an isolated root sandbox. Do not touch the user's real config/keyring or publish a release.

### Where We Stopped

- Created and used the requested root sandbox `tmp-cli-sandbox-2026-10-08/` (currently untracked; intentionally retained for inspection). It contains a Go-built `litespm`, isolated HOME/XDG/LiteSPM roots, local fixture inputs, logs, and a sandbox catalog tree. No production `web/public` pointer or `web/data` file was written by the CLI acceptance run.
- Built `tmp-cli-sandbox-2026-10-08/litespm` and exercised all documented help pages and command families, aliases, version, setup/init wizard quit, host list/detect/setup/remove/uninstall, local and live agent list/resolve, catalog search/sync/build+verify, inventory/list, lock write/check/verify/SPDX, copy/apply/remove/restore, every import format (including server object/array), local and GitHub skill add/list/update/remove, and CLI installability refusals. Import traversal was refused (`LPSM-IMPORT-003`), a command-source marketplace was refused (`LPSM-IMPORT-005`), and server.json secret values were reduced to environment-variable names in the preview. The environment-mismatch during one install-remove probe was corrected; repeat with matching `$CODEX_HOME`/`$OPENCODE_CONFIG_DIR` passed and removed only the test entry.
- Live sandbox network checks passed: catalog sync fetched `rel-2026-10-07-01` (5,825 entries), ACP agent list returned 41 entries, local catalog search returned results, and both `self-update`/`update` reported v0.3.0 current. A real GitHub-backed skill was fetched, installed, listed, updated in dry-run mode, and removed. No production catalog path was written.
- Installability was checked against that fetched release: its MCP/skill entries were discovery-only; `install`/`add`/`i` refused the skill with `LPSM-NOT-INSTALLABLE`. A frozen plugin install passed lock verification but correctly failed `LPSM-ARTIFACT-UNAVAILABLE` because the catalog has no plugin artifact source. This is a current catalog/product limitation, not evidence that end-to-end package installation succeeds.
- The daemon started and shut down cleanly using isolated data/config/runtime roots and a sandbox-only `secret-tool` shim. MCP `initialize`, `tools/list`, and all 12 advertised tool calls were exercised. Catalog search/detail and installed/capability listing worked; unavailable/unsafe routes failed closed. `get_invocation` and `cancel_invocation` returned the documented JSON-RPC `-32601` not-implemented errors.
- Doctor/daemon vault behavior was tested two ways: a deliberately failing sandbox shim made `doctor` report `LPSM-AUTH-VAULT-UNAVAILABLE` and made daemon startup refuse; a separate successful sandbox shim allowed the live daemon test. The real desktop keyring was never reachable or touched.
- `doctor --repair` and `doctor --repair --yes` found no automated actions because staging was clean; they reported the same expected vault failure (exit 50) and made no repair changes.
- Sandbox catalog build used the current 46,166-row input and produced `rel-2026-10-08-01`, sequence 146, in the sandbox only. After the fix below, build and verify print the same actual pointer manifest digest.
- Found/fixed a CLI reporting bug: `catalog build` had labeled `manifest.ContentDigest` as `Manifest`, while verify reports `current.json.manifestDigest`. `cmd/litespm/main.go` now prints `output.ManifestDigest`; `cmd/litespm/catalog_build_test.go` adds `TestCatalogBuildPrintsActualManifestDigest` (first observed failing, then passing).
- Fixed the flaky IPC race test: it assumed that reading a handler response meant the handler's deferred semaphore release had already run, then waited for another handler without consuming a possible valid rate-limit response. `internal/ipc/ipc_test.go` now consumes transient `CodeRateLimited` replies and retries with a five-second client-side deadline; server concurrency/backpressure semantics are unchanged.
- Verification passed after the fix: `go test ./... -count=1`; default-parallel `go test -race ./... -count=1 -timeout=15m`; `go vet ./...`; `gofmt -l .` clean; `git diff --check`. The IPC race test also passed at `-count=100`.
- Broader checks passed before this IPC test-only adjustment: `bash -n scripts/*.sh`; `node --check` for npm entry points; all five Python suites (31/211/23/77/105 checks) plus producer `--check`/`py_compile`; `cd npm && npm test`; `cd web && npx tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 npm run build`.
- The first default-parallel race run had hit the package's 10-minute test timeout in `internal/ipc/TestServerBoundsConcurrentHandlers`; after correcting the response/semaphore ordering assumption, the full default-parallel race suite passed. The manifest-digest display correction above was also reverified by the normal and race Go suites.
- The Next build regenerated the known route-types reference in `web/next-env.d.ts`; that generated line was restored per the prior handover. Build emitted only the existing workspace-root/multiple-lockfiles warning.

### Next Exact Steps

1. The earlier producer output failed the release gate and remains isolated. The `/api/` endpoint was found disallowed by robots.txt; a guarded replay-mode source-only pass is active on public pages (see preceding handover). No dataset was promoted and no release has been cut.
2. Continue release workflow only after every core feed is complete, then finish catalog identity/digest verification and browser smoke tests; keep every change unstaged, uncommitted, and unpublished.
3. No follow-up is needed for the observed CLI/test defects; the first parallel race timeout is resolved at the test seam. Do not change server semaphore behavior without a separate product requirement.

### Decisions & Gotchas

- The root sandbox is intentionally not deleted: user asked to create it, and its binary, generated catalog tree, fixture inputs, and logs are useful evidence. It is untracked and must not be staged.
- All live CLI network tests were pointed at sandbox state; the incomplete 48,417-row producer dataset remains isolated in `/tmp/opencode/litespm-catalog-rebuild-20261008-retry1` and was not promoted. A stopped source-only refresh wrote no dataset; retained source snapshots do not touch production catalog data.
- A successful daemon run with the test shim proves local daemon/IPC behavior only; it does not prove the real OS secret vault is configured. The sandbox doctor correctly leaves that as a failure.
- The race test now reflects the actual ordering contract: response delivery may precede semaphore release, and a request in that interval can be legitimately rate-limited. The test retries that response rather than deadlocking.

## Website UI Review (2026-10-09)

### Active Goal

Review the website UI while the guarded catalog replay runs; fix only reproduced website issues. Do not alter producer data or release artifacts.

### Where We Stopped

- `web/components/navigation/Header.tsx`: narrow screens now use a 92px content-height two-row header, giving primary navigation its own 44px touch row. Desktop returns to the original 48px content height. The Search affordance can focus the Explore search field when clicked while already on that route.
- `web/app/globals.css` defines responsive `--site-header-height` (48px desktop / 92px narrow). The `--stack-top` value in `HomeView.tsx`, `ExploreView.tsx`, `AgentsView.tsx`, `CategoriesView.tsx`, `TrendingView.tsx`, and all four route states in `PackageView.tsx` now follows that token.
- `CategoriesView.tsx` no longer reserves a hidden 130px mobile grid track. At 375px, the category-name track increased from 115px to 261px.
- Browser verification at 320/375/767px found all four primary links visible and hittable; desktop layout at 768/1280px retained the single-row header. A Categories → Coverage click navigated and marked Coverage active. On Explore, the header Search click navigated to `?focus=search` and focused the input, including the same-route case. The sticky Explore toolbar settled at 92px on mobile (header is 93px including its border) and 48px on desktop.
- Mobile screenshot: `.playwright-mcp/litespm-categories-mobile-fixed.png`.
- `./node_modules/.bin/tsc --noEmit --pretty false` passed after stopping the dev server; `git diff --check` passed. The Next dev server was stopped after browser verification. No production build was run for this focused UI pass.
- Existing Next dev `useId` hydration mismatch remains visible on Home/Explore in development, matching the prior recorded finding; it was not introduced or changed here. The prior clean production build/browser check had no hydration errors.

### Next Exact Steps

1. Continue the detached source-only replay using the PID/log above; do not launch a duplicate while PID `286397` is alive, reread/re-fetch completed snapshots, or run a full producer build before its completeness gate passes.
2. On completion, inspect the new replay log and source status once. If complete and non-stale, run the full producer in a new isolated output directory and perform the existing completeness/uniqueness/endpoint/digest review before any promotion.
3. If resuming the website task later, test a resolved package-detail slug and optionally run a static production build; do not repeat the responsive checks already recorded above.

### Decisions & Gotchas

- Mobile header growth is intentional: keeping all four primary destinations visible at 320px is preferable to hiding links behind an unmarked, 99px horizontal scroll viewport. Sticky offsets track the responsive header token.
- The interrupted skills.sh replay left reusable partial snapshots, not a promotable catalog. The detached resume runs without `--refresh`, so completed page snapshots are replayed locally; only missing URLs can trigger network requests. It is detached from the OpenCode-managed shell to avoid the same restart cancellation; its log/PID are kept in the untracked temp directory above.
- Repository state after the server restart: HEAD `7d96ca10c6a562c9f2b598f2733854710e86e753` (author/committer `sarvesh`, 2026-10-09 09:07:50Z) equals `origin/main`; that commit includes the website UI fixes, producer changes, and CLI sandbox. This session did not create the commit and must not reset/amend/revert it.
- This session's remaining worktree changes are `CURRENT_RUN.md` plus untracked `.opencode/` (leave untouched) and `tmp-catalog-replay-20261010/` (detached producer PID/log). Nothing is staged. Producer-owned `web/data/*`, the pre-session stash, and the CLI sandbox remain preserved; do not stage, commit, push, or publish further work.

## Live Origin and Homepage Navigation Check (2026-10-10)

### Active Goal

Answer whether the Workers URL is the live marketplace, reproduce the reported dead-click behavior, and report current catalog-release blockers. Do not publish/promote or change producer-owned data.

### Where We Stopped

- `https://litespm.sarveshbh-2022.workers.dev/?whys` serves the LiteSPM homepage; `/v1/current.json` returned HTTP 200. The `?whys` suffix is an extra query string, not a separate site or a reason for the page to fail; the canonical URL is `https://litespm.sarveshbh-2022.workers.dev/`.
- Reproduced a homepage-only navigation defect in the deployed browser: clicks on the homepage header Explore/Agents/Search links, the Explore CTA, and a homepage package card did not leave `/`. A fresh live-site tab reproduces it; the Next Link handler prevents native navigation, but the App Router does not update history or issue a click-time route request. No browser console errors were observed. This remains live-only: current-source builds pass the same navigation checks (details below).
- Cross-checks: direct navigation to `/explore/` worked; entering `postgres` loaded `/data/catalog.json` (HTTP 200) and returned 82 matches; clicking a result opened its package page; theme toggle worked; header Explore navigation from that package page worked. Thus the live origin and routes/data are available, but homepage client navigation is broken. Directly entering `/explore/` is a temporary workaround.
- The live page reports 5,825 capabilities, matching the existing served release (`rel-2026-10-07-01`, sequence 145) recorded above. This is the currently deployed catalog, not the in-progress rebuild.
- Detached source-only replay remains alive as PID `286397`; latest log tail reached 14,000/19,792 skills.sh records, with no completion result yet. Log: `tmp-catalog-replay-20261010/producer.log`. Production catalog/release/pointer were not touched.

### Next Exact Steps

1. Continue to check PID `286397` before any resume; wait for completion and require a complete, non-stale skills.sh pass before running the isolated full producer.
2. Homepage diagnosis is complete — see "Root Cause Confirmed (2026-10-11)" below: the live origin serves the pre-fix build (Next 15.1.7 era); the current source already contains the fix, so the remedy is a redeploy of the current build. Do not deploy or publish during the blocked catalog workflow; revisit deployment only after the catalog gate and explicit authorization.
3. Resume the release workflow only after all existing completeness, uniqueness, endpoint-safety, digest, and release checks pass. Do not stage, commit, push, publish, or promote pending user authorization and the release gate.

### Decisions & Gotchas

- The extra `?whys` query is not the navigation failure. Do not tell the user that removing it fixes clicks.
- Route availability and homepage client-side navigation are separate: direct route loads and navigation from non-home pages worked during the probe, while links originating on the homepage did not.
- Triage disproved a bad Worker RSC payload (the `/explore/index.txt?_rsc=...` response is valid Flight data with HTTP 200) and a custom homepage click handler; direct native navigation works. Current-source static build (`NEXT_TELEMETRY_DISABLED=1 npm run build`, isolated under `/tmp/opencode/litespm-home-nav-current-20261010`) passed: homepage Explore navigation and a package-card click both worked with zero browser errors. The same built assets also passed homepage Explore navigation under a local Wrangler 4.107.0 Workers Static Assets preview (`not_found_handling = "404-page"`; only the >25 MiB catalog JSON was omitted for preview). The live HTML/build ID and asset hashes differ from that fresh build, and the live-only failure reproduces in a fresh tab; exact deployed artifact/config cause is not proven.
- User rejected the proposed homepage-only native-link fallback; do not implement it. Do not make speculative product-code changes. Fixing the live origin requires a deployment-side change, which remains blocked by the catalog/release constraint.
- No application source, deployed artifact, or catalog data was modified. Temporary local preview servers were stopped; preserve the active producer, `.opencode/`, and temp replay directory.

### Root Cause Confirmed (2026-10-11)

- **The live origin serves a pre-fix build.** An isolated rebuild of `57a5ff9` (last pre-`29643c3` commit; Next 15.1.7) reproduces the deployed pages: framework/hook chunks match live by content hash (`126.bfa2c423fb7b3105.js`, `117`, `702`, `4bd1b696`, `517`, `polyfills`); the entry chunks differ only in internal webpack module IDs. Live is that revision, deployed with `rel-2026-10-07-01`.
- **Local reproduction, identical behavior**: home header-link click stays on `/` (idle does not help); typing in the hero search (loads `/data/catalog.json`) flushes the queued navigation to `/explore/`; `/explore/` clicks navigate client-side immediately; 0 console errors. Same signature measured on the live origin (dead click, idle 3s still dead, fill → flush; `/explore/` click client-side twice).
- **Mechanism**: pre-fix `web/lib/useCatalogSearch.ts` takes `listings = full ?? []` — a fresh array identity every render until the catalog loads. Its drive effect (deps `[listings, query, kind, category, mode]`, `mode === "worker"`, `workerRef.current === null`) hits the unguarded `!worker` branch and calls `setResults(searchInThread(...))` — a new array every pass — so it re-renders forever (measured 3,808–14,824 `Array.prototype.filter` calls per 500ms; the loop runs on both `/` and `/explore`). That perpetual default-priority update stream starves App Router transitions on the homepage: the Link click is default-prevented, `router.push` dispatches, but nothing commits — no history update, no RSC fetch, no error. The homepage is the visible victim (largest per-iteration render work, ~4× `/explore`); `/explore` and other routes still commit navigation.
- **Fix already in the repo**: `7d96ca1` added `EMPTY_LISTINGS` identity normalization (`web/lib/useCatalogSearch.ts:71,85`) and the missing `lastKeyRef` guard in the `!worker` branch (lines 200-201); `git log -S EMPTY_LISTINGS` confirms. Post-fix builds (Oct 8 export and the current-source isolated build) navigate on `/` with zero errors.
- **Remedy = redeploy the current build.** No source change is needed for this defect; do not deploy during the blocked catalog workflow (no publish/promote).

## Full-Repository Read (2026-10-11)

### Active Goal

"Read all files, folders, all lines, first to last." Read-only reconnaissance of the whole tree: no edits, no builds, no stage/commit/push/publish. Seven parallel read-only readers covered disjoint slices (cmd/, internal/ in three groups, web/, scripts+fixtures+schemas+test+npm+CI, and docs/ARCH).

### Where We Stopped

- Coverage: 702 tracked files; ~534 files / ~108.5k lines of code, config and docs read line-by-line (data blobs and the tracked CLI sandbox were characterized by structure/size only; 39 ARCH docs read head + heading map + targeted sections because the reader truncates long table cells).
- Verified repo state (observed, not reported): HEAD `7d96ca1` == `origin/main`; dirty set is `CURRENT_RUN.md` (modified) plus untracked `.opencode/` and `tmp-catalog-replay-20261010/`. Live pointer `https://litespm.sarveshbh-2022.workers.dev/v1/current.json` still returns `rel-2026-10-07-01`, sequence 145, 5,825 items, `manifestDigest sha256:8b3ef60d…` (matches checked-in `web/public/v1/current.json`).
- **Producer PID `286397` is dead.** `tmp-catalog-replay-20261010/producer.log` (mtime Oct 10 19:30) ends at `skills.sh: 14500/19792 processed`; no `build_full_catalog` process exists. The source-only replay therefore stopped incomplete and the release gate is still unpassed. Durable `source-snapshots/` holds 20,893 recorded entries.
- Hygiene confirmed: `tmp-cli-sandbox-2026-10-08/` is **tracked** (168 files incl. an 18.5 MB `litespm` binary and `litespm-data/*`) and `git check-ignore` reports it **not ignored** — no `tmp-cli-sandbox-*/` rule exists.
- Previously reported defects REFUTED against current source (all remediated, with tests): `--materialize` release-identity reuse (`main.go:1348-1352` digest guard), MCP install policy-deny bypass (`install_mcp.go:573-627` per-host `{package.install, host.config.write}`), MCP approval host-target binding (`install_mcp.go:235-308` re-derives hosts only from the sealed plan and fails closed on empty), `install --workspace` (explicitly rejected), self-update download deadline (2 min), unbounded UI result cards + `aria-live` (24/48-row windows), dangling `aria-controls` (all six panels mounted), mobile 130px Categories track, and the unguarded `setResults` dead-link loop.
- Newly identified, source-derived (not runtime-reproduced): weak `receipts.VerifyChain` link check with dead code (`internal/receipts/receipts.go:230-262`); `manifest.BindingMode()` stub always `"managed"` (`internal/manifest/manifest.go:196-207`); artifact fetcher uses `ProxyFromEnvironment` while the catalog client sets `Proxy=nil`, so a configured proxy can bypass the SSRF checked-IP dial (`internal/artifact/fetcher.go:104`); `ContentDigest` computed but never re-verified (`internal/catalogbuild/compiler.go:110-114`, `verify.go`); non-reproducible CycloneDX SBOM; archive-install policy engine built with nil deny rules and no `HostID` (`main.go:1819`, `internal/install/engine.go:266-286`, currently unreachable); `config.RedactConfig` no-op; usage-exit drift (`skills *`, `restore`, several sub-switches exit 1 while every help page promises 2); `LPSM-ARTIFACT-UNAVAILABLE` maps to `-32603` instead of an enumerated code; bridge `tools.list`/`skills.*` read only `ScopeUser` installs; no JSON-Schema validator runs anywhere (4 schema-vs-actual drifts).

### Next Exact Steps

1. Do not start a second producer; the replay must be re-run from `source-snapshots/` (it replays offline and re-fetches only missing URLs) and must end with `CATALOG_INGESTION_STATUS` `complete` before any release cut.
2. Decide `tmp-cli-sandbox-2026-10-08/` ownership: it is committed scratch output; untrack it and add `tmp-cli-sandbox-*/` to `.gitignore` (requires explicit user authorization to rewrite the index).
3. Fix or consciously accept the source-derived defects above; each is small and local, none blocks the read-only recon.
4. The live homepage-navigation defect remains a deployment-side discrepancy, still blocked by the catalog workflow.

### Decisions & Gotchas

- Nothing was staged, committed, pushed, or published; no source, catalog data, snapshot, or sandbox file was modified. Only this handover section was appended.
- "Previously reported" defects are refuted against *current source with tests*, which is not the same as runtime reproduction by this pass; treat them as fixed-in-tree, not re-verified end to end.

## Catalog Replay Rerun + Defect Remediation (2026-10-11, later session)

### Active Goal

Re-run the `feed:skills-sh` replay that died mid-feed, and fix the 15 source-derived defects plus the doc drift from the full-repo read. Plan: `.slim/deepwork/catalog-rerun-and-defect-remediation.md`.

### Where We Stopped

- **Producer replay finished** (PID `9427` completed): all **19,792** `feed:skills-sh` rows taken,
  `0 fetch failures`, 19,794 snapshots promoted to `healthy`. It nevertheless printed
  `completeness: incomplete`, which the third pass below diagnosed and fixed at the source: the feed was
  never incomplete — 36 sitemap locs are `robots.txt`-disallowed `/api/git/…` paths the producer refuses
  by policy, and that refusal was being counted as a data gap. **The release gate is still unpassed**, but
  now for the honest reason: a source-scoped run reports `partial` by design, so the gate needs a full
  (all-source) run. No release was cut, promoted, or published.
- **All 15 defects fixed** plus the doc drift, by five parallel lanes and one bounded remediation pass; the full Go/Python/web gates are green (see Verification below). These changes were **committed and pushed afterwards** (`4df6928` plus the third-pass commits below).
- Two gate findings were fixed in the remediation pass and are worth knowing:
  - the first cut of the deny-`targetRef` fix *failed open* for existing listing-id rules; `PolicyInput.TargetAliases` now carries the host entry name beside the canonical `TargetRef`, so a rule keyed on either refuses;
  - the new `internal/schemacheck` contract test failed on a clean checkout (it read the gitignored `web/public/v1/releases/`); it now skips with that reason, and `host.EntryLayout` became the scope-aware `host.EntryLayoutForScope`.
- **Defect 9 option (a) was then implemented** (2026-10-11, second follow-up): project-scope installs are
  first-class. `litespm install --workspace <dir>` (implies `--scope project`; the CWD is the default) and
  `resolver.prepare_plan`'s required `projectRoot` seal `request.workspaceId` + `request.projectRoot` into
  the plan, which the plan hash covers — so an approval binds the workspace. Records and host registrations
  carry the workspace, the approval prompt names it, and the bridge forwards its project root so
  `list_installed`/`load_skill`/`read_skill_resource` include that workspace's project-scope installs, each
  row labelled with its `scope`. The root is a *selection* key, not an authorization boundary (same-uid IPC
  peer auth is), and the daemon refuses a workspace-less project plan (`-32602`) rather than resolving it
  against its own working directory.
- Other deliberate, documented decisions: receipt-chain verification does **not** detect a truncated tail
  (documented, needs an external anchor); PURLs are **not** emitted in SBOMs (no ecosystem coordinate
  exists — inventing one is forbidden).
- Deferred `internal/` follow-ups reported by the lanes, not implemented: `install.InstallOptions.HostID` (the archive path still cannot enforce per-host deny rules), `skills.PolicyRequest` has no listing id, and an IPC workspace channel for the bridge-scope option (a).

### Next Exact Steps

1. **The defect remediation and its follow-ups are committed and pushed** (`4df6928`, then the third-pass commits). The tree is clean apart from ignored scratch. Do not re-litigate the fixes; they are gated by the suite below.
2. **Release gate:** after the producer classification fix, run the **full** producer (no `--only-source`) in replay mode into an isolated output and require `CATALOG_INGESTION_STATUS` `complete` (it now reports `refusedLocs` for the skills.sh `/api/…` refusals instead of `incompleteSources`). The deliberately bounded `feed:mcpmarket-com` crawl is the remaining question — it is incomplete by design at the 2,000-page budget, so either raise `MCPMARKET_MAX_PAGE_FETCHES` for one uncapped crawl or accept a documented bounded-partial before cutting. Then cut and verify the release, and re-check `web/data` vs the pointer.
3. `tmp-cli-sandbox-2026-10-08/` was untracked in the hygiene commit (files left on disk) and `tmp-cli-sandbox-*/`, `tmp-catalog-*/`, `.opencode/` are ignored now.
4. The committed 46,166-row `web/data/catalog.json` still does not match the 5,825-item published pointer; that incoherence is only resolved by a deliberate release cut from a complete dataset.

### Decisions & Gotchas

- **Verification actually run this session** (orchestrator, after the remediation pass): `gofmt -l .` empty; `go vet ./...` clean; `go build ./...` clean; `go test ./... -count=1` ok for **all 44 packages** (including `test/` and the previously failing `TestCatalogRelease_EndToEnd`); `cd web && npx tsc --noEmit` clean; `python3 -m py_compile scripts/*.py`, `bash -n scripts/*.sh`, `node --check` on both npm entry points; `build_full_catalog.py --check`; `snapshot_store.py` self-test (50), `test_snapshot_lifecycle.py` (23), `test_catalog_ingestion_safety.py` (31), `test_remote_endpoints.py` (77), `test_skill_promotion.py` (221), `test_mcpmarket_source.py` (105); `cd npm && npm test`; `go run scripts/gen_hosts_ts.go` reproduced `web/data/hosts.json` + `skill-targets.json` byte-identically.
- The `--materialize` identity guard, the MCP deny-rules path, the approval host-binding, `install --workspace`, the self-update deadline, and the four UI defects reported earlier were already fixed at `7d96ca1`; they were NOT re-fixed, only re-confirmed by reading the code and its tests.
- Schema direction taken (defect 6): the schemas now **mirror the artifacts the code emits** (code is the contract), and `internal/schemacheck` is a dependency-free draft-2020-12 subset validator that *rejects any keyword it does not implement*; its tests reproduce each pre-fix failure.

## Producer Release-Gate Fix + Project-Scope Workspaces (2026-10-11, third pass)

### Active Goal

Two follow-ups the user asked for after the remediation was pushed: make the `feed:skills-sh` replay
actually reach a complete ingestion state, and implement "option (a)" from the defect-9 decision —
carry a project/workspace through IPC and the bridge so agents can see project-scope installs.

### Where We Stopped

- **Producer gate (fixed at the source).** `scripts/build_full_catalog.py` counted a loc it refuses by
  our own crawl policy as evidence of an incomplete source, so `CATALOG_INGESTION_STATUS` could never
  read `complete` for a feed that had in fact delivered all 19,792 rows. Diagnosed offline against the
  recorded sitemaps (2 sub-sitemaps, 20,000 locs, exactly 36 offenders, all `robots.txt`-disallowed
  `www.skills.sh/api/git/…`; 19,792 + 172 duplicate ids + 36 refused = 20,000). New
  `_skills_sh_path_refusal` + `_is_policy_refused_listing_url` classify a policy-refused loc into
  `refusedLocs` (reported in the status line and the summary), while a foreign host, a cleartext URL or
  an undefined path still marks the source incomplete. `scripts/test_skill_promotion.py` 221 → **232
  checks** (unit checks plus two end-to-end runs: a positive control and a negative control).
- **Project scope is now real.** `litespm install --workspace <dir>` (implies `--scope project`; CWD
  default) and `resolver.prepare_plan`'s required `projectRoot` seal `request.workspaceId`
  (`ws_` + 16 hex of `sha256(abs root)`, `internal/domain/workspace.go`) and `request.projectRoot` into
  the plan — inside the plan hash, so the approval binds the workspace. `install.execute` re-derives the
  root from the sealed plan; install rows and host registrations carry the workspace; the approval
  prompt prints `project : <root> (<ws>)`; the bridge forwards its project root so `list_installed`,
  `load_skill` and `read_skill_resource` union user-scope rows with that workspace's project-scope rows,
  each labelled with its `scope`. A workspace-less project plan is refused (`-32602`) rather than
  resolved against the daemon's working directory.
- **Deliberate query change:** `state.ListInstalls(ScopeProject, "")` now means "every workspace" (it
  previously matched only rows with an empty `workspace_id`), because project rows now carry a real id
  and `litespm list`/`inventory` is machine-wide; `list --project <dir>` still filters by `ProjectRoot`.
- Verification: `gofmt -l .` empty, `go vet ./...` clean, `go build ./...` clean, `go test ./... -count=1`
  **ok for all 44 packages**, `npx tsc --noEmit` clean, Python 50/23/31/77/232/105 checks + producer
  `--check` + `py_compile`, `gen_hosts_ts.go` byte-identical, `npm test` pass.
- **A security review of the workspace feature found two defects in its write half, both fixed.**
  (1) The sealed root only stamped state: the host-config write still resolved its target from the
  process's working directory (data-driven targets) or ignored the scope entirely (the six bespoke
  adapters), so a project install could record one project and write another's file — or a user
  config under a project label. The root now rides through `host.EntryInstallOptions` and every
  scope-aware reader (`ListServerEntries`, `ListServerEntriesWithValues`, `ReadServerEntryState`,
  `EntryFingerprintNow`, `RemoveServerEntry`), so install/reconcile/remove/restore/copy open the
  same file; `host.SupportsProjectScope` refuses a project install for a host with no documented
  project path, at plan time (before the approval is spent) and again at write time. (2) Both
  teardown paths deleted host registrations with a hard-coded empty workspace id, which silently
  matched nothing once project rows carried a real one — the row outlived the install. Removal now
  deletes each row with the workspace it was written under, and reconcile reads a project node's
  fingerprint from the project's own config (it used to observe "missing" and skip the strip
  entirely). The reviewer confirmed the rest: the plan binding is real, no client-supplied root
  reaches a write, consume/refund are untouched, the IPC peer is kernel-authenticated same-uid, and
  the read tools never touch the supplied path. Pinned by `TestProjectScopeWriteBindsToTheNamedProject`,
  `TestProjectScopeRefusesHostsWithoutAProjectPath` and
  `TestRemoveProjectInstallDropsItsHostRegistration`.

### Next Exact Steps

1. ~~Run the full producer~~ **Done** (2026-10-11, fourth pass): 69,376 rows, and
   `CATALOG_INGESTION_STATUS` reads `incompleteSources: ["feed:mcpmarket-com"]` with
   `refusedLocs: {"feed:skills-sh": 36}` — six of seven sources are complete and skills.sh is no longer
   one of the failures. **The remaining decision is real and unmade:** cap mcpmarket and publish with a
   documented gap, or spend one uncapped crawl (`MCPMARKET_MAX_PAGE_FETCHES`) to close it.
2. Publish nothing until that decision is made. The 5,825-row `rel-2026-10-07-01` is still what the live
   origin serves; the new dataset is 69,376 rows with **25,401 installable MCP servers** (the published
   one has zero — every MCP/skill row there is `discovery_only`), so publishing it is what turns
   `litespm install <mcp>` from "always refused" into a working command. Proven locally, never published.
3. The three deferred `internal/` follow-ups remain open: `install.InstallOptions.HostID`,
   `skills.PolicyRequest` listing id, and nothing for defect 9 — it is implemented.

## Fourth pass — panel, agent centre, and the release gate (2026-10-11)

- **The full producer run completed** (2h05m, all 7 sources) writing `tmp-catalog-full-20261011/catalog.json`
  (51 MB, 69,376 rows). The skills.sh fix behaves exactly as designed. The new dataset also carries
  **25,401 `metadata_verified` MCP rows** from the official MCP Registry feed, against zero in the
  published release — that is the difference between an install that always fails and one that works.
- **End-to-end install proven locally, nothing published.** `litespm catalog build --dataset … --out …`
  produces a static release tree; serving it and pointing a sandbox at it with `LITESPM_REGISTRY_URL`
  syncs the new index. Then `install mcp:builtin:mcp-registry:com.00widget-00widget --host codex`
  wrote `[mcp_servers.00widget] url = "https://api.00widget.com/mcp"` into codex's config, `list`
  reported it `managed / user`, and `install remove` stripped exactly that entry leaving the bridge
  intact. This is the first working install in the project's history.
- **The Pi `/marketplace` panel was redesigned** for non-developers (see CHANGELOG): framed layout,
  columns that do not shift, colour from the host's `Theme` passed into the factory (semantic slots, no
  imports), `✔ added` / `add` / `not yet` states, and a detail band that says what Enter will do with the
  file it touches. The extension source moved to `internal/host/pi_extension.ts` behind `go:embed` so it
  is type-checked like the rest of the TypeScript. Verified with `tsc --strict` against the real pi
  0.80.10 types, a headless render at 84 and 52 columns, and Pi loading it clean.
- **The agent centre shipped**: `/agents/<id>/` for all 50 hosts (61 static routes, 104 kB First Load JS
  unchanged). The file card is the centrepiece — the real config path, the real bridge entry, and
  "This is the only file LiteSPM changes." Descriptions live in `web/lib/hostNotes.ts` with provenance
  per entry; an agent with no note shows registry facts and the verified configuration docs, never
  invented prose. `hosts.json` now publishes `projectScope`/`projectPath` for **43 of 50** adapters,
  emitted from `host.ProjectConfigPathFor`, so the site cannot advertise a project config the binary
  refuses.
- **Vendor-docs review** of all six bespoke adapters found seven discrepancies, six fixed (project scope
  for Claude Code/Codex/Grok/OpenCode/Pi, OpenCode's `mcp.servers` container, Cline's `CLINE_DIR`); the
  seventh (protocol negotiation) is what made OpenCode refuse the bridge, now fixed and confirmed live
  (`opencode mcp list` → `✓ litespm connected`).
- **Gotcha worth keeping:** `npm install --prefix <dir>` prunes packages reachable through symlinks in
  that directory's `node_modules`. A symlink into the user's global tree cost a deleted global `pi`
  (restored with `npm install -g @earendil-works/pi-coding-agent@0.80.10`). Use tsconfig `paths` to
  type-check against an installed package instead of symlinking it.

### Decisions & Gotchas

- The project root is a **selection key, not an authorization boundary**: the IPC peer is authenticated
  by kernel peer credentials (same uid) before the first request, and the four read tools only choose
  which database rows to read — they never read the filesystem at the supplied path. Do not "fix" this
  by adding path confinement; that would be security theatre over a same-uid socket.
- `scope=user` with a `projectRoot` is refused rather than ignored, because silently dropping it would
  return a plan the caller did not ask for.
- **A project-scope MCP install requires the host to document a project config file.** Claude Code is
  the exception that proves the rule was never policy: it opted in through
  `host.ProjectConfigPather` (`<root>/.mcp.json`, per code.claude.com/docs/en/mcp), so it now installs
  at project scope like the data-driven targets. Cline, Codex, Grok Build, OpenCode and Pi still refuse
  with `install it with --scope user`, because their adapters document only a user config path and
  ignore the scope argument — writing the user file under a project label would be a lie. The
  vendor-docs review of 2026-10-11 found several of them DO document a project file that LiteSPM does
  not write yet; that is adapter work, and `ProjectConfigPather` is the seam.
- Debugging tip that paid off: the producer's completeness verdict can be reproduced offline against the
  recorded sitemap snapshots (`snapshot_store.load_snapshot` + the same predicates), which is how the 36
  refusals were identified without another 33-minute crawl.

## Fifth pass — npm publish, the 25 MiB deploy failure, and platform fixes (2026-10-11/12)

- **npm: `litespm@0.4.0` is published.** `npm view litespm version` → `0.4.0`, so
  `npm install -g litespm` (the README's headline command) resolves for the first time. The package
  fetches its binary from `releases/download/v0.4.0/`, which the `v*` tag's workflow published first.
- **The site could not be redeployed, and the cause was Cloudflare's 25 MiB per-asset limit.**
  Reproduced, not guessed: `wrangler deploy --dry-run` failed with
  *"Asset too large … up to 25 MiB … listings.json with a size of 62.4 MiB"*. Going from 5,825 to
  69,376 rows put three files over it (listings 62 MiB, versions 32 MB, `/data/catalog.json` 52 MB).
  The clean-clone build passed, so the gitignored release tree was never the problem.
- **Decision: shard, not R2.** The release manifest was already a map of `file → {digest,size}`, so
  shards extend what exists; R2 would have added a second origin and an infra dependency to fix what
  is really "one file outgrew its limit". `internal/catalogbuild` splits a kind across
  `listings-NNNN.json` at ≤20 MiB, the client gathers/verifies/decodes them and persists the cache
  verbatim, and `contentDigest` still covers the ordered concatenation (so every byte is pinned twice).
  A release that fits in one shard keeps the historical name AND bytes. `ARCH/18` §2.1 records why
  this is a transport split and not the logical shard format §2 designs.
- **`rel-2026-10-11-02` (sequence 147) is LIVE**: pointer, 6 shards, and the site's own
  `catalog-NNNN.json` all serve from the Worker. Verified in a browser — the page shows 69,376
  capabilities / 48,418 MCP / 20,320 skills / `metadata_verified 26,803`, and `/agents/<id>/` pages
  render. A new sequence was needed because release ids are immutable and the tree changed.
- **Four platform defects fixed** (the macOS/Windows CI had been red since before this session):
  1. `skills.read_resource` denied with `filepath.IsAbs`, which on Windows is FALSE for
     `/etc/passwd` (no volume) — so a rooted path slipped the guard. Now `filepath.IsLocal`, which
     states the real contract ("stays inside the tree") and also covers `..`, empty and reserved
     names. **Security-relevant**: the join confined it anyway, so nothing escaped, but the check did
     not do what it claimed.
  2. Zed's adapter had a darwin branch writing `~/Library/Application Support/Zed/settings.json`;
     Zed's own docs say macOS uses `~/.config/zed/settings.json`, and the same row's `DetectPaths`
     looked in `.config/zed` — detection and write disagreed on macOS. Branch removed.
  3. `shortHome` joined with `filepath.Separator` only, so a forward-slash path never shortened on
     Windows. It is a display helper; it now accepts both separators.
  4. The test sandbox did not pin `LOCALAPPDATA`, so Crush resolved to the runner's REAL
     `%LOCALAPPDATA%\crush\crush.json` — outside the sandbox. Pinned, along with `CLINE_DIR`,
     `CRUSH_GLOBAL_CONFIG` and `GEMINI_CLI_HOME`, so no per-host override can escape again.
- **Not a bug, worth remembering:** the footer reads "0 … capabilities" until you scroll to it.
  `CountUp` deliberately drops to 0 in `useLayoutEffect` and rolls up when an IntersectionObserver
  reports it visible (threshold 0.4). The prerendered HTML always carries the real number.
- **Verification run:** gofmt/vet/build clean, `go test ./...` all packages, `npx tsc --noEmit`,
  `deploy-pages.sh` (6 files verified byte-for-byte), `wrangler deploy --dry-run` (242 assets, largest
  exactly 20.0 MiB). CI: ubuntu + macOS + Static Checks + web build green at `27ac5b7`; the Windows
  fix (LOCALAPPDATA) was pushed after that run and is the one outstanding check.

## Agent-host descriptions, marks, and discontinued products (2026-10-13)

### What was asked

Three things, in order: (1) every agent host should carry a description and capabilities **read from that vendor's own documentation** — not assumed, not composed, because the site promotes those products; (2) each host should show its **own official logo** on the landing page and on individual agent pages; (3) confirm each host's **exact name from its own docs**. Then a follow-up: **remove vendors that have shut down** (Roo Code named explicitly) from the landing page, and **check whether any other host has shut down**.

### What changed

New modules:

- `web/lib/lifecycle.ts` — the vendors that have ended their product. Three entries, each quoting the vendor's own notice with a source URL. Drives the landing chooser, the atlas cards, the `/agents/` index filter, and the detail-page banner.
- `web/lib/vendorNames.ts` — the nine hosts whose registry row spells the name differently from the vendor. Display only; links and counts still use the registry string.
- `web/lib/brandLogos.ts` + `web/scripts/gen_brand_logos.mjs` + `web/data/brand-logos.json` — a generated manifest of what is actually on disk in `web/public/brands/`, plus each asset's aspect ratio, so the UI never requests a missing logo (a guaranteed 404 under `output: "export"`).
- `web/components/AgentLogo.tsx` — the mark in a fixed-light tile (vendor marks are drawn for light backgrounds; the site's dark mode would silently destroy them), with an `aria-hidden` wrapper because the name is always adjacent, and a neutral letter mark when there is no asset.

Changed: `web/lib/hostNotes.ts` grew from 11 to **49 sourced entries** (was 11), `web/lib/landing.ts` (chooser filters discontinued), `web/components/home/AgentStrip.tsx` and `AtlasTeaser.tsx` (marks; the atlas previously showed the *same* generic terminal icon on all five cards), `web/app/agents/AgentsView.tsx` (marks + vendor names), `web/app/agents/[id]/AgentDetailView.tsx` (mark in the header, discontinued banner, vendor-name line), `web/app/agents/[id]/page.tsx`, `web/app/agents/page.tsx` (filters discontinued at the data boundary so they never reach the browser), `web/package.json` (`gen:brands`, chained into `prebuild`), `.gitignore`.

Assets: `web/public/brands/` — 48 marks, 388 KB total.

### Verify the following yourself (all re-run at close)

- `cd web && ./node_modules/.bin/tsc --noEmit` → 0.
- `cd web && ./node_modules/.bin/next build` → 0; 60 static pages, 50 agent detail pages.
- Served the export and checked the rendered HTML, not just the build:
  - `/agents/` → **47 rows**; zero links to `roo`, `iflow-cli` or `rovodev`.
  - `/agents/{roo,iflow-cli,rovodev}/` → HTTP 200 **with** the Discontinued banner; a live host has none.
  - `/agents/{cortex,deepagents,codestudio}/` → `<h1>` reads **CoCo CLI**, **Deep Agents Code**, **Syncfusion MCP Server**.
  - Every brand asset 200s, and the landing page references five of them (the chooser chips).

### Findings worth keeping

- **Three vendors have ended the product**, all quoted from their own pages: **Roo Code** ("The Roo Code Extension was shut down on May 15th"), **iFlow CLI** (README shutdown notice dated 2026-04-17, already past), **Rovo Dev** (Atlassian: "reaching end of life as a standalone product… moving into eligible Jira subscriptions"). A broad sweep of all fifty summaries and source files for shutdown/sunset/EOL/archived/deprecated language found no others. `codebuddy` could not be checked — see the gap below.
- **Nine registry names are wrong**, found by reading the vendors' own pages: `Augment` → **Auggie CLI**, `Kimchi` → **Kimchi Coding**, `Mux (Xum)` → **Xum** (Mux is the retired pre-rename name), `Cortex Code` → **CoCo CLI**, `Deep Agents` → **Deep Agents Code**, `Code Studio` → **Syncfusion MCP Server**, plus three where the registry carries parenthetical plumbing suffix — `Grok Build (xAI Dev Tool)` → **Grok Build**, `Pi Agent (Terminal Agent)` → **Pi**, `GitHub Copilot CLI` → **GitHub Copilot**. The registry is generated from config adapters and is a poor source for a product's name.
- **`codebuddy` has no note and no mark.** `codebuddy.ai` resolves to **0.0.0.1** on this host — a DNS sinkhole — so every fetch fails at connect time. That is an environment fact, not evidence the product is gone. It renders the designed no-note fallback (registry facts + a link to its config docs).
- **`kode` legitimately has no mark**: its upstream publishes no square asset and its README hero is a wide banner. Letter mark, by design.
- **Two merge-script bugs cost real time; both are fixed.** (a) A block record omitted its `idx`, so `out.slice(0, undefined)` returned the whole string and the file doubled on every corrected entry — 171 lines in, 5013 out. (b) The key-quoting test accepted hyphens, emitting `github-copilot: {`, which parses as a subtraction. The merge tool lives at `.hostnotes-work/merge.mjs` and reads the research JSON beside it — both are **gitignored scratch**, present in this working tree only, so a fresh clone will not have them. Everything they produced is committed: the prose with its `source` URLs in `lib/hostNotes.ts`, the marks in `web/public/brands/`, the names in `lib/vendorNames.ts`, the ended products in `lib/lifecycle.ts`. If the merge is ever re-run, keep both guards.
- **The landing hero had a latent hydration mismatch.** Adding a `<p>` as a *sibling* before `SearchBar` shifted `useId()`'s tree position, so server and client emitted different ids for the search label and input — leaving the label pointing at nothing. Confirmed by A/B (revert = clean, restore = mismatch). The brief is now nested inside the existing paragraph as a block `<span>`: same copy, same look, no extra sibling. Verified clean afterwards.
- **Do not re-copy raw logo sources over `web/public/brands/`.** The gathered originals in `.hostnotes-work/logos/` are unoptimised (`codex.png` was 1024×1024 at 796 KB); re-vendoring overwrote the optimised copies once and it had to be redone. Resize to a 192 px cap and regenerate the manifest afterwards.

### Not done, deliberately

- **Nothing is committed.** The previous handover says not to stage, commit, push or promote, and that instruction was honoured: the change set is in the working tree only. `git status` is the record.
- The guarded `feed:skills-sh` replay, the producer completeness gate, and every defect in the sections above are **untouched** and still open.

### Next steps

1. Review the working tree and decide whether to commit; nothing is staged.
2. `codebuddy`: re-run its research from a host that can resolve `codebuddy.ai` (or via a proxy), then `node .hostnotes-work/merge.mjs`.
3. If any vendor in `hostNotes.ts` is ever reported as discontinued, add it to `lib/lifecycle.ts` — the landing chooser, atlas, index and detail banner all key off that file, so it is a one-entry change.
