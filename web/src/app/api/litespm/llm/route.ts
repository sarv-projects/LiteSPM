import { NextRequest, NextResponse } from "next/server";

import { getLlmStatus } from "@/server/llm/gateway";
import { clientIp, rateLimit } from "@/server/litespm/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/litespm/llm
 * Key-free health snapshot of the LLM gateway. It reports counts only: the
 * provider order and per-key cooldown state are deployment details that a
 * public route has no reason to publish.
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
  return NextResponse.json(
    {
      configured: status.credentials.length > 0,
      summary: {
        providers: status.order.length,
        keys: status.credentials.length,
        healthy: status.credentials.filter((c) => c.healthy).length,
        cooling: status.credentials.filter((c) => !c.healthy).length,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
