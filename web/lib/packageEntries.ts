// The bounded set of catalog entries that get a real, pre-rendered page.
//
// Why a set at all: `/package/?slug=…` resolves its entry in the browser, so a
// crawler that runs no JavaScript sees one generic shell for all 69,376
// entries. Pre-rendering every entry would emit ~69,376 × 2 files (the page and
// its RSC payload) — past Cloudflare Pages' 20,000-file free-plan limit and
// ~2 GB of HTML inside the same 20-minute build. So the build pre-renders a
// bounded, chosen set at `/package/<key>/` and everything outside it keeps
// working through the existing client path — with the entry's own title,
// description, canonical, Open Graph tags and JSON-LD injected into the shell
// by the edge Worker (`worker/index.js`), so no key is left with the generic
// document. This module still owns which keys get the strongest, fully
// pre-rendered page; the Worker covers the rest.
//
// The rule, in order:
//
//   1. **Installable.** The same predicate `litespm install` runs
//      (`lib/availability`): not a plugin, metadata established, and an MCP row
//      with a transport. A page that exists for a row nobody can act on is not
//      worth the file it costs.
//   2. **From the publisher's own manifest.** `publisher.verified` means the
//      row was read from the publisher's own manifest rather than claimed by a
//      third-party list — the strongest provenance this dataset carries.
//   3. **A URL- and file-safe unique key.** `linkKey` is the slug when it is
//      unambiguous and the catalog id otherwise. Ids contain `:` and
//      percent-encoded path segments (`mcp:builtin:mcp-registry:…`), which do
//      not map reliably to static file names on every host; only keys matching
//      `[a-z0-9][a-z0-9._-]*` are pre-rendered. 6,527 rows of the installable
//      verified set are excluded by this rule alone.
//   4. **The first N in the site's balanced curated order.** The first static
//      pages cover MCP servers, skills and plugins in turn; within each kind,
//      verified installable listings keep their curated name order.
//
// Measured against the 2026-10-15 snapshot (69,376 rows): 26,554 rows are
// installable, 25,404 of those are publisher-manifest rows, 18,877 survive the
// key rule, and the cap below keeps N of them. Nothing here runs at request
// time — it is the same computation `generateStaticParams` and the sitemap use,
// so the pages that exist and the pages that are advertised cannot disagree.
//
// This module must stay free of any `data/catalog.json` import: it is reachable
// from client components, and importing the 52 MB dataset here would drag it
// into a browser chunk. The server-only memoized context lives in
// `lib/packageServer.ts`.

import type { Listing } from "./telemetry";
import { availabilityOf } from "./availability";
import { displayListingName, kindLabel, sortListings } from "./catalog";

/**
 * How many entries get a real page. Chosen from the measured budgets, not a
 * round number: each entry costs two files (`<key>/index.html` and its
 * `<key>/index.txt` RSC payload), the free plan allows 20,000 files total with
 * the deploy gate failing at 90% of that (18,000), and the 2026-10-15 build
 * used 1,563 files before this route existed. 4,000 entries cost 8,000 files,
 * which leaves the bundle at 9,563 files — 48% of the plan, >8,400 files of
 * headroom for the rest of the site and future catalog growth — and the
 * measured build (isolated copy, warm cache, `npx next build`) was 88 s
 * against the 20-minute build budget.
 *
 * Overridable for a one-off experimental build (`LITESPM_STATIC_ENTRIES`);
 * every part of the build reads the same value, so pages and sitemap stay in
 * step either way.
 */
export const MAX_STATIC_ENTRIES = (() => {
  const raw = process.env.LITESPM_STATIC_ENTRIES;
  if (raw === undefined || raw.trim() === "") return 4000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 4000;
})();

/** Keys a static host can serve as a directory name on every OS. */
const SAFE_KEY = /^[a-z0-9][a-z0-9._-]*$/;

/** Windows device names are not creatable as files; no key in this dataset is
 *  one today, and the rule stays explicit so a future dataset cannot break a
 *  Windows build silently. */
const RESERVED_KEY = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/** The key `/package/<key>/` is served under. `linkKey` is set by
 *  `withLinkKeys` over the whole dataset; the id is the safe fallback for a row
 *  that never passed through it (the id always resolves). */
export function staticEntryKey(item: Listing): string {
  return item.linkKey ?? item.id;
}

/** Is this key servable as a static path segment? */
export function isStaticEntryKey(key: string): boolean {
  return (
    SAFE_KEY.test(key) && !key.includes("..") && !key.endsWith(".") && !RESERVED_KEY.test(key)
  );
}

/** Would this row be in the pre-rendered set if the cap allowed it? */
export function isStaticEntryCandidate(item: Listing): boolean {
  if (!isStaticEntryKey(staticEntryKey(item))) return false;
  if (!item.publisher?.verified) return false;
  return availabilityOf(item).installable;
}

let cachedFor: Listing[] | null = null;
let cachedSelection: Listing[] | null = null;

/**
 * The capped set, in curated order. Memoized on the row-set identity so the
 * entry pages, `generateStaticParams` and the sitemap share one pass.
 */
export function selectStaticEntries(rows: Listing[]): Listing[] {
  if (cachedFor === rows && cachedSelection) return cachedSelection;
  const candidates = rows.filter(isStaticEntryCandidate);
  cachedSelection = sortListings(candidates, "curated").slice(0, MAX_STATIC_ENTRIES);
  cachedFor = rows;
  return cachedSelection;
}

/** Canonical address of a pre-rendered entry page. Trailing slash matches
 *  `trailingSlash: true`, so this is the URL the page itself declares. */
export function staticEntryHref(item: Listing): string {
  return `/package/${encodeURIComponent(staticEntryKey(item))}/`;
}

/** Meta descriptions are truncated by search engines and previews around 155
 *  characters; cutting at a word boundary beats a hard slice mid-word. */
export function clampMeta(text: string, max = 155): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 60 ? cut.slice(0, space) : cut).replace(/[,;:.]$/, "")}…`;
}

/** The description every surface uses for one entry. Never invents a fact:
 *  the publisher's summary when there is one, otherwise the entry's kind. */
export function entryMetaDescription(item: Listing): string {
  const summary = item.summary?.trim();
  if (summary) return clampMeta(summary);
  return clampMeta(
    `${displayListingName(item)} — an entry in the LiteSPM catalog.`
  );
}

/* ------------------------------------------------------------------ *
 * Structured data
 * ------------------------------------------------------------------ */

/**
 * `SoftwareApplication`, not `Product`.
 *
 * `Product` is a commerce type: its expected properties are offers, prices,
 * ratings and reviews, and this catalog publishes none of those (no price, no
 * star, download or install count exists in the dataset — see `lib/telemetry`).
 * Marking these entries up as products would invite rich results for facts that
 * do not exist. `SoftwareApplication` is the type that actually matches what
 * each row is — a server, a skill or a plugin an agent can add — and every
 * property below is a field the snapshot really carries: no version, publisher
 * or category is invented, and a field the record does not have is omitted
 * rather than filled with a placeholder.
 */
export function entryJsonLd(
  item: Listing,
  url: string,
  categoryText: string
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: displayListingName(item),
    ...(item.summary?.trim() ? { description: item.summary.trim() } : {}),
    url,
    applicationCategory: categoryText,
    applicationSubCategory: kindLabel(item.kind),
    ...(item.version ? { softwareVersion: item.version } : {}),
    ...(item.publisher?.provenance !== "source-owner" ? { author: { "@type": "Organization", name: item.publisher?.name || "Unknown" } } : {}),
    ...(item.publisher?.url ? { sameAs: item.publisher.url } : {}),
  };
}

/** The breadcrumb trail the page visibly shows, as structured data. */
export function entryBreadcrumbJsonLd(
  item: Listing,
  siteUrl: string,
  categoryText: string
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Index", item: `${siteUrl}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: `${kindLabel(item.kind)}s`,
        item: `${siteUrl}/explore/?kind=${item.kind}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: categoryText,
        item: `${siteUrl}/explore/?category=${encodeURIComponent(item.category)}`,
      },
      { "@type": "ListItem", position: 4, name: item.name },
    ],
  };
}

