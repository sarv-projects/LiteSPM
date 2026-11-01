"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { formatFull } from "@/lib/litespm/format";

/** A kind chip with the palette the whole site uses for kinds. */
export function KindBadge({ kind, className }: { kind: string; className?: string }) {
  const styles: Record<string, string> = {
    mcp: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    skill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    plugin: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  const labels: Record<string, string> = { mcp: "MCP", skill: "Skill", plugin: "Plugin" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]",
        styles[kind] ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {labels[kind] ?? kind}
    </span>
  );
}

/** The availability chip, green when installable. */
export function AvailabilityBadge({
  installable,
  label,
  title,
  className,
}: {
  installable: boolean;
  label: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
        installable
          ? "border-brand/35 bg-brand-soft text-brand"
          : "border-border/70 bg-muted/50 text-muted-foreground",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 rounded-full", installable ? "bg-brand" : "bg-muted-foreground/60")}
      />
      {label}
    </span>
  );
}

/** Section heading: an eyebrow, a title and an optional description. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
  id,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
        )}
        <h2 id={id} className="mt-1.5 text-[24px] font-semibold tracking-tight sm:text-[28px]">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** One statistic, big number over a label. */
export function Stat({
  value,
  label,
  hint,
  className,
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      title={hint}
      className={cn(
        "rounded-xl border border-border/60 bg-card/60 px-4 py-3.5 text-center",
        className,
      )}
    >
      <div className="text-[22px] font-semibold tabular-nums tracking-tight text-foreground sm:text-[24px]">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/** A clickable pill filter. */
export function FilterPill({
  active,
  onClick,
  children,
  count,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
        active
          ? "border-brand/50 bg-brand-soft text-brand"
          : "border-border/70 bg-card text-muted-foreground hover:border-brand/30 hover:text-foreground",
      )}
    >
      {children}
      {typeof count === "number" && (
        <span className="font-mono text-[10.5px] tabular-nums opacity-70">
          {formatFull(count)}
        </span>
      )}
    </button>
  );
}

/** A key-value fact row used across detail pages. */
export function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 py-2.5 last:border-0">
      <dt className="shrink-0 text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-[13px] text-foreground">{children}</dd>
    </div>
  );
}

/** A lightweight horizontal bar for the insights dashboard. */
export function InsightBarRow({
  label,
  value,
  max,
  sub,
  subLabel,
  href,
  onNavigate,
}: {
  label: string;
  value: number;
  max: number;
  sub?: number;
  subLabel?: string;
  href?: string;
  onNavigate?: (href: string) => void;
}) {
  const width = max === 0 ? 0 : Math.max(1.5, (value / max) * 100);
  const subWidth = sub !== undefined && max > 0 ? Math.max(0, (sub / max) * 100) : null;
  const content = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[12.5px] font-medium">{label}</span>
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
          {formatFull(value)}
          {subWidth !== null && sub !== undefined && (
            <span className="ml-1.5 text-brand" title={`${subLabel}: ${sub}`}>
              ·{formatFull(sub)}
            </span>
          )}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/60">
        <div
          className="h-full rounded-full bg-brand/75 transition-[width] duration-500"
          style={{ width: `${width}%` }}
        />
      </div>
      {subWidth !== null && sub !== undefined && sub > 0 && (
        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted/40">
          <div
            className="h-full rounded-full bg-brand/40"
            style={{ width: `${subWidth}%` }}
            title={`${subLabel}: ${sub}`}
          />
        </div>
      )}
    </>
  );

  if (href && onNavigate) {
    return (
      <button
        type="button"
        onClick={() => onNavigate(href)}
        className="block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
        title={`Browse ${label}`}
      >
        {content}
      </button>
    );
  }
  return <div className="px-2 py-1.5">{content}</div>;
}
