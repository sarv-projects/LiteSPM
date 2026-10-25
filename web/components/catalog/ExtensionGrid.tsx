"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SearchX, RotateCw } from "lucide-react";
import { ExtensionCard } from "./ExtensionCard";
import { Listing } from "../../lib/telemetry";
import { GRID_PAGE } from "../../lib/catalog";
import { formatCount } from "../../lib/format";

interface ExtensionGridProps {
  items: Listing[];
  query: string;
  /** Reset paging when the applied search or filter identity changes. */
  resultKey?: string;
  /**
   * The grid's heading, when the caller knows what the row set is (Explore
   * names the applied filter: "Plugins", "Works with Zed", …). Falls back to
   * the query form, then to the unfiltered default.
   */
  heading?: string;
  /**
   * Entry count for the header line. The prerendered view starts with one page
   * of rows, so `items.length` would say "48 entries" over a catalog of tens of
   * thousands; the caller passes the authoritative count instead.
   */
  count?: number;
  loading?: boolean;
  /**
   * Result data or the next display window is being fetched. Distinct from
   * `loading`: the empty state must not flash "Nothing matches" before the
   * request has settled.
   */
  awaiting?: boolean;
  /** The dataset fetch failed — say so instead of implying "no matches". */
  error?: boolean;
  onRetry?: () => void;
  onClearFilters?: () => void;
  /**
   * Fired by "Show more". The next display shards are fetched only after the
   * reader asks to see another window of results.
   */
  onShowMore?: () => void;
  /**
   * Fired when the reader picks one of the empty-state suggestions. When the
   * caller does not pass it the suggestions are not rendered at all: the same
   * chip shape is a link in the hero, so a chip here that did nothing would be
   * read as broken rather than as absent.
   */
  onSuggestion?: (term: string) => void;
  /** True when a kind, category, agent or provenance filter narrows the list. */
  filtersActive?: boolean;
  /**
   * Whether the current query has been measured (see `useCatalogSearch`).
   *
   * The header count is a measurement, and there is a real window in which it
   * has not happened yet: the search runs off-thread, and `count` arrives as
   * `0` because nothing has been searched — not because nothing matched. The
   * same contract as `SearchBar`: when this is explicitly `false` the count
   * reads "searching…" instead of printing a figure. A row set already on
   * screen is kept as-is while a search runs; with nothing on screen,
   * `settled === false` also renders loading instead of the empty state,
   * which would be a claim that the search found nothing before any search
   * had happened.
   */
  settled?: boolean;
  /** Rendered above the rows; the caller owns the sort control. */
  toolbar?: React.ReactNode;
}

const SUGGESTIONS = ["postgres", "github", "playwright", "browser", "memory", "docx"];

/**
 * The row-set request failed. Never dressed up as "no matches": a failed
 * request and an empty result are different facts, and telling a reader the
 * catalog has nothing for them when it could not be read at all would be a
 * lie the UI is in a position to avoid. `inline` is the variant shown above
 * rows that are still on screen (a failed "show more"), the other replaces an
 * empty result set (a failed filter).
 */
function CatalogError({ onRetry, inline }: { onRetry?: () => void; inline?: boolean }) {
  return (
    <div className={inline ? "mb-4 border border-rule-2 bg-sunken px-4 py-3" : "border-b border-rule py-14"}>
      <div className="flex max-w-prose flex-col items-start gap-3">
        <RotateCw className="h-6 w-6 text-ink-3" aria-hidden="true" />
        <h3 className="text-[15px] font-semibold">The catalog could not be loaded</h3>
        <p className="text-[13px] text-ink-2">
          {inline
            ? "More results could not be loaded. The packages already shown are still available."
            : "The catalog could not be loaded. Try again in a moment."}
        </p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn btn-solid mt-2">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function ExtensionGrid({
  items,
  query,
  resultKey,
  heading,
  count,
  loading,
  awaiting,
  error,
  onRetry,
  onClearFilters,
  onShowMore,
  onSuggestion,
  filtersActive,
  settled,
  toolbar,
}: ExtensionGridProps) {
  const [visible, setVisible] = useState(GRID_PAGE);

  // One page of rows per query. Deliberately NOT reset when `items` changes:
  // the first change is the lazy dataset upgrade (the rows a reader asked for
  // arriving), and sending them back to 48 rows after they clicked "Show more"
  // would throw away the click that triggered it.
  useEffect(() => {
    setVisible(GRID_PAGE);
  }, [query, resultKey]);

  // With rows on screen, a slow search keeps them (a fast search must never
  // flash a loading state) until the results replace them. With nothing on
  // screen there is nothing to keep: `settled === false` already says the
  // query is unmeasured, and this timer is the fallback for a caller that does
  // not pass `settled` and has only `loading` to go on.
  const [searchSkeleton, setSearchSkeleton] = useState(false);
  useEffect(() => {
    if (!loading) {
      setSearchSkeleton(false);
      return;
    }
    const t = window.setTimeout(() => setSearchSkeleton(true), 180);
    return () => window.clearTimeout(t);
  }, [loading]);

  const reported = count ?? items.length;
  const shown = useMemo(() => items.slice(0, visible), [items, visible]);
  const remaining = reported - shown.length;

  /**
   * Until the full row set arrives, `items` is a window of `reported` — the
   * prerendered page, or the previous query's rows. Growing `visible` past the
   * end of that array cannot put a row on screen, so "Show more" must not
   * pretend it did: while the fetch it triggers is in flight the button says
   * what is happening instead of offering the same page again.
   */
  const rowsPending = items.length < reported;
  const loadingMore = rowsPending && Boolean(awaiting);
  /**
   * Nothing on screen and the current query unmeasured: show the loading rows,
   * not "Nothing matches". The empty state is a claim about a search, and it
   * may only appear once that search has actually run.
   */
  const showSkeleton =
    shown.length === 0 && !error && (settled === false || Boolean(awaiting) || searchSkeleton);
  const showMore = () => {
    setVisible((v) => v + GRID_PAGE);
    onShowMore?.();
  };

  return (
    <section className="shell pb-16">
      <div className="section-head sticky top-[var(--stack-top)] z-20 -mx-px bg-paper/95 px-px backdrop-blur-xs">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2>
            {heading ?? (query ? `Results for “${query}”` : "All capabilities")}
          </h2>
          <span
            className="t-mono t-tabular text-[12px] text-ink-3"
            aria-live="polite"
            data-testid="result-count"
          >
            {error
              ? "Could not load results"
              : settled === false
                ? "searching…"
                : `${formatCount(reported)} ${reported === 1 ? "listing" : "listings"}`}
          </span>
        </div>
        {toolbar}
      </div>

      {/* A failed fetch is reported beside the rows it left untouched, not
          silently swallowed: an inert "Show more" would be a failure the reader
          has no way to diagnose. */}
      {error && shown.length > 0 && <CatalogError onRetry={onRetry} inline />}

      {shown.length > 0 ? (
        <>
          <div className="market-results-grid" role="list">
            {shown.map((item) => (
              <ExtensionCard key={item.id} item={item} />
            ))}
          </div>

          {remaining > 0 && (
            <div className="flex items-center justify-center gap-3 pt-6">
              {/* aria-disabled rather than `disabled`: the reader who just
                  clicked this keeps their focus while the fetch runs, and the
                  label change is announced instead of being cut off by the
                  browser dropping focus to the body. */}
              <button
                type="button"
                onClick={loadingMore ? undefined : showMore}
                aria-disabled={loadingMore || undefined}
                className={`btn market-more-button${loadingMore ? " pointer-events-none opacity-60" : ""}`}
              >
                {loadingMore
                  ? "Loading more results…"
                  : `Show ${formatCount(Math.min(GRID_PAGE, remaining))} more`}
              </button>
              <span className="t-mono t-tabular text-[11px] text-ink-3">
                {formatCount(shown.length)} of {formatCount(reported)}
              </span>
            </div>
          )}
        </>
      ) : error ? (
        <CatalogError onRetry={onRetry} />
      ) : showSkeleton ? (
        <div className="market-results-grid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="market-result-skeleton">
              <span className="market-skeleton-mark animate-pulse" />
              <span className="market-skeleton-title animate-pulse" />
              <span className="market-skeleton-line animate-pulse" />
              <span className="market-skeleton-line short animate-pulse" />
              <span className="market-skeleton-footer animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="market-empty-panel">
          <div className="flex max-w-prose flex-col items-start gap-3">
            <SearchX className="h-6 w-6 text-ink-3" aria-hidden="true" />
            <h3 className="text-[15px] font-semibold">Nothing matches</h3>
            <p className="text-[13px] text-ink-2">
              {query ? (
                <>
                  No entry matches “{query}”{filtersActive ? " with the current filters" : ""}. We
                  match the <em>start</em> of each word, so a misspelling finds nothing — check the
                  spelling and try the first part of the name.
                </>
              ) : (
                <>No entry matches these filters. Try a wider kind or goal, or another agent.</>
              )}
            </p>

            {query && onSuggestion && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[12px] text-ink-3">Try</span>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => onSuggestion(s)} className="chip">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {onClearFilters && (
              <button type="button" onClick={onClearFilters} className="btn btn-solid mt-2">
                Clear search and filters
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
