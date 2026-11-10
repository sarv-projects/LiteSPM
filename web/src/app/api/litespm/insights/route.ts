import { NextResponse } from "next/server";

import { getInsights } from "@/server/litespm/insights";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const insights = await getInsights();
    return NextResponse.json(insights, { headers: { "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (error) {
    console.error("litespm insights failed", error);
    return NextResponse.json({ error: "Failed to compute insights" }, { status: 500 });
  }
}
