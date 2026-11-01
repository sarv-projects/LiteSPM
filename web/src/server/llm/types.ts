/**
 * Shared types for the LiteSPM LLM gateway.
 *
 * The gateway turns a list of configured credentials (from env) into an
 * ordered pool and routes every chat completion through it, rotating keys
 * and failing over across providers on rate limits / errors.
 */

/** Wire style used to talk to a credential's endpoint. */
export type LlmStyle = "openai" | "gemini" | "zai";

/** A single usable credential (one provider + one key). */
export interface LlmCredential {
  /** Stable provider name, e.g. "nvidia", "groq", "gemini", "openrouter", "zai", or a custom name. */
  provider: string;
  /** 1-based index of the key inside its provider (null for keyless providers like zai). */
  keyIndex: number | null;
  style: LlmStyle;
  /** Base URL for openai/gemini styles (zai ignores it). */
  baseUrl: string;
  /** API key material (undefined for keyless providers). */
  apiKey?: string;
  /** Model id to request. */
  model: string;
  /** Where this credential sits in the default order (lower runs first). */
  priority: number;
}

/** Normalized chat request handed to the gateway by API routes. */
export interface LlmChatRequest {
  /** System prompt (rendered per wire style by the adapter). */
  system: string;
  /** Conversation turns, oldest first. */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

/** One attempt against one credential. */
export interface LlmAttempt {
  provider: string;
  keyIndex: number | null;
  /** "ok", "rate_limited", "auth", "server", "bad_request", "network", "empty" */
  outcome: string;
  status?: number;
  ms: number;
}

/** Successful gateway result. */
export interface LlmChatSuccess {
  ok: true;
  text: string;
  provider: string;
  keyIndex: number | null;
  model: string;
  attempts: LlmAttempt[];
  tookMs: number;
}

/** Failed gateway result — every credential failed. */
export interface LlmChatFailure {
  ok: false;
  error: string;
  attempts: LlmAttempt[];
  /** Milliseconds until the healthiest credential leaves cooldown (0 if retryable now). */
  retryInMs: number;
}

export type LlmChatResult = LlmChatSuccess | LlmChatFailure;

/** Public (key-free) status of one credential for the status endpoint. */
export interface LlmCredentialStatus {
  provider: string;
  keyIndex: number | null;
  style: LlmStyle;
  model: string;
  /** true when the credential is not in cooldown right now. */
  healthy: boolean;
  cooldownRemainingMs: number;
  consecutiveFailures: number;
  lastError?: string;
  lastUsedAt?: number;
}
