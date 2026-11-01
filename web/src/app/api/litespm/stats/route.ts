import { NextResponse } from "next/server";

import { catalogStats } from "@/server/litespm/search";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await catalogStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("litespm stats failed", error);
    return NextResponse.json({ error: "Failed to compute catalog stats" }, { status: 500 });
  }
}
