# LiteSPM — Audit Remediation Backlog

A prioritized, actionable list of everything the November 2026 security/correctness audit found to upgrade, edit, or fix.

- **Audit baseline:** commit `318e421` (cloned from `https://github.com/sarv-projects/LiteSPM`).
- **Method:** four adversarial deep-dives (Go core, artifact/exec path, secrets/IPC/update, web+npm+worker+CI) plus an end-to-end attack on the catalog client. Every finding was either reproduced with a probe or is explicitly marked SUSPECTED.
- **Raw evidence:** probe sources and outputs were collected under `/tmp/audit/` (`mine/`, `secrets-ipc/`, `artifact-exec/`, `web-supplychain/`) during the audit session.
- **Status markers:** `[FIXED]` = changed in this branch (or, where a row names one, on that branch/PR); `[OPEN]` = still to do; `[DECISION]` = needs a product call before code; `[ACTION]` = a human must do it (console/UI access, not code).

---

## 0. Status of this change set

| Item | State |
|------|-------|
| F1 catalog cache escape | `[FIXED]` — `internal/catalog/client.go` (shard-name validation + containment guard) and a regression test in `internal/catalog/shard_name_test.go` |
| F2 published bundle + missing `cosign` installed anyway | `[FIXED]` — `cmd/litespm/main.go` `verifyDownloadedUpdate` now fails closed |
| F3 `host.apply_setup` wrote a caller-chosen binary | `[FIXED]` — `cmd/litespm/main.go` (`resolveRequestedBinaryPath`), test updated in `cmd/litespm/main_test.go` |
| F4 three live Groq keys committed | `[FIXED]` in code (keys deleted, scanner text corrected) — **`[ACTION]` rotate them in the Groq console; deleting the code does not revoke them** |

**Behaviour changes to be aware of (intentional):**

1. A release that *publishes* a signature bundle is verified in-process with `sigstore-go`; end users do not need the `cosign` executable. A present bundle that is invalid or cannot be verified aborts. A missing bundle is refused by default; only `LITESPM_ALLOW_UNSIGNED_RELEASE=1` explicitly permits checksum-only verification for pre-signing releases. `cosign` remains a release-workflow signing tool, not a self-update runtime dependency.
2. `host.apply_setup` no longer accepts a `binaryPath` other than the running binary. Callers that legitimately passed a path must pass nothing.
3. A catalog manifest naming anything other than `<base>.json` / `<base>-NNNN.json` is now refused as a whole, instead of the invalid entry being skipped.

---

## 1. Fix now (High)

### F1 `[FIXED]` — Catalog sync could write files anywhere the user can write

- **Where:** `internal/catalog/client.go` — `releaseShardNames` (was line ~690) and the cache-write loop in `Sync` (was line ~976).
- **What was wrong:** the manifest's file names were accepted on a bare `listings-`/`versions-` prefix and then joined into a path with `filepath.Join(releaseDir, file.name)`. A name like `listings-../../../../../../victim.txt` satisfied the prefix test, `filepath.Join` resolved the traversal, and `writeAtomicFile` created parents and renamed over the target. Reproduced: `Sync` reported success and overwrote a file outside the cache directory.
- **Amplifier:** every call site passes `paths.DataRoot` as the cache root (e.g. `cmd/litespm/main.go` `runSearch`, `runCatalogSync`), so the escape starts inside LiteSPM's own state directory.
- **Fix shipped:** `releaseShardName` accepts exactly `<base>.json` or `<base>-NNNN.json` (4+ digits); `releaseShardNames` refuses the manifest if any prefixed entry is not a valid shard name; `pathWithinDir` is a second lexical containment gate immediately before the write.
- **Regression test:** `TestReleaseShardName`, `TestPathWithinDir`, `TestSyncRefusesTraversingShardName` in `internal/catalog/shard_name_test.go`.
- **Related (same defect class), still `[OPEN]`:**
  - `internal/update/updater.go` already screens file names (`filepath.Base(name) != name`) — keep that and add the same shard-name/traversal test coverage there.
  - `internal/catalogbuild/verify.go` (`VerifyMaterializedTree`, the packaging gate) does not validate manifest file-name shape. Add the same rule so a hostile tree fails packaging, not just syncing.
  - `internal/catalogbuild/compiler.go` (`manifestShards`) uses the same bare-prefix rule to *count* generated names; it is fed only by the generator today, so no injection path — but keep the two rules in sync if names ever change.

### F2 `[FIXED]` — A published signature was not actually required

- **Where:** `cmd/litespm/main.go` `verifyDownloadedUpdate` and `internal/trust/blob.go` (`BlobVerifier`).
- **What was wrong:** the original updater treated an unavailable signature verifier as a warning and could continue on checksum-only verification even when a bundle was published. That violated the fail-closed promise in `SECURITY.md`.
- **Fix shipped:** the updater now uses `sigstore-go` in-process. A published bundle that fails verification or cannot be verified is fatal; a release with no bundle is refused by default. Only `LITESPM_ALLOW_UNSIGNED_RELEASE=1` explicitly permits checksum-only verification for pre-signing releases. The end user does not need a separate `cosign` executable.
- **`[DECISION]` Catalog signature absence remains a separate policy choice:** `internal/catalog/client.go` also uses `trust.BlobVerifier` in-process. A published bundle that fails verification is always fatal, but an origin that publishes no bundle may proceed on the digest chain unless `LITESPM_REQUIRE_CATALOG_SIGNATURE=1` is set. Decide whether unsigned catalog pointers should remain compatible by default or become a hard refusal; this is unrelated to installing Cosign.

### F3 `[FIXED]` — `host.apply_setup` bypassed the plan/approval machinery

- **Where:** `cmd/litespm/main.go`, handler `host.apply_setup` (was line ~3622) and the new helper `resolveRequestedBinaryPath` (line ~650).
- **What was wrong:** the handler took `binaryPath` verbatim from the IPC caller and wrote it into the agent host's config as the command the host executes. Any same-uid process (including a shell a prompt-injected agent runs) could reach the socket. No plan, no approval, no audit row — unlike `install.execute` next door.
- **Fix shipped:** empty `binaryPath` means the running binary; a non-empty one must be the same file as `os.Executable()` (compared with `os.SameFile`, so symlinks and alternate spellings still pass) or the call is refused with `-32602`.
- **Test:** the success path in `TestHostApplySetup_RealBehavior` no longer sends a foreign path, and a new subtest asserts the refusal and that no config file is written.
- **Related `[OPEN]` hardening:** `internal/host/*` adapters still write host configs without a plan/approval binding when reached through other RPC handlers (`host.remove`-style paths are lower-risk because they remove rather than add execution). Sweep every handler that names a program or URL written into an agent config and give it either a plan binding or the same "must be the running binary" rule. See §3 S1 for the read-back side.

### F4 `[FIXED]` + `[ACTION]` — Three live Groq API keys were committed

- **Where:** `web/src/server/llm/gateway.ts`, `collectKeys` (was lines 120-132), encoded as character-code arrays to dodge the repo's own scanner; the scanner's comments (`web/scripts/check-no-embedded-secrets.mjs`) explicitly whitelisted that form.
- **Evidence:** all three keys answered `HTTP 200` on `GET https://api.groq.com/openai/v1/models` during the audit (no completions were run). The route is server-only, but the repository is public, so the keys are public.
- **Fix shipped:** the fallback block is deleted; the scanner's header/message now say the opposite of the old allowance. Deployment must supply `GROQ_API_KEY` (or `GROQ_API_KEY_1..N`).
- **`[ACTION]` Rotate all three keys in the Groq console** — removing them from source does not revoke them. Until rotation, anyone holding the old values can spend the demo quota and impersonate the project.
- **`[OPEN]` follow-ups:**
  - Extend `web/scripts/check-no-embedded-secrets.mjs` to flag suspicious `String.fromCharCode(...)` arrays (human review is what covers it today) — or add a linter rule that forbids `fromCharCode` with >16 numeric elements in `web/src/server/**`.
  - Add a `.env`-documented deploy requirement (`web/.env.example` should list `GROQ_API_KEY*` as required-for-demo, optional otherwise).
  - Trusted-publishing/pre-commit review: add a CI step that greps the *diff* for high-entropy strings in server directories.

---

## 2. Fix next (Medium)

### F5 `[FIXED]` — Vault has no cross-process locking; revocation can be undone

- **Where:** `internal/secrets/vault_file.go` (whole-file snapshot writes, ~lines 111-140).
- **What's wrong:** two writers that load → mutate → save lose one update (last writer wins), and a writer holding a stale snapshot **resurrects a credential that was just purged**, so `litespm auth logout` revocation does not stick while another process is mid-operation.
- **Fix:** take `internal/fslock` around load-mutate-save (the package already exists and is used for the daemon lock), and make the vault write path re-read-and-merge rather than blind-overwrite. Add a test that spawns two writers, one deleting and one adding, and asserts the delete survives.
- **Fixed:** `dd66bee` — `mutate()` takes `fslock` around load-mutate-save and re-reads the on-disk map under the lock, so a concurrent delete and add both survive. Tests `TestVaultConcurrentDeleteSurvivesAdd` and `TestVaultStaleSnapshotDoesNotResurrectDeletedSecret` — both failed against the old code (`concurrent add was lost`, `stale snapshot resurrected the deleted credential`; the concurrent test failed 5 of 5 runs, structurally). The constructor's single read stays lock-free (reads are atomic against tmp+rename publication), `Delete` now checks existence against the freshly read file, and a corrupt file aborts a mutation instead of being overwritten.

### F6 `[FIXED]` — A transient keyring failure silently rotates the master key

- **Where:** `internal/secrets/store_linux.go` (~lines 21-45), same shape in `store_darwin.go` and `store_windows.go`.
- **What's wrong:** if the keyring read fails (locked keyring, D-Bus hiccup, headless session), the store treats it as "no key yet" and mints a new one. Every previously stored secret becomes permanently undecryptable, with no error surfaced at the time.
- **Fix:** distinguish "no key stored" from "keyring unreachable": a failed read must abort the operation with a typed error (`LPSM-AUTH-VAULT-UNAVAILABLE` already exists), never create a replacement key. Only mint when the read succeeded and returned empty. Add unit coverage using a stubbed keyring that fails on read.
- **Fixed:** `2415df4` — all three keyring backends abort with `LPSM-AUTH-VAULT-UNAVAILABLE` on a failed read and never mint. Seams are the smallest possible (`keyringRead`/`keyringWrite` on Linux/macOS, `readMasterKeyFile` on Windows); the exit-code/stderr classification was checked against upstream sources (secret-tool prints a message only on real errors; `security` exits 44 only for `errSecItemNotFound`). `TestKeyringReadFailureMintsNoReplacementKey` in all three platform test files (plus corrupt/empty/valid variants); verified red by restoring the old decision logic behind the seams. Windows behaviour change of note: an existing but empty/short `master.key` now aborts instead of minting — a torn key file is data loss, not a first run.

### F7 `[FIXED]` — Archive extraction is not confined when the staging dir already holds a symlink

- **Where:** `internal/artifact/extractor.go` — zip leaf guard at ~250-255 (removes a pre-existing symlink), tar path at ~353-359 (no guard at all), shared writer `writeBoundedFile` at ~414-418 (`os.OpenFile` without `O_NOFOLLOW`/`O_EXCL`). Reproduced: writes through a pre-existing leaf symlink (tar) and through a symlinked parent directory (both formats).
- **Reachability today:** the in-tree callers pre-create private staging dirs (`internal/install/engine.go` `op_<rand>` with `0700`, `cmd/litespm/install_plugin.go` uses `os.MkdirTemp`), so this needs a local actor who can already write inside the staging dir. Grade: defense-in-depth, not currently exploitable remotely.
- **Fix:** add the missing `Lstat` symlink removal to the tar path; walk the parent chain component-by-component refusing symlinks (or open with `O_NOFOLLOW|O_EXCL` relative to a staging-dir fd); add a regression test that pre-plants both a leaf symlink and a symlinked parent for both archive formats.
- **Fixed:** `dd0b69e` — the tar path got the zip leaf-removal guard, and both paths now call `refuseSymlinkedParent()`, a component walk of the parent chain under the staging root (chosen over `O_NOFOLLOW|O_EXCL`: portable to the Windows build, and `O_EXCL` would break archives that list a name twice). `TestExtractRefusesPlantedSymlinks` (zip/tar × leaf/parent) — three of the four subtests fail against the old code. Residual: the walk is check-then-use, so a local actor able to race writes inside the private staging dir keeps the same TOCTOU window every existing guard on this path has.

### F8 `[FIXED]` — Catalog `command`/`args` are interpolated into the copy-paste config snippet unescaped

- **Where:** `web/src/server/litespm/type-specs.ts` (~lines 141-146) builds `command = "${command}"` / `args = ["${arg}", …]` for the TOML snippet shown to users by `web/src/components/litespm/views/package-detail.tsx` (~723-734, copy button). Demonstrated: a catalog row containing a quote + newline injects a whole extra `[mcp_servers.*]` block that users paste into their agent config.
- **Current data is clean** (0 of 69,376 rows carry quotes/backslashes/newlines in `command`/`args`), but nothing downstream *enforces* that: the guard is the producer alone, and the web dataset loader applies no charset check.
- **Fix:** escape per target format (`JSON.stringify` for JSON, a real TOML string escaper for TOML: backslash, quote, control chars), reject control characters outright, and validate `command`/`args` shape at dataset load time in `web/src/server/litespm/dataset.ts` (allowlist `[A-Za-z0-9._/@:=+~-]` per token, matching the id grammar already enforced in `scripts/build_full_catalog.py`). Also fix the `litespm install ${hit.id}` interpolation in `marketplace.tsx` (~104) to use the same `shellArg` helper as `package-detail.tsx` (~144).
- **Fixed:** `3a961bf` — new dependency-free `web/src/server/litespm/config-snippet.ts` (JSON via `JSON.stringify`; a real TOML string escaper for `\b \t \n \f \r \uXXXX`; any other control character refuses the snippet outright), used by `type-specs.ts`; the dataset loader validates `command`/`args` against the producer token grammar and withholds the snippet for a non-conforming row (fail-closed for the snippet only — browse/search keep working, one warning logged); `marketplace.tsx` uses the shared `shellArg` helper (`web/src/lib/litespm/shell.ts`). Gate: `web/scripts/check-web-hardening.mjs` executes the module with the repo's `typescript` and pins the audit's exact injection demo (no second TOML table header), control-character refusal, valid tokens, and the JSON path; run by `npm run lint`.

### F9 `[FIXED]` — A tag push alone builds, signs and publishes a release

- **Where:** `.github/workflows/release.yml` — `on: push: tags: 'v*'` (lines 3-6).
- **What's wrong:** nothing verifies the tagged commit is on `main`, was reviewed, or passed CI before `cosign sign-blob` runs. Since the npm installer and the updater pin the signer to *this workflow on a version tag*, anyone with tag-push rights (or a compromised maintainer token) mints a release every installer accepts.
- **Fix:** add a tag ruleset for `v*`, require the tagged commit to be an ancestor of `main`, and gate the signing/publish job behind a protected GitHub Environment with required reviewers. Consider generating releases from a workflow_dispatch that takes an already-CI-green commit.
- **Fixed:** `48cf06f` — an early `verify-tag-on-main` job (`contents: read`) fetches `origin main` and refuses with `::error` unless `git merge-base --is-ancestor "$GITHUB_SHA" origin/main`; all four other jobs transitively `needs` it. Verified both ways locally (main tip passes; a throwaway commit off main refuses). Residual stated in-file: ancestry is not review and not green CI. `[ACTION]`: a `v*` tag ruleset remains recommended — repo rulesets: none today.

### F10 `[FIXED]` — Signing job holds write + OIDC while actions ride movable tags

- **Where:** `.github/workflows/release.yml` lines 8-13 (`permissions: contents: write`, `id-token: write`) with `sigstore/cosign-installer@v3`, `anchore/sbom-action@v0`, `softprops/action-gh-release@v2`, `actions/*@v4|v5`.
- **What's wrong:** a hijacked tag executes *before* signing with an OIDC token and a write token, and can sign arbitrary bytes under the project's identity.
- **Fix:** pin every action in this job to a commit SHA (Dependabot/Renovate can bump SHAs), grant `id-token: write` only to the signing step, keep build/test steps `contents: read`.
- **Fixed:** `01fe420` — top-level `permissions: contents: read`; build/test/packaging moved to a read-only `build` job whose artifacts hand off to `sign-and-release`, which alone holds `contents: write` + `id-token: write` and sits behind `environment: release`; `publish-npm` holds only `contents: read` + `id-token: write`. All 8 action refs pinned to commit SHAs, each resolved and re-verified through the GitHub API (e.g. `actions/checkout@11d5960a` v4.4.0, `sigstore/cosign-installer@7e8b541e` v3.10.1). Residual stated in-file: GitHub has no per-step permissions, so steps inside `sign-and-release` still run with its tokens — which is why nothing else lives there; SHA pins for `ci.yml`/`catalog-sync.yml` are follow-up. `[ACTION]`: the `release` environment needs required reviewers in repo settings (`GET /environments` → none today).

### F11 `[FIXED]` — `web/package-lock.json` lacks `integrity` for most entries

- **Where:** `web/package-lock.json` — 836 of 880 entries have no `integrity` hash, while CI builds with `npm ci`/`bun install --frozen-lockfile`.
- **Fix:** regenerate the lockfile with a modern npm (`npm install --package-lock-only` with npm ≥ 9 writes integrity for all entries; verify with a script that fails if any `node_modules/*` entry lacks `integrity`), then commit. Add that check to CI.
- **Fixed:** `e6c6786` — all 879 `node_modules/*` entries now carry `integrity`. `npm install --package-lock-only` refused to backfill (npm 10 answers "up to date") and full re-resolution moved 319 versions, so the 835 missing hashes were filled from `registry.npmjs.org` **for the already-pinned versions** (all sha512): the diff is 835 added lines with zero other field changes. Proof: a real `npm ci --ignore-scripts` installs 853 packages, exit 0, no EINTEGRITY. Gate: `scripts/check-web-lock-integrity.mjs` runs in the CI web job before bun installs (old lockfile: 835 failures; new: OK). `web/bun.lock` intentionally untouched (bun not available locally; bun reads the bun lockfile, npm reads this one).

### F12 `[FIXED]` — The daily catalog-sync job cannot succeed and pushes upstream data unreviewed

- **Where:** `.github/workflows/catalog-sync.yml` — `go-version: '1.24'` (vs `go.mod` 1.26), `git add data/ web/public/v1/ web/src/` (there is no `data/` directory), and the failure point is "Verify Web Build". The job has **never** succeeded; its commit step pushes directly to `main`.
- **Fix:** set the Go version from `go.mod`, drop `data/` and `web/src/` from the add list (the producers write JSON only — keep it that way and assert it), fix the web-build step (it needs `prisma generate` first — see §4), and open a PR instead of pushing to `main` so a human sees each daily data change.
- **Fixed:** `32ff722` — `go-version-file: go.mod`; `prisma generate` runs before the build check; the staged set is exactly `web/data/` + `web/public/v1/` with a guard that refuses and names any staged path outside the allowlist; the direct push to `main` is replaced by a dated `catalog-sync/<date>` branch + `gh pr create` whose body carries the counts/release/digest summary (same-day re-run refreshes the branch and edits the PR). Evidence: both new scripts were extracted from the YAML and executed against a scratch clone with a local bare remote and a stubbed `gh` — 24/24 checks. Residual `[ACTION]`: repo setting `can_approve_pull_request_reviews: false` — GitHub Actions cannot open PRs until that is enabled or a `CATALOG_SYNC_TOKEN` secret (contents + PR write) is set; the step fails loudly naming the setting (`peter-evans/create-pull-request` uses the same token and does not bypass it, so it was deliberately not added).

**Note — workflow files pending a scoped push:** F9, F10 and F12 live entirely in `.github/workflows/*`, and F11's gate is wired there too (`ci.yml` runs `scripts/check-web-lock-integrity.mjs`). The agent's push credential is a `gho_` OAuth token with scopes `read:org, repo`; GitHub refuses workflow-file writes from it — verbatim on push: `refusing to allow an OAuth App to create or update workflow '.github/workflows/catalog-sync.yml' without 'workflow' scope` — and the REST Contents API masks the same refusal as `404` (control write to the same scratch branch succeeded; branch deleted, no trace). So those three files are fixed in source but **not pushed**: they are held on local branch `forge/workflow-fixes` (tip `32ff722`, base `f77a3a3`, worktree `LiteSPM-wf`) and archived — patch series, `git bundle`, prepared PR body — in `/home/forge/workspaces/wf-fixes-artifacts`, with a one-shot push+PR script (`sh /home/forge/workspaces/wf-fixes-artifacts/wf-open-pr.sh`) for when a `workflow`-scoped credential exists (`gh auth refresh -h github.com -s workflow`, a PAT with `workflow`, or a maintainer's key). Everything else in this change set is pushed in PR #14. Until then `main` keeps the original workflows: treat F9/F10/F12 and F11's CI wiring as fixed-in-source only.

### F13 `[FIXED]` — Rate-limit identity is client-controllable

- **Where:** `web/src/server/litespm/rate-limit.ts` (~lines 50-58) keys the limiter on the **leftmost** `x-forwarded-for` entry.
- **Why suspected:** if the edge preserves client-supplied XFF (typical on Vercel), rotating the header gives a fresh bucket and bypasses the 20-per-5-min assistant cap — which then spends the (formerly committed) Groq keys. Not demonstrable from the repo alone; needs a staging request with a spoofed header.
- **Fix:** use the platform-set value (rightmost hop, or `x-vercel-forwarded-for`), and add a per-instance global budget for LLM routes so a bypass cannot escalate spend.
- **Fixed:** `ad6dd9b` — the limiter keys on the platform-set hop: `x-vercel-forwarded-for` when present, otherwise the **rightmost** XFF entry, never the leftmost; and `globalBudget(scope, max, windowMs)` (sliding window, per instance) is enforced alongside the per-IP limit on the assistant route, returning 429 + `Retry-After` when exhausted, so a header bypass cannot escalate LLM spend. The hardening gate asserts the parsing rules with sample header sets (platform header, spoofed leftmost entry, bare XFF). The "does the edge preserve client XFF" question no longer matters: the client-controllable value is never used.

---

## 3. Hardening backlog (Low)

| ID | Where | What to do |
|----|-------|------------|
| L1 | `internal/ipc/transport_unix.go` | Close the bind→chmod window on the Unix socket (create with the mode applied, or `umask` around bind). Auth is enforced by `SO_PEERCRED`, so this is cosmetic today. |
| L2 | `internal/state/*` | `state.db` + WAL are `0644` inside a `0700` root. Set `0600` on DB, WAL and SHM for defense in depth. |
| L3 | `internal/config/*` | Data root and state file are opened by path and follow symlinks; the runtime root is lstat-hardened. Resolve once at startup and use `openat`-style access. |
| L4 | `internal/secrets/vault_file.go` | A read-only open does not repair a wrong mode; chmod on write is not re-checked on read. Repair mode on open where possible. |
| L5 | `web/package.json` | `@sigstore/*` are `^`-ranged, so the code that *decides verification* changes under the installer's feet. Pin exact versions; note `z-ai-web-dev-sdk` (`^0.0.18`, unrelated maintainers) receives prompts when no other key is configured — review or vendor it. |
| L6 | `internal/receipts/receipts.go` | The chain is unkeyed and `hashReceipt` omits `invocationId`, so IDs can be swapped without breaking `VerifyChain`, and `Open` never verifies. HMAC the projection with a daemon key, include `invocationId`, verify on `Open`, and anchor the head hash in the SQLite journal. |
| L7 | `cmd/litespm/capabilities.go` (~257-265) | `capabilities refresh` builds a run spec from the *host config file* and executes it without re-checking the recorded `EntryFingerprint` (checked in `list.go` and `lifecycle_wire.go`). Compare the fingerprint before probing. |
| L8 | `internal/source/mcp_registry.go` (~385-390) | `RuntimeDescriptor.Env` is populated from the remote registry and currently dropped on the host-config path. Add an assertion/comment so it stays dropped, or filter it through `provider.BuildChildEnv` if ever consumed — otherwise a catalog row can set `NODE_OPTIONS`/`LD_PRELOAD`/`PYTHONPATH`. |
| L9 | `npm/scripts/install-binary.js` (~1030-1047) | Temp file `${targetPath}.tmp.${Date.now()}` has no `O_EXCL`/`O_NOFOLLOW`; open with `wx`/`0o600` and rename. Also move redirect refusals out of the retryable-error class (~933-937). |
| L10 | `web/src/app/layout.tsx` / `next.config.ts` | No CSP, `frame-ancestors`, or `Referrer-Policy`. Add baseline headers; the renderer analysis found no injection sink today, so this is defense in depth. |
| L11 | `worker/index.js` | The 302 carries no HSTS/`X-Content-Type-Options`; `_headers` has `/data/*` stanzas this worker never serves. Tidy and add the headers. |
| L12 | `internal/artifact/extractor.go` (~155) | `ExtractArchiveSafelyWithLimits` ignores `limits.MaxArchiveSize` (only `ExtractFileSafely` enforces it). Enforce it for reader-based callers too. |
| L13 | `internal/artifact/extractor.go` (~383-411) | Backslash-containing names are accepted on Linux as literal filenames, so the tree digest differs from Windows. Reject backslashes uniformly for cross-OS determinism. |

---

## 4. Repository, CI and release-process items

| ID | State | Item |
|----|-------|------|
| R1 | `[FIXED]` | **CI was red on `main`** — 75 of the last 100 runs failed; last green 2026-10-24. Two independent causes: (a) the release-tree gate `litespm catalog build --materialize --prev web/public/v1/current.json` fails against the committed dataset (it passes at `0ea6141^`, so the drift arrived with the 69,376-row refresh — whose own commit message says 69,311); (b) the web type-check fails because the workflow never runs `prisma generate` (it passes locally after `bunx prisma generate`). Both are fixed on `forge/handoff-a` (PR #11): the committed `web/data/hosts.json` was regenerated from the authoritative registry and the web `type-check` script now runs `prisma generate` first. On that branch `Static Checks`, `Build Next.js`, all three Go-engine OS jobs and `release-journey` are green; the only remaining red check is the Cloudflare `Workers Builds` job, which is also red on `main`'s tip (`11eeccb`) and is unrelated to the repo's own gates. This branch carries the same two fixes (`bcc5b3e`) and merges `main` (`0b8651d`), so PR #10's merge ref no longer inherits either failure. **Update:** PRs #10–#13 are all merged; `main` (`f77a3a3`) is green on every job — including `windows-latest`, whose Go test also needed the assertion fix that PR #13's `7fcfaf8` carried. |
| R2 | `[OPEN]` | **The claimed release `rel-2026-11-05-03` was never deployed**: the live origin still serves `rel-2026-10-21-01`. Either deploy or mark the pointer as undeployed in `STATUS.md`; the current text says the release "is cut from the dataset", which the materialize failure contradicts. |
| R3 | `[OPEN]` | `STATUS.md`/`SECURITY.md` are otherwise unusually accurate — keep them that way: after fixing F2, the `SECURITY.md` line about published bundles becomes true; after F4 rotation, remove any claim that the demo ships fallback keys. |
| R4 | `[OPEN]` | The daily `catalog-sync.yml` job has **never** succeeded (see F12). Treat a permanently-red scheduled workflow as an incident, not background noise: add an alert when a scheduled job fails N times in a row. |
| R5 | `[OPEN]` | Repo hygiene: pushing warns that a single blob is 55.56 MB (the committed `web/data/catalog.json`, larger than GitHub's 50 MB recommendation). Consider sharding the committed catalog, Git LFS, or dropping the committed copy now that releases publish the tree — the cost is clone/push time, not secrecy (the site serves it publicly already). |

---

## 5. Optional architectural upgrades

1. **Vendor signature verification.** Replace the `cosign` exec with a Go Sigstore verifier (`sigstore-go` or an in-tree implementation of `verify-blob` semantics). Removes the class of "verifier unavailable ⇒ skipped check" bugs entirely (F2 and its catalog twin), and removes an exec dependency from the update path.
2. **TUF-style catalog envelope.** The catalog client comment notes a full TUF root/timestamp/snapshot envelope is "DESIGNED, not shipped". Shipping it would give the catalog the rollback/freeze protection the code comments currently approximate with sequence numbers.
3. **Keyed receipts.** L6's HMAC turns the receipt log from "internally consistent" into "tamper-evident against a local attacker".
4. **Single writer for host configs.** Route every host-config write (setup, install, remove, plugin) through one journalled writer with plan/approval binding, so F3's class of "a handler beside the gate" cannot recur.

---

## 6. What the audit verified as sound (do not regress)

Keep these properties covered by tests; they held under attack and are the project's strongest claims:

- **Approval pipeline:** plan-hash recomputation, expiry, single-use atomic consumption (`UPDATE … WHERE status='active' AND subject_hash=?` + `RowsAffected` check), human-cli-only approvals, no self-approval path, and execution bound to the sealed plan (no approve-benign/execute-malicious window).
- **Archive defence:** all 16 traversal forms refused in zip and tar; symlink/hardlink/device members refused; cumulative compression-ratio check before every write; modes never setuid/world-writable; declared-vs-produced size enforced both ways.
- **Execution safety:** no shell on any command path; child env restricted to an allowlist; secrets never resolved from `{file:…}`/`!cmd`; the archive-engine fallback fails closed.
- **IPC:** Unix socket `0600`, `SO_PEERCRED`/`LOCAL_PEERCRED` fail-closed same-uid check, 16 MiB + depth bounds, no client-controlled identity/approval-channel field.
- **Egress:** HTTPS-only, literal-IP pinned dial, loopback/link-local/metadata/private refused, no env proxy, redirect downgrade refused.
- **npm installer:** verification on by default, signer identity matched exactly (`^…$`, escaped), published-but-invalid refused even with `LITESPM_ALLOW_UNSIGNED_RELEASE=1`, HTTPS + host allowlist + redirect cap, no archive extraction, no shell.
- **Data claims:** 69,376 listings (48,418 / 20,320 / 638 by kind), 50 hosts (46 remote-capable), 81 skill targets, 13 bridge tools, producer id grammar enforced (`69,376/69,376` conform), no committed `.env`/private keys beyond F4, worker has no open proxy/XSS, exactly one `dangerouslySetInnerHTML` in `web/` (a static theme `<style>`), assistant renderer emits text nodes with https-only links.

---

## 7. Suggested order of work

1. `[ACTION]` Rotate the three Groq keys (F4) — minutes, and the only item with an active exposure window.
2. Review/merge this change set (F1-F4) — includes a behaviour change for signed updates without `cosign`.
3. F6 (keyring rotation data loss) — silent, permanent data loss for users.
4. F11 + F12 + R1 (lockfile integrity, unbreakable-and-unattended sync job, red CI) — the release pipeline is currently not trustworthy.
5. F5 (vault locking) and F9/F10 (release trust chain).
6. F7, F8, F13, then the L-items and §5 upgrades.

Status: items 3–6 are all fixed in this change set — one branch per area (F5/F6 `forge/fix-secrets`, F7/S3/S5 `forge/fix-artifact`, F9–F12 `forge/fix-ci`, F8/F13 `forge/fix-web`, F14/F15+import `forge/fix-audit`), integrated as `forge/audit-round2` and re-verified end to end (§2, §8.2 and §10 carry the per-finding commits). What remains: the §3 L-items, the §4 R-items, the §5 upgrades, and every `[ACTION]`/`[DECISION]` row above. One exception is already built but not pushed: the `.github/workflows/*` half of F9/F10/F11/F12 is staged for a `workflow`-scoped push — see the note under F12.

---

## 8. Second deep-dive — skills subsystem and host adapters (baseline `64bf56f`)

Scope: `internal/skills/`, `cmd/litespm/skills_*.go`, `internal/host/` (the code that edits users' live agent configs). Method: read, then falsify with focused in-package probes; every finding below was reproduced, and the repository was left byte-identical (probe sources and outputs under `/tmp/audit/skills-host/`).

### 8.1 Confirmed — host adapters

| ID | Sev | Where | What | Status |
|----|-----|-------|------|--------|
| H1 | **High** | `internal/host/generic.go` | TOML table headers are matched with `TrimSpace(l) == table`, so `[mcp_servers.demo] # comment` is invisible: merge appends a second identical table (invalid TOML — the host rejects the whole file, bridge entry included) and collision detection misses it. The comment-aware `stripTOMLComment` helper exists and is used only by verify. | `[FIXED]` — `2697b83` |
| H2 | **High** | `internal/host/remove.go` | Same exact-line matcher: `host remove` reports `Removed:false · the litespm entry is not present in this file` while a live `[mcp_servers.litespm] # comment` bridge table stays in the config — the failure that file's header says it prevents. | `[FIXED]` — `2697b83`, `ada8454` |
| H3 | **High** | `internal/host/entry_install.go`, `codex.go`, `grokbuild.go` | TOML is written with Go's `%q` (`\v`, `\a`, `\xNN` are not TOML escapes): a publisher-controlled arg yields a config every TOML parser rejects (reproduced with Python `tomllib`), and the TOML branch has no post-merge verify — the JSON branch does. | `[FIXED]` — `eb050aa` (a strict TOML verifier now gates every TOML write) |
| H4 | Med | `internal/host/jsonc_merge.go` | The separator comma lands inside a container's trailing `// comment`, so `{ "mcpServers": { … // add your servers here\n} }` fails with an opaque refusal (fail-closed, but a common hand-written shape becomes un-installable). | `[FIXED]` — `8a5e951` |
| H5 | **Med (data loss)** | `internal/host/apply_guard.go` | `RestoreBackup` deletes the config when the recorded backup file is missing (`IsNotExist` → `os.Remove`), but a non-empty `BackupPath` means a backup WAS taken. Reproduced: deleted backup + user-edited config → success, config gone. | `[FIXED]` — `3b95a47` (a missing recorded backup now refuses) |
| H6 | Med | `internal/host/codex.go`, `grokbuild.go` | Bridge setup is not idempotent: the replaced block's leading blank lines accumulate (one extra newline per re-run) — needless churn in a user's config. | `[FIXED]` — `bd097a0` |
| H7 | Low | `internal/host/backup.go` | `AtomicWriteFile` never fsyncs (temp file or parent dir), unlike the skills ledger which documents why. Power loss can rename a zero-length config into place. | `[FIXED]` — `ada8454` (no new test: an fsync is not observable in-process) |
| H8 | Low | `internal/host/remove.go` | Removal verifies the rewritten JSON before writing; TOML gets no equivalent (inherits H1's duplicate-table write). | `[FIXED]` — `ada8454` |
| H9 | Low | `internal/host/apply_guard.go` | The compare-and-swap treats a missing file and `{}` as equal; compare the existence bit too. | `[FIXED]` — `3b95a47` |

### 8.2 Confirmed — skills subsystem

| ID | Sev | Where | What | Status |
|----|-----|-------|------|--------|
| S1 | High | `internal/skills/sanitize.go` | The escape stripper's fast-path only fires on **invalid UTF-8**, so UTF-8-encoded C1 controls (`U+009B` = `C2 9B`) survive: `\x9b2K` is stripped, `\u009b`+`2K` is not. A hostile skill name/description can still inject CSI/OSC into install summaries. | `[FIXED]` — `3207db7` |
| S2 | Med | `internal/skills/install.go`, `provenance.go`, `installer.go` | `--force`'s advertised byte-exact backup silently omits `.git` (copy AND digester skip it), so the ledger's pre-image digest *matches the incomplete backup* while the omitted bytes are destroyed. | `[FIXED]` — `b3f8664` (verbatim pre-image incl. `.git`; the digester covers the same set) |
| S3 | Med | `internal/skills/ledger.go` | Removal follows a symlink **mid-path**: `RemoveAll` resolves an intermediate `skills → elsewhere` link and deletes `elsewhere/victim`. Leaf-level symlinks are correctly refused; the guard is leaf-only. | `[FIXED]` — `c65d74f` (policy, as decided: removal never traverses a symlinked parent — every symlink component from the confining root to the leaf refuses, for normal and `--force` removal; `TestRemovalRefusesMidPathSymlink` deleted the victim before the fix, for both `Force:false` and `Force:true`) |
| S4 | Low | `internal/skills/loader.go` | `ParseSkillMD` drops the first body line of a frontmatter-less `SKILL.md`, so a `# heading` never reaches the name fallback and body text loses line 0. | `[FIXED]` — `c352140` |
| S5 | Low | `internal/skills/provenance.go` | The digest doc says "empty only when the directory has no regular files" — it is never empty (always sha256, even `e3b0c442…`); empty directories and file modes are not bound. Doc bug; any caller reading `Digest == ""` is wrong. | `[FIXED]` — `efb78eb` (digest format unchanged — changing it would invalidate every recorded pre-image digest; the doc now states exactly what is bound and that it is never empty, `TestCapturePreImageDigestIsNeverEmpty` pins the sha256-of-empty invariant, and the caller audit found no `Digest == ""` misuse — all four call sites mean "not recorded") |
| S6 | Low | `cmd/litespm/skills_add.go` | AGENTS.md promises `--force` prints `overwrites: <path>` plus a pre-image digest; the CLI prints only a count and the backups directory. | `[FIXED]` — `98ba296` (prints after the install: the digest exists only once the pre-image is captured) |
| S7 | Low | `internal/skills/ledger.go` | `confineDest` accepts a NUL-suffixed destination (the syscall then fails, but the guard should refuse a path it cannot name). | `[FIXED]` — `fd57e32` |
| C1 | Low | `cmd/litespm/main.go` | `litespm skills --help` exits 2 with `Unknown skills subcommand: --help` while printing usage that advertises `--help`. | `[FIXED]` — `2e50580` |
| C2 | Low | `cmd/litespm/skills_adopt.go` | The error tells users to run `litespm skills list --all`, which is refused (unknown argument). Dead end in an error message. | `[FIXED]` — `2e50580` (now points at `litespm host list`) |

All fixed rows above land on `forge/host-hardening` (PR #12), one commit per finding group, each pinned by a failing-first test (`TestPlanRemovalFindsInlineCommentedBridge`, `TestInstallServerEntryTOMLEscapesHostileArguments`, `TestRestoreBackupRefusesWhenTheRecordedBackupIsGone`, `TestCodexPlanSetupAtIsIdempotent`, `TestForcePreImagePreservesGitDirectory`, `TestSkillsAddForcePrintsOverwritesAndPreImageDigest`, `TestSkillsHelpExitsZero`, …). H7 carries no new test (an fsync is not observable in-process) and H8 is covered by the existing TOML removal tests — both stated in commit `ada8454`.

S3 and S5, the last two `[OPEN]` rows here, are fixed on the round-2 branch (`c65d74f`, `efb78eb`); the policy call and the digest decision are stated in their commit messages and in the rows above.

### 8.3 Verified as sound (second deep-dive)

Ledger integrity on corrupt/truncated files (hard error, never silent) and fsync'd ledger writes; `confineDest` traversal/root/relative refusals; removal refuses a symlinked destination and a tree with user-added files (with and without `--force`); `--force` backup content for everything it copies; digest binds `path\0size\0content\0` (no collision found; absolute-path independent); the 32 MiB cap; symlink/non-regular refusal; sanitiser consumes truncated CSI/OSC/DCS/ESC; documented counts hold (50 hosts / 81 skill targets / `--agent '*'` → 54 destinations); cross-scope `--all` never deletes across scopes; JSONC splicing preserves comments, key order and newlines and is idempotent; a commented-out header is not a registration; name-based config injection impossible (value escaping was the real vector, H3); backup bytes/mode/name and apply-guard staleness refusals; rollback refuses to touch a config whose digest moved; the path written is the path agreed.

Not determined: Windows-only behaviours (reserved device names pass `SanitizeSkillName`; unverifiable on Linux) and Unicode bidi/zero-width display spoofing (survives the sanitiser — its scope is terminal escapes).

## 9. Third deep-dive — the web assistant (baseline `18de7b4`)

Scope: the Ask AI path (`web/src/app/api/litespm/assistant/route.ts` and the `assistant-*` modules it wires). Method: read the whole path, then execute the two dependency-free modules straight out of their source with the repo's own `typescript` compiler; the user-visible failure was also reproduced against the live site.

| ID | Sev | Where | What | Status |
|----|-----|-------|------|--------|
| W1 | **High** | `web/src/server/litespm/assistant-product.ts` | The product-knowledge branch shipped in `11eeccb` (100 lines, `productAnswer`) and **nothing imports it**: every question, meta included, ran BM25 + the LLM, and "what is litespm" retrieved three unrelated Anthropic skills. A feature-shaped dead end. | `[FIXED]` — `756e3f5` |
| W2 | **High** | `web/src/app/api/litespm/assistant/route.ts` | `enforceGrounding` reads any token after `litespm install` that is absent from the retrieved hits as an invented package — including the placeholder form `litespm install <id>` that the system prompt itself teaches and the product answers document. A correct "what is LiteSPM" answer was discarded and replaced with "I can only recommend capabilities that are actually in the retrieved catalog. The closest matches are: Claude Api…" (reproduced live). | `[FIXED]` — `756e3f5` (`assistant-grounding.ts`: only id-shaped tokens are claims) |
| W3 | Low | `web/src/app/api/litespm/assistant/route.ts` | No product fallback at all: a meta question that survived retrieval was answered from BM25 noise, and pronoun follow-ups ("how does it work?") had no handling. | `[FIXED]` — `756e3f5` (`productAnswerForConversation`: answers follow-ups only while the thread is about LiteSPM, and only when no catalog noun or search verb appears) |
| W4 | Low | `web/scripts/` | No gate covered the assistant: dead wiring, product-vs-catalog routing and placeholder-vs-id claims were invisible to `tsc`, eslint and the truth checks. | `[FIXED]` — `756e3f5` (`scripts/check-assistant-product.mjs`, executed by `npm run lint`) |

Verified as sound (§9): retrieval cards render before the model writes and `STREAM_CARDS_NOTE` prevents duplicate widgets; widget keys are filtered against the retrieved `linkKey` set; the stream envelope (`status`/`cards`/`delta`/`done`/`error`) matches what the client consumes; the answer cache only ever serves first-turn questions; the catalog questions named in the audit still return null from the product module and stay on retrieval.

Not determined: whether the edge preserves client `XFF` — moot now that F13 is fixed (`ad6dd9b`: the client-controllable hop is never used).

---

## 10. Fourth deep-dive — the installed-user journey (baseline `f77a3a3`, this branch)

Scope: a real install, not a code read. Method: build the binary, populate a clean `$HOME` with the documented config files of several hosts plus the real `@anthropic-ai/claude-code` CLI, sync the live catalog, then run the command surface the way a person would: `host detect`/`list`, `catalog sync`, `search`, `install` / `install remove`, `restore`, `copy` (both directions), `adopt`, `skills add|list|remove`, `import` (plan → apply), `lock`, `lock --check`, `lock --sbom cyclonedx-json`, `list`, `inventory --json`, `doctor`, `audit`, `version`, `setup --agent` (JSON and TOML hosts, twice each for idempotency), plus the failure paths (re-install without `--force`, removing an unknown install, locking a fabricated id).

| ID | Sev | Where | What | Status |
|----|-----|-------|------|--------|
| F14 | **High (functional)** | `internal/scan/scan.go` (`scan.Row.Source`, read by `cmd/litespm/audit.go`) | Plain `litespm audit` failed for every user against every synced release: the v1 shards the origin serves write `source` as an object (`{sourceId, upstreamId, url}`), but `Row.Source` was a plain `string`, so decoding died with `cannot unmarshal object into Go struct field Row.source of type string` and no rule ever ran. The website's bundled dataset uses the flat string shape — and the test fixture copied that shape, which is how it shipped. | `[FIXED]` — `f7813ef` (`SourceRef` accepts either shape: the object prefers `sourceId`, then `upstreamId`, then `url`; a value in neither shape is an error). The cmd test fixture now uses the real shard shape and fails against the old code with the exact user-facing error; `TestRowSourceAcceptsEveryPublishedShape` pins both. Verified live: `litespm audit` now reads the synced release — 0 errors, 638 warnings across 69,376 rows (the warnings are genuine catalog-quality findings, not a crash). |
| F15 | Low | `internal/interop/plan.go`, `cmd/litespm/import.go` | The import plan named its target (`/tmp/proj/litespm.toml`) but the `Apply:` hint it printed omitted `--project` — so following the hint verbatim writes the manifest to the **working directory** instead. Reproduced by following the printout. | `[FIXED]` — `22bf2dd` (`Plan.ProjectFlag` echoes the flag as typed, empty when the target came from the working directory; `TestPlanRenderApplyHintCarriesProjectFlag`; the JSON plan shape is unchanged). |

Verified sound by the journey (do not regress): `host detect` found every pre-seeded host and the real Claude Code install; `setup` is idempotent on JSON and TOML hosts (second run byte-identical); `install` wrote the expected entries into Claude Code's config and Zed's `~/.config/zed/settings.json` (a skill went to the shared `~/.agents/skills`) without touching sibling entries; a re-install without `--force` refuses; `install remove` and `restore` return the config byte-for-byte; `copy claude-code zed` plans, applies (`L1 read-back ok`), reports "already identical" on the round trip and the reverse; `skills list` stays consistent through install, copy and remove; `import` with `--project` writes exactly its named target; `lock` resolves against the synced catalog and prints the digest, `lock --check` verifies, `lock --sbom cyclonedx-json` emits valid CycloneDX 1.5; a fabricated id fails `lock` with a clear unresolved error naming the fix (`catalog sync`); `doctor` reports the populated state; `list`/`inventory --json` agree with the configs on disk. Catalog measured during the journey: 69,376 listings in the synced release (searches sampled 1,657 unique rows: 932 skill / 708 mcp / 17 plugin; 364 directly installable).

---

*Prepared as part of the cloned-repo audit. All line numbers refer to the audit baseline (`318e421`) unless marked otherwise; §8 uses the `64bf56f` baseline, §9 the `18de7b4` baseline and §10 the `f77a3a3` baseline. The F1-F4 fixes above shift lines in `internal/catalog/client.go`, `cmd/litespm/main.go`, `cmd/litespm/main_test.go`, `web/src/server/llm/gateway.ts` and `web/scripts/check-no-embedded-secrets.mjs`.*
