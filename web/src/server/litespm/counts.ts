/**
 * The one place the site's catalog numbers come from.
 *
 * Four different numbers describe "how many things are in the catalog", and
 * each answers a different question. They are computed here once per process
 * and every surface (announcement bar, home hero, docs, marketplace header,
 * methodology page) reads this object instead of deriving its own:
 *
 *   catalogRows     rows in the release file, before any dedupe
 *                   (release.json itemCount)
 *   uniqueListings  rows left after exact-duplicate removal by source
 *                   identity (uniqueListings() in discovery.ts). THE headline
 *                   figure: "N listings".
 *   distinctTools   distinct normalized names (dedupeKey in ranking.ts). The
 *                   marketplace result total, because search collapses
 *                   same-name listings from different publishers into one.
 *   installable     unique listings `litespm install` can complete
 *                   (availabilityOf(row).installable)
 */

import { availabilityOf } from "./availability";
import { getCompactDataset } from "./dataset";
import { dedupeKey } from "./ranking";

export interface CatalogCounts {
  catalogRows: number;
  uniqueListings: number;
  distinctTools: number;
  installable: number;
  discoveryOnly: number;
  byKind: { mcp: number; skill: number; plugin: number };
  /** Unique listings per domain installability level (a missing level counts as discovery_only). */
  byInstallability: Record<string, number>;
}

const globalForCounts = globalThis as unknown as {
  __litespmCatalogCounts?: Promise<CatalogCounts>;
};

if (process.env.NODE_ENV !== "production" && globalForCounts.__litespmCatalogCounts) {
  globalForCounts.__litespmCatalogCounts = undefined;
}

async function compute(): Promise<CatalogCounts> {
  const dataset = await getCompactDataset();
  const names = new Set<string>();
  const byKind = { mcp: 0, skill: 0, plugin: 0 };
  const byInstallability: Record<string, number> = {};
  let installable = 0;
  for (const row of dataset.rows) {
    const level = row.installability ?? "discovery_only";
    byInstallability[level] = (byInstallability[level] ?? 0) + 1;
    names.add(dedupeKey(row));
    byKind[row.kind] += 1;
    if (availabilityOf(row).installable) installable += 1;
  }
  return {
    catalogRows: dataset.release.itemCount,
    uniqueListings: dataset.rows.length,
    distinctTools: names.size,
    installable,
    discoveryOnly: dataset.rows.length - installable,
    byKind,
    byInstallability,
  };
}

/** Computed once per process and shared. */
export function getCatalogCounts(): Promise<CatalogCounts> {
  globalForCounts.__litespmCatalogCounts ??= compute();
  return globalForCounts.__litespmCatalogCounts;
}
