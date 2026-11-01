import { NextRequest, NextResponse } from "next/server";

import { chatComplete, chatCompleteStream } from "@/server/llm/gateway";
import { searchCatalog } from "@/server/litespm/search";
import { getDataset } from "@/server/litespm/dataset";
import { capSummary } from "@/server/litespm/cap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Simple in-memory rate limit: 20 requests per IP per 5 minutes. */
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const globalForRate = globalThis as unknown as {
  __litespmAssistantRate?: Map<string, number[]>;
};

function rateLimited(ip: string): boolean {
  const map = (globalForRate.__litespmAssistantRate ??= new Map());
  const now = Date.now();
  const hits = (map.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    map.set(ip, hits);
    return true;
  }
  hits.push(now);
  map.set(ip, hits);
  return false;
}

/**
 * Retrieval: search the live catalog with the user's question and return a
 * compact result block the model can cite. Runs two passes — the whole
 * question (stop words stripped by the tokenizer), then the single strongest
 * keyword when the full question is too narrow — and merges the results.
 */
async function retrieve(question: string) {
  const [direct, stats] = await Promise.all([
    searchCatalog({ q: question, pageSize: 12, sort: "relevance" }),
    getDataset().then((d) => d.telemetry),
  ]);

  let keywordPass: Awaited<ReturnType<typeof searchCatalog>> | null = null;
  if (direct.total < 3) {
    // The strongest keyword is the longest token the search engine kept.
    const tokens = question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4)
      .sort((a, b) => b.length - a.length);
    if (tokens.length > 0) {
      keywordPass = await searchCatalog({ q: tokens[0], pageSize: 12, sort: "relevance" });
    }
  }

  const seen = new Set<string>();
  const hits = [...direct.items, ...(keywordPass?.items ?? [])]
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, 14);

  return { hits, stats };
}

function resultBlock(
  hits: Awaited<ReturnType<typeof retrieve>>["hits"],
): string {
  if (hits.length === 0) return "(no catalog results matched this question)";
  return hits
    .map(
      (hit) =>
        `- ${hit.name} [${hit.kind}] — ${capSummary(hit.summary) || "(no summary)"} | publisher: ${hit.publisher.name}${hit.publisher.verified ? " (verified)" : ""} | ${hit.installable ? "installable via `litespm install " + hit.id + "`" : "discovery-only"} | link: #/package/${encodeURIComponent(hit.linkKey)}`,
    )
    .join("\n");
}

/**
 * Short-lived answer cache for first-turn questions. The suggested chips and
 * common one-liners hit this and answer instantly; follow-ups (which depend on
 * conversation context) are never cached.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 64;
interface CachedAnswer {
  answer: string;
  citations: Array<{
    linkKey: string;
    name: string;
    kind: string;
    publisher: string;
    installable: boolean;
  }>;
  meta: {
    provider: string;
    keyIndex: number | null;
    model: string;
    tookMs: number;
    attempts: Array<{ provider: string; keyIndex: number | null; outcome: string; status?: number; ms: number }>;
  };
  cachedAt: number;
}
const globalForCache = globalThis as unknown as {
  __litespmAssistantCache?: Map<string, CachedAnswer>;
};

function answerCache(): Map<string, CachedAnswer> {
  return (globalForCache.__litespmAssistantCache ??= new Map());
}

function cacheGet(key: string): CachedAnswer | null {
  const cache = answerCache();
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit;
}

function cacheSet(key: string, value: CachedAnswer): void {
  const cache = answerCache();
  cache.delete(key); // refresh insertion order for LRU-ish eviction
  cache.set(key, value);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function cacheKeyFor(question: string): string | null {
  const normalized = question.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length === 0 || normalized.length > 200) return null;
  return normalized;
}

const SYSTEM_PROMPT = `You are the LiteSPM catalog assistant, embedded in the LiteSPM marketplace website.

LiteSPM is an open-source package manager for AI coding agents (npm package "litespm"). It installs MCP servers, agent skills (SKILL.md folders) and plugins into 50 supported agent hosts (Claude Code, OpenAI Codex, OpenCode, Cursor, Cline, Gemini CLI, GitHub Copilot and more), writing each agent's own config with backup, preview and an undo ledger. Commands: litespm (wizard), litespm search <text>, litespm install <id>, litespm list, litespm skills add <source>, litespm restore <id>, litespm host list / detect / setup, litespm doctor, litespm catalog sync.

Your job: help the visitor find the right catalog listing or understand how LiteSPM works.

RULES:
1. Ground every package recommendation in the RETRIEVED RESULTS block of the current turn. Never invent a package name, publisher or id. If the results hold nothing relevant, say so and suggest what to search for.
2. When you mention a retrieved package, link it in exactly this format: [Name](#/package/<linkKey from results>) — use the link path from the results verbatim.
3. Prefer installable listings when the user wants to actually install something. LiteSPM supports all 50 agent hosts (46 direct remote + 4 via stdio-relay bridge) and 81 skill targets. If a recommended plugin has an unpinned source or partial components, explicitly tell the user they can install its portable components with: "litespm install <id> --allow-partial".
4. Be concise, transparent, and concrete. Short paragraphs or tight bullet lists. No more than ~150 words unless the user asks for depth.
5. For install instructions, use: "litespm install <id>", with host "litespm install <id> --agent <host>", or with partial bypass "litespm install <id> --allow-partial". Do not invent other flags.
6. If asked something unrelated to LiteSPM, agents or the catalog, steer gently back.
7. Answer in the language the user wrote in.`;

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "anonymous";
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many questions for now — try again in a few minutes." },
        { status: 429 },
      );
    }

    const body = (await request.json()) as { messages?: ChatMessage[]; stream?: boolean };
    const wantsStream = body.stream === true;

    // Trim hard: recent turns only, each capped. Smaller prompts = faster
    // time-to-first-token, and the retrieval block carries the substance.
    const history = (body.messages ?? [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

    const lastUser = [...history].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      return NextResponse.json({ error: "A user message is required" }, { status: 400 });
    }

    const { hits, stats } = await retrieve(lastUser.content);
    const citations = hits.slice(0, 8).map((hit) => ({
      linkKey: hit.linkKey,
      name: hit.name,
      kind: hit.kind,
      publisher: hit.publisher.name,
      installable: hit.installable,
    }));

    const groundedQuestion = `${lastUser.content.slice(0, 4000)}

--- RETRIEVED RESULTS (catalog: ${stats.counts.all.toLocaleString()} unique listings — ${stats.counts.mcp.toLocaleString()} MCP servers, ${stats.counts.skill.toLocaleString()} skills, ${stats.counts.plugin.toLocaleString()} plugins) ---
${resultBlock(hits)}
--- END OF RESULTS ---`;

    const chatRequest = {
      system: SYSTEM_PROMPT,
      messages: [
        ...history.slice(0, -1),
        { role: "user" as const, content: groundedQuestion },
      ],
      temperature: 0.3,
      maxTokens: 1200,
    };

    /* ---------------------------- streamed path ---------------------------- */
    if (wantsStream) {
      const firstTurn = history.length === 1;
      const cacheKey = firstTurn ? cacheKeyFor(lastUser.content) : null;
      const cached = cacheKey ? cacheGet(cacheKey) : null;

      const encoder = new TextEncoder();
      const upstreamAbort = new AbortController();
      const clientGone = () => upstreamAbort.abort();
      request.signal.addEventListener("abort", clientGone, { once: true });

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let closed = false;
          const send = (event: Record<string, unknown>) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            } catch {
              closed = true; // the client vanished mid-answer
            }
          };

          try {
            if (cached) {
              send({ type: "delta", text: cached.answer });
              send({
                type: "done",
                answer: cached.answer,
                citations: cached.citations,
                meta: { ...cached.meta, tookMs: 0, cached: true },
              });
              return;
            }

            const result = await chatCompleteStream(
              chatRequest,
              (chunk) => send({ type: "delta", text: chunk }),
              upstreamAbort.signal,
            );

            if (!result.ok) {
              // A client abort is the visitor pressing stop — not an incident.
              if (result.error !== "aborted by client") {
                console.error("litespm assistant streaming failed:", result.error, result.attempts);
              }
              send({
                type: "error",
                message:
                  result.error === "aborted by client"
                    ? "Stopped."
                    : result.retryInMs > 0
                      ? `Every LLM provider is rate-limited or cooling down right now — try again in about ${Math.max(1, Math.round(result.retryInMs / 1000))}s.`
                      : result.error.startsWith("All")
                        ? "The assistant could not reach any LLM provider. Try again shortly."
                        : result.error,
              });
              return;
            }

            if (!result.text) {
              send({ type: "error", message: "The assistant returned an empty answer. Try rephrasing." });
              return;
            }

            const meta = {
              provider: result.provider,
              keyIndex: result.keyIndex,
              model: result.model,
              tookMs: result.tookMs,
              attempts: result.attempts,
            };
            send({ type: "done", answer: result.text, citations, meta });

            if (cacheKey) {
              cacheSet(cacheKey, {
                answer: result.text,
                citations,
                meta: { ...meta, attempts: result.attempts },
                cachedAt: Date.now(),
              });
            }
          } catch (error) {
            if (!request.signal.aborted) {
              console.error("litespm assistant stream failed", error);
              send({ type: "error", message: "The assistant is unavailable right now." });
            }
          } finally {
            request.signal.removeEventListener("abort", clientGone);
            closed = true;
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        },
        cancel() {
          upstreamAbort.abort();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    /* --------------------------- buffered path ----------------------------- */
    const result = await chatComplete(chatRequest);

    if (!result.ok) {
      console.error("litespm assistant exhausted all LLM credentials", result.attempts);
      return NextResponse.json(
        {
          error:
            result.retryInMs > 0
              ? `Every LLM provider is rate-limited or cooling down right now — try again in about ${Math.max(1, Math.round(result.retryInMs / 1000))}s.`
              : "The assistant could not reach any LLM provider. Try again shortly.",
        },
        { status: 503 },
      );
    }

    const answer = result.text;
    if (!answer) {
      return NextResponse.json(
        { error: "The assistant returned an empty answer. Try rephrasing." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        answer,
        citations,
        meta: {
          provider: result.provider,
          keyIndex: result.keyIndex,
          model: result.model,
          tookMs: result.tookMs,
          attempts: result.attempts,
        },
      },
      { headers: { "X-LiteSPM-LLM": `${result.provider}${result.keyIndex ? `#${result.keyIndex}` : ""}` } },
    );
  } catch (error) {
    console.error("litespm assistant failed", error);
    return NextResponse.json(
      { error: "The assistant is unavailable right now." },
      { status: 500 },
    );
  }
}
