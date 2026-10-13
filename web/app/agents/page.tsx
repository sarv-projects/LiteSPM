import catalogData from "../../data/catalog.json";
import type { Listing } from "../../lib/telemetry";
import { agentFacets, hostUniverse, withLinkKeys } from "../../lib/catalog";
import { resolveHost } from "../../lib/hosts";
import { isDiscontinued } from "../../lib/lifecycle";
import type { AgentsViewProps } from "./AgentsView";
import AgentsRoute from "./AgentsRoute";

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
