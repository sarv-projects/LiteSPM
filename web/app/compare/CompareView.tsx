"use client";

import { Fragment } from "react";
import Link from "next/link";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { AgentLogo } from "../../components/AgentLogo";
import { formatCount } from "../../lib/format";
import type { CompareData, CompareGroup, CompareRow } from "./compareRows";

/**
 * The `/compare` page (LPSM-J007): which agents LiteSPM can set up, and what
 * it changes on the reader's machine when it does.
 *
 * Rows are agent hosts; the facts are the ones a reader deciding "should
 * LiteSPM touch this agent?" needs — the config file it adds one entry to,
 * whether a project-scope file exists, where skills install, and the vendor's
 * own documentation. The row model is derived on the **server**
 * (`compareRows.ts`) and crossed as props: what hydrates here is a static table
 * and a static list, with links as the only interactivity — so the page is
 * complete in the export's HTML and still works with JavaScript off.
 *
 * Two presentations of one row model: a `table` from `lg` up (the width at
 * which five columns still fit), and one card per host below it, because a
 * matrix that can only be read by scrolling sideways is a matrix a phone
 * reader does not read. Both call the same cell renderers, so the two cannot
 * disagree.
 *
 * The honesty rule this page is built on: no cell without a source, and no
 * cell that states a value the agent's own documentation does not. A fact no
 * registry states renders `—` — never a cross, which would assert a negative
 * we have not established — and the reason travels with the cell in plain
 * words: beside it where there is no hover, in the tooltip where there is one.
 *
 * Nothing on this page names a file, field or symbol from this repository.
 * The page is read by people deciding whether to run a command, not by
 * reviewers reading the implementation.
 */
export interface CompareViewProps {
  data: CompareData;
}

/**
 * Which of the two presentations is asking for a cell. The facts are identical;
 * only the classes differ, so a cell cannot mean one thing in the table and
 * another in a card.
 */
type Layout = "table" | "card";

/**
 * Link classes per presentation. A card is the layout a touch reader gets
 * below `lg`, so its links carry the site's touch row — `min-h-[44px]`, the
 * same measure `AgentsView` and `CapabilityCard` use — and drop back to the
 * compact pointer row at `md`, exactly as they do. A table link stays inline:
 * it is the dense pointer presentation.
 */
function linkClass(layout: Layout, extra = ""): string {
  const base = layout === "card" ? "flex min-h-[44px] items-center md:min-h-0" : "block";
  return extra ? `${base} ${extra}` : base;
}

/**
 * The shared "nothing is recorded here" cell. `—`, never a cross.
 *
 * `why` is the full sentence a pointer reader gets on hover. `short` is the
 * same fact in two or three words, laid under the `—` below `lg` only: a touch
 * reader has no hover, and a bare `—` with its reason in a tooltip is a reason
 * that reader never sees. Both are plain words — no file, no field name.
 */
function Unknown({ why, short }: { why: string; short: string }) {
  return (
    <span className="inline-flex flex-col" title={why}>
      <span className="absent">—</span>
      <span className="t-mono text-[10px] leading-tight text-ink-3 lg:hidden">{short}</span>
    </span>
  );
}

/** "https://zed.dev/docs/ai/mcp" → "zed.dev": a link that reads as one. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * A path with a line-break opportunity after every `/`, so a narrow column
 * wraps it at directory boundaries (`~/.aider-desk/` then `mcp-servers.json`)
 * instead of splitting a file name mid-word. `overflow-wrap: anywhere` on the
 * element still catches a segment longer than the column.
 */
function pathParts(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "/") {
      parts.push(value.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < value.length) parts.push(value.slice(start));
  return parts;
}

function Path({ value, className }: { value: string; className: string }) {
  const parts = pathParts(value);
  return (
    <code className={className}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </code>
  );
}

/* ---------------------------------------------------------------------- *
 * One cell per fact. Each returns the cell's content, so the table and the
 * card layout render the same thing rather than two similar things.
 * ---------------------------------------------------------------------- */

/** The host's mark, its name, and the link to its own page. */
function identityCell(row: CompareRow, layout: Layout) {
  return (
    <span className="flex min-w-0 items-start gap-2">
      <AgentLogo id={row.id} name={row.name} size={20} className="mt-0.5" />
      <Link
        href={`/agents/${row.id}/`}
        prefetch={false}
        title={`Open ${row.name}: the config file and the entry LiteSPM adds.`}
        className={linkClass(
          layout,
          "t-cond min-w-0 text-[14px] font-medium text-ink transition-colors duration-hover hover:text-accent-text"
        )}
      >
        <span className="block min-w-0 truncate">{row.name}</span>
      </Link>
    </span>
  );
}

/** The one file LiteSPM changes — the page's single most useful fact. */
function configCell(row: CompareRow) {
  if (!row.configFile) {
    return (
      <Unknown
        why="No config file is recorded for this agent, so there is nothing here for LiteSPM to write."
        short="no config file"
      />
    );
  }
  return (
    <Path
      value={row.configFile}
      className="t-mono block break-words text-[11.5px] leading-relaxed text-ink"
    />
  );
}

/** Where a project-scope setup writes, when the agent documents one. */
function projectCell(row: CompareRow) {
  if (!row.projectFile) {
    return (
      <Unknown
        why="No project-scope config file is recorded for this agent, so LiteSPM sets it up once for the whole machine."
        short="no project file"
      />
    );
  }
  return (
    <Path
      value={row.projectFile}
      className="t-mono block break-words text-[11.5px] leading-relaxed text-ink-2"
    />
  );
}

/**
 * Where skills install for this agent. The scope comes straight from the
 * skills registry: a user-level directory exists or it does not, and project
 * skills either land in the shared `.agents/skills` tree several agents read
 * or in the agent's own folder.
 */
function skillsCell(row: CompareRow) {
  if (!row.skills) {
    return (
      <Unknown
        why="No skills directory is recorded for this agent, so no skill installs here."
        short="no skills directory"
      />
    );
  }
  return (
    <span className="block text-[12px] leading-relaxed text-ink-2">
      <span
        className="block"
        title={
          row.skillsAtUser
            ? "Skills install at user level and inside each project."
            : "Skills install inside each project only — no user-level skills directory is recorded for this agent."
        }
      >
        {row.skillsAtUser ? "user & project" : "project only"}
      </span>
      {row.skillsShared && (
        <span
          className="block text-[11px] text-ink-3"
          title="Project-scope skills install into the shared .agents/skills folder that several agents read."
        >
          shared .agents/skills
        </span>
      )}
    </span>
  );
}

/** The vendor's own documentation, where one is recorded. */
function docsCell(row: CompareRow, layout: Layout) {
  if (!row.docs) {
    return (
      <Unknown
        why="No vendor documentation is recorded for this agent, so there is nowhere to point the reader."
        short="no docs recorded"
      />
    );
  }
  return (
    <a
      href={row.docs}
      target="_blank"
      rel="noopener noreferrer"
      title={
        row.docsKind === "config"
          ? `The vendor's documentation for ${row.name}'s MCP configuration.`
          : `The vendor's documentation for ${row.name}.`
      }
      className={`text-[12px] break-all ${linkClass(layout, "link")}`}
    >
      {hostLabel(row.docs)}
    </a>
  );
}

/* ---------------------------------------------------------------------- */

/** "a, b, c and d" — a name list a reader would write. */
function nameList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function ConfigureSection({ group }: { group: CompareGroup }) {
  const remoteNames = group.rows.filter((row) => row.remote).map((row) => row.name);

  return (
    <section className="mt-9" aria-labelledby="compare-configure">
      <div className="section-head">
        <h2 id="compare-configure">{group.title}</h2>
        <span className="section-note t-mono">
          {formatCount(group.rows.length)} · {group.note}
        </span>
      </div>

      <table className="mt-1 hidden w-full table-fixed border-collapse lg:table">
        <caption className="sr-only">
          Agents LiteSPM can configure: the config file it adds one entry to, the project-scope
          file where the agent documents one, where skills install, and the vendor&rsquo;s
          documentation.
        </caption>
        <thead>
          <tr className="border-b border-ink">
            {(
              [
                ["Agent", "w-[20%] pr-3"],
                ["Config file", "w-[27%] pr-3"],
                ["Project scope", "w-[18%] pr-3"],
                ["Skills", "w-[19%] pr-3"],
                ["Docs", "w-[16%]"],
              ] as const
            ).map(([label, width]) => (
              <th
                key={label}
                scope="col"
                className={`${width} pb-2 text-left text-[11.5px] font-semibold text-ink`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-rule align-top transition-colors duration-hover hover:bg-hover"
            >
              <th scope="row" className="py-3 pr-3 text-left font-normal">
                {identityCell(row, "table")}
              </th>
              <td className="py-3 pr-3">{configCell(row)}</td>
              <td className="py-3 pr-3">{projectCell(row)}</td>
              <td className="py-3 pr-3">{skillsCell(row)}</td>
              <td className="py-3">{docsCell(row, "table")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Below the table's breakpoint the same facts become a card per host,
          rendered from the same cells. The config file — the one fact this
          page exists to state — keeps its own full-width line here: a 108px
          label column would wrap the paths a phone reader came for. */}
      <ul className="mt-4 grid gap-3 lg:hidden">
        {group.rows.map((row) => (
          <li key={row.id} className="rounded-card border border-rule bg-surface p-3.5">
            {identityCell(row, "card")}
            <p className="kicker mt-3">Config file</p>
            {configCell(row)}
            <dl className="spec-list mt-1.5">
              <div>
                <dt>Project scope</dt>
                <dd>{projectCell(row)}</dd>
              </div>
              <div>
                <dt>Skills</dt>
                <dd>{skillsCell(row)}</dd>
              </div>
              <div>
                <dt>Docs</dt>
                <dd>{docsCell(row, "card")}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      {remoteNames.length > 0 && (
        <p className="mt-4 max-w-prose text-[12px] leading-relaxed text-ink-3">
          LiteSPM writes a local entry for every agent here. {remoteNames.length} of them can also
          register a remote MCP server as a URL: {nameList(remoteNames)}.
        </p>
      )}
    </section>
  );
}

function SkillsSection({ group }: { group: CompareGroup }) {
  return (
    <section className="mt-9" aria-labelledby="compare-skills">
      <div className="section-head">
        <h2 id="compare-skills">{group.title}</h2>
        <span className="section-note t-mono">
          {formatCount(group.rows.length)} · {group.note}
        </span>
      </div>

      <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
        LiteSPM cannot edit these agents&rsquo; MCP configuration, but it can install skills into
        them.
      </p>

      <ul className="mt-2 grid gap-x-10 sm:grid-cols-2">
        {group.rows.map((row) => (
          <li
            key={row.id}
            className="flex min-w-0 items-center justify-between gap-3 border-b border-rule py-2.5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <AgentLogo id={row.id} name={row.name} size={18} />
              <span className="t-cond min-w-0 truncate text-[13.5px] font-medium text-ink">
                {row.name}
              </span>
            </span>
            <span className="shrink-0 text-right text-[11.5px] leading-tight text-ink-3">
              {row.skillsAtUser ? "user & project" : "project only"}
              {row.skillsShared && (
                <span className="block text-[10.5px]">shared .agents/skills</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CompareView({ data }: CompareViewProps) {
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ ["--stack-top" as string]: "var(--site-header-height)" }}
    >
      <Header />

      <main id="main" className="shell flex-1 pb-16 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Compare agent hosts</h1>
          <p className="t-mono text-[11px] text-ink-3">
            {formatCount(data.hostCount)} hosts · {formatCount(data.setupCount)} LiteSPM can
            configure
          </p>
        </div>

        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
          LiteSPM sets an agent up by adding one entry to a config file the agent already reads; the
          rest of the file is left as it is. That one entry is why every MCP server in the catalog (
          {formatCount(data.serverCount)}) can be installed into any agent in the first list, and
          every skill ({formatCount(data.skillCount)}) into any agent on this page.
        </p>

        {data.groups.map((group) =>
          group.key === "configure" ? (
            <ConfigureSection key={group.key} group={group} />
          ) : (
            <SkillsSection key={group.key} group={group} />
          )
        )}

        <p className="mt-8 max-w-prose text-[12px] leading-relaxed text-ink-3">
          A dash means no value is recorded for that agent.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
