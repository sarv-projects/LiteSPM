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
 *    feeds the bridge, and the bridge fans out to the kinds it can carry —
 *    drawn as an actual circuit with a bus, pins and a device in the middle,
 *    rather than as nine disconnected lines. Hovering an agent lights its
 *    trace, the bridge, and the exits it can reach. Hovering the *plugins*
 *    exit lights nothing: LiteSPM cannot install a plugin, so there is no
 *    live path out of it, and the figure says so in the tile, in the caption,
 *    and in the fact that the travelling packet never leaves from it.
 *
 * 3. **Nothing moved** — the previous header argued the figure was deliberately
 *    static, which contradicted `ARCH/25` §6.3 ("one subtle connector-path
 *    animation on first paint"). Both were written from a real observation:
 *    the version before *that* animated 42 SVG nodes at once and rendered as a
 *    spiderweb. The resolution is one packet, on one path, at a time: it rises
 *    from a capability kind, is accepted by the bridge, and leaves for an
 *    agent. Four moving nodes at most, no crossings, no loops per connector.
 *
 * 4. **The journey was drawn, but nothing answered it.** One packet moved
 *    through a figure whose every other element stayed inert, and the phases
 *    existed only to move it. The figure now answers its own packet, and the
 *    state machine says when:
 *
 *    | phase | at     | what answers |
 *    |-------|--------|--------------|
 *    | `up`    | 0.04 s | the kind lights and its wire energises |
 *    | `hub`   | 0.72 s | the bridge pulses (unchanged) |
 *    | `out`   | 0.98 s | the destination agent's wire energises |
 *    | `land`  | 1.60 s | the tile registers the arrival; the packet is absorbed |
 *
 *    `land` is new, and it is why the state machine has five phases: the
 *    out-packet used to fade *while sliding back* down the wire, so "arrived"
 *    and "retreated" were the same 160 ms. It now stays where it landed, fades
 *    there, and only resets once it is invisible — which is also the only
 *    honest moment at which a tile can acknowledge a delivery.
 *
 *    Two cues run on their own clocks, both gated on `data-live` (present only
 *    while the figure is in view, motion is allowed, and no pointer holds a
 *    path open — the same condition that starts the packets):
 *
 *    - **the verbs are a label.** `discover · install · manage · undo` is
 *      printed once, in the muted ink, and stays put. It used to light one
 *      word at a time on the journey's own clock — a second rotating element
 *      in the most-read position on the page, next to a count that rotated as
 *      well. Two rotations competing for one reader is one too many, and
 *      neither carried information.
 *    - **the bus carries a slow light** (4.4 s, deliberately not a divisor of
 *      the journey) so the figure is not inert between packets. It is a
 *      translucent wash travelling *over* the bus, never a change to the bus's
 *      own colour — the wire's measured contrast cannot regress.
 *
 *    One fix came with the arrival cue: `agentIndex` was `(step * 2) % TILES`,
 *    which advances by two and so only ever reached three of the six tiles.
 *    The other three could never have received anything. `step % TILES` draws
 *    all eighteen (kind, agent) pairs exactly once per cycle.
 *
 * ## Geometry
 *
 * Laid out in HTML with CSS custom properties rather than SVG, for three
 * reasons: the vendor marks are `<img>` (an HTML-only element), the text lands
 * on exact type-scale pixels instead of whatever a viewBox scale happens to
 * produce, and every trace is a 2px absolutely-positioned rule whose length is
 * a *known pixel value* — which is what lets both packets travel with a plain
 * `translateY`. No JavaScript ever measures a layout box, so no animation can
 * dirty style or layout; the whole figure is one static HTML tree, and the
 * only things that ever move are `transform` and `opacity` on it.
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
 *
 * Motion is additive and always optional. With `prefers-reduced-motion:
 * reduce` the packets are never rendered, `data-live` never appears and every
 * phase stays `idle`, so the figure is complete and legible before a single
 * cue is applied; with JavaScript off the prerendered HTML is that same still
 * figure. The pointer always wins: a hover or a focus ring stops the ambient
 * motion outright rather than competing with it.
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

/**
 * The three capability kinds the catalog holds, in the three kind hues the
 * catalog already uses. The notes are the same two words each kind has always
 * carried.
 *
 * **The third one cannot be installed.** `litespm install` refuses a plugin
 * outright (`LPSM-ARTIFACT-UNAVAILABLE` — there is no plugin artifact source
 * yet), so the plugin exit is drawn as what it is: a kind the catalog lists
 * and LiteSPM cannot yet carry. It says so in the tile, the travelling packet
 * never leaves from it, and hovering it lights no path. The old figure
 * claimed the opposite — "any agent reaches any kind of capability", with a
 * packet that flew out of the plugin exit on a third of its cycles — which
 * was the one place on the page that promised an install the binary refuses.
 */
const KINDS = [
  { token: "mcp", label: "MCP servers", note: "apps & data", installable: true },
  { token: "skill", label: "Agent skills", note: "workflows", installable: true },
  { token: "plugin", label: "Plugins", note: "pinned sources", installable: true },
] as const;

/**
 * The kinds LiteSPM can actually install — the only exits the travelling
 * packet may leave from, and the only ones a hover may light.
 */
const INSTALLABLE_KINDS = KINDS.map((kind, index) => (kind.installable ? index : -1)).filter(
  (index) => index >= 0
);


/** Six tiles: the five named agents, then the honest sixth. */
const TILES = AGENTS.length + 1;

/** The bridge's four operations, in the order the hub prints them. The figure
 *  lights them one at a time, so the line reads as the sequence it describes. */
const VERBS = ["discover", "install", "manage", "undo"] as const;

/** One journey — the packet's whole cycle through the figure, in ms. The verb
 *  readout runs on the same clock (a quarter of it per verb), so the two
 *  cannot drift apart; the stylesheet reads the value as `--dg-cycle`. */
const CYCLE_MS = 1980;

/** Phase of one packet's journey. `idle` is the rest between journeys; `land`
 *  is the out-packet's arrival at an agent, where it is absorbed. */
type Phase = "idle" | "up" | "hub" | "out" | "land";

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

  const agentIndex = step % TILES;
  // The packet only ever leaves from a kind LiteSPM can install. The plugin
  // exit is drawn, linked and labelled, but nothing travels out of it.
  const kindIndex = INSTALLABLE_KINDS[step % INSTALLABLE_KINDS.length];

  useEffect(() => {
    if (!running) {
      setPhase("idle");
      return;
    }
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };

    // One journey, CYCLE_MS long:
    //   0.04 s  the packet leaves a capability kind and rises to the bus
    //   0.72 s  the bridge takes it (and pulses)
    //   0.98 s  a packet leaves the bridge and rises into an agent
    //   1.60 s  the agent receives it: the tile registers the arrival and the
    //           packet is absorbed where it landed
    //   1.98 s  hide, reset, and line up the next hop
    // The 40 ms offset is what makes the rise a *transition*: a phase applied
    // in the same commit that first paints the element would land instantly.
    setPhase("idle");
    at(40, () => setPhase("up"));
    at(720, () => setPhase("hub"));
    at(980, () => setPhase("out"));
    at(1600, () => setPhase("land"));
    at(CYCLE_MS, () => setStep((s) => (s + 1) % (TILES * KINDS.length)));

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
        // Present exactly while the journey is running — in view, motion
        // allowed, no pointer holding a path open. Every ambient cue (the verb
        // readout, the light on the bus) is gated on it, so nothing animates
        // off-screen or while a reader is inspecting a tile.
        data-live={running ? "" : undefined}
        data-hot-agent={hot?.by === "agent" ? hot.i : undefined}
        data-hot-kind={hot?.by === "kind" ? KINDS[hot.i].token : undefined}
        style={{ "--dg-cycle": `${CYCLE_MS}ms` } as CSSProperties}
      >
        {/* The board: the device plane every trace is routed on. */}
        <div className="dg-band" aria-hidden="true" />

        {/* One trace per agent, dropping into the bus. Below `sm` the tiles
            wrap to three columns and the six traces would point at nothing, so
            a single collector trace carries the whole row instead.
            `data-dst` marks the trace this journey's out-packet is climbing;
            it is what the stylesheet energises while the packet is on it. */}
        {AGENTS.map((agent, i) => (
          <span
            key={agent.id}
            aria-hidden="true"
            className="dg-trace dg-trace-in"
            data-i={i}
            data-dst={i === agentIndex ? "" : undefined}
            style={{ "--dg-x": centre(i, TILES) } as CSSProperties}
          />
        ))}
        <span aria-hidden="true" className="dg-trace dg-trace-in dg-trace-join" />

        <div className="dg-bus" aria-hidden="true" />

        <div className="dg-hub">
          <span className="dg-hub-title">one local bridge</span>
          {/*
            The verbs are a label, not a readout any more.

            They used to light one at a time, on the journey's own clock — a
            second rotating thing in the most-read position on the page, next
            to a number that used to rotate as well. Two animations competing
            for the same attention is one too many, and neither carried
            information: the four words are the same four words in the same
            order every time, so the rotation was movement without meaning.

            The line is now static text, in the muted ink the container
            already sets. The `dg-verb` class is deliberately not applied: it
            is what the stylesheet's per-word keyframe targets, and the point
            is that there is no per-word keyframe any more. The packet that
            travels the figure is the one motion here, and it answers
            something.
          */}
          <span className="dg-hub-verbs t-mono">{VERBS.join(" · ")}</span>
        </div>

        {/* Three exits, one per kind. `data-src` marks the one this journey's
            in-packet is climbing out of. */}
        {KINDS.map((kind, i) => (
          <span
            key={kind.token}
            aria-hidden="true"
            className="dg-trace dg-trace-out"
            data-kind={kind.token}
            data-src={i === kindIndex ? "" : undefined}
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
            <li
              key={agent.id}
              className="dg-agent"
              data-i={i}
              data-dst={i === agentIndex ? "" : undefined}
            >
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
          <li
            className="dg-agent dg-agent-other"
            data-i={TILES - 1}
            data-dst={TILES - 1 === agentIndex ? "" : undefined}
          >
            {/* No link and no mark. There is no logo that means "other
                agents", and there is no page for it either; the tile is here
                because the catalog is not five products wide, and a reader on
                a host we did not draw has to find themselves in the picture.

                The tile used to carry a "+" glyph above the label. It was a
                stand-in for a mark that does not exist, and it read as an
                "add" affordance on a diagram that cannot be added to — so the
                label now stands alone, which is what it always meant. */}
            <span
              className="dg-agent-still"
              onPointerEnter={() => setHot({ by: "agent", i: TILES - 1 })}
              onPointerLeave={() => setHot(null)}
            >
              <span className="dg-agent-name">other agents</span>
            </span>
          </li>
        </ul>

        <ul className="dg-kinds">
          {KINDS.map((kind, i) => (
            <li
              key={kind.token}
              className="dg-kind"
              data-kind={kind.token}
              data-src={i === kindIndex ? "" : undefined}
            >
              <Link
                href={`/explore/?kind=${kind.token}`}
                prefetch={false}
                className="dg-kind-link"
                // A kind LiteSPM cannot install lights no path: there is no
                // route out of that exit, and the hover glow is this figure's
                // one language for "this path is live".
                onPointerEnter={() => {
                  if (kind.installable) setHot({ by: "kind", i });
                }}
                onPointerLeave={() => setHot(null)}
                onFocus={() => {
                  if (kind.installable) setHot({ by: "kind", i });
                }}
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
          for anyone who reads the page with images and styles off.

          The claim is now the one the product can keep: an agent reaches MCP
          servers and agent skills, and plugins are listed but not installed
          yet. The sentence it replaced — "every agent connects to all three
          kinds" — was the one overstatement the page used to make. */}
      <figcaption className="sr-only">
        Claude Code, Codex, OpenCode, Cursor, Cline and other agents each connect down into a single
        local LiteSPM bridge, which connects out to MCP servers and agent skills. Any agent reaches
        either kind. A plugin whose publisher ships a pinned source reaches the same bridge through
        its own manifest, so the path to that exit is drawn; a plugin with no fetchable source is
        refused with the reason.
      </figcaption>
    </figure>
  );
}
