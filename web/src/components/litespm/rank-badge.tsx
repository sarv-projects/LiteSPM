"use client";

import * as React from "react";
import { Info, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { RANK_TIER_META, RANK_EXPLAINER, rankTierOf } from "@/lib/litespm/format";

/**
 * The LiteSPM Score badge. Shows the numeric score (with tier styling) and,
 * on demand, the full transparent scoring breakdown.
 */
export function RankBadge({
  score,
  size = "md",
  className,
}: {
  score: number | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const tier = rankTierOf(score);
  if (score === undefined || score === 0) return null;
  const meta = tier ? RANK_TIER_META[tier] : RANK_TIER_META.solid;
  return (
    <span
      title={`LiteSPM Score ${score}/100${tier ? ` — ${RANK_TIER_META[tier].label}` : ""}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-mono font-semibold",
        size === "sm" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]",
        meta.className,
        className,
      )}
    >
      <Star className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden="true" />
      {score}
    </span>
  );
}

/** The "?" affordance that reveals how scoring works (used near sort/headers). */
export function RankExplainer({ className }: { className?: string }) {
  return (
    <span className={cn("group relative inline-flex", className)} tabIndex={0}>
      <Info
        className="h-3.5 w-3.5 cursor-help text-muted-foreground/60"
        aria-hidden="true"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-[min(320px,80vw)] -translate-x-1/2 rounded-lg border border-border/70 bg-popover p-3 text-left text-[11.5px] leading-relaxed text-popover-foreground shadow-xl group-hover:block group-focus:block"
      >
        {RANK_EXPLAINER}
      </span>
    </span>
  );
}
