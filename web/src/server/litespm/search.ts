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

import { HOSTS, SKILL_TARGETS, HOST_ALIASES } from "./hosts";
import { resolveHostId, hostIdsFor } from "./identity";
import { classifyListing } from "./taxonomy";
import { getDataset } from "./dataset";
import { dedupeKey, nameTiebreakBucket } from "./ranking";
import { resolveOriginalSource } from "./source-resolver";
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

const STOP_TOKENS = new Set([
  "the", "a", "an", "for", "of", "to", "and", "with", "in", "on", "my", "me",
  "server", "servers", "mcp", "agent", "agents", "tool", "tools", "skill",
  "skills", "plugin", "plugins",
  // question/prose words — they name no capability
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does",
  "did", "doing", "have", "has", "had", "will", "would", "shall", "should",
  "can", "could", "may", "might", "must", "shall", "not", "no", "yes",
  "i", "you", "he", "she", "it", "we", "they", "them", "his", "her", "its",
  "our", "your", "their", "this", "that", "these", "those", "there", "here",
  "best", "good", "better", "top", "some", "any", "all", "more", "most",
  "need", "want", "get", "use", "using", "used", "help", "please", "find",
  "install", "recommend", "recommendation", "suggestions", "give", "show",
  "list", "tell", "make", "work", "working", "works", "like", "about",
]);

export function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.replace(/^[@#:]+/, "").replace(/[?!.;:'"`()[\]]+$/g, "").trim())
    .filter((t) => t.length > 1 && !STOP_TOKENS.has(t))
    .slice(0, 8);
}

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

function relevance(row: Listing, tokens: string[]): number {
  let total = 0;
  for (const token of tokens) {
    const s = tokenScore(row, token);
    if (s === 0) return 0;
    total += s;
  }
  if (tokens.length > 1) total = Math.round(total * 1.15);
  // Installable rows with a live endpoint answer the question faster.
  if (row.installability && row.installability !== "discovery_only") total += 6;
  if (row.transport) total += 2;
  return total;
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
    // 4-char start prefix
    const start4 = token.slice(0, 4);
    if (name.startsWith(start4) || slug.startsWith(start4)) {
      return 22;
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
  if (row.kind === "plugin") {
    return Boolean(row.artifact && row.artifact.type === "git-tree" && row.artifact.pinned);
  }
  const established =
    row.installability === "metadata_verified" ||
    row.installability === "runtime_verified" ||
    row.installability === "litespm_tested";
  if (!established) return false;
  if (row.kind === "mcp" && !row.transport) return false;
  return true;
}

function kindRank(kind: Listing["kind"]): number {
  return kind === "mcp" ? 0 : kind === "skill" ? 1 : 2;
}

/** Precomputed per-row host id lists, built once per dataset load. */
interface RowMeta {
  hostIds: string[];
  goal: string;
  installable: boolean;
}

const globalForMeta = globalThis as unknown as {
  __litespmRowMeta?: Map<string, RowMeta>;
};

// Dev/HMR: drop the per-row meta cache when this module (re)loads, so a stale
// map built against an older dataset shape is never reused.
if (globalForMeta.__litespmRowMeta) globalForMeta.__litespmRowMeta = undefined;

export function rowMetaMap(rows: Listing[]): Map<string, RowMeta> {
  const cached = globalForMeta.__litespmRowMeta;
  if (cached) return cached;
  const map = new Map<string, RowMeta>();
  for (const row of rows) {
    map.set(row.id, {
      hostIds: hostIdsFor(row),
      goal: classifyListing(row),
      installable: isInstallable(row),
    });
  }
  globalForMeta.__litespmRowMeta = map;
  return map;
}

export async function searchCatalog(query: CatalogQuery): Promise<CatalogListResponse> {
  const dataset = await getDataset();
  const rows = dataset.rows;
  const meta = rowMetaMap(rows);
  const tokens = tokenize(query.q ?? "");

  const kindFilter = query.kind || null;
  const categoryFilter = query.category || null;
  const sourceFilter = query.source || null;
  const publisherFilter = query.publisher?.toLowerCase() || null;
  const installabilityFilter = query.installability || null;
  const transportFilter = query.transport || null;
  const goalFilter = query.goal || null;
  const installableFilter =
    query.installable === "1" || query.installable === "true" ? true : null;

  // Host filter: identity id when resolvable, else the raw spelling.
  const rawHost = query.host?.trim();
  const hostId = rawHost ? resolveHostId(rawHost) : null;
  const hostRaw = rawHost && !hostId ? rawHost.trim().toLowerCase() : null;

  const matches = (row: Listing): boolean => {
    if (tokens.length > 0 && relevance(row, tokens) === 0) return false;
    if (kindFilter && row.kind !== kindFilter) return false;
    if (categoryFilter && row.category !== categoryFilter) return false;
    if (sourceFilter && row.source !== sourceFilter) return false;
    if (publisherFilter && row.publisher?.name?.toLowerCase() !== publisherFilter) return false;
    if (installabilityFilter && (row.installability ?? "discovery_only") !== installabilityFilter)
      return false;
    if (transportFilter && (row.transport ?? "") !== transportFilter) return false;
    if (installableFilter && !(meta.get(row.id)?.installable ?? false)) return false;
    if (goalFilter) {
      const goal = meta.get(row.id)?.goal ?? "other";
      if (goal !== goalFilter) return false;
    }
    if (hostId) {
      const hosts = meta.get(row.id)?.hostIds ?? [];
      if (!hosts.includes(hostId)) return false;
    } else if (hostRaw) {
      const declared = row.compatibleHosts ?? [];
      if (!declared.some((h) => h.trim().toLowerCase() === hostRaw)) return false;
    }
    return true;
  };

  let pool = rows.filter(matches);
  let isFuzzyFallback = false;

  // Fallback: If query tokens produced 0 results, retry with relaxed/typo-tolerant matching
  if (pool.length === 0 && tokens.length > 0) {
    const relaxedMatches = (row: Listing): boolean => {
      if (relevanceRelaxed(row, tokens) === 0) return false;
      if (kindFilter && row.kind !== kindFilter) return false;
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (sourceFilter && row.source !== sourceFilter) return false;
      if (publisherFilter && row.publisher?.name?.toLowerCase() !== publisherFilter) return false;
      if (installabilityFilter && (row.installability ?? "discovery_only") !== installabilityFilter)
        return false;
      if (transportFilter && (row.transport ?? "") !== transportFilter) return false;
      if (installableFilter && !(meta.get(row.id)?.installable ?? false)) return false;
      if (goalFilter) {
        const goal = meta.get(row.id)?.goal ?? "other";
        if (goal !== goalFilter) return false;
      }
      if (hostId) {
        const hosts = meta.get(row.id)?.hostIds ?? [];
        if (!hosts.includes(hostId)) return false;
      } else if (hostRaw) {
        const declared = row.compatibleHosts ?? [];
        if (!declared.some((h) => h.trim().toLowerCase() === hostRaw)) return false;
      }
      return true;
    };
    const relaxedPool = rows.filter(relaxedMatches);
    if (relaxedPool.length > 0) {
      pool = relaxedPool;
      isFuzzyFallback = true;
    }
  }

  const total = pool.length;

  // Facet pool: everything matching every dimension except the one being
  // counted, so counts stay meaningful while a dimension is active.
  const facetBase = (except: string): Listing[] =>
    rows.filter((row) => {
      if (tokens.length > 0) {
        const rel = isFuzzyFallback ? relevanceRelaxed(row, tokens) : relevance(row, tokens);
        if (rel === 0) return false;
      }
      if (except !== "kind" && kindFilter && row.kind !== kindFilter) return false;
      if (except !== "category" && categoryFilter && row.category !== categoryFilter) return false;
      if (except !== "source" && sourceFilter && row.source !== sourceFilter) return false;
      if (
        except !== "publisher" &&
        publisherFilter &&
        row.publisher?.name?.toLowerCase() !== publisherFilter
      )
        return false;
      if (
        except !== "installability" &&
        installabilityFilter &&
        (row.installability ?? "discovery_only") !== installabilityFilter
      )
        return false;
      if (except !== "transport" && transportFilter && (row.transport ?? "") !== transportFilter)
        return false;
      if (except !== "installable" && installableFilter && !(meta.get(row.id)?.installable ?? false))
        return false;
      if (except !== "goal" && goalFilter) {
        if ((meta.get(row.id)?.goal ?? "other") !== goalFilter) return false;
      }
      if (except !== "host") {
        if (hostId) {
          if (!(meta.get(row.id)?.hostIds ?? []).includes(hostId)) return false;
        } else if (hostRaw) {
          const declared = row.compatibleHosts ?? [];
          if (!declared.some((h) => h.trim().toLowerCase() === hostRaw)) return false;
        }
      }
      return true;
    });

  const countBy = (
    pool2: Listing[],
    key: (r: Listing) => string | null,
  ): Array<[string, number]> => {
    const map = new Map<string, number>();
    for (const row of pool2) {
      const k = key(row);
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()];
  };

  const kindPool = facetBase("kind");
  const categoryPool = facetBase("category");
  const sourcePool = facetBase("source");
  const publisherPool = facetBase("publisher");
  const transportPool = facetBase("transport");
  const goalPool = facetBase("goal");
  const hostPool = facetBase("host");
  const installabilityPool = facetBase("installability");

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

  // Host facet: count each row once per identity it names.
  const hostCounts = new Map<string, number>();
  for (const row of hostPool) {
    const ids = meta.get(row.id)?.hostIds ?? [];
    for (const id of ids) hostCounts.set(id, (hostCounts.get(id) ?? 0) + 1);
  }
  const hostFacets: Array<[string, number]> = [];
  for (const h of HOSTS) {
    const n = hostCounts.get(h.id) ?? 0;
    if (n > 0) hostFacets.push([h.name, n]);
  }
  for (const t of SKILL_TARGETS) {
    const id = HOST_ALIASES[t.id] ?? t.id;
    if (HOSTS.some((h) => h.id === id)) continue; // already counted by adapter
    const n = hostCounts.get(id) ?? 0;
    if (n > 0) hostFacets.push([t.displayName, n]);
  }
  hostFacets.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const sort = query.sort ?? (tokens.length > 0 ? "relevance" : "rank");
  const sorted = [...pool];
  switch (sort) {
    case "relevance":
      sorted.sort(
        (a, b) =>
          (isFuzzyFallback
            ? relevanceRelaxed(b, tokens) - relevanceRelaxed(a, tokens)
            : relevance(b, tokens) - relevance(a, tokens)) || a.name.localeCompare(b.name),
      );
      break;
    case "rank":
      sorted.sort(
        (a, b) =>
          (b.rankScore ?? 0) - (a.rankScore ?? 0) ||
          nameTiebreakBucket(a.name) - nameTiebreakBucket(b.name) ||
          a.name.localeCompare(b.name),
      );
      break;
    case "publisher":
      sorted.sort(
        (a, b) =>
          (a.publisher?.name ?? "").localeCompare(b.publisher?.name ?? "") ||
          a.name.localeCompare(b.name),
      );
      break;
    case "kind":
      sorted.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.name.localeCompare(b.name));
      break;
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  const pageSize = Math.min(60, Math.max(6, query.pageSize ?? 24));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, query.page ?? 1));

  // Within-page duplicate collapse: when the same tool reaches the catalog as
  // both an MCP server and a skill (or under two publishers), keep only the
  // best-ranked row on the page. Every listing keeps its own entry page, and
  // the package page cross-links the twins.
  const pageRows: Listing[] = [];
  const seenNames = new Set<string>();
  for (const row of sorted) {
    if (pageRows.length >= page * pageSize) break;
    const nameKey = dedupeKey(row);
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    pageRows.push(row);
  }
  const items = pageRows.slice((page - 1) * pageSize, page * pageSize).map(toHit);

  function toHit(row: Listing): CatalogHit {
    const m = meta.get(row.id);
    const src = resolveOriginalSource(row);
    return {
      id: row.id,
      linkKey: row.linkKey ?? row.slug,
      name: row.name,
      slug: row.slug,
      kind: row.kind,
      summary: row.summary ?? "",
      category: row.category ?? "",
      goal: m?.goal ?? "other",
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
      installable: m?.installable ?? false,
      rankScore: row.rankScore ?? 0,
      command: row.command ?? null,
      args: row.args ?? null,
      installHint: row.installHint,
      repoUrl: src.repoUrl,
      sourceType: src.sourceType,
    };
  }

  return {
    total,
    page,
    pageSize,
    pageCount,
    items,
    facets: {
      kinds: countBy(kindPool, (r) => r.kind),
      goals: countBy(goalPool, (r) => meta.get(r.id)?.goal ?? "other")
        .map(([id, count]) => ({ id, label: GOAL_LABELS[id] ?? id, count }))
        .sort((a, b) => b.count - a.count),
      categories: countBy(categoryPool, (r) => r.category?.trim() || null).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      ),
      sources: [],
      publishers: countBy(publisherPool, (r) => r.publisher?.name ?? null)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 40),
      installability: countBy(installabilityPool, (r) => r.installability ?? "discovery_only"),
      transports: countBy(transportPool, (r) => r.transport ?? null).sort((a, b) => b[1] - a[1]),
      hosts: hostFacets,
    },
  };
}

export async function catalogStats() {
  const dataset = await getDataset();
  const rows = dataset.rows;
  const meta = rowMetaMap(rows);

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
    const m = meta.get(row.id);
    if (m?.installable) installable += 1;
    if (row.url) withEndpoint += 1;
    byGoal.set(m?.goal ?? "other", (byGoal.get(m?.goal ?? "other") ?? 0) + 1);
    const category = row.category?.trim();
    if (category) byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    if (row.source) bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
    if (row.transport) byTransport.set(row.transport, (byTransport.get(row.transport) ?? 0) + 1);
    if (row.publisher?.name) publishers.add(row.publisher.name);
  }

  return {
    telemetry: dataset.telemetry,
    release: dataset.release,
    cli: dataset.cli,
    uniqueTotal: rows.length,
    rawTotal: dataset.rawCount,
    byKind,
    installable,
    withEndpoint,
    publishers: publishers.size,
    categories: byCategory.size,
    sources: [],
    transports: [...byTransport.entries()].sort((a, b) => b[1] - a[1]),
    topCategories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24),
    goalCounts: [...byGoal.entries()].sort((a, b) => b[1] - a[1]),
    hosts: HOSTS.length,
    skillTargets: SKILL_TARGETS.length,
  };
}
