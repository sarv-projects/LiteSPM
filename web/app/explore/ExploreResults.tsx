"use client";

import React from "react";
import { RotateCw } from "lucide-react";
import { ExtensionGrid } from "../../components/catalog/ExtensionGrid";
import type { Listing } from "../../lib/telemetry";
import { formatCount } from "../../lib/format";
import { CURATED_NOTE, DEFAULT_SORT, type SortMode } from "../../lib/catalog";

/**
 * Explore's result list: the heading, the measured count, the sort control and
 * the rows.
 *
 * It is its own file because the count and the sort are the two things a
 * reader checks first, and they belong to the list rather than to the filter
 * panel that produced them. The strings are the ones the view rendered before
 * the split; only the placement changed.
 */

export const SORTS: Array<{ id: SortMode; label: string }> = [
  // "Best match" is the order the search itself produces: the field the query
  // matched in (exact name, name prefix, a name word, publisher, slug,
  // summary/tools, catalog id), then installability, publisher-manifest
  // verified, and the upstream official-skills classification. "Curated first"
  // stays the browse default and stays selectable during a search; its rule is
  // stated under the filter row whenever it is the active order.
  //
  // Every option says what it does. "Curated first" and "Catalog order" were
  // two names that appeared nowhere else on the page, so a reader could not
  // tell what the control would do to the list.
  { id: "relevance", label: "Best match" },
  { id: DEFAULT_SORT, label: "Recommended order" },
  { id: "installable", label: "Installable first" },
  { id: "name", label: "Name A–Z" },
  { id: "publisher", label: "Publisher A–Z" },
  { id: "index", label: "Catalog order" },
];

/**
 * What each order does, in one sentence, stated under the filter row whenever
 * that order is the active one. The curated rule is the site's own note
 * (`CURATED_NOTE`), so the browse default reads exactly as it always did.
 */
export const SORT_NOTES: Record<SortMode, string> = {
  relevance:
    "Ranks results by relevance to your search terms.",
  curated: CURATED_NOTE,
  installable:
    "Shows available LiteSPM installations before discovery-only listings.",
  name: "Sorts capabilities alphabetically by name.",
  publisher: "Sorts by publisher, then package name.",
  index:
    "Uses the order of the published catalog.",
};

/**
 * The full row set is being fetched for a search or filter. The grid cannot
 * render yet — and must not print a count, because there is no measurement to
 * print. (It used to fall back to the catalog total here, which read as
 * "search returned everything" on a page that had not searched anything yet.)
 */
export function ExploreSearchSkeleton() {
  return (
    <section className="shell pb-16">
      <p className="sr-only" role="status">
        Searching the catalog…
      </p>
      <ul aria-hidden="true" className="pt-px">
        {Array.from({ length: 8 }).map((_, i) => (
          <li
            key={i}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule bg-surface py-3 pr-3"
          >
            <span className="self-stretch rounded-[1px] bg-rule" style={{ width: 3 }} />
            <span className="h-7 w-7 shrink-0 rounded-[6px] border border-rule bg-sunken-2" />
            <span className="min-w-0 flex-1 basis-[60%]">
              <span className="block h-3.5 w-2/5 animate-pulse bg-sunken-2" />
              <span className="mt-2 block h-2.5 w-2/3 animate-pulse bg-sunken" />
              <span className="mt-2 block h-2.5 w-1/3 animate-pulse bg-sunken" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The row-set fetch failed before any count existed; say so, offer a retry. */
export function ExploreLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="shell pb-16">
      <div className="border-b border-rule py-14">
        <div className="flex max-w-prose flex-col items-start gap-3">
          <RotateCw className="h-6 w-6 text-ink-3" aria-hidden="true" />
          <h3 className="text-[15px] font-semibold">The catalog could not be loaded</h3>
          <p className="text-[13px] text-ink-2">
            The full catalog didn&rsquo;t load, so search and filtering are unavailable right now.
          </p>
          <button type="button" onClick={onRetry} className="btn btn-solid mt-2">
            Try again
          </button>
        </div>
      </div>
    </section>
  );
}

export interface ExploreResultsProps {
  items: Listing[];
  query: string;
  heading: string;
  count: number;
  loading: boolean;
  awaiting: boolean;
  error: boolean;
  onRetry: () => void;
  onShowMore: () => void;
  onClearFilters: () => void;
  onSuggestion: (term: string) => void;
  filtersActive: boolean;
  settled: boolean;
  /** The sort actually applied, and the control that changes it. */
  effectiveSort: SortMode;
  setSort: (sort: SortMode) => void;
}

export function ExploreResults(props: ExploreResultsProps) {
  const {
    items,
    query,
    heading,
    count,
    loading,
    awaiting,
    error,
    onRetry,
    onShowMore,
    onClearFilters,
    onSuggestion,
    filtersActive,
    settled,
    effectiveSort,
    setSort,
  } = props;

  return (
    <ExtensionGrid
      items={items}
      query={query}
      heading={heading}
      count={count}
      loading={loading}
      awaiting={awaiting}
      error={error}
      onRetry={onRetry}
      onShowMore={onShowMore}
      onClearFilters={onClearFilters}
      onSuggestion={onSuggestion}
      filtersActive={filtersActive}
      settled={settled}
      toolbar={
        // `min-w-0`: the sort control is a flex item, and a select's intrinsic
        // width is its longest option — 273 px of "Best match — by where the
        // query matched" — which at 320 px pushed the page 5 px sideways. It
        // may shrink; the option text clips.
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <label htmlFor="explore-sort" className="t-mono text-[11px] text-ink-3">
            Sort
          </label>
          <select
            id="explore-sort"
            name="sort"
            value={effectiveSort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            title={
              effectiveSort === "curated"
                ? CURATED_NOTE
                : "Best match orders by where the query matched."
            }
            className="field py-0! text-[12px]"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      }
    />
  );
}
