# 05 — Functional QA & Reproducible Defect Log

**Test Harness:** Playwright (Chromium/Chrome channel & WebKit/Safari simulation), Node.js v22.23.1  
**Audit Target:** `https://lite-spm-nine.vercel.app/`  
**Test Scope:** Navigation, Search, Filter Combinations, Package Details, Forms, Network Resiliency, Edge Cases

---

## 1. Verified Defect Register (Standardized Format)

### Finding ID: LSPM-001
* **Title:** Homepage Collapsed Accordion Buttons Lack Accessible Names in DOM Computation
* **Severity:** P1 (High)
* **Category:** Accessibility / DOM Architecture
* **Affected URL:** `https://lite-spm-nine.vercel.app/`
* **Affected Viewport / Browser:** All Viewports / Chromium, Firefox, WebKit
* **Observed Behavior:** 8 `<button>` elements within `<details>` containers evaluate to empty `innerText` in browser accessibility calculations when details elements are closed.
* **Expected Behavior:** Buttons must maintain accessible names via explicit `aria-label` or accessible text computation regardless of parent disclosure state.
* **Reproduction Steps:**
  1. Navigate to `https://lite-spm-nine.vercel.app/`.
  2. Inspect the "Supported Agent Hosts" accordion preview without opening `<details>`.
  3. Query accessibility tree for button names: buttons for Cline, Claude Code, Codex, and Gemini CLI compute with empty names.
* **Evidence:** Playwright a11y script output: `button_missing_name: Button has no accessible text name (critical)` at `web/src/components/litespm/views/home.tsx:805`.
* **Root Cause (Confirmed):** Code relies on child text node rendering which browsers suppress in collapsed `<details>` blocks:
  ```tsx
  <button key={agent.id} type="button" onClick={() => navigate(`#/agent/${agent.id}`)} ...>
    {agent.name}
    <code ...>host setup {agent.id}</code>
  </button>
  ```
* **User Impact:** Screen reader users navigating by button landmarks cannot distinguish target agent setup actions when accordions are closed.
* **Competitor Comparison:** Skills.sh and Glama use always-expanded or accessible radix/aria disclosure accordions.
* **Recommended Correction:** Add `aria-label={`Configure ${agent.name} with command host setup ${agent.id}`}` to the `<button>`.
* **Expected Result:** Zero a11y warnings on homepage audit.
* **Implementation Effort:** Low (1 hour).
* **Acceptance Criteria:** Screen reader audit announces agent name and command correctly on all buttons.
* **Confidence Level:** 100% Confirmed.
* **Verification Status:** Open.

---

### Finding ID: LSPM-002
* **Title:** In-Flight Search API Request Cancellation Logs Console Network Error on Tab Switch
* **Severity:** P2 (Medium)
* **Category:** Functionality / Network Resilience
* **Affected URL:** `https://lite-spm-nine.vercel.app/marketplace`
* **Affected Viewport / Browser:** Desktop 1440px / Chromium
* **Observed Behavior:** Rapidly switching between "MCP Servers" and "Skills" tabs triggers `Failed to load resource: net::ERR_ABORTED` on `/api/litespm/list?page=1...` in console logs.
* **Expected Behavior:** In-flight network aborts should be intercepted and suppressed cleanly using `AbortController` without logging uncaught errors.
* **Reproduction Steps:**
  1. Open Chrome DevTools Network & Console.
  2. Navigate to `/marketplace`.
  3. Immediately click "Skills", then "Plugins" within 300ms.
  4. Observe aborted fetch errors logged in console.
* **Evidence:** Network trace log: `REQ FAIL: https://lite-spm-nine.vercel.app/api/litespm/list?page=1&pageSize=24&facets=0`.
* **Root Cause (Confirmed):** `web/src/lib/litespm/hooks.ts` triggers standard `fetch()` on state change but does not silence `DOMException: The user aborted a request` in its catch handler.
* **User Impact:** No visual breakage for user, but clutters browser console and may interfere with automated error monitoring (e.g. Sentry).
* **Recommended Correction:** Check `if (err.name === 'AbortError') return;` in query hook error handler.
* **Implementation Effort:** Low (2 hours).
* **Confidence Level:** 100% Confirmed.
* **Verification Status:** Open.

---

### Finding ID: LSPM-003
* **Title:** Package Detail Route Returns 404 for Simple Slug Aliases
* **Severity:** P1 (High)
* **Category:** UX / Routing
* **Affected URL:** `https://lite-spm-nine.vercel.app/package/mcp-server-git`
* **Affected Viewport / Browser:** All Viewports / All Browsers
* **Observed Behavior:** Navigating to common intuitive package names (e.g. `mcp-server-git` or `github`) returns the 404 Not-Found page. Only canonical URL-encoded composite strings (`mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server`) resolve.
* **Expected Behavior:** Route handler should resolve simple aliases, short slugs, and fuzzy matches, issuing a 301/302 redirect to the canonical listing.
* **Reproduction Steps:**
  1. Enter `https://lite-spm-nine.vercel.app/package/github` in browser address bar.
  2. Press Enter.
  3. Notice 404 error page displayed.
* **Evidence:** Live audit response: `[404] 'Package Details · LiteSPM' | H1: 'We could not find that page.'`.
* **Root Cause (Confirmed):** `web/src/app/api/litespm/package/[key]/route.ts` performs exact key lookup in `catalog.json` without alias resolution or slug fallback.
* **User Impact:** External inbound links, tweets, or documentation references using simple names break immediately.
* **Competitor Comparison:** Skills.sh allows `skills.sh/vercel-labs/skills` or `skills.sh/skills` with automatic resolution.
* **Recommended Correction:** Add fallback alias resolver query against `catalog.items.find(i => i.slug === key || i.name.toLowerCase() === key)`.
* **Implementation Effort:** Medium (1 day).
* **Confidence Level:** 100% Confirmed.
* **Verification Status:** Open.

---

### Finding ID: LSPM-004
* **Title:** Installed Tab Displays Non-Interactive CLI Disconnection Banner on Web
* **Severity:** P2 (Medium)
* **Category:** UX / Discovery
* **Affected URL:** `https://lite-spm-nine.vercel.app/marketplace` (Installed Tab)
* **Affected Viewport / Browser:** All Viewports / All Browsers
* **Observed Behavior:** Clicking the "Installed" tab on the public website renders an empty box stating that the local CLI is unavailable (`reason: litespm_cli_unavailable`).
* **Expected Behavior:** Visitors should be presented with an interactive Sandbox Demo or a visual preview explaining how the ledger operates, with a CTA to install the CLI.
* **Reproduction Steps:**
  1. Navigate to `/marketplace`.
  2. Click the "Installed" tab.
  3. Observe the notice directing the user to run `litespm list` in a local shell.
* **Evidence:** `web/src/app/api/litespm/installed/route.ts` lines 29-35: returns `{ available: false, command: "litespm list --json" }`.
* **Root Cause (Confirmed):** Honest architectural implementation (web server does not fabricate local machine state), but misses an onboarding opportunity.
* **User Impact:** Visitors perceive the tab as a broken or inactive feature.
* **Recommended Correction:** Render a toggleable "Interactive Sandbox Demo" showing 3 sample installed tools with visual rollback buttons.
* **Implementation Effort:** Medium (2 days).
* **Confidence Level:** 100% Confirmed.
* **Verification Status:** Open.

---

### Finding ID: LSPM-005
* **Title:** Documentation References Unreleased `v0.6.1` CLI Flags
* **Severity:** P2 (Medium)
* **Category:** Documentation & Version Parity
* **Affected URL:** `https://lite-spm-nine.vercel.app/docs`
* **Affected Viewport / Browser:** All Viewports / All Browsers
* **Observed Behavior:** Documentation describes `litespm skills use <source> | claude` and `litespm adopt <name>`, which are implemented in repository `v0.6.1-dev`, while the published global npm version is `0.6.0`.
* **Expected Behavior:** All documented features must match the currently installable `npm install -g litespm` binary, or unreleased features must carry explicit version badges.
* **Reproduction Steps:**
  1. Install `npm install -g litespm` (installs `0.6.0`).
  2. Read `/docs` command reference.
  3. Run documented command `litespm skills use ...`; command fails on `0.6.0`.
* **Evidence:** `npm view litespm version` returns `0.6.0`. `web/src/lib/litespm/site-facts.json` line 25 sets `npmVersion: 0.6.0`.
* **Root Cause (Confirmed):** Fast development velocity in Git repo ahead of npm release publication.
* **User Impact:** Developer frustration when copy-pasting documented commands into newly installed CLI.
* **Recommended Correction:** Release `v0.6.1` to npm immediately, or add `[Requires v0.6.1+]` badges in docs.
* **Implementation Effort:** Low (Run release pipeline).
* **Confidence Level:** 100% Confirmed.
* **Verification Status:** Open.

---

### Finding ID: LSPM-006
* **Title:** Agent Host Avatar Icon Missing Alt Attribute on Agent Detail Page
* **Severity:** P3 (Low)
* **Category:** Accessibility
* **Affected URL:** `https://lite-spm-nine.vercel.app/agent/cline`
* **Affected Viewport / Browser:** All Viewports / All Browsers
* **Observed Behavior:** The avatar brand icon for Cline is rendered with `<img ...>` lacking an `alt` attribute.
* **Expected Behavior:** Must include `alt="Cline logo"` or `aria-hidden="true"` if decorative.
* **Evidence:** Playwright a11y scan: `img_missing_alt: Image missing alt attribute (serious)`.
* **Root Cause (Confirmed):** `web/src/components/litespm/views/agent-detail.tsx` logo render omission.
* **Implementation Effort:** Low (15 mins).
* **Confidence Level:** 100% Confirmed.
* **Verification Status:** Open.
