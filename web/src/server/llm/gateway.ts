/**
 * LiteSPM LLM gateway — one entry point, many providers.
 *
 * Credentials are discovered from environment variables at first use:
 *
 *   NVIDIA_API_KEY / NVIDIA_API_KEY_1 .. NVIDIA_API_KEY_12
 *   GROQ_API_KEY   / GROQ_API_KEY_1   .. GROQ_API_KEY_12
 *   GEMINI_API_KEY / GEMINI_API_KEY_1 .. GEMINI_API_KEY_12
 *   OPENROUTER_API_KEY / OPENROUTER_API_KEY_1 .. OPENROUTER_API_KEY_12
 *
 *   Generic OpenAI-compatible adapters (any provider, no code changes):
 *     LLM_GENERIC_JSON='[{"name":"together","baseUrl":"https://api.together.xyz/v1",
 *                        "apiKey":"...","model":"...","style":"openai","priority":10}]'
 *   or numbered envs:
 *     LLM_GENERIC_1_NAME, LLM_GENERIC_1_BASE_URL, LLM_GENERIC_1_API_KEY,
 *     LLM_GENERIC_1_MODEL, LLM_GENERIC_1_STYLE ("openai"|"gemini"), LLM_GENERIC_1_PRIORITY
 *
 *   Model overrides: NVIDIA_MODEL, GROQ_MODEL, GEMINI_MODEL, OPENROUTER_MODEL
 *   Order override:  LLM_PROVIDER_ORDER="groq,nvidia,openrouter" (unlisted = dropped)
 *   ZAI SDK:         LLM_ZAI_ENABLED=1 explicitly enables the Z.AI Web Dev SDK;
 *                    it requires a .z-ai-config file and is disabled by default
 *
 * Routing rules:
 *   1. Requests start at a rotating cursor → healthy keys share load (round-robin).
 *   2. A 429 / 5xx / timeout / auth failure puts THAT key in cooldown
 *      (exponential backoff, Retry-After respected) and the request immediately
 *      moves to the next key, then the next provider.
 *   3. If every credential is cooling down, the request fails fast with the
 *      earliest retry time instead of burning timeouts.
 */

import {
  geminiChat,
  geminiChatStream,
  LlmAdapterError,
  openAiCompatibleChat,
  openAiCompatibleChatWithTools,
  openAiCompatibleChatStream,
  zaiChat,
  type StreamAdapterOptions,
} from "./providers";
import type {
  LlmAttempt,
  LlmChatRequest,
  LlmChatResult,
  LlmCredential,
  LlmCredentialStatus,
  LlmStyle,
} from "./types";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const MAX_KEYS_PER_PROVIDER = 12;
const PER_ATTEMPT_TIMEOUT_MS = 20_000;
const BASE_COOLDOWN_MS = 15_000;
const SERVER_ERROR_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 2 * 60_000;
/** Streaming: ceiling on time-to-first-token. */
const STREAM_TTFT_TIMEOUT_MS = 15_000;
/** Streaming: ceiling on the gap between chunks once started. */
const STREAM_IDLE_TIMEOUT_MS = 20_000;
/** Re-read env credentials at most this often, so key changes apply without a restart. */
const POOL_TTL_MS = 30_000;

const FIXED_PROVIDERS: Array<{
  name: string;
  envPrefix: string;
  baseUrl: string;
  defaultModel: string;
  style: Exclude<LlmStyle, "zai">;
  priority: number;
}> = [
  {
    name: "nvidia",
    envPrefix: "NVIDIA_API_KEY",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "meta/llama-3.3-70b-instruct",
    style: "openai",
    priority: 10,
  },
  {
    name: "groq",
    envPrefix: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    style: "openai",
    priority: 20,
  },
  {
    name: "gemini",
    envPrefix: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.0-flash",
    style: "gemini",
    priority: 30,
  },
  {
    name: "openrouter",
    envPrefix: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    style: "openai",
    priority: 40,
  },
];

/* ------------------------------------------------------------------ */
/* Env parsing helpers                                                 */
/* ------------------------------------------------------------------ */

function collectKeys(envPrefix: string): string[] {
  const keys: string[] = [];
  const bare = process.env[envPrefix];
  if (bare?.trim()) keys.push(bare.trim());
  for (let i = 1; i <= MAX_KEYS_PER_PROVIDER; i += 1) {
    const numbered = process.env[`${envPrefix}_${i}`];
    if (numbered?.trim()) keys.push(numbered.trim());
  }

  // No built-in fallback keys. A credential committed to this repository is a
  // credential anyone can spend, and a scanner-safe encoding is still a live
  // secret — the CI scan cannot tell the two apart. Deployment must provide
  // GROQ_API_KEY*; without it the groq provider is simply absent from the pool
  // and the gateway reports "No LLM credentials configured.".
  //
  // (An earlier build carried three encoded demo keys here. They were removed
  // after an audit confirmed all three were live against the public API.)

  // de-duplicate while preserving order
  return [...new Set(keys)];
}

function modelOverride(providerName: string): string | undefined {
  const value = process.env[`${providerName.toUpperCase()}_MODEL`];
  return value?.trim() || undefined;
}

interface GenericProviderSpec {
  name: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  style: LlmStyle;
  priority: number;
}

function parseGenericJson(): GenericProviderSpec[] {
  const raw = process.env.LLM_GENERIC_JSON ?? process.env.LLM_GENERIC_PROVIDERS;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry, i) => {
      const name = typeof entry.name === "string" ? entry.name.trim() : `generic-${i + 1}`;
      const baseUrl = typeof entry.baseUrl === "string" ? entry.baseUrl.trim() : "";
      const model = typeof entry.model === "string" ? entry.model.trim() : "";
      if (!baseUrl || !model) return [];
      const style: LlmStyle =
        entry.style === "gemini" ? "gemini" : entry.style === "zai" ? "zai" : "openai";
      return [
        {
          name,
          baseUrl,
          model,
          apiKey: typeof entry.apiKey === "string" && entry.apiKey.trim() ? entry.apiKey.trim() : undefined,
          style,
          priority:
            typeof entry.priority === "number" && Number.isFinite(entry.priority)
              ? entry.priority
              : 50 + i,
        },
      ];
    });
  } catch {
    console.error("[llm-gateway] LLM_GENERIC_JSON is not valid JSON — ignoring it");
    return [];
  }
}

function parseGenericNumbered(): GenericProviderSpec[] {
  const specs: GenericProviderSpec[] = [];
  for (let i = 1; i <= 8; i += 1) {
    const baseUrl = process.env[`LLM_GENERIC_${i}_BASE_URL`]?.trim();
    const model = process.env[`LLM_GENERIC_${i}_MODEL`]?.trim();
    if (!baseUrl || !model) continue;
    const styleRaw = process.env[`LLM_GENERIC_${i}_STYLE`]?.trim();
    const priorityRaw = Number.parseInt(process.env[`LLM_GENERIC_${i}_PRIORITY`] ?? "", 10);
    specs.push({
      name: process.env[`LLM_GENERIC_${i}_NAME`]?.trim() || `generic-${i}`,
      baseUrl,
      model,
      apiKey: process.env[`LLM_GENERIC_${i}_API_KEY`]?.trim() || undefined,
      style: styleRaw === "gemini" ? "gemini" : styleRaw === "zai" ? "zai" : "openai",
      priority: Number.isFinite(priorityRaw) ? priorityRaw : 50 + i,
    });
  }
  return specs;
}

/* ------------------------------------------------------------------ */
/* Credential pool (built once per process, cached)                    */
/* ------------------------------------------------------------------ */

let cachedPool: LlmCredential[] | null = null;
let cachedPoolAt = 0;

function buildPool(): LlmCredential[] {
  const pool: LlmCredential[] = [];

  for (const fixed of FIXED_PROVIDERS) {
    const keys = collectKeys(fixed.envPrefix);
    if (fixed.name === "groq") {
      const modelsEnv = process.env.GROQ_MODELS?.trim();
      const models = modelsEnv
        ? modelsEnv.split(",").map((s) => s.trim()).filter(Boolean)
        : [modelOverride("groq") ?? "openai/gpt-oss-120b", "qwen/qwen3.8-27b"];

      for (const [mIdx, modelName] of models.entries()) {
        for (const [i, apiKey] of keys.entries()) {
          pool.push({
            provider: fixed.name,
            keyIndex: i + 1,
            style: fixed.style,
            baseUrl: fixed.baseUrl,
            apiKey,
            model: modelName,
            priority: fixed.priority + mIdx,
          });
        }
      }
    } else {
      for (const [i, apiKey] of keys.entries()) {
        pool.push({
          provider: fixed.name,
          keyIndex: i + 1,
          style: fixed.style,
          baseUrl: fixed.baseUrl,
          apiKey,
          model: modelOverride(fixed.name) ?? fixed.defaultModel,
          priority: fixed.priority,
        });
      }
    }
  }

  for (const generic of [...parseGenericJson(), ...parseGenericNumbered()]) {
    pool.push({
      provider: generic.name,
      keyIndex: generic.apiKey ? 1 : null,
      style: generic.style,
      baseUrl: generic.baseUrl,
      apiKey: generic.apiKey,
      model: generic.model,
      priority: generic.priority,
    });
  }

  // z-ai-web-dev-sdk is not a keyless hosted provider: ZAI.create() reads a
  // .z-ai-config file from the process directory, home directory, or /etc.
  // It was previously inserted unconditionally, making production health look
  // configured even when no usable provider credential existed. Keep it opt-in.
  const orderEnv = process.env.LLM_PROVIDER_ORDER?.trim();
  const zaiEnabled = process.env.LLM_ZAI_ENABLED === "1";
  if (zaiEnabled && (!orderEnv || orderEnv.split(",").map((s) => s.trim()).includes("zai"))) {
    pool.push({
      provider: "zai",
      keyIndex: null,
      style: "zai",
      baseUrl: "",
      model: "glm (managed)",
      priority: 10_000,
    });
  }

  if (!orderEnv) return pool.sort((a, b) => a.priority - b.priority);

  // Explicit order: only listed providers are eligible. A typo or an
  // unavailable provider must produce an empty pool, never a silent fallback
  // to an adapter that may not be configured on this deployment.
  const order = orderEnv.split(",").map((s) => s.trim()).filter(Boolean);
  const ordered: LlmCredential[] = [];
  for (const name of order) {
    ordered.push(...pool.filter((c) => c.provider === name));
  }
  return ordered;
}

function getPool(): LlmCredential[] {
  // The pool is rebuilt on a short TTL so adding/removing keys in .env takes
  // effect within half a minute instead of requiring a process restart.
  if (!cachedPool || Date.now() - cachedPoolAt > POOL_TTL_MS) {
    cachedPool = buildPool();
    cachedPoolAt = Date.now();
  }
  return cachedPool;
}

/** Test hook + hot-reload helper: forget the cached pool. */
export function resetLlmPool(): void {
  cachedPool = null;
  cachedPoolAt = 0;
}

/* ------------------------------------------------------------------ */
/* Health / cooldown state (per process)                               */
/* ------------------------------------------------------------------ */

interface CredentialHealth {
  cooldownUntil: number;
  consecutiveFailures: number;
  lastError?: string;
  lastUsedAt?: number;
}

const globalForLlm = globalThis as unknown as {
  __litespmLlmHealth?: Map<string, CredentialHealth>;
  __litespmLlmCursor?: number;
};

function healthMap(): Map<string, CredentialHealth> {
  return (globalForLlm.__litespmLlmHealth ??= new Map());
}

function healthKey(c: LlmCredential): string {
  // Per model: Groq (and others) rate-limit per key AND per model, so a 429 on one
  // model must not sideline the same key's other models, and a rejected model
  // name must not cool the key for the working model.
  return `${c.provider}#${c.keyIndex ?? 0}#${c.model}`;
}

function cooldownFor(outcome: LlmAdapterError["outcome"], retryAfterMs?: number): number {
  if (retryAfterMs) return retryAfterMs;
  switch (outcome) {
    case "rate_limited":
      return BASE_COOLDOWN_MS;
    case "auth":
      return MAX_COOLDOWN_MS;
    case "bad_request":
      // One oversized or malformed prompt says nothing about the key; sidelining
      // it for ten minutes would turn a single bad request into an outage.
      return BASE_COOLDOWN_MS;
    case "server":
    case "network":
    case "empty":
      return SERVER_ERROR_COOLDOWN_MS;
    default:
      return BASE_COOLDOWN_MS;
  }
}

/**
 * Milliseconds until the first credential is usable again. Credentials that
 * failed DURING this request (a fresh 429 on every key) are cooling too, but
 * were never "skipped", so reading only the skipped ones reported 0 and the
 * visitor saw "could not reach any provider" instead of "retry in 30 s".
 */
function retryAfterMs(pool: LlmCredential[], skippedEarliest: number): number {
  let earliest = skippedEarliest;
  for (const credential of pool) {
    const until = healthMap().get(healthKey(credential))?.cooldownUntil ?? 0;
    if (until > Date.now()) earliest = Math.min(earliest, until);
  }
  return Number.isFinite(earliest) ? Math.max(earliest - Date.now(), 0) : 0;
}

function markFailure(c: LlmCredential, outcome: LlmAdapterError["outcome"], detail: string, retryAfterMs?: number): void {
  const map = healthMap();
  const key = healthKey(c);
  const current = map.get(key) ?? { cooldownUntil: 0, consecutiveFailures: 0 };
  current.consecutiveFailures += 1;
  const backoff = Math.min(
    cooldownFor(outcome, retryAfterMs) * Math.pow(2, current.consecutiveFailures - 1),
    MAX_COOLDOWN_MS,
  );
  current.cooldownUntil = Date.now() + backoff;
  current.lastError = `${outcome}: ${detail.slice(0, 120)}`;
  current.lastUsedAt = Date.now();
  map.set(key, current);
  console.warn(`[llm-gateway] ${key} failed (${outcome}) — cooldown ${Math.round(backoff / 1000)}s`);
}

function markSuccess(c: LlmCredential): void {
  const map = healthMap();
  const current = map.get(healthKey(c));
  if (current) {
    current.cooldownUntil = 0;
    current.consecutiveFailures = 0;
    current.lastError = undefined;
    current.lastUsedAt = Date.now();
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

async function callCredential(c: LlmCredential, request: LlmChatRequest): Promise<string> {
  switch (c.style) {
    case "gemini":
      return geminiChat(c, request, PER_ATTEMPT_TIMEOUT_MS);
    case "openai":
      return openAiCompatibleChat(c, request, PER_ATTEMPT_TIMEOUT_MS);
    case "zai":
      return zaiChat(request, PER_ATTEMPT_TIMEOUT_MS);
  }
}

/**
 * Route one chat completion through the credential pool:
 * round-robin start → skip cooling keys → failover on any failure.
 */
export async function chatComplete(request: LlmChatRequest): Promise<LlmChatResult> {
  const pool = getPool();
  if (pool.length === 0) {
    return {
      ok: false,
      error: "No LLM credentials configured.",
      attempts: [],
      retryInMs: 0,
    };
  }

  const started = Date.now();
  const attempts: LlmAttempt[] = [];

  // Round-robin cursor so consecutive healthy requests spread across keys.
  const cursor = (globalForLlm.__litespmLlmCursor = (globalForLlm.__litespmLlmCursor ?? 0) + 1);
  const start = cursor % pool.length;

  let earliestCooldown = Number.POSITIVE_INFINITY;

  for (let i = 0; i < pool.length; i += 1) {
    const credential = pool[(start + i) % pool.length];
    const health = healthMap().get(healthKey(credential));
    const cooling = (health?.cooldownUntil ?? 0) > Date.now();

    if (cooling) {
      earliestCooldown = Math.min(earliestCooldown, health?.cooldownUntil ?? 0);
      continue;
    }

    const attemptStart = Date.now();
    try {
      const text = await callCredential(credential, request);
      markSuccess(credential);
      attempts.push({
        provider: credential.provider,
        keyIndex: credential.keyIndex,
        outcome: "ok",
        ms: Date.now() - attemptStart,
      });
      return {
        ok: true,
        text,
        provider: credential.provider,
        keyIndex: credential.keyIndex,
        model: credential.model,
        attempts,
        tookMs: Date.now() - started,
      };
    } catch (error) {
      const adapterError =
        error instanceof LlmAdapterError
          ? error
          : new LlmAdapterError("network", error instanceof Error ? error.message : "unknown error");
      markFailure(credential, adapterError.outcome, adapterError.message, adapterError.retryAfterMs);
      attempts.push({
        provider: credential.provider,
        keyIndex: credential.keyIndex,
        outcome: adapterError.outcome,
        status: adapterError.status,
        ms: Date.now() - attemptStart,
      });
    }
  }

  const retryInMs = retryAfterMs(pool, earliestCooldown);
  const tried = attempts.length > 0;
  return {
    ok: false,
    error: tried
      ? `All ${pool.length} LLM credential(s) failed — see attempts.`
      : `All ${pool.length} LLM credential(s) are cooling down after recent failures.`,
    attempts,
    retryInMs,
  };
}

/**
 * Streaming twin of chatComplete: same pool walk, same cooldowns, but the
 * answer is handed to `onDelta` as it arrives.
 *
 * Failover policy: any failure BEFORE the first token moves to the next
 * credential exactly like chatComplete. A failure AFTER the first token
 * cannot be retried without repeating text the visitor already saw, so it
 * fails with `partialText` and the caller decides how to surface that.
 */
export async function chatCompleteStream(
  request: LlmChatRequest,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<LlmChatResult> {
  const pool = getPool();
  if (pool.length === 0) {
    return {
      ok: false,
      error: "No LLM credentials configured.",
      attempts: [],
      retryInMs: 0,
    };
  }

  const started = Date.now();
  const attempts: LlmAttempt[] = [];
  const cursor = (globalForLlm.__litespmLlmCursor = (globalForLlm.__litespmLlmCursor ?? 0) + 1);
  const start = cursor % pool.length;

  let earliestCooldown = Number.POSITIVE_INFINITY;
  // How much of the answer already reached the caller — a failure after this
  // is non-zero cannot be retried without repeating visible text.
  let deliveredChars = 0;
  const streamDelta = (chunk: string) => {
    deliveredChars += chunk.length;
    onDelta(chunk);
  };

  for (let i = 0; i < pool.length; i += 1) {
    const credential = pool[(start + i) % pool.length];
    const health = healthMap().get(healthKey(credential));
    const cooling = (health?.cooldownUntil ?? 0) > Date.now();

    if (cooling) {
      earliestCooldown = Math.min(earliestCooldown, health?.cooldownUntil ?? 0);
      continue;
    }

    const attemptStart = Date.now();
    try {
      const text = await streamFromCredential(credential, request, streamDelta, signal);
      markSuccess(credential);
      attempts.push({
        provider: credential.provider,
        keyIndex: credential.keyIndex,
        outcome: "ok",
        ms: Date.now() - attemptStart,
      });
      return {
        ok: true,
        text,
        provider: credential.provider,
        keyIndex: credential.keyIndex,
        model: credential.model,
        attempts,
        tookMs: Date.now() - started,
      };
    } catch (error) {
      const adapterError =
        error instanceof LlmAdapterError
          ? error
          : new LlmAdapterError("network", error instanceof Error ? error.message : "unknown error");

      // The visitor closed the panel or pressed stop — that is not the
      // provider's fault, so no cooldown and no failover: the answer has
      // nowhere to go.
      if (adapterError.outcome === "aborted") {
        attempts.push({
          provider: credential.provider,
          keyIndex: credential.keyIndex,
          outcome: "aborted",
          ms: Date.now() - attemptStart,
        });
        return {
          ok: false,
          error: "aborted by client",
          attempts,
          retryInMs: 0,
        };
      }

      markFailure(credential, adapterError.outcome, adapterError.message, adapterError.retryAfterMs);
      attempts.push({
        provider: credential.provider,
        keyIndex: credential.keyIndex,
        outcome: adapterError.outcome,
        status: adapterError.status,
        ms: Date.now() - attemptStart,
      });

      if (deliveredChars > 0) {
        // Tokens are already on the visitor's screen — stop failing over and
        // report the break so the caller can mark the answer as cut short.
        return {
          ok: false,
          error: `${credential.provider} dropped the stream mid-answer — what arrived is shown, but it may be cut short.`,
          attempts,
          retryInMs: 0,
        };
      }
    }
  }

  const retryInMs = retryAfterMs(pool, earliestCooldown);
  const tried = attempts.length > 0;
  return {
    ok: false,
    error: tried
      ? `All ${pool.length} LLM credential(s) failed — see attempts.`
      : `All ${pool.length} LLM credential(s) are cooling down after recent failures.`,
    attempts,
    retryInMs,
  };
}

async function streamFromCredential(
  c: LlmCredential,
  request: LlmChatRequest,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const options: StreamAdapterOptions = {
    ttftTimeoutMs: STREAM_TTFT_TIMEOUT_MS,
    idleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    onDelta,
    signal,
  };
  switch (c.style) {
    case "gemini":
      return geminiChatStream(c, request, options);
    case "openai":
      return openAiCompatibleChatStream(c, request, options);
    case "zai": {
      // The SDK has no streaming surface — generate whole, then deliver it as
      // one delta so the wire protocol stays uniform for the client. The
      // signal lets a client abort stop us from waiting out the generation.
      const text = await zaiChat(request, PER_ATTEMPT_TIMEOUT_MS, signal);
      onDelta(text);
      return text;
    }
  }
}

/** Key-free snapshot of the pool for the status endpoint. */
export function getLlmStatus(): {
  order: string[];
  credentials: LlmCredentialStatus[];
} {
  const now = Date.now();
  const pool = getPool();
  return {
    order: [...new Set(pool.map((c) => c.provider))],
    credentials: pool.map((c) => {
      const health = healthMap().get(healthKey(c));
      const cooldownRemainingMs = Math.max((health?.cooldownUntil ?? 0) - now, 0);
      return {
        provider: c.provider,
        keyIndex: c.keyIndex,
        style: c.style,
        model: c.model,
        healthy: cooldownRemainingMs === 0,
        cooldownRemainingMs,
        consecutiveFailures: health?.consecutiveFailures ?? 0,
        ...(health?.lastError ? { lastError: health.lastError } : {}),
        ...(health?.lastUsedAt ? { lastUsedAt: health.lastUsedAt } : {}),
      };
    }),
  };
}


/**
 * Non-streaming tool-selection pass for the allowlisted assistant registry.
 * Only OpenAI-compatible providers receive function schemas. The caller must
 * validate every returned name and argument before executing anything.
 */
export async function chatCompleteWithTools(request: LlmChatRequest): Promise<LlmChatResult> {
  const pool = getPool().filter((credential) => credential.style === "openai");
  if (pool.length === 0) {
    return { ok: false, error: "No OpenAI-compatible tool-calling provider configured.", attempts: [], retryInMs: 0 };
  }

  const started = Date.now();
  const attempts: LlmAttempt[] = [];
  const cursor = (globalForLlm.__litespmLlmCursor = (globalForLlm.__litespmLlmCursor ?? 0) + 1);
  const start = cursor % pool.length;
  let earliestCooldown = Number.POSITIVE_INFINITY;

  for (let i = 0; i < pool.length; i += 1) {
    const credential = pool[(start + i) % pool.length];
    const health = healthMap().get(healthKey(credential));
    if ((health?.cooldownUntil ?? 0) > Date.now()) {
      earliestCooldown = Math.min(earliestCooldown, health?.cooldownUntil ?? 0);
      continue;
    }
    const attemptStart = Date.now();
    try {
      const completion = await openAiCompatibleChatWithTools(credential, request, PER_ATTEMPT_TIMEOUT_MS);
      markSuccess(credential);
      attempts.push({
        provider: credential.provider,
        keyIndex: credential.keyIndex,
        outcome: "ok",
        ms: Date.now() - attemptStart,
      });
      return {
        ok: true,
        text: completion.text,
        toolCalls: completion.toolCalls,
        provider: credential.provider,
        keyIndex: credential.keyIndex,
        model: credential.model,
        attempts,
        tookMs: Date.now() - started,
      };
    } catch (error) {
      const adapterError = error instanceof LlmAdapterError
        ? error
        : new LlmAdapterError("network", error instanceof Error ? error.message : "unknown error");
      markFailure(credential, adapterError.outcome, adapterError.message, adapterError.retryAfterMs);
      attempts.push({
        provider: credential.provider,
        keyIndex: credential.keyIndex,
        outcome: adapterError.outcome,
        status: adapterError.status,
        ms: Date.now() - attemptStart,
      });
    }
  }

  return {
    ok: false,
    error: attempts.length
      ? `All ${pool.length} tool-capable LLM credential(s) failed.`
      : `All ${pool.length} tool-capable LLM credential(s) are cooling down.`,
    attempts,
    retryInMs: retryAfterMs(pool, earliestCooldown),
  };
}
