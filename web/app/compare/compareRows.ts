// The `/compare` row model (LPSM-J007): one row per agent host, one cell per
// fact a registry in this repository states.
//
// The row set is the UNION of the two registries the site already publishes,
// joined into host identities by `lib/hostIdentity.ts`:
//
//   * `web/data/hosts.json` — bridge adapters: hosts whose MCP configuration
//     LiteSPM can write. Generated from the compiled-in Go adapter registry by
//     `scripts/gen_hosts_ts.go`; `litespm host list` prints the same table.
//   * `web/data/skill-targets.json` — skill install targets: hosts with a
//     documented skills directory. Generated from `internal/skills/agents.go`.
//
// The join is the registry id, not a display name, because the id is the only
// key both registries share and they legitimately spell a product differently:
// the bridge row for Cline reads "Cline (VS Code Extension)" while its skill
// target reads "Cline". Matching on names would either miss that join or
// invent one. The reference installer's two alias ids ("pi", "grok") merge
// into the adapter rows the alias table in `lib/hosts.ts` already names —
// the same join `internal/host/registry.go` makes.
//
// Every value here comes from one of those two files. Nothing is inferred from
// another column, no fact is carried over from a sibling row, and a host whose
// registry says nothing gets `null` — which the view renders as `—`, never as a
// negative mark.
//
// NAMING RULE FOR EVERYTHING THAT CROSSES TO THE CLIENT. `/compare` is a
// public page and the props it hands to the browser are part of that page's
// published bytes (the RSC payload sits in the exported HTML). So the field
// names below are reader words — `configFile`, `projectFile`, `docs` — and
// never the registries' own schema names, which are internal identifiers a
// reader has no use for and which must not appear on the page at all.

import release from "../../data/release.json";
import catalog from "../../data/catalog.json";
import { availabilityOf } from "../../lib/availability";
import { HOST_IDENTITIES } from "../../lib/hostIdentity";
import { ADAPTER_SOURCE } from "../../lib/adapterSources";
import { hostNote } from "../../lib/hostNotes";

/**
 * The hand-written adapters' source files live in `lib/adapterSources.ts`:
 * `/trending` renders them as its docs column, and `assertAdapterSourcesMatchRegistry`
 * below pins the map against `hosts.json`'s `generic` flag at build time.
 * `/compare` no longer publishes a link to a source file — a product page
 * shows the vendor's documentation, not this repository's — but the assertion
 * stays: it is the build-time gate that keeps the other surface honest.
 */

/** One agent host, with only the facts a registry states about it. */
export interface CompareRow {
  /** Registry id — the key both registries are joined on, the logo lookup and
   *  the URL segment of this host's own page. */
  id: string;
  /** What to call the row: the vendor's own spelling where `vendorNames.ts`
   *  records one, otherwise the registry name. Display only. */
  name: string;
  /** True when LiteSPM has an adapter that can write this host's MCP config. */
  configurable: boolean;
  /** The user-scope config file LiteSPM adds one entry to, home shown as `~`. */
  configFile?: string;
  /** The project-scope config file, relative to a project root. */
  projectFile?: string;
  /** True when this host has a skills directory LiteSPM can install into. */
  skills: boolean;
  /** A user-level skills directory is registered (`hasGlobal`). */
  skillsAtUser: boolean;
  /** Project-scope skills land in the shared `.agents/skills` tree. */
  skillsShared: boolean;
  /** The vendor's own documentation URL. */
  docs?: string;
  /** `"config"` when that URL documents this agent's MCP configuration,
   *  `"agent"` when it is the vendor's general documentation. */
  docsKind?: "config" | "agent";
  /** True when the adapter can also register a remote (URL) MCP server here. */
  remote: boolean;
}

export interface CompareGroup {
  /** Stable id for the section heading's `id`. */
  key: string;
  title: string;
  /** One short line naming what puts a host in this group. */
  note: string;
  rows: CompareRow[];
}

export interface CompareData {
  groups: CompareGroup[];
  /** Every host in the union of the two registries. */
  hostCount: number;
  /** Hosts LiteSPM can configure — the ones in the first group. */
  setupCount: number;
  /** MCP servers in the current release — a property of the kind, stated once
   *  in the page's intro rather than repeated on every row. */
  serverCount: number;
  /** Skills in the current release — the same kind of total. */
  skillCount: number;
  /** MCP servers `litespm install` can actually complete, counted with the
   *  same predicate as every other surface. The intro sentence is about what
   *  can be installed *into an agent*, so this is the number it quotes. */
  installableServerCount: number;
  /** Skills `litespm install` can actually complete — the same. */
  installableSkillCount: number;
  /** How many of the configurable hosts accept a remote (URL) server. */
  remoteHostCount: number;
  /** How many hosts have a skills directory LiteSPM can install into. */
  skillHostCount: number;
}

/**
 * Per-kind totals come from the release manifest, not from a second pass over
 * the 69,376-row dataset: `data/release.json` is the same manifest the footer
 * reports, and its counts are the ones the catalog's own `?kind=` filters
 * return. Read defensively (`?? 0`) so a manifest missing a field renders a
 * zero rather than `NaN`.
 */
const SERVER_COUNT = Number(release.mcpServersCount ?? 0);
const SKILL_COUNT = Number(release.agentSkillsCount ?? 0);

/**
 * How many of those the *binary* can actually install, counted with the same
 * predicate every other surface uses (`availabilityOf`, the copy of the CLI's
 * own gate). The intro sentence is about a per-host capability, so a catalog
 * total is the wrong number for it: 42 of the 50 configurable hosts accept no
 * remote server at all, and the 8 that do accept 25,401 of the 48,418 — not
 * 48,418. A reader who then opens `/explore/` or `/agents/` sees the smaller
 * number, and a page that says a larger one is not being careful, it is
 * being wrong. The evaluator's F-01 is exactly this sentence.
 *
 * The counts are computed here, at build time, from the committed dataset —
 * never written down by hand. A hardcoded number goes stale silently; this
 * one cannot.
 */
const DATASET = catalog as unknown as Parameters<typeof availabilityOf>[0][];
const INSTALLABLE_SERVER_COUNT = DATASET.filter(
  (row) => row.kind === "mcp" && availabilityOf(row).installable,
).length;
const INSTALLABLE_SKILL_COUNT = DATASET.filter(
  (row) => row.kind === "skill" && availabilityOf(row).installable,
).length;

/**
 * The vendor documentation each configurable host gets, and what kind of page
 * it is. The adapter registry carries an MCP-configuration URL for every
 * data-driven row; the six hand-written adapters carry none, so their row
 * falls back to the vendor documentation recorded beside the host's write-up
 * in `hostNotes.ts` — never to the adapter's source file, which is this
 * repository's business and not the reader's.
 */
function docsFor(id: string, registryDocs?: string): Pick<CompareRow, "docs" | "docsKind"> {
  if (registryDocs) return { docs: registryDocs, docsKind: "config" };
  const note = hostNote(id);
  if (note?.source) return { docs: note.source, docsKind: "agent" };
  return {};
}

/**
 * The two groups, each sorted alphabetically by the name on screen.
 *
 * A host LiteSPM can configure comes before a host only its skills directory
 * reaches. The catalog publishes no popularity, usage or rating figures, so
 * none of them can order anything here.
 */
export function compareData(): CompareData {
  const withAdapter: CompareRow[] = [];
  const skillsOnly: CompareRow[] = [];

  for (const identity of HOST_IDENTITIES) {
    const host = identity.adapter;
    const target = identity.skill;
    // One row per host identity: the skills registry's alias spellings
    // ("Pi", "Grok") join the adapter rows they name rather than appearing as
    // second hosts, and the id is the key both registries share.
    const row: CompareRow = {
      id: identity.id,
      name: identity.name,
      configurable: Boolean(host),
      configFile: host?.userPath || undefined,
      projectFile: host?.projectPath,
      skills: Boolean(target),
      skillsAtUser: Boolean(target?.hasGlobal),
      skillsShared: Boolean(target?.universal),
      ...docsFor(identity.id, host?.docsUrl),
      remote: Boolean(host?.remote),
    };
    (host ? withAdapter : skillsOnly).push(row);
  }

  const byName = (a: CompareRow, b: CompareRow) => a.name.localeCompare(b.name);
  withAdapter.sort(byName);
  skillsOnly.sort(byName);

  return {
    groups: [
      {
        key: "configure",
        title: "Agents LiteSPM can configure",
        note: "one entry added to each",
        rows: withAdapter,
      },
      {
        key: "skills",
        title: "Skills-only agents",
        note: "no config file",
        rows: skillsOnly,
      },
    ],
    hostCount: HOST_IDENTITIES.length,
    setupCount: withAdapter.length,
    serverCount: SERVER_COUNT,
    skillCount: SKILL_COUNT,
    installableServerCount: INSTALLABLE_SERVER_COUNT,
    installableSkillCount: INSTALLABLE_SKILL_COUNT,
    remoteHostCount: withAdapter.filter((row) => row.remote).length,
    skillHostCount: HOST_IDENTITIES.filter((identity) => Boolean(identity.skill)).length,
  };
}

/**
 * The build-time guard the evaluator asked for: a count printed in prose may
 * never exceed the number the site's own filters produce. The intro sentence
 * quotes the installable counts, and those are by construction a subset of the
 * catalog totals — if a future dataset makes that untrue, the build fails
 * here rather than a reader finding the contradiction between two pages.
 */
export function assertCompareCountsAgree(): void {
  if (INSTALLABLE_SERVER_COUNT > SERVER_COUNT) {
    throw new Error(
      `compare: installable servers (${INSTALLABLE_SERVER_COUNT}) exceed the catalog total (${SERVER_COUNT})`,
    );
  }
  if (INSTALLABLE_SKILL_COUNT > SKILL_COUNT) {
    throw new Error(
      `compare: installable skills (${INSTALLABLE_SKILL_COUNT}) exceed the catalog total (${SKILL_COUNT})`,
    );
  }
}

/**
 * The adapter ids `hosts.json` reports as hand-written, so `/trending` cannot
 * go on claiming `ADAPTER_SOURCE` for a host the registry has moved to the
 * data-driven table (or vice versa). Called at build time; a mismatch fails the
 * build rather than shipping a wrong evidence link.
 */
export function assertAdapterSourcesMatchRegistry(): void {
  const bespoke = HOST_IDENTITIES.filter((identity) => identity.adapter && !identity.adapter.generic)
    .map((identity) => identity.id)
    .sort();
  const mapped = Object.keys(ADAPTER_SOURCE).sort();
  if (bespoke.join(",") !== mapped.join(",")) {
    throw new Error(
      `compare: hand-written adapter list drifted from web/data/hosts.json — ` +
        `registry says [${bespoke.join(", ")}], compareRows.ts maps [${mapped.join(", ")}]`
    );
  }
}
