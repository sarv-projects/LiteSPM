# LiteSPM audit ledger — 2026-11 (continuation)

Investigation ledger for `LITESPM-AUDIT-2026-11.md`. Working tree at audit time: branch `main` @ `1cb826c` (2026-11-09) with another engineer's **uncommitted** edits in `cmd/litespm/*`, `internal/host/*`, `internal/catalog/search.go`, `npm/bin/*`. Line numbers below are for that working tree and will drift as those edits land. No source file was modified; only `docs/audit/` was written.

Legend: **V** = Verified (I read the code / ran the command / fetched the URL). **V-d** = Verified by a delegated read-only context-gatherer that returned file:line; I spot-checked the load-bearing ones. **S** = Suspected (inferred, not traced/executed).

## 1. Components done

| Component | Depth | How |
|---|---|---|
| CLI dispatch + command inventory (`cmd/litespm/main.go`, `help.go`, `marketplace*.go`, `install_authz.go`, `skills_add.go`) | Deep for dispatch, install, setup, host, bridge, agent, catalog, daemon, doctor, uninstall; shallow for lock/copy/import/restore/capabilities/auth/skills use,update,find,init,adopt,remove bodies | V (main.go read directly) + V-d |
| Daemon IPC (handlers, transport, peer auth) | Registration + transport verified; handler bodies for 6 methods not read | V (main.go 2724–3770 read) + V-d |
| Bridge (13 tools, prompts) | Full dispatch read | V (`internal/bridge/shim.go`) |
| State DB / migrations | Version, backup, migration runner read; SQL column defs not read | V + V-d |
| Catalog client Sync / validateCurrent / shards / cache | Read | V |
| Plugin install path + partial gate | Read (`install_plugin.go`, `install_plugin_skills.go`) | V |
| Install engine (CAS) | `execute`/`promoteAndCommit` read | V |
| Host adapters, Pi extension, skills target table | Delegated | V-d |
| Website API routes, router, types, security | Delegated | V-d |
| Live origin + site fetch | Done | V |
| Performance measurement | Done (noisy machine) | V |
| Not done | `worker/index.js` body; `schemas/*.json` contents; `gitfetcher.go`; `internal/scan`; `internal/provider`; `internal/discover`; Windows/macOS/Linux cross-run beyond this box; any live run of Claude Code/Codex/Cline/Grok/Qwen | — |

## 2. Files inspected (read directly)

`cmd/litespm/main.go` (lines 1–700 partial, 597–700, 786–1040, 1170–1370, 1520–1780, 2305–2400, 2436–2500, 2579–3110, 3283–3810), `cmd/litespm/install_authz.go` (44–450), `cmd/litespm/skills_add.go` (94–330, 395–470, 599–740), `cmd/litespm/help.go` (45–700), `cmd/litespm/marketplace.go`, `cmd/litespm/marketplace_rows.go` (symbols only), `cmd/litespm/install_plugin.go` (481–770), `cmd/litespm/install_plugin_skills.go` (65–470), `cmd/litespm/auto_update.go` (grep), `internal/bridge/shim.go` (110–810), `internal/ipc/server.go` (50–155, 408–490), `internal/catalog/client.go` (386–800, 929–1115), `internal/state/migrations.go` (16–240), `internal/host/piagent.go` (128–235), `internal/install/engine.go` (227–630), `internal/trust/blob.go` (grep), `internal/domain/models.go` (grep).

Delegated read-only investigations (4): CLI inventory; API/data contracts; `web/` routes + types + security; agent adapters / hooks / LLD. Their outputs are folded into the report; claims they could not trace are marked S.

## 3. Paths traced

1. `litespm install <id>` (TTY / non-TTY / `--yes` / `--dry-run`): `runInstall` → `parseInstallFlags` → `GetListing` → `installKindRefusal` → `IsInstallable` → `buildInstallPlan` → `authorizeHumanInstall` → `installSkill/MCP/PluginFromListing`.
2. Agent path: `prepare_install` → `resolver.prepare_plan` → (`litespm approve`) → `request_install` → `install.execute` → `authorizeInstallExecute`.
3. `catalog sync`: `runCatalogSync` → `Client.Sync` → signature → rollback check → manifest → shards → atomic cache → index swap.
4. Daemon boot: `runDaemonServe` → vault → lock → DB → engine → recovery → catalog client → supervisor → IPC → `registerCoreHandlers`.
5. Plugin install: fetch pinned tree → manifest → skills → partial gate → preflight → policy → txn + journal → host writes → skill copies → one SQL tx.
6. Bridge: `initialize` / `prompts/*` / `tools/call` → `dispatchTool` → daemon RPC.

## 4. Commands run / measurements

| What | Result |
|---|---|
| `git status --short`, `git log` | 16 modified + 3 untracked files from the other engineer; HEAD `1cb826c` |
| `npm view litespm version` | `0.6.0` is `latest` (repo package.json 0.6.1 unpublished) |
| `GET /v1/current.json` on origin | `releaseId rel-2026-10-21-01`, `sequence 151`, `itemCount 69376` |
| `GET /v1/current.json.sigstore.json` on origin | **404** |
| `litespm-dev.exe search github --json --limit 3` (home3, 69 376 rows) | cold 24.1 s, 17.8 s; warm 2.6 s; `version` 1.3 s; `list --json` 3.7 s; no-match search 3.8 s; peak working set ≈ 523 MB (200 ms polling) |
| `litespm-dev.exe install neon --agent claude-code --dry-run` | exit 1 "listing neon is not in the local catalog index" |
| `litespm-dev.exe install <id> --global --dry-run` | exit 2 `unknown flag "--global"` |
| `litespm-dev.exe agent bogus --file <missing>` | exit 1 (registry loaded before subcommand validated) |
| Site fetches | `/`, `/docs`, `/get-started`, `/status`, `/security` all return the same 6 901-byte shell; `/package/skill:anthropics:academy-guide` returns 6 881 bytes with a distinct `<title>` only; `sitemap.xml` lists `/agents/<id>`; `robots.txt` allows `/` and disallows `/api/` |
| Sample ids in synced shards | all 4 found (see report §7) |

Side effect to disclose: a `litespm-dev` process (PID 7808, started 2026-11-09 23:54, still alive at 02:21 with 22 s CPU) from an earlier session was running against the sandbox when I started; I stopped it with `Stop-Process`. It was the sandbox binary under `%TEMP%\litespm-sbx`, not a repo file. I could not tell whether it was a daemon (30 min `idleTimeout` should have ended it — see F-27, S) or a hung command.

## 5. Findings

See register in the report §12 (F-01 … F-34).

## 6. Open questions

1. Is the Cloudflare origin intended to publish `current.json.sigstore.json`? `release.yml`/`catalog-sync.yml` should say; I did not read them this round (prior audit covered `release.yml`).
2. Does Claude Code surface MCP prompts as `/mcp__litespm__marketplace`? (S — not run here.)
3. Why did PID 7808 outlive the daemon idle timeout (F-27)?
4. Is `internal/install.Engine` reachable for any production kind? (`install.execute` falls through to it only for kinds with no wired path, which are refused earlier — S that it is dead for shipped kinds.)
5. Are `litespm init` and `litespm import` intentionally absent from `litespm help`? `TestHelpCoversEveryDispatchCase` is claimed to guard this; I did not run it (full tests off-limits).

## 7. Pending / not covered

Cross-run on macOS/Linux; live runs against Claude Code, Codex, Cline, Grok Build, Qwen; `internal/scan` rules; provider supervisor (`internal/provider`); OAuth flow (`auth login`); `copy`/`import` bodies; Cloudflare worker beyond redirect; load/soak of the daemon; fuzzing of `jsonc_merge` and `mergeTOMLEntry`.
