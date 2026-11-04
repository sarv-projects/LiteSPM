"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  BookOpen,
  Command as CommandIcon,
  FilePlus2,
  GitCompareArrows,
  Home,
  LayoutGrid,
  Loader2,
  Package,
  Search,
  Users,
} from "lucide-react";

import { useApp, exploreHash } from "@/lib/litespm/router";
import { useDebounced } from "@/lib/litespm/hooks";
import { displayPackageName } from "@/lib/litespm/format";
import type { CatalogListResponse } from "@/lib/litespm/types";
import { KindBadge } from "./primitives";

/** Tags whose focused element owns "/" as a character, not a shortcut. */
const TEXT_FIELD_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

const PAGES = [
  { label: "Home", hash: "/", icon: Home, hint: "Landing page" },
  { label: "Explore the catalog", hash: "/explore", icon: LayoutGrid, hint: "Search 69k listings" },
  { label: "Agents directory", hash: "/agents", icon: Users, hint: "50 agent hosts" },
  { label: "Insights dashboard", hash: "/insights", icon: BarChart3, hint: "Catalog analytics" },
  { label: "Compare packages", hash: "/compare", icon: GitCompareArrows, hint: "Side by side" },
  { label: "Docs — getting started", hash: "/docs/getting-started", icon: BookOpen, hint: "Quickstart" },
  { label: "Publish a listing", hash: "/publish", icon: FilePlus2, hint: "Get listed" },
];

function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 100;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;

  // Subsequence match: query chars in sequence
  let qIdx = 0;
  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
    if (t[tIdx] === q[qIdx]) qIdx++;
  }
  if (qIdx === q.length) return 40;

  // Word-level prefix or 1-typo tolerance
  if (q.length >= 3) {
    const words = t.split(/[\s—-]+/);
    for (const w of words) {
      if (w.startsWith(q.slice(0, 3))) return 30;
      if (Math.abs(w.length - q.length) <= 1) {
        let diff = 0;
        for (let i = 0, j = 0; i < q.length && j < w.length; ) {
          if (q[i] !== w[j]) {
            diff++;
            if (diff > 1) break;
            if (q.length > w.length) i++;
            else if (w.length > q.length) j++;
            else { i++; j++; }
          } else {
            i++;
            j++;
          }
        }
        if (diff <= 1) return 25;
      }
    }
  }

  return 0;
}

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const setPalette = useApp((s) => s.setPalette);
  const navigate = useApp((s) => s.navigate);
  const [mounted, setMounted] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CatalogListResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const debounced = useDebounced(query, 250);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = React.useState(0);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      try {
        if (e.key === "Escape") setPalette(false);
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          setPalette(!open);
        }
        // "/" opens search from anywhere except a text field.
        if (
          e.key === "/" &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          !TEXT_FIELD_TAGS.includes((e.target as HTMLElement)?.tagName ?? "")
        ) {
          e.preventDefault();
          setPalette(true);
        }
      } catch {
        /* a shortcut must never break the page */
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setPalette]);

  React.useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/litespm/list?q=${encodeURIComponent(q)}&pageSize=8&sort=relevance`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CatalogListResponse | null) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const options = React.useMemo(() => {
    const scoredPages = PAGES.map((p) => {
      const labelScore = fuzzyScore(query, p.label);
      const hintScore = fuzzyScore(query, p.hint);
      return { page: p, score: Math.max(labelScore, hintScore) };
    })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.page);

    const items = results?.items ?? [];
    return { pages: scoredPages, items };
  }, [results, query]);

  const total = options.pages.length + options.items.length;

  const choose = React.useCallback(
    (index: number) => {
      if (index < options.pages.length) {
        navigate(options.pages[index].hash);
      } else {
        const hit = options.items[index - options.pages.length];
        if (hit) navigate(`/package/${encodeURIComponent(hit.linkKey)}`);
      }
      setPalette(false);
    },
    [navigate, options, setPalette],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (total === 0 ? 0 : (c + 1) % total));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (total === 0 ? 0 : (c - 1 + total) % total));
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(cursor);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, total, cursor, choose]);

  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setPalette(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border/60 px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder="Search packages, or jump to a page…"
            className="h-12 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/70"
            aria-label="Search"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
          <kbd className="rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2" role="listbox">
          {options.pages.length > 0 && (
            <p className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Pages
            </p>
          )}
          {options.pages.map((page, i) => (
            <button
              key={page.label}
              type="button"
              data-index={i}
              role="option"
              aria-selected={cursor === i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${
                cursor === i ? "bg-brand-soft" : ""
              }`}
            >
              <page.icon className={`h-4 w-4 shrink-0 ${cursor === i ? "text-brand" : "text-muted-foreground"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{page.label}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">{page.hint}</span>
              </span>
            </button>
          ))}

          {options.items.length > 0 && (
            <p className="px-2 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {results ? `${results.total.toLocaleString()} matches — top 8` : "Packages"}
            </p>
          )}
          {options.items.map((hit, i) => {
            const index = options.pages.length + i;
            return (
              <button
                key={hit.id}
                type="button"
                data-index={index}
                role="option"
                aria-selected={cursor === index}
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(index)}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${
                  cursor === index ? "bg-brand-soft" : ""
                }`}
              >
                <Package
                  className={`h-4 w-4 shrink-0 ${cursor === index ? "text-brand" : "text-muted-foreground"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium">
                      {displayPackageName(hit.name)}
                    </span>
                    <KindBadge kind={hit.kind} />
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {hit.publisher.name} · {hit.summary || hit.category}
                  </span>
                </span>
              </button>
            );
          })}

          {!loading && query.trim().length >= 2 && options.items.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="text-[13.5px] font-medium">No packages match “{query.trim()}”.</p>
              <button
                type="button"
                onClick={() => {
                  navigate(exploreHash({ q: query.trim() }));
                  setPalette(false);
                }}
                className="mt-2 text-[12.5px] font-medium text-brand hover:underline"
              >
                Open Explore with these filters →
              </button>
            </div>
          )}

          {query.trim().length < 2 && (
            <p className="flex items-center gap-2 px-3 py-3 text-[11.5px] text-muted-foreground">
              <CommandIcon className="h-3.5 w-3.5" />
              Type at least two characters to search the catalog.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
