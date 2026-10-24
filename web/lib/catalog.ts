import featured from "../data/featured.json";
import { normalizeListing, listingIdentity, uniqueListings } from "./discovery.mjs";
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
import {
  HOST_IDENTITIES,
  hostIdsFor,
  itemMatchesHost,
  resolveHostId,
  tallyHosts,
} from "./hostIdentity";
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
 * "relevance" is the search order: the match class the index recorded for each
 * posting (exact name, name prefix, name token, publisher, slug, summary or
 * tool text, catalog id), then the row's own signals. It only means anything
 * over rows a search already ranked — `sortListings` preserves the order it is
 * handed — and Explore uses it as the default while a query is active.
 *
 * "curated" is the browse default, and it is the only order this catalog can
 * honestly put first. "installable first" was the old default: true, but
 * useless as a front door, because the block of installable rows it led with
 * is ordered by name and that opened the catalog on `00Widget`. Curated orders
 * by three facts the dataset carries and the reader can check on any row:
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
export type SortMode = "relevance" | "curated" | "installable" | "index" | "name" | "publisher";

export const DEFAULT_SORT: SortMode = "curated";

/** The default order's rule, stated once in the UI where the sort control is. */
export const CURATED_NOTE =
  "Featured picks first, followed by installable packages and publisher listings.";

/** How strongly the curated order prefers a row. Higher sorts first. */
const FEATURED_IDS = new Set(featured.entries.map(entry => entry.id));
export function curatedScore(item: Listing): number {
  let score = FEATURED_IDS.has(item.id) ? 100 : 0;
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

/**
 * One collator for every name comparison.
 *
 * `String.prototype.localeCompare` builds a collator per call unless the
 * runtime happens to cache one; a collator built once and reused is several
 * times faster. The comparison is the same one: `localeCompare()` with no
 * arguments is defined as `new Intl.Collator(undefined, undefined).compare`,
 * so the order this produces is the order it produced before.
 */
const nameCollator = new Intl.Collator();

/**
 * Sort the rows without recomputing a row's key for every comparison.
 *
 * The old form called `curatedScore` (which reads the row's availability) and
 * `nameKey` (which rewrites the name) *inside* the comparator, so sorting the
 * 69,376-row catalog computed two million keys and two million ICU
 * collations — about a second of main-thread time on every filter change, on
 * a phone several times that. The keys do not change while the sort runs, so
 * they are computed once per row here.
 *
 * The order is unchanged: the same keys, the same comparison, and `sort` is
 * stable in both forms, so ties keep the order they arrived in.
 */
export function sortListings<T extends Listing>(items: T[], mode: SortMode): T[] {
  const copy = [...items];
  if (mode === "relevance") {
    // The caller's order *is* the relevance order — `useCatalogSearch` returns
    // results in the index's ranking — so this mode only freezes it.
    return copy;
  }
  if (mode === "name") {
    const decorated = copy.map((item) => ({ item, name: nameKey(item.name) }));
    decorated.sort((a, b) => nameCollator.compare(a.name, b.name));
    return decorated.map((entry) => entry.item);
  }
  if (mode === "publisher") {
    const decorated = copy.map((item) => ({
      item,
      publisher: item.publisher?.name || "",
      name: nameKey(item.name),
    }));
    decorated.sort(
      (a, b) =>
        nameCollator.compare(a.publisher, b.publisher) || nameCollator.compare(a.name, b.name)
    );
    return decorated.map((entry) => entry.item);
  }
  if (mode === "installable") {
    const decorated = copy.map((item) => ({
      item,
      installable: availabilityOf(item).installable ? 1 : 0,
      verified: item.publisher?.verified ? 1 : 0,
      name: nameKey(item.name),
    }));
    decorated.sort(
      (a, b) =>
        b.installable - a.installable ||
        b.verified - a.verified ||
        nameCollator.compare(a.name, b.name)
    );
    return decorated.map((entry) => entry.item);
  }
  if (mode === "curated") {
    const kindRank = new Map(KIND_ORDER.map((kind, index) => [kind, index]));
    const decorated = copy.map((item) => ({
      item,
      kindRank: kindRank.get(item.kind) ?? KIND_ORDER.length,
      score: curatedScore(item),
      name: nameKey(item.name),
    }));
    decorated.sort(
      (a, b) =>
        a.kindRank - b.kindRank ||
        b.score - a.score ||
        nameCollator.compare(a.name, b.name)
    );

    // A marketplace's first page should show what it contains, not one type
    // of listing repeated 48 times. Keep the curated order within each type,
    // then interleave those ordered lists so the first viewport introduces
    // MCP servers, skills and plugins together. Explicit type filters still
    // leave that type's existing curated order intact.
    const byKind = new Map<Listing["kind"], T[]>();
    for (const kind of KIND_ORDER) byKind.set(kind, []);
    for (const entry of decorated) byKind.get(entry.item.kind)?.push(entry.item);

    const mixed: T[] = [];
    const longest = Math.max(...[...byKind.values()].map((rows) => rows.length));
    for (let index = 0; index < longest; index += 1) {
      for (const kind of KIND_ORDER) {
        const item = byKind.get(kind)?.[index];
        if (item) mixed.push(item);
      }
    }
    return mixed;
  }
  // "index" is the builder's own order: verified publishers first, then kind,
  // then name. Deterministic and identical to the release artifact.
  return copy;
}

/**
 * A stable partition: rows that work with one of `hosts` first, the rest
 * after, each group keeping the order it arrived in.
 *
 * Compatibility is what `hostsFor` derives, no stronger. A local MCP server
 * works with adapters that can write its local entry; a URL server needs a
 * verified entry spelling for its exact transport. Skills use documented
 * user-scope directories, which is the website installer's default. Plugins
 * carry their own `compatibleHosts`.
 * No per-row host field is invented.
 *
 * `hosts` accepts any spelling of a host (a display name, a registry id, an
 * adapter name), because one agent answers to several: an MCP row names the
 * bridge adapter ("OpenAI Codex CLI") while a plugin row declares the
 * directory name ("Codex"), and the reader picked one agent, not two.
 * `lib/hostIdentity.ts` is the one rule that decides which spellings are the
 * same host; a spelling no registry resolves ranks nothing. Used as a ranking
 * *preference* over an already-ranked result list (the reader's agent first,
 * everything else still present below), never as a second filter. An explicit
 * sort choice is not overridden by it.
 */
export function sortByCompatibility<T extends Listing>(
  items: T[],
  hosts: readonly string[] | null
): T[] {
  if (!hosts || hosts.length === 0) return [...items];
  const wanted = new Set(
    hosts.map((host) => resolveHostId(host)).filter((id): id is string => id !== null)
  );
  if (wanted.size === 0) return [...items];
  const compatible: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const works = hostIdsFor(item).some((id) => wanted.has(id));
    (works ? compatible : rest).push(item);
  }
  return [...compatible, ...rest];
}

/* ------------------------------------------------------------------ *
 * Validation fixtures — a name pattern, demoted not deleted
 * ------------------------------------------------------------------ */

/**
 * The suffix a validation-pattern row names itself with: `, value
 * discarded`, `, path discarded`, `, body discarded`, `, number discarded`, …
 *
 * 1,090 of the catalog's 69,376 rows (measured 2026-10-16) are registry
 * entries whose names describe a format check and whose summaries repeat the
 * name verbatim — `GitHub commit SHA hex, value discarded`, `ABA routing
 * 9-digit shape, value discarded`. They are legitimate upstream entries and
 * stay in the catalog, but a generic query like `github` surfaces a wall of
 * them: their names lead with the very token a reader searches for, so the
 * index ranks them as name matches ahead of capabilities that merely mention
 * GitHub.
 *
 * The rule is the row's own statement, not a publisher list: a name that ends
 * with `, <field> discarded` says the matched value is thrown away, so the row
 * is a pattern matcher rather than a capability. On the current dataset it
 * matches 1,090 rows, every one of them `sadri-dridi`, and no row from any
 * other publisher. A bare `shape`/`charset` word was rejected as a trigger
 * because it also matches eight real capabilities outside that publisher
 * (`Shape`, `Writing Shape`, `Shape Your Agent`, `Dx Org Shape Manage`, …);
 * the price is that 73 `sadri-dridi` rows that look like fixtures but do not
 * carry the suffix (`GitHub Repo Shape`, `ULID Crockford charset`) stay
 * undemoted. Both numbers are measured, not tuned.
 */
export const VALIDATION_FIXTURE_SUFFIX = /,\s+[a-z][a-z0-9 -]*\s+discarded\s*$/i;

/** Does this row's name describe a validation pattern rather than a capability? */
export function isValidationFixture(item: Pick<Listing, "name">): boolean {
  return VALIDATION_FIXTURE_SUFFIX.test(item.name);
}

/**
 * Stable-partition validation fixtures to the end of an already-ordered list.
 *
 * Demotion, not removal or filtering: the row keeps its place in the catalog,
 * its result count, and its entry page, and searching its own words still
 * finds it — it just no longer leads a generic query. `sortListings`
 * `"relevance"` preserves the order it is handed, so this runs last, after
 * compatibility ranking: a fixture that "works with your agent" is still a
 * fixture. `"relevance"` is also the only order this applies to — an explicit
 * sort (name, publisher, installable, catalog order) is the reader's order and
 * is never second-guessed.
 */
export function demoteValidationFixtures<T extends Listing>(items: T[]): T[] {
  const kept: T[] = [];
  const demoted: T[] = [];
  for (const item of items) (isValidationFixture(item) ? demoted : kept).push(item);
  return demoted.length === 0 ? items.slice() : [...kept, ...demoted];
}

/** One host's facet: the identity, what to call it, and its compatible count. */
export interface AgentFacet {
  /** Identity id (or the raw spelling when no registry resolves it). */
  id: string;
  /** What the select shows. */
  name: string;
  /** Compatible entries, counted once per item (lib/hostIdentity). */
  count: number;
  /**
   * The count by kind. The Works-with control shows these beside the total,
   * because the total is 764 for seventy-one of the seventy-nine hosts: the
   * reader cannot otherwise tell a host LiteSPM can write an MCP config for
   * from one that only has a skills directory.
   */
  mcp: number;
  skill: number;
  plugin: number;
  /** True when LiteSPM has a compiled-in adapter for this host. */
  managed: boolean;
}

/**
 * Distinct agent hosts this catalog can install into, with compatible package
 * counts — one facet per host identity, not per catalog spelling. A skill row
 * names the Pi host through two of its strings; `tallyHosts` counts that row
 * once for the identity, so the option's figure is exactly the number of rows
 * its own filter returns.
 *
 * Every identity is offered, even one the current snapshot names no rows for
 * (a zero beside it is a measurement, not a claim), and a spelling no registry
 * resolves stays its own option rather than vanishing from the select.
 */
export function agentFacets(items: Listing[]): AgentFacet[] {
  const tally = tallyHosts(items);
  const facets: AgentFacet[] = HOST_IDENTITIES.map((identity) => {
    const counts = tally.get(identity.id);
    return {
      id: identity.id,
      name: identity.name,
      count: counts?.total ?? 0,
      mcp: counts?.mcp ?? 0,
      skill: counts?.skill ?? 0,
      plugin: counts?.plugin ?? 0,
      managed: Boolean(identity.adapter),
    };
  });
  for (const [key, host] of tally) {
    if (!key.startsWith("raw:")) continue;
    facets.push({
      id: key,
      name: host.name,
      count: host.total,
      mcp: host.mcp,
      skill: host.skill,
      plugin: host.plugin,
      managed: false,
    });
  }
  return facets.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function slugifyAgent(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Does this row work with the named host? `agentName` accepts any spelling of
 * an identity — a display name, a registry id, an adapter name, a publisher
 * spelling — and the rule that decides which spellings are one host lives in
 * `lib/hostIdentity.ts`. A name no registry resolves measures that name
 * exactly, so an unknown `?host=` reads zero rather than everything.
 */
export function matchesHost(item: Listing, agentName: string | null): boolean {
  return itemMatchesHost(item, agentName);
}

/**
 * The publishers worth browsing, with the count each one published.
 *
 * A publisher's IDENTITY is its name case-folded: the dataset spells the same
 * vendor both "nvidia" (249 rows) and "NVIDIA" (1 row), and a reader who
 * filters on either spelling must get the same rows. So the rows are counted
 * under the case-folded name, and the row is labelled with the spelling that
 * most of its rows use.
 *
 * This is the same rule the filter uses (`lib/publisherFilter.ts`) and the
 * same rule the emitted facet list uses (`scripts/emit-catalog-shards.mjs`),
 * and `scripts/check-publisher-counts.mjs` holds the three together over the
 * real dataset. Counting case-SENSITIVELY is what made the Coverage board
 * say 249 for nvidia while the link beside it opened 250.
 */
export function publisherFacets(items: Listing[], limit = 24): Array<{ name: string; count: number }> {
  items = uniqueListings(items) as Listing[];
  const counts = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const item of items) {
    const name = item.publisher?.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = counts.get(key) ?? { count: 0, spellings: new Map<string, number>() };
    entry.count += 1;
    entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1);
    counts.set(key, entry);
  }
  return Array.from(counts, ([key, entry]) => {
    // The spelling most of the rows use; ties go to the first in sort order,
    // so the label is stable between runs.
    const spellings = Array.from(entry.spellings, ([name, n]) => ({ name, n })).sort(
      (a, b) => b.n - a.n || a.name.localeCompare(b.name)
    );
    return { name: spellings[0]?.name ?? key, count: entry.count };
  })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Every distinct agent host this row set names — the denominator for coverage.
 * One entry per host identity (plus any spelling no registry resolves), so two
 * catalog strings that name one host are one host here, and a merged per-host
 * figure always has a universe that counts it once.
 */
export function hostUniverse(items: Listing[]): string[] {
  return Array.from(tallyHosts(items).keys()).sort((a, b) => a.localeCompare(b));
}

/** Share of the catalog each kind represents, for the proportional bar. */
export function kindBreakdown(items: Listing[]): Array<{
  kind: Listing["kind"];
  count: number;
  share: number;
}> {
  const unique = uniqueListings(items) as Listing[];
  const total = unique.length || 1;
  return KIND_ORDER.map((kind) => {
    const count = unique.filter((i) => i.kind === kind).length;
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
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.category?.trim();
    if (!key) continue;
    const identity = key + "|" + listingIdentity(item);
    if (seen.has(identity)) continue;
    seen.add(identity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Every distinct category, with counts — the whole vocabulary, not a slice.
 *
 * The Explore page's Category control offers the labels the sources
 * themselves publish, and a truncated list would make the control lie about
 * what it can filter: `?category=` accepts any of them, so the control must
 * offer any of them too. 64 of them on the 2026-10-17 snapshot.
 */
export function allCategoryFacets(items: Listing[]): Array<{ name: string; count: number }> {
  return categoryFacets(items, Number.MAX_SAFE_INTEGER);
}

/**
 * Every distinct ingest source, with counts and the label the site shows.
 *
 * The source is where the row was read from — the publisher's own manifest, a
 * directory, a git repository — and it is one of the ten filters the site
 * links to (every shelf's "View all" and every source board opens one). It had
 * no control until this one.
 */
export function sourceFacets(
  items: Listing[]
): Array<{ id: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const item of items) {
    const id = item.source;
    if (!id) continue;
    const identity = id + "|" + listingIdentity(item);
    if (seen.has(identity)) continue;
    seen.add(identity);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return Array.from(counts, ([id, count]) => ({ id, label: sourceLabel(id), count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
}

/**
 * `slug` is NOT unique in this dataset: 5,217 of its 57,112 distinct slugs are
 * shared by 17,481 rows (up to 1,906 answer to one slug, `mcp`). Emitting
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
 * over the slice a page happens to render. The product-page buckets do not
 * call this at all: the emitter stamps every bucket row with the key it
 * resolved over the whole dataset (`scripts/emit-catalog-shards.mjs`), because
 * a bucket-local count would call a globally-shared slug unique.
 */
export function withLinkKeys(items: Listing[]): Listing[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.slug, (counts.get(item.slug) ?? 0) + 1);
  return items.map((item) => ({
    ...normalizeListing(item),
    linkKey: counts.get(item.slug) === 1 ? item.slug : item.id,
  }));
}

/**
 * The canonical link target for a listing: `/package/<key>/`.
 *
 * One address per entry. The site used to link to `/package/?slug=<key>` — a
 * query string — while its own entries sitemap advertised the path form
 * `/package/<key>/`, and the client rewrote the address bar to the path form
 * on arrival. Two shapes for one entry means a link copied out of the page
 * and a link copied out of the sitemap are different URLs for the same
 * thing, and a shared link that lands on the query form carries the old
 * spelling forever.
 *
 * The path form is the canonical one: the edge Worker serves every entry at
 * it (`worker/index.js` answers any `/package/<key>/` — a pre-rendered file
 * when there is one, the shell with the entry's own title and identity block
 * when there is not), and the client still rewrites a `?slug=` arrival to the
 * path form, so the old spelling keeps working and stops being the shape
 * anything links to.
 */
export function listingHref(item: Listing): string {
  // `linkKey` is absent only for a row that never passed `withLinkKeys`; the id
  // always resolves, so that is the safe fallback (never the ambiguous slug).
  const key = item.linkKey ?? item.id;
  return `/package/${encodeURIComponent(key)}/`;
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
  const seen = new Set<string>();
  for (const item of items) {
    const name = item.category?.trim();
    if (!name) continue;
    const key = name + "|" + listingIdentity(item);
    if (seen.has(key)) continue;
    seen.add(key);
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

/* ------------------------------------------------------------------ *
 * Publisher marks — the real identity a row's own record names
 * ------------------------------------------------------------------ *
 *
 * Every discovery surface used to stamp a single grey letter on each row. A
 * letter is not identity: six rows by six vendors read as six identical
 * placeholders, which is exactly the "project page" impression this module
 * exists to remove.
 *
 * There is no logo field in the dataset (`publisher.avatarUrl` is empty on all
 * 69,376 rows). What the rows DO carry is identity the publisher itself
 * published, and this module derives a mark from that and nothing else:
 *
 *   1. A github.com URL on the row (`publisher.url`, `skillSource`) names an
 *      account — `github.com/<account>.png` is that account's own avatar, the
 *      same publicly served mark mcpmarket.com renders. No name guessing: the
 *      account comes from the row's own link. 27,695 rows.
 *   2. A row whose link points at a GitHub mirror (`skills.sh/…`) names the
 *      account in its first path segment, used only when that segment is the
 *      row's own publisher name. 19,208 rows.
 *   3. The MCP registry namespace convention is reverse-DNS: the publisher
 *      `com.notion` proved it owns `notion.com`, so the host is the name
 *      reversed — never an inference from the display name's spelling. 12,982
 *      rows.
 *   4. A row whose `publisher.url` points at a host of its own (not a
 *      directory, not a PaaS) may take that site's own icon. The favicon of
 *      neon.com is Neon's mark by definition — it is served by the thing the
 *      row names. 8,754 rows.
 *
 * That is 68,639 of 69,376 rows (98.9%) asking for a mark the row itself
 * names; the remaining 737 rows return `null` and draw a letter.
 *
 * `null` is a first-class answer throughout: a wrong logo is worse than a
 * letter, so no rule reaches for a mark the row does not name, and a rule that
 * cannot name one (a `co.uk` parent, a `vercel.app` apex, a directory host)
 * yields the letter. Site icons resolve through Google's favicon endpoint
 * because most vendors (notion.com, supabase.com) declare their icon in HTML
 * and serve no `/favicon.ico`: on a 900-row sample of the tier-3/4 hosts, 84%
 * resolved to a real icon and the rest answered the service's 16×16 "no icon"
 * placeholder, which `PublisherTile` detects by size and turns into the
 * letter rather than showing a glyph that is not the publisher's.
 */

export interface PublisherMark {
  /** `github`: an account avatar. `site`: a host's own icon. */
  kind: "github" | "site";
  /** The account login or the host the mark belongs to, for the tile's title. */
  label: string;
  /**
   * Image candidates in order. The tile walks the list and draws its letter
   * fallback when the last one fails, so a host that serves no icon stays a
   * letter rather than a broken-image glyph. Empty is a valid answer from
   * `siteCandidates` (a PaaS apex, a `co.uk` registry) and turns the row into
   * a letter row rather than a row wearing somebody else's logo.
   */
  srcs: string[];
}

/**
 * Top-level labels the reverse-DNS namespace convention uses (`com.notion`,
 * `io.usewire`, `ai.thetickeris`). Only a name whose FIRST label is one of
 * these is read as a namespace: `jongalloway` and `nevse` are accounts, not
 * domains, and are left alone.
 */
const NAMESPACE_TLDS = new Set([
  "com", "org", "net", "io", "ai", "dev", "app", "co", "sh", "xyz", "info", "biz",
  "me", "site", "online", "store", "tech", "cloud", "pro", "us", "uk", "de", "fr",
  "ru", "cn", "jp", "kr", "in", "br", "au", "ca", "nl", "se", "no", "fi", "dk",
  "it", "es", "ch", "at", "be", "pl", "cz", "ua", "tr", "tw", "hk", "sg", "mx",
  "za", "ar", "cl", "pt", "gr", "il", "ee", "lv", "lt", "by", "am", "az", "ge",
  "uz", "kz", "one", "live", "gg", "to", "ws", "fm", "tools", "media", "studio",
  "space", "zone", "cs", "sk", "is", "ly", "tv",
]);

/**
 * Hosts whose URLs mirror a GitHub repository (`<host>/<account>/<repo>/…`).
 *
 * skills.sh and officialskills.sh index skills straight out of GitHub: the
 * first path segment is the GitHub account. That is the directory's own URL
 * convention, and it is checked against the row's `publisher.name` before it
 * is used — all 19,206 skills.sh rows carry the handle as their publisher, and
 * a spot check of 42 sampled `<handle>/<repo>` pairs resolved to GitHub
 * repositories of exactly those names. A handle that is not the publisher is
 * never used, and a handle with no GitHub account 404s into the letter.
 */
const GITHUB_MIRROR_HOSTS = new Set([
  "skills.sh",
  "www.skills.sh",
  "officialskills.sh",
  "www.officialskills.sh",
]);

/**
 * Hosts that are directories or listings, not publishers. The row's URL points
 * at a catalogue page there, so the site's icon would be the directory's mark
 * (or one icon repeated across thousands of rows), not this row's.
 */
const DIRECTORY_HOSTS = new Set([
  "skills.sh",
  "www.skills.sh",
  "officialskills.sh",
  "www.officialskills.sh",
  "mcpservers.org",
  "www.mcpservers.org",
  "mcpmarket.com",
  "www.mcpmarket.com",
  "github.com",
  "gist.github.com",
  "awesome-mcp-servers.com",
]);

/** Parsed hostname of a URL, lowercased and stripped of `www.`, or null. */
function hostOf(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".") || host === "localhost") return null;
    return host;
  } catch {
    return null;
  }
}

function firstSegment(raw: string | undefined | null): string | null {
  const host = hostOf(raw);
  if (!host) return null;
  try {
    const segment = new URL(raw!).pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(segment) ? segment : null;
  } catch {
    return null;
  }
}

/** `com.notion` → `notion.com`; null when the name is not a namespace. */
function namespaceHost(name: string): string | null {
  const labels = name.trim().toLowerCase().split(".");
  if (labels.length < 2 || labels.length > 6) return null;
  if (!NAMESPACE_TLDS.has(labels[0])) return null;
  if (!labels.every((label) => /^[a-z0-9-]+$/.test(label))) return null;
  return [...labels].reverse().join(".");
}

/** Google's favicon endpoint: the one resolver that reads declared icons. */
function siteIcon(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

/**
 * Second-level tokens that mean the label above them is not a registrable
 * domain: `notion.co.uk`'s parent is `notion.co.uk`, never `co.uk`, whose icon
 * is the registry's and would be a wrong mark on the row. A token missing from
 * this list costs a fallback candidate, not a wrong logo, because the parent
 * is only ever tried after the host's own icon has failed.
 */
const SECOND_LEVEL_LABELS = new Set([
  "co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "go", "in", "id",
  "mil", "sch", "gen", "nom", "web", "arts", "rec", "info", "biz", "med", "pub",
  "res", "asn", "gouv", "gub", "gv", "k12", "cc", "jj", "ltd", "plc",
]);

/**
 * Shared hosting and PaaS apexes. A row whose link lives on `x.vercel.app` or
 * `x.onrender.com` names the app, not the platform; the platform's icon is
 * somebody else's logo, and `github.io` is excluded for the same reason. These
 * hosts are never a candidate nor a parent candidate, so the tile draws its
 * letter — the honest answer for "a site whose own icon we cannot name".
 */
const SHARED_HOSTING_HOSTS = new Set([
  "github.io", "gitlab.io", "vercel.app", "netlify.app", "pages.dev", "workers.dev",
  "onrender.com", "herokuapp.com", "fly.dev", "deno.dev", "glitch.me", "replit.app",
  "replit.dev", "surge.sh", "web.app", "firebaseapp.com", "azurewebsites.net",
  "appspot.com", "ngrok.app", "ngrok-free.app", "localtunnel.me", "notion.site",
  "wixsite.com", "weebly.com", "wordpress.com", "medium.com", "substack.com",
  "hashnode.dev", "blogspot.com", "tumblr.com", "bubbleapps.io", "lovable.app",
  "streamlit.app", "shinyapps.io", "zapier.app", "readthedocs.io",
]);

/**
 * Two hosts for a subdomain: the host itself, then its registrable parent
 * (`mcp.figma.com` → `figma.com`), because vendors publish the icon on the
 * root. The parent is only tried when it is plausibly registrable: exactly
 * three labels, the middle one not a second-level token (`co.uk`, `com.br`)
 * and not a shared-hosting apex (`vercel.app`), whose icon belongs to the
 * platform rather than to the row. A wrong logo is worse than a letter, so
 * every one of these checks fails towards the letter.
 */
/**
 * Labels that name a *service* rather than a brand.
 *
 * A vendor that serves an MCP endpoint at `mcp.figma.com` publishes its icon at
 * `figma.com`, not at the endpoint subdomain — so for these the registrable
 * parent is asked for first. This is not only about a better logo: asking for
 * the subdomain first produces a real 404 from the favicon service, which the
 * browser logs as a console error. Two tiles on the home page did exactly that
 * (`mcp.figma.com`, `mcp.cloudflare.com`), which is the kind of thing that makes
 * a page look broken in devtools while the user sees nothing wrong with it.
 */
const SERVICE_LABELS = new Set([
  "mcp",
  "api",
  "www",
  "www2",
  "app",
  "docs",
  "developer",
  "developers",
  "portal",
  "console",
  "dashboard",
  "cloud",
  "server",
]);

function siteCandidates(host: string): string[] {
  const labels = host.split(".");
  if (SHARED_HOSTING_HOSTS.has(host)) return [];
  const parent = labels.slice(1).join(".");
  const parentUsable =
    labels.length === 3 && !SECOND_LEVEL_LABELS.has(labels[1].toLowerCase()) && !SHARED_HOSTING_HOSTS.has(parent);

  // A service subdomain: the brand's own domain is the better first question,
  // and asking the endpoint first is what produced the 404.
  if (parentUsable && SERVICE_LABELS.has(labels[0].toLowerCase())) {
    return [siteIcon(parent), siteIcon(host)];
  }

  const srcs = [siteIcon(host)];
  if (parentUsable) srcs.push(siteIcon(parent));
  return srcs;
}

/** The pubisher's own GitHub account when the row's own link names one. */
function githubAccount(raw: string | undefined | null): string | null {
  if (hostOf(raw) !== "github.com") return null;
  return firstSegment(raw);
}

/**
 * The real mark for a row, or null when its record names neither an account
 * nor a domain. Pure over one row; safe on the server and in the browser.
 */
export function publisherMark(item: Listing): PublisherMark | null {
  const name = (item.publisher?.name ?? "").trim();

  // 1. A GitHub account the row's own link names.
  for (const raw of [item.publisher?.url, item.skillSource]) {
    const account = githubAccount(raw);
    if (account) {
      return {
        kind: "github",
        label: account,
        srcs: [`https://github.com/${account}.png?size=64`],
      };
    }
  }

  // 2. A mirror host, only when the handle it names is the publisher's own.
  for (const raw of [item.publisher?.url, item.skillSource]) {
    const host = hostOf(raw);
    if (!host || !GITHUB_MIRROR_HOSTS.has(host)) continue;
    const account = firstSegment(raw);
    if (account && account.toLowerCase() === name.toLowerCase()) {
      return {
        kind: "github",
        label: account,
        srcs: [`https://github.com/${account}.png?size=64`],
      };
    }
  }

  // 3. The reverse-DNS namespace is the publisher's own domain.
  const namespace = namespaceHost(name);
  if (namespace) {
    const srcs = siteCandidates(namespace);
    if (srcs.length) return { kind: "site", label: namespace, srcs };
  }

  // 4. The row's own link, when it points at a site rather than a directory.
  const host = hostOf(item.publisher?.url);
  if (host && !DIRECTORY_HOSTS.has(host) && !host.endsWith(".github.com")) {
    const srcs = siteCandidates(host);
    if (srcs.length) return { kind: "site", label: host, srcs };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Row signal — the strongest true claim a row can make
 * ------------------------------------------------------------------ */

export type RowSignalTier = "official" | "installable" | "discovery";

export interface RowSignal {
  tier: RowSignalTier;
  /** Chip text. Short; the note carries the reasoning. */
  label: string;
  /** The fact behind the label, in one sentence, for the chip's title. */
  note: string;
}

/**
 * The one claim a row leads with, strongest first:
 *
 *   1. **Official** — the row's own category is the upstream directory's
 *      “Official Skills by …” section, carried verbatim. Nothing in the data
 *      outranks a directory's own statement that a vendor published the skill,
 *      and the chip's note names it as that directory's classification rather
 *      than LiteSPM's finding. 285 rows.
 *   2. **Can be installed now** — the same predicate `litespm install` runs
 *      (`lib/availability`). The reader's actual question.
 *   3. **Discovery only** — listed but not installable. Stated so a click is
 *      not a surprise, never dressed up.
 *
 * The catalog publishes no star, download or install count, so no tier here is
 * a popularity figure — each is a field the reader can check on the row.
 */
export function rowSignal(item: Listing): RowSignal {
  if (item.category === OFFICIAL_SKILLS_CATEGORY) {
    return {
      tier: "official",
      label: "Official",
      note: "Published in an official source directory.",
    };
  }
  const avail = availabilityOf(item);
  return {
    tier: avail.installable ? "installable" : "discovery",
    label: avail.label,
    note: avail.plain,
  };
}

/**
 * Where a row came from, as one quiet line: the publisher's own manifest when
 * the row was read from one, else the neutral source family label (`sourceLabel`).
 * Exact source identity remains in the row data; an unknown id is not exposed
 * as public copy.
 */
export function rowProvenance(item: Listing): string {
  if (item.publisher?.verified) return "From the publisher's manifest";
  return item.source ? sourceLabel(item.source) : "Origin not stated";
}

/* ------------------------------------------------------------------ *
 * Source labels — the display names behind `domain.SourceID` values
 * ------------------------------------------------------------------ */

/**
 * Public, family-level names for ingested sources. The row retains its exact
 * source ID and URL for provenance, but the public interface does not name
 * directory feeds. Unknown IDs use a neutral fallback instead of leaking a
 * newly added feed name into the site.
 *
 * Defined here beside `rowProvenance`, the function that renders it, and
 * re-exported by `landing.ts` where the Explore source filter and the shelf
 * headings have always imported it from.
 */
export const SOURCE_LABELS: Record<string, string> = {
  "builtin:mcp-registry": "MCP registry",
  "builtin:agent-skills": "Skills index",
  "feed:skills-sh": "Skills directory",
  "feed:mcpservers-org": "MCP server directory",
  "feed:mcpmarket-com": "MCP server marketplace",
  "feed:punkpeye-awesome-mcp-servers": "Community MCP server list",
  "feed:voltagent-awesome-agent-skills": "Community skills list",
  "git:anthropics-skills": "Publisher skills repository",
  "git:claude-plugins-official": "Official plugin repository",
  "git:knowledge-work-plugins": "Workflow plugin repository",
  "git:openai-plugins": "Coding-agent plugin repository",
  "git:cursor-plugins": "Editor plugin repository",
  "git:xai-plugin-marketplace": "AI agent plugin marketplace",
};

/** The public family-level label for the source, or a neutral fallback. */
export function sourceLabel(id: string | null | undefined): string {
  if (!id) return "";
  return SOURCE_LABELS[id] ?? "Catalog source";
}
