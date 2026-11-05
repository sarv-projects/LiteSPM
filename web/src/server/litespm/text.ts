/**
 * Shared query/document text pipeline for catalog search.
 *
 * The old search compared raw lowercase tokens. That missed the two things
 * catalog questions actually contain: inflections ("databases" vs "database",
 * "optimizing" vs "optimize") and everyday synonyms ("postgres" vs "psql",
 * "browser" vs "playwright"). This module normalizes both sides before BM25F
 * scoring. It is deliberately dependency-free: the whole pipeline is a few
 * small string operations, so it adds no cold-start cost.
 */

export const STOP_TOKENS = new Set([
  "the", "a", "an", "for", "of", "to", "and", "with", "in", "on", "my", "me",
  "server", "servers", "mcp", "agent", "agents", "tool", "tools", "skill",
  "skills", "plugin", "plugins",
  // question/prose words — they name no capability
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does",
  "did", "doing", "have", "has", "had", "will", "would", "shall", "should",
  "can", "could", "may", "might", "must", "not", "no", "yes",
  "i", "you", "he", "she", "it", "we", "they", "them", "his", "her", "its",
  "our", "your", "their", "this", "that", "these", "those", "there", "here",
  "best", "good", "better", "top", "some", "any", "all", "more", "most",
  "need", "want", "get", "use", "using", "used", "help", "please", "find",
  "install", "recommend", "recommendation", "suggestions", "give", "show",
  "list", "tell", "make", "work", "working", "works", "like", "about",
]);

const ALIASES: Record<string, string> = {
  postgresql: "postgres",
  psql: "postgres",
  pg: "postgres",
  js: "javascript",
  ts: "typescript",
  k8s: "kubernetes",
  db: "database",
  dbs: "database",
  docs: "document",
  doc: "document",
  pdfs: "pdf",
  browsing: "browse",
  brows: "browse",
  optimize: "optimiz",
  optimized: "optimiz",
  optimizes: "optimiz",
  optimizing: "optimiz",
  quer: "query",
  queri: "query",
  librari: "library",
  automate: "automat",
  automated: "automat",
  automating: "automat",
  automations: "automat",
};

// Suffix rules can produce a form the alias table did not name; fold the last
// common irregulars back so both sides of the index agree. Module-level
// because this runs millions of times during the one-time index build.
const POST_STEM_ALIASES: Record<string, string> = {
  brows: "browse",
  queri: "query",
  librari: "library",
  autom: "automat",
};

/** Lowercase and normalize punctuation before stemming. */
export function normalizeToken(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/#/g, "sharp")
    .replace(/[^\p{L}\p{N}]/gu, "");
  return normalizeCleanWord(cleaned);
}

/**
 * Fast path for tokens that are already split on non-alphanumerics. The
 * catalog has millions of tokens; the two regexes in normalizeToken are only
 * needed for raw user input, not for an already-clean field word.
 */
const WORD_CACHE = new Map<string, string>();

function normalizeCleanWord(word: string): string {
  const cached = WORD_CACHE.get(word);
  if (cached !== undefined) return cached;
  const aliased = ALIASES[word] ?? word;
  const stemmed = stem(aliased);
  const normalized = POST_STEM_ALIASES[stemmed] ?? stemmed;
  // The catalog vocabulary is small (tens of thousands of distinct words)
  // even though the index processes millions of tokens. Caching turns the
  // stemming/suffix work into one pass per distinct word.
  WORD_CACHE.set(word, normalized);
  return normalized;
}

/**
 * A compact English suffix normalizer. It is not a full Porter stemmer, but it
 * maps the inflections catalog questions actually use onto one form:
 * databases/database, optimizing/optimize, servers/server, skills/skill.
 */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  let w = word;

  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) w = w.slice(0, -1);

  if (w.endsWith("ingly") && w.length > 6) w = w.slice(0, -5);
  else if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("edly") && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);

  if (w.endsWith("ization")) w = `${w.slice(0, -7)}iz`;
  else if (w.endsWith("ations")) w = w.slice(0, -4);
  else if (w.endsWith("ation")) w = w.slice(0, -5);
  else if (w.endsWith("izing")) w = w.slice(0, -3);
  else if (w.endsWith("izes")) w = w.slice(0, -2);
  else if (w.endsWith("ize")) w = w.slice(0, -1);

  return w;
}

/** Raw tokens for the legacy fuzzy fallback. */
export function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.replace(/^[@#:]+/, "").replace(/[?!.;:'"`()[\]]+$/g, "").trim())
    .filter((t) => t.length > 1 && !STOP_TOKENS.has(t))
    .slice(0, 8);
}

/** Catalog synonyms. One group per concept; a query matches any member. */
const SYNONYM_GROUPS: string[][] = [
  ["postgres", "postgresql", "psql", "pg"],
  ["browser", "playwright", "puppeteer", "selenium", "browse"],
  ["pdf", "document", "ocr"],
  // Keep groups disjoint: a term that appears in two groups unions both, so
  // "postgres" would start matching every SQL tool. Postgres has its own
  // group above; "database" stays the generic one.
  ["database", "sql"],
  ["k8s", "kubernetes"],
  ["js", "javascript"],
  ["ts", "typescript"],
  ["image", "vision"],
  ["scrape", "crawl", "crawler", "scraping"],
  ["auth", "authentication", "oauth", "login"],
];

const SYNONYM_LOOKUP = (() => {
  const map = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) {
    const normalized = [...new Set(group.map(normalizeToken))];
    for (const term of normalized) {
      const current = map.get(term) ?? [];
      map.set(term, [...new Set([...current, ...normalized])]);
    }
  }
  return map;
})();

export function synonymsFor(token: string): string[] {
  return SYNONYM_LOOKUP.get(token) ?? [token];
}

/**
 * Build query term groups from a question. Every group must match at least one
 * term for a row to qualify, which keeps multi-word searches precise while
 * letting "psql" find Postgres rows.
 */
export function queryGroups(q: string): string[][] {
  const tokens = tokenize(q).map(normalizeToken).filter(Boolean);
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const token of tokens) {
    const group = synonymsFor(token);
    const key = group.join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push(group);
  }
  return groups;
}

/** One space-separated, normalized field string, padded for token counting. */
export function tokenField(text: string, maxTokens = 400): string {
  if (!text) return " ";
  // Do not split a 5 KB summary to keep 100 tokens: clipping first avoids
  // processing the tail at all. Eight characters per token is generous for
  // English prose and leaves room for punctuation.
  const clipped = text.length > maxTokens * 8 ? text.slice(0, maxTokens * 8) : text;
  const tokens: string[] = [];
  const parts = clipped.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  for (const part of parts) {
    if (!part || part.length < 2) continue;
    const token = normalizeCleanWord(part);
    if (!token || STOP_TOKENS.has(token)) continue;
    tokens.push(token);
    if (tokens.length >= maxTokens) break;
  }
  return ` ${tokens.join(" ")} `;
}

export function tokenCount(padded: string): number {
  const trimmed = padded.trim();
  return trimmed ? trimmed.split(" ").length : 0;
}

export function countToken(padded: string, token: string): number {
  if (!token) return 0;
  const needle = ` ${token} `;
  let count = 0;
  let index = 0;
  while ((index = padded.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length - 1;
  }
  return count;
}
