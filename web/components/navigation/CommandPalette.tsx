"use client";

import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search, X } from "lucide-react";
import { useCatalogSearch } from "../../lib/useCatalogSearch";
import { demoteValidationFixtures, kindLabel, listingHref, sortByCompatibility } from "../../lib/catalog";
import { clamp, formatCount } from "../../lib/format";
import { categoryLabel } from "../../app/categories/categoryLabel";
import {
  PALETTE_AGENTS,
  PALETTE_PAGES,
  clearRecentDestinations,
  localMatches,
  pageSearchFieldIsPresent,
  readRecentDestinations,
  rememberDestination,
  rememberedAgent,
  usePaletteCategories,
} from "../../lib/palette";
import type { PaletteDestination } from "../../lib/palette";
import type { AgentChoice } from "../../lib/landing";

/**
 * The global command palette (LPSM-J009).
 *
 * Three ways in, one way out. ⌘K/Ctrl-K opens it on every route; the header's
 * search control opens it (the control keeps its `/explore/?focus=search` href
 * for the no-JavaScript case, where this component does not exist at all); and
 * on a route with no inline search field, `/` opens it too — where one exists
 * (`SearchBar`: the home hero, Explore) `/` keeps focusing that field, whose
 * `<kbd>/</kbd>` on screen promises exactly that. Escape closes and returns
 * focus to whatever had it.
 *
 * **The dataset does not load on a passive visit.** Nothing here runs a fetch
 * until the palette opens: ⌘K alone asks for one small document (the category
 * facets, `usePaletteCategories`) and the search index plus display shards are
 * requested only by the first keystroke — `useCatalogSearch(…, { windowed:
 * true })`, the same hook, index and matcher Explore uses. Measured: a cold
 * load of `/` that never opens the palette makes zero requests to `/data/`.
 *
 * **Ranking is Explore's ranking**, not a second opinion: the index's match
 * classes and tie-break signals, then the reader's remembered agent as a
 * compatibility preference, then the validation-fixture demotion — the same
 * functions in the same order, so the palette's rows are the head of Explore's
 * order for the same query. The one honest difference is stated where it
 * happens (`ranked` below): the palette hydrates a window, so its tail can end
 * before Explore's does.
 */

interface PaletteRow {
  /** Render key for the row and its `aria-activedescendant` id. */
  key: string;
  label: string;
  detail?: string;
  /** Right-hand metadata: a real count or the row's kind. Never invented. */
  meta?: string;
  metaClassName?: string;
  href?: string;
  action?: "clear-recents";
}

interface PaletteSection {
  id: string;
  title: string;
  /**
   * What this section is showing — including the state of a measurement that
   * has not settled yet. A section that would have to invent a number prints
   * words instead ("searching…"), and one that failed says so rather than
   * rendering as empty.
   */
  note?: string;
  rows: PaletteRow[];
}

/** Rows a section shows before it stops and says how many it is not showing. */
const MAX_CAPABILITIES = 6;
const MAX_AGENTS = 6;
const MAX_CATEGORIES = 8;

function isEditableTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node || typeof node.tagName !== "string") return false;
  return (
    node.tagName === "INPUT" ||
    node.tagName === "TEXTAREA" ||
    node.tagName === "SELECT" ||
    node.isContentEditable === true
  );
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Focused on close when the element that opened the palette is gone. */
  returnFocusRef: React.RefObject<HTMLElement | null>;
}

export function CommandPalette({ open, onOpenChange, returnFocusRef }: CommandPaletteProps) {
  const router = useRouter();
  const baseId = useId();
  const listboxId = `${baseId}-list`;
  const inputId = `${baseId}-input`;

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<PaletteDestination[]>([]);
  const [agent, setAgent] = useState<AgentChoice | null>(null);

  const deferredQuery = useDeferredValue(query);
  const categories = usePaletteCategories(open);

  const { results, totalMatches, error, searching, settled } = useCatalogSearch(
    [],
    deferredQuery,
    { kind: null, category: null },
    { windowed: true }
  );

  /**
   * The ranked rows, built exactly the way Explore builds its list:
   *
   *   1. the index order (`results` — match classes, then the row's own
   *      signals), which both surfaces inherit from `useCatalogSearch`;
   *   2. `sortByCompatibility` over the remembered agent — Explore's ranking
   *      preference, applied here so a reader who chose "Codex" gets the same
   *      leading rows in both places;
   *   3. `demoteValidationFixtures` last, so a format-check row cannot ride a
   *      compatibility badge back to the top.
   *
   * The window is 48 rows (`SEARCH_RESULT_WINDOW`) and the preference is
   * applied to it, where Explore applies it to its whole result list. The two
   * therefore agree from the first row down to the last compatible row inside
   * that window; past it — fewer than six compatible matches in the first 48 —
   * the palette's tail is drawn from the window while Explore's continues.
   * That is the only ordering difference, it needs a remembered agent *and* a
   * sparse window to appear, and it is stated rather than hidden.
   */
  const ranked = useMemo(() => {
    if (deferredQuery.trim() === "") return [];
    const preferred = sortByCompatibility(results, agent?.hosts ?? null);
    return demoteValidationFixtures(preferred);
  }, [results, deferredQuery, agent]);

  const q = query.trim();

  const sections = useMemo<PaletteSection[]>(() => {
    const out: PaletteSection[] = [];

    if (q === "") {
      if (recents.length > 0) {
        out.push({
          id: "recent",
          title: "Recent",
          rows: [
            ...recents.map((recent) => ({
              key: `recent:${recent.href}`,
              label: recent.label,
              detail: recent.detail,
              href: recent.href,
            })),
            {
              key: "recent:clear",
              label: "Clear recent destinations",
              detail: "Forgets this list; it is stored in this browser only",
              action: "clear-recents" as const,
            },
          ],
        });
      }
    } else {
      const capabilityRows: PaletteRow[] = ranked.slice(0, MAX_CAPABILITIES).map((item) => ({
        key: `capability:${item.linkKey ?? item.id}`,
        label: item.name,
        detail: clamp(item.summary, 96),
        meta: kindLabel(item.kind),
        metaClassName: `text-${item.kind}`,
        href: listingHref(item),
      }));

      // The section's note carries the measurement's state, never a guess:
      // `settled` is `useCatalogSearch` saying these results are for this
      // query, and until it is true the count is simply not known.
      const note = error
        ? "the catalog search could not be loaded — this is not a “no matches” answer"
        : !settled
          ? "searching…"
          : totalMatches === 0
            ? "no capability matches this query"
            : `${formatCount(totalMatches)} match${totalMatches === 1 ? "" : "es"} · showing the first ${formatCount(capabilityRows.length)}`;

      const exploreQuery = encodeURIComponent(q);
      out.push({
        id: "capabilities",
        title: "Capabilities",
        note,
        rows: [
          ...capabilityRows,
          {
            key: "capability:explore",
            label:
              settled && !error && totalMatches > 0
                ? `See all ${formatCount(totalMatches)} matches in Explore`
                : `Search Explore for “${q}”`,
            detail: "The catalog's own search surface, with the full filter set",
            href: `/explore/?q=${exploreQuery}`,
          },
        ],
      });
    }

    const agentMatches = localMatches(q, PALETTE_AGENTS, (entry) => entry);
    if (agentMatches.length > 0) {
      const shown = agentMatches.slice(0, MAX_AGENTS);
      out.push({
        id: "agents",
        title: "Agent hosts",
        note:
          shown.length < agentMatches.length
            ? `showing ${formatCount(shown.length)} of ${formatCount(agentMatches.length)}${q === "" ? " — type to narrow" : ""}`
            : `${formatCount(agentMatches.length)} adapter${agentMatches.length === 1 ? "" : "s"}`,
        rows: shown.map((entry) => ({
          key: entry.key,
          label: entry.label,
          detail: entry.detail,
          href: entry.href,
        })),
      });
    }

    if (categories.status === "ready") {
      const matched = localMatches(q, categories.categories, (category) => ({
        label: categoryLabel(category.name),
        terms: category.name,
      }));
      if (matched.length > 0) {
        const shown = matched.slice(0, MAX_CATEGORIES);
        out.push({
          id: "categories",
          title: "Categories",
          note:
            shown.length < matched.length
              ? `showing ${formatCount(shown.length)} of ${formatCount(matched.length)}${q === "" ? ", by entry count" : ""}`
              : `${formatCount(matched.length)} source ${matched.length === 1 ? "category" : "categories"}`,
          rows: shown.map((category) => ({
            key: `category:${category.name}`,
            label: categoryLabel(category.name),
            detail: category.name === categoryLabel(category.name) ? undefined : category.name,
            meta: `${formatCount(category.count)} entries`,
            href: `/explore/?category=${encodeURIComponent(category.name)}`,
          })),
        });
      }
    } else if (categories.status === "error") {
      out.push({
        id: "categories",
        title: "Categories",
        note: "the category list could not be loaded",
        rows: [],
      });
    } else if (categories.status === "loading" && q === "") {
      out.push({ id: "categories", title: "Categories", note: "loading…", rows: [] });
    }

    const pageMatches = localMatches(q, PALETTE_PAGES, (entry) => entry);
    if (pageMatches.length > 0) {
      out.push({
        id: "pages",
        title: "Docs & pages",
        rows: pageMatches.map((entry) => ({
          key: entry.key,
          label: entry.label,
          detail: entry.detail,
          href: entry.href,
        })),
      });
    }

    return out;
  }, [q, recents, ranked, categories, error, settled, totalMatches]);

  const flatRows = useMemo(() => sections.flatMap((section) => section.rows), [sections]);
  /** Row key → its index in the flattened list (the activation cursor). */
  const rowIndex = useMemo(() => {
    const map = new Map<string, number>();
    flatRows.forEach((row, index) => map.set(row.key, index));
    return map;
  }, [flatRows]);
  const activeIndexInList = flatRows.length === 0 ? -1 : Math.min(activeIndex, flatRows.length - 1);
  const activeRow = activeIndexInList === -1 ? null : flatRows[activeIndexInList];
  const activeRowId = activeIndexInList === -1 ? undefined : `${baseId}-option-${activeIndexInList}`;

  const activate = useCallback(
    (row: PaletteRow) => {
      if (row.action === "clear-recents") {
        clearRecentDestinations();
        setRecents([]);
        setActiveIndex(0);
        return;
      }
      if (!row.href) return;
      rememberDestination({ key: row.key, label: row.label, detail: row.detail, href: row.href });
      // Close before navigating: the dialog's cleanup returns focus to the
      // header control, and a focus ring left behind in a mounted dialog would
      // be stranded on the abandoned route.
      onOpenChange(false);
      router.push(row.href);
    },
    [onOpenChange, router]
  );

  // --------------------------------------------------------------------------
  // Opening: from anywhere with ⌘K/Ctrl-K, and with `/` where no inline search
  // field owns that key (`lib/palette.ts` states the registry).
  // --------------------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const commandKey = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k";
      if (commandKey) {
        event.preventDefault();
        onOpenChange(!open);
        return;
      }
      if (open) return;
      if (event.key === "/" && !isEditableTarget(event.target) && !pageSearchFieldIsPresent()) {
        event.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // Opening captures the focused element (the opener) and reads the local
  // state; closing hands focus back to that element — or to the header control
  // when the opener no longer exists. `wasOpenRef` is what keeps the first
  // mount (open = false) from stealing focus on a cold load.
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setAgent(rememberedAgent());
      setRecents(readRecentDestinations());
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && opener.isConnected) opener.focus();
    else returnFocusRef.current?.focus();
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [open]);

  // A fresh query starts at the first row.
  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [open, query]);

  // The dialog is modal, so the page behind it does not scroll. Compensating
  // for the scrollbar the lock removes keeps the header and the rows from
  // shifting sideways the moment it opens.
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open]);

  // Keep the active row on screen while the cursor walks a long list.
  useEffect(() => {
    if (!open || !activeRowId) return;
    document.getElementById(activeRowId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeRowId]);

  const onScrimMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onOpenChange(false);
  };

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      return;
    }

    if (event.key === "Tab") {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
      ).filter((node) => node.offsetParent !== null || node === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !focusable.includes(current as HTMLElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (flatRows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((activeIndexInList + 1) % flatRows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((activeIndexInList - 1 + flatRows.length) % flatRows.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(flatRows.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeRow) activate(activeRow);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(11,14,20,0.5)] px-3 pt-[8vh] sm:px-4 sm:pt-[12vh]"
      onMouseDown={onScrimMouseDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onDialogKeyDown}
        className="flex max-h-[80vh] w-full max-w-[660px] flex-col overflow-hidden rounded-panel border border-rule-2 bg-surface shadow-[var(--shadow-panel)]"
      >
        <div className="flex items-center gap-2 border-b border-rule px-3">
          <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={activeRowId}
            aria-autocomplete="list"
            aria-label="Search capabilities, agents, categories and pages"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search capabilities, agents, categories and pages"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-hidden placeholder:text-ink-3"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="btn btn-icon shrink-0"
            aria-label="Close the command palette"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/*
          One listbox, one group per section. The input keeps DOM focus and
          points at the active option with `aria-activedescendant` (the
          combobox pattern), so arrow keys walk the rows without a second tab
          stop and `Tab` stays inside the dialog.
        */}
        <div
          role="listbox"
          id={listboxId}
          aria-label="Palette results"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
        >
          {sections.map((section) => (
            <div key={section.id} role="group" aria-labelledby={`${baseId}-section-${section.id}`}>
              <div
                id={`${baseId}-section-${section.id}`}
                className="flex items-baseline justify-between gap-3 px-3 pb-1 pt-2.5"
              >
                <span className="t-mono text-[10px] uppercase tracking-wider text-ink-3">
                  {section.title}
                </span>
                {section.note && (
                  <span className="t-mono t-tabular truncate text-right text-[10.5px] text-ink-3">
                    {section.note}
                  </span>
                )}
              </div>

              {section.rows.map((row) => {
                const index = rowIndex.get(row.key) ?? 0;
                const isActive = row === activeRow;
                return (
                  <div
                    key={row.key}
                    id={`${baseId}-option-${index}`}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => activate(row)}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-3 border-l-2 px-3 py-2 transition-colors duration-state ease-out md:min-h-[40px] ${
                      isActive
                        ? "border-accent bg-sunken text-ink"
                        : "border-transparent text-ink-2 hover:bg-hover"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">
                        {row.label}
                      </span>
                      {row.detail && (
                        <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                          {row.detail}
                        </span>
                      )}
                    </span>
                    {row.meta && (
                      <span className={`t-mono shrink-0 text-[10.5px] ${row.metaClassName ?? "text-ink-3"}`}>
                        {row.meta}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* The count lives in one polite region, updated once per settled
            search — the section notes are not live, so nothing is announced
            twice and no number is read before it exists. */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {q === ""
            ? "Command palette open"
            : error
              ? "The catalog search could not be loaded."
              : settled
                ? `${formatCount(totalMatches)} capabilit${totalMatches === 1 ? "y" : "ies"} match this query.`
                : "Searching the catalog…"}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-rule px-3 py-2">
          <span className="flex items-center gap-3 text-[11px] text-ink-3">
            <span className="flex items-center gap-1">
              <kbd className="t-mono border border-rule bg-sunken px-1 text-[10px]">↑</kbd>
              <kbd className="t-mono border border-rule bg-sunken px-1 text-[10px]">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="t-mono border border-rule bg-sunken px-1 text-[10px]">esc</kbd>
              close
            </span>
          </span>
          <span className="hidden text-[11px] text-ink-3 sm:inline">
            Ctrl/⌘ K from anywhere
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
