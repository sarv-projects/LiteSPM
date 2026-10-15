"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ShelfCard } from "../catalog/ShelfCard";
import type { Shelf, AgentChoice } from "../../lib/landing";
import { formatCount } from "../../lib/format";

/**
 * The labelled shelves the home page is built from — the mcpmarket.com
 * structure: a heading, a real count, a "View all" that opens the same rows
 * in Explore, and six cards.
 *
 * Every shelf is a rule over the catalog (`lib/landing.ts` `SHELVES`), not a
 * hand-picked grid: the heading states what the rule selects, the count is
 * the number of rows it selects at build time, and the link applies the same
 * rule in Explore. The cards carry the strongest signal the row has — whether
 * it installs, or that it is a publisher's own skill — because no popularity
 * figure exists in the data to show.
 *
 * Rhythm: each shelf is a band bounded by a hairline rule, with the same
 * padding above and below, and the card grid is `auto-rows-fr` so every row of
 * cards in a shelf is exactly as tall as the tallest — a one-line summary can
 * no longer leave a stub card with a hole under it. The bands used to be 44px
 * of nothing on each side, which put ~90px of blank paper between the last card
 * of one shelf and the title of the next; a shelf should read as a chapter
 * break, not as a missing section.
 */
export interface ShelvesProps {
  shelves: Shelf[];
  agent: AgentChoice | null;
}

export function Shelves({ shelves, agent }: ShelvesProps) {
  if (!shelves.length) return null;

  return (
    <>
      {shelves.map((shelf, index) => (
        <section
          key={shelf.id}
          className={`shell ${index === 0 ? "pt-8 md:pt-10" : "border-t border-rule pt-7 md:pt-8"} pb-7 md:pb-8`}
          aria-labelledby={`shelf-${shelf.id}`}
        >
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <h2 id={`shelf-${shelf.id}`} className="band-title">
                {shelf.title}
              </h2>
              <span className="t-mono t-tabular text-[12px] text-ink-3">
                {formatCount(shelf.count)}
              </span>
            </div>
            <Link
              href={shelf.href}
              className="touch-link inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-accent-text hover:underline"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <ul className="mt-4 grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3 md:mt-5">
            {shelf.items.map((item) => (
              <ShelfCard key={item.id} item={item} agent={agent} />
            ))}
          </ul>

          {/* The one honesty statement this shelf raises, said once, in plain
              words: the rows are real publisher records, and plugin installs
              are the one kind that cannot complete yet. */}
          {shelf.id === "plugins" && (
            <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
              Read from the publishers&rsquo; own marketplaces. Plugin bundles are listed, not
              installable yet — LiteSPM fails closed rather than half-installing one.
            </p>
          )}
        </section>
      ))}
    </>
  );
}
