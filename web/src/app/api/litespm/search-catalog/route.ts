import { NextResponse } from "next/server";

import { buildCompactDataset } from "@/server/litespm/dataset";

export const dynamic = "force-dynamic";

/**
 * Development-only exporter for the compact search projection. Production
 * serves the committed `data/search-catalog.json.gz`; this route is 404 there.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(await buildCompactDataset());
}
