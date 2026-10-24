"use client";

import { uniqueListings } from "../lib/discovery.mjs";

import React, { useDeferredValue, useState, useEffect, useMemo } from "react";
import { Header } from "../components/navigation/Header";
import { SiteFooter } from "../components/layout/SiteFooter";
import { LandingHero } from "../components/home/LandingHero";
import { Shelves } from "../components/home/Shelves";
import { CapabilityTypes } from "../components/home/CapabilityTypes";
import { TopicTiles } from "../components/home/TopicTiles";
import { HowItWorks } from "../components/home/HowItWorks";
import { SearchResults } from "../components/home/SearchResults";
import { WhyLiteSPM } from "../components/marketing/WhyLiteSPM";
import type { Listing } from "../lib/telemetry";
import { useCatalogSearch } from "../lib/useCatalogSearch";
import { AGENT_CHOICES, AGENT_STORAGE_KEY, findAgentChoice } from "../lib/landing";
import type { CuratedGroup, TopicStat } from "../lib/landing";

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
 *   1. hero — the promise, the search and a truthful map of the catalog
 *   2. what do you want your AI to do? — eight goal tiles
 *   3. start here — one curated, installable set, and one secondary group
 *   4. tools, skills and plugins — the three kinds, in plain language
 *   5. how it works — three steps, with the commands
 *   6. choose your agent — the preference, and what each agent gets
 *   7. why LiteSPM — the four reasons to use it over a config file
 *   8. FAQ — the questions, in the order they are asked
 *   9. get started — the commands
 *
 * The `BenefitComparison` section was removed in the 2026-10-20 repositioning:
 * it and `WhyLiteSPM` each explained why LiteSPM beats editing config by hand,
 * and two sections making the same argument made the page longer without making
 * it clearer.
 *
 * The goal tiles move up to second because they are the fastest way in for
 * someone who does not know the vocabulary; the agent strip moves down to
 * sixth because it is a preference, not an entrance.
 */
export interface HomeViewProps {
  total: number;
  duplicateGroups: number[][];
  topics: TopicStat[];
  /** The curated groups, resolved at build time from `data/featured.json`. */
  shelves: CuratedGroup[];
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
  const setQuery = (q: string) => {
    // The search hydrates from the sharded projection; the full row set stays
    // unloaded on this route. The counts above are the prerendered ones.
    setSearchQuery(q);
  };

  const { results, totalMatches, requestMore, error, retry, searching, settled } = useCatalogSearch(
    [],
    deferredQuery,
    { kind: null, category: null },
    { windowed: true, duplicateGroups: props.duplicateGroups }
  );

  const groupedResults = useMemo(() => uniqueListings(results) as Listing[], [results]);
  const matchedCount = results.length >= totalMatches ? groupedResults.length : totalMatches;

  const agent = findAgentChoice(agentId);

  const hasQuery = searchQuery.trim() !== "";

  return (
    <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
      <Header />

      <main id="main" tabIndex={-1} className="flex-1">
        <LandingHero
          total={total}
          query={searchQuery}
          setQuery={setQuery}
          totalMatches={deferredQuery ? matchedCount : undefined}
          settled={settled}
          choice={agent}
          onAgentChange={changeAgent}
        />

        {hasQuery ? (
          <SearchResults
            items={groupedResults}
            query={searchQuery}
            count={matchedCount}
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
            {/* The fastest way in for a visitor without the vocabulary. */}
            <TopicTiles topics={props.topics} />

            {/* One curated, installable set — the shelf the reader can act on
                without learning anything first. */}
            <Shelves groups={props.shelves} agent={agent} />
            <CapabilityTypes />
          </>
        )}

        {/* Three steps, with the commands in the open. Everything that used to
            explain the product in prose — the kinds, the bridge, the agent
            matrix, the FAQ, the command list — moved to the page that is about
            it: /how-it-works, /agents and /support each carry one of those now,
            and this page carries the search and the install. */}
        <HowItWorks />

        {/* The four reasons, and the security policy they point at. */}
        <WhyLiteSPM />
      </main>

      <SiteFooter />
    </div>
  );
}
