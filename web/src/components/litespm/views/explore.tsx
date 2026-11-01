"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  GitCompareArrows,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useApp, exploreHash, type ExploreQuery, type SortKey } from "@/lib/litespm/router";
import { useDebounced, useWatchlist } from "@/lib/litespm/hooks";
import { formatFull, displayPackageName } from "@/lib/litespm/format";
import type { CatalogListResponse } from "@/lib/litespm/types";
import { PackageCard } from "../package-card";
import { FilterPill } from "../primitives";
import { RankExplainer } from "../rank-badge";

const KIND_FACETS = [
  { id: "mcp", label: "MCP servers" },
  { id: "skill", label: "Skills" },
  { id: "plugin", label: "Plugins" },
];

const INSTALLABILITY_FACETS: Array<{ id: string; label: string }> = [
  { id: "metadata_verified", label: "Metadata verified" },
  { id: "runtime_verified", label: "Runtime verified" },
  { id: "litespm_tested", label: "LiteSPM tested" },
  { id: "discovery_only", label: "Discovery only" },
];

const GOAL_LABELS: Record<string, string> = {
  coding: "Coding & Development",
  web: "Websites & Design",
  data: "Data & Analytics",
  research: "Research & Learning",
  productivity: "Productivity & Workflow",
  automation: "Testing & Automation",
  infrastructure: "Cloud & Infrastructure",
  security: "Security & Identity",
  business: "Business & Finance",
  communication: "Communication & Social",
  media: "Media & Content",
  other: "Other",
};

export function ExploreView({ query }: { query: ExploreQuery }) {
  const navigate = useApp((s) => s.navigate);
  const [searchText, setSearchText] = React.useState(query.q ?? "");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const debouncedSearch = useDebounced(searchText, 350);

  const [data, setData] = React.useState<CatalogListResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const requestId = React.useRef(0);

  // Sync the text input when the route changes externally (palette, links,
  // browser history). When the user typed, the debounced effect below is what
  // writes the route, so this only fires on true external changes.
  React.useEffect(() => {
    setSearchText(query.q ?? "");
  }, [query.q]);

  // Push the debounced search box into the route — the route is the single
  // source of truth the fetch reads.
  React.useEffect(() => {
    if (debouncedSearch === (query.q ?? "")) return;
    const next: ExploreQuery = { ...query, q: debouncedSearch || undefined, page: 1 };
    if (!debouncedSearch) delete next.q;
    navigate(exploreHash(next));
  }, [debouncedSearch, navigate, query]);

  React.useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.kind) params.set("kind", query.kind);
    if (query.goal) params.set("goal", query.goal);
    if (query.category) params.set("category", query.category);
    if (query.publisher) params.set("publisher", query.publisher);
    if (query.installability) params.set("installability", query.installability);
    if (query.transport) params.set("transport", query.transport);
    if (query.host) params.set("host", query.host);
    if (query.installable) params.set("installable", query.installable);
    if (query.sort) params.set("sort", query.sort);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", "24");

    fetch(`/api/litespm/list?${params.toString()}`)
      .then((r) => r.json())
      .then((response: CatalogListResponse) => {
        if (id === requestId.current) setData(response);
      })
      .catch(() => {})
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [query]);

  const setParam = React.useCallback(
    (key: keyof ExploreQuery, value?: string | number) => {
      const next: ExploreQuery = { ...query, page: 1 };
      if (key === "q") {
        setSearchText(typeof value === "string" ? value : "");
        if (!value) delete next.q;
        else next.q = String(value);
      } else if (value === undefined || value === "" || next[key] === value) {
        delete next[key as string];
      } else {
        (next as Record<string, unknown>)[key as string] = value;
      }
      navigate(exploreHash(next));
    },
    [navigate, query],
  );

  const toggleParam = React.useCallback(
    (key: keyof ExploreQuery, value: string) => {
      setParam(key, query[key] === value ? undefined : value);
    },
    [query, setParam],
  );

  const activeCount =
    (query.kind ? 1 : 0) +
    (query.goal ? 1 : 0) +
    (query.category ? 1 : 0) +
    (query.publisher ? 1 : 0) +
    (query.installability ? 1 : 0) +
    (query.transport ? 1 : 0) +
    (query.host ? 1 : 0) +
    (query.installable ? 1 : 0);

  const facets = data?.facets;
  const page = data?.page ?? 1;
  const pageCount = data?.pageCount ?? 1;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {/* Header row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
            The catalog
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight sm:text-[30px]">
            {query.q ? (
              <>
                Results for <span className="text-brand">“{query.q}”</span>
              </>
            ) : query.host ? (
              <>
                Packages for <span className="text-brand">{query.host}</span>
              </>
            ) : (
              "Explore every capability"
            )}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {loading && !data
              ? "Searching the catalog…"
              : data
                ? `${formatFull(data.total)} listing${data.total === 1 ? "" : "s"} · page ${page} of ${formatFull(pageCount)} · duplicate re-publications collapsed per page`
                : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg lg:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <span className="ml-1 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-foreground">
                {activeCount}
              </span>
            )}
          </Button>
          <Select
            value={query.sort ?? (query.q ? "relevance" : "rank")}
            onValueChange={(v) => setParam("sort", v === "rank" && !query.q ? undefined : (v as SortKey))}
          >
            <SelectTrigger className="h-9 w-[160px] rounded-lg text-[12.5px]" aria-label="Sort">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rank">
                <span className="inline-flex items-center gap-1.5">
                  Top ranked <RankExplainer />
                </span>
              </SelectItem>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="name">Name A→Z</SelectItem>
              <SelectItem value="kind">Kind</SelectItem>
              <SelectItem value="publisher">Publisher</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search */}
      <div className="mt-5 flex gap-2">
        <label className="relative flex h-11 flex-1 items-center gap-2.5 rounded-xl border border-border/80 bg-card px-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Search the catalog</span>
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search the catalog — name, publisher, summary, command…"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
          />
          {searchText && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setParam("q", "")}
              className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
      </div>

      {/* Quick facets */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <FilterPill
          active={Boolean(query.installable)}
          onClick={() => setParam("installable", query.installable ? undefined : "1")}
          title="Only listings litespm install can complete"
        >
          Installable only
        </FilterPill>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
        {KIND_FACETS.map((kind) => (
          <FilterPill
            key={kind.id}
            active={query.kind === kind.id}
            onClick={() => toggleParam("kind", kind.id)}
            count={facets?.kinds.find(([k]) => k === kind.id)?.[1]}
          >
            {kind.label}
          </FilterPill>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Facet sidebar */}
        <aside
          className={cn(
            "space-y-6 lg:block",
            filtersOpen ? "block" : "hidden",
          )}
          aria-label="Filters"
        >
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => navigate(exploreHash({}))}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline"
            >
              <X className="h-3.5 w-3.5" /> Clear all {activeCount} filter{activeCount === 1 ? "" : "s"}
            </button>
          )}

          <FacetGroup title="Goal" hint="LiteSPM's editorial grouping by task">
            {(facets?.goals ?? []).slice(0, 12).map((goal) => (
              <FilterPill
                key={goal.id}
                active={query.goal === goal.id}
                onClick={() => toggleParam("goal", goal.id)}
                count={goal.count}
                title={goal.label}
              >
                {GOAL_LABELS[goal.id] ?? goal.label}
              </FilterPill>
            ))}
          </FacetGroup>

          <FacetGroup title="Host" hint="Only hosts this entry can be configured for">
            {(facets?.hosts ?? []).slice(0, 14).map(([name, count]) => (
              <FilterPill
                key={name}
                active={query.host === name}
                onClick={() => toggleParam("host", name)}
                count={count}
              >
                {name}
              </FilterPill>
            ))}
          </FacetGroup>

          <FacetGroup title="Category" hint="Publisher-assigned category">
            {(facets?.categories ?? []).slice(0, 12).map(([name, count]) => (
              <FilterPill
                key={name}
                active={query.category === name}
                onClick={() => toggleParam("category", name)}
                count={count}
              >
                {name}
              </FilterPill>
            ))}
          </FacetGroup>

          <FacetGroup title="Installability" hint="Readiness for single-command setup">
            {(facets?.installability ?? []).map(([name, count]) => (
              <FilterPill
                key={name}
                active={query.installability === name}
                onClick={() => toggleParam("installability", name)}
                count={count}
              >
                {INSTALLABILITY_FACETS.find((f) => f.id === name)?.label ?? name}
              </FilterPill>
            ))}
          </FacetGroup>

          <FacetGroup title="Transport" hint="How the MCP server is reached">
            {(facets?.transports ?? []).slice(0, 8).map(([name, count]) => (
              <FilterPill
                key={name}
                active={query.transport === name}
                onClick={() => toggleParam("transport", name)}
                count={count}
              >
                {name}
              </FilterPill>
            ))}
          </FacetGroup>

          <FacetGroup title="Publisher" hint="Largest first">
            {(facets?.publishers ?? []).slice(0, 12).map(([name, count]) => (
              <FilterPill
                key={name}
                active={query.publisher === name}
                onClick={() => toggleParam("publisher", name)}
                count={count}
              >
                {name}
              </FilterPill>
            ))}
          </FacetGroup>
        </aside>

        {/* Results */}
        <div>
          {loading && !data ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[196px] animate-pulse rounded-xl border border-border/50 bg-muted/30"
                />
              ))}
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", loading && "opacity-60")}>
                {data.items.map((hit, i) => (
                  <PackageCard key={hit.id} hit={hit} index={i} />
                ))}
              </div>

              {/* Pagination */}
              {pageCount > 1 && (
                <nav
                  className="mt-8 flex items-center justify-center gap-2"
                  aria-label="Pagination"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-lg"
                    disabled={page <= 1}
                    onClick={() => setParam("page", page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <span className="px-2 font-mono text-[12.5px] text-muted-foreground">
                    {formatFull(page)} / {formatFull(pageCount)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-lg"
                    disabled={page >= pageCount}
                    onClick={() => setParam("page", page + 1)}
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </nav>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 p-12 text-center">
              <p className="text-[15px] font-medium">No listings match these filters.</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Try removing a filter, or search for something broader.
              </p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => {
                  setSearchText("");
                  navigate(exploreHash({}));
                }}
              >
                Reset everything
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FacetGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const count = React.Children.count(children);
  if (count === 0) return null;
  return (
    <div>
      <p className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
          {title}
        </span>
        {hint && (
          <span className="text-[10px] text-muted-foreground/60" title={hint}>
            ⓘ
          </span>
        )}
      </p>
      <div className="mt-2.5 flex max-h-72 flex-wrap gap-1.5 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}

/** Small helper used by the compare tray hint on the empty state. */
export function CompareHint() {
  return (
    <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
      <GitCompareArrows className="h-3.5 w-3.5 text-brand" />
      Stage packages with the compare icon on any card to compare them side by side.
    </p>
  );
}
