// Transport and decode for the two search artifacts emitted at build time.
//
//   /data/catalog-search-index.bin.gz — vocabulary + delta-varint postings
//   /data/catalog-search-rows.bin.gz  — the display projection for every row
//
// Both are gzipped binary containers (see `lib/searchFormat.mjs` for the byte
// layout). Compression is applied here, at build time, rather than left to the
// CDN: the existing catalog shards rely on Cloudflare's brotli, but a
// binary `application/octet-stream` asset is on Cloudflare's list of types it
// does *not* compress, so a `.bin` served raw would be larger on the wire than
// the bytes it replaces. Gzip keeps the transport independent of the CDN.
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
  SECTION_INDEX,
  SECTION_ROWS,
} from "./searchFormat.mjs";

export type DecodedSearchIndex = ReturnType<typeof decodeSearchIndex>;

export interface LoadedSearchIndex {
  rowCount: number;
  index: DecodedSearchIndex;
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
