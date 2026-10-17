import type { Metadata } from "next";
import type { CompareViewProps } from "./CompareView";
import CompareRoute from "./CompareRoute";
import { assertAdapterSourcesMatchRegistry, compareData } from "./compareRows";

/**
 * `/compare` — the agent-vs-agent matrix (`LPSM-J007`).
 *
 * A **Server Component**, like `/agents/` and `/agents/[id]/`: the two host
 * registries are small enough to be imported directly (`data/hosts.json`,
 * `data/skill-targets.json`), the catalog totals come from `data/release.json`
 * rather than from a pass over the 69,376-row snapshot, and what crosses the
 * client boundary is only the resolved row set. Nothing here needs the dataset
 * in the browser, so this route never fetches it — the acceptance criterion the
 * whole Market UI is built around.
 *
 * Every cell on the page is a value one of those files states. The page exists
 * because an earlier pass read the row as "catalog entries by compatibility"
 * and concluded there was no data for it; the data was there, in the two host
 * registries, and `compareRows.ts` derives it without inventing a single fact.
 */
export const metadata: Metadata = {
  title: "Compare agent hosts",
  description:
    "Every agent host side by side: config file, project scope, remote support and skills directories — each cell traced to the registry it came from.",
  alternates: { canonical: "/compare/" },
  openGraph: { title: "Compare agent hosts · LiteSPM Market", url: "/compare/" },
};

export default function ComparePage() {
  // Cheap, and it fails the build rather than publishing an evidence link to a
  // source file the registry no longer lists as hand-written.
  assertAdapterSourcesMatchRegistry();

  const props: CompareViewProps = { data: compareData() };

  return <CompareRoute {...props} />;
}
