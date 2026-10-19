"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { HOSTS, SKILL_TARGETS } from "../../lib/hosts";
import type { HostAdapter } from "../../lib/hosts";
import { isDiscontinued } from "../../lib/lifecycle";
import { AgentLogo } from "../AgentLogo";
import { DiscoveryCard } from "../ui/DiscoveryCard";

/**
 * Agent hosts teaser: five cards built strictly from the two generated
 * registries (`data/hosts.json`, `data/skill-targets.json`), which are emitted
 * from the same Go tables the binary writes with. Every chip is a fact one of
 * those tables states — config format, a compiled-in adapter, a skills
 * directory, the universal-skills flag — and nothing is inferred: no OS
 * support, no "best for", no compatibility the data does not carry.
 *
 * No `/compare` link: that route does not exist yet (`LPSM-J007`).
 */
const TEASER_IDS = ["claude-code", "codex", "opencode", "cursor", "cline"].filter(
  // Belt and braces: this list is curated by hand, so a product ending would
  // otherwise still get a card here. `lifecycle.ts` is the signal.
  (id) => !isDiscontinued(id)
);

function skillTarget(id: string) {
  return SKILL_TARGETS.find((t) => t.id === id);
}

function hostAdapter(id: string): HostAdapter | undefined {
  return HOSTS.find((h) => h.id === id);
}

export function AtlasTeaser() {
  return (
    <section className="shell band" aria-labelledby="atlas-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Agent hosts</p>
          <h2 id="atlas-title" className="band-title mt-2">
            Works with the agent you already use
          </h2>
          <p className="band-sub">
            LiteSPM adds one bridge entry to each agent&rsquo;s own config file. Here are five of
            the hosts it can set up, with the file each one uses.
          </p>
        </div>
        <Link href="/agents/" className="btn">
          Explore all agent hosts
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {TEASER_IDS.map((id) => {
          const host = hostAdapter(id);
          const skill = skillTarget(id);
          if (!host && !skill) return null;
          const label = skill?.displayName ?? host?.name ?? id;

          return (
            <DiscoveryCard as="li" key={id} interactive>
              <div className="flex items-center gap-2">
                <AgentLogo id={id} name={label} size={28} />
                <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                  {/* Stretched anchor, the pattern `CapabilityCard` uses: the
                      card is one target, so a click anywhere on the tile lands
                      on the agent page rather than only the name. */}
                  <Link
                    href={`/agents/${id}/`}
                    aria-label={`${label} — config file and bridge entry`}
                    className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {label}
                  </Link>
                </h3>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {host && (
                  <span className="inline-flex items-center gap-1 rounded-chip border border-accent/30 bg-accent-wash px-1.5 py-0.5 text-[10.5px] font-medium text-accent-text">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    MCP adapter
                  </span>
                )}
                {host && (
                  <span className="t-mono rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10.5px] uppercase text-ink-2">
                    {host.kind}
                  </span>
                )}
                {skill && (
                  <span className="t-mono rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10.5px] text-ink-2">
                    skills directory
                  </span>
                )}
                {skill?.universal && (
                  <span className="t-mono rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10.5px] text-ink-2">
                    universal skills
                  </span>
                )}
                {host?.nested && (
                  <span className="t-mono rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10.5px] text-ink-2">
                    nested key path
                  </span>
                )}
                {host?.projectOnly && (
                  <span className="t-mono rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10.5px] text-ink-2">
                    project scope
                  </span>
                )}
              </div>

              <p className="mt-auto pt-3">
                <code
                  className="block truncate text-[11px] text-ink-3"
                  title={host?.userPath || undefined}
                >
                  {host?.userPath || "path not published"}
                </code>
              </p>
            </DiscoveryCard>
          );
        })}
      </ul>
    </section>
  );
}
