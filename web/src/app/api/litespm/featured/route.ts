import { NextResponse } from "next/server";

import { getFeaturedShelf } from "@/server/litespm/package-detail";

// These responses derive exclusively from immutable deployment data.
export const dynamic = "force-static";

export async function GET() {
  try {
    const shelf = await getFeaturedShelf();
    return NextResponse.json(shelf, { headers: { "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (error) {
    console.error("litespm featured failed", error);
    return NextResponse.json({ error: "Failed to load the featured shelf" }, { status: 500 });
  }
}
