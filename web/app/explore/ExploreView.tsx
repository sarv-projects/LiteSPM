"use client";

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Header } from "../../components/navigation/Header";
import { SearchBar } from "../../components/navigation/SearchBar";
import { ExtensionGrid } from "../../components/catalog/ExtensionGrid";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { Listing } from "../../lib/telemetry";
import { useCatalogSearch } from "../../lib/useCatalogSearch";
import { useCatalog } from "../../lib/catalogData";
import {
  agentFacets,
  categoryFacets,
  deriveKindCounts,
  hostUniverse,
  kindLabel,
  matchesHost,
  sortListings,
  DEFAULT_SORT,
  SortMode,
} from "../../lib/catalog";
import { formatCount } from "../../lib/format";
import { AGENT_STORAGE_KEY, findAgentChoice } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";

const KINDS = ["all", "mcp", "skill", "plugin"] as const;
const SORTS: Array<{ id: SortMode; label: string }> = [
  // Default first: this is what a visitor who touches nothing sees, and it is
  // the only order that reflects whether the row can actually be installed.
  { id: DEFAULT_SORT, label: "Installable first" },
  { id: "name", label: "Name" },
  { id: "publisher", label: "Publisher" },
  // The release artifact's own order, kept as an explicit choice rather than
  // the silent default it used to be.
  { id: "index", label: "Catalog order" },
];

const KINDS_SET = new Set<string>(["all", "mcp", "skill", "plugin"]);
const SORTS_SET = new Set<string>(SORTS.map((s) => s.id));

/**
 * Facets and the first page of rows are computed at build time by
 * `app/explore/page.tsx` (a Server Component) and arrive as props, so the
 * prerendered HTML — and hydration — carry no dataset. The full rows are
 * fetched only when a filter, a sort or a search is actually used; until then
 * the page is complete, not a skeleton waiting on 3.8 MB.
 */
export interface ExploreViewProps {
  total: number;
  /** Per-kind totals for the kind rail, counted at build time — not fetched. */
  kindCounts: { all: number; mcp: number; skill: number; plugin: number };
  categories: Array<{ name: string; count: number }>;
  agents: Array<{ name: string; slug: string; count: number }>;
  hostCount: number;
  gridRows: Listing[];
}

/**
 * Filters are seeded from the query string after mount rather than through
 * `useSearchParams`. Reading search params during render would opt this route
 * out of static prerendering, and the whole point of the build is that the
 * catalog ships as HTML. The trade-off is one frame of the unfiltered state on
 * a deep link, which is cheaper than an empty page.
 *
 * A deep link that carries a filter is also the moment the full row set is
 * requested: the reader asked for a filtered view, so the fetch is not idle
 * speculation.
 */
function useQueryFilters(request: () => void) {
  const [filters, setFilters] = useState({
    query: "",
    kind: "all",
    category: "all",
    agent: "all",
    verifiedOnly: false,
    sort: DEFAULT_SORT,
  });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const sort = p.get("sort") ?? "";
    const next = {
      query: p.get("q") ?? "",
      kind: KINDS_SET.has(p.get("kind") ?? "") ? (p.get("kind") as string) : "all",
      category: p.get("category") ?? "",
      agent: p.get("host") ?? "",
      verifiedOnly: p.get("verified") === "1",
      sort: SORTS_SET.has(sort) ? (sort as SortMode) : DEFAULT_SORT,
    };
    const seeded =
      next.query !== "" ||
      next.kind !== "all" ||
      next.category !== "" ||
      next.agent !== "" ||
      next.verifiedOnly ||
      next.sort !== DEFAULT_SORT;
    setFilters({
      query: next.query,
      kind: next.kind,
      category: next.category || "all",
      agent: next.agent || "all",
      verifiedOnly: next.verifiedOnly,
      sort: next.sort,
    });
    if (seeded) request();
  }, [request]);

  return [filters, setFilters] as const;
}

function ExploreContent(props: ExploreViewProps) {
  const { status, items: full, request } = useCatalog();
  const [filters, setFilters] = useQueryFilters(request);
  const { query, kind, category, agent, verifiedOnly, sort } = filters;

  /**
   * `?focus=search` is what the header's search affordance deep-links to. It
   * focuses the field and does NOT seed the dataset request: focusing a box is
   * not a reason to download 3.8 MB, and the first keystroke already is.
   */
  const [focusSearch, setFocusSearch] = useState(false);

  /**
   * The agent chosen on the home page.
   *
   * Home and the product page both remember it; Explore ignored it entirely, so
   * a reader who picked Codex and then opened Explore saw every host again with
   * no sign their choice existed. Offered rather than applied: silently
   * narrowing a result list is worse than not narrowing it, so this renders a
   * line the reader can act on or dismiss.
   */
  const [savedAgent, setSavedAgent] = useState<AgentChoice | null>(null);
  const [savedDismissed, setSavedDismissed] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("host")) return;
    try {
      const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
      if (stored) setSavedAgent(findAgentChoice(stored));
    } catch {
      /* storage can be unavailable (private mode, policy) */
    }
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("focus") === "search") setFocusSearch(true);
  }, []);

  const setQuery = (q: string) => {
    request();
    setFilters((f) => ({ ...f, query: q }));
  };
  const setKind = (k: string) => {
    request();
    setFilters((f) => ({ ...f, kind: k }));
  };
  const setCategory = (c: string) => {
    request();
    setFilters((f) => ({ ...f, category: c }));
  };
  const setAgent = (a: string) => {
    request();
    setFilters((f) => ({ ...f, agent: a }));
  };
  const setVerifiedOnly = (v: boolean) => {
    request();
    setFilters((f) => ({ ...f, verifiedOnly: v }));
  };
  const setSort = (s: SortMode) => {
    request();
    setFilters((f) => ({ ...f, sort: s }));
  };

  const deferredQuery = useDeferredValue(query);

  const live = useMemo(() => {
    if (!full) return null;
    return {
      total: full.length,
      kindCounts: deriveKindCounts(full),
      categories: categoryFacets(full, 200),
      agents: agentFacets(full),
      hostCount: hostUniverse(full).length,
    };
  }, [full]);

  const total = live ? live.total : props.total;
  const kindCounts = live ? live.kindCounts : props.kindCounts;
  const categories = live ? live.categories : props.categories;
  const agents = live ? live.agents : props.agents;
  const hostCount = live ? live.hostCount : props.hostCount;

  const { results, searching, settled } = useCatalogSearch(full ?? [], deferredQuery, {
    kind: kind === "all" ? null : kind,
    category: category === "all" ? null : category,
  });

  const filtered = useMemo(() => {
    const scoped = results.filter((item) => {
      if (agent !== "all" && !matchesHost(item, agent)) return false;
      if (verifiedOnly && !item.publisher?.verified) return false;
      return true;
    });
    return sortListings(scoped, sort);
  }, [results, agent, verifiedOnly, sort]);

  const hasFilters =
    query !== "" || kind !== "all" || category !== "all" || agent !== "all" || verifiedOnly || sort !== DEFAULT_SORT;

  /**
   * Only offered when it would actually do something: no filter is set yet, the
   * reader has not dismissed it, and the remembered agent names a host this
   * catalog's own facet list carries — a preference for a host no row declares
   * would filter to an empty page and read as a broken link.
   */
  const savedTarget = savedAgent && !savedDismissed && !hasFilters
    ? savedAgent.hosts.find((h) => agents.some((a) => a.name === h)) ?? null
    : null;

  // Same rule as Home: rows from the prerender until the dataset lands, an
  // empty set (skeleton) for a filter that has nothing to run against yet.
  const gridItems = full ? filtered : hasFilters ? [] : props.gridRows;

  const clear = () => {
    setQuery("");
    setKind("all");
    setCategory("all");
    setAgent("all");
    setVerifiedOnly(false);
    setSort(DEFAULT_SORT);
  };

  return (
    <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
      <Header
        onSearchClick={() => {
          document.querySelector<HTMLInputElement>('main input[type="search"]')?.focus();
        }}
      />

      <main id="main" className="flex-1">
        <div className="shell pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-[24px] font-semibold tracking-tight text-ink">Explore</h1>
            <p className="t-mono text-[11px] text-ink-3">
              {total.toLocaleString("en-US")} entries · {categories.length} categories ·{" "}
              {hostCount} hosts
            </p>
          </div>

          {savedTarget && savedAgent && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-rule bg-sunken px-4 py-3">
              <p className="text-[13px] text-ink-2">
                You picked <strong className="font-medium text-ink">{savedAgent.label}</strong> on
                the home page.
              </p>
              <button
                type="button"
                className="btn h-7 text-[11.5px]!"
                onClick={() => setFilters((f) => ({ ...f, agent: savedTarget }))}
              >
                Show only what works with {savedAgent.label}
              </button>
              <button
                type="button"
                className="touch-link text-[12px] text-ink-3 hover:text-ink-2"
                onClick={() => setSavedDismissed(true)}
              >
                Not now
              </button>
            </div>
          )}

          <div className="mt-4 max-w-2xl">
            <SearchBar
              query={query}
              setQuery={setQuery}
              totalMatches={deferredQuery && full ? filtered.length : undefined}
              settled={settled}
              totalCount={total}
              autoFocusOnMount={focusSearch}
            />
          </div>

          {/* Filters are a single ruled row. Kind is segmented; category and
              agent are selects because 63 and 9 options do not fit as chips. */}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-rule py-3">
            <div
              className="flex items-center gap-0.5 border border-ink-3 bg-sunken p-0.5"
              role="group"
              aria-label="Capability kind"
            >
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={`flex min-h-[44px] items-center gap-1.5 rounded-[3px] px-2.5 text-[12px] font-medium transition-colors duration-state ease-out md:h-9 md:min-h-0 ${
                    kind === k ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {k !== "all" && (
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-[3px] rounded-[1px]"
                      style={{ backgroundColor: kind === k ? "currentColor" : `var(--${k})` }}
                    />
                  )}
                  {k === "all" ? "All types" : kindLabel(k)}
                  {/* Counts are whole-catalog figures, exactly like the
                      Category and Works with selects below — never "matching
                      your filters", which would take a per-filter derivation
                      this rail does not have. Hidden under md: four counts
                      make this rail wider than a phone, and the labels are
                      what the control is for. */}
                  <span
                    className={`t-mono t-tabular hidden text-[11px] md:inline ${
                      kind === k ? "text-surface/75" : "text-ink-3"
                    }`}
                  >
                    {formatCount(kindCounts[k])}
                  </span>
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-[12px] text-ink-2">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="field"
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.count})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-[12px] text-ink-2">
              Works with
              <select value={agent} onChange={(e) => setAgent(e.target.value)} className="field">
                <option value="all">Any agent</option>
                {agents.map((a) => (
                  <option key={a.slug} value={a.name}>
                    {a.name} ({a.count})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-h-[44px] items-center gap-2 text-[12px] text-ink-2 md:min-h-0">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-ink"
              />
              Vendor-listed publishers only
            </label>

            {hasFilters && (
              <button type="button" onClick={clear} className="btn ml-auto">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="pt-7">
          <ExtensionGrid
            items={gridItems}
            query={deferredQuery}
            count={full ? filtered.length : total}
            loading={searching}
            awaiting={status === "loading"}
            error={status === "error"}
            onRetry={request}
            onShowMore={request}
            onClearFilters={clear}

            toolbar={
              <div className="flex shrink-0 items-center gap-2">
                <label htmlFor="explore-sort" className="t-mono text-[11px] text-ink-3">
                  Sort
                </label>
                <select
                  id="explore-sort"
                  value={sort}
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
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default function ExplorePage(props: ExploreViewProps) {
  return <ExploreContent {...props} />;
}
