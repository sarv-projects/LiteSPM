// One agent host, one identity, one count — the single host-matching rule.
//
// The catalog names one agent host through more than one string. An adapter's
// registry name ("Claude Code CLI") and its skills target's display name
// ("Claude Code") are different strings for the same host. `HOST_ALIASES` in
// `hosts.ts` is the join, so this module does not invent a second mapping.

import type { Listing } from "./types";
import {
  HOSTS,
  HOST_ALIASES,
  SKILL_TARGETS,
  hostsFor,
  resolveHost,
  type HostAdapter,
} from "./hosts";
import { availabilityOf } from "./availability";
import { vendorName } from "./vendor-names";
import { listingIdentity } from "./discovery";

/** Shape of one row in the generated skill-targets.json. */
export interface SkillTarget {
  id: string;
  displayName: string;
  universal?: boolean;
  hasGlobal: boolean;
}

/**
 * One agent host. `id` is the registry key both tables join on; `name` is what
 * the site calls it. `adapter`/`skill` are the registry rows, present only
 * where a registry states one — their absence is "we hold no data", never a
 * negative.
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
    // The canonical row is the target whose own id is the identity id.
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
 * spellings in `HOST_ALIASES`.
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

/** Shared empty result for a row with nothing installable. Never mutate. */
const NO_HOSTS: string[] = [];

/**
 * The identity ids a row names, deduped.
 *
 * A plugin's ids are the publisher's own declaration, so they are returned as
 * published. An MCP row's and a skill's follow from the entry's kind — a
 * claim about what LiteSPM can configure — so `availabilityOf` gates them.
 */
export function hostIdsFor(
  item: Pick<
    Listing,
    "kind" | "compatibleHosts" | "transport" | "url" | "hasUrl" | "installability"
  >,
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

  if (!availabilityOf(item).installable) return NO_HOSTS;

  // For a non-plugin row the result depends only on (kind, transport, remote
  // endpoint?) - hostsFor reads nothing else. There are a handful of such
  // combinations across ~69k rows, so resolve each once instead of mapping
  // 50-80 host names through resolveHostId per row (it was ~3M calls to
  // classify an unfiltered catalog).
  const shape = `${item.kind}|${(item.transport ?? "").toLowerCase()}|${item.url || item.hasUrl ? 1 : 0}`;
  const cached = HOST_IDS_BY_SHAPE.get(shape);
  if (cached) return cached;
  const ids = Array.from(
    new Set(
      hostsFor(item)
        .map((name) => resolveHostId(name))
        .filter((id): id is string => id !== null),
    ),
  );
  HOST_IDS_BY_SHAPE.set(shape, ids);
  return ids;
}

const HOST_IDS_BY_SHAPE = new Map<string, string[]>();

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
 * of the Pi host are one host, not two.
 */
export function hostsNamedBy(
  item: Pick<
    Listing,
    "kind" | "compatibleHosts" | "transport" | "url" | "hasUrl" | "installability"
  >,
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
 * resolves is keyed `raw:<lowercased spelling>`.
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

  const counted = new Map<string, string[]>();
  for (const item of items) {
    const identity = listingIdentity(item);
    const previous = counted.get(identity);
    const named = previous ?? [];
    const add = (key: string, name: string) => {
      if (previous?.includes(key)) return;
      named.push(key);
      bump(ensure(key, name), item.kind);
    };
    for (const id of hostIdsFor(item)) {
      add(id, IDENTITY_BY_ID.get(id)?.name ?? id);
    }
    if (item.kind === "plugin") {
      const seen = new Set<string>();
      for (const raw of item.compatibleHosts ?? []) {
        const name = raw.trim();
        if (!name || resolveHostId(name)) continue;
        const key = `raw:${norm(name)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        add(key, name);
      }
    }
    if (!previous) counted.set(identity, named);
  }
  return map;
}
