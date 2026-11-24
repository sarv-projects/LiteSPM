"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
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
  Terminal,
  Trophy,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { formatFull, formatDate, displayPackageName, formatVersion } from "@/lib/litespm/format";
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

const HERO_WORDS = ["The", "Package", "Manager", "for", "AI", "Agents."];

type ExploreTab = "ranked" | "goals" | "bundles" | "featured" | "trending";

const EXPLORE_TABS: Array<{ id: ExploreTab; label: string; icon: React.ElementType }> = [
  { id: "ranked", label: "Ranked", icon: Trophy },
  { id: "goals", label: "By goal", icon: Sparkles },
  { id: "bundles", label: "Bundles", icon: Package },
  { id: "featured", label: "Featured", icon: Bookmark },
  { id: "trending", label: "Trending", icon: Flame },
];

// Every name here is an MCP host in web/data/hosts.json.
const MARQUEE_AGENTS = [
  "Claude Code", "Cursor", "GitHub Copilot", "OpenAI Codex", "Gemini CLI", "Cline", "OpenCode",
  "Zed", "VS Code", "Antigravity", "Pi", "Grok Build", "Kiro CLI", "Amp", "Roo Code", "Kilo Code",
  "Junie", "Augment", "Qwen Code", "Crush", "Droid", "Tabnine CLI", "Devin", "OpenHands",
];

/**
 * Hero stat. It used to count up from 0 when scrolled into view, so anyone
 * scrolling past (or a screenshot) saw a wrong number such as 69,148. The real
 * value is shown at once; the block's own rise-in is the only motion.
 */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  return <span className="tabular-nums">{format(value)}</span>;
}

export function HomeView() {
  const navigate = useApp((s) => s.navigate);
  const [stats, setStats] = React.useState<CatalogStatsResponse | null>(null);
  const [featured, setFeatured] = React.useState<FeaturedResponse | null>(null);
  const [trending, setTrending] = React.useState<TrendingItem[]>([]);
  const [topMcp, setTopMcp] = React.useState<CatalogHit[]>([]);
  const [topSkills, setTopSkills] = React.useState<CatalogHit[]>([]);
  const [exploreTab, setExploreTab] = React.useState<ExploreTab>("ranked");
  type InstallMode = "npm" | "curl" | "powershell" | "npx";
  const [installMode, setInstallMode] = React.useState<InstallMode>("npm");
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
          <div className="aurora aurora-a -top-48 left-[8%] h-[460px] w-[620px] bg-brand/[0.18]" />
          <div className="aurora aurora-b -top-24 right-[-6%] h-[420px] w-[560px] bg-cyan-400/[0.11]" />
          <div className="aurora aurora-c -bottom-28 right-[18%] h-[380px] w-[520px] bg-emerald-500/[0.13]" />
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
              {cliVersion ? `${formatVersion(cliVersion)} on npm` : "on npm"} ·{" "}
              {`${stats?.hosts ?? facts.hosts} agent hosts`}
            </p>

            <h1 className="mt-5 text-[clamp(2.4rem,5.5vw,4.4rem)] font-semibold leading-[1.0] tracking-[-0.045em]">
              <span className="sr-only">The Package Manager for AI Agents. Install, configure, and safely rollback across 50+ AI tools.</span>
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
                  Install, configure, and safely rollback.
                </span>
              </span>
            </h1>

            <p
              className="rise-block mt-6 max-w-[54ch] text-[15px] leading-relaxed text-muted-foreground sm:text-[16.5px]"
              style={{ "--d": "520ms" } as React.CSSProperties}
            >
              One command to install and manage MCP servers, skills, and plugins across Cursor, Claude Code, Codex, and {(stats?.hosts ?? facts.hosts) - 3} more — with surgical diff previews, automatic backups, and byte-exact undo.
            </p>

            <div
              className="rise-block mt-7 max-w-md"
              style={{ "--d": "620ms" } as React.CSSProperties}
            >
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setInstallMode("npm")}
                  className={cn(
                    "rounded-md px-2 py-0.5 transition-colors",
                    installMode === "npm"
                      ? "bg-brand text-brand-foreground font-semibold"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  npm
                </button>
                <button
                  type="button"
                  onClick={() => setInstallMode("curl")}
                  className={cn(
                    "rounded-md px-2 py-0.5 transition-colors",
                    installMode === "curl"
                      ? "bg-brand text-brand-foreground font-semibold"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  curl (macOS/Linux)
                </button>
                <button
                  type="button"
                  onClick={() => setInstallMode("powershell")}
                  className={cn(
                    "rounded-md px-2 py-0.5 transition-colors",
                    installMode === "powershell"
                      ? "bg-brand text-brand-foreground font-semibold"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  PowerShell (Windows)
                </button>
                <button
                  type="button"
                  onClick={() => setInstallMode("npx")}
                  className={cn(
                    "rounded-md px-2 py-0.5 transition-colors",
                    installMode === "npx"
                      ? "bg-brand text-brand-foreground font-semibold"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  npx
                </button>
              </div>

              {installMode === "npm" && (
                <>
                  <InstallBar command="npm install -g litespm" label="npm" />
                  <p className="mt-2 text-[11.5px] text-muted-foreground">
                    Recommended for Node developers (requires Node 22.22+ — or use <strong className="text-foreground">curl / PowerShell</strong> with zero Node). Run <code className="font-mono text-foreground/90">litespm</code> to connect your agents.
                  </p>
                </>
              )}
              {installMode === "curl" && (
                <>
                  <InstallBar command={`curl -fsSL ${process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://lite-spm-nine.vercel.app"}/install.sh | sh`} label="sh" />
                  <p className="mt-2 text-[11.5px] text-muted-foreground">
                    Standalone native binary for macOS and Linux (arm64 & amd64). <strong className="text-foreground">Zero Node required.</strong>
                  </p>
                </>
              )}
              {installMode === "powershell" && (
                <>
                  <InstallBar command={`irm ${process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://lite-spm-nine.vercel.app"}/install.ps1 | iex`} label="pwsh" />
                  <p className="mt-2 text-[11.5px] text-muted-foreground">
                    Standalone native binary for Windows (amd64 & arm64). <strong className="text-foreground">Zero Node required.</strong>
                  </p>
                </>
              )}
              {installMode === "npx" && (
                <>
                  <InstallBar command="npx litespm" label="npx" />
                  <p className="mt-2 text-[11.5px] text-muted-foreground">
                    Run once on demand without global install. Connects agents and exits cleanly.
                  </p>
                </>
              )}
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
                  <span className="block text-[10px] text-muted-foreground/85">MCP, skills & plugins</span>
                </dt>
                <dd className="order-1 font-mono text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-foreground">
                  {counts ? <CountUp value={counts.all} format={(n) => formatFull(n)} /> : "…"}
                </dd>
              </div>
              <div className="flex flex-col" title="Agent hosts LiteSPM can configure">
                <dt className="order-2 mt-0.5 text-[11.5px] font-medium text-muted-foreground">
                  Agent hosts
                  <span className="block text-[10px] text-muted-foreground/85">CLI, IDE & desktop</span>
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
                  <span className="block text-[10px] text-muted-foreground/85">One command each</span>
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

      {/* ----------------------------- trust strip ----------------------------- */}
      <section className="border-b border-border/60 bg-muted/20 py-3.5" aria-label="Security and safety guarantees">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-[12px] sm:px-6">
          <NavLink
            to="/docs/install-flow"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-brand"
          >
            <Eye className="h-4 w-4 text-brand" />
            <span className="font-medium text-foreground">Preview before write</span>
            <span className="hidden text-muted-foreground/80 md:inline">— Inspect every config diff</span>
          </NavLink>
          <NavLink
            to="/docs/security"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-brand"
          >
            <ShieldCheck className="h-4 w-4 text-brand" />
            <span className="font-medium text-foreground">Automatic CAS backup</span>
            <span className="hidden text-muted-foreground/80 md:inline">— Pre-image digest verification</span>
          </NavLink>
          <NavLink
            to="/docs/install-flow"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-brand"
          >
            <RotateCcw className="h-4 w-4 text-brand" />
            <span className="font-medium text-foreground">Byte-exact undo</span>
            <span className="hidden text-muted-foreground/80 md:inline">— Reversible in one command</span>
          </NavLink>
          <NavLink
            to="/docs/security"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-brand"
          >
            <BadgeCheck className="h-4 w-4 text-brand" />
            <span className="font-medium text-foreground">Sigstore-signed releases</span>
            <span className="hidden text-muted-foreground/80 md:inline">— Keyless GitHub OIDC provenance</span>
          </NavLink>
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
                <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-brand text-[12px]">npm install -g litespm</code>, then run it. The catalog downloads itself on first use and refreshes in the background at most every 6 hours, and search runs on a local SQLite full-text index: milliseconds, around 30 MB of memory.
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
              Included in v{facts.npmVersion} (latest release).
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

      {/* --------------------------- explore (tabs) --------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="explore-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">One catalog, four ways in</p>
            <h2 id="explore-title" className="mt-1 text-[26px] font-semibold tracking-tight sm:text-[30px]">
              Explore the catalog
            </h2>
            <p className="mt-1 max-w-[64ch] text-[13px] text-muted-foreground">
              Pick a view: a transparent score, a task, a curated bundle, or what people open on
              this deployment. Every view leads to the same copyable install command.
            </p>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={() => navigate(exploreHash({ installable: "1" }))}>
            Open full marketplace <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <div role="tablist" aria-label="Explore views" className="mt-6 flex flex-wrap gap-2 border-b border-border/60 pb-3">
          {EXPLORE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={exploreTab === tab.id}
              onClick={() => setExploreTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${exploreTab === tab.id ? "bg-brand-soft text-brand" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
            >
              <tab.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="mt-6">
          {exploreTab === "ranked" && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Trophy className="h-3.5 w-3.5 text-brand" /> Ranked by the LiteSPM score
                  <RankExplainer />
                </p>
                <button type="button" onClick={() => navigate(exploreHash({ sort: "rank", installable: "1" }))} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
                  Full ranking <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <TopRail title="Top MCP servers" href={exploreHash({ sort: "rank", kind: "mcp", installable: "1" })} items={topMcp} />
                <TopRail title="Top agent skills" href={exploreHash({ sort: "rank", kind: "skill", installable: "1" })} items={topSkills} />
              </div>
            </div>
          )}

          {exploreTab === "goals" && stats && stats.goalCounts.length > 0 && (
            <div>
              <p className="text-[12px] text-muted-foreground">The editorial taxonomy groups listings by what you are building. Pick a goal to filter the marketplace.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {stats.goalCounts
                  .filter(([goal]) => GOAL_LABELS[goal])
                  .sort(([a], [b]) => Number(a === "other") - Number(b === "other"))
                  .slice(0, 11)
                  .map(([goal, count]) => (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => navigate(exploreHash({ goal, sort: "rank" }))}
                      className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-[13px] font-medium text-foreground/90 transition-all hover:border-brand/40 hover:bg-brand-soft hover:text-brand"
                    >
                      {GOAL_LABELS[goal]}
                      <span className="rounded-full bg-muted/60 px-1.5 py-px font-mono text-[10.5px] text-muted-foreground group-hover:bg-brand/10 group-hover:text-brand/80">
                        {formatFull(count)}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {exploreTab === "bundles" && (
            <div>
              <p className="text-[12px] text-muted-foreground">Curated sets of installable MCP servers and skills for one job. One copyable command per item.</p>
              <div className="mt-4"><PopularBundles embedded /></div>
            </div>
          )}

          {exploreTab === "featured" && (
            <div>
              <p className="text-[12px] text-muted-foreground">Hand-picked collections from the current catalog release.</p>
              {featured
                ? featured.groups.map((group) => {
                    const entries = featured.entries.filter((e) => e.group === group.id);
                    return (
                      <div key={group.id} className="mt-6">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h3 className="text-[16px] font-semibold tracking-tight">{group.title}</h3>
                          <button type="button" onClick={() => navigate(group.viewAllHref)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
                            {group.viewAllLabel} <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="mt-0.5 max-w-[64ch] text-[12.5px] text-muted-foreground">{group.blurb}</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {entries.map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => navigate(`#/package/${encodeURIComponent(entry.linkKey)}`)}
                              className="group flex flex-col rounded-xl border border-border/70 bg-card p-4 text-left transition-all hover:border-brand/40 hover:shadow-[0_2px_18px_-8px_rgba(16,185,129,0.25)]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <KindBadge kind={entry.kind} />
                              </div>
                              <h4 className="mt-2.5 truncate text-[14.5px] font-semibold tracking-tight">{displayPackageName(entry.name)}</h4>
                              <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{entry.useCase ?? entry.summary}</p>
                              <span className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground transition-colors group-hover:text-brand">
                                View package <ArrowRight className="h-3 w-3" />
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[140px] animate-pulse rounded-xl border border-border/50 bg-muted/30" />)}</div>}
            </div>
          )}

          {exploreTab === "trending" && (
            <div>
              <p className="text-[12px] text-muted-foreground">View counts are recorded by this deployment as packages are opened — not imported, not estimated.</p>
              {(trending.length > 0 || recent.length > 0) ? (
                <div className={`mt-4 grid gap-6 ${trending.length > 0 && recent.length > 0 ? "lg:grid-cols-2" : "grid-cols-1"}`}>
                  {trending.length > 0 && (
                    <div>
                      <h3 className="flex items-center gap-2 text-[14px] font-semibold"><Flame className="h-4 w-4 text-brand" /> Most opened</h3>
                      <ul className="mt-3 space-y-2">
                        {trending.slice(0, 6).map((item, i) => (
                          <li key={item.linkKey}>
                            <button type="button" onClick={() => navigate(`#/package/${encodeURIComponent(item.linkKey)}`)} className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-left transition-colors hover:border-brand/40">
                              <span className="w-5 shrink-0 text-center font-mono text-[12px] font-semibold text-muted-foreground/80">{i + 1}</span>
                              <KindBadge kind={item.kind} />
                              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{displayPackageName(item.name)}</span>
                              <span className="flex shrink-0 items-center gap-1 font-mono text-[11.5px] text-muted-foreground"><Eye className="h-3 w-3" />{item.views}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {recent.length > 0 && (
                    <div>
                      <h3 className="flex items-center gap-2 text-[14px] font-semibold"><History className="h-4 w-4 text-brand" /> Your recent views</h3>
                      <ul className="mt-3 space-y-2">
                        {recent.slice(0, 6).map((entry) => (
                          <li key={entry.linkKey}>
                            <button type="button" onClick={() => navigate(`#/package/${encodeURIComponent(entry.linkKey)}`)} className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-left transition-colors hover:border-brand/40">
                              <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
                              <KindBadge kind={entry.kind} />
                              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{displayPackageName(entry.name)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-border/60 bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">No views recorded on this deployment yet. Open a package to see it here.</p>
              )}
            </div>
          )}
        </div>
      </section>

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

      {/* -------- why litespm: hosts, safety, faq in one accordion -------- */}
      <section className="border-t border-border/60 bg-card/25 py-14 sm:py-16" aria-labelledby="why-more-title">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Why LiteSPM</p>
          <h2 id="why-more-title" className="mt-2 text-center text-[clamp(1.6rem,3vw,2.1rem)] font-semibold tracking-[-0.03em]">
            More to know
          </h2>
          <div className="mt-8 space-y-3">
            <details className="group rounded-2xl border border-border/70 bg-card p-5 transition-all hover:border-brand/35">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-[14.5px] [&::-webkit-details-marker]:hidden">
                <span>{stats?.hosts ?? facts.hosts} hosts. One command.</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="faq-answer">
                <div className="pt-3">
                  <p className="text-[13px] leading-relaxed text-muted-foreground">Every agent host gets the same preview, backup and ledger entry. Pick yours to see the exact config file LiteSPM writes.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      { name: "Cursor", id: "cursor" },
                      { name: "GitHub Copilot", id: "github-copilot" },
                      { name: "Cline", id: "cline" },
                      { name: "Claude Code", id: "claude-code" },
                      { name: "OpenAI Codex", id: "codex" },
                      { name: "Gemini CLI", id: "gemini-cli" },
                    ].map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        aria-label={`Configure ${agent.name} with command host setup ${agent.id}`}
                        onClick={() => navigate(`#/agent/${agent.id}`)}
                        className="flex items-center justify-between rounded-xl border border-border/70 px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors hover:border-brand/40"
                      >
                        {agent.name}
                        <code className="font-mono text-[10.5px] text-brand/80">host setup {agent.id}</code>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label={`Browse all ${stats?.hosts ?? facts.hosts} supported agent hosts`}
                    onClick={() => navigate("#/agents")}
                    className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline"
                  >
                    Browse all {stats?.hosts ?? facts.hosts} agents <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </details>

            <details className="group rounded-2xl border border-border/70 bg-card p-5 transition-all hover:border-brand/35">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-[14.5px] [&::-webkit-details-marker]:hidden">
                <span>Your machine, your keys.</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="faq-answer">
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    { icon: ShieldCheck, title: "No account, no proxy", body: "Tokens stay in the OS vault or as environment references. Nothing is sent to this site." },
                    { icon: RotateCcw, title: "Byte-exact restore", body: "Instant Byte-Exact Rollback. Every installation creates an automated backup in ~/.litespm/backups/. Run litespm restore at any time to return your config to its exact original state." },
                    { icon: Bookmark, title: "Ledger ownership", body: "install remove strips only the nodes LiteSPM wrote. Your edits stay." },
                    { icon: BadgeCheck, title: "Stated provenance", body: "Installable means a verified endpoint, command or pinned source. Discovery-only says so." },
                  ].map((item) => (
                    <div key={item.title} className="rounded-xl border border-border/60 p-3.5">
                      <item.icon className="h-4 w-4 text-brand" />
                      <p className="mt-2 text-[13px] font-semibold">{item.title}</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </details>

            <details className="group rounded-2xl border border-border/70 bg-card p-5 transition-all hover:border-brand/35">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-[14.5px] [&::-webkit-details-marker]:hidden">
                <span>Common questions</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="faq-answer">
                <div className="mt-3 space-y-3">
                  {[
                    { q: "Do I need to sync the catalog myself?", a: `The first command that needs the catalog downloads it; later runs refresh it in the background at most every 6 hours. Set LITESPM_NO_AUTO_SYNC=1 (or run under CI) to turn that off. litespm catalog sync still works on demand. On npm v${facts.npmVersion}, background auto-sync is active.` },
                    { q: "Why do some listings say Discovery only?", a: "A server needs a remote endpoint or a publisher-declared command with arguments. If a listing has only a repository link, LiteSPM will not guess whether to run it with npx, python or uvx. The detail page links only to the source the catalog recorded." },
                    { q: "How do installs protect my config?", a: "LiteSPM splices JSON/JSONC and TOML by byte offset, so comments and key order survive. Every write is previewed and backed up. install remove strips only the nodes it wrote; edits you made are kept." },
                    { q: "Can I install from inside my agent?", a: `litespm setup registers the bridge and a marketplace command. Pi, OpenCode, Claude Code and Copilot CLI get a popup that costs no model turn; most others get a prompt command. Included in v${facts.npmVersion}.` },
                  ].map((item) => (
                    <div key={item.q} className="rounded-xl border border-border/60 px-3.5 py-3">
                      <p className="text-[13px] font-semibold">{item.q}</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{item.a}</p>
                    </div>
                  ))}
                  <button
                    type="button"
                    aria-label="View all documentation and troubleshooting guides"
                    onClick={() => navigate("#/docs/troubleshooting")}
                    className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline"
                  >
                    All docs and troubleshooting <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </details>
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
                className="h-10 flex-1 rounded-xl px-4"
                onClick={() => navigate("#/bundles")}
              >
                Browse bundles <ArrowRight className="h-4 w-4" />
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
