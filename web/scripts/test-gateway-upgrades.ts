import assert from "node:assert/strict";
import { chatComplete, getLlmStatus, resetLlmPool } from "../src/server/llm/gateway";

const ALL_KEYS = [
  "LLM_PROVIDER_ORDER", "GROQ_API_KEY", "GROQ_API_KEY_1", "GROQ_API_KEY_2", "GROQ_API_KEY_3",
  "GROQ_MODELS", "NVIDIA_API_KEY", "NVIDIA_API_KEY_1", "NVIDIA_MODELS", "NVIDIA_MODEL",
];
const saved = new Map(ALL_KEYS.map(k => [k, process.env[k]]));
const realFetch = globalThis.fetch;
const reset = () => {
  delete (globalThis as { __litespmLlmHealth?: unknown }).__litespmLlmHealth;
  delete (globalThis as { __litespmLlmCursor?: unknown }).__litespmLlmCursor;
  resetLlmPool();
};
const okResponse = () => new Response(JSON.stringify({ choices: [{ message: { content: "pong" } }] }), { status: 200 });

try {
  for (const k of ALL_KEYS) delete process.env[k];
  process.env.GROQ_API_KEY_1 = "k1";
  process.env.GROQ_API_KEY_2 = "k2";
  process.env.GROQ_API_KEY_3 = "k3";
  process.env.GROQ_MODELS = "m1";
  process.env.LLM_PROVIDER_ORDER = "groq";

  // 1) A 429 without Retry-After cools a key for 5 seconds, not 15.
  reset();
  globalThis.fetch = (async () => new Response("{}", { status: 429 })) as typeof fetch;
  const exhausted = await chatComplete({ system: "s", messages: [{ role: "user", content: "ping" }] });
  assert.equal(exhausted.ok, false);
  assert.ok(exhausted.retryInMs <= 6_000, `cooldown should reset in ~5s, got ${exhausted.retryInMs}ms`);

  // 2) Round-robin: consecutive successful requests start from different keys.
  reset();
  const order: string[] = [];
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    const auth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    order.push(auth);
    return okResponse();
  }) as typeof fetch;
  for (let i = 0; i < 4; i += 1) {
    await chatComplete({ system: "s", messages: [{ role: "user", content: "ping" }] });
  }
  assert.ok(new Set(order.slice(0, 3)).size === 3, `round-robin should use all 3 keys first: ${order}`);

  // 3) NVIDIA multi-model support (like GROQ_MODELS) so a new key can add rotation slots.
  reset();
  process.env.NVIDIA_API_KEY_1 = "nv-key";
  process.env.NVIDIA_MODELS = "nvidia/nemotron-3-super-120b-a12b,meta/llama-3.2-11b-vision-instruct";
  process.env.LLM_PROVIDER_ORDER = "nvidia";
  const nvStatus = getLlmStatus();
  const nvCreds = nvStatus.credentials.filter(c => c.provider === "nvidia");
  assert.equal(nvCreds.length, 2, "NVIDIA_MODELS should create one credential per model");
  assert.equal(new Set(nvCreds.map(c => c.model)).size, 2, "both NVIDIA models should be in rotation");

  // 4) Explicit order is fail-closed: a configured provider not named in the
  //    order stays out. Add "nvidia" to LLM_PROVIDER_ORDER to opt it in.
  reset();
  process.env.LLM_PROVIDER_ORDER = "groq";
  process.env.NVIDIA_API_KEY_1 = "nv-key";
  delete process.env.NVIDIA_MODELS;
  const mixed = getLlmStatus();
  assert.ok(mixed.credentials.every(c => c.provider === "groq"), "unlisted providers must stay out of an explicit order");

  // 5) Naming it opts it in, and it shares the same rotation pool.
  reset();
  process.env.LLM_PROVIDER_ORDER = "groq,nvidia";
  const optedIn = getLlmStatus();
  assert.ok(optedIn.credentials.some(c => c.provider === "nvidia"), "naming nvidia should add it to rotation");

  console.log("gateway-upgrades: 5 checks passed");
} finally {
  globalThis.fetch = realFetch;
  for (const k of ALL_KEYS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  reset();
}
