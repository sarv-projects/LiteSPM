# LiteSPM website — content, positioning and IA audit

> **Copied here verbatim from the audit that ran on 2026-10-22** (the original
> work was written outside the repository). Every claim in it was measured
> against the site as it was built on 2026-10-22, or fetched from the
> competitor's own page that day; the screenshots it cites are in [`shots/`](shots/).
> Items this session fixed are listed in [`HANDOVER.md`](HANDOVER.md) §2 — read the
> findings as a mixture of *fixed* and *open*, and check `TODO.md` **LPSM-J016…J020**
> for what is still open.


**Auditor:** content/positioning subagent (read-only)
**Date:** 2026-10-22
**Repo:** `/home/sarvesh/business_Dev/liteSPM` (no file modified)
**Site source:** `web/app/**`, `web/components/**`, `web/lib/**`
**Live site:** `https://litespm.sarveshbh-2022.workers.dev` (fetched with `curl`, raw HTML, no JS)
**Facts of record:** `STATUS.md`, `AGENTS.md`
**Competitor fetches:** 2026-10-22, via `curl` (raw HTML) and exa `web_fetch_exa` where Cloudflare blocked curl

**Method note.** Every number below was recomputed from `web/data/catalog.json` and `web/data/release.json`
rather than read off the page, and every competitor quote is copied from a page fetched today.
Where a page was unreachable, it is named and excluded rather than described from memory.

---

## 0. Executive summary

The site is honest to a fault and that is its real problem: it is the most truthful directory in the
category and it says so on page four of every entry, while the two things a first-time visitor needs —
*what do I do next* and *will this work in my agent* — are one click away or not stated at all.

**Three P0s, in order:**

1. **The install command the site prints does not work with the published CLI.** `npx --yes litespm@latest`
   resolves to `litespm@0.4.1` (published 2026-10-15). The site appends `--agent <id>` and
   `--all-detected` to that command, and 0.4.1 rejects both as unknown flags. It also cannot install a
   plugin at all. Reproduced in a clean sandbox — see §4.1.
2. **"update" is promised for all three kinds on every page; only skills have an update path.** The
   CLI's own help says so: *"Does not update installed packages or skills; that is `litespm skills update`."*
3. **The product is positioned four different ways in one page's metadata** — title, meta description,
   OG description, Twitter description and OG image alt — and the OG alt (`"the lightweight skill &
   package manager for AI agents"`) contradicts the title (`"The package manager for AI agents"`).

Everything else is P1/P2 and is fixable in copy.

---

## 1. Copy inventory (verbatim)

### 1.1 Home page

**Hero** — `web/components/home/LandingHero.tsx`

| Element | Line | Copy |
|---|---|---|
| Eyebrow | `:97` | `The package manager for AI agents` |
| H1 | `:107-109` | `Give your AI agents new capabilities.` |
| Subhead | `:111-114` | `Discover and install MCP servers, skills and plugins across the agents you use. LiteSPM handles compatibility, setup, updates and removal from one place.` |
| CTA 1 | `:117-120` | `Explore capabilities` → `/explore/` |
| CTA 2 | `:121-123` | `Get LiteSPM` → `/get-started/` |
| Search placeholder | `:127-150` | `Search the capability catalog by name, summary, publisher, category, runtime, transport or tool name` + chips `Use GitHub / Work with PDFs / Design UI / Browse the web / Connect a database` |
| "Works with" row | `:156-171` | `Works with` → 5 links: Claude Code, Codex, OpenCode, Cursor, Cline |
| Proof number | `:177-190` | `26,554` + `capabilities LiteSPM can install` + `· catalog` + `snapshot` |

**Right column (the "product proof" frame)** — `web/components/marketing/ProductDemo.tsx`

- `:22` `Installation workflow` · `:26` `Local control`
- `:35-36` `Your agent, your capabilities` / `Marketplace discovery · Local installation`
- `:42,46,50` `Find` / `Install` / `Manage`
- `:58-61` H2 `From discovery to installation` + `Five simple stages`
- `:4-10` the five stages: `01 Discover` / `02 Check compatibility` / `03 Connect your agent` / `04 Install` / `05 Manage`
- `:80-84` `LiteSPM runs locally. After the initial agent setup and catalog sync, the CLI installs supported capabilities, records managed changes, and provides commands for removal and restoration. Installation behavior and compatibility depend on the package type.`

**Goal tiles** — `web/components/home/TopicTiles.tsx` (rendered): `Explore by what you want to do` /
`Choose a task to discover relevant tools, skills, and integrations.` / `All categories →`; eight tiles:
`Work with code`, `Documents, notes and tasks`, `Work with designs`, `Automate the browser`,
`Research and summarise`, `Connect databases`, `Ship and deploy`, `Keep secrets safe`.

**Curated shelf** — `web/components/home/Shelves.tsx:110-175` (rendered): `Start here` /
`Featured capabilities` / `Explore a curated selection of useful tools and skills. Review their capabilities, compatibility, and source before installing.` / `Catalog updated 21 October 2026` / `Offline catalog`; then `MCP integrations` — `Explore MCP servers for development, documentation, design, and infrastructure. These listings originate from the official MCP registry.` / `Browse the registry`; then `Featured agent skills` — `Discover skills for documents, spreadsheets, presentations, web design, and application testing. Source labels reflect the upstream catalog.` / `Browse official skills`.

**The three kinds** — `web/components/home/CapabilityTypes.tsx` (rendered): `What you can install` /
`Tools, skills and plugins — what is the difference?` / `All three install with the same command, the same preview and the same undo. They differ in what they add to your agent.` → `Tools / MCP` · `Connect your agent to apps and live data`; `Skills` · `Teach your agent a repeatable way to work`; `Plugins` · `Install a complete extension in one step`.

**How it works (below the fold)** — `web/components/home/HowItWorks.tsx`

- `:108-114` `How LiteSPM works` / H2 `From discovery to local installation` / `Connect your agent, install supported capabilities, and manage what LiteSPM changes.` / button `How LiteSPM works`
- `:41-44` `01` `Connect your coding agent` / `Use the setup wizard to connect LiteSPM to a supported agent.` / `$ litespm setup`
- `:49-51` `It adds a single litespm bridge entry and leaves every other server, comment and line of formatting alone.`
- `:62-65` `02` `Find and install a capability` / `Copy an exact package command from the marketplace and run it locally.` / `$ litespm install <id>`
- `:74-76` `LiteSPM installs only supported package sources. Eligible pinned plugins can be installed; discovery-only entries and unsupported artifacts are refused with a reason.`
- `:81-84` `03` `Manage or remove installed tools` / `See managed installations and remove or restore them when needed.` / `$ litespm install remove <installId>`
- `:95-96` `What was approved, what was written and what was removed is recorded against the plan that asked for it, in a ledger on your machine.`
- `:116-119` a second CTA labelled `How LiteSPM works` → `/how-it-works/` — the same label as the section heading it sits under.

**Agent strip** — `web/components/home/AgentStrip.tsx` (rendered): `Choose your agent` / `Saved on this device` / `Choose an agent to highlight relevant capabilities. Your selection stays in this browser.` / `Agent integrations` / `Works with the agents you already use` / `Explore available MCP and skill integrations for popular coding agents. Installation options and scopes vary by host.`

**Why LiteSPM** — `web/components/marketing/WhyLiteSPM.tsx:36-115`
- `:85-91` H2 `A simpler way to extend your agents` / `Discover capabilities, manage supported installations, and keep changes traceable without editing every agent's configuration by hand.`
- `:39-46` `Manage capabilities across your agents` / `Use one CLI to work with supported MCP servers, skills, and plugins across multiple coding agents. LiteSPM keeps a local record of the installations it manages.` / `$ litespm install <mcp-id> --agent codex`
- `:50-57` `Keep track of changes` / `Review host setup changes before applying them. LiteSPM backs up managed configuration files and offers removal and restoration commands.` / `$ litespm restore <installId>`
- `:60-67` `Local by design` / `Explore the marketplace without an account. The CLI runs locally, keeping your agent configuration and installation history on your own computer.`
- `:70-78` `Fits your coding workflow` / `Use LiteSPM from the terminal or, for supported agents, find capabilities through /marketplace in your agent.`
- `:109-114` `Free and Apache-2.0. Explore the marketplace first, if you would rather look before you install.`

**FAQ** — `web/components/home/FaqSection.tsx:33-151`, 12 questions. The load-bearing answers:

- `:35-41` `What is LiteSPM?` → `LiteSPM helps you discover, install, and manage supported MCP servers, skills, and plugins across AI coding agents. Installations and configuration changes run locally.`
- `:44-50` `Can I install from this website?` → `Choose a package in the marketplace and copy its LiteSPM command. Run that command in your terminal; the website cannot access or change your local configuration.`
- `:53-62` `What is an MCP server, and what is a skill?` → *the only glossary on the site*
- `:65-75` `Which agents work with it?` → `50 agent hosts have a built-in adapter, including Claude Code, Codex, Cursor, OpenCode, Cline and Pi. Use one of them, or all of them, from the same command.`
- `:77-84` `Do I need an account?` → `No LiteSPM marketplace account is required. The CLI is free and open source. Individual integrations may require their own sign-in or API credentials.`
- `:95-102` `Is anything here security-checked?` → `Source information and compatibility labels are not security audits. Review third-party code, permissions, and requested access before using a package.`
- `:103-111` `What can go wrong?`
- `:112-121` `What does it change on my computer?`
- `:122-131` `How do I undo it?`
- `:132-141` `Do my API keys leave my machine?`
- `:142-150` `What about plugins?` → `LiteSPM installs a plugin whose publisher ships a pinned source and manifest. A plugin without one is listed for discovery and refused at install, with the reason.`

**Get-started band** — `web/components/home/DeveloperZone.tsx:79-128`
- `:86-92` `Get started` / H2 `Install and manage from the terminal` / `Install LiteSPM from your terminal, connect a supported agent, and start adding capabilities from the marketplace. First-time catalog installation requires a sync.`
- `:25-31` the five commands: `npm install -g litespm` (Install the CLI) · `litespm setup` (Detect your agents, preview the change, approve it) · `litespm catalog sync` (Download the capability catalog) · `litespm install <id>` (Install an eligible package from its exact catalog ID) · `litespm doctor` (Check installation status and common setup issues)

**Footer** — `web/components/layout/SiteFooter.tsx`
- `:36-37` `The package manager for AI agents. Find, install, update and remove MCP servers, skills and plugins across the agents you use.`
- `:41-71` Browse: `Explore` · `Categories` · `Agent hosts` · `Compare hosts` · `Coverage`
- `:74-105` How it works: `What it does to your machine` (→ `/how-it-works/`) · `Get started` · `Release status` · `Security` · `Support`
- `:139-147` `Privacy` · `Contact` · `Terms`
- `:149-151` `Open source. No analytics, no cookies, no install telemetry.`
- `:110-135` the count strip: `69,376 capabilities` · `48,418 MCP` · `20,320 skills` · `638 plugins`

### 1.2 `/explore`

`web/app/explore/page.tsx:18-24` — title `Explore the catalog`; description `Search the whole catalog by name, summary, publisher, category, runtime, transport or tool name, filter by goal, and narrow to what works with the agent you actually use.`
Rendered: H1 `Explore the marketplace`; kind tabs `All types 69,376 / MCP Server 48,418 / Agent Skill 20,320 / Plugin 638`; `Goal` facet (11 goals + `Other — no goal placed (21,202)`); `Works with` facet (79 hosts, e.g. `Claude Code CLI (26,607)`, `Cursor (26,263)`); `Category`, `Publisher`, `Source`; toggles `Only entries from publisher manifests` and `Only entries LiteSPM can install`; `What each filter does` (`:126-130` of `ExploreFilters.tsx`); result header `69,376 matched — showing the most relevant`; sort `Best match / Recommended order / Installable first / Name A–Z / Publisher A–Z / Catalog order`; footer `How results are sorted — Official skills first, then entries from the publisher's own manifest, then entries LiteSPM can install.`

### 1.3 `/how-it-works`

`web/app/how-it-works/page.tsx:7-13` — title `How LiteSPM works`; description `Discover AI agent capabilities in the LiteSPM marketplace, connect your coding agent, install supported packages locally, and manage them from one place.`
- `:70-72` H1 `From discovery to installation, without the config-file hassle.`
- `:73-77` `LiteSPM combines a public marketplace with a local package manager for AI coding agents. Find a capability, check whether it fits your setup, and install it using the LiteSPM CLI. Your agent configuration stays on your machine.`
- `:79-80` `Explore the marketplace` · `Get LiteSPM`
- `:87-92` H2 `Three steps to extend your agent` / `Browse on the web. Install and manage locally. No marketplace account required.`
- `:43-45` `01 Connect your coding agent` / `Run LiteSPM locally and choose the agent you use. The interactive setup reads the adapter's own config path, shows you the file it found, and backs it up before writing a single bridge entry. Every other server, comment and line of formatting is left alone.` / `npx --yes litespm@latest setup`
- `:50-52` `02 Find and install a capability` / `Search the marketplace by task, provider or package name, then copy the package's exact install command from its page. Each listing shows its source, compatibility, and whether LiteSPM has a supported installation path. The first install fetches the signed catalog; after that LiteSPM resolves the package against it locally and refuses anything it cannot install, with the reason.` / `npx --yes litespm@latest install <id>`
  - ⚠ `"The first install fetches the signed catalog"` — the published pointer is **unsigned** today (STATUS.md §2: *"/v1/current.json.sigstore.json → 404"*). The pointer is digest-verified, not signature-verified.
- `:57-59` `03 Manage or remove installed tools` / `See what LiteSPM manages, remove one entry, or roll a config file back to the copy taken before the first edit. Removal takes out only the entry LiteSPM owns and leaves the rest of the file as it was.` / `litespm list`
- `:110-122` the walkthrough frame (captions + transcript placeholder, no recording)
- `:126-131` `First-time setup and catalog sync are separate operations in the current CLI. Package pages provide the exact installation command. Catalog skills may install into detected skill targets, while MCP servers and eligible plugins support explicit host selection.`
- `:136-141` H2 `Tools, skills, and plugins for different workflows` / `Each package type extends your agent in a different way. Availability depends on the published package source and your agent's supported integrations.`
- `:183-186` H2 `Your setup stays under your control` / `LiteSPM keeps managed installation records locally, backs up affected agent configurations, and provides removal and restoration commands.`
- `:218-223` close: `Find your next capability` / `Explore the marketplace, then install the packages that fit your workflow.` / `Browse marketplace` · `See supported agents`

### 1.4 `/package/<key>/`

Rendered for `/package/agent-rail/` (the id `mcp:builtin:mcp-registry:ai.thetickeris-agent-rail`, name `$AI on HyperEVM`):
- Title tag: `$AI on HyperEVM · LiteSPM` (`web/app/package/[slug]/page.tsx:62-71`)
- Install band (`web/components/package/InstallBand.tsx:63-125`): `Install with LiteSPM` / `Hosted by publisher · No LiteSPM account` / `LiteSPM adds the publisher's endpoint to your agent's configuration. The server itself stays hosted by the publisher. Copy the command into your terminal; first-time setup and catalog sync are separate steps for now.` / a collapsed `First time using LiteSPM? Set up these two steps first` (setup → `catalog sync`) / the copyable install command / `Selected agent: {label}. The --agent option targets exactly this agent, and the plan seals the destinations before anything is written.` / `Full installation guide ↓` / `Setup help →`
- `The short version` — `What it is` / `An MCP server — a small program your agent connects to and calls tools on. It runs where your agent runs, or as an endpoint the publisher hosts.` (from `web/components/package/PlainSummary.tsx`)
- The five plain questions: `What it does` · `Who publishes it` (`ai.thetickeris — from the publisher's own manifest. Not audited by LiteSPM.`) · `Can LiteSPM install it?` (`Yes — Runs on the publisher's own hosted endpoint. Nothing is downloaded to your machine.`) · `Which agents it works with` (`46 of 79 agent hosts in this catalog — every host LiteSPM can add a remote server to.`) · `Version` (`1.0.0`)
- Specs (`web/components/package/PackageTabs.tsx`): `Kind / Category / Publisher / Version / Transport / Endpoint / Source / Install`
- Tabs (`:31-38`): `Overview · Capabilities · Compatibility · Security · Versions · Source`
- `Manual setup` disclosure (`web/components/package/ManualSetup.tsx:23-148`): host picker + OS picker + the **bridge** config path + a JSON/TOML snippet of the bridge entry
- `How do I add it?` / `three steps, or one prompt` (`web/components/package/AddSteps.tsx`)
- Related rail (`web/components/package/RelatedRail.tsx:131-149`): `Also in {category}` · `More from {publisher}` · `More from {source}`

### 1.5 `/categories`

`web/app/categories/page.tsx:9-15` — title `Categories`; description `Browse the catalog by goal or by the sources' own category labels, with the number of MCP servers, agent skills and plugins filed under each.`
`web/app/categories/CategoriesView.tsx:72-85` — H1 `Categories`; `11 goals · 65 source categories · 69,376 entries`; `Find capabilities for the tasks you care about, from writing and research to development and automation.`; H2 `Browse by task`; H2 `All categories` (`:150`).

### 1.6 `/about` — **does not exist.** There is no `/about` route. The nearest equivalents are `/how-it-works/`, `/security/`, `/status/`, `/support/`, `/contact/`, `/terms/`, `/privacy/`.

### 1.7 Other pages (for IA)

| Route | title | description | Source |
|---|---|---|---|
| `/agents/` | `Agent hosts` | `Every agent host named in the catalog, which of them LiteSPM can configure directly, and the config file each one uses.` | `app/agents/page.tsx:13-18` |
| `/compare/` | `Compare agent hosts` | `The 50 agent hosts LiteSPM can configure, the config file it adds one entry to, where skills install — and the 29 more that take skills only.` | `app/compare/page.tsx:24-30` |
| `/insights/` | `Insights` | `What the catalog contains: entries per capability kind, agent host, category and publisher.` | `app/insights/page.tsx:17-23` |
| `/get-started/` | `Get started` | `Pick your coding agent and your system for the exact commands, the configuration file LiteSPM edits, and the way back.` | `app/get-started/page.tsx:31-37` |
| `/security/` | `Security` | `How to report a vulnerability, what LiteSPM is trusted to do, and the boundaries it does not cross: it does not audit publishers' code, a verified badge is not a security review, and installed code is not sandboxed.` | `app/security/page.tsx:21-27` |
| `/status/` | `Status` | `The catalog release this site was built from, plus one health check: a request for the catalog pointer, made from your browser.` | `app/status/page.tsx:27-33` |
| `/support/` | `Support` | `Where a report goes, what to put in it so it can be acted on, and the diagnostics to run before you send one.` | `app/support/page.tsx:21-27` |
| `/privacy/` | `Privacy` | `What LiteSPM stores in your browser, which two image hosts a page contacts, and what the litespm command writes and sends.` | `app/privacy/page.tsx:31-37` |
| `/terms/` | `Terms` | `The license, the warranty disclaimer, what a catalog listing does and does not mean, and what happens when you install someone else's capability.` | `app/terms/page.tsx:16-22` |
| `/contact/` | `Contact` | `Where to report a bug, a security vulnerability, or a wrong catalog row, and what to include so the report can be acted on.` | `app/contact/page.tsx:18-24` |
| `/trending/` | `Insights` | redirect stub, `robots: noindex` | `app/trending/page.tsx:20-30` |

### 1.8 Layout metadata — the five-positioning problem

`web/app/layout.tsx`

| Field | Line | Value |
|---|---|---|
| `<title>` default | `:48` | `LiteSPM — The package manager for AI agents` |
| title template | `:49` | `%s · LiteSPM` |
| `description` | `:51-52` | `Discover and install MCP servers, skills and plugins across the AI agents you use. LiteSPM handles compatibility, setup, updates and removal from one place.` |
| `openGraph.title` | `:69` | `LiteSPM — The package manager for AI agents` |
| `openGraph.description` | `:70-71` | `Discover and install MCP servers, skills and plugins across the AI agents you use.` |
| `twitter.title` | `:78` | `LiteSPM` |
| `twitter.description` | `:79` | `Find, install and manage MCP servers, skills and plugins for your AI agents.` |
| `og:image:alt` | `:158-160` | `LiteSPM — the lightweight skill & package manager for AI agents` |

Plus the npm package description (`npm/package.json:4`): `The Lightweight Skill & Package Manager for AI Agents — MCP servers, skills, and plugins through one bridge.`

**Four different descriptions and a fifth positioning phrase for one product.**

---

## 2. Five-second test (raw HTML, no JavaScript)

Source: `curl https://litespm.sarveshbh-2022.workers.dev/` → 141,295 bytes, HTTP 200.

**(a) What is this? — PASS, marginally.**
`The package manager for AI agents` (eyebrow, `LandingHero.tsx:97`) + `Give your AI agents new capabilities.` + `Discover and install MCP servers, skills and plugins across the agents you use.`
The reader who reads only the `<title>` gets it. The reader who reads only the H1 gets *"Give your AI agents new capabilities."* — an outcome, not a category. The category is one line above it and it is 12px grey (`kicker` class). **This is the fixable gap:** the H1 should carry the category, or the kicker should carry the outcome.

**(b) Who is it for? — FAIL.**
There is no audience statement anywhere above the fold or on the page. The closest is `Works with` (`LandingHero.tsx:156`) followed by five logos (Claude Code, Codex, OpenCode, Cursor, Cline) — that names *tools*, not *people*. The product's real audience claim (`50 agent hosts`, `web/components/home/FaqSection.tsx:69`) is 11 screens down, inside a collapsed `<details>`. The competitor that names nobody still sells to "developers" implicitly via the whole page's register; LiteSPM, whose copy is deliberately plain, leaves the reader to infer it. **The failing line is the one that should exist:** there is no `For developers using Claude Code, Cursor, Codex or OpenCode` anywhere.

**(c) What do I do next? — PASS.**
Two buttons: `Explore capabilities` (primary, `/explore/`) and `Get LiteSPM` (`/get-started/`), plus the search field with five starting-point chips. This is the strongest part of the page. It is undermined only by P0-1: the command the reader lands on and copies does not run.

**Title / meta / H1 consistency — FAIL on two of three:**
- `<title>` = *"The package manager for AI agents"*; H1 = *"Give your AI agents new capabilities."* — **different sentences, no shared noun phrase.** The title promises a category, the H1 promises an effect; a reader who sees them in a SERP and on the page cannot tell they describe the same promise.
- `meta description` = *"…handles compatibility, setup, updates and removal from one place."* — **contains the false "updates" claim** (P0-2) and is the single most-read sentence on the site, in every SERP and every social card.
- `og:image:alt` = *"the lightweight skill & package manager for AI agents"* — **contradicts the title's category** and matches the npm package's older description instead.

**Extra 5-second observation:** the hero's right column is a **5-stage diagram** (`ProductDemo.tsx:4-10, 58-61`) and the section 400px below it is a **3-step list** (`HowItWorks.tsx:41-101`). A reader who sees "Five simple stages" at the top and then "From discovery to local installation" with three numbered steps is being told two different workflows. `/how-it-works/` says three. There is no two-step explanation anywhere.

---

## 3. Clarity / jargon

Terms used before definition, in order of first appearance on the landing page.

| Term | First use | Defined at first use? | Notes |
|---|---|---|---|
| **MCP** | `LandingHero.tsx:112` (hero subhead) | **No** | Defined only in the FAQ at `FaqSection.tsx:53-62` — 11 sections down, collapsed. The `/how-it-works/` page expands it at `:148-150` (*"through the Model Context Protocol"*) but the landing page never does. |
| **capability** | `LandingHero.tsx:184` (`26,554 capabilities LiteSPM can install`) | **No** | The site uses "capability" and "package" and "tool" and "entry" and "listing" interchangeably for the same thing. `web/lib/telemetry.ts` calls the row a `Listing`; the UI calls it all five. `App/package/PackageView.tsx:20-25` says *"One entry from the LiteSPM catalog"*; the homepage says *"capabilities"*; the footer says *"capabilities"*; the package page H1 is the row's *name*. |
| **agent host / host** | `FaqSection.tsx:69` (`50 agent hosts`) | **Partly** | "agent host" is never defined. `CompareView.tsx` uses "Agent" as the column header; `ExploreFilters.tsx:129` says *"Works with is the agent host the entry works with"*; `CapabilityCard.tsx:164` says *"Not declared for Claude Code"*. A reader has to learn that "host" = "the app you use". |
| **bridge** | `HowItWorks.tsx:50` (*"adds a single `litespm` bridge entry"*) | **No** | Defined only on `/security/` (`app/security/page.tsx:45-47`: *"Proxy MCP traffic between an agent and the daemon over stdio"*). On the landing page the word appears unexplained in the second step. |
| **plan** | `HowItWorks.tsx:96` (*"recorded against the plan that asked for it"*) | **No** | The home page never says what a plan is, and never uses the word *approval* — yet "plan → human approval" is the product's core safety story. `/how-it-works/:119` says *"Nothing is written until the human approves"* but still never defines the plan. |
| **ledger** | `HowItWorks.tsx:96` (*"in a ledger on your machine"*) | **No** | Appears on the home page and in `web/components/package/ManageInstall.tsx:45,60` (*"Removal is ledger-scoped: only directories the ledger names are deleted"*). Defined nowhere on the site; `/privacy/:117` mentions *"the skills ledger"* without explaining it. |
| **sealed** | `InstallBand.tsx:113-115` (*"the plan seals the destinations before anything is written"*) | **No** | Never defined. STATUS.md's own word ("that acknowledgement is sealed into the plan"). A reader cannot know it means "recorded so it cannot change". |
| **scope** | `HowItWorks.tsx` (project vs machine) / `how-it-works/page.tsx:113` | **No** | Used as *"the scope: this project or the whole machine"*, which is actually a good gloss. The word *scope* itself is never defined but the parenthetical carries it. Acceptable. |
| **transport** | `app/explore/page.tsx:21` (search placeholder) and `PackageTabs.tsx:180-186` (`Transport: streamable-http`) | **No** | Rendered as a bare token with no gloss anywhere on the site. A first-time reader sees `streamable-http` and has no idea it means "how the agent talks to the server". |
| **runtime** | `app/explore/page.tsx:21`, `PackageTabs.tsx:171` | **No** | Same — `node`, `python`, `bun` appear as bare values. |
| **stdio** | `app/security/page.tsx:46` (*"over stdio"*) | **No** | Only on the security page, unexplained. |
| **catalog release** | `app/status/page.tsx:71` (*"The catalog release — a data stamp"*) | **Yes** | Well handled. |
| **shard** | never on the site | n/a | Good — "shard" is an internal term and it is correctly absent from user-facing copy. |

### 3.1 Technically-true-but-evasive claims

| Current wording | Where | Why it reads as evasive | Truthful plain replacement |
|---|---|---|---|
| *"LiteSPM installs only supported package sources."* | `HowItWorks.tsx:74` | "supported" does not say *what* is supported; the reader cannot act on it. | *"LiteSPM installs a package when its publisher publishes a command to run or an address to connect to. The other 42,822 are listed so you can read about them, and installing one is refused with the reason."* |
| *"Eligible pinned plugins can be installed"* | `HowItWorks.tsx:75`; `how-it-works/page.tsx:171-173` | "eligible", "pinned", "compatible manifests" are three undefined conditions. | *"A plugin installs when its publisher publishes a specific commit of its source. 390 of the 638 plugins in this catalog do. The rest are refused with the reason."* |
| *"whether LiteSPM has a supported installation path"* | `how-it-works/page.tsx:51` | "supported installation path" is the most abstract phrase on the site. | *"whether LiteSPM can install it, and if not, why"* |
| *"compatibility labels"* / *"Publisher-declared"* / *"Not audited by LiteSPM"* | `FaqSection.tsx:98`; `PackageTabs.tsx:93` | Correct but the word *label* implies a badge LiteSPM awarded. | *"the host list is the publisher's own declaration, or derived from the kind of entry — either way it is not a test result"* |
| *"LiteSPM-verified"* / *"LiteSPM-tested"* (dormant labels) | `PackageTabs.tsx:61-68` | Not rendered today (no row carries those values), but the words contradict `/security/:73` (*"there is no 'verified by LiteSPM' badge, because LiteSPM verifies nothing"*). | Rename to `Runtime checked` / `End-to-end tested` **or** delete the two entries so the contradiction cannot be shipped later. |
| *"Only entries LiteSPM can install"* (filter) | `ExploreFilters.tsx:432-440` | "can install" hides *why* 38% can. | *"Only entries LiteSPM can install (26,554) — the rest publish no command or address to install from"* |

---

## 4. Truthfulness sweep

### 4.0 Every number on the site, recomputed from `web/data/catalog.json`

| Claim on the site | Site value | Recomputed | STATUS.md / AGENTS.md | Verdict |
|---|---|---|---|---|
| Catalog total (footer, /explore, /status, /categories) | `69,376` | 69,376 | 69,376 (STATUS §2) | ✅ |
| MCP servers | `48,418` | 48,418 | 48,418 | ✅ |
| Skills | `20,320` | 20,320 | 20,320 | ✅ |
| Plugins | `638` | 638 | 638 | ✅ |
| "capabilities LiteSPM can install" (hero) | `26,554` | 25,400 + 764 + 390 = **26,554** | 25,400 MCP + 764 skills + 390 pinned plugins | ✅ |
| "50 agent hosts" (FAQ, /compare, /get-started) | `50` | `data/hosts.json` = 50 | 50 MCP bridge targets | ✅ |
| "46 … agents that take a remote server" (/compare, package page) | `46` | 46 rows with `remote: true` | "46 of the 50" | ✅ |
| "79 hosts" (/agents, /compare) | `79` | 50 adapters ∪ 81 skill targets − 2 aliases = 79 host identities | 81 *targets*; 79 *hosts* | ✅ (see P2-14) |
| "764 of the 20,320 skills" | `764` | 764 | 764 | ✅ |
| Release id / sequence (/status) | `rel-2026-10-21-01` / `151` | `data/release.json` | `rel-2026-10-21-01`, seq 151 | ✅ |

**No number on the site disagrees with STATUS.md.** The numeric layer of the site is clean.

### 4.1 P0-1 — The published install command fails

**Site copy:**
- `web/lib/installCommand.ts:133` — `export const WEBSITE_NPX_PREFIX = "npx --yes litespm@latest";`
- `web/lib/installCommand.ts:167-173` — appends ` --agent ${selected}` (or ` --all-detected` for skills) to `install <id>`
- `web/components/package/InstallBand.tsx:106-110` — the copyable block the reader copies
- `web/components/package/InstallBand.tsx:113-115` — *"Selected agent: {label}. The --agent option targets exactly this agent, and the plan seals the destinations before anything is written."*
- `web/components/marketing/WhyLiteSPM.tsx:46` — `$ litespm install <mcp-id> --agent codex`
- `web/app/how-it-works/page.tsx:45,52` — `npx --yes litespm@latest setup` / `npx --yes litespm@latest install <id>`
- `web/components/home/DeveloperZone.tsx:26` — `npm install -g litespm`

**Facts of record and the live registry:**
- npm `dist-tags.latest` = **0.4.1**, published **2026-10-15** (`https://registry.npmjs.org/litespm`).
- GitHub releases: latest is **v0.4.1** (2026-10-15). There is no `v0.5.0` or `v0.6.0` tag, and no npm publish for them.
- `CHANGELOG.md:149` `[0.6.0] - 2026-10-21` and `CHANGELOG.md:189` `[0.5.0] - 2026-10-19` are changelog entries, not published artifacts.
- `--agent` for installs, `--all-detected`, and plugin installs all landed in 0.6.0/0.5.0.
- `git show v0.4.1:cmd/litespm/main.go` — `parseInstallFlags` (`:1357-1440`) accepts only `--help/-h`, `--version/-v`, `--scope/-s`, `--workspace/-w`, `--host`, `--env`, `--force/-f`, `--frozen`.
- `git show v0.4.1:cmd/litespm/main.go | grep -i plugin` → **no output**. The published binary has no plugin path.

**Reproduced in a clean sandbox** (`/tmp/opencode/audit-sandbox`, `npm install litespm@latest` → `LiteSPM v0.4.1`):

```
$ litespm install mcp:builtin:mcp-registry:ai.thetickeris-agent-rail --agent codex
Install error: unknown flag "--agent"
Usage: litespm install <listing-id> [--version <ver>] [--scope user|project]
                     [--workspace <dir>] [--host <host-id>]... [--env <VAR>]... [--force] [--frozen]

$ litespm install skill:anthropics:pdf --all-detected
Install error: unknown flag "--all-detected"

$ litespm install plugin:claude-official:42crunch-api-security-testing
Resolving and installing plugin:claude-official:42crunch-api-security-testing...
Install failed: [LPSM-ARTIFACT-UNAVAILABLE] no fetchable artifact for
plugin:claude-official:42crunch-api-security-testing: the "plugin" install path is
not wired yet ...
```

**Why the build gate did not catch it:** `web/lib/installCommand.ts:29-33` and `:147-149` say the gate
`scripts/check-install-command.mjs` "reads the CLI's own flag parser out of `cmd/litespm/main.go`" and
"fails the build if the two disagree". It reads the **working tree** (0.6.0-era source), not the
**published package**. The site is therefore checked against a binary nobody can install.

**Secondary observation (same root cause):** the published 0.4.1's `catalog sync` failed against the
current release tree on the first attempt in a clean sandbox —
`Get "…/v1/releases/rel-2026-10-21-01/listings-0003.json": context deadline exceeded` — and succeeded
on a retry. `CHANGELOG.md:171-175` records this as fixed in 0.6.0 (*"`catalog sync` no longer times out
at ten seconds… A sync now has five minutes"*). The site is six releases behind the copy it publishes.

**Impact:** the primary call to action on every entry page, the `/how-it-works/` walkthrough, and the
"Why LiteSPM" card all instruct a command that exits with a usage error. This is a broken user path
on the site's most important journey.

### 4.2 P0-2 — "update" is promised for all three kinds; only skills have it

**Site copy:**
- `web/components/layout/SiteFooter.tsx:36-37` — *"Find, install, **update** and remove MCP servers, skills and plugins across the agents you use."* — **on every page of the site**
- `web/components/home/LandingHero.tsx:113` — *"LiteSPM handles compatibility, setup, **updates** and removal from one place."*
- `web/app/layout.tsx:51-52` — the meta description: *"…LiteSPM handles compatibility, setup, **updates** and removal from one place."*

**Facts of record:**
- `cmd/litespm/help.go:583` — the CLI's own help page for `self-update`: *"Does not update installed packages or skills; that is `litespm skills update`."*
- `cmd/litespm/help.go:273` — the `skills` help page: *"Add, use, find, list, **update** and remove SKILL.md skills."* — the **only** package-level update.
- The dispatch switch (`cmd/litespm/main.go:69-244`) has no `update` case for MCP servers or plugins.
- AGENTS.md §0 lists `skills update` and nothing else. STATUS.md §3 marks ledgered **update routing** (ARCH/33 §6) as still to-do.

There is no update path for MCP servers or plugins. The claim is site-wide, in the meta description,
in the hero subhead, and in the footer of every page.

### 4.3 P0-3 — Five different positionings in one page's metadata

| Surface | Value | Source |
|---|---|---|
| `<title>` | `LiteSPM — The package manager for AI agents` | `layout.tsx:48` |
| meta description | `Discover and install MCP servers, skills and plugins across the AI agents you use. LiteSPM handles compatibility, setup, updates and removal from one place.` | `layout.tsx:51-52` |
| OG description | `Discover and install MCP servers, skills and plugins across the AI agents you use.` | `layout.tsx:70-71` |
| Twitter description | `Find, install and manage MCP servers, skills and plugins for your AI agents.` | `layout.tsx:79` |
| OG image alt | `LiteSPM — the lightweight skill & package manager for AI agents` | `layout.tsx:158-160` |
| npm package description | `The Lightweight Skill & Package Manager for AI Agents — MCP servers, skills, and plugins through one bridge.` | `npm/package.json:4` |
| Footer | `The package manager for AI agents.` | `SiteFooter.tsx:36` |
| Hero kicker | `The package manager for AI agents` | `LandingHero.tsx:97` |

The OG image alt and the npm description describe a *different product* ("lightweight **skill &** package
manager") from the one the title and footer describe ("package manager for AI agents"). On a social
share, a visitor sees the title "The package manager for AI agents" and the image alt "the lightweight
skill & package manager for AI agents". Pick one.

### 4.4 Other absolute claims, checked

| Claim | Site | Verdict |
|---|---|---|
| *"The first install fetches the signed catalog"* | `how-it-works/page.tsx:51` | ⚠ **Inaccurate.** STATUS.md §2: the published pointer carries **no** `.sigstore.json` bundle (`/v1/current.json.sigstore.json` → 404). The pointer is digest-verified, not signature-verified. Change "signed" → "verified". |
| *"The published CLI does not yet combine bootstrap, agent setup and installation into one interactive command."* | `InstallBand.tsx:101-104` | ✅ True and candid — but it reads as unfinished on the page's most important panel. See P1-10. |
| *"No LiteSPM marketplace account is required."* | `FaqSection.tsx:80`; `HowItWorks`; `get-started` | ✅ True (`/privacy/:145`: *"There is no account, so there is no personal data held on our side"*). |
| *"Your agent configuration stays on your machine."* / *"nothing is uploaded"* | `how-it-works/page.tsx:76`; `privacy/page.tsx:43` | ✅ True and precisely stated (`privacy/:70-73`: *"Static files on Cloudflare Workers with a single asset binding: no database, no session store, and no log written by this site."*). |
| *"reversible"* / *"undo"* | `CapabilityTypes.tsx:214` (*"the same preview and the same undo"*); `FaqSection.tsx:122-131` | ✅ True (`install remove`, `restore`, `uninstall` all exist and are ledger-driven). |
| *"health is not checked"* | `status/page.tsx:20,47`; `insights` (*"There is no trending list here: no source publishes usage data. This is a census."*) | ✅ True and well-executed. |
| *"LiteSPM sets an agent up by adding one entry to a config file"* | `CompareView.tsx:410`; `FaqSection`; `get-started:97-101` | ✅ True — and `get-started:97-101` states it better than anywhere else (*"It backs the file up first, prints the lines it is about to change, and waits for you to approve them. Everything else in the file survives"*). |
| *"No star, download or install counts appear anywhere, because no upstream source publishes them."* | `app/security/page.tsx:78-79` | ⚠ **Too strong.** For skills read from GitHub repositories (`anthropics/skills`, `vercel-labs/skills`, `awesome-agent-skills`), GitHub stars *are* published upstream. Narrow it to the catalog: *"No source in this catalog publishes star, download or install counts, so this site shows none. Where an upstream project publishes them, they are not part of the catalog row."* |
| *"Compatibility is declared, not tested"* | `app/security/page.tsx:76-77` | ✅ True. |
| *"A badge is not a security review"* | `app/security/page.tsx:70-73` | ✅ True, and `PublisherMark.tsx:168-176` correctly renders a neutral `from publisher manifest` chip with no tick. |

---

## 5. Competitor teardown

All pages fetched 2026-10-22. `pulsemcp.com` and `cursor.directory` blocked plain `curl`
(Cloudflare 403 / Vercel Security Checkpoint 429) and were read through exa's fetcher; their quotes
below are from that fetch. **`agentskills.io` is not a marketplace** — it is the Agent Skills
*specification* site (Anthropic's `agentskills/agentskills` repo, nav: Overview, Specification, Client
Showcase, For skill creators, Quickstart, Best practices, Optimizing descriptions, Evaluating skills,
Using scripts, For client implementors). It is the standard LiteSPM cites, not a rival. LiteSPM's own
site never links to it (grep for `agentskills.io` in `web/` → **0 hits**), even though its skill rows
come from that ecosystem.

### 5.1 smithery.ai

- **Title:** `Smithery - Connect agents to services in minutes`
- **H1:** `Give agents more agency`
- **Subhead:** `Connect agents to thousands of tools and services. Auth, credentials, and sessions handled for you.`
- **Nav:** `715` `MCPs` · `Skills` · `Docs` · `Pricing` · `Publish` · `Login`
- **Primary CTA:** `Publish` (top-right, for authors) + per-card `Add to toolbox`; a `Login` button signals an account model
- **Numbers they lead with:** the total (`715 MCPs`) in the nav; **per-card usage counts** — `OneSignal — 22.49k uses`, `Agent News — 43.39k uses`, `Exa Search — 9.18k uses`, `Context7 — 5.56k uses`, `DevMatch — 6.93k uses`, `URL Safety Validator MCP — 5.62k uses`
- **Individual server presentation:** name, long description, `Add to toolbox`; 45 `Verified` badges on the homepage; a server page has tabs `Overview / Repository / Homepage / Published / License / Tool Calls` and the CLI `npx -y smithery setup`, `npx smithery auth login`, `npx smithery mcp …`, `npx smithery tool list`, `npx smithery tool call …`
- **Trust/security:** `Pricing` + `Login` + `Publish` + per-server `Verified` badge; the headline claim is credential handling (*"Auth, credentials, and sessions handled for you"*) — i.e. trust is delegated to their cloud
- **Navigation model:** flat top-level + heavy card grid; a `Skills` tab is a separate vertical from `MCPs`
- **Banner:** `Smithery's MCP Proxy and managed identity shut down on October 31.`

### 5.2 mcp.so

- **Title:** `What Is MCP? MCP Servers, Clients & AI Tools | MCP.so`
- **H1:** `Discover useful MCP servers`
- **Subhead:** `Connect AI apps to tools, data, and automated workflows.`
- **Nav:** `Discover` · `Servers` · `Remote Servers` · `Clients` · `CLI` · `Loops` · `Skills` · `Agents` · `Rankings` · `Feed` · `Advertise` · `Submit` · `Sign In`
- **Primary CTA:** `Browse featured` → `View all`; `Submit`; `Advertise`
- **Numbers:** `Top categories` chips; per-card count badge (`54`, `50`, `148`) and **recency** — `Added last month`, `Added 2 months ago`, `Added 23 days ago`
- **Individual server presentation** (`/servers/9apes`): title `9apes MCP Server: Tools, Setup & Config`; badges `Verified` and `Featured`; `Basic information` = Transport / Authentication / Category / Author / Submitted by; `Connection details`; **a `Setup` block with per-client tabs `Claude Code / Codex / Cursor / VS Code` and a copyable command `claude mcp add 9apes --transport http https://api.9apes.com/mcp`**; `9apes MCP Server tools` with a live `Fetch tools` button; `What you need`
- **Trust/security:** `Verified` / `Featured` badges, `Submitted by` attribution, `Remote Servers` split from local
- **Navigation model:** deep, horizontal, editorial — `Rankings` and `Feed` are distinct surfaces; `Skills`, `Agents`, `Clients` are peer verticals

### 5.3 glama.ai/mcp/servers

- **Title:** `Open-Source MCP Servers – 108,273 in the Glama Registry | Glama`
- **H1:** `Glama` → `MCP` → `Servers` → `108,273 servers. Updated 2026-10-22 08:00`
- **Subhead:** the count and a live `Updated` timestamp
- **Nav:** `Servers` · `Connectors` · `Tools` · `Clients` · `Inspector` · `New Chat` · `Sign Up` · `Add Server`
- **Primary CTA:** `Add Server`; `Sign Up`; `New Chat` (a chat product)
- **Numbers:** `108,273 servers`; facet counts `Python 45,400 / Remote 42,851 / Local 40,065 / TypeScript 38,953 / Tools 35,735 / Developer Tools 25,971 / Hybrid 20,474 / Resources 16,744 / Prompts 15,762`
- **Sort options (the strongest signal in the set):** `Search Relevance ↓` · `Recent Usage ↓` · `Date Added ↓` · `Date Updated ↓` · **`Weekly npm Downloads ↓`** · **`Weekly PyPI Downloads ↓`** · **`GitHub Stars ↓`** · **`Recent GitHub Stars ↓`**
- **Individual server:** client-rendered; the page exposes a directory API (`GET /v1/servers`)
- **Trust/security:** `official` labels, `Inspector` (a live client), `Add Server` (author-side), `Sign Up`
- **Navigation model:** filter-first, with the sort bar as the primary control

### 5.4 mcpmarket.com

- **Title:** `MCP Market | Discover Top MCP Servers & Agent Skills`
- **H1:** `Find The Best MCP Servers - Agent Skills - MCP Clients - Agent Tools`
- **Subhead:** `Directory of awesome MCP servers and clients to connect AI agents with your favorite tools.`
- **Nav:** `MCP Servers` · `Agent Skills` · `Sell Skills`
- **Primary CTA:** `Sell Skills`; `Official MCP Servers → View all official servers`
- **Numbers:** `50,240` `Servers` · `Updated 1 hour ago`; 19 category facets; per-card **star counts** (verified in the raw HTML: `homepage_starCount__Q2rFO` with a star SVG — `Firecrawl 4.2k`, `ElevenLabs 1.5k`)
- **Filters:** `All`, 18 categories, `Official`, `Featured`
- **Trust/security:** `Official` and `Featured` filters, `Sell Skills` (a monetised surface)
- **Navigation model:** filter sidebar + card grid, with skills as a peer vertical

### 5.5 pulsemcp.com *(read via exa; plain curl returned Cloudflare 403)*

- **Title:** `PulseMCP | Keep up-to-date with MCP`
- **H1:** `Explore the Model Context Protocol`
- **Subhead:** `Everything MCP: servers, clients, use cases, tools, and The Agentic Loop newsletter`
- **Nav:** `MCP Servers` · `MCP Clients` · `Pulse Posts` · `Use Cases` · `Subscribe to The Agentic Loop` · `Docs` · `Contribute to MCP` · `Registry`
- **Primary CTA:** the newsletter subscription + four content tiles (`MCP Servers` / `MCP Clients` / `Pulse Posts` / `Use Cases`)
- **Numbers:** no download/install counts; the lead is the *catalogue of content* + a newsletter
- **Trust/security:** the strongest human-trust model in the set — a `Who's behind Pulse?` block naming `Tadas Antanavicius` (*"Active member of the MCP Steering Committee currently focused on building out the MCP contributor community and maintaining the official MCP Registry"*) and `Mike Coughlin`; plus `Official MCP Resources → Docs / Contribute to MCP / Registry`
- **Navigation model:** editorial/content-led — a magazine with a directory inside it
- **Trust caveat stated on the page:** `New server submissions and listing changes are paused until mid-August while we rework our ingestion and listing management processes.`

### 5.6 skills.sh (Vercel)

- **Title:** `The Agent Skills Directory`
- **H1:** `The Open Agent Skills Ecosystem`
- **Subhead:** `Skills are reusable capabilities for AI agents. Install them with a single command to enhance your agents with access to procedural knowledge.`
- **Nav:** `Skills` · `Packs` · `Topics` · `Official` · **`Audits`** · `Docs`
- **Primary CTA:** `Try it now` → `$ npx skills add <owner/repo>` (a copyable command in the hero)
- **Numbers:** `Skills Leaderboard` with `All Time (1,446,302)` / `Trending (24h)` / `Hot`; table columns `# · Skill · 8W Activity · Installs`; per-row install counts `4.0M` (`find-skills`, `vercel-labs/skills`), `1.4M` (`grill-me`), `1.2M` (`agent-browser`); `Available for these agents` — 20 logos: `AMP, Antigravity, Claude Code, Cline, Codex, Cursor, Droid, Gemini, GitHub Copilot, Goose, Kilo, Kiro CLI, Nous Research, OpenClaw, OpenCode, Roo, Trae, VS Code, Windsurf, Zed`
- **Individual skill presentation** (`/vercel-labs/skills/find-skills`): breadcrumb `skills / vercel-labs / skills / find-skills`; `Installation → Command` with a copy button `$ npx skills add https://github.com/vercel-labs/skills --skill find-skills`; `Summary` (what it does **and when to use it**); the rendered `SKILL.md`; `Related skills` rail
- **Trust/security:** an **`Audits`** top-level nav item — `Security Audits — Combined security audit results from Gen Agent Trust Hub, Socket, and Snyk.`, a table of `# · Skill · Gen · Socket · Snyk` with per-skill `Safe` / `0 alerts` / `Med Risk` / `Low Risk` badges
- **Navigation model:** topic/pack/official/audit verticals + a leaderboard

### 5.7 agentskills.io

Specification, not a directory — see above. Nav: `Overview, Specification, Client Showcase, For skill creators (Quickstart, Best practices, Optimizing descriptions, Evaluating skills, Using scripts), For client implementors (Adding skills support)`. Its H1 is `Agent Skills Overview` / `What are Agent Skills?`. It publishes **no** counts.

### 5.8 cursor.directory *(read via exa; plain curl returned a Vercel Security Checkpoint 429)*

- **Title:** `Cursor Directory - Plugins for Cursor`
- **H1:** `Extend Cursor with community plugins.`
- **Subhead:** `Discover and install plugins from 91.2k+ developers, ranked by what's trending.`
- **Numbers:** `91.2k+ developers`; per-entry counts `40.2k` (Next.js rules and best practices for Cursor), `13.3k` (Uizze), `8.5k` (GitHub issues MCP server), `8.1k` (Supabase), `6.8k` (Vercel), `6.5k` (Cloudflare), `6.2k` (Stripe), `3.6k`, `3.5k`, `3.2k`, `3k`, `2.8k`, `2.6k`, `2.3k`; and small integers (`4`, `12`, `15`, `22`) that read as discussion counts
- **Trust/security:** no audit badges; trust comes from the publisher identity + the ranking
- **Navigation model:** single vertical, ranking-first, Cursor-only

### 5.9 Cross-competitor summary

| | Total | Usage/star count | Sort by popularity | Per-host install command | Audit badges | No-JS readable |
|---|---|---|---|---|---|---|
| **LiteSPM** | 69,376 | ✗ | ✗ | ✗ (one generic `litespm install`) | ✗ | ✅ |
| smithery.ai | 715 MCPs | ✅ `22.49k uses` | n/a | ✗ (hosted CLI) | ✅ `Verified` | ✗ (SPA) |
| mcp.so | — | ✅ count badge | ✅ `Rankings` | ✅ per-client tabs | ✅ `Verified`/`Featured` | ✅ |
| glama.ai | 108,273 | ✅ | ✅ 8 sort keys incl. GitHub Stars | ✗ | ✅ `official` | ✗ (SPA) |
| mcpmarket | 50,240 | ✅ `4.2k` stars | ✗ | ✗ | ✅ `Official`/`Featured` | ✅ |
| pulsemcp | — | ✗ | ✗ | ✗ | ✗ (human authors) | ✅ |
| skills.sh | 1.4M installs | ✅ `4.0M` installs | ✅ Leaderboard (All Time / Trending / Hot) | ✅ `npx skills add …` | ✅ 3 audit vendors | ✅ |
| cursor.directory | 91.2k+ devs | ✅ `40.2k` | ✅ "ranked by what's trending" | ✗ | ✗ | ✗ |

**LiteSPM is alone in publishing no popularity figures and in having no audit badges — and alone in being
fully readable without JavaScript.** Those are the two things it should be proud of, and neither is
visible above the fold.

---

## 6. Gap analysis

### 6.a What competitors have that LiteSPM lacks, and that genuinely helps a decision

1. **A per-host install snippet for the capability itself.** mcp.so's server page gives
   `claude mcp add 9apes --transport http https://api.9apes.com/mcp` with a Claude Code / Codex / Cursor /
   VS Code tab strip; skills.sh gives `npx skills add https://github.com/vercel-labs/skills --skill find-skills`.
   LiteSPM's package page gives **one** command, `litespm install <id>`, and hides the *bridge* snippet
   behind a disclosure (`ManualSetup.tsx:118-134`) — a snippet that is **identical for every capability**,
   because it describes LiteSPM's own wiring, not the thing the reader came for. A developer comparing
   LiteSPM to mcp.so wants to know what the config entry will look like. This is the single biggest
   decision-support gap, and it is cheap: the package page already knows the transport and the endpoint.
2. **A live tool list.** mcp.so shows the server's actual tools with a `Fetch tools` button
   (*"No tools detected — Fetch the live tool list directly from this server's endpoint"*). LiteSPM's
   `Capabilities` tab is publisher-declared only. A visitor cannot see what a server does before installing.
3. **Recency.** mcp.so shows `Added last month` / `Added 2 months ago`; glama offers `Date Added` and
   `Date Updated` sorts. LiteSPM shows a *catalog* release date (`21 October 2026`) but never a per-row
   date — because the rows do not carry one. Publishing "the row has no date" is honest but leaves the
   reader unable to judge freshness at all.
4. **A leaderboard / ranking surface.** glama (`Recent Usage`, `Date Updated`, `Weekly npm Downloads`,
   `GitHub Stars`), skills.sh (`All Time (1,446,302) / Trending (24h) / Hot`), cursor.directory
   (*"ranked by what's trending"*). LiteSPM's `/insights/` is explicitly a census, not a ranking
   (*"There is no trending list here: no source publishes usage data."*). **This gap is real but must
   not be closed with invented numbers** — the honest version is a *recency* surface (see 6.b).
5. **A category/facet nav that reaches a decision.** LiteSPM has this (goal tiles, 11 goals, 65 source
   categories, 6 filters, a `What each filter does` explainer) and it is **better than most of the set**.
   This is a strength, not a gap — but it is invisible, because `/categories/` is not in the header rail
   and not in the mobile menu.
6. **A copyable config block.** LiteSPM has one (`ManualSetup.tsx:124-134`) but it is the *bridge*
   entry, buried in a `<details>`. Competitors put the *thing you want* front and centre.
7. **A search that filters without a round trip.** LiteSPM's search is a static export with a sharded
   index and a 2.80 MiB gzip first-search measurement (STATUS.md §1) — genuinely good, and better than
   the SPAs. It is not visible as a claim.
8. **An "audits" surface.** skills.sh aggregates three vendors' verdicts. LiteSPM has no equivalent and
   cannot invent one — but `/security/` (with `A badge is not a security review`, `Compatibility is
   declared, not tested`, `Installs are previewed and backed up — the code is not sandboxed`) is a
   **stronger and more honest trust page than any competitor's badge**, and it is one click from the
   footer and zero clicks from the entry pages' `Security` tab.

### 6.b What LiteSPM claims that no competitor can, and where it lives

| Differentiator | Where it lives now | Above the fold? |
|---|---|---|
| **One bridge entry in the host's own config, 50 hosts** | `/compare/` (footer → "Compare hosts"), `/agents/` (header → "Works with"), FAQ answer | ❌ No. The hero shows 5 logos, the number 50 is in a collapsed FAQ. |
| **Reversible writes: plan → approval → backup → undo** | `/how-it-works/`, `/security/`, `WhyLiteSPM` ("Keep track of changes") | Partly — `WhyLiteSPM` is the 7th section, ~5 screens down. |
| **Refuses what it cannot complete, naming the reason** | `HowItWorks.tsx:75`, `FaqSection.tsx:147`, every entry page's `Can LiteSPM install it?` | The *proof* is on entry pages. The *promise* is in the 3rd step of a below-the-fold section. |
| **A published, verifiable, digest-checked catalog release tree** (`/v1/current.json`, signed releases) | `/status/` | ❌ Only in the footer, as "Release status". |
| **"Why these results?"** — the search explains its own ranking with the matched field and fragment | `app/explore/ExploreWhy.tsx:65-148` | ❌ Collapsed, below the result list, and only after a search. Its own comment says *"no competitor explains why a row ranked"*. |
| **No-JS-readable pages** (competitors smithery/glama/cursor.directory are SPAs) | Everywhere, `layout.tsx:174-207` | ❌ Unclaimed. |
| **13 Bridge tools inside the agent** | `WhyLiteSPM.tsx:70-78` (`/marketplace`) | ❌ The site mentions `/marketplace` in one card and never says what it does or that 13 tools are exposed. |
| **Local-first: no account, no cookie, no telemetry, no install telemetry** | `FaqSection.tsx:80`, `privacy/page.tsx:43-73`, footer | Partly — "no account" is in a collapsed FAQ; "no telemetry" is in the footer. |

**The uncomfortable pattern:** every genuine differentiator is below the fold, in a collapsed
`<details>`, or on a route with no entry point. The things above the fold are the things every
competitor also has (a headline, a search box, a set of logos, a card grid).

### 6.c Where the honesty needs one line so it reads as integrity, not as an unfinished product

1. **The 26,554-vs-69,376 gap.** The hero prints `26,554 capabilities LiteSPM can install` with no
   explanation of the other 42,822. A reader compares it to the footer total and concludes the product
   is broken. One line fixes it:
   > `26,554 of 69,376 entries can be installed today. The rest are listed so you can read about them —
   > their publishers publish no command to run, so installing one is refused with the reason.`
2. **"This is not a ranking."** `/insights/` says it; the card grid needs it. One line under the sort
   control or under the first card:
   > `This list is a census, not a leaderboard. No source in this catalog publishes install counts, so
   > there is nothing to rank by — the order below is a recommended reading order, and every entry page
   > tells you whether it can be installed.`
3. **"A listing is not an endorsement."** `/security/:69` says it. It should also sit on the entry page
   next to the publisher name, where the reader actually looks.
4. **"The published CLI does not yet combine bootstrap, agent setup and installation into one
   interactive command."** (`InstallBand.tsx:101-104`) is truthful and reads as a defect. Reframe:
   > `The CLI runs the three steps separately today. Each one is a command you can read before you run it.`
5. **The refusals should be shown as a feature, in the product's own voice.** The site refuses
   installs constantly — that is its claim — but the refusal copy is uniformly apologetic
   (*"Not installable"*, *"Install unavailable for this selection"*). A line that names the reason in
   the site's voice would read as rigor:
   > `LiteSPM refuses an install it cannot complete, and tells you which piece was missing.`

---

## 7. IA and conversion

### 7.1 Navigation

**Header rail** (`web/components/navigation/Header.tsx:56-61`): `Explore` → `/explore/`, `Works with` →
`/agents/`, `How it works` → `/how-it-works/`, `Docs` → GitHub README (external). Plus a search button
(⌘K palette), a theme toggle, and the CTA `Install LiteSPM` → `/#install`.

**Mobile** (`Header.tsx:255-293`): a `<details>`-based `Menu` with **the same four items only**. So on a
phone, `/categories/`, `/compare/`, `/insights/`, `/get-started/`, `/security/`, `/status/` and `/support/`
are reachable only by scrolling to the footer. `/categories/` — the page that answers *"what kind of
thing do I want?"* for 69,376 entries — has no entry point above the footer on any device.

**Footer** (`SiteFooter.tsx:41-105`): two grouped columns, `Browse` (5) and `How it works` (5), plus
Privacy/Contact/Terms. Grouping is good; the problem is the group heading `How it works` (`:76`) sitting
above a link labelled `What it does to your machine` (`:81`) whose destination's H1 is
`From discovery to installation, without the config-file hassle.` — **the label and the destination
describe different things.**

**Label/destination mismatches:**

| Label | Destination | Destination's own H1 | Problem |
|---|---|---|---|
| `Works with` (header) | `/agents/` | `Browse AI agents` / `Agent hosts, compatible entry counts by kind, and config adapters` | A reader clicking "Works with" wants a compatibility matrix; `/agents/` is an index of 79 host pages. The matrix is `/compare/`, which the header does not link. |
| `How it works` (header) vs `How it works` (button in `HowItWorks.tsx:117`) | `/how-it-works/` | `From discovery to installation, without the config-file hassle.` | The button label repeats the section heading it sits under. |
| `What it does to your machine` (footer) | `/how-it-works/` | same | Label ≠ destination. |
| `Coverage` (footer) | `/insights/` | `Insights` | The footer says "Coverage", the tab says "Insights", the page is about both. |
| `Find a package` (`app/package/page.tsx:21`) | `/package/` | `Find a package` | The metadata description says *"One entry from the LiteSPM catalog: what it does, which agent hosts it works with, and how to add it."* — that describes an **entry page**, but `/package/` is a 12-row index. |
| `Explore the marketplace` (CTA) vs `Explore the catalog` (title) vs `Explore` (nav) | `/explore/` | `Explore the marketplace` | Three names for one route across the site. |

**Duplicates:**

- **`/agents/`, `/compare/` and `/insights/` are three tables of the same 79 hosts.**
  `/compare/` columns: `Agent · Config file · Project scope · Skills · Docs`.
  `/insights/` columns: `Host · Config file where LiteSPM writes · Project config per-repository file · Skills install target · Entries compatible with it · Docs vendor documentation`.
  `/agents/` columns: `AI agent · Setup · Catalog entries · Configuration path`.
  `/compare/` and `/insights/` are ~80% identical; `/insights/` adds only the `Entries compatible with it`
  count and the format labels. **Merge `/insights/` into `/compare/`, or make `/insights/` a
  publisher/kind census and move the host table wholly to `/compare/`.**
- **`/explore/` and `/package/` are two catalog indices.** `/package/`'s "Start of the catalog" is
  alphabetical and shows the least recognisable names in the corpus: `$AI on HyperEVM`, `$THREE Token`,
  `(WiP) An everything app`, `.FAF Context`, `.NET Debugger for MCP`, `.NET MCP Server`, `.prompts`,
  `00Widget`, `01Mind`, `0523 Public — Taiwan Logistics & Customs`, `0bridge`, `0bull Phone Farm`.
  A visitor who lands on `/package/` sees twelve rows that look like garbage. **Either delete `/package/`
  as an index and make it a redirect to `/explore/`, or fill it with the same curated set the home page
  uses.**

### 7.2 The path landing → find → install

```
/  →  [Explore capabilities]  →  /explore/  →  [a row]  →  /package/<key>/
                                                  ↑              ↑
                                    [Get LiteSPM] → /get-started/   [Install with LiteSPM] → copy command → terminal
```

**Where it works.** The search on the home page, the goal tiles, the curated shelf, the six filters on
`/explore/`, the `What each filter does` explainer, and the `Why these results?` panel are all better
than anything in the competitive set.

**Where it breaks:**

1. **The final step is broken (P0-1).** The copied command fails on the published CLI.
2. **A reader arriving on `/explore/` with no query sees 48 rows, all skills** (measured: 48/48 `skill`,
   0 `mcp`, 0 `plugin` — `sortListings`' `curated` mode in `web/lib/catalog.ts:181-189`). The site's own
   position leads with MCP servers, which are 70% of the catalog (48,418 of 69,376). The first screen of
   the marketplace contradicts the product's own lead. **Interleave by kind, or add an MCP-first default
   tab.**
3. **There is no "copy a config snippet for the thing I want" step** (see 6.a-1).
4. **`/explore/` is not linked from the home page's "What you can install" section** — those cards link to
   `/explore/?kind=mcp`, `/explore/?kind=skill`, `/explore/?kind=plugin`, which is right, but a visitor
   who has to scroll past five sections to reach them may not.

### 7.3 Does every page end with the right next action?

| Page | Ends with | Verdict |
|---|---|---|
| `/` | the five-command install band + `Step-by-step setup` + `Or just browse the catalog →` | ✅ |
| `/explore/` | the result list, then `How results are sorted` | ⚠ No CTA after the list; the reader is left to the header. |
| `/package/<key>/` | the install band (above), then tabs, then the related rail | ✅ The install panel is above the fold — the right choice. |
| `/how-it-works/` | `Find your next capability` / `Browse marketplace` · `See supported agents` | ✅ |
| `/categories/` | the 65-row category table | ⚠ No CTA. A reader who lands here and finds nothing is stranded. |
| `/compare/` | `A dash means no value is recorded for that agent.` | ❌ No CTA at all — the page ends on a legend. |
| `/insights/` | the host table | ⚠ No CTA. |
| `/agents/` | the host table | ⚠ No CTA. |
| `/get-started/` | the guide | ✅ (interactive agent + OS picker). |
| `/status/` | `This page is part of the source.` + link | ⚠ No CTA. |
| `/security/` | `This page is part of the source.` + link | ⚠ No CTA — the page that most deserves one ("Get LiteSPM and run it locally") ends on a source link. |
| 404 | `Back to the home page` / `Explore capabilities` | ✅ |

### 7.4 Sitemap and crawler surface

`web/app/sitemap.ts:45-55` lists **nine** index routes: `/`, `/agents/`, `/compare/`, `/categories/`,
`/explore/`, `/insights/`, `/privacy/`, `/contact/`, `/terms/`.

**Missing:** `/how-it-works/`, `/get-started/`, `/security/`, `/status/`, `/support/`, `/package/`.
The live `/sitemap.xml` has 88 `<loc>` (9 index + 79 agent pages) and **none of the five info pages**
that a first-time visitor most needs. The code comment at `sitemap.ts:17-19` still says *"the catalog
index pages, the three information pages"* — it has been wrong since `/security/`, `/status/`, `/support/`,
`/how-it-works/` and `/get-started/` were added. `/package/entries/sitemap.xml` exists separately with
4,000 entry URLs, so the entries are advertised; the **decision pages** are not.

---

## 8. Verdict

### 8.1 Severity-ranked findings

| # | Sev | Finding | Evidence |
|---|---|---|---|
| **1** | **P0** | The install command the site prints is rejected by the published CLI. `npx --yes litespm@latest` = **0.4.1** (2026-10-15); the site appends `--agent <id>` / `--all-detected`, and 0.4.1 answers `unknown flag`. 0.4.1 also cannot install a plugin at all. | `web/lib/installCommand.ts:133,167-173`; `web/components/package/InstallBand.tsx:106-115`; `web/components/marketing/WhyLiteSPM.tsx:46`; `web/app/how-it-works/page.tsx:45,52`; `web/components/home/DeveloperZone.tsx:26`. Reproduced: `Install error: unknown flag "--agent"` / `[LPSM-ARTIFACT-UNAVAILABLE] … the "plugin" install path is not wired yet`. npm `latest`=0.4.1; `git show v0.4.1:cmd/litespm/main.go` has no `plugin` and no `--agent` in `parseInstallFlags`. |
| **2** | **P0** | "update" is claimed for MCP servers and plugins on every page; only skills have an update path. | `web/components/layout/SiteFooter.tsx:36-37`; `web/components/home/LandingHero.tsx:113`; `web/app/layout.tsx:51-52`. Against `cmd/litespm/help.go:583` (*"Does not update installed packages or skills; that is `litespm skills update`."*) and `:273`. |
| **3** | **P0** | Five different positionings/description sets in one page's metadata; the OG image alt contradicts the `<title>`. | `web/app/layout.tsx:48,51-52,69-71,78-79,158-160`; `npm/package.json:4`; `web/components/layout/SiteFooter.tsx:36`. |
| **4** | **P1** | The homepage shows two different step models — "Five simple stages" in the hero, three numbered steps below the fold — and two near-identical H2s. | `web/components/marketing/ProductDemo.tsx:4-10,58-61` vs `web/components/home/HowItWorks.tsx:41-101,109-111`; `web/app/how-it-works/page.tsx:87-92`. |
| **5** | **P1** | `26,554 capabilities LiteSPM can install` with no one-line explanation of the other 42,822. Reads as broken, not as rigorous. | `web/components/home/LandingHero.tsx:177-190`; `web/lib/availability.ts:31-42` (the numbers are right — the *explanation* is missing). |
| **6** | **P1** | The audience is never named. No "for developers using Claude Code, Cursor, Codex…" anywhere above the fold; the 50-host claim lives in a collapsed FAQ. | `web/components/home/LandingHero.tsx:97-171`; `web/components/home/FaqSection.tsx:65-75`. |
| **7** | **P1** | `/sitemap.xml` omits `/how-it-works/`, `/get-started/`, `/security/`, `/status/`, `/support/`, `/package/` — the decision pages. The comment says "the three information pages". | `web/app/sitemap.ts:17-19,45-55`; live sitemap = 88 `<loc>`, none of the six. |
| **8** | **P1** | No per-host install snippet for the capability itself; the only snippet is the *bridge* entry, identical for every package, behind a disclosure. | `web/components/package/ManualSetup.tsx:118-134` vs mcp.so `/servers/9apes` (`claude mcp add …`, per-client tabs) and skills.sh (`npx skills add … --skill …`). |
| **9** | **P1** | Three near-duplicate host tables; the header's `Works with` points at the index, not at the matrix. | `web/components/navigation/Header.tsx:58`; `web/app/compare/CompareView.tsx:277-284`; `web/app/insights/TrendingView.tsx`; `web/app/agents/AgentsView.tsx`. |
| **10** | **P1** | `/explore/`'s default grid is 48/48 skills — the first screen of the marketplace contradicts the product's own lead (MCP servers are 70% of the catalog). | Measured on the live page; `web/lib/catalog.ts:181-189` (`curated` sort). |
| **11** | **P1** | `Transport` and `Runtime` are rendered as bare values and never defined; `bridge`, `ledger`, `plan`, `sealed` are used without definition. | `web/components/package/PackageTabs.tsx:171,180-186`; `web/app/explore/page.tsx:21`; `web/components/home/HowItWorks.tsx:50,96`; `web/components/package/InstallBand.tsx:114`. |
| **12** | **P1** | `/how-it-works/` says "The first install fetches the **signed** catalog". The published pointer is unsigned. | `web/app/how-it-works/page.tsx:51` vs STATUS.md §2 (*"`/v1/current.json.sigstore.json` → 404 … the published pointer is unsigned today"*). |
| **13** | **P1** | `/package/` is a second catalog index whose first 12 rows are the corpus's least recognisable names; its metadata description describes an entry page. | `web/app/package/page.tsx:20-26`; live `/package/` shows `$AI on HyperEVM`, `$THREE Token`, `(WiP) An everything app`, `.FAF Context`, … |
| **14** | **P1** | `/security/`, `/compare/`, `/insights/`, `/agents/` and `/status/` end with no next action; `/compare/` ends on a legend. | `web/app/compare/CompareView.tsx:428-430`; `web/app/security/page.tsx` (ends "This page is part of the source."). |
| **15** | **P2** | `/about` does not exist; there is no page that says what the project is, who builds it, or why it exists. | No `web/app/about/`; the sitemap's 9 index routes contain no about. |
| **16** | **P2** | `/compare/` says "79 agents that have a skills directory"; the records say **81 skill targets**. The gap is 2 alias spellings, which the site never explains. | Live `/compare/`; `web/data/skill-targets.json` = 81; `web/data/hosts.json` = 50; `web/app/compare/compareRows.ts:215`. |
| **17** | **P2** | `/security/`'s "no upstream source publishes them" is too strong for GitHub-sourced skills, whose repos do publish stars. | `web/app/security/page.tsx:78-79`. |
| **18** | **P2** | Dormant badge labels `LiteSPM-verified` / `LiteSPM-tested` would contradict `/security/`'s "there is no 'verified by LiteSPM' badge, because LiteSPM verifies nothing" if any row ever carried those values. | `web/components/package/PackageTabs.tsx:61-68` vs `web/app/security/page.tsx:70-73`. |
| **19** | **P2** | Four stale code comments now document the opposite of the product. | `web/components/home/HowItWorks.tsx:26-28` (*"not three, because LiteSPM cannot install plugins"*); `web/components/home/DeveloperZone.tsx:17-18` (*"`litespm list` … are backlog rows"* — it exists, `cmd/litespm/main.go:196`); `web/app/compare/compareRows.ts:122-128` (*"the 8 that do accept"* — 46 do); `web/app/sitemap.ts:17-19`. |
| **20** | **P2** | `/package/<key>/` URLs are the last segment of a colon-namespaced id and are lossy: `/package/agent-rail/` renders `$AI on HyperEVM`. | Live page; `web/app/package/[slug]/page.tsx`. |
| **21** | **P2** | The site's own build gate compares the site to the **working tree**, not to the **published package** — the structural cause of P0-1. | `web/lib/installCommand.ts:29-33,147-149`. |

### 8.2 Top 5 copy/content moves (exact replacement copy)

Everything below stays inside `STATUS.md` / `AGENTS.md` and the honesty constraints. No social proof,
no download counts, no star ratings, no testimonials, no "one-click install".

---

**MOVE 1 — Fix the published-CLI mismatch before anything else (P0-1).**
*Not a copy change: a release or a copy change. Two acceptable fixes — publish 0.6.0, or change the copy.*

- **Option A (preferred, one npm publish):** tag and publish `v0.6.0` + `litespm@0.6.0` so that
  `npx --yes litespm@latest` is the binary the site describes. The site then needs no copy change and
  the `--agent` / `--all-detected` / plugin commands become true.
- **Option B (copy-only, if 0.6.0 cannot ship today):** make the site say the truth about 0.4.1 and stop
  printing flags it rejects.
  - `web/lib/installCommand.ts:133` → `export const WEBSITE_NPX_PREFIX = "npx --yes litespm@0.6.0";`
    (or `litespm@0.4.1` with the flags removed). The prefix is one constant; the whole site follows it.
  - `web/lib/installCommand.ts:167-171` → drop the ` --agent` / ` --all-detected` suffix while the
    published binary rejects it, and change the `label` at `:177-181` to
    *"Installs this exact catalog entry after local setup and catalog sync."*
  - `web/components/package/InstallBand.tsx:113-115` → replace
    *"Selected agent: {label}. The --agent option targets exactly this agent, and the plan seals the destinations before anything is written."*
    with
    *"Selected agent: {label}. Add `--agent {id}` to target this one agent. The command records the target before it writes."*
  - `web/components/marketing/WhyLiteSPM.tsx:46` → `litespm install <mcp-id> --host codex`
    (`--host` is the spelling 0.4.1 accepts, `cmd/litespm/main.go` v0.4.1 `:1393`).
  - `web/app/how-it-works/page.tsx:51` → *"…whether LiteSPM can install it, and if not, why."*
- **If the site keeps claiming plugin installs** (Option A only): `web/components/home/HowItWorks.tsx:75`
  → *"LiteSPM installs a plugin when its publisher ships one specific commit of its source — 390 of the
  638 plugins in this catalog do. The rest are refused with the reason."*

---

**MOVE 2 — One positioning, one description (P0-3).**
*Keep "The package manager for AI agents" (it is the position, it is in the `<title>`, the footer and
the hero kicker). Change everything else to match it.*

`web/app/layout.tsx`
- `:48` title — keep: `LiteSPM — The package manager for AI agents`
- `:51-52` description — replace with:
  > `A package manager for AI agents. Find, install and remove MCP servers, agent skills and plugins across 50 coding agents — from one local CLI that shows you the change before it makes it.`
- `:69-71` openGraph — use the same description as the meta description, not a shorter one:
  > `title: "LiteSPM — The package manager for AI agents"`, `description:` (same string as `:51-52`)
- `:78-79` twitter — `title: "LiteSPM — The package manager for AI agents"`,
  `description:` (same string as `:51-52`)
- `:158-160` og:image:alt — replace with the exact title string:
  > `LiteSPM — The package manager for AI agents`
- Also delete the now-false clause from the description: **"updates"** is removed in Move 3.
- `npm/package.json:4` — align: `"The package manager for AI agents — MCP servers, skills and plugins through one local bridge."`

---

**MOVE 3 — "update" → the truth (P0-2).**
Three lines, one per surface, all inside the facts of record:

- `web/components/layout/SiteFooter.tsx:36-37` →
  > `The package manager for AI agents. Find, install and remove MCP servers, skills and plugins across the agents you use — and update the skills you installed.`
- `web/components/home/LandingHero.tsx:111-114` →
  > `Discover and install MCP servers, skills and plugins across the agents you use. LiteSPM handles compatibility, setup, removal and restoration from one place.`
- `web/app/layout.tsx:51-52` (new description, Move 2) → already has no "update" verb.
  If you want to keep the word, use the precise form: *"…and update the skills it installed."*
- Optional truth-in-the-open line on the home page's third step
  (`web/components/home/HowItWorks.tsx:95-96`):
  > `What was approved, what was written and what was removed is recorded against the plan that asked for it, in a ledger on your machine. Skills update from the source that ledger recorded; MCP servers and plugins are removed and re-installed.`

---

**MOVE 4 — Make the hero answer the three questions in five seconds (P1-4, P1-5, P1-6, P1-9).**
One hero rewrite, four copy fixes.

- **H1 + kicker (`web/components/home/LandingHero.tsx:97,107-109`)** — keep the promise, put the category in the H1:
  > kicker: `For developers using Claude Code, Cursor, Codex, OpenCode or Cline`
  > H1: `The package manager for AI agents.`
  > subhead: `Install MCP servers, agent skills and plugins into the coding agent you already use — one command, one local process, and a preview of every change before it is written.`
  (This answers (a) in the H1, (b) in the kicker, and keeps (c) in the two buttons below it. It also
  removes the near-duplicate with the `<title>`, which now matches the H1.)
- **Proof number (`web/components/home/LandingHero.tsx:177-190`)** — add the one line that makes the ratio read as rigor:
  > `26,554 of 69,376 entries can be installed today. The rest are listed so you can read about them — their publishers publish no command to run, so installing one is refused with the reason.`
- **"Works with" row (`:156-171`)** — name the claim, not five logos:
  > `Works with 50 agent hosts — Claude Code, Codex, OpenCode, Cursor, Cline and 45 more`
  (the 50 is already computed in `FAQ` from `HOSTS.length`; use the same source.)
- **Step model (P1-4)** — delete one of the two. Cheapest fix: make `ProductDemo.tsx:4-10` the same three
  steps as `HowItWorks.tsx:39-101` and change `:61` from `Five simple stages` to `Three steps`, and
  change the H2 at `:58-59` from `From discovery to installation` to `From discovery to local installation`
  so the two sections stop reading like two pages.

---

**MOVE 5 — Give the honesty a voice above the fold, and give every page a next action (P1-14, 6.c).**
This is the move that converts the site's best asset from a liability into a reason to believe.

- **Under the "Featured capabilities" shelf (`web/components/home/Shelves.tsx:109-115`)** — one line,
  placed where the curated set is introduced:
  > `A curated set, not a ranking. No source in this catalog publishes install counts, so there is nothing to rank by. Every entry below tells you whether LiteSPM can install it, and says so plainly.`
- **On the entry page, next to the publisher name (`web/components/package/PlainSummary.tsx`, the
  "Who publishes it" row)** — one line:
  > `A listing is not an endorsement. LiteSPM does not host, review or run what it lists, and a badge is not a security review.`
  (already true and already written on `/security/:68-73`; move one clause of it next to the name.)
- **Every page ends with a next action.** The pages that currently end on a legend or a source link:
  - `web/app/compare/CompareView.tsx:428-430` → after `A dash means no value is recorded for that agent.`
    add: `Looking for one agent? Its own page has the exact config file and the entry LiteSPM adds. →`
  - `web/app/security/page.tsx` (end) → add: `Ready to try it? Install LiteSPM and connect one agent. →`
  - `web/app/insights/TrendingView.tsx` and `web/app/agents/AgentsView.tsx` (end) → add:
    `Browse the catalog these hosts work with. →`
  - `web/app/categories/CategoriesView.tsx` (end) → add: `Search the full catalog by name, publisher or tool. →`
  - `web/app/status/page.tsx` (end) → add: `Install the CLI and sync the same release. →`

---

### 8.3 Two structural fixes that are not copy, but are the root cause of P0-1 and P1-7

1. **Point the site's build gates at the published package, not the working tree.**
   `web/lib/installCommand.ts:29-33` and `:147-149` say the gate reads `cmd/litespm/main.go`. That file is
   0.6.0-era source nobody can `npm install`. Make the gate resolve the **published** `litespm` version's
   flag set (e.g. `npm view litespm version` → the version the `WEBSITE_NPX_PREFIX` resolves to → its
   published `bin`/help), so the site can never again publish a flag the published binary rejects.
   Without this, P0-1 recurs on every release.
2. **Add the five missing index routes to the sitemap** (`web/app/sitemap.ts:45-55`): `/how-it-works/`,
   `/get-started/`, `/security/`, `/status/`, `/support/`, and `/package/`. A crawler currently cannot
   reach the site's two most decision-critical pages.

---

*Report written read-only. No repository file was created, edited or deleted. All fetches were GETs to
public pages; the sandbox under `/tmp/opencode/audit-sandbox` is outside the repository and was used only
to install the published npm package and observe its behaviour against the live catalog origin.*
