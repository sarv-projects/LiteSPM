/**
 * Documentation RAG for Ask AI.
 *
 * The build step chunks the canonical project docs into a static, versioned
 * corpus. Retrieval combines lexical BM25-like scoring with dense feature
 * vectors (and can blend model embeddings when the build-time corpus contains
 * them). A deterministic cross-signal reranker is always available.
 */
import corpus from "./generated/assistant-knowledge.json";
import { embedTexts } from "./assistant-embeddings";

export interface KnowledgeChunk {
  id: string;
  title: string;
  source: string;
  section: string;
  startLine: number;
  endLine: number;
  text: string;
  tokens: string[];
  vector: number[];
  embedding?: number[];
}

export interface KnowledgeHit extends KnowledgeChunk {
  score: number;
  lexicalScore: number;
  vectorScore: number;
  /** True only when this query and chunk were compared in the configured embedding space. */
  embeddingUsed: boolean;
}

const chunks = corpus as KnowledgeChunk[];
const STOP = new Set(["the","a","an","and","or","to","of","in","on","for","with","is","are","be","by","as","at","from","it","this","that","what","which","how","why","when","where","can","could","would","should","do","does","i","we","you","your","our","their","about","into","than","then","also","not","but","if","all","any","use","using"]);

function terms(value: string): string[] {
  return value.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}][\p{L}\p{N}_-]{1,}/gu) ?? [];
}

function queryTokens(query: string): string[] {
  return terms(query).filter((term) => !STOP.has(term));
}

function hashedVector(tokens: string[], dimensions = 384): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
    const index = (hash >>> 0) % dimensions;
    vector[index] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}

const DOCUMENT_COUNT = chunks.length;
const AVERAGE_DOCUMENT_LENGTH = chunks.reduce((sum, chunk) => sum + chunk.tokens.length, 0) / Math.max(1, DOCUMENT_COUNT);
const DOCUMENT_FREQUENCY = (() => {
  const frequency = new Map<string, number>();
  for (const chunk of chunks) {
    for (const token of new Set(chunk.tokens)) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }
  return frequency;
})();

/** BM25 lexical relevance with inverse document frequency and heading boosts. */
function lexicalScore(query: string[], chunk: KnowledgeChunk): number {
  if (query.length === 0) return 0;
  const frequencies = new Map<string, number>();
  for (const token of chunk.tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  const unique = new Set(query);
  const k1 = 1.2;
  const b = 0.75;
  let bm25 = 0;
  for (const token of unique) {
    const tf = frequencies.get(token) ?? 0;
    if (!tf) continue;
    const df = DOCUMENT_FREQUENCY.get(token) ?? 0;
    const idf = Math.log(1 + (DOCUMENT_COUNT - df + 0.5) / (df + 0.5));
    const lengthNorm = 1 - b + b * chunk.tokens.length / Math.max(1, AVERAGE_DOCUMENT_LENGTH);
    bm25 += idf * (tf * (k1 + 1)) / (tf + k1 * lengthNorm);
  }
  const titleTokens = new Set(terms(chunk.title + " " + chunk.section));
  const headingOverlap = [...unique].filter((token) => titleTokens.has(token)).length;
  const headingBoost = headingOverlap / Math.max(1, unique.size) * 0.12;
  const phrase = query.join(" ");
  const phraseBoost = phrase.length > 7 && chunk.text.toLowerCase().includes(phrase) ? 0.08 : 0;
  // Normalize BM25 to a bounded score so lexical and vector signals remain comparable.
  return Math.min(1, bm25 / (bm25 + 4)) + headingBoost + phraseBoost;
}

function rerank(query: string[], hit: KnowledgeHit): number {
  const title = new Set(terms(hit.title + " " + hit.section));
  const overlap = query.filter((token) => title.has(token)).length;
  const exactHeading = overlap / Math.max(1, query.length);
  const sourceBoost = /^(README|SECURITY|STATUS|ARCH\/)/i.test(hit.source) ? 0.04 : 0;
  return hit.score + exactHeading * 0.12 + sourceBoost;
}

export async function retrieveKnowledge(query: string, limit = 6): Promise<KnowledgeHit[]> {
  const tokens = queryTokens(query);
  if (tokens.length === 0 || chunks.length === 0) return [];
  const queryVector = hashedVector(tokens);
  const hasModelEmbeddings = chunks.some((chunk) => !!chunk.embedding?.length);
  const embedded = hasModelEmbeddings ? await embedTexts([query]) : null;
  const semanticQuery = embedded?.[0] ?? queryVector;
  const scored = chunks.map((chunk) => {
    const lexical = lexicalScore(tokens, chunk);
    const dense = cosine(queryVector, chunk.vector);
    const semantic = chunk.embedding?.length && embedded?.[0] ? cosine(semanticQuery, chunk.embedding) : dense;
    // Lexical remains the stronger signal for exact CLI/API facts; vector
    // similarity helps surface related sections with different wording.
    const score = lexical * 0.72 + Math.max(0, semantic) * 0.28;
    return {
      ...chunk,
      score,
      lexicalScore: lexical,
      vectorScore: semantic,
      embeddingUsed: Boolean(embedded?.[0] && chunk.embedding?.length),
    };
  });
  return scored
    .filter((hit) => hit.lexicalScore > 0.02 || hit.vectorScore > 0.08)
    .map((hit) => ({ ...hit, score: rerank(tokens, hit) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(12, limit)));
}

export function knowledgeContext(hits: KnowledgeHit[]): string {
  if (hits.length === 0) return "(No relevant LiteSPM documentation was retrieved.)";
  return hits.map((hit, index) =>
    `[S${index + 1}] ${hit.title} — ${hit.section}\nSource: ${hit.source} (lines ${hit.startLine}-${hit.endLine})\n${hit.text}`
  ).join("\n\n---\n\n");
}

export function knowledgeCitations(hits: KnowledgeHit[]) {
  return hits.map((hit, index) => ({
    id: `S${index + 1}`,
    title: hit.title,
    source: hit.source,
    section: hit.section,
    startLine: hit.startLine,
    endLine: hit.endLine,
  }));
}

export function hasValidKnowledgeCitations(answer: string, hitCount: number): boolean {
  if (hitCount <= 0) return true;
  const valid = new Set(Array.from({ length: hitCount }, (_, index) => `S${index + 1}`));
  const cited = [...answer.matchAll(/\[(S\d+)\]/g)].map((match) => match[1]);
  return cited.length > 0 && cited.every((id) => valid.has(id));
}

export function knowledgeCorpusStats() {
  return { chunks: chunks.length, sources: new Set(chunks.map((chunk) => chunk.source)).size, embeddedChunks: chunks.filter((chunk) => !!chunk.embedding?.length).length, sourcePaths: [...new Set(chunks.map((chunk) => chunk.source))] };
}
