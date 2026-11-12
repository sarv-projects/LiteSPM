import { NextRequest, NextResponse } from "next/server";

import { getSourceDocs } from "@/server/litespm/source-docs";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const response = await getSourceDocs(key);
    // Upstream failures are answered as found:false (never a 500) and cached
    // briefly so a transient GitHub error is not pinned for hours.
    const cacheControl = response.found
      ? "public, s-maxage=21600, stale-while-revalidate=604800"
      : "public, s-maxage=300, stale-while-revalidate=600";
    return NextResponse.json(response, { headers: { "Cache-Control": cacheControl } });
  } catch (error) {
    console.error("litespm source route failed", error);
    return NextResponse.json(
      { found: false, reason: "The source document could not be loaded.", fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=60" } },
    );
  }
}
