// The publisher- and source-sibling rules, in one place for the two sides that
// must agree.
//
// `scripts/emit-catalog-shards.mjs` writes two more shard families beside the
// category files, and the entry page's related rail fetches them:
//
//   public/data/pkg/pub/<stem>.json   one publisher's rows
//   public/data/pkg/src/<slug>.json   one catalog source's rows
//
// Why these are keyed differently:
//
//   * A publisher name is free text (30,269 distinct values in the 2026-10-15
//     snapshot, including case variants like `Anthropic` / `anthropics` and
//     names that are not path-safe), so the file stem is a hash of the exact
//     name. The browser computes the same hash from the row it is showing —
//     `publisherFileStem` is the single implementation both sides call.
//     FNV-1a 64-bit in hex: short enough to read in a network panel, wide
//     enough that a collision across 30k names is not a practical concern,
//     and the client filters the file by exact name anyway, so even a
//     collision could only make a file larger, never wrong.
//
//   * A source id is a small closed set (`builtin:mcp-registry`,
//     `git:cursor-plugins`, …), so its file stem is the slugified id —
//     readable in logs and shared with the category rule's slugify.
//
// A publisher file is only written when the publisher has at least
// `PUBLISHER_SIBLING_MIN` rows: with one row there is no sibling to show, and
// emitting 24,983 single-row files would nearly triple the deploy's file count
// for rails that can never render. The row carries the answer as
// `publisherGroup` (stamped by the emitter into the bucket files and by
// `lib/packageServer.ts` onto the server-side rows), so the browser knows not
// to ask for a file that was never written — the same "agree by construction"
// rule the category files live by.
//
// Both families are bounded to `RELATED_SLICE_ROWS` rows, in catalog order,
// for the same reason the category files are: a rail shows six items, the
// 40,083-row registry source cannot be a single fetch, and the deterministic
// slice is the same rows for every entry of that publisher/source. The
// "see all" link beside the rail is the complete list.
//
// Plain `.mjs` rather than `.ts` on purpose: the Node build scripts cannot
// import TypeScript, and `allowJs` is on in `tsconfig.json`, so the TypeScript
// callers still get types from the JSDoc.

import { categorySlug } from "./categoryFiles.mjs";

/**
 * Rows a publisher needs before its file is worth emitting. Two is the
 * semantic minimum: with one row there is no sibling to show.
 */
export const PUBLISHER_SIBLING_MIN = 2;

/**
 * Rows a publisher or source file is capped to, in catalog order. The rail
 * shows six; the rest is headroom for the item itself and for display
 * filtering.
 */
export const RELATED_SLICE_ROWS = 48;

/** FNV-1a 64-bit over UTF-16 code units, as a plain hex string. */
function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash;
}

/**
 * The `pub/` filename stem for one exact publisher name. Both sides call this;
 * no other hashing of publisher names exists.
 */
export function publisherFileStem(name) {
  return fnv1a64(name).toString(16).padStart(16, "0");
}

/** The `src/` filename stem for one source id (same slugify as categories). */
export function sourceFileSlug(id) {
  return categorySlug(id);
}

/**
 * The publisher names that have a `pub/` file, from the dataset itself. The
 * emitter writes a file for each; `lib/packageServer.ts` stamps the boolean
 * onto the rows so the browser fetches only where a file exists.
 *
 * @param {Array<{ publisher?: { name?: string } }>} rows
 * @returns {Set<string>}
 */
export function publisherSiblingNames(rows) {
  const counts = new Map();
  for (const row of rows) {
    const name = row.publisher?.name;
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const names = new Set();
  for (const [name, count] of counts) {
    if (count >= PUBLISHER_SIBLING_MIN) names.add(name);
  }
  return names;
}

/**
 * The bounded, deterministic slice a file holds, in the order it was handed
 * (catalog order, which is the builder's own order).
 *
 * @template T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function relatedSlice(rows) {
  return rows.length > RELATED_SLICE_ROWS ? rows.slice(0, RELATED_SLICE_ROWS) : rows;
}
