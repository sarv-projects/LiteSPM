/**
 * Assistant retrieval: intent-aware, per-kind, multi-query, RRF-fused.
 *
 * The public catalog search answers "what matches these words". The assistant
 * has to answer "what should I install", so it needs one more layer:
 *
 *   1. read the intent (kind, host, goal, installability, comparison)
 *   2. run the question, its stop-word-stripped form, and its synonym-expanded
 *      form through BM25F
 *   3. search MCP servers, skills and plugins separately so one kind cannot
 *      crowd out the others
 *   4. fuse the lists with Reciprocal Rank Fusion
 *   5. apply deterministic reranker rules
 *
 * No external service, no embeddings, no second LLM call.
 */

import { HOSTS, HOST_ALIASES } from "./hosts";
import { resolveHostId } from "./identity";
import { queryGroups } from "./bm25";
import { searchCatalog, tokenize, type CatalogHit } from "./search";
import { displayPackageName } from "../../lib/litespm/format";
import type { ListingKind } from "./types";

export interface AssistantIntent {
  kind?: ListingKind;
  host?: string;
  goal?: string;
  wantsInstallable: boolean;
  comparison: boolean;
}

const GOAL_HINTS: Array<[RegExp, string]> = [
  [/\b(coding|code|programming|developer|development|software|autonomous)\b/i, "coding"],
  [/\b(database|postgres|postgresql|sql|analytics|warehouse|spreadsheet)\b/i, "data"],
  [/\b(browser|playwright|puppeteer|scrape|crawl|automation|testing)\b/i, "automation"],
  [/\b(pdf|document|docx|notes|calendar|task|productivity)\b/i, "productivity"],
  [/\b(security|auth|authentication|oauth|secret|vulnerability|compliance)\b/i, "security"],
  [/\b(docker|kubernetes|k8s|deploy|cloud|infra|monitor)\b/i, "infrastructure"],
  [/\b(frontend|design|website|css|react|component)\b/i, "web"],
  [/\b(search|research|paper|documentation|knowledge|memory)\b/i, "research"],
];

const QUERY_WORDS =
  /\b(what|which|who|how|why|when|where|can|could|should|would|is|are|do|does|my|our|your|the|a|an|for|with|to|of|in|on|and|or|i|we|you|me)\b/gi;

const normalizeName = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function hasWord(haystack: string, word: string): boolean {
  if (!word) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

/**
 * Read what the visitor is asking for. These are rules, not a model call: they
 * are deterministic, testable, and add no latency.
 */
export function parseAssistantIntent(question: string): AssistantIntent {
  const q = question.toLowerCase();
  let kind: ListingKind | undefined;
  if (hasWord(q, "skill") || hasWord(q, "skills")) kind = "skill";
  else if (hasWord(q, "plugin") || hasWord(q, "plugins")) kind = "plugin";
  else if (hasWord(q, "mcp") || hasWord(q, "server") || hasWord(q, "servers")) kind = "mcp";

  let host: string | undefined;
  for (const candidate of HOSTS) {
    if (hasWord(q, candidate.name) || hasWord(q, candidate.id)) {
      host = candidate.id;
      break;
    }
  }
  if (!host) {
    for (const [alias, id] of Object.entries(HOST_ALIASES)) {
      if (hasWord(q, alias)) {
        host = resolveHostId(alias) ?? id;
        break;
      }
    }
  }

  let goal: string | undefined;
  for (const [pattern, id] of GOAL_HINTS) {
    if (pattern.test(q)) {
      goal = id;
      break;
    }
  }

  return {
    kind,
    host,
    goal,
    wantsInstallable: /\b(install|connect|set\s*up|use|add)\b/i.test(q),
    comparison: /\b(vs|versus|compare|comparison|difference|better than)\b/i.test(q),
  };
}

// Words that describe the act of asking rather than a capability. Removing
// them turns "what should I use to inspect a production database safely?"
// into the catalog query "database" instead of an impossible six-term AND.
const FILLER = new Set([
  "inspect", "safely", "safe", "production", "easiest", "easy", "option",
  "options", "recommended", "recommend", "suggest", "show", "tell", "find",
  "use", "using", "need", "want", "get", "make", "work", "working", "works",
  "compare", "comparison", "difference", "differences", "versus", "vs",
  "better", "today", "now", "current", "currently", "week", "month", "year",
  "day", "time", "this", "right", "one", "help", "helps", "helpful",
  "assist", "assists", "assistant", "litespm", "lite", "spm", "into", "onto", "inside", "within", "from", "add", "connect", "setup",
]);

function keywordTokens(question: string): string[] {
  return tokenize(question).filter((token) => !FILLER.has(token));
}

function querySet(question: string): string[] {
  const tokens = keywordTokens(question);
  let focus = tokens.slice(0, 3).join(" ");
  // The catalog's database rows are overwhelmingly PostgreSQL. When the
  // question asks for safe/production database inspection, "database" alone
  // ranks generic AWS/Redis rows above the read-only Postgres servers the
  // visitor actually wants.
  if (
    /\b(database|db|sql)\b/i.test(question) &&
    /\b(read.?only|production|safe|safely|inspect)\b/i.test(question)
  ) {
    focus = "postgres read only";
  }
  const primary = tokens[0] ?? "";
  // Long questions contain one entity plus task words ("kubernetes deployment
  // monitoring"). The focus finds the family; the primary term is the cheap
  // broad pass when the focus is too strict. Two queries keep the catalog
  // work bounded: the first gets the per-kind sweep, the second one general
  // pass.
  const out = [focus, primary]
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
  return [...new Set(out)].slice(0, 2);
}

/** Remove agent-host names ("Claude Code", "cursor") so they are not search terms. */
let hostMentionPattern: RegExp | null = null;
export function stripHostMentions(question: string): string {
  if (!hostMentionPattern) {
    const names = new Set<string>();
    for (const host of HOSTS) {
      names.add(host.name.toLowerCase());
      names.add(host.id.toLowerCase());
      names.add(host.name.toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").trim());
    }
    for (const alias of Object.keys(HOST_ALIASES)) names.add(alias.toLowerCase());
    const escaped = [...names]
      .filter((name) => name.length >= 3)
      .sort((a, b) => b.length - a.length)
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    hostMentionPattern = new RegExp(`(?<![a-z0-9])(?:${escaped.join("|")})(?![a-z0-9])`, "gi");
  }
  return question.replace(hostMentionPattern, " ").replace(/\s+/g, " ").trim();
}

async function searchKind(
  q: string,
  kind: ListingKind | undefined,
  intent: AssistantIntent,
  options: { sort: "relevance" | "rank"; any?: boolean; pageSize: number },
): Promise<CatalogHit[]> {
  const result = await searchCatalog({
    q,
    kind,
    host: intent.host,
    // Goal is a soft preference, not a hard filter: the taxonomy puts some
    // browser and database rows in coding, and a hard filter would hide the
    // exact match the user asked for.
    installable: intent.wantsInstallable && !intent.comparison ? "1" : undefined,
    pageSize: options.pageSize,
    sort: options.sort,
    match: options.any ? "any" : undefined,
    facets: false,
    compact: true,
  });
  return result.items;
}

/** Collapse the same tool published several times ("Browserbase" x4). */
function familyKey(hit: CatalogHit): string {
  const core = normalizeName(displayPackageName(hit.name)).replace(/mcp|server/g, "");
  return `${hit.kind}:${core || hit.linkKey}`;
}

/**
 * Concept words and the tool names that mean them. A row that says
 * "Playwright" is a browser-testing row even though neither word appears;
 * without this, coverage dropped Microsoft's Playwright MCP for
 * "browser testing" and an obscure row that repeats the words won.
 */
const CONCEPT_SYNONYMS: Record<string, string[]> = {
  browser: ["playwright", "puppeteer", "chrome", "chromium", "selenium", "browserbase", "web"],
  testing: ["test", "tests", "e2e", "qa", "playwright", "selenium"],
  test: ["testing", "e2e", "qa", "playwright"],
  database: ["postgres", "postgresql", "sql", "mysql", "sqlite", "mongodb", "db", "supabase", "neon"],
  db: ["database", "postgres", "sql"],
  postgres: ["postgresql", "neon", "supabase", "pg"],
  docs: ["documentation", "context7", "reference"],
  documentation: ["docs", "context7"],
  repo: ["github", "gitlab", "git", "repository"],
  git: ["github", "gitlab", "repository"],
  design: ["figma", "ui", "ux"],
  payments: ["stripe", "billing", "payment"],
  monitoring: ["sentry", "grafana", "observability", "errors"],
  search: ["brave", "exa", "tavily", "web"],
  scraping: ["firecrawl", "crawl", "scrape", "browser"],
};

function conceptCovered(token: string, text: Set<string>): boolean {
  if (text.has(token)) return true;
  return (CONCEPT_SYNONYMS[token] ?? []).some((alt) => text.has(alt));
}

/** First-party signal: strong site rank, or the publisher is the brand in the name. */
export function looksFirstParty(hit: CatalogHit): boolean {
  if ((hit.rankScore ?? 0) >= 60) return true;
  const core = normalizeName(hit.publisher.name.split(/[./]/).filter(Boolean).pop() ?? "");
  return core.length >= 4 && normalizeName(displayPackageName(hit.name)).includes(core);
}

/**
 * Rank candidates the way the site does (installable first, then quality),
 * with text relevance as the gate rather than the whole signal. Pure lexical
 * similarity put "Vibe Test" (rank 19) above Microsoft's Playwright MCP (65)
 * for "browser testing".
 */
export function scoreCandidates(
  question: string,
  lists: CatalogHit[][],
  intent: AssistantIntent,
  focus = "",
): CatalogHit[] {
  const tokens = [...new Set([...keywordTokens(stripHostMentions(question)), ...tokenize(focus)])];
  const fused = new Map<string, { hit: CatalogHit; rrf: number }>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const key = hit.linkKey || hit.id;
      const rrf = 1 / (60 + rank + 1);
      const current = fused.get(key);
      if (current) current.rrf += rrf;
      else fused.set(key, { hit, rrf });
    });
  }
  const scored = [...fused.values()].map(({ hit, rrf }) => {
    // displayPackageName drops reverse-DNS namespaces ("io.github.x/"), which would
    // otherwise make every GitHub-hosted registry row "match" the word github.
    const text = new Set(tokenize(`${displayPackageName(hit.name)} ${hit.slug} ${hit.summary} ${hit.category}`));
    const nameText = new Set(tokenize(`${displayPackageName(hit.name)} ${hit.slug}`));
    const coverage = tokens.length ? tokens.filter((t) => conceptCovered(t, text)).length / tokens.length : 0.5;
    const nameCoverage = tokens.length ? tokens.filter((t) => conceptCovered(t, nameText)).length / tokens.length : 0;
    const score =
      rrf * 1.5 +
      0.12 * coverage +
      0.05 * nameCoverage +
      // Quality counts in proportion to how well the row matches the words asked:
      // a rank-61 row that mentions one of four terms must not beat a rank-19
      // row that matches all four, but rank still beats a lexical coin-toss.
      0.5 * (Math.min(100, hit.rankScore ?? 0) / 100) * (0.35 + 0.65 * coverage) +
      (hit.installable ? 0.08 : -0.05) +
      (looksFirstParty(hit) ? 0.04 : 0) +
      (hit.publisher.verified ? 0.01 : 0) +
      boost(hit, question, intent);
    return { hit, score, coverage };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.hit.installable) - Number(a.hit.installable) ||
      (b.hit.rankScore ?? 0) - (a.hit.rankScore ?? 0) ||
      a.hit.name.localeCompare(b.hit.name),
  );
  // Drop rows that match none of the asked words unless that would leave fewer than five.
  const relevant = tokens.length ? scored.filter((entry) => entry.coverage > 0) : scored;
  const pool = relevant.length >= 5 || relevant.length === scored.length
    ? relevant
    : [...relevant, ...scored.filter((entry) => entry.coverage === 0)];
  const seen = new Set<string>();
  const out: CatalogHit[] = [];
  for (const { hit } of pool) {
    const key = familyKey(hit);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

/** Small, explicit nudges on top of quality: kind match, goal match, exact name. */
function boost(hit: CatalogHit, question: string, intent: AssistantIntent): number {
  let score = 0;
  if (intent.goal && hit.goal === intent.goal) score += 0.01;
  if (intent.kind && hit.kind === intent.kind) score += 0.03;
  const name = normalizeName(displayPackageName(hit.name));
  const q = normalizeName(stripHostMentions(question).replace(QUERY_WORDS, " "));
  if (q && name && (name === q || name.includes(q) || q.includes(name))) score += 0.05;
  return score;
}

export interface AssistantRetrieval {
  hits: CatalogHit[];
  intent: AssistantIntent;
  queries: string[];
}

/**
 * Retrieve the 8 rows the answer may cite. The caller renders the first 4 as
 * cards before the LLM starts writing. All catalog scans run concurrently.
 */
export async function retrieveAssistant(question: string): Promise<AssistantRetrieval> {
  const intent = parseAssistantIntent(question);
  const core = stripHostMentions(question) || question;
  const queries = querySet(core);
  // One kind-free sweep when the kind is unstated. Per-kind sweeps cost ~1 s
  // for every kind with zero matches (the catalog falls back to a slow scan),
  // and the site's own search is kind-free too.
  const kinds: Array<ListingKind | undefined> = [intent.kind];
  const jobs: Array<Promise<CatalogHit[]>> = [];

  for (const [queryIndex, q] of queries.entries()) {
    if (queryIndex === 0) {
      for (const kind of kinds) {
        // Text-relevance pass, then a quality-ordered pass over the same family
        // so a flagship that misses one query word still enters the pool.
        jobs.push(searchKind(q, kind, intent, { sort: "relevance", pageSize: kind ? 8 : 12 }));
        // (Not match:"any": that scan costs 1-2 s. The single-term rank pass below does the same job in ~100 ms.)
        jobs.push(searchKind(q, kind, intent, { sort: "rank", pageSize: 12 }));
      }
    } else {
      jobs.push(searchKind(q, intent.kind, intent, { sort: "rank", pageSize: 12 }));
    }
  }
  const lists = await Promise.all(jobs);

  // If strict intent filters produced nothing, retry the two best queries
  // without the kind/installability/goal constraints. Honest fallback beats an
  // empty answer.
  if (!lists.some((list) => list.length > 0)) {
    const fallback = await Promise.all(queries.slice(0, 2).map((q) =>
      searchCatalog({ q, pageSize: 8, sort: "relevance", facets: false, compact: true }).then((r) => r.items)));
    lists.push(...fallback);
  }

  // Long natural-language questions often have no row containing every term.
  const totalSoFar = lists.reduce((sum, list) => sum + list.length, 0);
  if (queryGroups(core).length > 1 && totalSoFar < 3) {
    const relaxed = await searchCatalog({
      q: queries[0] ?? core,
      kind: intent.kind,
      match: "any",
      pageSize: 12,
      sort: "relevance",
      facets: false,
      compact: true,
    });
    lists.push(relaxed.items);
  }

  return {
    hits: scoreCandidates(question, lists, intent, queries[0]).slice(0, 8),
    intent,
    queries,
  };
}