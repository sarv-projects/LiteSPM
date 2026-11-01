import { NextResponse } from "next/server";

import { getFeaturedShelf } from "@/server/litespm/package-detail";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const shelf = await getFeaturedShelf();
    return NextResponse.json(shelf);
  } catch (error) {
    console.error("litespm featured failed", error);
    return NextResponse.json({ error: "Failed to load the featured shelf" }, { status: 500 });
  }
}
