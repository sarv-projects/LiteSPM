"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ShelfCard } from "../catalog/ShelfCard";
import type { AgentChoice, CuratedGroup } from "../../lib/landing";
import type { Listing } from "../../lib/telemetry";

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
 * and they put plugins — a kind the product could not yet install — on a
 * shelf of its own, level with the two kinds it could. (Plugins install now,
 * from a publisher's pinned source; the sentence records why the shelf went.)
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
}

export function Shelves({ groups, agent }: ShelvesProps) {
  if (!groups.length) return null;

  // One row, mixed kinds: take from each group in turn rather than showing
  // every server and then every skill, so the row answers "what is this?" for
  // the whole catalog instead of for one third of it. The page used to render
  // two labelled groups of six; a reader looking for one kind was scrolling
  // the other.
  const mixed: ShelvesProps["groups"][number]["entries"] = [];
  for (let i = 0; i < 6; i += 1) {
    for (const group of groups) {
      const entry = group.entries[i];
      if (entry && mixed.length < 6) mixed.push(entry);
    }
  }

  return (
    <section className="shell band" aria-labelledby="start-here-title">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="kicker">Start here</p>
          <h2 id="start-here-title" className="band-title mt-2">
            A good place to start.
          </h2>
          <p className="band-sub">
            Useful additions, explained in plain language.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href="/explore/"
            className="touch-link inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-accent-text hover:underline"
          >
            Browse all packages
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <ul className="mt-7 grid grid-cols-1 auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {mixed.map((entry, index) => (
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
    </section>
  );
}
