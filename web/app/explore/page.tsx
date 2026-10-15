import catalogData from "../../data/catalog.json";
import type { Listing } from "../../lib/telemetry";
import {
  agentFacets,
  categoryFacets,
  deriveKindCounts,
  GRID_PAGE,
  hostUniverse,
  withLinkKeys,
  sortListings,
  DEFAULT_SORT,
} from "../../lib/catalog";
import { taxonomyFacets } from "../../lib/taxonomy";
import type { ExploreViewProps } from "./ExploreView";
import type { Metadata } from "next";
import ExploreRoute from "./ExploreRoute";

export const metadata: Metadata = {
  title: "Explore the catalog",
  description:
    "Search the whole catalog snapshot by name, summary, publisher, category, runtime, transport or tool name, filter by task-shaped goal or the source's own category, and narrow to what installs into the agent you actually use.",
  alternates: { canonical: "/explore/" },
  openGraph: { title: "Explore the catalog · LiteSPM Market", url: "/explore/" },
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
    categories: categoryFacets(items, 200),
    // The editorial goal facets, from the same rules the browser re-runs over
    // the fetched rows (`lib/taxonomy`), so the two cannot disagree.
    goals: taxonomyFacets(items).map((facet) => ({
      id: facet.id,
      label: facet.label,
      count: facet.count,
    })),
    agents: agentFacets(items),
    hostCount: hostUniverse(items).length,
    // Sorted with the same function and the same default the browser uses, so
    // the prerendered page and the hydrated one agree on what "first" means.
    gridRows: sortListings(items, DEFAULT_SORT).slice(0, GRID_PAGE),
  };

  return <ExploreRoute {...props} />;
}
