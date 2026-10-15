"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { formatCount } from "../../lib/format";

interface SearchBarProps {
  query: string;
  setQuery: (q: string) => void;
  totalMatches?: number;
  totalCount: number;
  /**
   * Whether `totalMatches` was measured for the *current* query.
   *
   * The rows arrive with a lazy fetch and the search runs off-thread, so there
   * is a real window in which `totalMatches` is `0` because nothing has been
   * searched yet — not because nothing matched. Printing that as "0 found"
   * asserts a measurement that was never taken. When this is explicitly
   * `false`, the count reads "searching…" instead. Omitting it preserves the
   * plain count for callers that compute the number some other way.
   */
  settled?: boolean;
  /** Extra classes so the same control can sit in the hero or a filter bar. */
  className?: string;
  autoFocusOnMount?: boolean;
  /**
   * Overrides the count-first placeholder. The landing page asks for intent
   * ("What do you want your AI to do?"); Explore keeps the count-first one,
   * because a reader there already knows they are in a catalog.
   */
  placeholder?: string;
  /** Hint line rendered under the field (hero only). */
  hint?: React.ReactNode;
}

function isEditableTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
}

export function SearchBar({
  query,
  setQuery,
  totalMatches,
  settled,
  totalCount,
  className = "",
  autoFocusOnMount = false,
  placeholder,
  hint,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const [narrow, setNarrow] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (autoFocusOnMount) inputRef.current?.focus();
  }, [autoFocusOnMount]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const typing = isEditableTarget(document.activeElement);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }
      // "/" focuses search only when not already typing somewhere else.
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * Enter takes the query to Explore — the page with the full filter surface —
   * which is what the hero's hint promises. On Explore itself the field
   * already filters as you type, so submitting there only keeps the URL in
   * step (preserving whatever filters a deep link seeded) rather than
   * navigating a second time.
   *
   * The form also carries `action="/explore/" method="get"` and the field a
   * `name`, so the same move works in the one window where JS has not hydrated
   * yet; once hydrated, the submit never reloads the page.
   */
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = query.trim();
    if (window.location.pathname.startsWith("/explore")) {
      const params = new URLSearchParams(window.location.search);
      if (q) params.set("q", q);
      else params.delete("q");
      const rest = params.toString();
      router.replace(rest ? `/explore/?${rest}` : "/explore/");
      return;
    }
    router.push(q ? `/explore/?q=${encodeURIComponent(q)}` : "/explore/");
  };

  const resolvedPlaceholder =
    placeholder ??
    (narrow
      ? `Search ${formatCount(totalCount)} capabilities`
      : `Search ${formatCount(totalCount)} capabilities — postgres, github, playwright…`);

  return (
    <div className={className}>
      <form action="/explore/" method="get" onSubmit={onSubmit}>
        <label htmlFor={labelId} className="sr-only">
          Search the capability catalog by name, summary, publisher, category, runtime, transport,
          tool name or catalog id
        </label>
        {/*
          The search field is the primary control on the site, so it keeps the
          only 2px ink border: the focus indicator never disappears while the
          caret is inside. The brand indigo is the FOCUS RING — an outline around
          the field — rather than a border-colour swap, because swapping to
          #3157f6 against the unfocused #17202f ink would sit at 2.96:1 and the
          ring has to clear 3:1 against the state it replaces. On paper the
          indigo outline is 5.49:1, on the dark surface 3.30:1 against what it
          sits on. 48px tall so the clear button can be a full 44px target.
        */}
        <div className="flex h-12 items-center gap-2 border-2 border-ink bg-surface px-2.5 transition-colors duration-state ease-out focus-within:outline-solid focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <input
            ref={inputRef}
            id={labelId}
            name="q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-describedby={totalMatches !== undefined ? `${labelId}-count` : undefined}
            placeholder={resolvedPlaceholder}
            className="h-full w-full min-w-0 self-stretch bg-transparent text-[14px] text-ink outline-hidden placeholder:text-ink-3"
          />

          {query ? (
            <span className="flex shrink-0 items-center gap-2">
              {totalMatches !== undefined && (
                // No aria-live here on purpose. The results panel below (or
                // Explore's grid) owns the announcement, and two polite regions
                // updating on the same keystroke made a screen reader read the
                // count twice — and on Explore the two disagreed ("searching…"
                // beside "0 entries"). This span is visually adjacent to the
                // input, so it needs no announcement of its own. The `settled`
                // contract still governs what it prints.
                <span id={`${labelId}-count`} className="t-mono t-tabular text-[11px] text-ink-3">
                  {settled === false ? "searching…" : `${formatCount(totalMatches)} found`}
                </span>
              )}
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="btn px-2!">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ) : (
            <kbd className="t-mono hidden shrink-0 border border-rule bg-sunken px-1.5 py-0.5 text-[10px] text-ink-3 sm:block">
              /
            </kbd>
          )}
        </div>
      </form>

      {hint && <div className="mt-2 text-[12px] text-ink-3">{hint}</div>}
    </div>
  );
}
