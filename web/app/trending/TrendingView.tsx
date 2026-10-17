"use client";

import Link from "next/link";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { formatCount } from "../../lib/format";
import { REPO_URL } from "../../lib/site";
import { categoryLabel } from "../categories/categoryLabel";

/** One board's worth of precomputed rows — see `app/trending/page.tsx`. */
export interface TrendingBoards {
  categories: Array<{ label: string; count: number }>;
  publishers: Array<{ label: string; count: number }>;
  kinds: Array<{ label: string; count: number; kind: "mcp" | "skill" | "plugin" }>;
}

/**
 * One host in the config board. Every field is a value `hosts.json`,
 * `skill-targets.json` or the release manifest states about the host — see
 * `app/trending/page.tsx` for the sources — and `null` is a value no registry
 * states, which renders `—`.
 */
export interface TrendingHostRow {
  id: string;
  name: string;
  /** `hosts.json` `generic`: false is a hand-written adapter. */
  generic: boolean;
  format: "json" | "toml";
  userPath: string;
  projectPath?: string;
  skillName?: string;
  docsUrl?: string;
  /** The hand-written adapter's source file, for the docs column. */
  adapterFile?: string;
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

/** The columns of the host board, with the field each reads. */
const HOST_COLUMNS: Array<{ label: string; source: string }> = [
  { label: "Host", source: "hosts.json" },
  { label: "Adapter", source: "generic" },
  { label: "Config file", source: "userPath · format" },
  { label: "Project config", source: "projectScope" },
  { label: "Skills", source: "skill-targets.json" },
  { label: "Entries", source: "release.json" },
  { label: "Docs", source: "docsUrl · internal/host/" },
];

/**
 * The agent-host board: one row per host with a compiled-in adapter, one
 * column per fact a registry states about it, alphabetical (an order the
 * reader can verify; the catalog publishes no popularity signal to rank by).
 *
 * It replaces a ranked list of compatible-entry totals that were near-constant
 * by construction — compatibility follows from what an entry is, so a host
 * that takes MCP servers takes almost the whole catalog, and eleven of the
 * board's top fifteen rows carried the same figure. The total stays, as the
 * "Entries" column among the facts that actually differ.
 */
function HostBoard({ rows }: { rows: TrendingHostRow[] }) {
  const grid =
    "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1.2fr)_88px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_76px_132px]";

  return (
    <section>
      <div className="section-head">
        <div className="min-w-0">
          <h2>Agent hosts by config</h2>
          <p className="section-note mt-0.5">
            Every host with a compiled-in bridge adapter, alphabetical. Each column names the
            registry field it reads; the Entries column is the catalog entries compatible with
            the host.
          </p>
        </div>
      </div>

      <div className={`${grid} t-mono hidden border-b border-ink pb-2 text-[10px] text-ink-3 md:grid`}>
        {HOST_COLUMNS.map((column, i) => (
          <span key={column.label} className={i === 5 ? "text-right" : undefined}>
            <span className="t-cond block text-[11px] font-semibold text-ink">{column.label}</span>
            <span className="block text-[9.5px]">{column.source}</span>
          </span>
        ))}
      </div>

      <ul>
        {rows.map((row) => {
          const docs = row.docsUrl
            ? { href: row.docsUrl, label: docsLabel(row.docsUrl) }
            : row.adapterFile
              ? {
                  href: `${REPO_URL}/blob/main/${row.adapterFile}`,
                  label: row.adapterFile.split("/").pop() ?? row.adapterFile,
                }
              : null;
          const projectWhy =
            "web/data/hosts.json declares no project-scope config for this host (projectScope is absent; host.SupportsProjectScope is false). One file serves the whole machine.";
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
                  className="hidden text-[11px] text-ink-2 md:block"
                  title={
                    row.generic
                      ? 'Data-driven adapter: a row of the verified target table, emitted into web/data/hosts.json with "generic": true.'
                      : `Hand-written adapter with its own merge logic — ${row.adapterFile} (web/data/hosts.json marks it "generic": false).`
                  }
                >
                  {row.generic ? "data-driven" : "hand-written"}
                </span>

                <span className="hidden min-w-0 md:block" title={row.userPath ? `${row.userPath} — web/data/hosts.json (${row.format.toUpperCase()})` : undefined}>
                  {row.userPath ? (
                    <>
                      <code className="t-mono block truncate text-[11px] text-ink-2">{row.userPath}</code>
                      <span className="t-mono block text-[10px] text-ink-3">{row.format.toUpperCase()}</span>
                    </>
                  ) : (
                    <span className="absent" title="web/data/hosts.json carries no config path for this host.">
                      —
                    </span>
                  )}
                </span>

                <span className="hidden min-w-0 md:block">
                  {row.projectPath ? (
                    <code
                      className="t-mono block truncate text-[11px] text-ink-2"
                      title={`${row.projectPath} — web/data/hosts.json (projectScope: true)`}
                    >
                      {row.projectPath}
                    </code>
                  ) : (
                    <span className="absent" title={projectWhy}>
                      —
                    </span>
                  )}
                </span>

                <span className="hidden min-w-0 md:block">
                  {row.skillName ? (
                    <span
                      className="t-cond block truncate text-[12px] text-ink-2"
                      title={`Skill target “${row.skillName}” — web/data/skill-targets.json, generated from internal/skills/agents.go.`}
                    >
                      {row.skillName}
                    </span>
                  ) : (
                    <span
                      className="absent"
                      title="web/data/skill-targets.json carries no target for this host id, so no skill installs here."
                    >
                      —
                    </span>
                  )}
                </span>

                <span
                  className="t-mono t-tabular text-right text-[11px] text-ink-2"
                  title={
                    row.total === null
                      ? "No row in the current snapshot names this host."
                      : `${formatCount(row.total)} = ${formatCount(row.mcp ?? 0)} MCP + ${formatCount(
                          row.skill ?? 0
                        )} skills + ${formatCount(row.plugin ?? 0)} publisher-declared plugins. Kind totals from web/data/release.json; plugin counts from the publishers' own lists.`
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
                      title={
                        row.docsUrl
                          ? `${row.docsUrl} — the vendor page this adapter row was verified against (docsUrl in web/data/hosts.json).`
                          : `${row.adapterFile} — the hand-written adapter itself; AGENTS.md §1 lists it.`
                      }
                    >
                      {docs.label}
                    </a>
                  ) : (
                    <span className="absent" title="No vendor documentation URL and no adapter source for this host.">
                      —
                    </span>
                  )}
                </span>

                {/* Below the board's breakpoint the same facts travel as one
                    wrapping line under the name, because a 7-column grid at
                    phone width is a grid a phone reader does not read. */}
                <span className="t-mono col-span-2 flex flex-wrap gap-x-1.5 text-[10px] text-ink-3 md:hidden">
                  <span>{row.generic ? "data-driven" : "hand-written"}</span>
                  <span aria-hidden="true">·</span>
                  <span>{row.format.toUpperCase()}</span>
                  <span aria-hidden="true">·</span>
                  <span className="break-all">{row.userPath}</span>
                  {row.projectPath && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="break-all">project {row.projectPath}</span>
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
            note="Using the category string each source publishes."
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

        <p className="mt-9 max-w-prose border-t border-rule pt-5 text-[12px] leading-relaxed text-ink-3">
          Each capability links back to the upstream page it was read from.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
