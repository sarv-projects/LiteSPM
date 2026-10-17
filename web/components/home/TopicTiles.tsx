"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { TopicStat } from "../../lib/landing";
import { formatCount } from "../../lib/format";
import { DiscoveryCard } from "../ui/DiscoveryCard";

/**
 * The normalized "what do you want your AI to do?" taxonomy.
 *
 * Every tile is a real link into Explore: either an exact `?category=` value
 * the dataset publishes (63 of them, matched case-sensitively) or a `?q=` term
 * the same matcher Explore runs. The friendly label is hand-written; the count
 * and the three example names are computed at build time from the rows the tile
 * actually selects, so a tile can never advertise a capability that its own
 * link would not return.
 */
export function TopicTiles({ topics }: { topics: TopicStat[] }) {
  return (
    <section className="shell band" aria-labelledby="topics-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Common goals</p>
          <h2 id="topics-title" className="band-title mt-2">
            What are you trying to get done?
          </h2>
          <p className="band-sub">
            Pick the goal that matches what you&rsquo;re working on. Each tile opens a real search of
            the catalog; the count and the sample names are what that search returns.
          </p>
        </div>
        <Link href="/categories/" className="touch-link text-[13px] text-ink-2 hover:text-accent-text hover:underline">
          All categories →
        </Link>
      </div>

      <ul className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {topics.map((topic, index) => (
          <li
            key={topic.id}
            className="rise-item"
            style={{ "--rise-i": index } as React.CSSProperties}
          >
            <DiscoveryCard href={topic.href} className="h-full">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-semibold tracking-tight text-ink">{topic.label}</h3>
                <span className="t-mono t-tabular shrink-0 text-[12px] text-ink-3">
                  {formatCount(topic.count)}
                </span>
              </div>

              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{topic.blurb}</p>

              <ul className="mt-3 flex flex-wrap gap-1.5">
                {topic.examples.map((name) => (
                  <li
                    key={name}
                    className="t-mono max-w-full truncate rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10.5px] text-ink-2"
                  >
                    {name}
                  </li>
                ))}
              </ul>

              <span className="mt-4 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 transition-colors duration-state ease-out group-hover:text-accent-text">
                Explore
                <ArrowRight
                  className="card-arrow h-3.5 w-3.5"
                  aria-hidden="true"
                />
              </span>
            </DiscoveryCard>
          </li>
        ))}
      </ul>
    </section>
  );
}
