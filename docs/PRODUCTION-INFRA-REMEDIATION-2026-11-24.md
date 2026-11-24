# LiteSPM production infrastructure remediation — 2026-11-24

Status: local working-tree remediation; not deployed. Baseline Git commit 70ad3f4acc1956f6bbb38b3fbc4a952f196ad537. No billing changes, resource deletion or paid services.

## Evidence from Vercel
Account-wide last-30-day usage supplied by owner: Fluid CPU 4h 11s / 4h; Functions Storage 9.3 GB / 10 GB; invocations 15,021. Project API returned 50 READY deployments Nov 12–24. Recent production logs showed compact catalog 69,311 rows, precomputed index 69,311 rows, then a rebuild for 68,933 rows (4,691 / 4,647 / 5,981 ms elapsed). Trending logged Prisma error 14, unable to open database file. Vercel variable inventory (names only, no decrypted values, hidden production count 0) confirmed no database URL/token configured. CPU attribution by route and physical retained deployment storage could not be retrieved. These are not measured per-project billed totals.

## Root cause and code
- web/src/server/litespm/dataset.ts:88–98 filters parser artifacts in the full catalog; old compact artifact was generated before the filter. Locally confirmed 378 excluded rows; current full and refreshed compact have exactly 68,933 rows; all ordered IDs and compact field values match the previously filtered compact projection.
- web/src/server/litespm/bm25.ts:76,140–188: separate version-2 full/compact artifacts; ordered searchable-row digest; verify release, projection, row count and every ID; reuse cache by stable dataset object; ordered postings/df serialization.
- web/src/server/litespm/dataset.ts:302 and search.ts:392,419–423: filter once in loader; skip index for no-token browse; avoid background full-catalog metadata warming on Vercel.
- web/scripts/build-search-artifacts.ts and build-search-index.mjs: offline artifact generation from same production implementation; individual atomic file replacements; publish manifest last. web/scripts/check-search-artifacts.mjs verifies input/source/artifact digests before production build; no Bun needed for the build check. Run npm run build:search-index when relevant inputs change.
- web/src/lib/db.ts:33–44; trending/route.ts:49; view/route.ts:38; feedback/route.ts:51: existing fallback-only operating mode is now explicit, lazy DB access, no fallback to local file after remote adapter failure, view writes atomic upsert. No remote DB provisioned. Database-backed behavior requires configured and reachable storage. Existing feedback fallback redacts email.
- web/next.config.ts:8,63: align output tracing root with Turbopack root; remove catalog assets from routes that do not read them. Installer route handlers read tracked public scripts directly, rather than broad parent-directory probing.
- web/vercel.json and scripts/should-build.mjs: ignored build step checks last successful deployment SHA, skips only allowlisted non-web inputs, and builds on unknown/missing metadata. Tested historical CLI-only commit 9170a458 (exit 0), current web change (exit 1), missing SHAs (exit 1). Root docs consumed by assistant and all unclassified paths remain build triggers.

## Local benchmark
Bun process, original vs modified, same catalog release and queries, initial compact catalog loaded before timed search.
| query | elapsed before ms | elapsed after ms | process CPU before ms | process CPU after ms | complete response hash |
|---|---:|---:|---:|---:|---|
| postgres (compact) | 17163 | 4390 | 25702 | 4235 | same |
| docker | 201 | 176 | 281 | 203 | same |
| dokcer | 118 | 82 | 172 | 125 | same |
| firecrawl MCP | 49 | 8 | 47 | 0 | same |
| python page 2 | 1052 | 1385 | 1125 | 1281 | same |
| default facets | 42 | 1 | 47 | 0 | same |
Warm cached responses: 43–54 ms before (repeat compact filtering), rounded 0 ms after. CPU/elapsed measurements fluctuate, one sample per query, not Vercel usage. Full-catalog postgres returned 378 rather than previous 377 after separating cached compact/full indexes; both regenerated indexes independently matched freshly rebuilt references exactly, including docs, posting order, df, normalization. New compact artifact 8,013,126 bytes; full index 9,824,265; compact index 9,677,708. The compact/full separation adds artifact storage; route-trace optimization addresses unrelated duplication.

## Route classification and changes
| route | behavior |
|---|---|
| / | static homepage |
| /[...slug] | dynamic detail/SSR; retain; further granular prerendering needs route tests |
| /api/litespm/list | public immutable release search, existing CDN headers, bounded input, in-process result cache; fixed expensive cold path |
| /api/litespm/featured, stats, agents, bundles, insights | deterministic deployment data; force-static |
| /api/litespm/trending | dynamic if DB configured; cached verified snapshot otherwise |
| /api/litespm/agent/[id], compare, package/[key], package/[key]/raw, source/[key] | dynamic public lookup; retain existing request semantics and caches |
| /api/litespm/search-index, search-catalog | development-only exporters; preserve production 404 |
| /api/litespm/installed | local ledger; never expose local information from Vercel |
| /api/litespm/assistant, llm | dynamic runtime/provider health; no blanket shared caching |
| /api/litespm/view, feedback | mutable writes; guarded fallback; existing limits retained |
| /install.sh, /install.ps1 | tracked public script bytes; existing response headers and error behavior retained |
| /robots.txt, sitemap.xml, icon.svg, favicon.ico, opengraph-image | metadata; keep existing rendering behavior |

## Verification and residual gates
- First type-check passed before second slice. Both final compact/full reference tests passed (web/scripts/test-production-infra.ts), including no index load for blank browse, fallback trending, skipped views, email redaction, production 404s and exact installer bytes.
- Manifest verification passed; generator exit 0. Git diff --check passed at inspection.
- Original local .next trace inventory (existing build, file sizes resolved at inspection, not billed compressed function size): 30 manifests, 5,058,049,751 aggregate bytes counting duplicates; 2,843,094,778 data bytes. Most routes included 83,250,301 data bytes; installer route traces 785,687,374 / 785,687,376 bytes across 7,087 files each; feedback/view/trending each traced about 452.7 MB including ~358.8 MB Prisma paths. Compare rebuilt manifests with scripts/audit-function-traces.cjs; do not claim physical Vercel savings from trace sums.
- Web Analytics not enabled in Vercel. Attempted official SDK install stalled; stopped only that installation; no billing or analytics settings changed. Existing in-process rate limits are not a distributed bot defense. Do not activate paid features or delete deployments without owner approval.
- Node module.register deprecation is a build warning; no dependency upgrade applied. Recheck against deployed build. Production deployment, historical billed CPU/physical storage attribution, remote DB integration, global bot rules and longitudinal usage validation remain release gates.
