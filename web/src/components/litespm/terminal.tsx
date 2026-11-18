"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check, Copy, RotateCcw, Terminal } from "lucide-react";

export type ScenarioId = "litespm" | "skills" | "mcp" | "restore";

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
  // Lines are rendered with white-space: pre so the columns line up; keep
  // each one within ~58 characters so nothing is clipped in the hero.
  litespm: {
    title: "litespm",
    description: "Auto-detect agents, sync 69K+ catalog & launch Manager",
    lines: [
      { kind: "cmd", text: "litespm", delay: 350 },
      { kind: "header", text: "◆ LiteSPM  ·  cross-agent auto-sync", delay: 200 },
      { kind: "dim", text: "───────────────────────────────────────────────────────", delay: 120 },
      { kind: "ok", text: "✓  catalog synced (69,376 capabilities indexed)", delay: 240 },
      { kind: "ok", text: "✓  agents: 11 detected · 0 newly wired · 11 connected", delay: 220 },
      { kind: "ok", text: "✓  skills: active skills reconciled across 11 agents", delay: 220 },
      { kind: "dim", text: "───────────────────────────────────────────────────────", delay: 120 },
      { kind: "header", text: "◆ LiteSPM Manager", delay: 200 },
      { kind: "dim", text: "│ Search: type to filter", delay: 160 },
      { kind: "out", text: "│  ▾ Sync", delay: 140 },
      { kind: "ok", text: "│❯ ○ Sync & cross-update everything (11 agents)", delay: 240 },
      { kind: "out", text: "│  ▾ Catalog", delay: 140 },
      { kind: "out", text: "│  ○ Find and install capability (search local index)", delay: 140 },
      { kind: "out", text: "│  ○ View installed capabilities", delay: 140 },
    ],
  },
  skills: {
    title: "skills add",
    description: "Discover SKILL.md and copy into agent skill trees",
    lines: [
      { kind: "cmd", text: "litespm skills add anthropics/skills --skill pdf", delay: 350 },
      { kind: "header", text: "◆ LiteSPM  ·  skills installer", delay: 200 },
      { kind: "ok", text: "◇  Source  https://github.com/anthropics/skills.git", delay: 220 },
      { kind: "ok", text: "◇  Found 20 skills  (1 selected: pdf)", delay: 200 },
      { kind: "ok", text: "◇  Scope   Global (user-wide)", delay: 180 },
      { kind: "dim", text: "╭─────────────────────────────────────────────────────╮", delay: 120 },
      { kind: "header", text: "│ Installation Summary                                │", delay: 140 },
      { kind: "ok", text: "│   ✓ pdf                                             │", delay: 160 },
      { kind: "dim", text: "│     → ~/.claude/skills/pdf                          │", delay: 160 },
      { kind: "dim", text: "╰─────────────────────────────────────────────────────╯", delay: 120 },
      { kind: "ok", text: "◇  Installed 1 skill into 1 destination", delay: 240 },
      { kind: "dim", text: "Done. Review skills before use; full agent permissions.", delay: 200 },
      { kind: "cmd", text: "litespm skills list", delay: 400 },
      { kind: "header", text: "  SKILL  HOST         SCOPE   ORIGIN     DIRECTORY", delay: 200 },
      { kind: "ok", text: "  pdf    claude-code  global  installed  ~/.claude/...", delay: 220 },
    ],
  },
  mcp: {
    title: "install",
    description: "Register remote or local MCP server into host configs",
    lines: [
      { kind: "cmd", text: "litespm install context7 --agent claude-code", delay: 350 },
      { kind: "dim", text: "Resolving mcp:builtin:mcp-registry:io.github.upstash...", delay: 220 },
      { kind: "ok", text: "✓ Registered MCP server context7", delay: 260 },
      { kind: "dim", text: "  Listing ID:  inst_user_mcp_context7_4_2_0", delay: 180 },
      { kind: "out", text: "  Endpoint:    https://mcp.context7.com/mcp (remote)", delay: 200 },
      { kind: "ok", text: "  • claude-code  created entry in ~/.claude.json", delay: 240 },
      { kind: "cmd", text: "litespm list", delay: 420 },
      { kind: "header", text: "LiteSPM setup overview (1 managed · 11 connected)", delay: 220 },
      { kind: "header", text: "  KIND    NAME      STATE    SCOPE  AGENT", delay: 180 },
      { kind: "ok", text: "  mcp     context7  managed  user   claude-code", delay: 220 },
    ],
  },
  restore: {
    title: "restore",
    description: "Byte-exact rollback using cryptographic pre-image hashes",
    lines: [
      { kind: "cmd", text: "litespm restore inst_user_mcp_context7_4_2_0", delay: 350 },
      { kind: "dim", text: "Verifying pre-image SHA-256...", delay: 200 },
      { kind: "ok", text: "✓ Restored inst_user_mcp_context7_4_2_0", delay: 260 },
      { kind: "dim", text: "  - ~/.claude.json restored byte for byte", delay: 200 },
      { kind: "dim", text: "  - backups preserved in ~/.litespm/backups/", delay: 180 },
      { kind: "cmd", text: "litespm list", delay: 400 },
      { kind: "header", text: "LiteSPM setup overview", delay: 180 },
      { kind: "dim", text: "0 unique capabilities · 0 deployments", delay: 220 },
    ],
  },
};

const LINE_STYLES: Record<ScriptLine["kind"], string> = {
  cmd: "text-[oklch(0.95_0.01_163)] font-semibold",
  // Same size and letter-spacing as the rows, with >=4.5:1 WCAG AA contrast.
  header: "text-white/75 font-medium",
  out: "text-[oklch(0.82_0.02_163)]",
  ok: "text-emerald-400 font-medium",
  dim: "text-[oklch(0.60_0.02_163)]",
};

export function TerminalHero({
  className,
  hostsCount = 52,
  framed = false,
}: {
  className?: string;
  hostsCount?: number;
  /** Drawn inside a .glow-frame, which supplies the border. */
  framed?: boolean;
}) {
  const [scenario, setScenario] = React.useState<ScenarioId>("litespm");
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
        if (prev === "litespm") return "skills";
        if (prev === "skills") return "mcp";
        if (prev === "mcp") return "restore";
        return "litespm";
      });
      setRunKey((k) => k + 1);
    }, 4500);

    return () => clearTimeout(timer);
  }, [visible, lines.length, isHovered, userInteracted]);

  // Restart typing animation when scenario changes or replay is clicked
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // No typing animation: show the whole session at once.
      setVisible(lines.length);
      setTyped("");
      return;
    }
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
      className={`relative overflow-hidden bg-[#0d1312] ${framed ? "rounded-[calc(1.1rem-1px)]" : "rounded-2xl border border-border/80 shadow-[0_24px_70px_-24px_rgba(16,185,129,0.2)]"} ${
        className ?? ""
      }`}
      aria-label="LiteSPM interactive terminal session"
    >
      {/* Terminal Titlebar */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] bg-white/[0.03] px-3 py-2.5 backdrop-blur-sm sm:px-4">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-3 w-3 rounded-full bg-rose-500/80 transition-opacity hover:opacity-100" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80 transition-opacity hover:opacity-100" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80 transition-opacity hover:opacity-100" />
          </span>
          <span className="ml-2 hidden items-center gap-1.5 font-mono text-[11px] font-medium text-white/52 sm:inline-flex">
            <Terminal className="h-3 w-3 text-brand" /> litespm — terminal
          </span>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="flex items-center gap-1">
          {(["litespm", "skills", "mcp", "restore"] as ScenarioId[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={scenario === id}
              onClick={() => {
                setUserInteracted(true);
                setScenario(id);
                setRunKey((k) => k + 1);
              }}
              className={`relative whitespace-nowrap rounded-lg px-1.5 py-0.5 font-mono text-[10px] transition-colors sm:px-2 sm:text-[10.5px] ${
                scenario === id ? "font-semibold text-emerald-300" : "text-white/40 hover:text-white/80"
              }`}
            >
              {scenario === id && (
                <motion.span
                  layoutId="terminal-tab-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-lg border border-brand/40 bg-brand/20"
                  aria-hidden="true"
                />
              )}
              <span className="relative">{SCENARIOS[id].title}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRunKey((k) => k + 1)}
            title="Replay terminal animation"
            className="ml-1 hidden rounded-md p-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80 sm:inline-flex"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={copySession}
            title="Copy entire session to clipboard"
            className="hidden rounded-md p-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80 sm:inline-flex"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Terminal Viewport: fixed height, newest line at the bottom like a real
          terminal, so the hero never shifts while the session plays. */}
      <div className="flex h-[236px] flex-col justify-end overflow-hidden px-3 py-3 font-mono text-[10.5px] leading-[1.7] sm:h-[318px] sm:px-4 sm:text-[12px] sm:leading-[1.75]">
        {lines.slice(0, visible).map((line, i) => (
          <p key={`${runKey}-${scenario}-${i}`} className={`term-line whitespace-pre ${LINE_STYLES[line.kind]}`}>
            {line.kind === "cmd" && <span className="mr-2 font-bold text-emerald-400">$</span>}
            {line.text}
          </p>
        ))}

        {currentCmdIndex !== -1 && (
          <p className={`whitespace-pre ${LINE_STYLES.cmd}`}>
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

      {/* Progress through the current scenario. */}
      <div className="h-px w-full bg-white/[0.06]" aria-hidden="true">
        <div
          className="h-px bg-gradient-to-r from-emerald-500/0 via-emerald-400 to-emerald-300 transition-[width] duration-300 ease-out"
          style={{ width: `${Math.round((Math.min(visible, lines.length) / lines.length) * 100)}%` }}
        />
      </div>

      {/* Footer Status Bar */}
      <div className="flex items-center justify-between gap-3 bg-white/[0.02] px-4 py-2 font-mono text-[10.5px] text-white/45">
        <span className="truncate">{activeScenario.description}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-emerald-400/80">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {hostsCount} hosts ready
        </span>
      </div>
    </div>
  );
}
