import { NextRequest, NextResponse } from "next/server";

import { getLlmStatus } from "@/server/llm/gateway";
import { clientIp, rateLimit } from "@/server/litespm/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/litespm/llm
 * Key-free health snapshot of the LLM gateway. It exposes provider names and
 * aggregate credential counts for diagnosis, but never credential values or
 * per-key failure details.
 */
export async function GET(request: NextRequest) {
  const limit = rateLimit(`llm-status:${clientIp(request)}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many status requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  const status = getLlmStatus();
  const keyed = status.credentials.filter((credential) => credential.keyIndex !== null);
  const keyless = status.credentials.filter((credential) => credential.keyIndex === null);
  const keyIds = new Set(keyed.map((credential) => `${credential.provider}#${credential.keyIndex}`));
  const keylessAdapters = new Set(keyless.map((credential) => credential.provider));
  return NextResponse.json(
    {
      configured: status.credentials.length > 0,
      providers: status.order,
      summary: {
        providers: status.order.length,
        keys: keyIds.size,
        keylessAdapters: keylessAdapters.size,
        healthy: status.credentials.filter((c) => c.healthy).length,
        cooling: status.credentials.filter((c) => !c.healthy).length,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
