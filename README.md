# LiteSPM Market & Client: Technical Architecture & System Specification

**The package manager for AI agents.**

LiteSPM is an open-source, provider-neutral package manager, federated catalog, and local control plane for AI agent capabilities: **Plugins, Skills, and MCP (Model Context Protocol) Servers**. 

It eliminates the need to manually configure, update, and manage capabilities across fragmented AI developer tools (for Claude Code, Codex, OpenCode, and many more). By registering a lightweight, version-pinned LiteSPM Bridge once per agent, users can discover, install, update, and supervise capabilities centrally from a single local control plane.

> **Foundational Security Invariant:** Credentials and execution remain strictly on the user's workstation or directly with the selected upstream provider. LiteSPM's hosted public catalog does not store credentials, execute plugin scripts, or proxy tool calls. The client-side control plane operates entirely within the local user's operating system privileges and enforces local, fail-closed authorization policies.

---

## 1. Project Status & In-Progress Roadmap

> **How to read this table.** Status is an *evidence state*, not a feeling. These six states are
> distinct and are defined in [ARCH/31 §2](ARCH/31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md#2-evidence-vocabulary-binding-repo-wide):
> `DESIGNED` → `IMPLEMENTED` → `WIRED` → `TESTED` → `VERIFIED` → `SHIPPED`.
> "Files exist" is at most `IMPLEMENTED`; "tests exist" is at most `TESTED`. A component whose only
> caller is a test is `IMPLEMENTED`, not `WIRED`.
> The authoritative defect tracker is [REMEDIATION-PLAN.md](REMEDIATION-PLAN.md); the ordered
> forward backlog is [ARCH/31 §12](ARCH/31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md#12-ordered-backlog).
>
> **[STATUS.md](STATUS.md) is the single source of truth for per-subsystem state.** Where this
> table and STATUS.md disagree, STATUS.md wins.

| Phase | Description | State | Evidence / what is missing |
|---|---|---|---|
| **Phase A** | **Architecture Freeze & LLD Specifications** | `DESIGNED` | `ARCH/00`–`ARCH/38` exist. `ARCH/24` is an aspirational inventory, not a compiled one; `ARCH/18` specifies an output tree (`index.json`, `shards/`, `items/`) that the compiler does not emit (those outputs are labelled `DESIGNED`) |
| **Phase B** | **Foundations, Storage & Local IPC** | `TESTED` | `internal/domain`, `internal/config`, `internal/state` (SQLite WAL, 22 tables), `internal/ipc` (named pipes / Unix sockets). Contract tests bind; see [STATUS.md](STATUS.md) §1 |
| **Phase C** | **Static Catalog & Discovery Plane** | `SHIPPED` in source · **the published `v0.4.0` binary is broken** | `internal/catalogbuild` + `litespm catalog build` are `TESTED` (real-dataset + end-to-end build→serve→sync→search tests, green 2026-10-13); the release tree **is published** and the live origin serves it. The current release is **`rel-2026-10-11-02`, sequence 147, 69,376 items**, named by both the committed pointer `web/public/v1/current.json` and the live origin (probe 2026-10-13), sharded into `listings-0000…0003` / `versions-0000…0001`. A binary built from current `main` syncs it and reports `69376 capabilities indexed`. **However `npm install -g litespm` (v0.4.0) cannot:** that tag was cut at 21:24:01 on 2026-10-11, 2h29m before the shard-aware client landed, so it looks for a `listings.json` that the release does not contain and fails with `manifest missing listings.json entry`. `search`, `install` and `/marketplace` all depend on that sync. **Re-cut the release to use the npm package.** `ARCH/18` §1–§2's `index.json`/`shards`/`items` remain un-emitted; **transport sharding is `IMPLEMENTED`** |
| **Phase D** | **Safe Extraction & Skill Store** | `WIRED` (resolver, skills); `IMPLEMENTED` (install engine); `TESTED` (artifact) | `internal/resolver` and `internal/skills` are reached from production paths and `internal/artifact` is test-covered ([STATUS.md](STATUS.md) §1/§3); skills and MCP servers install end to end (verified against the live catalog). Only **plugins** still need an artifact source — [ARCH/31 §4.1](ARCH/31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md#41-the-agent-facing-install-path-cannot-complete--wired-is-false) |
| **Phase E** | **Process Supervision, Bridge & Host Adapters** | `WIRED` for hosts; `IMPLEMENTED` for provider runtime | 6 bespoke adapters + 44 generic BridgeTargets (50 total, `ARCH/30`) + 77 skill targets are registered. Provider autostart is inert: the `providers` table is never populated by non-test code (finding `m4`). See [STATUS.md](STATUS.md) §1/§4 |
| **Phase F** | **MCP Protocol Dual-Profile, Secrets & OAuth** | `WIRED` (secrets, mcpclient) / `IMPLEMENTED` (auth) | Dual-profile client, native OS keystores, OAuth PKCE loopback exist; the secrets vault is opened before serving (`WIRED`), but secrets are not injected at provider launch, `mcpclient`'s first production importer is `internal/discover`, and `auth` still has zero production importers — the `AuthBroker` currently has no consumer (finding 99), [STATUS.md](STATUS.md) §1/§4 |
| **Phase G** | **In-Agent `/marketplace` Panel & Web UI** | `SHIPPED` (static web marketplace); panel `WIRED` | The Next.js static export and Bridge tool surface exist and the static marketplace is published ([STATUS.md](STATUS.md) §1); the panel's install action completes for skills and MCP servers. Plugins remain blocked by Phase D. See [STATUS.md](STATUS.md) §1 |
| **Phase H** | **Release Engineering & Packaging** | `IMPLEMENTED` | Cross-platform builds, npm wrapper, CI checks, and keyless cosign signing of every release artifact plus a CycloneDX SBOM (`release.yml`). `self-update` completes only once a release publishes `litespm-*` assets (packaging P7) |
| **Phase I** | **Golden Fixtures, Self-Update & Migrations** | `TESTED` for fixtures and migrations; self-update `WIRED` (signed) | Fixtures corpus and migration engine (forward apply + downgrade guard) are tested; `self-update` is fail-closed on SHA-256 with rollback and verifies the release's keyless signature bundle (required via `LITESPM_REQUIRE_SIGNED_UPDATE=1`). The first signed release is cut on the next `v*` tag — see [SECURITY.md](SECURITY.md). Per-row detail: [TODO.md](TODO.md) Phase I |

**Not yet true of LiteSPM, and not claimed anywhere:** provider autostart (a provider row is now
written at install time, but nothing starts it at boot), npm package signatures, plugin installation,
and any isolation level beyond process supervision. **And one live regression you should know about
before installing from npm:** the published `litespm@0.4.0` binary **cannot sync the published
catalog** — it was tagged 2h29m before the shard-aware catalog client landed, so `catalog sync`
fails with `manifest missing listings.json entry` and `search`, `install` and `/marketplace` are all
unavailable with it. A build from current `main` syncs 69,376 capabilities correctly; see
[STATUS.md](STATUS.md) §2 for the provenance. (By contrast: a project manifest + lockfile **is**
implemented — `litespm lock`/`install --frozen` (`ARCH/32` §2–§4, [STATUS.md](STATUS.md) §5); release
**signing** is implemented — every artifact gets a keyless cosign bundle the updater verifies, and
the catalog pointer is signed and checked on sync; runtime policy **is** enforced at invocation:
`provider.invoke` runs the policy engine and ungranted tools fail closed until an interactive
`litespm grant`; every install attempt and invocation is written to the audit log; and
`request_install` **does** complete an agent-driven install for skill and MCP-server listings.)

---

## 2. System Architecture: "What Is What"

LiteSPM bifurcates system responsibilities between an untrusted public discovery layer and a privileged local control plane:

```text
                                 PUBLIC DISCOVERY PLANE
    ┌─────────────────────────────────────────────────────────────────────────┐
    │ Upstream Sources: MCP Registry · Agent Skills · Git Marketplaces        │
    └────────────────────────────────────┬────────────────────────────────────┘
                                         │ CI Source Ingestion & Validation
                                         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │ Cloudflare Pages (Static Distribution CDN)                              │
    │  ├── /v1/current.json (Lightweight atomic pointer to latest release)    │
    │  └── /v1/releases/<release-id>/ (Immutable manifests, listings,         │
    │      versions — immutable, byte-reproducible; shards are DESIGNED)      │
    └────────────────────────────────────┬────────────────────────────────────┘
                                         │ HTTPS (read-only)
═════════════════════════════════════════╪══════════════════════════════════════════
                                 LOCAL CONTROL PLANE
                      (Isolated to User Workstation & OS User)

    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐
    │    Cline    │   │  Pi Agent   │   │ Grok Build  │   │  CLI / TUI App  │
    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └────────┬────────┘
           │ stdio           │ stdio           │ stdio             │
           ▼                 ▼                 ▼                   │
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐            │
    │ Bridge Shim │   │ Bridge Shim │   │ Bridge Shim │            │
    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘            │
           │                 │                 │                   │
           └─────────────────┼─────────────────┴───────────────────┘
                             │ Local IPC (OS-level ACLs only:
                             │ Windows: Named Pipe DACL / Unix: Domain Socket 0600)
                             ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                           LiteSPM Daemon                                │
    │ ┌─────────────────────────────────────────────────────────────────────┐ │
    │ │ IPC Session Manager & Dispatcher                                    │ │
    │ └──────────────┬──────────────────┬───────────────────┬───────────────┘ │
    │                ▼                  ▼                   ▼                 │
    │ ┌─────────────────────────┐ ┌───────────────┐ ┌───────────────────────┐ │
    │ │ SQLite State (WAL mode) │ │ Policy Engine │ │ OS Secret Broker      │ │
    │ │ (22 Relational Tables)  │ │ & Approvals   │ │ (DPAPI/Keychain/DBus) │ │
    │ └─────────────────────────┘ └───────────────┘ └───────────────────────┘ │
    │                │                  │                   │                 │
    │                ▼                  ▼                   ▼                 │
    │ ┌─────────────────────────┐ ┌─────────────────────────────────────────┐ │
    │ │ Content-Addressed Store │ │ Provider Supervisor                     │ │
    │ │ (trees/; no artifacts/) │ │ (Windows Job Objects / Process Groups)  │ │
    │ └─────────────────────────┘ └────────────────────┬────────────────────┘ │
    └──────────────────────────────────────────────────┼──────────────────────┘
                                                       │
                                  ┌────────────────────┴────────────────────┐
                                  ▼                                         ▼
                      ┌───────────────────────┐                 ┌───────────────────────┐
                      │ Local stdio Provider  │                 │ Remote Streamable     │
                      │ (Node / Python / Bin) │                 │ HTTP Provider         │
                      └───────────────────────┘                 └───────────────────────┘
```

### 2.1 The Bridge Shim (Stateless Stdio Facade)
*   **What it is:** A thin binary invoked directly by host agents as an MCP server (`litespm bridge stdio --host <agent-id>`).
*   **Responsibilities:** Speaks standard MCP JSON-RPC over `stdin`/`stdout`, packages agent requests, and forwards them across local IPC to the Daemon. It terminates cleanly when the agent terminates stdio.
*   **What it does NOT do:** It never touches SQLite directly, never modifies configuration files, and never spawns downstream provider processes.

### 2.2 The LiteSPM Daemon (Single-Writer Control Plane)
*   **What it is:** A background service running per OS user account.
*   **Responsibilities:**
    *   **Sole SQLite Writer:** Exclusively holds SQLite write locks in WAL mode, serializing all mutations (installs, updates, approvals, config edits).
    *   **Process Supervisor:** Manages child provider processes. On Windows, child processes are attached to Windows Job Objects configured with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. On Linux/macOS, processes run in dedicated process groups controlled by an internal supervisor watchdog holding a control pipe (`PR_SET_PDEATHSIG` on Linux). **Orphan reaping is not guaranteed on every platform:** on macOS/BSD the watchdog is an in-process goroutine, so a daemon that is SIGKILLed or crashes dies with it and leaves the child running — a provider can be orphaned there when the daemon dies abnormally (`internal/provider/pdeathsig_other.go`), and a provider that double-forks escapes its process group entirely. Graceful shutdown (`Terminate`/`StopAll`) is the supported path.
    *   **Policy Authority:** Evaluates tool invocation permissions and verifies cryptographic `planHash` values against human approvals.
    *   **Secret Broker:** Interfaces with native OS vaults (`secret-tool`, `/usr/bin/security`, DPAPI — [ARCH/19 §2](ARCH/19-SECRETS-OAUTH.md#2-platform-specific-secret-vault-backends)). Splicing a stored secret into a provider's environment at launch is `IMPLEMENTED`, **not `WIRED`**: `ResolveLaunchSecrets` has no production caller ([STATUS.md](STATUS.md) §1).

### 2.3 Storage Layer (`DATA_ROOT`)
*   **`state.db` (SQLite 3 in WAL mode):** Maintains 22 relational tables covering installations, active provider sessions, capability definitions, permission grants, host backups, persistent `auth_profiles`, `operation_trees`, and audit events.
*   **Content-Addressed Store (`DATA_ROOT/cas/trees/`):** Every extracted package tree is stored at `DATA_ROOT/cas/trees/sha256/<64-hex-digest>` (`internal/install/engine.go:471-481`); it is a flat digest directory, not a two-level fan-out. There is **no `artifacts/` directory** — downloads spool to a temp file and only trees are retained (`ARCH/04` §4). This enables tamper-evident rollbacks and deduplication.
*   **Operation Journal (14 States):** Every filesystem mutation is journaled (`created` $\rightarrow$ `staging` $\rightarrow$ `commit_intent` $\rightarrow$ `committed`). Interrupted operations cleanly recover on daemon startup, deleting only trees created by that operation.

---

## 3. End-to-End Workflows

### 3.1 Global Installation & Interactive Setup (`litespm`)
1.  **Installation:** Installed globally via npm (`npm install -g litespm`) or downloaded as a standalone native Go binary.
2.  **Interactive TUI Wizard:** Running `litespm` (or `litespm setup`) launches an interactive terminal interface; `litespm setup --agent <host-id>` answers the agent question up front and runs the same write without prompts (`cmd/litespm/main.go:537-578`). The setup flow itself makes **no HTTP request**:
    *   **Adapter Registry, Not an Advisory Print:** the wizard derives the host list from the
        compiled-in registry (`host.ListAdapters`) and says how many hosts it can connect to
        (`cmd/litespm/wizard.go:154-162`). It prints no advisory metadata and claims no runtime
        check — nothing on the machine has been inspected yet.
    *   **Agent Selector:** the wizard lists the agents whose configuration file it found on this
        machine, with `[a]` to show every supported adapter; no row names a config file the adapter
        itself did not resolve.
    *   **Automated Config Discovery:** LiteSPM scans platform-standard paths across Windows, macOS, and Linux.
    *   **Fallback Menu:** If the file is not found, the wizard offers:
        *   *Type the full path of the configuration file*
        *   *Print a snippet to paste into the file yourself*
        *   *Look for the file again*
        The path the wizard writes is the path the user agreed to, or nothing is written:
        `host.PlanSetupAt` refuses a plan whose `ConfigPath` is not the named path
        (`internal/host/types.go:82-117`; [TEST.md](TEST.md) Test Case 2).
    *   **Preview, Then Write:** the wizard prints the changed lines (`changePreview`) and writes
        only after `Write this change? [Y/n]` (`cmd/litespm/wizard.go:450-483`).
    *   **Safe Atomic Merge:** LiteSPM creates a timestamped backup in `DATA_ROOT/backups/`, preserves
        all existing comments/keys, and injects the single version-pinned Bridge entry. This is an
        **MCP-entry merge only** — no instruction, skill, or command file is projected into the host
        — **with one exception:** the Pi Agent adapter also writes its companion extension
        `<agent-dir>/extensions/litespm.ts`, which registers the `marketplace` panel and a
        `litespm` tool-list command (`internal/host/pi_extension.ts`;
        [TEST.md](TEST.md) Test Case 5).
3.  **Management Menu:** on a machine that already has a bridge registered, a bare `litespm` starts
    from what is connected and offers: update the capability catalog (an explicit, confirmed
    `catalog sync` — the only step that touches the network), find and install a capability, remove
    something LiteSPM installed, see what is installed, and set up or repair an agent connection
    (`cmd/litespm/wizard.go:568-620`). Every action goes through the same plan, approval and ledger
    paths as the CLI commands.

### 3.2 Skill Installer (`litespm skills add`)

Portable `SKILL.md` skills are installed per agent host, in the host's own skill
directory, at a chosen scope.

```bash
litespm skills add anthropics/skills                  # interactive
litespm skills add anthropics/skills --list           # what is in the repo
litespm skills add anthropics/skills --skill frontend-design --agent claude-code --agent codex --yes
litespm skills add anthropics/skills --all            # every skill to every agent, no prompts
litespm skills add ./my-skills --scope global -y --json
litespm skills use anthropics/skills@frontend-design | claude   # prompt only, installs nothing
litespm skills find design --owner vercel-labs        # search the catalog by keyword or owner
```

| Step | Behaviour |
|---|---|
| Source | `owner/repo`, an `https` or `ssh`/`git@` Git URL, a local directory, a GitHub/GitLab browse URL, or a **direct download** — a bare `SKILL.md` or a `.zip`/`.tar`/`.tar.gz` archive URL, where the format is sniffed from the bytes and the extension is not required. Git sources are fetched with a shallow `git clone` into a temp dir; downloads are capped at 10 MiB fetched / 25 MiB extracted / 1000 files (`SKILLS_DOWNLOAD_MAX_BYTES`, `SKILLS_EXTRACT_MAX_BYTES`, `SKILLS_EXTRACT_MAX_FILES`). `http://` and `file:` remain refused, and a download is https-only. Archive entries with an absolute path, a `..` component or a symlink are rejected. |
| Discovery | Walks the source tree up to depth 3 for directories containing `SKILL.md`/`skill.md` with both `name` and `description`, so the catalog layout `skills/<category>/<name>/SKILL.md` is found. `.git`, `node_modules`, `dist`, `build` and `__pycache__` are never descended; a root `SKILL.md` makes the source itself a skill; if the bounded walk finds nothing, a recursive search runs before reporting failure; `--full-depth` drops both bounds. A skill directory is never treated as a parent of another skill. |
| Internal skills | A skill with `metadata.internal: true` is hidden and refused unless `INSTALL_INTERNAL_SKILLS=1` — on every path (`add`, `use`, `update`). |
| Scope | `This repo only` (default) writes project-relative dirs; `Global (user-wide)` writes user dirs and honours `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `GROK_HOME`, `XDG_CONFIG_HOME`. |
| Agents | Each selected skill is copied into every selected agent's own directory. Hosts without a dedicated dir (Cline, Pi Agent) share the universal `.agents/skills` tree: `--agent '*'` expands to all 77 ids and the shared destinations are de-duplicated, so one skill becomes 54 copies, not 77. No universal copy is forced. |
| Copy | Symlinks are refused, hidden VCS dirs are skipped, each skill is bounded at 32 MiB, and an existing destination is refused unless `--force` — which prints `overwrites: <path>`, records a pre-image digest and a byte-exact backup first, so a rollback can put the original bytes back. |
| Risk panel | Always rendered. Without a real audit source it reports `unverified` per skill — a verdict is never invented. |

Host skill directories are transcribed from `vercel-labs/skills` `src/agents.ts`
(MIT) — the ecosystem's de-facto map of where each agent reads `SKILL.md` from.
LiteSPM tracks **77 agents**. Selected examples:

| Agent | This repo only | Global |
|---|---|---|
| `claude-code` | `<repo>/.claude/skills` | `$CLAUDE_CONFIG_DIR/skills` (default `~/.claude/skills`) |
| `codex` | `<repo>/.agents/skills` | `$CODEX_HOME/skills` (default `~/.codex/skills`) |
| `opencode` | `<repo>/.agents/skills` | `$XDG_CONFIG_HOME/opencode/skills` (default `~/.config/opencode/skills`) |
| `grok-build` | `<repo>/.grok/skills` | `$GROK_HOME/skills` (default `~/.grok/skills`) |
| `windsurf` | `<repo>/.windsurf/skills` | `~/.codeium/windsurf/skills` |
| `gemini-cli`, `github-copilot`, `cursor`, `amp`, `kilo`, `zed`, `droid`, … | `<repo>/.agents/skills` | per-agent |
| `cline`, `pi-agent`, `kimi-code-cli` | `<repo>/.agents/skills` | `~/.agents/skills` |

Agents sharing one directory (the universal `.agents/skills` group) collapse to a
single write, so installing for several of them never collides. Agents detected
on the machine are listed first; **popularity is not used to order them**,
because no measured usage data exists — presence then alphabetical.

Non-interactive runs require `--agent` and `--yes`; they never prompt, never
imply a consent that was not given, and emit `--json` output on stdout.

### 3.3 Non-Destructive Update Checking (`DESIGNED`)

There is **no passive update check today**. Neither `litespm` nor `/marketplace` fetches
`/v1/current.json` on its own, compares versions, or renders a delta diff. The wizard's *Update the
capability catalog* action is the one interactive fetch, and it is explicit: it names the origin,
says it installs nothing, and asks before downloading (`cmd/litespm/wizard.go:656-705`). Update
checking of the binary is the user-initiated `litespm self-update`, which fetches the published
release manifest, verifies the binary's SHA-256 checksum, and applies it only on request.
Version-diff rendering for installed capabilities is designed and not implemented — see
[STATUS.md](STATUS.md).

### 3.4 The In-Agent `/marketplace` Experience
Typing `/marketplace` in a configured agent invokes the Bridge's discovery tools. The portable
contract is the 12 Bridge tools (`search_catalog`, `get_extension`, `prepare_install`,
`request_install`, `list_installed`, `search_capabilities`, `describe_capability`, `load_skill`,
`read_skill_resource`, `invoke_capability`, `get_invocation`, `cancel_invocation`); rich hosts
render the installed view as a table. Tool-by-tool state is in [STATUS.md](STATUS.md) §4.

*   **Discovery (`search_catalog`, `get_extension`):** resolve against the daemon over real catalog
    data (`catalog.search` / `catalog.get_item`).
*   **Plan (`prepare_install`):** resolves a real plan (`resolver.prepare_plan`).
*   **Install (`request_install`):** reaches `install.execute`, which is gated by
    `install_authz.go`: the request must name a persisted, hash-verified plan **and** carry an
    approval a human recorded for that exact plan hash (`litespm approve <plan-id>`). With both
    present, **skill listings install their real files and MCP-server listings register the server
    in each target host's config**; plugin listings alone still fail closed with
    `LPSM-ARTIFACT-UNAVAILABLE` because the catalog carries no artifact locator for them —
    [STATUS.md](STATUS.md) §3.
*   **Skills (`load_skill`, `read_skill_resource`):** resolve against real skill data.
*   **Capabilities & invocation (`search_capabilities`, `describe_capability`,
    `invoke_capability`):** resolve over discovered capability rows through `internal/discover`
    (probe → `capabilities` row → invoke, refusing on schema drift). Only
    **`get_invocation` and `cancel_invocation`** still return an explicit `-32601`
    "not implemented", because the asynchronous invocation registry they need is ARCH/34
    (`DESIGNED`).

**Installed view (`list_installed`).** The daemon returns ledger-backed installs plus
**read-only** components detected in the host's own config file. LiteSPM does **not** health-check
installed capabilities, so no ready/needs-auth/stopped light is asserted: unobserved status renders
as `— Unknown`. External components are detected; there is **no `Adopt` action** — the label is
rendered by the panel, but no adopt handler or tool exists (it is `DESIGNED`).

### 3.5 Capability Schema-Drift & Identity Protection (`WIRED` for the drift gate, `WIRED` for grants)
*   Upon tool discovery, LiteSPM generates a SHA-256 fingerprint of the tool's input JSON Schema (`schemaFingerprint`).
*   User approvals are designed to bind cryptographically to strong identity tuples:
    *   **Local Stdio:** `(capability_id, schemaFingerprint, casTreeDigest)`
    *   **Remote HTTP:** `(capability_id, schemaFingerprint, endpointOrigin, serverVersionDigest)`
*   If an upstream provider modifies its schema upon reconnection, or if local code or remote endpoints change, LiteSPM invalidates the grant (`status: "changed"`), blocking unapproved execution until re-reviewed.

**Honest limit:** both halves are real now. The *check* half re-probes the server before every
call and refuses one whose fingerprint no longer matches what was discovered, and the policy engine
is evaluated before the server is spawned. The *grant* half is wired: `litespm grant <capabilityId>`
(`cmd/litespm/grant.go`) writes one `capability_grants` row per capability and `internal/policy`
Tier 3 reads it before an effectful invocation. What no code path yet produces is the drift
*invalidation* state — `grant revoke` sets `revoked`, but nothing flips a grant to
`status: "changed"` when a re-probe sees a new fingerprint. See [STATUS.md](STATUS.md) §4.

---

## 4. Supported Agent Ecosystem

Where LiteSPM actually reads and writes — verified against the adapters, not against marketing
pages. Every bespoke `DetectConfig` is **user-scope only**: it ignores the `scope` argument, so the
host-documented project paths below are *not* scanned (`ARCH/16` §3).

| Agent Host | Interface / Environment | Configuration Format | LiteSPM target (and what else exists) |
|---|---|---|---|
| **Cline** | VS Code Extension (and the Cline CLI / JetBrains clients) | JSON (`cline_mcp_settings.json`) | **Current default:** `~/.cline/data/settings/cline_mcp_settings.json` (created when nothing exists yet), relocated by the documented env vars in most-specific-wins order: `CLINE_MCP_SETTINGS_PATH` (the file itself) → `CLINE_DATA_DIR` (`~/.cline/data/`) → `CLINE_DIR` (`~/.cline/` wholesale, so `$CLINE_DIR/data/settings/cline_mcp_settings.json`). **Legacy, probed last:** the VS Code `globalStorage` path (`%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings/`, `~/Library/Application Support/Code/User/globalStorage/…`, `~/.config/Code/User/globalStorage/…`, plus `Code - Insiders`) — unverified in current vendor docs, kept as a read-only fallback for an un-migrated client (`internal/host/cline.go`). Cline documents no project MCP file, so it refuses `--scope project` |
| **Pi Agent** | Terminal Coding Agent (`pi`) | JSON (`mcp.json`) + TS Extension | `~/.pi/agent/mcp.json`, relocated by `PI_CODING_AGENT_DIR`; the bridge is written under the `mcpServers` key — the only container Pi reads. Project scope is `<root>/.pi/mcp.json`, written for `--scope project` (Pi replaces a same-named user entry); the former `~/.pi/config.json` / `~/.pi/mcp.json` fallbacks were **removed**: no Pi release reads them (`internal/host/piagent.go`) |
| **Grok Build** | Terminal / IDE (`grok`) [id: `grok-build`] | TOML (`config.toml`) | `$GROK_HOME/config.toml` (default `~/.grok/config.toml`; Windows `%USERPROFILE%\.grok\config.toml`). The `%APPDATA%\Grok\config.toml` fallback was **removed** — it appears in no xAI documentation (`internal/host/grokbuild.go`). Project scope is `<root>/.grok/config.toml`, written for `--scope project`, which is the same file `grok mcp add --scope project` writes |
| **Claude Code** | Terminal CLI (`claude`) | JSON (`~/.claude.json`, project `.mcp.json`) | `~/.claude.json` unconditionally (`%USERPROFILE%\.claude.json` on Windows) and `<root>/.mcp.json` for `--scope project`, which is what Anthropic documents. `CLAUDE_CONFIG_DIR` and the per-project local entry inside `~/.claude.json` are host-documented locations LiteSPM does **not** read or write (`ARCH/16` §3.4) |
| **OpenAI Codex** | Terminal CLI (`codex`) | TOML (`config.toml`) | `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`; Windows `%USERPROFILE%\.codex\config.toml`). The adapter **does** honour `$CODEX_HOME`. The `%APPDATA%\Codex\config.toml` fallback was **removed** — it appears in no OpenAI documentation (`internal/host/codex.go`). Project scope is `<root>/.codex/config.toml`, written for `--scope project`; Codex itself loads a project file only for trusted projects |
| **OpenCode** | Open-source CLI (`opencode`) | JSON (`opencode.jsonc` preferred, else `opencode.json`) | `$OPENCODE_CONFIG_DIR/{opencode.jsonc,opencode.json}` when that variable is set, otherwise `$XDG_CONFIG_HOME/opencode/` (default `~/.config/opencode/`), `.jsonc` first — on every OS, because OpenCode resolves the directory through xdg-basedir. Project scope is `opencode.json` / `opencode.jsonc` at the project root (the `.opencode/` form is the next candidate in the same upward walk), written for `--scope project`; `%APPDATA%\OpenCode\opencode.json` is **not** read by any release and is no longer probed |

LiteSPM registers exactly one `litespm` bridge entry per host (`litespm bridge stdio --host <agent-id>`); individual capabilities are resolved by the daemon at runtime. OpenCode v2 documents servers at `mcp.servers.<name>`, so the entry is `{"mcp": {"servers": {"litespm": {"type": "local", "command": ["litespm", "bridge", "stdio", "--host", "opencode"]}}}}` (a combined string-array `command`); the flat `mcp.<name>` shape earlier revisions wrote is still loaded by the runtime and still read by LiteSPM — verify, listing, collision detection and removal all span both shapes — and setup migrates LiteSPM's own flat bridge member into the documented container.

---

## 5. Repository Structure & Architectural Guide

```text
/
  ├── README.md                                         # This master technical specification
  ├── STATUS.md                                         # SINGLE STATUS AUTHORITY (six evidence states)
  ├── CHANGELOG.md                                      # Change record
  ├── REMEDIATION-PLAN.md                               # Authoritative defect tracker + verification protocol
  ├── TODO.md                                           # Master delivery ledger (Phases A through I)
  ├── AGENTS.md                                         # Supported AI agents guide & /marketplace UX
  ├── TEST.md                                           # Test scenarios for Cline, Pi Agent, Grok Build
  ├── SECURITY.md                                       # Threat model, controls, open security gaps
  │
  ├── cmd/
  │   └── litespm/                                      # Root CLI entrypoint
  │       ├── main.go                                   # Command dispatch + daemon/IPC handlers
  │       ├── wizard.go                                 # Interactive setup + capability-management wizard
  │       ├── skills_add.go                             # `skills add` installer (clone, select, copy)
  │       ├── skills_update.go                          # `skills update` (atomic swap, dry-run, rollback)
  │       ├── skills_remove.go                          # `skills remove/list` ledger-backed removal
  │       └── skills_policy.go                          # skills policy hook (deny rules → installed skills)
  │
  ├── internal/ (42 packages; the 21 listed below are the `ARCH/24` inventory,
  │   which covers less than half the tree — see ARCH/24's own coverage note)
  │   ├── domain/                                       # Pure domain models, canonical IDs, RFC 8785 JCS, errors
  │   ├── config/                                       # Platform paths (%LOCALAPPDATA%, XDG, runtimes) & config
  │   ├── state/                                        # SQLite WAL engine (22 tables), safe CAS rollback journal
  │   ├── ipc/                                          # Local IPC gated by OS-level ACLs (Named Pipe DACL / Unix socket 0600)
  │   ├── source/                                       # Upstream adapters (MCP Registry, Skills, Claude/Codex/Cursor/Grok, ACP)
  │   ├── catalogbuild/                                 # Deterministic release compiler & manifest generator
  │   ├── catalog/                                      # Catalog client, HTTP sync, digest verification & lexical search
  │   ├── artifact/                                     # Safe archive extraction (256 MiB/1 GiB/case-fold limits)
  │   ├── resolver/                                     # Pure DFS resolver + semver constraints
  │   ├── install/                                      # Atomic CAS staging + SQLite commit
  │   ├── skills/                                       # Skill loader, 77-agent installer, ledger
  │   ├── agent/                                        # ACP registry + launch-spec resolution + overrides
  │   ├── bridge/                                       # Stdio Bridge shim (12 tools)
  │   ├── provider/                                     # Supervisor (Job Objects/watchdog) + isolation
  │   ├── policy/                                       # 17-action effect taxonomy + 5-tier engine
  │   ├── host/                                         # 6 bespoke adapters + 44 generic BridgeTargets (50 total)
  │   ├── mcpclient/                                    # Dual-profile MCP client (2026-07-28 + legacy)
  │   ├── secrets/                                      # OS vault + memory/file stores
  │   ├── auth/                                         # OAuth PKCE loopback broker
  │   ├── doctor/                                       # 10-check diagnostics + repair plans
  │   └── update/                                       # Self-update with fail-closed checksum verification
  │
  ├── schemas/                                          # Draft 2020-12 Canonical JSON Schemas
  │   ├── install-plan.schema.json                      # Cryptographic plan schema with planHash
  │   ├── listing.schema.json                           # Normalized catalog listing schema
  │   ├── version.schema.json                           # Pinned version & artifact reference schema
  │   ├── source.schema.json                            # Upstream source & snapshot configuration schema
  │   ├── catalog-release.schema.json                   # Immutable release pointer & manifest schema
  │   └── errors.schema.json                            # Standardized LPSM-* machine error schema
  │
  ├── scripts/                                          # Release/deploy/catalog helpers — see scripts/README.md
  ├── web/                                              # Next.js static marketplace — see web/README.md
  ├── LICENSE                                           # Apache License 2.0
  ├── NOTICE                                            # Apache-2.0 attribution + third-party notices
  └── ARCH/                                             # 39 Architecture & LLD Documents (00–38)
      ├── 00-INDEX.md                                   # Normative status, precedence & registry
      ├── 01-PRODUCT.md                                 # Product contract & 5-stage lifecycle
      ├── 02-HLD.md                                     # Daemon/Bridge split & sequence diagrams
      ├── 03-CATALOG-SOURCES.md                         # Federation, SourceSnapshot & SSRF
      ├── 04-CLIENT-INSTALL.md                          # Interactive TUI, CAS layout & resolver
      ├── 05-SECURITY.md                                # Archive limits & schema-drift defense
      ├── 06-API-CONTRACTS.md                           # Immutable releases & Plan v2
      ├── 07-DECISIONS.md                               # Accepted ADRs D-001 through D-031
      ├── 08-DELIVERY.md                                # Delivery roadmap & acceptance gates
      ├── 09-RESEARCH.md                                # MCP 2026-07-28 & primary ecosystem research
      ├── 10-DOMAIN-MODEL.md                            # Domain models & RFC 8785 canonical hashing
      ├── 11-LOCAL-RUNTIME-IPC.md                       # Daemon lifecycle & Named Pipe/Socket IPC
      ├── 12-STORAGE-TRANSACTIONS-RECOVERY.md           # SQLite WAL DDL (22 tables) & journal
      ├── 13-RESOLVER-INSTALL-ENGINE.md                 # DFS resolver, archive safety & safe CAS rollback
      ├── 14-BRIDGE-PROVIDER-MCP.md                     # Stdio Bridge shim & supervisor watchdog
      ├── 15-POLICY-APPROVALS.md                        # 17-action effect taxonomy & policy engine
      ├── 16-HOST-ADAPTERS.md                           # Cline, Pi Agent, Grok Build, dynamic fetching, /marketplace
      ├── 17-SOURCE-ARTIFACT-RUNTIME-ADAPTERS.md        # Decoupled adapter interfaces
      ├── 18-CATALOG-BUILDER-RELEASE-SEARCH.md          # Deterministic builder & lexical ranking
      ├── 19-SECRETS-OAUTH.md                           # OS SecretStore, persistent auth_profiles & OAuth
      ├── 20-ERRORS-AUDIT-DOCTOR.md                     # Error taxonomy, exit codes & doctor framework
      ├── 21-TESTING-CONFORMANCE.md                     # Test pyramid, crash injection & canary scans
      ├── 22-PLATFORM-RELEASE-MIGRATIONS.md             # Cross-compilation & DB migrations
      ├── 23-SCHEMAS-EXAMPLES.md                        # Schema fixtures & examples
      ├── 24-FUNCTION-INVENTORY.md                      # Aspirational function map (21 of the 42 packages; §21 verified)
      ├── 25-WEB-FRONTEND-UI.md                         # Web marketplace frontend inspired by mcpmarket.com
      ├── 26-ECOSYSTEM-IA-PACKAGE-MODEL.md              # Neutral Package/Capability model, 8-type taxonomy, honesty rule
      ├── 27-CAPABILITY-SOURCE-SUPPORT-MATRIX.md        # Status snapshot per type/source with code evidence
      ├── 28-ACP-AGENT-DOCS-VERIFICATION.md             # ACP registry-vs-docs verification + overrides
      ├── 29-CONNECTOR-SYSTEM-DESIGN.md                 # Connector proxy & credential custody design (deleted under D-021; resurrection planned)
      ├── 30-DATA-DRIVEN-BRIDGE-TARGETS.md              # BridgeTarget table (44) + GenericAdapter, surgical merge
      ├── 31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md       # Verified competitor record, proposal adjudication, evidence vocabulary, backlog
      ├── 32-MANIFEST-LOCK-INTEROP.md                   # `litespm.yml`/`litespm.lock`, frozen install, SBOM, interop  [DESIGNED]
      ├── 33-DEPLOYMENT-LEDGER-RECONCILIATION.md        # Deployment ledger & three-way reconciliation  [DESIGNED]
      ├── 34-RUNTIME-INVOCATION-RECEIPTS.md             # Capability registry, invocation engine, receipts  [DESIGNED]
      ├── 35-PROFILES-AND-CAPABILITY-LEASES.md          # Multi-kind profiles & capability leases  [DESIGNED]
      ├── 36-ENTERPRISE-POLICY-AND-AUDIT.md             # Policy hierarchy, audit --ci, signing  [DESIGNED]
      ├── 37-TUI-AND-COMPLETION.md                      # TUI, staged-plan tray, shell completion  [DESIGNED]
      └── 38-CLI-PRODUCT-SURFACE.md                     # CLI surface: dispatch, help, list/inventory, profiles, orientation commands
```

### 5.1 Command-line surface

```text
litespm                                  interactive setup + management wizard
                                          (the setup flow is offline; the menu's
                                          catalog update names the origin and asks)
litespm setup [--agent <host-id>]        the wizard, or connect one agent without prompts
litespm init [name] [--dir <path>] [--force]
                                          scaffold a SKILL.md that the real loader parses
                                          (`init` no longer opens the wizard)
litespm version                          version + protocol + build target
litespm search <query>                   search the local catalog index
litespm install <id> [--version <v>] [--scope user|project] [--workspace <dir>]
                                          records a plan + human approval; skills and MCP servers
                                          install, plugins need artifact wiring (STATUS.md).
                                          --workspace names the project for a project-scope install
                                          (it implies --scope project; the default is the working
                                          directory) and is sealed into the plan
litespm uninstall [--dry-run]            remove the bridge entry from every host config
litespm catalog sync                     fetch the release pointer (live origin — STATUS.md §2)
litespm daemon serve                     start the supervisor + IPC engine
litespm bridge stdio [--host <id>] [--workspace <dir>]
                                          stateless MCP stdio shim; --workspace (default: the
                                          working directory) is the project whose installs the
                                          shim may also list — it widens reads only
litespm host list|detect|setup|remove    host adapters (remove takes <host-id> or --all)
litespm agent list|resolve <id>          ACP registry listing / launch-spec resolution [--registry|--file|--json]
litespm skills add|use|find|list|update|remove
                                          SKILL.md lifecycle: add installs, `use` prints the
                                          prompt and installs nothing, `find` searches the
                                          local catalog index; `ls`/`rm` are aliases
                                          (add: --skill/--agent/--scope/--yes/--json)
litespm doctor [--repair] [--yes]        health checks and optional repair
litespm self-update [--force]            fetch the release manifest and update the binary
litespm help                             usage
```

Exit codes: `0` success · `1` internal · `2` usage · `10` catalog · `20` resolve · `30` approval ·
`40` install · `50` provider · `60` host · `70` state. The category codes `10`–`70` are emitted by
`litespm doctor` today; other commands return `0`/`1`/`2` until they gain categorized failures
([ARCH/20](ARCH/20-ERRORS-AUDIT-DOCTOR.md) §2).

---

## 6. Technical Stack & Development Invariants

*   **Local Core & Daemon:** Written in Go (1.26) for static cross-platform compilation, OS process group / Job Object control, SQLite WAL concurrency, and hand-rolled MCP JSON-RPC 2.0 (no external SDK).
*   **Database:** SQLite 3 with Write-Ahead Logging (`WAL`), utilizing pure-Go drivers (`modernc.org/sqlite`) for zero-CGO cross-compilation.
*   **Web Marketplace:** Static export using Next.js 15 / React 19 + Tailwind CSS 4 (no Radix dependency; local primitives only), deployed to Cloudflare Pages — commands, layout and deploy path are documented in [`web/README.md`](web/README.md).
*   **Testing:** Multi-tier testing pyramid featuring property-based tests, hostile archive fuzzing, and synthetic secret canary scans. A systematic crash-injection harness is designed but **not built** (see [ARCH/21 §4](ARCH/21-TESTING-CONFORMANCE.md#4-crash-injection-fault-matrix-designed--no-harness-in-tree)).

---

## 7. Environment, Origins & Release Order

### Environment variables

| Variable | Default | Effect |
|---|---|---|
| `LITESPM_DATA_ROOT` | Linux `$XDG_DATA_HOME/litespm` (`~/.local/share/litespm`), macOS `~/Library/Application Support/LiteSPM`, Windows `%LOCALAPPDATA%\LiteSPM` | Cache, state database, installed providers, backups |
| `LITESPM_CONFIG_ROOT` | Linux `$XDG_CONFIG_HOME/litespm`, macOS Application Support, Windows `%APPDATA%\LiteSPM` | User `config.toml` |
| `LITESPM_RUNTIME_ROOT` | Linux `$XDG_RUNTIME_DIR/litespm` (else `/tmp/litespm-$UID`), macOS `~/Library/Caches/LiteSPM/run` | Socket, daemon lock, PID files |
| `LITESPM_REGISTRY_URL` | `config.DefaultRegistryURL` | Catalog and release-pointer origin (`/v1/current.json`) |
| `LITESPM_LOG_LEVEL` | `info` | Daemon log verbosity |
| `LITESPM_POLICY_DEFAULT_LEVEL` | `ask_once` | Default install policy gate |
| `LITESPM_POLICY_ENFORCE_SIGNATURES` | `true` | Fail closed on unverified artifacts |
| `LITESPM_NETWORK_TIMEOUT_SEC` | `30` | Timeout for registry and artifact fetches |
| `LITESPM_RELEASE_REPO` | `sarv-projects/LiteSPM` | npm `postinstall`: repository hosting the release assets |
| `NEXT_PUBLIC_SITE_URL` | live deployment origin (`web/lib/site.ts`) | Web build: canonical, Open Graph and JSON-LD origin |

The pre-rename `LITEPSM_*` variables (`LITEPSM_DATA_ROOT`, `LITEPSM_CONFIG_ROOT`,
`LITEPSM_RUNTIME_ROOT`, `LITEPSM_REGISTRY_URL`, `LITEPSM_LOG_LEVEL`,
`LITEPSM_POLICY_DEFAULT_LEVEL`, `LITEPSM_POLICY_ENFORCE_SIGNATURES`,
`LITEPSM_NETWORK_TIMEOUT_SEC`) remain honoured as fallbacks when the current
`LITESPM_*` name is unset (`internal/config/config.go:122-147`).

### Compiled origins must resolve

Two origins ship as compiled defaults, so each must name a host that answers:

*   **`config.DefaultRegistryURL`** is where the client fetches `/v1/current.json` and the release manifests it points at. It names the live deployment origin because `registry.litespm.dev` is not registered yet; a default that fails at DNS turns every catalog fetch into an opaque network error instead of a reportable one. Repoint it per install with `LITESPM_REGISTRY_URL` or `catalog.registryUrl` in `config.toml`.
*   **`SITE_URL`** (`web/lib/site.ts`) drives `metadataBase`, Open Graph cards, and the JSON-LD emitted on package pages. Canonical URLs must name the origin that actually serves the site, so any build can override it:

```bash
NEXT_PUBLIC_SITE_URL=https://litespm.market npm run build   # or ./scripts/deploy-pages.sh
```

### Release order: GitHub assets before npm

`npm/scripts/install-binary.js` downloads `litespm-<os>-<arch>` from the `v<version>` GitHub release during `postinstall`. Publishing the package before those assets exist ships a wrapper whose binary download 404s, so `release.yml` fixes the order: it builds the six-platform matrix plus `SHA256SUMS.txt`, creates the GitHub release, verifies that `npm/package.json` matches the tag, and only then publishes to npm with `--provenance` (skipped unless the `NPM_TOKEN` repository secret is set). [`scripts/README.md`](scripts/README.md) is the inventory of every repository script and which workflow — if any — runs it.

```bash
git tag v0.3.0 && git push --tags           # 1. tag -> workflow builds assets and creates the release
npm deprecate litepsm "Renamed to LiteSPM"   # 2. retire the previous package name afterwards
```

---

## 8. License & Legal

LiteSPM is licensed under the **Apache License, Version 2.0**. The full text is in [`LICENSE`](LICENSE).

Apache-2.0 was chosen over MIT for its explicit patent grant and its contribution terms, both of
which matter for a project that writes into other people's agent configuration files.

*   [`NOTICE`](NOTICE) — attribution required by the license, plus third-party acknowledgements.
*   **Secret handling:** credentials are held only in the operating-system-protected vault — the
    master key is protected by `secret-tool` (Linux Secret Service), `/usr/bin/security` (macOS
    Keychain), or Windows DPAPI; there is no WinCred binding ([ARCH/19 §2](ARCH/19-SECRETS-OAUTH.md#2-platform-specific-secret-vault-backends)).
    No secret is written to the state database, to any config file, to a log, or to the hosted
    catalog. `test/canary_test.go` (run by `go test ./...` on every CI OS) plants synthetic
    canaries through the real secret-store and launch-resolution paths, then scans the state
    database, its WAL/SHM sidecars, every file under the data and config roots, and the supervisor
    log buffer for them — it does not scan production logs or the hosted catalog. An MCP server
    process receives a scoped
    credential only when a launch actually supplies one (launch-time injection is `IMPLEMENTED`,
    not `WIRED` — [STATUS.md](STATUS.md) §1); a future brokered connector never hands its token to
    the agent ([ARCH/29](ARCH/29-CONNECTOR-SYSTEM-DESIGN.md)).
*   **Release integrity:** release binaries are published with `SHA256SUMS.txt` and the self-updater
    fails closed on a digest mismatch. **Release signing is implemented and shipped since `v0.4.0`
    (2026-10-11):** `release.yml` produces a keyless cosign bundle over every release artifact plus a
    CycloneDX SBOM, the updater verifies the bundle, and the catalog pointer is signed and checked on
    sync. `v0.4.0` carries **8 `.sigstore.json` bundles — one per asset**; `v0.3.0` and every earlier
    tag carry none, so an update from `v0.4.0` verifies a real signature while the checksum-only
    branch remains reachable for older tags. See [`SECURITY.md`](SECURITY.md) and
    [STATUS.md](STATUS.md) §1/§5 for the authorities.
