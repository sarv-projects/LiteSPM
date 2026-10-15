import catalogData from "../data/catalog.json";
import type { Listing } from "../lib/telemetry";
import { deriveKindCounts, withLinkKeys } from "../lib/catalog";
import {
  AGENT_CHOICES,
  deriveProvenance,
  deriveShelves,
  deriveTopics,
  rowWorksWithAgent,
} from "../lib/landing";
import type { HomeViewProps } from "./HomeView";
import HomeRoute from "./HomeRoute";

/**
 * This page is a **Server Component on purpose**.
 *
 * `data/catalog.json` (~3.8 MB) is imported here, which is the only place it
 * is ever imported from: server code runs at build time during static export,
 * so its import lands in the server bundle and never in a browser chunk. What
 * crosses the boundary is `HomeViewProps` — counts, the topic taxonomy with
 * its example names, the provenance totals and the labelled shelves —
 * serialized beside the prerendered HTML it describes.
 *
 * The view itself is loaded through `HomeRoute`, a thin client wrapper that
 * owns the `next/dynamic` import, so the landing UI stays in an async chunk and
 * the route's First Load JS stays at the framework + layout baseline. The
 * browser hydrates from the props and requests the full row set only when a
 * search asks for it — see `lib/catalogData.ts`.
 *
 * Derivations live in `lib/landing.ts` (pure functions over a row set), so the
 * counts in the HTML and the counts Explore reports after a fetch come from the
 * same code path.
 */
export default function Home() {
  const items = withLinkKeys(catalogData as unknown as Listing[]);

  const props: HomeViewProps = {
    total: items.length,
    kindCounts: deriveKindCounts(items),
    provenance: deriveProvenance(items),
    topics: deriveTopics(items),
    shelves: deriveShelves(items),
    // Counted here, over the same rows the strip's numbers used to come from,
    // so the landing page can print them without loading the row set.
    agentCounts: AGENT_CHOICES.map((choice) => ({
      id: choice.id,
      count: items.filter((item) => rowWorksWithAgent(item, choice)).length,
    })),
  };

  return <HomeRoute {...props} />;
}
