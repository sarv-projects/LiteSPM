"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import { SearchBar } from "../navigation/SearchBar";
import { AgentLogo } from "../AgentLogo";
import { AGENT_CHOICES } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";

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

  return (
    <section className="home-editorial-hero">
      <div className="shell home-editorial-layout">
        <div className="home-editorial-copy">
          <p className="home-eyebrow"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> THE OPEN-SOURCE AGENT PACKAGE MANAGER</p>
          <h1 className="home-display-title">
            One package manager{" "}<br /><span>for your agents.</span>
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

        <div className="home-hero-art" aria-label="Illustration of an agent with added tools and skills">
          <div className="home-hero-window">
            <div className="home-hero-window-top">
              <span className="home-window-dots" aria-hidden="true"><i /><i /><i /></span>
              <span>Your agent workspace</span>
              <span className="home-window-example">EXAMPLE</span>
            </div>
            <div className="home-hero-window-caption">
              <span>ONE AGENT. MORE CAPABILITIES.</span>
            </div>
            <Link href="/agents/claude-code/" className="home-agent-focus">
              <AgentLogo id="claude-code" name="Claude Code" size={42} />
              <span><strong>Claude Code</strong><small>Your agent, with a little more range.</small></span>
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <div className="home-hero-additions">
              <Link href="/explore/?kind=mcp" className="home-addition-card">
                <span className="home-addition-icon home-addition-green">C7</span>
                <span><strong>Tools and data</strong><small>Connect an MCP server</small></span>
                <span className="home-addition-kind">MCP</span>
              </Link>
              <Link href="/explore/?kind=skill" className="home-addition-card">
                <span className="home-addition-icon home-addition-ink">✦</span>
                <span><strong>Reusable workflows</strong><small>Give your agent a new skill</small></span>
                <span className="home-addition-kind">SKILL</span>
              </Link>
            </div>
            <div className="home-hero-flow">Discover <i>→</i> Choose agent <i>→</i> Set up</div>
          </div>
          <div className="home-hero-note"><span>↳</span><span><strong>Less configuration hunting.</strong><small>See the setup path before you make a change.</small></span></div>
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
