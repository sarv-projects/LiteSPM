import { uniqueListings } from "../../lib/discovery.mjs";
import catalogData from "../../data/catalog.json";
import type { Listing } from "../../lib/telemetry";
import {
  agentFacets,
  allCategoryFacets,
  deriveKindCounts,
  GRID_PAGE,
  withLinkKeys,
  sortListings,
  sourceFacets,
  DEFAULT_SORT,
} from "../../lib/catalog";
import { taxonomyFacets } from "../../lib/taxonomy";
import type { ExploreViewProps } from "./ExploreView";
import type { Metadata } from "next";
import ExploreRoute from "./ExploreRoute";

export const metadata: Metadata = {
  title: "Explore the catalog",
  description:
    "Discover MCP servers, skills and plugins by task, publisher, category or agent host. Every listing shows its declared compatibility and whether LiteSPM can install it.",
  alternates: { canonical: "/explore/" },
  openGraph: { title: "Explore the catalog · LiteSPM", url: "/explore/" },
};

/**
 * Server Component: the full catalog is read here, at build time, and only
 * the slice this route shows (facets, totals, one page of rows) is serialized
 * into the HTML. The dataset itself never enters a client chunk — search and
 * filtering fetch it on first use (`lib/catalogData.ts`), so a first visit to
 * `/explore/` downloads the page, not 3.8 MB of rows it has not asked for.
 *
 * The view loads through `ExploreRoute` so its UI stays in an async chunk and
 * the route's First Load JS stays at the shared baseline.
 */
export default function ExplorePage() {
  const items = withLinkKeys(catalogData as unknown as Listing[]);

  const props: ExploreViewProps = {
    total: items.length,
    kindCounts: deriveKindCounts(items),
    // The editorial goal facets, from the same rules the browser re-runs over
    // the fetched rows (`lib/taxonomy`), so the two cannot disagree.
    goals: taxonomyFacets(items).map((facet) => ({
      id: facet.id,
      label: facet.label,
      count: facet.count,
    })),
    agents: agentFacets(items),
    // The three filters that had no control (F-07). The category list is the
    // whole vocabulary — `?category=` accepts every one of them, so a control
    // that offered a slice would be a control that lied about what it could
    // filter — and the source list is the twelve places rows are read from.
    // Both are counted here, at build time, over the same rows the browser
    // later filters, so the number beside a name is the number the filter
    // returns.
    categories: allCategoryFacets(items),
    sources: sourceFacets(items),
    // Sorted with the same function and the same default the browser uses, so
    // the prerendered page and the hydrated one agree on what "first" means.
    gridRows: uniqueListings(sortListings(items, DEFAULT_SORT)).slice(0, GRID_PAGE) as Listing[],
  };

  return <ExploreRoute {...props} />;
}
