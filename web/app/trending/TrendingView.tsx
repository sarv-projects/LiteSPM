"use client";

import Link from "next/link";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { formatCount } from "../../lib/format";
import { categoryLabel } from "../categories/categoryLabel";

/** One board's worth of precomputed rows — see `app/trending/page.tsx`. */
export interface TrendingBoards {
  categories: Array<{ label: string; count: number }>;
  publishers: Array<{ label: string; count: number }>;
  kinds: Array<{ label: string; count: number; kind: "mcp" | "skill" | "plugin" }>;
}

/**
 * One host in the config board. Every field is a fact this build holds about
 * the host, and `null` is a value it does not hold, which renders `—`.
 */
export interface TrendingHostRow {
  id: string;
  name: string;
  format: "json" | "toml";
  configPath: string;
  repoConfigPath?: string;
  skillName?: string;
  docsHref?: string;
  /** Compatible entries by kind, and their total — `null` when unstated. */
  mcp: number | null;
  skill: number | null;
  plugin: number | null;
  total: number | null;
}

/**
 * Coverage boards are counts, not rows: `app/trending/page.tsx` computes them
 * from the full row set at build time, so this route hydrates from props and
 * never requests the dataset.
 */
export interface TrendingViewProps {
  total: number;
  boards: TrendingBoards;
  hosts: TrendingHostRow[];
  /**
   * How many distinct values each board has in the whole snapshot. A board
   * renders the largest 15; the totals are what makes that truncation visible
   * instead of reading as "these are all of them".
   */
  boardTotals: { categories: number; publishers: number };
}

/**
 * A horizontal proportion bar. Used for every counted board on this page so
 * the reader compares one thing: the shape of the distribution.
 */
function Bar({ value, max, tone }: { value: number; max: number; tone?: string }) {
  return (
    <span className="mt-1 block h-[3px] w-full bg-sunken-2">
      <span
        className="block h-full"
        style={{
          width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%`,
          backgroundColor: tone ?? "var(--ink-3)",
        }}
      />
    </span>
  );
}

/**
 * A counted board. Every number here is a count this build actually computed
 * from the catalog: entries per publisher, per category, per kind. Nothing is
 * ranked by popularity, because no popularity signal exists.
 */
function CountBoard({
  title,
  note,
  rows,
  href,
  tone,
  total,
}: {
  title: string;
  note?: string;
  /** `display` overrides `label` for the printed row only; `label` stays the
   *  raw value any `href` needs (category names are also filter values). */
  rows: Array<{ label: string; count: number; href?: string; display?: string }>;
  href?: (label: string) => string;
  tone?: string;
  /**
   * Distinct values in the whole snapshot. Boards render the largest 15 and
   * say so; without this the board read as the complete list.
   */
  total?: number;
}) {
  if (!rows.length) return null;
  const max = rows[0].count;

  return (
    <section>
      <div className="section-head">
        <div className="min-w-0">
          <h2>{title}</h2>
          {note && <p className="section-note mt-0.5">{note}</p>}
          {total !== undefined && total > rows.length && (
            <p className="section-note mt-0.5">
              Showing the top {rows.length} of {formatCount(total)}.
            </p>
          )}
        </div>
      </div>

      <ol>
        {rows.map((row, i) => {
          const to = row.href ?? href?.(row.label);
          const body = (
            <>
              <span className="t-mono t-tabular text-[11px] text-ink-3">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="t-cond block truncate text-[14px] font-medium text-ink">
                  {row.display ?? row.label}
                </span>
                <Bar value={row.count} max={max} tone={tone} />
              </span>
              <span className="t-mono t-tabular shrink-0 text-[12px] text-ink-2">
                {formatCount(row.count)}
              </span>
            </>
          );
          const cls =
            "grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2.5 transition-colors";
          return (
            <li key={row.label}>
              {to ? (
                <Link href={to} className={`${cls} hover:bg-hover`}>
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** "https://zed.dev/docs/ai/mcp" → "zed.dev": a link that reads as one. */
function docsLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The columns of the host board, each with the reader-facing hint that sits
 * under its name. No column names the field it reads: the second line says
 * what the column means, not where the value lives.
 */
const HOST_COLUMNS: Array<{ label: string; hint: string }> = [
  { label: "Host", hint: "" },
  { label: "Config file", hint: "where LiteSPM writes" },
  { label: "Project config", hint: "per-repository file" },
  { label: "Skills", hint: "install target" },
  { label: "Entries", hint: "compatible with it" },
  { label: "Docs", hint: "vendor documentation" },
];

/**
 * The agent-host board: one row per host LiteSPM can set up, one column per
 * fact a reader can use, alphabetical (an order the reader can verify; the
 * catalog publishes no popularity signal to rank by).
 *
 * It replaces a ranked list of compatible-entry totals that were near-constant
 * by construction — compatibility follows from what an entry is, so a host
 * that takes MCP servers takes almost the whole catalog, and eleven of the
 * board's top fifteen rows carried the same figure. The total stays, as the
 * "Entries" column among the facts that actually differ.
 */
function HostBoard({ rows }: { rows: TrendingHostRow[] }) {
  const grid =
    "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_76px_132px]";

  return (
    <section>
      <div className="section-head">
        <div className="min-w-0">
          <h2>Agent hosts by config</h2>
          <p className="section-note mt-0.5">Every host LiteSPM can set up, alphabetical.</p>
        </div>
      </div>

      <div className={`${grid} t-mono hidden border-b border-ink pb-2 text-[10px] text-ink-3 md:grid`}>
        {HOST_COLUMNS.map((column, i) => (
          <span key={column.label} className={i === 4 ? "text-right" : undefined}>
            <span className="t-cond block text-[11px] font-semibold text-ink">{column.label}</span>
            {column.hint && <span className="block text-[9.5px]">{column.hint}</span>}
          </span>
        ))}
      </div>

      <ul>
        {rows.map((row) => {
          const docs = row.docsHref
            ? { href: row.docsHref, label: docsLabel(row.docsHref) }
            : null;
          return (
            <li key={row.id}>
              <div className={`${grid} border-b border-rule py-2.5`}>
                <Link
                  href={`/agents/${row.id}/`}
                  prefetch={false}
                  className="t-cond min-w-0 truncate text-[13.5px] font-medium text-ink transition-colors duration-hover hover:text-accent-text"
                  title="Opens this host's page: config file and bridge entry."
                >
                  {row.name}
                </Link>

                <span
                  className="hidden min-w-0 md:block"
                  title="LiteSPM writes this file — and backs it up before any change."
                >
                  {row.configPath ? (
                    <>
                      <code className="t-mono block truncate text-[11px] text-ink-2">{row.configPath}</code>
                      <span className="t-mono block text-[10px] text-ink-3">{row.format.toUpperCase()}</span>
                    </>
                  ) : (
                    <span className="absent" title="No config path is published for this host.">
                      —
                    </span>
                  )}
                </span>

                <span className="hidden min-w-0 md:block">
                  {row.repoConfigPath ? (
                    <code
                      className="t-mono block truncate text-[11px] text-ink-2"
                      title="LiteSPM can also write a per-project file here, so one repository can pin its own setup."
                    >
                      {row.repoConfigPath}
                    </code>
                  ) : (
                    <span
                      className="absent"
                      title="No per-project config for this host — one file serves the whole machine."
                    >
                      —
                    </span>
                  )}
                </span>

                <span className="hidden min-w-0 md:block">
                  {row.skillName ? (
                    <span
                      className="t-cond block truncate text-[12px] text-ink-2"
                      title={`Skills install into this host under the name “${row.skillName}”.`}
                    >
                      {row.skillName}
                    </span>
                  ) : (
                    <span
                      className="absent"
                      title="LiteSPM has no skills directory for this host, so skills do not install here."
                    >
                      —
                    </span>
                  )}
                </span>

                <span
                  className="t-mono t-tabular text-right text-[11px] text-ink-2"
                  title={
                    row.total === null
                      ? "No entry in the catalog names this host."
                      : `${formatCount(row.total)} compatible entries: ${formatCount(
                          row.mcp ?? 0
                        )} MCP servers, ${formatCount(row.skill ?? 0)} skills and ${formatCount(
                          row.plugin ?? 0
                        )} publisher-declared plugins.`
                  }
                >
                  {row.total === null ? <span className="absent">—</span> : formatCount(row.total)}
                </span>

                <span className="hidden md:block">
                  {docs ? (
                    <a
                      href={docs.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link t-mono block break-all text-[10px] leading-tight"
                      title="The vendor's own documentation for this host."
                    >
                      {docs.label}
                    </a>
                  ) : (
                    <span className="absent" title="No vendor documentation link for this host.">
                      —
                    </span>
                  )}
                </span>

                {/* Below the board's breakpoint the same facts travel as one
                    wrapping line under the name, because a six-column grid at
                    phone width is a grid a phone reader does not read. */}
                <span className="t-mono col-span-2 flex flex-wrap gap-x-1.5 text-[10px] text-ink-3 md:hidden">
                  <span>{row.format.toUpperCase()}</span>
                  <span aria-hidden="true">·</span>
                  <span className="break-all">{row.configPath}</span>
                  {row.repoConfigPath && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="break-all">project {row.repoConfigPath}</span>
                    </>
                  )}
                  {row.skillName && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>skills: {row.skillName}</span>
                    </>
                  )}
                  {docs && (
                    <>
                      <span aria-hidden="true">·</span>
                      <a
                        href={docs.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link break-all"
                      >
                        {docs.label}
                      </a>
                    </>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function CoveragePage({ total, boards, hosts, boardTotals }: TrendingViewProps) {
  return (
    <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
      <Header />

      <main id="main" className="shell flex-1 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Coverage</h1>
          <p className="t-mono text-[11px] text-ink-3">{formatCount(total)} entries</p>
        </div>

        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
          Every entry in the catalog, counted by agent host, capability kind, category and
          publisher.
        </p>

        <div className="mt-7">
          <HostBoard rows={hosts} />
        </div>

        <div className="mt-9 grid items-start gap-x-10 gap-y-9 lg:grid-cols-3">
          <CountBoard
            title="By capability kind"
            note="Every entry is an MCP server, an agent skill or a plugin."
            rows={boards.kinds}
          />
          <CountBoard
            title="Categories by entry count"
            note="The categories the sources themselves publish."
            rows={boards.categories.map((c) => ({ ...c, display: categoryLabel(c.label) }))}
            href={(label) => `/explore/?category=${encodeURIComponent(label)}`}
            total={boardTotals.categories}
          />
          <CountBoard
            title="Publishers by entries shipped"
            note="Entries per publisher; each row opens the publisher's own entries."
            rows={boards.publishers}
            href={(label) => `/explore/?publisher=${encodeURIComponent(label)}`}
            total={boardTotals.publishers}
          />
        </div>

      </main>

      <SiteFooter />
    </div>
  );
}
