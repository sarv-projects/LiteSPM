/**
 * Server-side search over the full LiteSPM catalog.
 *
 * The engine scans the in-memory unique row set — the same rows the live
 * catalog serves — with AND-combined token matching across name, summary,
 * publisher, category, kind, transport, runtime and install command. Facet
 * counts stay query-relative: each dimension is computed over the pool that
 * matches every other dimension, so a count is always the number the filter
 * it labels would produce.
 */

import { availabilityOf } from "./availability";
import { HOSTS, SKILL_TARGETS, HOST_ALIASES } from "./hosts";
import { resolveHostId, hostIdsFor } from "./identity";
import { classifyListing } from "./taxonomy";
import { getCliReleases, getCompactDataset, getDataset } from "./dataset";
import { dedupeKey, nameTiebreakBucket } from "./ranking";
import { resolveOriginalSource } from "./source-resolver";
import { candidateRowIds, expandGroups, getSearchIndex, queryGroups, scoreDoc } from "./bm25";
import { tokenize } from "./text";
import type { Listing } from "./types";

export type SortKey = "relevance" | "rank" | "name" | "kind" | "publisher";

export interface CatalogQuery {
  q?: string;
  kind?: string;
  goal?: string;
  category?: string;
  source?: string;
  publisher?: string;
  installability?: string;
  transport?: string;
  host?: string;
  installable?: string;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
  /**
   * Facet counts are computed in the same single pass as the result pool.
   * `false` skips them; `"only"` returns just the counts (no items), so a UI
   * can paint results first and fill the sidebar when it arrives.
   */
  facets?: boolean | "only";
  /** Use the compact search projection (assistant cold-start path). */
  compact?: boolean;
  /** "all" requires every query group; "any" requires half (or one). */
  match?: "all" | "any";
}

export interface CatalogHit {
  id: string;
  linkKey: string;
  name: string;
  slug: string;
  kind: Listing["kind"];
  summary: string;
  category: string;
  goal: string;
  publisher: { name: string; verified: boolean; provenance?: string; url?: string };
  source?: string;
  transport?: string | null;
  runtime?: string | null;
  url?: string | null;
  version: string | null;
  stars: number | null;
  installability?: string;
  installable: boolean;
  /** Composite quality score (0–100), stamped at dataset load. */
  rankScore: number;
  command?: string | null;
  args?: string[] | null;
  installHint?: string;
  repoUrl?: string | null;
  sourceType?: string | null;
}

export interface CatalogFacets {
  kinds: Array<[string, number]>;
  goals: Array<{ id: string; label: string; count: number }>;
  categories: Array<[string, number]>;
  sources: Array<[string, number]>;
  publishers: Array<[string, number]>;
  installability: Array<[string, number]>;
  transports: Array<[string, number]>;
  hosts: Array<[string, number]>;
}

export interface CatalogListResponse {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  items: CatalogHit[];
  facets: CatalogFacets;
}

// tokenize() and STOP_TOKENS live in ./text so the BM25 index and search use
// exactly the same normalization. Re-exported for callers that imported it here.
export { tokenize } from "./text";

function tokenScore(row: Listing, token: string): number {
  const name = row.name.toLowerCase();
  const slug = row.slug.toLowerCase();
  const publisher = row.publisher?.name?.toLowerCase() ?? "";
  let score = 0;

  if (name === token) score += 140;
  else if (name.startsWith(token)) score += 90;
  else if (name.includes(token)) score += 50;

  if (slug === token) score += 110;
  else if (slug.includes(token)) score += 40;

  if (publisher === token) score += 80;
  else if (publisher.includes(token)) score += 34;

  if (score === 0 && row.summary?.toLowerCase().includes(token)) score += 18;
  if (score === 0 && row.category?.toLowerCase().includes(token)) score += 14;
  if (score === 0) {
    const hay = `${row.transport ?? ""} ${row.runtime ?? ""} ${row.command ?? ""} ${
      row.args?.join(" ") ?? ""
    }`.toLowerCase();
    if (hay.includes(token)) score += 12;
  }
  return score;
}

function editDistanceAtMost1(s1: string, s2: string): boolean {
  const m = s1.length;
  const n = s2.length;
  if (Math.abs(m - n) > 1) return false;

  let diff = 0;
  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    if (s1[i] !== s2[j]) {
      // Check adjacent transposition: e.g. dokcer vs docker
      if (i + 1 < m && j + 1 < n && s1[i] === s2[j + 1] && s1[i + 1] === s2[j]) {
        diff++;
        i += 2;
        j += 2;
        continue;
      }
      diff++;
      if (diff > 1) return false;
      if (m > n) i++;
      else if (n > m) j++;
      else {
        i++;
        j++;
      }
    } else {
      i++;
      j++;
    }
  }
  if (i < m || j < n) diff++;
  return diff <= 1;
}

function relaxedTokenScore(row: Listing, token: string): number {
  const exact = tokenScore(row, token);
  if (exact > 0) return exact;

  if (token.length >= 4) {
    const name = row.name.toLowerCase();
    const slug = row.slug.toLowerCase();
    // Prefix fallback of length token.length - 1 (handles trailing typo)
    const prefix = token.slice(0, token.length - 1);
    if (name.includes(prefix) || slug.includes(prefix)) {
      return 30;
    }

    // Word-level 1-edit distance against name words
    const nameWords = name.split(/[\s:.-]+/);
    for (const w of nameWords) {
      if (w.length >= 3 && editDistanceAtMost1(token, w)) {
        return 35;
      }
    }

    // Word-level 1-edit distance against slug words
    const slugWords = slug.split(/[\s:.-]+/);
    for (const w of slugWords) {
      if (w.length >= 3 && editDistanceAtMost1(token, w)) {
        return 28;
      }
    }
  }
  return 0;
}

function relevanceRelaxed(row: Listing, tokens: string[]): number {
  let total = 0;
  for (const token of tokens) {
    const s = relaxedTokenScore(row, token);
    if (s === 0) return 0;
    total += s;
  }
  if (tokens.length > 1) total = Math.round(total * 1.15);
  if (row.installability && row.installability !== "discovery_only") total += 6;
  if (row.transport) total += 2;
  return total;
}

function isInstallable(row: Listing): boolean {
  // One rule for search, facets, cards and the detail page: an MCP row needs
  // a remote endpoint or a publisher-declared local command, not merely a
  // transport string.
  return availabilityOf(row).installable;
}

function clipSummary(summary: string | undefined): string {
  const text = summary ?? "";
  return text.length > 320 ? `${text.slice(0, 319).trimEnd()}…` : text;
}

function kindRank(kind: Listing["kind"]): number {
  return kind === "mcp" ? 0 : kind === "skill" ? 1 : 2;
}

/** Precomputed per-row facts, derived lazily and kept for the process life. */
interface RowMeta {
  hostIds: string[];
  goal: string;
  installable: boolean;
  /** Normalized name: the duplicate-collapse key. */
  dk: string;
}

function buildMeta(row: Listing): RowMeta {
  return {
    hostIds: hostIdsFor(row),
    goal: classifyListing(row),
    installable: isInstallable(row),
    dk: dedupeKey(row),
  };
}

const globalForMeta = globalThis as unknown as {
  __litespmRowMeta?: Map<string, RowMeta>;
  __litespmLazyMeta?: Map<string, RowMeta>;
  __litespmResultCache?: Map<string, CatalogListResponse>;
};

// Dev/HMR: drop the caches when this module (re)loads, so a map built against
// an older dataset shape is never reused. Production keeps them: they derive
// from the same immutable dataset for the process life.
if (process.env.NODE_ENV !== "production") {
  globalForMeta.__litespmRowMeta = undefined;
  globalForMeta.__litespmLazyMeta = undefined;
  globalForMeta.__litespmResultCache = undefined;
}

export function rowMetaMap(rows: Listing[]): Map<string, RowMeta> {
  const cached = globalForMeta.__litespmRowMeta;
  if (cached) return cached;
  const map = new Map<string, RowMeta>();
  for (const row of rows) map.set(row.id, buildMeta(row));
  globalForMeta.__litespmRowMeta = map;
  return map;
}

/**
 * Lazy, process-lifetime meta. It used to live inside each request, so every
 * unfiltered search re-classified all 69k rows (seconds); now each row is
 * classified once, on first use, and never again.
 */
function lazyMeta(): Map<string, RowMeta> {
  return (globalForMeta.__litespmLazyMeta ??= new Map());
}

/**
 * After the first search, classify the rest of the catalog in small slices on
 * the event loop. An unfiltered facet request needs goal/host facts for every
 * row (seconds of CPU); doing it between requests means the visitor who opens
 * the sidebar a few seconds later finds it already done. Slices yield with
 * setImmediate so concurrent requests are never blocked for long.
 */
function warmMetaInBackground(rows: Listing[]): void {
  const flag = globalThis as unknown as { __litespmMetaWarm?: boolean };
  if (flag.__litespmMetaWarm || rows.length === 0) return;
  flag.__litespmMetaWarm = true;
  const cache = lazyMeta();
  let i = 0;
  const slice = () => {
    const end = Math.min(rows.length, i + 1500);
    for (; i < end; i += 1) {
      const row = rows[i]!;
      if (!cache.has(row.id)) cache.set(row.id, buildMeta(row));
    }
    if (i < rows.length) setImmediate(slice);
  };
  setImmediate(slice);
}

const RESULT_CACHE_MAX = 200;

function resultCache(): Map<string, CatalogListResponse> {
  return (globalForMeta.__litespmResultCache ??= new Map());
}

/** Filter dimensions, one bit each, for the single-pass facet computation. */
const DIM = {
  kind: 1,
  category: 2,
  source: 4,
  publisher: 8,
  installability: 16,
  transport: 32,
  installable: 64,
  goal: 128,
  host: 256,
} as const;
type DimName = keyof typeof DIM;

/** value -> distinct duplicate-collapse keys. A facet count is the number of pages-worth of
 * distinct listings the filter it labels would produce, not raw rows. */
type Counter = Map<string, Set<string>>;

function addTo(counter: Counter, value: string, key: string): void {
  let set = counter.get(value);
  if (!set) {
    set = new Set();
    counter.set(value, set);
  }
  set.add(key);
}

/** Facets were not requested (`facets=0`): present but empty, never fabricated. */
const NO_COUNTS: Array<[string, number]> = [];

const GOAL_LABELS: Record<string, string> = {
  coding: "Coding & Development",
  web: "Websites & Design",
  data: "Data & Analytics",
  research: "Research & Learning",
  productivity: "Productivity & Workflow",
  automation: "Testing & Automation",
  infrastructure: "Cloud & Infrastructure",
  security: "Security & Identity",
  business: "Business & Finance",
  communication: "Communication & Social",
  media: "Media & Content",
  other: "Other",
};

function cacheKeyFor(query: CatalogQuery, releaseId: string): string {
  return JSON.stringify([
    releaseId,
    query.compact ? 1 : 0,
    (query.q ?? "").trim().toLowerCase(),
    query.kind ?? "",
    query.goal ?? "",
    query.category ?? "",
    query.source ?? "",
    query.publisher?.toLowerCase() ?? "",
    query.installability ?? "",
    query.transport ?? "",
    query.host?.trim().toLowerCase() ?? "",
    query.installable === "1" || query.installable === "true" ? 1 : 0,
    query.sort ?? "",
    query.page ?? 1,
    query.pageSize ?? 24,
    query.facets === "only" ? "only" : query.facets === false ? 0 : 1,
    query.match ?? "all",
  ]);
}

export async function searchCatalog(query: CatalogQuery): Promise<CatalogListResponse> {
  const dataset = query.compact ? await getCompactDataset() : await getDataset();
  const releaseId = dataset.release.releaseId;
  const cache = resultCache();
  const cacheKey = cacheKeyFor(query, releaseId);
  const hit = cache.get(cacheKey);
  if (hit) {
    // Refresh recency (Map iteration order is insertion order).
    cache.delete(cacheKey);
    cache.set(cacheKey, hit);
    return hit;
  }

  const result = computeSearch(query, dataset.rows, releaseId);
  warmMetaInBackground(dataset.rows);

  cache.set(cacheKey, result);
  while (cache.size > RESULT_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return result;
}

function computeSearch(
  query: CatalogQuery,
  rows: Listing[],
  releaseId: string,
): CatalogListResponse {
  const metaCache = lazyMeta();
  const metaFor = (row: Listing): RowMeta => {
    let value = metaCache.get(row.id);
    if (!value) {
      value = buildMeta(row);
      metaCache.set(row.id, value);
    }
    return value;
  };

  const tokens = tokenize(query.q ?? "");
  const index = getSearchIndex(rows, releaseId);
  // Absent terms become prefix / one-edit expansions drawn from the index
  // vocabulary, so typing "postg" or "dokcer" stays on the postings path.
  const groups = expandGroups(index, queryGroups(query.q ?? ""));
  const matchAny = query.match === "any";
  const minGroups = matchAny ? Math.max(1, Math.ceil(groups.length / 2)) : groups.length;
  const candidateIdx = candidateRowIds(index, groups, matchAny);

  const kindFilter = query.kind || null;
  const categoryFilter = query.category || null;
  const sourceFilter = query.source || null;
  const publisherFilter = query.publisher?.toLowerCase() || null;
  const installabilityFilter = query.installability || null;
  const transportFilter = query.transport || null;
  const goalFilter = query.goal || null;
  const installableFilter = query.installable === "1" || query.installable === "true";

  // Host filter: identity id when resolvable, else the raw spelling.
  const rawHost = query.host?.trim();
  const hostId = rawHost ? resolveHostId(rawHost) : null;
  const hostRaw = rawHost && !hostId ? rawHost.toLowerCase() : null;

  const wantFacets = query.facets !== false;
  const facetsOnly = query.facets === "only";

  interface Scored {
    row: Listing;
    rel: number;
  }
  interface Scan {
    pool: Scored[];
    poolKeys: Set<string>;
    counters: Record<DimName, Counter>;
    publisherLabels: Map<string, string>;
    /** host id -> distinct listings (shape-grouped, see below). */
    hostCounts: Map<string, number>;
    fuzzy: boolean;
  }

  const scan = (fuzzy: boolean): Scan => {
    const counters = {
      kind: new Map(),
      category: new Map(),
      source: new Map(),
      publisher: new Map(),
      installability: new Map(),
      transport: new Map(),
      installable: new Map(),
      goal: new Map(),
      host: new Map(),
    } as Record<DimName, Counter>;
    const publisherLabels = new Map<string, string>();
    // Host facet. Most rows share one of a handful of host-id arrays (the
    // memoized shapes in identity.ts), so instead of ~50 Set insertions per row
    // (3M for an unfiltered catalog), remember which shapes each distinct
    // listing appears in as a bitmask and expand once at the end.
    const shapeIndex = new Map<string[], number>();
    const shapeList: string[][] = [];
    const dkMask = new Map<string, number>();
    const pool: Scored[] = [];
    const poolKeys = new Set<string>();
    const useCandidates = !fuzzy && candidateIdx !== null;
    const n = useCandidates ? candidateIdx.length : rows.length;

    for (let i = 0; i < n; i += 1) {
      const row = rows[useCandidates ? candidateIdx[i]! : i];
      if (!row) continue;

      // Query relevance is the base condition for the pool AND every facet.
      let rel = 0;
      if (groups.length > 0) {
        if (fuzzy) {
          rel = relevanceRelaxed(row, tokens);
        } else {
          const doc = index.docs.get(row.id);
          rel = doc
            ? scoreDoc(doc, groups, index, metaFor(row).installable, Boolean(row.transport), minGroups)
            : 0;
        }
        if (rel === 0) continue;
      }

      // Which filters does this row FAIL? Zero bits means it is in the result
      // pool; exactly one bit means it belongs to that dimension's facet pool
      // (every OTHER filter holds) - all nine facet pools from one pass.
      let mask = 0;
      if (kindFilter && row.kind !== kindFilter) mask |= DIM.kind;
      if (categoryFilter && row.category !== categoryFilter) mask |= DIM.category;
      if (sourceFilter && row.source !== sourceFilter) mask |= DIM.source;
      if (publisherFilter && row.publisher?.name?.toLowerCase() !== publisherFilter)
        mask |= DIM.publisher;
      if (installabilityFilter && (row.installability ?? "discovery_only") !== installabilityFilter)
        mask |= DIM.installability;
      if (transportFilter && (row.transport ?? "") !== transportFilter) mask |= DIM.transport;
      if (installableFilter && !metaFor(row).installable) mask |= DIM.installable;
      if (goalFilter && metaFor(row).goal !== goalFilter) mask |= DIM.goal;
      if (hostId) {
        if (!metaFor(row).hostIds.includes(hostId)) mask |= DIM.host;
      } else if (hostRaw) {
        const declared = row.compatibleHosts ?? [];
        if (!declared.some((h) => h.trim().toLowerCase() === hostRaw)) mask |= DIM.host;
      }

      const inPool = mask === 0;
      if (!inPool && (!wantFacets || (mask & (mask - 1)) !== 0)) continue;

      const dk = metaFor(row).dk;
      if (inPool) {
        pool.push({ row, rel });
        poolKeys.add(dk);
      }
      if (!wantFacets) continue;

      // A dimension counts this row when every OTHER filter holds.
      const counts = (dim: DimName): boolean => mask === 0 || mask === DIM[dim];
      if (counts("kind")) addTo(counters.kind, row.kind, dk);
      if (counts("category")) {
        const category = row.category?.trim();
        if (category) addTo(counters.category, category, dk);
      }
      if (counts("source") && row.source) addTo(counters.source, row.source, dk);
      if (counts("publisher")) {
        const name = row.publisher?.name?.trim();
        if (name) {
          const key = name.toLowerCase();
          if (!publisherLabels.has(key)) publisherLabels.set(key, name);
          addTo(counters.publisher, key, dk);
        }
      }
      if (counts("installability"))
        addTo(counters.installability, row.installability ?? "discovery_only", dk);
      if (counts("transport") && row.transport) addTo(counters.transport, row.transport, dk);
      if (counts("goal")) addTo(counters.goal, metaFor(row).goal, dk);
      if (counts("host")) {
        const ids = metaFor(row).hostIds;
        let shape = shapeIndex.get(ids);
        if (shape === undefined && shapeList.length < 30) {
          shape = shapeList.length;
          shapeList.push(ids);
          shapeIndex.set(ids, shape);
        }
        if (shape !== undefined) dkMask.set(dk, (dkMask.get(dk) ?? 0) | (1 << shape));
        else for (const id of ids) addTo(counters.host, id, dk); // plugins with their own host list
      }
    }

    const hostCounts = new Map<string, number>();
    for (const [id, set] of counters.host) hostCounts.set(id, set.size);
    const perMask = new Map<number, number>();
    for (const mask of dkMask.values()) perMask.set(mask, (perMask.get(mask) ?? 0) + 1);
    for (const [mask, distinct] of perMask) {
      const hostsInMask = new Set<string>();
      for (let i = 0; i < shapeList.length; i += 1) {
        if (mask & (1 << i)) for (const id of shapeList[i]!) hostsInMask.add(id);
      }
      for (const id of hostsInMask) hostCounts.set(id, (hostCounts.get(id) ?? 0) + distinct);
    }
    return { pool, poolKeys, counters, publisherLabels, hostCounts, fuzzy };
  };

  let result = scan(false);
  // Fallback: a query that matched nothing retries with relaxed, typo-tolerant
  // scoring over the whole catalog. With vocabulary expansion above this is the
  // rare path (substring/typo cases the vocabulary could not resolve).
  if (result.pool.length === 0 && groups.length > 0) {
    const relaxed = scan(true);
    if (relaxed.pool.length > 0) result = relaxed;
  }

  const sizes = (counter: Counter): Array<[string, number]> =>
    [...counter.entries()].map(([k, set]) => [k, set.size] as [string, number]);

  // Host facet: count each row once per identity it names.
  const hostCounts = result.hostCounts;
  const hostFacets: Array<[string, number]> = [];
  for (const h of HOSTS) {
    const count = hostCounts.get(h.id) ?? 0;
    if (count > 0) hostFacets.push([h.name, count]);
  }
  for (const t of SKILL_TARGETS) {
    const id = HOST_ALIASES[t.id] ?? t.id;
    if (HOSTS.some((h) => h.id === id)) continue; // already counted by adapter
    const count = hostCounts.get(id) ?? 0;
    if (count > 0) hostFacets.push([t.displayName, count]);
  }
  hostFacets.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const facets: CatalogFacets = wantFacets
    ? {
        kinds: sizes(result.counters.kind),
        goals: sizes(result.counters.goal)
          .map(([id, count]) => ({ id, label: GOAL_LABELS[id] ?? id, count }))
          .sort((a, b) => b.count - a.count),
        categories: sizes(result.counters.category).sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
        ),
        sources: sizes(result.counters.source).sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
        ),
        publishers: sizes(result.counters.publisher)
          .map(([key, count]) => [result.publisherLabels.get(key) ?? key, count] as [string, number])
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 40),
        installability: sizes(result.counters.installability),
        transports: sizes(result.counters.transport).sort((a, b) => b[1] - a[1]),
        hosts: hostFacets,
      }
    : {
        kinds: NO_COUNTS,
        goals: [],
        categories: NO_COUNTS,
        sources: NO_COUNTS,
        publishers: NO_COUNTS,
        installability: NO_COUNTS,
        transports: NO_COUNTS,
        hosts: NO_COUNTS,
      };

  const pageSize = Math.min(60, Math.max(6, query.pageSize ?? 24));

  // Facet-only request: the counts are the payload; skip sorting, paging and
  // hit projection entirely.
  if (facetsOnly) {
    const total = result.poolKeys.size;
    return { total, page: 1, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)), items: [], facets };
  }

  const sort = query.sort ?? (groups.length > 0 ? "relevance" : "rank");
  const byRank = (a: Scored, b: Scored): number =>
    (b.row.rankScore ?? 0) - (a.row.rankScore ?? 0) ||
    nameTiebreakBucket(a.row.name) - nameTiebreakBucket(b.row.name) ||
    a.row.name.localeCompare(b.row.name);
  const sorted = result.pool;
  switch (sort) {
    case "relevance":
      // Ties on text relevance fall to the quality score, not the alphabet.
      sorted.sort((a, b) => b.rel - a.rel || byRank(a, b));
      break;
    case "rank":
      sorted.sort(byRank);
      break;
    case "publisher":
      sorted.sort(
        (a, b) =>
          (a.row.publisher?.name ?? "").localeCompare(b.row.publisher?.name ?? "") ||
          a.row.name.localeCompare(b.row.name),
      );
      break;
    case "kind":
      sorted.sort(
        (a, b) => kindRank(a.row.kind) - kindRank(b.row.kind) || a.row.name.localeCompare(b.row.name),
      );
      break;
    default:
      sorted.sort((a, b) => a.row.name.localeCompare(b.row.name, undefined, { sensitivity: "base" }));
  }

  // Duplicate collapse: when the same tool reaches the catalog as both an MCP
  // server and a skill (or under two publishers), keep only the best-ranked
  // row. Collapse before counting pages. Stop once the requested page is full
  // - the distinct total is already known from the pool scan.
  const total = result.poolKeys.size;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, query.page ?? 1));
  const start = (page - 1) * pageSize;
  const end = page * pageSize;
  const pageRows: Listing[] = [];
  const seen = new Set<string>();
  for (const { row } of sorted) {
    const key = metaFor(row).dk;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > start) pageRows.push(row);
    if (seen.size >= end) break;
  }

  function toHit(row: Listing): CatalogHit {
    const m = metaFor(row);
    const src = resolveOriginalSource(row);
    return {
      id: row.id,
      linkKey: row.linkKey ?? row.slug,
      name: row.name,
      slug: row.slug,
      kind: row.kind,
      // Cards clamp to two lines; shipping multi-KB summaries for 24 hits is
      // most of the response. The detail page has the full text.
      summary: clipSummary(row.summary),
      category: row.category ?? "",
      goal: m.goal,
      publisher: {
        name: row.publisher?.name ?? "",
        verified: Boolean(row.publisher?.verified),
        provenance: row.publisher?.provenance,
        url: src.cleanPublisherUrl || undefined,
      },
      source: row.source,
      transport: row.transport ?? null,
      runtime: row.runtime ?? null,
      url: row.url ?? null,
      version: row.version ?? null,
      stars: row.stars ?? null,
      installability: row.installability,
      installable: m.installable,
      rankScore: row.rankScore ?? 0,
      command: row.command ?? null,
      args: row.args ?? null,
      installHint: row.installHint,
      repoUrl: src.repoUrl,
      sourceType: src.sourceType,
    };
  }

  return { total, page, pageSize, pageCount, items: pageRows.map(toHit), facets };
}

export async function catalogStats() {
  // The compact projection carries every field these counts read (summaries are
  // clipped at 600 chars and classification caps them at 300), and loads in a
  // few seconds instead of parsing the 57 MB catalog: the home page calls this
  // on every visit, so it must not be the slowest cold request.
  const dataset = await getCompactDataset();
  const rows = dataset.rows;
  const metaFor = (row: Listing): RowMeta => {
    const cache = lazyMeta();
    let value = cache.get(row.id);
    if (!value) {
      value = buildMeta(row);
      cache.set(row.id, value);
    }
    return value;
  };
  const cli = getCliReleases();

  let installable = 0;
  let withEndpoint = 0;
  const byKind = { mcp: 0, skill: 0, plugin: 0 };
  const byGoal = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byTransport = new Map<string, number>();
  const publishers = new Set<string>();

  for (const row of rows) {
    byKind[row.kind] += 1;
    const m = metaFor(row);
    if (m.installable) installable += 1;
    if (row.url) withEndpoint += 1;
    byGoal.set(m.goal, (byGoal.get(m.goal) ?? 0) + 1);
    const category = row.category?.trim();
    if (category) byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    if (row.source) bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
    if (row.transport) byTransport.set(row.transport, (byTransport.get(row.transport) ?? 0) + 1);
    if (row.publisher?.name) publishers.add(row.publisher.name.trim().toLowerCase());
  }

  return {
    telemetry: dataset.telemetry,
    release: dataset.release,
    cli,
    uniqueTotal: rows.length,
    rawTotal: dataset.telemetry.itemCount,
    byKind,
    installable,
    withEndpoint,
    publishers: publishers.size,
    categories: byCategory.size,
    sources: [...bySource.entries()].sort((a, b) => b[1] - a[1]),
    transports: [...byTransport.entries()].sort((a, b) => b[1] - a[1]),
    topCategories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24),
    goalCounts: [...byGoal.entries()].sort((a, b) => b[1] - a[1]),
    hosts: HOSTS.length,
    skillTargets: SKILL_TARGETS.length,
  };
}
