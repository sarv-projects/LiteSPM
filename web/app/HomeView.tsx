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
import { Listing, useTelemetry } from "../lib/telemetry";
import { useCatalogSearch } from "../lib/useCatalogSearch";
import { AGENT_CHOICES, AGENT_STORAGE_KEY, findAgentChoice } from "../lib/landing";
import type { ProvenanceStats, Shelf, TopicStat } from "../lib/landing";

/**
 * The landing page. Every field here is computed by `app/page.tsx` — a Server
 * Component — from `data/catalog.json` at build time, and serialized into the
 * prerendered HTML. That is what keeps the dataset out of this module: nothing
 * here imports the rows, so hydration runs off the props alone and the reader
 * sees the whole page before any dataset request happens.
 *
 * Exactly one interaction asks for the full row set: typing in the hero
 * search. Everything else — the agent preference, the topic tiles, the
 * shelves — runs off the server slice or off what a row's kind derives. A
 * passive visit therefore fetches `/v1/current.json`
 * (release liveness, bundled-snapshot fallback) and nothing else;
 * `/data/catalog.json` waits for a keystroke.
 */
export interface HomeViewProps {
  total: number;
  kindCounts: { all: number; mcp: number; skill: number; plugin: number };
  provenance: ProvenanceStats;
  topics: TopicStat[];
  /** The labelled shelves, resolved at build time from their own rules. */
  shelves: Shelf[];
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

      <main id="main" className="flex-1">
        <LandingHero
          total={total}
          kindCounts={kindCounts}
          telemetry={telemetry}
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
            <AgentStrip
              choice={agent}
              onChange={changeAgent}
              counts={agentCounts}
              total={total}
            />
            <Shelves shelves={props.shelves} agent={agent} />
            <TopicTiles topics={props.topics} />
          </>
        )}

        <HowItWorks />
        {/* Elevation rhythm: the page was one flat --paper field from the hero
            to the footer, so every band read as the same band. These two carry
            their own plane instead (--sunken), which separates the reader's
            path into three readable stretches — action, reference, then the
            developer/install close — without striping the page: the FAQ and
            the cards between them stay on --paper. The dark install panel is
            untouched and remains the highest-contrast surface on the page. */}
        <div className="bg-sunken">
          <AtlasTeaser />
        </div>
        <FaqSection />
        <div className="bg-sunken">
          <DeveloperZone />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
