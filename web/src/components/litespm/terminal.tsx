"use client";

import * as React from "react";

/**
 * The hero terminal: a scripted typing session that shows the real LiteSPM
 * workflow — search, install, list. Lines type in sequence, then hold.
 */
interface ScriptLine {
  kind: "cmd" | "out" | "ok" | "dim";
  text: string;
  delay?: number;
}

const SCRIPT: ScriptLine[] = [
  { kind: "cmd", text: "litespm search postgres", delay: 500 },
  { kind: "out", text: "neon                Neon Postgres MCP server      remote", delay: 420 },
  { kind: "out", text: "supabase            Supabase MCP server          remote", delay: 300 },
  { kind: "out", text: "postgres-mcp        Crunchy Data Postgres MCP    remote", delay: 300 },
  { kind: "out", text: "48,418 MCP servers · 20,320 skills · 638 plugins", delay: 260 },
  { kind: "cmd", text: "litespm install mcp:builtin:mcp-registry:com.neon-mcp --agent claude-code", delay: 700 },
  { kind: "dim", text: "plan    claude-code  ~/.claude.json  mcpServers[neon]", delay: 340 },
  { kind: "dim", text: "backup  ~/.claude.json → ~/.claude.json.litespm-bak", delay: 300 },
  { kind: "ok", text: "installed  neon  →  claude-code  (ledger: 1 entry)", delay: 380 },
  { kind: "cmd", text: "litespm list", delay: 520 },
  { kind: "ok", text: "claude-code  1 server  neon (remote)", delay: 300 },
  { kind: "cmd", text: "litespm", delay: 600 },
  { kind: "dim", text: "◆ LiteSPM 0.6.0 — 50 agent hosts connected", delay: 0 },
];

const LINE_STYLES: Record<ScriptLine["kind"], string> = {
  cmd: "text-[oklch(0.93_0.01_163)]",
  out: "text-[oklch(0.75_0.02_163)]",
  ok: "text-brand",
  dim: "text-[oklch(0.62_0.015_163)]",
};

export function TerminalHero({ className }: { className?: string }) {
  const [visible, setVisible] = React.useState(0);
  const [typed, setTyped] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const runLine = (index: number) => {
      if (cancelled || index >= SCRIPT.length) return;
      const line = SCRIPT[index];
      const start = () => {
        if (line.kind === "cmd") {
          // Type command characters one by one.
          let char = 0;
          const typeNext = () => {
            if (cancelled) return;
            char += 1;
            setTyped(line.text.slice(0, char));
            if (char < line.text.length) {
              timer = setTimeout(typeNext, 14 + Math.random() * 26);
            } else {
              timer = setTimeout(() => {
                if (cancelled) return;
                setVisible(index + 1);
                setTyped("");
                runLine(index + 1);
              }, 260);
            }
          };
          timer = setTimeout(typeNext, 80);
        } else {
          timer = setTimeout(() => {
            if (cancelled) return;
            setVisible(index + 1);
            runLine(index + 1);
          }, line.delay ?? 300);
        }
      };
      timer = setTimeout(start, line.delay ?? 200);
    };

    runLine(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const currentCmdIndex = SCRIPT.findIndex((l, i) => l.kind === "cmd" && i === visible);

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border/70 bg-[oklch(0.16_0.01_163)] shadow-[0_24px_64px_-32px_rgba(0,0,0,0.6)] ${className ?? ""}`}
      aria-label="LiteSPM session example"
      role="img"
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/50">
          litespm — session
        </span>
        <span className="font-mono text-[10.5px] text-white/40" aria-hidden="true">
          zsh
        </span>
      </div>
      <div className="min-h-[286px] p-4 font-mono text-[12px] leading-[1.75] sm:text-[12.5px]">
        {SCRIPT.slice(0, visible).map((line, i) => (
          <p key={i} className={LINE_STYLES[line.kind]}>
            {line.kind === "cmd" && <span className="mr-2 text-brand">$</span>}
            {line.kind !== "cmd" && <span className="mr-2 select-none text-white/25">│</span>}
            {line.text}
          </p>
        ))}
        {currentCmdIndex !== -1 && (
          <p className={LINE_STYLES.cmd}>
            <span className="mr-2 text-brand">$</span>
            {typed}
            <span className="cursor-blink ml-0.5 inline-block h-[13px] w-[7px] translate-y-[2px] bg-brand" />
          </p>
        )}
        {visible >= SCRIPT.length && (
          <p className="text-[oklch(0.93_0.01_163)]">
            <span className="mr-2 text-brand">$</span>
            <span className="cursor-blink ml-0.5 inline-block h-[13px] w-[7px] translate-y-[2px] bg-brand" />
          </p>
        )}
      </div>
    </div>
  );
}
