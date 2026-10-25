"use client";

import React from "react";
import { ExtensionGrid } from "../../components/catalog/ExtensionGrid";
import type { Listing } from "../../lib/telemetry";
import { DEFAULT_SORT, type SortMode } from "../../lib/catalog";

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
  { id: DEFAULT_SORT, label: "Recommended" },
  { id: "installable", label: "Installable first" },
  { id: "name", label: "Name A–Z" },
  { id: "publisher", label: "Publisher A–Z" },
  { id: "index", label: "Original order" },
];

export interface ExploreResultsProps {
  items: Listing[];
  query: string;
  resultKey: string;
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
    resultKey,
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
      resultKey={resultKey}
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
