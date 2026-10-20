"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SearchBar } from "../navigation/SearchBar";
import { ProductDemo } from "../marketing/ProductDemo";
import { AgentLogo } from "../AgentLogo";
import { AGENT_CHOICES } from "../../lib/landing";
import { formatCount } from "../../lib/format";

/**
 * The hero, in two columns: the promise on the left, the proof on the right.
 *
 * ## What is in the left column
 *
 * The eyebrow, the H1, two lines of support copy, the two calls to action,
 * the search field, and the row of agent logos. That is the order a reader
 * scans it in, and nothing else is on this page above the fold: the count
 * strip that used to sit here moved down to the curated shelf, and the
 * rotating kind figures are gone entirely.
 *
 * ## What is in the right column
 *
 * `ProductDemo` — the recorded walkthrough, or, until the recording exists,
 * the clearly-labelled placeholder that says what it will cover. The old
 * right-hand column was the bridge figure, which is a diagram of the
 * architecture; the first screen of a product page has to show the product
 * working, not a picture of how it is put together.
 *
 * ## The H1
 *
 * "Give your coding agents the tools they're missing — safely." The original
 * sentence claimed something the site cannot check: a static export has no
 * idea what any given agent is missing. Safety is the thing it *can* prove —
 * a preview before the change, an approval, a backup, an undo — so that is
 * the word the page leads with.
 *
 * ## The search field
 *
 * It stays in the left column, below the actions: the catalogue's door, not
 * the product's headline. The shortcuts under it are the honest substitute
 * for semantic search — four words a first-time visitor can recognise, each
 * one a real prefix the matcher answers to.
 */
export interface LandingHeroProps {
  /** Rows in the catalog — used for the search field's placeholder. */
  total: number;
  query: string;
  setQuery: (q: string) => void;
  totalMatches?: number;
  /** False while the search for `query` is still in flight; see SearchBar. */
  settled?: boolean;
  /**
   * How many entries LiteSPM can install today — the same predicate Explore's
   * "installable" filter uses, counted at build time.
   */
  installable: number;
}

/**
 * The four starting points under the search field.
 *
 * Each is a word the matcher answers to as a prefix, and each names a thing
 * the catalog actually holds. They are shortcuts, not a claim about what
 * people search for — the catalog publishes no usage data, so this page does
 * not pretend to know.
 */
const STARTING_POINTS = [
  { label: "GitHub", query: "github" },
  { label: "PDFs", query: "pdf" },
  { label: "Figma", query: "figma" },
  { label: "Browser automation", query: "playwright" },
];

export function LandingHero({
  total,
  query,
  setQuery,
  totalMatches,
  settled,
  installable,
}: LandingHeroProps) {
  const agents = AGENT_CHOICES.filter((choice) => choice.hosts.length > 0);

  return (
    <section className="shell hero-glow pb-10 pt-9 md:pb-14 md:pt-14">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-12">
        <div className="enter-rise">
          {/* The eyebrow. It says what the product is in three words: one
              local bridge, and the agents that reach it. The catalog sits
              underneath it, not in place of it. */}
          <p className="kicker">The marketplace for AI agent capabilities</p>

          {/*
            The one number the hero carries.

            It used to be three, cycling: 48,418 MCP servers, then 20,320
            skills, then 638 plugins — a number that changed under the reader,
            in the most-read position on the page, with no pause control. Two
            of those three kinds were not even installable.

            This is one number, and it is the one that matters: the rows
            `litespm install` can actually complete for, counted at build time
            with the same predicate Explore's "installable" filter uses. It is
            the number the site's own filter produces, and it does not move.
          */}
          <p
            id="hero-proof-count"
            className="mt-3 flex items-baseline gap-1.5 text-[12.5px] text-ink-3"
          >
            <span className="t-mono t-tabular text-[13.5px] text-ink">
              {formatCount(installable)}
            </span>
            <span>capabilities LiteSPM can install</span>
            {/* A snapshot, not a live figure: the numbers are counted at
                build time from one release, and a reader who takes them for a
                live feed would be wrong about what the page knows. */}
            <span className="text-ink-3">· catalog</span>
            <span>snapshot</span>
          </p>

          {/* Fluid between the sizes the page already used: 34px on a phone,
              42px on a tablet, 52px on a desktop, without a breakpoint
              staircase between them. The two-line shape on a wide screen is
              the same one the fixed sizes gave. */}
          <h1 className="mt-4 max-w-[20ch] text-[clamp(2.125rem,1.35rem+3.1vw,3.25rem)] font-semibold leading-[1.06] tracking-tight text-ink">
            Find the right tools for your AI agents.
          </h1>

          <p className="mt-5 max-w-prose text-[15px] leading-relaxed text-ink-2 sm:text-[16px]">
            Discover MCP servers, skills, and plugins for Claude Code, Codex, OpenCode, and more.
            Compare options, check compatibility, and install supported capabilities with LiteSPM.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/get-started/" prefetch={false} className="btn btn-solid btn-lg">
              Get LiteSPM
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link href="/how-it-works/" prefetch={false} className="btn btn-lg">
              See how it works
            </Link>
          </div>

          <div className="mt-7 max-w-2xl">
            <SearchBar
              query={query}
              setQuery={setQuery}
              totalMatches={totalMatches}
              settled={settled}
              totalCount={total}
              hint={
                query ? undefined : (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>Try:</span>
                    {STARTING_POINTS.map((point) => (
                      <button
                        key={point.query}
                        type="button"
                        onClick={() => setQuery(point.query)}
                        className="chip"
                      >
                        {point.label}
                      </button>
                    ))}
                  </span>
                )
              }
            />
          </div>

          {/* The agents, by name. The claim is the one the catalog can back:
              each of these has a bridge adapter and a skills directory. */}
          <div className="mt-7">
            <p className="text-[12px] text-ink-3">Works with</p>
            <ul className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <Link
                    href={`/agents/${agent.id}/`}
                    prefetch={false}
                    className="flex items-center gap-2 rounded-chip text-[12.5px] text-ink-2 transition-colors duration-state ease-out hover:text-ink"
                  >
                    <AgentLogo id={agent.id} name={agent.label} size={22} />
                    {agent.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="enter-rise" style={{ animationDelay: "80ms" }}>
          <ProductDemo />
        </div>
      </div>
    </section>
  );
}
