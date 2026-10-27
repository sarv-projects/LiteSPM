import { uniqueListings } from "../../lib/discovery.mjs";
import catalogData from "../../data/catalog.json";
import type { Listing } from "../../lib/telemetry";
import {
  categoryIndex,
  kindBreakdown,
  kindLabel,
  publisherFacets,
  withLinkKeys,
} from "../../lib/catalog";
import { HOSTS, SKILL_TARGETS } from "../../lib/hosts";
import { vendorName } from "../../lib/vendorNames";
import { buildAgentRows } from "../agents/agentRows";
import type { TrendingHostRow, TrendingViewProps } from "./TrendingView";
import type { Metadata } from "next";
import TrendingRoute from "./TrendingRoute";

export const metadata: Metadata = {
  title: "Catalog coverage",
  description:
    "What the catalog contains: entries per capability kind, agent host, category and publisher.",
  alternates: { canonical: "/insights/" },
  openGraph: { title: "Catalog coverage · LiteSPM", url: "/insights/" },
};

/**
 * Server Component: the coverage boards are counts over the full snapshot,
 * computed at build time. Rows are never rendered here, so the browser gets a
 * few hundred bytes of board data and no reason to fetch the dataset at all.
 *
 * The agent-host board reads `hosts.json` (config facts), `skill-targets.json`
 * (skills targets), `release.json` (kind totals) and `lib/adapterSources.ts`
 * (the hand-written adapters' own files) — the same registries `/agents/` and
 * `/compare` render, and the per-host counts come from `buildAgentRows`, so
 * the three pages cannot disagree about a host's compatible-entry total.
 */
export default function InsightsPage() {
  const items = withLinkKeys(catalogData as unknown as Listing[]);

  const categories = categoryIndex(items);
  const publishers = publisherFacets(items, Number.MAX_SAFE_INTEGER);

  const rows = buildAgentRows(items);
  const byHostId = new Map(rows.filter((row) => row.hostId).map((row) => [row.hostId!, row]));
  const hosts: TrendingHostRow[] = HOSTS.map((host) => {
    const row = byHostId.get(host.id);
    const skillTarget = SKILL_TARGETS.find((target) => target.id === host.id);
    return {
      id: host.id,
      name: vendorName(host.id, host.name),
      format: host.kind,
      configPath: host.userPath,
      repoConfigPath: host.projectPath,
      skillName: skillTarget ? vendorName(host.id, skillTarget.displayName) : undefined,
      skillTargetName: skillTarget?.displayName,
      docsHref: host.docsUrl,
      mcp: row?.mcp?.count ?? null,
      skill: row?.skill?.count ?? null,
      plugin: row?.plugin?.count ?? null,
      total: row?.total ?? null,
    };
  });
  // Alphabetical, because the catalog publishes no popularity or usage figure
  // and the compatible-entry total is near-constant by construction — sorting
  // by it would imply a ranking the data does not carry.
  hosts.sort((a, b) => a.name.localeCompare(b.name));

  const props: TrendingViewProps = {
    total: uniqueListings(items).length,
    boards: {
      categories: categories
        .slice(0, 15)
        .map((c) => ({ label: c.name, count: c.count })),
      publishers: publishers.slice(0, 15).map((p) => ({ label: p.name, count: p.count })),
      kinds: kindBreakdown(items)
        .map((k) => ({ label: kindLabel(k.kind), count: k.count, kind: k.kind }))
        .sort((a, b) => b.count - a.count),
    },
    hosts,
    // The counted boards render 15 rows each; these are the whole-snapshot
    // counts, so the truncation is stated on the page instead of silently
    // implied. The host board renders every adapter host and needs no total.
    boardTotals: {
      categories: categories.length,
      publishers: publishers.length,
    },
  };

  return <TrendingRoute {...props} />;
}
