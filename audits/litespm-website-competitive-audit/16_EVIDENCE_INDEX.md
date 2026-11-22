# 16 — Evidence Index: Artifacts, Logs, Measurements & Code References

**Audit Target:** LiteSPM Public Website & Cross-Ecosystem Competitors  
**Repository Working Directory:** `c:\Users\Sonali\Desktop\projectwork\business_Dev\liteSPM`  
**Audit Deliverable Root:** `audits/litespm-website-competitive-audit/`

---

## 1. Visual Screenshot Evidence Register

All full-page screenshots were captured using automated Playwright Chrome instances at standard viewports (Desktop 1440x900, Mobile 375x667, and responsive breakpoints).

### 1.1 LiteSPM Live Website Screenshots
* **Homepage Across Viewports:**
  * `screenshots/litespm_home_mobile_320.png` (320x640, 242 KB) — Ultra-compact mobile inspection.
  * `screenshots/litespm_home_mobile_375.png` (375x667, 243 KB) — Standard iPhone portrait layout.
  * `screenshots/litespm_home_tablet_768.png` (768x1024, 318 KB) — iPad portrait grid layout.
  * `screenshots/litespm_home_desktop_1024.png` (1024x768, 281 KB) — Small laptop / tablet landscape.
  * `screenshots/litespm_home_desktop_1440.png` (1440x900, 323 KB) — Standard desktop layout.
  * `screenshots/litespm_home_desktop_1920.png` (1920x1080, 330 KB) — Large monitor max-width container.
* **Core Application Routes:**
  * `screenshots/litespm_marketplace_1440.png` (1440x900, 211 KB) — Marketplace root & 4 tabs.
  * `screenshots/litespm_bundles_1440.png` (1440x900, 383 KB) — Curated tool bundles view.
  * `screenshots/litespm_agents_1440.png` (1440x900, 740 KB) — Complete 52 agent host adapter grid.
  * `screenshots/litespm_agent_cline_1440.png` (1440x900, 95 KB) — Cline agent detail & setup config paths.
  * `screenshots/litespm_package_github_1440.png` (1440x900, 144 KB) — GitHub MCP Server detail page.
  * `screenshots/litespm_package_claude_skill_1440.png` (1440x900, 142 KB) — Claude API Skill prompt preview.
  * `screenshots/litespm_compare_1440.png` (1440x900, 39 KB) — Side-by-side package comparator.
  * `screenshots/litespm_docs_1440.png` (1440x900, 86 KB) — Documentation hub and command reference.
  * `screenshots/litespm_insights_1440.png` (1440x900, 138 KB) — Catalog telemetry and analytics.
  * `screenshots/litespm_search_query_github.png` — Real-time search filter execution.

### 1.2 Competitor Website Screenshots
* **Tier A Competitors:**
  * `screenshots/comp_skills_sh_desktop_1440.png` (337 KB) & `comp_skills_sh_mobile_375.png` (242 KB) — Vercel Skills.sh.
  * `screenshots/comp_add_mcp_desktop_1440.png` (55 KB) & `comp_add_mcp_mobile_375.png` (51 KB) — add-mcp homepage.
  * `screenshots/comp_add_mcp_registry_desktop_1440.png` (136 KB) & `comp_add_mcp_registry_mobile_375.png` (140 KB) — add-mcp registry.
  * `screenshots/comp_microsoft_apm_desktop_1440.png` (107 KB) & `comp_microsoft_apm_mobile_375.png` (98 KB) — Microsoft APM.
  * `screenshots/comp_glama_desktop_1440.png` (1,752 KB) & `comp_glama_mobile_375.png` (1,834 KB) — Glama MCP registry.
  * `screenshots/comp_mcp_so_desktop_1440.png` (505 KB) & `comp_mcp_so_mobile_375.png` (442 KB) — MCP.so marketplace.
* **Tier B Competitors:**
  * `screenshots/comp_skilld_desktop_1440.png` & `comp_skilld_mobile_375.png` (306 KB) — skilld.dev.
  * `screenshots/comp_aitmpl_desktop_1440.png` (69 KB) & `comp_aitmpl_mobile_375.png` (18 KB) — AI Templates.
  * `screenshots/comp_prpm_desktop_1440.png` (527 KB) & `comp_prpm_mobile_375.png` (337 KB) — PRPM.
  * `screenshots/comp_smithery_desktop_1440.png` (62 KB) & `comp_smithery_mobile_375.png` (17 KB) — Smithery / Arcade.
  * `screenshots/comp_docker_mcp_desktop_1440.png` (538 KB) & `comp_docker_mcp_mobile_375.png` (274 KB) — Docker MCP Catalog.
  * `screenshots/comp_pspm_desktop_1440.png` (451 KB) & `comp_pspm_mobile_375.png` — PSPM package manager.

---

## 2. Machine-Readable Measurement Logs

* **`measurements/litespm_audit_results.json`:**
  * Contains exact Web Vitals (FCP, DOMContentLoaded, transfer size), page titles, headings, console errors, and failed network logs across all core routes.
* **`measurements/competitors_audit.json`:**
  * Structured timing, status codes, hero H1s, meta descriptions, and code snippets captured across all 12 competitors.
* **`measurements/litespm_a11y_results.json`:**
  * Automated WCAG 2.2 AA inspection results across all page templates.

---

## 3. Confirmed Source Code References

* `cmd/litespm/main.go:3176-3270` — Daemon startup, crash recovery journal check, IPC listener binding.
* `cmd/litespm/wizard.go:8-22` — Interactive setup wizard invariants and surgical merge previews.
* `cmd/litespm/install_plugin.go:27-32` — Partial plugin install refusal with `LPSM-INSTALL-PARTIAL`.
* `cmd/litespm/skills_use.go:28-33` — Intentional refusal of `--agent` on `skills use` with honest explanation.
* `internal/bridge/shim.go:72-120` — 13 canonical MCP tools and cold daemon connection management.
* `internal/host/registry.go` & `targets_data.go` — The 52 agent host adapter registry.
* `internal/host/jsonc_merge.go` — Surgical comment-preserving JSON/JSONC AST splicer.
* `internal/secrets/store_windows.go` & `store_darwin.go` — OS native credential vault integrations.
* `npm/scripts/install-binary.js:41-84` — Cryptographic Sigstore / Fulcio verification tied to GitHub Actions OIDC.
* `web/src/app/api/litespm/assistant/route.ts:49-58` — Prompt injection sanitization filter.
* `web/src/app/api/litespm/installed/route.ts:19-35` — Local CLI availability detection on web.
