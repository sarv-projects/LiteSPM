"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import { SearchBar } from "../navigation/SearchBar";
import { AgentLogo } from "../AgentLogo";
import { AGENT_CHOICES } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";
import { SKILL_TARGETS, skillTargetPaths } from "../../lib/hosts";

export interface LandingHeroProps {
  total: number;
  query: string;
  setQuery: (q: string) => void;
  totalMatches?: number;
  settled?: boolean;
  choice: AgentChoice | null;
  onAgentChange: (id: string) => void;
}

const STARTING_POINTS = [
  { label: "Build a website", query: "web design" },
  { label: "Work with PDFs", query: "pdf" },
  { label: "Review code", query: "code review" },
  { label: "Connect GitHub", query: "github" },
];

export function LandingHero({ total, query, setQuery, totalMatches, settled, choice, onAgentChange }: LandingHeroProps) {
  const agents = AGENT_CHOICES.filter((agent) => agent.hosts.length > 0).slice(0, 4);
  const exampleAgent = choice && choice.id !== "other"
    ? choice
    : AGENT_CHOICES.find((agent) => agent.id === "codex") ?? agents[0];
  const exampleTarget = exampleAgent
    ? SKILL_TARGETS.find((target) => target.id === exampleAgent.id)
    : undefined;
  const exampleDestination = exampleTarget ? skillTargetPaths(exampleTarget).userPath : undefined;

  return (
    <section className="home-editorial-hero">
      <div className="shell home-editorial-layout">
        <div className="home-editorial-copy">
          <p className="home-eyebrow"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> THE OPEN-SOURCE AGENT PACKAGE MANAGER</p>
          <h1 className="home-display-title">
            One package manager{" "}<br className="hidden md:block" /><span>for your agents.</span>
          </h1>
          <p className="home-display-subtitle">
            Find MCP servers, skills and plugins for the agent you already use. The open-source LiteSPM CLI applies supported installs on your machine, after you review the setup.
          </p>
          <div className="home-search-wrap">
            <SearchBar
              query={query}
              setQuery={setQuery}
              totalMatches={totalMatches}
              settled={settled}
              totalCount={total}
              placeholder="Find tools and skills for your agent..."
              hint={
                query ? undefined : (
                  <span className="flex flex-wrap items-center gap-2">
                    <span>Try:</span>
                    {STARTING_POINTS.map((point) => (
                      <button key={point.query} type="button" onClick={() => setQuery(point.query)} className="chip">
                        {point.label}
                      </button>
                    ))}
                  </span>
                )
              }
            />
          </div>
          <div className="home-hero-actions">
            <Link href="/explore/" className="btn btn-solid btn-lg">Explore packages <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link href="/get-started/" className="home-text-link">Install the LiteSPM CLI <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          </div>
          <p className="home-trust-line"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Choose a supported agent. Review the install steps before applying them.</p>
        </div>

        <div className="home-hero-art" aria-label={`Example install plan for ${exampleAgent?.label ?? "an agent"}; no install has run`}>
          <div className="home-hero-window">
            <div className="home-hero-window-top">
              <span className="home-window-dots" aria-hidden="true"><i /><i /><i /></span>
              <span>LiteSPM install preview</span>
              <span className="home-window-example">EXAMPLE ONLY</span>
            </div>
            <div className="home-hero-window-caption">
              <span>REVIEW THE CHANGE BEFORE APPROVAL</span>
            </div>
            <Link href={`/agents/${exampleAgent?.id ?? "codex"}/`} className="home-agent-focus">
              <AgentLogo id={exampleAgent?.id ?? "codex"} name={exampleAgent?.label ?? "Codex"} size={42} />
              <span><strong>{exampleAgent?.label ?? "Codex"}</strong><small>Selected install target</small></span>
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <div className="home-hero-additions">
              <Link href="/package/skill%3Aanthropics%3Afrontend-design/" className="home-addition-card">
                <span className="home-addition-icon home-addition-ink">✦</span>
                <span><strong>Frontend Design</strong><small>Reusable skill · Anthropic</small></span>
                <span className="home-addition-kind">SKILL</span>
              </Link>
            </div>
            <div className="home-hero-destination">
              <span>DEFAULT USER DESTINATION · UNIX FORM</span>
              <code>{exampleDestination ?? "Previewed in the LiteSPM install plan"}</code>
            </div>
            <div className="home-hero-flow">Preview files <i>→</i> Approve <i>→</i> Manage or remove</div>
          </div>
          <div className="home-hero-note"><span>↳</span><span><strong>Example only. Nothing is installed here.</strong><small>The CLI shows the destination before it writes.</small></span></div>
        </div>
      </div>

      <div className="shell home-agent-band">
        <span className="home-agent-band-label">Start with the agent<br />you already use</span>
        <div className="home-agent-band-list" role="group" aria-label="Choose your agent">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onAgentChange(agent.id)}
              aria-pressed={choice?.id === agent.id}
              className={"home-agent-chip" + (choice?.id === agent.id ? " home-agent-chip-active" : "")}
            >
              <AgentLogo id={agent.id} name={agent.label} size={24} />
              <span>{agent.label}</span>
            </button>
          ))}
        </div>
        <Link href="/agents/" className="home-agent-band-all">Browse agents <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
      </div>
    </section>
  );
}
