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

const CONVERSATIONAL_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "better", "by", "can", "do",
  "find", "for", "from", "get", "give", "good", "help", "how", "i", "in",
  "into", "is", "it", "let", "make", "me", "my", "need", "of", "on", "or",
  "read", "show", "some", "that", "the", "to", "use", "using", "want", "with",
  "you", "your",
]);

const GENERIC_NOUN_STOP_WORDS = new Set([
  "add", "agent", "agents", "ai", "assistant", "assistants", "capability",
  "capabilities", "mcp", "mcps", "plugin", "plugins", "server", "servers",
  "skill", "skills", "tool", "tools",
]);

const SEARCH_SYNONYMS: Record<string, string[]> = {
  academic: ["academic", "arxiv", "paper", "scholar", "research"],
  audit: ["audit", "auditing", "security", "semgrep", "vulnerability"],
  auditing: ["auditing", "audit", "security", "semgrep", "vulnerability"],
  browse: ["browse", "browser", "web", "fetch", "playwright", "firecrawl"],
  code: ["code", "coding", "developer", "github", "git"],
  coding: ["coding", "code", "developer", "github", "git"],
  database: ["database", "postgres", "sqlite", "mysql", "supabase", "neon", "sql"],
  db: ["database", "postgres", "sqlite", "mysql", "supabase", "neon"],
  design: ["design", "ui", "ux", "figma", "css", "tailwind"],
  frontend: ["frontend", "react", "nextjs", "tailwind", "css", "ui"],
  internet: ["internet", "web", "browser", "fetch", "playwright", "search"],
  paper: ["paper", "papers", "arxiv", "academic", "research", "scholar"],
  papers: ["papers", "paper", "arxiv", "academic", "research", "scholar"],
  pdf: ["pdf", "pdfs", "document", "pypdf"],
  pdfs: ["pdfs", "pdf", "document"],
  research: ["research", "arxiv", "paper", "scholar", "search"],
  security: ["security", "audit", "auditing", "semgrep", "vulnerability"],
};

function ftsTokens(q: string): string[] {
  const raw = (q.trim().toLowerCase().match(/[a-z0-9_]+/g) ?? []).slice(0, 12);
  const withoutConv = raw.filter((t) => !CONVERSATIONAL_STOP_WORDS.has(t));
  const contentOnly = withoutConv.filter((t) => !GENERIC_NOUN_STOP_WORDS.has(t));
  const chosen = contentOnly.length > 0 ? contentOnly : withoutConv.length > 0 ? withoutConv : raw;
  return chosen.slice(0, 6);
}

function expandTokenGroup(token: string): string {
  const variants = new Set<string>([token]);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    variants.add(token.slice(0, -1));
  }
  for (const syn of SEARCH_SYNONYMS[token] ?? []) {
    variants.add(syn);
  }
  const safe = Array.from(variants).filter((v) => /^[a-z0-9_]+$/.test(v));
  if (safe.length === 1) return `"${safe[0]}"*`;
  return `(${safe.map((v) => `"${v}"*`).join(" OR ")})`;
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let diff = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (diff === -1) {
        diff = i;
      } else {
        // Allow one adjacent transposition (e.g. gihtub <-> github)
        return (
          i === diff + 1 &&
          a[diff] === b[i] &&
          a[i] === b[diff] &&
          a.slice(i + 1) === b.slice(i + 1)
        );
      }
    }
    return true;
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  let si = 0;
  let li = 0;
  let skipped = false;
  while (si < shorter.length && li < longer.length) {
    if (shorter[si] === longer[li]) {
      si++;
      li++;
    } else if (!skipped) {
      skipped = true;
      li++;
    } else {
      return false;
    }
  }
  return true;
}

function buildWhere(
  query: CatalogQuery,
  alias = "c",
): { sql: string; params: unknown[]; ftsQuery: string | null; ftsFallbackQuery: string | null; singleRawToken: string | null } {
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
  let ftsFallbackQuery: string | null = null;
  const tokens = query.q ? ftsTokens(query.q) : [];
  if (tokens.length > 0) {
    const groups = tokens.map(expandTokenGroup);
    const joiner = query.match === "any" ? " OR " : " AND ";
    ftsQuery = groups.join(joiner);
    if (query.match !== "any" && tokens.length > 1) {
      ftsFallbackQuery = groups.join(" OR ");
    }
  }
  const singleRawToken = tokens.length === 1 && tokens[0].length >= 4 ? tokens[0] : null;

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
    ftsQuery,
    ftsFallbackQuery,
    singleRawToken,
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
  const { sql: whereSql, params, ftsQuery, ftsFallbackQuery, singleRawToken } = buildWhere(query, "c");

  const makeFromWhere = (activeFts: string | null) => ({
    activeFts,
    fromSql: activeFts
      ? `FROM "CatalogFts" f JOIN "CatalogListing" c ON c."id" = f."id"`
      : `FROM "CatalogListing" c`,
    fullWhere: activeFts
      ? (whereSql ? `${whereSql} AND "CatalogFts" MATCH ?` : `WHERE "CatalogFts" MATCH ?`)
      : whereSql,
    fullParams: activeFts ? [...params, activeFts] : params,
  });

  let ctx = makeFromWhere(ftsQuery);
  let countRow = await db
    .prepare(`SELECT COUNT(DISTINCT c."dk") AS cnt ${ctx.fromSql} ${ctx.fullWhere}`)
    .bind(...ctx.fullParams)
    .first<{ cnt: number }>();
  let total = countRow?.cnt ?? 0;

  if (total === 0 && ftsFallbackQuery && ftsFallbackQuery !== ftsQuery) {
    const fallbackCtx = makeFromWhere(ftsFallbackQuery);
    const fbCount = await db
      .prepare(`SELECT COUNT(DISTINCT c."dk") AS cnt ${fallbackCtx.fromSql} ${fallbackCtx.fullWhere}`)
      .bind(...fallbackCtx.fullParams)
      .first<{ cnt: number }>();
    if ((fbCount?.cnt ?? 0) > 0) {
      ctx = fallbackCtx;
      total = fbCount?.cnt ?? 0;
    }
  }

  if (total === 0 && singleRawToken) {
    const prefixPat = `${singleRawToken.slice(0, 2)}%`;
    const suffixPat = `%${singleRawToken.slice(-3)}`;
    const typoWhere = whereSql
      ? `${whereSql} AND (lower(c."name") LIKE ? OR lower(c."slug") LIKE ? OR lower(c."name") LIKE ? OR lower(c."slug") LIKE ?)`
      : `WHERE (lower(c."name") LIKE ? OR lower(c."slug") LIKE ? OR lower(c."name") LIKE ? OR lower(c."slug") LIKE ?)`;
    const candidates = await db
      .prepare(`SELECT c."name", c."slug", c."hitJson" FROM "CatalogListing" c ${typoWhere} ORDER BY c."installable" DESC, c."rankScore" DESC LIMIT 120`)
      .bind(...params, prefixPat, prefixPat, suffixPat, suffixPat)
      .all<{ name: string; slug: string; hitJson: string }>();
    const matched = candidates.results
      .filter((r) => {
        const words = `${r.name} ${r.slug}`.toLowerCase().match(/[a-z0-9]+/g) ?? [];
        return words.some((w) => editDistanceAtMost1(singleRawToken, w));
      })
      .map((r) => JSON.parse(r.hitJson) as CatalogHit);
    if (matched.length > 0) {
      const typoTotal = matched.length;
      const pageCount = Math.max(1, Math.ceil(typoTotal / pageSize));
      const page = Math.min(pageCount, Math.max(1, query.page ?? 1));
      const offset = (page - 1) * pageSize;
      return {
        total: typoTotal,
        uniqueListings: 68933,
        page,
        pageSize,
        pageCount,
        items: query.facets === "only" ? [] : matched.slice(offset, offset + pageSize),
        facets: EMPTY_FACETS,
      };
    }
  }

  const { activeFts, fromSql, fullWhere, fullParams } = ctx;

  let facets: CatalogFacets = EMPTY_FACETS;
  if (query.facets !== false) {
    const isUnfiltered = !activeFts && !whereSql;
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

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, query.page ?? 1));
  const offset = (page - 1) * pageSize;

  const rowsRes = await db
    .prepare(`SELECT c."hitJson" ${fromSql} ${fullWhere} ${orderBySql(query.sort, Boolean(activeFts))} LIMIT ? OFFSET ?`)
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
