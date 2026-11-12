import { NextRequest, NextResponse } from "next/server";

import { getPackageDetail } from "@/server/litespm/package-detail";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const response = await getPackageDetail(key);
    if (!response.found) {
      return NextResponse.json(
        { found: false },
        { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=600" } },
      );
    }
    // The catalog is fixed per deployment, so a listing's detail can be served
    // from the edge cache. Without this every product page waited 2-3.5 s on a
    // cold function before showing anything but a skeleton.
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    console.error("litespm package failed", error);
    return NextResponse.json({ error: "Failed to load the package" }, { status: 500 });
  }
}
