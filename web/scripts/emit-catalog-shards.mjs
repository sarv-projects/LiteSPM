#!/usr/bin/env node
// Emits the browser-served catalog shards into `web/public/data/`.
//
// The served dataset outgrew Cloudflare's hard 25 MiB per-file limit, so the
// single `/data/catalog.json` document is replaced by a small index plus an
// ordered list of shard files, each a complete JSON array of rows. The build
// generates them from `web/data/catalog.json` (the same file the Server
// Components import at build time), so the rows the reader fetches on demand
// are the rows the HTML was rendered from.
//
// Determinism is a requirement: the same source must produce byte-identical
// output, so every output is a pure function of the parsed rows and the source
// bytes (JSON.stringify key order is insertion order, and every document is
// built in a fixed order here). The index carries the sha256 of each shard so
// the deploy audit can verify them without a second source of truth.
//
// The same pass also emits the two search artifacts the browser actually
// searches with (`lib/searchFormat.mjs` owns their byte layout):
//
//   catalog-search-index.bin.gz  vocabulary + delta-varint postings
//   catalog-search-rows.bin.gz   the display projection for every row
//
// Both are gzipped at build time rather than left to the CDN, because a
// binary `application/octet-stream` asset is not on Cloudflare's compressible
// type list; gzip keeps the transport independent of the edge. `node:zlib`'s
// gzip output is deterministic for a given Node build, and
// `scripts/check-search-index.mjs` re-emits both artifacts and fails on any
// byte difference.
//
// No dependencies: node + stdlib only.

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  buildDisplayRows,
  buildDisplayShards,
  buildSearchIndex,
  encodeContainer,
  encodeDisplayRows,
  encodeSearchIndex,
  SEARCH_SHARD_ROWS,
  SECTION_INDEX,
  SECTION_ROWS,
} from "../lib/searchFormat.mjs";
import { categorySlug, SIBLING_CATEGORY_MAX } from "../lib/categoryFiles.mjs";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourcePath = path.join(webRoot, "data", "catalog.json");
const outDir = path.join(webRoot, "public", "data");

// Headroom under Cloudflare's 25 MiB per-file cap: a shard is split at ROW
// boundaries (never mid-row), and the budget is enforced on the exact bytes
// written, so no emitted file can approach the cap.
const MAX_SHARD_BYTES = 20 * 1024 * 1024;
const INDEX_FILE = "catalog.json";
const SCHEMA = "litespm-web-shards/v1";

const sha256 = (buf) => `sha256:${createHash("sha256").update(buf).digest("hex")}`;

const source = readFileSync(sourcePath);
const rows = JSON.parse(source.toString("utf8"));
if (!Array.isArray(rows)) {
  console.error(`✖ ${sourcePath} is not a JSON array`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// Remove previously generated files so a row-count change cannot leave
// stale higher-numbered shards next to a fresh index.
for (const name of readdirSync(outDir)) {
  if (/^catalog(-\d{4})?\.json$/.test(name)) {
    rmSync(path.join(outDir, name));
  }
}

const shards = [];
let parts = [];
let bytes = 3; // the enclosing `[`, `]` and trailing `\n`
let index = 0;

const flush = () => {
  if (parts.length === 0) return;
  const body = `[${parts.join(",")}]\n`;
  const file = `catalog-${String(index).padStart(4, "0")}.json`;
  const buf = Buffer.from(body, "utf8");
  writeFileSync(path.join(outDir, file), buf);
  shards.push({ digest: sha256(buf), file, size: buf.length });
  index += 1;
  parts = [];
  bytes = 3;
};

for (const row of rows) {
  const part = JSON.stringify(row);
  const partBytes = Buffer.byteLength(part, "utf8");
  // Close the current shard before adding a row that would reach the budget.
  if (parts.length > 0 && bytes + 1 + partBytes >= MAX_SHARD_BYTES) flush();
  if (parts.length > 0) bytes += 1; // the separating comma
  bytes += partBytes;
  parts.push(part);
}
flush();

// Keys in sorted order; two-space indent; trailing newline.
const indexDoc = {
  datasetDigest: sha256(source),
  rowCount: rows.length,
  schema: SCHEMA,
  shards,
};
writeFileSync(
  path.join(outDir, INDEX_FILE),
  `${JSON.stringify(indexDoc, null, 2)}\n`,
);

const largest = shards.reduce((m, s) => Math.max(m, s.size), 0);
console.log(
  `✔ catalog shards: ${shards.length} shard(s), ${rows.length} rows, ` +
    `largest ${(largest / 1024 / 1024).toFixed(2)} MiB → ${path.relative(process.cwd(), outDir)}`,
);

// ---------------------------------------------------------------------------
// Product-page lookups.
//
// The ordered shards above exist for Explore, which searches the whole catalog
// and therefore needs all of it. A product page needs one row, two counts, and
// a handful of same-category siblings — but it resolved all of that through the
// same full-shard fetch, which measured at 44.5 MB to render a single page
// (against 649 KB for Explore, 735 KB for the home page). On a phone that is
// minutes of download to read one listing.
//
// So the rows are also written as a hash partition keyed by slug. The browser
// computes the same bucket from the slug in the URL and fetches ~190 KB.
//
// The bucket function must agree with `bucketForSlug` in `lib/catalogData.ts`
// byte for byte; FNV-1a 32-bit is used there for exactly that reason — it is
// short enough to mirror by hand and has no library behind it to diverge.
// ---------------------------------------------------------------------------
const BUCKETS = 256;
const PKG_DIR = path.join(outDir, "pkg");

function bucketFor(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % BUCKETS;
}

// A previous run's buckets must not survive a row-count change, for the same
// reason the ordered shards are removed above.
rmSync(PKG_DIR, { recursive: true, force: true });
mkdirSync(PKG_DIR, { recursive: true });

const buckets = Array.from({ length: BUCKETS }, () => []);
let versioned = 0;
let slugBucketExtras = 0;
const seenSlugs = new Set();
for (const row of rows) {
  if (row.version) versioned += 1;

  // A row must be reachable from whichever key a link used.
  //
  // `?slug=` carries a slug for most entries but an **id** for others — every
  // entry that links by id, e.g. `skill:anthropics:docx`, arrives with a colon
  // in the parameter. The browser hashes whatever the URL holds, so a row has
  // to be filed under the bucket of each key it answers to; filing by slug
  // alone made every id-keyed page report "not in this catalog snapshot".
  const idBucket = bucketFor(row.id);
  buckets[idBucket].push(row);

  // Slugs are filed first-wins, matching `buildLookup`: 69,376 rows share only
  // 57,112 distinct slugs, and `mcp` alone is claimed by thousands. Without
  // this the `mcp` bucket held 2,181 rows, 8x the average, and those duplicate
  // rows could never have been resolved anyway.
  if (!seenSlugs.has(row.slug)) {
    seenSlugs.add(row.slug);
    const slugBucket = bucketFor(row.slug);
    if (slugBucket !== idBucket) {
      buckets[slugBucket].push(row);
      slugBucketExtras += 1;
    }
  }
}

const counts = { total: rows.length, versioned };
const bucketFiles = [];
for (let i = 0; i < BUCKETS; i += 1) {
  const doc = { counts, rows: buckets[i], schema: "litespm-web-pkg/v1" };
  const body = `${JSON.stringify(doc)}\n`;
  const file = `${String(i).padStart(3, "0")}.json`;
  const buf = Buffer.from(body, "utf8");
  writeFileSync(path.join(PKG_DIR, file), buf);
  bucketFiles.push(buf.length);
}

// Siblings for the "Also in <category>" list.
//
// Only for categories small enough that "related" means something: the two
// largest hold 45,373 and 19,209 rows, where twelve arbitrary entries are noise
// and the existing "see all" link is the honest answer. The rest total a few
// thousand rows and cost ~3 MB across the set.
//
// `lib/categoryFiles.mjs` owns the rule, because `app/package/page.tsx` has to
// compute the same set at build time and hand it to the page — a category
// without a file must never be requested at all.
const CAT_DIR = path.join(PKG_DIR, "cat");
mkdirSync(CAT_DIR, { recursive: true });

const byCategory = new Map();
for (const row of rows) {
  const key = row.category || "";
  if (!key) continue;
  if (!byCategory.has(key)) byCategory.set(key, []);
  byCategory.get(key).push(row);
}

let categoryFiles = 0;
for (const [name, group] of byCategory) {
  if (group.length > SIBLING_CATEGORY_MAX) continue;
  const slug = categorySlug(name);
  if (!slug) continue;
  writeFileSync(path.join(CAT_DIR, `${slug}.json`), `${JSON.stringify(group)}\n`);
  categoryFiles += 1;
}

console.log(
  `✔ product lookups: ${BUCKETS} bucket(s) (${(Math.max(...bucketFiles) / 1024).toFixed(0)} KiB largest, ` +
    `${(Math.min(...bucketFiles) / 1024).toFixed(0)} KiB smallest; ` +
    `${slugBucketExtras} slug-key extra(s)) ` +
    `+ ${categoryFiles} category file(s) → ${path.relative(process.cwd(), PKG_DIR)}`,
);

// ---------------------------------------------------------------------------
// Search artifacts.
//
// Explore and the landing-page search no longer concatenate the ordered shards
// to answer a keystroke: they query the postings index and hydrate the matched
// rows from the display projection. Both are emitted from the same parsed rows
// in the same pass, so a dataset regeneration regenerates them automatically
// and the two cannot describe different datasets.
//
// The index is built from the fields `listingText` defines — the exact fields
// `matchesQuery` reads — so the index and the build-time topic counts answer
// with the same row set. `scripts/check-search-index.mjs` asserts that over the
// real dataset for a query corpus, and re-emits to assert byte stability.
// ---------------------------------------------------------------------------
const SEARCH_INDEX_FILE = "catalog-search-index.bin.gz";
const SEARCH_ROWS_FILE = "catalog-search-rows.bin.gz";

const searchIndex = buildSearchIndex(rows);
const searchIndexRaw = encodeContainer([
  { kind: SECTION_INDEX, payload: encodeSearchIndex(searchIndex) },
]);
const searchIndexGz = gzipSync(searchIndexRaw, { level: 9 });
writeFileSync(path.join(outDir, SEARCH_INDEX_FILE), searchIndexGz);

const displayRows = buildDisplayRows(rows);
const searchRowsRaw = encodeContainer([
  { kind: SECTION_ROWS, payload: encodeDisplayRows(displayRows) },
]);
const searchRowsGz = gzipSync(searchRowsRaw, { level: 9 });
writeFileSync(path.join(outDir, SEARCH_ROWS_FILE), searchRowsGz);

// The same projection, sharded by row-id range, so a search fetches only the
// shards holding the results it is about to render instead of all 4.98 MiB of
// it. The full projection above stays the facet path's artifact: a count over
// every row genuinely needs every row, and Explore's filters derive those.
//
// The shard directory names the shard size (`r68`), so a layout change writes
// a new path rather than letting a cached file answer with rows from the old
// one. Each shard is a complete container with its own dictionaries — one
// fetch is one complete answer, no shared table to load first.
const SEARCH_SHARD_DIR = path.join(outDir, "search-shards", `r${SEARCH_SHARD_ROWS}`);
rmSync(path.join(outDir, "search-shards"), { recursive: true, force: true });
mkdirSync(SEARCH_SHARD_DIR, { recursive: true });

const shardRaws = buildDisplayShards(rows);
let shardGzBytes = 0;
let shardGzMax = 0;
shardRaws.forEach((raw, index) => {
  const gz = gzipSync(raw, { level: 9 });
  writeFileSync(
    path.join(SEARCH_SHARD_DIR, `${String(index).padStart(4, "0")}.bin.gz`),
    gz
  );
  shardGzBytes += gz.length;
  shardGzMax = Math.max(shardGzMax, gz.length);
});

const MiB = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
console.log(
  `✔ search index: ${searchIndex.tokens.length.toLocaleString("en-US")} tokens, ` +
    `${searchIndex.postingsCount.toLocaleString("en-US")} postings, ` +
    `${MiB(searchIndexRaw.length)} raw / ${MiB(searchIndexGz.length)} gzip → ${SEARCH_INDEX_FILE}`,
);
console.log(
  `✔ search rows: ${rows.length.toLocaleString("en-US")} rows, ` +
    `${MiB(searchRowsRaw.length)} raw / ${MiB(searchRowsGz.length)} gzip → ${SEARCH_ROWS_FILE}`,
);
console.log(
  `✔ search shards: ${shardRaws.length.toLocaleString("en-US")} shard(s) of ${SEARCH_SHARD_ROWS} rows, ` +
    `${MiB(shardGzBytes)} gzip total, largest ${(shardGzMax / 1024).toFixed(1)} KiB → ` +
    `${path.relative(process.cwd(), SEARCH_SHARD_DIR)}`,
);
