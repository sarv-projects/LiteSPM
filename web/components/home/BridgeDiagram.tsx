"use client";

/**
 * The product diagram: your agents on top, every kind of capability underneath,
 * and the local bridge between them.
 *
 * This is deliberately STATIC. The earlier lattice drew 18 agent→kind paths
 * plus 18 infinite "flow" highlights on top — 42 animated SVG nodes that
 * rendered as a spiderweb of crossing strokes, with one path escaping the card
 * and every colour washed out by the overlap. Three of the four competitor
 * directories we measured use no motion at all; the quality signal there is
 * typography and density, not movement.
 *
 * The structure now says the same thing with nine straight lines and no
 * crossings:
 *
 *   6 agent boxes  ──▶  one bridge band  ──▶  3 capability kinds
 *
 * Each agent drops exactly one line into the band. The band is the product —
 * it is why any agent reaches any kind — so the convergence is the point, not
 * an accident of geometry. Three lines leave the band, one per kind, so the
 * exit side reads as a fan rather than a funnel.
 *
 * Two SVGs, CSS-switched, both static:
 *
 *   >= 768px  six agents, the full nine-line figure
 *   < 768px   four named agents plus "other agents"
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
const TOP_Y = 6;
const TOP_BOTTOM = TOP_Y + BOX_H;

const BAND_Y = 180;
const BAND_H = 64;

const KIND_Y = 330;
const KIND_H = 64;
const KIND_W = 196;
const KIND_X0 = 12;
const KIND_GAP = 254;

const CHIP_W = 300;

const CENTER = 370;

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

/** The band: full width, because it serves every agent and every kind equally. */
function BridgeBand({ x, y, w, h, cx, chipW }: { x: number; y: number; w: number; h: number; cx: number; chipW: number }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        fill="var(--accent)"
        fillOpacity={0.05}
        stroke="var(--accent)"
        strokeWidth={1}
        strokeOpacity={0.18}
      />
      <rect
        x={cx - chipW / 2}
        y={y + (h - 40) / 2}
        width={chipW}
        height={40}
        rx={10}
        fill="var(--surface)"
        stroke="var(--rule-2)"
        strokeWidth={1}
      />
      <text
        x={cx}
        y={y + h / 2 - 1}
        textAnchor="middle"
        fontSize={15}
        fontWeight={600}
        fill="var(--accent)"
        style={{ fontFamily: "var(--font-sans), sans-serif", letterSpacing: "-0.01em" }}
      >
        one local bridge
      </text>
      <text
        x={cx}
        y={y + h / 2 + 16}
        textAnchor="middle"
        fontSize={10.5}
        fill="var(--accent)"
        fillOpacity={0.78}
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        discover · install · manage · undo
      </text>
    </g>
  );
}

export function BridgeDiagram() {
  return (
    <>
      {/* ---- desktop: six agents, nine lines ---- */}
      <svg
        viewBox="0 0 740 410"
        role="img"
        aria-labelledby="bridge-title bridge-desc"
        className="hidden h-auto w-full md:block"
      >
        <title id="bridge-title">Every agent, every capability, one local bridge</title>
        <desc id="bridge-desc">
          Claude Code, Codex, OpenCode, Cursor, Cline and other agents each connect down into a single
          local LiteSPM bridge, which connects out to MCP servers, agent skills and plugins. Any agent
          can reach any kind of capability.
        </desc>

        {/* One line per agent, dropping straight into the band. Six in, no
            crossings: convergence into the band is the product story, so the
            geometry shows it rather than fighting it. */}
        {AGENTS.map((agent) => {
          const cx = agent.x + BOX_W / 2;
          const muted = agent.label === "Other agents";
          return (
            <line
              key={`in-${agent.label}`}
              x1={cx}
              y1={TOP_BOTTOM}
              x2={cx}
              y2={BAND_Y}
              stroke="var(--accent)"
              strokeWidth={1.15}
              strokeOpacity={muted ? 0.22 : 0.4}
              strokeDasharray={muted ? "3 3" : undefined}
            />
          );
        })}

        {/* Three out, one per kind, fanned across the band's exit edge. */}
        {KINDS.map((kind, ki) => {
          const kx = KIND_CX(ki);
          return (
            <line
              key={`out-${kind.token}`}
              x1={kx}
              y1={BAND_Y + BAND_H}
              x2={kx}
              y2={KIND_Y}
              stroke={`var(--${kind.token})`}
              strokeWidth={1.25}
              strokeOpacity={0.55}
            />
          );
        })}

        {AGENTS.map((agent) => (
          <TopBox key={agent.label} label={agent.label} x={agent.x} />
        ))}

        <BridgeBand x={4} y={BAND_Y} w={732} h={BAND_H} cx={CENTER} chipW={CHIP_W} />

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
              y={KIND_Y + 29}
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
              y={KIND_Y + 48}
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

      {/* ---- mobile: four agents, same static figure ---- */}
      <svg
        viewBox="0 0 360 320"
        role="img"
        aria-labelledby="bridge-title-sm bridge-desc-sm"
        className="block h-auto w-full md:hidden"
      >
        <title id="bridge-title-sm">Every agent, every capability, one local bridge</title>
        <desc id="bridge-desc-sm">
          Claude Code, Codex, OpenCode and Cursor, plus other agents, connect down into a single local
          LiteSPM bridge, which connects out to MCP servers, agent skills and plugins.
        </desc>

        {[
          { label: "Claude Code · Codex · OpenCode · Cursor", y: 6, muted: false },
          { label: "other agents", y: 54, muted: true },
        ].map((row) => (
          <g key={row.label}>
            <rect
              x={8}
              y={row.y}
              width={344}
              height={38}
              rx={9}
              fill={row.muted ? "var(--sunken)" : "var(--surface)"}
              stroke="var(--rule-2)"
              strokeWidth={1}
              strokeDasharray={row.muted ? "3 3" : undefined}
            />
            <text
              x={180}
              y={row.y + 24}
              textAnchor="middle"
              fontSize={11.5}
              fill={row.muted ? "var(--ink-3)" : "var(--ink-2)"}
              style={{ fontFamily: "var(--font-sans), sans-serif" }}
            >
              {row.label}
            </text>
            <line
              x1={180}
              y1={row.y + 38}
              x2={180}
              y2={150}
              stroke="var(--accent)"
              strokeWidth={1.15}
              strokeOpacity={row.muted ? 0.22 : 0.4}
              strokeDasharray={row.muted ? "3 3" : undefined}
            />
          </g>
        ))}

        <BridgeBand x={8} y={150} w={344} h={52} cx={180} chipW={236} />

        {KINDS.map((kind, ki) => {
          const x = 8 + ki * 120;
          const cx = x + 52;
          return (
            <g key={`sm-${kind.token}`}>
              <line
                x1={cx}
                y1={202}
                x2={cx}
                y2={246}
                stroke={`var(--${kind.token})`}
                strokeWidth={1.25}
                strokeOpacity={0.55}
              />
              <rect
                x={x}
                y={246}
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
                y={272}
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
                y={290}
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
