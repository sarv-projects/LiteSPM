// Transport and decode for the search artifacts emitted at build time.
//
//   /data/catalog-search-index.bin.gz — vocabulary + delta-varint postings
//   /data/catalog-search-rows.bin.gz  — the display projection for every row
//   /data/search-shards/r68/NNNN.bin.gz — the same projection in 68-row pieces
//
// All are gzipped binary containers (see `lib/searchFormat.mjs` for the byte
// layout). Compression is applied here, at build time, rather than left to the
// CDN: the existing catalog shards rely on Cloudflare's brotli, but a
// binary `application/octet-stream` asset is on Cloudflare's list of types it
// does *not* compress, so a `.bin` served raw would be larger on the wire than
// the bytes it replaces. Gzip keeps the transport independent of the CDN.
//
// Search, kind and category browse use compact facets and fetch only the
// display shards they are about to render. Rich filters can use the full
// projection when their fields are not present in the index.
//
// The gzip is sniffed, not assumed: if an edge or a future `_headers` rule
// serves the asset with `Content-Encoding: gzip`, the browser has already
// decoded it and the container magic is visible — in that case the bytes are
// used as they are. That makes the loader correct under either behaviour.

import type { Listing } from "./telemetry";
import {
  decodeContainer,
  decodeDisplayRows,
  decodeSearchIndex,
  SEARCH_SHARD_ROWS,
  SECTION_INDEX,
  SECTION_ROWS,
} from "./searchFormat.mjs";
import { isSearchFacets } from "./searchFacets.mjs";

export type DecodedSearchIndex = ReturnType<typeof decodeSearchIndex>;
export type DecodedDisplayShard = ReturnType<typeof decodeDisplayRows>;

export interface LoadedSearchIndex {
  rowCount: number;
  index: DecodedSearchIndex;
}

export interface SearchFacets {
  schema: "litespm-search-facets/v1";
  rowCount: number;
  categories: string[];
  kindIds: number[];
  categoryIds: number[];
  browseOrder: number[];
}

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("this browser cannot decompress the search artifact (no DecompressionStream)");
  }
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Fetch one artifact and return the container bytes, decompressed when the
 * transport left the gzip in place.
 */
async function fetchAsset(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`search asset fetch failed: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1) {
    return gunzip(bytes);
  }
  return bytes;
}

/** Fetch, decompress and decode the postings index. */
export async function fetchSearchIndex(url: string): Promise<LoadedSearchIndex> {
  const payload = decodeContainer(await fetchAsset(url), SECTION_INDEX);
  const index = decodeSearchIndex(payload);
  return { rowCount: index.rowCount, index };
}

const searchFacetCache = new Map<string, Promise<SearchFacets>>();

export function fetchSearchFacets(url: string, rowCount?: number): Promise<SearchFacets> {
  const cached = searchFacetCache.get(url);
  if (cached) return cached;
  const pending = fetchAsset(url)
    .then((bytes) => JSON.parse(new TextDecoder().decode(bytes)) as unknown)
    .then((value) => {
      if (!isSearchFacets(value, rowCount)) {
        throw new Error("search facets do not match the postings index");
      }
      return value as SearchFacets;
    });
  searchFacetCache.set(url, pending);
  pending.catch(() => searchFacetCache.delete(url));
  return pending;
}

/**
 * Fetch, decompress and hydrate the display projection into full row objects.
 *
 * Hydration is eager because every caller of `loadCatalog` derives facets,
 * counts and sorts from the whole set; measured on the real dataset it is
 * ~140 ms for 69,376 rows, against the ~45 MB `JSON.parse` plus `withLinkKeys`
 * re-keying plus MiniSearch indexing the old path paid.
 */
export async function fetchDisplayRows(url: string): Promise<Listing[]> {
  const payload = decodeContainer(await fetchAsset(url), SECTION_ROWS);
  const display = decodeDisplayRows(payload);
  const rows: Listing[] = new Array(display.rowCount);
  for (let i = 0; i < display.rowCount; i += 1) {
    rows[i] = display.rowAt(i) as Listing;
  }
  return rows;
}

/**
 * Fetch and decode one shard of the display projection.
 *
 * A shard is a complete ROWS container for a contiguous `SEARCH_SHARD_ROWS`
 * run of rows, so it decodes exactly like the full projection and its `rowAt`
 * takes a shard-local index. Cached per URL for the session: paging a search
 * back and forth, or re-running a query, must not re-fetch a shard the page
 * already holds. A failed fetch is dropped from the cache so a retry can
 * actually retry.
 */
const shardCache = new Map<string, Promise<DecodedDisplayShard>>();

export function fetchDisplayShard(url: string): Promise<DecodedDisplayShard> {
  const hit = shardCache.get(url);
  if (hit) return hit;
  const pending = fetchAsset(url).then((bytes) => {
    const payload = decodeContainer(bytes, SECTION_ROWS);
    return decodeDisplayRows(payload);
  });
  shardCache.set(url, pending);
  pending.catch(() => shardCache.delete(url));
  return pending;
}

/**
 * Hydrate global row indices from the sharded projection.
 *
 * Every shard that holds at least one requested row is fetched once, in
 * parallel; rows come back in the order the indices were given, so the caller
 * keeps the index's ranking. `shardUrl` is injected rather than imported so
 * this module stays free of the dataset's cache-busting policy (which lives in
 * `catalogData.ts`).
 *
 * @param indices global row indices, most relevant first
 * @param rowCount total rows the indices address, for bounds
 * @param shardUrl builds the URL of one shard
 */
export async function hydrateDisplayRows(
  indices: readonly number[],
  rowCount: number,
  shardUrl: (shardIndex: number) => string,
): Promise<Listing[]> {
  const shardIndices = new Set<number>();
  for (const index of indices) {
    if (index >= 0 && index < rowCount) shardIndices.add(Math.floor(index / SEARCH_SHARD_ROWS));
  }
  const shards = new Map<number, DecodedDisplayShard>();
  await Promise.all(
    [...shardIndices].map(async (shard) => {
      shards.set(shard, await fetchDisplayShard(shardUrl(shard)));
    }),
  );
  const rows: Listing[] = [];
  for (const index of indices) {
    if (index < 0 || index >= rowCount) continue;
    const shard = Math.floor(index / SEARCH_SHARD_ROWS);
    const decoded = shards.get(shard);
    if (!decoded) continue;
    const local = index - shard * SEARCH_SHARD_ROWS;
    if (local < 0 || local >= decoded.rowCount) continue;
    rows.push(decoded.rowAt(local) as Listing);
  }
  return rows;
}
