import catalogData from "../../data/catalog.json";
import type { Listing } from "../../lib/telemetry";
import {
  agentFacets,
  categoryIndex,
  kindBreakdown,
  kindLabel,
  publisherFacets,
  withLinkKeys,
} from "../../lib/catalog";
import type { TrendingViewProps } from "./TrendingView";
import type { Metadata } from "next";
import TrendingRoute from "./TrendingRoute";

export const metadata: Metadata = {
  title: "Coverage",
  description:
    "What the catalog snapshot contains: entries per capability kind, agent host, category and publisher.",
  alternates: { canonical: "/trending/" },
  openGraph: { title: "Coverage · LiteSPM Market", url: "/trending/" },
};

/**
 * Server Component: the coverage boards are counts over the full snapshot,
 * computed at build time. Rows are never rendered here, so the browser gets a
 * few hundred bytes of board data and no reason to fetch the dataset at all.
 */
export default function TrendingPage() {
  const items = withLinkKeys(catalogData as unknown as Listing[]);

  const categories = categoryIndex(items);
  const hosts = agentFacets(items);
  const publishers = publisherFacets(items, Number.MAX_SAFE_INTEGER);

  const props: TrendingViewProps = {
    total: items.length,
    boards: {
      categories: categories
        .slice(0, 15)
        .map((c) => ({ label: c.name, count: c.count })),
      hosts: hosts
        .slice(0, 15)
        .map((a) => ({ label: a.name, count: a.count })),
      publishers: publishers.slice(0, 15).map((p) => ({ label: p.name, count: p.count })),
      kinds: kindBreakdown(items)
        .map((k) => ({ label: kindLabel(k.kind), count: k.count, kind: k.kind }))
        .sort((a, b) => b.count - a.count),
    },
    // The boards render 15 rows each; these are the whole-snapshot counts, so
    // the truncation is stated on the page instead of silently implied.
    boardTotals: {
      categories: categories.length,
      hosts: hosts.length,
      publishers: publishers.length,
    },
  };

  return <TrendingRoute {...props} />;
}
