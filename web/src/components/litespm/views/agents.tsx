"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Cable,
  CheckCircle2,
  ExternalLink,
  LayoutGrid,
  MonitorSmartphone,
  Rows3,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { formatFull } from "@/lib/litespm/format";
import facts from "@/lib/litespm/site-facts.json";
import type { AgentRow, AgentStats } from "@/lib/litespm/types";
import { BrandMark } from "../brand-mark";

type AgentFilter = "all" | "configured" | "skills";

const FILTERS: { id: AgentFilter; label: string }[] = [
  { id: "all", label: "All profiles" },
  { id: "configured", label: "MCP setup" },
  { id: "skills", label: "Skills" },
];

const VIEW_STORAGE_KEY = "litespm:agents-view";

/** Grid is the default; the visitor's last choice sticks across visits. */
function initialGridView(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(VIEW_STORAGE_KEY) !== "carousel";
}

export function AgentsView() {
  const navigate = useApp((s) => s.navigate);
  const [agents, setAgents] = React.useState<AgentRow[]>([]);
  const [stats, setStats] = React.useState<AgentStats | null>(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<AgentFilter>("all");
  const [gridView, setGridView] = React.useState(true);
  const railRef = React.useRef<HTMLDivElement>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setGridView(initialGridView());
  }, []);

  const toggleView = React.useCallback(() => {
    setGridView((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(VIEW_STORAGE_KEY, next ? "grid" : "carousel");
      } catch {
        /* private mode — the default still applies */
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    fetch("/api/litespm/agents")
      .then((r) => r.json())
      .then((data: { agents: AgentRow[]; stats: AgentStats }) => {
        setAgents(data.agents ?? []);
        setStats(data.stats ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((agent) => {
      if (filter === "configured" && !agent.hostId) return false;
      if (filter === "skills" && !agent.skill) return false;
      if (!q) return true;
      return [agent.name, agent.slug, agent.summary, agent.interface, agent.profileType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [agents, filter, query]);

  const scrollRail = (direction: -1 | 1) => {
    railRef.current?.scrollBy({
      left: direction * Math.max(300, railRef.current.clientWidth * 0.8),
      behavior: "smooth",
    });
  };

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/3 h-[380px] w-[720px] rounded-full bg-brand/[0.05] blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="inline-flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand">
              <Sparkles className="h-3.5 w-3.5" /> The agent toolbox
            </p>
            <h1 className="mt-4 text-[clamp(2.4rem,5.5vw,4.2rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
              Choose your <span className="text-brand">agent.</span>
            </h1>
            <p className="mt-5 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">
              LiteSPM writes each agent&apos;s own config — {facts.hosts} hosts for local stdio MCP servers
              ({facts.remoteHosts} of them also accept a remote URL), {facts.skillTargets} targets for skills. Choose the agent you use,
              then browse packages with clear setup details. Each profile includes sourced product
              facts and the exact config file it touches.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="h-11 rounded-xl bg-brand px-5 text-[14.5px] font-semibold text-brand-foreground hover:bg-brand/90"
                onClick={() => navigate(exploreHash({}))}
              >
                Explore the catalog <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 rounded-xl px-5 text-[14.5px]"
                onClick={() => navigate("#/docs/getting-started")}
              >
                Get LiteSPM
              </Button>
            </div>
          </div>
          <AgentHeroPanel />
        </div>
      </section>

      {/* Directory */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6" aria-labelledby="agent-directory-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand">
              Start with your agent
            </p>
            <h2 id="agent-directory-title" className="mt-1.5 text-[26px] font-semibold tracking-tight sm:text-[30px]">
              Find your workspace
            </h2>
          </div>
          <p className="max-w-[44ch] text-[13px] leading-relaxed text-muted-foreground">
            Scroll or search {stats ? formatFull(stats.profiles) : "…"} agent profiles. Open a
            profile for setup details and the packages listed for your agent.
          </p>
        </div>

        {/* Search + filters */}
        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex h-10 flex-1 items-center gap-2 rounded-lg border border-border/80 bg-card px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">Search agent profiles</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents…"
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear agent search"
                onClick={() => setQuery("")}
                className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Filter agents">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  filter === item.id
                    ? "border-brand/50 bg-brand-soft text-brand"
                    : "border-border/70 bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={gridView}
              onClick={toggleView}
              className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              title={gridView ? "Switch to carousel" : "Switch to grid"}
            >
              {gridView ? <Rows3 className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
              {gridView ? "Carousel" : "Grid"}
            </button>
          </div>
        </div>

        {/* Stat strip */}
        <div
          className="mt-4 flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-[12.5px] text-muted-foreground"
          aria-label="Agent profile coverage"
        >
          <span>
            <strong className="font-semibold text-foreground">
              {stats ? formatFull(stats.configured) : "…"}
            </strong>{" "}
            agents with MCP setup
          </span>
          <span aria-hidden="true" className="hidden text-border sm:inline">
            ·
          </span>
          <span>
            <strong className="font-semibold text-foreground">
              {stats ? formatFull(stats.withSkills) : "…"}
            </strong>{" "}
            agents with skills
          </span>
          <span aria-hidden="true" className="hidden text-border sm:inline">
            ·
          </span>
          <span>
            <strong className="font-semibold text-foreground">
              {stats ? formatFull(stats.profiles) : "…"}
            </strong>{" "}
            profiles
          </span>
          <span aria-hidden="true" className="hidden text-border sm:inline">
            ·
          </span>
          <span>
            <strong className="font-semibold text-foreground">
              {stats ? formatFull(stats.totals) : "…"}
            </strong>{" "}
            compatible rows counted across profiles
          </span>
        </div>

        {/* Rail / grid */}
        {loading ? (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[300px] animate-pulse rounded-xl border border-border/50 bg-muted/30" />
            ))}
          </div>
        ) : gridView ? (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((agent) => (
              <AgentCard key={agent.slug} agent={agent} />
            ))}
          </div>
        ) : (
          <div className="relative mt-6">
            <button
              type="button"
              aria-label="Scroll agents left"
              onClick={() => scrollRail(-1)}
              className="absolute -left-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background shadow-sm transition-colors hover:border-brand/40 hover:text-brand md:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div
              ref={railRef}
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 no-scrollbar"
              tabIndex={0}
              role="region"
              aria-label="Scrollable agent profiles"
            >
              {visible.map((agent, index) => (
                <motion.div
                  key={agent.slug}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(index * 0.02, 0.3) }}
                  className="w-[300px] shrink-0 snap-start sm:w-[320px]"
                >
                  <AgentCard agent={agent} />
                </motion.div>
              ))}
            </div>
            <button
              type="button"
              aria-label="Scroll agents right"
              onClick={() => scrollRail(1)}
              className="absolute -right-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background shadow-sm transition-colors hover:border-brand/40 hover:text-brand md:inline-flex"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <p
              className="mt-1 text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70"
              aria-hidden="true"
            >
              <span className="inline-block h-px w-8 align-middle bg-border" /> Scroll or swipe to
              explore{" "}
              <span className="inline-block h-px w-8 align-middle bg-border" />
            </p>
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-border/70 p-10 text-center" role="status">
            <p className="text-[15px] font-medium">No agents match “{query}”.</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Try another name or a different filter.
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Show all agents
            </Button>
          </div>
        )}
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 sm:px-6">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand">
              Make your agent yours
            </p>
            <h2 className="mt-1.5 text-[24px] font-semibold tracking-tight sm:text-[27px]">
              Start with a capability
            </h2>
            <p className="mt-1.5 max-w-[54ch] text-[13.5px] text-muted-foreground">
              Browse by the work you want done. Compare package details and follow the setup path
              for your agent.
            </p>
          </div>
          <Button className="h-10 rounded-xl px-4" onClick={() => navigate(exploreHash({}))}>
            Browse tools and skills <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------- hero panel ------------------------------- */

function AgentHeroPanel() {
  const navigate = useApp((s) => s.navigate);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.21, 0.6, 0.35, 1] }}
      aria-label="One agent connected to skills and tools"
    >
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_16px_48px_-24px_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-2.5">
          <span className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            Your agent workspace
          </span>
          <span className="font-mono text-[10.5px] text-muted-foreground">01 / 03</span>
        </div>
        <div className="p-5">
          <button
            type="button"
            onClick={() => navigate("#/agent/claude-code")}
            className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background p-3 text-left transition-colors hover:border-brand/40"
          >
            <BrandMark id="claude-code" name="Claude Code" size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">
                One agent, more capabilities.
              </span>
              <span className="block truncate text-[12px] text-muted-foreground">
                Keep your setup in one place.
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => navigate(exploreHash({ q: "context7", kind: "mcp" }))}
              className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background p-3 text-left transition-colors hover:border-brand/40"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 font-mono text-[11px] font-bold text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              >
                C7
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">Context7</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  Documentation that stays current
                </span>
              </span>
              <span className="shrink-0 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase text-amber-600 dark:text-amber-400">
                MCP
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate(exploreHash({ q: "web design guidelines", kind: "skill" }))}
              className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background p-3 text-left transition-colors hover:border-brand/40"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              >
                ✦
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">Web design guidelines</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  A sharper interface review
                </span>
              </span>
              <span className="shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                Skill
              </span>
            </button>
          </div>
          <p className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            Discover <span className="text-brand">→</span> Choose agent{" "}
            <span className="text-brand">→</span> Set up
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-border/70 bg-muted/30 p-3.5">
        <span className="text-brand" aria-hidden="true">
          ↳
        </span>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Less configuration hunting.</span> Find a
          path that fits your setup.
        </p>
      </div>
    </motion.div>
  );
}

/* -------------------------------- agent card ------------------------------ */

/** "Terminal CLI (also IDE extensions…)" → "Terminal CLI". */
function shortInterface(value: string): string {
  const head = value.split(" (")[0].trim();
  return head.length > 0 ? head : value;
}

/** "https://code.claude.com/docs" → "code.claude.com". */
function websiteDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

export function AgentCard({ agent }: { agent: AgentRow }) {
  const navigate = useApp((s) => s.navigate);
  const href = `#/agent/${agent.pageId ?? agent.slug}`;
  const open = React.useCallback(() => navigate(href), [navigate, href]);
  const domain = agent.website ? websiteDomain(agent.website) : null;
  const hasAnyCount = Boolean(agent.hostId || agent.skill || agent.plugin);

  return (
    <article
      className="group flex h-full min-w-0 cursor-pointer flex-col rounded-xl border border-border/70 bg-card p-4 transition-all hover:border-brand/40 hover:shadow-[0_2px_16px_-6px_rgba(0,0,0,0.12)]"
      onClick={open}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      aria-label={`${agent.name} agent profile`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark id={agent.hostId ?? agent.slug} name={agent.name} />
          <div className="min-w-0">
            <h3 className="truncate text-[15.5px] font-semibold tracking-tight">{agent.name}</h3>
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              {agent.profileType ?? "Agent profile"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {domain && (
            <span
              className="hidden max-w-[110px] truncate font-mono text-[10px] text-muted-foreground/70 sm:inline"
              title={agent.website}
            >
              {domain}
            </span>
          )}
          {agent.website && (
            <a
              href={agent.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`${agent.name} website`}
              className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-brand"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {agent.interface && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
          <MonitorSmartphone className="h-3.5 w-3.5 shrink-0 text-brand/80" aria-hidden="true" />
          <span className="truncate" title={agent.interface}>
            {shortInterface(agent.interface)}
          </span>
        </p>
      )}

      <p className="mt-2 line-clamp-3 min-h-[3.9rem] text-[12.5px] leading-relaxed text-muted-foreground">
        {agent.summary ??
          (agent.skill
            ? `Bring reusable agent skills into ${agent.name} and keep them with the rest of your agent toolkit.`
            : `Find tools and extensions for ${agent.name} and explore the capabilities associated with it.`)}
      </p>

      {agent.topCategories.length > 0 && (
        <p className="mt-2 truncate text-[11px] text-muted-foreground/80" title={`Popular with ${agent.name}: ${agent.topCategories.join(", ")}`}>
          <span className="font-medium text-muted-foreground/60">Popular:</span>{" "}
          {agent.topCategories.join(" · ")}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {agent.hostId && (
          <Tag icon={<Cable className="h-3 w-3" />} tone="brand">
            MCP setup
          </Tag>
        )}
        {agent.skill && (
          <Tag icon={<Sparkles className="h-3 w-3" />}>Skills</Tag>
        )}
        {agent.remoteMcp && (
          <Tag icon={<ShieldCheck className="h-3 w-3" />} tone="brand">
            URL MCP
          </Tag>
        )}
        {agent.configFormat && (
          <Tag icon={<BookOpen className="h-3 w-3" />}>
            {agent.configFormat.toUpperCase()} config
          </Tag>
        )}
      </div>

      {hasAnyCount && (
        <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-border/60 pt-3.5">
          <CountCell
            count={agent.mcp?.count ?? 0}
            label="MCP"
            show={Boolean(agent.hostId)}
            onClick={(e) => {
              e.stopPropagation();
              navigate(exploreHash({ host: agent.mcp?.host ?? agent.name, kind: "mcp" }));
            }}
          />
          <CountCell
            count={agent.skill?.count ?? 0}
            label="Skills"
            show={Boolean(agent.skill)}
            onClick={(e) => {
              e.stopPropagation();
              navigate(exploreHash({ host: agent.skill?.host ?? agent.name, kind: "skill" }));
            }}
          />
          <CountCell
            count={agent.plugin?.count ?? 0}
            label="Plugins"
            show={Boolean(agent.plugin)}
            onClick={(e) => {
              e.stopPropagation();
              navigate(exploreHash({ host: agent.name, kind: "plugin" }));
            }}
          />
        </div>
      )}

      {agent.installable > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(exploreHash({ host: agent.name, installable: "1" }));
          }}
          className="mt-2 flex items-center justify-between rounded-lg border border-brand/25 bg-brand-soft px-2.5 py-2 text-left transition-colors hover:border-brand/52"
          aria-label={`${formatFull(agent.installable)} packages installable into ${agent.name} — browse them`}
        >
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {formatFull(agent.installable)} ready to install
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-brand/70 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
      )}

      {agent.hostId && (
        <div
          className="mt-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 font-mono text-[10.5px] text-muted-foreground transition-colors group-hover:border-brand/30 group-hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
          title={`One command writes the MCP bridge entry into ${agent.name}'s own config`}
        >
          <span className="text-brand">$</span> litespm host setup {agent.hostId}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3">
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/60">
          {domain ?? agent.slug}
        </span>
        <span className="ml-2 inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-brand">
          Open setup guide <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </article>
  );
}

function Tag({
  icon,
  children,
  tone,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "brand";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
        tone === "brand"
          ? "border-brand/30 bg-brand-soft text-brand"
          : "border-border/70 bg-muted/40 text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

function CountCell({
  count,
  label,
  show,
  onClick,
}: {
  count: number;
  label: string;
  show: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  if (!show) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed border-border/50 px-1 py-2 text-center opacity-45">
        <span className="text-[13.5px] font-semibold tabular-nums">—</span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center rounded-lg border border-border/60 bg-background px-1 py-2 text-center transition-colors hover:border-brand/40"
      aria-label={`${formatFull(count)} ${label}`}
    >
      <span className="text-[13.5px] font-semibold tabular-nums">{formatFull(count)}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </button>
  );
}
