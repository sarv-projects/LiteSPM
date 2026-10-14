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
// What each path costs on a first search:
//
//   worker     2.7 MiB gzipped index fetched and decoded in the worker, one
//              query over typed arrays (~ms), then the matched rows are
//              hydrated from the display projection the page already holds.
//   fallback   the same index fetched and decoded here (only reachable when
//              `Worker` is unavailable), same query, same hydration.
//   degraded   the index fetch failed: `matchesQuery` over the hydrated rows.
//              Best-effort and documented below — the projection caps display
//              summaries, so a token that appears only beyond the cap is
//              missed here; the index path above cannot miss it.
//
// The row array never crosses a structured clone: the worker fetches its own
// index, and results come back as row indices (4 bytes each) into the
// hydration source the page already has in memory.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Listing } from "./telemetry";
import { matchesQuery } from "./telemetry";
import { loadCatalog, SEARCH_INDEX_URL } from "./catalogData";
import { fetchSearchIndex } from "./searchAssets";
import { querySearchIndex } from "./searchFormat.mjs";
import type { DecodedSearchIndex } from "./searchAssets";
import type { WorkerInboundMessage, WorkerOutboundMessage } from "./search.worker";

export interface CatalogSearchFilters {
  kind?: string | null;
  category?: string | null;
}

export interface CatalogSearchState {
  results: Listing[];
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
 *   the full set; the hook loads the display projection itself otherwise.
 */
export function useCatalogSearch(
  listings: Listing[],
  query: string,
  filters: CatalogSearchFilters
): CatalogSearchState {
  // Normalize every "empty" input to one shared identity: an empty row set is
  // an empty row set, and callers passing `full ?? []` would otherwise hand a
  // brand-new array to the effects below on every render.
  const rowsInput = listings.length === 0 ? EMPTY_LISTINGS : listings;
  const kind = filters.kind ?? null;
  const category = filters.category ?? null;
  const trimmedQuery = query.trim();
  const needsSearch = trimmedQuery !== "" || kind !== null || category !== null;
  const wantsIndex = trimmedQuery !== "";

  /** Results computed by the index paths; the browse path below is derived. */
  const [indexedResults, setIndexedResults] = useState<Listing[]>(EMPTY_LISTINGS);
  const [searching, setSearching] = useState(false);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  /** Index state is mirrored in a ref so the load effect can be guarded
   *  without re-running on every transition. */
  const [indexState, setIndexState] = useState<IndexState>("idle");
  const [indexRowCount, setIndexRowCount] = useState(0);
  const [rows, setRows] = useState<Listing[] | null>(rowsInput.length > 0 ? rowsInput : null);

  const workerRef = useRef<Worker | null>(null);
  const indexRef = useRef<DecodedSearchIndex | null>(null);
  const indexStateRef = useRef<IndexState>("idle");
  const rowsRef = useRef<Listing[] | null>(rows);
  /** The key whose search is in flight, so the worker reply can be attributed. */
  const inflightKeyRef = useRef<string | null>(null);
  /** The filters of the in-flight worker request, applied at reply time. */
  const pendingFiltersRef = useRef<{ kind: string | null; category: string | null }>({
    kind: null,
    category: null,
  });
  const requestIdRef = useRef(0);
  /** The exact inputs of the last effect run, so a re-render with identical
   *  inputs cannot schedule a duplicate search. */
  const lastRunRef = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // Row source.
  //
  // Prefer the caller's rows when it handed over the whole set — they are the
  // same objects this hook would load, and they are already in memory. A
  // caller that passes a slice (length does not match the index) gets the
  // global projection instead, because the index answers globally and
  // hydrating a slice by index would name the wrong rows.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (rowsInput.length > 0 && (indexRowCount === 0 || rowsInput.length === indexRowCount)) {
      setRows(rowsInput);
      return;
    }
    if (!needsSearch) return;
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
  }, [rowsInput, needsSearch, indexRowCount]);

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
  }, [wantsIndex]);

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
  // The search itself, driven by query/filter/index/row changes.
  // -------------------------------------------------------------------------
  useEffect(() => {
    rowsRef.current = rows;

    const key = searchKey(query, kind, category);
    const runSignature = `${key}::${indexState}::${rows === null ? "no-rows" : "rows"}`;
    if (lastRunRef.current === runSignature) return;
    lastRunRef.current = runSignature;

    // The browse path (empty query) is derived during render, not here — see
    // `browseResults` below. Nothing async is involved, so no search state is
    // written except clearing a pending "searching" from a query the reader
    // just cleared.
    if (trimmedQuery === "") {
      setSearching(false);
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
      if (rows === null) {
        setSearching(true);
        setSettledKey(null);
        return;
      }
      const worker = workerRef.current;
      if (worker) {
        const id = requestIdRef.current + 1;
        requestIdRef.current = id;
        inflightKeyRef.current = key;
        pendingFiltersRef.current = { kind, category };
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
      const next: Listing[] = [];
      if (decoded) {
        for (const index of querySearchIndex(decoded, query)) {
          const row = rows[index];
          if (row && matchesFilters(row, kind, category)) next.push(row);
        }
      }
      setIndexedResults(next);
      setSearching(false);
      setSettledKey(key);
      return;
    }

    // indexState === "error": the index could not be fetched or decoded.
    // Best-effort with the one matcher over the rows we hold. The display
    // projection caps summaries at a display-visible length, so a token that
    // appears only beyond the cap is missed here; the index path cannot miss
    // it. Reported rather than hidden because this path is a degradation, not
    // the search.
    setIndexedResults(
      (rows ?? EMPTY_LISTINGS).filter(
        (row) => matchesFilters(row, kind, category) && matchesQuery(row, query)
      )
    );
    setSearching(false);
    setSettledKey(key);
  }, [rowsInput, query, kind, category, indexState, rows, trimmedQuery]);

  // The browse path is a pure function of the rows and the filters, so it is
  // computed during render: a filter change renders the right rows on the
  // first frame instead of one stale frame followed by an effect.
  const browseRows = rows ?? (rowsInput.length > 0 ? rowsInput : null);
  const browseResults = useMemo(
    () => (browseRows ? filterRows(browseRows, kind, category) : EMPTY_LISTINGS),
    [browseRows, kind, category]
  );

  const key = searchKey(query, kind, category);
  const isBrowse = trimmedQuery === "";
  // `settled` must be false when zero rows were measured. For a query that
  // needs the index, "measured" means the index decoded with a non-zero row
  // count; for the browse path it means the rows are actually in hand.
  const measured = isBrowse
    ? browseRows !== null && browseRows.length > 0
    : indexState === "ready"
      ? indexRowCount > 0
      : indexState === "error"
        ? rows !== null && rows.length > 0
        : false;

  return {
    results: isBrowse ? browseResults : indexedResults,
    searching: isBrowse ? false : searching,
    settled: isBrowse ? measured : settledKey === key && measured,
  };
}
