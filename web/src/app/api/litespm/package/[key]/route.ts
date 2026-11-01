import { NextRequest, NextResponse } from "next/server";

import { getPackageDetail } from "@/server/litespm/package-detail";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const response = await getPackageDetail(key);
    if (!response.found) {
      return NextResponse.json({ found: false }, { status: 404 });
    }
    return NextResponse.json(response);
  } catch (error) {
    console.error("litespm package failed", error);
    return NextResponse.json({ error: "Failed to load the package" }, { status: 500 });
  }
}
