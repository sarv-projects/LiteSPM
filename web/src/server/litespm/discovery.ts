/**
 * Identity + dedupe helpers ported from the LiteSPM repository's
 * `web/lib/discovery.mjs`, so this UI derives the same 69,311 unique rows the
 * live site serves from the same 69,376 raw rows.
 */

import type { Listing, ListingArtifact } from "./types";

interface RepoRef {
  owner: string;
  name: string;
  url: string;
}

/** Parse a GitHub repository URL into its owner/name/url shape. */
export function repository(repo: string | undefined | null): RepoRef | null {
  if (!repo) return null;
  const match = repo.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return {
    owner: match[1],
    name: match[2].replace(/\.git$/, ""),
    url: `https://github.com/${match[1]}/${match[2].replace(/\.git$/, "")}`,
  };
}

export function normalizeListing(item: Listing): Listing {
  if (item.kind !== "plugin" || (item as Listing & { distributor?: unknown }).distributor) {
    return item;
  }
  const upstream = repository(item.artifact?.repo);
  if (!upstream) return item;
  // A marketplace listing proves distribution, not authorship. Attribute the
  // explicit source owner and retain the original listing provenance separately.
  const name = String(item.publisher?.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const owner = upstream.owner.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (name === owner || `${name}s` === owner) return item;
  return {
    ...item,
    distributor: item.publisher,
    publisher: {
      name: upstream.owner,
      url: upstream.url,
      verified: false,
      provenance: "source-owner",
    },
  };
}

export function listingIdentity(item: Listing): string {
  if (item.discoveryKey) return item.discoveryKey;
  const upstream = repository(item.artifact?.repo);
  if (!upstream) return item.id;
  const artifact: ListingArtifact | undefined = item.artifact;
  const path = String(artifact?.path ?? "").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
  const revision = artifact?.sha || artifact?.ref || item.version || "";
  return [
    item.kind,
    upstream.url.toLowerCase(),
    path,
    revision,
    item.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""),
  ].join("|");
}

export function uniqueListings(rows: Listing[]): Listing[] {
  const seen = new Set<string>();
  return rows.filter((item) => {
    const key = listingIdentity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const RELATED_STOP = new Set(
  "the and for with from your that this server servers mcp agent agents tool tools plugin plugins skill skills data using into".split(
    " ",
  ),
);

function words(item: Listing): Set<string> {
  return new Set(
    `${item.name} ${item.summary ?? ""}`
      .toLowerCase()
      .match(/[\p{L}\p{N}]{3,}/gu)
      ?.filter((w) => !RELATED_STOP.has(w)) ?? [],
  );
}

export interface RelatedResult {
  row: Listing;
  /** Human-readable match signals, e.g. "same kind", "4 shared terms". */
  why: string[];
}
/**
 * Related listings v2 — signal-weighted instead of raw word overlap.
 *
 * Score = shared vocabulary (dominant) + same kind + same goal + same category
 * + a small quality boost from the rank score, so the rail surfaces genuine
 * alternatives rather than near-duplicate re-publications of the same tool.
 * Results are deduplicated by normalized name and capped at two per publisher.
 */
export function relatedListings(
  item: Listing,
  rows: Listing[],
  options: { goalOf?: (row: Listing) => string; limit?: number } = {},
): RelatedResult[] {
  const limit = options.limit ?? 6;
  const own = words(item);
  const ownGoal = options.goalOf?.(item);
  const ownIdentity = listingIdentity(item);
  const ownName = item.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

  const scored: Array<{ row: Listing; score: number; why: string[] }> = [];

  for (const row of uniqueListings(rows)) {
    if (row.id === item.id || listingIdentity(row) === ownIdentity) continue;

    const rowName = row.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (rowName === ownName) continue; // cross-kind twin of the same tool

    const shared = [...words(row)].filter((w) => own.has(w));
    if (shared.length === 0) continue;

    const why: string[] = [];
    let score = shared.length * 2;
    if (shared.length >= 2) why.push(`${shared.length} shared terms`);
    else why.push("1 shared term");

    if (row.kind === item.kind) {
      score += 3;
      why.push("same kind");
    }
    if (options.goalOf && ownGoal && options.goalOf(row) === ownGoal) {
      score += 2;
      why.push("same goal");
    }
    if (row.category && row.category === item.category) {
      score += 1;
      why.push("same category");
    }
    if ((row.rankScore ?? 0) >= 60) score += 1;

    if (/\b(wip|fixture|placeholder|test server)\b/i.test(`${row.name} ${row.summary}`)) continue;
    if (score < 5) continue;

    scored.push({ row, score, why });
  }

  scored.sort(
    (a, b) => b.score - a.score || (b.row.rankScore ?? 0) - (a.row.rankScore ?? 0) || a.row.name.localeCompare(b.row.name),
  );

  // Collapse same-name duplicates and cap two listings per publisher, so one
  // re-published tool can't crowd out genuinely different alternatives.
  const seenNames = new Set<string>([ownName]);
  const publisherCount = new Map<string, number>();
  const out: RelatedResult[] = [];
  for (const { row, why } of scored) {
    const name = row.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (seenNames.has(name)) continue;
    const publisher = row.publisher?.name ?? "";
    if ((publisherCount.get(publisher) ?? 0) >= 2) continue;
    seenNames.add(name);
    publisherCount.set(publisher, (publisherCount.get(publisher) ?? 0) + 1);
    out.push({ row, why });
    if (out.length >= limit) break;
  }
  return out;
}
