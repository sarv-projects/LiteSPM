/**
 * Wire-style adapters for the LLM gateway.
 *
 * Every adapter receives the same normalized request and returns either
 * plain text or an `LlmAdapterError`. Three styles are supported:
 *
 *  - "openai"  : OpenAI-compatible POST /chat/completions — covers NVIDIA NIM,
 *                Groq, OpenRouter, Together, DeepSeek, vLLM, Ollama, LM Studio…
 *  - "gemini"  : Google Generative Language generateContent
 *  - "zai"     : the z-ai-web-dev-sdk (keyless in this sandbox, used as fallback)
 */

import type { LlmChatRequest } from "./types";

/** Classified adapter failure; the gateway maps it to cooldown lengths. */
export class LlmAdapterError extends Error {
  outcome: "rate_limited" | "auth" | "server" | "bad_request" | "network" | "empty" | "aborted";
  status?: number;
  /** Server-suggested retry delay in ms (from Retry-After), if any. */
  retryAfterMs?: number;

  constructor(
    outcome: LlmAdapterError["outcome"],
    message: string,
    status?: number,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "LlmAdapterError";
    this.outcome = outcome;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const DEFAULT_TEMPERATURE = 0.3;

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Honour a caller-provided signal alongside the timeout (client aborted).
  const external = init.signal ?? null;
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }
  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    if (external) external.removeEventListener("abort", onExternalAbort);
  });
}

/** Read Retry-After (seconds or HTTP-date) into a clamped millisecond value. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(seconds * 1000, 5000), 600_000);
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(date - Date.now(), 5000), 600_000);
  }
  return undefined;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text) as { error?: { message?: string }; message?: string };
      return (
        json.error?.message ??
        (typeof json.error === "string" ? json.error : undefined) ??
        json.message ??
        text.slice(0, 180)
      );
    } catch {
      return text.slice(0, 180);
    }
  } catch {
    return `HTTP ${response.status}`;
  }
}

function toAdapterError(response: Response, body: string): LlmAdapterError {
  if (response.status === 429) {
    return new LlmAdapterError(
      "rate_limited",
      `rate limited: ${body}`,
      429,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }
  if (response.status === 401 || response.status === 403) {
    return new LlmAdapterError("auth", `auth rejected: ${body}`, response.status);
  }
  if (response.status === 402) {
    return new LlmAdapterError("auth", `out of credits: ${body}`, response.status);
  }
  if (response.status >= 500) {
    return new LlmAdapterError("server", `provider error: ${body}`, response.status);
  }
  return new LlmAdapterError("bad_request", `request rejected: ${body}`, response.status);
}

/** POST {baseUrl}/chat/completions — NVIDIA NIM, Groq, OpenRouter, and friends. */
export async function openAiCompatibleChat(
  credential: { baseUrl: string; apiKey?: string; model: string; provider: string },
  request: LlmChatRequest,
  timeoutMs: number,
): Promise<string> {
  const url = `${credential.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (credential.apiKey) headers.Authorization = `Bearer ${credential.apiKey}`;
  // OpenRouter wants these for attribution; every other provider ignores them.
  headers["HTTP-Referer"] = "https://litespm.local";
  headers["X-Title"] = "LiteSPM";

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: credential.model,
          messages: [
            { role: "system", content: request.system },
            ...request.messages,
          ],
          temperature: request.temperature ?? DEFAULT_TEMPERATURE,
          max_tokens: request.maxTokens ?? 1024,
          stream: false,
        }),
      },
      timeoutMs,
    );
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${timeoutMs}ms`
        : "connection failed";
    throw new LlmAdapterError("network", `${credential.provider} ${reason}`);
  }

  if (!response.ok) throw toAdapterError(response, await readErrorBody(response));

  try {
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new LlmAdapterError("empty", `${credential.provider} returned an empty completion`);
    return text;
  } catch (error) {
    if (error instanceof LlmAdapterError) throw error;
    throw new LlmAdapterError("bad_request", `${credential.provider} returned malformed JSON`);
  }
}

/** POST {baseUrl}/models/{model}:generateContent — Google Gemini. */
export async function geminiChat(
  credential: { baseUrl: string; apiKey?: string; model: string; provider: string },
  request: LlmChatRequest,
  timeoutMs: number,
): Promise<string> {
  if (!credential.apiKey) {
    throw new LlmAdapterError("auth", "gemini credential has no API key");
  }
  const url = `${credential.baseUrl.replace(/\/+$/, "")}/models/${credential.model}:generateContent`;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": credential.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature: request.temperature ?? DEFAULT_TEMPERATURE,
            maxOutputTokens: request.maxTokens ?? 1024,
          },
        }),
      },
      timeoutMs,
    );
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${timeoutMs}ms`
        : "connection failed";
    throw new LlmAdapterError("network", `gemini ${reason}`);
  }

  if (!response.ok) throw toAdapterError(response, await readErrorBody(response));

  try {
    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new LlmAdapterError("empty", "gemini returned an empty completion");
    return text;
  } catch (error) {
    if (error instanceof LlmAdapterError) throw error;
    throw new LlmAdapterError("bad_request", "gemini returned malformed JSON");
  }
}

/** z-ai-web-dev-sdk — keyless in this environment, kept as the final fallback. */
export async function zaiChat(
  request: LlmChatRequest,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  // The SDK has no AbortController surface of its own, so the completion is
  // raced against both the timeout and (when the caller passes one) a client
  // abort — we may not be able to stop the SDK's work, but we stop waiting.
  const loser = new Promise<never>((_, reject) => {
    const timer = setTimeout(
      () => reject(new LlmAdapterError("network", `zai timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new LlmAdapterError("aborted", "aborted by client"));
      },
      { once: true },
    );
  });
  try {
    const zai = await ZAI.create();
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: "assistant" as const, content: request.system },
          ...request.messages,
        ],
        thinking: { type: "disabled" as const },
      }),
      loser,
    ]);
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new LlmAdapterError("empty", "zai returned an empty completion");
    return text;
  } catch (error) {
    if (error instanceof LlmAdapterError) throw error;
    const message = error instanceof Error ? error.message : "unknown error";
    throw new LlmAdapterError("auth", `zai unavailable: ${message.slice(0, 120)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Streaming adapters                                                  */
/* ------------------------------------------------------------------ */

export interface StreamAdapterOptions {
  /** Ceiling on time-to-first-token (and the initial HTTP round trip). */
  ttftTimeoutMs: number;
  /** Ceiling on the gap between chunks once streaming has started. */
  idleTimeoutMs: number;
  /** Called with each incremental piece of the answer. */
  onDelta: (chunk: string) => void;
  /** External cancellation (client disconnected). */
  signal?: AbortSignal;
}

/**
 * Read an SSE body and hand every `data:` payload to `onData` until [DONE]
 * or stream end. Throws `LlmAdapterError("empty")` when nothing arrived.
 */
async function consumeSse(
  response: Response,
  provider: string,
  options: StreamAdapterOptions,
  extractText: (payload: unknown) => string | undefined,
): Promise<string> {
  const body = response.body;
  if (!body) throw new LlmAdapterError("bad_request", `${provider} returned no stream body`);

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  let buffer = "";
  let full = "";
  let sawFirstToken = false;

  const readChunk = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    const timeoutMs = sawFirstToken ? options.idleTimeoutMs : options.ttftTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new LlmAdapterError(
            "network",
            `${provider} stream ${sawFirstToken ? "went idle" : "never produced a token"} after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    });
    try {
      return await Promise.race([reader.read(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  try {
    for (;;) {
      const { done, value } = await readChunk();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let json: unknown;
        try {
          json = JSON.parse(payload);
        } catch {
          continue; // partial frame — the next chunk completes it
        }
        // If choices/delta is present (including reasoning frames), acknowledge stream activity
        if ((json as { choices?: Array<{ delta?: unknown }> })?.choices?.[0]?.delta) {
          sawFirstToken = true;
        }
        const text = extractText(json);
        if (text) {
          sawFirstToken = true;
          full += text;
          options.onDelta(text);
        }
      }
    }
    // Flush a trailing line without a newline terminator.
    const trailing = buffer.trim();
    if (trailing.startsWith("data:")) {
      const payload = trailing.slice(5).trim();
      if (payload && payload !== "[DONE]") {
        try {
          const text = extractText(JSON.parse(payload));
          if (text) {
            full += text;
            options.onDelta(text);
          }
        } catch {
          /* incomplete tail — ignore */
        }
      }
    }
  } catch (error) {
    if (options.signal?.aborted) throw new LlmAdapterError("aborted", "stream aborted by client");
    // A break after tokens is a truncated answer, not a failover candidate.
    if (error instanceof LlmAdapterError && full.length > 0) {
      throw new LlmAdapterError(error.outcome, `${error.message} (partial answer delivered)`);
    }
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }

  if (!full) {
    throw new LlmAdapterError("empty", `${provider} streamed an empty completion`);
  }
  return full;
}

function openAiHeaders(credential: { apiKey?: string }): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (credential.apiKey) headers.Authorization = `Bearer ${credential.apiKey}`;
  // OpenRouter wants these for attribution; every other provider ignores them.
  headers["HTTP-Referer"] = "https://litespm.local";
  headers["X-Title"] = "LiteSPM";
  return headers;
}

/** Streamed POST {baseUrl}/chat/completions (OpenAI-compatible SSE). */
export async function openAiCompatibleChatStream(
  credential: { baseUrl: string; apiKey?: string; model: string; provider: string },
  request: LlmChatRequest,
  options: StreamAdapterOptions,
): Promise<string> {
  const url = `${credential.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: openAiHeaders(credential),
        body: JSON.stringify({
          model: credential.model,
          messages: [
            { role: "system", content: request.system },
            ...request.messages,
          ],
          temperature: request.temperature ?? DEFAULT_TEMPERATURE,
          max_tokens: request.maxTokens ?? 1024,
          stream: true,
        }),
        signal: options.signal,
      },
      options.ttftTimeoutMs,
    );
  } catch (error) {
    if (options.signal?.aborted) throw new LlmAdapterError("aborted", "aborted by client");
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${options.ttftTimeoutMs}ms`
        : "connection failed";
    throw new LlmAdapterError("network", `${credential.provider} ${reason}`);
  }

  if (!response.ok) throw toAdapterError(response, await readErrorBody(response));

  return consumeSse(response, credential.provider, options, (payload) => {
    const json = payload as { choices?: Array<{ delta?: { content?: string } }> };
    return json.choices?.[0]?.delta?.content ?? undefined;
  });
}

/** Streamed POST {baseUrl}/models/{model}:streamGenerateContent?alt=sse. */
export async function geminiChatStream(
  credential: { baseUrl: string; apiKey?: string; model: string; provider: string },
  request: LlmChatRequest,
  options: StreamAdapterOptions,
): Promise<string> {
  if (!credential.apiKey) {
    throw new LlmAdapterError("auth", "gemini credential has no API key");
  }
  const url = `${credential.baseUrl.replace(/\/+$/, "")}/models/${credential.model}:streamGenerateContent?alt=sse`;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": credential.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature: request.temperature ?? DEFAULT_TEMPERATURE,
            maxOutputTokens: request.maxTokens ?? 1024,
          },
        }),
        signal: options.signal,
      },
      options.ttftTimeoutMs,
    );
  } catch (error) {
    if (options.signal?.aborted) throw new LlmAdapterError("aborted", "aborted by client");
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${options.ttftTimeoutMs}ms`
        : "connection failed";
    throw new LlmAdapterError("network", `gemini ${reason}`);
  }

  if (!response.ok) throw toAdapterError(response, await readErrorBody(response));

  return consumeSse(response, "gemini", options, (payload) => {
    const json = payload as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const parts = json.candidates?.[0]?.content?.parts;
    if (!parts?.length) return undefined;
    return parts.map((p) => p.text ?? "").join("") || undefined;
  });
}
