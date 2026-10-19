"use client";

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCw, X } from "lucide-react";
import { Header } from "../../components/navigation/Header";
import { SearchBar } from "../../components/navigation/SearchBar";
import { ExtensionGrid } from "../../components/catalog/ExtensionGrid";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { Listing } from "../../lib/telemetry";
import { useCatalogSearch } from "../../lib/useCatalogSearch";
import { useCatalog } from "../../lib/catalogData";
import {
  agentFacets,
  CURATED_NOTE,
  demoteValidationFixtures,
  deriveKindCounts,
  isInstallable,
  kindLabel,
  listingHref,
  matchesHost,
  matchesSource,
  OFFICIAL_SKILLS_CATEGORY,
  sortByCompatibility,
  sortListings,
  DEFAULT_SORT,
  SortMode,
} from "../../lib/catalog";
import { availabilityOf } from "../../lib/availability";
import { resolveHostId } from "../../lib/hostIdentity";
import {
  explainMatch,
  MATCH_BODY,
  MATCH_ID,
  MATCH_NAME_EXACT,
  MATCH_NAME_PREFIX,
  MATCH_NAME_TOKEN,
  MATCH_PUBLISHER,
  MATCH_SLUG,
} from "../../lib/searchFormat.mjs";
import { formatCount } from "../../lib/format";
import { classifyListing, taxonomyFacets } from "../../lib/taxonomy";
import { AGENT_STORAGE_KEY, findAgentChoice, sourceLabel } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";
import { categoryLabel } from "../categories/categoryLabel";

const KINDS = ["all", "mcp", "skill", "plugin"] as const;
const SORTS: Array<{ id: SortMode; label: string }> = [
  // "Best match" is the order the search itself produces: the field the query
  // matched in (exact name, name prefix, a name word, publisher, slug,
  // summary/tools, catalog id), then installability, publisher-manifest
  // verified, and the upstream official-skills classification. "Curated first"
  // stays the browse default and stays selectable during a search; its rule is
  // stated under the filter row whenever it is the active order.
  { id: "relevance", label: "Best match" },
  { id: DEFAULT_SORT, label: "Curated first" },
  { id: "installable", label: "Installable first" },
  { id: "name", label: "Name A–Z" },
  { id: "publisher", label: "Publisher" },
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
  /** The editorial goal facets (`lib/taxonomy`), largest first. */
  goals: Array<{ id: string; label: string; count: number }>;
  /** One facet per host identity (`lib/hostIdentity`), largest first. */
  agents: Array<{ id: string; name: string; count: number }>;
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

/** Human names for the fields `explainMatch` reports. */
const EXPLAIN_FIELD_LABELS: Record<string, string> = {
  name: "name",
  publisher: "publisher",
  slug: "web address",
  summary: "summary",
  category: "category",
  runtime: "runtime",
  transport: "transport",
  id: "ID",
  tool: "tool name or description",
};

/** The class behind each explanation, in words. */
const EXPLAIN_CLASS_LABELS: Record<number, string> = {
  [MATCH_NAME_EXACT]: "exact name",
  [MATCH_NAME_PREFIX]: "name starts with the query",
  [MATCH_NAME_TOKEN]: "name word",
  [MATCH_PUBLISHER]: "publisher name",
  [MATCH_SLUG]: "web address",
  [MATCH_BODY]: "summary or tool text",
  [MATCH_ID]: "ID",
};

/**
 * Why the leading results are the leading results.
 *
 * It renders AFTER the result set, collapsed — the answer has to precede the
 * analysis of its order. Before that it sat above the rows, expanded, and on a
 * search the first result started around y≈900 at 1440×900: a reader had to
 * pass an essay to see whether anything matched. The content is kept whole
 * because no competitor explains *why* a row ranked; it just is not the thing
 * to read first.
 *
 * The evidence for the *ordering* lives here: each of the first results, the
 * field the query was found in, the fragment around the match, and the class
 * that rank came from. The rule line states the whole order, so the
 * explanation also covers the rows further down without a sentence per row.
 */
function MatchExplanationPanel({
  entries,
  host,
}: {
  entries: Array<{ item: Listing; reason: ReturnType<typeof explainMatch> }>;
  host: string | null;
}) {
  return (
    <details className="border border-rule bg-sunken px-4 py-3">
      <summary className="cursor-pointer text-[13px] font-medium text-ink">
        Why these results?
      </summary>
      <p className="mt-2 max-w-prose text-[12.5px] leading-relaxed text-ink-2">
        Results rank by where the query was found — the name first, then the publisher, web
        address and description. Ties go to entries LiteSPM can install, then to publisher
        manifests and official skills.
        {host && (
          <>
            {" "}
            Entries that work with <strong className="font-medium text-ink">{host}</strong> rank
            first.
          </>
        )}
      </p>
      <ol className="mt-3 space-y-1.5">
        {entries.map(({ item, reason }, index) => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-1.5 text-[12.5px]">
            <span className="t-mono t-tabular w-4 shrink-0 text-right text-[11px] text-ink-3">
              {index + 1}
            </span>
            <Link
              href={listingHref(item)}
              className="font-medium text-ink hover:text-accent-text hover:underline"
            >
              {item.name}
            </Link>
            <span className="text-ink-3">—</span>
            {reason ? (
              reason.tokens.map((part, partIndex) => (
                <React.Fragment key={`${part.token}-${partIndex}`}>
                  {partIndex > 0 && <span className="text-ink-3">+</span>}
                  <span className="text-ink-2">
                    {EXPLAIN_FIELD_LABELS[part.field] ?? part.field}
                    {part.fragment ? (
                      <>
                        {" “"}
                        <span className="t-mono text-[11.5px]">
                          {part.fragment.text.slice(0, part.fragment.start)}
                          <mark className="bg-transparent font-semibold text-ink underline decoration-accent decoration-2 underline-offset-2">
                            {part.fragment.text.slice(part.fragment.start, part.fragment.end)}
                          </mark>
                          {part.fragment.text.slice(part.fragment.end)}
                        </span>
                        {"”"}
                      </>
                    ) : (
                      " (not shown in the result list)"
                    )}
                  </span>
                  <span className="text-ink-3">
                    {EXPLAIN_CLASS_LABELS[part.className] ?? ""}
                  </span>
                </React.Fragment>
              ))
            ) : (
              <span className="text-ink-3">matched</span>
            )}
            {/* Why this row beat the next one at the same class: the tie-break
                signals, strongest first, exactly as the index weighed them. */}
            <span className="t-mono text-[10.5px] text-ink-3">
              {[
                availabilityOf(item).installable ? "installable" : null,
                item.publisher?.verified ? "publisher manifest" : null,
                item.category === OFFICIAL_SKILLS_CATEGORY ? "official skills" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/**
 * The full row set is being fetched for a search or filter. The grid cannot
 * render yet — and must not print a count, because there is no measurement to
 * print. (It used to fall back to the catalog total here, which read as
 * “search returned everything” on a page that had not searched anything yet.)
 */
function ExploreSearchSkeleton() {
  return (
    <section className="shell pb-16">
      <p className="sr-only" role="status">
        Searching the catalog…
      </p>
      <ul aria-hidden="true" className="pt-px">
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
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The row-set fetch failed before any count existed; say so, offer a retry. */
function ExploreLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="shell pb-16">
      <div className="border-b border-rule py-14">
        <div className="flex max-w-prose flex-col items-start gap-3">
          <RotateCw className="h-6 w-6 text-ink-3" aria-hidden="true" />
          <h3 className="text-[15px] font-semibold">The catalog could not be loaded</h3>
          <p className="text-[13px] text-ink-2">
            The full catalog didn&rsquo;t load, so search and filtering are unavailable right now.
          </p>
          <button type="button" onClick={onRetry} className="btn btn-solid mt-2">
            Try again
          </button>
        </div>
      </div>
    </section>
  );
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
   * from what a row is: every MCP server works with every bridge adapter and
   * every skill with every skills target, and only plugins carry their own
   * declared host list. `lib/hostIdentity.ts` resolves the chosen spellings to
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
      // The publisher filter is a name a reader typed, so it is compared the
      // way a reader means it: case-folded, then a prefix, then a contains.
      // An exact case-sensitive comparison turned the most natural input —
      // `?publisher=anthropic` — into a silent zero, while `?publisher=Anthropic`
      // found one row. A filter that returns nothing without saying why reads
      // as a broken page.
      if (publisher) {
        const wanted = publisher.trim().toLowerCase();
        const name = (item.publisher?.name ?? "").trim().toLowerCase();
        if (name !== wanted && !name.startsWith(wanted) && !name.includes(wanted)) return false;
      }
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
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Explore</h1>

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

          {/* Filters are a single ruled row. Kind is segmented; goal and agent
              are selects because 12 and 79 options do not fit as chips. A
              source category from a deep link is a chip: the upstream labels
              are provenance, and `/categories/` is the browse-by-category
              surface, so they are not a second facet row here. */}
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
                  {/* Counts are whole-catalog figures, exactly like the Goal
                      and Works with selects below — never "matching your
                      filters", which would take a per-filter derivation this
                      rail does not have. Hidden under md: four counts make
                      this rail wider than a phone, and the labels are what the
                      control is for. */}
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
              Goal
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                title="Grouped by what the capability is for."
                className="field"
              >
                <option value="all">All goals</option>
                {goals
                  .filter((g) => g.id !== "other")
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label} ({formatCount(g.count)})
                    </option>
                  ))}
                {goals
                  .filter((g) => g.id === "other")
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      Other — no goal placed ({formatCount(g.count)})
                    </option>
                  ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-[12px] text-ink-2">
              Works with
              <select value={agent} onChange={(e) => setAgent(e.target.value)} className="field">
                <option value="all">Any agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name} ({formatCount(a.count)})
                  </option>
                ))}
                {/* A `?host=` that names nothing this catalog lists is still
                    applied, so it is shown rather than silently rendering
                    "Any agent" beside an empty list. Its count is 0 because no
                    row's host list carries the name. */}
                {agent !== "all" && !agents.some((a) => a.name === agent) && (
                  <option value={agent}>{agent} — not a host in this catalog (0)</option>
                )}
              </select>
            </label>

            <label className="flex min-h-[44px] items-center gap-2 text-[12px] text-ink-2 md:min-h-0">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-ink"
              />
              Only entries from publisher manifests
            </label>

            <label className="flex min-h-[44px] items-center gap-2 text-[12px] text-ink-2 md:min-h-0">
              <input
                type="checkbox"
                checked={installableOnly}
                onChange={(e) => setInstallableOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-ink"
              />
              Only entries LiteSPM can install
            </label>

            {/* A category set by a deep link or an old bookmark. The upstream
                labels are not offered as a browse axis here — `/categories/`
                is — but a link that carries one still applies it, so the chip
                keeps that filter visible and clearable like every other. */}
            {category !== "all" && (
              <span className="inline-flex items-center gap-1.5 rounded-chip border border-rule bg-sunken px-2 py-1 text-[12px] text-ink-2">
                <span className="t-mono text-[11px] text-ink-3">category</span>
                {categoryLabel(category)}
                <button
                  type="button"
                  onClick={() => setCategory("all")}
                  aria-label={`Clear the ${categoryLabel(category)} category filter`}
                  className="btn h-5 min-h-0 px-1! py-0!"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            )}

            {/* A source set from a shelf's "View all" link. Shown as a chip so
                the filter is visible and clearable like every other one. */}
            {source && (
              <span className="inline-flex items-center gap-1.5 rounded-chip border border-rule bg-sunken px-2 py-1 text-[12px] text-ink-2">
                <span className="t-mono text-[11px] text-ink-3">source</span>
                {sourceLabel(source)}
                <button
                  type="button"
                  onClick={() => setSource("")}
                  aria-label={`Clear the ${sourceLabel(source)} source filter`}
                  className="btn h-5 min-h-0 px-1! py-0!"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            )}

            {/* A publisher set by a Coverage board's link. Publishers number in
                the tens of thousands, so there is no select for them; the chip
                is the whole control. */}
            {publisher && (
              <span className="inline-flex items-center gap-1.5 rounded-chip border border-rule bg-sunken px-2 py-1 text-[12px] text-ink-2">
                <span className="t-mono text-[11px] text-ink-3">publisher</span>
                {publisher}
                <button
                  type="button"
                  onClick={() => setPublisher("")}
                  aria-label={`Clear the ${publisher} publisher filter`}
                  className="btn h-5 min-h-0 px-1! py-0!"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            )}

            {hasFilters && (
              <button type="button" onClick={clear} className="btn ml-auto">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>

          {/* The curated order's rule, stated wherever that order is active —
              browsing or searching. It used to hide during a search, which is
              exactly when a reader asks why an entry they did not search for
              is first. */}
          {effectiveSort === "curated" && (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{CURATED_NOTE}</p>
          )}
        </div>

        <div className="pt-7">
          {gridPending ? (
            status === "error" ? (
              <ExploreLoadError onRetry={request} />
            ) : (
              <ExploreSearchSkeleton />
            )
          ) : (
            <ExtensionGrid
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

              toolbar={
                <div className="flex shrink-0 items-center gap-2">
                  <label htmlFor="explore-sort" className="t-mono text-[11px] text-ink-3">
                    Sort
                  </label>
                  <select
                    id="explore-sort"
                    value={effectiveSort}
                    onChange={(e) => setSort(e.target.value as SortMode)}
                    title={
                      effectiveSort === "curated"
                        ? CURATED_NOTE
                        : "Best match orders by where the query matched."
                    }
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
          )}

          {/* The ordering evidence, below the rows it explains. A search's
              first answer has to be the matching rows; the analysis of their
              order is a follow-up question, so it is a collapsed disclosure
              after the result set and never a block in front of it. */}
          {explanation && (
            <div className="shell pb-16">
              <MatchExplanationPanel entries={explanation} host={rankAgent?.label ?? null} />
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
