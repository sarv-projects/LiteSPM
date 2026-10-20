"use client";

import React from "react";
import Link from "next/link";
import { UseCaseGrid } from "../marketing/UseCaseGrid";
import type { TopicStat } from "../../lib/landing";

/**
 * "Explore by what you want to do" — the goal tiles, and the first thing on
 * the page after the hero.
 *
 * It used to sit fourth, behind three shelves of catalog rows. That order
 * told a visitor what the site *is* before it told them what to *do*, and the
 * answer it gave first — five shelves of rows — is the one every directory
 * gives. A goal-first entry is the honest substitute: a first-time visitor
 * knows what they want done, and does not know the catalog's vocabulary.
 *
 * The grid itself is `components/marketing/UseCaseGrid.tsx`; this file is the
 * section around it.
 */
export function TopicTiles({ topics }: { topics: TopicStat[] }) {
  return (
    <section className="shell band" aria-labelledby="topics-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Common goals</p>
          <h2 id="topics-title" className="band-title mt-2">
            Explore by what you want to do
          </h2>
          <p className="band-sub">
            Choose a task to discover relevant tools, skills, and integrations.
          </p>
        </div>
        <Link
          href="/categories/"
          className="touch-link text-[13px] text-ink-2 hover:text-accent-text hover:underline"
        >
          All categories →
        </Link>
      </div>

      <UseCaseGrid topics={topics} />
    </section>
  );
}
