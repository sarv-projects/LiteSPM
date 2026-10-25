# LiteSPM

**The package manager for AI agents.**

[![npm](https://img.shields.io/npm/v/litespm.svg?color=10b981)](https://www.npmjs.com/package/litespm)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Find MCP servers, skills and plugins once, and install them into every coding
agent you use. LiteSPM writes each agent's own config, backs it up first, and
keeps a ledger of what it changed so you can take it back out.

**Browse the catalog:** **[litespm.sarveshbh-2022.workers.dev](https://litespm.sarveshbh-2022.workers.dev/)**
— search all 69,376 listings by kind, category, publisher, runtime or host,
and copy the install command for anything you pick.

```bash
npm install -g litespm   # Node 22.22.2+ (the wrapper downloads the signed binary for your platform)
litespm
```

That opens the setup wizard. It finds the agents on your machine, shows the
exact file it will touch, and asks before writing. You can skip agent
connection and open the manager directly. From the menu, you can search
LiteSPM's catalog or hand a GitHub repository, Git URL, skill URL, or local
folder to the interactive skills installer. The installer discovers skills,
lets you choose skills and agent targets, previews destinations, and asks
before it writes.

## Quick start

```bash
litespm catalog sync        # download the catalog
litespm search postgres     # find something
litespm install <id>        # install it
litespm list                # see what is installed
```

## Why LiteSPM

- **One install, every agent.** Add a server or a skill once and point it at
  Claude Code, Codex, Cursor, OpenCode, Cline and the rest — no hand-editing
  five different config formats.
- **Nothing is written without a preview.** You see the change first, and the
  file is backed up before it is touched.
- **Undo is a command.** `restore` puts a config back to its exact previous
  bytes; `install remove` takes out only what LiteSPM wrote.
- **Your machine, your keys.** No account, no telemetry, no proxy. Credentials
  stay in the environment or the OS vault.
- **A real catalog.** 69,376 listings, each with its publisher, source and
  installability stated up front.

## Works with your agent

LiteSPM supports **50 agent hosts** for MCP servers and **81** targets for
skills. The MCP set includes Claude Code, OpenAI Codex, OpenCode, Cline, Pi
Agent, Grok Build, Cursor, Zed, Gemini CLI, GitHub Copilot and AiderDesk; the
skills set is that group plus the agents that take skills only — Windsurf and
Warp among them.

**46 of the 50** hosts can also receive a remote (URL) MCP entry, because that
is the number whose vendor documentation publishes the exact entry object the
host expects. The other four — CodeStudio, iFlow CLI, Mux and Zcode — are
refused with a clear error rather than written in a shape the host would
silently ignore.

Each host has its own adapter: **six** — Claude Code, Codex, OpenCode, Cline,
Pi Agent and Grok Build — are hand-written and know their config layout in
detail (JSONC merging, TOML round-tripping, per-platform path discovery), and
the other **forty-four** come from one data-driven registry generated from each
agent's documented configuration format. A new host is therefore a registry
entry rather than a new code path, and it gets the same plan, backup and
ledger as the six.

```bash
litespm host list      # every supported host and the file it writes
litespm host detect    # which of them are on this machine
litespm setup          # connect one
```

The same command targets any of them: `--agent <host-id>`.

## What you can install

| Kind | What it is | In the current catalog |
|---|---|---|
| **MCP servers** | A service your agent calls tools on | 48,418 listings |
| **Agent skills** | A `SKILL.md` folder of instructions | 20,320 listings |
| **Plugins** | A publisher's bundle of skills and servers | 638 listings |

26,554 listings install with one command: 25,400 remote MCP servers, 764
skills and 390 plugins. The rest are discovery-only, and `litespm search` marks
which is which before you run anything.

A plugin installs from the pinned commit its publisher ships. LiteSPM fetches
that commit, verifies it, and installs the skills and MCP servers the plugin's
own manifest declares. A plugin with no fetchable pinned source is refused with
the reason instead of being half-installed.

## How an install works

1. **Plan.** Resolve the listing, the version and the target hosts.
2. **Preview.** Show the exact file and directory changes.
3. **Approve.** A human says yes. From an agent, a single-use token from
   `litespm approve`.
4. **Back up and apply.** One transaction, with the previous file preserved.
5. **Record.** The ledger keeps what was written, so `list`, `restore` and
   `install remove` know exactly what they own.

Existing entries are left alone. Removal strips only the nodes LiteSPM wrote
and keeps anything you edited.

## Common commands

| Command | What it does |
|---|---|
| `litespm` | Setup and management wizard |
| `litespm search <text>` | Search the local catalog |
| `litespm install <id>` | Install a server, skill or plugin |
| `litespm install remove <id>` | Remove one install |
| `litespm list` | What is installed, by agent and kind |
| `litespm skills add <source>` | Install skills from a repo, URL or folder |
| `litespm skills use <src>@<skill>` | Print a skill's prompt, install nothing |
| `litespm restore <id>` | Roll a config back to its previous bytes |
| `litespm copy --from A --to B` | Port one agent's setup to another |
| `litespm doctor` | Check the install and repair it |
| `litespm host list` | Every supported agent and its config file |
| `litespm help` | The full command reference |

## Inside your agent

With a host configured, `/marketplace` in your agent reaches the same catalog
and the same install path through the LiteSPM bridge. An agent can search,
prepare a plan, and ask you to approve it; it cannot approve for you.

```bash
litespm bridge stdio --host codex
```

## Troubleshooting

```bash
litespm doctor        # the usual first stop
litespm list --drifted  # entries changed since install
litespm catalog sync  # refresh a stale catalog
```

## Documentation

| Document | What is in it |
|---|---|
| [STATUS.md](STATUS.md) | What each subsystem does today, with evidence |
| [AGENTS.md](AGENTS.md) | Supported agents, config paths, integration guide |
| [ARCH/](ARCH/) | Architecture and design specifications |
| [SECURITY.md](SECURITY.md) | Security policy and threat model |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [TODO.md](TODO.md) | Known gaps and planned work |

The full catalog is browsable at
[litespm.sarveshbh-2022.workers.dev](https://litespm.sarveshbh-2022.workers.dev/).

## Development

```bash
go build ./... && go test ./...
cd web && npm ci && npm run build && npx playwright test
```

Host integrations must match the adapter they claim to support: the tests in
`internal/host` and `test/` are the gate, and a new host belongs in
`internal/host/targets_data.go` or `internal/skills/agents.go` rather than in a
new code path.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
