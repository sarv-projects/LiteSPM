import { NextRequest, NextResponse } from "next/server";

import { clientIp, rateLimit, tooManyRequests } from "@/server/litespm/rate-limit";
import { searchCatalog, type SortKey } from "@/server/litespm/search";

export const dynamic = "force-dynamic";

const SORTS: SortKey[] = ["relevance", "rank", "name", "kind", "publisher"];

/** Query strings are untrusted; bound every free-text field before it reaches the engine. */
function field(params: URLSearchParams, name: string, max = 120): string | undefined {
  const value = params.get(name);
  if (!value) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Catalog search. The catalog is immutable per release, so a response is a
 * pure function of its query string: let the CDN and browser keep it
 * (`s-maxage`), and let the per-IP limiter below only see cache misses.
 * `facets=0` skips the sidebar counts, `facets=only` returns just the counts.
 */
export async function GET(request: NextRequest) {
  const limit = rateLimit(`list:${clientIp(request)}`, 240, 60_000);
  if (!limit.allowed) return tooManyRequests(limit);

  try {
    const params = request.nextUrl.searchParams;
    const sortParam = params.get("sort");
    const facetsParam = params.get("facets");
    const response = await searchCatalog({
      q: field(params, "q", 200),
      kind: field(params, "kind", 16),
      goal: field(params, "goal", 32),
      category: field(params, "category"),
      source: field(params, "source", 64),
      publisher: field(params, "publisher"),
      installability: field(params, "installability", 32),
      transport: field(params, "transport", 32),
      host: field(params, "host", 64),
      installable: field(params, "installable", 8),
      sort: sortParam && SORTS.includes(sortParam as SortKey) ? (sortParam as SortKey) : undefined,
      page: Math.max(1, Math.min(10_000, Number(params.get("page") ?? "1") || 1)),
      pageSize: Number(params.get("pageSize") ?? "24") || 24,
      facets: facetsParam === "only" ? "only" : facetsParam !== "0",
      // The list needs only fields the compact projection carries; loading it
      // is a few seconds on a cold function, the full catalog tens of seconds.
      compact: true,
    });
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.error("litespm list failed", error);
    return NextResponse.json({ error: "Failed to search the catalog" }, { status: 500 });
  }
}
