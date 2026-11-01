"use client";

import * as React from "react";

import brandLogos from "@/../data/brand-logos.json";

const LOGOS = brandLogos as Record<string, { src: string; aspect: number; square: boolean }>;

/**
 * An agent's mark: the vendor logo when we hold one, a clean initial
 * otherwise. `id` accepts registry ids ("claude-code") or display names
 * ("Claude Code") — resolved loosely against the logo index.
 */
export function BrandMark({
  id,
  name,
  size = "md",
  className,
}: {
  id?: string;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  const logo = React.useMemo(() => {
    if (!id) return undefined;
    const key = id.trim().toLowerCase();
    return LOGOS[key] ?? LOGOS[key.replace(/[\s_]+/g, "-")] ?? LOGOS[key.replace(/-|\s+/g, "")];
  }, [id]);

  const dims =
    size === "sm" ? "h-8 w-8 text-[13px]" : size === "lg" ? "h-14 w-14 text-[20px]" : "h-11 w-11 text-[16px]";

  if (logo && !failed) {
    return (
      <span
        aria-hidden="true"
        className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-background p-1.5 ${dims} ${className ?? ""}`}
      >
        <img
          src={logo.src}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  const initial = name.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "A";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/40 font-semibold text-foreground/80 ${dims} ${className ?? ""}`}
    >
      {initial}
    </span>
  );
}
