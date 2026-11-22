# 10 — Comprehensive Competitor Profiles

**Inspection Dates:** November 20–22, 2026  
**Methodology:** Live browser inspection (Playwright Chrome desktop & mobile viewports), network traffic analysis, GitHub repository code and telemetry inspection.

---

## 1. Tier A Competitors (Direct & High-Priority)

### A1. Vercel Skills / Skills.sh
* **Website:** [https://skills.sh/](https://skills.sh/) | **Repository:** [vercel-labs/skills](https://github.com/vercel-labs/skills) (40,422 Stars)
* **Target Audience:** Next.js developers, full-stack engineers, Claude Code and Cursor users.
* **Value Proposition:** "The open agent skills tool — npx skills add."
* **Visual & UX Polish:** Exceptional minimalism. Dark mode, monospace leaderboard ranking, live GitHub avatar icons, clean search filter.
* **Onboarding & Execution:** Unbeatable first-run simplicity (`npx skills add <source>`). Executes immediately via npx without pre-installing a daemon.
* **Agent Support:** Supports ~10 coding agents (Claude Code, Cursor, Copilot, etc.).
* **Key Strengths:** Massive community mindshare, zero-install execution, viral leaderboard distribution.
* **Key Weaknesses:** **Skills-only.** Cannot install or configure MCP servers, cannot manage API endpoints, has no rollback transaction engine, no configuration diff preview.
* **Actionable Lesson for LiteSPM:** Simplify the first-run installation prompt; introduce a "Trending Skills Leaderboard" tab modeled after Skills.sh.

---

### A2. add-mcp
* **Website:** [https://add-mcp.com/](https://add-mcp.com/) | **Repository:** [neon-solutions/add-mcp](https://github.com/neon-solutions/add-mcp) (328 Stars)
* **Target Audience:** Developers seeking a quick way to wire MCP servers into Cursor, Windsurf, or Claude.
* **Value Proposition:** "The open MCP config tool — npx add-mcp <name>."
* **Visual & UX Polish:** Spartan minimalism. Monochrome typography, quick registry browser (`/registry`), copy-paste terminal commands.
* **Onboarding & Execution:** Straightforward `npx add-mcp postgres`. Asks interactive CLI questions for required environment variables.
* **Agent Support:** Supports ~30 agent config paths.
* **Key Strengths:** Fast single-server installation without background processes.
* **Key Weaknesses:** **MCP-only.** No skill or plugin support. No CAS storage, no transactional ledger, no atomic `restore`, and no in-agent bridge tools.
* **Actionable Lesson for LiteSPM:** LiteSPM's wizard is more robust, but `litespm install <name>` must make interactive environment variable prompts as intuitive as `add-mcp`.

---

### A3. Microsoft Agent Package Manager (APM)
* **Website:** [https://microsoft.github.io/apm/](https://microsoft.github.io/apm/) | **Repository:** [microsoft/apm](https://github.com/microsoft/apm) (4,432 Stars)
* **Target Audience:** Enterprise engineering organizations, Azure AI developers, platform teams.
* **Value Proposition:** Enterprise governance, reproducible agent package manifests (`apm.lock`), and CI validation.
* **Visual & UX Polish:** Microsoft Learn documentation style. Formal, structural, enterprise-focused.
* **Onboarding & Execution:** Manifest-based package declaration (`apm install`).
* **Agent Support:** Focused on Microsoft Semantic Kernel, GitHub Copilot, and Azure Agent Services.
* **Key Strengths:** Corporate backing, lockfile determinism (`apm.lock`), enterprise compliance policies.
* **Key Weaknesses:** High friction for everyday developers using Cursor or Claude Code. Lacks an open community marketplace; complex manifest authoring.
* **Actionable Lesson for LiteSPM:** LiteSPM should adopt an explicit `litespm.lock` export command to satisfy enterprise teams seeking reproducible agent environments.

---

### A4. Glama MCP
* **Website:** [https://glama.ai/mcp/servers](https://glama.ai/mcp/servers)
* **Target Audience:** Developers discovering MCP servers, prompt engineers, agent tool builders.
* **Value Proposition:** The largest open-source MCP registry (125,000+ servers indexed).
* **Visual & UX Polish:** World-class web design. Deep dark mode, custom 3D polygonal branding, rich visual cards, detailed tool schema visualizers.
* **Search & Discovery:** Instant faceted search with categories, GitHub star badges, commit recency, and download metrics.
* **Agent Support:** Pure discovery directory; outputs raw JSON configuration snippets that users must manually paste into agent configs.
* **Key Strengths:** Massive catalog indexing, excellent SEO architecture, rich visual inspection of exposed tool functions.
* **Key Weaknesses:** **Zero local management.** Glama cannot install tools, configure hosts, manage keys, or handle rollbacks.
* **Actionable Lesson for LiteSPM:** LiteSPM should enhance its package detail pages by displaying exposed tool function signatures (`tools/list` schema preview), bridging Glama's visual discovery with LiteSPM's native installation power.

---

### A5. MCP.so
* **Website:** [https://mcp.so/](https://mcp.so/)
* **Target Audience:** General developer community, indie hackers, Claude/Cursor users.
* **Value Proposition:** Curated community directory of MCP servers, collections, and tutorials.
* **Visual & UX Polish:** Modern consumer-tech aesthetics. Clean grid, community upvoting counters, prominent category tags.
* **Key Strengths:** Clean categorization (Browser Automation, Database, Search, Social, AI).
* **Key Weaknesses:** Static directory; no automated CLI installer, no host configuration automation, no atomic rollback.
* **Actionable Lesson for LiteSPM:** Adopt MCP.so's friendly category landing sections for curated discovery.

---

## 2. Tier B Competitors (Adjacent Marketplaces & Toolkits)

### B1. skilld (`skilld.dev`)
* **Focus:** Visual interactive testing of agent skills.
* **Observation:** Beautiful modern aesthetics, 1-click prompt copying. Focuses purely on portable prompts rather than executable tool binaries.

### B2. AI Templates (`aitmpl.com`)
* **Focus:** Pre-composed Claude Code slash commands, agent prompts, and MCP configurations.
* **Observation:** Good concept of "bundles" and "starter kits", highly relevant to LiteSPM's `/bundles` feature.

### B3. PRPM (`prpm.dev`)
* **Focus:** Universal prompt and rules package manager (Cursor rules, Claude system prompts).
* **Observation:** Bridges prompt engineering with package management semantics; lacks binary tool installation.

### B4. Smithery (`smithery.ai`)
* **Focus:** MCP registry and hosted execution gateway (now part of Arcade).
* **Observation:** Pivoting toward hosted, cloud-mediated tool execution rather than local host configuration.

### B5. Docker MCP Catalog and Toolkit
* **Focus:** Containerized, sandboxed execution of MCP servers via Docker Desktop.
* **Observation:** Provides kernel-level process isolation, addressing enterprise security concerns about untrusted third-party MCP code.

### B6. PSPM (`pspm.dev`)
* **Focus:** Python-centric skill and package manager.
* **Observation:** Niche developer audience; limited ecosystem coverage compared to LiteSPM.

### B7. Skillbase (`skillbase.space`)
* **Status:** Inaccessible / Offline (`net::ERR_CONNECTION_CLOSED` during live audit). Demonstrates the fragility of unmaintained community side-projects.

---

## 3. Tier C Competitors (Repository-Only CLI Tools)

* **`supermemoryai/install-mcp` (197 Stars):** Single-purpose CLI for installing MCP servers with OAuth/auth brokers. Proves developer appetite for automated credentials.
* **`ahmadawais/add-skill` (1 Star):** Early conceptual repository for skill installation.
