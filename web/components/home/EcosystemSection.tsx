"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import { formatCount } from "../../lib/format";
import { DiscoveryCard } from "../ui/DiscoveryCard";

/**
 * Explore the ecosystem: three kind cards and the agents entry point.
 *
 * The J003 pattern shows up here first — a plain-language sentence ("Connect
 * your AI to apps and data") beside the exact technical label the catalog
 * uses (`MCP Server`), so a reader learns the vocabulary without the page
 * pretending the vocabulary is friendlier than it is.
 *
 * Counts come from the build-time slice in `app/page.tsx` and are replaced by
 * the same derivation over the live rows once those are loaded; both run
 * `deriveKindCounts`, so no number can move between the two.
 */
export interface EcosystemSectionProps {
  kindCounts: { all: number; mcp: number; skill: number; plugin: number };
  hostCount: number;
  /** Adapter count for the agents card — the compiled-in registry, not a claim. */
  adapterCount: number;
}

const KIND_CARDS = [
  {
    kind: "mcp",
    badge: "MCP Server",
    title: "MCP servers",
    blurb: "Connect your AI to apps and data.",
    href: "/explore/?kind=mcp",
    cta: "Browse MCP servers",
    countKey: "mcp" as const,
  },
  {
    kind: "skill",
    badge: "Agent Skill",
    title: "Agent skills",
    blurb: "Step-by-step workflows your agent loads when it needs them.",
    href: "/explore/?kind=skill",
    cta: "Browse agent skills",
    countKey: "skill" as const,
  },
  {
    kind: "plugin",
    badge: "Plugin",
    title: "Plugins",
    blurb: "Bundled toolkits that ship skills, servers and commands together.",
    href: "/explore/?kind=plugin",
    cta: "Browse plugins",
    countKey: "plugin" as const,
  },
];

export function EcosystemSection({ kindCounts, hostCount, adapterCount }: EcosystemSectionProps) {
  return (
    <section className="shell band" aria-labelledby="ecosystem-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Three kinds, one install command</p>
          <h2 id="ecosystem-title" className="band-title mt-2">
            Explore the ecosystem
          </h2>
          <p className="band-sub">
            Everything in the catalog is one of three kinds. The kind decides how it installs and
            what it can reach.
          </p>
        </div>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {KIND_CARDS.map((card) => (
          <DiscoveryCard key={card.kind} href={card.href} density="roomy">
            <div className="flex items-center justify-between gap-3">
              <span
                className={`meta-kind meta-kind-${card.kind}`}
                style={{ height: 22, fontSize: 11 }}
              >
                {card.badge}
              </span>
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: `var(--${card.kind})` }}
              />
            </div>

            <h3 className="mt-4 text-[19px] font-semibold tracking-tight text-ink">{card.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{card.blurb}</p>

            <p className="mt-5 flex items-baseline gap-2">
              <span className="t-mono t-tabular text-[28px] font-medium leading-none text-ink">
                {formatCount(kindCounts[card.countKey])}
              </span>
              <span className="t-mono text-[11px] uppercase tracking-wider text-ink-3">
                entries
              </span>
            </p>

            <span className="mt-4 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 transition-colors duration-state ease-out group-hover:text-accent-text">
              {card.cta}
              <ArrowRight
                className="card-arrow h-3.5 w-3.5"
                aria-hidden="true"
              />
            </span>
          </DiscoveryCard>
        ))}

        <DiscoveryCard href="/agents/" density="roomy" plane="sunken">
          <span className="kicker">Compatibility</span>
          <h3 className="mt-4 text-[19px] font-semibold tracking-tight text-ink">Agent hosts</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
            Which hosts LiteSPM can configure itself, which are only declared by publishers, and
            the config file each one reads.
          </p>
          <p className="mt-5 flex items-baseline gap-2">
            <span className="t-mono t-tabular text-[28px] font-medium leading-none text-ink">
              {formatCount(adapterCount)}
            </span>
            <span className="t-mono text-[11px] uppercase tracking-wider text-ink-3">
              compiled-in config adapters
            </span>
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
            The catalog names {formatCount(hostCount)} hosts in total. The rest are declared by
            publishers, and LiteSPM does not edit their config.
          </p>
          {/* Inked, not accented, because this card sits on --sunken: that pair
              measures 4.26:1 for --accent-text and misses AA for 12.5px text,
              while --ink reaches 13.77:1. The other three cards stay on
              --surface, where the accent clears at 5.31:1. */}
          <span className="mt-4 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 transition-colors duration-state ease-out group-hover:text-ink">
            Browse agent hosts
            <ArrowRight
              className="card-arrow h-3.5 w-3.5"
              aria-hidden="true"
            />
          </span>
        </DiscoveryCard>
      </div>
    </section>
  );
}
