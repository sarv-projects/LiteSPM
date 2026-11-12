# `web/scripts/` - build steps, lint gates and checks for the marketplace site

Run any script from `web/`, e.g. `node scripts/check-web-truth.mjs`. The scripts add no dependency;
the gates that read TypeScript use the `typescript` devDependency's compiler API rather than an ESLint
plugin tree. Each script checks or emits exactly one thing.

## Wired into `package.json`

| Script | Run by | What it does |
|---|---|---|
| `build-site-facts.mjs` | `predev`, `pretype-check`, `build` | Derives `src/lib/litespm/site-facts.json` (host count, remote-capable hosts, local-only host names, skill-target count, listing counts, release id, npm version, bridge-tool count) from `data/hosts.json`, `skill-targets.json`, `release.json` and `published-cli.json`. The site prints these; do not retype them. |
| `build-assistant-knowledge.mjs` | `predev`, `pretype-check`, `build`, `test:assistant` | Chunks the repository docs into `src/server/litespm/generated/assistant-knowledge.json` for Ask AI: `README.md`, `SECURITY.md`, `STATUS.md`, `AGENTS.md`, `npm/README.md`, the `[Unreleased]` section of `CHANGELOG.md` and `ARCH/*.md` (minus the competitive-landscape note). Dense embeddings are added only when `EMBEDDING_API_KEY` is set. |
| `postbuild.mjs` | `postbuild` | Prepares `.next/standalone/` for the release archive: removes every `.env*` entry, copies static assets and verifies the tree. |
| `build-search-index.mjs` | `build:search-index` | Regenerates the committed `data/search-*.json.gz` files after `data/catalog.json` changes. Read its header first: it expects the development exporters' output. |
| `test-hardening.mjs` | `test:hardening` | Behavioural tests for the hardening helpers. |
| `test-host-paths.ts` | `test:host-paths` | Checks host config paths (needs `bun`). |
| `test-assistant-rag.ts` | `test:assistant` | Retrieval tests for the assistant knowledge base (needs `bun`). |

## Lint gates - `npm run lint`

`npm run lint` is `eslint .` followed by four gates, in this order:

| Script | Fails when |
|---|---|
| `check-no-embedded-secrets.mjs` | A provider credential, plaintext or encoded, appears in the web source. |
| `check-web-truth.mjs` | A published claim drifts from the registry data: the 52-host / 47-remote / five-local-only split, an invented relay bridge, remote capability assumed instead of read from `hosts.json`, fabricated launch lines, `--allow-partial` described as a pinning bypass, hardcoded-empty source facets. |
| `check-assistant-product.mjs` | Intent routing, the grounding guard (documented syntax is not an invented package) or the LLM gateway pool misbehave, or the assistant route stops calling the knowledge/catalog/host tools. |
| `check-web-hardening.mjs` | The copy-paste host-config snippet stops escaping publisher data (a quote or newline could inject a second config table), the install command stops going through `shellArg`, or the rate limiter stops keying on the platform-set hop / the assistant route loses its per-instance budget. |

## Other scripts

These are not referenced by any `package.json` script. Several were written for an earlier,
static-export layout of the site and still mention files that no longer exist (for example
`lib/query.ts`), so treat a failure from them as a reason to read the script before the code:

`audit-a11y.mjs`, `check-contrast.mjs`, `check-facet-counts.mjs`, `check-hook-order.mjs`,
`check-install-command.mjs` (checks the install flags the site prints against the npm `latest`
release recorded in `data/published-cli.json`; it asks the npm registry and falls back to the
file offline), `check-og-image.mjs`, `check-orphan-components.mjs`, `check-publisher-counts.mjs`,
`check-search-index.mjs`, `check-search-settled.mjs`, `check-sort-order.mjs`,
`emit-catalog-shards.mjs`, `gen_brand_logos.mjs`, `gen_og_image.mjs`, `profile-projection.mjs`.

The repository-level [`scripts/check_ci_local.sh --web`](../../scripts/check_ci_local.sh) runs the web stage of CI locally.
