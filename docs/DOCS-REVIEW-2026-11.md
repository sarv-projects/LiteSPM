# Documentation review — 2026-11

Date: 2026-11-10. Scope: every tracked `*.md` outside `web/`, `.agents/skills/**` and `docs/audit/**`
(enumerated with `git ls-files "*.md"`; `.slim/` and `.hostnotes-work/` are untracked and were not reviewed).
Only `.md` files were edited. Nothing was committed, stashed, reverted or pushed.

## Facts established (checked 2026-11-10)

| Fact | Value | How checked |
|---|---|---|
| Host adapters | **52** (6 bespoke + 46 generic) | built `./cmd/litespm`, ran `host list` |
| Remote-capable hosts | **47**; refused 5: `claude-desktop`, `codestudio`, `iflow-cli`, `mux`, `zcode` | `TestRemoteCapabilityMatrixCounts` (`internal/host/targets_data_test.go:622`) |
| Skill targets | **81** | `skills.AgentTargets()`; `go test ./internal/skills` passes |
| Bridge tools | **13** (`adopt_capability` is the one older tables omit) | `internal/bridge/shim.go:112-176` |
| In-agent marketplace command hosts | **17** (5 popups, 12 prompt/skill); `Verified: true` for Pi, OpenCode, Claude Code, GitHub Copilot, Gemini CLI only | `internal/host/marketplace_command.go` |
| npm registry `latest` | **0.6.0** (`npm/package.json` says 0.6.1: unpublished, no `v0.6.1` tag; newest tag `v0.6.0`) | `registry.npmjs.org/litespm/latest`, `git tag` |
| Live origin release | `rel-2026-10-21-01`, sequence 151, created 2026-10-21T14:31:30Z | fetched `litespm.sarveshbh-2022.workers.dev/v1/current.json` |
| Repo pointer | `rel-2026-11-05-03`, sequence 154 (cut, **not deployed** to the origin) | `web/public/v1/current.json` |
| Web build mode | `output: "standalone"` | `web/next.config.ts:4` |
| `host list` vs committed registries | `web/data/hosts.json` has 52 entries | read |

Note: `git status` at the start of the session listed 6 modified/untracked non-doc files. The in-agent
marketplace registrar and `marketplace_rows.go` are already committed; only edits to `marketplace_rows.go`,
`marketplace_assets/claude-code/register.js`, `pi_extension.ts` and `internal/skills/ledger.go` (plus two new
tests) were uncommitted. During the session, ~35 files under `web/` also became modified (timestamps
11:38–11:44). I did not edit them and the website-audit subagent reported it did not either; I cannot tell
which engineer made them.

## Files reviewed and changed

| File | Stale / wrong found | Change |
|---|---|---|
| `AGENTS.md` | 50 hosts / 46 of 50 remote / four refused; §3 said LiteSPM creates no popup anywhere; OpenCode, Claude Code and Qwen notes pre-date the registrar; wizard prompt description | 52 / 47 of 52 / five refused (named, with the pinning test); rewrote the "what `/marketplace` renders" bullet (registrar, ownership marker, rows command, popup vs prompt, verified vs unverified); updated OpenCode, Claude Code, Qwen sections; arrow-key wizard note |
| `README.md` | "Inside your agent" said LiteSPM cannot make a host pop up a panel | New description with per-agent table and verified/unverified column; fixed OpenCode/Qwen paragraph near the top |
| `npm/README.md` | Stale release id, broken `?2` fragment, duplicated paragraph, 0.6.0/0.6.1 and release claims; secrets "IMPLEMENTED not WIRED" contradicts STATUS; Pi-only extension claim | Replaced the honest-status block with dated facts (0.6.0 published, 0.6.1 not, origin still 151, 154 undeployed); fixed secrets sentence; in-agent command text; added `marketplace rows` to the command table |
| `STATUS.md` | "Next.js static export"; "6 bespoke + 44 generic"; no row for the marketplace command; bridge/wizard rows silent on it; release/version drift; catalog-sync timeout; npm shim; ledger ghost rows; plugin skills container; ~12 stale `main.go:`/`wizard.go:` line refs | Fixed all of those; added the "In-agent marketplace command" row (`WIRED` for 17 hosts, not `VERIFIED`); snapshot note; main.go refs re-pointed to current lines/symbols |
| `CHANGELOG.md` | No entry for working-tree changes | Added `Added` / `Fixed` / `Documentation` entries under `[Unreleased]` |
| `AUDIT.md` | R2 not re-probed; ghost ledger rows not recorded | R2 updated with the 2026-11-10 probe; added S8 (ghost ledger rows) `[FIXED]` in the working tree, uncommitted. **No L-item was marked fixed**: I read `transport_unix.go` (L1), the `internal/state` file modes (L2), the `@sigstore/*` ranges in `web/package.json` (L5; `npm/package.json` also uses `^`) and `extractor.go` (L12) and found no evidence of a fix; L3–L4, L6–L11, L13 were not individually re-verified and stay `[OPEN]` |
| `TODO.md` | 12 tools, "44 generic / 50 total", "no Adopt handler exists" | 13 tools, 46 / 52, adopt exists |
| `SECURITY.md` | "currently published v0.4.1"; no mention of the files the registrar writes into agent plugin/command dirs | Dated the v0.4.1 claim and noted 0.6.0 is latest and its bundle was not re-verified here; added an "In-agent marketplace command" row to the trust table |
| `scripts/README.md` | 50 hosts, "all 50 host adapters" | 52 |
| `ARCH/14-BRIDGE-PROVIDER-MCP.md` | 12-tool table, no `adopt_capability`, stale `shim.go` line numbers | 13-tool table with current lines |
| `ARCH/16-HOST-ADAPTERS.md` | Reality-check said no `/marketplace` hook exists; 12 tools; Adopt "DESIGNED"; §5 "DESIGNED" | Counts note; 13-tool table; Adopt implemented; §5 rewritten as the registrar (WIRED for 17, verified for 5) with the still-DESIGNED remainder |
| `ARCH/00-INDEX.md`, `ARCH/02`, `ARCH/08`, `ARCH/31`, `ARCH/39` | 12-tool references; no 2026-11-10 probe | 13 tools; probe note in 00-INDEX; ARCH/39 tool list now includes `adopt_capability` |
| `ARCH/09-RESEARCH.md` | `grok_marketplace.go:184` / `:39` | `:185` / `:37` (file is 195 lines) |
| `ARCH/25-WEB-FRONTEND-UI.md` | Describes a static-export site that is not what `web/` is | Drift notice pointing to `docs/WEBSITE-AUDIT-2026-11.md` §3.3 |
| `CURRENT_RUN.md`, `HANDOFF.md`, `REMEDIATION-PLAN.md` | Session scratch with stale facts (e.g. "12 tools", "tests not run") | Dated historical-note headers pointing to STATUS.md / AUDIT.md; bodies untouched |

Files with the claims checked and found already correct: `ARCH/30` (52 adapters, 46 generic, 81 skill targets),
`ARCH/40` (already says 0.6.1 unpublished and 52 adapters), `README.md` counts (52 / 47 / 13 / 81).

## Files read only in part or not individually reviewed

I grepped these for the tracked facts (host/tool/skill counts, release ids, versions, `static export`) and
sampled references, but did not read them end to end: `ARCH/01, 03, 04, 05, 06, 07, 10–13, 15, 17–24,
26–29, 32–38`, `TEST.md`, `.github/DEPENDENCY-LICENSE-INVENTORY.md`, `internal/interop/testdata/registry-live-provenance.md`,
`docs/audits/2026-10-22/*` and `docs/superpowers/**`. The last two groups are dated audit/plan records and
were left as written (e.g. `docs/audits/2026-10-22/content-and-competitors.md` correctly records "50 hosts" as of
2026-10-22).

## What remains (not fixed)

1. **Systemic line-number drift.** `cmd/litespm/main.go` grew to ~4,400 lines and `wizard.go` was rewritten, so
   `main.go:NNN` / `wizard.go:NNN` references are stale in `TODO.md` (≈10), `README.md:71`, and `ARCH/01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11`
   (e.g. `ARCH/11` cites `main.go:1121/1135/1162/1184/1211`; `ARCH/02` `:1142/:1162`; `ARCH/04` `:537/:719/:807`).
   I fixed the `STATUS.md` ones. A scripted check found only one reference past end of file (ARCH/09, fixed)
   and two to files that no longer exist (`web/lib/site.ts` in ARCH/26, `web/tests/budgets.spec.ts` in TODO.md:61),
   but references that point at the wrong code inside an existing file are not detectable that way.
   Recommendation: replace line numbers with symbol names, as done in the STATUS rows.
2. **State table count.** `STATUS.md` says 25 tables; `ARCH/00, 04, 12, 39` say 22. The migrations contain 22 + 3 + 2
   `CREATE TABLE` statements (`internal/state/migrations/*.sql`); I did not establish which number is right.
3. **`web/README.md`** (out of scope: under `web/`) still has 50 / 46 per the website audit.
4. **Unverified marketplace renderers** (Amp and 12 prompt/skill hosts) are documented as unverified; they need a
   run against a real install of each agent before any doc can say otherwise.
5. **Release/version facts** are only as good as 2026-11-10: `0.6.1` unpublished, origin on sequence 151, Vercel app not
   re-probed in this pass, `catalog-sync.yml` still red (AUDIT R4).
6. **AUDIT.md L1–L13** untouched except as listed above.
7. **Website findings** are in `docs/WEBSITE-AUDIT-2026-11.md` (read-only audit; no `web/` source or online docs were
   changed, because the task forbids editing those files).
