<div align="center">

<img src="web/public/logo.svg" alt="LiteSPM" width="72" height="72">

# LiteSPM

**The package manager for AI agents.**

One verified catalog of MCP servers, agent skills and plugins.
Install into 52 coding agents. Undo any of it with one command.

[![npm](https://img.shields.io/npm/v/litespm.svg?color=10b981&logo=npm)](https://www.npmjs.com/package/litespm)
[![CI](https://github.com/sarv-projects/LiteSPM/actions/workflows/ci.yml/badge.svg)](https://github.com/sarv-projects/LiteSPM/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![platforms](https://img.shields.io/badge/platforms-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-6b7280.svg)](#install)
[![agents](https://img.shields.io/badge/agents-52-8b5cf6.svg)](#supported-agents)

[Website](https://lite-spm-nine.vercel.app) ·
[Marketplace](https://lite-spm-nine.vercel.app/marketplace) ·
[Docs](https://lite-spm-nine.vercel.app/docs) ·
[Status](STATUS.md) ·
[Changelog](CHANGELOG.md)

</div>

---

## Why LiteSPM

Every AI coding agent keeps its own configuration file in its own format, and
every MCP server, skill and plugin ships its own install instructions. Setting
up three agents means manually editing three config files, and nothing records
what to undo later.

LiteSPM is one CLI that knows all of those formats. You pick a capability from
a single catalog, see the exact change it will make, approve it, and it is
written with a backup. When you remove it, LiteSPM takes out only what it
wrote and leaves your own edits alone.

No account. No telemetry. No proxy between you and your servers.

## Install

```bash
npm install -g litespm
```

```bash
litespm                          # setup wizard: finds your agents, shows each change, writes after you confirm
litespm search postgres          # search the catalog (it downloads itself on first use)
litespm install <id>             # plan → preview → approve → install
litespm list                     # what is installed, per agent
litespm install remove <installId>   # undo exactly that install
```

Requires Node.js 22.22.2+ (24.15+ and 26+ also work) for the npm launcher, which
downloads the native binary for your platform (Windows, macOS, Linux; x64 and
arm64) and verifies its Sigstore signature before anything runs. Prefer a
standalone binary? Take one from
[GitHub Releases](https://github.com/sarv-projects/LiteSPM/releases).

## Features

| | |
|---|---|
| **One catalog** | 69,376 listings: 48,418 MCP servers, 20,320 agent skills and 638 plugins, drawn from the official MCP Registry, publisher repositories and community directories. Each is labelled with its publisher, its source and whether LiteSPM can install it. |
| **Every agent** | 52 agent adapters and 81 skill targets, each written in the agent's own configuration format. 47 of the 52 also take remote (URL) MCP servers. |
| **A marketplace inside your agent** | `litespm setup` adds a `/litespm-marketplace` command: a popup in Pi, OpenCode, Claude Code and GitHub Copilot CLI, a prompt command elsewhere. |
| **Preview, backup, undo** | Every write is planned and shown first, the previous file is backed up byte for byte, and removal takes out only what LiteSPM wrote. |
| **Fast, self-updating catalog** | The catalog syncs itself and is searched through an on-disk SQLite FTS5 index: milliseconds per query at about 30 MB of memory, instead of loading roughly 100 MB. |
| **Verified supply chain** | Sigstore-verified binaries; a digest-verified catalog that refuses rollbacks and equivocation. |
| **Local and private** | Credentials stay in your environment or the OS keychain. LiteSPM writes references, never secret values. |
| **A skills manager too** | `litespm skills add/use/find/list/update/remove` works from a GitHub repo, URL or local folder. |

## Supported agents

`litespm host list` prints all 52 with the file each one uses;
`litespm host detect` shows which are on this machine. A few of them:

| | |
|---|---|
| **Terminal agents** | Claude Code, OpenAI Codex, OpenCode, Gemini CLI, GitHub Copilot CLI, Kiro CLI, Qwen Code, Grok Build, Pi Agent, Crush, Amp, Droid, Devin |
| **Editors and IDE agents** | Cursor, Cline, Roo Code, Kilo Code, Visual Studio Code, Zed, Augment, Junie, Antigravity, Claude Desktop |
| **And more** | AiderDesk, OpenHands, Deep Agents, ForgeCode, Tabnine CLI, IBM Bob, Qoder, CodeBuddy and the rest of the registry |

Six adapters (Claude Code, Codex, OpenCode, Cline, Pi, Grok Build) are
hand-written. The others come from one data-driven registry built from each
vendor's documented format
([`internal/host/targets_data.go`](internal/host/targets_data.go)), so adding an
agent is a data entry with the same planning, backup and removal guarantees.

Five agents (Claude Desktop, Code Studio, iFlow CLI, Mux, ZCode) publish no
remote-server entry format, so LiteSPM refuses remote entries for them rather
than write something the agent would ignore. Per-agent paths and notes are in
[AGENTS.md](AGENTS.md).

## The marketplace inside your agent

After `litespm setup --agent <id>` (or the wizard), type the command in the agent:

| Agent | Command | Experience |
|---|---|---|
| Pi | `/marketplace` | Popup with tabs (All, MCP servers, Skills, Plugins, Installed), search, details, Enter to add or remove |
| OpenCode 2.x | `/litespm-marketplace` | Search dialog with grouped results, install and remove |
| Claude Code | `/litespm-marketplace` | A pane with tabs, search, details and Install / Remove / Refresh |
| GitHub Copilot CLI | `/litespm-marketplace` | Select lists and confirmations |
| Gemini CLI, Qwen Code, Kiro, Cursor, Augment, Roo, Factory Droid, Kilo, Cline | `/litespm-marketplace` | A command that has the agent drive LiteSPM's tools |
| Grok Build, Codex, Crush | `/litespm-marketplace`, `$litespm-marketplace`, palette | The same, as a skill |

Every surface reads one view model, `litespm marketplace rows --json`, built from
your locally synced catalog; nothing is fetched from the website, and every
install goes through the same plan and approval as the CLI.
`litespm host remove <id>` removes the command together with the bridge. Which
surfaces have been run against a real install and which were written from vendor
documentation only is tracked in [AGENTS.md](AGENTS.md) §3. For a window outside
any agent, `litespm marketplace` opens the web marketplace.

## How it works

```text
  Claude Code · Codex · Cursor · OpenCode · Cline · Pi · ...
                       │  stdio (MCP)
                       ▼
               litespm bridge            stateless, holds no credentials
                       │  local IPC (same OS user only)
                       ▼
               litespm daemon  ──  SQLite · policy · secret vault
                       │
                       ▼
        verified catalog  →  plan → approve → backup → install
```

An install is five steps: **resolve** the listing and target agents, **plan** the
exact files and entries that will change (sealed with a hash), **approve** in the
terminal (an agent may prepare a plan, only a human approves it), **apply** with
backups first, then **record** it in a ledger so `list`, `restore` and
`install remove` act on exactly what was written.

The catalog keeps itself current. The first command that needs it downloads it
in the foreground with progress. After that, a run starts a background sync at
most every 6 hours and never waits for it. (Automatic sync and the on-disk index
ship in 0.6.1; on npm's current 0.6.0, run `litespm catalog sync` once first.)

Plugins install from the commit their publisher pinned. LiteSPM installs the
portable parts, the MCP servers and skills a plugin declares. A plugin that also
declares host-specific extras (commands, hooks, subagents, LSP servers) is
refused unless you pass `--allow-partial`.

## Commands

| Command | Purpose |
|---|---|
| `litespm` | Setup and management wizard |
| `litespm search <text>` | Search the local catalog |
| `litespm install <id>` | Install an MCP server, skill or plugin (`--agent <id>`, `--all-detected`, `--dry-run`) |
| `litespm install remove <installId>` | Remove one install |
| `litespm list` | Installed capabilities by agent and kind |
| `litespm skills add <source>` | Install skills from a repo, URL or folder |
| `litespm skills use <source>@<skill>` | Print a skill's prompt, install nothing |
| `litespm adopt <name> --host <id>` | Take ownership of a server already in a config |
| `litespm restore <installId>` | Put a config back to its previous bytes |
| `litespm copy --from A --to B` | Port one agent's setup to another |
| `litespm catalog sync` | Refresh the catalog on demand |
| `litespm host list \| detect \| setup \| remove` | Inspect and manage agent adapters |
| `litespm doctor` | Diagnose and repair the installation |
| `litespm uninstall` | Remove LiteSPM's bridge from every agent |
| `litespm self-update` | Install a newer signed release |
| `litespm help <command>` | Full reference for any command |

Exit codes: `0` success, `1` refused or failed, `2` usage error.

## Security and trust

- **Signed releases.** The npm installer and `self-update` verify each binary's
  Sigstore bundle against a signer identity pinned in code: this repository's
  release workflow on the tag being installed. Anything else is discarded.
- **Verified catalog.** `catalog sync` checks the pointer, manifest and every
  shard digest, and refuses rollbacks and equivocation.
- **Human approval.** Installs requested by an agent need a plan a person
  approved; approvals are single-use and bound to the plan's hash. This is
  consent, not a sandbox against a hostile process running as your own user.
- **Safe extraction.** Archives are bounded and confined: no traversal, links or
  devices.
- **No secret values on disk.** Environment needs are written as references in
  each agent's own syntax.
- **Local only.** No account, no telemetry. The only network traffic is fetching
  the published catalog and the artifacts you ask to install.

Report vulnerabilities as described in [SECURITY.md](SECURITY.md). Open findings
are tracked in [AUDIT.md](AUDIT.md).

## Configuration

Environment variables LiteSPM reads:

| Variable | Effect |
|---|---|
| `LITESPM_NO_AUTO_SYNC=1` | Turn off automatic catalog sync (also off when `CI` is set); `litespm catalog sync` still works |
| `LITESPM_NO_AUTO_UPDATE=1` | Turn off the automatic update check |
| `LITESPM_NO_DAEMON_AUTOSTART=1` | Do not start the daemon on demand from the bridge |
| `LITESPM_DATA_ROOT` / `LITESPM_CONFIG_ROOT` / `LITESPM_RUNTIME_ROOT` | Relocate the data, config and runtime directories |
| `LITESPM_REGISTRY_URL` | Catalog origin to sync from |
| `LITESPM_REQUIRE_CATALOG_SIGNATURE=1` | Refuse a catalog whose pointer is unsigned or whose signature cannot be checked |
| `LITESPM_NETWORK_TIMEOUT_SEC` | Network timeout for catalog requests |
| `LITESPM_LOG_LEVEL` | Daemon log level |
| `LITESPM_WEB_URL` | Web marketplace URL opened by `litespm marketplace` |
| `LITESPM_ALLOW_UNSIGNED_RELEASE=1` | Explicit opt-out: accept SHA-256 only for a release that publishes no signature bundle. A bundle that exists but fails is always fatal |
| `INSTALL_INTERNAL_SKILLS=1` | Allow skills marked `metadata.internal` |

The npm installer has its own variables (mirrors, local builds); see
[npm/README.md](npm/README.md).

## Build from source

Requires Go 1.26 (see [`go.mod`](go.mod)).

```bash
go build ./cmd/litespm              # the CLI
go test ./...                       # CLI, daemon, bridge, adapters
cd npm && npm ci && npm test        # installer and launcher
cd web && npm ci && npm run lint && npm run build   # website
```

## Project status

LiteSPM is under active development. [STATUS.md](STATUS.md) is the single source
of truth for what each subsystem does today, with evidence; [TODO.md](TODO.md)
lists known gaps. Two caveats worth knowing up front:

- The live catalog pointer is not yet Sigstore-signed. The catalog is still
  digest-verified and rollback-protected; the signature check exists and
  `LITESPM_REQUIRE_CATALOG_SIGNATURE=1` makes an unsigned pointer a hard refusal.
- Plugins install only their portable components (MCP servers and skills).

## Contributing

Issues and pull requests are welcome at
[github.com/sarv-projects/LiteSPM](https://github.com/sarv-projects/LiteSPM).
A new agent belongs in [`internal/host/targets_data.go`](internal/host/targets_data.go)
(MCP) or [`internal/skills/agents.go`](internal/skills/agents.go) (skills), and
its in-agent command in
[`internal/host/marketplace_command.go`](internal/host/marketplace_command.go).
The tests in `internal/host` and `test/` are the gate. To list a new capability,
use the [new-listing issue template](.github/ISSUE_TEMPLATE/new-listing.yml).

Architecture notes live in [ARCH/](ARCH/).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
