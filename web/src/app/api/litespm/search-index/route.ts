import { NextResponse } from "next/server";

import { getDataset } from "@/server/litespm/dataset";
import { getSearchIndex, serializeSearchIndex } from "@/server/litespm/bm25";

export const dynamic = "force-dynamic";

/**
 * Development-only exporter for the build-time BM25F index.
 *
 * Run the dev server, then:
 *   curl -s http://localhost:3010/api/litespm/search-index -o data/search-index.json
 *   node scripts/build-search-index.mjs --gzip data/search-index.json
 *
 * Production returns 404: the committed gzip is what the runtime loads.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const dataset = await getDataset();
  const index = getSearchIndex(dataset.rows, dataset.release.releaseId);
  return NextResponse.json(serializeSearchIndex(index));
}
