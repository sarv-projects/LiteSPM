# LiteSPM marketing site — adversarial product evaluation

**Date:** 2026-10-19
**Live origin evaluated:** `https://litespm.sarveshbh-2022.workers.dev` (serves catalog release `rel-2026-10-15-01`)
**Source:** `/workspaces/LiteSPM/web` (Next.js 15 App Router, React 19, Tailwind 4) — read for diagnosis only
**Evaluator persona:** (1) non-developer first-time user, (2) skeptical honesty auditor, (3) mobile / keyboard-only / screen-reader user

**Release-lag note (not a bug):** the live origin serves `rel-2026-10-15-01`; the repo is at `rel-2026-10-17-01`. Every
count below was read from the live site, and where it matters I note the live release. One consequence: the live
`sitemap.xml` carries `lastmod 2026-10-17T07:53:39Z` while the catalog snapshot it describes is the 10-15 release —
the lastmod is the *build* time, not the *data* time, and the site does say "snapshot" next to the date, so this is
cosmetic, not a lie.

**Method.** Every finding below was reproduced in a real browser (Chrome DevTools Protocol + Playwright) against the
**live** origin. axe-core 4.10.2 was injected to run WCAG 2.1/2.2 A/AA. Performance was measured with
`PerformanceObserver` (LCP/CLS) under `networkidle`. No repository file was modified except this report.

---

## 1. Executive summary

1. **The single biggest problem is a factual overstatement on `/compare/`.** It says *"every MCP server in the catalog
   (48,418) can be installed into any agent in the first list, and every skill (20,320) into any agent on this page."*
   The site's own `/agents/` and `/explore/` say the truth is **25,401 MCP servers** and **764 skills** per agent, and
   that **42 of the 50** "agents LiteSPM can configure" accept **zero** MCP servers. This is the one finding that
   directly breaks the product's core promise ("it never fabricates"), and it sits on a page a sceptical evaluator
   will read precisely because it is the trust page.
2. **Fix #1 — correct the `/compare/` sentence** to per-host compatible counts (25,401 / 764) and to the 8 hosts that
   actually take an MCP server. One sentence, one file (`app/compare/CompareView.tsx:411-413` + `compareRows.ts:105-106`).
3. **Fix #2 — fix the home page's 34 px horizontal overflow at 320 px.** The "Works with the agent you already use"
   cards are 338 px wide inside a 278 px column, because the `<ul>` has no `grid-cols-1` base class
   (`components/home/AtlasTeaser.tsx:56`). One class name.
4. **Fix #3 — stop printing raw match counts for broad queries.** `?q=github` reports **26,864 found** (39 % of the
   catalog) because "github" appears in the web address of nearly every row. A non-dev reads that as a broken search.
   Down-weight the URL field and cap the displayed count ("26,864 matched — showing the most relevant").
5. **Overall: the site is *not* problematic for a non-technical user, and it is unusually honest for a catalog.**
   The hero states the value proposition in one sentence, the install path is three copyable commands, the empty state
   suggests real queries, the ranking is explained ("Why these results?"), and every impossible action is labelled
   ("Not installable", "Compatibility is declared, not tested", "Not audited by LiteSPM"). CLS is 0 on every route and
   LCP is 0.3–1.2 s. The failures are (a) one overstatement on `/compare/`, (b) a mobile layout bug, (c) search
   precision and typo handling, and (d) a missing *kind* of signal (popularity / freshness) that competitors have and
   LiteSPM deliberately does not — that last one is a deliberate trade, not a bug, but it is currently a **trade with
   no explanation on the page where it hurts**.

**No crash, no data loss, no broken install path was found.** No route 5xx'd, no asset 404'd, no console errors
(except one Chrome form-field advisory), and every install command the site prints matches the CLI's documented
interface.

---

## 2. Findings table

Severity scale: **blocker** (breaks the product promise or a core task) / **major** (materially degrades a primary
journey) / **minor** (real but bounded) / **nit** (polish).

| ID | Sev | Route | What a user experiences | Repro steps | Expected vs actual | Suggested fix direction |
|---|---|---|---|---|---|---|
| **F-01** | **blocker** | `/compare/` | The page states *"every MCP server in the catalog (48,418) can be installed into any agent in the first list, and every skill (20,320) into any agent on this page."* The "first list" is the 50 agents LiteSPM can configure. 42 of those 50 accept **0** MCP servers, and the 8 that do accept **25,401**, not 48,418. A reader who then opens `/agents/` or filters `/explore/` sees 25,401 / 764 and concludes the site is lying. | 1. Open `https://litespm.sarveshbh-2022.workers.dev/compare/` → read the paragraph under the H1. 2. Open `/explore/?kind=mcp&host=Claude%20Code%20CLI` → "25,401 entries". 3. Open `/explore/?kind=skill&host=Claude%20Code%20CLI` → "764 entries". 4. Open `/explore/?kind=mcp&host=AiderDesk` → "0 entries" (AiderDesk is in the "50 LiteSPM can configure" list). 5. Open `/agents/` → row "Claude Code CLI | 25,401 MCP | 764 skills". | Expected: the count quoted equals the count the site's own filters produce. Actual: 48,418 vs 25,401 (MCP) and 20,320 vs 764 (skills) — overstated by 1.9× and 26×. Root cause: `SERVER_COUNT = release.mcpServersCount` and `SKILL_COUNT = release.agentSkillsCount` (catalog totals) are interpolated into a sentence about *per-host* capability (`app/compare/compareRows.ts:105-106`, `app/compare/CompareView.tsx:411-413`). | Replace the sentence with per-host numbers the site already computes: "…can be installed into the 8 agents that take a remote server (25,401 of 48,418 servers), and 764 of the 20,320 skills into any agent with a skills directory." Add a build-time assertion that any count printed in prose is ≤ the corresponding per-host count. |
| **F-02** | **major** | `/` (320 px) | At 320 px the home page scrolls **sideways** by 34 px. Content in the "Works with the agent you already use" section is cut off on the right. | 1. Set the viewport to 320×800. 2. Load `https://litespm.sarveshbh-2022.workers.dev/`. 3. `document.documentElement.scrollWidth` = **354**, `clientWidth` = 320. 4. The offending nodes are the five agent-host `<li>` cards (`width: 338px`, `right: 354px`) inside `ul.mt-7.grid.gap-4.sm:grid-cols-2.xl:grid-cols-5` (container width 278 px). | Expected: `scrollWidth == clientWidth` at 320 px. Actual: 354 px. Tailwind's `grid` with no `grid-cols-*` creates an `auto` track whose floor is the card's **min-content**, so the track overflows. | Add `grid-cols-1` to `components/home/AtlasTeaser.tsx:56` → `repeat(1, minmax(0,1fr))`, which lets the card shrink. Add a 320 px width assertion to the Playwright suite (`tests/` already has a `budgets.spec.ts`). |
| **F-03** | **major** | `/explore/?q=github` | Search for "github" reports **"26,864 found"** — 39 % of the 69,376-row catalog. The ranking *is* good (the official GitHub MCP server is #1) but the count reads as a broken filter, and results 5–8 are four **plugins marked "Not installable"** (Anthropic, Cursor, OpenAI). | 1. `https://litespm.sarveshbh-2022.workers.dev/explore/?q=github` → "26,864 found". 2. Compare `?q=notion` → 104. 3. Scroll the top 10: #5 `github` (Anthropic, PLUGIN, Not installable), #6 `github` (Cursor, PLUGIN, Not installable), #7 `github` (OpenAI, PLUGIN, Not installable), #8 `Github` (SKILL, Official). | Expected: a popular brand query returns a discriminating set. Actual: the token "github" occurs in the *web-address* field of nearly every row (`lib/query.ts` matches the slug), so the query is nearly a no-op. The site's own search placeholder advertises `github` as an example query — the worst possible example. | (a) Down-weight `MATCH_SLUG` below `MATCH_BODY` in the rank classes, or exclude the host segment of a URL from the token set. (b) When the match set exceeds a threshold, print "N matched — showing the most relevant" rather than a bare count. (c) Demote `Not installable` rows below installable ones in *every* sort, including "Best match" (currently only a tie-break). |
| **F-04** | **major** | `/explore/` | A typo returns zero results with no "did you mean". "notoin" → "Nothing matches / No entry matches 'notoin'." The suggestions offered (`postgres`, `github`, `playwright`, `browser`, `memory`, `docx`) are generic, not derived from the query. | 1. `https://litespm.sarveshbh-2022.workers.dev/explore/?q=notoin` → 0 entries. 2. `?q=%E7%AC%94%E8%AE%B0` (CJK "笔记") → 0 entries, and the page renders the CJK query in the heading without any transliteration/alternative. | Expected: either a fuzzy hit ("did you mean *notion*?") or a clear "we only match word-starts, spell it differently" note. Actual: silent zero. The matcher is deliberately prefix-only with fuzzy disabled (`lib/query.ts` header comment), and the reason is not surfaced to the reader. | Keep the prefix semantics (they are correct) but **state them in the UI**: change the empty state to "No entry matches *notoin*. We match the start of each word — try *notion*." and add a small edit-distance suggestion over the ~18 k name tokens (a name-only index, so it stays cheap). |
| **F-05** | **major** | every entry page | The install command is `litespm install mcp:builtin:mcp-registry:io.github.github-github-mcp-server` — 66 characters, a colon-namespaced ID with a duplicated vendor segment. A non-dev will not type this, and it is the *only* install affordance. | 1. Open `https://litespm.sarveshbh-2022.workers.dev/package/?slug=mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server`. 2. The command block at the top and in step 03 both show the full ID. 3. Compare `https://mcpservers.org/servers/github-mcp-server` → `npx add-mcp 'https://api.githubcopilot.com/mcp/'`; `https://www.skills.sh/anthropics/skills/frontend-design` → `npx skills add https://github.com/anthropics/skills --skill frontend-design`. | Expected: a command a human can type, or an explicit statement of why the ID form is required. Actual: only the long form is shown, with no explanation and no alternative. | Verify whether the CLI can resolve a short name/slug; if it can, publish `litespm install github` on the page (and keep the full ID in a "Details" disclosure). If it cannot, add a `litespm install --search github` affordance or a one-click "copy as shell snippet" that includes a comment. |
| **F-06** | **major** | all routes @ ≤412 px | The primary navigation is a horizontally scrolling rail with **no scroll affordance**. At 320 px, "Categories" is cut mid-word ("Catego…") and **"Coverage" is entirely off-screen** (its right edge sits at x=385 in a 320 px viewport). At 375 px and 412 px the same clipping occurs (right edge 385 > 375/412). The header CTA also truncates from "Install LiteSPM" to "Install". | 1. Resize to 320×800, load `https://litespm.sarveshbh-2022.workers.dev/`. 2. The `<nav>` has `overflow-x: auto` and `scrollWidth: 369`; the `Coverage` link's rect is `left 313 → right 385`. 3. Screenshot: the nav reads "Explore / Agent hosts / Compare / Catego" with the rest cut. | Expected: all five nav destinations reachable without a hidden horizontal scroll, or a visible affordance (fade edge, chevron, "More" menu). Actual: a destination is invisible with no hint. | Add a right-edge fade + a `›` scroll button, or collapse the nav into a menu below 480 px. Also verify the "Install LiteSPM" truncation at 320 px. |
| **F-07** | **major** | `/explore/` | Three of the ten documented filters — **category, publisher, source** — have no control in the UI. They only exist as URL parameters, reachable from the home page shelves and the `/trending/` (Coverage) boards. A user on `/explore/` cannot narrow by category at all. | 1. Open `https://litespm.sarveshbh-2022.workers.dev/explore/`. 2. The filter panel offers: kind (4 buttons), Goal (select), Works with (select), "Only entries from publisher manifests", "Only entries LiteSPM can install", Reset, and a Sort select. There is no category, publisher or source control (`app/explore/ExploreView.tsx:125-135` reads all ten params from the URL). | Expected: a filter panel whose controls cover the filters the site links to. Actual: `?category=`, `?publisher=` and `?source=` work when typed but are unreachable from the UI. | Add a "Category" select (64 source categories), a "Publisher" search-select (2,365 publishers), and a "Source" select. All three already have counts computed server-side. |
| **F-08** | **major** | `/explore/?publisher=…` | The publisher filter is an **exact, case-sensitive** string match on the publisher's display name. `?publisher=anthropic` → **0 found**; `?publisher=Anthropic` → **1 found**. There is no UI for it and no error explaining the zero. | 1. `https://litespm.sarveshbh-2022.workers.dev/explore/?q=notion&publisher=anthropic` → "0 found". 2. `…&publisher=Anthropic` → "1 found" (the Anthropic `notion` plugin). | Expected: a user-supplied publisher filter to be normalised (case-insensitive, trimmed) or to fall back to a prefix match. Actual: a silent zero for the most natural input. The comparison is `item.publisher?.name !== publisher` (`app/explore/ExploreView.tsx:548`). | Normalise the comparison to a case-folded exact match, then fall back to prefix, then to a contains match. |
| **F-09** | **major** | `/agents/`, `/compare/`, `/explore/` | 29 of the 79 agent hosts are **unreachable as pages**. They appear as plain-text rows on `/agents/` and `/compare/`, and in the `/explore/` "Works with" dropdown, but `/agents/adal/`, `/agents/warp/`, `/agents/universal/` all **404**. A user who filters by "Warp" gets results and then has no way to read anything about Warp. | 1. `https://litespm.sarveshbh-2022.workers.dev/agents/` → "79 hosts · 50 LiteSPM can set up"; only 50 rows are links. 2. `https://litespm.sarveshbh-2022.workers.dev/agents/adal/` → 404; `/agents/warp/` → 404; `/agents/universal/` → 404. 3. `/explore/?host=AdaL` → 764 entries, with no host page to click through to. | Expected: every host the site names has a page, or the site says why it does not. Actual: 29 hosts are named with no page and no explanation. The root sitemap carries only 50 agent URLs (59 total including the 8 top-level routes). | Either pre-render the 29 skills-only host pages (they are cheap — the data exists in `web/data/skill-targets.json`) or mark those rows "no page yet — skills only" and link to `/compare/` instead of nowhere. |
| **F-10** | minor | entry pages | **No popularity signal exists anywhere on an entry page**, and the reason is never stated there. The explanation lives only on `/terms/` ("No popularity data — No star, download or install counts appear anywhere, because no upstream source…") and `/trending/` ("Alphabetical, because the catalog publishes no popularity or usage figure"). A user arriving from a competitor's listing sees an entry page with no star, no download count, no install count, and no note explaining the omission. | 1. Open any entry page, e.g. `https://litespm.sarveshbh-2022.workers.dev/package/?slug=mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server`. 2. Search the rendered text for "star", "download", "popular" → nothing. 3. `https://litespm.sarveshbh-2022.workers.dev/terms/` → the only explanation. | Expected: the absence is explained where the absence is felt. Actual: an unexplained gap on the page a sceptical buyer reads. | Add one line in the entry page's source/provenance block: "No star or download count exists for this entry — no upstream source publishes one." Cost: one line, no new data. |
| **F-11** | minor | entry pages (skills) | The **Capabilities** tab of a skill entry is five consecutive "not published" rows: Tools, Runtime, Transport, Launch line, Install from source. The one useful fact (the skill's source repo URL) is the last row. Competitors render the *actual* skill instructions. | 1. `https://litespm.sarveshbh-2022.workers.dev/package/?slug=skill%3Aanthropics%3Adocx`. 2. Open the "Capabilities" tab (`#pkg-panel-capabilities`): "This skill's instructions live in its SKILL.md — the file your agent reads. No tool list is published for it." then Tools/Runtime/Transport/Launch line/Install from source = "not published". Compare `https://www.skills.sh/anthropics/skills/frontend-design`, which renders the full `SKILL.md` body. | Expected: the tab shows what the capability *does*. Actual: a list of absences. | Where the source repository is known, fetch and render the first ~1,500 characters of `SKILL.md` at build time (the site already snapshots the catalog build). If that is not possible, collapse the five "not published" rows into one sentence and put the source repo link first. |
| **F-12** | minor | entry pages (MCP) | The entry page never shows the **tool list** for an MCP server — the thing a user actually wants to know ("can it create a GitHub issue? can it read a PDF?"). The site substitutes a "First look" prompt that asks the *agent* to list the tools after install. | 1. `…/package/?slug=mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server` → "Try it after you install it → FIRST LOOK → List the tools GitHub gives you". 2. Compare `https://mcpservers.org/servers/github-mcp-server`, which renders the full tool schema list. | Expected: tools visible before install. Actual: tools only after install, via a prompt the user pastes. | Where the publisher's manifest publishes a tool list, render it on the Capabilities tab. Honest (it is the publisher's own data) and it is the single most-requested missing field. |
| **F-13** | minor | `/` | The home page leads with a hero (good) but then presents **five consecutive catalog shelves** ("Installable right now", "From the Official MCP Registry", "Official agent skills", "Agent skills", "Plugins") before "What are you trying to get done?", "From setup to managed, in five steps", the FAQ and the GET STARTED band. The shelves are ~42 % of the page's scroll length. A newcomer who does not click a card must scroll ~5 screens before reaching any explanation. | 1. Load `https://litespm.sarveshbh-2022.workers.dev/` and take a full-page screenshot. 2. The H2 order is: What do you use? → Installable right now → From the Official MCP Registry → Official agent skills → Agent skills → Plugins → What are you trying to get done? → From setup to managed, in five steps → Works with the agent you already use → Before you install (FAQ) → Install and manage from the terminal. | Expected: the "what is this / what do I do first" answer within one screen of the hero. Actual: the internal complaint ("homepage still leads with catalog shelves") is **partly still true** — the second band ("What do you use?") is good and should stay, but shelves 2–6 could be collapsed to one shelf + a "see all" grid, moving "What are you trying to get done?" and the five steps up. | Interleave: hero → "What do you use?" → "What are you trying to get done?" → five steps → one curated shelf → GET STARTED, and put the remaining shelves below the fold behind links. |
| **F-14** | minor | `/` (the "Plugins" shelf) | 638 plugins are a top-level kind with a dedicated home shelf, and the hero says *"LiteSPM installs them for you"* — but LiteSPM can install **no** plugin. The hero sentence is technically precise (it says "MCP servers and skills"), yet the page's most prominent signals (a "638 plugins" stat, a "Plugins" shelf, "PLUGIN" cards) all advertise an un-installable kind. | 1. Home hero: "Find MCP servers and skills for Claude Code, Codex, Cursor, OpenCode and more. LiteSPM installs them for you, previews every change, and can undo it." 2. Home stat row: "638 plugins". 3. Home "Plugins" shelf: 3 cards, each badged "Not installable". 4. `https://litespm.sarveshbh-2022.workers.dev/package/?slug=claude-42crunch-api-security-testing` → "Install unavailable / Plugin installs are not supported yet. … LiteSPM will not install a partial bundle." + the host's own `/plugin install …` command. | Expected: an un-installable kind is clearly subordinate. Actual: it is a peer of the two installable kinds on the home page. The **entry page is exemplary** here — it states the limitation, explains why ("will not install a partial bundle"), and hands the user the host's own command under the heading "THE HOST'S OWN COMMAND (OUTSIDE LITESPM)". | Add a one-line note to the home Plugins shelf: "Browsable only — LiteSPM does not install plugins yet." Do not change the entry page. |
| **F-15** | minor | `/explore/` | The two "Only entries …" checkboxes are rendered as native **14×14 px** inputs — below the WCAG 2.2 AA 24×24 target-size floor (axe does not flag them because the wrapping `<label>` enlarges the effective target, but the visible affordance is small). | 1. `https://litespm.sarveshbh-2022.workers.dev/explore/` → measure `input[type=checkbox].getBoundingClientRect()` → 14×14. | Expected: a ≥24×24 hit area (WCAG 2.2 SC 2.5.8, AA). Actual: 14×14 visible control. | Style the checkbox to a 20×20 control with a 24px+ padding, or replace with a chip toggle (which the rest of the design already uses). |
| **F-16** | minor | entry pages | **One WCAG 2.2 AA target-size violation** on every entry page: the publisher link in the Details → Source block is smaller than 24×24 CSS px. | 1. `https://litespm.sarveshbh-2022.workers.dev/package/?slug=mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server`. 2. axe-core with `wcag22aa`: `target-size` (serious), 1 node, `div:nth-child(4) > dd > .gap-1.inline-flex[href$="github"]`. | Expected: ≥24×24. Actual: smaller. | Add vertical padding to the publisher chip link. |
| **F-17** | minor | `/explore/` | Chrome logs one issue on `/explore/` only: **"A form field element should have an id or name attribute (count: 2)"**. The Goal and "Works with" `<select>` elements have neither `id` nor `name` (the Sort select does have `id="explore-sort"`). | 1. Open `https://litespm.sarveshbh-2022.workers.dev/explore/`. 2. DevTools console → one `[issue]` message, count 2. 3. `document.querySelectorAll('select')` → two with `id: null, name: null`. | Expected: every form control has an id or a name. Actual: two do not. | Give them `id="explore-goal"` / `id="explore-host"` and `name` attributes. (Accessibility names are fine — the accessible names come from the wrapping labels — so this is a form-semantics nit, not an a11y break.) |
| **F-18** | minor | `/explore/` | The **Sort** control is a `<select>` with a visible label "Sort" but the *option* names are terse and jargon-y: "Best match", "Curated first", "Installable first", "Name A–Z", "Publisher", "Catalog order". "Curated first" and "Catalog order" are not defined anywhere on the page, and the default (no `sort` param) is **"curated"**, not "Best match" — the control therefore opens showing "Best match" while the results are actually in "curated" order until a query is present. | 1. `https://litespm.sarveshbh-2022.workers.dev/explore/` → the Sort select's value is `curated` but the first visible option is "Best match". 2. `?q=notion` → the value becomes `best-match` and the order changes. 3. `app/explore/ExploreView.tsx:125` reads `sort` and defaults to `""`; the select's default value is `curated`. | Expected: the displayed sort value matches the applied order. Actual: with no query, the select reads "Best match" while the data is curated. | Make the select's value derive from the same `effectiveSort` the query uses, and add a one-line explanation under the control: "Best match ranks by where the query was found; Curated first puts publisher-manifest and installable rows on top." |
| **F-19** | minor | `/` | The home page's stat line is an **auto-rotating carousel** ("48,418 MCP servers" → "20,320 agent skills" → "638 plugins") on a 6.6 s loop. On mobile only one line is visible at a time and it changes under the reader. There is no pause control (WCAG 2.2.2 territory) and the visual order differs from the DOM order. | 1. Load `https://litespm.sarveshbh-2022.workers.dev/` at 320 px. 2. Two screenshots 1.8 s apart show different single lines. 3. `app/globals.css:1153` — the animation is gated on `prefers-reduced-motion: no-preference`, so reduced-motion users correctly see all three at once. | Expected: a static, complete stat line, or a pausable one. Actual: a moving number in the most-read position on the page. | Make the mobile layout show all three stats stacked (drop the carousel below 640 px) — the animation adds nothing on a narrow screen where only one is visible at a time. |
| **F-20** | minor | all pages | The site's muted text colour `--ink-3` (#55627a) measures **5.19:1 on `--paper`** and **4.77:1 on `--sunken`** — passes WCAG AA (4.5:1) but fails **AAA (7:1)**. axe reports `color-contrast-enhanced` (serious) on 18–142 elements per page, including the header CTA and every small monospace metadata line. The ratio is documented in `app/globals.css:38-48`, so this is a known, deliberate choice. | 1. axe-core with `wcag2aaa` on `/categories/` → 142 nodes; on `/` → 63; on `/package/…` → 55. 2. `app/globals.css:39` documents 5.19:1. | Expected: AA is met; AAA is not. Actual: AA met, AAA not. | Either accept and document (current state) or darken `--ink-3` one step to reach 7:1 on paper. Note this is a **non-finding for AA** — do not let a fix regress AA. |
| **F-21** | minor | `/package/…` URLs | Two different URL shapes exist for the same entry. The site's own cards link to `/package/?slug=mcp%3Abuiltin%3Amcp-registry%3A…` (a query string), while `/package/entries/sitemap.xml` advertises `/package/<short-key>/` (a path). The path form only exists for the 4,000 entries in the pre-rendered set — `/package/github/` **404s**, and 65,376 of 69,376 entries have no path form at all. A user who bookmarks or shares the path form from the sitemap may hit a 404. | 1. `https://litespm.sarveshbh-2022.workers.dev/package/ai-star-co-jp/` → 200. 2. `…/package/github/` → **404**; `…/package/notion/` → 404. 3. `…/package/entries/sitemap.xml` → 4,000 `<loc>` entries, all path-form. 4. The home page's cards all point at the query form. | Expected: one canonical URL shape. Actual: two, one of which 404s for 94 % of entries. | Make the canonical form the path form and have the edge Worker serve *every* entry at `/package/<key>/` (it already serves the shell for unknown keys — the Worker is the only thing standing between this and a 404). Otherwise make the sitemap emit the query form. |
| **F-22** | minor | `/` goal tiles | The "What are you trying to get done?" tiles mix two taxonomies with no explanation. "Code & Git" shows **45,373** (65 % of the catalog) because it maps to the source category *Developer Tools*, while `/categories/` shows the *goal* "Coding & Development" as **6,371** — a 7× difference for what reads as the same idea. One of the twelve tiles ("Files & Documents", 2,133) uses a free-text query (`?q=document`) while the other eleven use `?category=`. | 1. `https://litespm.sarveshbh-2022.workers.dev/` → tile "Code & Git 45,373" → href `/explore/?category=Developer%20Tools`. 2. `…/explore/?category=Developer+Tools` → "45,373 entries" ✓ (the count is honest). 3. `…/categories/` → "Coding & Development 6,371". 4. Tile "Files & Documents" → href `/explore/?q=document`. | Expected: one taxonomy, or a label that says which. Actual: two taxonomies, one lopsided tile, one tile on a different mechanism. | Rename "Code & Git" to "Developer Tools" (or map it to the *goal*, not the source category), and make "Files & Documents" a category so all twelve tiles behave identically. |
| **F-23** | nit | `/` and entry pages | The home page and the entry pages give **two different commands for the same step**: the home GET STARTED band says `litespm setup` ("Detect your agents, preview the change, approve it"), the entry page's step 02 says `litespm` ("Run the setup wizard and pick your agent"). Both are valid CLI invocations, but a user following the entry page on a machine that already has one configured host sees the wizard print *"LiteSPM is already set up for: …"* and go straight to a menu instead of offering setup (per `AGENTS.md` §2 step 1). | 1. `https://litespm.sarveshbh-2022.workers.dev/` → GET STARTED → `litespm setup`. 2. `…/package/?slug=…` → step 02 → `litespm`. 3. `AGENTS.md` §2 item 1: a machine with one configured host does not re-apply setup on a bare `litespm`. | Expected: one command for one step. Actual: two. | Use `litespm setup` on both surfaces; it is unambiguous and idempotent. |
| **F-24** | nit | `/trending/` | The nav item is called **"Coverage"**, but the route is `/trending/`. A user who looks for "trending" (as every competitor labels it) will not find it, and "Coverage" does not signal "a breakdown of the catalog by host/kind/publisher" to a non-dev. | 1. `https://litespm.sarveshbh-2022.workers.dev/` → nav item "Coverage" → `/trending/`. 2. The page's own H1 is "Coverage" and the subtitle is "Every entry in the catalog, counted by agent host, capability kind, category and publisher." 3. Compare `https://mcp.so/` → "Rankings", "Trending this week". | Expected: a name that says what it is. Actual: a name that sounds like insurance. | Keep the honest name (it is not trending and must not pretend to be) but add a subtitle in the nav tooltip and a one-line explanation at the top of the page: "There is no trending list here: no source publishes usage data. This is a census." |
| **F-25** | nit | `/explore/` | The "Works with" dropdown lists **79 host names** in a native `<select>`, with 71 of them showing the identical count (764). A user cannot tell a managed host from a skills-only host from the dropdown. | 1. `https://litespm.sarveshbh-2022.workers.dev/explore/` → "Works with" → 79 options; the last 71 all read "(764)". | Expected: the dropdown distinguishes what changes when you pick a host. Actual: a 79-item flat list. | Group the `<optgroup>`s: "MCP + skills (8)", "Skills only (71)", and show the MCP count alongside the skills count. |
| **F-26** | nit | `/explore/` | There is no **page-level "why" for a filter** beyond the collapsed "Why these results?" panel, and that panel explains the *ranking* of a query, not the *filtering*. When a filter is active the header line does say "Filtered capabilities" and the count, which is good, but it does not say which filter caused the reduction. | 1. `https://litespm.sarveshbh-2022.workers.dev/explore/?kind=mcp&host=Claude%20Code%20CLI` → "Filtered capabilities / 25,401 entries". 2. No chip or text names the active filters. | Expected: active filters are visible as removable chips. Actual: only the *count* is explained. | Render the active filters as chips (the code already has a chip renderer for category/publisher/source — `app/explore/ExploreView.tsx:825-866`); extend it to kind/goal/host. |

**Severity tally (section 2): 1 blocker, 8 major, 13 minor, 4 nit = 26 findings.**
**Plus 6 mobile findings (M-01…M-06: 2 major, 3 minor, 1 nit) and 7 accessibility findings (A-01…A-07: 3 minor, 4 nit) in section 4.**
**Grand total: 39 findings — 1 blocker, 10 major, 16 minor, 12 nit.**

---

## 3. "A non-developer could not…"

Tasks that are impossible, or only possible with hidden knowledge, for a first-time non-technical user.

**They could not tell in 10 seconds that the website does not install anything.**
The FAQ does answer this — *"Can I install from this website? **No.** This site is for finding and comparing. Installs run
in your terminal"* — and the GET STARTED band repeats it ("This page is for browsing. Everything that changes your
machine happens in your terminal"). But both live **below five catalog shelves** (F-13). The header's primary CTA says
"Install LiteSPM", which is the correct message, but a user who lands, browses a shelf and clicks a card reaches an
entry page whose first command is `litespm install …` with no adjacent statement that the *website* cannot do it for
them. The entry page does say "How do I add it? / three steps, or one prompt" and step 01 is `npm install -g litespm`,
so the answer is there — but it is the third thing on the page, not the first.

**They could not install anything without a terminal.** By design and correctly disclosed, but worth naming: there is
no "Install" button on any entry page, and that is the right call. The gap is that the site never says *why* the
answer is "no" until the FAQ.

**They could not type the install command.** `litespm install mcp:builtin:mcp-registry:io.github.github-github-mcp-server`
(F-05). A non-dev's realistic options are to copy-paste it (the Copy button works and is labelled) or to give up.
Every competitor offers a short command or a one-click IDE button:
`npx add-mcp 'https://api.githubcopilot.com/mcp/'` (mcpservers.org),
`npx skills add https://github.com/anthropics/skills --skill frontend-design` (skills.sh),
`Add to toolbox` (Smithery),
an "Install in VS Code" badge (mcpservers.org).

**They could not choose an agent and be sure.** The entry page offers "Choose your agent" (Claude Code, Codex,
OpenCode, Cursor, Cline, Other) and says "Optional — picking one shapes the rest of this page, not the command." That
is honest and good. But the *first* thing a non-dev needs is usually "which of these do I have?" — the site answers
that with the home page's "What do you use?" panel (Claude Code, Codex, OpenCode, Cursor, Cline, Other, "Saved in
this browser only"), which is one of the better pieces of the site. The two are not connected: the entry page's
agent picker does not know what the home page's picker recorded until the entry page is opened.

**They could not tell what a plugin is, or that 638 of the entries cannot be installed at all.** The home page's stat
row advertises "638 plugins"; the "Plugins" shelf is a peer of the two installable shelves; only the cards' tiny
"Not installable" badge and the entry page's "Install unavailable" band say otherwise (F-14). The FAQ's "What about
plugins?" answer exists but is at the bottom of the page.

**They could not find anything by topic.** The "What are you trying to get done?" tiles are the non-dev's best entry
point, but they are source categories, one of which covers 65 % of the catalog ("Code & Git — 45,373"), and one of the
twelve uses a different mechanism (F-22). `/categories/` is better organised (11 goals, each with a plain-English
description and a per-kind breakdown) but it is only reachable from a footer link, a small "All categories →" link, or
the nav.

**They could not use the ⌘K palette.** It exists (`Ctrl/Cmd+K`), it opens a proper `role="dialog" aria-modal="true"`,
Escape closes it and focus returns to the trigger, and the header carries a search button labelled "Search the catalog
— ⌘K". But a non-dev has no reason to press ⌘K, and the header's search **button** on desktop is an icon that
navigates to `/explore/?focus=search` (which correctly focuses the search input — verified). So the task is
achievable; the *discoverability* rests on an icon plus a keyboard hint. On mobile there is no ⌘K, and the header
search button is one of three 40-ish px icons in a 320 px row (F-06).

**They could not get support from a human.** The contact page says the issue tracker is the only channel and that
there is "no support address, no chat and no support contract". Honest, and a deliberate trade — but a non-dev who
cannot install something has no route to a person. The page does at least give a precise triage table (bug → issue,
vulnerability → private advisory, wrong catalog row → issue with the entry URL, something in a server → the
publisher) and asks for `litespm version` output, which is exactly right.

**They could not check whether an entry is safe.** The site is admirably clear that it is *not* a security auditor
("Not audited by LiteSPM", "Compatibility is declared, not tested — LiteSPM doesn't run what it lists", "What LiteSPM
has read: LiteSPM-parsed… but hasn't run it"). But it offers no substitute signal — no security badge, no audit link,
no "publisher declares it is audited". skills.sh offers a **"Security audits"** browse filter; glama claims it ranks on
security. A non-dev therefore has to make the decision on provenance alone ("from publisher manifest"). That is a
defensible position and clearly stated; it is simply the honest gap.

---

## 4. Mobile & accessibility findings

### 4.1 Mobile

| ID | Sev | Width | Finding | Evidence | Fix direction |
|---|---|---|---|---|---|
| M-01 | **major** | 320 px | **Home page scrolls horizontally by 34 px.** `documentElement.scrollWidth` = 354 vs `clientWidth` = 320. | Measured on `https://litespm.sarveshbh-2022.workers.dev/` at 320×800. Offending nodes: the five agent-host `<li>` cards in "Works with the agent you already use", each `width: 338px`, `right: 354px`, inside a 278 px `<ul>` that has `grid` but no `grid-cols-1`. Every other route measured (`/explore/`, `/package/…`, `/agents/`, `/compare/`, `/categories/`) stays at `scrollWidth 310 ≤ clientWidth 320`. | Add `grid-cols-1` to `components/home/AtlasTeaser.tsx:56`. Add a 320 px overflow assertion to the suite. |
| M-02 | **major** | 320 / 375 / 412 px | **The primary nav is a hidden horizontal rail.** `Coverage` (right edge 385) and part of `Categories` are off-screen at every mobile width tested; the rail's `scrollWidth` is 369 with no fade, chevron or "More" affordance. | `nav` computed `overflow-x: auto`; at 320 px the "Coverage" `<a>` rect is `left 313 → right 385` in a 320 px viewport. At 375 px and 412 px the same rect still ends at 385, i.e. the link is still off-screen. | Add a right-edge fade + scroll chevron, or collapse to a menu under 480 px. |
| M-03 | minor | 320 px | The header CTA truncates from "Install LiteSPM" to "**Install**" (the `hidden sm:inline` span). | Screenshot at 320 px; axe also flags `.btn-lg > .hidden.sm:inline` for AAA contrast because the two words have different sizes. | Acceptable, but pair it with an accessible name (e.g. `aria-label="Install LiteSPM"`) and an icon so the truncation is not the only cue. |
| M-04 | minor | 320 px | The hero stat line shows **one** rotating line at a time (M-19/F-19) — 48,418 MCP servers *or* 20,320 skills *or* 638 plugins, on a 6.6 s loop, with no pause control. | Two screenshots 1.8 s apart at 320 px show different single lines. | Show all three statically below 640 px. |
| M-05 | minor | all widths | The two `/explore/` checkboxes render as **14×14 px** native inputs. | Measured `getBoundingClientRect()` on `https://litespm.sarveshbh-2022.workers.dev/explore/`. | Enlarge to ≥20×20 with ≥24 px padding, or convert to the chip toggles the design already uses elsewhere. |
| M-06 | nit | 375 / 412 px | The "Works with" `<select>` and the Goal `<select>` are full-width and comfortable (375 px screenshot shows both cleanly); the result rows truncate the summary with an ellipsis, which is correct. | 375 px screenshot of `/explore/?q=notion`. | No action. |

### 4.2 Accessibility (keyboard, screen reader, contrast, no-JS)

**What passes — and this is unusually good for a marketing site:**

- **axe-core 4.10.2, WCAG 2.1 + 2.2 A/AA, on the settled DOM: zero violations** on `/`, `/explore/`,
  `/package/?slug=…`, `/agents/`, `/compare/`, `/categories/`, `/trending/`, `/agents/claude-code/`.
- **Skip link** exists, is the first tab stop, is 44 px tall, and becomes visible on focus
  (`Skip to content` → `#main`).
- **Focus is always visible**: `outline: 2px solid`, and the ring **flips with the theme** — `rgb(17,24,39)` (#111827)
  on light, `rgb(237,241,247)` (#edf1f7) on dark. Verified by tabbing in both themes.
- **Tab order** is logical: skip link → logo → Explore → Agent hosts → Compare → … → search → theme → CTA.
- **The ⌘K palette is a proper modal**: `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"`, focus moves
  to its search input on open, **Escape closes it** and focus returns to the trigger. It lists agent hosts with a
  "showing 6 of 50 — type to narrow" affordance.
- **Every interactive element on the home page has a ≥44 px target**; on `/explore/` only the two checkboxes are small
  (M-05); on an entry page one inline text link is under 24 px (F-16, inline-text exception but still an axe AA flag).
- **Reading order follows the visual order**; landmarks are correct (`banner` / `navigation "Primary"` / `main` /
  `contentinfo`); each page has exactly one `<h1>`; the palette and the search box are labelled.
- **Reduced motion is respected**: the hero stat carousel, the bridge animation and the scroll reveals are all gated on
  `prefers-reduced-motion: no-preference` (`app/globals.css:1153`). This is a real, verifiable win.
- **The no-JS contract holds.** Every route ships a `<noscript>` banner: *"JavaScript is off. Everything on this page
  still reads; search, filters and an entry's interactive parts need it. Install steps are in the README."* The SSR
  HTML of `/explore/` contains the full filter panel, the 48 pre-rendered entry links and the heading; the package
  page's install command is in the HTML; the 404 page, the FAQ and all three legal pages read without JS. The site
  says plainly that this site is for browsing, not installing.

**What fails or is weak:**

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| A-01 | minor | One **WCAG 2.2 AA `target-size`** violation on every entry page (the publisher chip link). | axe `wcag22aa` on `/package/?slug=mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server` → 1 node, `target-size` (serious). |
| A-02 | minor | **AAA contrast** not met on muted text: `--ink-3` is 5.19:1 on paper (needs 7:1). 18–142 elements per page. AA is met everywhere. The ratio is documented in `app/globals.css:38-48`. | axe `wcag2aaa` on `/categories/` → 142 nodes. |
| A-03 | minor | **No pause control** on the auto-rotating hero stat (F-19 / M-04) — WCAG 2.2.2 applies to auto-updating information; the figure changes with no user control. | `app/globals.css:1153-1166`. |
| A-04 | nit | The two filter `<select>`s on `/explore/` have **no `id` and no `name`** (F-17) — Chrome flags it; it also means the filters are not serialisable and are hard to target from tests or a URL-scheme. | Chrome console `[issue]`, count 2. |
| A-05 | nit | The `⌘K` palette is discoverable only via an icon and a keyboard-shortcut string in the header's `aria-description`; no visible "⌘K" affordance is rendered, and on mobile the shortcut is meaningless. | Header `link "Search the catalog" description="Search the catalog — ⌘K"`. The site does the right thing by giving the button a real click target (`/explore/?focus=search`, verified: the search input receives focus). |
| A-06 | nit | The **screen-reader experience of the home shelves** is heavy: a single "Installable right now" region with 6 cards, each a link whose accessible name is the concatenation of title, kind, publisher, transport, version and summary (e.g. *"GitHub. MCP Server. by github. Runs on the publisher's own hosted endpoint. Nothing is downloaded to your machine. Connect AI assistants to GitHub - manage repos, issues, PRs, and workflows through natural language"*). It is informative but very long to traverse. | a11y snapshot of `https://litespm.sarveshbh-2022.workers.dev/`. |
| A-07 | nit | `/explore/` has **no visible `id`/`name` on the search input's sibling controls** and the sort control's accessible label is "Sort" while its option list is unexplained jargon (F-18). | Measured. |

---

## 5. Competitor comparison

All six competitors were visited live from this environment. `mcpservers.org`, `mcp.so` and `pulsemcp.com` serve a
Cloudflare "Performing security verification" interstitial / "Access Denied" to this datacenter IP in both Chrome and
Playwright; their content below was retrieved through a plain HTTP fetch path that is not bot-challenged, and that
retrieval is cited by URL. `skills.sh`, `smithery.ai` and `glama.ai/mcp` rendered normally.

| Competitor | Catalog size | Search & filtering | Entry page | Install instructions | Trust signals | Popularity signals | Pricing / model | What they do better than LiteSPM | What they do worse than LiteSPM |
|---|---|---|---|---|---|---|---|---|---|
| **LiteSPM** (live) | 69,376 (48,418 MCP / 20,320 skills / 638 plugins); 26,165 installable | Prefix-token lexical search over 10 URL params; kind/goal/host/verified/installable + sort have UI controls; **"Why these results?"** explains every leading row's match field and tie-break — no competitor does this. Category/publisher/source exist but have no UI. | Very rich: plain-language summary, 6-tab Details (Overview/Capabilities/Compatibility/Security/Versions/Source), per-row provenance, "Not installable" badge, "Compatibility is declared, not tested", "Not audited by LiteSPM", 6 host cards, "Try it after you install it" prompt. | `litespm install <long-colon-id>` + 3 numbered steps + a Prompt tab. **No tool list, no SKILL.md body, no one-click IDE button.** | "from publisher manifest" vs "third-party list entry" per row; "Not audited by LiteSPM"; "Not installable"; "LPSM will not install a partial bundle"; exact "What LiteSPM has read" disclosure. **No account, no cookies, no analytics, no telemetry** (stated and true). | **None.** Deliberate. | Free, Apache-2.0, open source, no account, no host service. | The ranking explanation, the per-row provenance discipline, the explicit "not installable" states, the honest "no stars" reasoning, the privacy posture, the fact that compatibility is *per-host* and *per-kind*. | Everything about popularity, freshness, tool previews, short install commands, one-click install, community feedback, and per-entry freshness dates. Plus the `/compare/` overstatement (F-01). |
| **skills.sh** | ~1.4 M installs tracked; skills only | "Search skills… /" with a `/` shortcut; browse modes All Time / Trending (24h) / Hot; topic facets (React, Next.js, Design & UI, Mobile, Agent workflows, Databases, Testing, Marketing); agent facets (Claude Code, Cursor, Codex, GitHub Copilot, Windsurf, Gemini, Cline, AMP, Antigravity, OpenClaw); a **"Security audits"** browse filter; "Packs". | `skills.sh/anthropics/skills/frontend-design` — category, summary, and the **entire `SKILL.md` rendered** as readable prose. | `npx skills add https://github.com/anthropics/skills --skill frontend-design`, with a Command/Prompt tab. | "Made with care by Vercel"; "Skills are open source on GitHub"; a Security-audits filter as a trust axis. | **Install counts: 3.9M, 1.4M, 1.2M, …** and "Trending (24h)" / "Hot" leaderboards. | Free/open, Vercel-backed. | Installs counts, trending, real skill content preview, security-audit filter, `/` shortcut. | Every count is self-reported by the vendor's own installer; no per-host compatibility truth; no "is this installable *by my agent*" dimension; no prose about where a row came from. |
| **mcpservers.org** ("Awesome MCP Servers") | 9,800+ | 20 categories (Development, Productivity, Database, Search, Web Scraping, File System, Version Control, Communication, Cloud Service, Cloud Storage, Marketing, Finance, Design, Memory, Other); an "Official 🌟" list; **"Popular MCP topics"** intent guides (Browser Automation MCP, Web Scraping MCP, RAG MCP, OpenAPI MCP, PDF MCP, Coding Agent MCP); a "Popular Searches" row (Notion, GitHub, Slack, Stripe, Supabase…). | `/servers/github-mcp-server` — an "official" badge, a plain-language "What can you do with GitHub MCP?" section, a **"Request update"** link, Go Report Card badge, and the upstream README rendered in full. | **`npx add-mcp 'https://api.githubcopilot.com/mcp/'`** — a short, human-typeable one-liner, plus **"Install in VS Code" / "Install in VS Code Insiders" / "Install in Visual Studio"** one-click badges, plus per-host install guides (Claude Code, Codex, Cursor, OpenCode, Windsurf, Zed, GitHub Copilot CLI, Rovo Dev). | "official" badge; Go Report Card; "Request update"; the publisher's own README. | **The source repo's GitHub star count: "GitHub 33.7k"** — an external, verifiable number. | Free; has **sponsored slots** (labelled "sponsor"). | Short install command, one-click IDE install, per-host guides, real tool schemas rendered, intent/topic guides that match *user goals* rather than vendor categories, the "Request update" feedback loop, GitHub stars as a popularity signal. | Sponsored placements at the top of the home page; stars are the *publisher repo's* stars, not the server's usage; no per-host compatibility truth; no "is it installable" notion. |
| **pulsemcp.com** | 21,678 | Filters: Remote Available; **Classification (Anthropic References / Official Providers / Community)**. Sorts: Recommended, Last Updated, A–Z, Z–A, Recently Released, **Most Popular (All Time / This Month / This Week)**. 517 result pages. A separate **client directory**. | Per-server page with publisher, classification badge, release date, and a large README. | Setup guides per client. | **Classification taxonomy** (Anthropic reference / official provider / community) is a clearer, more useful provenance axis than LiteSPM's two-state badge. | **"Est Visitors (Week)"** — an *estimate*, clearly labelled as such (5.5M, 1.6M, 1.3M, 498k, 83.8k). Also Release Date. | Free, with a paid subscribe/partner offering. | The three-way Classification filter; Most Popular at three cadences; a separate client directory; per-row release dates. | "Est Visitors" is an estimate extrapolated from web traffic — a weaker signal than it looks and not tied to MCP usage at all; a submission banner is up ("New server submissions and listing changes are still paused"). |
| **mcp.so** | Servers + Remote Servers + Clients + CLI + Loops + Skills + Agents (a much broader taxonomy than LiteSPM's) | ⌘K search ("Search MCP servers, tools, integrations…"), category + **tag** pages ("Explore tags"), a **Rankings** page, "Trending this week", "New arrivals", "Featured", plus a "Featured clients" and "Featured CLI tools" band. | `/` cards with publisher, description, and a relative date. | Per-server setup guides; a Submit flow. | "Official" badges; "Featured"/"Added X ago" freshness. | **Install counts: 148K, 2.5K, 255, 226, 194, 174, 148, 93, 82.** | Free; has **Advertise** (paid placement) and Submit. | The breadth (skills, loops, CLI tools, agents), a real **rankings** page, **tag** pages by use case, relative freshness dates, install counts, and an active submission loop. | Heavy commercial placement; the "Added X ago" dates and install counts are vendor-reported; no per-host compatibility truth. |
| **smithery.ai** | 715 MCPs | Filters: **Verified**, **Smithery managed**, **My Servers**, Advanced, **Namespace**, **Categories** (Web Search, Browser Automation, Academic Research, Finance, Reasoning, Dev Tools). | Per-server page with tools, and a hosted/managed offering. | "**Add to toolbox**" — a one-click install through a hosted account; credentials/sessions handled by Smithery. | "Verified" flag; "Smithery managed" flag (a real trust axis: who runs it). | **"3.84k uses"** per server. | **Pricing page, Login, and a hosted service** — the only competitor here with a genuine business model. | The one-click "Add to toolbox" install (a non-dev's dream); namespace + managed filters; a real pricing page; hosted auth handling. | Requires an account; only 715 servers (14× fewer than LiteSPM); "uses" is self-reported; no skills catalog of comparable depth; the site is now "part of Arcade.dev". |
| **glama.ai/mcp** | "thousands of MCP servers"; servers + connectors + clients + tools | "Search MCP servers, tools, and more"; Best MCP Servers; a **Chat** UI to try a server without installing. | Per-server pages, plus a Chat playground. | Connect through Glama's gateway; account required. | **"Trusted by 50,000+ Businesses"**; "Glama indexes, scans, and **ranks** servers based on **security**, compatibility, and ease of use"; MCP Inspector, Gateway, Hosting. | Implied by the "best/ranked" framing; no per-row number on the directory landing page. | Free + enterprise ("Enterprise-grade security, privacy"); **"Create a Free Account"** is required to use the chat. | The **try-it-in-the-browser chat** (a genuine answer to "what can this server actually do?"); a security-ranked claim; client/connector/tool coverage; community (Discord 1,976, Reddit 216). | "50,000+ Businesses" and "ranks on security" are unverifiable marketing claims — precisely the class of statement LiteSPM refuses to make; account required; the directory landing page renders almost no content. |

### 5.1 What a user genuinely misses in LiteSPM because of our choices

1. **No way to tell a popular entry from an obscure one.** skills.sh (3.9M installs), mcp.so (148K), smithery (3.84k uses)
   and mcpservers.org (33.7k GitHub stars) all answer "is this the good one?" LiteSPM answers "here is everything, and
   here is exactly why each row is in this order" — a different and arguably better answer to a different question, but
   a user who arrived from a "best MCP servers for 2026" list will feel the absence acutely.
2. **No freshness signal on the entry itself.** Competitors print "Added 3 days ago" / "Release Date Apr 11, 2025".
   LiteSPM prints a **catalog-level** snapshot date and nothing per entry. For a directory whose whole value is "is this
   maintained?", that is a real gap.
3. **No preview of what the capability does.** mcpservers.org renders the upstream README *including the tool schemas*;
   skills.sh renders the full `SKILL.md`; glama lets you chat with the server before installing. LiteSPM shows the
   publisher's one-line summary and, for skills, five "not published" rows (F-11), and for MCP servers, no tool list
   at all (F-12). This is the biggest functional gap in the product surface.
4. **No one-click install.** smithery's "Add to toolbox", mcpservers.org's VS Code badges, and skills.sh's
   `npx skills add` are one action. LiteSPM's shortest honest path is: install the CLI → run setup → paste a 66-char
   ID.
5. **No community, no feedback loop, no social proof.** mcpservers.org has a "Request update" link on every entry;
   LiteSPM's contact page asks you to open an issue manually with the entry URL. That is a missed, cheap win (see
   idea #6 below) and it is also the only mechanism that could eventually produce a per-entry "last reviewed" date.
6. **The 638 plugins are dead weight on the home page** (F-14) — a whole third of the catalogue's "kinds" that the
   product cannot act on.

### 5.2 Improvement ideas (cost + honesty-rule check)

The honesty rules in force, stated so the check is meaningful:
**R1** no fabricated popularity metrics (no stars / downloads / install counts);
**R2** no install affordance for something LiteSPM cannot install;
**R3** no claim that the website itself installs anything;
**R4** no claiming a capability was run/tested when it was not;
**R5** no implying a publisher or LiteSPM vetted/audited a row;
**R6** no publishing a number LiteSPM cannot measure.

| # | Idea | Cost | Honesty-rule check | Why it matters |
|---|---|---|---|---|
| **1** | **Correct the `/compare/` sentence to per-host counts** (25,401 MCP / 764 skills; 8 hosts take an MCP server), and add a build-time assertion that no prose number exceeds the corresponding per-host count. | **cheap** | **Fixes a R6 violation.** | Removes the only place on the site that breaks the product's core promise. Highest value per minute of work. |
| **2** | **Fix the 320 px home-page overflow** (`grid-cols-1` on the `AtlasTeaser` `<ul>`) and add a 320/375/412 px overflow assertion to the Playwright suite. | **cheap** | none violated | The only layout bug found; one class name. |
| **3** | **Search-precision pass**: down-weight the web-address field, cap the displayed count ("N matched — showing the most relevant"), demote "Not installable" rows in *every* sort, and add a spell suggestion ("did you mean *notion*?") over the name-token index. | **medium** | none violated — it *improves* honesty by making the count mean what it says | Fixes the "26,864 found for github" impression and the zero-result dead end (F-03, F-04). |
| **4** | **Add the three missing filter controls** (category, publisher, source) with their existing server-side counts, and normalise the publisher comparison to case-insensitive → prefix → contains. | **medium** | none violated | Makes the filters the site already links to reachable from the UI (F-07, F-08). |
| **5** | **Short install alias.** Verify whether the CLI can resolve a name/slug; if yes, publish `litespm install github` on entry pages with the full ID in a disclosure; if no, add the resolution to the CLI first. Fall back to a "copy as shell snippet" that includes a comment line naming the entry. | **medium** (CLI + web) | none violated — it does not create a second install path, it abbreviates the existing one | The single most likely cause of a non-dev bouncing off the site (F-05). Directly answers mcpservers.org's `npx add-mcp '…'` and skills.sh's `npx skills add owner/repo --skill name`. |
| **6** | **Per-entry "Request an update" button** that opens a pre-filled GitHub issue carrying the entry's URL and id, and stamps the entry with a "last reviewed" date derived from the tracker. | **cheap** | none violated, and it *strengthens* R5 (a review is a fact, not a claim) — but **never** render the date as "verified" or "audited" | mcpservers.org has this. It also creates the only realistic path to a per-entry freshness date, and gives LiteSPM a freshness signal without a popularity metric. |
| **7** | **Explain the missing popularity signal on the entry page** (one line, in the provenance block) and add a "snapshot age" line ("row from the 2026-10-15 catalog snapshot") next to the version. | **cheap** | none violated — it makes R1 visible rather than implicit | F-10. A user comparing against a competitor sees the absence; this converts an unexplained hole into a stated policy. |
| **8** | **Render the capability itself where the publisher publishes it** — the `SKILL.md` body for skills, the tool list for MCP servers that publish one — at build time, from the publisher's own manifest, labelled with its source. | **expensive** | **must not** extend to "LiteSPM has read the tools"; the label must stay "published by the publisher, not audited by LiteSPM" (R5) and the site must not imply it ran the capability (R4) | F-11, F-12. The biggest functional gap; also the strongest answer to glama's chat and skills.sh's rendered SKILL.md. |
| **9** | **Sourced, attributed popularity — GitHub stars of the publisher's own repository**, fetched at build time, cached, and stamped with the fetch date ("33.7k ★ on the publisher's repo, as of 2026-10-15"). | **expensive** | **boundary case.** It is *not* fabrication (the number is real and attributed), but it (a) changes the privacy page, which currently promises exactly two outside hosts, and (b) risks a user reading it as "people use this server" when it means "people starred the repo". If done, it must never be the *sole* ranking signal and must carry the attribution inline. | The one signal every competitor has and LiteSPM refuses. If the team decides to take it, take it **attributed and dated**, or not at all. If the team decides not to, adopt idea #7 and say so plainly. |
| **10** | **Restructure the home page order** (hero → "What do you use?" → "What are you trying to get done?" → five steps → one shelf → GET STARTED) and collapse the five shelves into one plus a grid link. Add a one-line note to the Plugins shelf that plugins are browsable only. | **cheap** | none violated — the plugin note *strengthens* R2 | F-13, F-14. Directly addresses the standing internal complaint and the 10-second test. |
| **11** | **Give the 29 skills-only hosts a page** (or label them "no page — skills only") and group the `/explore/` "Works with" dropdown into optgroups showing MCP + skills counts. | **medium** | none violated | F-09, F-25. Removes 29 dead-end names and makes the 79-host list legible. |
| **12** | **Add a "Can LiteSPM install this?" answer to every search result row** rather than only the entry page — the row already shows "Not installable", but it is a low-contrast chip at the bottom of the card. Promote it to a badge beside the title when the row is not installable. | **cheap** | none violated — it strengthens R2 | A non-dev scanning results will not read a footnote-sized chip; promoting it stops them clicking into a wall. |

**Explicitly rejected:** a "N people installed this" counter (violates R1/R6 — LiteSPM has no install telemetry and
says so on `/privacy/`); a "Verified by LiteSPM" badge (violates R5 — the site already states, correctly, that it
audits nothing); a "Trending" tab (violates R1 — the site already explains on `/trending/` that no popularity signal
exists, and renaming Coverage back to Trending would be the lie the current naming avoids).

---

## 6. Console, network and performance findings

**Console errors — none.** Ten routes were loaded in a real browser and the console was read on each.

| Route | Console |
|---|---|
| `/` | *(no console messages)* |
| `/explore/` | 1 advisory: `[issue] A form field element should have an id or name attribute (count: 2)` (F-17) |
| `/package/?slug=mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server` | *(no console messages)* |
| `/agents/` · `/compare/` · `/categories/` · `/trending/` · `/contact/` · `/privacy/` · `/terms/` | *(no console messages)* |

**Network failures — none.** Every request on every route returned 200/304. No 404 asset, no 5xx, no failed request.
The only third-party requests are the two disclosed in `/privacy/`: `github.com/<account>.png` and
`avatars.githubusercontent.com/u/<id>?s=64&v=4`. The privacy page's claim ("Two outside hosts, and only these two")
matched what I observed on `/explore/`; the Google favicon fallback it also mentions was not exercised in these
sessions. `/how-it-works/`, `/get-started/` and `/package/xyz/` correctly return **404** with the site's own
"Page not found / That page is not on this site … Everything in the catalog is reachable from Explore" page and two
recovery links. `/sitemap.xml` → 59 URLs (8 top-level routes + 50 agent pages) with `lastmod 2026-10-17T07:53:39Z`.
`/package/entries/sitemap.xml` → 4,000 entry URLs.

**Performance — good.** Measured with `PerformanceObserver` under `networkidle` on the live origin (not the local build):

| Route | TTFB | FCP | LCP | CLS | Transfer | Requests |
|---|---|---|---|---|---|---|
| `/` | 259 ms | 1200 ms | **1200 ms** | **0** | 326 KB | 35 |
| `/explore/` | 89 ms | 820 ms | **820 ms** | **0** | 53 KB | 33 |
| `/package/?slug=mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server` | 120 ms | 504 ms | **504 ms** | **0** | 224 KB | 29 |
| `/categories/` | 78 ms | 288 ms | **288 ms** | **0** | 134 KB | 25 |
| `/agents/` | 79 ms | 320 ms | **320 ms** | **0** | 171 KB | 44 |

All LCPs are comfortably inside the 2.5 s "good" threshold and **CLS is exactly 0 on every route** — notable, because
a page that renders 69,376-row catalog lists, animated counters and a scroll-timeline entrance effect would be a
natural CLS offender. The 52 MB catalog dataset is clearly not shipped to the browser; the `/explore/` route transfers
only 53 KB.

**One CSS/JS note:** `@layer base{div[id^="S:"][hidden]{display:block!important}}` is injected into the HTML of every
page (including the `noscript` block) by React's streaming SSR, and it appears as literal text in the no-JS rendering
of the page body — visible in the fetched HTML of `/compare/` and `/explore/`. It is inert in a browser but it is
noise for a screen reader that reads text nodes in a no-JS context. Cosmetic, not a finding of substance.

---

## 7. What is genuinely good (do not break this)

1. **The hero works.** "Give your coding agents the tools they're missing." + "Find MCP servers and skills for Claude
   Code, Codex, Cursor, OpenCode and more. LiteSPM installs them for you, previews every change, and can undo it." +
   a real search box + the `npm install -g litespm` command with a Copy button. A non-dev can say what this is and
   what to do first within ten seconds of the first screen. The "What do you use?" panel right below it
   (Claude Code / Codex / OpenCode / Cursor / Cline / Other, "Saved in this browser only", "The choice stays in this
   browser — nothing is sent anywhere") is the best onboarding element on the site.
2. **"Why these results?" is a genuine differentiator.** Every competitor explains *that* a row matched, none explain
   *why it ranked above the next one*. LiteSPM's collapsed panel names the field the query was found in, quotes the
   fragment around the match, and states the tie-break signals. It is also correctly placed *after* the results.
3. **The honesty is real, not decorative.** "Not installable", "Plugin installs are not supported yet — LiteSPM will
   not install a partial bundle", "Not audited by LiteSPM", "Compatibility is declared, not tested — LiteSPM doesn't
   run what it lists", "This doesn't check your machine", "What LiteSPM has read: LiteSPM opened this entry's own
   published metadata — but hasn't run it", "Which files, sites or credentials this entry can reach isn't published
   yet", "No source publishes operating-system support, popularity or ratings for this host", "Can I install from this
   website? **No.**", and the plugin page's "THE HOST'S OWN COMMAND (OUTSIDE LITESPM)". No competitor is this
   explicit about the limits of its own catalogue. This is the product's moat; do not soften it.
4. **The ambiguous-slug case is handled beautifully.** `/package/?slug=notion` → "That name matches more than one
   entry / This address is shared by more than one entry, so it doesn't name a single one. Open the entry from a
   search result instead." with a search button. Clear, honest, and actionable.
5. **The empty state is good.** "Nothing matches / No entry matches 'zzzqqqxyz123'. Try: postgres, github, playwright,
   browser, memory, docx / Clear search and filters" — with the real suggestion chips, not a shrug.
6. **The per-agent truth is a real asset.** 79 hosts × per-kind compatibility, published, and — crucially —
   *per-host*, so a user can see that their agent takes 25,401 MCP servers and 764 skills. The site gets this right
   everywhere **except `/compare/`** (F-01). Fix that sentence and the model is consistent.
7. **The privacy and terms pages are unusually good.** "No account, no cookie, no analytics, no font host." Four named
   `localStorage` keys, two named third-party hosts with the exact URL patterns, "there is no support address, no
   chat and no support contract", "A badge such as `metadata_verified` says where the row came from … It is not a
   security review, and the UI says so wherever the badge appears." These pages read like they were written by
   someone who expects to be audited.
8. **The 404 page is right.** "404 / Page not found. / That page is not on this site — the link may be wrong, or the
   page may have moved. Everything in the catalog is reachable from Explore." with two recovery links.
9. **Accessibility fundamentals are done.** Skip link first in tab order and 44 px tall, a visible 2 px focus ring that
   flips with the theme, `role="dialog" aria-modal="true"` on the ⌘K palette with Escape-to-close and focus return,
   `prefers-reduced-motion` honoured across the carousel, the bridge animation and the scroll reveals, exactly one
   `<h1>` per page, correct landmarks, and **zero axe WCAG 2.1/2.2 A/AA violations** on any route tested.
10. **Performance and CLS are excellent** (LCP 288–1200 ms, CLS 0 on every route) and the 52 MB catalogue is not
    shipped to the browser.
11. **The GET STARTED band is well built**: four commands, each with a plain-English label
    (`npm install -g litespm` "Install the CLI"; `litespm setup` "Detect your agents, preview the change, approve it";
    `litespm search github` "Search the catalog"; `litespm install <id>` "See what it will run and change, then
    install it"; `litespm doctor` "Check your local setup and report anything wrong"), each with a Copy button, plus
    "Everything stays on your machine" and "It only touches its own line".

---

*Report ends. Evaluated against the live origin on 2026-10-19; no repository file other than this report was created
or modified, and no deployment or publish step was performed.*
