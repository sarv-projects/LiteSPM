// The `/agents/` index row model: one row per agent host, not per catalog
// spelling.
//
// The catalog names one host through more than one string. An adapter's
// registry name ("OpenAI Codex CLI") and its skill target's display name
// ("Codex") are different strings for the same host, and a host whose product
// was renamed can carry two skill strings ("Grok" and "Grok Build"). Counting
// the strings separately put the same host on the page twice — sometimes with
// the same displayed name, the same link and two different counts — which a
// reader cannot tell apart and which this module exists to remove.
//
// Two rules keep every number on the page honest:
//
//   1. Counts are counted over ITEMS, once per item. A skill entry lists every
//      skill target, so a host named by two of its strings is one compatible
//      entry, not two; summing per-string facets would double it.
//   2. Each count keeps the catalog string its kind is named by, because that
//      string is what Explore's `?host=` filter matches on. Every number the
//      page links stays equal to the filter it opens.
//
// The join key is the registry id, not the display string: a skill target whose
// display name does not resolve ("Devin for Terminal") still joins the adapter
// its id names ("devin"). `internal/host/registry.go` and
// `internal/skills/agents.go` are the sources of those ids; the alias entries
// in `lib/hosts.ts` cover the two the skill registry appends for the same
// directories ("Pi", "Grok").

import type { Listing } from "../../lib/telemetry";
import { slugifyAgent } from "../../lib/catalog";
import { HOSTS, SKILL_TARGETS, hostsFor, resolveHost } from "../../lib/hosts";
import { vendorName } from "../../lib/vendorNames";

/** One kind's compatible-entry count, and the catalog string it is keyed by. */
export interface KindCount {
  count: number;
  /** The catalog host string Explore's `?host=` filter matches this kind on. */
  host: string;
}

/** One agent host, with only the facts a registry states about it. */
export interface AgentRow {
  /** React key; the adapter id when there is one, a slug of the name otherwise. */
  slug: string;
  /** Display name: the vendor's own spelling for a host with an adapter. */
  name: string;
  /** Present when LiteSPM has a compiled-in adapter for this host. */
  hostId?: string;
  /** Every catalog spelling that resolved into this row. */
  strings: string[];
  /** MCP servers compatible with this host — null when it has no adapter. */
  mcp: KindCount | null;
  /** Skills compatible with this host — null when it has no skill target. */
  skill: KindCount | null;
  /** Plugins whose publisher lists this host — null when none do. */
  plugin: KindCount | null;
  /** Compatible entries in the current snapshot; sorts the list. */
  total: number;
}

/**
 * Which row a catalog host string belongs to, and the adapter id when one
 * exists. String → skill target → adapter, in that order, so a renamed product
 * joins the adapter its skill-target id names.
 */
function identityOf(host: string): { key: string; hostId?: string } {
  const adapter = resolveHost(host);
  if (adapter) return { key: adapter.id, hostId: adapter.id };
  const target = SKILL_TARGETS.find((t) => t.displayName === host);
  if (target) {
    const byId = HOSTS.find((h) => h.id === target.id);
    if (byId) return { key: byId.id, hostId: byId.id };
    return { key: `skill:${target.id}` };
  }
  return { key: `host:${host}` };
}

/** The adapter's own registry string for a resolved host — what its MCP filter uses. */
function mcpString(hostId: string): string {
  return HOSTS.find((h) => h.id === hostId)?.name ?? hostId;
}

/** The skill target's own display name for a resolved host, when one exists. */
function skillString(hostId: string, fallback: string): string {
  return SKILL_TARGETS.find((t) => t.id === hostId)?.displayName ?? fallback;
}

/**
 * Build the row set from the full snapshot. Runs at build time in the route's
 * server component; nothing here crosses to the browser but the resolved rows.
 */
export function buildAgentRows(items: Listing[]): AgentRow[] {
  const rows = new Map<string, AgentRow>();

  for (const item of items) {
    // One item may name a host through several strings; dedupe to one count
    // per host before recording it.
    const seen = new Map<string, { hostId?: string; strings: string[] }>();
    for (const raw of hostsFor(item)) {
      const host = raw.trim();
      if (!host) continue;
      const { key, hostId } = identityOf(host);
      const entry = seen.get(key);
      if (entry) entry.strings.push(host);
      else seen.set(key, { hostId, strings: [host] });
    }

    for (const [key, { hostId, strings }] of seen) {
      let row = rows.get(key);
      if (!row) {
        const name = hostId ? vendorName(hostId, mcpString(hostId)) : strings[0];
        row = {
          slug: hostId ?? slugifyAgent(name),
          name,
          hostId,
          strings: [],
          mcp: null,
          skill: null,
          plugin: null,
          total: 0,
        };
        rows.set(key, row);
      }
      for (const s of strings) if (!row.strings.includes(s)) row.strings.push(s);

      const host =
        item.kind === "mcp" && hostId
          ? mcpString(hostId)
          : item.kind === "skill" && hostId
            ? skillString(hostId, strings[0])
            : strings[0];
      const kind = row[item.kind];
      if (kind) {
        kind.count += 1;
      } else {
        row[item.kind] = { count: 1, host };
      }
      row.total += 1;
    }
  }

  const list = Array.from(rows.values());
  list.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return list;
}
