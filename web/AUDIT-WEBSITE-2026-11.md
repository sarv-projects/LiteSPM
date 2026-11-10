# LiteSPM website audit and improvements - 2026-11

Scope: `web/` only (Next.js 16.1.3, `output: "standalone"`, deployed at
<https://lite-spm-nine.vercel.app/>). Nothing outside `web/` was edited. Nothing was committed, pushed,
deployed, stashed or reverted. An earlier, read-only audit by another agent is at
`../docs/WEBSITE-AUDIT-2026-11.md`; this report verifies its findings against the code, fixes what was
real, and records what remains.

Method: read the code; measured the **pre-change production build** (`.next/standalone` as found, port
3100) before editing; rebuilt after the changes and re-measured the same requests; drove the built site
with headless Chrome over the DevTools protocol (typing, tab click, 404, palette, assistant, reduced
motion). Gates: `npm run lint`, `npm run type-check`, `npm run build` all pass on the final tree.
Windows 11 / Node 22.23, single local process, so timings are indicative, not Vercel numbers.

---

## 1. Headline results

| | Before | After |
|---|---|---|
| First search in a cold process (`/api/litespm/list?q=postgres&pageSize=24`) | **38,788 ms** | **3,061-4,927 ms** (compact dataset + precomputed index) |
| Same search, warm | 409 ms | 88-106 ms; identical repeat ~40 ms (response cache) |
| Same, `facets=0` | 125 ms | 54 ms |
| Unfiltered list with facets, every request | **7,052-9,524 ms** (meta recomputed per request) | first 8.2 s (cold classification), then 1.4 s once background warm ran; repeats ~ms |
| UI split of that unfiltered load | one 7-9 s request | items 0.54 s + facets 1.0 s, **separate requests**, cards paint first |
| Search payload per page (24 cards) | 23,230 B with facets / 19,905 B without | 23,200 B / 19,874 B (summaries now clipped to 320 chars; facets-only response 3.5-5.3 KB) |
| `q=google-drive` | 3,371 B (almost nothing matched: fused token) | 18,899 B (real results) |
| `q=next.js` | slow fallback path | 38-96 ms, on the postings path |
| `q=postg` / `q=dokcer` | full-catalog fallback scan | 168-185 ms (vocabulary prefix / one-edit expansion) |
| Stop-word-only query (`a b c`) | 2,543 ms | 568 ms |
| First-load JS for `/marketplace` | 15 files, 1,203,831 B raw, **359,747 B gzip** | 18 files, 995,699 B raw, **310,886 B gzip** (non-home views, Ask AI and palette are separate chunks) |
| `/nonexistent/path` | **200** (rendered Home) | **404** |
| `/package/<unknown>` | 200 | 404 |
| `/explore` | 200, duplicate page | 308 -> `/marketplace` |
| Deep link `/docs/agent-compatibility` HTML | Home markup for every URL | the docs page itself (49 KB of real content) |

The search API was already paginated; **no full-catalog payload ever reached the browser**. The overhead
the owner saw was server-side (parsing the 57 MB catalog on the first request, re-classifying 69k rows
and running eight facet scans per request) and client-side (the search box remounting on every
keystroke). Those are what changed.

Not improved: `/api/litespm/stats` and `/api/litespm/insights` are still ~10 s on a cold process (see
section 7).

---

## 2. Explore vs Marketplace - decision

**They were duplicative**: two routes over the same `/api/litespm/list`, two result card designs, two
search boxes, two navigation entries. `Marketplace` had kind tabs, a copy button and the Installed tab;
`Explore` had facets, sort, pagination, compare/watch controls.

**Decision: one page, `/marketplace`, as the canonical URL; `/explore` redirects to it.**
Why `/marketplace` and not `/explore`: the CLI (`litespm marketplace`), the in-agent popups, README /
AGENTS / npm docs and the browser tab all already say "marketplace"; the Installed tab only makes sense
there; `/explore` was only linked from inside the SPA. (The earlier audit proposed the reverse; the
redirect makes either direction safe for old links.)

What shipped:

- `src/components/litespm/views/marketplace.tsx` - header, **tabs All / MCP Servers / Skills / Plugins /
  Installed** as real links, Installed tab unchanged.
- `src/components/litespm/views/catalog-browser.tsx` (replaces `views/explore.tsx`, deleted) - the single
  search surface: server-side search, facets, sort, pagination, compare/watch, copyable install command.
- `src/lib/litespm/route.ts` (new, pure) + `router.ts` - one route shape
  `{view:"marketplace", tab, query}`. `exploreHash()` / `marketplaceHash()` keep their names and now emit
  `/marketplace?tab=...`, so every existing caller (home, agents, assistant links, insights) works.
  Legacy `/explore?kind=mcp` and `#/explore` parse into the same route.
- `next.config.ts` - `/explore` -> `/marketplace` (308, query forwarded); `/agents/:id` -> `/agent/:id`.
- Header and footer entries merged; sitemap no longer lists `/explore`; command palette entry renamed.

Search behaviour (what the owner asked for - "just searches, doesn't load everything"):

- Each debounced (300 ms) keystroke fetches **one page**: `GET /api/litespm/list?...&pageSize=24&facets=0`
  (~20 KB). Facet counts come from a second request, `facets=only` (3.5-5.3 KB), keyed on filters and
  query only - paging and sorting do not refetch them.
- Typing uses `navigate(..., {replace:true})`, so Back leaves the page instead of replaying keystrokes.
- Fetches use `AbortController`; a failed request shows an error with Retry (`r.ok` is checked); a
  failed refresh keeps the previous results with a notice.

---

## 3. Search engine - findings and fixes

All in `src/server/litespm/`. Line numbers are of the pre-change files.

| # | Finding (verified) | Where | Fix |
|---|---|---|---|
| S1 | **Remount on every keystroke**: `routeKey` keyed the animated `<main>` on `JSON.stringify(route.query)` -> input lost focus. Confirmed. | `components/litespm/app.tsx` L24-30 | Key no longer contains query state. Verified in Chrome: same DOM node, still focused after typing `next.js` with 120 ms between keys. |
| S2 | Route echo overwrote text typed during the debounce (`setSearchText(query.q)` on every route change). | `explore.tsx` L74-77 | `lastPushed` ref: only external route changes write the box. |
| S3 | `next.js`, `google-drive`, `@scope/pkg` fused into one token absent from the postings -> relaxed full scan. | `text.ts` `tokenize`/`queryGroups`; `normalizeToken` stripped punctuation | New `queryTokens()` uses the same splitter, stemmer, alias table and stop rule as the index (`tokenField`). `tokenize()` also splits on non-alphanumerics. |
| S4 | Stop-word asymmetry: query dropped stop words *before* stemming, index *after*. | same | Single pipeline (S3). |
| S5 | Exact-name bonus used `group[0]` = first *synonym*, not the typed token. | `bm25.ts` `scoreDoc`, `text.ts` `synonymsFor` | Typed token leads its group. |
| S6 | Relevance ties broken alphabetically, not by rank score. | `search.ts` sort | Tie -> `rankScore`, junk bucket, then name. |
| S7 | Facets counted *before* dedupe (a count could exceed the total its filter yields). | `search.ts` | Each facet value counts **distinct** duplicate-collapse keys; one pass builds the result pool and all nine facet pools from a failed-filter bitmask (was 8 extra scans). Host facet uses per-shape bitmasks (3M -> ~70k set operations). |
| S8 | Index cache keyed by `releaseId` only. | `bm25.ts` `getSearchIndex` | Also checks row count and first/last row ids; a mismatching serialized index is rejected. |
| S9 | Typos/prefix fell to a full-catalog relaxed scan. | `search.ts` | `expandGroups()` expands an absent term to vocabulary prefixes (search-as-you-type) or one-edit neighbours before any scan. The relaxed scan stays as last resort. |
| S10 | `/api/litespm/list` had no rate limit, no `Cache-Control`, recomputed facets per request, loaded the 57 MB catalog. | `api/litespm/list/route.ts` | 240 req/min/IP limiter (existing `rateLimit`); `Cache-Control: public, max-age=30, s-maxage=300, stale-while-revalidate=3600`; input length clamps; **compact dataset** (8 MB gz) + precomputed index; 200-entry LRU of responses; process-lifetime lazy per-row meta; background warm after the first search; `facets=0|only`. Same headers added to `stats`, `featured`, `agents`, `insights`. |
| S11 | `hostIdsFor` mapped 50-80 host names through `resolveHostId` per row (~3M calls to classify the catalog). | `identity.ts` | Memoized by (kind, transport, remote) - a handful of shapes. |
| S12 | Hit summaries shipped in full (multi-KB). | `search.ts` `toHit` | Clipped to 320 chars (detail page has full text). |

Verified against the hits: `q=next.js` now returns Next.js packages through postings; `q=google-drive`
returns Drive MCP servers with `https://github.com/...` repo links; `q=%` , a 5,000-character query and
`page=999999&pageSize=500` return 200 with clamped values.

### One installable rule (web side)

`availability.ts` `availabilityOf()` is the only rule, and search, facets, cards, package pages,
trending and the sitemap now all call it (trending had its own copy; the sitemap used a third):

- `discovery_only` never installs (now also enforced for plugins);
- plugin needs a pinned `git-tree`;
- MCP needs a command (stdio) or url (remote);
- skill needs established installability **and** a `skillSource` (was: installability only).

Counts are unchanged on this release (all 20,320 skills carry a source; 55,491 installable of 69,311
unique). **Not done:** I did not read the Go `IsInstallable` (out of scope); someone owning `internal/`
should confirm it matches these four lines.

---

## 4. Security and robustness findings

| # | Finding | Status |
|---|---|---|
| X1 | `source-resolver.ts` accepted any string *containing* `github.com` as a repo href (`javascript:alert(1)//github.com` passes) and returned `publisher.url` unchecked. | **Fixed** - every URL leaving the resolver must parse as `https:`, with no credentials; repository links must be on github/gitlab/bitbucket. A rejected repo URL falls back to `endpoint`/`website`. |
| X2 | `decodeURIComponent` throws on a stray `%` (router, package detail, agent and compare routes; also double-decoded in two "not found" messages). | **Fixed** (`safeDecode`, try/catch). Exception: `GET /package/%E0%A4%A` returns **500 from Next's own router before any app code runs** - needs a proxy/middleware rule; not fixed. |
| X3 | Soft 404: catch-all returned 200 + Home for any path; `not-found.tsx` unreachable. | **Fixed** - unknown first segment, `/package` or `/agent` without id, and unknown package key call `notFound()` (real 404 + `not-found.tsx`). Verified: `/nonexistent`, `/package/does-not-exist-xyz` -> 404. |
| X4 | Sitemap emitted `/agents/<id>` (route is `/agent/<id>`), listed `/explore`, took `slice(0,500)` in dataset order with its own installable rule. | **Fixed** - `/agent/<id>` for all hosts, docs pages added, top 500 by rank through `availabilityOf`; `/agents/:id` also redirects. |
| X5 | Canonical origin inconsistent. | **Partly fixed** - `alternates.canonical` on every route via one `ORIGIN` constant; layout `metadataBase` unchanged. A `NEXT_PUBLIC_SITE_URL` env override was not added. |
| X6 | No baseline security headers. | **Added** `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`. **No CSP** (Next inlines bootstrap scripts; needs per-request nonces). |
| X7 | Existing fixes kept: rate limiter, `shellArg`, config-snippet escaping, `.env` strip in postbuild. `check-web-hardening.mjs` retargeted from `marketplace.tsx` to `package-card.tsx` (where the install command is now built) and still requires `shellArg` there; the card now also quotes the *displayed* id. | passes |

---

## 5. Ask AI widget - architecture, issues, fixes

### Architecture

```
assistant.tsx (client, portal, mounted lazily via next/dynamic ssr:false)
  state: messages, optional localStorage memory ("Memory on/off"), AbortController, 3 timeouts
  POST /api/litespm/assistant  {messages[<=20], stream:true}   -> NDJSON: status | cards | sources | delta | done | error
        |
        v
api/litespm/assistant/route.ts  (maxDuration 60)
  1. rateLimit  assistant:<clientIp>   20 / 5 min   (in-memory, per instance)
  2. globalBudget "assistant"         200 / 5 min  (per instance; not renameable by a header)
  3. readJsonBody <= 96 KB; safeHistory
  4. routing: deterministic host-registry tools (no LLM)  |  routeAssistantIntent -> catalog | knowledge | conversation
  5. retrieval: catalog.search (searchCatalog, compact) | knowledge.search (generated/assistant-knowledge.json, 965 chunks / 44 sources,
     lexical + local feature vectors; hybrid-semantic if EMBEDDING_* set)
  6. system prompt = assistantSystemPrompt() + <CATALOG_RESULTS> / <KNOWLEDGE_SOURCES> / <TOOL_RESULTS>
  7. server/llm/gateway.ts: provider/key pool (Groq default, Gemini, NVIDIA NIM, OpenRouter, generic OpenAI-compatible, optional Z.AI),
     LLM_PROVIDER_ORDER, per-key cooldown with exponential backoff (30 s .. 10 min), 20 s per attempt, 15 s time-to-first-token, 20 s idle
  8. grounding after the model: knowledge answers must cite [S#]; package ids/cards must be in the retrieved set; else replaced
  Knowledge answers are buffered until validated (never stream unverified prose); catalog/conversation answers stream.
Keys: environment only (GROQ_API_KEY_1..n, GEMINI_API_KEY, ...). No key is in source (gateway.ts L122 says so; the lint gate enforces it).
/api/litespm/llm: key-free health snapshot (provider names, aggregate key counts), rate limited 30/min.
```

### Issues found and fixed

| # | Finding | Fix |
|---|---|---|
| A1 | **Prompt injection from catalog text**: `untrusted()` escaped only two closing tags; a summary could contain `</TOOL_RESULTS>`, a fake `<KNOWLEDGE_SOURCES>` block or a ```` ```json ```` widget fence that the client renders. Also `hit.id` sat inside a backtick span unfiltered. | `untrusted()` now neutralizes `<`, `>`, backticks, control/line-break characters and whitespace runs; ids go through it too. (Package/comparison widgets were already key-checked server-side; other widget types such as `explore_link` were not, so fence neutralization matters.) |
| A2 | **Information disclosure**: the stream's `done` event and the JSON response sent `keyIndex` and the full `attempts` array (per-provider failure detail) to the browser. | `publicMeta()` returns provider, model, timing and RAG stats only. |
| A3 | **Cost**: history allowed 20 turns x 4,000 chars (~80 KB of prompt per request). | 12 turns, 2,000 chars each, 8,000 chars total (newest kept). Per-IP and global limits unchanged. |
| A4 | a11y: panel stayed in the tree with `aria-hidden` while its buttons were focusable; Escape did nothing while the message box had focus (where focus starts); no live region; focus dropped to `<body>` on close. | `inert` while closed; Escape closes unless an IME composition is active; message list is `role="log" aria-live="polite" aria-busy`; errors `role="alert"`; closing returns focus to the launcher (`aria-expanded` added). |
| A5 | Smooth-scroll on every streamed token queued overlapping animations. | `behavior: "auto"` while busy. |
| A6 | 60 KB component loaded on every first paint. | `next/dynamic` chunk, `ssr:false`. |
| A7 | Reported "mojibake in the source tooltip". | **Not real in the source** - `assistant.tsx` contains `·`, zero U+FFFD (scanned all of `src/`). The real mojibake was in `app.tsx` page titles; those were rewritten. |

### Remaining (assistant)

- Limits are per Vercel instance (a rotating client can multiply them across instances). Needs a shared
  store (KV/Upstash) or an edge/WAF rule; the route has no auth by design.
- `/api/litespm/llm` publishes provider names and key counts; low risk, could be restricted.
- No automated injection tests exist (`scripts/test-assistant-rag.ts` needs bun; not run here).
- Conversation memory is opt-in localStorage; fine, but the stored history is not versioned.

---

## 6. UI / UX / content changes

- **Real links**: new `NavLink` (`components/litespm/nav-link.tsx`) - header, footer, logo, docs sidebar,
  marketplace tabs, package-card title (stretched-link pattern, so the whole card is one focusable
  anchor and copy/watch/compare buttons sit above it) and home CTAs are `<a href>`; plain clicks stay
  client-side. **24 `navigate("#/...")` buttons remain** in views (agents, insights, compare, publish,
  package-detail, home rails); they work but are not crawlable links.
- **Route changes**: scroll-to-top only on a real page change (not on typing/facet clicks); focus moves
  to `<main>` and an `aria-live` region announces the page; titles fixed (U+FFFD removed).
- **Reduced motion**: `<MotionConfig reducedMotion="user">` for all framer-motion animation, plus a CSS
  `prefers-reduced-motion` block (transitions/animations collapse, cursor blink off). Verified in Chrome
  with the media feature emulated.
- **Contrast and focus**: light-theme brand colour was `oklch(.70 .17 162)` (~2.4:1 on white, used for
  text and as white-on-brand buttons). Now `oklch(.50 .13 162)` (~5.6:1); ring colour follows brand; a
  global `:focus-visible` outline for links, buttons, inputs, tabs.
- **Command palette**: real dialog behaviour (focus trap, focus restored on close, combobox +
  `aria-activedescendant`), always-present "Search the marketplace for ..." row so Enter does something,
  `facets=0` and request abort on each keystroke (it previously computed facets for an 8-row list).
- **Landing page**: derived counts (no hard-coded 52/47/81); "1-click rollback" -> "one-command
  rollback"; FAQ "No." to "can LiteSPM break my settings" -> "It is built not to... every write is
  previewed and backed up"; removed the non-existent `--global` flag from copy; "one-click" -> "single
  command"; the "four local-only hosts" sentence (actually five) now lists the hosts from data; **new
  section "The marketplace, one command away"** and a new FAQ entry for the in-agent marketplace; old
  "/marketplace in Chat" card replaced.
- **Derived numbers**: `scripts/build-site-facts.mjs` -> `src/lib/litespm/site-facts.json` (hosts 52,
  remote 47, local-only names, skill targets 81, listings, npm 0.6.0, bridge tools 13); layout, slug
  metadata, home, docs, agents and palette read it. Runs in `predev`, `build`, `pretype-check`.
- **Agent pages**: each `/agent/<id>` now states which in-agent command that agent gets (or why none),
  with the evidence level.
- **Animations**: no new decorative motion added. The existing hero glow loop and staggered card entry
  are now governed by reduced-motion. Motion that aids comprehension: route change focus + announce,
  copy-button confirmation (check icon), result dimming while a new page loads.

### Documentation pages (online docs)

Source of truth for the table is `src/lib/litespm/in-agent.ts`.

- **New** `/docs/in-agent-marketplace` (replaces "Inside your agent"; `/docs/inside-agent` still works):
  what `litespm setup` / `host setup <id>` installs, popup vs prompt commands, `litespm marketplace rows
  --json [--query] [--host] [--kind mcp|skill|plugin|installed]`, `host remove` removes the command,
  that it reads the **locally synced catalog, not this website**, the 13 bridge tools, the 0.6.1
  availability note (npm serves 0.6.0).
- **New** `/docs/agent-compatibility`: popups (Pi, OpenCode 2.2.6 verified; Claude Code >= 2.1.287
  validated; GitHub Copilot CLI needs `--experimental`, loads; Amp unverified), prompt commands (Gemini
  CLI, Qwen Code, Kiro CLI, Cursor, Augment, Roo, Factory Droid, Kilo, Cline workflow, Grok Build skill,
  Codex `$litespm-marketplace`, Crush), and "not possible" (Cline VS Code extension, Zed agent panel,
  Windsurf, Continue, Aider, Warp, OpenHands, Goose recipes-only, iFlow shut down) with reasons.
- Updated: Getting started callout; Command reference (`marketplace rows`, `host setup/remove`
  behaviour, bridge tool count); Agent hosts and FAQ counts (derived); footer links; palette entries;
  sitemap lists every docs section.
- Evidence labels follow the repo (`AGENTS.md`/`STATUS.md`): Gemini CLI's prompt command is the only
  prompt command marked verified there; the others show "Unverified". Where the owner's brief and the
  repo disagree on a label (Claude Code "validated" vs `Verified: true` in source) the page uses the
  owner's wording.

### Rendering performance

- Server-resolved route: `[...slug]/page.tsx` parses the URL (pure `route.ts`) and passes
  `initialRoute`, so the first HTML is the requested page instead of Home (deep links, crawlers, LCP).
  Verified: docs/compat/marketplace HTML contains their own content; no hydration console errors in
  headless Chrome.
- Code splitting of package, agents, agent, docs, publish, insights, compare, Ask AI, palette (-48 KB gz
  on `/marketplace`). The largest single chunk (~560 KB raw) was not attributed to a package.
- Home now calls the list API with `facets=0`.

---

## 7. What remains

1. **Cold stats/insights**: `/api/litespm/stats` (called by the header banner and Home) and
   `/api/litespm/insights` measured ~10 s on a cold process (`stats` moved to the compact dataset, but
   classifying 69k rows with the big alternation regexes in `taxonomy.ts` costs seconds). They are now
   CDN-cacheable. Real fix: write the goal (and host-shape) into `search-catalog.json.gz` at data-build
   time.
2. **Shared rate limit / daily LLM budget** (needs KV); **CSP with nonces**.
3. **24 remaining `navigate("#/...")` buttons** -> `NavLink`.
4. **Playwright**: there is no `playwright.config.ts` in `web/`; browser checks above were ad-hoc CDP
   scripts (not committed). A committed smoke test would be worth adding.
5. **No unit tests for the new search code** (`queryTokens`, `expandGroups`, facet distinct counts).
6. `GET /package/%E0%A4%A` -> 500 from Next (see X2).
7. Go `IsInstallable` parity with `availabilityOf()` (section 3).
8. Docs pages suggested by the earlier audit but not written: `skills` CLI page, `catalog-and-releases`.
9. Root-level docs (not edited here, owned elsewhere): see section 8.
10. Release note: in-agent commands are repo 0.6.1; the site says so everywhere it mentions them.

---

## 8. Stale Markdown elsewhere in the repo (read-only, not edited)

From a read-only pass by a sub-agent (`docs/DOCS-REVIEW-2026-11.md` had already fixed most counts; the
rest was **not** independently re-counted against Go):

| File:line | Stale claim | Truth |
|---|---|---|
| `HANDOFF.md` ~83-96 | `/litespm:marketplace` "is text-only - there is no popup" | Pi, OpenCode, Claude Code, Copilot CLI have real popups; `/litespm:marketplace` is the MCP text prompt |
| `HANDOFF.md` ~118, 246 | "connect to 50 different agent hosts" | 52 |
| `STATUS.md` ~222 | "all **46** remote-capable hosts" (and ~60 says 47) | 47 |
| `STATUS.md` ~62 | in-agent command "`VERIFIED` for none" | source marks Pi/OpenCode/Claude Code/Copilot/Gemini `Verified: true`; conflicts with `AGENTS.md` |
| `STATUS.md` ~61 | "static export" (older row) | `output: "standalone"` |
| `ARCH/16-HOST-ADAPTERS.md` ~168-169 | "44 rows", `host list` prints "(50)" | 46 generic rows, prints 52 |
| `ARCH/25-WEB-FRONTEND-UI.md` | Static Export, `output:'export'`, `/agents/<id>/`, "50 bridge hosts" | standalone SPA, `/agent/<id>`, 52 |
| `docs/WEBSITE-AUDIT-2026-11.md` ~344 | "four non-remote hosts" (lists four) | five (`claude-desktop` missing); also lists files since fixed |
| `AGENTS.md` ~162-163 | Claude Code / Copilot popup without version/flag | Claude Code >= 2.1.287; Copilot needs `--experimental` |
| `README.md` / `npm/README.md` | no list of agents with *no* command | add the "not possible" list |
| `web/README.md` | 50/46, four-tab panel, "encoded Groq fallback" | **rewritten in this pass** (52/47, one surface, no fallback key) |

Historical logs (`CURRENT_RUN.md`, `CHANGELOG.md`, older `ARCH` snapshots) carry old counts under
as-of banners and are acceptable.

---

## 9. Files changed (all under `web/`)

New: `scripts/build-site-facts.mjs`, `src/lib/litespm/{route.ts,in-agent.ts,site-facts.json}`,
`src/components/litespm/nav-link.tsx`, `src/components/litespm/views/catalog-browser.tsx`,
`AUDIT-WEBSITE-2026-11.md`. Deleted: `src/components/litespm/views/explore.tsx`.
Modified: `README.md`, `next.config.ts`, `package.json`, `scripts/check-web-hardening.mjs`;
`src/app/{layout,sitemap}`, `src/app/[...slug]/page.tsx`, `src/app/globals.css`; API routes `list`,
`assistant`, `stats`, `featured`, `agents`, `insights`, `trending`, `agent/[id]`, `compare`;
components `app`, `header`, `footer`, `package-card`, `command-palette`, `assistant`; views
`marketplace`, `home`, `docs`, `agents`, `agent-detail`, `insights`, `package-detail`;
`src/lib/litespm/router.ts`; server `search`, `bm25`, `text`, `identity`, `availability`,
`source-resolver`, `insights`, `package-detail`, `dataset`.
