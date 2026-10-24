"use client";

import React from "react";
import { X } from "lucide-react";
import { formatCount } from "../../lib/format";
import { kindLabel } from "../../lib/catalog";
import type { AgentFacet } from "../../lib/catalog";
import { sourceLabel } from "../../lib/catalog";
import { categoryLabel } from "../categories/categoryLabel";

/**
 * Explore's filter panel.
 *
 * It used to be one `<div>` inside the view, 180 lines of it, mixed with the
 * results and with the ranking explanation. It is its own file now so the
 * filter *rules* can be stated in one place and read on their own: every
 * control below says what it narrows, and the counts beside them are the
 * counts this panel's own filters produce.
 *
 * ## What is here, and why
 *
 * Kind, Goal and Works with were controls from the start. Category, Publisher
 * and Source were not: they existed only as URL parameters, so a reader could
 * not reach them from the page at all — the three filters the site's own
 * shelves, boards and deep links use were unreachable from the UI.
 *
 *   Category   the label the source itself publishes, with its count. It
 *              compares the raw value, the way `?category=` does.
 *   Publisher  the publisher's own name, with the number of rows it
 *              published. The catalog has 30,269 of them and 5,286 published
 *              more than one entry; the list is those 5,286, and it is
 *              fetched when the control is opened rather than shipped in the
 *              page. The comparison is case-folded, then a prefix, then a
 *              contains — a reader typing "anthropic" must not get a silent
 *              zero.
 *   Source     where the row was read from, with its count.
 *
 * ## The why
 *
 * A filter that reduces the list without saying why reads as a broken page,
 * so the rule each filter follows is stated under the row (F-26) and every
 * active filter is a chip that can be removed.
 */

const KINDS = ["all", "mcp", "skill", "plugin"] as const;

export interface CategoryFacet {
  name: string;
  count: number;
}

export interface SourceFacet {
  id: string;
  label: string;
  count: number;
}

export interface PublisherFacet {
  name: string;
  count: number;
}

export interface ExploreFiltersProps {
  kind: string;
  setKind: (kind: string) => void;
  kindCounts: { all: number; mcp: number; skill: number; plugin: number };

  goal: string;
  setGoal: (goal: string) => void;
  goals: Array<{ id: string; label: string; count: number }>;

  agent: string;
  setAgent: (agent: string) => void;
  agents: AgentFacet[];

  category: string;
  setCategory: (category: string) => void;
  categories: CategoryFacet[];

  publisher: string;
  setPublisher: (publisher: string) => void;
  /** The publisher list, once the control has been opened. */
  publishers: PublisherFacet[];
  /** How many publishers the whole snapshot names. */
  publisherTotal: number;
  /** True while the publisher list is on its way. */
  publishersLoading: boolean;
  /** True when the publisher list could not be read. */
  publishersFailed: boolean;
  /** Called when the reader opens the publisher control. */
  onOpenPublishers: () => void;

  source: string;
  setSource: (source: string) => void;
  sources: SourceFacet[];

  verifiedOnly: boolean;
  setVerifiedOnly: (value: boolean) => void;
  installableOnly: boolean;
  setInstallableOnly: (value: boolean) => void;

  hasFilters: boolean;
  clear: () => void;

  /**
   * Called when the reader shows intent to filter.
   *
   * The whole row set is 5 MiB, and the first filter pays for fetching and
   * hydrating it. A reader who moves the pointer toward the controls — or
   * tabs into one — is about to filter, so the fetch starts then: the wait
   * happens while the pointer is still travelling, and a reader who never
   * filters never pays for it. The call is idempotent; the second one is a
   * no-op.
   */
  onIntent?: () => void;
}

/**
 * The rule each filter follows, in the reader's terms.
 *
 * This is the page-level "why" the collapsed "Why these results?" panel does
 * not answer: that panel explains the *ranking* of a query, and says nothing
 * about the *filtering*. A reader who has just narrowed 69,376 rows to 764
 * deserves to be told what the narrowing did.
 */
const FILTER_WHY =
  "Every filter narrows the same list. Kind is what the entry is; Goal is what it is for; " +
  "Category is the label its source publishes; Publisher is the publisher's own name; Source is " +
  "where the row was read from; Works with is the agent host the entry works with. The count beside " +
  "each one is what that filter returns on its own.";

export function ExploreFilters(props: ExploreFiltersProps) {
  const {
    kind,
    setKind,
    kindCounts,
    goal,
    setGoal,
    goals,
    agent,
    setAgent,
    agents,
    category,
    setCategory,
    categories,
    publisher,
    setPublisher,
    publishers,
    publisherTotal,
    publishersLoading,
    publishersFailed,
    onOpenPublishers,
    source,
    setSource,
    sources,
    verifiedOnly,
    setVerifiedOnly,
    installableOnly,
    setInstallableOnly,
    hasFilters,
    clear,
    onIntent,
  } = props;


  return (
    <>
      {/* Filters are a single ruled row. Kind is segmented; goal and agent
          are selects because 12 and 79 options do not fit as chips. A
          source category from a deep link is a chip: the upstream labels
          are provenance, and `/categories/` is the browse-by-category
          surface, so they are not a second facet row here. */}
      <div
        className="explore-filter-panel mt-5 flex flex-wrap items-center gap-x-5 gap-y-3"
        onPointerEnter={onIntent}
        onFocusCapture={onIntent}
      >
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

        <label htmlFor="explore-goal" className="flex min-w-0 items-center gap-2 text-[12px] text-ink-2">
          Goal
          <select
            id="explore-goal"
            name="goal"
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

        <label htmlFor="explore-host" className="flex min-w-0 items-center gap-2 text-[12px] text-ink-2">
          Works with
          <select
            id="explore-host"
            name="host"
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className="field"
          >
            <option value="all">Any agent</option>
            {/*
                Two groups, because the flat list told the reader nothing: 71 of
                the 79 hosts can take skills and nothing else, and all 71 read
                "(764)". The group says which kind of host it is, and the
                option's own tooltip carries the split.
            */}
            {(() => {
              const managed = agents.filter((a) => a.managed);
              const skillsOnly = agents.filter((a) => !a.managed);
              return (
                <>
                  {managed.length > 0 && (
                    <optgroup label={`MCP servers and skills (${managed.length})`}>
                      {managed.map((a) => (
                        <option
                          key={a.id}
                          value={a.name}
                          title={`${formatCount(a.mcp)} MCP servers · ${formatCount(a.skill)} skills`}
                        >
                          {a.name} ({formatCount(a.count)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {skillsOnly.length > 0 && (
                    <optgroup label={`Skills only (${skillsOnly.length})`}>
                      {skillsOnly.map((a) => (
                        <option
                          key={a.id}
                          value={a.name}
                          title={`${formatCount(a.skill)} skills · no MCP config for this host`}
                        >
                          {a.name} ({formatCount(a.count)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              );
            })()}
            {/* A `?host=` that names nothing this catalog lists is still
                applied, so it is shown rather than silently rendering
                "Any agent" beside an empty list. Its count is 0 because no
                row's host list carries the name. */}
            {agent !== "all" && !agents.some((a) => a.name === agent) && (
              <option value={agent}>{agent} — no matching packages (0)</option>
            )}
          </select>
        </label>

        <label
          htmlFor="explore-category"
          className="flex min-w-0 items-center gap-2 text-[12px] text-ink-2"
        >
          Category
          <select
            id="explore-category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            title="The label the source itself publishes."
            className="field"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {categoryLabel(c.name)} ({formatCount(c.count)})
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="explore-source" className="flex min-w-0 items-center gap-2 text-[12px] text-ink-2">
          Source
          <select
            id="explore-source"
            name="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            title="Where the row was read from."
            className="field"
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({formatCount(s.count)})
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="explore-publisher" className="flex min-w-0 items-center gap-2 text-[12px] text-ink-2">
          Publisher
          <select
            id="explore-publisher"
            onFocus={onOpenPublishers}
            onPointerDown={onOpenPublishers}
            name="publisher"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            title={
              publishersFailed
                ? "The publisher list could not be loaded. ?publisher= still takes any publisher's name."
                : `The publishers that shipped more than one entry, with the number of rows each published. Open the list to load ${formatCount(publisherTotal)} names.`
            }
            className="field"
          >
            <option value="">{publishersLoading ? "Loading publishers…" : "Any publisher"}</option>
            {/*
                The applied publisher is always an option, even before the
                list arrives and even when it is not in the list (a name with
                a single entry, or one this snapshot does not carry): the
                control must show the filter that is applied.
            */}
            {publisher &&
              !publishers.some((p) => p.name === publisher) && (
                <option value={publisher}>
                  {publisher} ({publishersLoading ? "…" : "not in the list"})
                </option>
              )}
            {publishers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({formatCount(p.count)})
              </option>
            ))}
          </select>
          {publishersFailed && <button type="button" className="link" onClick={onOpenPublishers}>Retry publishers</button>}
        </label>

        {/*
            The two checkboxes. The native control was 14×14 px — under the
            WCAG 2.2 AA 24×24 target-size floor — and the only reason axe
            did not flag it was the wrapping label. The visible control is
            20×20 with a 24px hit area around it, and the label is the
            target as well.
        */}
        <label
          htmlFor="explore-verified"
          className="flex min-h-[44px] items-center gap-2 text-[12px] text-ink-2 md:min-h-0"
        >
          <input
            id="explore-verified"
            name="verified"
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            // 24px, not 20: WCAG 2.2 SC 2.5.8 asks for a 24x24 target, and
            // the visible control is what a reader aims at.
            className="h-6 w-6 shrink-0 accent-ink"
          />
          Only entries from publisher manifests
        </label>

        <label
          htmlFor="explore-installable"
          className="flex min-h-[44px] items-center gap-2 text-[12px] text-ink-2 md:min-h-0"
        >
          <input
            id="explore-installable"
            name="installable"
            type="checkbox"
            checked={installableOnly}
            onChange={(e) => setInstallableOnly(e.target.checked)}
            // 24px, not 20: WCAG 2.2 SC 2.5.8 asks for a 24x24 target, and
            // the visible control is what a reader aims at.
            className="h-6 w-6 shrink-0 accent-ink"
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

      {/* The rule each filter follows, collapsed: it is reference, and as a
          paragraph it sat between the controls and the first result, which is
          where the reader is looking. The test below opens it. */}
      <details className="mt-2 text-[12px] leading-relaxed text-ink-3">
        <summary className="cursor-pointer text-[12px] text-ink-2">
          What each filter does
        </summary>
        <p className="mt-1 max-w-prose">{FILTER_WHY}</p>
      </details>
    </>
  );
}
