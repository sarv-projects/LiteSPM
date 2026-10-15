"use client";

import React from "react";
import { AGENT_CHOICES } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";
import { HOSTS } from "../../lib/hosts";
import { AgentLogo } from "../AgentLogo";

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
        Choose one and the cards below mark themselves against it. The choice stays in this
        browser — nothing is sent anywhere.
      </>
    );
  } else if (choice.hosts.length === 0) {
    status = (
      <>
        Nothing in the catalog claims to work with{" "}
        <strong className="font-medium text-ink-2">&ldquo;{choice.label}&rdquo;</strong>, so no
        badges will show. Pick a named agent to see its matches.
      </>
    );
  } else if (countFor !== null) {
    status = (
      <>
        <span className="t-mono t-tabular text-ink">{countFor.toLocaleString("en-US")}</span> of{" "}
        <span className="t-mono t-tabular text-ink">{total.toLocaleString("en-US")}</span> entries
        install into <strong className="font-medium text-ink-2">{choice.label}</strong>, derived
        from the adapter registries and publisher declarations. We have not run any of them.
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
      <div className="rounded-card border border-rule bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="agent-strip-title" className="text-[17px] font-semibold tracking-tight text-ink">
            What do you use?
          </h2>
          <p className="text-[12px] text-ink-3">Saved in this browser only</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {AGENT_CHOICES.map((option) => {
            // "Other" and "I'm not sure" are answers, not agents, so they get
            // no mark — a letter tile beside them would read as one.
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

        <p className="mt-3 max-w-prose text-[12px] leading-relaxed text-ink-3">
          A badge means the entry installs into your agent, based on the adapter registries or the
          publisher&rsquo;s own list. It is not a test result.
        </p>
      </div>
    </section>
  );
}
