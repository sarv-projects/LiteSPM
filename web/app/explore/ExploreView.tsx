"use client";

import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "../../components/navigation/Header";
import { SearchBar } from "../../components/navigation/SearchBar";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { Listing } from "../../lib/telemetry";
import { useCatalogSearch } from "../../lib/useCatalogSearch";
import { useCatalog, loadCatalogPublishers } from "../../lib/catalogData";
import type { PublisherCount } from "../../lib/catalogData";
import {
  agentFacets,
  demoteValidationFixtures,
  deriveKindCounts,
  isInstallable,
  kindLabel,
  matchesHost,
  matchesSource,
  sortByCompatibility,
  sortListings,
  DEFAULT_SORT,
  SortMode,
} from "../../lib/catalog";
import type { AgentFacet } from "../../lib/catalog";
import { resolveHostId } from "../../lib/hostIdentity";
import { publisherMatches } from "../../lib/publisherFilter";
import { explainMatch } from "../../lib/searchFormat.mjs";
import { classifyListing, taxonomyFacets } from "../../lib/taxonomy";
import { AGENT_STORAGE_KEY, findAgentChoice, sourceLabel } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";
import { categoryLabel } from "../categories/categoryLabel";
import { ExploreFilters } from "./ExploreFilters";
import {
  ExploreLoadError,
  ExploreResults,
  ExploreSearchSkeleton,
  SORT_NOTES,
} from "./ExploreResults";
import { ExploreWhy } from "./ExploreWhy";

const KINDS_SET = new Set<string>(["all", "mcp", "skill", "plugin"]);

/** The sort values the control accepts. */
const SORTS_SET = new Set<string>(["relevance", "curated", "installable", "index", "name", "publisher"]);

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
  /** The editorial goal facets (`lib/taxonomy`), largest first. */
  goals: Array<{ id: string; label: string; count: number }>;
  /** One facet per host identity (`lib/hostIdentity`), largest first. */
  agents: AgentFacet[];
  /**
   * Every source category, with its count. The whole vocabulary, because
   * `?category=` accepts every one of them and a control that offered a slice
   * would be a control that lied about what it could filter.
   */
  categories: Array<{ name: string; count: number }>;
  /** Every ingest source, with its count and the label the site shows. */
  sources: Array<{ id: string; label: string; count: number }>;
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
 *
 * `urlSortPinned` reports whether the URL named a sort explicitly. An explicit
 * sort is the reader's order and is never second-guessed; the search default
 * (`Best match` while a query is active) applies only when they have not
 * chosen one.
 */
function useQueryFilters(request: () => void) {
  const [filters, setFilters] = useState({
    query: "",
    kind: "all",
    goal: "all",
    category: "all",
    agent: "all",
    publisher: "",
    source: "",
    verifiedOnly: false,
    installableOnly: false,
    sort: DEFAULT_SORT,
  });
  const [urlSortPinned, setUrlSortPinned] = useState(false);
  /**
   * True once the query string has been read and applied. The URL-sync effect
   * below must not run before this: on the first commit `filters` still holds
   * the defaults, and writing those to the address bar would erase the deep
   * link the seeding effect is about to apply.
   */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const sort = p.get("sort") ?? "";
    const next = {
      query: p.get("q") ?? "",
      kind: KINDS_SET.has(p.get("kind") ?? "") ? (p.get("kind") as string) : "all",
      goal: p.get("goal") ?? "",
      category: p.get("category") ?? "",
      agent: p.get("host") ?? "",
      publisher: p.get("publisher") ?? "",
      source: p.get("source") ?? "",
      verifiedOnly: p.get("verified") === "1",
      installableOnly: p.get("installable") === "1",
      sort: SORTS_SET.has(sort) ? (sort as SortMode) : DEFAULT_SORT,
    };
    const seeded =
      next.query !== "" ||
      next.kind !== "all" ||
      next.goal !== "" ||
      next.category !== "" ||
      next.agent !== "" ||
      next.publisher !== "" ||
      next.source !== "" ||
      next.verifiedOnly ||
      next.installableOnly ||
      next.sort !== DEFAULT_SORT;
    setFilters({
      query: next.query,
      kind: next.kind,
      goal: next.goal || "all",
      category: next.category || "all",
      agent: next.agent || "all",
      publisher: next.publisher,
      source: next.source,
      verifiedOnly: next.verifiedOnly,
      installableOnly: next.installableOnly,
      sort: next.sort,
    });
    setUrlSortPinned(sort !== "");
    setHydrated(true);
    if (seeded) request();
  }, [request]);

  return [filters, setFilters, urlSortPinned, hydrated] as const;
}

function ExploreContent(props: ExploreViewProps) {
  const { status, items: full, request } = useCatalog();
  const [filters, setFilters, urlSortPinned, hydrated] = useQueryFilters(request);
  const { query, kind, goal, category, agent, publisher, source, verifiedOnly, installableOnly, sort } =
    filters;
  const router = useRouter();

  /**
   * `?focus=search` is what the header's search affordance deep-links to. It
   * focuses the field and does NOT seed the dataset request: focusing a box is
   * not a reason to download 3.8 MB, and the first keystroke already is.
   */
  const [focusSearch, setFocusSearch] = useState(false);

  /**
   * The publisher list.
   *
   * 5,286 publishers shipped more than one entry; the list is fetched when
   * the reader opens the control, so a passive visit fetches nothing under
   * `/data/` and the page's first paint does not carry 5,286 names.
   */
  const [publishers, setPublishers] = useState<PublisherCount[]>([]);
  const [publisherTotal, setPublisherTotal] = useState(0);
  const [publishersLoading, setPublishersLoading] = useState(false);
  const [publishersFailed, setPublishersFailed] = useState(false);
  const loadPublishers = useCallback(() => {
    setPublishersLoading(true);
    loadCatalogPublishers()
      .then((facets) => {
        setPublishers(facets.publishers);
        setPublisherTotal(facets.publisherCount);
        setPublishersLoading(false);
      })
      .catch(() => {
        setPublishersFailed(true);
        setPublishersLoading(false);
      });
  }, []);

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

  /**
   * The sort actually applied. Curated is the browse front door; while a query
   * is active the search's own order (Best match) is the honest default,
   * because relevance — not curation — is what a search result list promises.
   * An explicit choice from the URL or the select always wins.
   */
  const [sortTouched, setSortTouched] = useState(false);
  const sortPinned = sortTouched || urlSortPinned;
  const effectiveSort: SortMode =
    !sortPinned && query.trim() !== "" && sort === DEFAULT_SORT ? "relevance" : sort;

  const setQuery = (q: string) => {
    request();
    setFilters((f) => ({ ...f, query: q }));
  };
  const setKind = (k: string) => {
    request();
    setFilters((f) => ({ ...f, kind: k }));
  };
  const setGoal = (g: string) => {
    request();
    setFilters((f) => ({ ...f, goal: g }));
  };
  const setCategory = (c: string) => {
    request();
    setFilters((f) => ({ ...f, category: c }));
  };
  const setAgent = (a: string) => {
    request();
    setFilters((f) => ({ ...f, agent: a }));
  };
  const setPublisher = (p: string) => {
    request();
    setFilters((f) => ({ ...f, publisher: p }));
  };
  const setVerifiedOnly = (v: boolean) => {
    request();
    setFilters((f) => ({ ...f, verifiedOnly: v }));
  };
  const setInstallableOnly = (v: boolean) => {
    request();
    setFilters((f) => ({ ...f, installableOnly: v }));
  };
  const setSource = (s: string) => {
    request();
    setFilters((f) => ({ ...f, source: s }));
  };
  const setSort = (s: SortMode) => {
    request();
    setSortTouched(true);
    setFilters((f) => ({ ...f, sort: s }));
  };

  /**
   * Keep the address bar in step with the filters that are actually applied.
   *
   * Reset used to clear the state but leave `?kind=plugin&category=…` in the
   * URL, so a refresh or a shared link re-applied filters the reader had
   * cleared — the list said "All capabilities" while the address bar said
   * otherwise. The query field is deliberately not a dependency: it syncs on
   * Enter (SearchBar) and on clear, so typing does not rewrite history on
   * every keystroke.
   */
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (kind !== "all") params.set("kind", kind);
    if (goal !== "all") params.set("goal", goal);
    if (category !== "all") params.set("category", category);
    if (agent !== "all") params.set("host", agent);
    if (publisher) params.set("publisher", publisher);
    if (source) params.set("source", source);
    if (verifiedOnly) params.set("verified", "1");
    if (installableOnly) params.set("installable", "1");
    if (sort !== DEFAULT_SORT) params.set("sort", sort);
    const next = params.toString();
    if (next === window.location.search.replace(/^\?/, "")) return;
    router.replace(next ? `/explore/?${next}` : "/explore/", { scroll: false });
    // `query` is read, not depended on — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, kind, goal, category, agent, publisher, source, verifiedOnly, installableOnly, sort, router]);

  const deferredQuery = useDeferredValue(query);

  const live = useMemo(() => {
    if (!full) return null;
    return {
      total: full.length,
      kindCounts: deriveKindCounts(full),
      goals: taxonomyFacets(full).map((facet) => ({
        id: facet.id,
        label: facet.label,
        count: facet.count,
      })),
      agents: agentFacets(full),
    };
  }, [full]);

  const total = live ? live.total : props.total;
  const kindCounts = live ? live.kindCounts : props.kindCounts;
  const goals = live ? live.goals : props.goals;
  const agents = live ? live.agents : props.agents;

  /**
   * A deep link can spell a host any way a registry does (`?host=claude%20code`
   * for the adapter's "Claude Code CLI", or a skill target's "Codex"). The
   * filter resolves every spelling of a host to one identity (`lib/hostIdentity`),
   * and the select offers one option per identity; canonicalise the applied
   * value to that option so the select shows the filter that is actually
   * applied instead of falling back to "Any agent" beside a filtered list.
   */
  useEffect(() => {
    if (agent === "all") return;
    const id = resolveHostId(agent);
    const canonical = id
      ? agents.find((a) => a.id === id)
      : agents.find((a) => a.name.toLowerCase() === agent.toLowerCase());
    if (canonical && canonical.name !== agent) {
      setFilters((f) => (f.agent === agent ? { ...f, agent: canonical.name } : f));
    }
  }, [agent, agents, setFilters]);

  const { results, searching, settled } = useCatalogSearch(full ?? [], deferredQuery, {
    kind: kind === "all" ? null : kind,
    category: category === "all" ? null : category,
  });

  /**
   * The agent whose compatibility ranks first.
   *
   * A selected `Works with` value is the reader's explicit target. Otherwise
   * the agent remembered from the home page is a ranking preference — it
   * reorders results (compatible first, everything else still below), it never
   * narrows them; narrowing stays the banner button's job. Compatibility comes
   * from the install path LiteSPM can configure: remote MCP entries must match
   * the target's documented transport, and skills need a user-scope directory.
   * Plugins carry their own declared host list. `lib/hostIdentity.ts` resolves the chosen spellings to
   * one host, so "OpenAI Codex CLI" and a plugin manifest's "Codex" rank the
   * same agent.
   */
  const rankAgent = useMemo(() => {
    if (agent !== "all") {
      const facet = agents.find((a) => a.id === resolveHostId(agent));
      return { hosts: [agent], label: facet?.name ?? agent };
    }
    if (!savedAgent || savedAgent.hosts.length === 0) return null;
    const known = savedAgent.hosts.filter((h) => agents.some((a) => a.id === resolveHostId(h)));
    if (known.length === 0) return null;
    return { hosts: known, label: savedAgent.label };
  }, [agent, savedAgent, agents]);

  const filtered = useMemo(() => {
    const scoped = results.filter((item) => {
      // The editorial goal is filtered here, after the search, rather than
      // inside `useCatalogSearch`: the search's index and ranking are not
      // touched, and the goal is a property of the row's text that the same
      // pure rule derives on both sides of the wire (`lib/taxonomy`).
      if (goal !== "all" && classifyListing(item) !== goal) return false;
      if (agent !== "all" && !matchesHost(item, agent)) return false;
      // The publisher's own name, compared the way `publisherFacets` counts
      // it (trimmed). This is the filter the Coverage boards link to; a text
      // search for the same string measures something else entirely.
      //
      // The rule lives in `lib/publisherFilter.ts` and is case-folded and
      // exact on purpose. A prefix or contains fallback looks friendlier —
      // `?publisher=anthropic` finds "Anthropic" — but it breaks the one rule
      // the site cannot break: a count printed next to a name must be the
      // count that name's filter returns. "Anthropic" shipped 443 entries and
      // "anthropics" shipped 416; a prefix match for "Anthropic" returns 861,
      // so the Coverage board would print 443 and open 861 (the same for
      // "github", "servers" and "nvidia" — four of the board's fifteen rows).
      // The Publisher control offers the names, so a reader never has to type
      // one, and the gate `scripts/check-publisher-counts.mjs` holds the two
      // sides together over the real dataset.
      if (!publisherMatches(item.publisher?.name, publisher)) return false;
      if (source && !matchesSource(item, source)) return false;
      if (verifiedOnly && !item.publisher?.verified) return false;
      if (installableOnly && !isInstallable(item)) return false;
      return true;
    });
    const ordered = sortListings(scoped, effectiveSort);
    // Compatibility is a ranking preference over the search order, not a
    // filter and not an override of an explicitly chosen sort.
    if (effectiveSort !== "relevance") return ordered;
    const ranked = sortByCompatibility(ordered, rankAgent?.hosts ?? null);
    // The quality rule runs last, so a fixture cannot be lifted back up by
    // compatibility: it is demoted below every capability row, not deleted —
    // `demoteValidationFixtures` only reorders, so the count above and the
    // rows' own pages are untouched.
    return demoteValidationFixtures(ranked);
  }, [results, goal, agent, publisher, source, verifiedOnly, installableOnly, effectiveSort, rankAgent]);

  /**
   * Match evidence for the first results, computed from the hydrated rows with
   * the same classifier the index was built from. Eight rows is enough to show
   * the classes at work; the panel states the rule that covers the rest. Only
   * shown under "Best match" — under an explicit sort the order is that sort's,
   * and the curated note (or the sort's own label) is the explanation.
   */
  const explanation = useMemo(() => {
    if (effectiveSort !== "relevance") return null;
    if (!full || !deferredQuery || !settled || filtered.length === 0) return null;
    return filtered.slice(0, 8).map((item) => ({ item, reason: explainMatch(item, deferredQuery) }));
  }, [effectiveSort, full, deferredQuery, settled, filtered]);

  const hasFilters =
    query !== "" ||
    kind !== "all" ||
    goal !== "all" ||
    category !== "all" ||
    agent !== "all" ||
    publisher !== "" ||
    source !== "" ||
    verifiedOnly ||
    installableOnly ||
    sort !== DEFAULT_SORT;

  /** A filter that narrows the row set — the sort does not, and the query is
   *  not a filter for the grid's empty-state wording. */
  const narrowing =
    kind !== "all" ||
    goal !== "all" ||
    category !== "all" ||
    agent !== "all" ||
    publisher !== "" ||
    source !== "" ||
    verifiedOnly ||
    installableOnly;

  /**
   * Only offered when it would actually do something: no filter is set yet, the
   * reader has not dismissed it, and the remembered agent names a host this
   * catalog's own facet list carries — a preference for a host no row declares
   * would filter to an empty page and read as a broken link.
   */
  const savedTarget = savedAgent && !savedDismissed && !hasFilters
    ? savedAgent.hosts.find((h) => agents.some((a) => a.id === resolveHostId(h))) ?? null
    : null;

  // Same rule as Home: rows from the prerender until the dataset lands, an
  // empty set (skeleton) for a filter that has nothing to run against yet.
  const gridItems = full ? filtered : hasFilters ? [] : props.gridRows;
  const gridPending = !full && hasFilters;
  /**
   * What the row set actually is. The heading used to read "All capabilities"
   * for every non-query state, so a publisher deep link (2,365 rows), a kind
   * filter (638) or a coverage-board category all sat under a heading claiming
   * the whole catalog. One applied filter is named; several fall back to
   * "Filtered capabilities", which claims only that a filter is on.
   */
  const appliedFilterLabels: string[] = [];
  if (kind !== "all") appliedFilterLabels.push(`${kindLabel(kind)}s`);
  if (goal !== "all") appliedFilterLabels.push(goals.find((g) => g.id === goal)?.label ?? goal);
  if (category !== "all") appliedFilterLabels.push(categoryLabel(category));
  if (agent !== "all") {
    const facet = agents.find((a) => a.id === resolveHostId(agent));
    appliedFilterLabels.push(`Works with ${facet?.name ?? agent}`);
  }
  if (publisher) appliedFilterLabels.push(publisher);
  if (source) appliedFilterLabels.push(sourceLabel(source));
  if (verifiedOnly) appliedFilterLabels.push("From publisher manifests");
  if (installableOnly) appliedFilterLabels.push("Installable entries");
  const gridHeading = deferredQuery
    ? `Results for “${deferredQuery}”`
    : appliedFilterLabels.length === 0
      ? "All capabilities"
      : appliedFilterLabels.length === 1
        ? appliedFilterLabels[0]
        : "Filtered capabilities";
  /**
   * The grid's count is measured by the build while the prerendered first page
   * is what is on screen (`props.total`, with `full === null`), and by the
   * search once the rows are in hand (`filtered.length`). Only the second can
   * be unsettled: the hook's `settled` is `false` until its own rows exist,
   * and blanking a build-time total with "searching…" while nothing is being
   * searched would be the same defect pointed the other way.
   */
  const gridCountSettled = !full || settled;

  const clear = () => {
    setQuery("");
    setKind("all");
    setGoal("all");
    setCategory("all");
    setAgent("all");
    setPublisher("");
    setSource("");
    setVerifiedOnly(false);
    setInstallableOnly(false);
    setSortTouched(false);
    setFilters((f) => ({ ...f, sort: DEFAULT_SORT }));
    // The state above is already the whole story; the address bar has to
    // agree with it or a refresh re-applies filters the reader just cleared.
    router.replace("/explore/", { scroll: false });
  };

  return (
    <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
      <Header />

      <main id="main" tabIndex={-1} className="flex-1">
        <div className="shell pt-8">
          <p className="kicker">MCP servers · skills · plugins</p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">Explore the marketplace</h1>
          <p className="mt-2 max-w-[66ch] text-[13px] leading-relaxed text-ink-2">
            Browse by what you want to do, then check each package&rsquo;s agent targets and install status.
            Compatibility is package-specific; entries LiteSPM cannot install say why.
          </p>

          {savedTarget && savedAgent && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-rule bg-sunken px-4 py-3">
              <p className="text-[13px] text-ink-2">
                Browse capabilities for <strong className="font-medium text-ink">{savedAgent.label}</strong>.
              </p>
              <button
                type="button"
                className="btn h-7 text-[11.5px]!"
                onClick={() => setFilters((f) => ({ ...f, agent: savedTarget }))}
              >
                Filter for {savedAgent.label}
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

          <div className="mt-4">
            <SearchBar
              query={query}
              setQuery={setQuery}
              totalMatches={deferredQuery && full ? filtered.length : undefined}
              settled={settled}
              totalCount={total}
              autoFocusOnMount={focusSearch}
            />
          </div>

          <ExploreFilters
            kind={kind}
            setKind={setKind}
            kindCounts={kindCounts}
            goal={goal}
            setGoal={setGoal}
            goals={goals}
            agent={agent}
            setAgent={setAgent}
            agents={agents}
            category={category}
            setCategory={setCategory}
            categories={props.categories}
            publisher={publisher}
            setPublisher={setPublisher}
            publishers={publishers}
            publisherTotal={publisherTotal}
            publishersLoading={publishersLoading}
            publishersFailed={publishersFailed}
            onOpenPublishers={loadPublishers}
            source={source}
            setSource={setSource}
            sources={props.sources}
            verifiedOnly={verifiedOnly}
            setVerifiedOnly={setVerifiedOnly}
            installableOnly={installableOnly}
            setInstallableOnly={setInstallableOnly}
            hasFilters={hasFilters}
            clear={clear}
            onIntent={request}
          />

        </div>

        <div className="pt-7">
          {gridPending ? (
            status === "error" ? (
              <ExploreLoadError onRetry={request} />
            ) : (
              <ExploreSearchSkeleton />
            )
          ) : (
            <ExploreResults
              items={gridItems}
              query={deferredQuery}
              heading={gridHeading}
              count={full ? filtered.length : total}
              loading={searching}
              awaiting={status === "loading"}
              error={status === "error"}
              onRetry={request}
              onShowMore={request}
              onClearFilters={clear}
              onSuggestion={setQuery}
              filtersActive={narrowing}
              settled={gridCountSettled}
              effectiveSort={effectiveSort}
              setSort={setSort}
            />
          )}

          {/* The active order's rule, below the rows it orders. It states
              wherever that order is active — browsing or searching — and it
              used to sit above the grid, where the measured first row started
              at y≈586 of a 900px viewport. The rule that put the ranking
              evidence below the rows applies to this evidence too. */}
          <details className="mt-4 border border-rule bg-sunken px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-medium text-ink">
              How results are sorted
            </summary>
            <p className="mt-2 max-w-prose text-[12.5px] leading-relaxed text-ink-2">
              {SORT_NOTES[effectiveSort]}
            </p>
          </details>

          {/* The ordering evidence, below the rows it explains. A search's
              first answer has to be the matching rows; the analysis of their
              order is a follow-up question, so it is a collapsed disclosure
              after the result set and never a block in front of it. */}
          {explanation && (
            <div className="shell pb-16">
              <ExploreWhy entries={explanation} host={rankAgent?.label ?? null} />
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default function ExplorePage(props: ExploreViewProps) {
  return <ExploreContent {...props} />;
}
