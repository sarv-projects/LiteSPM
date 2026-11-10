/**
 * The real LiteSPM dataset, loaded once per server process.
 *
 * Every file under `data/litespm/` is the actual generated dataset from the
 * LiteSPM repository: 69,376 raw catalog rows that dedupe to the unique
 * listings the site publishes, the 52 bridge adapters in `hosts.json`, the
 * 81 skills targets, the curated featured shelf, the release manifest and the
 * published CLI version. Nothing here is synthesized.
 *
 * The parsed rows and their derived indexes live in `globalThis`, so route
 * handlers in dev and production share one warm copy instead of re-parsing a
 * 52 MB document per request.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { listingIdentity, normalizeListing, uniqueListings } from "./discovery";
import { validateCommandLine } from "./config-snippet";
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

  // F8: `command`/`args` are publisher data that used to be interpolated raw
  // into the copy-paste host config snippet. The producer enforces the id
  // grammar upstream, but nothing enforced the launch-line shape here, so the
  // loader does it now. Policy is fail-closed and narrow: a row whose launch
  // line exceeds the token allowlist keeps working in browse, search, compare
  // and `litespm install <id>`; only its install snippet is withheld
  // (type-specs.ts honours the mark) and one aggregate warning is logged.
  const withheld: string[] = [];
  for (const row of rows) {
    const command = typeof row.command === "string" ? row.command.trim() : "";
    if (!command) continue; // no launch line to emit, so nothing to withhold
    if (validateCommandLine(command, row.args) !== null) continue;
    row.snippetWithheld = true;
    withheld.push(row.id);
  }
  if (withheld.length > 0) {
    console.warn(
      `[catalog] withheld the install snippet for ${withheld.length} listing(s) whose command/args exceed the allowed token characters: ` +
        `${withheld.slice(0, 5).join(", ")}${withheld.length > 5 ? ", …" : ""}`,
    );
  }

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
// In production every request would otherwise throw away a warm 69k-row
// dataset and re-parse a 52 MB document, which is seconds, not milliseconds.
if (process.env.NODE_ENV !== "production" && globalForDataset.__litespmDataset) {
  globalForDataset.__litespmDataset = undefined;
}

/** The shared dataset promise; resolves once per process. */
export function getDataset(): Promise<Dataset> {
  globalForDataset.__litespmDataset ??= load();
  return globalForDataset.__litespmDataset;
}

/** The published-CLI record (tiny file); callers that only need it must not load the catalog. */
export function getCliReleases(): CliRelease[] {
  try {
    return readJson<CliRelease[]>("published-cli.json");
  } catch {
    return [];
  }
}

/**
 * Read only the tiny release pointer. The suggestion starters need the
 * release id to decide whether their precomputed answers are still valid, and
 * doing that must not pay the 52 MB catalog parse on a cold request.
 */
export function getReleaseId(): string {
  try {
    return readJson<ReleaseManifest>("release.json").releaseId ?? "";
  } catch {
    return "";
  }
}

/**
 * Projection of a Listing that search and the assistant use. The full
 * catalog carries tools, effects, readmes and other fields the retriever never
 * reads; parsing all 60 MB of them costs ~10s on a cold function. The compact
 * file is generated by `scripts/build-search-index.mjs` and is roughly a
 * quarter of the size.
 */
export type SearchListing = Pick<
  Listing,
  | "id"
  | "linkKey"
  | "name"
  | "slug"
  | "kind"
  | "summary"
  | "category"
  | "publisher"
  | "installability"
  | "transport"
  | "runtime"
  | "url"
  | "command"
  | "args"
  | "installHint"
  | "rankScore"
  | "stars"
  | "version"
  | "source"
  | "repository"
  | "artifact"
  | "compatibleHosts"
  | "skillSource"
  | "distributor"
  | "hasUrl"
>;

export interface CompactDataset {
  // The projection is structurally a subset of Listing. Search only reads the
  // projected fields; casting here keeps the shared search types intact.
  rows: Listing[];
  release: ReleaseManifest;
  telemetry: Telemetry;
}

interface SerializedCompactDataset {
  version: 1;
  releaseId: string;
  release: ReleaseManifest;
  telemetry: Telemetry;
  rows: SearchListing[];
}

const globalForCompact = globalThis as unknown as {
  __litespmCompactDataset?: Promise<CompactDataset>;
};

if (process.env.NODE_ENV !== "production" && globalForCompact.__litespmCompactDataset) {
  globalForCompact.__litespmCompactDataset = undefined;
}

/**
 * Load the compact search projection. Missing or stale files fall back to the
 * full dataset so a developer who edits the catalog still gets correct
 * results, just slower.
 */
export function getCompactDataset(): Promise<CompactDataset> {
  globalForCompact.__litespmCompactDataset ??= (async () => {
    const startedAt = Date.now();
    const direct = path.join(process.cwd(), "data");
    const file = existsSync(path.join(direct, "search-catalog.json.gz"))
      ? path.join(direct, "search-catalog.json.gz")
      : path.join(process.cwd(), "data", "litespm", "search-catalog.json.gz");
    if (existsSync(file)) {
      try {
        const serialized = JSON.parse(
          gunzipSync(readFileSync(file)).toString("utf8"),
        ) as SerializedCompactDataset;
        if (serialized.version === 1 && serialized.releaseId === getReleaseId()) {
          console.info(
            `[catalog-search] loaded compact catalog (${serialized.rows.length} rows) in ${Date.now() - startedAt}ms`,
          );
          return {
            rows: serialized.rows as Listing[],
            release: serialized.release,
            telemetry: serialized.telemetry,
          };
        }
      } catch (error) {
        console.warn("[catalog-search] compact catalog could not be loaded; using the full dataset", error);
      }
    }
    const full = await getDataset();
    return { rows: full.rows, release: full.release, telemetry: full.telemetry };
  })();
  return globalForCompact.__litespmCompactDataset;
}

/** Build the compact projection for the dev exporter. */
export async function buildCompactDataset(): Promise<SerializedCompactDataset> {
  const dataset = await getDataset();
  return {
    version: 1,
    releaseId: dataset.release.releaseId,
    release: dataset.release,
    telemetry: dataset.telemetry,
    rows: dataset.rows.map((row) => ({
      id: row.id,
      linkKey: row.linkKey,
      name: row.name,
      slug: row.slug,
      kind: row.kind,
      // The assistant prompt caps summaries at 300 chars and the cards show a
      // short snippet; carrying the full multi-KB summary in the cold-start
      // projection was the bulk of the 47 MB file.
      summary: row.summary?.slice(0, 600) ?? "",
      category: row.category,
      publisher: row.publisher,
      installability: row.installability,
      transport: row.transport,
      runtime: row.runtime,
      url: row.url,
      command: row.command,
      args: row.args,
      installHint: row.installHint,
      rankScore: row.rankScore,
      stars: row.stars,
      version: row.version,
      source: row.source,
      repository: row.repository,
      artifact: row.artifact,
      compatibleHosts: row.compatibleHosts,
      skillSource: row.skillSource,
      distributor: row.distributor,
      hasUrl: row.hasUrl,
    })),
  };
}

export { listingIdentity };
