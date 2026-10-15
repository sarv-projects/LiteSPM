# Supported AI Agents & Integration Guide

**LiteSPM** — *the package manager for AI agents*. It connects once to your AI agent host, enabling you to discover, install, update, and monitor MCP servers, skills, and plugins through a single unified interface.

> **State.** An install completes for **skills and MCP servers** — plan, human approval, then the
> skills ledger or a host-config registration. A **plugin** install cannot complete: there is no
> plugin artifact source, so it fails closed with `LPSM-ARTIFACT-UNAVAILABLE` rather than
> installing half a bundle. The catalog release tree is published and the live origin serves it.
> [STATUS.md](STATUS.md) is the single source of truth for what each subsystem actually does; this
> guide states the wiring, not the aspiration.

## 0. The skills CLI (a first-class surface, not a bridge detail)

`litespm skills` is a complete skills manager in its own right, and the table below is the whole of it.
Anything an agent host does through the bridge is a second path to the same ledger — never a second
implementation.

| Command | What it does |
|---|---|
| `skills add <source>` | Plan, approve and copy skills into each target host's own skills tree. `--skill '*'`, `--agent '*'` and `--all` select in bulk; `--full-depth` escapes the discovery bounds; `--force` overwrites with a printed `overwrites: <path>`, a pre-image digest and a byte-exact backup |
| `skills use <source>[@<skill>]` | Prints the skill's prompt to stdout and **installs nothing** — `litespm skills use <src> \| claude`. `--agent` is not wired and refuses with that reason: LiteSPM configures hosts, it does not launch them |
| `skills find [<query>] [--owner <org>]` | Searches the local catalog index for skills |
| `skills list` / `ls` | The ledger, filterable by `-g` and `-a <id>` |
| `skills update [<name>...]` | Re-copies from each row's recorded source; no arguments updates everything. `-g`/`-p` scope, `-y` skips the scope prompt |
| `skills remove` / `rm` | Ledger-scoped removal by name, by exact source, or `--all`; only directories the ledger names are ever deleted |
| `litespm init [name]` | Scaffolds a `SKILL.md` that parses under the real loader |

**Sources:** `owner/repo`, an `https` or `ssh`/`git@` git URL, a local directory, a GitHub/GitLab
browse URL, or a direct download (a bare `SKILL.md` or a `.zip`/`.tar`/`.tar.gz` — the format is sniffed
from the bytes, the extension is not required). `http://`, `file:` and `ftp://` are refused. A skill
marked `metadata.internal: true` is hidden and refused unless `INSTALL_INTERNAL_SKILLS=1`.

```text
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      Cline      │       │    Pi Agent     │       │   Grok Build    │
│(VS Code Plugin) │       │(Terminal Agent) │       │ (xAI Dev Tool)  │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │ Stdio MCP Bridge
                                   ▼
                      ┌─────────────────────────┐
                      │   LiteSPM Local Core    │
                      │  (Daemon & CAS Store)   │
                      └─────────────────────────┘
```

---

## 1. Supported Agent Directory

| Agent Host | Environment | Configuration Format | Default Config Path |
|---|---|---|---|
| **Cline** | VS Code Extension (plus the Cline CLI / JetBrains clients) | JSON (`cline_mcp_settings.json`) | **Current default (written):** `~/.cline/data/settings/cline_mcp_settings.json`, relocated by `CLINE_MCP_SETTINGS_PATH` or `CLINE_DATA_DIR`. **Legacy (read-only fallback, probed last):** the VS Code `globalStorage` path — Windows `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\`, macOS `~/Library/Application Support/Code/User/globalStorage/…`, Linux `~/.config/Code/User/globalStorage/…` (plus `Code - Insiders`); current Cline reads it only in a one-shot migration (`internal/host/cline.go`) |
| **Pi Agent** | Terminal Coding Agent (`pi`) | JSON (`mcp.json`) + TS Extension | `~/.pi/agent/mcp.json` (Windows `%USERPROFILE%\.pi\agent\mcp.json`), relocated by `PI_CODING_AGENT_DIR`; written under `mcpServers`, the only container Pi reads. Project `.pi/mcp.json` is host-documented but **not** scanned by the adapter, and the former `~/.pi/config.json` / `~/.pi/mcp.json` fallbacks were **removed** — no Pi release reads them (`internal/host/piagent.go`) |
| **Grok Build** | Terminal / IDE (`grok`) [id: `grok-build`] | TOML (`config.toml`) | `$GROK_HOME/config.toml` (default `~/.grok/config.toml`; Windows `%USERPROFILE%\.grok\config.toml`). Project `.grok/config.toml` is host-documented but not scanned; `%APPDATA%\Grok\config.toml` was **removed** as a fallback (`internal/host/grokbuild.go`) |
| **Claude Code** | Terminal CLI (`claude`) | JSON (`~/.claude.json`) | Unix: `~/.claude.json`<br>Windows: `%USERPROFILE%\.claude.json`<br>Project: `.mcp.json` in project root (local scope entry in `~/.claude.json`)<br>Host-side: `CLAUDE_CONFIG_DIR` overrides the config directory **for Claude Code itself**; LiteSPM's adapter does not read it (`ARCH/16` §3.4) |
| **OpenAI Codex** | Terminal CLI (`codex`) | TOML (`config.toml`) | `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`; Windows `%USERPROFILE%\.codex\config.toml`) — the adapter **does** honour `$CODEX_HOME`. Project `.codex/config.toml` is host-documented but not scanned; `%APPDATA%\Codex\config.toml` was **removed** as a fallback (`internal/host/codex.go`) |
| **OpenCode** | Open-source CLI (`opencode`) | JSON (`opencode.jsonc` preferred, else `opencode.json`) | `$OPENCODE_CONFIG_DIR/{opencode.jsonc,opencode.json}` when set, else `$XDG_CONFIG_HOME/opencode/` (default `~/.config/opencode/`), `.jsonc` first — on every OS, because OpenCode resolves the directory through xdg-basedir. Project scope and `%APPDATA%\OpenCode\opencode.json` are **not** read by any release and are no longer probed. One layout only: servers are direct members of `mcp` (`internal/host/opencode.go`) |

> Six bespoke adapters above. The full registry is 50 bridge targets (6 bespoke + 44 generic `BridgeTarget` rows) plus 81 skill targets — the 77 transcribed rows plus the `universal`/`warp`/`grok`/`pi` ids appended 2026-10-14; the generated `web/data/skill-targets.json` still lists the old 77 until the generator is re-run — see `ARCH/30-DATA-DRIVEN-BRIDGE-TARGETS.md` and `litespm host list`.

---

## 2. Setup Workflow

### Step 1: Install LiteSPM Globally
Install via npm or download the pre-compiled binary:
```bash
npm install -g litespm
```

### Step 2: Run the Interactive Setup and Manager
```bash
litespm
```
The wizard (`cmd/litespm/wizard.go`) is the non-developer surface for setup **and** management; every
action it offers delegates to the same shared implementation the CLI uses.

1.  **Machine check first.** Before anything is offered, the wizard reads each adapter's `VerifySetup`
    (read-only) and lists the hosts that already carry the LiteSPM bridge. A machine with one
    configured host does **not** re-apply setup: a second bare `litespm` prints `LiteSPM is already
    set up for: … / Nothing was changed.` and goes straight to the "What next" menu. Setup runs only
    when no bridge verifies, or when `[5] Set up or repair an agent connection` is chosen.
2.  **Agent menu, derived from the registry.** The rows come from `host.ListAdapters()` — currently
    50 hosts — so the menu cannot drift from the adapters. Agents whose config file is already on
    disk are shown first; `[a]` prints the full list; a number, host id or display name is accepted.
    No row names a file the adapter itself did not resolve.
3.  **Honest config-target wording.** An existing file prints `Found your existing configuration
    file: <path> / LiteSPM will add one entry to this file … a backup copy is saved first.` A missing
    file prints `No configuration file exists yet for <name>. LiteSPM will create: <path>`. (This is
    what `litespm host detect` means too: its `missing` **status** means "not registered", not "the
    file is absent".)
4.  **Fallback options.** If detection cannot produce a path — or the user answers `n` — the wizard
    offers *Type the full path yourself*, *Print a copy-paste snippet*, *Look again*, and *Cancel*.
    A typed path is honoured: `host.PlanSetupAt` plans the merge against exactly that path, and an
    adapter that cannot write there is refused with the file it would use instead, with nothing
    written. The invariant is *the path written is the path the user agreed to, or nothing is
    written* — never a silent redirect to the detected default.
5.  **The change is shown before it is made.** The wizard prints the changed lines (trimmed to the
    touched region, capped with an honest "… and N more changed line(s)") and asks `Write this
    change? [Y/n]`. Only after a yes does it back the file up into `DATA_ROOT/backups/` and apply
    the adapter's surgical merge, which preserves all existing entries and comments and injects a
    **single** version-pinned LiteSPM Bridge entry (`litespm bridge stdio --host <agent-id>`). The
    setup step is an **MCP-entry merge only**: no instruction, skill, or command file is written
    into the host by it.
6.  **The "What next" menu** (reachable after a fresh setup and on every later bare `litespm` run):
    *   `[1] Update the capability catalog` — the one step that touches the network, and an explicit
        opt-in that says what it fetches and installs nothing. A failure prints `✗ Could not update
        the catalog: …` and names `litespm catalog sync` (and the `npm install -g litespm` update
        path when the local index is still empty); a failure never prints a success line. The
        wizard performs no other HTTP at setup time.
    *   `[2] Find and install a capability` — searches the local index and installs through the
        **same plan → approval → policy gate** as `litespm install`: `authorizeHumanInstall`, then
        `installSkillFromListing` (skills) or `installMCPFromListing` (MCP servers). There is no
        wizard-only installer; plugin listings refuse honestly with `LPSM-ARTIFACT-UNAVAILABLE`.
    *   `[3] Remove something LiteSPM installed` — lists what the install records and the skills
        ledger hold, shows every destination, and removes through `removeInstalledPackage` (ledger
        reconcile: only what LiteSPM wrote, user-edited nodes kept) or `executeSkillsRemove` for
        ledger-only skills (`skills add`).
    *   `[4] See what is installed` — renders the same `litespm list` inventory (`runListTo`).
    *   `[5] Set up or repair an agent connection` — re-enters the setup sequence above.
7.  **Input that ends stops the wizard.** Every prompt checks its read error: EOF / Ctrl-D / a closed
    pipe prints one guidance line (`No more input could be read … Re-run litespm in a terminal to
    continue.`) and exits cleanly with nothing further changed — never the old "Invalid option."
    busy loop.

---

## 3. The In-Agent `/marketplace` Experience

Once configured, simply launch your agent and type:
```text
/marketplace
```

### UX Architecture: Portable Contract vs. Rich Host UI
*   **Portable Text / MCP Contract:** For terminal CLI agents (`claude`, `codex`, `grok`, `opencode`), `/marketplace` exposes 12 Bridge tools. Those that resolve against the daemon today: `search_catalog`, `get_extension`, `prepare_install`, `list_installed`, `load_skill`, `read_skill_resource`, `search_capabilities`, `describe_capability`, `invoke_capability`. `request_install` reaches `install.execute`, which — behind the plan + human-approval gate in `cmd/litespm/install_authz.go` — **completes for skill listings** (real skill files through the skills ledger) **and for MCP-server listings** (the server is registered in each target host's config), and fails closed with `LPSM-ARTIFACT-UNAVAILABLE` for **plugin** listings only, whose artifact source is not wired ([STATUS.md](STATUS.md) §3). Only `get_invocation` and `cancel_invocation` return JSON-RPC `-32601` ("not implemented"), because the asynchronous invocation registry is `ARCH/34` (`DESIGNED`).
*   **Rich Host Renderer:** In hosts supporting rich extension panels or terminal TUIs (e.g. Cline in VS Code or Pi Agent TUI), `/marketplace` opens the **LiteSPM Capability Panel** with 4 dedicated tabs:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          LiteSPM Capabilities                          │
├──────────────┬──────────────┬──────────────┬───────────────────────────┤
│ [MCP SERVERS]│[AGENT SKILLS]│  [PLUGINS]   │     [INSTALLED (n)] ●     │
└──────────────┴──────────────┴──────────────┴───────────────────────────┘
```

`n` is a placeholder: the renderer prints the live item count,
`fmt.Sprintf("…[INSTALLED (%d)]…", len(items))` (`internal/bridge/shim.go` `FormatInstalledPanel`), so the header
reads `[INSTALLED (0)]` on an empty install and grows with the ledger plus detected externals.

### Tab 1: MCP Servers
*   Full search bar filtering by name, category, or transport (`stdio` / `Streamable HTTP`).
*   Displays verified badges and upstream GitHub links. No star, download or install counts are shown: no upstream source exposes them, so the catalog publishes none rather than an estimate.
*   One-click install button that prepares an `InstallPlan`. **Execution completes for skills** (installs files through the skills ledger) **and for MCP servers** (registers the server in each target host's config), both behind the plan + human-approval gate; **plugin** listings still need an artifact source ([STATUS.md](STATUS.md) §3).

### Tab 2: Agent Skills
*   Search portable `SKILL.md` workflows from `agentskills.io`.
*   Preview instructions, tools used, and triggers.

### Tab 3: Plugins
*   Curated multi-component toolkits and extensions for complex workflows.

### Tab 4: Installed & Detected External Capabilities
The **Installed** view lists ledger-backed installs plus read-only components detected in the host's
own config file. It does **not** assert runtime health:

1.  **No health light is fabricated.** LiteSPM does not health-check installed capabilities, so a
    capability whose status was not observed renders as `— Unknown`. The `● Ready` / `🟡 Needs Auth`
    / `○ Stopped` lights exist in the renderer but are only shown for a status the daemon can
    actually observe (`internal/bridge/shim.go` `FormatInstalledPanel`).
2.  **Project-scope installs are visible in their own project.** The Bridge treats the directory the
    agent host starts it in as the project it belongs to (`bridge stdio --workspace <dir>` overrides
    it), and the daemon includes that workspace's project-scope installs alongside the user-scope
    ones, each row labelled with its scope. A project install is created with
    `litespm install <id> --workspace <dir>` (which implies `--scope project`); the workspace is
    sealed into the plan the approval binds. Outside that project — or when the bridge has no
    project context — only user-scope installs are listed, which is the pre-2026-10-11 behaviour.
3.  **Detected External Capabilities (Read-Only):**
    *   LiteSPM scans the agent's primary configuration file for **pre-existing native tools**
        (e.g. servers previously added to `cline_mcp_settings.json` or `config.toml`).
    *   Detection is limited to documented on-disk config files known to the adapter.
    *   Pre-existing items are rendered with an `[External / Detected]` badge in **read-only mode**
        (no toggle controls).
    *   **`Adopt` is not implemented.** The panel renders an `(Adopt)` label
        (`internal/bridge/shim.go` `FormatInstalledPanel`), but no adopt handler or tool exists; bringing an
        external tool under management is `DESIGNED` ([STATUS.md](STATUS.md) §5).

---

## 4. Agent-Specific Integration Guides

### 4.1 Cline (VS Code Extension)
*   **How it works:** LiteSPM adds itself to `cline_mcp_settings.json` under `mcpServers.litespm`. The file it writes is the **shared** one every current Cline client reads — `~/.cline/data/settings/cline_mcp_settings.json` (`CLINE_MCP_SETTINGS_PATH` or `CLINE_DATA_DIR` relocate it). The VS Code extension's `globalStorage` copy (`%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\`, `~/Library/Application Support/Code/User/globalStorage/…`, `~/.config/Code/User/globalStorage/…`, plus `Code - Insiders`) is **legacy**: current Cline reads it only in a one-shot migration, so LiteSPM probes it last and only for a client too old to have migrated (`internal/host/cline.go`). There is no separate, unmanaged CLI file.
*   **Accessing in Cline:**
    1.  Open VS Code and launch the Cline panel.
    2.  Click the MCP icon or type `/marketplace` in the prompt.
    3.  Browse available tools or view existing tools. Cline displays the green status dot in its MCP settings view.

### 4.2 Pi Agent (`pi-coding-agent`)
*   **How it works:** Minimalist terminal agent by Mario Zechner. LiteSPM registers under the `mcpServers` key — the only container Pi reads — in `<agent-dir>/mcp.json`, where the agent directory is `~/.pi/agent` (`%USERPROFILE%\.pi\agent` on Windows) unless `PI_CODING_AGENT_DIR` overrides it, and creates `<agent-dir>/extensions/litespm.ts`. A project-scope install writes `<project>/.pi/mcp.json` under the same `mcpServers` key; Pi replaces a user entry with a same-named project entry. There is no legacy-fallback file: `~/.pi/config.json` and `~/.pi/mcp.json` appear in no Pi documentation or source, and probing them used to write the bridge into a file Pi never reads (`internal/host/piagent.go`).
*   **Accessing in Pi:**
    1.  Launch `pi` in terminal.
    2.  Type `/marketplace search <term>` or run `/marketplace` to trigger the interactive capability selector.
    3.  Pi uses its minimal token footprint to query LiteSPM only on demand.

### 4.3 Grok Build
*   **How it works:** Host id is `grok-build`. LiteSPM injects the stdio bridge under `[mcp_servers.litespm]` in `$GROK_HOME/config.toml` (default `~/.grok/config.toml`; on native Windows `%USERPROFILE%\.grok\config.toml`). `%APPDATA%\Grok\config.toml` appears in no xAI documentation and was **removed** as a fallback; the host-documented project file `.grok/config.toml` is not scanned by the adapter (`internal/host/grokbuild.go`, `ARCH/16` §3).
*   **Accessing in Grok Build:**
    1.  Launch `grok` in terminal.
    2.  Type `/marketplace` to open the capability browser.
    3.  Grok detects the companion command hook and loads selected tools directly into its execution loop.

### 4.4 OpenAI Codex
*   **How it works:** LiteSPM injects the stdio bridge into `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`; native Windows `%USERPROFILE%\.codex\config.toml`) under `[mcp_servers.litespm]`. The adapter **does** honour `$CODEX_HOME`, and the `%APPDATA%\Codex\config.toml` fallback was **removed** — it appears in no OpenAI documentation (the documented Windows system path is the administrator-owned `%ProgramData%\OpenAI\Codex\config.toml`, which LiteSPM does not write). The host-documented project file `.codex/config.toml` is not scanned by the adapter (`internal/host/codex.go`, `ARCH/16` §3.5).
*   **Accessing in Codex:** Launch `codex` and type `/marketplace` or use the registered companion skill.

### 4.5 OpenCode
*   **How it works:** LiteSPM writes into `$OPENCODE_CONFIG_DIR/opencode.jsonc` (preferred) or `opencode.json`, falling back to `$XDG_CONFIG_HOME/opencode/` — default `~/.config/opencode/` on Unix and `%USERPROFILE%\.config\opencode\` on Windows — because OpenCode resolves its config directory through xdg-basedir on every OS. `%APPDATA%\OpenCode\opencode.json` is read by no OpenCode release and is not probed. Project scope is `opencode.json` / `opencode.jsonc` at the project root (the `.opencode/` subdirectory form is the next candidate in the same upward walk from the working directory), and a `--scope project` install writes `<root>/opencode.json` (`internal/host/opencode.go`, `ARCH/16` §3.6).
*   **Layout:** OpenCode v2 documents servers at `mcp.servers.<name>` (`https://opencode.ai/v2/docs/mcp-servers`, "Config"), so LiteSPM writes that container; the flat `mcp.<name>` shape earlier releases wrote is the v1 layout the runtime still loads. Both shapes are still *read* — verify, pre-existing-tool detection, listing, collision detection and removal all span them — so nothing already configured is lost, and setup migrates LiteSPM's own flat bridge member into the documented container.
*   **Local entry shape:** OpenCode local MCP entries require `"type": "local"` and a combined string array `"command"`:
    ```json
    {"mcp":{"servers":{"litespm":{"type":"local","command":["litespm","bridge","stdio","--host","opencode"]}}}}
    ```
*   **Accessing in OpenCode:** Type `/marketplace` in the OpenCode CLI.

### 4.6 Claude Code
*   **How it works:** User-scope servers live under the top-level `mcpServers` object in `~/.claude.json` (Windows `%USERPROFILE%\.claude.json`). Project scope is `.mcp.json` in the project root; local scope is a per-project entry inside `~/.claude.json`. `CLAUDE_CONFIG_DIR` overrides the config directory **for the host tool only**; LiteSPM's adapter does not read it — `DetectConfig` returns `$HOME/.claude.json` unconditionally (`internal/host/claudecode.go:30-33`, `ARCH/16` §3.4).
*   **Accessing in Claude Code:** Type `/marketplace` in the terminal to invoke the bootstrap skill.
