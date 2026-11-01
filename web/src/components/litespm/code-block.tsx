"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/** Copy-to-clipboard button, shared by every code surface. */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-background/80 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand",
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

/** A terminal-styled code block with a header, language tag and copy button. */
export function CodeBlock({
  code,
  title,
  language = "bash",
  className,
  maxHeight,
}: {
  code: string;
  title?: string;
  language?: string;
  className?: string;
  maxHeight?: number;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/70 bg-[oklch(0.16_0.01_163)] text-[oklch(0.92_0.01_163)] shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3.5 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </span>
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
            {title ?? language}
          </span>
        </span>
        <CopyButton
          value={code}
          className="border-white/15 bg-white/5 text-white/70 hover:border-brand/50 hover:text-brand"
        />
      </div>
      <pre
        className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed"
        style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
