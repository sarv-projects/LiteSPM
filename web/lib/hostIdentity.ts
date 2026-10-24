import { listingIdentity } from "./discovery.mjs";
// One agent host, one identity, one count — the single host-matching rule.
//
// The catalog names one agent host through more than one string. An adapter's
// registry name ("Claude Code CLI") and its skills target's display name
// ("Claude Code") are different strings for the same host, and a product whose
// reference installer spells it differently again ("Pi", "Grok") carries a
// third. Counting the strings separately made four public surfaces disagree
// about how many hosts exist (76 / 81 / 90) and made nine host pages understate
// their own compatibility, because each page counted only the one string its
// own registry uses. This module is the one place a string becomes a host.
//
// THE IDENTITY is the id both registries join on:
//
//   * `data/hosts.json` — bridge adapters, generated from the compiled-in Go
//     registry (`internal/host/registry.go`); one row per host LiteSPM can
//     write an MCP config for.
//   * `data/skill-targets.json` — skills targets, generated from
//     `internal/skills/agents.go`; one row per host with a documented skills
//     directory. The reference installer's spellings of two of those rows
//     ("pi", "grok") are appended there as their own ids, and
//     `internal/host/registry.go` itself registers those two ids against the
//     same adapters as "pi-agent" and "grok-build".
//
// `HOST_ALIASES` in `lib/hosts.ts` is the join for those two — the alias table
// already resolves "pi" and "grok" to the adapter rows — so this module does
// not invent a second mapping. A skill id the alias table resolves is that
// adapter's identity, not a second host.
//
// THE RULE, applied by every surface that counts or filters hosts:
//
//   1. A row matches an identity when ANY string it names resolves to that
//      identity, and it is counted ONCE however many of its strings do.
//   2. A host with no adapter is not incompatible; it is unconfigured. An
//      identity with no adapter still answers for skills, and one with no
//      skill target still answers for MCP — the merge never turns "we hold no
//      data" into "it does not work".
//   3. A string no registry resolves stays itself: it is still a host the
//      catalog names, so it keeps its own facet, row and filter (the current
//      snapshot has none; the fallback exists so a future publisher string
//      cannot silently vanish from the pages that list hosts).
//
// Nothing here imports the dataset or a route; it is pure over the two
// generated registries and over rows a caller already holds, so the build-time
// pages and the browser derive the same answer from the same rule.

import type { Listing } from "./telemetry";
import {
  HOSTS,
  HOST_ALIASES,
  SKILL_TARGETS,
  hostsFor,
  resolveHost,
} from "./hosts";
import type { HostAdapter } from "./hosts";
import { availabilityOf } from "./availability";
import { vendorName } from "./vendorNames";

/** Shape of one row in the generated `web/data/skill-targets.json`. */
export interface SkillTarget {
  id: string;
  displayName: string;
  universal?: boolean;
  hasGlobal: boolean;
}

/**
 * One agent host. `id` is the registry key both tables join on; `name` is what
 * the site calls it (the vendor's own spelling where `vendorNames.ts` records
 * one). `adapter`/`skill` are the registry rows, present only where a registry
 * states one — their absence is "we hold no data", never a negative.
 */
export interface HostIdentity {
  id: string;
  name: string;
  adapter?: HostAdapter;
  skill?: SkillTarget;
  /** Every catalog spelling that resolves to this identity, for matching. */
  strings: string[];
}

function norm(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * The identity a skills-registry id belongs to: the adapter the alias table
 * resolves it to, or itself. `resolveHost("pi").id === "pi-agent"` and
 * `resolveHost("grok").id === "grok-build"`; every other skill id resolves to
 * nothing and stays its own identity.
 */
function joinSkillId(id: string): string {
  return resolveHost(id)?.id ?? id;
}

/** Every identity, built from the two registries and sorted by id. */
export const HOST_IDENTITIES: HostIdentity[] = (() => {
  const byId = new Map<string, HostIdentity>();
  for (const adapter of HOSTS) {
    byId.set(adapter.id, {
      id: adapter.id,
      name: vendorName(adapter.id, adapter.name),
      adapter,
      strings: [adapter.name],
    });
  }
  for (const target of SKILL_TARGETS) {
    const id = joinSkillId(target.id);
    let identity = byId.get(id);
    if (!identity) {
      identity = { id, name: vendorName(id, target.displayName), strings: [] };
      byId.set(id, identity);
    }
    // The canonical row is the target whose own id is the identity id; the
    // reference installer's alias ("pi" for "pi-agent") joins the same
    // directories, so it must not be the row the site states its facts from.
    if (!identity.skill || target.id === id) identity.skill = target;
    if (!identity.strings.includes(target.displayName)) identity.strings.push(target.displayName);
  }
  for (const identity of byId.values()) {
    if (!identity.strings.includes(identity.name)) identity.strings.push(identity.name);
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
})();

const IDENTITY_BY_ID = new Map(HOST_IDENTITIES.map((identity) => [identity.id, identity]));

/**
 * Every spelling that resolves to an identity: adapter ids and names, skills
 * ids and display names, the identity's own display name, and the publisher
 * spellings in `HOST_ALIASES` ("Codex", "Claude Code", "pi", …). First writer
 * wins, and registries are indexed before the alias table, so an id or a
 * registry name can never be captured by a publisher spelling.
 */
const STRING_TO_ID = (() => {
  const map = new Map<string, string>();
  const add = (raw: string | undefined, id: string) => {
    const key = raw ? norm(raw) : "";
    if (key && !map.has(key)) map.set(key, id);
  };
  for (const adapter of HOSTS) {
    add(adapter.id, adapter.id);
    add(adapter.name, adapter.id);
  }
  for (const target of SKILL_TARGETS) {
    const id = joinSkillId(target.id);
    add(target.id, id);
    add(target.displayName, id);
  }
  for (const identity of HOST_IDENTITIES) add(identity.name, identity.id);
  for (const [alias, id] of Object.entries(HOST_ALIASES)) add(alias, id);
  return map;
})();

/** The identity a catalog string names, or null when no registry does. */
export function resolveHostId(raw: string): string | null {
  return STRING_TO_ID.get(norm(raw)) ?? null;
}

export function hostIdentity(id: string): HostIdentity | undefined {
  return IDENTITY_BY_ID.get(id);
}

/**
 * The identity ids a row names, deduped.
 *
 * Two different claims wear this list and they are not the same claim (see
 * `hostsFor`). A plugin's ids are the publisher's own declaration, so they are
 * returned as published. An MCP row's and a skill's follow from the entry's
 * kind, which is a claim about what LiteSPM can configure — so `availabilityOf`
 * gates them, and a row the binary refuses names no host.
 *
 * The returned arrays are shared and must not be mutated.
 */
/** Shared empty result for a row with nothing installable. Never mutate. */
const NO_HOSTS: string[] = [];

export function hostIdsFor(
  item: Pick<Listing, "kind" | "compatibleHosts" | "transport" | "url" | "hasUrl" | "installability">
): string[] {
  if (item.kind === "plugin") {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const raw of item.compatibleHosts ?? []) {
      const id = resolveHostId(raw);
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    return ids;
  }

  // Nothing to install means no host to configure, so the row must not be
  // counted as working with any of them. This is the single gate behind the
  // Explore host filter, `tallyHosts` (which feeds every `/agents/` row and the
  // boards) and each host page's own figure; without it the 42,574
  // discovery-only rows were counted into all of them.
  if (!availabilityOf(item).installable) return NO_HOSTS;

  return Array.from(new Set(
    hostsFor(item)
      .map((name) => resolveHostId(name))
      .filter((id): id is string => id !== null)
  ));
}

/**
 * Does this row work with this host? `host` accepts any spelling of an
 * identity — a display name, a registry id, an adapter name, a publisher
 * spelling. A string no registry resolves falls back to an exact match against
 * the row's own strings, so a filter for an unknown name still measures that
 * name rather than silently matching nothing or everything.
 */
export function itemMatchesHost(
  item: Pick<Listing, "kind" | "compatibleHosts" | "transport" | "url" | "hasUrl" | "installability">,
  host: string | null
): boolean {
  if (!host) return true;
  const id = resolveHostId(host);
  if (id) return hostIdsFor(item).includes(id);
  const target = norm(host);
  return hostsFor(item).some((raw) => norm(raw) === target);
}

/** One host an entry page lists, with the adapter when there is one to write. */
export interface NamedHost {
  /** Identity id when a registry knows this host; the raw spelling otherwise. */
  value: string;
  /** What the page calls it. */
  name: string;
  /** Present when LiteSPM can write this host's config. */
  adapter?: HostAdapter;
}

/**
 * The hosts an entry page lists, one per identity: a skill row's two spellings
 * of the Pi host are one host, not two, and the count printed beside them is
 * the length of this list. A spelling no registry resolves stays its own host.
 */
export function hostsNamedBy(
  item: Pick<Listing, "kind" | "compatibleHosts" | "transport" | "url" | "hasUrl" | "installability">
): NamedHost[] {
  const out: NamedHost[] = [];
  const seen = new Set<string>();
  for (const raw of hostsFor(item)) {
    const name = raw.trim();
    if (!name) continue;
    const id = resolveHostId(name);
    const key = id ?? norm(name);
    if (seen.has(key)) continue;
    seen.add(key);
    if (id) {
      const identity = IDENTITY_BY_ID.get(id);
      out.push({ value: id, name: identity?.name ?? name, adapter: identity?.adapter });
    } else {
      out.push({ value: name, name });
    }
  }
  return out;
}

/** One host's compatible-entry counts, over items counted once per host. */
export interface HostTally {
  name: string;
  total: number;
  mcp: number;
  skill: number;
  plugin: number;
}

/**
 * Count every host named by a row set, once per item however many strings of
 * it resolve to the host. Keyed by identity id; a spelling no registry
 * resolves is keyed `raw:<lowercased spelling>`. Every identity is present,
 * so a host with no matching rows reports zero rather than dropping out.
 */
export function tallyHosts(items: Listing[]): Map<string, HostTally> {
  const map = new Map<string, HostTally>();
  const ensure = (key: string, name: string): HostTally => {
    let tally = map.get(key);
    if (!tally) {
      tally = { name, total: 0, mcp: 0, skill: 0, plugin: 0 };
      map.set(key, tally);
    }
    return tally;
  };
  for (const identity of HOST_IDENTITIES) ensure(identity.id, identity.name);

  const bump = (tally: HostTally, kind: string) => {
    tally.total += 1;
    if (kind === "mcp") tally.mcp += 1;
    else if (kind === "skill") tally.skill += 1;
    else if (kind === "plugin") tally.plugin += 1;
  };

  const counted = new Set<string>();
  for (const item of items) {
    for (const id of hostIdsFor(item)) {
      const key = id + "|" + listingIdentity(item);
      if (counted.has(key)) continue;
      counted.add(key);
      bump(ensure(id, IDENTITY_BY_ID.get(id)?.name ?? id), item.kind);
    }
    // A plugin carries its own declared list; MCP and skills rows derive
    // theirs from the kind, so every string they name resolves by construction.
    if (item.kind !== "plugin") continue;
    const seen = new Set<string>();
    for (const raw of item.compatibleHosts ?? []) {
      const name = raw.trim();
      if (!name) continue;
      const key = resolveHostId(name);
      if (key) continue;
      const rawKey = `raw:${norm(name)}`;
      if (seen.has(rawKey)) continue;
      seen.add(rawKey);
      const identity = rawKey + "|" + listingIdentity(item);
      if (counted.has(identity)) continue;
      counted.add(identity);
      bump(ensure(rawKey, name), item.kind);
    }
  }
  return map;
}

/** How many rows name this identity — what a host page prints and links. */
export function hostEntryCount(items: Listing[], id: string): number {
  const identities = new Set<string>();
  for (const item of items) {
    if (hostIdsFor(item).includes(id)) identities.add(listingIdentity(item));
  }
  return identities.size;
}
