"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
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
  { id: "all", label: "All profiles" },
  { id: "configured", label: "MCP setup" },
  { id: "skills", label: "Skills" },
];

function AgentCount({ count, href, label }: { count: number; href: string; label: string }) {
  const content = (
    <>
      <strong>{formatCount(count)}</strong>
      <span>{label}</span>
    </>
  );
  return count > 0
    ? <Link href={href} prefetch={false} className="agent-count-link">{content}</Link>
    : <span className="agent-count-static">{content}</span>;
}

function AgentCard({
  agent,
  highlighted,
}: {
  agent: AgentRow;
  highlighted: boolean;
}) {
  const host = agent.hostId ? HOSTS.find((item) => item.id === agent.hostId) : undefined;
  const mcpHost = host && host.shape !== "";
  const note = hostNote(agent.slug);
  const profileType = note?.profileType ?? (mcpHost ? "MCP servers + skills" : host?.kind === "extension" ? "Agent extension + skills" : agent.skill ? "Agent skills" : "Agent profile");
  const summary = note?.summary?.trim();
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
              {profileType}
            </p>
          </div>
        </div>
        {highlighted && <span className="agent-pick-pill">Your agent</span>}
      </div>

      {summary && <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{summary}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {mcpHost && <span className="agent-tag">MCP setup</span>}
        {host?.kind === "extension" && <span className="agent-tag">LiteSPM extension</span>}
        {agent.skill && <span className="agent-tag">Skills</span>}
        {host?.projectScope && <span className="agent-tag">Project setup</span>}
        {isDiscontinued(agent.hostId ?? "") && <span className="agent-tag agent-tag-muted">Legacy</span>}
      </div>

      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-2 border-t border-rule pt-4">
        {agent.mcp && <AgentCount count={agent.mcp.count} href={exploreHref + "&kind=mcp"} label="MCP listings" />}
        {agent.skill && <AgentCount count={agent.skill.count} href={exploreHref + "&kind=skill"} label="Skill listings" />}
        {agent.plugin && <AgentCount count={agent.plugin.count} href={exploreHref + "&kind=plugin"} label="Plugin listings" />}
      </div>

      <div className="mt-4 flex justify-end border-t border-rule pt-3">
        <Link
          href={agent.total === 0 ? "/submit/" : exploreHref}
          prefetch={false}
          className="text-[12px] font-medium text-ink-2 hover:text-accent-text"
        >
          {agent.total === 0 ? "Suggest a listing" : "Explore tools"}
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
  const [gridView, setGridView] = useState(true);

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
      if (filter === "configured" && (!agent.hostId || HOSTS.find((host) => host.id === agent.hostId)?.shape === "")) return false;
      if (filter === "skills" && !agent.skill) return false;
      if (!normalized) return true;
      const note = hostNote(agent.slug);
      return [agent.name, agent.slug, note?.summary, note?.interface]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [agents, filter, query]);

  const configuredCount = agents.filter((agent) => agent.hostId && HOSTS.find((host) => host.id === agent.hostId)?.shape !== "").length;
  const extensionCount = agents.filter((agent) => agent.hostId && HOSTS.find((host) => host.id === agent.hostId)?.kind === "extension").length;
  const skillsCount = agents.filter((agent) => agent.skill).length;

  const scrollRail = (direction: -1 | 1) => {
    railRef.current?.scrollBy({ left: direction * Math.max(300, railRef.current.clientWidth * 0.82), behavior: "smooth" });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" tabIndex={-1} className="flex-1">
        <section className="shell agent-directory-heading" aria-labelledby="agent-directory-title">
          <p className="kicker">Agent profiles</p>
          <h1 id="agent-directory-title" className="mt-2 text-[30px] font-semibold tracking-tight text-ink sm:text-[38px]">
            Agent directory
          </h1>
          <p className="mt-3 max-w-[68ch] text-[14px] leading-relaxed text-ink-2">
            Find the product you use, then check its setup profile and the packages listed for it.
            Each profile includes sourced product details and a practical setup guide.
          </p>
        </section>

        <section className="shell agent-atlas-rail-section" aria-labelledby="agent-rail-title">
          <div className="agent-atlas-rail-intro">
            <div>
              <h2 id="agent-rail-title" className="mt-1 text-[23px] font-semibold tracking-tight text-ink">
                Browse {formatCount(hostCount)} profiles
              </h2>
            </div>
            <p className="max-w-[48ch] text-[13px] leading-relaxed text-ink-2">
              Search by product, then open a profile for its setup path and available listings.
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
            <span><strong>{formatCount(configuredCount)}</strong> profiles with MCP setup</span>
            {extensionCount > 0 && <span><strong>{formatCount(extensionCount)}</strong> profiles with an agent extension</span>}
            <span><strong>{formatCount(skillsCount)}</strong> profiles with a skills destination</span>
            <span><strong>{formatCount(hostCount)}</strong> agent profiles</span>
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
            These profile counts do not measure the number of installable catalog entries; readiness is shown on each listing.
          </p>

          <div className="agent-atlas-rail-wrap">
            {!gridView && <button className="agent-rail-arrow agent-rail-arrow-left" type="button" aria-label="Scroll agents left" onClick={() => scrollRail(-1)}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>}
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
            {!gridView && <button className="agent-rail-arrow agent-rail-arrow-right" type="button" aria-label="Scroll agents right" onClick={() => scrollRail(1)}>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>}
          </div>
          {!gridView && <div className="agent-atlas-rail-hint" aria-hidden="true"><span />Scroll or swipe to explore</div>}
          <button type="button" aria-pressed={gridView} onClick={() => setGridView(value => !value)} className="btn mt-5">{gridView ? "View as horizontal cards" : "View matching agents as a grid"}</button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
