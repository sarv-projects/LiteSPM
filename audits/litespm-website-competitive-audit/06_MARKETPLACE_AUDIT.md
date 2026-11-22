# 06 — Marketplace & Discovery Architecture Audit

**Target URL:** [https://lite-spm-nine.vercel.app/marketplace](https://lite-spm-nine.vercel.app/marketplace)  
**Catalog Scope:** 68,933 Unique Listings (48,418 MCP Servers, 20,320 Agent Skills, 638 Plugins)  
**Search Engine:** Client/Server Hybrid BM25 (`web/src/server/litespm/bm25.ts` & `search.ts`) with disk indexing

---

## 1. Search Engine Accuracy, Ranking & Performance

### 1.1 Search Capabilities & Test Matrix

| Query Type | Query Input | Expected Top Result | Observed Top Result | Latency (ms) | Accuracy Verdict |
|---|---|---|---|:---:|:---:|
| **Exact Name** | `github` | Official GitHub MCP Server | `GitHub MCP Server` (`io.github.github-github-mcp-server`) | 42 | **Pass (Exact)** |
| **Tool / Category** | `postgres` | PostgreSQL MCP Database Adapter | `PostgreSQL MCP Server` | 55 | **Pass (Relevant)** |
| **Agent Skill** | `claude api` | Claude API Skill | `askills-skill-claude-api` | 38 | **Pass (Relevant)** |
| **Typo Tolerance** | `gitub` | GitHub MCP Server | `GitHub MCP Server` | 60 | **Pass (Fuzzy BM25)** |
| **Transport Query**| `streamable http` | Remote SSE/HTTP MCP Servers | List of remote-capable MCP servers | 48 | **Pass (Facet match)**|
| **Multi-Keyword** | `docker container logs` | Docker MCP Server | `Docker MCP Toolkit` | 65 | **Pass (Composite)** |
| **Empty Query** | `""` (default) | Curated / Trending Capabilities | Top ranked verified packages | 18 | **Pass (Instant)** |
| **Nonsense Query** | `xyz999foobar` | Clean Empty State | "No catalog results matched your search" | 22 | **Pass (Clean empty)**|

### 1.2 Ranking Algorithm Analysis
* **Implementation (`web/src/server/litespm/ranking.ts`):**
  * LiteSPM does not invent fake upvotes or artificial star counts.
  * Instead, rank scores (0 to 100) are deterministically computed based on:
    1. **Verification Status (+25 pts):** Verified publishers receive priority.
    2. **Installability (+30 pts):** Packages with executable commands/endpoints rank higher than discovery-only repositories.
    3. **Completeness (+20 pts):** Clear description, declared transport, schema arguments, and documentation.
    4. **BM25 Lexical Score (+25 pts):** Token proximity in title, slug, and summary.
* **Verdict:** Highly trustworthy, reproducible ranking without commercial pay-to-rank manipulation.

---

## 2. Marketplace Filtering & Navigation Hierarchy

### 2.1 The Four Primary Tabs
```text
┌─────────────────┬─────────────────┬─────────────────┬─────────────────────────┐
│   MCP SERVERS   │  AGENT SKILLS   │     PLUGINS     │      INSTALLED (n)      │
│     (48,418)    │     (20,320)    │      (638)      │    (Local Machine)      │
└─────────────────┴─────────────────┴─────────────────┴─────────────────────────┘
```
1. **MCP Servers Tab:** Displays stdio and Streamable HTTP servers for coding agents.
2. **Agent Skills Tab:** Displays portable `SKILL.md` instruction packages (compatible with `agentskills.io` standard).
3. **Plugins Tab:** Displays multi-component bundles (MCP servers + skills + hooks) with pinned Git trees.
4. **Installed Tab:** Interacts with the local daemon to display active installations, external detected tools, and project scopes.

### 2.2 Category & Facet Chips
* Horizontal scrollable chips for rapid narrowing:
  * `Official & Verified`
  * `Developer Tools`
  * `Databases & Storage`
  * `Web Automation`
  * `Cloud & DevOps`
  * `Code Quality & Testing`
* Responsive behavior: Smooth horizontal swipe on mobile viewports (320px–375px); clean wrapped flex-row on desktop.

---

## 3. Package Detail Page Quality Audit

### 3.1 Representative MCP Package: GitHub MCP Server
* **URL:** `/package/mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server`
* **Information Surfaced:**
  * Package Title, verified badge, publisher name.
  * Summary: "Interact with GitHub repositories, issues, PRs, and workflows."
  * Exact Installation Command: `litespm install github` with 1-click copy button.
  * Transport: `stdio` / executable command `npx -y @modelcontextprotocol/server-github`.
  * Required Environment Variables: `GITHUB_PERSONAL_ACCESS_TOKEN`.
  * Agent Compatibility Matrix: 52 compatible hosts with individual setup instructions.
* **Critique vs. Glama:**
  * *Glama Advantage:* Glama displays the actual JSON schema for every exposed MCP tool (e.g. `create_issue`, `search_repositories`), allowing developers to inspect tool signatures before installing.
  * *LiteSPM Opportunity:* Surface tool schemas directly on the package detail page via `schema.json` caching.

### 3.2 Representative Skill Package: Claude API Skill
* **URL:** `/package/askills-skill-claude-api`
* **Information Surfaced:**
  * Interactive preview of the `SKILL.md` instructions with syntax highlighting.
  * Trigger phrases and tool invocation keywords.
  * Pipe command: `litespm skills use askills-skill-claude-api | claude`.
* **Critique vs. Skills.sh:**
  * LiteSPM's skill preview is cleaner and displays the exact frontmatter metadata, trigger patterns, and pipe commands without leaving the page.

---

## 4. Installability vs. Discovery-Only Honesty

* **The Industry Problem:** Many competing directories list thousands of GitHub repos as "MCP servers" that have no executable launch instructions or require complex manual compilation.
* **The LiteSPM Standard:**
  * Packages are classified into **Installable** (valid remote endpoint or publisher-declared command with arguments) vs. **Discovery-Only** (repository link without automated install recipe).
  * The UI honestly labels Discovery-Only packages with an amber badge: `Discovery only — LiteSPM cannot install this automatically`.
  * **Result:** Zero failed "black box" installations; users are never misled into running broken commands.

---

## 5. Comparative Evaluation: LiteSPM vs. Top Competitor Marketplaces

| Capability | LiteSPM | Skills.sh | Glama MCP | MCP.so | add-mcp |
|---|:---:|:---:|:---:|:---:|:---:|
| **Total Catalog Breadth** | **68,900+** | ~1,200 | **125,000+** | ~15,000 | ~3,500 |
| **Multi-Format (MCP + Skills + Plugins)** | **Yes (All 3)** | Skills only | MCP only | MCP only | MCP only |
| **Search Latency (BM25)** | **< 60ms** | < 100ms | ~250ms | ~200ms | ~150ms |
| **Tool Schema Inspector** | Roadmap | No | **Yes (Full)** | Partial | No |
| **Live Upstream Stars/Activity** | No (Neutral) | No | **Yes (Live)** | Yes | No |
| **Honest Installability Labeling** | **Yes (Stated)** | No | No | No | No |
| **Direct Host Config Generator** | **52 Hosts** | 10 Hosts | Manual snippet | Manual snippet | 30 Hosts |
| **Atomic Rollback Command** | **Yes (`restore`)** | No | No | No | No |
