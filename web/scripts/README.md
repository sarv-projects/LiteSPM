# `web/scripts/` — build steps and lint gates for the marketplace site

Six Node scripts run against `web/`. Two are **build steps** (`prebuild` / `predev`), and four are
the whole of `npm run lint`. Nothing here adds a dependency: `typescript` is already the site's only
compiler devDependency, and the gates use its API rather than an ESLint plugin tree.

Nothing in this directory is a general tool. Each script checks or emits exactly one thing.

## Lint gates — `npm run lint` (CI: `build-web`, `web/package.json`)

| Script | Rule | Fails on |
|---|---|---|
| `check-hook-order.mjs` | A Hook must not run after a top-level early return — React error #310. | `exit 1` listing every offending Hook; `exit 2` if `--root` names no files |
| `check-orphan-components.mjs` | An exported component must be reachable — imported by some module the App Router reaches. | `exit 1` listing every orphan; `exit 2` if `--root` names no files |
| `check-search-settled.mjs` | A `<SearchBar totalMatches=…>` must also pass `settled`, so an unmeasured count never prints as `0 found`. | `exit 1` listing every `<SearchBar>` that reports a count without declaring its settled state |
| `check-search-index.mjs` | The emitted search index must reproduce `matchesQuery` over the real dataset, build byte-identically twice, keep the sharded projection equal to the full projection row-for-row, and stay under its size budgets — including the first-window wire cost. | `exit 1` on any query where the index and the matcher disagree, any byte difference between two builds, any shard row that differs from the full projection, any budget overrun (index, rows, shards, or the bytes/requests a first window costs), or a stale `public/data/` artifact |

`check-hook-order.mjs` and `check-orphan-components.mjs` exit 0 in the current tree. Both are gates
`tsc` and `next build` cannot replace: `noUnusedLocals` exempts exports, and the bundler tree-shakes a
dead module out of every chunk without a word. Both take `--root <dir>` so they can be pointed at
another copy of the tree.

`check-search-index.mjs` is the proof behind `lib/query.ts`'s "one matcher, two callers" claim: it
transpiles the real `lib/query.ts` (TypeScript compiler API, no build step) and compares its row set
against the emitted index for a query corpus that includes prefix, mid-word (`sign` vs `design`),
empty, no-match and CJK cases — over all 69,376 rows. It re-runs the build to prove the artifacts are
byte-stable, enforces the size budgets recorded in the script, and — when `public/data/` already
holds the artifacts — fails if the served bytes differ from a fresh build. `npm run check:search-index`
runs it alone.

`check-orphan-components.mjs` carries **one** exception, `KNOWN_ORPHANS`
(`components/home/FaqSection.tsx`): that component is unreachable but not dead — it holds an
uncommitted copy edit from 2026-10-13 in a directory of files under active edit, so the landing page
may re-import it. The check prints what it excused on every green run, and exits 1 for any other
orphan, including new ones planted in `components/home/`. Empty the list; do not widen it.

`check-orphan-components.mjs` walks `app/` + `components/` and builds a reachability graph from the
route files the App Router resolves by convention (`page.tsx`, `layout.tsx`, …) outward. It reads the
syntax tree, so a component's name inside a comment or a string is not a usage — a word search is not
enough here, and one false-positive report on a prose comment is what the script's header records.
A component under a route file that *is* reachable but that nothing imports (`exported, but no module
imports it`) is reported the same way as an unreachable module.

## Build steps (`predev`, `prebuild`)

| Script | Emits | Notes |
|---|---|---|
| `emit-catalog-shards.mjs` | `public/data/catalog.json` (index) + `catalog-*.json` (ordered shards) + `public/data/pkg/<n>.json` (256-way hash partition) + `public/data/catalog-search-index.bin.gz` + `public/data/catalog-search-rows.bin.gz` + `public/data/search-shards/r68/NNNN.bin.gz` | Deterministic — byte-identical output for identical input; each shard carries its sha256 and stays under Cloudflare's 25 MiB per-file cap. The search artifacts are the ones the browser actually searches with (`lib/searchFormat.mjs` owns their layout); all are gzipped at build time because a binary `application/octet-stream` asset is not on Cloudflare's compressible type list. The full projection is the facet path's transport; the 68-row shards are the search path's, so a first search fetches only the shards holding the results it renders. Run by `predev` and `prebuild`. |
| `gen_brand_logos.mjs` | `data/brand-logos.json` | Records which `public/brands/` assets exist plus each one's aspect ratio, so the UI never requests a logo that is not there (with `output: "export"` a missing file is a guaranteed 404). Run by `prebuild`; `npm run gen:brands` runs it alone. |

## Manual

Run any of them directly from `web/`, e.g. `node scripts/check-orphan-components.mjs`. For the full
CI-equivalent sequence use [`scripts/check_ci_local.sh`](../../scripts/check_ci_local.sh)
(`--web` stage: `npm ci && npm run type-check && npm run lint && npm run build`).
