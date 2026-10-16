import catalogData from "../../data/catalog.json";
import type { Listing } from "../../lib/telemetry";
import { agentFacets, hostUniverse, withLinkKeys } from "../../lib/catalog";
import { HOSTS, resolveHost } from "../../lib/hosts";
import { isDiscontinued } from "../../lib/lifecycle";
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

  const props: AgentsViewProps = {
    hostCount: hostUniverse(items).length,
    // Filtered here rather than in the view: a product its vendor has ended
    // should not travel to the browser at all, so the render never has to
    // decide. `lifecycle.ts` holds the vendors' own notices.
    agents: agentFacets(items).filter((agent) => {
      const host = resolveHost(agent.name);
      return !(host && isDiscontinued(host.id));
    }),
  };

  return <AgentsRoute {...props} />;
}
