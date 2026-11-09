/**
 * The `/agents/` row model: one row per agent host identity, not per catalog
 * spelling — with every count the catalog publishes and the registry facts
 * (`hosts.json`, `skill-targets.json`) plus the curated notes
 * (`host-notes.ts`) attached for the detail view.
 */

import { vendorName } from "./vendor-names";
import { hostNote } from "./host-notes";
import { HOST_IDENTITIES, resolveHostId, tallyHosts, hostIdsFor } from "./identity";
import { HOSTS, SKILL_TARGETS, bridgeSnippet, hostPath, hostPathIsHomeDerived, hostSupportsPlatform, compareHostsByAdoption, type PlatformOS } from "./hosts";
import { availabilityOf } from "./availability";
import { listingIdentity } from "./discovery";
import { getDataset } from "./dataset";
import type { Listing } from "./types";

/** One kind's compatible-entry count, and the catalog string it is keyed by. */
export interface KindCount {
  count: number;
  /** A spelling of this host Explore's `?host=` filter accepts for this kind. */
  host: string;
}

export interface AgentRow {
  slug: string;
  pageId?: string;
  name: string;
  /** Present when LiteSPM has a compiled-in MCP adapter for this host. */
  hostId?: string;
  /** Every catalog spelling that resolves into this row. */
  strings: string[];
  mcp: KindCount | null;
  skill: KindCount | null;
  plugin: KindCount | null;
  /** Compatible entries in the current snapshot; sorts the list. */
  total: number;
  /** Compatible entries `litespm install` can actually complete. */
  installable: number;
  /** The compatible entries' largest categories, for the directory card. */
  topCategories: string[];
  /** Adapter config format, when a compiled-in MCP adapter exists. */
  configFormat?: "json" | "toml";
  /** The vendor documents a remote (URL) MCP entry shape. */
  remoteMcp?: boolean;
  /** Enrichment for the directory cards. */
  profileType?: string;
  summary?: string;
  interface?: string;
  website?: string;
  capabilities?: string[];
  skillOnly: boolean;
}

function slugifyAgent(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The cache key carries a version: bump it whenever AgentRow's shape changes
// so hot reloads (globalThis survives module swaps) recompute the directory.
const globalForAgentRows = globalThis as unknown as {
  __litespmAgentRowsV2?: Promise<AgentRow[]>;
};

export async function buildAgentRows(): Promise<AgentRow[]> {
  globalForAgentRows.__litespmAgentRowsV2 ??= computeAgentRows();
  return globalForAgentRows.__litespmAgentRowsV2;
}

async function computeAgentRows(): Promise<AgentRow[]> {
  const dataset = await getDataset();
  const items = dataset.rows;
  const tally = tallyHosts(items);

  // Second single pass over the rows for the per-agent facts the cards print:
  // how many rows are actually installable, and which categories dominate.
  // The same listing-identity dedupe as tallyHosts keeps re-publications from
  // counting twice.
  const installableByHost = new Map<string, number>();
  const categoriesByHost = new Map<string, Map<string, number>>();
  const counted = new Map<string, Set<string>>();
  for (const item of items) {
    const ids = hostIdsFor(item);
    if (ids.length === 0) continue;
    const itemInstallable = availabilityOf(item).installable;
    const category = item.category?.trim();
    if (!itemInstallable && !category) continue;
    const identityKey = listingIdentity(item);
    let seen = counted.get(identityKey);
    if (!seen) {
      seen = new Set<string>();
      counted.set(identityKey, seen);
    }
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (itemInstallable) {
        installableByHost.set(id, (installableByHost.get(id) ?? 0) + 1);
      }
      if (category && itemInstallable) {
        let cats = categoriesByHost.get(id);
        if (!cats) {
          cats = new Map<string, number>();
          categoriesByHost.set(id, cats);
        }
        cats.set(category, (cats.get(category) ?? 0) + 1);
      }
    }
  }

  const rows: AgentRow[] = HOST_IDENTITIES.map((identity) => {
    const counts = tally.get(identity.id);
    const note = hostNote(identity.id);
    const skillTarget = identity.skill;
    const profileType =
      note?.profileType ??
      (identity.adapter
        ? skillTarget
          ? "MCP servers + skills"
          : "MCP servers"
        : skillTarget
          ? "Agent skills"
          : "Agent profile");
    const topCategories = [...(categoriesByHost.get(identity.id) ?? new Map())]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
      .slice(0, 3);
    return {
      slug: identity.id,
      pageId: identity.id,
      name: identity.name,
      hostId: identity.adapter?.id,
      strings: identity.strings.slice(),
      mcp: identity.adapter ? { count: counts?.mcp ?? 0, host: identity.adapter.name } : null,
      skill: skillTarget
        ? { count: counts?.skill ?? 0, host: skillTarget.displayName }
        : null,
      plugin: counts && counts.plugin > 0 ? { count: counts.plugin, host: identity.name } : null,
      total: counts?.total ?? 0,
      installable: installableByHost.get(identity.id) ?? 0,
      topCategories,
      configFormat: identity.adapter?.kind,
      remoteMcp: identity.adapter?.remote,
      profileType,
      summary: note?.summary,
      interface: note?.interface,
      website: note?.website,
      capabilities: note?.capabilities,
      skillOnly: !identity.adapter && Boolean(skillTarget),
    };
  });

  // A spelling no registry resolves is still a host the catalog names; it
  // keeps a row of its own rather than disappearing from the index.
  for (const [key, host] of tally) {
    if (!key.startsWith("raw:")) continue;
    rows.push({
      slug: slugifyAgent(host.name),
      name: host.name,
      strings: [host.name],
      mcp: null,
      skill: null,
      plugin: host.plugin > 0 ? { count: host.plugin, host: host.name } : null,
      total: host.total,
      installable: 0,
      topCategories: [],
      skillOnly: false,
    });
  }

  rows.sort((a, b) => compareHostsByAdoption(a.hostId ?? a.slug, b.hostId ?? b.slug, a.name, b.name));
  return rows;
}

export interface AgentSetupFacts {
  /** Registry id passed to `litespm bridge stdio --host <id>`. */
  hostId?: string;
  displayName: string;
  /** Config format and layout, from the generated adapter registry. */
  format?: "json" | "toml";
  keyPath?: string;
  shape?: string;
  /** Linux-resolved user-scope path, retained for API compatibility. */
  userPath?: string;
  /** Exact per-platform config path, or absent when the host is unsupported. */
  platformPaths?: Partial<Record<PlatformOS, string>>;
  /** Matching host-shaped bridge examples for each supported platform. */
  bridgeSnippets?: Partial<Record<PlatformOS, string>>;
  windowsPathHomeDerived?: boolean;
  projectOnly?: boolean;
  projectScope?: boolean;
  projectPath?: string;
  /** Verified remote (URL) MCP entry spelling exists for this host. */
  remote?: boolean;
  remoteTransports?: string[];
  generic?: boolean;
  /** Upstream MCP configuration docs the adapter was verified against. */
  docsUrl?: string;
  /** Skill directory facts, from the skills registry. */
  skillDirectory?: string;
  skillUniversal?: boolean;
  skillHasGlobal?: boolean;
  /** Copy-paste bridge configuration for this host's own config shape. */
  bridgeSnippet?: string;
  /** One-command alternative that writes the same entry. */
  setupCommand?: string;
}

export interface AgentDetail {
  row: AgentRow;
  setup: AgentSetupFacts;
  /** Breakdown of compatible entries by installability gate. */
  installable: number;
  discoveryOnly: number;
  /** The compatible entries' kind mix, for the detail header. */
  kinds: { mcp: number; skill: number; plugin: number };
  /** Categories the compatible entries land in, largest first. */
  topCategories: Array<{ name: string; count: number }>;
  /** Hand-written note provenance, when one exists. */
  noteSource?: string;
}

async function agentRowById(id: string): Promise<AgentRow | null> {
  const rows = await buildAgentRows();
  // Accept any spelling the registries resolve ("pi" → "pi-agent") as well as
  // the row's own slug and page id.
  const resolvedId = resolveHostId(id) ?? id;
  return (
    rows.find((row) => row.slug === resolvedId || row.pageId === resolvedId || row.slug === id) ??
    null
  );
}

export async function buildAgentDetail(id: string): Promise<AgentDetail | null> {
  const row = await agentRowById(id);
  if (!row) return null;

  const dataset = await getDataset();
  const items = dataset.rows;
  const identity = HOST_IDENTITIES.find((i) => i.id === row.slug);

  // Recompute the compatible set for this host with the one host-matching
  // rule (`hostIdsFor`), then measure the breakdown the detail page prints.
  const compatible: Listing[] = [];
  const kinds = { mcp: 0, skill: 0, plugin: 0 };
  const categories = new Map<string, number>();
  let installable = 0;

  for (const item of items) {
    if (identity) {
      if (!hostIdsFor(item).includes(identity.id)) continue;
    } else if (item.kind !== "plugin") {
      continue;
    } else {
      const declared = item.compatibleHosts ?? [];
      if (
        !declared.some(
          (name) =>
            resolveHostId(name) === null &&
            name.trim().toLowerCase() === row.name.toLowerCase(),
        )
      ) {
        continue;
      }
    }
    compatible.push(item);
    kinds[item.kind] += 1;
    if (availabilityOf(item).installable) installable += 1;
    const category = item.category?.trim();
    if (category) categories.set(category, (categories.get(category) ?? 0) + 1);
  }

  const adapter = HOSTS.find((h) => h.id === identity?.adapter?.id);
  const skillTarget = identity?.skill;
  const note = hostNote(row.slug);

  const platforms: PlatformOS[] = ["win", "mac", "linux"];
  const platformPaths: Partial<Record<PlatformOS, string>> = {};
  const bridgeSnippets: Partial<Record<PlatformOS, string>> = {};
  if (adapter) {
    for (const os of platforms) {
      if (!hostSupportsPlatform(adapter, os)) continue;
      const resolved = hostPath(adapter, os) || (adapter.projectPath ? `<project>/${adapter.projectPath}` : "");
      if (!resolved) continue;
      platformPaths[os] = resolved;
      bridgeSnippets[os] = bridgeSnippet(adapter, "litespm", os);
    }
  }

  const setup: AgentSetupFacts = {
    hostId: adapter?.id,
    displayName: row.name,
    format: adapter?.kind,
    keyPath: adapter?.keyPath,
    shape: adapter?.shape,
    userPath: adapter ? hostPath(adapter, "linux") || undefined : undefined,
    platformPaths: adapter ? platformPaths : undefined,
    bridgeSnippets: adapter ? bridgeSnippets : undefined,
    windowsPathHomeDerived: adapter ? hostPathIsHomeDerived(adapter, "win") : undefined,
    projectOnly: adapter?.projectOnly,
    projectScope: adapter?.projectScope,
    projectPath: adapter?.projectPath,
    remote: adapter?.remote,
    remoteTransports: adapter?.remoteTransports ? [...adapter.remoteTransports] : undefined,
    generic: adapter?.generic,
    docsUrl: adapter?.docsUrl,
    skillDirectory:
      skillTarget && skillTarget.hasGlobal ? undefined : skillTarget ? "project scope only" : undefined,
    skillUniversal: skillTarget?.universal,
    skillHasGlobal: skillTarget?.hasGlobal,
    bridgeSnippet: adapter && bridgeSnippets.linux ? bridgeSnippets.linux : undefined,
    setupCommand: adapter ? `litespm host setup ${adapter.id}` : undefined,
  };

  return {
    row,
    setup,
    installable,
    discoveryOnly: compatible.length - installable,
    kinds,
    topCategories: [...categories.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 6),
    noteSource: note?.source,
  };
}

/** Telemetry helper for the agents page stat strip. */
export async function agentStats() {
  const rows = await buildAgentRows();
  const configured = rows.filter((row) => row.hostId).length;
  const withSkills = rows.filter((row) => row.skill).length;
  const withPlugins = rows.filter((row) => row.plugin).length;
  const totals = rows.reduce((acc, row) => acc + row.total, 0);
  return {
    profiles: rows.length,
    configured,
    withSkills,
    withPlugins,
    totals,
    hosts: HOSTS.length,
    skillTargets: SKILL_TARGETS.length,
  };
}

export { listingIdentity, vendorName };
