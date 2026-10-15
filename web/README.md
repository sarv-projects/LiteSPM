# `web/` — LiteSPM public marketplace site

A **Next.js 15.5.27 static export** (`output: "export"` in `next.config.ts`) of React 19 + Tailwind
CSS 4 that publishes the catalog index: omni-search, category rail, cards, detail pages, host
coverage. Tailwind CSS 4 is consumed through the v3-compat bridge in `web/app/globals.css`
(`@config "../tailwind.config.js"`), so the existing `tailwind.config.js` still drives the theme.
It is a *read-only public site* — it never talks to the local daemon, the bridge, or the
vault.

Capability state: **`SHIPPED`** for the static marketplace and the published catalog — see
[STATUS.md](../STATUS.md) §1–§2. The site and the binary now read the same origin:
`https://litespm.sarveshbh-2022.workers.dev` serves both, and `litespm catalog sync` was verified
against it from a clean data root on 2026-10-05 (probe: release `rel-2026-10-05-01`, sequence 143,
5,814 indexed). That release has since been superseded: the committed pointer and the live origin
both name **`rel-2026-10-11-02`, sequence 147, 69,376 items** (probe 2026-10-13, sharded — see the
`/data/` table in §3), and the `rel-2026-10-05-01` tree the 2026-10-05 probe cited now 404s at the
origin. The earlier "the sync path is dead at the origin" defect
([ARCH/31 §4.2](../ARCH/31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md#42-the-published-catalog-and-the-client-read-different-files--the-sync-path-is-dead-at-the-origin))
is closed.

---

## 1. Commands (verified)

| Command | Script | Status |
|---|---|---|
| `npm ci` | — | Installs from `package-lock.json`. Works. |
| `npm run dev` | `next dev` | Works (local development server). |
| `npm run build` | `next build` | Works — writes the static export to **`web/out/`**. This is what CI and `scripts/deploy-pages.sh` run. |
| `npm run type-check` | `tsc --noEmit` | Works — **exits 0**. `lib/hosts.ts:10` refers to this script, and until this pass it did not exist, so the comment named a command that failed with "Missing script". CI now runs `npm run type-check` (`build-web`) so the script cannot rot unnoticed. |
| `npm run start` | `next start` | **Broken by design.** Next.js refuses: `"next start" does not work with "output: export" configuration. Use "npx serve@latest out" instead.` Use a static file server on `out/`. |
| `npm run lint` | `node scripts/check-hook-order.mjs && node scripts/check-orphan-components.mjs && node scripts/check-search-settled.mjs && node scripts/check-search-index.mjs` | Works — **exits 0**. It replaced `next lint`, which could never pass here: with no ESLint config and no `eslint` dependency it opened an interactive "How would you like to configure ESLint?" prompt and hung whenever stdin was not a TTY. Four rules run, all with the TypeScript API already in `devDependencies`: a Hook must not follow an early return (React error #310, which `tsc` and `next build` both accept), an exported component must be reachable from a route, a `<SearchBar>` reporting a match count must also pass `settled` (a count printed before the search ran is a number nobody measured — the field showed `0 found` for a query that matched 4,809 rows), and the emitted search index must reproduce the in-repo matcher over the real 69,376-row dataset, build byte-identically twice, keep the sharded projection equal to the full projection, and stay under its size budgets. None is a general linter, and together they add nothing to the lockfile. |

CI's `build-web` job now runs, in order: `npm ci`, `npm run type-check`, `npm run lint`, `npm run build`,
then `scripts/deploy-pages.sh` — which materializes the release tree, verifies its digest chain, scans
the bundle for leaked source, and checks it against Cloudflare Pages' limits. The Job also asserts
`test -f web/out/index.html`. Separately, a `Check Catalog Coherence` step runs
`scripts/check_catalog_coherence.py` before the build so a dataset/release/pointer disagreement fails
fast.

## 2. Layout

```text
web/
  app/            Next.js App Router pages: /  explore/  agents/  agents/[id]/  categories/  trending/  package/
                  Each route is a Server Component (`page.tsx`) that reads `data/catalog.json`
                  at build time, a thin client wrapper (`*Route.tsx`) that owns the `next/dynamic`
                  import, and the view (`*View.tsx`) that hydrates from props.
                  `scripts/emit-catalog-shards.mjs` (run via `prebuild`) writes the served
                  artifacts into `public/data/`: the shard index `catalog.json` + the ordered
                  `catalog-*.json` fallback shards, the 256-way hash partition `pkg/<n>.json`
                  (plus `pkg/cat/<slug>.json` siblings) so a product page resolves one row
                  without downloading the catalog, and the search artifacts —
                  `catalog-search-index.bin.gz` (postings), `catalog-search-rows.bin.gz` (the
                  full display projection, the facet path's transport) and
                  `search-shards/r68/NNNN.bin.gz` (68-row display shards, the search path's).
                  `scripts/check-hook-order.mjs`, `scripts/check-orphan-components.mjs`,
                  `scripts/check-search-settled.mjs` and `scripts/check-search-index.mjs` are
                  `npm run lint`.
  components/     catalog/  home/  layout/  navigation/  package/  ui/
  lib/            catalog.ts  catalogData.ts  searchAssets.ts  searchFormat.mjs  hosts.ts
                  landing.ts  query.ts  telemetry.ts  availability.ts  brandLogos.ts
                  lifecycle.ts  vendorNames.ts  hostNotes.ts  categoryFiles.mjs
                  search.worker.ts  useCatalogSearch.ts  site.ts  clipboard.ts  format.ts
  data/           catalog.json · hosts.json · skill-targets.json · release.json   (build inputs)
  public/v1/      current.json                                                     (runtime fetch)
  out/            static export produced by `npm run build` (gitignored)
```

`next.config.ts` sets `output: "export"`, `images.unoptimized: true`, `trailingSlash: true`.

## 3. Data inputs

| File | Rows / shape | Read by | Produced by |
|---|---|---|---|
| `data/catalog.json` | **69,376** rows (`id`, `name`, `slug`, `kind`, `summary`, `category`, `publisher`, `transport`, `runtime`, `stars`, `version`, `command`, `args`, …) — the committed producer dataset, 53,969,379 bytes pretty-printed (~42.78 MiB once emitted as compact shards) | **Build time only:** the `page.tsx` Server Components derive counts, facets, section rows and one page of grid rows from it and serialize *those* into the HTML. The rows themselves are never imported by client code — that is what keeps tens of megabytes out of every JS chunk. | `scripts/build_full_catalog.py` |
| `/data/catalog.json` | the shard index (`schema`, `rowCount`, `datasetDigest`, `shards[]`), plus the `catalog-*.json` shard files it names | the **fallback** path: fetched at runtime only when a search artifact cannot be fetched or decoded (`lib/catalogData.ts` concatenates the shards in order). Versioned by `data/release.json`'s `datasetDigest` (`?v=…`) so a CDN cannot answer a newer build with stale rows. | `npm run build` (`prebuild` runs `scripts/emit-catalog-shards.mjs`, which writes `public/data/`; each shard stays under Cloudflare's 25 MiB per-file cap) |
| `/data/catalog-search-index.bin.gz`, `/data/catalog-search-rows.bin.gz`, `/data/search-shards/r68/NNNN.bin.gz` | the search artifacts the browser actually searches with: a vocabulary + delta-varint postings index (2.68 MiB gzip), the full display projection (4.98 MiB gzip, the facet path's transport — a count over every row needs every row), and the same projection in 1,021 shards of 68 rows (5.91 MiB gzip total, largest 10.2 KiB) fetched by row-id range so a first search pulls only the shards its visible results live in | fetched at **runtime**, lazily — on the first search or filter, never on a passive visit. Both are gzipped at build time because a binary `application/octet-stream` asset is not on Cloudflare's compressible type list. `scripts/check-search-index.mjs` (in `npm run lint`) re-emits them, asserts byte-stability, and enforces the size budgets. | `scripts/emit-catalog-shards.mjs` (`prebuild`); layout in `lib/searchFormat.mjs` |
| `/data/pkg/<n>.json`, `/data/pkg/cat/<slug>.json` | a 256-way hash partition of the same rows, keyed so a **product page fetches ~300 KB instead of the whole catalog** (measured: 256 buckets, largest 342.5 KiB, median 313.5 KiB) — plus a per-category sibling file for categories small enough for "also in" to mean something | fetched only by `/package/` (`fetchProductPayload` / `fetchCategorySiblings`). Before this, one product page concatenated all three catalog shards: **44.5 MB measured**. A row is filed under the bucket of both its `id` and its `slug`, because links use either. | `scripts/emit-catalog-shards.mjs` (`prebuild`) |
| `data/hosts.json` | **50** bridge adapters | `lib/hosts.ts` | `scripts/gen_hosts_ts.go` from `internal/host` |
| `data/skill-targets.json` | **77** skill install targets as committed — the registry (`skills.AgentTargets()`) now holds **81** after the `universal`/`warp`/`grok`/`pi` ids landed on 2026-10-14, so this file is stale and the CI `Verify Generated Host Data Is Current` gate fails until `go run scripts/gen_hosts_ts.go` is re-run and committed | `lib/hosts.ts` | `scripts/gen_hosts_ts.go` from `internal/skills` |
| `data/release.json` | merged stats bundle: dataset stats (`itemCount`, per-kind counts, `hostCompatibility`, `datasetDigest`) + release identity (`releaseId`, `sequence`, `manifestDigest`, `createdAt`) | imported at **build time** (`lib/telemetry.ts`) | **Single writer per key:** `scripts/build_full_catalog.py` merges the dataset stats, `litespm catalog build` stamps the release identity |
| `public/v1/current.json` | released pointer: `releaseId rel-2026-10-11-02`, `sequence 147`, `itemCount 69376`, `manifestDigest` over `manifest.json` | fetched at **runtime**, `cache: "no-store"` (`lib/telemetry.ts`) — the release-liveness check the header reports on | `go run ./cmd/litespm catalog build --out web/public` (copied through by `scripts/deploy-pages.sh`, which re-materializes it byte-for-byte) |

`stars` is `null` on every row by policy: no upstream source exposes a machine-readable popularity
figure, so none is published (`ARCH/26` §12.4).

## 4. How catalog data is produced

1. `go run scripts/gen_hosts_ts.go` → regenerates `data/hosts.json` + `data/skill-targets.json`
   from the Go registries (so host counts cannot drift from the binary).
2. `python3 scripts/build_full_catalog.py` → fetches upstream registries and writes
   `data/catalog.json` + the dataset stats in `data/release.json` (ids funnelled through fail-closed
   `canonical_id()`).
3. `go run ./cmd/litespm catalog build --out web/public` → converts the dataset into the release
   tree (`public/v1/releases/<id>/{manifest,listings,versions}.json`), writes the released pointer
   `public/v1/current.json`, and stamps the release identity into `data/release.json`. Cuts a new
   release id/sequence from the previous pointer (releases are immutable in the CDN cache).
4. `./scripts/deploy-pages.sh` → runs `npm ci` + `npm run build`, stages `pages-dist/`, replaces the
   exported `v1/` with a byte-for-byte materialization of the released tree, writes the
   `_headers` cache policy, and runs the leak allowlist audit.
5. Publication to the live origin is a **manual** step — no workflow uploads `pages-dist/`
   (`wrangler.toml` points at it).

**All of this is manual.** CI never regenerates catalog data. The builders are split by role —
Python owns dataset ingestion, `litespm catalog build` (Go) owns pointer/release publication —
which is what the code does today; locked decision **D4 is implemented-as-split but not yet
adjudicated** ([STATUS.md](../STATUS.md) §2).

## 5. Output & deployment

- `npm run build` → **`web/out/`** (`index.html` per route, `_next/`, `404.html`, the served
  catalog under `data/` — the shard index + `catalog-*.json` fallback, the `pkg/` buckets, and the
  search artifacts `catalog-search-index.bin.gz` / `catalog-search-rows.bin.gz` /
  `search-shards/r68/`) — and `v1/` copied from `public/v1`. Gitignored.
  The exported `v1/`
  carries whatever the last local `catalog build` left in `public/v1/` — the deploy script drops it
  and materializes the released tree instead.
- `scripts/deploy-pages.sh` → **`pages-dist/`** = `out/` + `_headers` + the byte-for-byte
  materialized release tree under `v1/`. Gitignored.
- `wrangler.toml` (`name = "litespm"`, `[assets] directory = "./pages-dist"`,
  `not_found_handling = "404-page"`) — the deployment name is the hostname (`litespm.<account>.workers.dev`)
  and matches the rebrand; the legacy `litepsm` Worker still serves the same frozen release until
  retired ([REMEDIATION-PLAN.md](../REMEDIATION-PLAN.md) `M1`).
- Canonical origin comes from `NEXT_PUBLIC_SITE_URL` at build time, defaulting to the live
  deployment origin in `lib/site.ts`.
- The release workflow also archives the export as `litespm-web-static.tar.gz` in the GitHub
  release (`.github/workflows/release.yml`).

## 6. No-secrets rule

The site is public static content. Binding rules:

1. **No keystore, vault, token, or config-file data ever reaches `web/`.** Secrets live in
   `internal/secrets` (Go); the browser never receives them, and there is no server runtime that
   could read them.
2. The only data shipped is the JSON in §3 — public catalog metadata and host paths written as `~`
   or `<project>` placeholders by `gen_hosts_ts.go`.
3. The app performs same-origin requests for public static files only and no cookies: `/v1/current.json` on load (release liveness), and the search artifacts (`catalog-search-index.bin.gz` + the `search-shards/r68/` shards its results live in), the full display projection (`catalog-search-rows.bin.gz`, the facet path), the ordered `catalog-*.json` fallback shards, the `pkg/` bucket for one product page, or `/data/catalog.json` (the shard index) **only when a reader searches, filters, sorts, pages or opens an entry** — a passive first visit fetches neither the rows nor any script containing them. Search and its postings index run in a Web Worker (with an in-thread fallback) in the browser; there is no analytics
   beacon, no cookie, no third-party script. The only browser state is two `localStorage` keys
   that never leave the machine — `litespm-theme` (system/light/dark) and `litespm-agent` (the
   "What do you use?" preference) — and neither one can trigger a fetch.
4. `scripts/deploy-pages.sh` enforces a file-type allowlist on the staged tree and exits non-zero
   on `.env*`, `.pem`, `.key`, `.db`, `.sqlite*`, `.go` or `.ts` files — but it is manual, so do not
   treat that as CI enforcement.

## 7. Truthfulness gaps (as of this pass)

- `npm run start` is unusable (§1); use a static server on `out/`. `npm run lint` no longer is: it
  runs `check-hook-order.mjs`, `check-orphan-components.mjs`, `check-search-settled.mjs` and
  `check-search-index.mjs` instead of the `next lint` that could never pass. What remains missing is
  a *general* linter — the four rules that have bitten this codebase are covered, nothing else is,
  and a full ESLint would add ten-plus plugin packages to a tree that currently holds seven
  devDependencies.
- Catalog freshness **is** now asserted: `scripts/check_catalog_coherence.py` compares the row count
  and per-kind counts in `data/catalog.json` against the stats in `data/release.json` and the
  pointer in `public/v1/current.json`, and the `build-web` job runs it before the build. It also
  fails when any `installHint` names another tool's installer (the field is ours, and the site
  renders it as a copyable command). The remaining gap is *upstream of that*: no CI step runs the
  Python producer, so the numbers can be internally consistent while the dataset itself is old.
- UI stacks described elsewhere in prose do not all exist here: the dependency list contains no
  Radix packages — the components use plain React, Tailwind and `lucide-react` icons.
- `next build` in CI proves the export compiles; it does not prove the deployed origin serves it
  (the live check used elsewhere is `GET /v1/current.json` → 200).

See [STATUS.md](../STATUS.md) for authoritative capability states and
[scripts/README.md](../scripts/README.md) for the builders referenced above.
