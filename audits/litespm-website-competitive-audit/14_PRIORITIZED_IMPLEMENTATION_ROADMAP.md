# 14 — Prioritized Implementation Roadmap & Engineering Backlog

**Release Target:** LiteSPM Public Launch (v0.6.1+)  
**Engineering Capacity:** 1–2 Full-Stack Engineers & 1 Product Designer  
**Classification:** P0 (Launch Blockers), P1 (High-Impact Fast Follows), P2 (Competitive Parity), P3 (Refinements)

---

## 1. Phase 1: Launch Blockers (P0 — Immediate, Days 1–3)

### P0-1: Synchronize Published NPM Package with Repository (`v0.6.1`)
* **Problem:** Documentation mentions features (`skills use`, `adopt`, `plugin install`) implemented in repo `v0.6.1` while npm serves `v0.6.0`.
* **Action:** Run `scripts/build-release.sh`, execute Sigstore keyless signing, and publish `litespm@0.6.1` to npm.
* **Estimate:** 0.5 Day.
* **Acceptance Criteria:** `npm view litespm version` returns `0.6.1`; `npm install -g litespm` installs binary supporting all documented commands.

### P0-2: Fix Homepage Collapsed Accordion Accessibility Names (LSPM-001)
* **Problem:** 8 buttons inside `<details>` disclosures fail WCAG computation when collapsed.
* **Action:** Add explicit `aria-label={`Configure ${agent.name}`}` in `home.tsx:805`.
* **Estimate:** 0.25 Day.
* **Acceptance Criteria:** Automated Playwright a11y scan returns 0 button name errors.

### P0-3: Restructure Above-the-Fold Hero Copy
* **Problem:** Jargon-dense hero text causes cognitive overload within first 5 seconds.
* **Action:** Implement recommended hero copy: *"The Package Manager for AI Agents. Install, configure, and safely rollback MCP servers, skills, and plugins across Cursor, Claude Code, and 50+ AI agents."*
* **Estimate:** 0.25 Day.
* **Acceptance Criteria:** Clear, outcome-oriented messaging visible above the fold on all viewports.

---

## 2. Phase 2: High-Impact Experience Polish (P1 — Days 4–10)

### P1-1: Package Detail Slug Alias & Fuzzy Redirect Handler (LSPM-003)
* **Problem:** Navigating to intuitive URLs like `/package/github` or `/package/mcp-server-git` triggers 404.
* **Action:** In `web/src/app/api/litespm/package/[key]/route.ts`, if exact key not found, lookup by `slug` or normalized name and issue a 301 redirect.
* **Estimate:** 1 Day.
* **Acceptance Criteria:** `/package/github` cleanly redirects to `/package/mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server`.

### P1-2: Interactive Configuration Diff Simulator on Homepage
* **Problem:** Users cannot visualize what "surgical JSONC splicing" means.
* **Action:** Build a visual interactive split-pane component in `web/src/components/litespm/` demonstrating comments preserved during MCP injection.
* **Estimate:** 2 Days.
* **Acceptance Criteria:** Interactive tool switcher updates diff in real-time with zero backend latency.

### P1-3: Installed Tab "Interactive Sandbox Mode" on Web (LSPM-004)
* **Problem:** Web shows inactive "CLI Unavailable" box.
* **Action:** Display a toggleable Interactive Demo demonstrating 3 sample installed tools with visual `litespm remove` simulation.
* **Estimate:** 1.5 Days.
* **Acceptance Criteria:** Visitors can click "Simulate Uninstall" to see surgical node removal in action.

### P1-4: Edge Caching for Marketplace Facets to Fix LCP (LSPM-007)
* **Problem:** LCP on `/marketplace` is 1,568ms due to dynamic category count compute.
* **Action:** Pre-compute facet counts into static JSON chunk (`bundles.json` / `counts.json`) during build.
* **Estimate:** 1 Day.
* **Acceptance Criteria:** FCP and LCP on `/marketplace` drop below 900ms.

---

## 3. Phase 3: Competitive Parity & Discovery (P2 — Days 11–20)

### P2-1: Tool JSON Schema Explorer on Package Detail Pages
* **Problem:** Glama displays tool schemas; LiteSPM currently displays text summaries.
* **Action:** Parse and render cached tool function declarations and input argument tables on package detail pages.
* **Estimate:** 2 Days.
* **Acceptance Criteria:** Detail page renders expandable list of tools with parameter types.

### P2-2: "Trending Capabilities" Community Leaderboard View
* **Problem:** Skills.sh wins on viral leaderboard browsing.
* **Action:** Add a "Trending" filter tab on `/marketplace` sorted by recent telemetry and verified badges.
* **Estimate:** 1.5 Days.
* **Acceptance Criteria:** Displays top 20 trending tools with weekly movement arrows.

### P2-3: Web-to-Agent OS Protocol Handler (`litespm://`)
* **Problem:** Window switching friction between web and terminal.
* **Action:** Register custom protocol handler in native CLI binary installer.
* **Estimate:** 3 Days.
* **Acceptance Criteria:** Clicking "1-Click Install" in browser launches local terminal executing `litespm install <id>`.

---

## 4. Phase 4: Long-Term Enhancements (P3 — Post-Launch)

* **P3-1: Automated Publisher GitHub Action (`litespm-publish-action`):** 3 Days.
* **P3-2: Upstream GitHub Stars Telemetry Sync:** 2 Days.
* **P3-3: Opt-In Reproducible Lockfile Export (`litespm export lockfile`):** 2 Days.
