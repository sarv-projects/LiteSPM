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
  /**
   * Entry count for the header line. The prerendered view starts with one page
   * of rows, so `items.length` would say "48 entries" over a catalog of tens of
   * thousands; the caller passes the authoritative count instead.
   */
  count?: number;
  loading?: boolean;
  /**
   * The full row set is being fetched (first search, first filter, first sort).
   * Distinct from `loading`: it starts on the interaction itself, so the empty
   * state must never flash "Nothing matches" before the rows have even been
   * requested.
   */
  awaiting?: boolean;
  /** The dataset fetch failed — say so instead of implying "no matches". */
  error?: boolean;
  onRetry?: () => void;
  onClearFilters?: () => void;
  /**
   * Fired by "Show more". On the prerendered page the browser only holds one
   * page of rows, so this is where the full row set is requested — the reader
   * asked for more, which is the interaction that justifies the fetch.
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
   * Whether the current query has been measured (see `useCatalogSearch`). A
   * row set already on screen is kept as-is while a search runs; with nothing
   * on screen, `settled === false` renders as loading instead of as the empty
   * state, which would be a claim that the search found nothing before any
   * search had happened.
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
            ? "The full catalog didn’t load, so search, filters and “show more” are unavailable right now. The rows below still open."
            : "The full catalog didn’t load, so search and filters are unavailable right now."}
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
  }, [query]);

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
            {query ? `Results for “${query}”` : "All capabilities"}
          </h2>
          <span
            className="t-mono t-tabular text-[12px] text-ink-3"
            aria-live="polite"
            data-testid="result-count"
          >
            {formatCount(reported)} {reported === 1 ? "entry" : "entries"}
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
          <div
            className="t-mono hidden border-b border-rule py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-2 lg:grid lg:grid-cols-[3px_28px_minmax(0,1fr)_200px] lg:items-center lg:gap-x-3"
          >
            <span />
            <span />
            <span>Capability</span>
            <span className="text-right">Availability &amp; source</span>
          </div>

          {shown.map((item) => (
            <ExtensionCard key={item.id} item={item} />
          ))}

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
                className={`btn${loadingMore ? " pointer-events-none opacity-60" : ""}`}
              >
                {loadingMore
                  ? "Loading the catalog…"
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
        <ul className="pt-px" aria-hidden="true">
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
              <span className="flex w-full shrink-0 flex-wrap gap-x-2 gap-y-1 lg:ml-auto lg:w-[200px] lg:flex-col lg:items-end">
                <span className="block h-4 w-24 animate-pulse bg-sunken" />
                <span className="block h-2.5 w-32 animate-pulse bg-sunken" />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-b border-rule py-14">
          <div className="flex max-w-prose flex-col items-start gap-3">
            <SearchX className="h-6 w-6 text-ink-3" aria-hidden="true" />
            <h3 className="text-[15px] font-semibold">Nothing matches</h3>
            <p className="text-[13px] text-ink-2">
              {query ? (
                <>
                  No entry matches “{query}”{filtersActive ? " with the current filters" : ""}.
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
