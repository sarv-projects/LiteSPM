# Handoff — installer UX upgrade + in-agent marketplace

> **Historical session note (dated header added 2026-11-10).** This handoff was written on
> 2026-11-06 and its "partial implementation / tests not run" status is **stale**: the in-agent
> marketplace command registrar (`internal/host/marketplace_command.go`) and
> `litespm marketplace rows` now exist and are described in [STATUS.md](STATUS.md) and
> [AGENTS.md](AGENTS.md) §3; open defects are tracked in [AUDIT.md](AUDIT.md). Read the body below
> only for the reasoning behind the decisions it records.
**Date:** 2026-11-06  
**Repo:** `C:\Users\Sonali\Desktop\projectwork\business_Dev\liteSPM` (branch `main`)  
**Status:** partial implementation. `go build ./cmd/litespm` passes; tests have **not** been run.  
**User decision:** implement **Approach A** (inline installer upgrade), then test it. A full-screen tabbed TUI (Approach B) was deferred.

---

## 1. What the user asked for

1. **Do Approach A first, then test it.**
   - Upgrade the installer to the quality of `vercel-labs/skills`.
   - Auto-update LiteSPM on every run, without touching installed/edited capabilities or agent configs.
   - No command memorization: a guided, attractive UI.
2. **Investigate `/litespm:marketplace` in WSL + OpenCode.**
   - It does not open a popup, panel, or search bar.
   - It prints a text prompt and the agent tries to open Chrome / use computer-use, which is not what the user expected.
   - `list_installed` returns 83 rows of duplicated external MCP servers, and `kind` filtering did not work.
   - If that popup/search UI does not exist, say so and finish A, then stop.
3. **Re-audit the entire LiteSPM** (website, installer, all files) after that.
   - This has not been started beyond the targeted findings below.

---

## 2. Reference study: `vercel-labs/skills`

Cloned the public repo and studied **v1.7.6**:

- Source: `https://github.com/vercel-labs/skills`
- Local clone used for the study: `%TEMP%\opencode\skills-ref` (may be deleted; re-clone if needed).
- Key files read:
  - `src/cli.ts` — command dispatch, logo/banner, help.
  - `src/add.ts` (~3,110 lines) — the full `add` flow: source parsing, discovery, skill selection, agent selection, scope, install mode, summary, security audit, install, completion.
  - `src/installer.ts` (~1,260 lines) — canonical-dir/copy/symlink install engine, agent detection.
  - `src/prompts/search-multiselect.ts` (~640 lines) — custom searchable multiselect with detail pane, select-all, groups, locked section, selected summary.
  - `src/agents.ts` — agent registry/detection.
  - `docs/commands.md`, `README.md`, `AGENTS.md`.

Also ran the reference command with **no `--y`** in an isolated HOME/cwd:

```bash
npx skills@1.7.6 add https://github.com/vercel-labs/skills --skill find-skills
```

Because it detected it was running inside an agent (OpenCode), it installed non-interactively. The UX is the bar:

```text
◇  Source: https://github.com/vercel-labs/skills.git
◒  Fetching skills…
◇  Found 1 skill
●  Selected 1 skill: find-skills
◇  Installation Summary ─────────────╮
│  .agents/skills/find-skills
│  copy → OpenCode, Amp, Antigravity, Cline +17 more
◇  Security Risk Assessments ────────╮
│  find-skills   Safe   0 alerts   Med Risk
◇  Installed 1 skill ────────────────╮
│  ✓ find-skills (copied)
│    → .agents/skills/find-skills
└  Done! Review skills before use; they run with full agent permissions.
```

Key UX properties to copy:
- one step at a time, each step has a clear status;
- live spinners for fetch/install;
- a summary box **before** writing, showing every destination;
- a completion box after writing, showing every path;
- searchable/filterable selection with a detail pane;
- no raw flags required for a normal user;
- security/audit information when available.

---

## 3. Findings in LiteSPM

### 3.1 `/litespm:marketplace` is text-only — there is no popup to open

This is an MCP **prompt**, not a host-native UI panel. OpenCode renders `prompts/get` as a text prompt and then the model calls tools. MCP has no portable "render a popup" or "open a search bar" capability. The docs already say this in several places:

- `README.md` — "The in-agent `/marketplace` is text: MCP has no portable window..."
- `AGENTS.md` — `/marketplace` is a text prompt; OpenCode namespaces it `/litespm:marketplace`.
- `STATUS.md` — in-agent `/marketplace` is text; the browser marketplace is the portable window.
- `web/src/components/litespm/views/docs.tsx` — host-specific prompt names and Qwen limitation.

So the requested popup/search bar **does not exist and cannot be added through the current MCP prompt**. What can be fixed is the behavior around it:

- **Bad prompt instruction:** `internal/bridge/shim.go` `marketplacePromptText()` (around line 389) says:
  `"If this host can open links, open it for the user; ..."`
  This caused the agent to invoke `computer-use_computer_list_windows` / `xdg-open` / Chrome and ask for permission. It should explicitly say: do **not** launch a browser or computer-use from the prompt; the in-agent marketplace is text-only; tell the user to run `litespm marketplace` or open the URL themselves if they want the browser page.
- **`list_installed` ignores its advertised filters:** tool schema declares `kind` and `enabled` (around `internal/bridge/shim.go:136`), but the handler (around `:540`) decoded neither and returned every item. A partial fix is already applied; see §4.
- **83 rows are duplicated host registrations:** `tools.list` emits one `CapabilityItem` per host registration plus one per external detection. The user sees 11 unique external MCP servers repeated across 9 hosts. `FormatInstalledPanel()` (around `:755`) does not dedupe, so the header says 83. Needs grouping/deduping and a "N deployments · M unique capabilities" summary.
- **The prompt asks the agent to offer Uninstall / Install actions** but does not tell it to avoid repeated `list_installed` calls or to use the `kind` filter. The transcript shows the agent calling `list_installed` repeatedly and getting everything.

### 3.2 Auto-update is once per shell session, not every run

`cmd/litespm/auto_update.go`:

- `autoUpdateSessionTTL = 12 * time.Hour`
- marker suppresses further checks when `marker.Session == opts.SessionID` and the marker is younger than 12h.
- burst window was 3 minutes.
- `maybeAutoUpdate()` runs at startup for allowed interactive commands; it skips `version`, `bridge`, `daemon`, `self-update`, `uninstall`, `help`, `--json`.
- It only writes the cache marker, lock, and the binary. `TestAutoUpdateLeavesUnrelatedStateUntouched` proves state/config/ledger files are untouched.
- It skips `Version == "dev"` (source builds must not be replaced).

Partial change already applied: 12h session suppression removed, burst reduced to 30s. See §4. Tests were updated but **not run**.

### 3.3 The wizard is a mix of plain prompts and the good TUI

- `cmd/litespm/wizard.go`:
  - `printBanner()` uses the wordmark.
  - `printRuntimeSummary()` prints "LiteSPM can connect to 50 different agent hosts. This run has not changed anything yet."
  - `printConfiguredSummary()` prints every configured host and full config path on every run.
  - `runActionMenu()` uses `huh.NewSelect` (the `┃ LiteSPM Manager` screen in the transcript).
  - `actionInstallSkillFromSource()` uses `huh.NewInput` for the source (the `┃ Skill source` screen).
  - `actionFindAndInstall()` uses plain `fmt.Fprint`/`readLine` for the search query, scope (`[1]/[2]`), and confirmation (`[Y/n]`).
- `cmd/litespm/installer_tui.go` already contains the good primitives:
  - `searchPromptModel` / `runSearchPrompt` — searchable single/multi select with detail pane, groups, select-all.
  - `renderWordmarkBanner`, `installerStep*`, `renderInstallSummaryBox`, `renderCompletionBox`.
- `cmd/litespm/skills_add.go` already uses the good TUI for scope, agents, skills, summary, risk panel, spinner, completion. The catalog/wizard path does not.
- The main menu could use `runSearchPrompt` with `Single: true`, `ShowDetail: true`, and grouped items; the search/scope/confirm screens can use the same model or styled `huh` forms.

### 3.4 MCP name conflict aborts the whole install

`cmd/litespm/install_mcp.go` collision preflight (around lines 494–515):

```go
for _, hostID := range hosts {
    ...
    for _, existing := range names {
        if existing == name {
            return nil, domain.ErrNameConflict(...)
        }
    }
}
```

The user installed Context7. Antigravity already had a `context7` entry, so the entire install failed for all 11 agents with `LPSM-NAME-CONFLICT`. A user expects:

- "Already present in Antigravity, Cursor, ... — install into the other N agents?"
- or "Replace the entry in those agents (backup kept)";
- or "Cancel".

The correct implementation point is **before** the plan is sealed:

- resolve the target hosts and runtime;
- call the new conflict helper;
- ask the user (TUI) how to handle conflicts;
- filter the host set (skip) or set `force = true` (replace);
- put the adjusted host set + force into `mcpInstallBinding` so `authorizeHumanInstall` seals them in the plan hash;
- `mcpInstallBindingFromPlan` already reads `Force` from the sealed plan value, and `installMCPFromListing` takes `force`.

Do **not** silently force. Do not drop conflicting hosts without telling the user.

### 3.5 `list_installed` filter bug

The schema at `internal/bridge/shim.go:134-136`:

```json
{"type":"object","properties":{"kind":{"type":"string"},"enabled":{"type":"boolean"}}}
```

The handler ignored both. A partial fix is applied in §4.

---

## 4. Changes already made (uncommitted)

`go build ./cmd/litespm` passes after these edits. Tests were not run.

### 4.1 `cmd/litespm/auto_update.go`

- Header comment changed to every-run.
- Removed `autoUpdateSessionTTL` and session-based suppression.
- `autoUpdateBurstTTL` is now `30 * time.Second`.
- Marker checks now only suppress within the burst window.
- `autoUpdateLockTTL` and `autoUpdateTimeout` unchanged.
- `autoUpdateSessionID()` is still used to record the marker.
- **Verify:** no leftover references to `autoUpdateSessionTTL`; `gofmt` done; build passed.

### 4.2 `cmd/litespm/auto_update_test.go`

- `TestAutoUpdateRunsOncePerSession` → `TestAutoUpdateChecksAgainAfterBurst`.
  - first run updates; second immediate run does not; after `autoUpdateBurstTTL + 1s` a third run checks again (`calls == 2`).
- `TestAutoUpdateCheckFailureRecordsSessionAndDoesNotBlock` → `TestAutoUpdateCheckFailureRecordsBurstAndDoesNotBlock`.
  - failure is recorded; immediate retry is suppressed; after the burst it retries.
- **Not yet run.**

### 4.3 `internal/bridge/shim.go`

- `list_installed` now decodes `{kind, enabled}` and filters the `tools.list` result before rendering.
- `kind` is case-insensitive; `enabled=true` keeps non-disabled items, `enabled=false` keeps disabled items.
- **Not yet tested.**
- `FormatInstalledPanel` is still not deduped.
- `marketplacePromptText()` is still unchanged (still says "open it for the user").

### 4.4 Earlier, unrelated-to-A changes in the same working tree

These were made in the previous turn to update website commands/docs. Do not revert blindly:

- `README.md` — added `inventory`, `skills adopt`, `adopt`, `audit`, `uninstall`, `self-update`; added `npm update -g litespm`.
- `web/public/docs/litespm-guide.md` — expanded offline command guide.
- `web/src/components/litespm/views/docs.tsx` — full grouped command reference; host-specific prompt names; Qwen `/mcp` correction; install flags.
- `web/src/components/litespm/views/home.tsx` — fixed `litespm remove` → `litespm install remove`.
- `web/src/app/api/litespm/assistant/route.ts` — updated assistant system-prompt command list.
- `web/src/server/litespm/assistant-product.ts` — **untracked** file; edited earlier (69,376 count, `install remove`, commands, host prompts). Preserve it.

---

## 5. Remaining work for Approach A

### A1. Finish auto-update

- [ ] Run `go test ./cmd/litespm -run TestAutoUpdate`.
- [ ] Update docs/comments that still say "first command in a terminal session checks" (at least `README.md`, `AGENTS.md`, `STATUS.md`, `cmd/litespm/auto_update.go` if any residual).
- [ ] Decide whether **every** allowed command or only bare `litespm` should check. Current partial edit makes every allowed interactive command check after the 30s burst. If that adds too much latency, special-case `len(args) == 0` only. The user's words: "everytime litespm is run" — lean toward every run, burst-guarded.
- [ ] Confirm the check remains fail-open, signed, and binary-only (no state/config writes).
- [ ] Consider reducing `autoUpdateTimeout` from 6s if the every-run latency is noticeable.

### A2. Unify the wizard UI

Files: `cmd/litespm/wizard.go`, `cmd/litespm/installer_tui.go`, `cmd/litespm/terminal_ui.go`.

- [ ] Replace the `huh.NewSelect` main menu in `runActionMenu` with `runSearchPrompt` (`Single: true`, `ShowDetail: true`, grouped items). Keep the non-TTY numbered fallback.
- [ ] Replace the plain `What are you looking for?` input with a styled prompt (huh input with title/description, or a Bubble Tea text input for consistency).
- [ ] Replace the plain scope `[1]/[2]` prompt with `runSearchPrompt` (`Single: true`).
- [ ] Replace the plain `[Y/n]` install confirmation with a TUI confirm or styled `huh` confirm.
- [ ] Add a **pre-install summary box** using `renderInstallSummaryBox` for MCP installs:
  - listing name/ID, version, scope;
  - target host display names;
  - command or endpoint + transport;
  - effects;
  - conflicts/already-present hosts;
  - backup note.
- [ ] Add a **completion box** using `renderCompletionBox` after install:
  - server/skill name;
  - each host and config path;
  - "nothing else was changed".
- [ ] Compact `printConfiguredSummary`: print one line with count + names, not every path on every run. `litespm host detect` remains the place for paths. Keep the substring `"LiteSPM is already set up for"` because `wizard_test.go:676` asserts it.
- [ ] Consider removing `printRuntimeSummary()` or shrinking it; the transcript's repeated "50 hosts / nothing changed" is noise.
- [ ] Add tests for the new TUI selection/menu state (existing `installer_tui_test.go` patterns).

### A3. Conflict-aware MCP install

Files: `cmd/litespm/install_mcp.go`, `cmd/litespm/wizard.go`.

- [ ] Add a helper, e.g.:

```go
func mcpConflictHosts(ctx context.Context, hosts []string, name string, scope domain.InstallScope, projectRoot string) []string {
    var conflicts []string
    for _, hostID := range hosts {
        names, err := host.ListServerEntries(ctx, hostID, scope, projectRoot)
        if err != nil {
            continue
        }
        for _, existing := range names {
            if existing == name {
                conflicts = append(conflicts, hostID)
                break
            }
        }
    }
    return conflicts
}
```

- [ ] In `actionFindAndInstall`, inside the `KindMCP` branch after `mcpBinding` is built:
  - get the entry name with `serverEntryNameFor(listing)`;
  - compute conflicts;
  - if non-empty, show a **TUI choice**:
    - "Skip the agents that already have it, install into the remaining N";
    - "Replace the existing entry in those agents (backup kept)";
    - "Cancel".
  - on skip: remove conflict hosts from `mcpBinding.Hosts`; if none remain, print "already present everywhere; nothing to do" and return;
  - on replace: `mcpBinding.Force = true`;
  - on cancel: return without changes.
- [ ] The adjusted `Hosts` + `Force` must be in `mcpBinding` before `authorizeHumanInstall`, because the plan hash seals them (`install_authz.go:263`, `buildInstallPlan`).
- [ ] `mcpInstallBindingFromPlan` already reads `Force` (`install_mcp.go:295`), so execution will honor it.
- [ ] Add tests: conflicts on one of several hosts; skip filters only that host; replace sets force; cancel writes nothing; plan hash includes the filtered set.
- [ ] Do not change the CLI `--force` semantics; this is the wizard UX.

### A4. In-agent marketplace behavior

File: `internal/bridge/shim.go`.

- [ ] Replace the prompt paragraph at `marketplacePromptText()` line ~396:

Current:
> A browser marketplace is available at ... If this host can open links, open it for the user; ...

Replace with something like:
> The in-agent marketplace is a text workflow. MCP prompts cannot render a popup, panel, or live search bar inside the agent. Do **not** launch a browser, computer-use, or any GUI from this prompt. If the user wants the visual marketplace, tell them to run `litespm marketplace` or open the URL themselves. The browser page has four tabs and a live search bar.

- [ ] Add: "Use only the LiteSPM tools listed here; do not use computer-use/browser automation."
- [ ] Add: "Call `list_installed` once (optionally with `kind`), not once per kind."
- [ ] Dedupe `FormatInstalledPanel`:
  - group external items by `kind + name`; parse host from `external:<host>:<name>`;
  - managed items group by ID/name;
  - header count = unique capabilities;
  - add `N deployments · M unique capabilities` summary;
  - external note: `[External / Detected in N agents] (adopt with adopt_capability)`.
- [ ] Update tests in `internal/bridge/bridge_test.go`:
  - kind filter returns only matching kind;
  - enabled filter;
  - duplicate external rows collapse;
  - panel still renders `[External / Detected]` (existing assertion).
- [ ] Update website docs if needed to state explicitly: `/litespm:marketplace` is a **text prompt**, not a popup/search bar. `web/src/components/litespm/views/docs.tsx` already says this; make sure it is prominent.
- [ ] Do **not** promise a popup in docs. The honest limitation is the answer.

### A5. Re-audit (not started)

The user asked for a re-audit of the entire LiteSPM after A. Suggested scope:

- `cmd/litespm/wizard.go`, `installer_tui.go`, `skills_add.go`, `install_mcp.go`, `install_skill.go`, `install_authz.go`.
- `internal/bridge/shim.go` (prompt/tools/panel) and `internal/host/opencode.go`.
- `web/src/components/litespm/views/docs.tsx`, `home.tsx`, `assistant-product.ts`, `assistant/route.ts`, public guide.
- `README.md`, `AGENTS.md`, `STATUS.md` claims about `/marketplace`, auto-update, and install behavior.
- The actual WSL/OpenCode behavior: `npx skills add` auto-detects the agent and goes non-interactive; LiteSPM should not depend on the user knowing flags.

---

## 6. Testing plan

Run, at minimum:

```powershell
gofmt -l cmd internal
go build ./...
go test ./cmd/litespm ./internal/bridge
go test ./...
```

For the web docs changes:

```powershell
cd web
npx tsc --noEmit
npx eslint src/components/litespm/views/docs.tsx src/components/litespm/views/home.tsx src/server/litespm/assistant-product.ts src/app/api/litespm/assistant/route.ts
node scripts/check-web-truth.mjs
```

Manual checks:

- `.\litespm.exe --version` (repo dev build) and `litespm --version` (global v0.6.0).
- `.\litespm.exe doctor` with the existing v5 DB.
- `litespm list`, `litespm search context7`, dry-run install.
- In a real terminal, run bare `litespm` and confirm the new menu/summary/confirm/completion screens.
- Reproduce the Context7 conflict: install into a host that already has `context7`; confirm the new skip/replace/cancel choice.
- In OpenCode/WSL, run `/litespm:marketplace`; confirm it no longer asks for computer-use/browser permission and that the text prompt sets expectations.
- Call `list_installed` with `{"kind":"skill"}` and `{"kind":"mcp"}`; confirm filtering and dedupe.

---

## 7. Constraints and pitfalls

- **Do not promise a popup.** MCP prompts are text. The browser marketplace is a separate page opened by `litespm marketplace`.
- **Do not force-replace without consent.** A conflict must be a user choice; a backup is mandatory for replace.
- **The plan hash binds the target set.** Filtering hosts after `authorizeHumanInstall` would invalidate the plan. Filter/force before the plan is built.
- **Auto-update must stay narrow.** It may write only the binary, cache marker, and lock. Do not open the state DB, catalog, ledger, or agent config; do not run setup/migrations during the check.
- **Do not remove the `Version == "dev"` guard.** A source build must not replace itself with a release.
- **Preserve `web/src/server/litespm/assistant-product.ts`.** It is untracked user work; it was edited in the previous turn and should not be deleted.
- **The working tree has unrelated docs edits.** Don't revert them unless the user asks.
- **Global npm side effects from the previous turn:** `litespm@0.6.0` is installed globally (registry package, not the old `npm link` to `./npm`). The previous dev binaries/backups are under `%USERPROFILE%\.litespm\bin\`:
  - `v0.6.0.dev-backup-20261106-150819\`
  - `litespm-windows-amd64.exe.dev-backup-20261106-150939`
  Restore those only if the user asks for the dev link back.
- **Build status:** `go build ./cmd/litespm` currently passes. `go test` is unknown. Do not claim green until run.

---

## 8. Decision log

- **A chosen** (inline upgrade) over **B** (full-screen tabbed TUI). B is deferred; it is a much larger rewrite and worse for scripts/pipes.
- The in-agent marketplace **cannot** become a popup/search bar through the current MCP prompt. The fix is honest text + no browser/computer-use launch + a pointer to `litespm marketplace`.
- Auto-update becomes **every interactive run**, deduplicated by a 30-second burst window, binary-only.
- MCP conflicts become a **user choice** at plan time: skip conflicting hosts, replace with backup, or cancel.

---

## 9. First commands for the next agent

```powershell
cd C:\Users\Sonali\Desktop\projectwork\business_Dev\liteSPM
git status --short
git diff -- cmd/litespm/auto_update.go cmd/litespm/auto_update_test.go internal/bridge/shim.go
go test ./cmd/litespm -run TestAutoUpdate
go test ./internal/bridge
```

Then continue with **A2** (wizard TUI), **A3** (conflict choice), **A4** (marketplace prompt + dedupe), and only then the broader re-audit.
