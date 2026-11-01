"use client";

import * as React from "react";
import { animate, motion, useInView } from "framer-motion";
import {
  ArrowRight,
  Bookmark,
  Cable,
  ChevronRight,
  Clock,
  Eye,
  Flame,
  History,
  Package,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { formatFull, formatDate, displayPackageName } from "@/lib/litespm/format";
import { useRecentlyViewed } from "@/lib/litespm/hooks";
import type {
  CatalogHit,
  CatalogListResponse,
  CatalogStatsResponse,
  FeaturedResponse,
  TrendingItem,
} from "@/lib/litespm/types";
import { InstallBar } from "../install-bar";
import { TerminalHero } from "../terminal";
import { KindBadge, SectionHeading } from "../primitives";
import { RankBadge, RankExplainer } from "../rank-badge";

const GOAL_LABELS: Record<string, string> = {
  coding: "Coding & Development",
  web: "Websites & Design",
  data: "Data & Analytics",
  research: "Research & Learning",
  productivity: "Productivity & Workflow",
  automation: "Testing & Automation",
  infrastructure: "Cloud & Infrastructure",
  security: "Security & Identity",
  business: "Business & Finance",
  communication: "Communication & Social",
  media: "Media & Content",
  other: "Other",
};

/** Count-up animation for the hero stats: 0 → value on first view. */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value]);

  return <span ref={ref}>{format(display)}</span>;
}

export function HomeView() {
  const navigate = useApp((s) => s.navigate);
  const setAssistant = useApp((s) => s.setAssistant);
  const [stats, setStats] = React.useState<CatalogStatsResponse | null>(null);
  const [featured, setFeatured] = React.useState<FeaturedResponse | null>(null);
  const [trending, setTrending] = React.useState<TrendingItem[]>([]);
  const [topMcp, setTopMcp] = React.useState<CatalogHit[]>([]);
  const [topSkills, setTopSkills] = React.useState<CatalogHit[]>([]);
  const { entries: recent } = useRecentlyViewed();

  React.useEffect(() => {
    fetch("/api/litespm/stats")
      .then((r) => r.json())
      .then((data: CatalogStatsResponse) => setStats(data))
      .catch(() => {});
    fetch("/api/litespm/featured")
      .then((r) => r.json())
      .then((data: FeaturedResponse) => setFeatured(data))
      .catch(() => {});
    fetch("/api/litespm/trending")
      .then((r) => r.json())
      .then((data: { items: TrendingItem[] }) => setTrending(data.items ?? []))
      .catch(() => {});
    fetch("/api/litespm/list?sort=rank&kind=mcp&installable=1&pageSize=8")
      .then((r) => r.json())
      .then((data: CatalogListResponse) => setTopMcp(data.items ?? []))
      .catch(() => {});
    fetch("/api/litespm/list?sort=rank&kind=skill&installable=1&pageSize=8")
      .then((r) => r.json())
      .then((data: CatalogListResponse) => setTopSkills(data.items ?? []))
      .catch(() => {});
  }, []);

  const counts = stats?.telemetry.counts;
  const cliVersion = stats?.cli?.[0]?.version;
  const listingCount = counts ? formatFull(counts.all).replace(/,/g, " ") : "…";

  const steps = [
    {
      icon: Search,
      title: "Find it once",
      body: `Search ${counts ? formatFull(counts.all) : "the"} listings — MCP servers, skills and plugins — with publisher, source and installability stated up front.`,
    },
    {
      icon: Cable,
      title: "Install everywhere",
      body: "One command writes the entry into every agent you target: Claude Code, Codex, Cursor, OpenCode, Cline and 45 more.",
    },
    {
      icon: Undo2,
      title: "Undo is a command",
      body: "Every write is previewed, backed up and recorded in a ledger. restore puts a config back to its exact previous bytes.",
    },
  ];

  return (
    <div className="flex flex-col">
      {/* ------------------------------- hero ------------------------------- */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-0" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-brand/[0.07] blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {cliVersion ? `v${cliVersion.replace(/^v/, "")} on npm` : "on npm"} ·{" "}
              {stats ? `${stats.hosts} agent hosts` : "50 agent hosts"}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mt-5 text-[clamp(2.5rem,5.6vw,4.3rem)] font-semibold leading-[1.02] tracking-[-0.045em]"
            >
              Every capability your agents need.{" "}
              <span className="text-brand">One command away.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-5 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]"
            >
              LiteSPM is the package manager for AI agents. Find MCP servers, skills and plugins
              once, and install them into every coding agent you use — each agent&apos;s own config,
              backed up first, with a ledger of every change so you can take it back out.
            </motion.p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="h-11 rounded-xl bg-brand px-5 text-[14.5px] font-semibold text-brand-foreground hover:bg-brand/90"
                onClick={() => navigate("#/docs/getting-started")}
              >
                Get started <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 rounded-xl px-5 text-[14.5px]"
                onClick={() => navigate(exploreHash({}))}
              >
                Explore the catalog
              </Button>
              <button
                type="button"
                onClick={() => setAssistant(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-[14px] font-medium text-brand transition-colors hover:bg-brand-soft"
              >
                <Sparkles className="h-4 w-4" /> Ask AI
              </button>
            </div>

            <div className="mt-8">
              <InstallBar command="npm install -g litespm" label="npm" />
            </div>

            <dl className="mt-8 grid max-w-lg grid-cols-3 gap-3">
              <div>
                <dd className="font-mono text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-foreground">
                  {counts ? <CountUp value={counts.all} format={(n) => formatFull(n).replace(/,/g, " ")} /> : "…"}
                </dd>
                <dt className="mt-0.5 text-[11.5px] font-medium text-muted-foreground">
                  Listings
                  <span className="block text-[10px] text-muted-foreground/60">
                    Unique rows in this release
                  </span>
                </dt>
              </div>
              <div>
                <dd className="font-mono text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-foreground">
                  {stats ? <CountUp value={stats.hosts} format={(n) => String(n)} /> : "…"}
                </dd>
                <dt className="mt-0.5 text-[11.5px] font-medium text-muted-foreground">
                  Agent hosts
                  <span className="block text-[10px] text-muted-foreground/60">
                    Hosts whose config LiteSPM writes
                  </span>
                </dt>
              </div>
              <div>
                <dd className="font-mono text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-foreground">
                  {stats ? (
                    <CountUp value={stats.installable} format={(n) => formatFull(n).replace(/,/g, " ")} />
                  ) : (
                    "…"
                  )}
                </dd>
                <dt className="mt-0.5 text-[11.5px] font-medium text-muted-foreground">
                  One-command installs
                  <span className="block text-[10px] text-muted-foreground/60">
                    Installable in a single command
                  </span>
                </dt>
              </div>
            </dl>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.21, 0.6, 0.35, 1] }}
          >
            <TerminalHero />
            <p className="mt-3 text-center text-[11px] text-muted-foreground/80">
              A real session: search, install into Claude Code with backup, and the ledger.
            </p>
          </motion.div>
        </div>
      </section>

      {/* --------------------------- top ranked rails --------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="top-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
              <Trophy className="h-3.5 w-3.5" /> Ranked by the LiteSPM score
              <RankExplainer />
            </p>
            <h2 id="top-title" className="mt-1 text-[26px] font-semibold tracking-tight sm:text-[30px]">
              The tools the ecosystem actually trusts
            </h2>
            <p className="mt-1 max-w-[64ch] text-[13px] text-muted-foreground">
              An editorial reputation model, not a metadata contest: the official reference
              servers and skills, first-party vendor tools, and verified installability rank
              first. Spam and parse-artifact records are heavily penalized; duplicates are
              collapsed, so one tool never takes two slots.
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => navigate(exploreHash({ sort: "rank", installable: "1" }))}
          >
            View the full ranking <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <TopRail
            title="Top MCP servers"
            href={exploreHash({ sort: "rank", kind: "mcp", installable: "1" })}
            items={topMcp}
          />
          <TopRail
            title="Top agent skills"
            href={exploreHash({ sort: "rank", kind: "skill", installable: "1" })}
            items={topSkills}
          />
        </div>
      </section>

      {/* --------------------------- browse by goal --------------------------- */}
      {stats && stats.goalCounts.length > 0 && (
        <section className="border-y border-border/60 bg-card/30" aria-labelledby="goals-title">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
            <SectionHeading
              eyebrow="Browse by what you're building"
              title={<span id="goals-title">Start from a goal</span>}
              description="The editorial taxonomy groups all listings by the task you're trying to get done — pick one and explore narrows to it."
            />
            <div className="mt-8 flex flex-wrap gap-2">
              {stats.goalCounts
                .filter(([goal]) => GOAL_LABELS[goal])
                .slice(0, 11)
                .map(([goal, count], i) => (
                  <motion.button
                    key={goal}
                    type="button"
                    initial={{ opacity: 0, scale: 0.94 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: Math.min(i * 0.03, 0.25) }}
                    onClick={() => navigate(exploreHash({ goal, sort: "rank" }))}
                    className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-[13px] font-medium text-foreground/90 transition-all hover:border-brand/40 hover:bg-brand-soft hover:text-brand"
                  >
                    {GOAL_LABELS[goal]}
                    <span className="rounded-full bg-muted/60 px-1.5 py-px font-mono text-[10.5px] text-muted-foreground group-hover:bg-brand/10 group-hover:text-brand/80">
                      {formatFull(count)}
                    </span>
                  </motion.button>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------ steps ------------------------------ */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="how-title">
        <SectionHeading
          eyebrow="How it works"
          title={<span id="how-title">Plan. Preview. Approve. Undo.</span>}
          description="Nothing is written without a preview, and every write is one transaction with the previous file preserved."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.07 }}
              className="group rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:border-brand/40"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <step.icon className="h-5 w-5" />
                </span>
                <span className="font-mono text-[11px] font-semibold text-muted-foreground/50">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-4 text-[16px] font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* --------------------------- featured shelf --------------------------- */}
      <section className="border-y border-border/60 bg-card/30" aria-labelledby="featured-title">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <SectionHeading
            eyebrow="Curated shelves"
            title={<span id="featured-title">Start with these</span>}
            description="Every shelf entry is checked against the catalog at request time — the id is the catalog's own, and the use-case line is editorial prose."
            action={
              <Button variant="outline" className="rounded-xl" onClick={() => navigate(exploreHash({ installable: "1" }))}>
                Browse installable <ArrowRight className="h-4 w-4" />
              </Button>
            }
          />
          {featured
            ? featured.groups.map((group) => {
                const entries = featured.entries.filter((e) => e.group === group.id);
                return (
                  <div key={group.id} className="mt-8">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <h3 className="text-[17px] font-semibold tracking-tight">{group.title}</h3>
                        <p className="mt-0.5 max-w-[64ch] text-[12.5px] text-muted-foreground">
                          {group.blurb}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(group.viewAllHref)}
                        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline"
                      >
                        {group.viewAllLabel} <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {entries.map((entry, i) => (
                        <motion.button
                          key={entry.id}
                          type="button"
                          initial={{ opacity: 0, y: 8 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: Math.min(i * 0.04, 0.2) }}
                          onClick={() => navigate(`#/package/${encodeURIComponent(entry.linkKey)}`)}
                          className="group flex flex-col rounded-xl border border-border/70 bg-card p-4 text-left transition-all hover:border-brand/40 hover:shadow-[0_2px_18px_-8px_rgba(16,185,129,0.25)]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <KindBadge kind={entry.kind} />
                            {entry.version && (
                              <span className="font-mono text-[10.5px] text-muted-foreground">
                                v{entry.version}
                              </span>
                            )}
                          </div>
                          <h4 className="mt-2.5 truncate text-[14.5px] font-semibold tracking-tight">
                            {displayPackageName(entry.name)}
                          </h4>
                          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                            {entry.useCase ?? entry.summary}
                          </p>
                          <span className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground transition-colors group-hover:text-brand">
                            View package <ArrowRight className="h-3 w-3" />
                          </span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                );
              })
            : (
              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[148px] animate-pulse rounded-xl border border-border/50 bg-muted/30" />
                ))}
              </div>
            )}
        </div>
      </section>

      {/* ------------------------- trending + recent ------------------------- */}
      {(trending.length > 0 || recent.length > 0) && (
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="activity-title">
          <SectionHeading
            eyebrow="Live on this deployment"
            title={<span id="activity-title">What people are opening</span>}
            description="View counts are recorded by this deployment as packages are opened — not imported, not estimated."
          />
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {trending.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                  <Flame className="h-4 w-4 text-brand" /> Most opened
                </h3>
                <ul className="mt-3 space-y-2">
                  {trending.slice(0, 6).map((item, i) => (
                    <li key={item.linkKey}>
                      <button
                        type="button"
                        onClick={() => navigate(`#/package/${encodeURIComponent(item.linkKey)}`)}
                        className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-left transition-colors hover:border-brand/40"
                      >
                        <span className="w-5 shrink-0 text-center font-mono text-[12px] font-semibold text-muted-foreground/60">
                          {i + 1}
                        </span>
                        <KindBadge kind={item.kind} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                          {displayPackageName(item.name)}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 font-mono text-[11.5px] text-muted-foreground">
                          <Eye className="h-3 w-3" />
                          {item.views}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {recent.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                  <History className="h-4 w-4 text-brand" /> Your recent views
                </h3>
                <ul className="mt-3 space-y-2">
                  {recent.slice(0, 6).map((entry) => (
                    <li key={entry.linkKey}>
                      <button
                        type="button"
                        onClick={() => navigate(`#/package/${encodeURIComponent(entry.linkKey)}`)}
                        className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-left transition-colors hover:border-brand/40"
                      >
                        <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                        <KindBadge kind={entry.kind} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                          {displayPackageName(entry.name)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------------------------- agent atlas ---------------------------- */}
      <section className="border-y border-border/60 bg-card/30" aria-labelledby="agents-title">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <SectionHeading
            eyebrow="Works with your agent"
            title={<span id="agents-title">{stats ? `${stats.hosts} hosts` : "50 hosts"}. One command.</span>}
            description="Six hand-written adapters (Claude Code, Codex, OpenCode, Cline, Pi, Grok Build) and forty-four data-driven ones — every host gets the same plan, backup and ledger."
            action={
              <Button variant="outline" className="rounded-xl" onClick={() => navigate("#/agents")}>
                Browse agents <ArrowRight className="h-4 w-4" />
              </Button>
            }
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { name: "Claude Code", detail: "Terminal CLI · MCP + skills", id: "claude-code" },
              { name: "OpenAI Codex", detail: "Terminal CLI · MCP + skills", id: "codex" },
              { name: "Cursor", detail: "IDE · MCP", id: "cursor" },
              { name: "Gemini CLI", detail: "Terminal CLI · MCP + skills", id: "gemini-cli" },
              { name: "OpenCode", detail: "Open source · MCP + skills", id: "opencode" },
              { name: "Cline", detail: "VS Code agent · MCP + skills", id: "cline" },
              { name: "GitHub Copilot", detail: "CLI + IDE · MCP", id: "github-copilot" },
              { name: "Zed", detail: "Editor · MCP", id: "zed" },
            ].map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => navigate(`#/agent/${agent.id}`)}
                className="group rounded-xl border border-border/70 bg-card p-4 text-left transition-all hover:border-brand/40 hover:shadow-[0_2px_16px_-6px_rgba(16,185,129,0.2)]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-semibold tracking-tight">{agent.name}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-colors group-hover:text-brand" />
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">{agent.detail}</p>
                <p className="mt-2.5 font-mono text-[10.5px] text-brand/80">
                  litespm host setup {agent.id}
                </p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => navigate("#/agents")}
              className="group flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/50 p-4 text-center transition-all hover:border-brand/40"
            >
              <span className="font-mono text-[20px] font-semibold text-brand">
                {stats ? `+${Math.max(stats.hosts - 8, 42)}` : "+42"}
              </span>
              <span className="mt-1 text-[12px] text-muted-foreground">
                more hosts, every one the same command
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ----------------------------- trust row ----------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="trust-title">
        <SectionHeading
          eyebrow="Why agents trust it"
          title={<span id="trust-title">Your machine, your keys.</span>}
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: ShieldCheck,
              title: "No account, no telemetry",
              body: "No sign-up, no tracking, no proxy. Credentials stay in your environment or OS vault.",
            },
            {
              icon: RotateCcw,
              title: "Restore is exact",
              body: "restore rolls a config back to its previous bytes — not a re-merge, the actual bytes.",
            },
            {
              icon: Bookmark,
              title: "Ledger ownership",
              body: "install remove strips only the nodes LiteSPM wrote. Your own edits are left alone.",
            },
            {
              icon: Star,
              title: "A real catalog",
              body: `${counts ? formatFull(counts.all) : "69k"} listings, each with publisher, source and installability stated up front.`,
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-border/70 bg-card p-5">
              <item.icon className="h-5 w-5 text-brand" />
              <h3 className="mt-3 text-[14.5px] font-semibold tracking-tight">{item.title}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
        {stats?.release && (
          <p className="mt-6 font-mono text-[10.5px] leading-relaxed text-muted-foreground/70">
            release {stats.release.releaseId} · sequence {stats.release.sequence} ·{" "}
            {formatDate(stats.release.createdAt)} · manifest {stats.release.manifestDigest.slice(0, 22)}
            … · dataset {stats.release.datasetDigest.slice(0, 22)}…
          </p>
        )}
      </section>

      {/* ------------------------------ bottom CTA ------------------------------ */}
      <section className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-12 sm:px-6">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand">
              Ready when you are
            </p>
            <h2 className="mt-1.5 text-[24px] font-semibold tracking-tight sm:text-[27px]">
              Point your agent at the whole catalog.
            </h2>
            <p className="mt-1.5 max-w-[54ch] text-[13.5px] text-muted-foreground">
              Install LiteSPM once and <span className="font-mono text-[12.5px]">/marketplace</span>{" "}
              inside a connected agent reaches the same catalog through the bridge.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <InstallBar command="npm install -g litespm" label="npm" className="w-[320px]" />
            <Button
              variant="outline"
              className="h-10 rounded-xl px-4"
              onClick={() => navigate("#/docs/getting-started")}
            >
              <Package className="h-4 w-4" /> Read the quickstart
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** One ranked rail — competitor-style ranked list, but with real per-listing scores. */
function TopRail({
  title,
  href,
  items,
}: {
  title: string;
  href: string;
  items: CatalogHit[];
}) {
  const navigate = useApp((s) => s.navigate);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-muted/40" />
        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <h3 className="text-[14.5px] font-semibold tracking-tight">{title}</h3>
        <button
          type="button"
          onClick={() => navigate(href)}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
        >
          View top 100 <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <ol className="divide-y divide-border/50">
        {items.map((hit, i) => (
          <li key={hit.id}>
            <button
              type="button"
              onClick={() => navigate(`#/package/${encodeURIComponent(hit.linkKey)}`)}
              className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-brand-soft/40"
            >
              <span className="w-6 shrink-0 text-center font-mono text-[12px] font-semibold text-muted-foreground/50">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold tracking-tight group-hover:text-brand">
                  {displayPackageName(hit.name)}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {hit.publisher.name} · {hit.goal ? (GOAL_LABELS[hit.goal] ?? hit.category) : hit.category}
                </span>
              </span>
              <RankBadge score={hit.rankScore} size="sm" className="shrink-0" />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
