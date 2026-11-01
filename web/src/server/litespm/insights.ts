/**
 * Catalog insights — the aggregate analytics the Insights dashboard renders.
 *
 * Everything here is measured over the same in-memory unique row set the
 * search engine serves, with the same gates (`availabilityOf`,
 * `classifyListing`, `hostIdsFor`), so a number on the dashboard and a count
 * on Explore cannot disagree. Nothing is estimated or sampled.
 */

import { getDataset } from "./dataset";
import { availabilityOf } from "./availability";
import { classifyListing, GOALS, OTHER_GOAL, type GoalOrOther } from "./taxonomy";
import { rowMetaMap } from "./search";
import { buildAgentRows } from "./agents";
import { HOSTS, SKILL_TARGETS, hostPath } from "./hosts";
import type { Listing } from "./types";

export interface InsightBar {
  label: string;
  value: number;
  /** Secondary breakdown, when it exists (e.g. installable share per kind). */
  sub?: number;
  subLabel?: string;
  href?: string;
}

export interface InsightsResponse {
  release: {
    releaseId: string;
    createdAt: string;
    sequence: number;
    itemCount: number;
    manifestDigest: string;
    datasetDigest: string;
  };
  totals: {
    unique: number;
    raw: number;
    duplicatesRemoved: number;
    installable: number;
    discoveryOnly: number;
    withEndpoint: number;
    publishers: number;
    verifiedPublisherRows: number;
    categories: number;
    sources: number;
  };
  byKind: Array<InsightBar & { id: Listing["kind"] }>;
  byGoal: Array<InsightBar & { id: GoalOrOther; blurb: string }>;
  byInstallability: InsightBar[];
  byTransport: InsightBar[];
  topCategories: InsightBar[];
  topPublishers: InsightBar[];
  bySource: InsightBar[];
  hostLeaderboard: Array<{
    id: string;
    name: string;
    total: number;
    mcp: number;
    skill: number;
    plugin: number;
    hasAdapter: boolean;
    remote: boolean;
    configPath: string;
    format: string;
  }>;
  taxonomyCoverage: {
    mapped: number;
    other: number;
    coverage: number;
    largest: { id: string; label: string; count: number; share: number };
  };
}

const globalForInsights = globalThis as unknown as {
  __litespmInsights?: Promise<InsightsResponse>;
};

export async function getInsights(): Promise<InsightsResponse> {
  globalForInsights.__litespmInsights ??= computeInsights();
  return globalForInsights.__litespmInsights;
}

async function computeInsights(): Promise<InsightsResponse> {
  const dataset = await getDataset();
  const rows = dataset.rows;
  const meta = rowMetaMap(rows);
  const agentRows = await buildAgentRows();

  let installable = 0;
  let withEndpoint = 0;
  let verifiedPublisherRows = 0;
  const publishers = new Set<string>();
  const categories = new Map<string, number>();
  const sources = new Map<string, number>();
  const transports = new Map<string, number>();
  const installability = new Map<string, number>();
  const byKind: Record<Listing["kind"], { total: number; installable: number }> = {
    mcp: { total: 0, installable: 0 },
    skill: { total: 0, installable: 0 },
    plugin: { total: 0, installable: 0 },
  };
  const byGoal = new Map<GoalOrOther, number>();

  for (const row of rows) {
    const m = meta.get(row.id);
    const isInstallable = m?.installable ?? availabilityOf(row).installable;
    if (isInstallable) installable += 1;
    if (row.url) withEndpoint += 1;
    if (row.publisher?.verified) verifiedPublisherRows += 1;
    if (row.publisher?.name) publishers.add(row.publisher.name);

    byKind[row.kind].total += 1;
    if (isInstallable) byKind[row.kind].installable += 1;

    const goal = (m?.goal ?? classifyListing(row)) as GoalOrOther;
    byGoal.set(goal, (byGoal.get(goal) ?? 0) + 1);

    const category = row.category?.trim();
    if (category) categories.set(category, (categories.get(category) ?? 0) + 1);
    if (row.source) sources.set(row.source, (sources.get(row.source) ?? 0) + 1);
    if (row.transport) transports.set(row.transport, (transports.get(row.transport) ?? 0) + 1);
    const instKey = row.installability ?? "discovery_only";
    installability.set(instKey, (installability.get(instKey) ?? 0) + 1);
  }

  const total = rows.length;
  const bars = (map: Map<string, number>, href?: (label: string) => string): InsightBar[] =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, value]) => ({ label, value, href: href?.(label) }));

  const goalBars: Array<InsightBar & { id: GoalOrOther; blurb: string }> = [
    ...GOALS.map((g) => ({
      id: g.id as GoalOrOther,
      label: g.label,
      blurb: g.blurb,
      value: byGoal.get(g.id) ?? 0,
      href: `#/explore?goal=${g.id}`,
    })),
    {
      id: "other" as GoalOrOther,
      label: OTHER_GOAL.label,
      blurb: OTHER_GOAL.blurb,
      value: byGoal.get("other") ?? 0,
      href: "#/explore?goal=other",
    },
  ].sort((a, b) => b.value - a.value);

  const hostLeaderboard = agentRows
    .filter((row) => row.hostId)
    .map((row) => {
      const adapter = HOSTS.find((h) => h.id === row.hostId);
      return {
        id: row.slug,
        name: row.name,
        total: row.total,
        mcp: row.mcp?.count ?? 0,
        skill: row.skill?.count ?? 0,
        plugin: row.plugin?.count ?? 0,
        hasAdapter: Boolean(adapter),
        remote: Boolean(adapter?.remote),
        configPath: adapter ? hostPath(adapter, "linux") : "",
        format: adapter?.kind ?? "",
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const mapped = [...byGoal.entries()]
    .filter(([id]) => id !== "other")
    .reduce((acc, [, count]) => acc + count, 0);
  const other = byGoal.get("other") ?? 0;
  const largestEntry = goalBars.find((g) => g.id !== "other") ?? goalBars[0];

  return {
    release: {
      releaseId: dataset.release.releaseId,
      createdAt: dataset.release.createdAt,
      sequence: dataset.release.sequence,
      itemCount: dataset.release.itemCount,
      manifestDigest: dataset.release.manifestDigest,
      datasetDigest: dataset.release.datasetDigest,
    },
    totals: {
      unique: total,
      raw: dataset.rawCount,
      duplicatesRemoved: dataset.rawCount - total,
      installable,
      discoveryOnly: total - installable,
      withEndpoint,
      publishers: publishers.size,
      verifiedPublisherRows,
      categories: categories.size,
      sources: 0,
    },
    byKind: [
      {
        id: "mcp" as const,
        label: "MCP servers",
        value: byKind.mcp.total,
        sub: byKind.mcp.installable,
        subLabel: "installable",
        href: "#/explore?kind=mcp",
      },
      {
        id: "skill" as const,
        label: "Agent skills",
        value: byKind.skill.total,
        sub: byKind.skill.installable,
        subLabel: "installable",
        href: "#/explore?kind=skill",
      },
      {
        id: "plugin" as const,
        label: "Plugins",
        value: byKind.plugin.total,
        sub: byKind.plugin.installable,
        subLabel: "installable",
        href: "#/explore?kind=plugin",
      },
    ],
    byGoal: goalBars,
    byInstallability: bars(installability),
    byTransport: bars(transports).slice(0, 10),
    topCategories: bars(categories).slice(0, 15),
    topPublishers: bars(publisherCounts(rows)).slice(0, 15),
    bySource: [],
    hostLeaderboard,
    taxonomyCoverage: {
      mapped,
      other,
      coverage: total === 0 ? 0 : mapped / total,
      largest: {
        id: largestEntry.id,
        label: largestEntry.label,
        count: largestEntry.value,
        share: total === 0 ? 0 : largestEntry.value / total,
      },
    },
  };
}

function publisherCounts(rows: Listing[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = row.publisher?.name;
    if (name) map.set(name, (map.get(name) ?? 0) + 1);
  }
  return map;
}
