"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { AgentLogo } from "../../components/AgentLogo";
import { formatCount } from "../../lib/format";
import { REPO_URL } from "../../lib/site";
import type { CompareData, CompareRow } from "./compareRows";

/**
 * The `/compare` matrix (LPSM-J007).
 *
 * Rows are agent hosts, columns are the capabilities a registry in this
 * repository actually holds. The row model is derived on the **server**
 * (`compareRows.ts`) and crossed as props: what hydrates here is a static table
 * and a static card list, with links as the only interactivity — so the page is
 * complete in the export's HTML and still works with JavaScript off.
 *
 * Two presentations of one row model: a `table` from `lg` up (the width at
 * which eight columns still fit), and one card per host below it, because a
 * matrix that can only be read by scrolling sideways is a matrix a phone reader
 * does not read. Both call the same cell renderers, so the two cannot disagree.
 *
 * The honesty rule this page is built on (TODO LPSM-J007): no cell without a
 * source. Every value carries a `title` naming the registry file or field it
 * came from, every cell that has a link says where the link goes, and a cell no
 * registry states renders `—` — never a cross, which would assert a negative we
 * have not established.
 */
export interface CompareViewProps {
  data: CompareData;
}

/** The eight columns, their source line, and their share of the table width. */
const COLUMNS: Array<{ label: string; source: string; width: string }> = [
  { label: "Agent", source: "registry id", width: "w-[17%]" },
  { label: "Adapter", source: "generic", width: "w-[10%]" },
  { label: "Skills", source: "skill targets", width: "w-[11%]" },
  { label: "MCP config file", source: "userPath · keyPath", width: "w-[20%]" },
  { label: "Project config", source: "projectScope", width: "w-[13%]" },
  { label: "Remote MCP", source: "remote", width: "w-[8%]" },
  { label: "Catalog entries", source: "hostCompatibility", width: "w-[10%]" },
  { label: "Evidence", source: "docsUrl · source file", width: "w-[11%]" },
];

const REPO_BLOB = `${REPO_URL}/blob/main`;

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
 *
 * This is a hit-area change, not a typography one: the text inside still reads
 * at its own size, and the extra height is the row the link owns.
 */
function linkClass(layout: Layout, extra = ""): string {
  const base = layout === "card" ? "flex min-h-[44px] items-center md:min-h-0" : "block";
  return extra ? `${base} ${extra}` : base;
}

/**
 * The shared "no registry states this" cell. `—`, never a cross.
 *
 * `why` is the full sentence a pointer reader gets on hover — which registry
 * was checked, which field, and why it is empty. `short` is the same fact in
 * two or three words, laid under the `—` below `lg` only: a touch reader has no
 * hover, and a bare `—` with its reason in a tooltip is a reason that reader
 * never sees. The label is a fact about the row ("no config adapter"), not a
 * judgement about the host.
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

/** The second line under a config path or a name: machine-readable, quiet. */
function Sub({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="t-mono block truncate text-[10.5px] text-ink-3" title={title}>
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------- *
 * One cell per fact. Each returns the cell's content, so the table and the
 * card layout render the same thing rather than two similar things.
 * ---------------------------------------------------------------------- */

function identityCell(row: CompareRow, layout: Layout) {
  const registry =
    row.hasAdapter && row.registryName && row.registryName !== row.name
      ? ` — listed in the adapter registry as “${row.registryName}”`
      : "";
  const href = row.hasAdapter
    ? `/agents/${row.id}/`
    : `/explore/?host=${encodeURIComponent(row.name)}`;
  return (
    <span className="flex min-w-0 items-start gap-2">
      <AgentLogo id={row.id} name={row.name} size={20} className="mt-0.5" />
      <span className="min-w-0">
        <Link
          href={href}
          prefetch={false}
          title={
            row.hasAdapter
              ? `Registry id ${row.id}${registry}. Opens this host's page: config file and bridge entry.`
              : `Registry id ${row.id}${registry}. Opens Explore filtered to the entries declared compatible with it.`
          }
          className={linkClass(
            layout,
            "t-cond min-w-0 text-[14px] font-medium text-ink transition-colors duration-hover hover:text-accent-text"
          )}
        >
          <span className="block min-w-0 truncate">{row.name}</span>
        </Link>
        <Sub>{row.id}</Sub>
      </span>
    </span>
  );
}

function adapterCell(row: CompareRow) {
  if (!row.hasAdapter) {
    return (
      <Unknown
        why={
          "No bridge adapter in web/data/hosts.json for this id — LiteSPM has no config " +
          "adapter for this host, so its MCP column is empty too."
        }
        short="no config adapter"
      />
    );
  }
  if (row.adapterFile) {
    return (
      <span
        className="text-[12px] text-ink-2"
        title={`Hand-written adapter with its own merge logic and tests — ${row.adapterFile}. The registry marks it "generic": false (web/data/hosts.json).`}
      >
        hand-written
      </span>
    );
  }
  return (
    <span
      className="text-[12px] text-ink-2"
      title={
        'Data-driven adapter: a row of the verified target table, emitted into web/data/hosts.json with "generic": true.'
      }
    >
      data-driven
    </span>
  );
}

function skillsCell(row: CompareRow) {
  if (!row.skills) {
    return (
      <Unknown
        why={
          "No target in web/data/skill-targets.json for this id — this host has no skills " +
          "directory LiteSPM can write, so no skill installs here."
        }
        short="no skills target"
      />
    );
  }
  const scope = row.skillsGlobal ? "user & project" : "project only";
  const title = row.skillsGlobal
    ? `Skill target “${row.skillName}”: user-level and project-level skills directories are both registered (hasGlobal: true in web/data/skill-targets.json, generated from internal/skills/agents.go).`
    : `Skill target “${row.skillName}”: project scope only — internal/skills/agents.go records no user-level skills directory for it (hasGlobal: false).`;
  return (
    <span className="block text-[12px] text-ink-2" title={title}>
      <span className="block">{scope}</span>
      {row.skillsUniversal && (
        <Sub title="Project-scope skills install into the shared .agents/skills tree several agents read (universal: true in web/data/skill-targets.json).">
          universal
        </Sub>
      )}
    </span>
  );
}

function configCell(row: CompareRow) {
  if (!row.userPath) {
    return (
      <Unknown
        why={
          "No bridge adapter in web/data/hosts.json for this id — no MCP config file is " +
          "registered, so there is none to compare."
        }
        short="no MCP config file"
      />
    );
  }
  const shape = row.shape ? `; one entry is written as ${row.shape}` : "";
  return (
    <span className="block min-w-0" title={`${row.userPath} — web/data/hosts.json (${row.format?.toUpperCase()}${shape})`}>
      {/* Below the table's breakpoint the path wraps in full rather than
          truncating: a touch reader has no hover for a `title`, and the path is
          the fact this column exists to state. */}
      <code className="t-mono block break-all text-[11.5px] text-ink lg:truncate">{row.userPath}</code>
      <Sub title={`Container: ${row.keyPath}. Format: ${row.format}. Emitted from the adapter registry.`}>
        {row.format?.toUpperCase()} · {row.keyPath}
      </Sub>
    </span>
  );
}

function projectCell(row: CompareRow) {
  if (!row.hasAdapter) {
    return (
      <Unknown
        why={
          "No bridge adapter in web/data/hosts.json for this id, so no project-scope MCP " +
          "config exists to write."
        }
        short="no config adapter"
      />
    );
  }
  if (!row.projectPath) {
    return (
      <Unknown
        why={
          "The adapter's registry row declares no project-scope config (projectScope is " +
          "absent from web/data/hosts.json; host.SupportsProjectScope is false). One file " +
          "serves the whole machine."
        }
        short="no project file declared"
      />
    );
  }
  return (
    <span
      className="block min-w-0"
      title={
        `${row.projectPath} — emitted from host.ProjectConfigPathFor into ` +
        "web/data/hosts.json (projectScope: true). LiteSPM writes the entry here; " +
        "loading it stays the host's own policy."
      }
    >
      <code className="t-mono block break-all text-[11.5px] text-ink-2 lg:truncate">
        {row.projectPath}
      </code>
    </span>
  );
}

function remoteCell(row: CompareRow) {
  if (!row.hasAdapter) {
    return (
      <Unknown
        why={
          "No bridge adapter in web/data/hosts.json for this id — LiteSPM cannot register " +
          "any MCP entry, remote or local, for this host."
        }
        short="no config adapter"
      />
    );
  }
  if (!row.remote) {
    return (
      <Unknown
        why={
          "The adapter's registry row carries no verified remote (URL) entry spelling " +
          "(host.RemoteEntrySpecFor refuses it), so a remote install here is refused."
        }
        short="no remote entry spelling"
      />
    );
  }
  return (
    <span
      className="text-[12px] text-ink-2"
      title={
        "The adapter's registry row carries a verified remote (URL) entry spelling " +
        "(host.RemoteEntrySpecFor), so an https MCP server can be registered here."
      }
    >
      URL entry
    </span>
  );
}

/**
 * "hostCompatibility.mcp = “all-bridge-adapters”" when the release manifest
 * states a rule, and a plain pointer at the code path when it does not. The
 * value is the manifest's own string, so a change there changes the cell.
 */
function ruleEvidence(field: "mcp" | "skill", value: string): string {
  return value
    ? `${field === "mcp" ? "MCP" : "skill"} entries reach every ${
        field === "mcp" ? "bridge adapter" : "skill target"
      } — data/release.json states it: hostCompatibility.${field} = “${value}”.`
    : `web/lib/hosts.ts hostsFor applies the catalog's per-kind compatibility rule.`;
}

function entriesCell(row: CompareRow, layout: Layout, data: CompareData) {
  return (
    <span className="t-mono t-tabular block text-[11px] leading-relaxed">
      {row.mcpEntries !== null && row.registryName && (
        <Link
          href={`/explore/?kind=mcp&host=${encodeURIComponent(row.registryName)}`}
          prefetch={false}
          title={`All ${formatCount(row.mcpEntries)} MCP servers in the current release: ${ruleEvidence(
            "mcp",
            data.mcpRule
          )} A property of the kind, not a per-entry declaration. Opens Explore filtered to them.`}
          className={linkClass(layout, "link whitespace-nowrap")}
        >
          {formatCount(row.mcpEntries)} MCP
        </Link>
      )}
      {row.skillEntries !== null && row.skillName && (
        <Link
          href={`/explore/?kind=skill&host=${encodeURIComponent(row.skillName)}`}
          prefetch={false}
          title={`All ${formatCount(row.skillEntries)} skills in the current release: ${ruleEvidence(
            "skill",
            data.skillRule
          )} A property of the kind, not a per-entry declaration. Opens Explore filtered to them.`}
          className={linkClass(layout, "link whitespace-nowrap")}
        >
          {formatCount(row.skillEntries)} skills
        </Link>
      )}
    </span>
  );
}

function evidenceCell(row: CompareRow, layout: Layout) {
  if (row.adapterFile) {
    const file = row.adapterFile.split("/").pop() ?? row.adapterFile;
    return (
      <a
        href={`${REPO_BLOB}/${row.adapterFile}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`The hand-written adapter itself — ${row.adapterFile}. It cites the vendor documentation each path and key was verified against.`}
        className={`t-mono text-[11px] break-all ${linkClass(layout, "link")}`}
      >
        {file}
      </a>
    );
  }
  if (row.docsUrl) {
    return (
      <a
        href={row.docsUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`${row.docsUrl} — the source this adapter row was verified against (docsUrl in web/data/hosts.json).`}
        className={`text-[12px] break-all ${linkClass(layout, "link")}`}
      >
        {hostLabel(row.docsUrl)}
      </a>
    );
  }
  return (
    <Unknown
      why={
        "web/data/skill-targets.json carries no vendor documentation URL for this agent, so " +
        "the row's facts cite internal/skills/agents.go instead (the skills column)."
      }
      short="skills registry only"
    />
  );
}

/* ---------------------------------------------------------------------- */

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
            {formatCount(data.agentCount)} hosts · {formatCount(data.adapterCount)} with a config
            adapter
          </p>
        </div>

        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
          Sorted by capability: the hosts with a config adapter first, then the hosts with only a
          skills directory; alphabetical inside each group. The catalog publishes no popularity or
          usage figures, so none of them order this page.
        </p>

        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
          Every cell is a value a registry in this repository states, and each column names the
          field it reads. A cell reading <span className="absent">—</span> is one no registry states;
          the reason travels with it — beside the cell where there is no hover, in the tooltip where
          there is one.
        </p>

        {data.groups.map((group) => (
          <section key={group.key} className="mt-9" aria-labelledby={`compare-${group.key}`}>
            <div className="section-head">
              <h2 id={`compare-${group.key}`}>{group.title}</h2>
              <span className="section-note t-mono">
                {formatCount(group.rows.length)} · {group.note}
              </span>
            </div>

            <table className="mt-1 hidden w-full table-fixed border-collapse lg:table">
              <caption className="sr-only">
                {group.title}: {group.note}. One row per agent host, one column per registry fact.
                A cell reading “—” is a cell no registry states.
              </caption>
              <thead>
                <tr className="border-b border-ink">
                  {COLUMNS.map((column) => (
                    <th
                      key={column.label}
                      scope="col"
                      className={`${column.width} pb-2 pr-3 align-bottom text-left`}
                    >
                      <span className="block text-[11.5px] font-semibold text-ink">
                        {column.label}
                      </span>
                      <span className="t-mono block text-[9.5px] font-normal text-ink-3">
                        {column.source}
                      </span>
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
                    <td className="py-3 pr-3">{adapterCell(row)}</td>
                    <td className="py-3 pr-3">{skillsCell(row)}</td>
                    <td className="py-3 pr-3">{configCell(row)}</td>
                    <td className="py-3 pr-3">{projectCell(row)}</td>
                    <td className="py-3 pr-3">{remoteCell(row)}</td>
                    <td className="py-3 pr-3">{entriesCell(row, "table", data)}</td>
                    <td className="py-3 pr-3">{evidenceCell(row, "table")}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Below the table's breakpoint the same eight facts become a
                definition list per host. Rendered from the same cells. */}
            <ul className="mt-4 grid gap-3 lg:hidden">
              {group.rows.map((row) => (
                <li key={row.id} className="rounded-card border border-rule bg-surface p-3.5">
                  {identityCell(row, "card")}
                  <dl className="spec-list mt-2">
                    <div>
                      <dt>Adapter</dt>
                      <dd>{adapterCell(row)}</dd>
                    </div>
                    <div>
                      <dt>Skills</dt>
                      <dd>{skillsCell(row)}</dd>
                    </div>
                    <div>
                      <dt>MCP config</dt>
                      <dd>{configCell(row)}</dd>
                    </div>
                    <div>
                      <dt>Project config</dt>
                      <dd>{projectCell(row)}</dd>
                    </div>
                    <div>
                      <dt>Remote MCP</dt>
                      <dd>{remoteCell(row)}</dd>
                    </div>
                    <div>
                      <dt>Catalog entries</dt>
                      <dd>{entriesCell(row, "card", data)}</dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>{evidenceCell(row, "card")}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <details className="mt-10 border-t border-rule pt-4">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center text-[12.5px] font-medium text-ink-2 md:min-h-[36px]">
            Where these come from
          </summary>
          <dl className="mt-3 max-w-prose space-y-2 text-[12.5px] leading-relaxed text-ink-3">
            <div>
              <dt className="inline font-medium text-ink-2">Agent.</dt>{" "}
              <dd className="inline">
                <code className="t-mono text-[11.5px]">web/data/hosts.json</code> (bridge
                adapters, generated from the adapter registry by{" "}
                <code className="t-mono text-[11.5px]">scripts/gen_hosts_ts.go</code>;{" "}
                <code className="t-mono text-[11.5px]">litespm host list</code> prints the same
                table) and <code className="t-mono text-[11.5px]">web/data/skill-targets.json</code>{" "}
                (skill targets, from <code className="t-mono text-[11.5px]">internal/skills/agents.go</code>
                ).
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-ink-2">Adapter.</dt>{" "}
              <dd className="inline">
                The <code className="t-mono text-[11.5px]">generic</code> flag in{" "}
                <code className="t-mono text-[11.5px]">web/data/hosts.json</code>: false is an
                adapter written by hand, true is a row of the verified, data-driven target table.
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-ink-2">Skills.</dt>{" "}
              <dd className="inline">
                <code className="t-mono text-[11.5px]">hasGlobal</code> is whether a user-level
                skills directory is registered for the target;{" "}
                <code className="t-mono text-[11.5px]">universal</code> is whether project-scope
                skills land in the shared <code className="t-mono text-[11.5px]">.agents/skills</code>{" "}
                tree.
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-ink-2">MCP config file / Project config / Remote MCP.</dt>{" "}
              <dd className="inline">
                <code className="t-mono text-[11.5px]">userPath</code>,{" "}
                <code className="t-mono text-[11.5px]">format</code>,{" "}
                <code className="t-mono text-[11.5px]">keyPath</code>,{" "}
                <code className="t-mono text-[11.5px]">projectScope</code>,{" "}
                <code className="t-mono text-[11.5px]">projectPath</code> and{" "}
                <code className="t-mono text-[11.5px]">remote</code> in{" "}
                <code className="t-mono text-[11.5px]">web/data/hosts.json</code>, all emitted from
                the same registry the binary writes with.
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-ink-2">Catalog entries.</dt>{" "}
              <dd className="inline">
                The current release&rsquo;s per-kind totals. The rule is the catalog&rsquo;s own, and
                the release manifest states it rather than this page:{" "}
                <code className="t-mono text-[11.5px]">hostCompatibility</code> in{" "}
                <code className="t-mono text-[11.5px]">web/data/release.json</code> reads{" "}
                <code className="t-mono text-[11.5px]">mcp: &ldquo;{data.mcpRule}&rdquo;</code> and{" "}
                <code className="t-mono text-[11.5px]">skill: &ldquo;{data.skillRule}&rdquo;</code>,
                which <code className="t-mono text-[11.5px]">hostsFor</code> in{" "}
                <code className="t-mono text-[11.5px]">web/lib/hosts.ts</code> applies. So the number
                is a property of the kind of entry — not a per-row claim and not a test result.
                Plugins are not counted here: the same field marks them{" "}
                <code className="t-mono text-[11.5px]">publisher-declared</code>, a list each plugin
                publishes for itself, so there is no per-host plugin number to state.
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-ink-2">Evidence.</dt>{" "}
              <dd className="inline">
                The adapter row&rsquo;s <code className="t-mono text-[11.5px]">docsUrl</code> — the
                vendor page it was verified against — or, for the six hand-written adapters, the
                adapter&rsquo;s own source file.
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-ink-2">Paths.</dt>{" "}
              <dd className="inline">
                Each path is the registry&rsquo;s Unix <code className="t-mono text-[11.5px]">userPath</code>.
                Five hand-written adapters relocate it before writing —{" "}
                <code className="t-mono text-[11.5px]">$CODEX_HOME</code>,{" "}
                <code className="t-mono text-[11.5px]">$GROK_HOME</code>,{" "}
                <code className="t-mono text-[11.5px]">$PI_CODING_AGENT_DIR</code>,{" "}
                <code className="t-mono text-[11.5px]">$OPENCODE_CONFIG_DIR</code> and Cline&rsquo;s{" "}
                <code className="t-mono text-[11.5px]">$CLINE_MCP_SETTINGS_PATH</code>/
                <code className="t-mono text-[11.5px]">$CLINE_DATA_DIR</code> — and OpenCode prefers
                an existing <code className="t-mono text-[11.5px]">opencode.jsonc</code> over the{" "}
                <code className="t-mono text-[11.5px]">opencode.json</code> the registry names,
                which is the file a new install creates. The Evidence column links to the adapter
                stating each rule. Windows and macOS forms are not guessed: they appear on a
                package page for the hosts whose vendor documentation states one.
              </dd>
            </div>
          </dl>
        </details>
      </main>

      <SiteFooter />
    </div>
  );
}
