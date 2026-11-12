"use client";

import * as React from "react";
import { animate, motion, useInView } from "framer-motion";
import {
  ArrowRight,
  Bookmark,
  Cable,
  CheckCircle2,
  ChevronDown,
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
  Terminal,
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
import facts from "@/lib/litespm/site-facts.json";
import { IN_AGENT } from "@/lib/litespm/in-agent";
import { InstallBar } from "../install-bar";
import { NavLink } from "../nav-link";
import { TerminalHero } from "../terminal";
import { KindBadge, SectionHeading } from "../primitives";
import { RankBadge, RankExplainer } from "../rank-badge";
import { PopularBundles } from "./bundles";

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

const HERO_WORDS = ["The", "package", "manager", "for", "AI", "agents."];

// Every name here is an MCP host in web/data/hosts.json.
const MARQUEE_AGENTS = [
  "Claude Code", "Cursor", "GitHub Copilot", "OpenAI Codex", "Gemini CLI", "Cline", "OpenCode",
  "Zed", "VS Code", "Antigravity", "Pi", "Grok Build", "Kiro CLI", "Amp", "Roo Code", "Kilo Code",
  "Junie", "Augment", "Qwen Code", "Crush", "Droid", "Tabnine CLI", "Devin", "OpenHands",
];

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

  // Pointer spotlight: write CSS variables straight to the element (one rAF
  // per frame, no React state), so moving the mouse never re-renders the page.
  const heroRef = React.useRef<HTMLElement>(null);
  const pointerFrame = React.useRef(0);
  const onHeroPointer = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = heroRef.current;
    if (!el) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(pointerFrame.current);
    pointerFrame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${clientX - r.left}px`);
      el.style.setProperty("--my", `${clientY - r.top}px`);
    });
  }, []);
  React.useEffect(() => () => cancelAnimationFrame(pointerFrame.current), []);

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
    fetch("/api/litespm/list?sort=rank&kind=mcp&installable=1&pageSize=8&facets=0")
      .then((r) => r.json())
      .then((data: CatalogListResponse) => setTopMcp(data.items ?? []))
      .catch(() => {});
    fetch("/api/litespm/list?sort=rank&kind=skill&installable=1&pageSize=8&facets=0")
      .then((r) => r.json())
      .then((data: CatalogListResponse) => setTopSkills(data.items ?? []))
      .catch(() => {});
  }, []);

  // One number system (server/litespm/counts.ts): "listings" = unique listings.
  const counts = stats
    ? { ...stats.telemetry.counts, all: stats.counts?.uniqueListings ?? stats.telemetry.counts.all }
    : undefined;
  const cliVersion = Array.isArray(stats?.cli)
    ? stats.cli[0]?.version
    : ((stats?.cli as unknown as { version?: string })?.version ?? null);

  const steps = [
    {
      icon: Search,
      title: "Find it once",
      body: `Search ${counts ? formatFull(counts.all) : "the"} listings — MCP servers, skills and plugins — with publisher, source and installability stated up front.`,
    },
    {
      icon: Cable,
      title: "Install everywhere",
      body: `One command writes the entry into every agent you target: Cursor, GitHub Copilot, Cline, Claude Code, Codex and ${(stats?.hosts ?? facts.hosts) - 5} more.`,
    },
    {
      icon: Undo2,
      title: "Undo is a single command",
      body: "Every write is previewed, backed up and recorded in a ledger. Run litespm restore <installId> and your config rolls back byte-for-byte.",
    },
  ];

  return (
    <div className="flex flex-col">
      {/* ------------------------------- hero ------------------------------- */}
      <section
        ref={heroRef}
        onPointerMove={onHeroPointer}
        className="relative overflow-hidden border-b border-border/60"
      >
        {/* Background: masked grid, two drifting aurora fields and a soft
            spotlight that follows the pointer. All transform/opacity only. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="hero-grid absolute inset-0" />
          <div className="aurora aurora-a -top-48 left-[8%] h-[460px] w-[620px] bg-brand/[0.16]" />
          <div className="aurora aurora-b -top-24 right-[-6%] h-[420px] w-[560px] bg-cyan-400/[0.09]" />
          <div className="hero-spotlight absolute inset-0" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="min-w-0">
            <p
              className="rise-block inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand"
              style={{ "--d": "0ms" } as React.CSSProperties}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
              </span>
              {cliVersion ? `v${cliVersion.replace(/^v/, "")} on npm` : "on npm"} ·{" "}
              {`${stats?.hosts ?? facts.hosts} agent hosts`}
            </p>

            <h1 className="mt-5 text-[clamp(2.6rem,6vw,4.6rem)] font-semibold leading-[1.0] tracking-[-0.045em]">
              <span className="sr-only">The package manager for AI agents. Install once, use everywhere.</span>
              <span aria-hidden="true">
                {HERO_WORDS.map((word, i) => (
                  <React.Fragment key={word + i}>
                    <span className="rise-word" style={{ "--i": i } as React.CSSProperties}>
                      {word}
                    </span>{" "}
                  </React.Fragment>
                ))}
                <br />
                <span
                  className="rise-word text-sheen pb-[0.08em]"
                  style={{ "--i": HERO_WORDS.length + 1 } as React.CSSProperties}
                >
                  Install once, use everywhere.
                </span>
              </span>
            </h1>

            <p
              className="rise-block mt-6 max-w-[54ch] text-[15px] leading-relaxed text-muted-foreground sm:text-[16.5px]"
              style={{ "--d": "520ms" } as React.CSSProperties}
            >
              Discover, install and manage MCP servers, skills and plugins across{" "}
              {stats?.hosts ?? facts.hosts} agent hosts, without manual config editing. Every change
              is previewed, backed up and reversible with one command. No account, no telemetry.
            </p>

            <div
              className="rise-block mt-7 max-w-md"
              style={{ "--d": "620ms" } as React.CSSProperties}
            >
              <InstallBar command="npm install -g litespm" label="npm" />
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                Then run <code className="font-mono text-foreground/90">litespm</code> to connect
                your agents.
              </p>
            </div>

            <div
              className="rise-block mt-6 flex flex-wrap items-center gap-3"
              style={{ "--d": "720ms" } as React.CSSProperties}
            >
              <Button
                asChild
                size="lg"
                className="btn-shine h-11 rounded-xl bg-brand px-5 text-[14.5px] font-semibold text-brand-foreground shadow-[0_8px_30px_-8px_var(--brand)] transition-transform hover:bg-brand/90 active:scale-[0.98]"
              >
                <NavLink to="/marketplace">
                  Browse the marketplace <ArrowRight className="h-4 w-4" />
                </NavLink>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 rounded-xl px-5 text-[14.5px] transition-transform active:scale-[0.98]"
              >
                <NavLink to="/docs/getting-started">Read the quickstart</NavLink>
              </Button>
            </div>

            <dl
              className="rise-block mt-9 grid max-w-lg grid-cols-3 gap-3 border-t border-border/50 pt-6"
              style={{ "--d": "820ms" } as React.CSSProperties}
            >
              <div
                className="flex cursor-pointer flex-col transition-opacity hover:opacity-85"
                title={counts ? `${formatFull(counts.all)} unique listings (${stats ? formatFull(stats.installable) : "…"} installable). ${stats?.counts ? formatFull(stats.counts.catalogRows) : "…"} raw catalog rows before exact duplicates are removed.` : "Listings"}
                onClick={() => navigate(exploreHash({}))}
              >
                <dt className="order-2 mt-0.5 text-[11.5px] font-medium text-muted-foreground">
                  Listings
                  <span className="block text-[10px] text-muted-foreground/60">MCP, skills & plugins</span>
                </dt>
                <dd className="order-1 font-mono text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-foreground">
                  {counts ? <CountUp value={counts.all} format={(n) => formatFull(n)} /> : "…"}
                </dd>
              </div>
              <div className="flex flex-col" title="Agent hosts LiteSPM can configure">
                <dt className="order-2 mt-0.5 text-[11.5px] font-medium text-muted-foreground">
                  Agent hosts
                  <span className="block text-[10px] text-muted-foreground/60">CLI, IDE & desktop</span>
                </dt>
                <dd className="order-1 font-mono text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-foreground">
                  {stats ? <CountUp value={stats.hosts} format={(n) => String(n)} /> : String(facts.hosts)}
                </dd>
              </div>
              <div
                className="flex cursor-pointer flex-col transition-opacity hover:opacity-85"
                title={`${stats ? formatFull(stats.installable) : "…"} listings LiteSPM can install`}
                onClick={() => navigate(exploreHash({ installable: "1" }))}
              >
                <dt className="order-2 mt-0.5 text-[11.5px] font-medium text-brand">
                  Installable →
                  <span className="block text-[10px] text-muted-foreground/60">One command each</span>
                </dt>
                <dd className="order-1 font-mono text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-foreground">
                  {stats ? <CountUp value={stats.installable} format={(n) => formatFull(n)} /> : "…"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rise-block relative min-w-0" style={{ "--d": "300ms" } as React.CSSProperties}>
            {/* Floating callouts: decorative, hidden from assistive tech. */}
            <div
              aria-hidden="true"
              className="float-y absolute -left-8 -top-7 z-10 hidden items-center gap-2 rounded-xl border border-border/70 bg-card/90 px-3 py-2 text-[11.5px] shadow-xl backdrop-blur lg:flex"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-brand" />
              <span className="font-medium">Backup saved</span>
              <span className="font-mono text-muted-foreground">~/.claude.json</span>
            </div>
            <div
              aria-hidden="true"
              className="float-y absolute -right-7 top-[44%] z-10 hidden items-center gap-2 rounded-xl border border-border/70 bg-card/90 px-3 py-2 text-[11.5px] shadow-xl backdrop-blur lg:flex"
              style={{ animationDelay: "-3s" }}
            >
              <Undo2 className="h-3.5 w-3.5 text-brand" />
              <span className="font-medium">Undo with one command</span>
            </div>

            <div className="glow-frame shadow-[0_30px_90px_-30px_rgba(16,185,129,0.35)]">
              <TerminalHero framed hostsCount={stats?.hosts ?? facts.hosts} />
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------- agents marquee ----------------------------- */}
      <section className="border-b border-border/60 bg-card/40 py-5" aria-label="Supported agents">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
          <p className="shrink-0 text-[12px] font-medium text-muted-foreground">
            Works with the agents you already use
          </p>
          <div className="marquee min-w-0 flex-1 overflow-hidden">
            <ul className="marquee-track gap-2.5">
              {[0, 1].map((copy) =>
                MARQUEE_AGENTS.map((name) => (
                  <li
                    key={`${copy}-${name}`}
                    aria-hidden={copy === 1 ? true : undefined}
                    className={`${copy === 1 ? "marquee-dup " : ""}inline-flex shrink-0 items-center rounded-lg border border-border/70 bg-card px-2.5 py-1 text-xs text-foreground/90`}
                  >
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
                    {name}
                  </li>
                )),
              )}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => navigate("#/agents")}
            className="shrink-0 text-left text-[12px] font-semibold text-brand hover:underline"
          >
            All {stats?.hosts ?? facts.hosts} agents →
          </button>
        </div>
      </section>

      {/* ----------------------------- why litespm ----------------------------- */}
      <section className="border-b border-border/60 bg-card/20 py-16 sm:py-20" aria-labelledby="why-title">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-[70ch]">
            <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-brand">
              <Sparkles className="h-4 w-4" /> Why LiteSPM?
            </p>
            <h2 id="why-title" className="mt-2 text-[clamp(1.9rem,3.8vw,2.7rem)] font-semibold leading-tight tracking-[-0.035em]">
              Every agent has its own config. <br className="hidden sm:inline" />
              <span className="text-brand">One workflow covers them all.</span>
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Every agent keeps its own configuration file in its own format, and every server ships its own setup steps. LiteSPM knows all of them: it writes the exact entry each agent expects, keeps a backup of the file, and records what it wrote so it can take it out again.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: /marketplace inside chat */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ delay: 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-border/70 bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_12px_28px_-10px_rgba(16,185,129,0.12)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand font-mono text-[13px] font-bold">
                /m
              </div>
              <h3 className="mt-4 text-[16px] font-semibold tracking-tight">Marketplace inside your agent</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-brand text-[12px]">litespm setup</code> adds a marketplace command to each agent: an interactive popup in Pi, OpenCode, Claude Code and Copilot CLI, a prompt command in most others. Or run <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-brand text-[12px]">litespm marketplace</code> in any terminal.
              </p>
            </motion.div>

            {/* Card 2: Install Once & Forget */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ delay: 0.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-border/70 bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_12px_28px_-10px_rgba(16,185,129,0.12)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-[16px] font-semibold tracking-tight">Local, fast, always current</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-brand text-[12px]">npm install -g litespm</code>, then run it. From 0.6.1 the catalog downloads itself on first use and refreshes in the background at most every 6 hours, and search runs on a local SQLite full-text index: milliseconds, around 30 MB of memory.
              </p>
            </motion.div>

            {/* Card 3: Auto-Backup & Undo */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ delay: 0.19, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-border/70 bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_12px_28px_-10px_rgba(16,185,129,0.12)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-[16px] font-semibold tracking-tight">Automatic backup, one-command undo</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                LiteSPM backs up your agent&apos;s configuration before writing any change. To roll back, <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-brand text-[11.5px]">litespm restore &lt;installId&gt;</code> puts your file back to its exact previous bytes without touching manual edits.
              </p>
            </motion.div>

            {/* Card 4: Built for Everyone */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ delay: 0.26, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-border/70 bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_12px_28px_-10px_rgba(16,185,129,0.12)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Terminal className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-[16px] font-semibold tracking-tight">Guided wizard or plain flags</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Prefer a guided flow? Run <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-brand text-[12px]">litespm</code> for the interactive wizard. Scripting it? Use flags such as <code className="font-mono text-[11.5px]">--agent</code> and <code className="font-mono text-[11.5px]">--scope</code>.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ------------------------ in-agent marketplace ------------------------ */}
      <section className="border-b border-border/60 py-14" aria-labelledby="inagent-title">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
              Without leaving your agent
            </p>
            <h2 id="inagent-title" className="mt-1.5 text-[clamp(1.6rem,3vw,2.2rem)] font-semibold leading-tight tracking-[-0.03em]">
              The marketplace, one command away
            </h2>
            <p className="mt-3 max-w-[56ch] text-[14px] leading-relaxed text-muted-foreground">
              <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[12px] text-brand">litespm setup</code>{" "}
              connects an agent and installs a marketplace command inside it. Where the agent can
              draw a view you get an interactive popup that spends no model turn; elsewhere you get
              a prompt command and the agent&apos;s own model drives LiteSPM. It never approves an
              install for you.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-xl">
                <NavLink to="/docs/in-agent-marketplace">How it works</NavLink>
              </Button>
              <Button asChild variant="ghost" className="rounded-xl text-brand hover:text-brand">
                <NavLink to="/docs/agent-compatibility">
                  Agent compatibility <ArrowRight className="h-4 w-4" />
                </NavLink>
              </Button>
            </div>
            <p className="mt-3 text-[11.5px] text-muted-foreground">
              Ships in 0.6.1; npm currently serves {facts.npmVersion}.
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Agents with an interactive popup">
            {IN_AGENT.filter((e) => e.kind === "popup").map((e) => (
              <li key={e.agent} className="rounded-xl border border-border/70 bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-semibold">{e.agent}</span>
                  <span className="rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand">
                    Popup
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[11.5px] text-foreground/90">{e.invoke}</p>
              </li>
            ))}
            <li className="rounded-xl border border-dashed border-border/70 bg-card/50 p-3.5 text-[12.5px] text-muted-foreground">
              + prompt commands for Gemini CLI, Qwen Code, Kiro CLI, Cursor, Codex, Cline and more.
            </li>
          </ul>
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
                // "Other" is the catch-all bucket: it is the largest, and it
                // must not lead a "start from a goal" row.
                .sort(([a], [b]) => Number(a === "other") - Number(b === "other"))
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
                <span className="font-mono text-[11px] font-semibold text-muted-foreground/52">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-4 text-[16px] font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <PopularBundles />

      {/* --------------------------- featured shelf --------------------------- */}
      <section className="border-y border-border/60 bg-card/30" aria-labelledby="featured-title">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <SectionHeading
            eyebrow="Curated shelves"
            title={<span id="featured-title">Start with these</span>}
            description="Hand-picked collections of the most useful MCP servers, skills and toolkits to get you started."
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
          <div
            className={`mt-8 grid gap-6 ${
              trending.length > 0 && recent.length > 0 ? "lg:grid-cols-2" : "grid-cols-1"
            }`}
          >
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
            title={<span id="agents-title">{stats?.hosts ?? facts.hosts} hosts. One command.</span>}
            description="Whether you build in Cursor, Claude Code, Cline, or Copilot — every agent host gets automatic configuration, pre-write backups, and a rollback ledger."
            action={
              <Button variant="outline" className="rounded-xl" onClick={() => navigate("#/agents")}>
                Browse agents <ArrowRight className="h-4 w-4" />
              </Button>
            }
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { name: "Cursor", detail: "AI IDE · MCP", id: "cursor" },
              { name: "GitHub Copilot", detail: "CLI + IDE · MCP", id: "github-copilot" },
              { name: "Cline", detail: "VS Code agent · MCP + skills", id: "cline" },
              { name: "Claude Code", detail: "Terminal CLI · MCP + skills", id: "claude-code" },
              { name: "OpenAI Codex", detail: "Terminal CLI · MCP + skills", id: "codex" },
              { name: "Gemini CLI", detail: "Terminal CLI · MCP + skills", id: "gemini-cli" },
              { name: "Zed", detail: "Editor · MCP", id: "zed" },
              { name: "OpenCode", detail: "Open source · MCP + skills", id: "opencode" },
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
                {`+${Math.max((stats?.hosts ?? facts.hosts) - 8, 0)}`}
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
          eyebrow="Why developers trust it"
          title={<span id="trust-title">Your machine, your keys.</span>}
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: ShieldCheck,
              title: "Private by design",
              body: "No user account, no credentials proxy. Keys and configs stay entirely on your local machine.",
            },
            {
              icon: RotateCcw,
              title: "Restore is byte-exact",
              body: "litespm restore rolls a config back to its previous bytes — not a re-merge, the exact file bytes.",
            },
            {
              icon: Bookmark,
              title: "Ledger ownership",
              body: "litespm install remove strips only the nodes LiteSPM wrote. Your own manual edits are left untouched.",
            },
            {
              icon: Star,
              title: "Verified capabilities",
              body: "Installable packages include verified repository sources or active transport endpoints.",
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
          <p className="mt-6 text-[11.5px] text-muted-foreground/75">
            Catalog release {stats.release.releaseId} · Updated {formatDate(stats.release.createdAt)} ·{" "}
            <button
              type="button"
              onClick={() => navigate("#/insights")}
              className="text-brand hover:underline"
            >
              Verified catalog index & audits →
            </button>
          </p>
        )}
      </section>

      {/* ------------------------------ FAQ ------------------------------ */}
      <section className="border-t border-border/60 bg-card/25 py-16 sm:py-20" aria-labelledby="faq-title">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand">
              Frequently Asked Questions
            </p>
            <h2 id="faq-title" className="mt-2 text-[clamp(1.8rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.03em]">
              Common questions, clear answers.
            </h2>
            <p className="mx-auto mt-3 max-w-[54ch] text-[14px] leading-relaxed text-muted-foreground">
              Everything you need to know about package installability, config backups, and multi-agent support.
            </p>
          </div>

          <div className="mt-10 space-y-3">
            {[
              {
                q: "Do I need to sync the catalog myself?",
                a: `Not from 0.6.1 on (npm currently serves ${facts.npmVersion}, where you run litespm catalog sync once first). The first run that needs the catalog downloads it in the foreground; later runs start a background sync at most every 6 hours. Downloads are digest-verified, and search runs against a local SQLite full-text index built from that verified download. Set LITESPM_NO_AUTO_SYNC=1 (or run in CI) to turn automatic sync off; litespm catalog sync still works on demand.`,
              },
              {
                q: "Why are some packages marked 'Installable' while others are 'Discovery-Only'?",
                a: `LiteSPM operates on a zero-guesswork safety standard. To automatically inject an MCP server into your agent's config, LiteSPM requires a verified runtime contract: either an exact streamable remote URL (HTTP/SSE) or a confirmed local execution command (command + args). For community packages that only publish a GitHub link or README without structured launch parameters, LiteSPM refuses to guess commands (such as guessing between npx, python, or uvx) that could break your agent. We index all ${Math.floor(facts.listings / 1000)}k+ community capabilities so you can find them and view their source code, but single-command setup is reserved for packages with verified launch details.`,
              },
              {
                q: "What does 'Discovery only' mean?",
                a: "The catalog has the listing's metadata but no verified source or launch line LiteSPM can use. The detail page links only to the source the catalog recorded; it does not guess a repository.",
              },
              {
                q: "How does LiteSPM install capabilities into my AI agent?",
                a: "LiteSPM writes surgical configuration changes directly into your agent's documented configuration file (such as ~/.claude.json for Claude Code or cline_mcp_settings.json for Cline). Before writing any file, LiteSPM previews the exact diff, backs up your existing file, and logs the change to an undo ledger.",
              },
              {
                q: "Can LiteSPM break or overwrite my existing agent settings?",
                a: "It is built not to. LiteSPM's JSONC and TOML parsers preserve your existing entries, comments and structure, and it only adds the capability entry. Every write is previewed and backed up first, so if something does go wrong, litespm restore puts the file back to its exact previous bytes. When you remove a package, only the nodes LiteSPM created are removed; edits you made before or after install are kept.",
              },
              {
                q: "How do plugins with host-specific extras work?",
                a: "Plugins can bundle both portable components (universal MCP servers and agent skills) and host-specific extras (such as IDE commands, editor hooks, or subagents). LiteSPM installs all portable servers and skills into any supported agent. If a plugin contains editor extras that cannot run universally, you can install its portable components with: litespm install <id> --allow-partial. The source must still be commit-pinned; the flag does not bypass pinning.",
              },
              {
                q: "Which AI coding agents are supported?",
                a: `LiteSPM supports ${facts.hosts} agent hosts for local stdio MCP servers (including Cursor, Claude Code, Cline, OpenAI Codex, OpenCode, Grok Build, Gemini CLI, and GitHub Copilot) and ${facts.skillTargets} targets for skills, covering terminal, IDE, and desktop environments. ${facts.remoteHosts} hosts also document a native remote (URL) entry; the other ${facts.hosts - facts.remoteHosts} (${facts.localOnlyHostNames.join(", ")}) support local stdio only and refuse a remote install.`,
              },
              {
                q: "Can I browse and install from inside my agent?",
                a: `Yes, from the next release (0.6.1; npm currently serves ${facts.npmVersion}). litespm setup installs a marketplace command into each agent. Pi, OpenCode, Claude Code and GitHub Copilot CLI get an interactive popup that needs no model turn; Gemini CLI, Qwen Code, Kiro CLI, Cursor, Augment, Roo, Factory Droid, Kilo, Cline, Grok Build, Codex and Crush get a prompt command that has the agent's model drive LiteSPM's tools. Some agents (Zed, Windsurf, Continue, Aider, Warp, OpenHands, Goose) have no extension surface for either. See Docs → Agent compatibility.`,
              },
            ].map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-border/70 bg-card p-5 transition-all hover:border-brand/35 hover:shadow-sm"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-[14.5px] text-foreground [&::-webkit-details-marker]:hidden">
                  <span>{item.q}</span>
                  <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180">
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </summary>
                <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                  {item.a}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => navigate("#/docs/troubleshooting")}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
            >
              Browse all documentation & troubleshooting guides <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
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
              Install LiteSPM once and <span className="font-mono text-[12.5px]">/litespm-marketplace</span>{" "}
              inside a connected agent reaches the same catalog through the bridge.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <InstallBar command="npm install -g litespm" label="npm" className="w-[320px]" />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-10 flex-1 rounded-xl px-4"
                onClick={() => navigate("#/docs/getting-started")}
              >
                <Package className="h-4 w-4" /> Quickstart
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-xl px-4 text-brand border-brand/30 hover:bg-brand-soft"
                onClick={() => setAssistant(true)}
              >
                <Sparkles className="h-4 w-4" /> Ask AI
              </Button>
            </div>
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
      <ol className="divide-y divide-border/52">
        {items.map((hit, i) => (
          <li key={hit.id}>
            <button
              type="button"
              onClick={() => navigate(`#/package/${encodeURIComponent(hit.linkKey)}`)}
              className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-brand-soft/40"
            >
              <span className="w-6 shrink-0 text-center font-mono text-[12px] font-semibold text-muted-foreground/52">
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
