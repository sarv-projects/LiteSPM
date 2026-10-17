// The `/compare` row model (LPSM-J007): one row per agent host, one cell per
// fact a registry in this repository states.
//
// The row set is the UNION of the two registries the site already publishes,
// joined on registry id:
//
//   * `web/data/hosts.json` — bridge adapters: hosts whose MCP configuration
//     LiteSPM can write. Generated from the compiled-in Go adapter registry by
//     `scripts/gen_hosts_ts.go`; `litespm host list` prints the same table.
//   * `web/data/skill-targets.json` — skill install targets: hosts with a
//     documented skills directory. Generated from `internal/skills/agents.go`.
//
// Joined on `id`, not on a display name, because the id is the only key both
// registries share and they legitimately spell a product differently: the
// bridge row for Cline reads "Cline (VS Code Extension)" while its skill target
// reads "Cline". Matching on names would either miss that join or invent one.
//
// Every value here comes from one of those two files. Nothing is inferred from
// another column, no fact is carried over from a sibling row, and a host whose
// registry says nothing gets `null` — which the view renders as `—`, never as a
// negative mark.

import release from "../../data/release.json";
import { HOSTS, SKILL_TARGETS } from "../../lib/hosts";
import { ADAPTER_SOURCE } from "../../lib/adapterSources";
import { vendorName } from "../../lib/vendorNames";

/**
 * The hand-written adapters' source files live in `lib/adapterSources.ts`:
 * `/compare` renders them as evidence links and `/trending` as its docs column,
 * so the map is shared rather than kept twice. `assertAdapterSourcesMatchRegistry`
 * below still pins it against `hosts.json`'s `generic` flag at build time.
 */

/** One agent host, with only the facts a registry states about it. */
export interface CompareRow {
  /** Registry id — the key both registries are joined on. */
  id: string;
  /** What to call the row: the vendor's own spelling where `vendorNames.ts`
   *  records one, otherwise the registry name. Display only. */
  name: string;
  /** The bridge registry's own string. Carries the `/explore/?host=` key, so a
   *  link must use it rather than `name`. Absent for a skills-only row. */
  registryName?: string;
  /** The skill registry's own string. Carries the skill filter's key. */
  skillName?: string;
  /** True when `hosts.json` has an adapter for this id. */
  hasAdapter: boolean;
  /** The hand-written adapter file, when this id has one. */
  adapterFile?: string;
  /** Skills: whether the skill registry has a target for this id, and in which
   *  scopes it installs, straight from `skill-targets.json`. */
  skills: boolean;
  /** A user-level (global) skills directory exists (`hasGlobal`). */
  skillsGlobal: boolean;
  /** Project-scope skills land in the shared `.agents/skills` tree. */
  skillsUniversal: boolean;
  /** Config format the adapter writes. */
  format?: "json" | "toml";
  /** The container holding server entries, e.g. `mcpServers`, `mcp.servers`. */
  keyPath?: string;
  /** Where one server entry is written: `object`, `local-array`, …. */
  shape?: string;
  /** The user-scope config path, home directory shown as `~`. */
  userPath?: string;
  /** The project-scope config path, relative to the project root. */
  projectPath?: string;
  /** A verified remote (URL) entry spelling exists for this host. */
  remote: boolean;
  /** The vendor documentation the adapter row was verified against. */
  docsUrl?: string;
  /** Catalog totals — see `release` below. `null` when the row's registry does
   *  not take that kind, which is a different statement from zero. */
  mcpEntries: number | null;
  skillEntries: number | null;
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
  agentCount: number;
  /** Hosts with a bridge adapter — the ones LiteSPM can configure directly. */
  adapterCount: number;
  /** Per-kind totals the catalog links filter to. */
  mcpTotal: number;
  skillTotal: number;
  /** `hostCompatibility.mcp` / `.skill` from `data/release.json`, verbatim. */
  mcpRule: string;
  skillRule: string;
}

/**
 * Per-kind totals come from the release manifest, not from a second pass over
 * the 69,376-row dataset: `data/release.json` is the same manifest the footer
 * and the package pages report, and its counts are the ones the catalog's own
 * `?kind=` filters return. Read defensively (`?? 0`) so a manifest missing a
 * field renders a zero rather than `NaN`.
 *
 * Not exported: a top-level `const` initialized by a call reads as a component
 * to `scripts/check-orphan-components.mjs`, which then fails on an export
 * nothing imports. These two travel to the view inside `CompareData`.
 */
const MCP_TOTAL = Number(release.mcpServersCount ?? 0);
const SKILL_TOTAL = Number(release.agentSkillsCount ?? 0);

/**
 * The counting rule behind those totals, quoted from the release manifest's own
 * `hostCompatibility` field rather than restated here: the manifest says which
 * hosts a kind reaches (`mcp: "all-bridge-adapters"`, `skill:
 * "all-skill-targets"`, `plugin: "publisher-declared"`), and `hostsFor` in
 * `web/lib/hosts.ts` is the code that applies it. Carried to the view so the
 * cell can name the field it came from; empty when a manifest states no rule,
 * in which case the view falls back to naming the code path alone.
 */
const MCP_RULE = String(release.hostCompatibility?.mcp ?? "");
const SKILL_RULE = String(release.hostCompatibility?.skill ?? "");

/**
 * The two groups, each sorted alphabetically by the name on screen.
 *
 * The order is the page's one editorial choice and it is stated on the page: a
 * host LiteSPM can configure comes before a host only its skills directory
 * reaches. The catalog publishes no popularity, usage or rating figures, so
 * none of them can order anything here.
 */
export function compareData(): CompareData {
  const adapters = new Map(HOSTS.map((host) => [host.id, host]));
  const skillTargets = new Map(SKILL_TARGETS.map((target) => [target.id, target]));
  const ids = new Set<string>([...adapters.keys(), ...skillTargets.keys()]);

  const withAdapter: CompareRow[] = [];
  const skillsOnly: CompareRow[] = [];

  for (const id of ids) {
    const host = adapters.get(id);
    const target = skillTargets.get(id);
    // A row exists because at least one registry names the id; the loop reads
    // both and lets whichever is present fill its own columns.
    const name = host ? vendorName(host.id, host.name) : (target?.displayName ?? id);
    const row: CompareRow = {
      id,
      name,
      registryName: host?.name,
      skillName: target?.displayName,
      hasAdapter: Boolean(host),
      adapterFile: ADAPTER_SOURCE[id],
      skills: Boolean(target),
      skillsGlobal: Boolean(target?.hasGlobal),
      skillsUniversal: Boolean(target?.universal),
      format: host?.kind,
      keyPath: host?.keyPath,
      shape: host?.shape || undefined,
      userPath: host?.userPath || undefined,
      projectPath: host?.projectPath,
      remote: Boolean(host?.remote),
      docsUrl: host?.docsUrl,
      mcpEntries: host ? MCP_TOTAL : null,
      skillEntries: target ? SKILL_TOTAL : null,
    };
    (host ? withAdapter : skillsOnly).push(row);
  }

  const byName = (a: CompareRow, b: CompareRow) => a.name.localeCompare(b.name);
  withAdapter.sort(byName);
  skillsOnly.sort(byName);

  return {
    groups: [
      {
        key: "adapters",
        title: "Hosts with a config adapter",
        note: "LiteSPM can write this host's MCP config",
        rows: withAdapter,
      },
      {
        key: "skills-only",
        title: "Skills-only hosts",
        note: "no config adapter — skills directory only",
        rows: skillsOnly,
      },
    ],
    agentCount: ids.size,
    adapterCount: withAdapter.length,
    mcpTotal: MCP_TOTAL,
    skillTotal: SKILL_TOTAL,
    mcpRule: MCP_RULE,
    skillRule: SKILL_RULE,
  };
}

/**
 * The adapter ids `hosts.json` reports as hand-written, so the page cannot go
 * on claiming `ADAPTER_SOURCE` for a host the registry has moved to the
 * data-driven table (or vice versa). Called at build time; a mismatch fails the
 * build rather than shipping a wrong evidence link.
 */
export function assertAdapterSourcesMatchRegistry(): void {
  const bespoke = HOSTS.filter((host) => !host.generic).map((host) => host.id).sort();
  const mapped = Object.keys(ADAPTER_SOURCE).sort();
  if (bespoke.join(",") !== mapped.join(",")) {
    throw new Error(
      `compare: hand-written adapter list drifted from web/data/hosts.json — ` +
        `registry says [${bespoke.join(", ")}], compareRows.ts maps [${mapped.join(", ")}]`
    );
  }
}
