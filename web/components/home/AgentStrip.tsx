"use client";

import React from "react";
import { AGENT_CHOICES } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";
import { HOSTS } from "../../lib/hosts";
import { AgentLogo } from "../AgentLogo";
import { DiscoveryCard } from "../ui/DiscoveryCard";
import { formatCount } from "../../lib/format";

/**
 * "Choose your agent" — a preference, not a filter engine, and not a
 * detection.
 *
 * The choice is written to `localStorage["litespm-agent"]` and read back on
 * mount. Selecting an agent only changes what the cards already on the page
 * *say*: it derives a "Works with …" badge from rows the build handed over. It
 * never calls `useCatalog().request()` — a preference must not be able to
 * pull the whole row set down.
 *
 * The honest sentence is the important part of this section, and it is now
 * above the fold of the section rather than implied: **a browser preference
 * is not machine detection.** This page cannot see what is installed on the
 * reader's machine, and the chips do not pretend otherwise — they are a way
 * of telling the catalog which agent's compatibility list to show.
 *
 * Counts arrive as build-time props over the full snapshot, so the strip can
 * print a catalog-wide number without the row set ever being requested.
 */
export interface AgentStripProps {
  choice: AgentChoice | null;
  onChange: (id: string) => void;
  /** Catalog-wide counts per choice, or null while the rows are unloaded. */
  counts: Array<{ id: string; count: number }> | null;
  total: number;
}

export function AgentStrip({ choice, onChange, counts, total }: AgentStripProps) {
  const countFor = counts?.find((c) => c.id === choice?.id)?.count ?? null;

  let status: React.ReactNode;
  if (!choice) {
    status = (
      <>
        Choose an agent to highlight relevant capabilities. Your selection stays in this browser.
      </>
    );
  } else if (choice.hosts.length === 0) {
    status = (
      <>
        Select a supported agent to see its catalog compatibility information.
      </>
    );
  } else if (countFor !== null) {
    status = (
      <>
        <strong className="font-medium text-ink-2">{choice.label}</strong> appears in the compatibility
        information for <span className="t-mono t-tabular text-ink">{formatCount(countFor)}</span>{" "}
        of <span className="t-mono t-tabular text-ink">{formatCount(total)}</span> catalog entries.
        Compatibility is declared, not independently tested.
      </>
    );
  } else {
    status = (
      <>
        The entries on this page are marked against{" "}
        <strong className="font-medium text-ink-2">{choice.label}</strong> from the rows already
        on this page. Open any entry for its full host list.
      </>
    );
  }

  return (
    <section className="shell band" aria-labelledby="agent-strip-title">
      <DiscoveryCard density="panel">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="agent-strip-title" className="text-[19px] font-semibold tracking-tight text-ink">
            Choose your agent
          </h2>
          <p className="text-[12px] text-ink-3">Saved on this device</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {AGENT_CHOICES.map((option) => {
            // "Other" is an answer, not an agent, so it gets no mark — a
            // letter tile beside it would read as one.
            const isHost = HOSTS.some((h) => h.id === option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={choice?.id === option.id}
                onClick={() => onChange(option.id)}
                className="chip inline-flex items-center gap-1.5"
              >
                {isHost && <AgentLogo id={option.id} name={option.label} size={16} />}
                {option.label}
              </button>
            );
          })}
        </div>

        {/* The answer is the only thing that moves: re-keyed on the choice so a
            new answer rises in, while the chip row above stays still. The
            static first paint renders the prompt unchanged (no `strip-answer`
            without a choice), so nothing animates on load. */}
        <p
          key={choice?.id ?? "none"}
          className={`mt-4 max-w-prose text-[13.5px] leading-relaxed text-ink-2${choice ? " strip-answer" : ""}`}
        >
          {status}
        </p>
      </DiscoveryCard>
    </section>
  );
}
