"use client";

import * as React from "react";
import { Check, Copy, Terminal } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The install command bar: one dark strip with the exact command and a copy
 * button. This is the site's primary conversion surface, so it stays tight
 * and unambiguous.
 */
export function InstallBar({
  command,
  label = "Install",
  className,
  compact,
}: {
  command: string;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const area = document.createElement("textarea");
      area.value = command;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [command]);

  return (
    <div
      className={cn(
        "flex items-stretch overflow-hidden rounded-lg border border-border/70 bg-[oklch(0.16_0.01_163)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center gap-1.5 border-r border-white/10 bg-white/[0.04] px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-brand",
          compact && "px-2.5",
        )}
      >
        <Terminal className="h-3.5 w-3.5" />
        {!compact && label}
      </span>
      <code
        className={cn(
          "min-w-0 flex-1 truncate px-3.5 py-2.5 font-mono text-[12.5px] text-[oklch(0.93_0.01_163)]",
          compact && "px-3 py-2 text-[12px]",
        )}
        title={command}
      >
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied install command" : "Copy install command"}
        className={cn(
          "shrink-0 border-l border-white/10 bg-white/[0.04] px-3.5 text-[11.5px] font-medium text-white/70 transition-colors hover:bg-brand/15 hover:text-brand",
          compact && "px-3",
        )}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
