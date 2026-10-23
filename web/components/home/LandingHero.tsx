"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SearchBar } from "../navigation/SearchBar";
import { AgentLogo } from "../AgentLogo";
import { AGENT_CHOICES } from "../../lib/landing";
import { formatCount } from "../../lib/format";

/**
 * The first screen states what LiteSPM does and gives readers a real starting
 * point. The overview links use actual catalog filters; the roadmap panel is
 * clearly separate from capabilities that are available today.
 */
export interface LandingHeroProps {
  /** Rows in the catalog — used for the search field's placeholder. */
  total: number;
  query: string;
  setQuery: (q: string) => void;
  totalMatches?: number;
  /** False while the search for `query` is still in flight; see SearchBar. */
  settled?: boolean;
  /** Build-time count using the same predicate as Explore's installable filter. */
  installable: number;
}

const STARTING_POINTS = [
  { label: "Use GitHub", query: "github" },
  { label: "Work with PDFs", query: "pdf" },
  { label: "Design UI", query: "figma" },
  { label: "Browse the web", query: "playwright" },
  { label: "Connect a database", query: "postgres" },
];

const CURRENT_KINDS = [
  { id: "mcp", title: "MCP servers", summary: "Connect tools and data" },
  { id: "skill", title: "Skills", summary: "Add reusable instructions" },
  { id: "plugin", title: "Plugins", summary: "Publisher-provided extensions" },
] as const;

export function LandingHero({
  total,
  query,
  setQuery,
  totalMatches,
  settled,
  installable,
}: LandingHeroProps) {
  const agents = AGENT_CHOICES.filter((choice) => choice.hosts.length > 0);

  return (
    <section className="shell hero-glow pb-10 pt-9 md:pb-14 md:pt-14">
      <div className="hero-layout">
        <div className="hero-copy enter-rise">
          <p className="kicker">One package manager for your AI tools</p>
          <h1 className="mt-4 max-w-[17ch] text-[clamp(2.125rem,1.35rem+3.1vw,3.25rem)] font-semibold leading-[1.06] tracking-tight text-ink">
            Find the right tools for your AI agent.
          </h1>
          <p className="mt-5 max-w-[58ch] text-[15px] leading-relaxed text-ink-2 sm:text-[16px]">
            Browse MCP servers, skills, and eligible plugins. Choose an agent target and see what
            LiteSPM can install before you change your local setup.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/explore/" prefetch={false} className="btn btn-solid btn-lg">
              Explore capabilities
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link href="/get-started/" prefetch={false} className="btn btn-lg">
              Get LiteSPM
            </Link>
          </div>

          <div className="mt-7 max-w-2xl">
            <SearchBar
              query={query}
              setQuery={setQuery}
              totalMatches={totalMatches}
              settled={settled}
              totalCount={total}
              hint={
                query ? undefined : (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>Try:</span>
                    {STARTING_POINTS.map((point) => (
                      <button
                        key={point.query}
                        type="button"
                        onClick={() => setQuery(point.query)}
                        className="chip"
                      >
                        {point.label}
                      </button>
                    ))}
                  </span>
                )
              }
            />
          </div>

          <div className="mt-7">
            <p className="text-[12px] text-ink-3">Browse agent host profiles</p>
            <ul className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <Link
                    href={`/agents/${agent.id}/`}
                    prefetch={false}
                    className="flex items-center gap-2 rounded-chip text-[12.5px] text-ink-2 transition-colors duration-state ease-out hover:text-ink"
                  >
                    <AgentLogo id={agent.id} name={agent.label} size={22} />
                    {agent.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <p
            id="hero-proof-count"
            className="mt-6 flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-ink-3"
          >
            <span className="t-mono t-tabular text-[12.5px] text-ink">
              {formatCount(installable)}
            </span>
            <span>entries LiteSPM can install</span>
            <span aria-hidden="true">·</span>
            <span>catalog snapshot</span>
          </p>
          <p
            id="hero-proof-basis"
            className="mt-1.5 max-w-[56ch] text-[12px] leading-relaxed text-ink-3"
          >
            of {formatCount(total)} catalog entries. Every listing shows its install status and
            the reason when LiteSPM cannot install it.
          </p>
        </div>

        <aside className="hero-overview" aria-label="What LiteSPM manages">
          <div className="hero-overview-head">
            <span className="hero-overview-mark" aria-hidden="true">L</span>
            <div>
              <p className="kicker">LiteSPM marketplace</p>
              <p className="mt-1 text-[17px] font-semibold tracking-tight text-ink">Your agent toolbox</p>
            </div>
          </div>

          <ul className="hero-kind-list" aria-label="Available catalog types">
            {CURRENT_KINDS.map((kind) => (
              <li key={kind.id}>
                <Link href={`/explore/?kind=${kind.id}`} prefetch={false} className="hero-kind-row">
                  <span className={`hero-kind-dot hero-kind-${kind.id}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <strong>{kind.title}</strong>
                    <span>{kind.summary}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-ink-3" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>

          <p className="hero-support-note">
            Support varies by package and agent. Each listing shows the declared targets and whether
            LiteSPM can install it.
          </p>

          <div className="hero-roadmap">
            <span className="hero-roadmap-label">On the roadmap</span>
            <p>
              <strong>Agent packages, apps, and connectors</strong> are part of the broader
              direction; they are not available to install here yet.
            </p>
          </div>
          <p className="hero-local-note">
            Installations run locally from your terminal. This website helps you discover, check,
            and prepare the exact path.
          </p>
        </aside>
      </div>
    </section>
  );
}
