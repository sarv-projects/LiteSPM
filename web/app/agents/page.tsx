import catalogData from "../../data/catalog.json";
import type { Listing } from "../../lib/telemetry";
import { withLinkKeys } from "../../lib/catalog";
import { buildAgentRows } from "./agentRows";
import type { Metadata } from "next";
import type { AgentsViewProps } from "./AgentsView";
import AgentsRoute from "./AgentsRoute";

/**
 * Its own title and preview: this page previously inherited the layout's single
 * `metadata`, so it shared a `<title>` and an `og:url` with every other route.
 */
export const metadata: Metadata = {
  title: "Agents",
  description:
    "Browse sourced product profiles and see how LiteSPM sets up supported agent apps and skill destinations.",
  alternates: { canonical: "/agents/" },
  openGraph: { title: "Agents · LiteSPM", url: "/agents/" },
};

/**
 * Server Component: host coverage is an aggregate over the full snapshot,
 * computed at build time and passed as props. Like `/categories/` and
 * `/insights/`, this route never requests the dataset in the browser.
 */
export default function AgentsPage() {
  const items = withLinkKeys(catalogData as unknown as Listing[]);

  // One row per host, not per catalog spelling (`agentRows.ts`): the catalog
  // names a single host through several strings — an adapter's registry name,
  // its skill target's display name — and rendering the strings separately put
  // the same host on the page twice with two different counts.
  //
  // Every identity is listed, including a product its vendor has ended: the
  // page is the index of what the catalog names, the count it states is the
  // number of rows it renders, and the row's own page carries the vendor's
  // notice. `AgentsView` marks a discontinued row; the landing chooser is
  // where an ended product stops being offered (`lib/lifecycle.ts`).
  const rows = buildAgentRows(items);

  const props: AgentsViewProps = {
    hostCount: rows.length,
    agents: rows,
  };

  return <AgentsRoute {...props} />;
}
