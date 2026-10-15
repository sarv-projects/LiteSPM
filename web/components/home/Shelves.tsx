"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ShelfCard } from "../catalog/ShelfCard";
import type { Shelf, AgentChoice } from "../../lib/landing";
import { rowWorksWithAgent } from "../../lib/landing";
import type { Listing } from "../../lib/telemetry";
import { kindPlural, rowSignal } from "../../lib/catalog";
import { categoryLabel } from "../../app/categories/categoryLabel";
import { formatCount } from "../../lib/format";

/**
 * The labelled shelves the home page is built from — the mcpmarket.com
 * structure: a heading, a real count, a "View all" that opens the same rows
 * in Explore, and six cards.
 *
 * Every shelf is a rule over the catalog (`lib/landing.ts` `SHELVES`), not a
 * hand-picked grid: the heading states what the rule selects, the count is
 * the number of rows it selects at build time, and the link applies the same
 * rule in Explore. A card carries a value (kind, availability, source
 * category, the chosen agent) only when it varies across the shelf; a value
 * that is the same on every card is stated once under the heading, because a
 * row of identical chips is what makes a shelf read as generated rather than
 * curated. The card's accessible name and the entry's own page keep every
 * value findable.
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

/**
 * Values that are identical on every card of one shelf, computed here where
 * the whole shelf is in hand.
 *
 * The defect this removes: all twelve cards of the first two shelves showed
 * the same two chips ("MCP SERVER" + "Remote endpoint"), and on the
 * "Installable right now" shelf installability is true of every card by the
 * shelf's own definition. A value that never varies is a property of the
 * shelf, so it is stated once under the heading and omitted per card; the
 * card's accessible name and the entry page keep it findable. A value that
 * varies stays on the card.
 */
function shelfConstants(items: Listing[], agent: AgentChoice | null) {
  if (items.length === 0) return null;
  const first = items[0];
  const kinds = new Set(items.map((item) => item.kind));
  const signals = new Set(items.map((item) => rowSignal(item).label));
  const categories = new Set(items.map((item) => item.category));
  const works = new Set(items.map((item) => rowWorksWithAgent(item, agent)));
  return {
    kind: kinds.size === 1 ? first.kind : null,
    signal: signals.size === 1 ? rowSignal(first) : null,
    category: categories.size === 1 ? first.category : null,
    /** `null` = varies (or no agent chosen); `true`/`false` = the constant answer. */
    worksWith:
      agent && agent.hosts.length > 0 && works.size === 1 ? works.has(true) : null,
  };
}

function shelfConstantLine(items: Listing[], agent: AgentChoice | null) {
  const constants = shelfConstants(items, agent);
  if (!constants) return null;
  const parts: string[] = [];
  if (constants.kind) parts.push(`all ${kindPlural(constants.kind)}`);
  if (constants.signal) parts.push(`availability “${constants.signal.label}”`);
  if (constants.category) parts.push(`source category “${categoryLabel(constants.category)}”`);
  if (constants.worksWith !== null && agent) {
    parts.push(
      constants.worksWith
        ? `every row works with ${agent.label}`
        : `no row declares ${agent.label}`
    );
  }
  if (parts.length === 0) return null;
  return { constants, parts };
}

export function Shelves({ shelves, agent }: ShelvesProps) {
  if (!shelves.length) return null;

  return (
    <>
      {shelves.map((shelf, index) => {
        const line = shelfConstantLine(shelf.items, agent);
        return (
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

            {/* One line instead of one chip per card. The signal's own note
                rides along, so "Official" keeps its definition even though the
                chip is gone. */}
            {line && (
              <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-3">
                <span className="t-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]">
                  Same on every row shown
                </span>
                : {line.parts.join(" · ")}.{line.constants.signal ? ` ${line.constants.signal.note}` : ""}
              </p>
            )}

            <ul className="mt-4 grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3 md:mt-5">
              {shelf.items.map((item) => (
                <ShelfCard
                  key={item.id}
                  item={item}
                  agent={agent}
                  omitKind={Boolean(line?.constants.kind)}
                  omitSignal={Boolean(line?.constants.signal)}
                  omitCategory={Boolean(line?.constants.category)}
                  omitWorksWith={line !== null && line.constants.worksWith !== null}
                />
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
        );
      })}
    </>
  );
}
