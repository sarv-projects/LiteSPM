# LiteSPM

### Stop setting up the same tools for every coding agent.

LiteSPM is a local package manager for MCP servers and agent skills. Search a catalog, install
supported capabilities into Claude Code, Codex, OpenCode, Cursor, Cline and more, and remove them
again without digging through each agent's configuration files. LiteSPM shows you what will change
before it writes anything.

**[Explore the catalog](https://litespm.sarveshbh-2022.workers.dev/explore/)** ·
**[Get started](#get-started)** ·
**[Supported agents](#supported-agents)** ·
**[What works today](#what-works-today)** ·
**[npm](https://www.npmjs.com/package/litespm)**

```bash
npm install -g litespm
litespm
```

That's the interactive setup and management wizard. It detects agents on your machine, shows the
changes it plans to make, and asks before writing them.

> **A terminal recording belongs here** — detect agents → find an MCP server → preview the config
> diff → approve → verify in the agent. It does not exist yet; this line is a reminder, not a
> promise.

## One skill, three agents

```bash
litespm skills add anthropics/skills \
  --skill frontend-design \
  --agent claude-code --agent codex --agent opencode
```

LiteSPM copies the skill to each agent's own skills directory. It records those copies so you can
[update or remove them later](#what-you-get).

## MCP servers without the config-file hunt

Need a database tool in your coding agent? Find an installable MCP server, choose a target agent,
and review the proposed config change before it's applied.

```bash
litespm catalog sync       # download a catalog snapshot for local search
litespm search postgres    # find matching entries
litespm install <id>       # preview → approve → back up → install
litespm list               # see what LiteSPM installed
litespm install remove <id>
```

Different agents expect different configuration files and formats. LiteSPM handles those
differences for [supported hosts](#supported-agents), preserving unrelated settings instead of
rewriting the whole file.

Not every catalog entry has an install method. Installable and discovery-only entries are
identified separately — see [what works today](#what-works-today).

## What you get

| | |
|---|---|
| **One catalog** | Search MCP servers and agent skills. The [website](https://litespm.sarveshbh-2022.workers.dev/) is for browsing; installs happen on your machine through the CLI. |
| **Multi-agent skill installs** | Put the same skill into selected agents, with update and removal commands. |
| **Agent-aware MCP setup** | Write supported MCP configurations in each host's expected format. |
| **Preview before changing files** | Review the proposed change; LiteSPM backs up affected configs and tracks its own writes. |
| **A record of what's installed** | List and remove LiteSPM-managed entries without guessing which files to edit. |
| **Inside your agent** | On supported hosts, use `/marketplace` to browse and request capabilities through LiteSPM's local bridge. |
| **Local-first** | No LiteSPM account and no telemetry. Setup runs locally; `catalog sync` and installs that fetch external sources use the network when you ask them to. |

## Get started

Install the CLI:

```bash
npm install -g litespm
```

Then open the wizard:

```bash
litespm
```

Or go straight to a task:

```bash
litespm host detect        # which supported agents are here?
litespm catalog sync       # fetch the catalog
litespm search github      # search the local copy
litespm skills find react  # find skills
litespm doctor             # check your local setup
```

Want to use a skill without installing it? Print its instructions and pipe them to an agent:

```bash
litespm skills use anthropics/skills@frontend-design | claude
```

## Supported agents

LiteSPM has **50 MCP bridge targets** — six tailored adapters and 44 generic adapters — and a
skills registry of **81 agent targets**. These describe different kinds of integration; they do
not mean every capability works on every agent.

The tailored MCP adapters cover **Claude Code, Codex, OpenCode, Cline, Pi Agent and Grok Build**.
Other hosts use the documented generic adapters where compatible.

```bash
litespm host list      # supported host targets
litespm host detect    # agents detected on this machine
```

See [the host adapter specification](ARCH/16-HOST-ADAPTERS.md) and
[current implementation status](STATUS.md) for the exact support boundaries. To compare hosts side
by side — config file, project scope, skills support — see
[/compare](https://litespm.sarveshbh-2022.workers.dev/compare/).

## What works today

LiteSPM is an active project, and the distinction between *found* and *installable* matters.

- **Working** — installing and managing agent skills; configuring supported MCP servers;
  previewing and backing up changes; recording installed entries; local catalog search; the
  interactive wizard.
- **Discovery only** — many catalog listings can be searched and inspected but do not carry enough
  verified information to install.
- **Plugins** — you can browse plugin listings, but plugin installation is not available yet.
  LiteSPM refuses those installs rather than claiming success.
- **Not a security certification** — being listed, or carrying a publisher or source label, does
  not mean a capability has been independently audited or tested.

The catalog release current at the time of writing — `rel-2026-10-17-01` — contains **69,376
listings**: 48,418 MCP servers, 20,320 skills and 638 plugins. Of those, **42,573 are
discovery-only**. Run `litespm catalog status` for the snapshot installed locally.

See [STATUS.md](STATUS.md) for what is implemented, tested and shipped — including known gaps — and
[TODO.md](TODO.md) for what is still open.

## Documentation

- [STATUS.md](STATUS.md) — what works, what doesn't, and the evidence
- [ARCH/](ARCH/) — design and system specifications ([index](ARCH/00-INDEX.md), [full system
  specification](ARCH/39-SYSTEM-SPECIFICATION.md))
- [CHANGELOG.md](CHANGELOG.md) — releases and changes
- [TODO.md](TODO.md) — known work remaining
- [SECURITY.md](SECURITY.md) — security policy
- [AGENTS.md](AGENTS.md) — the supported-agent registry and integration guide
- [CONTRIBUTING](#contributing) — conventions below

## Contributing

Issues and pull requests are welcome. Please check [STATUS.md](STATUS.md) and
[AGENTS.md](AGENTS.md) before making capability claims or changing host integrations — a claim the
code cannot back is the one defect this project treats as non-negotiable.

For website changes, run `npm run lint` in `web/` (the real gate — there is no ESLint config), plus
`npx playwright test` for the browser suite.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
