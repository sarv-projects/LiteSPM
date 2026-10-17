# Browser regression suite

The journey tests for the built site. They exist because every UI defect this
repository found in review was found by hand, and each of them is a test here
now:

| Was found by hand | Is asserted by |
|---|---|
| `/package/?slug=<id>` served one generic "Entry detail" shell to cold loads, crawlers and no-JS readers — the flagship GitHub MCP server included | `entry-pages.spec.ts` (the entry's own name and title in the *served HTML*, for a pre-rendered entry, a non-pre-rendered one and a colon-bearing id) |
| `/trending/`'s publisher boards linked to a text search while showing a publisher count (`1,113` opened `1,801`) | `boards.spec.ts` (every row's figure is checked against the page its own link opens) |
| `/explore/?q=github` buried its first result at y≈600 | `explore-search.spec.ts` (first row under 560px, ordering panel after the rows) |
| Reset cleared the filters but left them in the address bar | `explore-search.spec.ts` (Reset leaves no query string; a reload shows the same screen) |
| an unknown `?host=` filtered silently while the select read "Any agent" | `explore-search.spec.ts` (the unknown host is shown as applied, with its 0 count) |
| with JS off the hero chip read "checking the catalog…" forever | `no-js.spec.ts` (every route renders; the chip reads "bundled snapshot") |
| the ⌘K palette's documented acceptance criterion: a passive load fetches nothing under `/data/` | `command-palette.spec.ts` (with positive controls: opening fetches the facets, typing fetches the index) |

## Running it

```bash
cd web
npm run build          # the suite asserts on web/out — build it first
npx playwright test    # or: npm run test:browser
```

CI runs exactly `npx playwright test` in the `browser-regression` job after
`npm ci`, `npx playwright install --with-deps chromium` and `npm run build`.

## What serves the site

`tests/serve.mjs` starts Miniflare — the runtime wrangler embeds, pinned to the
same version — and serves `web/out` through the real `worker/index.js`. The
routing semantics (`main`, `compatibility_date`, `[assets]` `binding`,
`not_found_handling`, `run_worker_first`) are read from `wrangler.toml`, so a
change to the deployed configuration cannot leave the test server describing a
different site. `wrangler dev` is not used: it wraps workerd in a file watcher
and a live-reload proxy, and against this export (14,872 files, 781 MB) it
dropped its asset manifest mid-run and began answering 404 for every path.

## Determinism rules

- **Settle before asserting.** `settle()` waits for `networkidle`, then fonts,
  then two animation frames. This project has three separate "missing logo"
  bug reports that were screenshots taken before lazy images settled.
- **Hermetic transport.** Non-test-origin requests (GitHub avatars, Google's
  favicon service) are fulfilled locally — images with a 64×64 PNG, anything
  else with an empty 204. A third-party outage must not be able to fail the
  "zero console errors" gate, and the request-count budget must not depend on
  someone else's CDN.
- **Reduced motion by default.** The site gates every ambient animation on
  `prefers-reduced-motion`; journeys run in the still state so nothing races an
  entrance animation, and `motion.spec.ts` exercises both sides of the gate,
  including a positive control that the figure does run under `no-preference`.
- **No retries.** A flaky suite gets ignored. If something is unreliable it
  belongs in a bug report, not behind a retry.

## Budgets (asserted, with current measured values)

| Budget | Value | Where |
|---|---|---|
| Cumulative Layout Shift | 0 (budget < 0.01) on `/`, `/explore/`, an entry page, the flagship query form | `budgets.spec.ts` |
| Cold-load requests for `/` | 34 same-origin of 60 total (budget ≤ 36 same-origin; third-party icon fetches are hermetic) | `budgets.spec.ts` |
| First Load JS for `/` | 106,504 B = 104.0 KiB (budget ≤ 108 KiB) | `budgets.spec.ts` |
| Horizontal overflow at 390px | none on 12 routes | `budgets.spec.ts` |
| Console errors | 0 on every top-level route (the 404 route's own document response is exempt; it is a 404 by design) | `routes.spec.ts` |

## Accessibility coverage, honestly

`a11y.spec.ts` covers the axe `color-contrast` rule on the main routes, plus
keyboard reachability and a computed-style check that every tab stop paints a
focus indicator (outline or shadow; ancestors count for outlines because the
search field's ring lives on its wrapper).

Not covered: screen-reader announcement order, zoom/reflow beyond 390px, the
rest of axe's ruleset, and anything requiring a real assistive technology. A
clean run is evidence about those specific properties, not a statement that the
site is accessible.

## The one test hook

`data-testid="result-count"` on `ExtensionGrid`'s count is the only change made
to application code for this suite. Everything else is selected by role, label
or the page's own visible text.
