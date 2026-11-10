# LiteSPM website audit — 2026-11-10

Scope: `web/` (Next.js 16, `output: "standalone"`), live pages at https://lite-spm-nine.vercel.app and the Cloudflare origin https://litespm.sarveshbh-2022.workers.dev, plus the Go-side marketplace surfaces that share the catalog.
Mode: read-only. No file under `web/` or any code file was changed; the only write is this report. Some `web/src` files carry other engineers' uncommitted edits (`git status` shows `list/route.ts`, `trending/route.ts`, `router.ts`, `availability.ts`, `bm25.ts`, `search.ts`, `source-resolver.ts`, `text.ts` modified). Line numbers below are from the working tree on 2026-11-10 and may shift.

## How to read the evidence labels
- **[V]** verified by reading code or by a measurement I ran.
- **[I]** inferred from code or config; I did not observe it at runtime.
- **[U]** not checked.

## What I did and did not do
- Read the code named in each finding. Fetched live pages and API endpoints with `Invoke-WebRequest`. Measured the existing `web/.next` build output (BUILD_ID `I3iUyJaRHn3kDCpPXVTLP`, built 2026-11-08 22:20 local).
- I did **not** run `npm run build`, Lighthouse, a browser, or a screen reader. LCP, CLS and TBT are reasoned from code and payload sizes. They are not measured.
- Steering message: the request to "launch a subagent" was not done. This session had no subagent I could drive, so I audited directly. The request to "update the online documentation, do it" conflicts with the read-only rule, which I kept. The proposed docs text is in section 4 so it can be dropped in. The `work_brief` / `work_report` ledger tools refused this session (identity could not be verified), so no ledger report was filed. This file is the deliverable.
- Markdown staleness (the second half of the steering message) is covered in section 8.

---

# Executive summary — top 10 findings, ranked by impact

| # | Finding | Sev | Evidence |
|---|---|---|---|
| 1 | **Every route server-renders the Home view.** Crawlers and no-JS users see the home page at `/marketplace`, `/explore`, `/docs`. Only `<title>`/description are per-route. No canonical, no `og:url` on non-package routes. | High (SEO, LCP, CLS) | [V] fetched `/marketplace`: title is "Marketplace - LiteSPM", body text starts with the home hero ("The package manager for AI agent capabilities…"); `app/page.tsx:1-7`, `[...slug]/page.tsx:111-113`, `router.ts:184-187` (initial `route: {view:"home"}`) |
| 2 | **HTML is `Cache-Control: no-store` and re-rendered per request**, even for static content. `/marketplace` took 1.87 s TTFB+body, `/` 0.55 s. | High | [V] response headers on `/marketplace`: `no-store, must-revalidate, no-cache, max-age=0, private`, `X-Vercel-Cache: MISS`, `X-Matched-Path: /[...slug]`; prerender manifest lists only `/` and error routes |
| 3 | **Catalog search works server-side but cold start is ~5 s.** First `?q=github` call took 5.38 s; the next query 0.47 s. The function parses an ~8 MB-gz / ~47 MB compact catalog plus a 9.7 MB-gz BM25 index in memory. The client does *not* load the catalog. | High | [V] timings; `dataset.ts:267-297`, `search.ts:19`, `data/search-catalog.json.gz` 7,966,696 B, `data/search-index.json.gz` 9,659,050 B |
| 4 | **Explore and Marketplace are duplicates** (same `/api/litespm/list`, same card concept, two nav entries, two sitemap entries, two debounce/abort implementations). Marketplace is a strict subset of Explore. | Medium–High (UX, SEO dilution) | [V] `header.tsx:15-16`, `marketplace.tsx:130-141`, `explore.tsx:85-112`, `sitemap.ts:16-27` |
| 5 | **Navigation uses `<button onClick>` instead of `<a href>`** in header, footer and cards. No middle-click, no open-in-new-tab, no crawlable links, nothing for the router to prefetch. | High (a11y, SEO) | [V] `header.tsx:151-153`, `footer.tsx:93-96`, `marketplace.tsx:107-111` |
| 6 | **Sitemap lists 30 `/agents/<id>` URLs that the router does not serve.** The real detail route is `/agent/<id>`. `parsePath("agents/x")` returns the agents index. | Medium | [V] `sitemap.ts:64-71` vs `router.ts:117-123` |
| 7 | **`web/public/v1/releases/` is 522 MB across 8 releases and is gitignored but present locally and in `.next/standalone` (953 MB, 8,670 files).** `data/catalog.json` (60 MB) is in the deploy bundle on top of the gz projections. | Medium | [V] directory sizes; root `.gitignore:47`; `next.config.ts:11-14` traces `./data/**/*` into every route |
| 8 | **Live Cloudflare origin lags the repo.** Live serves `rel-2026-10-21-01` seq 151; `web/public/v1/current.json` and `web/data/release.json` say `rel-2026-11-05-03` seq 154. | Medium (docs and `catalog sync` serve a stale catalog) | [V] fetched `/v1/current.json` vs file |
| 9 | **Ask AI runs a per-instance in-memory rate limiter and global budget on Vercel**, so limits multiply with instances. It also pulls a 3.3 MB generated knowledge JSON into the server bundle, and `assistant.tsx` (59.6 KB source) ships in the main client bundle. | Medium | [V] `rate-limit.ts:2-6`, `assistant/route.ts:17-19,118-126`, `assistant-knowledge.ts:9`, `app.tsx:12`, `app.tsx:171` |
| 10 | **Docs and READMEs have stale host/remote counts and a stale "static export" claim**: `AGENTS.md` (50/46), `web/README.md` (50/46), `STATUS.md:61`, `ARCH/25` ("Static Export", `output:'export'`). The website itself has the correct 52/47/81/13. | Medium | [V] section 8 |

Also worth knowing: page titles in `app.tsx:50-64` and `[...slug]/page.tsx:44,59,65,73…` contain mojibake (`�`) where an em dash was lost. This is visible in browser tabs and search results [V].

---

# 1. Marketplace vs Explore, and how search connects to the catalog

## 1.1 Are they duplicative? Yes.

| Aspect | Marketplace (`/marketplace`) | Explore (`/explore`) | Evidence |
|---|---|---|---|
| Component | `views/marketplace.tsx` (21.5 KB) | `views/explore.tsx` (18.2 KB) | file sizes |
| Data | `GET /api/litespm/list?kind=…&installable=1&pageSize=36&facets=0` | `GET /api/litespm/list?…filters…&pageSize=24` | `marketplace.tsx:130-141`, `explore.tsx:85-103` |
| Same server function | `searchCatalog()` | `searchCatalog()` | `list/route.ts:13` |
| Unique to Marketplace | A copyable `litespm install <id>` row, the "Installed" tab (reads local ledger only when served locally) | – | `marketplace.tsx:59-82, 219-330` |
| Unique to Explore | Facets (kind, goal, category, publisher, installability, transport, host), sort, pagination, watchlist | – | `router.ts:7-19, 35-50` |
| Router | Two route kinds and two URL builders | | `router.ts:23-24, 35-58` |
| Nav / sitemap / SEO | Both are top-level nav items and sitemap entries at 0.9 priority, with near-identical descriptions | | `header.tsx:15-16`, `sitemap.ts:16-27`, `[...slug]/page.tsx:49-62` |
| Search UX bug | Marketplace uses `setTimeout` 260 ms inside the view (`marketplace.tsx:431`) and `AbortController` per tab. Explore uses `useDebounced(350)` and a request-id counter, with **no abort** (`explore.tsx:64, 103-111`). The command palette uses a third variant (250 ms). | | [V] |

Different debounce delays (260/350/250 ms) and different cancel strategies for the same endpoint are a symptom of the duplication.

## 1.2 Recommendation: one catalog page, with an "Installed" side-panel

Merge into one route, `/explore`, since it already has the full filter model. Keep the marketplace's good parts.

1. Make `/explore` the single browse surface. Add a quick **kind tabs** row (Skills · Plugins · MCP · All) driven by the existing `kind` param, with `installable=1` as the default toggle ("Installable only", on).
2. Move the **copyable install command** into Explore's cards (the `InstallCommand` component from `marketplace.tsx:59-82`).
3. Move the **Installed tab** to `/installed` (small route; the unavailable-state copy at `marketplace.tsx:247-259` is good as is). Link it from the header as "Installed" only when the page is served locally; on the public site show it inside Docs → "Inside your agent" instead.
4. Keep the `/marketplace` URL working because the in-agent prompts, `litespm marketplace`, README links and docs all use that word. Redirect rather than delete:

```ts
// web/next.config.ts — add (patch sketch, not applied)
async redirects() {
  return [
    { source: "/marketplace", has: [{ type: "query", key: "tab", value: "mcp" }],     destination: "/explore?kind=mcp&installable=1",   permanent: true },
    { source: "/marketplace", has: [{ type: "query", key: "tab", value: "plugins" }], destination: "/explore?kind=plugin&installable=1", permanent: true },
    { source: "/marketplace", has: [{ type: "query", key: "tab", value: "installed" }], destination: "/installed", permanent: true },
    { source: "/marketplace", has: [{ type: "query", key: "q", value: "(?<q>.+)" }], destination: "/explore?kind=skill&installable=1&q=:q", permanent: true },
    { source: "/marketplace", destination: "/explore?kind=skill&installable=1", permanent: true },
  ];
},
```

Order matters, since the first matching rule wins. Use 307 until the merge is stable, then switch to 308/`permanent: true`.

5. Header: replace the two items with **Explore** (match `explore`, `package`). Footer: remove "Explore packages" duplicate wording. Command palette: keep one "Explore the catalog" entry (`command-palette.tsx:30`).
6. Delete `marketplace.tsx`'s `CatalogTab` and reuse Explore's list. Net: about −350 lines and one fewer `fetch` code path. Keep the route name `marketplace` in `router.ts` only as a redirecting alias.
7. Sitemap: drop `/marketplace` from `sitemap.ts` once redirects are live, and add `/installed` only if it is public.

## 1.3 How the slash commands and the search bar actually connect to the catalog

This differs from the premise in the request, so I am stating what the code shows.

[V] The in-agent `/marketplace` and `/litespm-marketplace` commands do **not** call the Vercel page. They are installed by `internal/host/marketplace_command.go` (per-host assets in `internal/host/marketplace_assets/`: `amp/litespm.ts`, `claude-code/{register.js,hooks.json,plugin.json,marketplace.json}`, `github-copilot/extension.mjs`, `opencode/tui.js`). The prompt they send (`marketplace_command.go:569-574`) tells the agent to call the bridge tool `search_catalog` (or `list_installed`) and says "Do not open a browser". The bridge tool searches the **local, synced catalog** in the daemon.

[V] `litespm marketplace rows` (`cmd/litespm/marketplace_rows.go`, schema `litespm.marketplace.rows/v1`) builds its view model from `catalog.NewClientWithTimeout(registryURLOf(cfg), paths.DataRoot, …)` (line 220) and `cat.Search(query, catalog.SearchOptions{Kind, Limit: searchLimit})` (line 302). It merges that with the local inventory, and if the catalog is empty it prints "Run `litespm catalog sync` once to download it" (line 292).

So the connection is by **shared data, not by a shared endpoint**:

```
                 catalog release tree  (/v1/current.json → releases/<id>/listings-000N.json)
                 served by Cloudflare worker  ← signed, immutable, 20 MB shards
                    │                                   │
        litespm catalog sync                   web build copies it into web/data/catalog.json
                    │                                   │
     local catalog (DATA_ROOT)                 Vercel function memory (dataset.ts)
        │          │                                    │
  bridge search_catalog   marketplace rows         /api/litespm/list  → Explore / Marketplace / Ask AI
  (in-agent slash cmds)   (popups, --json)
```

Consequences:
- The in-agent command is only as fresh as the user's last `catalog sync`, and `catalog sync` is only as fresh as the Cloudflare origin, which is **two releases behind** (finding 8).
- The website's search bar and the in-agent search can return different results for the same query: they use different ranking code (Go `internal/catalog` search vs TS `bm25.ts` + `ranking.ts`). I did not diff the rankers [U].
- Docs say "the marketplace prompt in your agent reaches the same catalog" (`docs.tsx:438`). That is true for the catalog *content* and not for the *service*. Suggested wording is in section 4.

I did not read `litespm marketplace` (the browser-launching command) or whether it proxies to the local web build [U].

## 1.4 What the client loads today

[V] The browser does **not** download the catalog. Payload per search is one page of cards:
- `GET /api/litespm/list?kind=skill&installable=1&pageSize=36&facets=0&q=github` → 34,170 B; `q=postgres` → 38,554 B (about 1 KB per hit).
- Home fires 5 requests on mount (`home.tsx:88-104`: stats, featured, trending, two `list?pageSize=8`).
- Client JS for `/marketplace`: 15 chunks, **1,188,075 B** as reported by `Invoke-WebRequest` (it reports no `Content-Encoding`, so treat this as the decoded size [I]); `.next/static` has 1.14 MB of JS in total. The largest chunk is 546 KB and holds Radix and framer-motion strings (11 `framer` hits, 52 `radix`) [V counts, I attribution].
- No `web/data/*.json` is imported into a client component. [V] `grep` of `components/` for `data/` and `generated/` found none. The 3.3 MB `generated/assistant-knowledge.json` is imported from `server/litespm/assistant-knowledge.ts:9`, which is server-only [V]. Keep it out of any `"use client"` import chain with `import "server-only"` (see S-5).

So the overhead the user is worried about is **server-side**: every cold Vercel function loads the catalog. The measured cost is the 5.4 s first query.

## 1.5 Search algorithm proposal (search on demand, no whole-catalog load)

The client part already does what you asked: debounce, abort (Marketplace only), top-N paging, in-flight guard. What is missing is on the server and in caching.

### A. Client (small, do first)
Create one shared hook `useCatalogSearch(params)` and use it in Explore, Marketplace (until merged), the command palette and the home shelves.

```ts
// web/src/lib/litespm/use-catalog-search.ts  (patch sketch)
"use client";
import * as React from "react";
import type { CatalogListResponse } from "./types";

const cache = new Map<string, { at: number; data: CatalogListResponse }>(); // module-level LRU
const TTL = 5 * 60_000, MAX = 60;

export function useCatalogSearch(params: URLSearchParams, delay = 250, minChars = 2) {
  const q = params.get("q") ?? "";
  const key = params.toString();
  const [debounced, setDebounced] = React.useState(key);
  const [state, setState] = React.useState<{ data?: CatalogListResponse; loading: boolean; error?: boolean }>({ loading: true });

  React.useEffect(() => {                       // debounce only typing; filter/page changes go through immediately
    const wait = q.length > 0 && q.length < minChars ? Infinity : q ? delay : 0;
    if (wait === Infinity) return;
    const t = setTimeout(() => setDebounced(key), wait);
    return () => clearTimeout(t);
  }, [key, q, delay, minChars]);

  React.useEffect(() => {
    const hit = cache.get(debounced);
    if (hit && Date.now() - hit.at < TTL) { setState({ data: hit.data, loading: false }); return; }
    const ac = new AbortController();           // aborts the stale request
    setState((s) => ({ data: s.data, loading: true }));   // keep previous rows: no layout flash
    fetch(`/api/litespm/list?${debounced}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: CatalogListResponse) => {
        cache.set(debounced, { at: Date.now(), data });
        if (cache.size > MAX) cache.delete(cache.keys().next().value!);
        setState({ data, loading: false });
      })
      .catch((e) => { if (e?.name !== "AbortError") setState((s) => ({ data: s.data, loading: false, error: true })); });
    return () => ac.abort();
  }, [debounced]);
  return state;
}
```

Also send `facets=0` unless the facet rail is open (Explore currently always asks for facets; the code comment at `search.ts:39` says facets are "eight extra full-catalog scans").

### B. HTTP cache for the API (small, large win)
`/api/litespm/list` is `force-dynamic` with no cache header (`list/route.ts:5`). Results are deterministic per `(release, params)`.

```ts
// list/route.ts — patch sketch
return NextResponse.json(response, {
  headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
});
```
Cache key already includes the query string; add the release id as `&r=<releaseId>` (client gets it from `/api/litespm/stats`) so a new release busts the CDN. Normalise the key (lowercase `q`, sorted params) before the fetch to raise the hit rate. Expected: repeat and popular queries (`github`, `postgres`, `filesystem`) are served from the edge, and cold-start hits only the long tail.

### C. Remove the cold-start parse (medium effort, biggest win)
Today `getCompactDataset()` gunzips and `JSON.parse`s the whole row set, and `getSearchIndex()` loads the BM25 index (≈ 8 MB + 9.7 MB gz) in every instance (`dataset.ts:267-297`, `bm25.ts`). Replace it with **sharded static files that the function (or the browser) reads on demand**.

Index layout (build step added to `scripts/build-search-index.mjs`):
```
public/search/<releaseId>/
  meta.json                 { releaseId, docCount, shards: 2-char prefix list, cardShards: N }   (~5 KB)
  p/<aa>.json               prefix shard: for the 2-char prefix "aa", { term → [docId, score] sorted by BM25 weight, capped at top 2000 }   (target ≤ 60 KB gz each)
  c/<nnn>.json              card shard: 256 docs per file, the 12 fields the card needs   (~100 KB gz each)
  top/<kind>.json           pre-ranked first 200 ids per kind (empty-query browse)        (~20 KB)
```
Query algorithm (works in a function *or* a Cloudflare Worker *or* the browser):
1. Tokenise with the same `tokenize()` from `text.ts` (single source, already shared).
2. For each token take its 2-char prefix, fetch `p/<aa>.json` (CDN-cached, immutable under `<releaseId>`), expand the matching terms (`startsWith` for the last token = typeahead).
3. Intersect the posting lists for AND semantics, or sum scores for the "any" mode already in `search.ts:44`. Stop after the top `N = 36 × page` (min-heap of size N).
4. Fetch only the card shards that hold those ids (at most ~6 for page 1, since ids sorted by rank cluster into shards).
5. Filters (`kind`, `installable`, `host`) are applied as a bitmap or as separate per-kind postings. If the facets are required, return counts only from `meta.json`-level precomputed totals (facet counts for the empty-query state), and skip them for text queries.
6. Cache: in-memory `Map` per instance for shards (LRU, 30 MB cap); CDN for the files; client LRU from (A).

Library alternative: **MiniSearch** with `fields: ['name','summary','publisher']`, `prefix: true`, `fuzzy: 0.15`, built per kind (mcp ≈ 48k, skill ≈ 20k, plugin 638). It is a single dependency that serialises with `JSON.stringify(index)`, but the whole per-kind index would still be loaded whole (tens of MB for mcp), so use it only for the small kinds (plugin, hosts) and keep the prefix-shard design for mcp/skill. Do not use FlexSearch for the catalog: its memory is higher and its index is not portable across versions.

### D. Estimated payload savings (estimates, not measured)
| Path | Today | Proposed |
|---|---|---|
| Cold server start | parse ~8 MB-gz/≈47 MB compact rows + 9.7 MB-gz index; measured first query 5.4 s | read `meta.json` (5 KB) + 1–3 prefix shards (≈ 60 KB each) + 1–6 card shards (≈ 100 KB each). Estimate 0.2–0.6 MB, **≈ 30–90× less data, first query target < 500 ms** |
| Warm query | 0.47 s TTFB for 38 KB (includes network from this machine) | unchanged server-side (in-memory), plus edge hit ≈ 50–150 ms |
| Deploy bundle | `data/catalog.json` 60 MB + two gz files 17.6 MB in every function trace | `catalog.json` is used only by `package-detail` and the assistant; give those routes their own trace include (`outputFileTracingIncludes` per route), drop it for `/api/litespm/list`, saving ≈ 60 MB per traced route |
| Client | 34–38 KB per page, 36 cards | same; with `fields=` trimmed (drop `command`, `args`, `installHint` from the list response, which only the install row uses) ≈ 25–30 KB |

### E. Server-side steps that need no new index (quick wins)
- `list/route.ts`: accept `pageSize ≤ 100` and clamp. Today `Number(...) || 24` has no upper bound (`list/route.ts:26`) → a caller can ask for `pageSize=100000` [V]. Add `Math.min(100, …)`.
- Add a min query length (2 chars) and a max (80 chars) on `q` in the route.
- Warm the instance: Vercel cron or `instrumentation.ts` that calls `getCompactDataset()` once on boot so the first user does not pay the 5 s.
- Move the function to `export const runtime = "nodejs"; export const preferredRegion = "bom1"`. The `x-vercel-id` shows `bom1::iad1`, meaning the edge is in Mumbai and the function ran in Washington; pin the function near the users or near the data [V header, I conclusion].

---

# 2. Landing page, header, footer, content accuracy

## 2.1 Numbers: what the site says vs the truth I verified

| Claim | Site | Truth | Status |
|---|---|---|---|
| Agent hosts | 52 (`layout.tsx:21,48,64`, `agents.tsx:118`, `docs.tsx:428`, `home.tsx:804`) | `web/data/hosts.json` has 52 entries [V] | OK |
| Remote-capable | 47 (`layout.tsx:21`, `agents.tsx:118`) | 47 entries with `remote: true` [V] | OK |
| Skill targets | 81 (`docs.tsx:400`, `agents.tsx:118`) | `skill-targets.json` has 81 [V] | OK |
| Bridge tools | 13 (`docs.tsx:283,462`) | 13 per AGENTS.md/README [I; I did not count in Go] | OK |
| Listings | 69k+ / 69,376 | `release.json` itemCount 69,376 [V] | OK |
| CLI version in docs | 0.6.0 (`docs.tsx:329`) | npm latest 0.6.0 (`published-cli.json`), `npm/package.json` says 0.6.1 [V] | OK for now. Hard-coded: will go stale when 0.6.1 is published (see fix below) |
| Release on site | `rel-2026-11-05-03` seq 154 (`current.json`, `release.json`) | live Cloudflare origin serves `rel-2026-10-21-01` seq 151 [V] | **Deploy lag** |

Fix for hard-coded numbers: add `scripts/check-web-truth.mjs` assertions (it already exists and is part of `npm run lint`) for `52`, `47`, `81`, `13` against `hosts.json` / `skill-targets.json`. Better, derive all of them from the dataset. `docs.tsx:162` already does this for the listing count (`stats?.all`); do the same for hosts.

Deploy-lag fix: publish `rel-2026-11-05-03` to the Cloudflare origin (operator action; it needs the signed tree and `wrangler deploy`), then re-probe `/v1/current.json`. Until then `litespm catalog sync` gives users 151, and the website and in-agent results diverge.

## 2.2 Findings

**W-1 (High) Server renders Home for every route.** [V] See exec #1. Cause: `LiteSPMApp` is a client component whose store starts at `{view:"home"}` and only switches in `useEffect → syncFromHash` (`app.tsx:119-128`). SSR cannot know the route. Consequences: wrong content for crawlers/no-JS, a visible flash of the home hero before the target view (CLS), and double work (home fetches 5 endpoints before navigation completes).
Fix: pass the route from the server.
```tsx
// app/[...slug]/page.tsx — patch sketch
export default async function CatchAllPage({ params, searchParams }: Props) {
  const { slug = [] } = await params;
  const sp = await searchParams;
  const initialRoute = parsePath("/" + slug.join("/"), new URLSearchParams(sp as any).toString());
  return <LiteSPMApp initialRoute={initialRoute} />;
}
// app.tsx: useApp.setState({ route: initialRoute }) on first render via a store initialiser, or `<RouteProvider>`.
```
Even better long-term: convert each view's shell to a Server Component route (`app/explore/page.tsx`, `app/docs/[section]/page.tsx`) and make only the interactive parts client components. `ARCH/25` already describes that structure.

**W-2 (High) HTML not cacheable.** [V] `no-store` header. The catch-all route is dynamic because `generateMetadata` awaits `params` for arbitrary slugs. Fix:
```ts
// [...slug]/page.tsx
export const revalidate = 3600;
export function generateStaticParams() {
  return ["", "marketplace","explore","agents","insights","docs","publish","compare"].map((s) => ({ slug: s ? [s] : [] }))
    .concat(["getting-started","commands","install-flow","hosts","inside-agent","security","publishing","troubleshooting","introduction"].map((s) => ({ slug: ["docs", s] })));
}
```
Package pages stay on-demand but get `revalidate = 86400` (ISR) so the first hit renders and every later one is a CDN hit. This changes TTFB for `/docs` from ≈ 0.6 s to an edge hit.

**W-3 (High) Links are buttons.** [V] See exec #5. Replace with `next/link`:
```tsx
<Link href={item.hash} onClick={(e) => { if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) { e.preventDefault(); navigate(item.hash); } }} aria-current={active ? "page" : undefined}>…
```
Apply in `header.tsx:151,236`, `footer.tsx:96`, `marketplace.tsx:109`, package cards, and the "Get started"/"Explore catalog" buttons on the home hero. Add `aria-current="page"` (not present in the grep of `header.tsx`).

**W-4 (Medium) No canonical URL / per-route OG.** [V] `canonical:` and `og:url:` empty on `/marketplace`. Add `alternates: { canonical: "/<route>" }` and `openGraph.url` in each `generateMetadata` branch; add `export const viewport` with `themeColor`. `metadataBase` is hard-coded in `layout.tsx:18`; read it from `process.env.NEXT_PUBLIC_SITE_URL` (the sitemap and robots also hard-code the same host: `sitemap.ts:5`, `robots.ts:3`).

**W-5 (Medium) Titles are mojibake and inconsistent.** [V] `app.tsx:50-64` and `[...slug]/page.tsx:44,59,65,73,79,86,93,100` have `�` instead of an em dash, and mix `-` and `—`. Also `marketplace.tsx:186,302,304` ("�" in visible text), and `app.tsx` overwrites the server title on every navigation with a short, generic one ("Package � LiteSPM"). Fix: save these files as UTF-8, use `-` or a real `—` consistently, and drive the title through `generateMetadata` plus `document.title` only on client-side route changes with the same strings (put them in one `ROUTE_TITLES` map imported by both).

**W-6 (Medium) Sitemap URLs.** [V] `/agents/<id>` should be `/agent/<id>` (or make the router accept both, and redirect `/agents/<id>` → `/agent/<id>`). `lastModified: new Date()` on every URL tells crawlers everything changed on each fetch; use `release.createdAt`. Only 500 packages are listed out of ~69k; consider paginated sitemaps (`generateSitemaps`) for the verified installables (≈ 25k+).

**W-7 (Medium) Favicons/icons.** `layout.tsx:36-44` declares `/icon.svg`, `/favicon.ico`, `/brand/icon.svg` and uses an SVG as `apple`. iOS needs a 180×180 PNG. Add `app/apple-icon.png`. `og.png` is 37 KB and 1200×630 [I from size]; it is the same image for every route; consider `opengraph-image.tsx` for packages (title + kind + publisher).

**W-8 (Low) Header announcement bar.** `header.tsx:84` navigates to `#/insights` (legacy hash form; works through `toPath` but it is the only remaining caller). Use `/insights`.

**W-9 (Low) Stale copy.** `app.tsx` page title uses "Explore the catalog" and Marketplace separately; after the merge, update. `footer.tsx:38` links to the `ARCH` tree on GitHub [I: the link target exists in the repo]. `footer.tsx` "Architecture" is fine. The footer has no Status/Changelog/Security links; add `SECURITY.md` and `CHANGELOG.md` (both exist at repo root).

**W-10 (Low) Broken-link check.** I did not crawl every link [U]. Every in-app link goes through `navigate()`; external links are `github.com/sarv-projects/LiteSPM` and `npmjs.com/package/litespm`. A link checker belongs in CI: add `lychee` or a 40-line Node script over `sitemap.xml`.

## 2.3 Accessibility
- [V] Skip link exists (`app.tsx:139-144`). Good.
- [V] Primary/mobile `<nav>` have `aria-label`. The mobile toggle has `aria-label` but I did not see `aria-expanded`/`aria-controls` in the grep [I]; add them.
- [V] Route changes call `window.scrollTo` but do not move focus or announce the new page. Add `main.focus()` (with `tabIndex={-1}`) and an `aria-live="polite"` region that reads the new `document.title`.
- [V] `layout.tsx:80` sets `defaultTheme="dark"` with `enableSystem`: with `defaultTheme="dark"` `enableSystem` only applies when theme is `system`. Set `defaultTheme="system"` if OS preference should win.
- [V] `layout.tsx:76` `suppressHydrationWarning` is required for next-themes; fine.
- [I] Many small text sizes (`text-[10.5px]`, `text-[11px]`) with `text-muted-foreground/80` in cards (`marketplace.tsx:100`) are unlikely to meet 4.5:1. Run axe on `/explore`.
- [V] Icon-only buttons have `aria-label` in the places I read.

---

# 3. UI/UX and animation

## 3.1 State of motion
- framer-motion is imported in 8 components (`app.tsx`, `assistant.tsx`, `home.tsx` (32 matches), `package-card.tsx`, `agents.tsx`, `compare.tsx`, `insights.tsx`, `publish.tsx`).
- [V] `grep` for `prefers-reduced-motion`, `useReducedMotion` or `MotionConfig` in `components/` returned nothing, and `globals.css` has no reduced-motion media query. **Motion does not respect `prefers-reduced-motion` anywhere on the site.** `ARCH/40` says reduced-motion "should be respected by any future animation additions" — the existing ones are not.
- [V] Every route change re-keys `<motion.main>` with `y: 8 → 0` fade (`app.tsx:148-153`) — the main content is *invisible* (opacity 0) at first paint of every route. This directly delays LCP, because framer starts at `opacity: 0` and SSR HTML is shipped with that inline style [I; this is how framer SSR renders `initial`].

### Fixes
```tsx
// app/layout.tsx or app.tsx
import { MotionConfig } from "framer-motion";
<MotionConfig reducedMotion="user">{children}</MotionConfig>
```
```css
/* globals.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
}
```
And for the route fade: `initial={false}` on first mount (so SSR HTML is visible), animate only on client navigations; use `opacity` only, no `y`, under 150 ms.

## 3.2 Improvements to add (ordered by value)
1. **Skeletons instead of spinners.** `marketplace.tsx:160-166` shows a centred spinner, "Searching the live catalog.". `components/ui/skeleton.tsx` exists and is unused (my import check was partial, see 7.1). Show 6–12 card skeletons with the final card height (`min-h` on the title/summary already helps) to remove CLS and improve perceived speed. Keep previous results dimmed during a refetch (see the hook in 1.5A) rather than blanking.
2. **Empty states with actions.** `marketplace.tsx:174-179` says "No installable skills match this search." Add: the query echoed, "Search all kinds", "Clear filters", and 3 suggested queries, plus a link to Publish.
3. **Keyboard.** `⌘K` palette exists. Add `/` to focus the search input, `j/k` and arrow navigation across result cards, `Enter` to open, `c` to copy install command; roving `tabindex` on result lists. Add a "Skip to results" link on Explore.
4. **Result list semantics.** Cards are `<article>` with a `<button>` as the only link (W-3). Make the whole title an `<a>`; add `aria-live="polite"` on the "N results" line so screen readers hear the count change.
5. **Mobile.** Header has a menu; the Explore facet UI is the main risk. [U] I did not test it at 375 px. Put filters in a bottom `Sheet`/`Drawer` (components exist) with an "Apply" and a count, and make the compare tray (`app.tsx:79`, `fixed bottom-4`) not overlap the Ask AI launcher; add `pb-[env(safe-area-inset-bottom)]`.
6. **Copy feedback.** `InstallCommand` flips an icon for 1.4 s (`marketplace.tsx:71-72`). Add a `toast`/`aria-live` "Copied" for screen readers, and a fallback `document.execCommand("copy")` path or a text-select when `navigator.clipboard` is missing (`copyText` rejects, and the `.then` has no `.catch` → unhandled rejection) [V].
7. **Hero.** Count-up numbers via `animate`/`useInView` in `home.tsx` should render the final value in SSR and skip the count under reduced motion.
8. **Terminal demo** (`terminal.tsx`, 11.7 KB): pause when off-screen (`useInView`), static final frame under reduced motion.
9. **Scroll restoration.** `window.scrollTo({top:0})` on every route change (`app.tsx:131`) also fires on Explore filter/page changes and on Back, losing position. Only reset when the *view* changes, and restore on `popstate`.
10. **Theme.** Ship a light-theme visual check; the default is dark.

## 3.3 Design consistency vs ARCH/25
[V] `ARCH/25-WEB-FRONTEND-UI.md` describes a different site: "Next.js 15 / React 19 **Static Export**" (line 9), `output: 'export'`, `trailingSlash: true` (line 42), server-component `explore/page.tsx` (line 47), a 48 px header at `web/components/navigation/Header.tsx` (line 82), "ruled" `border-2 border-ink bg-surface` inputs (line 90). The shipped code is `output: "standalone"`, Next 16, a single client SPA under `src/components/litespm/`, shadcn-style rounded cards (`rounded-2xl border-border/70 bg-card`), and a search input pattern with `rounded-lg`. The doc and the product have diverged. Either rewrite ARCH/25 to the current implementation (preferred, and the doc is also fed to the Ask AI knowledge base, see section 6), or move it to a "historical design" note. Specific replacements are in section 8.

---

# 4. Online documentation: pages to update or add

Current docs (`views/docs.tsx:13-21`): introduction, getting-started, commands, install-flow, hosts, inside-agent, security, publishing, troubleshooting. All nine render at `/docs/<id>`. The commands table already lists `skills add/use/find/adopt`, `adopt`, `import`, `marketplace` (`docs.tsx:28-54`).

## 4.1 What is stale or missing
| Page | Problem | Action |
|---|---|---|
| `inside-agent` (`docs.tsx:434-475`) | Says the in-agent prompt "reaches the same catalog". Does not explain that search is local, that `catalog sync` is needed, or how freshness works. Lists Claude Code/Codex/Cline/OpenCode/Qwen only; the installer command (`marketplace_command.go`) also handles Amp, GitHub Copilot, Pi and others via per-host assets [V file list; I coverage]. Does not list the 13 tools. | **Rewrite** (text below) |
| `inside-agent` | No mention of `/litespm-marketplace`. | Add to the per-agent table |
| `commands` | No `litespm marketplace rows` entry (flags `--json --query --host --kind --limit --installable`, schema `litespm.marketplace.rows/v1`). | **Add row + page section** |
| `hosts` | Host count correct (52/47/81). The four non-remote hosts (`codestudio`, `iflow-cli`, `mux`, `zcode`) should be named, with the reason. `AGENTS.md` still says 50/46. | Add a small table |
| `getting-started` | Hard-coded "0.6.0". | Drive from `published-cli.json` via `/api/litespm/stats` |
| NEW `bridge-tools` | The 13 bridge tools including `adopt_capability` are not documented anywhere on the site. | **Add page** |
| NEW `skills` | Skills CLI is a first-class surface (AGENTS.md §0) but sits in a single table row. | **Add page** |
| NEW `catalog-and-releases` | No page explains the release tree, `current.json`, `catalog sync`, release ids, verification. | **Add page** |
| NEW `changelog` / `status` | Nothing links shipped-vs-planned. | Link to `STATUS.md` and `CHANGELOG.md`; or render them |

Code change for new pages: extend the section array at `docs.tsx:13-21`, `footer.tsx:25-29`, and the `generateStaticParams` list in W-2. Titles in `[...slug]/page.tsx:85-90` need per-section titles (today every docs page has the title "Documentation").

## 4.2 Drop-in text

### Page: "Inside your agent" (replace `InsideAgent`)
> **Inside your agent**
> After `litespm` (or `litespm host setup <agent>`) adds the LiteSPM bridge to your agent, the agent can use LiteSPM in two ways: a *marketplace command* you type, and 13 *tools* the model can call.
>
> **Where the search happens.** The marketplace command does not call this website. It asks the bridge, which searches the catalog **stored on your machine**. Run `litespm catalog sync` to refresh it; the website and your local catalog read the same signed release, so they list the same packages, but your local copy is only as new as your last sync. Nothing you type is sent to this site.
>
> | Agent | Command | Notes |
> |---|---|---|
> | Claude Code | `/marketplace` (and `/litespm-marketplace`) | Plugin and hooks are installed under your Claude config directory |
> | OpenAI Codex | `/marketplace` | |
> | Cline | `/marketplace` | |
> | OpenCode | `/litespm:marketplace` | Type it, accept the completion, press Enter again |
> | Qwen Code | not available | MCP prompts are not mapped to slash commands in 0.14.4; run `/mcp` and ask the agent to search the LiteSPM catalog |
> | Other hosts | see *Agent hosts* | Hosts with a command asset (for example Amp, GitHub Copilot, Pi) get `/litespm-marketplace` where the host supports custom commands |
>
> Commands print text into the agent's transcript. MCP has no portable window, so for a visual catalog run `litespm marketplace` in a terminal.
>
> **Approval.** An agent can search, prepare an install plan and ask you to approve it. It cannot approve for you: approval is a single-use token from `litespm approve <plan-id>`.
> *Content to confirm against the code before publishing: the exact per-host command names in `internal/host/marketplace_command.go`.*

### Page: "Bridge tools" (new, id `bridge-tools`)
> **Bridge tools**
> The `litespm` MCP server exposes 13 tools.
>
> | Tool | What it does | Writes anything? |
> |---|---|---|
> | `search_catalog` | Search the local catalog by text, kind and host | No |
> | `get_extension` | Full record for one listing | No |
> | `prepare_install` | Build an install plan (add `allowPartial` to accept a partial plugin install) | No, plan only |
> | `request_install` | Run a plan **after** you approved it | Yes, only with a valid approval token |
> | `list_installed` | What LiteSPM owns plus detected external items | No |
> | `load_skill`, `read_skill_resource` | Read an installed skill and its files | No |
> | `search_capabilities`, `describe_capability`, `invoke_capability` | Discover and call capabilities of installed servers | Depends on the capability |
> | `adopt_capability` | Take ownership of an MCP server already in your host config. Records ownership only; no byte of your config changes, and removal restores it | Ledger only |
> | `get_invocation`, `cancel_invocation` | Read or cancel a running invocation by id; unknown ids return `LPSM-INVOCATION-NOT-FOUND` | No |
> *Source for this table: AGENTS.md §3. The one-line behaviours of `get_extension` and `invoke_capability` are my reading of their names; verify against `internal/bridge` before publishing [U].*

### Section: `litespm marketplace rows` (add to "Command reference")
> `litespm marketplace rows [--json] [--query <text>] [--host <id>] [--kind mcp|skill|plugin|installed] [--limit N] [--installable]`
> Prints the rows an in-agent marketplace popup renders: the local catalog search merged with what is already installed. `--json` emits schema `litespm.marketplace.rows/v1`. Use `--installable` to hide listings LiteSPM will not install, `--kind installed` for the Installed tab, and `--host` to filter by agent. If the local catalog is empty the output tells you to run `litespm catalog sync`.
> *Flag defaults are not documented here because I did not read the flag parser's default values past line 125 [U].*

### Page: "Skills" (new)
> **Skills**
> `litespm skills` is a complete skills manager.
> - `skills add <source>` — plan, approve and copy skills into each target agent's skills folder. Sources: `owner/repo`, an https/ssh git URL, a local folder, a GitHub/GitLab page URL, or a direct download (`SKILL.md`, `.zip`, `.tar`, `.tar.gz`). `--skill '*'`, `--agent '*'`, `--all` select in bulk; `--force` overwrites after printing `overwrites: <path>`, a digest and a backup.
> - `skills use <source>[@<skill>]` — prints the skill's prompt, installs nothing: `litespm skills use owner/repo | claude`.
> - `skills find [<query>] [--owner <org>]`, `skills list`, `skills update [<name>…]`, `skills remove`.
> - `skills adopt <name>` — take ownership of a skill already in an agent's folder; nothing is reinstalled or rewritten; `skills update` refuses adopted skills (no recorded source).
> - `litespm init [name]` scaffolds a `SKILL.md`.
> `http://`, `file:` and `ftp://` sources are refused. Skills marked `metadata.internal: true` are hidden unless `INSTALL_INTERNAL_SKILLS=1`.

### Page: "Catalog and releases" (new)
> **Catalog and releases**
> The catalog is a signed, immutable release tree: `/v1/current.json` names the current release; `/v1/releases/<id>/` holds `manifest.json` and sharded `listings-NNNN.json` / `versions-NNNN.json`. `litespm catalog sync` downloads it and verifies each file against the manifest digest. Releases are never overwritten. This website shows the release it was built from; the origin may be one release behind while a new one is published.

### Small edits
- `hosts` page: "47 of 52 hosts accept a remote URL entry. The other five publish no vendor-documented entry shape, so LiteSPM refuses them with `LPSM-HOST-REMOTE-UNSUPPORTED` rather than guess." **Note:** AGENTS.md names four (`codestudio`, `iflow-cli`, `mux`, `zcode`); 52 − 47 = 5, so one name is missing. Check `hosts.json` for the host with `remote: false` and list all five [V arithmetic; U which host].
- `getting-started`: replace "0.6.0" with the value of `published-cli.json[0].version`.

---

# 5. Rendering speed

## 5.1 Live measurements (from this machine, 2026-11-10, one sample each; single runs, treat as indicative)
| URL | Status | Time (ms) | Bytes | Cache-Control |
|---|---|---|---|---|
| `/` | 200 | 547 | 83,976 | `no-store` (all HTML) |
| `/marketplace` | 200 | 1,870 | 83,484 | `no-store` |
| `/explore` | 200 | 612 | 83,423 | `no-store` |
| `/docs` | 200 | 622 | 83,406 | `no-store` |
| Cloudflare `/v1/current.json` | 200 | 796 | 210 | — |
| `/api/litespm/list?…q=github` (cold) | 200 | **5,380** | 34,170 | none |
| `/api/litespm/list?…q=postgres` | 200 | 472 | 38,554 | none |

HTML is ≈ 83 KB for every route (the same home markup). Fonts: two preloaded `woff2` (Geist, Geist Mono) via `next/font/google` (self-hosted at build) [V `Link` header]. Preloading the mono font on all pages is wasteful; load Geist Mono only on pages with code (`preload: false`).

## 5.2 Build output (`web/.next`, built 2026-11-08)
- `.next/static`: 35 files, 1.53 MB; JS 1.14 MB. Largest chunks: 546,820 B, 224,634 B, 120,138 B, 112,594 B.
- `.next/standalone`: 953 MB, 8,670 files [V]. It includes `data/catalog.json` (60 MB), `public/v1/releases/*` (up to 20 MB shards), and **four stray `query_engine-windows.dll.node.tmp*` copies of 21 MB** from interrupted `prisma generate` runs [V]. These are local artefacts; they do not ship from git, but `postbuild.mjs`/the deploy should assert they are absent.
- Prerendered: only `/`, `/_not-found`, `/_global-error`, `/favicon.ico`, `/icon.svg`, `/robots.txt`, `/sitemap.xml`. Everything else is dynamic [V manifest].

## 5.3 Lighthouse-style concerns (reasoned, not measured)
- **LCP**: the hero lives behind a client-side route switch and a framer `opacity:0` initial state (section 3.1). With HTML at `no-store` and a ≈ 0.5–1.9 s server render, LCP is likely > 2.5 s on mobile [I]. Fixes: W-1, W-2, 3.1.
- **CLS**: SSR renders Home, then swaps to the real view on hydration (`marketplace` page flashes the home hero first); spinners replace content with cards of different height. Fixes: W-1, skeletons.
- **TBT/INP**: 1.19 MB of JS on every route including `assistant.tsx` (59.6 KB source, 17 motion usages), the command palette (cmdk) and all views. `app.tsx:12-22` imports every view statically, so the Compare, Publish, Insights and Package views (60 KB source) load on the home page [V].
  Fix:
  ```tsx
  const Assistant   = dynamic(() => import("./assistant").then(m => m.Assistant), { ssr: false });
  const PackageView = dynamic(() => import("./views/package-detail").then(m => m.PackageView));
  // same for Compare, Publish, Insights, Docs, AgentDetail; CommandPalette on first ⌘K
  ```
  Expected: initial JS drops by roughly the Assistant + non-home views — I estimate 25–40 % [I, unmeasured; verify with `next build` analyzer].
- **Home fan-out**: 5 API calls on mount (`home.tsx:88-104`), each of which can hit a cold function. Combine into `/api/litespm/home` (one cached response) or render the shelves on the server from `featured.json`/`trending` with `revalidate`.
- **Images**: `public/brands` has 48 files, 135,779 B total (small). `og.png` 37 KB. `next/image` use: [U] I did not grep for `<img` vs `<Image`.
- **Fonts**: OK (self-hosted, `display: swap` is the `next/font` default).
- **Compression/headers**: `web/public/_headers` does not exist [V]; headers rely on Vercel defaults. HSTS is present (`max-age=63072000; includeSubDomains; preload`) [V]. No CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy or frame protection observed in the response headers of `/marketplace` [V]; see section 7.
- **Cloudflare origin** (`wrangler.toml`): the Worker serves `/v1` from assets and redirects every other path to `WEB_ORIGIN`. A 20 MB shard per release is immutable, so add `Cache-Control: public, max-age=31536000, immutable` for `/v1/releases/*` and a short TTL (60 s) for `/v1/current.json` in `worker/index.js` [I: I did not read the worker].

## 5.4 Fix list in order of ROI
1. W-2 static + ISR HTML, plus `Cache-Control` on `/api/litespm/list`.
2. W-1 route-aware SSR (stops flash and CLS).
3. `dynamic()` split of Assistant and non-home views; drop `y` motion on first paint.
4. Pre-warm + index sharding (1.5C) to kill the 5 s cold query.
5. Per-route `outputFileTracingIncludes` to keep `catalog.json` out of list/stats/featured functions.

---

# 6. Ask AI widget — architecture audit

Read: `ARCH/40-ASK-AI-ASSISTANT.md`, `api/litespm/assistant/route.ts` (17 KB), `server/litespm/{assistant-*,rate-limit,request-body}.ts`, `server/llm/{gateway,providers}.ts`, headers of `components/litespm/assistant.tsx` (59.6 KB; I did not read all of it) [partial].

## 6.1 Architecture as built [V unless marked]
- Client `assistant.tsx` → `POST /api/litespm/assistant` (`dynamic = "force-dynamic"`, `maxDuration = 60`, lines 14-15), optional streaming (`body.stream === true`, line 196), keeps the last 20 turns (`.slice(-20)`, line 112), body capped at 96 KB (`readJsonBody(request, 96 * 1024)`, line 125), `maxTokens: 1400`, `temperature: 0.2` (line 195).
- Orchestrator classifies intent (conversation / knowledge / catalog), retrieves with BM25 + local feature-vector cosine + deterministic rerank (`assistant-retrieval.ts`, `assistant-knowledge.ts`), optional embeddings via an OpenAI-compatible API, and allowlisted read-only tools (`search_catalog`, `search_documentation`, `list_supported_hosts`, `inspect_host`) per ARCH/40.
- The LLM gateway (`server/llm/gateway.ts`, `providers.ts`) is a multi-provider failover; env keys are `LLM_PROVIDER_ORDER`, `GROQ_MODELS`, `GROQ_API_KEY_1..3`, `DATABASE_URL` (key *names* only; values not read). `web/.env` is gitignored (`web/.gitignore:17`) and `git ls-files` confirms only `.env.example` is tracked [V]. `scripts/check-no-embedded-secrets.mjs` runs in `npm run lint`.
- Grounding: package claims not present in retrieved evidence are replaced with verified matches (ARCH/40 "Catalog retrieval"; `assistant-grounding.ts`). Streaming of unverified prose is deliberately delayed (comment near `route.ts:229`).
- Abuse: per-IP fixed window **20 requests / 5 min** (`route.ts:17-19,118`), plus an additional global per-instance sliding budget (`route.ts:126`). The client IP uses the platform hop, not the leftmost `x-forwarded-for` (`rate-limit.ts:126-139`), which is the right call.

## 6.2 Findings

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| AI-1 | High | **Rate limits and the cost budget are per-instance memory.** On Vercel each instance has its own map, so N concurrent instances allow N× the traffic and N× the LLM spend. The file says so itself. A cold-start also resets counts. | `rate-limit.ts:2-6` | Use a shared store: Vercel KV/Upstash Redis (`@upstash/ratelimit` sliding window, ~10 lines), keyed by IP **and** by a signed anonymous cookie id. Keep the in-memory limiter as a fast pre-check. Add a daily global token budget with a hard stop. |
| AI-2 | High | **No visible cost accounting.** `maxTokens` is capped, but input is not: history is 20 turns × up to 96 KB body. Retrieval context size per request is not bounded in the route that I read. No per-request token log. | `route.ts:112,125,195` | Cap total prompt characters (for example 24 KB after trimming old turns), log `{provider, model, promptTokens, completionTokens, ms}` per request, alert on daily spend, reject `messages[].content` > 4 KB. |
| AI-3 | Medium | **Prompt-injection surface via catalog text.** Listing `summary`/`readme` is publisher-controlled and is placed into the prompt for catalog answers. A malicious listing could say "ignore previous instructions…" and steer the answer or insert links/commands. Mitigations that exist: read-only tool allowlist, grounding check, no install tools. Not seen: delimiting/escaping of retrieved text, or an output filter for shell commands and URLs not in the evidence. | `assistant-grounding.ts`; ARCH/40 "Function tools" | Wrap each retrieved item in a fixed delimiter block labelled untrusted ("DATA, not instructions"), strip control characters, truncate to 300 chars (already the cap in `dataset.ts:313`), and post-filter the answer: any `curl|sh`, `npx`, `pip install`, URL or `litespm install <id>` must appear in the evidence set, otherwise drop it. Add 10 injection fixtures to `scripts/test-assistant-rag.ts`. |
| AI-4 | Medium | **The generated knowledge file is 3.3 MB, imported with a static `import`** so it is part of the server bundle and parsed at module load of every function that touches the assistant. | `assistant-knowledge.ts:9`; file size 3,317,278 B | Lazy `await import()` inside the first retrieval, or read it from `data/` with `readFileSync` once. Add `import "server-only"`. Precompute BM25 stats at build time. |
| AI-5 | Medium | **`assistant.tsx` (59.6 KB source) is in the main client bundle** and mounts on every page. | `app.tsx:12,171` | `dynamic(() => import("./assistant"), { ssr:false })`, rendered only after first interaction or idle (`requestIdleCallback`); keep a tiny launcher button in the main bundle. |
| AI-6 | Medium | **Knowledge corpus includes docs that are themselves stale** (README/STATUS/AGENTS/ARCH feed the RAG). While `web/README.md`, `ARCH/25`, `STATUS.md:61` carry old numbers, the assistant can repeat them. | `scripts/build-assistant-knowledge.mjs` inputs per ARCH/40; section 8 | Fix the docs (section 8). Add a CI check that fails when the corpus contains "50 hosts", "46 remote", "static export" (extend `scripts/check-assistant-product.mjs`). Stamp each chunk with the source file's last-modified date and prefer the newest on conflicts. |
| AI-7 | Low | **Error and empty states** I could not fully evaluate; the route returns 429 with `Retry-After` (`route.ts:121`) and logs stream failures without leaking provider detail (`route.ts:239,275`). | | Verify the UI shows a friendly "busy, retry in N s" for 429, offers "retry" on stream failure and keeps the partial text. [U] I did not read the client handling. |
| AI-8 | Low | **No response caching.** Common questions ("how do I install", "which hosts are supported") hit the LLM each time. | | Cache the deterministic host/doc answers (there is already `assistant-host-answers.ts` for host questions) and cache `(normalised question, releaseId)` → answer for 1 h for non-conversational intents. |
| AI-9 | Low | **Observability.** No structured log or counter on intent mode, retrieval hit count, grounding replacements, provider fallbacks. | | Emit one JSON log line per request; chart "grounding replaced N claims" as a quality signal. |
| AI-10 | Low | **Feedback/views write to a DB** (`feedback/route.ts:60`, `view/route.ts:38-45`) through Prisma + libsql. If `DATABASE_URL` is a local `file:` SQLite on Vercel, writes are ephemeral or fail [I: I did not read the value]. | `db.ts`, `.env` key list | Confirm it is a remote Turso URL. If not, either wire Turso or drop the tables and use a log drain. |

## 6.3 Prioritised improvements for Ask AI
1. AI-1 shared limiter + daily budget (S–M).
2. AI-3 untrusted-delimiter + output filter + tests (M).
3. AI-5 + AI-4 lazy-load client and corpus (S).
4. AI-2 prompt budget and spend log (S).
5. AI-6 docs fixed and CI guard (S).
6. AI-8 answer cache (S).

---

# 7. Other optimisations

**7.1 Dependencies and dead code** (grep of `src/` for each package name; approximate, [I] because the grep partially failed on bracketed paths such as `[...slug]` and `[id]`, which do not use these packages):
- No import found for: `next-auth`, `next-intl`, `@dnd-kit/*`, `@mdxeditor/editor`, `@tanstack/react-table`, `uuid`, `@reactuses/core`. `@mdxeditor/editor` is large. Removing them cuts install size and the lockfile surface. Run `npx depcheck` to confirm before deleting.
- `z-ai-web-dev-sdk` appears in 2 files; check whether it is a leftover scaffold dependency [U].
- `components/ui/` has ~50 shadcn files; roughly 38 of them (`accordion`, `calendar`, `carousel`, `chart`, `sidebar`, `menubar`, `drawer`, `input-otp`, `resizable`, …) have no import from `components/litespm` per my check (which may undercount). Unused UI files are not bundled by webpack/turbopack, so this is a hygiene issue, not a size issue. `react-day-picker`, `embla-carousel-react`, `input-otp`, `recharts`, `vaul`, `react-resizable-panels` exist only to serve those files; remove together.
- `web/package.json` version is `0.2.1` and does not follow the CLI (`0.6.x`). Harmless; label it clearly or sync it.
- Both `bun.lock` and `package-lock.json` are committed. `test:host-paths` needs `bun`, the build uses npm. Pick one lockfile.
- `reactStrictMode: false` (`next.config.ts:5`) hides double-effect bugs; turn on in dev and fix what appears.
- `allowedDevOrigins: ["*.space-z.ai", …]` is a leftover from a scaffold host.

**7.2 Duplicate data copies** [V]
- `web/data/catalog.json` (59.9 MB), `search-catalog.json.gz` (8.0 MB), `search-index.json.gz` (9.7 MB), `skills-sh-sources.json` (4.8 MB), `directory-mcp-resolutions.json` (0.7 MB) are all committed (`git ls-files web/data`). `public/v1/releases/` (8 releases, 522 MB) is gitignored but sits in the working tree and is copied into `.next/standalone`. `public/data/` is 6,721 files, 172.8 MB (gitignored per `web/.gitignore:26`).
- The same listings exist in the Go repo's release tree and again as `web/data/catalog.json`. Single-source them: have `build` fetch `/v1/current.json` + shards (verified by digest) into `web/data/` rather than committing a 60 MB blob; commit only `release.json`.
- Add a postbuild guard that fails if `.next/standalone` > 300 MB or contains `*.tmp*`.
- Delete old releases from the local `public/v1/releases/` (7 old ones ≈ 440 MB) — local housekeeping, not done here.

**7.3 Security headers / CSP** [V none present in the fetched response beyond HSTS]
```ts
// next.config.ts — headers() patch sketch
async headers() {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",           // Next inline bootstrap; move to nonce-based CSP via middleware when feasible
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ].join("; ");
  return [{ source: "/:path*", headers: [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-Frame-Options", value: "DENY" },
  ]}];
},
```
Also add `Cache-Control: public, max-age=31536000, immutable` for `/_next/static` (Vercel does this by default) and for `/brands/*`.

**7.4 API hygiene**
- `/api/litespm/list`: unbounded `pageSize` (E in 1.5). `/api/litespm/search-catalog` and `/search-index` are dev-only and return 404 in production [V `route.ts` 12-14]. Good, but they are still in the route manifest; guard them at build time or move them to `scripts/`.
- `view` and `feedback` routes rate-limit with the same per-instance map (AI-1).
- `robots.ts` disallows `/api/` and allows everything else; fine.

**7.5 Build config**
- `outputFileTracingIncludes: {"/*": ["./data/**/*"], "/api/**/*": [...]}` (`next.config.ts:11-14`) copies all data into every route trace; make it route-specific.
- `build` runs `build-assistant-knowledge.mjs` then `prisma generate` then `next build` — Prisma Client (≈ 21 MB query engine ×N) is shipped for two small tables; if Turso/libsql is the only DB, the Prisma adapter route can be replaced by `@libsql/client` directly (already a dependency), dropping 21+ MB from the function.

---

# 8. Markdown staleness (steering: "check all md files")

Scanned 756 `.md` files outside `node_modules`, `.git`, `source-snapshots`, `.agents`, `.hostnotes-work`, `.next`, `vendor` with a pattern for old host counts, tool counts, versions and release ids. I read only the hits, not every file [partial]. **Truth used:** 52 host adapters, 47 remote-capable, 81 skill targets, 13 bridge tools, `litespm@0.6.0` published (npm/package.json 0.6.1 unpublished), repo release `rel-2026-11-05-03` seq 154, live origin `rel-2026-10-21-01` seq 151.

| File:line | Stale content | Fix |
|---|---|---|
| `AGENTS.md:72` | "**50 MCP bridge targets** and 81 skill targets", "46 of the 50 hosts" in the Remote paragraph | 52 / 47 and the five non-remote hosts |
| `AGENTS.md:105` | "currently 50 hosts" | 52 |
| `AGENTS.md` State block | "The catalog release tree is published and the live origin serves it" with no release id | Add `rel-2026-11-05-03` once deployed; until then say the origin is on seq 151 |
| `web/README.md:43` | "`hosts.json` 50 host adapters" | 52 |
| `web/README.md:85` | "46 hosts accept a remote entry" | 47 |
| `web/README.md:93` | Sentence "`hosts.json` no longer has 50 hosts / 46 remote-capable hosts" is a confusing negative statement | Reword to a positive 52/47 |
| `STATUS.md:61` | "`web/` builds a Next.js **static export**" | It is `output: "standalone"` on Vercel (next.config.ts:4). |
| `STATUS.md:77-83` | "Current release: `rel-2026-10-21-01` (sequence 151)" while lines 96+ describe `rel-2026-11-05-03` seq 154 as cut | One "Current release" heading; say "published: 151; cut, awaiting publish: 154" until the origin is updated |
| `ARCH/25-WEB-FRONTEND-UI.md:9,42,47,82,90` | Static Export, `output:'export'`, `trailingSlash`, server-component explore page, `web/components/navigation/Header.tsx`, ruled inputs | Rewrite to the shipped SPA (section 3.3) or mark historical |
| `ARCH/00-INDEX.md:21-22` | Release `rel-2026-10-21-01` seq 151 as current | Update when the origin is updated |
| `AUDIT.md:163,189` | R2 "release never deployed" `[OPEN]`; "50 hosts (46 remote-capable)" | Still true for R2 today (live is 151) — keep OPEN; change 50/46 to 52/47 |
| `npm/README.md:143,169-172` | "published package is `litespm@0.6.0`", sample output "Release rel-2026-10-15-01" | Fine until 0.6.1 ships; update release sample |
| `CURRENT_RUN.md`, `CHANGELOG.md`, `HANDOFF.md`, `REMEDIATION-PLAN.md`, `TODO.md` | Dated logs referencing 50 hosts, 0.5.0, 2026-10 releases | Historical; do not edit. Add a one-line header "Historical log — see STATUS.md for current state" to `CURRENT_RUN.md` (246 KB) and `TODO.md` (113 KB) so the Ask AI corpus and readers don't treat them as current. ARCH/40 says internal audit/plan notes are excluded from RAG; confirm the exclusion list covers these. |
| `README.md` | 52 hosts, 81 targets, 13 tools match truth (lines 42, 71) | OK. Line 12 "litespm/Explore" link: keep after the merge by pointing to `/explore` |
| `SECURITY.md` | not checked in detail [U] | |
| `TEST.md` (2026-10-20) | not read [U] | |

Not checked: the other ~740 `.md` files (ARCH docs 01–39, `docs/`, `.hostnotes-work` notes, vendor snapshots).

---

# Prioritised backlog

Effort: S ≤ ½ day, M ≈ 1–3 days, L > 3 days.

| ID | Effort | Impact | Item | File(s) |
|---|---|---|---|---|
| B-01 | M | High | Route-aware SSR: pass initial route; stop rendering Home on every URL (W-1) | `app/[...slug]/page.tsx`, `components/litespm/app.tsx`, `lib/litespm/router.ts` |
| B-02 | S | High | Static/ISR HTML via `generateStaticParams` + `revalidate`; remove `no-store` (W-2) | `app/[...slug]/page.tsx` |
| B-03 | S | High | `Cache-Control` on `/api/litespm/list` (+ release id in key), clamp `pageSize`, min/max `q` length | `app/api/litespm/list/route.ts` |
| B-04 | M | High | Replace nav buttons with `<Link>`/`<a href>`, `aria-current` (W-3) | `header.tsx`, `footer.tsx`, `marketplace.tsx`, `package-card.tsx`, `home.tsx` |
| B-05 | M | High | Merge Marketplace into Explore; redirects; move Installed to `/installed` (1.2) | `next.config.ts`, `views/marketplace.tsx`, `views/explore.tsx`, `header.tsx`, `sitemap.ts` |
| B-06 | M | High | Shared `useCatalogSearch` hook (debounce, abort, LRU) used by Explore/Marketplace/palette/home (1.5A) | new `lib/litespm/use-catalog-search.ts`, `explore.tsx:64-112` |
| B-07 | L | High | Sharded prefix index + card shards; remove 8 MB + 9.7 MB cold parse (1.5C) | `scripts/build-search-index.mjs`, `server/litespm/{dataset,bm25,search}.ts` |
| B-08 | S | Med | Pre-warm dataset on boot; pin function region near data | `instrumentation.ts` (new), route `preferredRegion` |
| B-09 | S | High | Publish `rel-2026-11-05-03` to the Cloudflare origin; re-probe `/v1/current.json` | operator action; `wrangler.toml`, `worker/index.js` |
| B-10 | S | Med | Fix sitemap `/agents/<id>` → `/agent/<id>`, `lastModified` = release date, sitemap index for installables (W-6) | `app/sitemap.ts` |
| B-11 | S | Med | Canonical + `og:url` per route; `NEXT_PUBLIC_SITE_URL`; apple-icon PNG (W-4, W-7) | `[...slug]/page.tsx`, `layout.tsx`, `sitemap.ts`, `robots.ts` |
| B-12 | S | Med | Fix mojibake in titles and copy; one `ROUTE_TITLES` map (W-5) | `app.tsx:50-64`, `[...slug]/page.tsx`, `marketplace.tsx:186,302,304` |
| B-13 | S | Med | `MotionConfig reducedMotion="user"` + CSS reduced-motion block; no `opacity:0` on first paint (3.1) | `layout.tsx`, `globals.css`, `app.tsx:148-153` |
| B-14 | M | Med | `dynamic()` split for Assistant and non-home views; load palette on demand (5.3, AI-5) | `app.tsx:12-22,170-171` |
| B-15 | S | Med | Skeletons, richer empty states, aria-live result count, focus management on route change (3.2) | `marketplace.tsx`, `explore.tsx`, `app.tsx` |
| B-16 | M | Med | Home: one cached `/api/litespm/home` instead of 5 requests | `home.tsx:88-104`, new route |
| B-17 | S | Med | Security headers + CSP (7.3) | `next.config.ts` |
| B-18 | M | High | Ask AI: shared (KV/Upstash) rate limit + daily token budget (AI-1, AI-2) | `server/litespm/rate-limit.ts`, `assistant/route.ts:17-19,118-126` |
| B-19 | M | Med | Ask AI: untrusted-data delimiters, output filter, injection tests (AI-3) | `assistant-grounding.ts`, `assistant-orchestrator.ts`, `scripts/test-assistant-rag.ts` |
| B-20 | S | Med | Ask AI: lazy corpus import, `server-only`, answer cache (AI-4, AI-8) | `assistant-knowledge.ts:9` |
| B-21 | M | Med | Docs: rewrite "Inside your agent"; add `bridge-tools`, `skills`, `catalog-and-releases`; add `marketplace rows` row; per-section titles (section 4) | `views/docs.tsx:13-21,28-54,434-475`, `footer.tsx:25-29`, `[...slug]/page.tsx:85-90` |
| B-22 | S | Med | Derive host/target/CLI-version numbers from data; extend `check-web-truth.mjs` (2.1) | `docs.tsx:329,400,428`, `agents.tsx:118`, `layout.tsx`, `scripts/check-web-truth.mjs` |
| B-23 | S | Med | Fix stale counts and "static export" in MD files (section 8) | `AGENTS.md`, `web/README.md`, `STATUS.md:61`, `ARCH/25`, `ARCH/00-INDEX.md`, `AUDIT.md` |
| B-24 | S | Low | Per-route `outputFileTracingIncludes`; drop `catalog.json` from list/stats traces; postbuild size guard | `next.config.ts:11-14`, `scripts/postbuild.mjs` |
| B-25 | M | Low | Remove unused deps and UI files after `depcheck`; one lockfile; `reactStrictMode: true` | `web/package.json`, `components/ui/*` |
| B-26 | S | Low | Clipboard `.catch`, `/` shortcut, mobile filter sheet, scroll-restoration only on view change | `marketplace.tsx:54-57,70`, `app.tsx:130-135` |
| B-27 | S | Low | Local housekeeping: delete old `public/v1/releases/*` (≈ 440 MB) and stray `*.tmp*` Prisma engines in `.next/standalone` | local working tree only |
| B-28 | M | Low | Replace Prisma with direct `@libsql/client` for two tables; confirm `DATABASE_URL` is remote (AI-10, 7.5) | `src/lib/db.ts`, `feedback/route.ts`, `view/route.ts` |
| B-29 | S | Low | Add link checker over the sitemap in CI (W-10) | `.github/workflows/ci.yml` |

# Things I could not verify
- Real LCP/CLS/TBT and any Lighthouse score; the 1.19 MB JS figure is the wire size as reported by PowerShell and may be the decoded size.
- Which npm package accounts for the 546 KB chunk (only string counts).
- Whether Go `search_catalog` and the TS BM25 give the same ranking.
- Full `assistant.tsx` behaviour (error/empty states), the `litespm marketplace` browser command, `worker/index.js`, the value of `DATABASE_URL`, and mobile layouts at narrow widths.
- ~740 other Markdown files.
