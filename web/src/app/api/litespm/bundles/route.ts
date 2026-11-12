import { NextResponse } from "next/server";

import { getBundles } from "@/server/litespm/bundles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bundles = await getBundles();
    return NextResponse.json(bundles, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.error("litespm bundles failed", error);
    return NextResponse.json({ error: "Failed to load bundles" }, { status: 500 });
  }
}
