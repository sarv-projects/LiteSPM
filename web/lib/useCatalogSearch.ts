"use client";

// Client-side catalog search over the postings index emitted at build time.
//
// There is **one search implementation**. `lib/searchFormat.mjs` owns the
// tokenizer, the matcher semantics and `querySearchIndex`; the worker runs it
// off-thread, and when no worker exists the same function runs on this thread
// over the same decoded index. The paths cannot answer differently, which is
// why the old `mode: "worker" | "fallback"` field is gone: it reported *where*
// the CPU ran, never *what* was answered.
//
// There are two ways a matched row becomes renderable, and they differ only in
// which artifact carries the display bytes:
//
//   caller rows   a richer filter or a previously loaded result supplied rows;
//                 matches and display data stay in memory.
//   windowed      Explore filters compact row ids first, then hydrates only
//                 the display shards for visible results. `requestMore()`
//                 adds the next window as the reader pages.
//
// The windowed path exists because the wire is what the reader feels: the
// first search used to fetch the postings index (2.7 MiB gzipped) *and* the
// full display projection (5.0 MiB gzipped) so that 24 cards could be
// rendered. Measured over a 25-query corpus on the real dataset, a 48-row
// window costs 120 KiB / 22 requests for `postgres` and at most 223 KiB / 41
// requests for any corpus query. The full projection is still emitted and is
// still what a facet path loads — counts over the whole set genuinely need
// every row, and those paths say so by asking for the rows.
//
// What each path costs on a first search:
//
//   windowed   2.7 MiB gzipped index fetched and decoded in the worker, one
//              query over typed arrays (~ms), then the shards holding the
//              first window.
//   caller     the same index, then hydration from rows already in memory.
//   degraded   the index fetch failed: `matchesQuery` over the hydrated rows.
//              Best-effort and documented below — the projection caps display
//              summaries, so a token that appears only beyond the cap is
//              missed here; the index path above cannot miss it. A windowed
//              caller has no rows to scan, so the fallback loads the full
//              projection first.
//
// The row array never crosses a structured clone: the worker fetches its own
// index, and results come back as row indices (4 bytes each) into the
// hydration source the page holds.

import { uniqueMatchIndices } from "./discovery.mjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Listing } from "./telemetry";
import { matchesQuery } from "./telemetry";
import {
  loadCatalog,
  SEARCH_FACETS_URL,
  SEARCH_INDEX_URL,
  searchShardUrl,
} from "./catalogData";
import { fetchSearchFacets, fetchSearchIndex, hydrateDisplayRows } from "./searchAssets";
import type { SearchFacets } from "./searchAssets";
import { filterSearchIndices } from "./searchFacets.mjs";
import {
  querySearchIndex,
  SEARCH_RESULT_WINDOW,
} from "./searchFormat.mjs";
import type { DecodedSearchIndex } from "./searchAssets";
import type { WorkerInboundMessage, WorkerOutboundMessage } from "./search.worker";

export interface CatalogSearchFilters {
  kind?: string | null;
  category?: string | null;
}

export interface CatalogSearchOptions {
  /**
   * Hydrate only a window of the matched rows, from the sharded display
   * projection, instead of expecting the caller to supply the whole row set.
   *
   * Only the query path uses it, and only while no kind/category filter is
   * set: a filter is a claim about every matched row, which needs every row
   * (the facet path). The caller must render the window and report the count
   * from `totalMatches`, and call `requestMore()` when the reader pages past
   * the hydrated rows.
   */
  windowed?: boolean;
  /** Build-time full row count, allowing browse facets to load without the search index. */
  rowCount?: number;
  duplicateGroups?: number[][];
}

export interface CatalogSearchState {
  results: Listing[];
  /**
   * The number of rows the index matched for the *current* inputs, measured
   * over the whole set. `results` holds the hydrated window of them in
   * windowed mode and every one of them otherwise, so a caller that renders a
   * window must take its count from here.
   */
  totalMatches: number;
  /** Hydrate the next window of results (windowed mode; a no-op otherwise). */
  requestMore: () => void;
  /** The search could not be measured and the fallback failed too. */
  error: boolean;
  /** Re-run the failed search. */
  retry: () => void;
  searching: boolean;
  /**
   * True only when `results` were computed for the *current* inputs.
   *
   * Without this a caller cannot tell "no matches" from "not searched yet": on
   * the frame where the rows arrive, `results` still holds the previous run (an
   * empty row set, so empty) while `searching` is already false — and a UI that
   * trusted those two rendered a confident "No matches" before any search had
   * happened. The hook knows the answer; callers should not have to guess it
   * from a timing coincidence.
   *
   * A search that measured zero rows has measured nothing: with no index and no
   * rows this stays false, exactly as it did when the rows were the measurement.
   */
  settled: boolean;
  /** True after a filtered or paged browse uses index ids and display shards. */
  windowed: boolean;
}

const DEBOUNCE_MS = 120;

/** The identity of one search: query and filters. The row set is no longer
 *  part of it — results come from the global index, not from a caller's slice —
 *  and neither is where the query ran. */
function searchKey(query: string, kind: string | null, category: string | null): string {
  return `${query}::${kind ?? ""}::${category ?? ""}`;
}

function matchesFilters(
  listing: Listing,
  kind?: string | null,
  category?: string | null
): boolean {
  if (kind && listing.kind !== kind) return false;
  if (category && listing.category !== category) return false;
  return true;
}

function filterRows(
  listings: Listing[],
  kind?: string | null,
  category?: string | null
): Listing[] {
  return listings.filter((listing) => matchesFilters(listing, kind, category));
}

/**
 * Shared identity for "no rows yet". Callers legitimately pass `full ?? []`,
 * and a fresh `[]` literal per render would change this hook's effect
 * dependencies on every render — see the guard comment on the row-source
 * effect below for why that became an infinite update loop.
 */
const EMPTY_LISTINGS: Listing[] = [];

type IndexState = "idle" | "loading" | "ready" | "error";

/**
 * Search the catalog with a prebuilt postings index, falling back to the same
 * matcher over loaded rows when the index cannot be fetched. Results always
 * reflect the latest query/filter combination.
 *
 * @param listings the caller's rows, used as the hydration source when it is
 *   the full set; a windowed search hydrates from the sharded projection
 *   instead.
 * @param options `{ windowed: true }` for a caller with no row set that wants
 *   only the results it can render (see `CatalogSearchOptions`).
 */
export function useCatalogSearch(
  listings: Listing[],
  query: string,
  filters: CatalogSearchFilters,
  options?: CatalogSearchOptions
): CatalogSearchState {
  // Normalize every "empty" input to one shared identity: an empty row set is
  // an empty row set, and callers passing `full ?? []` would otherwise hand a
  // brand-new array to the effects below on every render.
  const duplicateGroupsRef = useRef(options?.duplicateGroups);
  duplicateGroupsRef.current = options?.duplicateGroups;
  const rowsInput = listings.length === 0 ? EMPTY_LISTINGS : listings;
  const kind = filters.kind ?? null;
  const category = filters.category ?? null;
  const trimmedQuery = query.trim();
  const [windowActivated, setWindowActivated] = useState(false);
  const needsSearch = trimmedQuery !== "" || kind !== null || category !== null;
  // Type/category browsing already has a compact row-aligned facet table and
  // curated order. Fetch the large postings index only when the reader enters
  // a text query; browse windows can filter ids directly from those facets.
  const wantsIndex = trimmedQuery !== "";

  /** Results computed by the index paths; the browse path below is derived. */
  const [indexedResults, setIndexedResults] = useState<Listing[]>(EMPTY_LISTINGS);
  const [totalMatches, setTotalMatches] = useState(0);
  const [searching, setSearching] = useState(false);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** Index state is mirrored in a ref so the load effect can be guarded
   *  without re-running on every transition. */
  const [indexState, setIndexState] = useState<IndexState>("idle");
  const [indexRowCount, setIndexRowCount] = useState(0);
  const [facetState, setFacetState] = useState<IndexState>("idle");
  const facetsRef = useRef<SearchFacets | null>(null);
  const [rows, setRows] = useState<Listing[] | null>(rowsInput.length > 0 ? rowsInput : null);

  const workerRef = useRef<Worker | null>(null);
  const indexRef = useRef<DecodedSearchIndex | null>(null);
  const indexStateRef = useRef<IndexState>("idle");
  const facetRequestRef = useRef(false);
  const rowsRef = useRef<Listing[] | null>(rows);
  /** The key whose search is in flight, so the worker reply can be attributed. */
  const inflightKeyRef = useRef<string | null>(null);
  /** The filters of the in-flight worker request, applied at reply time. */
  const pendingFiltersRef = useRef<{
    kind: string | null;
    category: string | null;
    rankBrowse: boolean;
  }>({
    kind: null,
    category: null,
    rankBrowse: false,
  });
  const requestIdRef = useRef(0);
  /** The exact inputs of the last effect run, so a re-render with identical
   *  inputs cannot schedule a duplicate search. */
  const lastRunRef = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // Which hydration path this run takes.
  //
  // Text search uses the postings index; kind/category browse uses compact
  // facets; rich filters request the full projection elsewhere.
  // Caller rows win over windowing when the caller actually has them.
  // -------------------------------------------------------------------------
  const callerRowsFull =
    rowsInput.length > 0 && (indexRowCount === 0 || rowsInput.length === indexRowCount);
  const windowed =
    options?.windowed === true &&
    !callerRowsFull &&
    (needsSearch || windowActivated);
  /** Mirrored for the worker's `onmessage`, which is bound once. */
  const windowedRef = useRef(windowed);
  windowedRef.current = windowed;
  const browseOnly = windowed && trimmedQuery === "";
  const expectedRowCount = options?.rowCount ?? indexRowCount;
  const needsFacets = windowed && (trimmedQuery === "" || kind !== null || category !== null);
  const needsFacetsRef = useRef(needsFacets);
  needsFacetsRef.current = needsFacets;

  // -------------------------------------------------------------------------
  // The hydrated window.
  //
  // The window is keyed by the search it belongs to, so typing a new query
  // starts from the first window rather than from however far the reader had
  // paged into the previous one. `requestMore` is stable because the UI hands
  // it to a button.
  // -------------------------------------------------------------------------
  const key = searchKey(query, kind, category);
  const keyRef = useRef(key);
  keyRef.current = key;
  const [windowState, setWindowState] = useState<{ key: string; size: number }>(() => ({
    key,
    size: SEARCH_RESULT_WINDOW,
  }));
  const windowSize = windowState.key === key ? windowState.size : SEARCH_RESULT_WINDOW;
  const requestMore = useCallback(() => {
    setWindowActivated(true);
    setWindowState((current) => {
      const currentKey = keyRef.current;
      const base = current.key === currentKey ? current.size : SEARCH_RESULT_WINDOW;
      return { key: currentKey, size: base + SEARCH_RESULT_WINDOW };
    });
  }, []);

  /** The whole match list the index answered for `key`, kept so the count and
   *  the window can grow without querying the index again. */
  const matchesRef = useRef<{ key: string; indices: number[] } | null>(null);
  const [matchRun, setMatchRun] = useState(0);

  // -------------------------------------------------------------------------
  // Row source.
  //
  // Prefer the caller's rows when it handed over the whole set — they are the
  // same objects this hook would load, and they are already in memory. A
  // caller that passes a slice (length does not match the index) gets the
  // global projection instead, because the index answers globally and
  // hydrating a slice by index would name the wrong rows. A windowed search
  // fetches no rows up front: its shards arrive with the results that need
  // them.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (rowsInput.length > 0 && (indexRowCount === 0 || rowsInput.length === indexRowCount)) {
      setRows(rowsInput);
      return;
    }
    if (!needsSearch) return;
    if (windowed) return;
    let alive = true;
    loadCatalog()
      .then((loaded) => {
        if (alive) setRows(loaded);
      })
      .catch(() => {
        // The caller's own fetch has the error UI; the hook stays unhydrated.
      });
    return () => {
      alive = false;
    };
  }, [rowsInput, needsSearch, indexRowCount, windowed]);

  // -------------------------------------------------------------------------
  // Index load: once per session, on the first query that actually searches.
  // A passive visit never fetches it — same rule the row fetch has always had.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!wantsIndex) return;
    if (indexStateRef.current !== "idle") return;
    indexStateRef.current = "loading";
    setIndexState("loading");

    if (typeof window !== "undefined" && typeof Worker !== "undefined") {
      let worker: Worker | null = null;
      try {
        // A retry after an index failure re-creates the worker; the previous
        // one (if any) has nothing to answer any more.
        workerRef.current?.terminate();
        worker = new Worker(new URL("./search.worker.ts", import.meta.url), {
          type: "module",
        });
      } catch {
        worker = null;
      }
      if (worker) {
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
          const message = event.data;
          if (!message || typeof message !== "object") return;
          if (message.type === "ready") {
            indexStateRef.current = "ready";
            setIndexRowCount(message.rowCount);
            setIndexState("ready");
            return;
          }
          if (message.type === "error") {
            indexStateRef.current = "error";
            setIndexState("error");
            return;
          }
          if (message.type !== "results") return;
          // Ignore responses that are not for the most recently posted search.
          if (message.id !== requestIdRef.current) return;

          if (windowedRef.current) {
            // Filter row ids before fetching display data. A kind or category
            // selection never hydrates the full result set on the main thread.
            const pending = pendingFiltersRef.current;
            const indices = needsFacetsRef.current && facetsRef.current
              ? filterSearchIndices(
                  message.indices,
                  facetsRef.current,
                  pending,
                  { rankBrowse: pending.rankBrowse },
                )
              : message.indices;
            matchesRef.current = {
              key: inflightKeyRef.current ?? "",
              indices: uniqueMatchIndices(indices, duplicateGroupsRef.current),
            };
            setMatchRun((n) => n + 1);
            return;
          }

          const source = rowsRef.current;
          const { kind: filterKind, category: filterCategory } = pendingFiltersRef.current;
          const next: Listing[] = [];
          if (source) {
            for (const index of message.indices) {
              const row = source[index];
              if (row && matchesFilters(row, filterKind, filterCategory)) next.push(row);
            }
          }
          setIndexedResults(next);
          setTotalMatches(next.length);
          setSearching(false);
          setSettledKey(inflightKeyRef.current);
        };
        worker.onerror = () => {
          // Worker failed at runtime: the same index can be decoded here.
          indexStateRef.current = "error";
          setIndexState("error");
        };
        try {
          worker.postMessage({
            type: "load",
            url: SEARCH_INDEX_URL,
          } satisfies WorkerInboundMessage);
        } catch {
          indexStateRef.current = "error";
          setIndexState("error");
        }
        return;
      }
    }

    // No worker: fetch and decode the same index on this thread. The fallback
    // is not a second implementation — it is the same `querySearchIndex`.
    let alive = true;
    fetchSearchIndex(SEARCH_INDEX_URL)
      .then((loaded) => {
        if (!alive) return;
        indexRef.current = loaded.index;
        indexStateRef.current = "ready";
        setIndexRowCount(loaded.rowCount);
        setIndexState("ready");
      })
      .catch(() => {
        if (!alive) return;
        indexStateRef.current = "error";
        setIndexState("error");
      });
    return () => {
      alive = false;
    };
  }, [wantsIndex, attempt]);

  useEffect(() => {
    if (!needsFacets || expectedRowCount <= 0) return;
    if (!browseOnly && indexState !== "ready") return;
    if (facetsRef.current || facetRequestRef.current) return;

    facetRequestRef.current = true;
    setFacetState("loading");
    let alive = true;
    fetchSearchFacets(SEARCH_FACETS_URL, expectedRowCount)
      .then((facets) => {
        if (!alive) return;
        facetsRef.current = facets;
        setFacetState("ready");
      })
      .catch(() => {
        if (!alive) return;
        facetRequestRef.current = false;
        setFacetState("error");
      });
    return () => {
      alive = false;
    };
  }, [needsFacets, browseOnly, expectedRowCount, indexState, attempt]);

  // Terminate the worker on unmount. A separate mount-once effect, because the
  // load effect above must not re-run (and re-create the worker) when the
  // reader clears the query and types again.
  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    []
  );

  // -------------------------------------------------------------------------
  // The search itself: query the index for the current inputs. Hydration of
  // the answer happens here (caller rows) or in the windowed effect below.
  // -------------------------------------------------------------------------
  useEffect(() => {
    rowsRef.current = rows;

    const runKey = searchKey(query, kind, category);
    const runSignature = `${runKey}::${indexState}::${facetState}::${
      windowed ? "window" : rows === null ? "no-rows" : "rows"
    }::${attempt}`;
    if (lastRunRef.current === runSignature) return;
    lastRunRef.current = runSignature;

    // A passive, unfiltered visit uses the prerendered first page. A query,
    // kind/category filter, or an explicit "Show more" request uses the index.
    if (trimmedQuery === "" && !windowed) {
      setSearching(false);
      setSettledKey(runKey);
      return;
    }

    // Browsing by type/category needs no text index: facets already contain
    // the complete curated row order and the two row-aligned filter columns.
    // This keeps an MCP deep link to a small facet file plus visible shards.
    if (browseOnly) {
      if (facetState !== "ready" || !facetsRef.current) {
        setSearching(facetState !== "error");
        if (facetState === "error") setError(true);
        setSettledKey(null);
        return;
      }
      const indices = filterSearchIndices(
        facetsRef.current.browseOrder,
        facetsRef.current,
        { kind, category },
        { rankBrowse: true },
      );
      matchesRef.current = {
        key: runKey,
        indices: uniqueMatchIndices(indices, duplicateGroupsRef.current),
      };
      setMatchRun((n) => n + 1);
      return;
    }

    if (
      needsFacets &&
      facetState !== "ready" &&
      indexState === "ready"
    ) {
      setSearching(facetState !== "error");
      if (facetState === "error") setError(true);
      setSettledKey(null);
      return;
    }

    if (indexState === "idle" || indexState === "loading") {
      // Keep whatever is on screen and say searching; this effect re-runs when
      // the index settles.
      setSearching(true);
      setSettledKey(null);
      return;
    }

    if (indexState === "ready") {
      if (!windowed && rows === null) {
        setSearching(true);
        setSettledKey(null);
        return;
      }
      const worker = workerRef.current;
      if (worker) {
        const id = requestIdRef.current + 1;
        requestIdRef.current = id;
        inflightKeyRef.current = runKey;
        pendingFiltersRef.current = { kind, category, rankBrowse: trimmedQuery === "" };
        setSearching(true);
        setSettledKey(null);

        const timer = window.setTimeout(() => {
          try {
            worker.postMessage({
              type: "search",
              id,
              query,
            } satisfies WorkerInboundMessage);
          } catch {
            indexStateRef.current = "error";
            setIndexState("error");
          }
        }, DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
      }

      // Same index, queried on this thread.
      const decoded = indexRef.current;
      const indices = decoded ? querySearchIndex(decoded, query) : [];
      if (windowed) {
        const filteredIndices = facetsRef.current
          ? filterSearchIndices(
              indices,
              facetsRef.current,
              { kind, category },
              { rankBrowse: trimmedQuery === "" },
            )
          : indices;
        matchesRef.current = {
          key: runKey,
          indices: uniqueMatchIndices(filteredIndices, duplicateGroupsRef.current),
        };
        setMatchRun((n) => n + 1);
        return;
      }
      const next: Listing[] = [];
      for (const index of indices) {
        const row = rows?.[index];
        if (row && matchesFilters(row, kind, category)) next.push(row);
      }
      setIndexedResults(next);
      setTotalMatches(next.length);
      setSearching(false);
      setSettledKey(runKey);
      return;
    }

    // indexState === "error": the index could not be fetched or decoded.
    // Best-effort with the one matcher over the rows we hold. The display
    // projection caps summaries at a display-visible length, so a token that
    // appears only beyond the cap is missed here; the index path cannot miss
    // it. Reported rather than hidden because this path is a degradation, not
    // the search. A windowed caller holds no rows, so it loads the full
    // projection first — the same fallback, with the same cost it always had.
    if (windowed) {
      setSearching(true);
      setSettledKey(null);
      let alive = true;
      loadCatalog()
        .then((full) => {
          if (!alive) return;
          setRows(full);
          const next = full.filter(
            (row) =>
              matchesFilters(row, kind, category) &&
              (trimmedQuery === "" || matchesQuery(row, query)),
          );
          setIndexedResults(next);
          setTotalMatches(next.length);
          setSearching(false);
          setSettledKey(runKey);
        })
        .catch(() => {
          if (!alive) return;
          setError(true);
          setSearching(false);
        });
      return () => {
        alive = false;
      };
    }
    const next = (rows ?? EMPTY_LISTINGS).filter(
      (row) => matchesFilters(row, kind, category) && matchesQuery(row, query)
    );
    setIndexedResults(next);
    setTotalMatches(next.length);
    setSearching(false);
    setSettledKey(runKey);
  }, [
    rowsInput,
    browseOnly,
    query,
    kind,
    category,
    indexState,
    facetState,
    needsSearch,
    needsFacets,
    rows,
    trimmedQuery,
    windowed,
    attempt,
  ]);

  // -------------------------------------------------------------------------
  // Windowed hydration: fetch only the shards that hold the results about to
  // be rendered. Re-runs when the window grows, and falls back to the full
  // projection (then every match) if the shards cannot be read, so a transport
  // failure costs speed, never the answer.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!windowed) return;
    const runKey = searchKey(query, kind, category);
    const match = matchesRef.current;
    if (!match || match.key !== runKey) return;

    let alive = true;
    setSearching(true);
    setSettledKey(null);

    const wanted = match.indices.slice(0, windowSize);
    if (wanted.length === 0) {
      setIndexedResults(EMPTY_LISTINGS);
      setTotalMatches(0);
      setSearching(false);
      setSettledKey(runKey);
      return;
    }
    hydrateDisplayRows(
      wanted,
      indexRowCount || expectedRowCount || facetsRef.current?.rowCount || 0,
      searchShardUrl,
    )
      .then((next) => {
        if (!alive) return;
        setIndexedResults(next);
        setTotalMatches(match.indices.length);
        setSearching(false);
        setSettledKey(runKey);
      })
      .catch(() => {
        loadCatalog()
          .then((full) => {
            if (!alive) return;
            setRows(full);
            const next: Listing[] = [];
            for (const index of match.indices) {
              const row = full[index];
              if (row) next.push(row);
            }
            setIndexedResults(next);
            setTotalMatches(next.length);
            setSearching(false);
            setSettledKey(runKey);
          })
          .catch(() => {
            if (!alive) return;
            setError(true);
            setSearching(false);
          });
      });
    return () => {
      alive = false;
    };
  }, [windowed, matchRun, windowSize, query, kind, category, indexRowCount, expectedRowCount, attempt]);

  const retry = useCallback(() => {
    setError(false);
    if (indexStateRef.current === "error") {
      indexStateRef.current = "idle";
      setIndexState("idle");
    }
    if (facetState === "error") {
      facetRequestRef.current = false;
      setFacetState("idle");
    }
    setAttempt((n) => n + 1);
  }, [facetState]);

  // The browse path is a pure function of the rows and the filters, so it is
  // computed during render: a filter change renders the right rows on the
  // first frame instead of one stale frame followed by an effect.
  const browseRows = rows ?? (rowsInput.length > 0 ? rowsInput : null);
  const browseResults = useMemo(
    () => (browseRows ? filterRows(browseRows, kind, category) : EMPTY_LISTINGS),
    [browseRows, kind, category]
  );

  const isBrowse = trimmedQuery === "" && !windowed;
  // "Settled" means the first result window has been measured and hydrated,
  // while the passive route remains complete from its prerendered page.
  const measured = windowed
    ? (browseOnly || indexState === "ready") && (!needsFacets || facetState === "ready")
    : isBrowse
      ? browseRows !== null && browseRows.length > 0
      : indexState === "ready"
        ? indexRowCount > 0
        : indexState === "error"
          ? rows !== null && rows.length > 0
          : false;

  return {
    results: isBrowse ? browseResults : indexedResults,
    totalMatches: isBrowse ? browseResults.length : totalMatches,
    requestMore,
    error,
    retry,
    searching: isBrowse ? false : searching,
    settled: isBrowse ? measured : settledKey === key && measured,
    windowed,
  };
}
