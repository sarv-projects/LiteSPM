# Client and Installation Design

## 1. Entry Points and Interactive Workflows

> **Phase-J command surface (`DESIGNED`).** The planned `copy`, `list`,
> `inventory`, orient commands (`status`/`diff`/`why`/`outdated`) and the
> `help` redesign are specified in [ARCH/38](38-CLI-PRODUCT-SURFACE.md) and
> are not implemented; this document covers what ships today.

LiteSPM provides both an interactive terminal interface for humans and a structured programmatic interface for agent hosts.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        User / Terminal Client                          │
│                                                                        │
│   $ litespm (Setup + Management Wizard)                                │
│     ├── Agent Selector (all 50 adapters, detected first)               │
│     ├── Automated Host Configuration Path Detection                    │
│     ├── Manual Path · Change Preview · Confirmed Merge                 │
│     └── "What next": catalog update / install / remove / list          │
│                                                                        │
│   $ litespm setup --agent <host-id> · host setup <host-id>             │
│   $ litespm search / install / uninstall / catalog sync / doctor       │
│   $ litespm init <name> · skills add <source> (clone, select, copy)    │
│   $ litespm agent list|resolve · skills use|find|list|update|remove    │
│   $ litespm self-update · daemon serve · bridge stdio [--host <id>]    │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Agent Host Client                               │
│                                                                        │
│   In-Agent /marketplace Slash Command & Progressive Tool Discovery         │
│     ├── search_catalog(query, kinds, limit)          — resolves        │
│     ├── get_extension(id) / list_installed()         — resolves        │
│     ├── load_skill(id) / read_skill_resource(...)    — resolves        │
│     ├── prepare_install(id, version) -> InstallPlan  — resolves        │
│     ├── request_install(planId, approvalToken)       — completes for    │
│     │     skills (files), MCP (host entry); plugins need a locator       │
│     └── search_capabilities / describe_capability /                    │
│           invoke_capability                       — resolve            │
│         get_invocation / cancel_invocation        — JSON-RPC -32601    │
└────────────────────────────────────────────────────────────────────────┘
```

> Command notes (`cmd/litespm/main.go:65-216`): there is **no** `info` or `update` subcommand —
> `update` is an alias of `self-update` (binary update only). Removal is `uninstall` (bridge
> entries in host configs), `host remove <host-id>` (one host), or `skills remove` (skills);
> `litespm setup` (and the bare `litespm`) opens the interactive wizard, and
> `litespm setup --agent <host-id>` is the non-interactive form — the same write path as
> `litespm host setup <host-id>` (`cmd/litespm/main.go:537-578`). `litespm init` is **not** an
> alias of the wizard: it dispatches to `runSkillsInit` (`cmd/litespm/main.go:72-75`,
> `cmd/litespm/skills_init.go`) and scaffolds a `SKILL.md`.
>
> **Remote archive install resolution is not wired, and is not what a plugin install uses.**
> `litespm install <listing-id> [--version <ver>] [--scope user|project]` resolves the listing from
> the local catalog index and routes by kind: **skills install for real** (fetch → ledger →
> record), **MCP servers register their published launch descriptor in approved host configs**, and
> **a plugin with a published, pinned git tree installs that tree's portable components** — its MCP
> servers registered, its skills copied into each target host's skills tree. A plugin with no
> fetchable pinned source fails closed with `LPSM-ARTIFACT-UNAVAILABLE`; one whose manifest declares
> commands, hooks, subagents or LSP servers is refused with `LPSM-INSTALL-PARTIAL` unless
> `--allow-partial` acknowledges losing them, and that acknowledgement is sealed into the plan. The
> earlier in-memory synthetic archive is gone, and the bridge's `request_install` completes for the
> same three cases ([STATUS.md](../STATUS.md) §3). `--workspace <dir>` (2026-10-11) names the
> project for a project-scope install: it implies `--scope project` and is sealed into the plan
> ([STATUS.md](../STATUS.md) §3).

---

## 2. Interactive Setup Wizard & Agent Auto-Detection

Running `litespm` (or `litespm setup`) without further arguments opens the interactive wizard:

### Step 1: Agent Selection
```text
Which AI coding agent do you use?

Found on this machine (1):
  [1] Claude Code                    /home/you/.claude.json
  [a] Show all 50 supported agents
  [q] Quit
Enter a number, an agent name, or 'a' [q]:
```

> The rows are derived from the adapter registry (`host.ListAdapters()`,
> `cmd/litespm/wizard.go:agentMenuRows`), so all 50 bridge targets are reachable from the wizard
> (6 bespoke + 44 generic, ARCH/30) — detected agents first, `[a]` for the full list. There is
> **no** "Generic MCP Configuration (Export JSON)" entry, and no row names a config file the
> adapter itself did not resolve.

### Step 2: Automated Path Discovery & Detection Matrix
LiteSPM probes known default configuration locations by platform:

| Target Agent | Linux / macOS Default Path | Windows Default Path |
|---|---|---|
| **Claude Code** | `~/.claude.json` (project `.mcp.json`; local scope entry inside `~/.claude.json`) | `%USERPROFILE%\.claude.json`; `CLAUDE_CONFIG_DIR` relocates `.claude.json` and is honored by the adapter |
| **OpenAI Codex** | `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`; project `.codex/config.toml`, trusted projects only) | `%USERPROFILE%\.codex\config.toml` (`$CODEX_HOME` is honoured; `%APPDATA%\Codex\config.toml` is not probed) |
| **Grok Build** | `$GROK_HOME/config.toml` (default `~/.grok/config.toml`; project `.grok/config.toml`) | `%USERPROFILE%\.grok\config.toml` (`%APPDATA%\Grok\config.toml` is not probed) |
| **Pi Agent** | `~/.pi/agent/mcp.json` (`PI_CODING_AGENT_DIR` relocates the agent dir; project `.pi/mcp.json`, trust-gated) | `%USERPROFILE%\.pi\agent\mcp.json` (`PI_CODING_AGENT_DIR` honoured; the former `~/.pi/config.json` / `~/.pi/mcp.json` are not probed) |
| **OpenCode** | `$OPENCODE_CONFIG_DIR/opencode.json(c)`, else `$XDG_CONFIG_HOME/opencode/opencode.json(c)` (default `~/.config/opencode/`; project `opencode.json(c)` or `.opencode/`) | `%USERPROFILE%\.config\opencode\opencode.json(c)` (xdg-basedir on every OS; `%APPDATA%\OpenCode\opencode.json` is not probed) |
| **Cline (extension, CLI, JetBrains)** | `~/.cline/data/settings/cline_mcp_settings.json` (`CLINE_MCP_SETTINGS_PATH` / `CLINE_DATA_DIR` / `CLINE_DIR` relocate it, most specific wins) | `%USERPROFILE%\.cline\data\settings\cline_mcp_settings.json` (same overrides; VS Code `globalStorage` paths are a legacy read-only fallback probed last) |

> Paths above are the candidate lists in `internal/host/*.go` (`cline.go:61`, `codex.go:43`,
> `grokbuild.go:40`, `piagent.go:38`, `opencode.go:51`, `claudecode.go:29`); the first existing
> candidate wins, and the first candidate is returned as the suggested path when none exist.
> **Cline's globalStorage paths are legacy:** current Cline reads the shared
> `~/.cline/data/settings/…` file and only migrates from globalStorage once, so LiteSPM probes it
> last and writes the shared path (`internal/host/cline.go:30-60`).
>
> **Env-var overrides are per-adapter, verified data.** `$CODEX_HOME` is honoured
> (`internal/host/codex.go:43-49`), as are `CLAUDE_CONFIG_DIR` and OpenCode's explicit
> `OPENCODE_CONFIG` (`internal/host/claudecode.go`, `opencode.go`). Neither
> `%APPDATA%\Codex`, `%APPDATA%\Grok` nor `%APPDATA%\OpenCode` is probed
> ([ARCH/16 §3.4–§3.6](16-HOST-ADAPTERS.md)). (`internal/skills` *does* honour `CODEX_HOME`,
> `CLAUDE_CONFIG_DIR`, `GROK_HOME` and `XDG_CONFIG_HOME`, but only when choosing where to write
> skill directories — `README.md` §skills.)

### Step 3: Graceful Fallback Options
If the configuration file is absent (or the user declines the detected path), the wizard prompts
(`cmd/litespm/wizard.go:384-394`):
```text
Could not work out where Claude Code keeps its configuration file.

What would you like to do?
  [1] Type the full path of the configuration file
  [2] Print a snippet to paste into the file yourself
  [3] Look for the file again
  [q] Cancel setup
```
A typed path is honoured: `host.PlanSetupAt` plans the merge against exactly that path and refuses
an adapter that would write elsewhere, naming the file it would use instead
(`internal/host/types.go:82-117`).

### Step 4: Preview, Then Safe Atomic Configuration Injection
1.  **Preview & Confirm:** the wizard prints the changed lines (`changePreview`, trimmed to the
    touched region with an honest `… and N more changed line(s)`) and writes only after
    `Write this change? [Y/n]` (`cmd/litespm/wizard.go:450-483`).
2.  **Backup:** Copies the target configuration to `DATA_ROOT/backups/<host-id>_<YYYYMMDD_HHMMSS>_<8-hex>.bak` (flat directory, mode `0600` — `internal/host/backup.go:19-45`).
3.  **Parse & Merge:** Parses JSON/JSONC (comments preserved — `internal/host/jsonc_merge.go`) or merges TOML line-wise outside the managed table (`internal/host/generic.go:mergeTOMLEntry`), then injects a single `litespm` bridge entry for the selected host (shown below for `claude-code`):
    ```json
    {
      "mcpServers": {
        "litespm": {
          "command": "/usr/local/bin/litespm",
          "args": ["bridge", "stdio", "--host", "claude-code"]
        }
      }
    }
    ```
    Only this one `litespm` entry is registered per host; the `--host <agent-id>` argument tells the daemon which host is calling, and individual capabilities are resolved by the daemon at runtime (no per-capability host snippets are written, and no version field is embedded in the entry). Hosts whose format expects a local-array shape receive `{"type": "local", "command": ["<bin>", "bridge", "stdio", "--host", "<id>"]}` instead (`internal/host/generic.go:300-316`).
4.  **Atomic Replacement:** Writes to a temporary file on the same filesystem, validates syntax, and renames atomically.
5.  **Detection of pre-existing tools:** After setup the wizard lists any pre-existing native tools found in the config as read-only discoveries; **`Adopt` is not implemented** (`DESIGNED` — STATUS §5).
6.  **"What next" menu:** a bare `litespm` after setup — or on a machine that is already configured — offers catalog update (the explicit, confirmed `catalog sync`), find/install (the same plan → approval → policy gate as `litespm install`), remove (`removeInstalledPackage` / `executeSkillsRemove`), and the `litespm list` inventory (`cmd/litespm/wizard.go:568-620`).

---

## 3. Local Storage Layout (`DATA_ROOT`)

Platform roots (`internal/config/paths.go:42-96`):

| Root | Windows | macOS | Linux |
|---|---|---|---|
| `DATA_ROOT` | `%LOCALAPPDATA%\LiteSPM` | `~/Library/Application Support/LiteSPM` | `$XDG_DATA_HOME/litespm` (default `~/.local/share/litespm`) |
| `CONFIG_ROOT` | `%APPDATA%\LiteSPM` | same base as `DATA_ROOT` | `$XDG_CONFIG_HOME/litespm` (default `~/.config/litespm`) |
| `RUNTIME_ROOT` | **= `DATA_ROOT`** | `~/Library/Caches/LiteSPM/run` | `$XDG_RUNTIME_DIR/litespm`, else `/tmp/litespm-<uid>` |

> **Legacy adoption:** pre-rename `LitePSM`/`litepsm` roots, `LITEPSM_*` environment variables,
> and the legacy `.litepsm` project config are adopted automatically when the new-name root does
> not exist (`internal/config/paths.go:119-174`; `LITESPM_*` overrides win first). Runtime
> endpoints (socket/pipe) always use the current names.

```text
DATA_ROOT/
  ├── state.db                     # SQLite database in WAL mode (22 tables)
  ├── state.db-wal                 # SQLite Write-Ahead Log
  ├── state.db-shm                 # SQLite Shared Memory index
  ├── daemon.lock                  # Exclusive daemon lock; file contents = daemon PID
  │                                #   (there is no daemon.pid file anywhere)
  ├── cas/
  │   └── trees/
  │       └── sha256/<64-hex>/     # Immutable unpacked package trees — the entire CAS
  │                                #   (internal/install/engine.go:471-482; no artifacts/ dir)
  ├── staging/
  │   └── <operation-id>/          # In-flight extraction (source.archive, extracted/)
  ├── backups/
  │   └── <host-id>_<timestamp>_<8-hex>.bak   # Pre-edit host config snapshots (flat)
  └── v1/
      ├── current.json             # Catalog client cache: release pointer
      └── releases/<release-id>/
          ├── manifest.json        # Written by `litespm catalog sync` (DATA_ROOT
          └── listings.json        #   is the cacheDir — cmd/litespm/main.go:719,894)

CONFIG_ROOT/
  └── config.toml                  # User config; project override .litespm/config.toml
                                   #   (legacy .litepsm/config.toml) — internal/config/config.go:97-105

RUNTIME_ROOT/
  └── litespm.sock                 # Unix socket, dir 0700 / file 0600 (Linux, macOS)
                                   # Windows instead uses the named pipe
                                   #   \\.\pipe\litespm-daemon-<12-hex-of-username>
                                   #   (internal/config/paths.go:56-64) — no socket file
```

Directories are created with mode `0700` by `EnsureDirectories` (`internal/config/paths.go:228-244`):
`DataRoot`, `ConfigRoot`, `RuntimeRoot`, `cas/`, `backups/`, `staging/`. There is **no**
`runtimes/` or `cache/` directory. Skill directories installed by `litespm skills add` are copied
into each host agent's own skills tree (outside `DATA_ROOT`) and are removed only by
`litespm skills remove`.

---

## 4. Pure Dependency Resolver Algorithm

LiteSPM's dependency resolver is pure and deterministic: it performs no disk I/O or network fetches
during resolution (`internal/resolver/resolver.go`):
1.  **Input:** target `ListingId` and requested version constraint.
2.  **Recursive DFS traversal:** a visited-set depth-first walk over dependency declarations (`resolver.go:195-227`).
3.  **Cycle Detection:** if a node re-occurs on the traversal stack, halts with `LPSM-RESOLVE-CYCLE`.
4.  **Constraint Intersection (semver):** determines whether requested version ranges intersect.
    *   If compatible versions exist, selects the highest stable immutable release.
    *   If conflicting constraints exist without an intersection, halts immediately with `LPSM-RESOLVE-CONFLICT`.
5.  **Output:** an immutable `InstallPlan` with exact versions, content digests, and resolved dependency order; the install path persists it with a canonical `planHash` (`db.SavePlan`, `cmd/litespm/main.go:1391`) and the engine re-verifies hash and expiry on execution (`internal/install/engine.go:94`).

---

## 5. Update and Upstream Repack Handling

### 5.1 Passive Update Checks (target — partially implemented)
The intended flow: whenever a user runs `litespm` or an agent invokes `/marketplace`, the client
passively reads `/v1/current.json` and compares installed versions against catalog versions,
**never mutating local files** without an explicit update command.

What actually happens today:
*   The setup flow makes no HTTP request and prints no advisory metadata: `printRuntimeSummary`
    (`cmd/litespm/wizard.go:154-162`) reports how many adapters are compiled in and claims no
    runtime check. The wizard's *Update the capability catalog* action is an explicit, confirmed
    `catalog sync` (`wizard.go:656-705`).
*   In-agent `/marketplace` reads resolve against the **local catalog index**, refreshed only by an
    explicit `litespm catalog sync` (which succeeds against the live origin — STATUS §2).
*   `litespm update` / `self-update` updates the **binary** (`internal/update` SHA-256 fail-closed, plus the release's keyless Sigstore bundle when one is published — `cmd/litespm/main.go:391-438`; `v0.4.0` is the first tag to publish one), not installed capabilities.

### 5.2 Update Delta Evaluation — `DESIGNED`
There is no `litespm update <listing-id>` command today (any such invocation is parsed as the
`self-update` alias and updates the binary). The specified target: an update plan detailing the
version jump and artifact SHA-256 delta, changes in declared effects, provider launch-argument
changes, and new/removed tools and skills. See [STATUS.md](../STATUS.md) §3 and `ARCH/32`
(manifest/lockfile) for the lockfile-driven path.

### 5.3 Upstream Repack Detection — `DESIGNED`
If an upstream source re-publishes the same version string with a modified artifact digest:

$$\text{Installed Digest } \neq \text{New Upstream Digest for identical version}$$

1.  Flag the artifact as `status: "repacked/mutated-upstream"`.
2.  Block automatic installation.
3.  Warn the user that upstream maintainers modified release artifacts in-place, requiring explicit confirmation to proceed.

No repack detection exists in code; it depends on remote resolve/verify being wired (STATUS §3).

---

## 6. Removal and Garbage Collection

### What exists today
1.  **`litespm uninstall [--dry-run]`** removes the `litespm` bridge entry from every managed host
    config (`cmd/litespm/main.go:807-963`): it strips the entry only when present, backs the file
    up first, reports untouched/failed hosts, and afterwards reports what it deliberately left
    behind — the MCP server entries registered by `litespm install`, each with its exact
    `litespm install remove <installId>` command, and the skill directories copied by
    `litespm skills add`. Skill directories and backups are not deleted. Bridge-entry removal is
    presence-based (`internal/host/remove.go`).
2.  **`install.remove` (IPC) + `litespm install remove <installId>`** remove one installed package
    as a ledger-driven unit: reconcile the deployment ledger three-way, strip only the host-config
    nodes still matching what LiteSPM wrote (restoring a user entry the install replaced), keep
    user-edited nodes, then delete the state rows in one transaction — `installs` deletion
    cascades to components and providers (`cmd/litespm/lifecycle_wire.go:164-196`,
    `internal/state/repositories.go:504-520`). Removing a missing install is an explicit not-found
    error.
3.  **`litespm skills remove <name>|--all`** removes skills recorded in the skills ledger
    (`cmd/litespm/skills_*.go`), including their copied directories.

### Target algorithm — `DESIGNED` where noted
1.  **Identify Install Record:** query SQLite for the target `InstallId` and resolve all associated components. *(exists)*
2.  **Active Session Check:** query `provider_sessions`; if a managed provider process is running, stop it gracefully (`SIGTERM` / `WM_CLOSE`). **Not implemented** — uninstall paths do not consult the supervisor.
3.  **Database Commit:** in one transaction remove `installs`, `install_components`, `capabilities`, and `capability_grants` records. *(row deletion exists for `installs`/`install_components` — components and providers cascade; `capabilities`/`capability_grants` are written by production code today — `internal/discover` and `litespm grant` — and are not explicitly purged by this path)*
4.  **Unreferenced CAS Pruning:** scan `cas/trees/sha256/…` and delete trees no active installation references. **Not implemented** — no prune/GC routine exists (STATUS §3).
5.  **Host Config Cleanup with fingerprint:** when removing a host entry, compare it against the
    recorded pre/post image and leave a user-modified file intact. **Implemented** for
    `install remove` through the deployment ledger (`internal/deployment.Reconcile`, `ARCH/33`);
    bridge-entry removal (`host remove` / `uninstall`) remains presence-based.
