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
  "assist", "assists", "assistant",
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

async function searchKind(
  q: string,
  kind: ListingKind | undefined,
  intent: AssistantIntent,
): Promise<CatalogHit[]> {
  const result = await searchCatalog({
    q,
    kind,
    host: intent.host,
    // Goal is a soft preference, not a hard filter: the taxonomy puts some
    // browser and database rows in coding, and a hard filter would hide the
    // exact match the user asked for.
    installable: intent.wantsInstallable && !intent.comparison ? "1" : undefined,
    pageSize: 8,
    sort: "relevance",
    facets: false,
    compact: true,
  });
  return result.items;
}

function boost(hit: CatalogHit, question: string, intent: AssistantIntent): number {
  let score = 0;
  if (hit.installable) score += 0.03;
  else score -= 0.02;
  if (hit.publisher.verified) score += 0.01;
  if (intent.goal && hit.goal === intent.goal) score += 0.02;
  if (intent.kind && hit.kind === intent.kind) score += 0.03;
  const name = normalizeName(hit.name);
  const q = normalizeName(question.replace(QUERY_WORDS, " "));
  if (q && (name === q || name.includes(q) || q.includes(name))) score += 0.05;
  // rankScore is a 0-100 quality score; use it only as a tiebreak, never as
  // the primary signal (it is not usage data).
  score += (hit.rankScore ?? 0) / 10_000;
  return score;
}

export interface AssistantRetrieval {
  hits: CatalogHit[];
  intent: AssistantIntent;
  queries: string[];
}

/**
 * Retrieve the 8 rows the answer may cite. The caller renders the first 4 as
 * cards before the LLM starts writing.
 */
export async function retrieveAssistant(question: string): Promise<AssistantRetrieval> {
  const intent = parseAssistantIntent(question);
  const queries = querySet(question);
  const lists: CatalogHit[][] = [];

  for (const [queryIndex, q] of queries.entries()) {
    if (intent.kind) {
      lists.push(await searchKind(q, intent.kind, intent));
      continue;
    }
    if (queryIndex > 0) {
      // Only the focus query needs the per-kind sweep. Running three kinds
      // for every variant made a comparison question do nine catalog scans;
      // one general pass for the supporting variants is enough.
      const general = await searchCatalog({
        q,
        installable: intent.wantsInstallable && !intent.comparison ? "1" : undefined,
        pageSize: 8,
        sort: "relevance",
        facets: false,
        compact: true,
      });
      lists.push(general.items);
      continue;
    }
    // Separately retrieve each kind so a mixed question gets mixed evidence.
    lists.push(await searchKind(q, "mcp", intent));
    lists.push(await searchKind(q, "skill", intent));
    lists.push(await searchKind(q, "plugin", intent));
  }

  // If strict intent filters produced nothing, retry the two best queries
  // without the kind/installability/goal constraints. Honest fallback beats an
  // empty answer.
  if (!lists.some((list) => list.length > 0)) {
    for (const q of queries.slice(0, 2)) {
      const fallback = await searchCatalog({
        q,
        pageSize: 8,
        sort: "relevance",
        facets: false,
        compact: true,
      });
      lists.push(fallback.items);
    }
  }

  // Long natural-language questions often have no row containing every term
  // ("autonomous coding" finds no skill whose text says both). A partial-match
  // pass recovers those without lowering precision for short, exact queries.
  const totalSoFar = lists.reduce((sum, list) => sum + list.length, 0);
  if (queryGroups(question).length > 1 && totalSoFar < 3) {
    const relaxed = await searchCatalog({
      q: queries[0] ?? question,
      kind: intent.kind,
      match: "any",
      pageSize: 12,
      sort: "relevance",
      facets: false,
      compact: true,
    });
    lists.push(relaxed.items);
  }

  const fused = new Map<string, { hit: CatalogHit; score: number }>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const key = hit.linkKey || hit.id;
      const rrf = 1 / (60 + rank + 1);
      const current = fused.get(key);
      if (current) current.score += rrf;
      else fused.set(key, { hit, score: rrf });
    });
  }

  const ranked = [...fused.values()]
    .map((entry) => ({
      ...entry,
      score: entry.score + boost(entry.hit, question, intent),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.hit.installable) - Number(a.hit.installable) ||
        (b.hit.rankScore ?? 0) - (a.hit.rankScore ?? 0) ||
        a.hit.name.localeCompare(b.hit.name),
    );

  return {
    hits: ranked.slice(0, 8).map((entry) => entry.hit),
    intent,
    queries,
  };
}
