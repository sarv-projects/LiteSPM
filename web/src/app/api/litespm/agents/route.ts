import { NextResponse } from "next/server";

import { buildAgentRows, agentStats } from "@/server/litespm/agents";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [agents, stats] = await Promise.all([buildAgentRows(), agentStats()]);
    return NextResponse.json({ agents, stats }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (error) {
    console.error("litespm agents failed", error);
    return NextResponse.json({ error: "Failed to build the agent directory" }, { status: 500 });
  }
}
