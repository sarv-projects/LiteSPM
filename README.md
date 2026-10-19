# LiteSPM

### Stop setting up the same tools for every coding agent.

**One catalog. Multiple agents. One place to manage capabilities.**

LiteSPM is a local-first package manager for MCP servers and agent skills. Discover capabilities across the ecosystem, install them into supported coding agents, preview configuration changes before applying them, and manage what you've installed without manually hunting through configuration files.

The web catalog helps you find capabilities. The local CLI handles installation and management. The LiteSPM bridge brings supported workflows into your agent.

[Explore the catalog](https://litespm.sarveshbh-2022.workers.dev/explore/) · [Get started](#get-started) · [Supported agents](#supported-agents) · [Implementation status](STATUS.md) · [npm package](https://www.npmjs.com/package/litespm)

```bash
npm install -g litespm
litespm
```

That is the interactive setup and management wizard. It detects the agents on your machine, shows the changes it plans to make, and asks before writing them.

## Why LiteSPM?

AI coding agents have different configuration formats, installation conventions, and skill directories. Adding the same capability to several agents can mean repeating the same work and manually tracking which files you changed.

LiteSPM gives you a common workflow for discovering and managing supported capabilities across those agents.

- **Discover once.** Search a shared catalog of MCP servers, agent skills, and plugin listings.
- **Install across agents.** Configure supported MCP servers and install the same skill into multiple agent environments.
- **Review before writing.** Inspect proposed changes and approve them before LiteSPM modifies your configuration.
- **Manage what you installed.** See LiteSPM-managed entries, update or remove supported installations, and preserve unrelated configuration.
- **Use capabilities from your agent.** On supported hosts, access LiteSPM through its local MCP bridge.

LiteSPM is local-first: there is no LiteSPM account to create and no telemetry. Network access is used when you explicitly request catalog synchronization or operations that fetch external sources.

## How it works

LiteSPM has three connected surfaces.

| Surface | What it does |
|---|---|
| **Web catalog** | Browse, search, compare, and inspect capabilities. |
| **Local CLI and wizard** | Detect agent integrations, install skills, configure MCP servers, and manage installations on your machine. |
| **In-agent bridge** | Expose supported discovery and installation workflows to connected agents through MCP. |

The website is a discovery interface, not a remote installer. Capability installation and host configuration happen locally through LiteSPM.

## Get started

### 1. Install LiteSPM

Install the published npm package:

```bash
npm install -g litespm
```

### 2. Open the setup wizard

```bash
litespm
```

The wizard detects supported agent environments and guides you through configuring a connection. Before writing a configuration change, it shows the proposed changes and asks for approval.

For a non-interactive setup targeting a specific host:

```bash
litespm host detect
litespm host list
litespm setup --agent claude-code
```

The last command targets Claude Code. Replace `claude-code` with the desired supported host ID.

### 3. Find a capability

Synchronize the catalog, then search your local copy:

```bash
litespm catalog sync
litespm search postgres
litespm skills find frontend-design
```

### 4. Install and manage

For an installable catalog entry:

```bash
litespm install <id>
litespm list
litespm install remove <id>
```

The installation workflow previews the proposed change and requests authorization before applying it. LiteSPM backs up affected configuration and records its managed installation.

**Important:** A catalog listing is not automatically installable. LiteSPM distinguishes discovery-only entries from entries with supported installation information.

### 5. Check the catalog you are shipping

If you publish a catalog of your own, `litespm audit` checks it for content that must not ship — a discovery-only row carrying a launch line, a plugin with no fetchable source, a credential in a public URL — and writes SARIF 2.1.0 for the CI consumer:

```bash
litespm audit --ci --sarif > audit.sarif
```

## Install one skill into multiple agents

Agent skills are reusable instructions and workflows that can be installed into the skill directories recognized by supported agents.

For example, install the `frontend-design` skill from Anthropic's skills repository into Claude Code, Codex, and OpenCode:

```bash
litespm skills add anthropics/skills \
  --skill frontend-design \
  --agent claude-code \
  --agent codex \
  --agent opencode
```

Useful skill-management commands:

```bash
litespm skills find design
litespm skills list
litespm skills update
litespm skills remove
```

The selected agents may use different destination directories. LiteSPM resolves those destinations using its agent registry rather than requiring you to copy files manually.

You can also print a skill's instructions without installing it:

```bash
litespm skills use anthropics/skills@frontend-design | claude
```

This outputs the skill instructions to standard output and pipes them into the Claude CLI. It does not install the skill.

See the [supported-agent registry](AGENTS.md) for details.

## MCP servers without the configuration-file hunt

MCP servers expose tools and resources that agents can use to interact with external systems.

LiteSPM provides a common workflow for finding installable MCP entries and registering supported servers in the target agent's expected configuration format.

```bash
litespm catalog sync
litespm search postgres
litespm install <id>
litespm list
```

Where supported, LiteSPM preserves existing configuration instead of replacing the entire file. Its host adapters account for differences in configuration formats and locations.

Not every catalog entry has sufficient installation information. Unsupported or discovery-only entries are not treated as successful installations.

## Plugins

A plugin is a bundle its publisher ships as a source tree, and a plugin listing can be installed when that source is fetchable and pinned.

LiteSPM fetches the pinned commit, reads the plugin's own manifest, and registers the MCP servers the manifest declares in each target host — through the same plan, approval, backup and ledger as any other install. A plugin that publishes only a local directory, or a source that is not pinned to a commit, is refused with the reason rather than half-installed.

Of the 638 plugin listings in the current release, **390 publish a pinned source tree** and install; the other **248** are refused with the reason they cannot be fetched.

## Access LiteSPM from inside your agent

LiteSPM can also expose capability-management tools to supported agents through a local MCP bridge.

After configuring the bridge, use the host's supported marketplace entry point. Where the integration supports it, you can invoke `/marketplace` to discover capabilities from inside the agent.

The bridge exposes supported workflows for searching the catalog, inspecting capabilities, preparing installations, requesting installation, viewing managed entries, and accessing skill instructions.

The exact experience depends on the host. Not all bridge operations or rich interface features are implemented on every integration. See [STATUS.md](STATUS.md) for the current implementation boundaries.

## Supported agents

LiteSPM maintains separate registries for MCP bridge targets and agent-skill destinations. These represent different kinds of integration and should not be interpreted as identical feature support.

### Tailored MCP adapters

The six tailored adapters cover:

- Claude Code
- OpenAI Codex
- OpenCode
- Cline
- Pi Agent
- Grok Build

Additional hosts are represented by generic adapters where compatible.

The MCP bridge registry contains **50 host targets**: six tailored adapters and 44 generic adapters. The skills registry contains **81 agent targets**.

These totals describe registered targets, not a guarantee that every capability works with every host. Configuration scope, skill support, and available in-agent interactions differ between agents.

Inspect the current registry:

```bash
litespm host list
litespm host detect
```

For the full integration details, see [AGENTS.md](AGENTS.md) and the [host adapter specification](ARCH/16-HOST-ADAPTERS.md). To compare agent capabilities, visit the [comparison page](https://litespm.sarveshbh-2022.workers.dev/compare/).

## One catalog, with honest boundaries

The catalog covers three categories:

| Category | Current scope |
|---|---|
| **MCP servers** | Discover entries and install supported servers through compatible host adapters. |
| **Agent skills** | Discover, install, update, and remove supported skills. |
| **Plugins** | Install the listings whose publisher ships a pinned source; the rest are refused with a reason. |

The catalog release dated 17 October 2026 contains **69,376 listings**:

- 48,418 MCP server listings
- 20,320 agent skill listings
- 638 plugin listings

These are catalog totals, not installable-package totals. At that snapshot, **26,555 listings were installable** (25,401 remote MCP servers, 764 skills and 390 plugins), **42,573 were discovery-only**, and 248 plugins were refused for a source LiteSPM cannot fetch.

Catalog contents and totals change over time. Run `litespm catalog status` to inspect the locally installed snapshot.

LiteSPM also does not claim that listing a capability, identifying its publisher, or linking to its source constitutes an independent security audit. Compatibility, installability, and security verification are separate questions.

## Designed for controlled, reversible changes

Agent configuration files often contain settings unrelated to LiteSPM. A package manager should not overwrite those settings just to add one capability.

LiteSPM's installation workflow is designed around explicit changes:

1. **Plan:** resolve the requested capability and target.
2. **Preview:** show the proposed configuration or file changes.
3. **Approve:** ask for the necessary authorization.
4. **Back up and apply:** preserve affected configuration and apply the planned change.
5. **Track:** record LiteSPM-managed installations so they can be listed and removed later.

LiteSPM aims to preserve unrelated configuration and limit removal to content it manages. Existing external configuration is not automatically adopted into LiteSPM's management, and not every operation supports every capability type.

For implementation details and tested boundaries, see [STATUS.md](STATUS.md).

## Troubleshooting

Start with:

```bash
litespm doctor
litespm host detect
litespm catalog status
```

- **A capability appears but cannot be installed:** check whether it is discovery-only or has a supported installation method.
- **An agent is not detected:** inspect the host registry and the configuration paths documented for that agent.
- **The local catalog is outdated:** run `litespm catalog sync` to request an updated snapshot.
- **An operation fails:** review the error message and diagnostic output before retrying.

See [STATUS.md](STATUS.md) for known gaps and evidence, and [TODO.md](TODO.md) for outstanding work.

## Documentation

| Document | Purpose |
|---|---|
| [STATUS.md](STATUS.md) | Implementation state, test evidence, and known gaps |
| [ARCH/](ARCH/) | System design and architecture specifications |
| [ARCH/00-INDEX.md](ARCH/00-INDEX.md) | Architecture document index |
| [ARCH/39-SYSTEM-SPECIFICATION.md](ARCH/39-SYSTEM-SPECIFICATION.md) | Full system specification |
| [AGENTS.md](AGENTS.md) | Supported-agent registry and integration guidance |
| [TODO.md](TODO.md) | Outstanding work |
| [CHANGELOG.md](CHANGELOG.md) | Changes and release history |
| [SECURITY.md](SECURITY.md) | Security policy |
| [TEST.md](TEST.md) | Testing documentation |

## Contributing

Contributions are welcome. Before changing host integrations or making capability claims, read [STATUS.md](STATUS.md) and [AGENTS.md](AGENTS.md).

For website changes, run the checks documented in the repository, including:

```bash
cd web
npm run lint
npx playwright test
```

The `npm run lint` command is the website's documented lint gate. Two more
checks answer questions the browser suite cannot:

```bash
npm run check:sort-order   # the catalog's order did not change
npm run audit:a11y         # axe over the built site (needs the export served)
```

`audit:a11y` needs a server for the export — `node tests/serve.mjs` in another
shell — and exits non-zero on any violation.

## License

LiteSPM is licensed under the Apache-2.0 license. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
