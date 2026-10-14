"use client";

import React, { useRef } from "react";

/**
 * The house tab strip, extracted from `PackageTabs` so the package page's
 * "How do I add it?" panel can offer Command | Prompt without a second,
 * slightly-different copy of the same ARIA widget.
 *
 * The wired pattern: roving tabindex (only the active tab is in the tab
 * order), Left/Right/Home/End move the selection and the focus together, and
 * every button names the panel it controls. Panels are the caller's business —
 * this renders the strip and owns nothing else; the selection is controlled.
 *
 * Two variants, both already in the design language: `line` is the ruled
 * light strip with the accent underline that `PackageTabs` renders, `dark` is
 * the same strip on the install panel, where the underline is `--dark-ink`
 * (the panel's highest-contrast neutral) and the labels come from the
 * `--dark-ink` pair.
 *
 * `--dark-signal` would be the panel's natural signal colour, but the token is
 * not in tailwind.config.js's map, so `text-dark-signal`/`bg-dark-signal`
 * resolve to nothing anywhere in this tree — the step numbers in `AddSteps`
 * have been silently inheriting `--dark-ink` since they were written. That is
 * a pre-existing defect, reported rather than fixed here, because the fix
 * would repaint existing elements the palette change was not asked to touch.
 */
export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export interface TabListProps<T extends string> {
  tabs: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** `aria-label` for the tablist itself. */
  label: string;
  /**
   * Id namespace: buttons become `${idPrefix}-tab-${id}` and each one's
   * `aria-controls` points at `${idPrefix}-panel-${id}` — the caller's panel
   * elements carry that id. `PackageTabs` already spelled its ids this way, so
   * the extraction changes no markup a screen reader can see.
   */
  idPrefix: string;
  variant?: "line" | "dark";
  className?: string;
}

export function TabList<T extends string>({
  tabs,
  active,
  onChange,
  label,
  idPrefix,
  variant = "line",
  className = "",
}: TabListProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const isDark = variant === "dark";

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  const activeClasses = isDark
    ? "text-dark-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-dark-ink after:content-['']"
    : "text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent after:content-['']";
  const idleClasses = isDark ? "text-dark-ink-2 hover:text-dark-ink" : "text-ink-3 hover:text-ink";

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`no-scrollbar flex gap-1 overflow-x-auto border-b ${
        isDark ? "border-dark-rule" : "border-rule"
      } ${className}`}
    >
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${tab.id}`}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          className={`relative min-h-[44px] shrink-0 px-3 text-[13px] font-medium transition-colors duration-state md:min-h-[38px] ${
            active === tab.id ? activeClasses : idleClasses
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
