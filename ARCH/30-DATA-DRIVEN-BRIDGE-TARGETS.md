# ARCH-30 — Data-Driven Agent Bridge Targets

Status: **`WIRED`.** The 46-row table is compiled into the adapter registry (`internal/host/registry.go:34-41`) and drives `host detect/setup` through `GenericAdapter`; `litespm host list` reports 52 adapters (6 bespoke + 46 generic).
Related: [16 — Host Adapters](16-HOST-ADAPTERS.md), [14 — Bridge & Provider MCP](14-BRIDGE-PROVIDER-MCP.md), [29 — Connector System Design](29-CONNECTOR-SYSTEM-DESIGN.md).

---

## 1. Problem

Six agent hosts were supported by six hand-written `HostAdapter` implementations (`internal/host/{claudecode,cline,codex,opencode,piagent,grokbuild}.go`). Each is roughly 170–290 lines, and the overwhelming majority is identical: resolve a path, back up the file, merge one `litespm` entry, verify.

Two problems with that shape:

1. **It does not scale.** Covering the agent ecosystem at that ratio is tens of thousands of lines of duplicated boilerplate.
2. **The knowledge has no evidence trail.** Which config path, which key, which entry shape — all of it is buried in code. A reviewer cannot tell a verified path from an assumed one, and an assumed path produces an installer that silently writes to the wrong place. That is the worst possible failure for a tool whose job is editing other people's config files.

## 2. Decision

Split the adapter into the part that is generic and the part that is data.

* **`BridgeTarget`** (`internal/host/target.go`) — one agent's MCP configuration as a struct: config path per scope, format, MCP key path, entry shape, detection signals, the documentation URL it was verified against, and caveats.
* **`GenericAdapter`** (`internal/host/generic.go`) — the only implementation of the `HostAdapter` contract. It carries no per-agent knowledge.
* **`verifiedBridgeTargets`** (`internal/host/targets_data.go`) — the table. Adding an agent is one row plus a test.

The six hand-written adapters are **retained unchanged**. They predate this design, are individually tested, and carry behaviour the generic path does not model (OpenCode's dual v1/v2 layouts, Codex and Grok's TOML table handling, Pi's extension generation, Cline's comment preservation). `TestBridgeTargetTableDoesNotShadowBespokeAdapters` keeps the two generations from overlapping.

## 3. Honesty contract

A row ships only if its config path, MCP key and entry shape were read from that agent's own documentation or repository. `DocsURL` records the source and is required — enforced by `TestBridgeTargetRowsAreComplete`.

Agents that could not be verified are **absent from the table**, with the reason recorded in a comment block above it so the gap is not silently re-filled later. The list below names **24 agents**, but one of them (`roo`) is excluded only at *user scope* — its repo-scope target **is** shipped — so the number of agents with **no** shipped bridge target is **23** (see §10). Current exclusions and their causes:

| Excluded | Reason |
|---|---|
| `windsurf` | Current docs point at `~/.config/devin/mcp_config.json` — the same file the `devin` row owns. Two hosts silently sharing one file means setting up either rewrites the other's config. |
| `continue`, `goose`, `hermes-agent` | YAML configs; `goose` additionally uses key `extensions` and `cmd` instead of `command`, and does not support SSE. |
| `mistral-vibe`, `vtcode`, `reasonix`, `autohand-code` | Array-shaped server maps (`[[mcp_servers]]`, `[[mcp.providers]]`, `[[plugins]]`) or multi-format configs. Each needs its own reader. |
| `dexto`, `eve` | MCP config lives inside the agent's own YAML / TypeScript source, not a config file. |
| `lingma`, `loaf`, `tinycloud`, `moxby`, `mcpjam`, `replit` | No documented on-disk client config, or no vendor source could be reached. |
| `sarvam-code` | Product unreleased. |
| `terramind` | Not an agent: IBM's Earth Observation foundation model. |
| `promptscript` | MCP is an unimplemented roadmap item. |
| `adal`, `trae`, `trae-cn` | MCP works, but the user-scope config path is not published. |
| `roo` (user scope) | Stored in the IDE's `globalStorage`, whose absolute path the vendor docs never print. Repo scope is shipped instead. |
| `codemaker` | No reachable vendor documentation at all. |

## 4. Config writing is surgical

Parsing a config into `map[string]any` and re-serializing it would delete every `//` comment in it. Several verified hosts keep user-authored comments in their config, and one (`tabnine-cli`) keeps `mcpServers` inside a large shared settings document used by unrelated features. Silent comment deletion is data loss in an installer.

So `mergeJSONEntrySurgical` (`internal/host/jsonc_merge.go`) locates the target object **by byte offset** and splices only the `litespm` member into it. Everything else survives byte-for-byte: comments, key order, indentation, blank lines.

The mechanism rests on one invariant, pinned by `TestStripJSONCommentsPreservesOffsets`: `stripJSONComments` replaces comments with equal-length whitespace, so offsets resolved against the stripped text are valid offsets into the original.

Two consequences, both deliberate:

* **Strict-JSON hosts refuse a commented file** rather than guessing. `TestStrictJSONHostsRefuseCommentedFiles` pins both halves of this policy so they cannot drift into each other.
* **Every merge is re-parsed and asserted** before anything is written. A writer bug returns an error; it never ships a corrupt config file.

TOML targets use `mergeTOMLEntry`, which replaces or appends a single `[mcp_servers.litespm]` table and leaves every other section — including comments — untouched.

## 5. Supported shapes

| Shape | Written as | Hosts |
|---|---|---|
| `ShapeObject` | `{"command": …, "args": [...]}` | the majority, including Claude Desktop and VS Code portable Copilot |
| `ShapeStdioTyped` | `{"type": "stdio", "command": …, "args": [...]}` | Crush |
| `ShapeLocalTypedString` | `{"type": "local", "command": "…"}` | GitHub Copilot CLI |
| `ShapeLocalArray` | `{"type": "local", "command": [argv…]}` | opencode, kilo, fx, codearts-agent, posit-assistant |
| `ShapeCommandString` | `"<bin> bridge stdio --host <id>"` | mux (Xum) |

MCP key paths in use: `mcpServers` (including VS Code portable Copilot), nested `mcp` and `amp.mcpServers`, `mcp.servers`, `context_servers` (Zed), `servers` (codestudio, Xum).

## 6. Path resolution

`resolveHomeDir()` honours `USERPROFILE` on Windows and `HOME` on Unix. `%APPDATA%` and `%LOCALAPPDATA%` are read **only** when `runtime.GOOS == "windows"`; gating on the variable merely being set silently redirected config paths during testing, since those variables are meaningless on Unix. `XDG_CONFIG_HOME` is honoured via `xdgConfigDir`. Claude Desktop uses `%APPDATA%\\Claude\\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, and `${XDG_CONFIG_HOME:-~/.config}/Claude/claude_desktop_config.json` on Linux.

Per-target overrides actually read by this resolver (`internal/host/targets_data.go`): `XDG_CONFIG_HOME`
(via `xdgConfigDir`), `ASTRBOT_ROOT`, `GEMINI_CLI_HOME`, `COPILOT_HOME`, `KIMI_CODE_HOME`,
`QODER_CONFIG_DIR`, `QODERCN_CONFIG_DIR`, `KODE_CONFIG_DIR`, `OH_PERSISTENCE_DIR`,
`CRUSH_GLOBAL_CONFIG`, `APPDATA` and `LOCALAPPDATA` (Windows only).

Agent-home variables `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `GROK_HOME`, `AUTOHAND_HOME`,
`HERMES_HOME`, `VIBE_HOME` and `SARVAM_HOME` are honoured by **`internal/skills`** only — they
select where skill directories are written, not where a host's config file lives; no host adapter
reads them (`ARCH/16` §3.4–§3.5). `AIDER_DESK_HOME_DIR` is not read anywhere in the tree.

## 7. Integrity tests

These exist to make an unverified or wrong row impossible to ship quietly:

| Test | Prevents |
|---|---|
| `TestBridgeTargetRowsAreComplete` | A row without a `DocsURL`, a key path, or a detection signal. |
| `TestBridgeTargetTableHasNoUndeclaredSharedConfigFiles` | Two hosts resolving to one config file unless **both** declare the overlap in `SharedConfigWith` and explain it in `Note`. This is the Windsurf bug class. Currently one declared pair: `antigravity` / `antigravity-cli`, which genuinely share `~/.gemini/config/mcp_config.json`. |
| `TestBridgeTargetTableDoesNotShadowBespokeAdapters` | A table row silently replacing a tested hand-written adapter. |
| `TestBridgeTargetTableExcludesUnverifiedAgents` | Quietly re-adding an agent that was excluded for lack of evidence. |
| `TestEveryTableTargetAppliesToARealisticFile` | Any row emitting a broken edit — runs all 46 rows against a realistic seeded config and asserts the bridge entry lands, the key path is right, and foreign servers and unrelated settings survive. |
| `TestGenericAdapterPreservesUserCommentsEndToEnd` | Regression test for the comment-deletion data-loss bug. |
| `TestRenderConfigRefusesToClobberScalar` | Confused-deputy overwrite: if a key path collides with an unrelated scalar, fail rather than replace it. |

## 8. Verification

Run at time of writing:

```
go build ./...
go vet ./...
go test ./... -count=1     # all packages green
```

Registered adapters after this change: **52** (6 hand-written + 46 verified targets).

### 8.1 Host documentation audit — 2026-10-06

Every row in `internal/host/targets_data.go` and all six hand-written adapters
were re-checked against live vendor documentation, one host at a time. The
previous claim in that file's header — "every row here was checked against that
agent's own documentation" — was not true for every row, and the audit found
defects that produce **silent failure**: LiteSPM writes the bridge, reports
`ready`, and the host never reads it.

**Fixed (silent failure — the host ignored us):**

| Row / adapter | Defect |
|---|---|
| `opencode` | Wrote `mcp.servers.litespm`. No such key exists: the published schema types `mcp` as a map of server entries and the runtime rejects a member without `type`. Also probed `~/.opencode.json` and `%APPDATA%\OpenCode\opencode.json` (no release reads either), ignored `OPENCODE_CONFIG_DIR`/`XDG_CONFIG_HOME`, and never looked at `opencode.jsonc`. |
| `cline` | Wrote the VS Code `globalStorage` settings file. Cline moved it to `~/.cline/data/settings/cline_mcp_settings.json` (shared by all clients) and reads globalStorage only in a one-shot migration, so writes there are a no-op. `CLINE_MCP_SETTINGS_PATH`/`CLINE_DATA_DIR` ignored. |
| `amp` | Wrote a nested `{"amp":{"mcpServers":…}}`. Amp's published schema declares the property literally as `"amp.mcpServers"` with `additionalProperties:false`, so the nested form was both unread and schema-invalid. Now `FlatKey`. |
| `pi-agent` | Probed two undocumented paths, and switched to a `mcp`/`mcp.servers` container whenever the file contained an unrelated top-level `mcp` object — a container no Pi version reads. `PI_CODING_AGENT_DIR` ignored. |
| `crush` | Windows user-global path taken from `%APPDATA%`; Crush reads `%LOCALAPPDATA%`. Its schema marks `type` as **required** and its decoder applies no default, so the entry started no transport at all. New `ShapeStdioTyped`. |
| `codex` / `grok-build` | Ignored `CODEX_HOME` / `GROK_HOME` (both documented; `internal/skills` already honoured them, so the two subsystems disagreed). Probed an undocumented `%APPDATA%` fallback. |
| `codebuddy` | Candidate list skipped the documented middle entry (`~/.codebuddy/mcp.json`, `<root>/mcp.json`), so an existing one made us write to a file the host never consults. Its own `Note` already documented the correct chain. |
| `kode` | `KODE_CONFIG_DIR` changes the **filename** to `config.json`, not `kode.json`. |
| `kilo` | Selected `kilo.jsonc` without `TolerateComments`, so setup failed on the very comments that motivate `.jsonc`. |
| `fx` | Project `.mcp.json` uses `mcpServers`, not `mcp`. |
| `aider-desk` | `AIDER_DESK_HOME_DIR` ignored. `qwen-code`: `QWEN_HOME` ignored. |
| `astrbot` | Fell back to `$HOME` for its root; AstrBot falls back to the process working directory. |
| `tabnine-cli` | Documented workspace scope unregistered; published `DocsURL` returns 404. |
| `cortex`, `codearts-agent`, `kiro-cli` | Documented candidate/scope paths missing. |
| shared writer | `RenderManualSetup` emitted the entry object where the **server name** belongs, so the wizard's paste-this-snippet fallback printed invalid JSON for all 44 rows. |

**Open, deliberately not "fixed":**

* **Vendor self-contradictions on `type`.** Cursor and Firebender publish a field table marking `type` required while every JSON example on the page omits it; the Snowflake CLI page requires it and its Desktop page omits it; Kiro, Copilot, Augment and Rovo are unverifiable either way. We write the minimal stdio entry and do not guess. If any of these turns out to require `type`, the row's shape is a one-line change.
* **Trailing commas.** CodeBuddy documents JSONC *with* trailing commas. Go's decoder rejects them, so such a file fails closed at setup. Widening the reader is a separate, larger change than comment tolerance.
* **Comment tolerance can outpace the host.** Cline, Claude Code, Pi and Roo parse with a strict `JSON.parse`. Our tolerant reader will splice into a commented file that the host then rejects. Fail-closed on our side is not enough to surface it; see §9.
* **Unverified row details** left in place but not relied upon: the `OH_PERSISTENCE_DIR` branch, droid's "user wins" precedence note, and the Devin note's Windsurf claim (vendor pages 404).

The durable lesson, now enforced by `internal/host/host_docs_audit_test.go`:
assert the *host-visible* result (valid JSON, the server named, the entry under
the key the vendor documents), not just that our own writer round-trips.

### 8.2 Cross-platform host additions and website path matrix — 2026-11-08

Two vendor integrations were added after checking the current official configuration references:

| Host | Config path | Format and scope | OS coverage | Remote |
|---|---|---|---|---|
| Claude Desktop | Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`; macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Linux: `${XDG_CONFIG_HOME:-~/.config}/Claude/claude_desktop_config.json` | JSON, top-level `mcpServers`, local stdio | Windows, macOS, Linux | Not advertised by the local config reference; refused |
| Visual Studio Code (Copilot harness) | Workspace: `.mcp.json` | JSON, top-level `mcpServers`; stdio entries use `command` + `args` without a VS Code-specific `type` | Windows, macOS, Linux | HTTP only, with `type: "http"` + `url` |

Sources: [MCP local-server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers) (Claude Desktop availability, OS paths, and `mcpServers` shape), [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) (workspace/profile/portable formats, fields and transports), and [VS Code configuration destinations](https://code.visualstudio.com/docs/agent-customization/mcp-servers) (current compatibility/deprecation status).

**Important platform corrections and decisions:**

* Claude Desktop's current MCP docs include Linux support. Linux uses `XDG_CONFIG_HOME/Claude`, defaulting to `~/.config/Claude`. The installer now honours `XDG_CONFIG_HOME`; the old macOS/Windows-only assumption was wrong.
* VS Code has distinct configuration schemas. LiteSPM writes the portable Copilot workspace `.mcp.json` format (top-level `mcpServers`), which Copilot harness sessions read directly. Portable entries support stdio and HTTP, not SSE. The separate VS Code `.vscode/mcp.json` Local-harness format uses top-level `servers`, requires `type: "stdio"` for stdio entries, and supports HTTP/SSE; VS Code still accepts it but labels it deprecated in guided setup. LiteSPM does not write that legacy format or guess a profile-managed global path.
* The generated host registry now carries `supportedOS` and `layoutScope`. Project-only adapters emit the project-scope key path and entry shape, fixing the previous user-scope website mismatch.
* App recovery now has a route-level `error.tsx`, root `global-error.tsx`, and custom `not-found.tsx`. Both error boundaries log diagnostics, offer a retry action, and provide a safe return to the catalog without exposing raw exception details.
* The website agent detail view now has Windows/macOS/Linux selectors and displays the path and matching bridge example for the selected OS. Windows paths derived from a home-relative config are explicitly labelled as derived; AppData-specific paths have vendor-specific overrides. The installer continues to honour host-specific environment overrides.
* Regression coverage: `TestClaudeDesktopConfigPaths`, `TestVSCodeUsesPortableCopilotSchemaAndProjectScope`, `TestSupportedTargetOSIsFailClosed`, `TestRemoteCapabilityMatrixCounts`, `web/scripts/test-hardening.mjs`, and `web/scripts/test-host-paths.ts` (all 52 hosts across Windows, macOS, and Linux).

This is an implementation-level path matrix: where a vendor documents an OS-specific path, LiteSPM uses it; where the vendor only documents a home-relative path, the Windows form is labelled as LiteSPM's expansion rather than represented as a vendor quotation.

## 9. Known limitations

* `TolerateComments` is advisory metadata. The writer preserves comments for all JSON targets regardless; the flag records which hosts document the format as comment-tolerant.
* `DetectPaths` and `DetectBinaries` are recorded but install-detection is not yet wired into a CLI command; `DetectInstalledHosts` currently reports verification state only.
* Several rows note that a **Windows-native path is derived from `~` expansion** rather than stated by the vendor. The website labels these as home-relative defaults expanded under `%USERPROFILE%`; it does not present them as vendor-quoted paths. The installer honours documented host-specific environment overrides (for example `XDG_CONFIG_HOME`, `COPILOT_HOME`, `GEMINI_CLI_HOME`, `APPDATA`, and `LOCALAPPDATA`) when present.
* No target supports TOML array-of-tables or YAML. Those two formats account for the majority of the 23 fully-excluded agents (the §3 table names 24 agents; `roo` is a scope-only exclusion, shipped at repo scope).

## 10. Relationship to the 81 skill targets

Two different registries, deliberately not conflated:

* **Bridge targets** (this document, 46 rows) — agents whose **config file LiteSPM can edit** to register the MCP bridge.
* **Skill install targets** (`internal/skills/agents.go`, 81 targets) — agents where LiteSPM can **write a `SKILL.md`** into a skills directory. The 77 transcribed rows plus the `universal`/`warp`/`grok`/`pi` ids appended 2026-10-14; the generated `web/data/skill-targets.json` was regenerated on 2026-10-15 and now lists all **81**, matching `skills.AgentTargets()` — the CI gate "Verify Generated Host Data Is Current" passes.

The sets overlap but are not equal. 69 agents were researched for bridge support: **46 shipped** and **23 fully excluded**. (The §3 exclusion table names 24 agents, but `roo` is excluded only at user scope; its repo-scope target is shipped, so it is counted among the 46, not among the 23.) Some skill targets are IDE extensions with no CLI config file; some bridge targets are cloud products with no skills directory. `litespm host list` reports bridge adapters only — it does not claim skill coverage.
