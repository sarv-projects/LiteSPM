// Server-only catalog context for the package routes.
//
// `app/package/page.tsx`, `app/package/[slug]/page.tsx` and the entries
// sitemap all need the same few derivations over the whole snapshot: the row
// count, the host universe, the index slice, the sibling-category set, the
// versioned count and the capped pre-render set. Computing them per page would
// run a 69,376-row pass thousands of times inside one build, so this module
// computes them once per build worker and hands back the same objects.
//
// It imports `data/catalog.json`, so it must only ever be imported from Server
// Components and route modules — never from a `"use client"` module. The pure
// helpers live in `lib/packageEntries.ts`, which stays importable from both
// sides.

import catalogData from "../data/catalog.json";
import type { Listing } from "./telemetry";
import { hostUniverse, sortListings, withLinkKeys } from "./catalog";
import { categorySiblingSlugs } from "./categoryFiles.mjs";
import { publisherSiblingNames } from "./relatedFiles.mjs";
import { selectStaticEntries, staticEntryKey } from "./packageEntries";

export interface PackageCatalogContext {
  /** Every row, keyed with `linkKey` for canonical links. */
  rows: Listing[];
  total: number;
  hostTotal: number;
  /** First twelve rows in the builder's own index order. */
  indexRows: Listing[];
  siblingCategories: string[];
  versioned: number;
  /** The capped set that gets a real page, in curated order. */
  staticEntries: Listing[];
  /** Keys of that set, for O(1) membership checks. */
  staticKeys: Set<string>;
}

let cached: PackageCatalogContext | null = null;

export function catalogContext(): PackageCatalogContext {
  if (cached) return cached;
  const rows = withLinkKeys(catalogData as unknown as Listing[]);
  // The emitter stamps `publisherGroup` into the bucket files; the server-side
  // rows (which feed the pre-rendered pages' `initialItem`) need the same flag
  // from the same predicate, or a pre-rendered page would render a publisher
  // rail the client-resolved page would not — or ask for a file that was never
  // written. One whole-dataset pass, memoized with the rest of this context.
  const grouped = publisherSiblingNames(rows);
  for (const row of rows) {
    if (grouped.has(row.publisher?.name ?? "")) row.publisherGroup = true;
  }
  const staticEntries = selectStaticEntries(rows);
  cached = {
    rows,
    total: rows.length,
    hostTotal: hostUniverse(rows).length,
    indexRows: sortListings(rows, "index").slice(0, 12),
    siblingCategories: categorySiblingSlugs(rows),
    versioned: rows.reduce((n, row) => n + (row.version ? 1 : 0), 0),
    staticEntries,
    staticKeys: new Set(staticEntries.map(staticEntryKey)),
  };
  return cached;
}

/** One pre-rendered row by its key, or null. `staticKeys` is the same set the
 *  pages were generated from, so a key outside it has no page. */
export function staticEntryByKey(key: string): Listing | null {
  const context = catalogContext();
  if (!context.staticKeys.has(key)) return null;
  return context.staticEntries.find((item) => staticEntryKey(item) === key) ?? null;
}
