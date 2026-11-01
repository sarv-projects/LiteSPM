/**
 * Package detail assembly: the full record the entry page prints, the
 * publisher's provenance, the hosts the entry names, related listings and the
 * try-it prompts — every field the upstream dataset carries for the row,
 * nothing invented.
 */

import { getDataset } from "./dataset";
import { availabilityOf } from "./availability";
import { hostsNamedBy, resolveHostId, hostIdentity } from "./identity";
import { tryPrompts } from "./try-prompts";
import { relatedListings } from "./discovery";
import { dedupeKey, rankScoreBreakdown } from "./ranking";
import { classifyListing, GOAL_LABELS } from "./taxonomy";
import { hostsFor } from "./hosts";
import { buildMcpSpec, buildSkillSpec, buildPluginSpec } from "./type-specs";
import type { Listing } from "./types";

export interface PackageDetailResponse {
  found: boolean;
  detail?: PackageDetailData;
}

export interface PackageDetailData {
  id: string;
  linkKey: string;
  name: string;
  slug: string;
  kind: Listing["kind"];
  summary: string;
  category: string;
  goal: string;
  goalLabel: string;
  publisher: {
    name: string;
    verified: boolean;
    provenance?: string;
    url?: string;
  };
  distributor?: { name: string; verified: boolean; url?: string } | null;
  source?: string;
  installability?: string;
  installable: boolean;
  availability: {
    id: string;
    label: string;
    plain: string;
    installable: boolean;
  };
  transport?: string | null;
  runtime?: string | null;
  url?: string | null;
  version: string | null;
  stars: number | null;
  command?: string | null;
  args?: string[] | null;
  installHint?: string;
  skillSource?: string;
  artifact?: {
    type?: string;
    repo?: string;
    path?: string;
    ref?: string;
    sha?: string;
    pinned?: boolean;
    declaredAs?: string;
  } | null;
  compatibleHosts?: string[];
  hosts: Array<{ value: string; name: string; adapter: boolean; hostId?: string }>;
  /** Every agent this entry can be installed into, for the target dropdown. */
  installTargets: Array<{ id: string; name: string }>;
  /** The same tool published under other kinds or publishers. */
  alsoAvailable: Array<{
    linkKey: string;
    name: string;
    kind: Listing["kind"];
    publisher: string;
    installable: boolean;
  }>;
  /** Composite quality score and its tier, for the badge. */
  rankScore: number;
  prompts: ReturnType<typeof tryPrompts>;
  related: Array<{
    id: string;
    linkKey: string;
    name: string;
    kind: Listing["kind"];
    summary: string;
    publisher: string;
    why: string[];
    rankScore: number;
  }>;
  tools: Array<{ name: string; description: string }>;
  effects: Array<{ effect: string; declaredBy: string }>;
  readme?: string;
  rankBreakdown?: ReturnType<typeof rankScoreBreakdown>;
  mcpSpec?: ReturnType<typeof buildMcpSpec>;
  skillSpec?: ReturnType<typeof buildSkillSpec>;
  pluginSpec?: ReturnType<typeof buildPluginSpec>;
}

export async function getPackageDetail(key: string): Promise<PackageDetailResponse> {
  const dataset = await getDataset();
  const decoded = decodeURIComponent(key).trim();

  const row =
    dataset.byKey.get(decoded) ??
    dataset.byId.get(decoded) ??
    // Accept the namespaced id even when pasted with its prefix separators.
    dataset.byId.get(decoded.replace(/^\//, ""));

  if (!row) return { found: false };

  const availability = availabilityOf(row);
  const goal = classifyListing(row);
  const related = relatedListings(row, dataset.rows, {
    goalOf: (r) => classifyListing(r),
    limit: 6,
  });

  // Install targets: every host (or skill target) this entry can land in.
  // MCP local rows → all 50 hosts; remote MCP → the remote-capable subset;
  // skills → the 81 skill targets with a global directory; plugins → declared.
  const targetNames = hostsFor(row);
  const installTargets: Array<{ id: string; name: string }> = [];
  if (row.kind === "plugin") {
    for (const name of targetNames) installTargets.push({ id: name, name });
  } else if (row.kind === "skill") {
    for (const target of dataset.skillTargets) {
      if (targetNames.includes(target.displayName)) {
        installTargets.push({ id: target.id, name: target.displayName });
      }
    }
  } else {
    for (const host of dataset.hosts) {
      if (targetNames.includes(host.name)) installTargets.push({ id: host.id, name: host.name });
    }
  }

  // Twins: same normalized name under another kind or publisher.
  const twins = (dataset.twinsByName.get(dedupeKey(row)) ?? []).filter(
    (t) => t.id !== row.id && t.linkKey,
  );

  return {
    found: true,
    detail: {
      id: row.id,
      linkKey: row.linkKey ?? row.slug,
      name: row.name,
      slug: row.slug,
      kind: row.kind,
      summary: row.summary ?? "",
      category: row.category ?? "",
      goal,
      goalLabel: GOAL_LABELS[goal] ?? goal,
      publisher: {
        name: row.publisher?.name ?? "",
        verified: Boolean(row.publisher?.verified),
        url: row.publisher?.url,
      },
      distributor: row.distributor
        ? {
            name: row.distributor.name,
            verified: Boolean(row.distributor.verified),
            url: row.distributor.url,
          }
        : null,
      installability: row.installability,
      installable: availability.installable,
      availability: {
        id: availability.id,
        label: availability.label,
        plain: availability.plain,
        installable: availability.installable,
      },
      transport: row.transport ?? null,
      runtime: row.runtime ?? null,
      url: row.url ?? null,
      version: row.version ?? null,
      stars: row.stars ?? null,
      command: row.command ?? null,
      args: row.args ?? null,
      installHint: row.installHint,
      skillSource: row.skillSource,
      artifact: row.artifact
        ? {
            type: row.artifact.type,
            repo: row.artifact.repo,
            path: row.artifact.path,
            ref: row.artifact.ref,
            sha: row.artifact.sha,
            pinned: row.artifact.pinned,
            declaredAs: row.artifact.declaredAs,
          }
        : null,
      compatibleHosts: row.compatibleHosts,
      installTargets,
      alsoAvailable: twins.slice(0, 4).map((t) => ({
        linkKey: t.linkKey!,
        name: t.name,
        kind: t.kind,
        publisher: t.publisher?.name ?? "",
        installable: availabilityOf(t).installable,
      })),
      rankScore: row.rankScore ?? 0,
      hosts: hostsNamedBy(row).map((host) => {
        const id = resolveHostId(host.name) ?? resolveHostId(host.value);
        const identity = id ? hostIdentity(id) : undefined;
        return {
          value: host.value,
          name: host.name,
          adapter: Boolean(host.adapter),
          hostId: identity?.id,
        };
      }),
      prompts: tryPrompts(row),
      related: related.map(({ row: r, why }) => ({
        id: r.id,
        linkKey: r.linkKey ?? r.slug,
        name: r.name,
        kind: r.kind,
        summary: r.summary ?? "",
        publisher: r.publisher?.name ?? "",
        why,
        rankScore: r.rankScore ?? 0,
      })),
      tools: (row.tools ?? []).map((t) => ({ name: t.name, description: t.description ?? "" })),
      effects: (row.effects ?? []).map((e) => ({
        effect: e.effect,
        declaredBy: e.declaredBy,
      })),
      readme: row.readme,
      rankBreakdown: rankScoreBreakdown(row),
      mcpSpec: row.kind === "mcp" ? buildMcpSpec(row) : undefined,
      skillSpec: row.kind === "skill" ? buildSkillSpec(row) : undefined,
      pluginSpec: row.kind === "plugin" ? buildPluginSpec(row) : undefined,
    },
  };
}

/** Home page curated shelf, resolved against the catalog at request time. */
export async function getFeaturedShelf() {
  const dataset = await getDataset();
  const shelf = dataset.featured;

  const groups = shelf.groups.map((group) => ({ ...group }));

  const entries = shelf.entries
    .map((entry) => {
      const row = dataset.byId.get(entry.id);
      if (!row) return null;
      const group = shelf.groups.find((g) => g.id === entry.group);
      const availability = availabilityOf(row);
      return {
        group: entry.group,
        groupTitle: group?.title ?? entry.group,
        viewAllLabel: group?.viewAllLabel ?? "View all",
        viewAllHref: group?.viewAllHref ?? "/#explore",
        useCase: entry.useCase,
        id: row.id,
        linkKey: row.linkKey ?? row.slug,
        name: row.name,
        kind: row.kind,
        summary: row.summary ?? "",
        category: row.category ?? "",
        publisher: row.publisher?.name ?? "",
        publisherVerified: Boolean(row.publisher?.verified),
        transport: row.transport ?? null,
        version: row.version ?? null,
        installable: availability.installable,
        availabilityLabel: availability.label,
        source: row.source,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    groups,
    entries,
    releaseId: dataset.release.releaseId,
  };
}
