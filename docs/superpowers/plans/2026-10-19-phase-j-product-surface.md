# Track 4 — Phase J + Blueprint P1/P2 — Product Surface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Phase J rows that are still `DESIGNED`, and fix what the adversarial evaluation of the live site found — starting with the one finding that breaks the product's central promise.

**Architecture:** The site is a static Next.js export. Every page is a Server Component that imports the dataset at build time and hands the browser only what it needs; the search runs against a prebuilt postings index. Nothing here may invent data, and every count printed must be a count the site's own filters produce.

**Tech Stack:** Next.js 15 (App Router, `output: "export"`), React 19, Tailwind 4, Playwright (13 specs, 113 tests), Miniflare for the local Worker.

**Spec:** `docs/superpowers/evaluations/2026-10-19-site-evaluation.md` (39 findings: 1 blocker, 10 major, 16 minor, 9 nit), `TODO.md` Phase J (`LPSM-J004`, `J006`, `J008`, `J013`, `J014`, `J015`), `CURRENT_RUN.md` Blueprint P1/P2.

## Global Constraints

- **The site's promise is that it never fabricates.** A count on a page must equal the count the site's own filter produces; a kind that cannot be installed must never read as installable; a capability that does not exist must not be implied.
- **No popularity data exists.** No star, download, install or usage count may appear — and where a reader will look for one, the absence is explained on that page, not only in `/terms/`.
- **The dataset never enters a JS chunk.** The row set is imported by Server Components only; the browser fetches a bounded window.
- **The budgets are gates, not targets:** First Load JS ≤ 108 KiB, ≤ 36 same-origin requests on `/`, CLS ≤ 0.01, no horizontal overflow at 320 px or 390 px, zero axe WCAG A/AA violations, ≤ 4,149 visible design tokens.
- **Every fix ships with its assertion.** A finding fixed without a test that fails when the behaviour regresses is not fixed.
- **No publication.** The build output is not deployed by this track.

## Review Focus

1. **A count that drifts from the filter that produced it** — the F-01 failure mode: prose quoting a catalog total for a per-host claim.
2. **A number that a reader cannot act on** — an id they must type character by character (F-05), or a count with no explanation (F-03).
3. **A destination the site names but cannot show** — 29 hosts that 404 (F-09).
4. **A mobile viewport narrower than the budget** — the 320 px case that 390 px testing missed (F-02).

---

## Task 1: F-01 — the `/compare/` overstatement (blocker)

**Status: DONE (2026-10-19, this program).** The intro sentence now quotes the *installable* counts, computed at build time from the committed dataset with the same `availabilityOf` predicate every other surface uses, plus the number of hosts that accept a remote server and the number with a skills directory. `assertCompareCountsAgree()` fails the build if an installable count ever exceeds its catalog total. `web/app/compare/compareRows.ts`, `web/app/compare/CompareView.tsx`, `web/app/compare/page.tsx`.

**The better architecture, still open.** The counts are computed here from the dataset, which means the `/compare` route imports the 54 MB dataset — a third copy in the build graph, and the same numbers computed in two places (the page and `web/lib/availability.ts`), which is how they drift. The right home for them is `web/data/release.json`, which the **producer** already writes and which already carries the dataset stats (`itemCount`, per-kind counts, `datasetDigest`) under the repo's "single writer per key" rule. The producer knows each row's installability and transport, so it can publish `installableMcpServersCount` / `installableAgentSkillsCount` with the same rule the CLI and the site use; the page then reads two numbers and imports nothing.

That change needs a producer run to regenerate `web/data/release.json`, and a producer run is a **network-bound, half-hour job** (the `feed:mcpmarket-com` crawl is budgeted at 2,000 pages with a 1 s delay). It is therefore a separate task with its own schedule, not something to slip into a product-surface change.

## Task 2: F-02 — the 320 px sideways scroll (major)

**Status: DONE (2026-10-19, this program).** `components/home/AtlasTeaser.tsx` gained `grid-cols-1`, and `tests/budgets.spec.ts` now runs the no-horizontal-overflow assertion at **both** 320 px and 390 px over the same twelve routes.

## Task 3: F-03, F-04, F-08 — search honesty (major)

**Status: DONE (2026-10-19, this program).** A match set larger than 200 rows now reads *"N matched — showing the most relevant"* instead of a bare count; the empty state states the prefix rule ("We match the *start* of each word"); the publisher filter is compared case-folded, then by prefix, then by contains.

**Still open (the half that needs an index change).** The matcher tokenises the row's whole address, so "github" is in the token set of most rows. Fixing the *match set* means excluding the host segment of a URL from the token set, which changes the index format (v3 → v4) and therefore `scripts/emit-catalog-shards.mjs` and `scripts/check-search-index.mjs`. That is one task of its own:

- [ ] **Step 1: measure the change first.** With the host segment excluded, how many rows match "github"? If the number does not fall to a discriminating set, the change is not worth an index version.
- [ ] **Step 2: bump the index format to v4** in `web/lib/searchFormat.mjs` and `web/scripts/emit-catalog-shards.mjs`, keeping the CI gate (`check-search-index.mjs`) that proves the index and the matcher agree over all 69,376 rows.
- [ ] **Step 3: re-measure the first-window budget** (48 rows, ≤ 0.10 MiB) and the "N matched" wording threshold.

## Task 4: F-05 — an install command a human can type (major)

**Files:** `web/app/package/AddSteps.tsx`, `web/app/package/PackageView.tsx`, `web/components/package/*`, `cmd/litespm/main.go` (the `install` verb's argument parsing).

- [ ] **Step 1: Answer the question the site cannot answer today — does the CLI resolve a short name?** Read `runInstall` in `cmd/litespm/main.go`: if the argument is not a listing id, can it resolve a slug, a name or a search? If yes, the page publishes `litespm install <short>`; if no, the page says why the id form is required, and the CLI gains `litespm install --search <term>` that prints the candidates.
- [ ] **Step 2: implement whichever answer step 1 gives**, with a CLI test for the resolution and a component test for the rendered command.
- [ ] **Step 3: keep the full id available** in a "Details" disclosure — it is the unambiguous form.

## Task 5: F-06 — the navigation rail that hides a destination (major)

**Files:** `web/components/navigation/Header.tsx`, `web/app/globals.css`.

- [ ] **Step 1: write the failing measurement.** In `tests/`, assert that every nav destination is reachable at 320 px, 375 px and 412 px: either visible, or inside a scroll container with a visible affordance (a fade edge and a chevron) — the current state fails because "Coverage" sits at x=313–385 with nothing to hint at it.
- [ ] **Step 2: implement the affordance** — a right-edge fade plus a scroll chevron on the rail, and a `›` control that scrolls it. Do **not** hide the destinations behind a hamburger: the no-JS contract is a product promise, and the handover rejected a drawer on purpose.
- [ ] **Step 3: assert the CTA does not truncate** ("Install LiteSPM" → "Install" at 320 px).

## Task 6: F-07 — the three filters with no control (major)

**Files:** `web/app/explore/ExploreView.tsx` (the filter panel), `web/lib/catalog.ts` (the facet counts, already computed server-side).

- [ ] **Step 1: add the controls** — Category (a select over the 64 source categories), Publisher (a search-select over the 2,365 publishers), Source (a select over the 12 ingest sources). Each writes its URL parameter, each reads it back, each keeps the count the server already computes.
- [ ] **Step 2: test the round trip** — a Playwright case that filters by category, reloads, and asserts the filter is still applied.

## Task 7: F-09 — 29 hosts the site names but cannot show (major)

**Files:** `web/app/agents/[id]/page.tsx` (the `generateStaticParams`), `web/app/agents/agentRows.ts`.

- [ ] **Step 1: decide.** Either the 29 skills-only hosts get pages (the data exists in `web/data/skill-targets.json`, so a page per host is cheap), or their rows are marked "skills only — no page" and link to `/compare/`. Shipping a link to a 404 is the defect; both resolutions remove it.
- [ ] **Step 2: implement the chosen resolution** and add the hosts to the sitemap.

## Task 8: The minor findings, grouped by the file they touch

- [ ] **F-10** — one line in the entry page's source block: *"No star or download count exists for this entry — no upstream source publishes one."* The absence is explained where it is felt.
- [ ] **F-11** — collapse the five "not published" rows of a skill's Capabilities tab into one sentence, and put the source repository link first.
- [ ] **F-13** — the home page leads with five catalog shelves before any explanation; move the "what are you trying to get done?" band above the second shelf (Blueprint P1).
- [ ] **F-14** — make the un-installable kind subordinate on the home page: one "Plugins" shelf instead of a peer stat, with the reason.
- [ ] **F-15 / F-16** — the 14 px checkboxes and the publisher link are below the WCAG 2.2 AA 24 px target floor; restyle them and add an axe target-size check.
- [ ] **F-17** — the Explore form field has no `id`/`name`; add both.
- [ ] **F-19** — the home stat line auto-rotates; a rotating number is a moving target for a reader (and for a screenshot test). Render one number.
- [ ] **F-20** — `--ink-3` measures 5.19:1 on `--paper` and 4.77:1 on `--sunken`, under the 4.5:1 floor for the latter. Darken the token and re-run the contrast gate.
- [ ] **F-21** — two URL shapes for one entry (`/package/?slug=…` and `/package/<key>/`). Pick one, redirect the other.
- [ ] **F-22 / F-18** — the goal tiles mix two taxonomies; the Sort option names are jargon. Make both say what they mean.
- [ ] **F-23** — the home page and the entry pages give two different commands for the same step; one command.
- [ ] **F-24** — the nav item is "Coverage" and the route is `/trending/`; rename the route to `/insights/` (Blueprint P2) and keep a redirect.
- [ ] **F-25** — the "Works with" dropdown lists 79 names of which 71 are identical; show the vendor's own name.
- [ ] **F-26** — the "Why these results?" panel is per-result; add the page-level why for each filter.

## Task 9: Phase J rows that are still `DESIGNED`

- [ ] **J013** — `litespm status` / `diff` / `why` / `outdated`. `why` has a natural first implementation: the install records and the deployment ledger already carry what changed and why a node was refused. `outdated` needs a freshness signal the catalog does not publish — so `outdated` stays `DESIGNED` and says so.
- [ ] **J004 / J006 / J008** — the Explore evaluation surface, the Agent Atlas page and the route hygiene. J008 is the route rename in Task 8 (F-24) plus `/docs` and `/tour`.
- [ ] **J014 / J015** — blocked on `ARCH/35`'s leases and `ARCH/34` §4's health observation, which the ARCH/34 track explicitly left unimplemented. They cannot be closed by this track; they are recorded as blocked on a named cause.

## Task 10: Blueprint P2 — the install-feasibility module

- [ ] **Step 1: the per-entry feasibility module** — the data that says whether *this* entry can be installed *here* (which host, which transport, which scope) is already computed for the install band; the module is the same computation rendered as a short block above the install steps.
- [ ] **Step 2: `featured.json`** — a hand-curated list for the home page, replacing the auto-rotating stat with a stable selection.
- [ ] **Step 3: the Explore decomposition** — split the 963-line view into the filter panel, the results list and the "why" panel, each with its own file, without changing a single rendered string.

---

## Self-review

**Spec coverage.** F-01–F-26 and the mobile/a11y findings are each in a task; the Phase J rows are Task 9; Blueprint P1/P2 are Tasks 8, 9 and 10.

**Step scan.** Every step names a file, a measurement or a behaviour.

**Type consistency.** The names here — `assertCompareCountsAgree`, `availabilityOf`, `install --search`, `grid-cols-1` — are the ones the earlier tasks introduced.
