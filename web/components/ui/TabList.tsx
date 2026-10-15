"use client";

import React, { useEffect, useRef, useState } from "react";

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
 * `--dark-signal` is the panel's natural signal colour. It was missing from
 * tailwind.config.js's map until 2026-10-15, so `text-dark-signal` resolved to
 * nothing and the step numbers in `AddSteps` silently inherited `--dark-ink`;
 * the token is mapped now, so the step numerals and the "you chose…" tick
 * carry it as written.
 *
 * On a 360px viewport the six-tab rail overflows (318px visible of 509px) and
 * the hidden tabs gave no sign they existed: `no-scrollbar` removes the only
 * native affordance, and nothing replaced it. The strip now measures itself and
 * fades the edge it can still be scrolled toward — a gradient over the last
 * 40px, coloured by the surface the variant sits on (`--paper` for `line`,
 * `--dark` for `dark`). The ARIA widget is untouched: same roving tabindex,
 * same Arrow/Home/End handling, same `aria-controls`.
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
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const isDark = variant === "dark";

  /** Which edges of the rail have content beyond them right now. */
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [tabs]);

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
    <div className={`relative ${className}`}>
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={`no-scrollbar flex gap-1 overflow-x-auto border-b ${
          isDark ? "border-dark-rule" : "border-rule"
        }`}
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

      {/* Decorative only: the tabs themselves are the affordance for keyboard
          and screen-reader readers, and the fade is pointer-transparent. */}
      {edges.left && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-px left-0 top-0 w-10 bg-gradient-to-r to-transparent ${
            isDark ? "from-dark via-dark/70" : "from-paper via-paper/70"
          }`}
        />
      )}
      {edges.right && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-px right-0 top-0 w-10 bg-gradient-to-l to-transparent ${
            isDark ? "from-dark via-dark/70" : "from-paper via-paper/70"
          }`}
        />
      )}
    </div>
  );
}
