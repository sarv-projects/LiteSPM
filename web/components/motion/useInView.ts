"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Is this element on screen, and is motion allowed at all?
 *
 * The site's motion is CSS wherever CSS can express it — the entrance reveals
 * in `globals.css` are driven by `animation-timeline: view()`, which costs no
 * JavaScript at all and cannot fire a callback on a scroll frame. This hook
 * exists for the one animation CSS cannot own: the bridge figure's travelling
 * packet, which has to know *which* agent and *which* capability kind it is
 * currently flying between, and so needs a timer and a re-render.
 *
 * Two rules make that safe to run on the landing page:
 *
 * 1. **Off-screen means stopped.** An `IntersectionObserver` flips `inView`
 *    false the moment the figure leaves the viewport, and the caller cancels
 *    its pending timers. Nothing animates while the reader is somewhere else
 *    on the page, which is the only honest reading of "nothing animating while
 *    off-screen": an infinite CSS animation on a hidden element still costs
 *    compositing, and would also mean the figure had already looped a hundred
 *    times before the reader ever saw it.
 * 2. **`prefers-reduced-motion: reduce` means `inView` is false, always.**
 *    Not "the animation is faster", not "opacity only" — the caller is told
 *    there is nothing to do, so the figure renders its final state and stays
 *    there. The observer is never even constructed.
 *
 * The initial render is always `false` on both the server and the first
 * client render, so hydration cannot disagree with the prerendered HTML.
 */
export function useInView<T extends Element>(
  options: {
    /** Fraction of the element that must be visible. Default 0.25. */
    threshold?: number;
    /** Grow the detection box so a figure at the fold starts before it lands. */
    rootMargin?: string;
  } = {}
): [React.RefObject<T | null>, boolean] {
  const { threshold = 0.25, rootMargin = "0px" } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // No motion wanted, or no observer to make the judgement with: the caller
    // keeps the still state and never starts a timer.
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setInView(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return [ref, inView];
}

/**
 * The live value of `prefers-reduced-motion`.
 *
 * Separate from `useInView` because a caller may need it for something the
 * observer cannot express — the bridge figure reads it to decide whether to
 * render its packet elements at all, so that a reduced-motion reader gets no
 * hidden nodes that a future style could ever show.
 *
 * Starts `true` (motion off) so the server render and the first client render
 * agree: a still figure, then motion only after the query has actually been
 * asked. The reverse default would flash motion at a reader who asked for none.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) {
      setReduced(false);
      return;
    }
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
