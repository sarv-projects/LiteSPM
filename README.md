<div align="center">

# LiteSPM

**The package manager for AI coding agents.**

Find MCP servers, skills and plugins once. Install them into every agent you use.
Undo any of it with one command.

[![npm](https://img.shields.io/npm/v/litespm.svg?color=10b981)](https://www.npmjs.com/package/litespm)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![agents](https://img.shields.io/badge/agents-52-8b5cf6.svg)](#supported-agents)
[![catalog](https://img.shields.io/badge/catalog-69k%2B%20listings-0ea5e9.svg)](https://lite-spm-nine.vercel.app/marketplace)

[Marketplace](https://lite-spm-nine.vercel.app/marketplace) ·
[Documentation](https://lite-spm-nine.vercel.app/docs) ·
[Status](STATUS.md) ·
[Security](SECURITY.md) ·
[Changelog](CHANGELOG.md)

</div>

---

## Install

```bash
npm install -g litespm
litespm
```

Requires Node.js 22.22.2 or later. The npm package downloads the native binary
for your platform (Windows, macOS and Linux; x64 and arm64) and verifies its
Sigstore signature against this repository's release workflow before anything
runs. An unverifiable download is discarded, never installed.

Running `litespm` opens the setup wizard. It detects the agents on your
machine, shows the exact change it will make to each configuration file, saves
a backup, and writes only after you confirm.

## What it does

| | |
|---|---|
| **One catalog** | 69,000+ MCP servers, agent skills and plugins from the official MCP Registry, publisher repositories and community directories, each labelled with its publisher, source and whether LiteSPM can install it. |
| **Every agent** | One command installs into Claude Code, Codex, Cursor, OpenCode, Cline, Gemini CLI, GitHub Copilot, VS Code, Zed, Pi and 42 more, in each agent's own configuration format. |
| **A marketplace inside your agent** | `litespm setup` adds a `/litespm-marketplace` command to the agents that support one: an interactive popup in Pi, OpenCode, Claude Code and Copilot CLI, or a guided command elsewhere. |
| **Preview, backup, undo** | Every write is planned and shown first. The previous file is backed up byte for byte. `litespm install remove` takes out only what LiteSPM wrote and keeps your own edits. |
| **Local and private** | No account, no telemetry, no proxy. Credentials stay in your environment or the OS keychain; LiteSPM writes references, never secret values. |

## Quick start

```bash
litespm search postgres           # first run downloads the catalog (about 100 MB, once)
litespm install <id>              # plan, preview, confirm, install
litespm list                      # what is installed, per agent
litespm install remove <installId>
```

The catalog keeps itself current: at most every six hours a `litespm` run starts
a background `catalog sync` and never waits for it (`LITESPM_NO_AUTO_SYNC=1`
turns that off; `litespm catalog sync` still syncs on demand). Searches read a
local SQLite full-text index built from the verified download, so they take
milliseconds and a few tens of MB rather than loading the whole catalog.

Install into specific agents with `--agent <id>` (repeatable), or into every
detected agent with `--all-detected`. `--dry-run` prints the plan and stops.

## The marketplace inside your agent

After `litespm setup --agent <id>` (or the wizard), type the command in your
agent:

| Agent | Command | Experience |
|---|---|---|
| Pi | `/marketplace` | Popup with tabs (All, MCP servers, Skills, Plugins, Installed), search, details, Enter to add or remove |
| OpenCode 2.x | `/litespm-marketplace` | OpenCode's own search dialog, grouped results, install and remove |
| Claude Code 2.1.287+ | `/litespm-marketplace` | A pane with tabs, a search field, details and Install / Remove / Refresh buttons |
| GitHub Copilot CLI | `/litespm-marketplace` | Select lists and confirmations (start Copilot with `--experimental`) |
| Amp | Command palette: *LiteSPM: Marketplace* | Select lists and confirmations |
| Gemini CLI, Qwen Code, Kiro, Cursor, Augment, Roo, Factory Droid, Kilo, Cline | `/litespm-marketplace` | A command that has the agent drive LiteSPM's tools for you |
| Grok Build, Codex, Crush | `/litespm-marketplace`, `$litespm-marketplace`, palette | The same, as a user-invocable skill |

Every surface reads one view model, `litespm marketplace rows --json`, built
from your locally synced catalog, so nothing is fetched from the website and
every install goes through the same plan, approval and ledger as the CLI.
`litespm host remove <id>` removes the command together with the bridge.

Which of these have been exercised against a live install, and which were
built from the vendor's documentation only, is tracked in
[STATUS.md](STATUS.md) and in `internal/host/marketplace_command.go`.

## How an install works

1. **Resolve.** The listing, its version, and the agents it targets.
2. **Plan.** The exact files and entries that will change, sealed with a hash.
3. **Approve.** You confirm in the terminal. An agent can prepare a plan through
   LiteSPM's MCP tools, but only a human can approve it.
4. **Apply.** One transaction: backups first, then the writes, then the record.
5. **Record.** The ledger knows what LiteSPM wrote, so `list`, `restore` and
   `install remove` act on exactly that and nothing else.

Plugins install from the commit their publisher pinned. LiteSPM installs the
MCP servers and skills a plugin declares; host-specific extras (commands,
hooks, subagents) are reported and skipped, and only with your acknowledgement.

## Supported agents

**52 agents** take MCP servers and **81 targets** take skills. 47 agents can
also receive remote (URL) MCP servers. The other five (Claude Desktop,
CodeStudio, iFlow CLI, Mux, Zcode) do not document a remote entry, so LiteSPM
refuses remote entries for them instead of writing something the agent would
ignore.

```bash
litespm host list     # every supported agent and the file it uses
litespm host detect   # which are on this machine
```

Six adapters (Claude Code, Codex, OpenCode, Cline, Pi, Grok Build) are
hand-written. The rest come from one registry built from each vendor's
documented configuration format, so adding an agent is a data entry with the
same planning, backup and removal guarantees.

## Commands

| Command | Purpose |
|---|---|
| `litespm` | Setup and management wizard |
| `litespm search <text>` | Search the local catalog |
| `litespm install <id>` | Install an MCP server, skill or plugin |
| `litespm install remove <installId>` | Remove one install |
| `litespm list` | Installed capabilities by agent and kind |
| `litespm marketplace` | Open the web marketplace; `marketplace rows` prints the in-agent view model |
| `litespm skills add <source>` | Install skills from a repository, URL or folder |
| `litespm skills use <source>@<skill>` | Print a skill's prompt without installing |
| `litespm adopt <name> --host <id>` | Take ownership of a server already in a config |
| `litespm restore <id>` | Put a config back to its previous bytes |
| `litespm copy --from A --to B` | Port one agent's setup to another |
| `litespm doctor` | Diagnose and repair the installation |
| `litespm uninstall` | Remove LiteSPM's bridge from every agent |
| `litespm self-update` | Install a newer signed release |
| `litespm help <command>` | Full reference for any command |

Exit codes: `0` success, `1` refused or failed, `2` usage error.

## Security

- **Signed releases.** The npm installer and `self-update` verify each binary's
  Sigstore bundle against a signer identity pinned in code.
- **Verified catalog.** `catalog sync` checks the pointer, manifest and every
  shard digest, and refuses rollbacks and equivocation.
- **Safe extraction.** Archives are bounded and confined: no traversal, links
  or devices.
- **Human approval.** Installs requested by an agent need a plan approved by a
  person; approvals are single-use and bound to the plan's hash.
- **No secret values on disk.** Environment needs are written as references in
  each agent's own syntax.

Open issues and their status are tracked in [AUDIT.md](AUDIT.md). Report
vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Documentation

| | |
|---|---|
| [STATUS.md](STATUS.md) | What each subsystem does today, with evidence |
| [AGENTS.md](AGENTS.md) | Per-agent configuration paths and integration details |
| [ARCH/](ARCH/) | Architecture and design specifications |
| [AUDIT.md](AUDIT.md) · [docs/audit/](docs/audit/) | Security and product audit findings |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [TODO.md](TODO.md) | Known gaps |

## Development

```bash
go build ./... && go test ./...                 # CLI, daemon, bridge, adapters
cd npm && npm ci && npm test                    # installer and wrapper
cd web && npm ci && npm run lint && npm run build   # website
```

A new agent belongs in `internal/host/targets_data.go` (MCP) or
`internal/skills/agents.go` (skills), and an in-agent marketplace command in
`internal/host/marketplace_command.go`. The tests in `internal/host` and
`test/` are the gate.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
