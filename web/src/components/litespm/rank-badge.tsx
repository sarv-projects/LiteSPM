"use client";

import * as React from "react";
import { CheckCircle2, Gauge, Info, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { RANK_TIER_META, RANK_EXPLAINER, rankTierOf } from "@/lib/litespm/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PackageDetailData } from "@/lib/litespm/types";

export interface RankBadgeProps {
  score: number | undefined;
  size?: "sm" | "md";
  className?: string;
  breakdown?: PackageDetailData["rankBreakdown"];
}

/**
 * The LiteSPM Score badge. Shows the numeric score (with tier styling) and,
 * on click, the full transparent scoring breakdown.
 */
export function RankBadge({
  score,
  size = "md",
  className,
  breakdown,
}: RankBadgeProps) {
  const tier = rankTierOf(score);
  if (score === undefined || score === 0) return null;
  const meta = tier ? RANK_TIER_META[tier] : RANK_TIER_META.solid;

  const badgeElement = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-mono font-semibold transition-transform active:scale-95",
        size === "sm" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]",
        meta.className,
        breakdown ? "cursor-pointer hover:ring-2 hover:ring-brand/30" : "",
        className,
      )}
    >
      <Gauge className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden="true" />
      {score}
    </span>
  );

  if (!breakdown) {
    return (
      <span title={`LiteSPM Score ${score}/100${tier ? ` — ${RANK_TIER_META[tier].label}` : ""}`}>
        {badgeElement}
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Inspect score breakdown for ${score}/100`}>
          {badgeElement}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-[13.5px]">
              <Sparkles className="h-4 w-4 text-brand" />
              <span>LiteSPM Score Breakdown</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Editorial reputation out of 100</p>
          </div>
          <div className="text-right">
            <span className="font-mono text-[16px] font-bold text-brand">{score}</span>
            <span className="text-[11px] text-muted-foreground">/100</span>
          </div>
        </div>

        <div className="mt-3 space-y-2.5 text-[11.5px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">Editorial Recognition</p>
              <p className="text-[10.5px] text-muted-foreground">{breakdown.recognition.reason}</p>
            </div>
            <span className="font-mono font-semibold text-brand">
              {breakdown.recognition.points}/35
            </span>
          </div>

          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">Vendor Authority</p>
              <p className="text-[10.5px] text-muted-foreground">{breakdown.vendorAuthority.reason}</p>
            </div>
            <span className="font-mono font-semibold text-brand">
              {breakdown.vendorAuthority.points}/18
            </span>
          </div>

          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">Proven Installability</p>
              <p className="text-[10.5px] text-muted-foreground">{breakdown.installability.reason}</p>
            </div>
            <span className="font-mono font-semibold text-brand">
              {breakdown.installability.points}/15
            </span>
          </div>

          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">Record Completeness</p>
              <p className="text-[10.5px] text-muted-foreground">{breakdown.recordQuality.reason}</p>
            </div>
            <span className="font-mono font-semibold text-brand">
              {breakdown.recordQuality.points}/12
            </span>
          </div>

          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">Description Quality</p>
              <p className="text-[10.5px] text-muted-foreground">{breakdown.description.reason}</p>
            </div>
            <span className="font-mono font-semibold text-brand">
              {breakdown.description.points}/5
            </span>
          </div>

          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">Community & Activity</p>
              <p className="text-[10.5px] text-muted-foreground">{breakdown.stars.reason}</p>
            </div>
            <span className="font-mono font-semibold text-brand">
              {breakdown.stars.points}/15
            </span>
          </div>

          {breakdown.penalty.points > 0 && (
            <div className="flex items-start justify-between gap-2 border-t border-destructive/20 pt-1.5 text-destructive">
              <div>
                <p className="font-medium">SEO / Fragment Penalty</p>
                <p className="text-[10.5px] opacity-80">{breakdown.penalty.reason}</p>
              </div>
              <span className="font-mono font-semibold">-{breakdown.penalty.points}</span>
            </div>
          )}
        </div>

        <div className="mt-3 rounded-lg bg-muted/40 p-2 text-[10.5px] text-muted-foreground">
          Calibrated so maximum scores sum to 100 points. Click anywhere to dismiss.
        </div>
      </PopoverContent>
    </Popover>
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
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-[min(340px,85vw)] -translate-x-1/2 rounded-lg border border-border/70 bg-popover p-3 text-left text-[11.5px] leading-relaxed text-popover-foreground shadow-xl group-hover:block group-focus:block"
      >
        {RANK_EXPLAINER}
      </span>
    </span>
  );
}
