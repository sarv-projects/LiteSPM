"use client";

/**
 * The product diagram: your agents on top, every kind of capability underneath,
 * and the local bridge between them drawn as a lattice rather than a pipe.
 *
 * Why a lattice and not one box: a single connector told the truth about the
 * architecture and the wrong story about the product. What a visitor needs to
 * see is that *any* of their agents can reach *every* kind of capability —
 * Claude Code, Codex, OpenCode, Cursor, Cline, and the one we did not name. So
 * each agent carries its own line to each kind, and the bridge is the band they
 * cross, not a box in the middle.
 *
 * Three things make 18 crossing lines readable rather than a scribble, all of
 * them learned by rendering it and looking:
 *
 *   1. **Both ends fan.** Six lines meeting one point is a funnel; spreading
 *      each end across its own box's edge makes the crossings read as a
 *      lattice. That is what `fan()` is for.
 *   2. **The label gets a chip.** The first version centred the caption in the
 *      open band and the paths ran straight through the words. A filled chip
 *      reads on top of the lattice instead of behind it, so the caption is
 *      legible no matter which lines pass under.
 *   3. **Quiet strokes.** 1.15px at ~30% opacity: at 18 lines, anything heavier
 *      stops being structure and becomes texture.
 *
 * Motion, all of it gated on reduced-motion (the gate lives in globals.css):
 *
 *   `bridge-draw`  the lattice draws in once, staggered 55ms per path so the eye
 *                  follows connections instead of seeing them appear as a sheet.
 *   `bridge-flow`  a short highlight travels each path forever, offset per path
 *                  so it never pulses in lockstep — the quietest thing here.
 *
 * Two SVGs, CSS-switched:
 *
 *   >= 768px  six agents, the full 18-path lattice
 *   < 768px   three named agents plus "other agents", six paths — still
 *             animated, because a static lattice is a picture of a lattice
 */

const KINDS: Array<{ label: string; note: string; token: string }> = [
  { label: "MCP servers", note: "apps & data", token: "mcp" },
  { label: "Agent skills", note: "workflows", token: "skill" },
  { label: "Plugins", note: "toolkits", token: "plugin" },
];

/* Five named agents and the honest sixth. `Other agents` is not filler: the
   catalog is generic across hosts, and a visitor on a host we did not draw needs
   to find themselves in the picture. */
const AGENTS = [
  { label: "Claude Code", x: 4 },
  { label: "Codex", x: 128 },
  { label: "OpenCode", x: 252 },
  { label: "Cursor", x: 376 },
  { label: "Cline", x: 500 },
  { label: "Other agents", x: 624 },
];

const BOX_W = 112;
const BOX_H = 42;
const TOP_Y = 8;
const BOTTOM_Y = TOP_Y + BOX_H;
const KIND_Y = 430;
const KIND_W = 196;
const KIND_H = 60;
const KIND_X0 = 12;
const KIND_GAP = 254;
const CHIP_Y = 232;
const CHIP_H = 56;
const CHIP_W = 340;
const CENTER = 370;

/** Spread `i` of `n` attachments across a span of `width` starting at `x`. */
function fan(x: number, width: number, i: number, n: number): number {
  return x + ((i + 0.5) * width) / n;
}

const KIND_X = (ki: number) => KIND_X0 + ki * KIND_GAP;
const KIND_CX = (ki: number) => KIND_X(ki) + KIND_W / 2;

function TopBox({ label, x }: { label: string; x: number }) {
  const muted = label === "Other agents";
  return (
    <g>
      <rect
        x={x}
        y={TOP_Y}
        width={BOX_W}
        height={BOX_H}
        rx={9}
        fill={muted ? "var(--sunken)" : "var(--surface)"}
        stroke="var(--rule-2)"
        strokeWidth={1}
        strokeDasharray={muted ? "3 3" : undefined}
      />
      <text
        x={x + BOX_W / 2}
        y={TOP_Y + BOX_H / 2 + 4}
        textAnchor="middle"
        fontSize={label.length > 11 ? 11 : 12.5}
        fontWeight={500}
        fill={muted ? "var(--ink-3)" : "var(--ink)"}
        style={{ fontFamily: "var(--font-sans), sans-serif" }}
      >
        {label}
      </text>
    </g>
  );
}

export function BridgeDiagram() {
  return (
    <>
      {/* ---- desktop: six agents, the full lattice ---- */}
      <svg
        viewBox="0 0 740 500"
        role="img"
        aria-labelledby="bridge-title bridge-desc"
        className="hidden h-auto w-full md:block"
      >
        <title id="bridge-title">Every agent, every capability, one local bridge</title>
        <desc id="bridge-desc">
          Claude Code, Codex, OpenCode, Cursor, Cline and other agents each connect through a single
          local LiteSPM bridge to MCP servers, agent skills and plugins. Any agent can reach any kind
          of capability.
        </desc>

        {/* The bridge is this band, not a box: it spans the full width because it
            serves every agent and every kind equally, which a centred rectangle
            cannot say. */}
        <rect
          x={4}
          y={CHIP_Y}
          width={732}
          height={CHIP_H}
          rx={14}
          fill="var(--accent)"
          fillOpacity={0.05}
          stroke="var(--accent)"
          strokeWidth={1}
          strokeOpacity={0.18}
        />

        {/* Connectors first, so the boxes and the caption chip sit on top of
            their own lines. Every agent to every kind: six in, three out, both
            ends fanned. */}
        {AGENTS.map((agent, ai) =>
          KINDS.map((kind, ki) => {
            const ax = fan(agent.x, BOX_W, ki, KINDS.length);
            const kx = fan(KIND_X(ki), KIND_W, ai, AGENTS.length);
            const i = ai * KINDS.length + ki;
            const muted = agent.label === "Other agents";
            const d = `M ${ax},${BOTTOM_Y} C ${ax},${CHIP_Y - 34} ${kx},${KIND_Y - 100} ${kx},${KIND_Y}`;
            return (
              <g key={`${agent.label}-${kind.token}`}>
                <path
                  className="bridge-path"
                  pathLength={1}
                  d={d}
                  fill="none"
                  stroke={`var(--${kind.token})`}
                  strokeWidth={1.15}
                  strokeOpacity={muted ? 0.2 : 0.32}
                  strokeDasharray={muted ? "3 3" : undefined}
                  style={{ animationDelay: `${i * 55}ms` }}
                />
                <path
                  className="bridge-flow"
                  pathLength={1}
                  d={d}
                  fill="none"
                  stroke={`var(--${kind.token})`}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeOpacity={muted ? 0.28 : 0.5}
                  style={{ animationDelay: `${(i % 6) * 620}ms` }}
                />
              </g>
            );
          }),
        )}

        {AGENTS.map((agent) => (
          <TopBox key={agent.label} label={agent.label} x={agent.x} />
        ))}

        {/* The caption chip. Filled, so it reads on top of the lattice instead
            of competing with it — the first draft centred this text in the open
            band and the paths ran straight through the words. */}
        <rect
          x={CENTER - CHIP_W / 2}
          y={CHIP_Y + 8}
          width={CHIP_W}
          height={CHIP_H - 16}
          rx={10}
          fill="var(--surface)"
          stroke="var(--rule-2)"
          strokeWidth={1}
        />
        <text
          x={CENTER}
          y={CHIP_Y + 30}
          textAnchor="middle"
          fontSize={15}
          fontWeight={600}
          fill="var(--accent)"
          style={{ fontFamily: "var(--font-sans), sans-serif", letterSpacing: "-0.01em" }}
        >
          one local bridge
        </text>
        <text
          x={CENTER}
          y={CHIP_Y + 47}
          textAnchor="middle"
          fontSize={10.5}
          fill="var(--accent)"
          fillOpacity={0.78}
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          discover · install · manage · undo
        </text>

        {KINDS.map((kind, ki) => (
          <g key={kind.token}>
            <rect
              x={KIND_X(ki)}
              y={KIND_Y}
              width={KIND_W}
              height={KIND_H}
              rx={11}
              fill={`var(--${kind.token}-wash)`}
              stroke={`var(--${kind.token})`}
              strokeWidth={1}
              strokeOpacity={0.5}
            />
            <text
              x={KIND_CX(ki)}
              y={KIND_Y + 27}
              textAnchor="middle"
              fontSize={14}
              fontWeight={600}
              fill={`var(--${kind.token})`}
              style={{ fontFamily: "var(--font-sans), sans-serif" }}
            >
              {kind.label}
            </text>
            <text
              x={KIND_CX(ki)}
              y={KIND_Y + 46}
              textAnchor="middle"
              fontSize={11}
              fill={`var(--${kind.token})`}
              fillOpacity={0.85}
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              {kind.note}
            </text>
          </g>
        ))}
      </svg>

      {/* ---- mobile: fewer nodes, same idea, still moving --------------- */}
      <svg
        viewBox="0 0 360 330"
        role="img"
        aria-labelledby="bridge-title-sm bridge-desc-sm"
        className="block h-auto w-full md:hidden"
      >
        <title id="bridge-title-sm">Every agent, every capability, one local bridge</title>
        <desc id="bridge-desc-sm">
          Claude Code, Codex and OpenCode, plus other agents, connect through a single local LiteSPM
          bridge to MCP servers, agent skills and plugins.
        </desc>

        <rect
          x={8}
          y={8}
          width={344}
          height={38}
          rx={9}
          fill="var(--surface)"
          stroke="var(--rule-2)"
          strokeWidth={1}
        />
        <text
          x={180}
          y={32}
          textAnchor="middle"
          fontSize={11.5}
          fill="var(--ink-2)"
          style={{ fontFamily: "var(--font-sans), sans-serif" }}
        >
          Claude Code · Codex · OpenCode · Cursor
        </text>
        <rect
          x={8}
          y={52}
          width={344}
          height={34}
          rx={9}
          fill="var(--sunken)"
          stroke="var(--rule-2)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text
          x={180}
          y={74}
          textAnchor="middle"
          fontSize={11.5}
          fill="var(--ink-3)"
          style={{ fontFamily: "var(--font-sans), sans-serif" }}
        >
          other agents
        </text>

        <rect
          x={8}
          y={132}
          width={344}
          height={52}
          rx={13}
          fill="var(--accent)"
          fillOpacity={0.05}
          stroke="var(--accent)"
          strokeWidth={1}
          strokeOpacity={0.18}
        />
        <rect x={62} y={140} width={236} height={36} rx={9} fill="var(--surface)" stroke="var(--rule-2)" strokeWidth={1} />
        <text
          x={180}
          y={156}
          textAnchor="middle"
          fontSize={13.5}
          fontWeight={600}
          fill="var(--accent)"
          style={{ fontFamily: "var(--font-sans), sans-serif" }}
        >
          one local bridge
        </text>
        <text
          x={180}
          y={171}
          textAnchor="middle"
          fontSize={9.5}
          fill="var(--accent)"
          fillOpacity={0.78}
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          discover · install · manage · undo
        </text>

        {KINDS.map((kind, ki) => {
          const x = 8 + ki * 120;
          const cx = x + 52;
          const d = `M ${fan(8, 344, ki, 3)},86 C ${fan(8, 344, ki, 3)},112 ${cx},128 ${cx},252`;
          return (
            <g key={`sm-${kind.token}`}>
              <path
                className="bridge-path"
                pathLength={1}
                d={d}
                fill="none"
                stroke={`var(--${kind.token})`}
                strokeWidth={1.15}
                strokeOpacity={0.35}
                style={{ animationDelay: `${ki * 90}ms` }}
              />
              <path
                className="bridge-flow"
                pathLength={1}
                d={d}
                fill="none"
                stroke={`var(--${kind.token})`}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeOpacity={0.5}
                style={{ animationDelay: `${ki * 700}ms` }}
              />
              <rect
                x={x}
                y={252}
                width={104}
                height={60}
                rx={11}
                fill={`var(--${kind.token}-wash)`}
                stroke={`var(--${kind.token})`}
                strokeWidth={1}
                strokeOpacity={0.5}
              />
              <text
                x={cx}
                y={278}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill={`var(--${kind.token})`}
                style={{ fontFamily: "var(--font-sans), sans-serif" }}
              >
                {kind.label}
              </text>
              <text
                x={cx}
                y={296}
                textAnchor="middle"
                fontSize={10}
                fill={`var(--${kind.token})`}
                fillOpacity={0.85}
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                {kind.note}
              </text>
            </g>
          );
        })}
      </svg>
    </>
  );
}
