"use client";

import React from "react";
import { Check, Copy } from "lucide-react";
import { SearchBar } from "../navigation/SearchBar";
import { BridgeDiagram } from "./BridgeDiagram";
import { KindCycle } from "./KindCycle";
import { copyText } from "../../lib/clipboard";
import { formatCount } from "../../lib/format";
import type { TelemetryState } from "../../lib/telemetry";

/**
 * The hero: one promise, the search box, the install command — and a single
 * mono line of scale and freshness above them, the way mcpmarket.com leads
 * with "49,501 Servers · Updated just now".
 *
 * The scale line keeps the total and the freshness. The per-kind figures moved
 * one line down, onto `KindCycle`, which holds them one at a time in each
 * kind's own hue and count — the honest equivalent of the competitor's hero
 * typewriter (see `KindCycle` for why it does not type, and for how the line's
 * box is held constant whether it cycles or not, at every width). Read without
 * JavaScript, with reduced motion, or before hydration, the cycle is the same
 * three figures in a still row.
 *
 * What is deliberately NOT here: the three-line paragraph about hunting config
 * files, the six "Try" chips, a second CTA, and the npm caveat. Each was
 * defensible on its own and together they meant six things competed before
 * anything else, one of them an apology. The npm caveat still exists — in
 * `DeveloperZone`, where the install section actually lives and where someone
 * about to paste the command will read it.
 *
 * The search here filters the page in place (it is a controlled `SearchBar`,
 * and typing is an interaction, so the dataset request belongs to the first
 * keystroke). Enter opens Explore, which the hint says in five words.
 */
export interface LandingHeroProps {
  total: number;
  kindCounts: { all: number; mcp: number; skill: number; plugin: number };
  telemetry: TelemetryState;
  query: string;
  setQuery: (q: string) => void;
  totalMatches?: number;
  /** False while the search for `query` is still in flight; see SearchBar. */
  settled?: boolean;
}

const QUICKSTART = "npm install -g litespm";

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
 * "15 October 2026" from the release's ISO timestamp, in UTC so the
 * prerendered HTML and the hydrated client always agree on the string.
 * Returns null for a missing or unparseable stamp rather than a placeholder
 * date — a wrong date is worse than none.
 */
function releaseDateLabel(createdAt?: string): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function ReleaseChip({ telemetry }: { telemetry: TelemetryState }) {
  const { status, data } = telemetry;
  const title = [data.releaseId, data.sequence ? `seq ${data.sequence}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-ink-3"
      title={title ? `Release verification: ${title}` : undefined}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          status === "ready" ? "bg-accent" : status === "loading" ? "animate-pulse bg-ink-3" : "bg-ink-3/50"
        }`}
      />
      {/*
        The initial state is "bundled snapshot", not "checking the catalog…":
        the prerendered HTML ships whichever string is here, and only the
        client can resolve a check — so a reader without JavaScript (exactly
        the reader this site advertises supporting) used to sit on a permanent
        loading state. "Bundled snapshot" is true in every state the server can
        render: the counts above it come from the bundled release until the
        origin's manifest answers and the chip says "catalog is current".
      */}
      {status === "loading" && "bundled snapshot"}
      {status === "ready" && "catalog is current"}
      {status === "offline" && "bundled snapshot"}
    </span>
  );
}

export function LandingHero({
  total,
  kindCounts,
  telemetry,
  query,
  setQuery,
  totalMatches,
  settled,
}: LandingHeroProps) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    const ok = await copyText(QUICKSTART, "Install command copied");
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const updated = releaseDateLabel(telemetry.data.createdAt);

  return (
    <section className="shell hero-glow pb-10 pt-9 md:pb-14 md:pt-14">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-12">
        <div className="enter-rise">
          {/* Scale and freshness, first line — a fact strip, not prose. */}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
            <span className="t-mono t-tabular text-ink">{formatCount(total)}</span>
            <span>capabilities</span>
            {updated && (
              <>
                <span aria-hidden="true">·</span>
                <span>updated {updated}</span>
              </>
            )}
            <ReleaseChip telemetry={telemetry} />
          </p>

          {/* The kind figures, cycled one at a time in each kind's own hue.
              Still row without JavaScript or motion; see KindCycle. */}
          <KindCycle counts={kindCounts} />

          <h1 className="mt-5 max-w-[20ch] text-[34px] font-semibold leading-[1.06] tracking-tight text-ink sm:text-[44px] lg:text-[54px]">
            One package manager for your AI agents.
          </h1>

          <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-ink-2 sm:text-[17px]">
            Install MCP servers, skills and plugins into the agent you already use — one catalog,
            one command.
          </p>

          <div className="mt-7 max-w-2xl">
            <SearchBar
              query={query}
              setQuery={setQuery}
              totalMatches={totalMatches}
              settled={settled}
              totalCount={total}
              placeholder="What do you want your AI to do?"
              hint={query ? undefined : "Press Enter to search the full catalog."}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="cmd">
              <span aria-hidden="true" className="text-dark-ink-2">
                $
              </span>
              <code className="select-all">{QUICKSTART}</code>
              <button
                type="button"
                onClick={onCopy}
                aria-label={copied ? "Copied" : "Copy the install command"}
                className="btn shrink-0 border-dark-rule! bg-dark-2! text-dark-ink!"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </span>
          </div>
        </div>

        <div className="enter-rise" style={{ animationDelay: "80ms" }}>
          <div className="rounded-card border border-rule bg-surface p-3 shadow-[0_1px_2px_rgba(23,32,47,0.04)] sm:p-5">
            <div className="mb-3 t-mono text-[11px] uppercase tracking-wider text-ink-3">
              one bridge, every capability
            </div>
            <BridgeDiagram />
          </div>
        </div>
      </div>
    </section>
  );
}
