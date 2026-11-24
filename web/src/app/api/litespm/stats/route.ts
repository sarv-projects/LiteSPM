import { NextResponse } from "next/server";

import { catalogStats } from "@/server/litespm/search";

// These responses derive exclusively from immutable deployment data.
export const dynamic = "force-static";

export async function GET() {
  try {
    const stats = await catalogStats();
    return NextResponse.json(stats, { headers: { "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (error) {
    console.error("litespm stats failed", error);
    return NextResponse.json({ error: "Failed to compute catalog stats" }, { status: 500 });
  }
}
