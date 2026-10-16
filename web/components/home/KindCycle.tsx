"use client";

import { useInView, useReducedMotion } from "../motion/useInView";
import { formatCount } from "../../lib/format";

/**
 * What the catalog holds, one kind at a time — the landing page's answer to
 * mcpmarket.com's looping hero typewriter, built out of the same three kind
 * hues the bridge figure exits through.
 *
 * The competitor types a word of its heading and erases it. This does the same
 * job honestly and without its two costs:
 *
 *  - **No typing.** `ARCH/25` §5.3 forbids per-reload typing animations, and a
 *    character reveal is a width animation in costume. The three kinds are in
 *    the DOM once, each with its real count from the release the page shipped
 *    with; the cycle is a vertical slot (transform only) that holds each one
 *    long enough to read.
 *  - **No layout to dirty.** While cycling, a fixed one-line window
 *    (`--kc-h`, in `globals.css`) clips a track that slides inside it — the
 *    line's height is the same in every state, so nothing below it can move.
 *    The row it replaces (the strip's three static counts) is what a reader
 *    without JavaScript, without reduced motion, or before hydration sees:
 *    the same three facts, side by side — wrapping to a second line on narrow
 *    screens, where the figure reserves both lines from the first paint, so
 *    the swap moves nothing there either. `contain: inline-size` keeps the
 *    three-wide row from sizing the hero column around it; without it the
 *    column painted 380px wide and snapped back when hydration replaced the
 *    row — CLS 0 in most runs and 0.25 in the unlucky ones, the flakiest
 *    possible kind of shift.
 *
 * The cycle is ambient, so it is gated exactly like the bridge figure's
 * packets: it runs only while the element is in view and only when motion is
 * allowed. Off-screen it is the still row; under `prefers-reduced-motion:
 * reduce` it is the still row; with JavaScript off the prerendered HTML is the
 * still row. Nothing here is a claim: each count is the same figure the page's
 * own strip prints, counted at build time (`app/page.tsx`).
 *
 * The fourth item is a duplicate of the first: the track slides up through
 * items 1→2→3 and lands on a copy of 1 at exactly one viewport-height of
 * travel, so the loop restart is invisible. It is client-only and `aria-hidden`
 * — a screen reader hears the three facts once, never the seam.
 */

export interface KindCycleProps {
  counts: { mcp: number; skill: number; plugin: number };
}

const KINDS = [
  { token: "mcp", label: "MCP servers" },
  { token: "skill", label: "agent skills" },
  { token: "plugin", label: "plugins" },
] as const;

export function KindCycle({ counts }: KindCycleProps) {
  const [ref, inView] = useInView<HTMLParagraphElement>({ threshold: 0.5 });
  const reduced = useReducedMotion();
  // Same gate as the bridge figure: in view, motion allowed. The initial
  // render is `false` on the server and the first client render, so hydration
  // cannot disagree with the prerendered still row.
  const live = inView && !reduced;

  const item = (token: "mcp" | "skill" | "plugin", label: string, count: number, dup = false) => (
    <span className="kind-cycle-item" data-kind={token} aria-hidden={dup ? true : undefined}>
      <span aria-hidden="true" className="kind-cycle-dot" />
      <span className="kind-cycle-count t-mono t-tabular">{formatCount(count)}</span>{" "}
      <span className="kind-cycle-label">{label}</span>
    </span>
  );

  return (
    <p ref={ref} className="kind-cycle" data-live={live ? "" : undefined}>
      <span className="kind-cycle-window">
        <span className="kind-cycle-track">
          {item("mcp", KINDS[0].label, counts.mcp)}
          {item("skill", KINDS[1].label, counts.skill)}
          {item("plugin", KINDS[2].label, counts.plugin)}
          {live && item("mcp", KINDS[0].label, counts.mcp, true)}
        </span>
      </span>
    </p>
  );
}
