"use client";

import * as React from "react";
import { Check, Copy, Play, RotateCcw, Terminal } from "lucide-react";

export type ScenarioId = "mcp" | "skills" | "restore";

interface ScriptLine {
  kind: "cmd" | "out" | "ok" | "dim" | "header";
  text: string;
  delay?: number;
}

const SCENARIOS: Record<
  ScenarioId,
  {
    title: string;
    description: string;
    lines: ScriptLine[];
  }
> = {
  mcp: {
    title: "MCP Server",
    description: "Search, surgical config write with backup, and ledger confirmation",
    lines: [
      { kind: "cmd", text: "litespm search postgres", delay: 350 },
      { kind: "header", text: "  NAME          KIND   PUBLISHER    TRANSPORT        STATUS", delay: 280 },
      { kind: "out", text: "  neon          mcp    Neon         streamable-http  installable", delay: 180 },
      { kind: "out", text: "  supabase      mcp    supabase     stdio            installable", delay: 160 },
      { kind: "out", text: "  postgres-mcp  mcp    crunchydata  stdio            installable", delay: 160 },
      { kind: "dim", text: "  48,418 MCP servers · 20,320 skills · 638 plugins", delay: 240 },
      {
        kind: "cmd",
        text: "litespm install neon --agent claude-code",
        delay: 500,
      },
      { kind: "dim", text: "  plan    claude-code  ~/.claude.json  mcpServers[neon]", delay: 260 },
      { kind: "dim", text: "  backup  ~/.claude.json → ~/.claude.json.litespm-bak", delay: 240 },
      { kind: "ok", text: "  ✓ Registered MCP server neon (streamable-http)", delay: 320 },
      { kind: "out", text: "  • claude-code  added entry in ~/.claude.json", delay: 220 },
      { kind: "dim", text: "  Ledger: 1 capability recorded · pre-write digest verified", delay: 240 },
      { kind: "cmd", text: "litespm list", delay: 450 },
      { kind: "header", text: "  KIND   NAME   STATE    SCOPE   TARGET       ENDPOINT", delay: 260 },
      { kind: "ok", text: "  mcp    neon   managed  global  claude-code  https://mcp.neon.tech/sse", delay: 280 },
    ],
  },
  skills: {
    title: "Agent Skill",
    description: "Inspect SKILL.md frontmatter, trigger rules, and copy to target tree",
    lines: [
      { kind: "cmd", text: "litespm skills add anthropics/skills --skill claude-api -g", delay: 350 },
      { kind: "dim", text: "  Fetching repository metadata from github.com/anthropics/skills...", delay: 260 },
      { kind: "out", text: "  ✓ Discovered skill: claude-api (TRIGGER + SKIP rules verified)", delay: 300 },
      { kind: "dim", text: "  plan    copy SKILL.md → ~/.claude/skills/claude-api/", delay: 240 },
      { kind: "dim", text: "  backup  clean pre-state verified (new directory)", delay: 220 },
      { kind: "ok", text: "  ✓ Installed skill claude-api into Claude Code global skills tree", delay: 340 },
      { kind: "dim", text: "  Ledger: recorded in skills ledger · 0 external scripts", delay: 220 },
      { kind: "cmd", text: "litespm skills list", delay: 450 },
      { kind: "header", text: "  NAME        SOURCE             TARGET       STATE", delay: 260 },
      { kind: "ok", text: "  claude-api  anthropics/skills  claude-code  managed (global)", delay: 280 },
    ],
  },
  restore: {
    title: "Safe Rollback",
    description: "Byte-exact rollback to pre-install state with single undo command",
    lines: [
      { kind: "cmd", text: "litespm restore inst_user_mcp:neon:neon", delay: 350 },
      { kind: "dim", text: "  Reading ledger record for neon on claude-code...", delay: 260 },
      { kind: "dim", text: "  plan    revert ~/.claude.json to pre-install image", delay: 240 },
      { kind: "dim", text: "  verify  sha256 digest matches recorded pre-image (8f3a921c...)", delay: 260 },
      { kind: "ok", text: "  ✓ Restored ~/.claude.json byte-identical to pre-write backup", delay: 340 },
      { kind: "out", text: "  ✓ Stripped neon from claude-code deployment ledger", delay: 240 },
      { kind: "cmd", text: "litespm list", delay: 450 },
      { kind: "dim", text: "  0 active capabilities in ledger (clean machine state)", delay: 280 },
    ],
  },
};

const LINE_STYLES: Record<ScriptLine["kind"], string> = {
  cmd: "text-[oklch(0.95_0.01_163)] font-semibold",
  header: "text-muted-foreground/70 font-medium text-[11px] uppercase tracking-wider",
  out: "text-[oklch(0.82_0.02_163)]",
  ok: "text-emerald-400 font-medium",
  dim: "text-[oklch(0.60_0.02_163)]",
};

export function TerminalHero({
  className,
  hostsCount = 50,
}: {
  className?: string;
  hostsCount?: number;
}) {
  const [scenario, setScenario] = React.useState<ScenarioId>("mcp");
  const [visible, setVisible] = React.useState(0);
  const [typed, setTyped] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [runKey, setRunKey] = React.useState(0);
  const [isHovered, setIsHovered] = React.useState(false);
  const [userInteracted, setUserInteracted] = React.useState(false);

  const activeScenario = SCENARIOS[scenario];
  const lines = activeScenario.lines;

  // Auto-cycle through scenarios after completion (pauses when hovered or user-selected)
  React.useEffect(() => {
    if (visible < lines.length || isHovered || userInteracted) return;

    const timer = setTimeout(() => {
      setScenario((prev) => {
        if (prev === "mcp") return "skills";
        if (prev === "skills") return "restore";
        return "mcp";
      });
      setRunKey((k) => k + 1);
    }, 4500);

    return () => clearTimeout(timer);
  }, [visible, lines.length, isHovered, userInteracted]);

  // Restart typing animation when scenario changes or replay is clicked
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setVisible(0);
    setTyped("");

    const runLine = (index: number) => {
      if (cancelled || index >= lines.length) return;
      const line = lines[index];

      const start = () => {
        if (line.kind === "cmd") {
          let char = 0;
          const typeNext = () => {
            if (cancelled) return;
            char += 1;
            setTyped(line.text.slice(0, char));
            if (char < line.text.length) {
              timer = setTimeout(typeNext, 18 + Math.random() * 24);
            } else {
              timer = setTimeout(() => {
                if (cancelled) return;
                setVisible(index + 1);
                setTyped("");
                runLine(index + 1);
              }, 280);
            }
          };
          timer = setTimeout(typeNext, 80);
        } else {
          timer = setTimeout(() => {
            if (cancelled) return;
            setVisible(index + 1);
            runLine(index + 1);
          }, line.delay ?? 260);
        }
      };

      timer = setTimeout(start, line.delay ?? 200);
    };

    runLine(0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scenario, runKey, lines]);

  const currentCmdIndex = lines.findIndex((l, i) => l.kind === "cmd" && i === visible);

  const copySession = () => {
    const text = lines
      .map((l) => (l.kind === "cmd" ? `$ ${l.text}` : l.text))
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden rounded-2xl border border-border/80 bg-[#0d1312] shadow-[0_24px_70px_-24px_rgba(16,185,129,0.2)] ${
        className ?? ""
      }`}
      aria-label="LiteSPM interactive terminal session"
    >
      {/* Terminal Titlebar */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] bg-white/[0.03] px-4 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-3 w-3 rounded-full bg-rose-500/80 transition-opacity hover:opacity-100" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80 transition-opacity hover:opacity-100" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80 transition-opacity hover:opacity-100" />
          </span>
          <span className="ml-2 inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-white/50">
            <Terminal className="h-3 w-3 text-brand" /> litespm — terminal
          </span>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="flex items-center gap-1">
          {(["mcp", "skills", "restore"] as ScenarioId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setUserInteracted(true);
                setScenario(id);
                setRunKey((k) => k + 1);
              }}
              className={`rounded-lg px-2 py-0.5 font-mono text-[10.5px] transition-colors ${
                scenario === id
                  ? "bg-brand/20 font-semibold text-emerald-400 border border-brand/40"
                  : "text-white/40 hover:bg-white/[0.06] hover:text-white/80"
              }`}
            >
              {SCENARIOS[id].title}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRunKey((k) => k + 1)}
            title="Replay terminal animation"
            className="ml-1 rounded-md p-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={copySession}
            title="Copy entire session to clipboard"
            className="rounded-md p-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="min-h-[310px] p-4 font-mono text-[12px] leading-[1.8] sm:text-[12.5px]">
        {lines.slice(0, visible).map((line, i) => (
          <p key={i} className={LINE_STYLES[line.kind]}>
            {line.kind === "cmd" && <span className="mr-2 font-bold text-emerald-400">$</span>}
            {line.kind !== "cmd" && line.kind !== "header" && (
              <span className="mr-2 select-none text-white/20">│</span>
            )}
            {line.text}
          </p>
        ))}

        {currentCmdIndex !== -1 && (
          <p className={LINE_STYLES.cmd}>
            <span className="mr-2 font-bold text-emerald-400">$</span>
            {typed}
            <span className="cursor-blink ml-0.5 inline-block h-[13px] w-[7px] translate-y-[2px] bg-emerald-400" />
          </p>
        )}

        {visible >= lines.length && (
          <p className="text-[oklch(0.95_0.01_163)]">
            <span className="mr-2 font-bold text-emerald-400">$</span>
            <span className="cursor-blink ml-0.5 inline-block h-[13px] w-[7px] translate-y-[2px] bg-emerald-400" />
          </p>
        )}
      </div>

      {/* Footer Status Bar */}
      <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.02] px-4 py-2 font-mono text-[10.5px] text-white/40">
        <span>{activeScenario.description}</span>
        <span className="flex items-center gap-1.5 text-emerald-400/80">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {hostsCount} hosts ready
        </span>
      </div>
    </div>
  );
}
