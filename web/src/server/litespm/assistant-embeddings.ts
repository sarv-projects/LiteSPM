/**
 * Optional OpenAI-compatible embedding provider.
 *
 * Configure EMBEDDING_API_KEY, EMBEDDING_BASE_URL and EMBEDDING_MODEL in both
 * the build and runtime environments to enable dense semantic retrieval.
 * Without it, the corpus still uses local dense feature vectors plus BM25.
 */
export async function embedTexts(inputs: string[]): Promise<number[][] | null> {
  const apiKey = process.env.EMBEDDING_API_KEY;
  if (!apiKey || inputs.length === 0) return null;
  const baseUrl = (process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: inputs.slice(0, 64) }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn("[assistant-rag] embedding provider returned", response.status);
      return null;
    }
    const payload = await response.json() as { data?: Array<{ index: number; embedding: number[] }> };
    if (!Array.isArray(payload.data) || payload.data.length !== Math.min(inputs.length, 64)) return null;
    const ordered = [...payload.data].sort((a, b) => a.index - b.index);
    if (ordered.some((item) => !Array.isArray(item.embedding) || item.embedding.length === 0 || item.embedding.some((n) => !Number.isFinite(n)))) return null;
    return ordered.map((item) => item.embedding);
  } catch (error) {
    console.warn("[assistant-rag] embedding request failed", error instanceof Error ? error.name : "unknown");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
