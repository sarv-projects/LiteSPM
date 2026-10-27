# Host Adapters & In-Agent UX

> **Snapshot basis:** reconciled against commit `386aebd` (2026-10-21). The catalog and host-count
> figures below are dated measurements of the release they name.

> **Registry correction (2026-10-27).** `pi` and `pi-agent`, and `grok` and
> `grok-build`, are distinct agent products and retain separate registry IDs.
> The earlier 50-host table collapsed the first ID in each pair. The current
> registry lists 52 IDs (45 generic targets plus seven dedicated profiles);
> all 52 passed isolated setup, detection, bridge JSON-RPC, and removal in
> `docs/audits/2026-10-27/litespm-e2e-host-audit.md`. The 44/50 counts below
> describe the 2026-10-21 snapshot only.

> **Reality check (read first).** `internal/host` is `WIRED` for exactly one
> operation: merging **a single `litespm` MCP entry** into one host config file,
> atomically and comment/sibling-preserving (`STATUS.md` §1). The bridge now
> publishes its MCP `marketplace` prompt to every configured host. Each client
> decides whether and how it exposes prompts; the setup wizard prints a literal
> slash command only where that syntax is verified. Pi and Pi Agent each get
> extension command (§3.2). There is no single slash-command registration
> mechanism shared by all hosts. Cross-agent porting (`litespm copy`) is
`DESIGNED` in [ARCH/38 §5](38-CLI-PRODUCT-SURFACE.md) and deliberately adds
**no** interface method: it composes the existing reader
(`ListServerEntriesWithValues`, `DetectPreExistingComponents`) with the
existing writer (`InstallServerEntry`) through the canonical IR defined in
§6 below.

> **Config-path audit (2026-10-07).** All 44 generic bridge-target rows in
> `internal/host/targets_data.go` were checked against official vendor
> documentation or vendor source: **44/44 verified**. 41 matched upstream as
> recorded; the two env-relocation filename defects found were fixed
> (`kode` writes `<KODE_CONFIG_DIR>/config.json`, `qwen-code`'s `QWEN_HOME`
> replaces `~/.qwen` instead of prefixing it), and two further gaps found
> during the audit were closed (`forgecode` now honours `FORGE_CONFIG`,
> `zed` gained its macOS `Library/Application Support` path). `astrbot`'s
> path was confirmed in vendor source (`func_tool_manager.py` →
> `get_astrbot_data_path()/mcp_server.json`). Remaining caveats are recorded
> in the row Notes: `iflow-cli` vendor EOL 2026-04-17 (target kept so
> existing installs stay manageable), `antigravity-cli` disputed path
> pending re-audit, `codebuddy` DocsURL unreachable from the audit
> environment (text matched via mirrors). A regression test pins the three
> relocated paths (`TestGenericTargetEnvRelocations`).

---

## 1. Extensible HostAdapter Architecture

LiteSPM connects to AI agent hosts through a strongly typed, compiled-in `HostAdapter` interface (`internal/host/types.go:59-68`).

```go
type HostAdapter interface {
    Descriptor() HostDescriptor
    DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error)
    PlanSetup(ctx context.Context, binaryPath string, backupDir string) (*HostChangePlan, error)
    ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error)
    VerifySetup(ctx context.Context) (*HostVerification, error)
    DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error)
    RenderManualSetup(binaryPath string) string
}

type HostDescriptor struct {
    HostID                 string   `json:"hostId"`                 // e.g. cline, pi-agent, grok-build, claude-code
    DisplayName            string   `json:"displayName"`            // e.g. "Cline (VS Code Extension)"
    SupportedVersions      []string `json:"supportedVersions"`      // Declared ranges, e.g. ">=2.0.0"
    DefaultConfigFileName  string   `json:"defaultConfigFileName"`  // e.g. cline_mcp_settings.json
    ConfigFormat           string   `json:"configFormat"`           // json | toml
    SupportsFormElicit     bool     `json:"supportsFormElicit"`     // Declared only; nothing consumes it
    RequiresBootstrapSkill bool     `json:"requiresBootstrapSkill"` // Declared only; no skill file is written
    SlashCommandTrigger    string   `json:"slashCommandTrigger,omitempty"` // verified command; empty when unknown
}
```

**Contract facts:**

*   The seven methods above are the whole interface. There is no `Compile`, `Project`, `WriteInstruction`, or `RegisterCommand` method, so the "write instructions/skills/commands into the host" behaviour is **`DESIGNED`, not implemented** — see §5.
*   `SupportsFormElicit`, `RequiresBootstrapSkill` and `SlashCommandTrigger` are descriptor metadata: each adapter sets them and `Descriptor()` returns them. The wizard prints the exact `SlashCommandTrigger` only when it is documented; otherwise it tells the user to ask the agent to use the connected MCP tools. `RequiresBootstrapSkill` is declared `true` for `claude-code` and `codex`, and LiteSPM writes no companion skill for either.
*   `PlanSetup` → `ApplySetup` writes exactly one server entry named `litespm` (the pre-rename `litepsm` entry is detected, deleted and replaced so only one bridge entry survives — `internal/host/target.go:99-105`).
*   `PathPlanner` is the optional second half of the contract (`internal/host/types.go:70-80`): an adapter that implements `PlanSetupAt` can plan the merge against a caller-supplied path, and `host.PlanSetupAt` (`:82-117`) refuses any plan whose `ConfigPath` differs from the named path. The wizard's manual-path write goes through it, so a typed path is either written or refused — never silently redirected to `DetectConfig`'s default.
*   Removal is the inverse of merge: `stripBridgeEntry` (`internal/host/remove.go:170-185`) deletes **both** the `litespm` and the legacy `litepsm` entry and touches no sibling; for JSON configs the produced file must re-parse with both entries gone before anything is written (`remove.go:138-149`). `litespm host remove <id>` / `host remove --all` (`cmd/litespm/main.go:734-746`) and `litespm uninstall` all go through this path.
*   `DetectPreExistingComponents` always returns `ReadOnly: true` components of kind `mcp`; no adapter emits `kind: "skill"` today.

---

## 2. Advisory & Metadata Discovery

**Today this is offline.** When a user runs `litespm`, the wizard prints **no advisory
metadata**: `printRuntimeSummary` (`cmd/litespm/wizard.go:154-162`) reports how many
adapters are compiled in and claims no runtime check, and the setup flow performs **no
HTTP request at all**. The one wizard step that touches the network is the action menu's
*Update the capability catalog* — an explicit, confirmed `catalog sync` (`wizard.go:656-705`).

*   **Where advisories were supposed to exist:** nothing publishes an `advisories` array today.
    The Go-built pointer carries only `createdAt`/`itemCount`/`manifestDigest`/`releaseId`/
    `schemaVersion`/`sequence`, the Python builder no longer writes the pointer, and the dead key
    was removed from `web/data/release.json` (`LPSM-E006`). There is no separate `adapters.json`
    endpoint.
*   **Nobody parses it yet.** No Go code reads `advisories`; `catalog.SyncResult`
    (`internal/catalog/client.go:20-26`) decodes only `releaseId`, `sequence`,
    `itemCount` and `updated`. The only network fetch of `/v1/current.json` is
    `catalog sync` (`Client.Sync` → `FetchCurrent`, `internal/catalog/client.go:196-197`
    and `91-101`), which is `SHIPPED`: the pointer and the release tree it names both answer 200
    at the live origin (verified 2026-10-05, `STATUS.md` §2).
*   **Zero local mutation.** Reading advisory metadata (when it is wired) is a
    passive read; it may tell the user a newer client binary is required. Config
    parsing and mutation are performed exclusively by the compiled-in binary, so
    supporting a new host config format requires a client release.
*   **Offline fallback.** With no network, the wizard uses the compiled-in
    adapter registry (`internal/host/registry.go`); this is the path that runs today.

---

## 3. Supported Agent Adapters

### 3.1 Cline (VS Code Extension) (`internal/host/cline.go`)
*   **Host ID:** `cline`
*   **Target Configuration (user scope only — `DetectConfig` ignores `scope`):**
    *   **All platforms:** `~/.cline/data/settings/cline_mcp_settings.json`. This is the file every Cline client reads (extension, CLI, JetBrains), per the extension source: *"The MCP settings file lives at `~/.cline/data/settings/` … shared across VSCode, CLI, and JetBrains clients."*
    *   **Overrides:** `CLINE_MCP_SETTINGS_PATH` (a file) or `CLINE_DATA_DIR` (a directory), both documented. When set, that file is the one created and written.
    *   **Legacy, probed last:** the VS Code `globalStorage` settings file (`%APPDATA%\Code…`, `~/Library/Application Support/Code…`, `~/.config/Code…`, plus `Code - Insiders`). Current Cline reads it only in a one-shot migration, so a bridge written there is invisible to a migrated install; it is probed only so a client too old to have migrated is still found.
*   **Format:** JSON (the host parses it with a strict `JSON.parse`; we read comment-tolerantly, see `ARCH/30` §8.1).
*   **Managed Injection:** Injects under `mcpServers.litespm`.
*   **Corrected 2026-10-06:** this section previously claimed the globalStorage path was current and the CLI's `~/.cline/…` path was "not managed". That was backwards; the audit (`ARCH/30` §8.1) traced the current contract in the vendor's own source.
*   **Detected External Capabilities:** Scans sibling keys under `mcpServers` (skipping `litespm`/`litepsm`) as read-only detected entries.

### 3.2 Pi Agent (`pi-coding-agent`) (`internal/host/piagent.go`)
*   **Host ID:** `pi-agent`
*   **Target Configuration:** `<agent-dir>/mcp.json`, where the agent directory is `~/.pi/agent` unless `PI_CODING_AGENT_DIR` overrides it (documented; also `agentDir` in the SDK). `~/.pi/config.json` and `~/.pi/mcp.json` were previously probed and are in no Pi documentation or source — removed, because probing them made an absent real file resolve to a path Pi never reads. Corrected 2026-10-06 (`ARCH/30` §8.1).
*   **Project scope:** implemented through `ProjectConfigPath` — a project-scope install writes `<project>/.pi/mcp.json` under `mcpServers`, Pi's documented project file ("a project entry replaces a user-level entry with the same name", so a project file can override — or disable — the bridge for that repository). `DetectConfig` still resolves only the user file and never scans the working directory: setup and detection remain user-scope. Verified 2026-10-11 (`pi_project_scope_test.go`).
*   **Format:** JSON (strict `JSON.parse` upstream; comments are tolerated on our side only — see `ARCH/30` §8.1).
*   **Managed Injection:** Writes under `mcpServers` — the only container Pi reads — and creates `<agent-dir>/extensions/litespm.ts` if absent. Earlier revisions switched to `mcp` or `mcp.servers` whenever the file contained an unrelated top-level `mcp` object, which put the bridge where Pi never looks.
*   **Companion extension:** the generated file (`internal/host/pi_extension.ts`) registers two Pi commands: **`marketplace`** — a focused overlay (`ctx.ui.custom`) with a search line, an installed list and an inspector, installing/removing through the real CLI (`pi.exec(["install", …])` / `["install", "remove", …]`) — and **`litespm`**, which lists the bridge's connected `mcp__litespm__*` tools through `pi.getAllTools()` and shows them with `ctx.ui.notify` (Pi command handlers have no tool-invocation API: `pi.mcp.callTool` never existed; `ctx.executeTool` is tool-context-only, upstream `types.ts` §ExtensionToolContext). **It is never removed by `host remove` / `uninstall`** — removal only strips config entries (`internal/host/remove.go`).
*   **Detected External Capabilities:** Detects external tools from the discovered config file in read-only mode.

### 3.3 Grok Build (`internal/host/grokbuild.go`)
*   **Host ID:** `grok-build`
*   **Target Configuration (user scope):**
    *   **Unix / macOS:** `~/.grok/config.toml`
    *   **Windows:** `%USERPROFILE%\.grok\config.toml`. There is no `%APPDATA%\Grok\config.toml` fallback — it appears in no xAI documentation and was removed after the 2026-10-06 audit (`internal/host/grokbuild.go`).
    *   Project scope `.grok/config.toml` is host-documented; the adapter does not scan it.
*   **Format:** TOML.
*   **Managed Injection:** Injects under `[mcp_servers.litespm]`.
*   **Detected External Capabilities:** Parses declared external `[mcp_servers.*]` sections in read-only mode.

### 3.4 Claude Code (`internal/host/claudecode.go`)
*   **Host ID:** `claude-code`
*   **Target Configuration:** user scope `~/.claude.json`; when `CLAUDE_CONFIG_DIR` is set, the adapter targets `$CLAUDE_CONFIG_DIR/.claude.json` as Anthropic's current MCP quickstart documents. Project scope remains `<root>/.mcp.json`, written through `ProjectConfigPath` — the file Anthropic documents for project scope, with the same `mcpServers` container and entry shapes (`ARCH/14` §bridge table note). Windows default user scope is `%USERPROFILE%\.claude.json`. LiteSPM does not target Claude Desktop's legacy `claude_desktop_config.json` or its distinct Desktop Extensions format.
*   **Format:** JSON.
*   **Managed Injection:** Injects under `mcpServers.litespm`.
*   **Detected External Capabilities:** Scans `mcpServers` in that file in read-only mode. **`.claude/skills/` is not scanned** — no adapter inspects any skills directory.

### 3.5 OpenAI Codex (`internal/host/codex.go`)
*   **Host ID:** `codex`
*   **Target Configuration (user scope):**
    *   **Unix / macOS:** `~/.codex/config.toml`
    *   **Windows:** `%USERPROFILE%\.codex\config.toml`. The adapter **does** honour `$CODEX_HOME` (`internal/host/codex.go`). There is no `%APPDATA%\Codex\config.toml` fallback — it appears in no OpenAI documentation and was removed after the 2026-10-06 audit; the documented Windows system path is the administrator-owned `%ProgramData%\OpenAI\Codex\config.toml`, which LiteSPM does not write.
    *   Project scope `.codex/config.toml` is host-documented; the adapter does not scan it.
*   **Format:** TOML.
*   **Managed Injection:** Injects under `[mcp_servers.litespm]`.
*   **Detected External Capabilities:** Parses declared external `[mcp_servers.*]` sections in read-only mode.

### 3.6 OpenCode (`internal/host/opencode.go`)
*   **Host ID:** `opencode`
*   **Target Configuration candidates:** `OPENCODE_CONFIG` selects an explicit file. Otherwise, `$OPENCODE_CONFIG_DIR/{opencode.jsonc,opencode.json}` when that variable is set, or `$XDG_CONFIG_HOME/opencode/` (default `~/.config/opencode/`) with the same two filenames, `.jsonc` first. OpenCode resolves this directory through xdg-basedir on every OS including Windows. Project scope is `opencode.json` / `opencode.jsonc` at the project root (then `.opencode/opencode.json(c)`), walked upward from the working directory; the adapter writes `<root>/opencode.json` for a `--scope project` install through `ProjectConfigPath`. `~/.opencode.json` and `%APPDATA%\OpenCode\opencode.json` are **not** read by any release and are no longer probed.
*   **Format:** JSON or JSONC — both are documented, so comments are tolerated.
*   **Local Entry Shape:** Local MCP entries require `"type": "local"` and a combined string array `"command"`, e.g. `{"mcp":{"servers":{"litespm":{"type":"local","command":["litespm","bridge","stdio","--host","opencode"]}}}}`.
*   **Layout (re-verified against the v2 docs 2026-10-11):** OpenCode v2 documents servers at `mcp.servers.<name>` (`https://opencode.ai/v2/docs/mcp-servers`, "Config"; flat names directly under `mcp` are stated to be not the v2 layout), so the adapter writes that container — bridge and server entries alike. The flat `mcp.<name>` shape (written by earlier LiteSPM releases, still loaded by a live v2.0.26 run) stays readable everywhere: verify, pre-existing-tool detection, listing, collision detection and fingerprinting span both shapes (`readKeyPaths`), removal tries all three documented candidates (`mcp.servers`, `mcp`, `mcpServers`), and setup migrates LiteSPM's own flat bridge member into the documented container while leaving foreign flat members alone. An earlier cut had this backwards — flat-only writes plus pruning of an empty `mcp.servers` — corrected against the v2 documentation; `mcp.servers` is the documented home of servers, not residue.
*   **Detected External Capabilities:** Scans existing configured servers in read-only mode.

### 3.7 Data-driven targets: 44 generic + 6 bespoke = 50 total (`internal/host/target.go`, `ARCH/30`)
*   The six adapters above are hand-written and retained (they carry behaviour the generic path does not model: Cline's legacy-path fallback and shared-settings overrides, and the Pi extension file).
*   All other agents are data rows (`verifiedBridgeTargets` in `internal/host/targets_data.go`, **44 rows**) served by the single `GenericAdapter` (`internal/host/generic.go`). Bespoke IDs always win name collisions (`TestBridgeTargetTableDoesNotShadowBespokeAdapters`).
*   **Counts:** `litespm host list` prints `Registered Agent Host Adapters (50)`. Skill installation targets are a separate set of **81** targets in `internal/skills/agents.go` (`AgentTargets()` — the 77 transcribed rows plus `universal`/`warp`/`grok`/`pi`, appended 2026-10-14; `ARCH/30` §10); the two sets overlap but are not equal, and `host list` reports bridge adapters only.
*   **Scope:** only `GenericAdapter.DetectConfig` honours `domain.ScopeProject`; every other `DetectConfig` ignores the `scope` argument and all production callers pass `ScopeUser`.
*   Surgical merge (`internal/host/jsonc_merge.go` + TOML merger) preserves comments/key order. See ARCH/30 for the honesty contract, exclusion table (23 unverified agents), and integrity tests.

#### 3.7.2 Server-entry install (catalog MCP servers)

`host.InstallServerEntry` registers a third-party MCP server, by name, in the
same container the bridge occupies, so an agent can spawn it. It is the write path
behind `litespm install <mcp-id>`.

*   **The launch line comes from the version record.** A listing carries no
    command; `versions.json` → `components[].runtime` does, and that is why
    `catalog sync` fetches and digest-verifies that file. A listing with no
    runnable component fails closed rather than producing a config the host
    cannot start.
*   **Per-host shape is data, not code.** Container key, format and entry shape
    come from the target table for data-driven hosts and from
    `bespokeEntrySpecs` for the hand-written six: a plain `{command,args}`,
    OpenCode's required `{"type":"local","command":[…]}`, Crush's schema-required
    `type: "stdio"`, a bare command string, or a TOML table.
*   **Same write discipline as the bridge.** Surgical splice, atomic backup, and a
    re-parse plus read-back that refuses to write a config it cannot verify.
*   **Never silently clobber.** An existing entry of the same name is refused
    (`LPSM-NAME-CONFLICT`); `--force` is the deliberate override. Names are
    restricted to `[A-Za-z0-9_-]` and normalized, because several hosts document
    exactly that and a name that worked on one host must not be the reason an
    install fails on another. `litespm` and `litepsm` are reserved.
*   **Targets are consented, not discovered.** With no `--host`, the install goes
    to every host whose LiteSPM bridge verifies as registered — a host the user
    never set LiteSPM up in is never edited on their behalf. With no such host,
    the install fails closed (`LPSM-INSTALL-TARGET-UNAVAILABLE`).
*   **What is recorded.** One `installs` row and one `host_registrations` row per
    modified config, so the entry is not an orphan nothing can find again.

#### 3.7.1 Config-write contract (all hosts, bespoke and generic)

A host config belongs to the user, so a setup or removal must touch exactly one
member. The rules are uniform across all 50 adapters:

*   **Splice, never re-serialize.** JSON and JSONC hosts are edited by byte
    offset (`mergeJSONEntrySurgical`), TOML hosts by a table-level text edit.
    Comments, key order, indentation, unknown keys and the trailing newline
    outside the touched object survive byte for byte. The four bespoke JSON
    adapters (`claudecode.go`, `cline.go`, `opencode.go`, `piagent.go`) share the
    same helper as the generic path (`renderBridgeEntryJSON`), so no host
    re-serializes a user's file.
*   **Comments are tolerated on read and preserved on write.** A host's own file
    may legitimately be JSONC — Cline's lives in VS Code's globalStorage settings
    — so reads go through `parseHostJSON`. Genuinely invalid JSON is still
    refused; a commented config is not "invalid".
*   **Never write what cannot be read back.** The merged text is re-parsed and the
    entry asserted before it is written, and removal refuses rather than writing a
    document it has just proved is broken.
*   **Removal finds the entry wherever it is.** A host with more than one
    documented layout (OpenCode: `mcp.<name>`, `mcp.servers`, `mcpServers`) tries
    each path and rewrites only the one that actually holds an entry, so
    `host remove` cannot silently leave a bridge registration behind.
*   **Round-trip fidelity.** TOML configs and multi-line JSON objects are
    restored byte for byte by `host remove`. A single-line JSON object may retain
    one line break, because inserting an entry into it necessarily added a line;
    content and validity are preserved. Guarantees are pinned by
    `internal/host/json_splice_test.go` and the `host remove` round-trip tests.

#### 3.7.3 Forwarding environment variables (`--env <NAME>`)

`litespm install <mcp-id> --env <VARIABLE_NAME>` records that a server needs a
variable. It takes **names only, never values**: the host config receives a
reference the host expands at spawn time, so a credential never passes through
LiteSPM at all — not into a backup, not into the install ledger, not into a config
file, and not into a shell history, because it was never accepted on the command
line.

This cannot be one constant. The hosts that document substitution each spell it
differently, one names the field differently, one has no substitution at all, and
three differ in what they do when the variable is unset. Writing the wrong form
produces an entry that looks configured and fails only at first launch. The
verified matrix is data in `internal/envref`, and each row carries the vendor URL
it was read from.

| host | field | reference written | unset behaviour |
|---|---|---|---|
| `claude-code`, `github-copilot`, `gemini-cli`, `kiro-cli`, `pi-agent`, `grok-build` | `env` | `${NAME}` | differs — see below |
| `cursor`, `cline` | `env` | `${env:NAME}` | `cline` passes the literal text through |
| `opencode` | **`environment`** | **`{env:NAME}`** (no `$`) | not documented |
| `codex` | **`env_vars`** (name list) | *none — the name itself* | not forwarded when absent from the parent environment |

*   **Codex is a different mechanism, not a different spelling.** Its `env` table
    is documented as copied into the subprocess *as-is*, so a `${NAME}` written
    there reaches the child as that literal text and is used as the credential.
    Codex forwards by **name** through a separate `env_vars` list instead, which is
    what LiteSPM writes.
*   **Three silent failures are reported at install time, not buried here.**
    Gemini substitutes an **empty string** for an unset variable (the server then
    starts and answers unauthenticated); Kiro **refuses to expand** any name absent
    from its `mcp.approvedEnvVars` allowlist, leaving the reference as written; and
    `claude-code` / `cline` pass the reference's literal text through. `litespm`
    prints the applicable caveat per host after registering the entry.
*   **An unverified host is refused.** `internal/envref` has no row for a host
    without documented behaviour, and `--env` fails before any config is touched
    rather than writing a reference on an assumption.
*   **Two readers, one reference.** The host expands it when the agent spawns the
    server; `litespm capabilities refresh` expands it itself when *it* spawns the
    server, because the host's expansion does not apply to a process LiteSPM
    starts. That resolver handles only the four forms LiteSPM emits — deliberately
    not `{file:/path}` (Windsurf, OpenCode) or `!command` (Pi), which are
    documented by their hosts and are **never** resolved here, since honouring
    them during a probe would turn discovering an installed server into a local
    file-read and command-execution primitive. A value that is not a whole-value
    reference is passed through untouched, so a hand-written literal keeps working.
*   **Names are validated** (`[A-Za-z_][A-Za-z0-9_]*`, no duplicates) before any
    write, so a typo fails at the command line rather than as a reference that can
    never resolve.

#### 3.7.4 Remote (URL) server entries

An MCP listing whose version record carries an **endpoint** instead of a command installs as a
URL-only entry — one transport, spelled exactly the way that host spells it:

*   **Endpoint selection happens at ingestion, never at install.** The producer picks one endpoint
    from the registry server's own `remotes[]` (first `streamable-http`, else the first entry —
    multiple endpoints per server are the norm upstream) and publishes it as `url` + `transport`
    only after `publishable_endpoint()` accepts it statically (https or loopback-http, no
    credentials, no fragment, default port, no non-public IP literal:
    `scripts/build_full_catalog.py:586-651`, row emission `:696-723`); `internal/catalogbuild`
    carries `url` into `RuntimeDescriptor.Endpoint` (`dataset.go:45`, `:329-341`). Nothing at
    install time fetches, probes or guesses a URL.
    **Measured 2026-10-19:** the published release `rel-2026-10-17-01` carries **25,401 rows with a
    non-null `url`**, and those are exactly the 25,401 `metadata_verified` MCP listings — the producer
    change is live, so the path below is fed by a release ([STATUS.md](../STATUS.md) §2–§3).
*   **8 of 50 hosts are verified capable:** the six bespoke adapters (`claude-code`, `cline`,
    `opencode`, `codex`, `pi-agent`, `grok-build`) plus the two data rows whose exact remote entry
    object was read from the row's `DocsURL` (`cursor`, `zed`).
    `TestRemoteCapabilityMatrixCounts` pins the counts at exactly 8 capable / 42 refused, so an
    accidental mass-enable (or an un-evidenced spec) fails the test instead of silently changing
    what installs write.
*   **The honesty rule.** A `RemoteEntrySpec` may be set only when the *entire* entry object — URL
    key, discriminator key and its values, and which transports the host accepts — was read from
    that host's own documentation or repository; a URL key glimpsed in a doc is evidence of a URL
    key, not of a complete entry shape (`internal/host/target.go:99-135`). A guessed spec writes an
    entry the host silently ignores, which is worse than refusing.
*   **Everything else refuses, fail-closed.** `host.RemoteEntrySpecFor` is the single capability
    query that plan-time filtering, install and copy all resolve through
    (`internal/host/entry_install.go:368-387`): the other 42 targets answer "no spec" and receive
    `LPSM-HOST-REMOTE-UNSUPPORTED` — never a fallback to a stdio write, never a guessed URL key.
    The plan applies the same rule per host: a LiteSPM-chosen default set is filtered to capable
    hosts with every drop reported, while an explicit `--host` set is never filtered — an incapable
    named host fails by name (`cmd/litespm/main.go:2638-2714`). The endpoint itself is checked by
    the shared egress guard at plan time (`ARCH/05` §3.1), so an unsafe URL never reaches an
    approval prompt or a config file.

---

## 4. In-Agent Marketplace Experience

The bridge exposes 13 tools and a `marketplace` MCP prompt to every
configured host. MCP defines prompt discovery and retrieval, not a universal
slash-command UI. Each client may turn the prompt into a slash command, show it
in a picker, or make only the tools available. LiteSPM records a command in
host metadata only when vendor documentation confirms the exact syntax. The
[agent-by-agent audit](../docs/audits/2026-10-25/marketplace-agent-entrypoints.md)
tracks all 50 MCP hosts and all skill-only targets.

The Pi extension is the one LiteSPM-native rich marketplace panel. Other hosts
use their own MCP prompt UI or invoke the bridge tools from a normal request.

### 4.1 Portable MCP Contract

The bridge advertises 13 MCP tools and a `marketplace` prompt. A prompt is a
reusable request template, not a guaranteed command or graphical interface.
Agent-specific invocation behavior is listed in §5. The tool contract and
current operation status are tracked in [STATUS.md](../STATUS.md) §4. A shim
without a daemon connection returns `LPSM-IPC-DAEMON-UNREACHABLE` rather than
inventing inventory (`internal/bridge/shim.go`).

Pi's native extension provides LiteSPM's interactive marketplace panel. Other
hosts receive the MCP prompt and tools; their prompt picker, command syntax, and
rendering depend on the client. A host without prompt UI can still call the
bridge tools from a regular agent request.

---

## 5. In-Agent Marketplace Entry Points

The MCP prompt is shipped for all bridge hosts. Exact shortcuts vary: Claude
Code uses `/mcp__litespm__marketplace`, CodeBuddy and OpenCode use
`/litespm:marketplace`, and Qwen Code and Gemini CLI use `/marketplace`. Kiro
CLI V3 supports `/marketplace`, but setup does not print it because the adapter
cannot confirm which CLI version is installed. Pi's `/marketplace` comes from LiteSPM's native
extension. Cursor, Crush, Jazz, and Zed document prompt support through their
own interfaces but not a literal prompt command. For other clients, use a
natural-language request to call LiteSPM's bridge tools. Codex has the tools
path and no documented MCP-prompt command.

The setup wizard does not install a custom command for every host. It shows
only a verified literal command and otherwise explains the tool-based path.
See the audit for sources and every host's status.


---

## 6. Cross-Agent Porting Contract (`DESIGNED`)

`litespm copy` (ARCH/38 §5) reads one agent's configuration and reproduces it
in another. This section is what it may rely on from an adapter — and what an
adapter must never do for it. No `HostAdapter` method is added for this; the
contract is composed from what §1 already specifies.

### 6.1 Read side (exists)

*   Registered entries: `host.ListServerEntriesWithValues(hostID, scope)`
    returns each entry with the environment content **as found in the config**.
*   Pre-existing/native components: each adapter's
    `DetectPreExistingComponents` (read-only; §2).
*   The reader must keep distinguishing the two environment forms the
    canonical `ServerEntry` models:
    *   `Env` — **literal values** present in the user's file. Porting
        normalizes these to `Needs`/`dropped`: a literal secret is reported
        by name and never carried into the IR, let alone written anywhere
        (ARCH/38 §5.5).
    *   `EnvNames` — forwarded variable names / references. These are the
        only environment facts the IR carries.

### 6.2 IR and render side (exists)

The IR is `host.ServerEntry{Name, Command, Args, EnvNames, …}` — the same
type `InstallServerEntry` consumes, so "translate" means: parse the source
config into entries, rebuild `ServerEntry`, and hand it to the target's
normal install path. Shape variation stays data-driven (§1,
[ARCH/30](30-DATA-DRIVEN-BRIDGE-TARGETS.md)):

```text
OpenCode  {"type":"local","command":["engram","mcp","--tools=agent,graph"]}
                         │  read (server-entry spec: ShapeLocalArray)
                         ▼
IR        {Command:"engram", Args:["mcp","--tools=agent,graph"]}
                         │  render (target spec: command string + args array)
                         ▼
Codex     command = "engram"
          args    = ["mcp", "--tools=agent,graph"]
```

### 6.3 Support check (exists)

An entry is representable on a target iff `entrySpecFor(scope)` resolves for
that host and the entry's shape matches the spec's field style; otherwise
porting reports `unsupported` with the reason (never a silent drop, never a
guess — ARCH/38 §5.7 `LPSM-COPY-002/003`).

### 6.4 Write side (exists, reused unchanged)

Porting writes through `InstallServerEntry` / the skills installer, so it
inherits the backup, comment/sibling preservation, name-conflict refusal,
deployment-ledger row and install-transaction semantics that installs already
have. An adapter must not gain a second, porting-only write path.
