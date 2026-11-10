import { NextRequest, NextResponse } from "next/server";

import { buildAgentDetail } from "@/server/litespm/agents";

export const dynamic = "force-dynamic";

/** A stray `%` must be a 404, not a 500. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const detail = await buildAgentDetail(safeDecode(id));
    if (!detail) {
      return NextResponse.json({ found: false }, { status: 404 });
    }
    return NextResponse.json({ found: true, detail });
  } catch (error) {
    console.error("litespm agent detail failed", error);
    return NextResponse.json({ error: "Failed to build the agent detail" }, { status: 500 });
  }
}
