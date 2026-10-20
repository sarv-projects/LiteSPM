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
 * The agent teaser: five of the hosts LiteSPM can set up, and what each one
 * gets.
 *
 * ## What changed
 *
 * The cards used to print the agent's **config path** — `~/.claude.json`,
 * `~/.codex/config.toml` and so on. That fact belongs to the agent's own
 * page, where it is one row among everything else that host is; on the home
 * page it was the loudest thing in a card about a *tool*, and it taught the
 * reader a file path before they had any reason to want one. The cards now
 * say what the agent gets, and the path is one click away on its own page.
 *
 * Every chip is a fact one of the two generated registries states — a bridge
 * adapter, a skills directory, the universal-skills flag, a per-repository
 * scope, a remote endpoint — and nothing is inferred: no OS support, no "best
 * for", no compatibility the data does not carry.
 */
const TEASER_IDS = ["claude-code", "codex", "opencode", "cursor", "cline"].filter(
  // Belt and braces: this list is curated by hand, so a product ending would
  // otherwise still get a card here. `lifecycle.ts` is the signal.
  (id) => !isDiscontinued(id)
);

/**
 * What each agent gets, in the reader's words.
 *
 * The same benefit, five times, because the benefit *is* the same: LiteSPM
 * adds one bridge entry to the agent's own config file and copies skills into
 * the directory the agent already uses, and the change is previewed before it
 * is written. The one place the cards differ is the one the registry
 * differs: Cline has no per-repository scope, and the card says so rather
 * than implying one.
 */
const BENEFITS: Record<string, string> = {
  "claude-code":
    "MCP servers and agent skills, in Claude Code's own config — and a per-repository scope when you want one.",
  codex: "MCP servers and agent skills, in Codex's own config — and a per-repository scope when you want one.",
  opencode:
    "MCP servers and agent skills, in OpenCode's own config — and a per-repository scope when you want one.",
  cursor:
    "MCP servers and agent skills, in Cursor's own config — and a per-repository scope when you want one.",
  cline: "MCP servers and agent skills, in Cline's own config. Cline has no per-repository scope yet.",
};

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
            Works with the agents you already use
          </h2>
          <p className="band-sub">
            Explore available MCP and skill integrations for popular coding agents. Installation
            options and scopes vary by host.
          </p>
        </div>
        <Link href="/agents/" className="btn">
          Browse supported agents
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
            <DiscoveryCard as="li" key={id} interactive className="h-full">
              <div className="flex items-center gap-2">
                <AgentLogo id={id} name={label} size={28} />
                <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                  {/* Stretched anchor, the pattern `CapabilityCard` uses: the
                      card is one target, so a click anywhere on the tile lands
                      on the agent page rather than only the name. */}
                  <Link
                    href={`/agents/${id}/`}
                    aria-label={`${label} — what LiteSPM adds, and the agent's own page`}
                    className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {label}
                  </Link>
                </h3>
              </div>

              <p className="mt-3 flex-1 text-[13px] leading-relaxed text-ink-2">
                {BENEFITS[id] ?? "MCP servers and agent skills, added through one bridge entry."}
              </p>

              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                {host && (
                  <span className="inline-flex items-center gap-1 rounded-chip border border-accent/30 bg-accent-wash px-1.5 py-0.5 text-[10.5px] font-medium text-accent-text">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    MCP adapter
                  </span>
                )}
                {host?.remote && (
                  <span className="t-mono rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10.5px] uppercase text-ink-2">
                    remote endpoint
                  </span>
                )}
                {skill && (
                  <span className="t-mono rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10.5px] uppercase text-ink-2">
                    skills directory
                  </span>
                )}
                {skill?.universal && (
                  <span className="t-mono rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10.5px] uppercase text-ink-2">
                    universal skills
                  </span>
                )}
                {host?.projectScope && (
                  <span className="t-mono rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10.5px] uppercase text-ink-2">
                    project scope
                  </span>
                )}
              </div>
            </DiscoveryCard>
          );
        })}
      </ul>
    </section>
  );
}
