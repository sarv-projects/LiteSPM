# Phase K + ARCH/34 + Phase J + Wiring Program — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the honest-open work in `TODO.md` — Phase K (sources & supply chain), ARCH/34 (invocation engine), the rest of Phase J (product surface), and the wiring of the `IMPLEMENTED`-but-unwired subsystems — then reconcile every document to the code and fix the known defects.

**Architecture:** Five independent tracks, executed in dependency order, each with its own plan file. ARCH/34 comes first because it is the keystone (leases, `autostart`, `J014`, `J015` and the receipt chain all depend on it). Phase K's producer work is independent of ARCH/34 and can run in parallel. Phase J's web work consumes the evaluator's findings and therefore runs after the first evaluator report exists. Documentation reconciliation runs last for *status* claims, but stale-prose fixes (pointer drift, wrong counts) are folded into each track's own task so no track finishes with a contradiction it introduced.

**Tech Stack:** Go 1.26.0 (`GOTOOLCHAIN=go1.26.0` — the installed toolchain is 1.27.1 and its `gofmt` disagrees with the repo's pin), `modernc.org/sqlite`, Next.js 15 / React 19 / Tailwind 4 (web), Python 3 stdlib-only (the catalog producer), Playwright (browser + web tests).

**Spec:** `TODO.md` (phases A–K), `ARCH/34-RUNTIME-INVOCATION-RECEIPTS.md`, `ARCH/03-CATALOG-SOURCES.md`, `ARCH/36-ENTERPRISE-POLICY-AND-AUDIT.md`, `STATUS.md` (the truth baseline), `REMEDIATION-PLAN.md` (P1–P9, m1–m8), `CURRENT_RUN.md` (the handover).

## Global Constraints

- **Evidence states are never collapsed.** `DESIGNED` → `IMPLEMENTED` → `WIRED` → `TESTED` → `VERIFIED` → `SHIPPED`, per `ARCH/31 §2`. A component whose only caller is a test is `IMPLEMENTED`, not `WIRED`. `STATUS.md` wins every conflict.
- **Fail closed.** An unimplemented path returns an explicit typed error or a non-zero exit — never fabricated success, never a partial install. This applies to *new* work too: an unproven path must not be presented as working.
- **No fabricated data.** Never invent star counts, download counts, install counts, or provenance. If a source is unreachable, the dataset records it as refused/incomplete rather than silently dropping rows.
- **A published release is re-cut, never edited.** Any change to the dataset or release tree requires a new release id and sequence.
- **Surgical, reversible mutation.** Every host-config write backs up first, preserves comments and key order, and rolls back on a failed post-image check. Every deletion is confined to what the ledger names.
- **Secrets never reach a file, a plan, a log, or a receipt.** Only `secret:<ns>/<key>` references and `{env:VAR}`-style indirections. Redaction runs before persistence; redaction failure fails closed.
- **TDD, one task at a time.** A task's test is written and observed failing before the implementation. `go test ./...` must be green before any commit.
- **Go formatting:** `GOTOOLCHAIN=go1.26.0 gofmt -l .` must print nothing. CI runs this, and 1.27's `gofmt` disagrees.
- **Web:** `npm run type-check`, the four lint gates, `npm run build`, and `npx playwright test` (113 tests) must stay green. A change to `web/data/*.json` or `web/lib/hosts.ts` requires regenerating with `scripts/gen_hosts_ts.go` and `web/scripts/emit-catalog-shards.mjs`, and the regenerated files must be committed.
- **No commit without a test that fails when the behaviour regresses.** "Files exist" is at most `IMPLEMENTED`; "tests exist" is at most `TESTED`.
- **Nothing in this program may publish.** No `npm publish`, no `wrangler deploy`, no release cut, no tag push. Publication is a human action, and this program ends with the work *ready* to publish.

## Review Focus

Five input classes the spec implies that individual task tests tend not to cover — each line gets a test in the owning task:

1. **A capability that is installed but whose provider is dead** — the invocation path must return a typed provider error, not hang until the client times out, and not silently succeed with empty output.
2. **An invocation cancelled while the provider is mid-call** — the child process must actually stop (not just the request be marked cancelled), the receipt must record `cancelled`, and the chain must still verify.
3. **A provider returning a result larger than the output bound** — the result must be truncated with `truncated: true` and the original digest, never returned whole and never silently dropped.
4. **A source that is unreachable or partially crawled** — the dataset must record the source as incomplete/refused with a count, and the release must still cut; a missing source must never become a silently smaller dataset that reads as complete.
5. **A row whose upstream metadata changes between two ingests** — the re-ingest must produce a *new* release id, never an edited one, and the old release must remain byte-identical on disk.

---

## Program structure

| Track | Scope | Plan file | Depends on |
|---|---|---|---|
| 0 | Documentation reconciliation (stale prose, not status) | this file, Task 0 | — |
| 1 | ARCH/34 — invocation registry, engine, receipts wiring | `2026-10-19-arch34-invocation-engine.md` | — |
| 2 | Phase K — sources & supply chain | `2026-10-19-phase-k-sources-supply-chain.md` | — |
| 3 | Wiring — the unwired subsystems | `2026-10-19-wiring-unwired-subsystems.md` | Track 1 (leases), Track 2 (source ingest) |
| 4 | Phase J + Blueprint P1/P2 — product surface | `2026-10-19-phase-j-product-surface.md` | Track 1 (`J014`/`J015`), evaluator report |
| 5 | Defect fixes + final status reconciliation | `2026-10-19-defect-fixes-and-status-reconciliation.md` | Tracks 1–4 |

**Ordering rationale.** Track 1 is first because `ARCH/34` unblocks `J014` (leases), `J015` (spine), the `autostart` decision, and the receipt chain that `audit --ci` needs. Track 2 is independent of Track 1 and can run concurrently. Track 3 needs Track 1's registry (leases gate invocation) and Track 2's ingest path (the Go ingest has nothing to ingest into until the producer contract is settled). Track 4 needs the evaluator's findings to avoid building the wrong page, and Track 1 for the CLI spine. Track 5 runs last so the docs describe the final code.

**Program-level gates.**
- **G1** — after Track 1: `go test ./...` green; `invocation.get`/`invocation.cancel` no longer return `-32601`; every completed invocation writes a verifiable receipt; `STATUS.md §4` and `ARCH/34` header updated to the new honest state.
- **G2** — after Track 2: a dataset re-ingest produces a *new* release id; every row carries provenance; a deliberately unreachable source is recorded as incomplete; `K009`'s ADR is recorded and D4 is amended, not silently reinterpreted.
- **G3** — after Track 3: no `internal/` package is left with "test-only callers" for the six named packages; `secrets` are injected at provider launch; `litespm auth` has a production path.
- **G4** — after Track 4: the web build, the four lint gates, and the Playwright suite are green; the evaluator's blocker and major findings are either fixed or recorded in `TODO.md` with reasons.
- **G5** — after Track 5: `STATUS.md`, `TODO.md`, `REMEDIATION-PLAN.md`, `CURRENT_RUN.md`, the ARCH set, `README.md`, `web/README.md`, `scripts/README.md`, `npm/NOTICE` and `.github/DEPENDENCY-LICENSE-INVENTORY.md` all agree with the tree; no document claims a state the code does not support.

---

## Task 0: Documentation reconciliation — stale prose (Track 0)

**Files:**
- Modify: `README.md` (release pointer)
- Modify: `STATUS.md` (release pointer line 65, `ARCH/00-INDEX.md` line 17)
- Modify: `ARCH/00-INDEX.md` (ARCH/33 status row)
- Modify: `ARCH/02-HLD.md` (release pointer)
- Modify: `ARCH/16-HOST-ADAPTERS.md` (§3.7.4 "no published row carries `url`")
- Modify: `ARCH/26-ECOSYSTEM-IA-PACKAGE-MODEL.md` (stale counts)
- Modify: `ARCH/30-DATA-DRIVEN-BRIDGE-TARGETS.md` (77 → 81)
- Modify: `web/README.md` (release id/seq, byte size, skill-target count, product-fetch size)
- Modify: `scripts/README.md` (script count, `gen_hosts_ts.go` CI claim, 77-vs-81 warning)
- Modify: `npm/NOTICE` + `.github/DEPENDENCY-LICENSE-INVENTORY.md` (the `@sigstore/*` dependency claim)
- Modify: `TEST.md` (the Pi fixture shape)
- Modify: `TODO.md` (the duplicate `LPSM-D004` id; the three superseded rows)

**Interfaces:**
- Consumes: nothing (this is the first task).
- Produces: a document set with one release pointer, one set of counts, and one statement of the npm dependency set — the baseline every later track's status edit is written against.

- [ ] **Step 1: Fix the release pointer to name both the live release and the repo release, explicitly.**
  `STATUS.md` §2 and `ARCH/00-INDEX.md` currently say `rel-2026-10-15-01` (sequence 148 — the live origin); `README.md` and `CURRENT_RUN.md` say `rel-2026-10-17-01` (sequence 149 — the repo, not deployed); `TODO.md` and `ARCH/02-HLD.md` still say `rel-2026-10-11-02` (sequence 147). Replace every occurrence with a single sentence pattern: *live origin serves `rel-2026-10-15-01` (seq 148); the repository has cut `rel-2026-10-17-01` (seq 149), not yet deployed.* Delete the `rel-2026-10-11-02` pointer rather than rewriting it — it names a superseded release.
  Verify: `grep -rn "rel-2026-10-11-02" README.md STATUS.md TODO.md ARCH/ | wc -l` → `0`.
- [ ] **Step 2: Correct the counts that contradict the dataset.**
  `ARCH/26` lines ~139–144 state 4,079 MCP / 1,103 skills in one place and 48,418 / 20,320 in another. The dataset says 48,418 MCP, 20,320 skills, 638 plugins, 69,376 total, of which 42,573 `discovery_only` and 26,803 `metadata_verified`. Make every number in `ARCH/26` agree with those, and cite the release id the numbers came from.
  Verify: `python3 -c "import json;r=json.load(open('web/data/catalog.json'));print(len(r))"` → `69376`.
- [ ] **Step 3: Fix the two architecture claims the code contradicts.**
  `ARCH/16` §3.7.4 asserts "no published row carries `url`" — 25,401 published rows do. Rewrite the sentence to the measured fact and point at `ARCH/14`/`ARCH/05`. `ARCH/30` §10 says the generated file "still lists 77" targets; it lists 81 and matches `skills.AgentTargets()`. Update the sentence and drop the stale warning.
  Verify: `python3 -c "import json;print(len(json.load(open('web/data/skill-targets.json'))))"` → `81`.
- [ ] **Step 4: Fix the `ARCH/00` registry row for ARCH/33.**
  `ARCH/00-INDEX.md` lists the deployment-ledger document as `DESIGNED`; `ARCH/33` and `STATUS.md` §5 mark install/reconcile/uninstall `IMPLEMENTED`. Correct the index row to the document's own status word.
- [ ] **Step 5: Correct the npm dependency claim.**
  `npm/NOTICE` and `.github/DEPENDENCY-LICENSE-INVENTORY.md` say the npm launcher "uses only Node built-ins" and "has no dependencies". `npm/package.json` declares `@sigstore/bundle`, `@sigstore/tuf`, `@sigstore/verify` as runtime dependencies (five Apache-2.0 packages in the lockfile). State the three direct dependencies, their licences, and that they are required by the default install path.
  Verify: `node -e "const p=require('/workspaces/LiteSPM/npm/package.json');console.log(Object.keys(p.dependencies))"` → three `@sigstore/*` names.
- [ ] **Step 6: Fix the two stale READMEs and the Pi fixture.**
  `web/README.md` names `rel-2026-10-11-02`/seq 147, a 53,969,379-byte catalog (actual: 54,114,951), and 77 skill targets (actual: 81). `scripts/README.md` says "Twenty-three scripts" (there are 24 code files), says no workflow runs `gen_hosts_ts.go` (`ci.yml` does, in `static-checks`), and repeats the 77-vs-81 warning. `TEST.md`'s Pi fixture writes `mcp.servers`, a shape the Pi adapter does not scan — either fix the fixture to `mcpServers` or state that it exercises a shape Pi does not read; the honest fix is to make the fixture match what Pi reads.
  Verify: `grep -rn "rel-2026-10-11-02\|53,969,379\|Twenty-three" web/README.md scripts/README.md` → no matches.
- [ ] **Step 7: Remove the superseded TODO rows and the duplicate id.**
  `TODO.md` still says the `v0.4.1` tag was not pushed and npm not republished (both done 2026-10-15/17); that the npm installer verifies SHA-256 only (it verifies a Sigstore bundle); and that the generated-host-data gate fails because the file lists 77 (it lists 81). Delete the three claims rather than marking them done, so no reader inherits a stale instruction. Rename the second `LPSM-D004` row (the `internal/skills` loader) to a distinct id, `LPSM-D004B`, and keep the first as `LPSM-D004`.
  Verify: `grep -n "LPSM-D004" TODO.md` → exactly two distinct ids.
- [ ] **Step 8: Commit.**
  ```bash
  git add -A docs README.md STATUS.md TODO.md TEST.md ARCH web/README.md scripts/README.md npm/NOTICE .github
  git commit -m "docs: one release pointer, one set of counts, one dependency truth"
  ```
  Use `git add -A`, never `git add -u` — the recorded COMMIT HAZARD in `CURRENT_RUN.md` says `git add -u` breaks this repo.
- [ ] **Step 9: Record the program state.**
  Append to `CURRENT_RUN.md` (newest-first, at the top) a section dated 2026-10-19 naming this program, the five tracks, the gates G1–G5, and the state of each track. Fix the file's ordering hazard at the same time: the two bottom sections (`## Final Next Steps`, `## Active Goal`) are marked superseded — move the pointer to the top so a reader who opens the file learns that the top is current.

---

## Track 1 — ARCH/34 (invocation registry, engine, receipts)

Full plan: `docs/superpowers/plans/2026-10-19-arch34-invocation-engine.md`.

**Shape of the work** (decided here so later tracks can rely on it):

- New package `internal/invocation`:
  - `registry.go` — live in-flight state: `Registry` with `Register`, `Complete`, `Cancel`, `Get`, `List`. A `Cancel` is idempotent and returns the same terminal state on repeat.
  - `engine.go` — `Engine`: validates capability + grant + schema fingerprint *before* dispatch; enforces a per-provider concurrency limit and a queue bound (exceeding it returns the typed error `LPSM-PROVIDER-BUSY`); applies a clamped deadline; propagates cancellation into the provider child's context; writes a receipt through `internal/receipts`.
  - `redact.go` — redaction of token/connection-string patterns from provider stdout/stderr and result payloads; a redaction failure fails the invocation closed.
  - `bounds.go` — bounded output: truncate with an explicit marker, byte count and the original digest, and set `truncated: true`.
- `cmd/litespm/main.go` — `invocation.get` and `invocation.cancel` become real handlers; `provider.invoke` returns an `invocationId` and a receipt alongside the existing synchronous result, so ARCH/34 acceptance test 2 holds without breaking the existing synchronous contract.
- `internal/bridge/shim.go` — `get_invocation` and `cancel_invocation` call the daemon instead of returning `-32601`.
- `internal/receipts` — the engine's receipt writer; the per-provider hash chain stays the tamper-evidence mechanism.

**Decisions taken in the program plan (so the track plan does not re-litigate them):**
- `provider.invoke` keeps its synchronous behaviour **and** gains an `invocationId` + receipt. An `async: true` request returns `{invocationId, state}` immediately. ARCH/34 §2 is amended to describe both modes; no persisted state is invalidated.
- The live `Registry` is authoritative for in-flight state; `internal/receipts` is authoritative for the durable, tamper-evident record. `invocation.get` reads the registry first, then the receipt store.

## Track 2 — Phase K (sources & supply chain)

Full plan: `docs/superpowers/plans/2026-10-19-phase-k-sources-supply-chain.md`. K001–K004 (producer-side), K006 (advisory feed), K007 (TUF root), K008 (npm/PyPI sources), K009 (ADR for D4). K005 is already `IMPLEMENTED` and needs only a status reconciliation.

## Track 3 — Wiring (the unwired subsystems)

Full plan: `docs/superpowers/plans/2026-10-19-wiring-unwired-subsystems.md`. Six named packages with test-only callers (`internal/auth`, `internal/source`, `internal/profiles`, `internal/receipts`, `internal/compat`, `internal/identity`), `ResolveLaunchSecrets` at provider launch, the `adopt` flow, `internal/scan`, `audit --ci` + SARIF, and doctor timing instrumentation.

## Track 4 — Phase J + Blueprint P1/P2 (product surface)

Full plan: `docs/superpowers/plans/2026-10-19-phase-j-product-surface.md`. J004 Explore evaluation surface, J006 Agent Atlas, J008 route hygiene, J013 `status`/`diff`/`why`/`outdated`, J014 profiles as Setups (unblocked by Track 1), J015 the unified intent→plan→approval→txn→verify→receipt spine, plus Blueprint P1 (`/how-it-works/`, `/get-started/`, the homepage no longer leading with catalog shelves) and P2 (per-entry install-feasibility, `featured.json`, `/trending`→`/insights`, Explore decomposition). This track starts only after the evaluator's report exists.

## Track 5 — Defect fixes and final status reconciliation

Full plan: `docs/superpowers/plans/2026-10-19-defect-fixes-and-status-reconciliation.md`. The known defects (zip-bomb ratio check, the producer/ingest installability disagreement, the lifecycle crash window, `m6` CAS orphan recovery, approval subject binding, drift invalidating grants, the `Adopt` label with no handler, the wizard's missing update check, the npm publish silent skip, the CI gaps for the Python suites, the `.agents` import failures, the mobile nav clipping, the token sweep) plus the final `STATUS.md`/`TODO.md` reconciliation that closes gate G5.

---

## Self-review

**Spec coverage.** Every `DESIGNED`/`IN_PROGRESS`/`GATED` row in `TODO.md` maps to a track: Phase K rows → Track 2; ARCH/34 → Track 1; Phase J rows → Track 4; the "unwired" packages → Track 3; the defect list → Track 5; document contradictions → Task 0. `K005` is `IMPLEMENTED` already and is covered by Track 5's status reconciliation.

**Step scan.** Task 0's steps each name a file, an exact claim, and a verification command. Tracks 1–5 carry a *shape* here and a full step-level plan in their own files, written immediately before that track starts — so no implementer ever meets a "TBD" step.

**Type consistency.** Track 1's public names (`Registry.Register/Complete/Cancel/Get/List`, `Engine`, `LPSM-PROVIDER-BUSY`, `InvocationID`, `Receipt`) are fixed here and are the names later tracks' interfaces refer to. Track 4's CLI verbs (`status`, `diff`, `why`, `outdated`) are fixed in the task list; Track 3's `litespm auth` verb is fixed.

**Review Focus.** Each of the five lines above is pinned by a test: (1) dead provider → typed error, Track 1; (2) mid-call cancel → child stopped + receipt `cancelled` + chain verifies, Track 1; (3) oversized result → `truncated: true` + digest, Track 1; (4) unreachable source → recorded incomplete + release still cuts, Track 2; (5) changed upstream → new release id, old release byte-identical, Track 2.

**Proportion.** The program file carries the decisions; each track file carries its steps. No task body is transcribed into the program file.
