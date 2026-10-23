// installFeasibility.ts — the site's projection of the CLI's install gates.
//
// One module, one question: for this catalog row, on this agent, at this
// scope, can `litespm install` complete — and when it cannot, what exactly
// refuses it?
//
// The site already has a listing-level answer (`lib/availability.ts`:
// `availabilityOf` — can this ROW be installed at all). It did not have the
// host-level answer, and that is where the two halves of the site disagreed
// with the binary:
//
//   * `lib/hosts.ts` `hostsFor` returns the eight adapters with a verified
//     remote (URL) entry spelling for a remote row, but it ignores the
//     TRANSPORT. The registry records that Claude Code, Cline and Cursor
//     document `sse` while Codex, Grok Build, OpenCode, Pi Agent and Zed
//     document `streamable-http` only, and the binary refuses the other five
//     by name (LPSM-HOST-REMOTE-UNSUPPORTED, "cannot express a %q remote
//     (URL) MCP entry"). The 732 `sse` rows in the release are therefore
//     installable into three agents, not eight.
//   * the site has no answer at all for the SCOPE. `--scope project` is
//     refused for the seven adapters that document only a user-scope config
//     (`host.SupportsProjectScope`), and a user-scope install into the three
//     agents that document only a repo-local config lands inside whatever
//     project the command was run from.
//   * a skill is copied into an agent's skills directory, and two of the 81
//     skill targets document no user-level directory at all
//     (`internal/skills/agents.go` leaves `GlobalDir` empty for `eve` and
//     `promptscript`), so a user-scope skill install into those two is
//     refused while the site counted them.
//
// This module is the projection of those gates, and it is written to agree
// with the Go source it mirrors:
//
//   * `internal/host/entry_install.go` — `entrySpec.Remote` (which hosts can
//     spell a remote entry, and for which transports), `entrySpec.Shape` (the
//     local entry spelling), `SupportsProjectScope` / `projectConfigPathFor`.
//   * `internal/host/targets_data.go` — the two data-driven rows that carry
//     a remote spelling (Cursor, Zed).
//   * `internal/host/registry.go` — the six bespoke adapters, of which four
//     carry a remote spelling (Claude Code, Cline, OpenCode, Codex) plus the
//     Pi and Grok aliases of two of them.
//   * `cmd/litespm/install_kind.go` — the KIND gate: a plugin is refused
//     before anything else is consulted (LPSM-ARTIFACT-UNAVAILABLE).
//   * `cmd/litespm/install_mcp.go` — the provenance gate
//     (`listing.IsInstallable()`), the launch-line gate, the remote
//     capability preflight, and the refusal to forward `--env` to a URL
//     entry.
//   * `cmd/litespm/install_skill.go` — the skill path, whose scope follows
//     the target's own `GlobalDir` / `ProjectDir`.
//   * `internal/catalog/client.go` `RuntimeForListing` — the launch line
//     comes from the published version record: a command, or an endpoint
//     whose transport is the row's own published `transport`.
//
// TWO RULES THIS MODULE NEVER BREAKS:
//
//   1. **"We do not know" is not "no".** A host the published registry does
//      not record a capability for is `unknown`, never `unsupported` and
//      never `supported`. The generated registry marks a remote-capable host
//      with `remote: true` and leaves the field off every other host, so a
//      remote row is `unknown` — not `unsupported` — on the 42 hosts the
//      registry says nothing about. (The Go registry is stricter: it refuses
//      them fail-closed. The site says "unknown" where the binary says "no",
//      which is the safe direction; see the report.)
//   2. **`supported` is a statement about the install PATH, not about the
//      server.** It means "LiteSPM can prepare the install for this target
//      under the published metadata". It does not mean the reader's
//      credentials work, that the endpoint is reachable, or that anyone has
//      run the publisher's code. Those are the `limitations`, and every
//      supported verdict carries at least one.
//
// Measured against the 2026-10-21 release (69,376 rows):
//
//   supported      26,554  25,400 remote MCP rows + 764 skills + 390 plugins
//   discovery-only 42,574  23,018 MCP + 19,556 skills with no launch line
//   plugin             390  plugins that publish a pinned git tree
//   unsupported       248  plugins with no fetchable pinned source
//   unknown           0  no row in this release leaves the host axis open
//   requires-setup    0  a setup step is never a row-level fact
//
// The counts are the site's own: `lib/availability.ts` already published the
// same 26,554 / 42,574 / 248 split, and this module must not disagree with
// it.

import type { Listing } from "./telemetry";
import { availabilityOf } from "./availability";
import { HOSTS, SKILL_TARGETS, isRemoteTransport, type HostAdapter } from "./hosts";
import { resolveHostId } from "./hostIdentity";

/**
 * The five answers this module can give.
 *
 *   supported       LiteSPM can prepare the install path for the target.
 *   requires-setup  it can, but only once a step the reader must take is
 *                   done — the one step the published registry records.
 *   discovery-only  the row publishes no launch line, so there is nothing to
 *                   install.
 *   unsupported     the target refuses this entry, and the refusal is known.
 *   unknown         the published data does not say. Never a refusal, never
 *                   a promise.
 */
export type FeasibilityState =
  | "supported"
  | "requires-setup"
  | "discovery-only"
  | "unsupported"
  | "unknown";

/** Which kind of install the row's metadata describes. */
export type FeasibilityMode = "mcp-remote" | "mcp-local" | "skill" | "plugin";

/** The install scope a reader is asking about. */
export type FeasibilityScope = "user" | "project";

export interface Feasibility {
  state: FeasibilityState;
  mode: FeasibilityMode;
  /** Why this state, in one short sentence per reason. */
  reasons: string[];
  /** Host ids this entry can actually be installed into, under the known gates. */
  supportedHostIds: string[];
  /** Known limitations (credentials, scope, transport), as short strings. */
  limitations: string[];
}

/* ------------------------------------------------------------------ *
 * The registry facts this module reads
 * ------------------------------------------------------------------ */

/**
 * The transports a host documents for a URL entry.
 *
 * Straight from the generated registry (`web/data/hosts.json`, emitted from
 * the Go `RemoteEntrySpec.Transports`). It used to be a second, hand-written
 * table in this file — the registry published only a `remote: true` flag and
 * not which transports each host documents, so the site kept the other half
 * of the fact here, with a drift guard that failed when the two disagreed.
 *
 * The guard did its job and then went off: the adapters were re-verified
 * against live vendor documentation (46 of 50 hosts, 2026-10-21) and this
 * table stayed at its eight rows, so a reader was told the transport was
 * UNKNOWN for 38 agents the binary would happily install into. The generator
 * emits the set now (`scripts/gen_hosts_ts.go`), which is what the table's
 * own comment asked for, and the table is gone.
 *
 * An empty set is not a capability: a host whose spec names no transport
 * stays `unknown` here rather than being assumed.
 */
function remoteTransports(adapter: HostAdapter): readonly string[] {
  return adapter.remoteTransports ?? [];
}

/** The registry's transport vocabulary. */
const TRANSPORT_STREAMABLE_HTTP = "streamable-http";
const TRANSPORT_SSE = "sse";

/**
 * The transport the binary would install this row with, in the registry's own
 * vocabulary — the same mapping `host.RegistryRemoteTransport` performs on
 * the value read back from a host config. The published runtime descriptor
 * carries the row's own `transport` verbatim (`internal/catalogbuild/dataset.go`
 * `datasetComponents`), so this is the token the capability check runs with.
 *
 * An unrecognised token is passed through unchanged: the binary then finds no
 * host that documents it and refuses everywhere, and so must this module.
 */
function registryTransport(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (value === "") return TRANSPORT_STREAMABLE_HTTP;
  switch (value) {
    case "http":
    case "streamableHttp":
    case "remote":
    case TRANSPORT_STREAMABLE_HTTP:
      return TRANSPORT_STREAMABLE_HTTP;
    case TRANSPORT_SSE:
      return TRANSPORT_SSE;
    default:
      return value;
  }
}

/** One row of `web/data/skill-targets.json`. */
interface SkillTargetRow {
  id: string;
  displayName: string;
  universal?: boolean;
  hasGlobal: boolean;
}

/**
 * The identity id a name belongs to — the one rule that turns a catalog
 * spelling into a host (`lib/hostIdentity.ts`). A name no registry resolves
 * stays itself, so it can be reported as an agent LiteSPM does not know.
 */
function identityId(raw: string): string {
  const resolved = resolveHostId(raw);
  if (resolved) return resolved;
  return raw.trim().toLowerCase();
}

/** Every adapter, keyed by identity id. */
const ADAPTERS_BY_ID: Map<string, HostAdapter> = (() => {
  const map = new Map<string, HostAdapter>();
  for (const adapter of HOSTS) {
    const id = identityId(adapter.name);
    if (!map.has(id)) map.set(id, adapter);
  }
  return map;
})();

/**
 * Every skill target, keyed by identity id. The reference installer's own
 * spellings of two rows ("pi" for "pi-agent", "grok" for "grok-build") join
 * the same directories, so the canonical row is the one whose own id IS the
 * identity id.
 */
const SKILLS_BY_ID: Map<string, SkillTargetRow> = (() => {
  const map = new Map<string, SkillTargetRow>();
  for (const target of SKILL_TARGETS as SkillTargetRow[]) {
    const id = identityId(target.id);
    const existing = map.get(id);
    if (!existing || target.id === id) map.set(id, target);
  }
  return map;
})();

/** How many agents the registry holds — the denominator of every "N of M". */
const AGENT_COUNT = HOSTS.length;

/* ------------------------------------------------------------------ *
 * The mode: which kind of install the row's metadata describes
 * ------------------------------------------------------------------ */

/**
 * A row is a REMOTE row when it publishes a transport that is not `stdio`
 * AND an endpoint to connect to. Both halves matter: the older list-sourced
 * rows recorded a transport but no URL, and the binary registers those as a
 * local command and says so in its own output ("the catalog lists this
 * server as %q but publishes no endpoint URL, so the local command above is
 * what was registered").
 */
function isRemoteRow(item: Listing): boolean {
  return isRemoteTransport(item.transport) && Boolean(item.url);
}

function modeOf(item: Listing): FeasibilityMode {
  if (item.kind === "plugin") return "plugin";
  if (item.kind === "skill") return "skill";
  return isRemoteRow(item) ? "mcp-remote" : "mcp-local";
}

/* ------------------------------------------------------------------ *
 * The host sets
 * ------------------------------------------------------------------ */

/** Does this adapter have a documented local (stdio) entry spelling? */
function acceptsLocalEntry(adapter: HostAdapter): boolean {
  return Boolean(adapter.shape) && Boolean(adapter.keyPath);
}

/**
 * The agents a REMOTE row can be registered in.
 *
 * Three gates, in the order the binary applies them:
 *
 *   1. the host must have a verified URL entry spelling at all
 *      (`host.RemoteEntrySpecFor`; the generated `remote: true`);
 *   2. the host must document THIS transport
 *      (`RemoteEntrySpec.Supports`; the binary refuses the others with
 *      LPSM-HOST-REMOTE-UNSUPPORTED);
 *   3. at project scope the host must document a project config
 *      (`host.SupportsProjectScope`).
 *
 * A host whose registry row names no matching transport is left out: the
 * module does not guess, so it is `unknown` for that host rather than
 * `supported`.
 */
function remoteHostIds(item: Listing, scope: FeasibilityScope): string[] {
  const transport = registryTransport(item.transport);
  const ids: string[] = [];
  for (const adapter of HOSTS) {
    if (adapter.remote !== true) continue;
    if (scope === "project" && !adapter.projectScope) continue;
    const transports = remoteTransports(adapter);
    if (!transports.length) continue;
    if (!transports.includes(transport)) continue;
    const id = identityId(adapter.name);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The agents a LOCAL row can be registered in: every adapter with a
 * documented entry shape, and — at project scope — only the ones that
 * document a project config file.
 */
function localHostIds(scope: FeasibilityScope): string[] {
  const ids: string[] = [];
  for (const adapter of HOSTS) {
    if (!acceptsLocalEntry(adapter)) continue;
    if (scope === "project" && !adapter.projectScope) continue;
    const id = identityId(adapter.name);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The agents a SKILL can be copied into: every registered skill target, and
 * — at user scope — only the ones that document a user-level directory
 * (`internal/skills/agents.go`: an empty `GlobalDir` means the agent has no
 * user-level skills directory at all).
 */
function skillHostIds(scope: FeasibilityScope): string[] {
  const ids: string[] = [];
  for (const target of SKILL_TARGETS as SkillTargetRow[]) {
    if (scope === "user" && !target.hasGlobal) continue;
    const id = identityId(target.id);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** The agents this row can be installed into, under the known gates. */
function supportedHostIdsFor(
  item: Listing,
  mode: FeasibilityMode,
  scope: FeasibilityScope
): string[] {
  switch (mode) {
    case "mcp-remote":
      return remoteHostIds(item, scope);
    case "mcp-local":
      return localHostIds(scope);
    case "skill":
      return skillHostIds(scope);
    case "plugin":
      // A plugin registers its MCP servers as ordinary server entries, so the
      // hosts that can take one are the hosts that can take a local entry.
      // WHICH kind of entry it needs — a command or a URL — is known only
      // after the plugin's own manifest is read, and the page says so.
      return localHostIds(scope);
  }
}

/* ------------------------------------------------------------------ *
 * The reasons and the limitations
 * ------------------------------------------------------------------ */

/**
 * A plugin installs when it publishes a FETCHABLE, PINNED source: a git tree
 * with a commit id. The path exists (2026-10-19): the pinned tree is fetched
 * and verified, the plugin's own manifest is parsed, and the MCP servers the
 * manifest declares are registered in the target host's config.
 *
 * What the SITE cannot know is what the plugin's manifest declares, so the
 * page says the plugin is installable and says the servers are known only
 * after the manifest is read.
 */
const REASON_PLUGIN_UNPINNED =
  "this plugin publishes a source that is not pinned to a commit, so LiteSPM will not fetch a mutable one";
const REASON_PLUGIN_LOCAL =
  "this plugin publishes a local directory, which is not something LiteSPM can fetch from a catalogue";
const REASON_PLUGIN_NO_SOURCE = "this plugin publishes no source at all";
const REASON_NO_LAUNCH_LINE = "the publisher published no launch line";
const REASON_NO_REMOTE_SPELLING = "this agent cannot be given a remote (URL) server";
const REASON_NO_REMOTE_RECORD =
  "LiteSPM has no recorded remote (URL) entry spelling for this agent";
const REASON_NO_ENTRY_SHAPE = "this agent has no documented MCP entry shape";
const REASON_NO_SKILLS_DIR = "this agent has no skills directory LiteSPM knows about";
const REASON_NO_USER_SCOPE = "user scope is not documented for this agent";
const REASON_NO_HOST_LIST = "the publisher declares no host list";
const REASON_UNKNOWN_AGENT = "LiteSPM has no record of this agent";
const REASON_USER_SCOPE_ONLY = "this agent documents only a user-scope config file";
const REASON_PROJECT_LOCAL_ONLY =
  "this agent only documents a repo-local config file, so the entry lands in the project the install is run from";

/** A limitation every supported verdict carries (rule 7). */
const LIMIT_NOT_TESTED = "the publisher's runtime is not tested by LiteSPM";
const LIMIT_REMOTE_CREDENTIALS =
  "the catalog publishes no credentials for this endpoint; add any key to the agent's config by hand";
const LIMIT_REMOTE_EGRESS =
  "the endpoint must be https (a loopback address may be http); a private-network address is refused";
const LIMIT_BRIDGE_SETUP =
  "the agent must have the LiteSPM bridge set up before a server can be installed into it";
const LIMIT_LOCAL_COMMAND =
  "the publisher's launch line runs on your machine; LiteSPM does not run it";
const LIMIT_LOCAL_ENV =
  "the catalog publishes no environment variables; a server that needs a credential takes one with --env";
const LIMIT_SKILL_FILES =
  "the skill's files are copied from the publisher's source; LiteSPM does not run them";
const LIMIT_PLUGIN_BUNDLE = "LiteSPM will not install a partial plugin bundle";
const LIMIT_DISCOVERY_ONLY =
  "the entry is listed because its publisher published it, not because LiteSPM can install it";

/** The limitations that belong to the row's mode, whatever the state is. */
function modeLimitations(mode: FeasibilityMode): string[] {
  switch (mode) {
    case "mcp-remote":
      return [LIMIT_REMOTE_CREDENTIALS, LIMIT_REMOTE_EGRESS, LIMIT_BRIDGE_SETUP];
    case "mcp-local":
      return [LIMIT_LOCAL_COMMAND, LIMIT_LOCAL_ENV, LIMIT_BRIDGE_SETUP];
    case "skill":
      return [LIMIT_SKILL_FILES];
    case "plugin":
      return [LIMIT_PLUGIN_BUNDLE];
  }
}

/* ------------------------------------------------------------------ *
 * The verdicts
 * ------------------------------------------------------------------ */

interface Verdict {
  state: FeasibilityState;
  reasons: string[];
  limitations: string[];
}

function verdict(
  state: FeasibilityState,
  reasons: string[],
  limitations: string[]
): Verdict {
  return { state, reasons, limitations };
}

/**
 * The verdict for ONE agent.
 *
 * The order of the questions is the order the binary asks them: what kind of
 * entry is this, can the agent take that kind of entry at all, and can it
 * take it at this scope.
 */
function hostVerdict(
  item: Listing,
  mode: FeasibilityMode,
  scope: FeasibilityScope,
  selectedId: string
): Verdict {
  const adapter = ADAPTERS_BY_ID.get(selectedId);
  const skill = SKILLS_BY_ID.get(selectedId);
  const limitations = modeLimitations(mode);

  if (mode === "plugin") {
    // A plugin is installable when it publishes a pinned git tree. What it
    // installs (the MCP servers its own manifest declares) is only known
    // after that manifest is read, so the page says the servers are not
    // published rather than naming none.
    const artifact = item.artifact;
    if (!artifact) {
      return verdict("unsupported", [REASON_PLUGIN_NO_SOURCE], limitations);
    }
    if (artifact.type !== "git-tree") {
      return verdict("unsupported", [REASON_PLUGIN_LOCAL], limitations);
    }
    if (!artifact.pinned) {
      return verdict("unsupported", [REASON_PLUGIN_UNPINNED], limitations);
    }
    // The publisher's own host list is data about the plugin, not an install
    // path. A host the publisher does not name is one the site knows nothing
    // about — `unknown`, never `unsupported` (a claim about the host) and
    // never `supported`.
    const declared = publisherHostIds(item);
    if (selectedId && declared.length > 0 && !declared.includes(selectedId)) {
      return verdict("unknown", [REASON_NO_HOST_LIST], limitations);
    }
    return verdict("supported", [], [
      "the MCP servers this plugin installs are read from the plugin's own manifest, inside its pinned source, and are not published in the catalogue",
    ]);
  }

  if (mode === "skill") {
    if (!skill) {
      if (adapter) {
        // A known agent whose skills directory LiteSPM does not know about.
        return verdict("unsupported", [REASON_NO_SKILLS_DIR], limitations);
      }
      return verdict("unknown", [REASON_UNKNOWN_AGENT], limitations);
    }
    if (scope === "user" && !skill.hasGlobal) {
      return verdict("unsupported", [REASON_NO_USER_SCOPE], limitations);
    }
    return verdict("supported", ["this agent has a skills directory LiteSPM knows about"], [
      ...limitations,
      LIMIT_NOT_TESTED,
    ]);
  }

  if (!adapter) {
    return verdict("unknown", [REASON_UNKNOWN_AGENT], limitations);
  }

  if (mode === "mcp-remote") {
    if (adapter.remote === false) {
      // The registry says this host cannot take a URL entry.
      return verdict("unsupported", [REASON_NO_REMOTE_SPELLING], limitations);
    }
    if (adapter.remote !== true) {
      // The published registry records no capability for this host. The Go
      // registry refuses such a host fail-closed, but the site does not turn
      // absent data into a refusal it cannot read.
      return verdict("unknown", [REASON_NO_REMOTE_RECORD], limitations);
    }
    const transports = remoteTransports(adapter);
    if (!transports.length) {
      return verdict(
        "unknown",
        ["LiteSPM has no record of which URL transports this agent documents"],
        limitations
      );
    }
    if (!transports.includes(registryTransport(item.transport))) {
      // The binary refuses this transport on this host by name
      // (LPSM-HOST-REMOTE-UNSUPPORTED).
      return verdict("unsupported", [REASON_NO_REMOTE_SPELLING], limitations);
    }
  } else if (!acceptsLocalEntry(adapter)) {
    // No documented entry shape: the binary refuses with "host %q has no
    // documented MCP entry shape, so a server entry cannot be written to it".
    return verdict("unsupported", [REASON_NO_ENTRY_SHAPE], limitations);
  }

  if (scope === "project" && !adapter.projectScope) {
    return verdict("unsupported", [REASON_USER_SCOPE_ONLY], limitations);
  }
  if (scope === "user" && adapter.projectOnly) {
    // The adapter has no user-scope config path, so the binary falls back to
    // the repo-local file, resolved against the working directory. The
    // install completes, but only inside a project.
    return verdict("requires-setup", [REASON_PROJECT_LOCAL_ONLY], [
      ...limitations,
      LIMIT_NOT_TESTED,
    ]);
  }

  return verdict(
    "supported",
    [
      mode === "mcp-remote"
        ? "this agent has a verified remote (URL) entry spelling"
        : "this agent has a documented MCP entry shape",
    ],
    [...limitations, LIMIT_NOT_TESTED]
  );
}

/** The publisher's own host list, as identity ids. */
function publisherHostIds(item: Listing): string[] {
  const ids: string[] = [];
  for (const raw of item.compatibleHosts ?? []) {
    const id = identityId(raw);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/* ------------------------------------------------------------------ *
 * The public entry points
 * ------------------------------------------------------------------ */

/**
 * Can this row be installed, and on which agents?
 *
 * `selectedHostId` is the agent the reader is asking about (any spelling of
 * it — a display name, a registry id, a publisher spelling). Without it the
 * verdict is the row's own: the best answer the registry supports for the
 * row as a whole.
 *
 * `scope` is the install scope the reader is asking about. It changes the
 * answer for skills (an agent with no user-level skills directory takes no
 * user-scope skill) and for MCP entries (seven adapters document only a
 * user-scope config, and three document only a repo-local one).
 */
/**
 * pluginSourceReason is the reason a plugin cannot be fetched, or "" when it
 * can: a `git-tree` that is pinned. `pinned` already says the descriptor
 * published a 40-hex commit id (see `availabilityOf`), so the id is not read
 * again here — the search projection carries the fact and not the value.
 */
function pluginSourceReason(item: Listing): string {
  const artifact = item.artifact;
  if (!artifact) return REASON_PLUGIN_NO_SOURCE;
  if (artifact.type !== "git-tree") return REASON_PLUGIN_LOCAL;
  if (!artifact.pinned) return REASON_PLUGIN_UNPINNED;
  return "";
}

export function feasibilityFor(
  item: Listing,
  selectedHostId?: string,
  scope: FeasibilityScope = "user"
): Feasibility {
  const mode = modeOf(item);
  const limitations = modeLimitations(mode);

  // 1. The KIND gate. The CLI asks it first. A plugin is refused here only
  //    when it publishes no FETCHABLE, PINNED source — the same question
  //    the plugin installer asks (LPSM-ARTIFACT-UNAVAILABLE). A plugin that
  //    does publish one goes on to the host verdict, which decides whether a
  //    given agent can take it.
  if (item.kind === "plugin") {
    const sourceReason = pluginSourceReason(item);
    if (sourceReason) {
      const selected = selectedHostId?.trim();
      if (selected) {
        const hostVerdictForPlugin = hostVerdict(item, mode, scope, identityId(selected));
        return {
          state: hostVerdictForPlugin.state,
          mode,
          reasons: hostVerdictForPlugin.reasons.length ? hostVerdictForPlugin.reasons : [sourceReason],
          supportedHostIds: [],
          limitations: hostVerdictForPlugin.limitations,
        };
      }
      return {
        state: "unsupported",
        mode,
        reasons: [sourceReason],
        supportedHostIds: [],
        limitations,
      };
    }
  }

  // 2. The listing-level gate, the one the site already publishes
  //    (`lib/availability.ts`): a discovery-only row, or an MCP row with no
  //    launch line, has nothing to install.
  if (!availabilityOf(item).installable) {
    return {
      state: "discovery-only",
      mode,
      reasons: [REASON_NO_LAUNCH_LINE],
      supportedHostIds: [],
      limitations: [LIMIT_DISCOVERY_ONLY, ...limitations],
    };
  }

  const supported = supportedHostIdsFor(item, mode, scope);
  const selected = selectedHostId?.trim();
  if (selected) {
    const id = identityId(selected);
    const result = hostVerdict(item, mode, scope, id);
    return {
      state: result.state,
      mode,
      reasons: result.reasons,
      supportedHostIds: supported,
      limitations: result.limitations,
    };
  }

  if (supported.length === 0) {
    return {
      state: "unknown",
      mode,
      reasons: ["no agent in the registry can take this entry"],
      supportedHostIds: [],
      limitations,
    };
  }

  return {
    state: "supported",
    mode,
    reasons: [rowReason(mode, supported.length)],
    supportedHostIds: supported,
    limitations: [LIMIT_NOT_TESTED, ...limitations, ...scopeLimitations(mode, supported.length)],
  };
}

/** The one-line reason a row-level supported verdict carries. */
function rowReason(mode: FeasibilityMode, count: number): string {
  switch (mode) {
    case "mcp-remote":
      return `LiteSPM can register this endpoint in ${count} of the ${AGENT_COUNT} agents it knows`;
    case "mcp-local":
      return `LiteSPM can register this command in ${count} of the ${AGENT_COUNT} agents it knows`;
    case "skill":
      return `LiteSPM can copy this skill into ${count} agent skill directories`;
    case "plugin":
      return "LiteSPM can install this plugin from its pinned source";
  }
}

/** The limitation a row-level verdict carries about the reach of the entry. */
function scopeLimitations(mode: FeasibilityMode, count: number): string[] {
  switch (mode) {
    case "mcp-remote":
      return [`${count} of the ${AGENT_COUNT} agents LiteSPM knows can be given a remote (URL) server`];
    case "mcp-local":
      return [`all ${count} agents LiteSPM knows can be given a local (stdio) server`];
    case "skill":
      return ["the skill is copied into each agent's own skills directory"];
    case "plugin":
      return [];
  }
}

/**
 * The counts for a set of rows, on the same scale the site already prints.
 *
 * The numbers this must produce for the current release are 26,554
 * supported, 42,574 discovery-only, 248 unsupported, and nothing in the two
 * open states — the same split `lib/availability.ts` publishes, because the
 * host axis does not change whether a row can be installed, only where.
 */
export function feasibilityCounts(items: Listing[]): Record<FeasibilityState, number> {
  const counts: Record<FeasibilityState, number> = {
    supported: 0,
    "requires-setup": 0,
    "discovery-only": 0,
    unsupported: 0,
    unknown: 0,
  };
  for (const item of items) counts[feasibilityFor(item).state] += 1;
  return counts;
}
