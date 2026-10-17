# LiteSPM

**The package manager for AI agents.**

LiteSPM connects once to the agents you already use — Claude Code, Codex, OpenCode, Cursor, Cline and 45 more — then installs MCP servers and agent skills into them from one catalog. It shows you the exact change before it touches a config file, backs that file up first, and can undo it.

Plugins are part of that catalog — you can search and inspect them — but installing one is not supported yet: there is no artifact source, so a plugin install fails closed rather than half-applying. The rest of the limits are under [What works today](#what-works-today--and-what-does-not).

```bash
npm install -g litespm
litespm
```

The wizard finds the agents on your machine, previews the change it is about to make, and waits for a yes. Nothing is sent anywhere: no account, no telemetry, no analytics, no cookies.

**[Browse the catalog](https://litespm.sarveshbh-2022.workers.dev/)** · **[STATUS.md](STATUS.md)** — what each subsystem actually does · **[Architecture](ARCH/)** · **[CHANGELOG](CHANGELOG.md)**

---

## Why this exists

Setting up an AI agent's capabilities is still manual, per agent, per machine. You paste JSON into `~/.claude.json`, TOML into `~/.codex/config.toml`, a different JSON again for Cline — and each format has its own idea of where a server goes and how it is spelled. Nothing tells you what you already have, nothing updates it, and nothing cleans up when you remove it.

LiteSPM connects once to each agent, then manages capabilities from a single local control plane. The catalog is a snapshot of named upstream sources; everything is resolved locally by the daemon.

| | |
|---|---|
| **69,376** capabilities | 48,418 MCP servers · 20,320 skills · 638 plugins |
| **50** compiled bridge adapters | **90** agent host names across the bridge and skill registries |
| **Release** | `rel-2026-10-15-01`, sequence 148 |
| **Licence** | open source · no account required |

Counts are from the release named above and are printed by `litespm catalog status`. They are a **snapshot**, not a live count, and listing an entry is not an endorsement of it.

## What it does

```bash
litespm                      # setup + management wizard, safe by default
litespm search github        # search the locally synced catalog
litespm install <id>         # plan → approve → write, with a backup
litespm list                 # what LiteSPM has installed, and where
litespm skills add <source>  # skills from a repo, git URL, directory or .zip
litespm doctor               # environment check: daemon, bridge, adapters, vault
```

- **Undo is built in.** Every write is previewed, backed up, and recorded in an install ledger. `litespm install remove` reconciles only what LiteSPM wrote and leaves your own edits alone.
- **Explainable.** Every claim traces to a named source. Each row says where its record came from — the publisher's own manifest, or a specific directory — and whether LiteSPM can install it or only found it.
- **Local.** Credentials never leave your machine and the hosted catalog never proxies tool calls. Release artifacts are signed with keyless cosign, and `self-update` verifies that signature before replacing the binary.

## What you can do with it

**Give one agent a new capability, without hand-editing its config.** Your Claude Code session needs a database tool. `litespm search postgres` finds candidates in the catalog; `litespm install <id>` prints the exact JSON it will add to `~/.claude.json`, asks for approval, saves a timestamped backup, then splices the entry in. Your comments, ordering and other servers are untouched. `litespm install remove <id>` — the id `litespm list` prints — takes it back out.

**Give the same skill to every agent you use.** `litespm skills add anthropics/skills --skill frontend-design --agent claude-code --agent codex --agent opencode` copies the skill into each agent's own skills directory and records every copy in a ledger. `litespm skills update` re-copies from the recorded source; `litespm skills remove` deletes only paths the ledger names.

**Try a skill without installing anything.** `litespm skills use anthropics/skills@frontend-design | claude` prints the skill's instructions to stdout so you can pipe them into any agent. It installs nothing and leaves nothing behind.

## A first walkthrough

```bash
npm install -g litespm       # the CLI: the npm package fetches and checksum-verifies the native binary
litespm                      # the wizard: pick an agent, preview the change, approve it
litespm catalog sync         # pull the catalog snapshot onto this machine
litespm search postgres      # search it locally
litespm install <id>         # plan → approve → backup → write
litespm list                 # what is installed, and where
litespm install remove <id>  # take one back out
```

A sync from an empty data root, on the published `litespm@0.4.1` (2026-10-17):

```console
$ litespm catalog sync
Synchronizing catalog from https://litespm.sarveshbh-2022.workers.dev...
✓ Catalog synchronization complete (Release rel-2026-10-15-01, 69376 capabilities indexed).
```

The wizard's *Update the capability catalog* menu runs this same sync; the setup flow itself makes no network request.

## What works today — and what does not

The honest state, as of 2026-10-17. [STATUS.md](STATUS.md) is the source of truth per subsystem; this table is its summary.

| | |
|---|---|
| ✅ **Installs** | Skills install as real files through the skills ledger. MCP servers are registered into each target agent's own config format. |
| ✅ **Removal** | Ledger-scoped, with pre-images kept so a removal can be reconciled rather than guessed. |
| ⛔ **Plugins cannot be installed** | There is no plugin artifact source, so a plugin install **fails closed** with `LPSM-ARTIFACT-UNAVAILABLE` rather than half-applying a bundle. Plugin rows are labelled not installable, everywhere they appear. |
| ⚠️ **61% of the catalog is discovery-only** | 42,573 of 69,376 rows are entries LiteSPM found and can describe, but has no install method for. They are marked as such. |
| ⚠️ **Not tested, and not claimed** | Provider autostart, npm package signatures, and any isolation beyond process supervision. "Official", "publisher manifest" and agent-compatibility badges mean *where the record came from* — never that LiteSPM has audited or tested the entry. |

## Supported agents

Six bespoke adapters handle the agents whose config formats need real care, each with its own documented path and merge rules:

| Agent | Config | Written by LiteSPM |
|---|---|---|
| **Claude Code** | `~/.claude.json` (+ `.mcp.json` for project scope) | `mcpServers` |
| **OpenAI Codex** | `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`) | `[mcp_servers.litespm]` |
| **Cline** | `~/.cline/data/settings/cline_mcp_settings.json` | `mcpServers` |
| **OpenCode** | `$OPENCODE_CONFIG_DIR/opencode.jsonc` else `~/.config/opencode/` | `mcp.servers` |
| **Pi Agent** | `~/.pi/agent/mcp.json` | `mcpServers` |
| **Grok Build** | `$GROK_HOME/config.toml` (default `~/.grok/config.toml`) | `[mcp_servers.litespm]` |

The full registry is **50 bridge targets** (those six plus 44 generic adapters) and **81 skill targets**. `litespm host list` prints what your build actually supports; `litespm host detect` says what is on this machine. Legacy paths that no current release of an agent reads are not probed — see [ARCH/16](ARCH/16-HOST-ADAPTERS.md).

## In your agent: `/marketplace`

Once configured, type `/marketplace` in your agent. Terminal hosts (`claude`, `codex`, `grok`, `opencode`) get 12 bridge tools over stdio MCP; hosts with rich panels get the capability browser. Searches, previews and installs resolve against the local daemon — the agent never talks to the network on LiteSPM's behalf.

## Documentation

| | |
|---|---|
| **[STATUS.md](STATUS.md)** | What each subsystem actually does — the source of truth, not the aspiration |
| **[ARCH/](ARCH/)** | Architecture decisions, numbered and referenced from the code |
| **[ARCH/39 — System Specification](ARCH/39-SYSTEM-SPECIFICATION.md)** | The internal specification: topology, storage, workflows, CLI surface, environment variables and release order — moved out of this README on 2026-10-17 |
| **[TODO.md](TODO.md)** | Open work, with acceptance evidence per row |
| **[CURRENT_RUN.md](CURRENT_RUN.md)** | Release procedure and current handoff state |
| **[AGENTS.md](AGENTS.md)** | Supported-agent integration guide |

## Contributing

Issues and pull requests are welcome. The repository's own invariants are enforced in CI — Go tests on Linux, macOS and Windows, `gofmt` and `go vet` against the pinned toolchain, a catalog-coherence gate, and a generated-data drift gate. Run `npm run lint` in `web/` before opening a PR that touches the site.

**Two rules that are not negotiable in review:** no user-facing text may claim a state the code does not have, and no generated field may point users at a third-party installer.

## License

See [LICENSE](LICENSE) and [NOTICE](NOTICE).
