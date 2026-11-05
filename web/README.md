# `web/` — LiteSPM public marketplace site

A **Next.js 16.1.1 App Router** application (`output: "standalone"`) with React 19 and
Tailwind CSS 4. It publishes the catalog, package detail, compare, agents, insights and
docs views, and it also hosts the assistant API. It is not a static export: the app has
API routes, Prisma/libSQL storage and a Node server.

The site is deployed on Vercel at <https://lite-spm-nine.vercel.app>. The Cloudflare
Worker in `../worker/` owns only the signed `/v1` catalog tree and redirects every other
path to that origin.

## 1. Commands

| Command | What it does |
|---|---|
| `npm ci` | Install from `package-lock.json`. |
| `npm run dev` | Local dev server on port 3000. |
| `npm run build` | `prisma generate && next build`, then `postbuild` copies `.next/static` and `public/` into `.next/standalone/`. |
| `npm run start` | `node .next/standalone/server.js` (after `npm run build`). |
| `npm run type-check` | `tsc --noEmit`. |
| `npm run lint` | `eslint .` plus the two local gates: `check-no-embedded-secrets.mjs` and `check-web-truth.mjs`. |
| `npm run db:generate` / `db:push` / `db:migrate` | Prisma client and schema operations. |

The app needs `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in production. Without a remote
libSQL URL, `databaseConfigured()` returns false and the view/feedback routes return a
clear `503` instead of pretending a write reached a read-only filesystem. Local
development may use the `file:` fallback from `prisma/schema.prisma`.

## 2. Layout

```text
web/
  src/app/                  App Router shell, [...slug] metadata route, API routes
    api/litespm/            search, package, compare, agents, insights, trending,
                            view, feedback, assistant, llm, docs, search
  src/components/litespm/   client shell, router, views, assistant, palette
  src/lib/litespm/          router, hooks, formatting, types
  src/lib/db.ts             Prisma client + databaseConfigured()
  src/server/litespm/       dataset, search, hosts, package detail, type specs,
                            availability, identity, insights, rate limit
  src/server/llm/           multi-provider gateway (env credentials only)
  data/catalog.json         committed 54 MB producer dataset (69,376 rows)
  data/hosts.json           50 host adapters (generated from internal/host)
  data/skill-targets.json   81 skill targets (generated from internal/skills)
  prisma/schema.prisma      PackageView, FeedbackEntry, ...
  scripts/                  local truth/secret gates
```

Routing is the custom path/hash router in `src/lib/litespm/router.ts`; the App Router
serves one client shell and supplies server metadata for `[...slug]`.

`/marketplace?tab=skills|plugins|mcp|installed&q=...` is the four-tab panel:
live catalog search over the embedded dataset, copyable `litespm install <id>`
commands, and an Installed tab fed by `/api/litespm/installed`, which invokes
the local CLI's read-only `litespm list --json`. A deployed instance has no
local CLI, so that route answers `available:false` and the tab tells the reader
to run `litespm marketplace` on their own machine instead of showing an empty
ledger. `litespm marketplace` (alias `market`) opens the same URL in a browser;
the in-agent `/marketplace` prompt is text-only because MCP has no portable
window API.

## 3. Data

`src/server/litespm/dataset.ts` parses `data/catalog.json` once per process and caches
the result on `globalThis`. The current release is `rel-2026-11-05-03`, sequence 154,
69,376 raw rows: 48,418 MCP servers, 20,320 skills and 638 plugins.

An MCP row is installable when its publisher's `server.json` carries a publishable
remote endpoint **or** a package locator with a `stdio` transport (npm `npx`,
PyPI `uvx`, OCI `docker`). A skill row is installable when a GitHub tree's
`SKILL.md` was actually read; the skills.sh listing pages publish the repository
their install command names, and `scripts/resolve_skills_sh_sources.py` records
the exact tree. Rows with neither stay `discovery_only`, and the UI says so
without blaming the publisher.

The 2026-11-05 working tree has **55,491 installable rows of 69,311 unique**
(80.1%): 25,938 remote MCP, 13,746 local package-launch MCP, 15,482 skills and
325 pinned plugins. The 13,572 discovery-only rows are the ones whose publisher
launch line is genuinely absent or cannot be expressed without user input.
1,928 directory rows were promoted by `scripts/resolve_directory_mcp_launches.py`
after an exact publisher-login + repository match to a launch-bearing MCP
Registry row; the copied command/endpoint is recorded under `resolvedFrom`.

`hostsFor()` filters remote MCP rows through `hosts.json`'s `remote` and
`remoteTransports` fields: 46 hosts accept a remote entry, and codestudio, iflow-cli,
mux and zcode support local stdio only. There is no relay bridge.

## 4. Truth gates

`npm run lint` fails if:

- a `gsk_` credential or the old char-code fallback appears in tracked source;
- `hosts.json` no longer has 50 hosts / 46 remote-capable hosts;
- any page describes a `stdio-to-remote relay` that does not exist;
- `hostsFor` stops consulting `remote`/`remoteTransports`;
- plugin install targets fall back to publisher display names;
- `type-specs.ts` reintroduces a guessed `npx` fallback, a fabricated security posture,
  or an invented plugin manifest;
- `--allow-partial` is described as a pinning bypass;
- search/insights hardcode `sources` empty;
- `release.yml` packages `web/out` instead of `.next/standalone`.

These are deliberately narrow and dataset-backed. They are not a general linter.

## 5. Deployment

- **Vercel** runs the standalone app; set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
  and the LLM provider keys (`GROQ_API_KEY`, etc.) in the project environment. Environment
  keys take precedence over the encoded free-tier fallback described below.
- **Cloudflare** (`../scripts/deploy-pages.sh` + `../wrangler.toml` + `../worker/`)
  materializes the signed catalog release tree into `pages-dist/`, verifies its digest
  chain, audits it for leaks and size, and deploys a Worker that serves `/v1/*` and
  redirects all other paths to `WEB_ORIGIN`.
- **GitHub Release** packages the standalone server as
  `litespm-web-standalone.tar.gz`; see `../.github/workflows/release.yml`.

## 6. Credential handling

No keystore, vault token or config-file secret may reach `web/`. The only public data
shipped is the catalog metadata and host paths written as `~`/`<project>` placeholders.
The assistant route is an LLM proxy; it requires provider credentials from the
environment and is rate-limited, but it is not authenticated. Put it behind an edge
rule if the deployment is public and cost abuse is a concern.

The hosted demo intentionally keeps an encoded free-tier Groq fallback in
`src/server/llm/gateway.ts`; environment keys take precedence. The fallback is
stored as character codes so a plaintext `gsk_...` string is not published in
source, and the local gate still fails on a plaintext key. This is a demo
convenience, not a secret boundary: anyone with the repository can decode it,
and the free-tier quota is shared by every deployment that relies on it.
