# LiteSPM website FAQ and ranking methodology

This file is the curated, citable text behind the website's FAQ (home page) and its "How we rank and label" and "Troubleshooting & FAQ" documentation pages. It carries no live counts: ask the catalog or the Docs page for current numbers. Keep it in step with web/src/components/litespm/views/home.tsx (FAQ entries) and web/src/components/litespm/views/docs.tsx (Methodology, Troubleshooting).

## What is the difference between installable and discovery-only?

A listing is installable only when LiteSPM can build an install plan for it. A listing is discovery-only when the catalog has its metadata but no verified source or launch line LiteSPM can use. Discovery-only listings stay searchable so you can find the tool and open its source, but LiteSPM will not try to install them. The detail page links only to the source the catalog recorded; it does not guess a repository.

What makes a listing installable depends on its kind. A local MCP server needs a published command (command and args). A remote MCP server needs an endpoint URL (streamable HTTP or SSE). A skill needs a source to copy from, meaning a GitHub source whose SKILL.md the catalog build actually read. A plugin needs a pinned git commit to fetch. The "Installable only" switch, the hero count and the bundles all use this one rule.

Installable-versus-discovery-only is not the same as the installability level. The level (litespm_tested, runtime_verified, metadata_verified, discovery_only) records provenance, while "installable" is the yes/no answer to "can LiteSPM build an install plan for this listing".

## Why are some packages marked Installable while others are Discovery-Only?

LiteSPM works to a zero-guesswork safety standard. To automatically install an MCP server into an agent's configuration, LiteSPM requires a verified runtime contract: either an exact streamable remote URL (HTTP or SSE) or a confirmed local execution command (command plus args). When a community package only publishes a repository link or a README without structured launch parameters, LiteSPM refuses to guess the launcher (for example choosing between npx, python or uvx), because a wrong guess could break the agent. These tools remain in the catalog so you can discover them and read their source, but one-command installation is reserved for packages with verified launch details. The documentation does not say that discovery-only listings are "pending release" or "listed for comparison"; the reason is the absence of a verified source or launch line.

## What does Discovery only mean on a listing?

The catalog has the row's metadata but no verified source or launch line LiteSPM can use. For a server, that means no publishable remote endpoint and no publisher-declared package the installer can start. For a skill, it means no GitHub source whose SKILL.md the build actually read. The detail page links only to the source the catalog recorded and does not guess a repository.

## In what order are search results shown?

Search and "Top ranked" put installable listings first, then discovery-only listings, each group in score order. For a text search, text relevance comes first and the LiteSPM Score second. A discovery-only listing is never hidden by this ordering; it just comes after the listings LiteSPM can install. The "Installable only" switch removes discovery-only listings. Sorting by name, kind or publisher is left exactly as chosen.

## What is the LiteSPM Score?

The LiteSPM Score is an editorial reputation score from 0 to 100, computed from each row's own fields. It measures recognition and trustworthiness of the tool, not popularity. The components and their maximum points are:

- Editorial recognition, up to 35 points: the tool is a known flagship of the agent ecosystem (official MCP reference servers, top-vendor servers, Anthropic's official skills) earns 35; a notable second tier, or a re-publication of a flagship name by another publisher, earns 22; a first-party namespace such as @microsoft/... or io.github.supabase/... earns 12.
- Vendor authority, up to 18: a tier-1 ecosystem vendor publisher or namespace earns 14, a tier-2 recognised vendor 8, and a verified publisher adds 4, capped at 18.
- Proven installability, up to 15: litespm_tested 15, runtime_verified 12, metadata_verified 7, discovery_only 2.
- Record quality, up to 12: endpoint URL 3, tool schemas 3, README 2, executable command 2, version 2.
- Description substance, up to 5: 120 or more characters 5, 60 or more 4, 25 or more 2, 10 or more 1.
- GitHub stars, up to 15, on a log scale and only when a source publishes stars. In the current release no row carries a star count, so this component is zero rather than estimated.

The maximums add up to exactly 100. A junk penalty of 40 to 45 points applies to records that are parse artifacts rather than tools, such as names that start with a symbol, HTTP-header fragments, or a bare "@word". Ties are broken by name, with artifact names last.

## What are the installability levels?

Each listing carries one level, and it is provenance rather than a feature flag. litespm_tested ("LiteSPM tested") means covered by a LiteSPM acceptance record. runtime_verified ("Runtime verified") means the launch line was observed to start. metadata_verified ("Metadata verified") means an upstream manifest supplied the version and the launch or source data (command and args for a local server, an endpoint for a remote one) and nothing was run. discovery_only ("Discovery only") means searchable metadata with no proven artifact, and LiteSPM will not try to install it.

## What does Not inspected mean on a skill?

For a skill, the detail page shows whether it carries scripts, makes network calls or needs credentials. LiteSPM reads the catalog's declarative metadata, not the skill's files, so those fields say "Not inspected" unless the publisher declared otherwise. It is the absence of an audit, not a clean bill of health: review the source before you use a skill.

## Where does each catalog count come from?

Three different numbers describe the size of the catalog. Catalog rows are every row in the release file before any merging. Unique listings are the rows left after exact duplicates are removed; this is what the banner and home page call listings. Distinct tools are distinct names after lower-casing and dropping punctuation; search results show this one because it merges same-name listings.

## How are duplicates merged?

In two steps. First, exact duplicates are removed: rows with the same source identity (the same kind, repository, path, revision and name, or the same discovery key) count once. Second, search collapses same-name listings: one tool published by several publishers, or as both an MCP server and a skill, appears as one result, and every listing keeps its own page. The result that stays is the first in the current order, so an installable listing wins over a discovery-only one of the same name, and otherwise the higher score wins.

## Do I need to sync the catalog myself?

Not from release 0.6.1 on. The first run that needs the catalog downloads it in the foreground, and later runs start a background sync at most every 6 hours. Downloads are digest-verified, and search runs against a local SQLite full-text index built from that verified download. Set LITESPM_NO_AUTO_SYNC=1 (or run in CI) to turn automatic sync off; litespm catalog sync still works on demand. On the older npm 0.6.0 release there is no automatic sync, so run litespm catalog sync once before the first search.

## How does LiteSPM install capabilities into my AI agent?

LiteSPM writes surgical configuration changes directly into the agent's documented configuration file (for example ~/.claude.json for Claude Code or cline_mcp_settings.json for Cline). Before writing any file, LiteSPM previews the exact diff, backs up the existing file, and logs the change to an undo ledger. The install command is litespm install <id>, optionally with --agent <host-id> to name the target agent.

## Can LiteSPM break or overwrite my existing agent settings?

It is built not to. LiteSPM's JSONC and TOML parsers preserve existing entries, comments and structure, and it only adds the capability entry. Every write is previewed and backed up first, so if something goes wrong, litespm restore puts the file back to its exact previous bytes. When you remove a package, only the nodes LiteSPM created are removed; edits you made before or after install are kept.

## How do plugins with host-specific extras work?

Plugins can bundle portable components (universal MCP servers and agent skills) and host-specific extras (such as IDE commands, editor hooks or subagents). LiteSPM installs all portable servers and skills into any supported agent. A plugin whose manifest declares extras this build cannot install is refused with LPSM-INSTALL-PARTIAL unless you pass --allow-partial: litespm install <id> --allow-partial installs the portable components and skips the extras. The source must still be commit-pinned; the flag does not bypass pinning.

## Why do plugins require a version-pinned source?

For reproducible installs and byte-exact rollbacks, LiteSPM requires a plugin to pin a specific git commit. Floating branches such as main or latest can change at any time. If a plugin points at a floating ref or a local directory, LiteSPM refuses it and the publisher must publish an immutable tag or commit SHA. There is no CLI flag that bypasses this check.

## Which AI coding agents are supported?

LiteSPM supports a registry of agent hosts for local stdio MCP servers (including Cursor, Claude Code, Cline, OpenAI Codex, OpenCode, Grok Build, Gemini CLI and GitHub Copilot) and a larger set of targets for skills, covering terminal, IDE and desktop environments. Only some hosts document a native remote (URL) entry; the rest support local stdio only and refuse a remote install with LPSM-HOST-REMOTE-UNSUPPORTED. Run litespm host list for the exact host ids.

## What does it mean when entries show as drifted?

A drifted entry means the configuration file was modified outside LiteSPM after the install, such as by manual editing or another tool. litespm list --drifted shows exactly what changed. LiteSPM respects manual changes: when you later run litespm install remove, it only cleans up the lines it added and leaves your edits untouched.

## litespm install says unknown flag

The installed CLI is older than the flag being used; the repository can be ahead of npm. Run npm update -g litespm (or litespm self-update) to get the latest release. The site's command reference is checked against the version npm serves as latest, not against an unreleased build.

## Why does bare litespm say it needs an interactive terminal?

Running litespm with no arguments starts an interactive setup wizard, which needs a terminal that can ask which agent to configure. In a non-interactive shell, name the agent instead: litespm setup --agent <host-id> or litespm host setup <host-id>. litespm host list prints the host ids and litespm host detect shows which agents are present and whether the bridge is registered.

## Can I browse and install from inside my agent?

Yes, where the installed release includes it (the in-agent marketplace commands belong to release 0.6.1, which may be ahead of npm). litespm setup installs a marketplace command into supported agents. Some agents get an interactive popup that needs no model turn; others get a prompt command that has the agent's model drive LiteSPM's tools; some agents have no extension surface for either. See Docs, Agent compatibility.
