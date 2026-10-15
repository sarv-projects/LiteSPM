// Catalog derivation helpers shared by Explore, Coverage, Agents and Categories.
// Everything is computed from a row set that is handed in — no module state, no
// JSON import, no `"use client"`. That is deliberate:
//
//   * the build-time pages (Server Components) import `data/catalog.json` and
//     call these helpers to prerender real HTML, and
//   * the browser calls them again on the row set it fetches lazily at
//     /data/catalog.json after the first interaction.
//
// A module that statically imported the ~3.8 MB dataset would drag it into
// every route's client bundle, which is exactly what this split removes. Both
// sides therefore derive from the same functions over the same rows, so the
// prerendered numbers and the post-fetch numbers cannot disagree.
//
// No usage, download, install or star data exists in the dataset, so no helper
// here ranks by popularity.

import type { Listing } from "./telemetry";
import { hostsFor } from "./hosts";
import { availabilityOf } from "./availability";

export const KIND_ORDER: Listing["kind"][] = ["mcp", "skill", "plugin"];

/**
 * The catalog's own category for skills the publisher itself ships.
 *
 * The trailing preposition is the upstream section name, and it is the exact
 * value Explore filters on — it must stay untouched in every URL and
 * comparison. It is only wrong on screen, where `categoryLabel` normalises it.
 *
 * Defined here rather than in `landing.ts` because it is a dataset value: the
 * curated sort below reads it, and `landing.ts` re-exports it so the label
 * module and the landing page keep importing it from one place.
 */
export const OFFICIAL_SKILLS_CATEGORY = "Official Skills by";

/** Rows rendered per page by ExtensionGrid; also the prerendered slice. */
export const GRID_PAGE = 48;

export function kindLabel(kind: string): string {
  switch (kind) {
    case "mcp":
      return "MCP Server";
    case "skill":
      return "Agent Skill";
    case "plugin":
      return "Plugin";
    default:
      return kind;
  }
}

/**
 * Sort modes are limited to axes the data actually carries.
 *
 * "stars" and "newest" were removed: the catalog publishes no star counts (the
 * upstream sources do not expose them) and carries no publish timestamps, so
 * both modes were ordering by nothing while their labels claimed otherwise.
 *
 * "curated" is the default, and it is the only order this catalog can honestly
 * put first. "installable first" was the old default: true, but useless as a
 * front door, because the block of installable rows it led with is ordered by
 * name and that opened the catalog on `00Widget`. Curated orders by three
 * facts the dataset carries and the reader can check on any row:
 *
 *   1. skills the publisher itself ships (the upstream "Official Skills by"
 *      section),
 *   2. rows read from the publisher's own manifest (`publisher.verified`),
 *   3. rows LiteSPM can actually install (`availabilityOf`).
 *
 * No popularity figure exists in the data, so none is used — the rule is
 * stated in the UI next to the control, and every step of it is a field the
 * reader can see on the row's own page.
 */
export type SortMode = "curated" | "installable" | "index" | "name" | "publisher";

export const DEFAULT_SORT: SortMode = "curated";

/** The default order's rule, stated once in the UI where the sort control is. */
export const CURATED_NOTE =
  "Official publisher skills first, then rows read from publisher manifests, then rows that install.";

/** How strongly the curated order prefers a row. Higher sorts first. */
export function curatedScore(item: Listing): number {
  let score = 0;
  if (item.category === OFFICIAL_SKILLS_CATEGORY) score += 4;
  if (item.publisher?.verified) score += 2;
  if (availabilityOf(item).installable) score += 1;
  return score;
}

/**
 * Compare names on their first alphanumeric run.
 *
 * `$AI on HyperEVM`, `.FAF Context` and `(WiP) An everything app` all sort
 * ahead of "Aardvark" under a plain `localeCompare`, which is how the catalog
 * opened. Ignoring leading punctuation is the same convention that files
 * "The Beatles" under B — it changes nothing about the data, only the order a
 * reader reads it in.
 */
function nameKey(name: string): string {
  const stripped = name.replace(/^[^0-9A-Za-z]+/, "");
  return (stripped || name).toLowerCase();
}

export function sortListings<T extends Listing>(items: T[], mode: SortMode): T[] {
  const copy = [...items];
  if (mode === "name") {
    return copy.sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)));
  }
  if (mode === "publisher") {
    return copy.sort(
      (a, b) =>
        (a.publisher?.name || "").localeCompare(b.publisher?.name || "") ||
        nameKey(a.name).localeCompare(nameKey(b.name))
    );
  }
  if (mode === "installable") {
    return copy.sort(
      (a, b) =>
        Number(availabilityOf(b).installable) - Number(availabilityOf(a).installable) ||
        Number(Boolean(b.publisher?.verified)) - Number(Boolean(a.publisher?.verified)) ||
        nameKey(a.name).localeCompare(nameKey(b.name))
    );
  }
  if (mode === "curated") {
    return copy.sort(
      (a, b) =>
        curatedScore(b) - curatedScore(a) || nameKey(a.name).localeCompare(nameKey(b.name))
    );
  }
  // "index" is the builder's own order: verified publishers first, then kind,
  // then name. Deterministic and identical to the release artifact.
  return copy;
}

/** Distinct agents this catalog can install into, with compatible package counts. */
export function agentFacets(items: Listing[]): Array<{ name: string; slug: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const host of hostsFor(item)) {
      const key = host.trim();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([name, count]) => ({ name, slug: slugifyAgent(name), count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );
}

export function slugifyAgent(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function matchesHost(item: Listing, agentName: string | null): boolean {
  if (!agentName) return true;
  const target = agentName.toLowerCase();
  return hostsFor(item).some((h) => h.toLowerCase() === target);
}

export function publisherFacets(items: Listing[], limit = 24): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = item.publisher?.name?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function topByPublisher(items: Listing[], n: number): Listing[] {
  return sortListings(items, "publisher").slice(0, n);
}

export function verifiedItems(items: Listing[]): Listing[] {
  return items.filter((i) => i.publisher?.verified);
}

/** Distinct host names across the whole catalog - the denominator for coverage. */
export function hostUniverse(items: Listing[]): string[] {
  const hosts = new Set<string>();
  for (const item of items) {
    for (const host of hostsFor(item)) {
      const key = host.trim();
      if (key) hosts.add(key);
    }
  }
  return Array.from(hosts).sort((a, b) => a.localeCompare(b));
}

/** Share of the catalog each kind represents, for the proportional bar. */
export function kindBreakdown(items: Listing[]): Array<{
  kind: Listing["kind"];
  count: number;
  share: number;
}> {
  const total = items.length || 1;
  return KIND_ORDER.map((kind) => {
    const count = items.filter((i) => i.kind === kind).length;
    return { kind, count, share: count / total };
  });
}

/** What is browsable in this row set, counted rather than trusted from a manifest. */
export function deriveKindCounts(items: Listing[]): {
  all: number;
  mcp: number;
  skill: number;
  plugin: number;
} {
  let mcp = 0;
  let skill = 0;
  let plugin = 0;
  for (const item of items) {
    if (item.kind === "mcp") mcp += 1;
    else if (item.kind === "skill") skill += 1;
    else if (item.kind === "plugin") plugin += 1;
  }
  return { all: items.length, mcp, skill, plugin };
}

/** Distinct categories with counts, ordered by frequency (then name). */
export function categoryFacets(items: Listing[], limit = 16): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.category?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * `slug` is NOT unique in this dataset: 121 slugs are shared by 402 entries
 * (up to 73 answer to one slug, e.g. `skill-creator`). Emitting
 * `?slug=<slug>` for those would send a reader to whichever entry happened to
 * be indexed last.
 *
 * So: the catalog id is the unique key and the slug is the readable one. Where
 * a slug is unambiguous we use it, and where it is not we fall back to the id.
 * Both go in the same `?slug=` parameter, so the route shape is unchanged.
 *
 * `withLinkKeys` resolves that once per row set — on the server at build time
 * and in the browser after the lazily-fetched rows arrive — so the link target
 * rides along on the row instead of needing the whole row set in every
 * component that renders a card. Counts are computed over the full set, never
 * over the slice a page happens to render.
 */
export function withLinkKeys(items: Listing[]): Listing[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.slug, (counts.get(item.slug) ?? 0) + 1);
  return items.map((item) => ({
    ...item,
    linkKey: counts.get(item.slug) === 1 ? item.slug : item.id,
  }));
}

/** Canonical link target for a listing. Always `/package/?slug=<key>`. */
export function listingHref(item: Listing): string {
  // `linkKey` is absent only for a row that never passed `withLinkKeys`; the id
  // always resolves, so that is the safe fallback (never the ambiguous slug).
  const key = item.linkKey ?? item.id;
  return `/package/?slug=${encodeURIComponent(key)}`;
}

/** Category counts broken down by kind, for the categories index. */
export interface CategoryFacet {
  name: string;
  count: number;
  byKind: Record<Listing["kind"], number>;
  share: number;
}

export function categoryIndex(items: Listing[]): CategoryFacet[] {
  const map = new Map<string, CategoryFacet>();
  let max = 1;
  for (const item of items) {
    const name = item.category?.trim();
    if (!name) continue;
    let facet = map.get(name);
    if (!facet) {
      facet = { name, count: 0, byKind: { mcp: 0, skill: 0, plugin: 0 }, share: 0 };
      map.set(name, facet);
    }
    facet.count += 1;
    facet.byKind[item.kind] += 1;
    if (facet.count > max) max = facet.count;
  }
  return Array.from(map.values())
    .map((facet) => ({ ...facet, share: facet.count / max }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Does this row come from the given `domain.SourceID`? */
export function matchesSource(item: Listing, source: string | null): boolean {
  if (!source) return true;
  return item.source === source;
}

/**
 * Whether `litespm install` can complete for this row — the same predicate the
 * Explore "installable only" filter and the home shelves use.
 */
export function isInstallable(item: Listing): boolean {
  return availabilityOf(item).installable;
}
