"use client";

import { cn } from "@/lib/utils";

/** The LiteSPM mark: a stacked-boxes glyph in the brand color. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("h-6 w-6", className)}
    >
      <path
        d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 7 12 11.7 20.5 7M12 11.7v9.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <circle cx="12" cy="11.7" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="text-brand">
        <LogoMark />
      </span>
      <span className="text-[15.5px] font-semibold tracking-tight">
        LiteSPM
        <span className="ml-1.5 hidden font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:inline">
          package manager
        </span>
      </span>
    </span>
  );
}
