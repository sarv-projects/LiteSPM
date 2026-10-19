import type { Metadata } from "next";
import type { CompareViewProps } from "./CompareView";
import CompareRoute from "./CompareRoute";
import { assertAdapterSourcesMatchRegistry, assertCompareCountsAgree, compareData } from "./compareRows";

/**
 * `/compare` — which agents LiteSPM can set up, and what it changes when it
 * does (`LPSM-J007`).
 *
 * A **Server Component**, like `/agents/` and `/agents/[id]/`: the two host
 * registries are small enough to be imported directly (`data/hosts.json`,
 * `data/skill-targets.json`), the catalog totals come from `data/release.json`
 * rather than from a pass over the 69,376-row snapshot, and what crosses the
 * client boundary is only the resolved row set. Nothing here needs the dataset
 * in the browser, so this route never fetches it — the acceptance criterion the
 * whole Market UI is built around.
 *
 * Every cell on the page is a value one of those files states. The page is
 * written for a reader deciding whether to let LiteSPM touch an agent's config:
 * the file it writes, whether project scope works, where skills land, and the
 * vendor's own documentation. The sourcing is the build's business, not the
 * page's — the output names no file, field or symbol from this repository.
 */
export const metadata: Metadata = {
  title: "Compare agent hosts",
  description:
    "The 50 agent hosts LiteSPM can configure, the config file it adds one entry to, where skills install — and the 29 more that take skills only.",
  alternates: { canonical: "/compare/" },
  openGraph: { title: "Compare agent hosts · LiteSPM Market", url: "/compare/" },
};

export default function ComparePage() {
  // Cheap, and it fails the build rather than letting `/insights`'s docs
  // column link a source file the registry no longer lists as hand-written.
  assertAdapterSourcesMatchRegistry();
  assertCompareCountsAgree();

  const props: CompareViewProps = { data: compareData() };

  return <CompareRoute {...props} />;
}
