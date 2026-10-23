"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Search, Sparkles } from "lucide-react";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { AgentLogo } from "../../components/AgentLogo";
import { HOSTS } from "../../lib/hosts";
import { formatCount } from "../../lib/format";
import { isDiscontinued } from "../../lib/lifecycle";
import { AGENT_STORAGE_KEY, findAgentChoice } from "../../lib/landing";
import { hostNote } from "../../lib/hostNotes";
import type { AgentChoice } from "../../lib/landing";
import type { AgentRow } from "./agentRows";

export interface AgentsViewProps {
  hostCount: number;
  agents: AgentRow[];
}

type AgentFilter = "all" | "configured" | "skills";

const FILTERS: Array<{ id: AgentFilter; label: string }> = [
  { id: "all", label: "All agents" },
  { id: "configured", label: "MCP setup" },
  { id: "skills", label: "Skills" },
];

function AgentCard({
  agent,
  highlighted,
}: {
  agent: AgentRow;
  highlighted: boolean;
}) {
  const host = agent.hostId ? HOSTS.find((item) => item.id === agent.hostId) : undefined;
  const note = hostNote(agent.slug);
  const summary = note?.summary ??
    (agent.skill
      ? "Bring reusable agent skills into " + agent.name + " and keep them with the rest of your agent toolkit."
      : "Find tools and extensions for " + agent.name + " and explore the capabilities associated with it.");
  const href = "/agents/" + (agent.pageId ?? agent.slug) + "/";
  const exploreHref = "/explore/?host=" + encodeURIComponent(agent.name);

  return (
    <article className={"agent-atlas-card" + (highlighted ? " agent-atlas-card-picked" : "")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AgentLogo id={agent.hostId ?? agent.slug} name={agent.name} size={44} />
          <div className="min-w-0">
            <h3 className="truncate text-[18px] font-semibold tracking-tight text-ink"><Link href={href} prefetch={false} className="hover:text-accent-text focus-visible:underline">{agent.name}</Link></h3>
            <p className="mt-0.5 text-[12px] text-ink-3">
              {host ? "MCP tools + skills" : agent.skill ? "Agent skills" : "Agent profile"}
            </p>
          </div>
        </div>
        {highlighted && <span className="agent-pick-pill">Your agent</span>}
      </div>

      <p className="mt-4 line-clamp-3 min-h-[4.7rem] text-[13px] leading-relaxed text-ink-2">
        {summary}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {host && <span className="agent-tag">MCP setup</span>}
        {agent.skill && <span className="agent-tag">Skills</span>}
        {host?.projectScope && <span className="agent-tag">Project setup</span>}
        {isDiscontinued(agent.hostId ?? "") && <span className="agent-tag agent-tag-muted">Legacy</span>}
      </div>

      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-2 border-t border-rule pt-4">
        {agent.mcp && <Link href={exploreHref + "&kind=mcp"} prefetch={false} className="agent-count-link">
          <strong>{formatCount(agent.mcp.count)}</strong>
          <span>MCP tools</span>
        </Link>}
        {agent.skill && <Link href={exploreHref + "&kind=skill"} prefetch={false} className="agent-count-link">
          <strong>{formatCount(agent.skill.count)}</strong>
          <span>Skills</span>
        </Link>}
        {agent.plugin && <Link href={exploreHref + "&kind=plugin"} prefetch={false} className="agent-count-link">
          <strong>{formatCount(agent.plugin.count)}</strong>
          <span>Plugins</span>
        </Link>}
      </div>

      <div className="mt-4 flex justify-end border-t border-rule pt-3">
        <Link href={exploreHref} prefetch={false} className="text-[12px] font-medium text-ink-2 hover:text-accent-text">
          Explore tools
        </Link>
      </div>
    </article>
  );
}

export default function AgentsPage({ hostCount, agents }: AgentsViewProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AgentFilter>("all");
  const [savedAgent, setSavedAgent] = useState<AgentChoice | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [gridView, setGridView] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
      if (stored) setSavedAgent(findAgentChoice(stored));
    } catch {
      // This preference is optional; the agent catalog remains fully usable.
    }
  }, []);

  const pickedSlug = savedAgent
    ? agents.find((agent) => agent.hostId === savedAgent.id)?.slug ??
      agents.find((agent) => savedAgent.hosts.some((host) => agent.strings.includes(host)))?.slug ??
      null
    : null;

  const visibleAgents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return agents.filter((agent) => {
      if (filter === "configured" && !agent.hostId) return false;
      if (filter === "skills" && !agent.skill) return false;
      if (!normalized) return true;
      const note = hostNote(agent.slug);
      return [agent.name, agent.slug, note?.summary, note?.interface]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [agents, filter, query]);

  const configuredCount = agents.filter((agent) => agent.hostId).length;
  const skillsCount = agents.filter((agent) => agent.skill).length;

  const scrollRail = (direction: -1 | 1) => {
    railRef.current?.scrollBy({ left: direction * Math.max(300, railRef.current.clientWidth * 0.82), behavior: "smooth" });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" tabIndex={-1} className="flex-1">
        <section className="agent-atlas-hero">
          <div className="shell agent-atlas-hero-grid">
            <div className="max-w-[690px]">
              <p className="agent-atlas-eyebrow"><Sparkles className="h-3.5 w-3.5" /> THE AGENT TOOLBOX</p>
              <h1 className="mt-5 max-w-[12ch] text-[clamp(2.6rem,5.5vw,5.2rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-[#142923]">
                Choose your<br /><span className="text-[#24715a]">agent.</span>
              </h1>
              <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-[#53645d] sm:text-[18px]">
                Find the agent you already use, then explore the tools and skills that make it more useful.
                Every profile includes a practical setup guide.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/explore/" className="btn btn-solid btn-lg">
                  Explore the catalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/get-started/" className="btn btn-lg">Get LiteSPM</Link>
              </div>
            </div>

            <div className="agent-atlas-visual" aria-label="One agent connected to skills and tools">
              <div className="agent-atlas-window">
                <div className="agent-atlas-window-bar">
                  <span className="agent-window-dots" aria-hidden="true"><i /><i /><i /></span>
                  <span>Your agent workspace</span>
                  <span className="agent-window-step">01 / 03</span>
                </div>
                <div className="agent-atlas-current">
                  <AgentLogo id="claude-code" name="Claude Code" size={48} />
                  <div><strong>One agent, more capabilities.</strong><span>Keep your setup in one place.</span></div>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="agent-atlas-connectors">
                  <div><span className="agent-mini-icon agent-mini-green">C7</span><span><strong>Context7</strong><small>Documentation that stays current</small></span><b>MCP</b></div>
                  <div><span className="agent-mini-icon agent-mini-ink">▲</span><span><strong>Web design guidelines</strong><small>A sharper interface review</small></span><b>Skill</b></div>
                </div>
                <div className="agent-atlas-caption">Discover <span>→</span> Choose agent <span>→</span> Set up</div>
              </div>
              <div className="agent-atlas-callout"><span>↳</span><div><strong>Less configuration hunting.</strong><small>Find a path that fits your setup.</small></div></div>
            </div>
          </div>
        </section>

        <section className="shell agent-atlas-rail-section" aria-labelledby="agent-rail-title">
          <div className="agent-atlas-rail-intro">
            <div>
              <p className="kicker">Start with your agent</p>
              <h2 id="agent-rail-title" className="mt-1 text-[23px] font-semibold tracking-tight text-ink">
                Find your workspace
              </h2>
            </div>
            <p className="max-w-[38ch] text-[13px] leading-relaxed text-ink-2">
              Swipe or scroll to browse {hostCount} agent profiles. Open a profile for setup details and tools that work with your agent.
            </p>
          </div>

          <div className="agent-atlas-controls">
            <label className="agent-atlas-search">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">Search agent profiles</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search agents..."
                autoComplete="off"
              />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear agent search">×</button>}
            </label>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Filter agents">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                  className={"agent-filter-chip" + (filter === item.id ? " agent-filter-chip-active" : "")}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="agent-atlas-stats" aria-label="Agent profile coverage">
            <span><strong>{formatCount(configuredCount)}</strong> agents with MCP setup</span>
            <span><strong>{formatCount(skillsCount)}</strong> agents with skills</span>
            <span><strong>{formatCount(hostCount)}</strong> profiles</span>
          </div>

          <div className="agent-atlas-rail-wrap">
            <button className="agent-rail-arrow agent-rail-arrow-left" type="button" aria-label="Scroll agents left" onClick={() => scrollRail(-1)}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div
              ref={railRef}
              className={"agent-atlas-rail" + (gridView ? " agent-directory-grid" : "")}
              tabIndex={0}
              role="region"
              aria-label={gridView ? "Agent profiles" : "Scrollable agent profiles"}
              aria-live="polite"
            >
              {visibleAgents.map((agent) => (
                <AgentCard key={agent.slug} agent={agent} highlighted={agent.slug === pickedSlug} />
              ))}
              {visibleAgents.length === 0 && (
                <div className="agent-atlas-empty" role="status">
                  <strong>No agents match “{query}”.</strong>
                  <span>Try another name or choose a different filter.</span>
                  <button type="button" className="link mt-2" onClick={() => { setQuery(""); setFilter("all"); }}>Show all agents</button>
                </div>
              )}
            </div>
            <button className="agent-rail-arrow agent-rail-arrow-right" type="button" aria-label="Scroll agents right" onClick={() => scrollRail(1)}>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="agent-atlas-rail-hint" aria-hidden="true"><span />Scroll or swipe to explore</div>
          <button type="button" aria-pressed={gridView} onClick={() => setGridView(value => !value)} className="btn mt-5">{gridView ? "View as horizontal cards" : "View all matching agents as a grid"}</button>
        </section>

        <section className="shell agent-atlas-bottom">
          <div>
            <p className="kicker">Make your agent yours</p>
            <h2 className="mt-2 text-[25px] font-semibold tracking-tight text-ink">Start with a capability</h2>
            <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed text-ink-2">
              Browse by the work you want done. Compare package details and follow the setup path for your agent.
            </p>
          </div>
          <Link href="/explore/" className="btn btn-solid">
            Browse tools and skills <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
