"use client";

import * as React from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Flame,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  TrendingUp,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { NavLink } from "../nav-link";
import { shellArg } from "@/lib/litespm/shell";
import { displayPackageName } from "@/lib/litespm/format";
import TRENDING_DATA from "@/lib/litespm/trending-leaderboard.json";

function CopyInstallButton({ command }: { command: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <button
      type="button"
      title="Copy install command"
      aria-label={`Copy: ${command}`}
      onClick={() => {
        navigator.clipboard?.writeText(command).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
    >
      <Terminal className="h-3 w-3 text-brand" />
      <span className="truncate max-w-[200px] sm:max-w-[260px]">{command}</span>
      {copied ? (
        <Check className="h-3 w-3 text-brand shrink-0" />
      ) : (
        <Copy className="h-3 w-3 opacity-60 shrink-0" />
      )}
      <span className="sr-only">{copied ? "Copied" : ""}</span>
    </button>
  );
}

export function TrendingLeaderboard() {
  const [activeTab, setActiveTab] = React.useState<"skills" | "mcp">("skills");
  const [filterQuery, setFilterQuery] = React.useState("");

  const needle = filterQuery.trim().toLowerCase();

  const skills = (TRENDING_DATA.topSkills || []).filter((s) => {
    if (!needle) return true;
    return `${s.name} ${s.repo} ${s.summary}`.toLowerCase().includes(needle);
  });

  const mcpServers = (TRENDING_DATA.topMcp || []).filter((m) => {
    if (!needle) return true;
    return `${m.name} ${m.repo} ${m.category} ${m.summary}`.toLowerCase().includes(needle);
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-brand/35 bg-gradient-to-r from-brand-soft/80 via-card to-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand text-[12px] font-semibold uppercase tracking-wider">
              <Flame className="h-4 w-4" /> Community Leaderboard
            </div>
            <h2 className="mt-1 text-[clamp(1.4rem,2.5vw,1.9rem)] font-bold tracking-tight">
              Most Adopted Agent Skills & MCP Servers
            </h2>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              Rankings verified directly from <strong className="text-foreground">skills.sh weekly installs</strong> and{" "}
              <strong className="text-foreground">GitHub community stars</strong>. Install any capability across 52 AI agents with a single command.
            </p>
          </div>

          {/* Sub-Tabs: Skills vs MCP */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border/70 bg-card/90 p-1 text-[12px] font-semibold shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTab("skills")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors cursor-pointer",
                activeTab === "skills"
                  ? "bg-brand text-brand-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Zap className="h-3.5 w-3.5 fill-current" />
              <span>Skills (skills.sh)</span>
              <span className="rounded-full bg-brand-foreground/20 px-1.5 py-0.2 text-[10px]">
                {TRENDING_DATA.topSkills.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mcp")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors cursor-pointer",
                activeTab === "mcp"
                  ? "bg-brand text-brand-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Star className="h-3.5 w-3.5 fill-current" />
              <span>MCP Servers (GitHub Stars)</span>
              <span className="rounded-full bg-brand-foreground/20 px-1.5 py-0.2 text-[10px]">
                {TRENDING_DATA.topMcp.length}
              </span>
            </button>
          </div>
        </div>

        {/* Filter Input & Stated Provenance */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={`Filter ${activeTab === "skills" ? "skills" : "MCP servers"}…`}
              className="w-full rounded-lg border border-border/70 bg-background py-1.5 pl-9 pr-3 text-[12.5px] outline-none transition-colors focus:border-brand/50"
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex h-2 w-2 rounded-full bg-brand animate-pulse" />
            <span>
              Source: {activeTab === "skills" ? "skills.sh live registry telemetry" : "GitHub repository stars & official vendor authority"}
            </span>
          </div>
        </div>
      </div>

      {/* Leaderboard Table / Grid */}
      {activeTab === "skills" ? (
        <div className="space-y-3">
          {skills.map((skill) => {
            const isTop3 = skill.rank <= 3;
            const rankBadgeClass =
              skill.rank === 1
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold"
                : skill.rank === 2
                ? "bg-slate-300/20 text-slate-300 border border-slate-300/40 font-bold"
                : skill.rank === 3
                ? "bg-amber-700/20 text-amber-500 border border-amber-700/40 font-bold"
                : "bg-muted text-muted-foreground border border-border/60";

            return (
              <div
                key={skill.name}
                className={cn(
                  "group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border/70 bg-card p-4 transition-all hover:border-brand/40 hover:shadow-[0_2px_16px_-6px_rgba(16,185,129,0.2)]",
                  isTop3 && "border-brand/30 bg-card/90"
                )}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  {/* Rank Badge */}
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-[12px]",
                      rankBadgeClass
                    )}
                  >
                    #{skill.rank}
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <NavLink
                        to={`/package/${encodeURIComponent(skill.linkKey)}`}
                        className="truncate text-[15px] font-semibold tracking-tight text-foreground hover:text-brand transition-colors"
                      >
                        {displayPackageName(skill.name)}
                      </NavLink>
                      <span className="rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground truncate max-w-[180px]">
                        {skill.repo}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-400">
                        <ShieldCheck className="h-3 w-3 text-emerald-400" />
                        skills.sh
                      </span>
                    </div>

                    <p className="mt-1 line-clamp-1 text-[12.5px] text-muted-foreground">
                      {skill.summary}
                    </p>
                  </div>
                </div>

                {/* Right Side: Telemetry & Actions */}
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 font-mono text-[13px] font-bold text-foreground">
                      <Flame className="h-3.5 w-3.5 text-amber-500 fill-current" />
                      {skill.weeklyInstalls.toLocaleString()}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">installs / week</span>
                  </div>

                  <CopyInstallButton command={skill.installCommand} />

                  <NavLink
                    to={`/package/${encodeURIComponent(skill.linkKey)}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-brand/40 hover:text-brand transition-colors"
                  >
                    Details <ArrowUpRight className="h-3 w-3" />
                  </NavLink>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {mcpServers.map((mcp) => {
            const isTop3 = mcp.rank <= 3;
            const rankBadgeClass =
              mcp.rank === 1
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold"
                : mcp.rank === 2
                ? "bg-slate-300/20 text-slate-300 border border-slate-300/40 font-bold"
                : mcp.rank === 3
                ? "bg-amber-700/20 text-amber-500 border border-amber-700/40 font-bold"
                : "bg-muted text-muted-foreground border border-border/60";

            return (
              <div
                key={mcp.slug}
                className={cn(
                  "group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border/70 bg-card p-4 transition-all hover:border-brand/40 hover:shadow-[0_2px_16px_-6px_rgba(16,185,129,0.2)]",
                  isTop3 && "border-brand/30 bg-card/90"
                )}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  {/* Rank Badge */}
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-[12px]",
                      rankBadgeClass
                    )}
                  >
                    #{mcp.rank}
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <NavLink
                        to={`/package/${encodeURIComponent(mcp.linkKey)}`}
                        className="truncate text-[15px] font-semibold tracking-tight text-foreground hover:text-brand transition-colors"
                      >
                        {mcp.name}
                      </NavLink>
                      <span className="rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground truncate max-w-[180px]">
                        {mcp.repo}
                      </span>
                      <span className="rounded-md bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground font-medium">
                        {mcp.category}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-foreground/75">
                        {mcp.transport}
                      </span>
                    </div>

                    <p className="mt-1 line-clamp-1 text-[12.5px] text-muted-foreground">
                      {mcp.summary}
                    </p>
                  </div>
                </div>

                {/* Right Side: Stars & Actions */}
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 font-mono text-[13px] font-bold text-foreground">
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-current" />
                      {mcp.stars.toLocaleString()}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">GitHub stars</span>
                  </div>

                  <CopyInstallButton command={mcp.installCommand} />

                  <NavLink
                    to={`/package/${encodeURIComponent(mcp.linkKey)}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-brand/40 hover:text-brand transition-colors"
                  >
                    Details <ArrowUpRight className="h-3 w-3" />
                  </NavLink>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
