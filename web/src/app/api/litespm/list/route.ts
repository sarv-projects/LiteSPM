import { NextRequest, NextResponse } from "next/server";

import { searchCatalog, type SortKey } from "@/server/litespm/search";

export const dynamic = "force-dynamic";

const SORTS: SortKey[] = ["relevance", "rank", "name", "kind", "publisher"];

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const sortParam = params.get("sort");
    const response = await searchCatalog({
      q: params.get("q") ?? undefined,
      kind: params.get("kind") ?? undefined,
      goal: params.get("goal") ?? undefined,
      category: params.get("category") ?? undefined,
      source: params.get("source") ?? undefined,
      publisher: params.get("publisher") ?? undefined,
      installability: params.get("installability") ?? undefined,
      transport: params.get("transport") ?? undefined,
      host: params.get("host") ?? undefined,
      installable: params.get("installable") ?? undefined,
      sort: sortParam && SORTS.includes(sortParam as SortKey) ? (sortParam as SortKey) : undefined,
      page: Number(params.get("page") ?? "1") || 1,
      pageSize: Number(params.get("pageSize") ?? "24") || 24,
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("litespm list failed", error);
    return NextResponse.json({ error: "Failed to search the catalog" }, { status: 500 });
  }
}
