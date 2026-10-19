"use client";

import React, { useDeferredValue, useState, useEffect } from "react";
import { Header } from "../components/navigation/Header";
import { SiteFooter } from "../components/layout/SiteFooter";
import { LandingHero } from "../components/home/LandingHero";
import { AgentStrip } from "../components/home/AgentStrip";
import { Shelves } from "../components/home/Shelves";
import { TopicTiles } from "../components/home/TopicTiles";
import { HowItWorks } from "../components/home/HowItWorks";
import { AtlasTeaser } from "../components/home/AtlasTeaser";
import { FaqSection } from "../components/home/FaqSection";
import { DeveloperZone } from "../components/home/DeveloperZone";
import { SearchResults } from "../components/home/SearchResults";
import { BenefitComparison } from "../components/marketing/BenefitComparison";
import { WhyLiteSPM } from "../components/marketing/WhyLiteSPM";
import { Listing, useTelemetry } from "../lib/telemetry";
import { useCatalogSearch } from "../lib/useCatalogSearch";
import { AGENT_CHOICES, AGENT_STORAGE_KEY, findAgentChoice } from "../lib/landing";
import type { ProvenanceStats, CuratedGroup, TopicStat } from "../lib/landing";

/**
 * The landing page. Every field here is computed by `app/page.tsx` — a Server
 * Component — from `data/catalog.json` at build time, and serialized into the
 * prerendered HTML. That is what keeps the dataset out of this module: nothing
 * here imports the rows, so hydration runs off the props alone and the reader
 * sees the whole page before any dataset request happens.
 *
 * Exactly one interaction asks for the full row set: typing in the hero
 * search. Everything else — the agent preference, the goal tiles, the curated
 * shelf — runs off the server slice. A passive visit therefore fetches
 * `/v1/current.json` (release liveness, bundled-snapshot fallback) and nothing
 * else; `/data/catalog.json` waits for a keystroke.
 *
 * ## The order of the page
 *
 * It used to be: hero, agent strip, five catalog shelves, goal tiles, five
 * steps, agent teaser, FAQ, install panel. The three catalog shelves came
 * second and the five of them were 42% of the scroll, so a first-time visitor
 * met a catalogue before they met a product, and met five shelves that all
 * said the same thing.
 *
 * Now:
 *
 *   1. hero — the promise, and the product's own recording
 *   2. what do you want your AI to do? — eight goal tiles
 *   3. start here — one curated, installable set, and one secondary group
 *   4. what LiteSPM changes — the lifecycle, before and after
 *   5. how it works — three steps, with the commands
 *   6. choose your agent — the preference, and what each agent gets
 *   7. why LiteSPM — the four reasons to use it over a config file
 *   8. FAQ — the questions, in the order they are asked
 *   9. get started — the commands
 *
 * The goal tiles move up to second because they are the fastest way in for
 * someone who does not know the vocabulary; the agent strip moves down to
 * sixth because it is a preference, not an entrance.
 */
export interface HomeViewProps {
  total: number;
  kindCounts: { all: number; mcp: number; skill: number; plugin: number };
  provenance: ProvenanceStats;
  topics: TopicStat[];
  /** The curated groups, resolved at build time from `data/featured.json`. */
  shelves: CuratedGroup[];
  /**
   * Catalog-wide counts per agent choice, counted at build time from the same
   * rows the client used to count them from. The landing page no longer loads
   * the full row set, so these must arrive as props or the strip loses its
   * numbers.
   */
  agentCounts: Array<{ id: string; count: number }>;
}


export default function Home(props: HomeViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredQuery = useDeferredValue(searchQuery);

  const [agentId, setAgentId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
      if (stored && AGENT_CHOICES.some((c) => c.id === stored)) setAgentId(stored);
    } catch {
      // Storage denied: the strip still works, it just forgets on reload.
    }
  }, []);

  const changeAgent = (id: string) => {
    setAgentId(id);
    try {
      window.localStorage.setItem(AGENT_STORAGE_KEY, id);
    } catch {
      // Best-effort persistence.
    }
  };

  const total = props.total;
  const kindCounts = props.kindCounts;
  const telemetry = useTelemetry(kindCounts);

  const setQuery = (q: string) => {
    // The search hydrates from the sharded projection; the full row set stays
    // unloaded on this route. The counts above are the prerendered ones.
    setSearchQuery(q);
  };

  const { results, totalMatches, requestMore, error, retry, searching, settled } = useCatalogSearch(
    [],
    deferredQuery,
    { kind: null, category: null },
    { windowed: true }
  );

  const agent = findAgentChoice(agentId);

  // Counts come from the prerender now (props.agentCounts): the row set is no
  // longer loaded on this route, and a count must not need it to be.
  const agentCounts = props.agentCounts;

  const hasQuery = searchQuery.trim() !== "";

  return (
    <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
      <Header />

      <main id="main" tabIndex={-1} className="flex-1">
        <LandingHero
          total={total}
          installable={props.provenance.installable}
          query={searchQuery}
          setQuery={setQuery}
          totalMatches={deferredQuery ? totalMatches : undefined}
          settled={settled}
        />

        {hasQuery ? (
          <SearchResults
            items={results}
            query={searchQuery}
            count={totalMatches}
            loading={searching}
            settled={settled}
            awaiting={searching && results.length === 0}
            error={error}
            onRetry={retry}
            onShowMore={requestMore}
            onClear={() => setSearchQuery("")}
            agent={agent}
            total={total}
          />
        ) : (
          <>
            {/* 2 — the fastest way in for a visitor without the vocabulary. */}
            <TopicTiles topics={props.topics} />

            {/* 3 — one curated, installable set and one secondary group. */}
            <Shelves groups={props.shelves} agent={agent} telemetry={telemetry} />

            {/* 4 — the lifecycle, before and after. */}
            <BenefitComparison />
          </>
        )}

        {/* 5 — three steps, with the commands in the open. */}
        <HowItWorks />

        {/* Elevation rhythm: the page was one flat --paper field from the hero
            to the footer, so every band read as the same band. This stretch
            carries its own plane (--sunken), which separates the reader's path
            into readable stretches — product, then reference, then the
            developer close — without striping the page. */}
        <div className="bg-sunken">
          {/* 6 — the preference, and what each agent gets. */}
          <AgentStrip
            choice={agent}
            onChange={changeAgent}
            counts={agentCounts}
            total={total}
          />
          <AtlasTeaser />
        </div>

        {/* 7 — the four reasons. */}
        <WhyLiteSPM />

        {/* 8 — the questions. */}
        <FaqSection />

        <div className="bg-sunken">
          {/* 9 — the commands. */}
          <DeveloperZone />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
