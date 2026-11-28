"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, RotateCcw, Terminal } from "lucide-react";

export type ScenarioId = "litespm" | "skills" | "mcp" | "restore";

interface ScriptLine {
  kind: "cmd" | "pill" | "out" | "ok" | "dim" | "header" | "tree";
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
  // Real LiteSPM terminal sessions formatted with clean tree connectors & diamonds
  // Keep line widths within ~56 characters so they fit crisply without wrapping.
  litespm: {
    title: "litespm",
    description: "Auto-detect agents, sync 68.9k+ catalog & launch Manager",
    lines: [
      { kind: "cmd", text: "litespm", delay: 350 },
      { kind: "pill", text: "[litespm] v0.6.0 · the package manager for AI agents", delay: 180 },
      { kind: "ok", text: "◇ Auto-sync: verified catalog sequence 154 (production)", delay: 240 },
      { kind: "ok", text: "◇ Indexed 68,933 unique listings across skills, MCP & plugins", delay: 220 },
      { kind: "tree", text: "│", delay: 80 },
      { kind: "header", text: "◆ Connected Agent Hosts (11 detected)", delay: 200 },
      { kind: "dim", text: "│ ── Universal Bridge (.agents/skills) ── active ──", delay: 160 },
      { kind: "out", text: "│ • Claude Code (~/.claude.json)", delay: 140 },
      { kind: "out", text: "│ • Cursor, OpenCode, Pi Agent, Grok Build +7 more", delay: 140 },
      { kind: "tree", text: "│", delay: 80 },
      { kind: "dim", text: "╭─ LiteSPM Manager ───────────────────────────────────╮", delay: 140 },
      { kind: "out", text: "│  [1] Update capability catalog                      │", delay: 120 },
      { kind: "ok", text: "│  > [2] Find and install capability (68.9k+ catalog) │", delay: 220 },
      { kind: "out", text: "│  [3] Remove something LiteSPM installed             │", delay: 120 },
      { kind: "out", text: "│  [4] See what is installed (inventory & status)    │", delay: 120 },
      { kind: "out", text: "│  [5] Set up or repair an agent connection          │", delay: 120 },
      { kind: "dim", text: "╰─────────────────────────────────────────────────────╯", delay: 130 },
      { kind: "ok", text: "✓ Stdio bridge ready · 52 hosts supported", delay: 260 },
    ],
  },
  skills: {
    title: "skills add",
    description: "Discover SKILL.md and copy into agent skill trees",
    lines: [
      { kind: "cmd", text: "litespm skills add flowkit-labs/skills --skill reddit-automation", delay: 350 },
      { kind: "pill", text: "[skills] v0.6.0 · portable agent skills installer", delay: 180 },
      { kind: "ok", text: "◇ Source: https://github.com/flowkit-labs/skills.git", delay: 240 },
      { kind: "ok", text: "◇ Repository cloned (3 skills found)", delay: 200 },
      { kind: "out", text: "• Selected skill: reddit-automation", delay: 180 },
      { kind: "tree", text: "│", delay: 80 },
      { kind: "header", text: "◆ Which agents do you want to install to?", delay: 220 },
      { kind: "dim", text: "│ ── Universal (.agents/skills) ── always included ──", delay: 150 },
      { kind: "out", text: "│ • Amp, Cline, Codex, Cursor, Droid, Gemini +8 more", delay: 150 },
      { kind: "header", text: "◆ Installation scope: Global (~/.agents/skills)", delay: 180 },
      { kind: "tree", text: "│", delay: 80 },
      { kind: "dim", text: "╭─ Installation Summary ──────────────────────────────╮", delay: 140 },
      { kind: "out", text: "│  ~/.agents/skills/reddit-automation                 │", delay: 160 },
      { kind: "dim", text: "│  universal: 14 agents configured                    │", delay: 150 },
      { kind: "dim", text: "╰─────────────────────────────────────────────────────╯", delay: 130 },
      { kind: "tree", text: "│", delay: 80 },
      { kind: "header", text: "◆ Proceed with installation?", delay: 180 },
      { kind: "ok", text: "│ ● Yes  /  ○ No", delay: 240 },
      { kind: "tree", text: "│", delay: 80 },
      { kind: "ok", text: "✓ Installed reddit-automation (copied)", delay: 240 },
      { kind: "dim", text: "  → ~/.agents/skills/reddit-automation", delay: 180 },
      { kind: "dim", text: "Done! Review skills before use; full agent permissions.", delay: 220 },
    ],
  },
  mcp: {
    title: "install",
    description: "Register remote or local MCP server into host configs",
    lines: [
      { kind: "cmd", text: "litespm install context7 --agent claude-code", delay: 350 },
      { kind: "pill", text: "[install] v0.6.0 · MCP server manager", delay: 180 },
      { kind: "ok", text: "◇ Resolving context7 via registry index (Seq 154)...", delay: 240 },
      { kind: "ok", text: "◇ Found: io.github.upstash/context7", delay: 200 },
      { kind: "out", text: "• Transport: Streamable HTTP (remote)", delay: 180 },
      { kind: "tree", text: "│", delay: 80 },
      { kind: "header", text: "◆ Target Host: claude-code", delay: 200 },
      { kind: "dim", text: "│ Config: ~/.claude.json · scope: user", delay: 160 },
      { kind: "tree", text: "│", delay: 80 },
      { kind: "dim", text: "╭─ Installation Plan ─────────────────────────────────╮", delay: 140 },
      { kind: "out", text: "│  Endpoint: https://mcp.context7.com/mcp             │", delay: 160 },
      { kind: "dim", text: "│  Pre-image SHA-256: 7f83b1657ff1fc53b92dc...        │", delay: 150 },
      { kind: "dim", text: "╰─────────────────────────────────────────────────────╯", delay: 130 },
      { kind: "tree", text: "│", delay: 80 },
      { kind: "ok", text: "✓ Backup saved: ~/.litespm/backups/claude.json.bak", delay: 220 },
      { kind: "ok", text: "✓ Injected surgical merge into ~/.claude.json", delay: 240 },
      { kind: "ok", text: "✓ Registered MCP server context7 (state: managed)", delay: 260 },
    ],
  },
  restore: {
    title: "restore",
    description: "Byte-exact rollback via pre-image hashes",
    lines: [
      { kind: "cmd", text: "litespm restore inst_user_mcp_context7_4_2_0", delay: 350 },
      { kind: "pill", text: "[restore] v0.6.0 · byte-exact rollback system", delay: 180 },
      { kind: "ok", text: "◇ Locating installation record...", delay: 220 },
      { kind: "out", text: "• Target: ~/.claude.json (claude-code)", delay: 180 },
      { kind: "tree", text: "│", delay: 80 },
      { kind: "header", text: "◆ Cryptographic Verification", delay: 200 },
      { kind: "dim", text: "│ Expected SHA-256: 7f83b1657ff1fc53b92dc...        ", delay: 160 },
      { kind: "dim", text: "│ Computed SHA-256: 7f83b1657ff1fc53b92dc...        ", delay: 160 },
      { kind: "tree", text: "│", delay: 80 },
      { kind: "ok", text: "✓ Pre-image hash verified (100% byte match)", delay: 240 },
      { kind: "ok", text: "✓ Restored ~/.claude.json byte for byte", delay: 260 },
      { kind: "ok", text: "✓ Ledger entry removed cleanly", delay: 220 },
      { kind: "dim", text: "0 unmanaged modifications · host configuration clean.", delay: 240 },
    ],
  },
};

/**
 * Renders tokens inside a terminal line with high-fidelity color accents
 * inspired by clean modern CLI interfaces (diamonds, tree lines, boxes, radios).
 */
function FormattedLine({ line }: { line: ScriptLine }) {
  const text = line.text;

  // Render badge pill lines e.g. [skills] v0.6.1
  if (line.kind === "pill" && text.startsWith("[")) {
    const endBracket = text.indexOf("]");
    if (endBracket !== -1) {
      const badge = text.slice(1, endBracket);
      const rest = text.slice(endBracket + 1);
      return (
        <span className="flex items-center gap-1.5 py-0.5">
          <span className="inline-flex items-center rounded border border-teal-400/35 bg-teal-500/15 px-1.5 py-0.2 font-mono text-[10px] font-semibold tracking-wider text-teal-300 shadow-[0_0_12px_rgba(20,184,166,0.18)]">
            {badge}
          </span>
          <span className="text-[oklch(0.85_0.02_163)] font-medium text-[11px] sm:text-[11.5px]">{rest}</span>
        </span>
      );
    }
  }

  // Pure tree connector line: subtle gray
  if (line.kind === "tree") {
    return <span className="select-none font-mono text-white/20">{text}</span>;
  }

  // Token-by-token visual enhancement for standard lines
  const renderTokens = () => {
    // Check if line starts with diamond or check or box
    let prefix: React.ReactNode = null;
    let body = text;

    if (body.startsWith("◇ ")) {
      prefix = <span className="mr-1.5 font-bold text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.4)]">◇</span>;
      body = body.slice(2);
    } else if (body.startsWith("◆ ")) {
      prefix = <span className="mr-1.5 font-bold text-cyan-300 drop-shadow-[0_0_8px_rgba(103,232,249,0.5)]">◆</span>;
      body = body.slice(2);
    } else if (body.startsWith("✓ ")) {
      prefix = <span className="mr-1.5 font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">✓</span>;
      body = body.slice(2);
    } else if (body.startsWith("• ")) {
      prefix = <span className="mr-1.5 font-bold text-teal-400/80">•</span>;
      body = body.slice(2);
    }

    // Detect tree prefix like "│ • " or "│ ● " (avoid box borders ending with │)
    let treePrefix: React.ReactNode = null;
    if (body.startsWith("│ ") && !body.endsWith("│")) {
      treePrefix = <span className="select-none font-mono text-white/22 mr-2">│</span>;
      body = body.slice(2);
    }

    // Colorize specific elements like radios, arrows, and boxes
    let contentNode: React.ReactNode = body;
    if (body.startsWith("│") && body.endsWith("│") && body.includes("> [2]")) {
      const parts = body.split(/(> \[2\][^│]+)/g);
      contentNode = (
        <span>
          <span className="text-white/75 font-light">{parts[0]}</span>
          <span className="font-semibold text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">{parts[1]}</span>
          <span className="text-white/75 font-light">{parts[2]}</span>
        </span>
      );
    } else if (body.includes("● Yes")) {
      contentNode = (
        <span>
          <span className="font-semibold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">● Yes</span>
          <span className="text-white/35">  /  ○ No</span>
        </span>
      );
    } else if (body.startsWith("→ ")) {
      contentNode = (
        <span>
          <span className="font-semibold text-teal-300/80">→ </span>
          <span className="text-teal-200/90 underline decoration-teal-500/30 underline-offset-2">{body.slice(2)}</span>
        </span>
      );
    } else if (body.startsWith("https://") || body.includes("https://")) {
      const parts = body.split(/(https:\/\/[^\s]+)/g);
      contentNode = parts.map((part, i) =>
        part.startsWith("https://") ? (
          <span key={i} className="text-cyan-300 underline decoration-cyan-500/40 underline-offset-2">
            {part}
          </span>
        ) : (
          part
        )
      );
    }

    // Line class based on kind
    let lineClass = "text-[oklch(0.84_0.02_163)]";
    if (line.kind === "header") lineClass = "font-medium text-white/90";
    if (line.kind === "ok") lineClass = "font-medium text-emerald-300/95";
    if (line.kind === "dim") lineClass = "text-[oklch(0.72_0.02_163)]";

    // Box border styling
    if (text.startsWith("╭") || text.startsWith("╰") || (text.startsWith("│") && text.endsWith("│"))) {
      lineClass = "text-white/75 font-light";
    }

    return (
      <span className={lineClass}>
        {treePrefix}
        {prefix}
        {contentNode}
      </span>
    );
  };

  return <>{renderTokens()}</>;
}

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
  const activeScenario = SCENARIOS[scenario];
  const lines = activeScenario.lines;

  // Static-first: show the full scenario immediately on first paint so there
  // is no competing typing animation or blinking cursor. Clicking Replay
  // streams the active scenario line-by-line (unless reduced-motion is set).
  const [streaming, setStreaming] = React.useState(false);
  const [visible, setVisible] = React.useState(lines.length);
  const [typed, setTyped] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [runKey, setRunKey] = React.useState(0);

  const viewportRef = React.useRef<HTMLDivElement>(null);

  // Smooth autoscroll only while actively streaming a replay
  React.useEffect(() => {
    if (streaming && viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [streaming, visible, typed]);

  // Run typing animation only when Replay is explicitly triggered
  React.useEffect(() => {
    if (!streaming) {
      setVisible(lines.length);
      setTyped("");
      if (viewportRef.current) {
        viewportRef.current.scrollTo({ top: 0 });
      }
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (viewportRef.current) {
      viewportRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (reduced) {
      setVisible(lines.length);
      setTyped("");
      setStreaming(false);
      return;
    }

    setVisible(0);
    setTyped("");

    const runLine = (index: number) => {
      if (cancelled || index >= lines.length) {
        if (!cancelled) setStreaming(false);
        return;
      }
      const line = lines[index];

      const start = () => {
        if (line.kind === "cmd") {
          let char = 0;
          const typeNext = () => {
            if (cancelled) return;
            char += 1;
            setTyped(line.text.slice(0, char));
            if (char < line.text.length) {
              timer = setTimeout(typeNext, 20 + Math.random() * 22);
            } else {
              timer = setTimeout(() => {
                if (cancelled) return;
                setVisible(index + 1);
                setTyped("");
                runLine(index + 1);
              }, 220);
            }
          };
          timer = setTimeout(typeNext, 50);
        } else {
          timer = setTimeout(() => {
            if (cancelled) return;
            setVisible(index + 1);
            runLine(index + 1);
          }, line.delay ?? 160);
        }
      };

      timer = setTimeout(start, line.delay ?? 130);
    };

    runLine(0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [streaming, scenario, runKey, lines]);

  const currentCmdIndex = streaming ? lines.findIndex((l, i) => l.kind === "cmd" && i === visible) : -1;

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
      className={`relative overflow-hidden bg-[#0a0f0e]/95 ${
        framed
          ? "rounded-[calc(1.1rem-1px)]"
          : "rounded-2xl border border-border/80 shadow-[0_24px_70px_-18px_color-mix(in_oklch,var(--brand)_28%,transparent)]"
      } ${className ?? ""}`}
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
          <span className="ml-2 hidden whitespace-nowrap items-center gap-1.5 font-mono text-[11px] font-medium text-white/50 xl:inline-flex">
            <Terminal className="h-3 w-3 shrink-0 text-brand" /> litespm
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
                setStreaming(false);
                setScenario(id);
                setRunKey((k) => k + 1);
              }}
              className={`relative whitespace-nowrap rounded-lg px-1.5 py-0.5 font-mono text-[10px] transition-colors sm:px-2 sm:text-[10.5px] ${
                scenario === id ? "font-semibold text-emerald-300" : "text-white/75 hover:text-white/80"
              }`}
            >
              {scenario === id && (
                <motion.span
                  layoutId="terminal-tab-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-lg border border-brand/40 bg-brand/20 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                  aria-hidden="true"
                />
              )}
              <span className="relative">{SCENARIOS[id].title}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setStreaming(true);
              setRunKey((k) => k + 1);
            }}
            aria-label="Replay terminal animation"
            title="Replay terminal animation"
            className="ml-1 hidden rounded-md p-1 text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white/90 sm:inline-flex"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={copySession}
            title="Copy entire session to clipboard"
            className="hidden rounded-md p-1 text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white/80 sm:inline-flex"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Terminal Viewport:
          Starts from the top (justify-start) and slowly fills downwards.
          Smoothly auto-scrolls down once content fills the height. */}
      <div
        ref={viewportRef}
        tabIndex={0}
        role="region"
        aria-label="Terminal output"
        className="no-scrollbar flex h-[270px] flex-col justify-start overflow-y-auto px-3.5 py-3 font-mono text-[10.5px] leading-[1.72] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand sm:h-[338px] sm:px-4 sm:text-[11.5px] sm:leading-[1.78]"
      >
        <div className="flex flex-col gap-0.5">
          {lines.slice(0, visible).map((line, i) => (
            <motion.div
              key={`${runKey}-${scenario}-${i}`}
              initial={{ opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              className="whitespace-pre"
            >
              {line.kind === "cmd" ? (
                <div className="font-semibold text-white/95">
                  <span className="mr-2 font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]">
                    $
                  </span>
                  <span>{line.text}</span>
                </div>
              ) : (
                <FormattedLine line={line} />
              )}
            </motion.div>
          ))}

          {/* Active typing command line */}
          {currentCmdIndex !== -1 && (
            <div className="whitespace-pre font-semibold text-white/95">
              <span className="mr-2 font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]">
                $
              </span>
              <span>{typed}</span>
              <span className="cursor-blink ml-0.5 inline-block h-[13px] w-[7px] translate-y-[2px] bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </div>
          )}

          {/* Idle prompt waiting cursor once streaming finishes (hidden in static-first mode) */}
          {streaming && visible >= lines.length && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="mt-1 whitespace-pre text-white/90"
            >
              <span className="mr-2 font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]">
                $
              </span>
              <span className="cursor-blink ml-0.5 inline-block h-[13px] w-[7px] translate-y-[2px] bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </motion.div>
          )}
        </div>
      </div>

      {/* Progress bar across current scenario */}
      <div className="h-px w-full bg-white/[0.06]" aria-hidden="true">
        <div
          className="h-px bg-gradient-to-r from-emerald-500/0 via-emerald-400 to-teal-300 transition-[width] duration-300 ease-out shadow-[0_0_8px_rgba(52,211,153,0.5)]"
          style={{ width: `${Math.round((Math.min(visible, lines.length) / lines.length) * 100)}%` }}
        />
      </div>

      {/* Footer Status Bar */}
      <div className="flex items-center justify-between gap-3 bg-white/[0.02] px-4 py-2 font-mono text-[10.5px] text-white/55">
        <span className="truncate">{activeScenario.description}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-emerald-400/90 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          {hostsCount} hosts supported
        </span>
      </div>
    </div>
  );
}
