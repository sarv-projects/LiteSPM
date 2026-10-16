"use client";

import React from "react";
import { AGENT_CHOICES } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";
import { HOSTS } from "../../lib/hosts";
import { AgentLogo } from "../AgentLogo";
import { DiscoveryCard } from "../ui/DiscoveryCard";
import { formatCount } from "../../lib/format";

/**
 * "What do you use?" — a preference, not a filter engine.
 *
 * The choice is written to `localStorage["litespm-agent"]` and read back on
 * mount. Selecting an agent only changes what the cards already on the page
 * SAY: it derives a "Works with …" badge from rows the build handed over. It
 * never calls `useCatalog().request()` — a preference must not be able to pull
 * 3.8 MB of rows down, and the E1 contract puts every dataset request behind an
 * explicit interaction with the data itself.
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
        Choose one, and the cards below will show whether they work with it. The choice stays in
        this browser — nothing is sent anywhere.
      </>
    );
  } else if (choice.hosts.length === 0) {
    status = (
      <>
        There is no compatibility list to check{" "}
        <strong className="font-medium text-ink-2">&ldquo;{choice.label}&rdquo;</strong> against,
        so no badges will show. Pick a named agent above to see its matches.
      </>
    );
  } else if (countFor !== null) {
    status = (
      <>
        <span className="t-mono t-tabular text-ink">{formatCount(countFor)}</span> of{" "}
        <span className="t-mono t-tabular text-ink">{formatCount(total)}</span> entries work with{" "}
        <strong className="font-medium text-ink-2">{choice.label}</strong>, based on the adapter
        registries and publisher declarations. None of them has been tested by us.
      </>
    );
  } else {
    status = (
      <>
        The cards below are marked against{" "}
        <strong className="font-medium text-ink-2">{choice.label}</strong> from the rows already on
        this page. Open any card for its full host list.
      </>
    );
  }

  return (
    <section className="shell band" aria-labelledby="agent-strip-title">
      <DiscoveryCard density="panel">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="agent-strip-title" className="text-[17px] font-semibold tracking-tight text-ink">
            What do you use?
          </h2>
          <p className="text-[12px] text-ink-3">Saved in this browser only</p>
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

        <p className="mt-4 max-w-prose text-[13px] leading-relaxed text-ink-2">{status}</p>
      </DiscoveryCard>
    </section>
  );
}
