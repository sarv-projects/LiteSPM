# LiteSPM Comprehensive Audit Remediation & Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate all critical blockers, UI/UX inconsistencies, accessibility failures, SEO gaps, AI bot readiness, and Ask AI assistant stability issues discovered in the website audit.

**Architecture:** Next.js 16 standalone App Router with React client components for dynamic marketplace views and server components for metadata, RAG, and APIs. Upgrades touch the Ask AI LLM gateway and citation enforcement, publisher submission fallback, sitemap & JSON-LD schema generation, plaintext `llms.txt` and raw endpoints, and accessibility/heading trees.

**Tech Stack:** Next.js 16.1.3, React 19, TypeScript, Tailwind CSS, Radix UI, Lucide React, Node.js.

**Spec:** The audit findings covering 6 distinct functional areas:
1. Messaging & Value Proposition (Hero Dual-Persona Experience)
2. UX & Conversion Rate Optimization (CRO & Glitches)
3. On-Page & Technical SEO (Heading tree, JSON-LD Schema, Sitemap indexing)
4. Performance & Core Web Vitals (CWV & Fetch abort safety)
5. AI & Agent Readiness (`llms.txt`, `/package/[key]/md` markdown mirror)
6. Ask AI Assistant Robustness (LLM failover, rate-limit backoff, citation relaxation)

---

## Global Constraints
- Do not break existing Next.js standalone export or Edge compatibility.
- Never commit live API keys or secrets (enforced by `web/scripts/check-no-embedded-secrets.mjs`).
- Pass all lint and type checks (`npm run lint`, `npm run type-check`).
- Backward-compatible URL routes: `/marketplace` remains canonical; preserve all `/package/*` paths.

---

## Review Focus
1. **Ask AI Citation Fallback:** When the LLM answers accurately but cites only a subset of retrieved knowledge chunks, does it preserve the helpful answer instead of replacing it with the blunt disclaimer?
2. **Publish Form 503:** When database storage is unconfigured on Vercel, does `/publish` provide a clear fallback (GitHub issue/mailto) instead of an opaque 503 error?
3. **Screen Reader H1 Accessibility:** Does the homepage `<h1>` expose accessible text to screen readers without breaking the animated visual styling?
4. **Command Palette Search Trigger:** Does clicking the desktop navbar "Search catalog…" button open the command palette on click, matching the `⌘K` keyboard event?
5. **AI Crawler Plaintext Extraction:** Can an LLM or markdown crawler fetch package metadata from a plaintext endpoint without running client JavaScript?

---

### Task 1: UX & Typography Fixes (Search Dialog Trigger, Bundles Typography)

**Files:**
- Modify: `web/src/components/litespm/header.tsx`
- Modify: `web/src/components/litespm/views/bundles.tsx`

**Interfaces:**
- Consumes: Header navigation search button, `setPalette(true)` dispatcher.
- Produces: Reliable click target for `Search catalog...` across desktop/mobile viewports; clean typography without stray whitespace in copy counts.

- [ ] **Step 1: Fix Search Palette Trigger in `web/src/components/litespm/header.tsx`**
  - Ensure the desktop search trigger `<button>` has `cursor-pointer`, explicit `onClick={(e) => { e.preventDefault(); setPalette(true); }}`, and is not intercepted by pointer-events on child `<kbd>`.
- [ ] **Step 2: Fix Bundles Typography Glitch in `web/src/components/litespm/views/bundles.tsx`**
  - Fix lines 130–132: change `{forAgent.length} command{forAgent.length === 1 ? "" : "s"}, one per line` so there are no errant spaces before commas or between `command` and `s`.
- [ ] **Step 3: Test and verify**
  - Verify header button click opens palette modal; verify bundle cards render `"4 commands, one per line"`.

---

### Task 2: Publish Submission Fallback (`/publish` & `/api/litespm/feedback`)

**Files:**
- Modify: `web/src/app/api/litespm/feedback/route.ts`
- Modify: `web/src/components/litespm/views/publish.tsx`

**Interfaces:**
- Consumes: Package submission payload.
- Produces: If database storage is unconfigured (`!databaseConfigured()`), gracefully return a pre-filled GitHub issue URL or mailto link rather than a dead 503 failure.

- [ ] **Step 1: Update `/api/litespm/feedback/route.ts`**
  - When database storage is not configured, return HTTP 200 with `{ fallback: true, githubUrl: "https://github.com/sarv-projects/LiteSPM/issues/new?template=package-submission.md&..." }` or guidance rather than failing with 503.
- [ ] **Step 2: Update `web/src/components/litespm/views/publish.tsx`**
  - Catch fallback responses and present an actionable `"Open GitHub Submission Issue"` button with form values pre-filled in markdown.
- [ ] **Step 3: Test submission behavior**
  - Submit form with missing DB: verify it cleanly directs the user to GitHub issue template with zero crash or 503 modal.

---

### Task 3: Technical SEO & Heading Hierarchy (H1 Accessibility & JSON-LD Schema)

**Files:**
- Modify: `web/src/components/litespm/views/home.tsx`
- Modify: `web/src/app/[...slug]/page.tsx`
- Modify: `web/src/components/litespm/views/package-detail.tsx`

**Interfaces:**
- Consumes: Package metadata, site facts.
- Produces: Valid accessibility tree with proper `<h1>` on all routes; Schema.org `SoftwareApplication` & `FAQPage` JSON-LD scripts in `<head>`.

- [ ] **Step 1: Fix Hero H1 Screen Reader Accessibility**
  - In `web/src/components/litespm/views/home.tsx`, verify `<h1 className="...">` contains accessible text (`<span className="sr-only">The package manager for AI agents. Install once, use everywhere.</span>`) and that the visual `span` with `aria-hidden="true"` does not conceal the parent heading from assistive tech.
- [ ] **Step 2: Add JSON-LD Structured Data to `web/src/app/[...slug]/page.tsx`**
  - For `/package/*`, inject `<script type="application/ld+json">` with Schema.org `SoftwareApplication` (name, operatingSystem, applicationCategory: "DeveloperApplication", downloadUrl, publisher).
  - For `/` and `/docs`, inject Schema.org `FAQPage` for the top answered questions.
- [ ] **Step 3: Verify raw HTML outputs**
  - Curl `/package/...` and `/` to confirm valid `<script type="application/ld+json">` presence.

---

### Task 4: AI & Agent Readiness (`llms.txt` and Plaintext Package Endpoints)

**Files:**
- Create: `web/public/llms.txt`
- Create: `web/src/app/api/litespm/package/[key]/raw/route.ts`

**Interfaces:**
- Consumes: Catalog dataset and package detail generator.
- Produces: Machine-readable markdown representations for AI bots (Perplexity, Cursor, Claude, ChatGPT).

- [ ] **Step 1: Create `web/public/llms.txt`**
  - Document LiteSPM overview, CLI syntax, key concepts, and links to package documentation in standard `/llms.txt` format.
- [ ] **Step 2: Create Plaintext / Markdown Route for Packages**
  - Expose `/api/litespm/package/[key]/raw` (or content-negotiated text/markdown on package routes) returning structured markdown (name, description, install commands for Claude Code / Cursor / Windsurf, transport details).
- [ ] **Step 3: Test with curl / headless agents**
  - Ensure `curl https://.../api/litespm/package/:key/raw` outputs readable markdown without executing JavaScript.

---

### Task 5: Ask AI Resilience (Multi-Provider Fallback & Citation Softening)

**Files:**
- Modify: `web/src/server/llm/gateway.ts`
- Modify: `web/src/app/api/litespm/assistant/route.ts`

**Interfaces:**
- Consumes: User question, RAG knowledge hits, catalog retrieval hits.
- Produces: Reliable, non-blocking conversational answers even under high concurrency or free-tier rate limits.

- [ ] **Step 1: Provider Failover in `web/src/server/llm/gateway.ts`**
  - When the primary provider (e.g. Groq) returns HTTP 429 (Rate Limit) or 5xx, immediately failover to the next configured provider (e.g. Gemini / OpenRouter) instead of aborting and showing the user a 60–120s lockout banner.
- [ ] **Step 2: Soften Citation Enforcement in `web/src/app/api/litespm/assistant/route.ts`**
  - Modify `enforceKnowledgeCitations`: If the model answers the question but does not cite all hits with `[S#]` tags, append the source references section at the bottom of the answer rather than discarding the answer and replacing it with the blunt *"I couldn't produce an answer with valid source citations"* error message.
- [ ] **Step 3: Test Ask AI Assistant**
  - Test benchmark questions:
    - "what is litespm"
    - "Which agent hosts does LiteSPM support?"
    - "How do I install postgres MCP?"
  - Confirm answers remain helpful and grounded even under provider latency or partial citation matching.

---

### Task 6: Hero Messaging Dual-Toggle (CLI vs GUI / Cursor)

**Files:**
- Modify: `web/src/components/litespm/views/home.tsx`

**Interfaces:**
- Consumes: Target agent selections and install preference state.
- Produces: Dual-experience hero tabs:
  - Tab 1: **"Terminal / CLI"** (`npm install -g litespm` -> `litespm setup`)
  - Tab 2: **"Cursor & IDEs"** (1-click Cursor MCP deep links & GUI config snippets)

- [ ] **Step 1: Add Persona Toggle to Hero Section**
  - Create a clean segmented toggle button in `home.tsx` allowing developers and vibe-coders to switch between CLI workflows and 1-Click Cursor / Windsurf workflows.
- [ ] **Step 2: Update Supporting Copy for Non-Devs / Vibe Coders**
  - Provide a 1-sentence plain-English explainer: *"Connect databases, web search, and custom tools to your AI coding agents in 1 click."*
- [ ] **Step 3: Test responsiveness and theme switching**
  - Verify layout looks balanced on mobile, tablet, and desktop viewports in both dark and light modes.

---

### Task 7: Full Verification & Build Validation

**Files:**
- All touched files.

- [ ] **Step 1: Run type checking & linter**
  - Run `npm run type-check` and `npm run lint` in `web/`.
- [ ] **Step 2: Run web build**
  - Run `npm run build` in `web/` to guarantee standalone export builds cleanly.
- [ ] **Step 3: Verification with browser subagent**
  - Test live changes locally or in test harness.
