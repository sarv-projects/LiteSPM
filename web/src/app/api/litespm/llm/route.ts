import { NextResponse } from "next/server";

import { getLlmStatus } from "@/server/llm/gateway";

export const dynamic = "force-dynamic";

/**
 * GET /api/litespm/llm
 * Key-free snapshot of the LLM gateway: which providers are configured,
 * how many keys each has, and any active cooldowns. Never returns key material.
 */
export async function GET() {
  const status = getLlmStatus();
  return NextResponse.json(
    {
      providers: status.order,
      credentials: status.credentials,
      summary: {
        providers: status.order.length,
        keys: status.credentials.length,
        healthy: status.credentials.filter((c) => c.healthy).length,
        cooling: status.credentials.filter((c) => !c.healthy).length,
      },
      hint: "Configure via env: NVIDIA_API_KEY_1, GROQ_API_KEY_1, GEMINI_API_KEY_1, OPENROUTER_API_KEY_1 (multiple keys per provider supported), or LLM_GENERIC_JSON / LLM_GENERIC_1_* for any OpenAI-compatible provider. Order with LLM_PROVIDER_ORDER.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
