"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ShelfCard } from "../catalog/ShelfCard";
import type { AgentChoice, CuratedGroup } from "../../lib/landing";
import type { Listing } from "../../lib/telemetry";
import type { TelemetryState } from "../../lib/telemetry";

/**
 * The curated shelf — two groups, twelve entries, one of each kind of proof
 * the page needs.
 *
 * ## What replaced what
 *
 * The home page used to open with **five** shelves: "Installable right now",
 * "From the Official MCP Registry", "Official agent skills", "Agent skills"
 * and "Plugins". Together they were 42% of the page's scroll length, they
 * repeated each other (four of the five were a filter over the same rows),
 * and they put the un-installable kind — plugins — on a shelf of its own,
 * level with the two kinds the product can actually install.
 *
 * This is one curated set and one secondary group, both read from
 * `data/featured.json`, both checked against the dataset at build time
 * (`deriveShelves` in `lib/landing.ts`): an id that is not in the catalog, a
 * row that cannot be installed, a row whose source is not the one the file
 * declares, or a row that depends on a host whose vendor has ended, and the
 * build fails.
 *
 * ## What a card says
 *
 * The card is the site's own `ShelfCard`, so the shelf looks like every other
 * list of entries on the site. One thing differs, on purpose: **the one-line
 * description is ours**, not the publisher's. A curated set is an editorial
 * set, and the reason to curate is to say in plain words what a capability is
 * *for* — "read a repository, open an issue, comment on a pull request" —
 * rather than to repeat the publisher's own marketing line. The publisher's
 * own summary is on the entry page, one click away, and the card still names
 * the publisher and the kind.
 *
 * Each group is **one provenance**, so the line above it is true of every row
 * in it: the first group is read from the publisher's own manifest and
 * published in the Official MCP Registry, the second is marked official by the
 * list it came from — which is the publisher's label, not our verdict.
 *
 * No counts. A curated set is a recommendation, and a number beside a
 * recommendation reads as a ranking the catalog cannot support — there is no
 * popularity data anywhere on this site.
 */

export interface ShelvesProps {
  groups: CuratedGroup[];
  agent: AgentChoice | null;
  /** The release stamp, so the reader knows which snapshot this set is from. */
  telemetry: TelemetryState;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "17 October 2026" from the release's ISO timestamp, in UTC so the
 * prerendered HTML and the hydrated client always agree on the string.
 * Returns null for a missing or unparseable stamp rather than a placeholder
 * date — a wrong date is worse than none.
 */
function releaseDateLabel(createdAt?: string): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getFullYear()}`;
}

/**
 * The catalog stamp.
 *
 * It used to sit in the hero, next to the counts that rotated. It belongs
 * here instead: this is the section that publishes specific rows out of a
 * specific snapshot, so this is where "which snapshot, and is it current?"
 * belongs. The three states are the ones the telemetry hook can actually
 * observe — the origin answered, it did not answer, or it has not answered
 * yet — and none of them claims a freshness the site has not checked.
 */
function CatalogStamp({ telemetry }: { telemetry: TelemetryState }) {
  const { status, data } = telemetry;
  const title = [data.releaseId, data.sequence ? `seq ${data.sequence}` : null]
    .filter(Boolean)
    .join(" · ");
  const updated = releaseDateLabel(data.createdAt);

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
      {updated && (
        <>
          <span>Catalog snapshot, {updated}</span>
          <span aria-hidden="true">·</span>
        </>
      )}
      <span
        className="inline-flex items-center gap-1.5"
        title={title ? `Catalog release ${title}` : undefined}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${
            status === "ready" ? "bg-accent" : status === "loading" ? "animate-pulse bg-ink-3" : "bg-ink-3/50"
          }`}
        />
        {status === "loading" && "checking the catalog…"}
        {status === "ready" && "catalog is current"}
        {status === "offline" && "bundled snapshot"}
      </span>
    </p>
  );
}

export function Shelves({ groups, agent, telemetry }: ShelvesProps) {
  if (!groups.length) return null;

  return (
    <section className="shell band" aria-labelledby="start-here-title">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="kicker">Start here</p>
          <h2 id="start-here-title" className="band-title mt-2">
            A hand-picked set from the whole catalog
          </h2>
          <p className="band-sub">
            Every entry below is one LiteSPM can install today — no discovery-only rows, no
            plugins. Each one is a catalog id, checked against the dataset when this page is built.
            The one line on each card is ours; the publisher&rsquo;s own summary is on its entry
            page.
          </p>
        </div>
        <CatalogStamp telemetry={telemetry} />
      </div>

      {groups.map((group) => (
        <div key={group.id} className="mt-8 first:mt-7">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">{group.title}</h3>
              <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink-2">
                {group.blurb}
              </p>
            </div>
            <Link
              href={group.viewAll.href}
              className="touch-link inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-accent-text hover:underline"
            >
              {group.viewAll.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <ul className="mt-4 grid grid-cols-1 auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.entries.map((entry, index) => (
              <ShelfCard
                key={entry.id}
                // The card's description is the editorial line, not the
                // publisher's own summary: that plain-language "what is this
                // for" is the reason the set is curated at all. Everything
                // else on the card is still the row's own fact.
                item={{ ...entry.item, summary: entry.useCase } as Listing}
                agent={agent}
                entranceIndex={index}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
