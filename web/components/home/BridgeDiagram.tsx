"use client";

/**
 * The one-bridge figure: your agents on top, every kind of capability
 * underneath, and the local bridge between them — as a routed board.
 *
 * ## What changed, and why
 *
 * The previous version was six text pills, nine straight hairlines and a
 * caption, drawn in two hand-placed SVGs. It was legible and inert: a
 * whiteboard sketch sitting on half the first screen. Three things were wrong
 * with it, and all three are fixed here.
 *
 * 1. **The agents were words.** The repository vendors 48 real vendor marks in
 *    `public/brands/`, and five of them are agents this figure names. The logo
 *    is the strongest authority signal available — skills.sh ships an 88px
 *    logo rail and nothing else in that region — so each agent is now its own
 *    mark on a plate, with the name as a caption rather than as the subject.
 *    The sixth tile has no mark to show: there is no logo that means "other
 *    agents", and inventing one (or borrowing a near neighbour's) would be a
 *    false attribution. It says what it is.
 *
 * 2. **The path was decoration.** A capability's journey is the product, so
 *    the geometry now says so: every agent drops one trace into a bus, the bus
 *    feeds the bridge, and the bridge fans out to the three kinds — drawn as
 *    an actual circuit with a bus, pins and a device in the middle, rather
 *    than as nine disconnected lines. Hovering an agent lights its trace, the
 *    bridge, and all three exits at once, which is the claim ("any agent
 *    reaches any kind") stated as an interaction instead of as a sentence.
 *
 * 3. **Nothing moved** — the previous header argued the figure was deliberately
 *    static, which contradicted `ARCH/25` §6.3 ("one subtle connector-path
 *    animation on first paint"). Both were written from a real observation:
 *    the version before *that* animated 42 SVG nodes at once and rendered as a
 *    spiderweb. The resolution is one packet, on one path, at a time: it rises
 *    from a capability kind, is accepted by the bridge, and leaves for an
 *    agent. Four moving nodes at most, no crossings, no loops per connector.
 *
 * ## Geometry
 *
 * Laid out in HTML with CSS custom properties rather than SVG, for three
 * reasons: the vendor marks are `<img>` (an HTML-only element), the text lands
 * on exact type-scale pixels instead of whatever a viewBox scale happens to
 * produce, and every trace is a 2px absolutely-positioned rule whose length is
 * a *known pixel value* — which is what lets both packets travel with a plain
 * `translateY`. No JavaScript ever measures a layout box, so no animation can
 * dirty style or layout; the whole figure is one static HTML tree plus three
 * compositor-only properties.
 *
 * The stage's own numbers live in `globals.css` under `.dg-stage`; the only
 * value this file hands down is each column's centre as a unitless fraction
 * (`--dg-x`), which is what makes the figure reflow correctly at every width
 * without a single media query in the JavaScript.
 *
 * ## Accessibility
 *
 * The interactive tiles are real links to real routes (`/agents/<id>/` and
 * `/explore/?kind=<kind>`), so the highlight they trigger on hover is also
 * reachable by keyboard, on focus, without a single inert tab stop. Every
 * trace, plate and packet is `aria-hidden`; the figure carries one caption
 * with the whole claim in words. `prefetch` is off — the same measured
 * decision as `AgentsView`: a viewport-full of prefetched routes is ~9.5 KB
 * each of speculative download on a page whose whole argument is that it is
 * fast.
 */

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { AgentLogo } from "../AgentLogo";
import { useInView, useReducedMotion } from "../motion/useInView";

/** The five agents we draw. Same five the agent strip offers, same ids the
 *  `/agents/<id>/` route is generated for — a tile here can never link to a
 *  page that does not exist. */
const AGENTS = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "opencode", name: "OpenCode" },
  { id: "cursor", name: "Cursor" },
  { id: "cline", name: "Cline" },
] as const;

/** The three capability kinds, in the three kind hues the catalog already
 *  uses. The notes are the same two words each kind has always carried. */
const KINDS = [
  { token: "mcp", label: "MCP servers", note: "apps & data" },
  { token: "skill", label: "Agent skills", note: "workflows" },
  { token: "plugin", label: "Plugins", note: "toolkits" },
] as const;

/** Six tiles: the five named agents, then the honest sixth. */
const TILES = AGENTS.length + 1;

/** Phase of one packet's journey. `idle` is the rest between journeys. */
type Phase = "idle" | "up" | "hub" | "out";

/**
 * The centre of column `i` of `n`, as a fraction of the grid's content box.
 * `left: calc(pad + (100% - 2·pad) · x)` in the stylesheet then puts a trace
 * exactly under a tile at any width.
 */
const centre = (i: number, n: number) => (2 * i + 1) / (2 * n);

export function BridgeDiagram() {
  const [stageRef, inView] = useInView<HTMLDivElement>({
    threshold: 0.3,
    // Start a little before the figure is fully on screen, so a reader
    // scrolling into it does not watch the first packet begin from a stand.
    rootMargin: "0px 0px -12% 0px",
  });
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  /** Which tile is under the pointer or the focus ring, if any. */
  const [hot, setHot] = useState<{ by: "agent" | "kind"; i: number } | null>(null);

  // A pointer on the figure takes the pencil: while a reader is holding a
  // path open, the ambient packet stops, so the two are never competing for
  // the same trace.
  const running = inView && !reduced && hot === null;

  const agentIndex = (step * 2) % TILES;
  const kindIndex = step % KINDS.length;

  useEffect(() => {
    if (!running) {
      setPhase("idle");
      return;
    }
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };

    // One journey, 1.98 s:
    //   0.04 s  the packet leaves a capability kind and rises to the bus
    //   0.72 s  the bridge takes it (and pulses)
    //   0.98 s  a packet leaves the bridge and rises into an agent
    //   1.70 s  hide, reset, and line up the next hop
    // The 40 ms offset is what makes the rise a *transition*: a phase applied
    // in the same commit that first paints the element would land instantly.
    setPhase("idle");
    at(40, () => setPhase("up"));
    at(720, () => setPhase("hub"));
    at(980, () => setPhase("out"));
    at(1700, () => setPhase("idle"));
    at(1980, () => setStep((s) => (s + 1) % (TILES * KINDS.length)));

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [running, step]);

  return (
    <figure className="dg">
      <div
        ref={stageRef}
        className="dg-stage"
        data-phase={phase}
        data-hot-agent={hot?.by === "agent" ? hot.i : undefined}
        data-hot-kind={hot?.by === "kind" ? KINDS[hot.i].token : undefined}
      >
        {/* The board: the device plane every trace is routed on. */}
        <div className="dg-band" aria-hidden="true" />

        {/* One trace per agent, dropping into the bus. Below `sm` the tiles
            wrap to three columns and the six traces would point at nothing, so
            a single collector trace carries the whole row instead. */}
        {AGENTS.map((agent, i) => (
          <span
            key={agent.id}
            aria-hidden="true"
            className="dg-trace dg-trace-in"
            data-i={i}
            style={{ "--dg-x": centre(i, TILES) } as CSSProperties}
          />
        ))}
        <span aria-hidden="true" className="dg-trace dg-trace-in dg-trace-join" />

        <div className="dg-bus" aria-hidden="true" />

        <div className="dg-hub">
          <span className="dg-hub-title">one local bridge</span>
          <span className="dg-hub-verbs t-mono">discover · install · manage · undo</span>
        </div>

        {/* Three exits, one per kind. */}
        {KINDS.map((kind, i) => (
          <span
            key={kind.token}
            aria-hidden="true"
            className="dg-trace dg-trace-out"
            data-kind={kind.token}
            style={{ "--dg-x": centre(i, KINDS.length) } as CSSProperties}
          />
        ))}

        {/* The two packets. Not rendered at all when motion is reduced, so a
            reduced-motion reader has no hidden node that a later style could
            ever uncover. */}
        {!reduced && (
          <>
            <span
              aria-hidden="true"
              className="dg-packet dg-packet-in"
              data-kind={KINDS[kindIndex].token}
              style={
                { "--dg-x": centre(kindIndex, KINDS.length) } as CSSProperties
              }
            />
            <span
              aria-hidden="true"
              className="dg-packet dg-packet-out"
              style={{ "--dg-x": centre(agentIndex, TILES) } as CSSProperties}
            />
          </>
        )}

        <ul className="dg-agents">
          {AGENTS.map((agent, i) => (
            <li key={agent.id} className="dg-agent" data-i={i}>
              {/* A real link to the agent's own page: the tile is not a
                  decorative hit area, and the highlight it triggers is
                  therefore keyboard-reachable on focus rather than hover-only. */}
              <Link
                href={`/agents/${agent.id}/`}
                prefetch={false}
                className="dg-agent-link"
                onPointerEnter={() => setHot({ by: "agent", i })}
                onPointerLeave={() => setHot(null)}
                onFocus={() => setHot({ by: "agent", i })}
                onBlur={() => setHot(null)}
              >
                <AgentLogo
                  id={agent.id}
                  name={agent.name}
                  size={30}
                  className="dg-agent-plate"
                />
                <span className="dg-agent-name">{agent.name}</span>
              </Link>
            </li>
          ))}
          <li className="dg-agent dg-agent-other" data-i={TILES - 1}>
            {/* No link and no mark. There is no logo that means "other
                agents", and there is no page for it either; the tile is here
                because the catalog is not five products wide, and a reader on
                a host we did not draw has to find themselves in the picture. */}
            <span
              className="dg-agent-still"
              onPointerEnter={() => setHot({ by: "agent", i: TILES - 1 })}
              onPointerLeave={() => setHot(null)}
            >
              <span aria-hidden="true" className="dg-agent-mark">
                +
              </span>
              <span className="dg-agent-name">other agents</span>
            </span>
          </li>
        </ul>

        <ul className="dg-kinds">
          {KINDS.map((kind, i) => (
            <li key={kind.token} className="dg-kind" data-kind={kind.token}>
              <Link
                href={`/explore/?kind=${kind.token}`}
                prefetch={false}
                className="dg-kind-link"
                onPointerEnter={() => setHot({ by: "kind", i })}
                onPointerLeave={() => setHot(null)}
                onFocus={() => setHot({ by: "kind", i })}
                onBlur={() => setHot(null)}
              >
                <span className="dg-kind-label">{kind.label}</span>
                <span className="dg-kind-note t-mono">{kind.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* The same claim the figure makes, in words — for a screen reader, and
          for anyone who reads the page with images and styles off. */}
      <figcaption className="sr-only">
        Claude Code, Codex, OpenCode, Cursor, Cline and other agents each connect down into a single
        local LiteSPM bridge, which connects out to MCP servers, agent skills and plugins. Any agent
        can reach any kind of capability. Hovering or focusing an agent lights its path through the
        bridge and out to all three kinds; hovering or focusing a kind lights every agent&rsquo;s
        path to it.
      </figcaption>
    </figure>
  );
}
