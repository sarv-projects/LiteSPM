import { duplicateIndexGroups, uniqueListings } from "../lib/discovery.mjs";
import catalogData from "../data/catalog.json";
import type { Listing } from "../lib/telemetry";
import { demoteValidationFixtures, withLinkKeys } from "../lib/catalog";
import {
  deriveShelves,
  deriveTopics,
} from "../lib/landing";
import {
  buildSearchIndex,
  decodeSearchIndex,
  encodeSearchIndex,
  querySearchIndex,
} from "../lib/searchFormat.mjs";
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
/**
 * The search index the browser fetches, built here as well so the home tiles'
 * example names can be drawn from the first page their own link actually
 * shows. This is Explore's query path, reproduced with the same functions:
 * `querySearchIndex` over the same emitted index, then the validation-fixture
 * demotion Explore applies. Built once per process (the module outlives the
 * request in both `next build` and `next dev`), because the index is ~2s of
 * work over 69k rows and nothing about it changes between renders.
 */
let topicIndex: ReturnType<typeof decodeSearchIndex> | null = null;

function topicRanker(items: Listing[]): (query: string) => Listing[] {
  if (!topicIndex) {
    topicIndex = decodeSearchIndex(encodeSearchIndex(buildSearchIndex(items)));
  }
  const index = topicIndex;
  return (query: string) =>
    demoteValidationFixtures(querySearchIndex(index, query).map((i) => items[i]));
}

export default function Home() {
  const items = withLinkKeys(catalogData as unknown as Listing[]);

  const props: HomeViewProps = {
    total: uniqueListings(items).length,
    duplicateGroups: duplicateIndexGroups(items),
    topics: deriveTopics(items, topicRanker(items)),
    shelves: deriveShelves(items),
  };

  return <HomeRoute {...props} />;
}
