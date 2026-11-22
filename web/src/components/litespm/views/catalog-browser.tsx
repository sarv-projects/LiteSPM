"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  Database,
  Filter,
  GitCompareArrows,
  Github,
  Globe,
  Search,
  SlidersHorizontal,
  Terminal,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useApp,
  exploreHash,
  type ExploreQuery,
  type MarketplaceTab,
  type SortKey,
} from "@/lib/litespm/router";
import { useDebounced } from "@/lib/litespm/hooks";
import DEFAULT_FACETS from "@/lib/litespm/default-facets.json";
import { formatFull } from "@/lib/litespm/format";
import type { CatalogFacets, CatalogListResponse } from "@/lib/litespm/types";
import { NavLink } from "../nav-link";
import { PackageCard } from "../package-card";
import { FilterPill } from "../primitives";
import { RankExplainer } from "../rank-badge";

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

const TAB_NOUN: Record<MarketplaceTab, string> = {
  all: "the catalog",
  trending: "trending capabilities",
  mcp: "MCP servers",
  skills: "skills",
  plugins: "plugins",
  installed: "the catalog",
};

function paramsFor(query: ExploreQuery): URLSearchParams {
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
  return params;
}

const CATALOG_QUERY_CACHE = new Map<string, CatalogListResponse>();
const FACET_CACHE = new Map<string, CatalogFacets>([
  ["", DEFAULT_FACETS as unknown as CatalogFacets],
]);

/**
 * The one catalog surface behind `/marketplace`. Every keystroke becomes a
 * server-side query for ONE page (24 cards, ~20 KB); the client never holds
 * the catalog. Results and facet counts are fetched independently so cards
 * paint without waiting for the sidebar.
 */
export function CatalogBrowser({ query, tab }: { query: ExploreQuery; tab: MarketplaceTab }) {
  const navigate = useApp((s) => s.navigate);
  const [searchText, setSearchText] = React.useState(query.q ?? "");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const debouncedSearch = useDebounced(searchText, 300);
  // What this component last wrote to the route. Without it, the route echo of
  // an older keystroke overwrote text the user had typed in the meantime.
  const lastPushed = React.useRef(query.q ?? "");

  const initialFacetKey = paramsFor(query).toString();
  const [data, setData] = React.useState<CatalogListResponse | null>(null);
  const [facets, setFacets] = React.useState<CatalogFacets | null>(() => {
    return FACET_CACHE.get(initialFacetKey) ?? (initialFacetKey === "" ? (DEFAULT_FACETS as unknown as CatalogFacets) : null);
  });
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [retry, setRetry] = React.useState(0);

  // External route changes (palette, assistant links, browser history).
  React.useEffect(() => {
    if ((query.q ?? "") !== lastPushed.current) {
      lastPushed.current = query.q ?? "";
      setSearchText(query.q ?? "");
    }
  }, [query.q]);

  // Debounced typing -> route (replace, so Back leaves the page).
  React.useEffect(() => {
    const committed = debouncedSearch.trim();
    if (committed === (query.q ?? "")) return;
    lastPushed.current = committed;
    const next: ExploreQuery = { ...query, q: committed || undefined, page: 1 };
    if (!committed) delete next.q;
    navigate(exploreHash(next, tab), { replace: true });
  }, [debouncedSearch, navigate, query, tab]);

  // Results: one page for the current route with instant in-memory cache.
  React.useEffect(() => {
    const controller = new AbortController();
    const params = paramsFor(query);
    if (query.sort) params.set("sort", query.sort);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", "24");
    params.set("facets", "0");
    const cacheKey = params.toString();

    // Instant paint from cache if available (0ms transition)
    const cached = CATALOG_QUERY_CACHE.get(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setFailed(false);

    fetch(`/api/litespm/list?${cacheKey}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CatalogListResponse>;
      })
      .then((response) => {
        CATALOG_QUERY_CACHE.set(cacheKey, response);
        setData(response);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return;
        if (!cached) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [query, retry]);

  // Facet counts depend on the filters and search, not on page or sort.
  const facetKey = paramsFor(query).toString();
  React.useEffect(() => {
    const cachedFacets = FACET_CACHE.get(facetKey);
    if (cachedFacets) {
      setFacets(cachedFacets);
      if (facetKey === "") return; // Skip network round-trip when pre-computed static facets are present!
    }
    const controller = new AbortController();
    const params = new URLSearchParams(facetKey);
    params.set("facets", "only");
    fetch(`/api/litespm/list?${params.toString()}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CatalogListResponse>) : null))
      .then((response) => {
        if (response?.facets) {
          FACET_CACHE.set(facetKey, response.facets);
          setFacets(response.facets);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [facetKey, retry]);

  const setParam = React.useCallback(
    (key: keyof ExploreQuery, value?: string | number) => {
      const next: ExploreQuery = { ...query, page: 1 };
      if (key === "q") {
        setSearchText(typeof value === "string" ? value : "");
        lastPushed.current = typeof value === "string" ? value : "";
        if (!value) delete next.q;
        else next.q = String(value);
      } else if (value === undefined || value === "" || next[key] === value) {
        delete next[key as string];
      } else {
        (next as Record<string, unknown>)[key as string] = value;
      }
      navigate(exploreHash(next, tab));
    },
    [navigate, query, tab],
  );

  const toggleParam = React.useCallback(
    (key: keyof ExploreQuery, value: string) => {
      setParam(key, query[key] === value ? undefined : value);
    },
    [query, setParam],
  );

  const clearFilters = React.useCallback(() => {
    // Filters only: the tab (kind) and the search the person typed stay.
    navigate(exploreHash({ q: query.q, kind: query.kind }, tab));
  }, [navigate, query.q, query.kind, tab]);

  const activeCount =
    (query.goal ? 1 : 0) +
    (query.category ? 1 : 0) +
    (query.publisher ? 1 : 0) +
    (query.installability ? 1 : 0) +
    (query.transport ? 1 : 0) +
    (query.host ? 1 : 0) +
    (query.installable ? 1 : 0);

  const page = data?.page ?? 1;
  const pageCount = data?.pageCount ?? 1;
  const isUnfiltered =
    !query.q &&
    !query.goal &&
    !query.category &&
    !query.publisher &&
    !query.installability &&
    !query.transport &&
    !query.host &&
    !query.installable;

  const status = failed
    ? "The catalog could not be searched."
    : loading && !data
      ? "Searching the catalog…"
      : data
        ? `${formatFull(data.total)} distinct tool${data.total === 1 ? "" : "s"}${
            isUnfiltered && tab === "all"
              ? ` (from ${formatFull(data.uniqueListings ?? 69311)} unique catalog listings)`
              : ""
          }${query.q ? ` for “${query.q}”` : ""} · page ${formatFull(page)} of ${formatFull(pageCount)}`
        : "";

  return (
    <div>
      {/* Task-oriented search suggestions */}
      <div className="mb-4 w-full max-w-full overflow-hidden">
        <div className="flex w-full max-w-full items-center gap-2 overflow-x-auto pb-1 text-[12.5px] no-scrollbar sm:flex-wrap sm:overflow-visible sm:pb-0">
          <span className="shrink-0 text-muted-foreground font-medium text-[12px]">What do you want your agent to do?</span>
          {[
            { label: "GitHub & Issues", q: "github", Icon: Github },
            { label: "Web Browsing & Scraping", q: "browser puppeteer", Icon: Globe },
            { label: "Database & SQL", q: "postgres sqlite sql", Icon: Database },
            { label: "Cloud & Containers", q: "docker kubernetes aws", Icon: Cloud },
            { label: "Terminal & Scripts", q: "bash python shell", Icon: Terminal },
          ].map((task) => (
            <button
              key={task.q}
              type="button"
              onClick={() => setParam("q", task.q)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors hover:border-brand/50 hover:bg-muted/40",
                query.q === task.q
                  ? "border-brand bg-brand-soft text-brand font-semibold"
                  : "border-border/70 bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <task.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{task.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search + sort */}
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
        <label className="relative flex h-11 min-w-0 w-full sm:w-auto sm:min-w-[14rem] flex-1 items-center gap-2.5 rounded-xl border border-border/80 bg-card px-3.5 focus-within:border-brand/60">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search {TAB_NOUN[tab]}</span>
          <input
            type="search"
            id="catalog-search-input"
            aria-label={`Search ${TAB_NOUN[tab]}`}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            maxLength={200}
            placeholder={`Search ${TAB_NOUN[tab]} — name, publisher, summary, command…`}
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchText && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setParam("q", "")}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <Button
          variant="outline"
          size="sm"
          className="h-11 rounded-xl lg:hidden"
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
          <SelectTrigger className="h-11 w-[168px] rounded-xl text-[12.5px]" aria-label="Sort">
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

      <div className="mt-3 flex w-full min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <label
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition-colors",
              query.installable
                ? "border-brand/60 bg-brand-soft text-brand"
                : "border-border/80 bg-card text-foreground hover:border-brand/40",
            )}
            title="Only listings that litespm install can complete. Discovery-only listings are hidden."
          >
            <Switch
              checked={Boolean(query.installable)}
              onCheckedChange={(on) => setParam("installable", on ? "1" : undefined)}
              aria-label="Installable only"
            />
            Installable only
          </label>
          {query.host && (
            <FilterPill active onClick={() => setParam("host", undefined)} title="Remove the host filter">
              Host: {query.host} <X className="h-3 w-3" aria-hidden="true" />
            </FilterPill>
          )}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-muted/60 px-2.5 py-1 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              Clear filters ({activeCount})
            </button>
          )}
        </div>
        <p
          className="w-full text-left sm:w-auto sm:text-right text-[12px] text-muted-foreground"
          role="status"
          aria-live="polite"
          title="Listings with the same name from different publishers (or as both an MCP server and a skill) are merged into one result, so this is lower than the number of listings in the catalog."
        >
          {status}
          {data && !failed && (
            <span className="block text-[11px] text-muted-foreground/80">
              (same-name listings from different publishers are merged){" "}
              <NavLink to="/docs/methodology" className="underline underline-offset-2 hover:text-foreground">
                Why?
              </NavLink>
            </span>
          )}
        </p>
      </div>

      <div className="mt-5 grid w-full min-w-0 max-w-full gap-6 lg:grid-cols-[260px_1fr]">
        {/* Facet sidebar */}
        <aside
          className={cn("space-y-6 lg:block", filtersOpen ? "block" : "hidden")}
          aria-label="Filters"
        >
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
        <div aria-busy={loading} className="min-w-0 max-w-full">
          {failed && !data ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-8 text-center">
              <p className="text-[15px] font-medium">The catalog could not be searched.</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Check the connection and try again.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => setRetry((n) => n + 1)}>
                Try again
              </Button>
            </div>
          ) : loading && !data ? (
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
              {failed && (
                <p className="mb-3 text-[12px] text-amber-700 dark:text-amber-400">
                  This page could not be refreshed; showing the previous results.{" "}
                  <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>
                    Retry
                  </button>
                </p>
              )}
              <div
                className={cn(
                  "grid gap-3 transition-opacity sm:grid-cols-2 xl:grid-cols-3",
                  loading && "opacity-60",
                )}
              >
                {data.items.map((hit, i) => (
                  <PackageCard key={hit.id} hit={hit} index={i} />
                ))}
              </div>

              {pageCount > 1 && (
                <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
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
              <p className="text-[15px] font-medium">
                {query.q ? `Nothing in ${TAB_NOUN[tab]} matches “${query.q}”.` : "No listings match these filters."}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Try removing a filter, or search for something broader.
              </p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => {
                  setSearchText("");
                  lastPushed.current = "";
                  navigate(exploreHash({ kind: query.kind }, tab));
                }}
              >
                Reset search and filters
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
          <span className="text-[10px] text-muted-foreground" title={hint}>
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
