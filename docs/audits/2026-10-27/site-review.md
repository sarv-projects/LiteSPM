# LiteSPM site review — 2026-10-27

## Scope and evidence

This review continues the 2026-10-22 content and visual audits. I inspected the live site in the
built-in browser, visited each listed route, checked rendered headings/sections/links, and used the
site's search and theme controls. I visually inspected the home page's first fold and footer. I did
not claim a full-page screenshot review of every route: the other routes were checked from their
rendered page state and DOM outline. The local preview could not be reached from the built-in
browser, so changes were checked with the production export and an in-process Worker harness.

Routes visited: `/`, `/explore/`, `/agents/`, `/agents/claude-code/`, `/categories/`, `/compare/`,
`/insights/`, `/package/`, `/how-it-works/`, `/get-started/`, `/docs/`, `/trust/`, `/security/`,
`/status/`, `/support/`, `/submit/`, `/about/`, `/roadmap/`, `/changelog/`, `/contact/`, `/privacy/`
and `/terms/`.

## First-time visitor review

- **Home page:** the proposition, search field, task chips and primary actions are understandable
  on the first screen. The footer has the expected browse, setup, trust and company links. No
  broken footer links or obvious visual clutter appeared in the live review.
- **Theme control:** the accessible label reports the current theme and next action. It changed
  from System to Light and back. A click issued immediately during navigation did not take effect;
  after the page mounted, the control worked normally. Re-test this under a real browser suite if
  hydration timing is changed.
- **Explore/search:** a live search for “weather” returned 323 matches with the result count and
  filters visible. Similar publisher-authored summaries make some results feel repetitive; the
  underlying rows belong to distinct listings, so the UI should improve discovery without
  collapsing or deleting entries on summary similarity alone.
- **Setup and trust pages:** `/get-started/`, `/how-it-works/`, `/docs/`, `/security/` and
  `/trust/` explain terminal ownership, config backup, approval and boundaries. The support and
  submission pages give a next step. No blank or obviously orphaned top-level route appeared in
  this pass.
- **Product details:** the prior page repeated identity, publisher, category, version and
  installability between the title, summary, specifications and an Overview tab. This pass removes
  those duplications, makes the short summary about setup and agent fit, keeps technical values in
  Specifications, and leaves four tabs: Capabilities, Compatibility, Trust & security, and Source.

## Competitor cross-check

The comparison focused on prominent directories and skill marketplaces, using their live public
pages on 2026-10-27. Competitor counts and featured entries change, so the observations below are
about presentation and product signals, not durable inventory claims.

| Site | What it makes easy to see | Useful lesson for LiteSPM |
|---|---|---|
| [MCP Market](https://mcpmarket.com/) | Broad catalog, activity/popularity cues, featured and recent listings | Add clear freshness and source evidence; keep the page scan-friendly as the catalog grows |
| [skills.sh](https://skills.sh/) | Minimal interface, leaderboard and trending views | Offer stronger task-oriented discovery and explain ranking; avoid implying installs or popularity that LiteSPM does not measure |
| [MCP.so](https://mcp.so/) | Rich directory types, ranking surfaces, detailed listing metadata | Keep provenance and configuration facts easy to find, while avoiding repeated About/Overview content |
| [MCPServers.org](https://mcpservers.org/) | Clean curated cards, concise category navigation, clear badges | Preserve concise cards and make any trust/featured signal explain what it means |
| [skild.sh](https://skild.sh/) | Install/list/update commands and platform support near the product pitch | Keep actionable setup commands close to the decision point |
| [AgenticSkills.io](https://agenticskills.io/) | Editorial guides, dates and curated context | Use editorial context and freshness where it adds concrete value |
| [AgentSkillsHub](https://github.com/ZhuYansen/agent-skills-hub) | Repository scale, scoring dimensions and refresh cadence emphasized | If LiteSPM adds quality signals, make the method and source visible rather than presenting an opaque score |

The consistent opportunity is to make recency, provenance and supported setup easy to compare.
LiteSPM deliberately has no install telemetry, so popularity counts should not be fabricated or
implied. Prefer catalog refresh time, publisher-manifest provenance, explicit installability and
compatibility evidence.

## Catalog copy and search quality

The normalized catalog scan found 1,218 duplicate-summary groups covering 2,958 listings; 7,128
summaries are shorter than 60 characters, 8,585 exceed 300 characters, and 319 contain remnants of
task-trigger wording. Some duplicates are meaningful publisher boilerplate across distinct
packages. The scan cannot establish whether text is AI-generated. Do not rewrite publisher text or
remove entries solely because it looks generic. Better next steps are clearer result grouping,
summary-length handling, and source-visible editorial context.

The search projection profile measured a 5.00 MiB gzip payload and 13.49 MiB after expansion.
Compressing took about 64 ms, decoding about 69 ms, and hydrating all 69,376 rows about 269 ms in
the profile script; hydrating 100 rows took under 1 ms. These are repeatable code-path measurements,
not a controlled browser performance score. A real browser run should measure first paint, input-to-
results latency, layout shift and network cost on representative devices.

## Technical finding: sitemap coverage

The existing static sitemap was intentionally capped at 4,000 pre-rendered product pages to stay
inside the Cloudflare Pages file budget. The Worker also serves entry-specific metadata for the
other 65,376 rows, but robots.txt did not advertise those routes. The build now writes a supplemental
sitemap index and URL shards for the remaining rows. Combined, the two package sitemaps cover all
69,376 canonical catalog keys exactly once, without generating another 65,376 HTML pages.

## Verification and remaining limit

- Passed: production build (4,110 routes), TypeScript check, lint gates, discovery tests, product
  link validation (43 checked links), sort-order parity over 69,376 rows, search projection profile,
  and `git diff --check`.
- In-process Worker check: static sitemap 4,000 URLs; supplemental shards 45,000 and 20,376 URLs;
  unique union equals the full 69,376-key catalog. A non-prerendered entry returned its own title,
  canonical and HTML response.
- Not completed: Playwright browser suite. This executor had no installed Chromium binary; the
  official browser download returned a zero-byte/corrupt archive. The built-in browser could not
  reach the executor's local preview port, so the local visual diff remains unreviewed.
- No deployment was made. The changes remain on the upgrade branch until merged/deployed by the
  project's release path.
