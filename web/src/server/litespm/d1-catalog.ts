import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { CatalogFacets, CatalogHit, CatalogListResponse, CatalogQuery } from "./search";
import type { Listing } from "./types";
import { readLocalOrAssetJson } from "./assets";
import { GOAL_LABELS } from "./taxonomy";
import { resolveHostId } from "./identity";

interface D1PreparedStatement {
  bind: (...values: unknown[]) => D1PreparedStatement;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
}

interface D1Binding {
  prepare: (query: string) => D1PreparedStatement;
}

export function getD1(): D1Binding | undefined {
  try {
    const ctx = getCloudflareContext();
    const env = ctx?.env as { litespm_db?: D1Binding } | undefined;
    return env?.litespm_db;
  } catch {
    return undefined;
  }
}

export function isCloudflareWorkersRuntime(): boolean {
  try {
    const ctx = getCloudflareContext();
    return Boolean((ctx?.env as { ASSETS?: unknown; litespm_db?: unknown } | undefined)?.ASSETS);
  } catch {
    return false;
  }
}

export async function readPrecomputedJson<T>(name: string): Promise<T | null> {
  if (!isCloudflareWorkersRuntime()) return null;
  try {
    return await readLocalOrAssetJson<T>(`data/precomputed/${name}`);
  } catch {
    return null;
  }
}

const EMPTY_FACETS: CatalogFacets = {
  kinds: [],
  goals: [],
  categories: [],
  sources: [],
  publishers: [],
  installability: [],
  transports: [],
  hosts: [],
};

function ftsTokens(q: string): string[] {
  return (q.trim().toLowerCase().match(/[a-z0-9_]+/g) ?? []).slice(0, 6);
}

function buildWhere(query: CatalogQuery, alias = "c"): { sql: string; params: unknown[]; ftsQuery: string | null } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (query.kind && query.kind !== "all") {
    clauses.push(`${alias}."kind" = ?`);
    params.push(query.kind);
  }
  if (query.goal) {
    clauses.push(`${alias}."goal" = ?`);
    params.push(query.goal);
  }
  if (query.category) {
    clauses.push(`${alias}."category" = ?`);
    params.push(query.category);
  }
  if (query.source) {
    clauses.push(`${alias}."source" = ?`);
    params.push(query.source);
  }
  if (query.publisher) {
    clauses.push(`lower(${alias}."publisherName") = ?`);
    params.push(query.publisher.trim().toLowerCase());
  }
  if (query.installability) {
    clauses.push(`${alias}."installability" = ?`);
    params.push(query.installability);
  }
  if (query.transport) {
    clauses.push(`${alias}."transport" = ?`);
    params.push(query.transport);
  }
  if (query.installable === "1" || query.installable === "true") {
    clauses.push(`${alias}."installable" = 1`);
  }
  if (query.host) {
    const hostId = resolveHostId(query.host) ?? query.host.trim().toLowerCase();
    clauses.push(`${alias}."hostsCsv" LIKE ?`);
    params.push(`%,${hostId},%`);
  }

  let ftsQuery: string | null = null;
  const tokens = query.q ? ftsTokens(query.q) : [];
  if (tokens.length > 0) {
    const joiner = query.match === "any" ? " OR " : " AND ";
    ftsQuery = tokens.map((t) => `"${t}"*`).join(joiner);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
    ftsQuery,
  };
}

function orderBySql(sort: CatalogQuery["sort"], hasFts: boolean): string {
  switch (sort) {
    case "name":
      return `ORDER BY c."name" COLLATE NOCASE ASC`;
    case "kind":
      return `ORDER BY CASE c."kind" WHEN 'mcp' THEN 0 WHEN 'skill' THEN 1 ELSE 2 END ASC, c."name" COLLATE NOCASE ASC`;
    case "publisher":
      return `ORDER BY c."publisherName" COLLATE NOCASE ASC, c."name" COLLATE NOCASE ASC`;
    case "rank":
      return `ORDER BY c."installable" DESC, c."rankScore" DESC, c."name" COLLATE NOCASE ASC`;
    default:
      return hasFts
        ? `ORDER BY c."installable" DESC, bm25(CatalogFts, 4.0, 2.5, 2.0, 1.2, 1.5, 1.0) ASC, c."rankScore" DESC`
        : `ORDER BY c."installable" DESC, c."rankScore" DESC, c."name" COLLATE NOCASE ASC`;
  }
}

export async function searchCatalogD1(query: CatalogQuery): Promise<CatalogListResponse | null> {
  const db = getD1();
  if (!db) return null;

  const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 24));
  const { sql: whereSql, params, ftsQuery } = buildWhere(query, "c");

  const fromSql = ftsQuery
    ? `FROM "CatalogFts" f JOIN "CatalogListing" c ON c."id" = f."id"`
    : `FROM "CatalogListing" c`;
  const fullWhere = ftsQuery
    ? (whereSql ? `${whereSql} AND "CatalogFts" MATCH ?` : `WHERE "CatalogFts" MATCH ?`)
    : whereSql;
  const fullParams = ftsQuery ? [...params, ftsQuery] : params;

  let facets: CatalogFacets = EMPTY_FACETS;
  if (query.facets !== false) {
    const isUnfiltered = !ftsQuery && !whereSql;
    if (isUnfiltered) {
      const pre = await readPrecomputedJson<CatalogFacets>("facets.json");
      if (pre) facets = pre;
    } else {
      const [kindsRes, goalsRes, catsRes, sourcesRes, pubsRes, instRes, transRes] = await Promise.all([
        db.prepare(`SELECT c."kind" AS k, COUNT(DISTINCT c."dk") AS cnt ${fromSql} ${fullWhere} GROUP BY c."kind" ORDER BY cnt DESC`).bind(...fullParams).all<{ k: string; cnt: number }>(),
        db.prepare(`SELECT c."goal" AS k, COUNT(DISTINCT c."dk") AS cnt ${fromSql} ${fullWhere} GROUP BY c."goal" ORDER BY cnt DESC`).bind(...fullParams).all<{ k: string; cnt: number }>(),
        db.prepare(`SELECT c."category" AS k, COUNT(DISTINCT c."dk") AS cnt ${fromSql} ${fullWhere} AND c."category" != '' GROUP BY c."category" ORDER BY cnt DESC LIMIT 20`).bind(...fullParams).all<{ k: string; cnt: number }>().catch(() => ({ results: [] })),
        db.prepare(`SELECT c."source" AS k, COUNT(DISTINCT c."dk") AS cnt ${fromSql} ${fullWhere} GROUP BY c."source" ORDER BY cnt DESC`).bind(...fullParams).all<{ k: string; cnt: number }>(),
        db.prepare(`SELECT c."publisherName" AS k, COUNT(DISTINCT c."dk") AS cnt ${fromSql} ${fullWhere} GROUP BY c."publisherName" ORDER BY cnt DESC LIMIT 20`).bind(...fullParams).all<{ k: string; cnt: number }>(),
        db.prepare(`SELECT c."installability" AS k, COUNT(DISTINCT c."dk") AS cnt ${fromSql} ${fullWhere} GROUP BY c."installability" ORDER BY cnt DESC`).bind(...fullParams).all<{ k: string; cnt: number }>(),
        db.prepare(`SELECT c."transport" AS k, COUNT(DISTINCT c."dk") AS cnt ${fromSql} ${fullWhere} GROUP BY c."transport" ORDER BY cnt DESC`).bind(...fullParams).all<{ k: string; cnt: number }>(),
      ]);
      facets = {
        kinds: kindsRes.results.filter((r) => r.k).map((r) => [r.k, r.cnt]),
        goals: goalsRes.results.filter((r) => r.k).map((r) => ({ id: r.k, label: GOAL_LABELS[r.k] ?? r.k, count: r.cnt })),
        categories: catsRes.results.filter((r) => r.k).map((r) => [r.k, r.cnt]),
        sources: sourcesRes.results.filter((r) => r.k).map((r) => [r.k, r.cnt]),
        publishers: pubsRes.results.filter((r) => r.k).map((r) => [r.k, r.cnt]),
        installability: instRes.results.filter((r) => r.k).map((r) => [r.k, r.cnt]),
        transports: transRes.results.filter((r) => r.k).map((r) => [r.k, r.cnt]),
        hosts: [],
      };
    }
  }

  if (query.facets === "only") {
    const countRow = await db.prepare(`SELECT COUNT(DISTINCT c."dk") AS cnt ${fromSql} ${fullWhere}`).bind(...fullParams).first<{ cnt: number }>();
    const total = countRow?.cnt ?? 0;
    return {
      total,
      uniqueListings: 68933,
      page: 1,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      items: [],
      facets,
    };
  }

  const countRow = await db.prepare(`SELECT COUNT(DISTINCT c."dk") AS cnt ${fromSql} ${fullWhere}`).bind(...fullParams).first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, query.page ?? 1));
  const offset = (page - 1) * pageSize;

  const rowsRes = await db
    .prepare(`SELECT c."hitJson" ${fromSql} ${fullWhere} ${orderBySql(query.sort, Boolean(ftsQuery))} LIMIT ? OFFSET ?`)
    .bind(...fullParams, pageSize, offset)
    .all<{ hitJson: string }>();

  const items = rowsRes.results.map((r) => JSON.parse(r.hitJson) as CatalogHit);

  return {
    total,
    uniqueListings: 68933,
    page,
    pageSize,
    pageCount,
    items,
    facets,
  };
}

export async function findListingD1(key: string): Promise<Listing | null> {
  const db = getD1();
  if (!db) return null;

  let decoded = key;
  try {
    decoded = decodeURIComponent(key).trim();
  } catch {
    decoded = key.trim();
  }
  const clean = decoded.replace(/^\//, "");
  const lower = clean.toLowerCase();

  const exact = await db
    .prepare(`SELECT "rowJson" FROM "CatalogListing" WHERE "linkKey" = ? OR "id" = ? LIMIT 1`)
    .bind(clean, clean)
    .first<{ rowJson: string }>();
  if (exact) return JSON.parse(exact.rowJson) as Listing;

  const bySlug = await db
    .prepare(`SELECT "rowJson" FROM "CatalogListing" WHERE lower("slug") = ? OR lower("name") = ? LIMIT 1`)
    .bind(lower, lower)
    .first<{ rowJson: string }>();
  if (bySlug) return JSON.parse(bySlug.rowJson) as Listing;

  if (lower.length >= 3) {
    const fuzzy = await db
      .prepare(`SELECT "rowJson" FROM "CatalogListing" WHERE lower("slug") = ? OR lower("slug") LIKE ? OR lower("slug") LIKE ? LIMIT 1`)
      .bind(`${lower}-mcp-server`, `%-${lower}`, `${lower}-%`)
      .first<{ rowJson: string }>();
    if (fuzzy) return JSON.parse(fuzzy.rowJson) as Listing;
  }

  return null;
}

export async function findTwinsD1(dk: string, excludeId: string): Promise<Listing[]> {
  const db = getD1();
  if (!db) return [];
  const res = await db
    .prepare(`SELECT "rowJson" FROM "CatalogListing" WHERE "dk" = ? AND "id" != ? LIMIT 10`)
    .bind(dk, excludeId)
    .all<{ rowJson: string }>();
  return res.results.map((r) => JSON.parse(r.rowJson) as Listing);
}

export async function findRelatedD1(goal: string, excludeId: string, limit = 6): Promise<Listing[]> {
  const db = getD1();
  if (!db) return [];
  const res = await db
    .prepare(`SELECT "rowJson" FROM "CatalogListing" WHERE "goal" = ? AND "id" != ? AND "installable" = 1 ORDER BY "rankScore" DESC LIMIT ?`)
    .bind(goal, excludeId, limit)
    .all<{ rowJson: string }>();
  return res.results.map((r) => JSON.parse(r.rowJson) as Listing);
}
