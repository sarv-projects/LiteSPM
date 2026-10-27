// The `/agents/` index row model: one row per agent host, not per catalog
// spelling.
//
// The catalog can name one host through more than one string. An adapter's
// registry name ("OpenAI Codex CLI") and its skill target's display name
// ("Codex") may be alternate spellings for one ID. Distinct IDs such as Pi / Pi
// Agent and Grok CLI / Grok Build remain separate rows.
//
// The row set is now the registry's own identity list (`lib/hostIdentity.ts`),
// so a host cannot drop off the page for want of a catalog string, and every
// count is the number of items that name the host — counted once per item,
// however many of its strings resolve to the identity. Each count keeps the
// catalog string its kind is named by, because that string is what Explore's
// `?host=` filter accepts. Every number the page links stays equal to the
// filter it opens.
//
// A string no registry resolves is still a host the catalog names, so it keeps
// its own row (none exists in the current snapshot).

import type { Listing } from "../../lib/telemetry";
import { slugifyAgent } from "../../lib/catalog";
import { HOST_IDENTITIES, tallyHosts } from "../../lib/hostIdentity";

/** One kind's compatible-entry count, and the catalog string it is keyed by. */
export interface KindCount {
  count: number;
  /** A spelling of this host Explore's `?host=` filter accepts for this kind. */
  host: string;
}

/** One agent host, with only the facts a registry states about it. */
export interface AgentRow {
  /** React key; the registry id (a slug of the name for an unresolved host). */
  slug: string;
  /**
   * The host's own page, when it has one.
   *
   * Every host the catalog names has a page now (`/agents/<id>/`): the fifty
   * with a compiled-in configuration adapter and the twenty-nine that take
   * skills only. A spelling no registry resolves has no page — there is no
   * registry row to build one from — and its row links to Explore instead, so
   * the index never names a destination that 404s.
   */
  pageId?: string;
  /** Display name: the vendor's own spelling for a host with an adapter. */
  name: string;
  /** Present when LiteSPM has a compiled-in adapter for this host. */
  hostId?: string;
  /** Every catalog spelling that resolves into this row. */
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
 * Build the row set from the full snapshot. Runs at build time in the route's
 * server component; nothing here crosses to the browser but the resolved rows.
 *
 * One pass over the items feeds every row: `tallyHosts` resolves each item's
 * strings to identities and counts the item once per identity it names.
 */
export function buildAgentRows(items: Listing[]): AgentRow[] {
  const tally = tallyHosts(items);

  const rows: AgentRow[] = HOST_IDENTITIES.map((identity) => {
    const counts = tally.get(identity.id);
    return {
      slug: identity.id,
      pageId: identity.id,
      name: identity.name,
      hostId: identity.adapter?.id,
      strings: identity.strings.slice(),
      // A registry row's absence is "no data", rendered as nothing; a row
      // whose registry exists keeps its count, a measured zero included.
      mcp: identity.adapter
        ? { count: counts?.mcp ?? 0, host: identity.adapter.name }
        : null,
      skill: identity.skill
        ? { count: counts?.skill ?? 0, host: identity.skill.displayName }
        : null,
      plugin:
        counts && counts.plugin > 0 ? { count: counts.plugin, host: identity.name } : null,
      total: counts?.total ?? 0,
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
    });
  }

  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return rows;
}
