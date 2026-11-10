# `web/` - LiteSPM public marketplace site

A **Next.js 16 App Router** application (`output: "standalone"`) with React 19 and
Tailwind CSS 4. It publishes the catalog, package detail, compare, agents, insights and
docs views, and it also hosts the Ask AI assistant API. It is not a static export: the app
has API routes, Prisma/libSQL storage and a Node server.

The site is deployed on Vercel at <https://lite-spm-nine.vercel.app>. The Cloudflare
Worker in `../worker/` owns only the signed `/v1` catalog tree and redirects every other
path to that origin.

A dated audit of this site, with measurements, is in [`AUDIT-WEBSITE-2026-11.md`](AUDIT-WEBSITE-2026-11.md).

## 1. Commands

| Command | What it does |
|---|---|
| `npm ci` | Install from `package-lock.json` (a `bun.lock` also exists; npm is what CI and the gates use). |
| `npm run dev` | Local dev server on port 3000 (`predev` regenerates site facts and the assistant corpus). |
| `npm run build` | `build-site-facts`, `build-assistant-knowledge`, `prisma generate`, `next build`, then `postbuild` copies static assets into `.next/standalone/` and removes any `.env*`. |
| `npm run start` | `node .next/standalone/server.js` (after `npm run build`; set `PORT` / `HOSTNAME`). |
| `npm run type-check` | `prisma generate && tsc --noEmit`. |
| `npm run lint` | `eslint .` plus four local gates: `check-no-embedded-secrets`, `check-web-truth`, `check-assistant-product`, `check-web-hardening`. |
| `npm run build:search-index` | Regenerate the committed `data/search-*.json.gz` files after `data/catalog.json` changes (read the header of `scripts/build-search-index.mjs` first; it expects the dev exporters' output). |
| `npm run db:generate` / `db:push` / `db:migrate` | Prisma client and schema operations. |

The app needs `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in production. Without a remote
libSQL URL, `databaseConfigured()` returns false and the view/feedback routes return a
clear `503` instead of pretending a write reached a read-only filesystem. Local
development may use the `file:` fallback from `prisma/schema.prisma`.

## 2. Layout

```text
web/
  src/app/                  App Router shell, [...slug] route (metadata + real 404s), API routes
    api/litespm/            list, package, compare, agents, insights, trending, view,
                            feedback, assistant, llm, stats, featured, installed
  src/components/litespm/   client shell, header/footer, NavLink, palette, assistant, views
    views/catalog-browser   the one search surface (search, facets, pagination)
    views/marketplace       /marketplace: tabs (All / MCP / Skills / Plugins / Installed)
  src/lib/litespm/          router, hooks, formatting, types, in-agent.ts (command table),
                            site-facts.json (GENERATED - see below)
  src/server/litespm/       dataset, search (bm25 + text), hosts, package detail, type specs,
                            availability, identity, insights, rate limit, assistant-*
  src/server/llm/           multi-provider gateway (env credentials only)
  data/catalog.json         committed producer dataset (~57 MB, 69,376 rows)
  data/search-*.json.gz     compact projection + precomputed BM25F index (loaded at runtime)
  data/hosts.json           host adapters (generated from internal/host)
  data/skill-targets.json   skill targets (generated from internal/skills)
  prisma/schema.prisma      PackageView, FeedbackEntry, ...
  scripts/                  truth/secret/hardening gates, data builders
```

### Routing

Routing is the custom path router in `src/lib/litespm/router.ts`; the App Router serves one
client shell and supplies server metadata. Anchors are real `<a href>` (`NavLink`) in the
header, footer, docs navigation and package cards, so open-in-new-tab, copy-link and
crawlers work. Legacy `#/path` URLs are upgraded in place. `/[...slug]` returns a real
`404` for an unknown first segment or an unknown package key.

### One catalog surface: `/marketplace`

Explore and Marketplace used to be two pages over the same `/api/litespm/list` API. They are
now one: **`/marketplace`** is canonical (the CLI, the in-agent popups and the docs link
there); **`/explore` redirects to it** (`next.config.ts`, 308). The tab is the kind filter:

`/marketplace?tab=all|mcp|skills|plugins|installed&q=...&goal=&host=&category=&publisher=&installable=1&sort=&page=`

Search is **server-side**: each (debounced) keystroke requests one page of 24 cards
(~20 KB). The browser never holds the catalog. Facet counts come from a separate
`facets=only` request so cards paint first. The old `?kind=` spelling still parses.

### Generated site facts

`scripts/build-site-facts.mjs` derives `src/lib/litespm/site-facts.json` (host count,
remote-capable hosts, local-only host names, skill-target count, listing count, npm
version, bridge tool count) from `data/hosts.json`, `skill-targets.json`, `release.json`
and `published-cli.json`. Metadata, home, docs and agents copy read it; do not retype
those numbers. It runs in `predev`, `build` and `pretype-check`; the file is committed.

## 3. Search architecture

`GET /api/litespm/list` -> `searchCatalog()` (`src/server/litespm/search.ts`).

1. Data: the compact projection (`search-catalog.json.gz`, ~8 MB) - not the 57 MB catalog -
   so a cold function reaches its first result in seconds.
2. Index: a precomputed BM25F index (`search-index.json.gz`) with postings per token.
   Candidates come from the postings of the query terms, so a specific query touches its
   posting lists, not 69k rows. The cache is keyed by release **and** row shape.
3. Query pipeline (`text.ts`): the same splitter, stemmer, alias table and stop-word
   rule the index applies to documents (`next.js` -> `next`, `javascript`; `google-drive`
   -> `google`, `drive`). A term absent from the vocabulary is expanded to vocabulary
   prefixes (search-as-you-type) or one-edit neighbours (typos) before any full scan.
   The slow relaxed full-catalog scan is only a last resort.
4. One pass produces the result pool **and** all nine facet pools (a row's failed-filter
   bitmask decides which pools it belongs to). Facet counts are distinct listings after
   duplicate collapse, so a count equals the total that filter would produce.
5. Ranking: BM25F relevance, ties by the LiteSPM rank score, then name.
6. Caching: per-process LRU of responses (200 entries) and lazily computed per-row meta;
   `Cache-Control: public, max-age=30, s-maxage=300, stale-while-revalidate=3600` (the
   catalog is immutable per release). The route is rate limited (240/min/IP).

## 4. Data and the one installability rule

`src/server/litespm/dataset.ts` parses `data/catalog.json` once per process (used by
package pages, compare, insights); search uses the compact projection. The current release
is `rel-2026-11-05-03`, sequence 154, 69,376 raw rows (69,311 unique): 48,418 MCP servers,
20,320 skills and 638 plugins.

**`availabilityOf()` (`availability.ts`) is the only web-side installability rule**
(search, facets, cards, package pages, trending and the sitemap all call it):

- `discovery_only` never installs;
- a plugin needs a pinned `git-tree` artifact;
- an MCP row needs a command (stdio) or a url (remote);
- a skill needs established installability **and** a `skillSource`.

`hostsFor()` filters remote MCP rows through `hosts.json`'s `remote` and
`remoteTransports`. There is no relay bridge. Catalog-supplied URLs are validated
(`https:` only, git hosts allow-listed for repository links) in `source-resolver.ts`
before they reach an `href`.

## 5. Ask AI assistant (architecture)

```text
assistant.tsx (client, portal)  --POST NDJSON-->  /api/litespm/assistant
   state, memory (opt-in localStorage)              per-IP rate limit (20 / 5 min)
   renders ```json widgets                          global per-instance budget (200 / 5 min)
                                                    intent router -> catalog | knowledge | conversation
                                                    deterministic host-registry answers (no LLM)
                                                    prompt = system + <CATALOG_RESULTS>/<KNOWLEDGE_SOURCES>/<TOOL_RESULTS>
                                                    grounding: citations + catalog ids verified after the LLM
                                                    -> src/server/llm/gateway.ts (key pool, cooldowns, failover)
```

- Knowledge: `scripts/build-assistant-knowledge.mjs` chunks repository docs into
  `src/server/litespm/generated/assistant-knowledge.json`; retrieval is lexical + local
  feature vectors, hybrid-semantic when `EMBEDDING_*` is set.
- LLM gateway: Groq (default), Gemini, NVIDIA NIM, OpenRouter, generic OpenAI-compatible,
  optional Z.AI; ordered by `LLM_PROVIDER_ORDER`; per-key cooldown with backoff;
  20 s per attempt, 15 s time-to-first-token, 20 s idle. **No key is shipped in source.**
- Untrusted text (catalog summaries) is neutralized before prompt insertion (angle
  brackets, backticks, control characters); answers are re-checked against retrieved
  rows; the browser receives only provider/model/timing metadata, never key indexes or
  per-attempt errors.
- Limits are per instance (Vercel runs several); put an edge/WAF rule in front for a hard
  cap. `/api/litespm/llm` is a key-free health snapshot.

## 6. Truth gates

`npm run lint` fails if, among others:

- a `gsk_` credential appears in tracked source;
- `hosts.json` no longer has 52 hosts / 47 remote-capable hosts with the expected five
  local-only ids;
- any page describes a `stdio-to-remote relay` that does not exist;
- `hostsFor` stops consulting `remote`/`remoteTransports`;
- plugin install targets fall back to publisher display names;
- `type-specs.ts` reintroduces a guessed `npx` fallback, a fabricated security posture,
  or an invented plugin manifest;
- `--allow-partial` is described as a pinning bypass;
- search/insights hardcode `sources` empty;
- the install command in `package-card.tsx` stops going through `shellArg`;
- `release.yml` packages `web/out` instead of `.next/standalone`.

These are deliberately narrow and dataset-backed. They are not a general linter.

## 7. Deployment

- **Vercel** runs the standalone app; set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
  and the LLM provider keys (`GROQ_API_KEY_1..n`, etc.) in the project environment.
- **Cloudflare** (`../scripts/deploy-pages.sh` + `../wrangler.toml` + `../worker/`)
  materializes the signed catalog release tree into `pages-dist/`, verifies its digest
  chain, audits it for leaks and size, and deploys a Worker that serves `/v1/*` and
  redirects all other paths to `WEB_ORIGIN`.
- **GitHub Release** packages the standalone server as
  `litespm-web-standalone.tar.gz`; see `../.github/workflows/release.yml`.

## 8. Credential handling

No keystore, vault token or config-file secret may reach `web/`. The only public data
shipped is the catalog metadata and host paths written as `~`/`<project>` placeholders.
The assistant route is an LLM proxy; it requires provider credentials from the
environment and is rate-limited, but it is not authenticated. Put it behind an edge rule
if the deployment is public and cost abuse is a concern. There is no built-in fallback
key: with no configured provider the assistant answers that it cannot reach one.
