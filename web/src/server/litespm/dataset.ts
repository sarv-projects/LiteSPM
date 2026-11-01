/**
 * The real LiteSPM dataset, loaded once per server process.
 *
 * Every file under `data/litespm/` is the actual generated dataset from the
 * LiteSPM repository: 69,376 raw catalog rows that dedupe to the unique
 * listings the site publishes, the 50 bridge adapters in `hosts.json`, the
 * 81 skills targets, the curated featured shelf, the release manifest and the
 * published CLI version. Nothing here is synthesized.
 *
 * The parsed rows and their derived indexes live in `globalThis`, so route
 * handlers in dev and production share one warm copy instead of re-parsing a
 * 52 MB document per request.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { listingIdentity, normalizeListing, uniqueListings } from "./discovery";
import { dedupeKey, rankScore } from "./ranking";
import type { FeaturedShelf, Listing, ReleaseManifest, Telemetry } from "./types";

interface HostRow {
  id: string;
  name: string;
  format: string;
  keyPath?: string;
  shape?: string;
  userPath?: string;
  projectOnly?: boolean;
  docsUrl?: string;
  generic: boolean;
  remote?: boolean;
  projectScope?: boolean;
  projectPath?: string;
  remoteTransports?: string[];
}

interface SkillTargetRow {
  id: string;
  displayName: string;
  universal?: boolean;
  hasGlobal: boolean;
}

interface CliRelease {
  version: string;
  publishedAt?: string;
  notes?: string;
  installFlags?: string[];
}

export interface Dataset {
  /** Unique listings — the catalog the site serves. */
  rows: Listing[];
  /** Raw rows before dedupe — kept for provenance counts. */
  rawCount: number;
  /** id → row, over unique rows. */
  byId: Map<string, Listing>;
  /** linkKey/slug → row. */
  byKey: Map<string, Listing>;
  /** Normalized-name → every row sharing that name (cross-kind / cross-publisher twins). */
  twinsByName: Map<string, Listing[]>;
  hosts: HostRow[];
  skillTargets: SkillTargetRow[];
  release: ReleaseManifest;
  featured: FeaturedShelf;
  cli: CliRelease[];
  telemetry: Telemetry;
}

function getDataDir(): string {
  const direct = path.join(process.cwd(), "data");
  if (existsSync(path.join(direct, "catalog.json"))) return direct;
  return path.join(process.cwd(), "data", "litespm");
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(getDataDir(), file), "utf8")) as T;
}

function linkKeyFor(row: Listing, slugCounts: Map<string, number>): string {
  const collisions = slugCounts.get(row.slug) ?? 0;
  return collisions > 1 ? row.id : row.slug;
}

async function load(): Promise<Dataset> {
  const raw = readJson<Listing[]>("catalog.json");
  const hosts = readJson<HostRow[]>("hosts.json");
  const skillTargets = readJson<SkillTargetRow[]>("skill-targets.json");
  const release = readJson<ReleaseManifest>("release.json");
  const featured = readJson<FeaturedShelf>("featured.json");
  const cli = readJson<CliRelease[]>("published-cli.json");

  const unique = uniqueListings(raw.map(normalizeListing));

  // linkKey: the slug where it is unambiguous, the namespaced id otherwise
  // (`withLinkKeys` in the upstream lib/catalog.ts). Stamped onto the rows
  // themselves so every surface — search hits, detail lookups, compare, the
  // assistant — resolves the same key the same way.
  const slugCounts = new Map<string, number>();
  for (const row of unique) slugCounts.set(row.slug, (slugCounts.get(row.slug) ?? 0) + 1);

  const rows: Listing[] = unique.map((row) => ({ ...row, linkKey: linkKeyFor(row, slugCounts) }));

  // Rank score: deterministic composite of the row's own record fields.
  for (const row of rows) row.rankScore = rankScore(row);

  const byId = new Map<string, Listing>();
  const byKey = new Map<string, Listing>();
  const twinsByName = new Map<string, Listing[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    byKey.set(row.linkKey!, row);
    const twinKey = dedupeKey(row);
    const bucket = twinsByName.get(twinKey);
    if (bucket) bucket.push(row);
    else twinsByName.set(twinKey, [row]);
  }

  const counts = { all: rows.length, mcp: 0, skill: 0, plugin: 0 };
  for (const row of rows) counts[row.kind] += 1;

  const telemetry: Telemetry = {
    itemCount: counts.all,
    createdAt: release.createdAt,
    releaseId: release.releaseId,
    sequence: release.sequence,
    manifestDigest: release.manifestDigest,
    counts,
  };

  return {
    rows,
    rawCount: raw.length,
    byId,
    byKey,
    twinsByName,
    hosts,
    skillTargets,
    release,
    featured,
    cli,
    telemetry,
  };
}

const globalForDataset = globalThis as unknown as {
  __litespmDataset?: Promise<Dataset>;
};

// Dev/HMR: a stale promise from a previous module instance would keep serving
// a dataset built by older loader code. Drop it whenever this module (re)loads.
if (globalForDataset.__litespmDataset) globalForDataset.__litespmDataset = undefined;

/** The shared dataset promise; resolves once per process. */
export function getDataset(): Promise<Dataset> {
  globalForDataset.__litespmDataset ??= load();
  return globalForDataset.__litespmDataset;
}

export { listingIdentity };
