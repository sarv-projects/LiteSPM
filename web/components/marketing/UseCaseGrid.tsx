import React from "react";
import { ArrowRight, Code2, Database, FileText, Globe, Palette, Rocket, Search, ShieldCheck } from "lucide-react";
import { DiscoveryCard } from "../ui/DiscoveryCard";
import type { TopicStat } from "../../lib/landing";

/**
 * The goal grid — "What do you want your AI to do?".
 *
 * A goal-first entry, because a visitor who arrives without the vocabulary
 * ("MCP", "transport", "registry") is asking a question in the wrong words,
 * and the catalog's own labels are worse at answering it than the task is:
 * two thirds of the catalog sits in one source category called "Developer
 * Tools", which answers nothing.
 *
 * Three rules the grid keeps:
 *
 *  1. **One taxonomy.** Every tile opens Explore's own `?goal=` filter, so the
 *     tile and the page it opens are the same filter over the same rows. No
 *     tile quietly means a source category, and no tile means a different
 *     thing from the label it carries.
 *  2. **A plain benefit.** The line under the title says what the agent will
 *     be able to do, not what the capability is called.
 *  3. **No raw count.** A count on a goal tile is the number most likely to be
 *     read as a promise, and it is the number the reader is least able to act
 *     on. The tile is a way in, not a measurement.
 */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  coding: Code2,
  productivity: FileText,
  web: Palette,
  automation: Globe,
  research: Search,
  data: Database,
  infrastructure: Rocket,
  security: ShieldCheck,
};

/** How many goals the home page shows. */
export const HOME_GOAL_COUNT = 6;

export function UseCaseGrid({ topics, limit }: { topics: TopicStat[]; limit?: number }) {
  const shown = typeof limit === "number" ? topics.slice(0, limit) : topics;
  return (
    <ul
      className={
        shown.length === 6
          ? "mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          : "mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      }
    >
      {shown.map((topic, index) => {
        const Icon = ICONS[topic.goal] ?? FileText;
        return (
          <li
            key={topic.id}
            className="rise-item"
            style={{ "--rise-i": index } as React.CSSProperties}
          >
            <DiscoveryCard href={topic.href} className="h-full">
              <span
                aria-hidden="true"
                className="inline-flex h-9 w-9 items-center justify-center rounded-chip border border-rule bg-sunken text-ink-2"
              >
                <Icon className="h-4 w-4" />
              </span>

              <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-ink">
                {topic.label}
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{topic.blurb}</p>

              <span className="mt-4 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 transition-colors duration-state ease-out group-hover:text-accent-text">
                Explore
                <ArrowRight className="card-arrow h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </DiscoveryCard>
          </li>
        );
      })}
    </ul>
  );
}
