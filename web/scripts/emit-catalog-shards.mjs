#!/usr/bin/env node
import { normalizeListing, uniqueListings, listingIdentity } from "../lib/discovery.mjs";
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
//   catalog-search-index.bin.gz  vocabulary + delta-varint postings, each
//                                carrying the match class it was found in
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
import { buildSearchFacets } from "../lib/searchFacets.mjs";
import {
  categorySlug,
  SIBLING_CATEGORY_MAX,
  SIBLING_SLICE_ROWS,
} from "../lib/categoryFiles.mjs";
import {
  publisherFileStem,
  publisherSiblingNames,
  relatedSlice,
  sourceFileSlug,
} from "../lib/relatedFiles.mjs";

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
const rows = JSON.parse(source.toString("utf8")).map(normalizeListing);
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

// The key each row answers to is resolved over the WHOLE dataset, once, before
// any bucket is written: `linkKey` is the slug only where exactly one row in
// the catalog carries it, and the id otherwise. Computing it inside a bucket
// would call a globally-shared slug unique in the one bucket that happens to
// hold its first-wins row — which is how `/package/?slug=postgres` (8 rows)
// resolved to whichever of the 8 was indexed first. `withLinkKeys` in
// `lib/catalog.ts` states the same rule for the full row set, and `buildLookup`
// in `app/package/PackageView.tsx` trusts this stamped key.
const globalSlugCounts = new Map();
for (const row of rows) {
  globalSlugCounts.set(row.slug, (globalSlugCounts.get(row.slug) ?? 0) + 1);
}
const withLinkKey = (row) => ({
  ...row,
  linkKey: globalSlugCounts.get(row.slug) === 1 ? row.slug : row.id,
});

// Which publishers have a `pub/` sibling file, resolved over the whole
// dataset once, for the same reason `linkKey` is: the browser has to know
// whether to ask for the file at all before it can receive one, and a
// publisher with a single row has nothing to show. The same predicate stamps
// `publisherGroup` onto the bucket rows and (in `lib/packageServer.ts`) onto
// the server-side rows, so the two sides cannot disagree about which
// publishers are grouped.
const publisherGroups = publisherSiblingNames(rows);
const withBucketFields = (row) => {
  const keyed = withLinkKey(row);
  return publisherGroups.has(row.publisher?.name ?? "")
    ? { ...keyed, publisherGroup: true }
    : keyed;
};

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
  buckets[idBucket].push(withBucketFields(row));

  // An ambiguous slug is still filed first-wins so the page can tell "shared
  // name" from "no such name": `buildLookup` refuses to register the key, and
  // the view's not-found state names the ambiguity rather than claiming the
  // entry is missing. The rows that share the slug stay reachable by id.
  if (!seenSlugs.has(row.slug)) {
    seenSlugs.add(row.slug);
    const slugBucket = bucketFor(row.slug);
    if (slugBucket !== idBucket) {
      buckets[slugBucket].push(withBucketFields(row));
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
// Every category gets a file, because every entry page now carries the rail.
// A category small enough to browse in full is written in full; the two that
// hold most of the catalog (45,373 and 19,209 rows) are written as a bounded,
// deterministic slice — the rail shows six, and a multi-megabyte fetch to pick
// six items out of forty-five thousand is the thing this route exists to
// avoid. The "see all" link beside the rail is the complete list.
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
  const slug = categorySlug(name);
  if (!slug) continue;
  // Over the cap: a fixed-length prefix of the category in catalog order —
  // the same slice for every entry of that category.
  const emitted = group.length > SIBLING_CATEGORY_MAX ? group.slice(0, SIBLING_SLICE_ROWS) : group;
  writeFileSync(path.join(CAT_DIR, `${slug}.json`), `${JSON.stringify(emitted.map(withLinkKey))}\n`);
  categoryFiles += 1;
}

// Publisher and source siblings for the related rail (`lib/relatedFiles.mjs`
// owns both rules). A publisher file exists only for publishers with
// `PUBLISHER_SIBLING_MIN`+ rows — the rows carry `publisherGroup` so the
// browser never asks for one that was not written. File stems are hashes of
// the exact publisher name; a hash collision would merge two publishers into
// one file, which the client's exact-name filter renders correctly (and
// FNV-1a 64 makes that hypothetical).
const PUB_DIR = path.join(PKG_DIR, "pub");
mkdirSync(PUB_DIR, { recursive: true });
const byPublisher = new Map();
for (const row of rows) {
  const name = row.publisher?.name;
  if (!name || !publisherGroups.has(name)) continue;
  if (!byPublisher.has(name)) byPublisher.set(name, []);
  byPublisher.get(name).push(row);
}
const publisherDocs = new Map();
for (const [name, group] of byPublisher) {
  const stem = publisherFileStem(name);
  publisherDocs.set(stem, (publisherDocs.get(stem) ?? []).concat(relatedSlice(group)));
}
let publisherFiles = 0;
for (const stem of [...publisherDocs.keys()].sort()) {
  const body = `${JSON.stringify(publisherDocs.get(stem).map(withLinkKey))}\n`;
  writeFileSync(path.join(PUB_DIR, `${stem}.json`), body);
  publisherFiles += 1;
}

// Every row names a source, the source set is closed (12 ids), and the
// slugified id is the file stem. Two ids slugging to the same stem would make
// the client's `source` filter silently mix them, so that is a build failure,
// not a warn.
const SRC_DIR = path.join(PKG_DIR, "src");
mkdirSync(SRC_DIR, { recursive: true });
const bySource = new Map();
for (const row of rows) {
  if (!row.source) continue;
  if (!bySource.has(row.source)) bySource.set(row.source, []);
  bySource.get(row.source).push(row);
}
const sourceSlugs = new Map();
for (const [id, group] of bySource) {
  const slug = sourceFileSlug(id);
  if (!slug) continue;
  const seen = sourceSlugs.get(slug);
  if (seen && seen !== id) {
    console.error(`✖ source ids "${seen}" and "${id}" share the slug "${slug}"`);
    process.exit(1);
  }
  sourceSlugs.set(slug, id);
  writeFileSync(path.join(SRC_DIR, `${slug}.json`), `${JSON.stringify(relatedSlice(group).map(withLinkKey))}\n`);
}

console.log(
  `✔ product lookups: ${BUCKETS} bucket(s) (${(Math.max(...bucketFiles) / 1024).toFixed(0)} KiB largest, ` +
    `${(Math.min(...bucketFiles) / 1024).toFixed(0)} KiB smallest; ` +
    `${slugBucketExtras} slug-key extra(s)) ` +
    `+ ${categoryFiles} category file(s) + ${publisherFiles} publisher file(s) ` +
    `+ ${bySource.size} source file(s) → ${path.relative(process.cwd(), PKG_DIR)}`,
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

// Row-aligned kind/category ids and the curated browse order let Explore
// filter and page without hydrating the full display projection.
const featured = JSON.parse(readFileSync(path.join(webRoot, "data", "featured.json"), "utf8"));
const searchFacets = buildSearchFacets(rows, featured.entries.map((entry) => entry.id));
const searchFacetsGz = gzipSync(Buffer.from(JSON.stringify(searchFacets)), { level: 9 });
writeFileSync(path.join(outDir, "catalog-search-facets.json.gz"), searchFacetsGz);

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
  `✔ search facets: ${(searchFacetsGz.length / 1024).toFixed(1)} KiB gzip → catalog-search-facets.json.gz`,
);
console.log(
  `✔ search shards: ${shardRaws.length.toLocaleString("en-US")} shard(s) of ${SEARCH_SHARD_ROWS} rows, ` +
    `${MiB(shardGzBytes)} gzip total, largest ${(shardGzMax / 1024).toFixed(1)} KiB → ` +
    `${path.relative(process.cwd(), SEARCH_SHARD_DIR)}`,
);

// ---------------------------------------------------------------------------
// Palette facets (LPSM-J009).
//
// The command palette shows a Categories section before a keystroke, and the
// category list cannot live in a JavaScript chunk: J002's acceptance is "zero
// catalog bytes in any JS chunk". It is small enough to be its own document —
// 64 rows, 4.2 KiB — fetched the first time the palette opens, which is an
// interaction (the E1 contract: a passive visit still fetches nothing from
// `/data/`).
//
// The counting rule is the one `lib/catalog.ts` `categoryFacets` states — trim,
// count, sort by count desc then name — duplicated here for the usual reason
// (Node scripts cannot import TypeScript), over exactly the field that rule
// reads. `?category=` filters compare the raw value, and the dataset carries no
// untrimmed category (measured: 0 of 69,376 rows), so the emitted name is
// exactly the value Explore accepts.
// ---------------------------------------------------------------------------
const CATEGORIES_FILE = "catalog-categories.json";
const categoryCounts = new Map();
const categoryIdentities = new Set();
for (const row of rows) {
  const name = row.category?.trim();
  if (!name) continue;
  const identity = name + "|" + listingIdentity(row);
  if (categoryIdentities.has(identity)) continue;
  categoryIdentities.add(identity);
  categoryCounts.set(name, (categoryCounts.get(name) ?? 0) + 1);
}
const categoriesDoc = {
  datasetDigest: sha256(source),
  rowCount: rows.length,
  schema: "litespm-web-categories/v1",
  categories: Array.from(categoryCounts, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  ),
};
const categoriesBytes = Buffer.from(`${JSON.stringify(categoriesDoc, null, 2)}\n`, "utf8");
writeFileSync(path.join(outDir, CATEGORIES_FILE), categoriesBytes);
console.log(
  `✔ palette categories: ${categoriesDoc.categories.length} categor(ies), ` +
    `${(categoriesBytes.length / 1024).toFixed(1)} KiB → ${CATEGORIES_FILE}`,
);

// ---------------------------------------------------------------------------
// Publisher facets.
//
// The Explore page's Publisher filter needs a list a reader can pick from, and
// the catalog has 30,269 distinct publishers — of which 5,286 published more
// than one entry. A publisher with a single entry is a row, not a publisher to
// browse, so the list is the ones worth filtering by, and the control says so.
//
// It is a separate document for the same reason the categories are: 5,286 rows
// of names and counts do not belong in a JavaScript chunk, and they do not
// belong in a page's first paint either. The Explore page asks for this file
// when the reader opens the Publisher control — an interaction, never a passive
// visit.
//
// The counting rule is the one `lib/catalog.ts` `publisherFacets` states —
// trim, count, sort by count desc then name — over exactly the field that
// rule reads, so the number beside a name is the number the filter returns.
// ---------------------------------------------------------------------------
const PUBLISHERS_FILE = "catalog-publishers.json";
// A publisher's IDENTITY is its name case-folded: the dataset spells the same
// vendor both "nvidia" (249 rows) and "NVIDIA" (1 row). The filter matches
// case-folded, so the count published beside a name has to be the count that
// filter returns - which means counting the spellings together and labelling
// the group with the spelling most of its rows use. The gate
// `scripts/check-publisher-counts.mjs` holds this, the site's board
// (`lib/catalog.ts` `publisherFacets`) and the filter together.
const publisherCounts = new Map();
for (const row of uniqueListings(rows)) {
  const name = row.publisher?.name?.trim();
  if (!name) continue;
  const key = name.toLowerCase();
  const entry = publisherCounts.get(key) ?? { count: 0, spellings: new Map() };
  entry.count += 1;
  entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1);
  publisherCounts.set(key, entry);
}
const publisherFacets = Array.from(publisherCounts, ([key, entry]) => {
  const spellings = Array.from(entry.spellings, ([name, n]) => ({ name, n })).sort(
    (a, b) => b.n - a.n || a.name.localeCompare(b.name)
  );
  return { name: spellings[0]?.name ?? key, count: entry.count };
})
  .filter((facet) => facet.count > 1)
  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
const publishersDoc = {
  datasetDigest: sha256(source),
  rowCount: rows.length,
  // Every distinct publisher in the snapshot, so the control can say how many
  // of them the list holds instead of implying the list is the whole set.
  publisherCount: publisherCounts.size,
  schema: "litespm-web-publishers/v1",
  publishers: publisherFacets,
};
const publishersBytes = Buffer.from(`${JSON.stringify(publishersDoc)}\n`, "utf8");
writeFileSync(path.join(outDir, PUBLISHERS_FILE), publishersBytes);
console.log(
  `✔ publisher facets: ${publishersDoc.publishers.length} publisher(s) of ` +
    `${publishersDoc.publisherCount}, ${(publishersBytes.length / 1024).toFixed(1)} KiB → ${PUBLISHERS_FILE}`,
);
