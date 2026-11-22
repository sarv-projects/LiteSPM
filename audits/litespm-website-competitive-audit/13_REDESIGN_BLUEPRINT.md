# 13 — Website Redesign Blueprint & Design System Architecture

**Target Scope:** Global Layout, Homepage, Marketplace, Package Detail, and Interactive Sandbox Components.

---

## 1. Homepage Wireframe & Information Hierarchy Blueprint

```text
┌────────────────────────────────────────────────────────────────────────┐
│ [HEADER] Logo (LiteSPM) | Marketplace | Bundles | Agents | Docs  [Cmd+K]│
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                              [HERO SECTION]                            │
│                  "THE PACKAGE MANAGER FOR AI AGENTS"                   │
│    One command to install, configure, and safely rollback MCP servers, │
│    skills, and plugins across Cursor, Claude Code, and 50+ AI agents.  │
│                                                                        │
│          ┌──────────────────────────────────────────────────┐          │
│          │  npm install -g litespm                       📋 │          │
│          └──────────────────────────────────────────────────┘          │
│              [Browse Marketplace]   [View Architecture]                │
│                                                                        │
│       Verified on: Cursor · Claude Code · Codex · Pi · OpenCode +47    │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│                        [INTERACTIVE DIFF SIMULATOR]                    │
│    "See what LiteSPM changes before you install. Always reversible."   │
│  ┌──────────────────────────────┬───────────────────────────────────┐  │
│  │ Original config.json         │ LiteSPM Surgical Injection (Diff) │  │
│  │ {                            │ {                                 │  │
│  │   // My custom settings      │   // My custom settings (KEPT!)   │  │
│  │   "model": "claude-3-5-sonnet│   "model": "claude-3-5-sonnet",   │  │
│  │ }                            │ + "mcpServers": {                 │  │
│  │                              │ +   "postgres": { ... }           │  │
│  │                              │ + }                               │  │
│  │                              │ }                                 │  │
│  └──────────────────────────────┴───────────────────────────────────┘  │
│      [Simulate Postgres Install]   [Simulate 1-Click Rollback (Undo)]   │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│                     [TRENDING CAPABILITIES LEADERBOARD]                │
│    ┌───────────────────────────┬───────────────────────────┐           │
│    │ 🔥 Top MCP Servers        │ ⚡ Trending Agent Skills  │           │
│    │ 1. GitHub MCP             │ 1. Claude API Architect   │           │
│    │ 2. PostgreSQL Adapter     │ 2. Web Design Guidelines  │           │
│    │ 3. Firecrawl Web Scraper  │ 3. TypeScript Pro Senior  │           │
│    │ 4. Docker MCP Toolkit     │ 4. Python UV Manager      │           │
│    └───────────────────────────┴───────────────────────────┘           │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│                     [THE LITESPM TRIFECTA (CORE PILLARS)]              │
│    ┌─────────────────────┬────────────────────┬────────────────────┐   │
│    │ 52 Agent Adapters   │ Atomic Rollbacks   │ Zero Data Leaks    │   │
│    │ Configures every    │ Every write backed │ DPAPI & Keychain   │   │
│    │ tool automatically. │ up. Run `restore`. │ local OS storage.  │   │
│    └─────────────────────┴────────────────────┴────────────────────┘   │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ [FOOTER] Architecture · Security · Documentation · GitHub · Apache 2.0 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Marketplace Page Redesign Blueprint

### 2.1 The Two-Column Filter Rail & Grid Layout
* **Left Rail (Desktop 1440px, 260px Width):**
  * **Search Input:** Sticky top filter bar with real-time debounce (150ms).
  * **Kind Selector:** Radio pill toggles: `All` | `MCP Servers` | `Skills` | `Plugins`.
  * **Agent Host Compatibility Filter:** Multi-select dropdown filtering only tools compatible with the user's specific host (e.g. "Show tools for Cursor").
  * **Transport Filter:** `stdio` | `Streamable HTTP / Remote`.
  * **Verification Filter:** Toggle `Verified Publishers Only`.
* **Main Area (Grid):**
  * **Active Filter Chips:** Quick dismissable badges showing active query parameters.
  * **Results Meta:** "Showing 24 of 48,418 MCP Servers (42ms)".
  * **Card Enhancements:**
    * Include direct tool function badges (e.g. `+5 Tools: search, create_pr, list_repos`).
    * Clear `stdio` vs `remote` transport indicator.
    * 1-Click copy command with animated checkmark feedback.

---

## 3. Package Detail Page Redesign Blueprint

### 3.1 Header & Installation Action Bar
* Large display title, verified badge, package kind chip, and upstream source link.
* Hero install box:
  ```bash
  litespm install github
  ```
* Secondary tab bar:
  1. **Overview & Description:** Stated package purpose and prerequisites.
  2. **Exposed Tools & Schema:** Interactive list of tools exposed by the MCP server with JSON argument schemas.
  3. **Host Configuration Preview:** Tabs showing what the configuration snippet looks like in Cursor, Claude Code, Pi Agent, and Codex.
  4. **Security & Permissions:** Declared environment variables (`GITHUB_PERSONAL_ACCESS_TOKEN`) and execution transport.

---

## 4. Design System Tokens & Polish Specs

* **Border Radius:** Standardize on modern subtle curvature:
  * Cards: `rounded-2xl` (16px).
  * Buttons / Inputs: `rounded-xl` (12px).
  * Badges / Tags: `rounded-full` (9999px).
* **Card Border Hierarchy:**
  * Default state: `border border-border/60 bg-card/70`.
  * Hover state: `border-brand/40 bg-card/90 shadow-lg shadow-brand/5`.
* **Motion & Transitions:**
  * Interactive elements use `transition-all duration-150 ease-out`.
  * Copy button feedback: 1.5s checkmark animation before reverting to copy icon.
  * Command palette (`Cmd+K`): Instant mount with backdrop blur (`backdrop-blur-md`).
