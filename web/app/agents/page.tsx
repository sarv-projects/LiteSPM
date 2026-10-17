import catalogData from "../../data/catalog.json";
import type { Listing } from "../../lib/telemetry";
import { withLinkKeys } from "../../lib/catalog";
import { isDiscontinued } from "../../lib/lifecycle";
import { buildAgentRows } from "./agentRows";
import type { Metadata } from "next";
import type { AgentsViewProps } from "./AgentsView";
import AgentsRoute from "./AgentsRoute";

/**
 * Its own title and preview: this page previously inherited the layout's single
 * `metadata`, so it shared a `<title>` and an `og:url` with every other route.
 */
export const metadata: Metadata = {
  title: "Agent hosts",
  description: `Every agent host named in the catalog, which of them LiteSPM can configure directly, and the config file each one uses.`,
  alternates: { canonical: "/agents/" },
  openGraph: { title: "Agent hosts · LiteSPM Market", url: "/agents/" },
};

/**
 * Server Component: host coverage is an aggregate over the full snapshot,
 * computed at build time and passed as props. Like `/categories/` and
 * `/trending/`, this route never requests the dataset in the browser.
 */
export default function AgentsPage() {
  const items = withLinkKeys(catalogData as unknown as Listing[]);

  // One row per host, not per catalog spelling (`agentRows.ts`): the catalog
  // names a single host through several strings — an adapter's registry name,
  // its skill target's display name — and rendering the strings separately put
  // the same host on the page twice with two different counts.
  //
  // A product its vendor has ended is filtered here rather than in the view: it
  // should not travel to the browser at all, so the render never has to decide.
  // `lifecycle.ts` holds the vendors' own notices.
  const rows = buildAgentRows(items).filter(
    (row) => !(row.hostId && isDiscontinued(row.hostId))
  );

  const props: AgentsViewProps = {
    hostCount: rows.length,
    agents: rows,
  };

  return <AgentsRoute {...props} />;
}
