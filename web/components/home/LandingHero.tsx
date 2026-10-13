"use client";

import React from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { SearchBar } from "../navigation/SearchBar";
import { BridgeDiagram } from "./BridgeDiagram";
import { copyText } from "../../lib/clipboard";
import { formatCount, shortDigest } from "../../lib/format";
import type { TelemetryState } from "../../lib/telemetry";

/**
 * The hero leads with the promise, not the row count: "Give your AI more
 * abilities." The count still appears — as proof, at the bottom of the column,
 * in mono, where a number belongs.
 *
 * The search here filters the page in place (it is a controlled `SearchBar`,
 * and typing is an interaction, so the dataset request belongs to the first
 * keystroke). The try-chips deliberately do NOT: they deep-link into Explore
 * with parameters that route already parses, so a chip is a link and never a
 * hidden filter.
 */
export interface LandingHeroProps {
  total: number;
  kindCounts: { all: number; mcp: number; skill: number; plugin: number };
  hostCount: number;
  telemetry: TelemetryState;
  query: string;
  setQuery: (q: string) => void;
  totalMatches?: number;
  /** False while the search for `query` is still in flight; see SearchBar. */
  settled?: boolean;
}

/** Real Explore parameters: `?q=` is matched by `matchesQuery`, `?category=`
 *  by an exact category value. Nothing here invents a slug. */
const TRY_CHIPS: Array<{ label: string; href: string }> = [
  { label: "GitHub", href: "/explore/?q=github" },
  { label: "Browser", href: "/explore/?q=browser" },
  { label: "Databases", href: "/explore/?category=Databases" },
  { label: "Files", href: "/explore/?q=document" },
  { label: "Design", href: "/explore/?q=design" },
  { label: "Research", href: "/explore/?q=research" },
];

const QUICKSTART = "npm install -g litespm";

function ReleaseChip({ telemetry }: { telemetry: TelemetryState }) {
  const { status, data } = telemetry;
  const digest = shortDigest(data.manifestDigest);
  const title = [data.releaseId, data.sequence ? `seq ${data.sequence}` : null, digest]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-2.5 py-1 text-[11px] text-ink-3"
      title={title ? `Release verification: ${title}` : undefined}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          status === "ready" ? "bg-accent" : status === "loading" ? "animate-pulse bg-ink-3" : "bg-ink-3/50"
        }`}
      />
      {status === "loading" && "Checking the catalog…"}
      {/* Plain words, not "release origin answering" — that described the
          mechanism to a reader who only wants to know whether what they are
          looking at is current. The release id, sequence and digest stay in the
          title, where someone who does want the mechanism will look. */}
      {status === "ready" && "Catalog is current"}
      {status === "offline" && "Bundled catalog snapshot"}
    </span>
  );
}

export function LandingHero({
  total,
  kindCounts,
  hostCount,
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

  return (
    <section className="shell hero-glow pb-10 pt-9 md:pb-14 md:pt-14">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-12">
        <div className="enter-rise">
          <h1 className="max-w-[20ch] text-[34px] font-semibold leading-[1.06] tracking-tight text-ink sm:text-[44px] lg:text-[54px]">
            One package manager for your AI agents.
          </h1>

          <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-ink-2 sm:text-[17px]">
            Find tools, skills, integrations and AI agents — and see exactly what works with what.
            {/* The brief: the problem in the reader's own experience, then the fix. The four
                pains it names — which file, nothing shows up, hand-edited JSON, restart and
                hope — are the ones people describe most often when they describe setting up an
                MCP server.

                It is nested in this paragraph rather than a sibling after it on purpose: an
                element here changes SearchBar's position in the tree, and React derives
                `useId()` from that position, so a new sibling made the server and client emit
                different ids for the search label and input — a hydration mismatch that leaves
                the label pointing at nothing. Same markup, same look, no extra sibling. */}
            <span className="mt-3 block max-w-[62ch] text-[14px] leading-relaxed text-ink-3 sm:text-[15px]">
              Getting one into your agent usually means hunting for the right config file, editing
              JSON by hand, restarting, and hoping something actually loaded. LiteSPM does that
              part: one command installs a tool into the agent you already use, and one more takes
              it out.
            </span>
          </p>

          <div className="mt-7 max-w-2xl">
            <SearchBar
              query={query}
              setQuery={setQuery}
              totalMatches={totalMatches}
              settled={settled}
              totalCount={total}
              placeholder="What do you want your AI to do?"
              hint={
                query
                  ? undefined
                  : "Searches this page as you type. Press Enter, or open Explore for the full filter surface."
              }
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-ink-3">Try</span>
              {TRY_CHIPS.map((chip) => (
                <Link key={chip.label} href={chip.href} className="chip">
                  {chip.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/explore/" className="btn btn-solid btn-lg">
              Explore capabilities
            </Link>
            {/* "Install LiteSPM" (a second button to the same `#install` anchor
                the sticky header already links to) used to sit here. It and the
                copyable command immediately below it were two ways to do one
                thing, in a column that also carried a third "Install
                instructions" link to the same anchor. The command is the
                concrete one, so it is the one that stayed. */}
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
                aria-label="Copy the install command"
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
            {/* The "Install instructions" link that sat here pointed at the same
                `#install` anchor as the header button, a third time. */}
          </div>

          {/* "The package manager for AI agents." used to sit here as a second
              positioning statement. It is the headline now, so repeating it
              below the fold only competed with the install command above it. */}

          {/* Quiet proof: real numbers from the build-time slice, set small and
              in mono, after the promise rather than instead of it. */}
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-4 text-[12px] text-ink-3">
            <span className="t-mono t-tabular text-ink">{formatCount(total)}</span>
            <span>capabilities</span>
            <span aria-hidden="true">·</span>
            <span className="t-mono t-tabular text-mcp">{formatCount(kindCounts.mcp)}</span>
            <span>MCP</span>
            <span aria-hidden="true">·</span>
            <span className="t-mono t-tabular text-skill">{formatCount(kindCounts.skill)}</span>
            <span>skills</span>
            <span aria-hidden="true">·</span>
            <span className="t-mono t-tabular text-plugin">{formatCount(kindCounts.plugin)}</span>
            <span>plugins</span>
            <span aria-hidden="true">·</span>
            <span className="t-mono t-tabular text-ink">{formatCount(hostCount)}</span>
            <span>agent hosts</span>
            <ReleaseChip telemetry={telemetry} />
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
