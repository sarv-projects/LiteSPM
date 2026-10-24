"use client";

// Lazily-fetched catalog rows.
//
// The dataset (69,376 rows, ~52 MB) is NOT part of any JavaScript bundle: the
// build-time pages prerender from `data/catalog.json` through a Server
// Component (server bundles never reach the browser), and the browser fetches
// a *display projection* of the same rows only when a page actually needs
// them. The projection is emitted by `scripts/emit-catalog-shards.mjs` from
// that same file at build time: `catalog-search-rows.bin.gz` carries exactly
// what the cards render (name, summary capped at a display-visible length,
// publisher, kind, category, runtime, transport, version, installability,
// hosts, and the link key) plus the fields the search matcher reads. It is
// 13.3 MiB raw / 5.0 MiB gzipped against the 42.78 MiB of ordered shards it
// replaces — and it hydrates in ~140 ms instead of a ~45 MB `JSON.parse` plus
// `withLinkKeys` re-keying.
//
// The ordered shards are still emitted and are still the fallback: a browser
// without `DecompressionStream`, or a projection that fails to load, gets
// exactly the pre-2026-10-14 path through `/data/catalog.json` and its shards.
// Nothing that reads a *full-fidelity* row (the product page's own bucket
// lookup below) goes through the projection.
//
// Timing is the point of the design. A first visit downloads the page's HTML
// and ~107 kB of First Load JS and nothing else; the dataset is requested on
// the first interaction that needs it (typing in search, changing a filter,
// opening an entry), and never on a passive visit. Until then the prerendered
// rows are on screen and stay on screen — this module does not replace them
// with a spinner.

import { useCallback, useEffect, useState } from "react";
import type { Listing } from "./telemetry";
import { withLinkKeys } from "./catalog";
import { fetchDisplayRows } from "./searchAssets";
import { SEARCH_SHARD_ROWS, SEARCH_FORMAT_VERSION } from "./searchFormat.mjs";
import { categorySlug } from "./categoryFiles.mjs";
import { publisherFileStem, sourceFileSlug } from "./relatedFiles.mjs";
import bundledRelease from "../data/release.json";

/**
 * Shard index as served: the build-time emitter writes it to
 * `web/public/data/catalog.json`; the rows arrive as the shard files it names
 * and are re-keyed with `withLinkKeys` once concatenated. Since 2026-10-14 the
 * primary row source is the display projection (`SEARCH_ROWS_URL`); this path
 * is the fallback for browsers that cannot decompress it.
 */
export const CATALOG_PATH = "/data/catalog.json";

/** Display projection: every field a card renders, dictionary-encoded. */
export const SEARCH_ROWS_PATH = "/data/catalog-search-rows.bin.gz";

/** Postings index; fetched by `lib/search.worker.ts` (or in-thread fallback). */
export const SEARCH_INDEX_PATH = "/data/catalog-search-index.bin.gz";

/**
 * Palette facets: the catalog's category list with real counts, emitted by
 * `scripts/emit-catalog-shards.mjs`. The command palette is the only consumer,
 * because it is the only surface that needs a browsable category list before it
 * has any rows — every other surface either prerenders its facets (the
 * server-rendered pages) or has already loaded the rows it counts over
 * (Explore). It is fetched when the palette opens, which is an interaction,
 * never on a passive visit.
 */
export const CATEGORIES_PATH = "/data/catalog-categories.json";

/**
 * Publisher facets: the publishers worth filtering by, with the count each
 * one's filter returns.
 *
 * The catalog has 30,269 distinct publishers and 5,286 of them published more
 * than one entry. A publisher with a single entry is a row rather than a
 * publisher to browse, so the list is the ones with two or more — and the
 * control says how many of the whole set it holds.
 *
 * Like the category facets, this is its own document, fetched when the reader
 * opens the control: 5,286 names do not belong in a JavaScript chunk, and they
 * do not belong in a page's first paint either.
 */
export const PUBLISHERS_PATH = "/data/catalog-publishers.json";

/**
 * Sharded display projection: one self-contained container per
 * `SEARCH_SHARD_ROWS` rows, under a path that names the shard size so a layout
 * change can never be answered by a cached file from the previous layout.
 */
export const SEARCH_SHARDS_DIR = "/data/search-shards";

/**
 * Cache-buster bound to the dataset itself, not to the deploy: `datasetDigest`
 * is the sha256 the release pointer publishes over these rows, so a digest
 * change means the bytes changed. It keeps a CDN that cached the previous
 * dataset from answering a newer build with stale rows (which would silently
 * disagree with the prerendered HTML beside them).
 */
const DATASET_VERSION = (() => {
  const digest = (bundledRelease as Record<string, unknown>).datasetDigest;
  return typeof digest === "string" && digest.length > 0
    ? `?format=${SEARCH_FORMAT_VERSION}&v=${encodeURIComponent(digest)}`
    : `?format=${SEARCH_FORMAT_VERSION}`;
})();

export const CATALOG_URL = `${CATALOG_PATH}${DATASET_VERSION}`;
export const SEARCH_ROWS_URL = `${SEARCH_ROWS_PATH}${DATASET_VERSION}`;
export const SEARCH_INDEX_URL = `${SEARCH_INDEX_PATH}${DATASET_VERSION}`;
export const CATEGORIES_URL = `${CATEGORIES_PATH}${DATASET_VERSION}`;
export const PUBLISHERS_URL = `${PUBLISHERS_PATH}${DATASET_VERSION}`;

/** URL of one shard of the sharded display projection. */
export function searchShardUrl(shardIndex: number): string {
  return `${SEARCH_SHARDS_DIR}/r${SEARCH_SHARD_ROWS}/${String(shardIndex).padStart(4, "0")}.bin.gz${DATASET_VERSION}`;
}

/** Directory of the index; shards are its siblings (`/data/catalog-0000.json`). */
const CATALOG_DATA_DIR = CATALOG_PATH.slice(0, CATALOG_PATH.lastIndexOf("/"));

export type CatalogStatus = "idle" | "loading" | "ready" | "error";

let cached: Listing[] | null = null;
let inflight: Promise<Listing[]> | null = null;

/** Shape of the index document written by `scripts/emit-catalog-shards.mjs`. */
interface CatalogIndex {
  schema: string;
  rowCount: number;
  datasetDigest: string;
  shards: { file: string; digest: string; size: number }[];
}

function isCatalogIndex(data: unknown): data is CatalogIndex {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as CatalogIndex).shards)
  );
}

function fetchRowsFromShards(index: CatalogIndex): Promise<Listing[]> {
  // The browser deliberately does NOT verify the shards' sha256 digests. The
  // transport is HTTPS — the same trust model as every other asset the page
  // loads — and re-hashing 50+ MB of SHA-256 on the main thread would stall
  // the interaction that triggered the fetch for a guarantee the TLS channel
  // already provides. Integrity against a compromised origin is the CDN's and
  // the build's job, not the reader's.
  //
  // Each shard is requested with the same `?v=<datasetDigest>` cache-buster
  // as the index, so a CDN cannot answer one shard from a newer dataset with
  // rows from an older one — the shards of a given digest are consistent by
  // construction.
  return Promise.all(
    index.shards.map((shard) =>
      fetch(`${CATALOG_DATA_DIR}/${encodeURIComponent(shard.file)}${DATASET_VERSION}`, {
        cache: "no-cache",
      }).then((res) => {
        if (!res.ok) {
          throw new Error(`catalog shard ${shard.file} fetch failed: HTTP ${res.status}`);
        }
        return res.json();
      }),
    ),
  ).then((shardRows) => {
    const rows: Listing[] = [];
    for (const part of shardRows) {
      if (!Array.isArray(part)) {
        throw new Error("catalog shard did not contain a JSON array");
      }
      rows.push(...(part as Listing[]));
    }
    return withLinkKeys(rows);
  });
}

/** The pre-projection path: index document, then the ordered shards. */
function fetchShardRows(): Promise<Listing[]> {
  return fetch(CATALOG_URL, { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`catalog fetch failed: HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      // A plain array is a legacy single-file export; the sharded build serves
      // an index document that names the shard files to concatenate in order.
      if (Array.isArray(data)) return withLinkKeys(data as unknown as Listing[]);
      if (!isCatalogIndex(data)) {
        throw new Error("catalog document is neither a row array nor a shard index");
      }
      return fetchRowsFromShards(data);
    });
}

/**
 * The primary path: hydrate the display projection.
 *
 * `linkKey` arrives precomputed by the emitter over the *whole* dataset, which
 * is where slug ambiguity can actually be resolved — `withLinkKeys` over a
 * shard or bucket only sees its own slice.
 */
function fetchProjectionRows(): Promise<Listing[]> {
  return fetchDisplayRows(SEARCH_ROWS_URL);
}

function fetchCatalog(): Promise<Listing[]> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = fetchProjectionRows()
    // A projection that cannot be decompressed (old browser), decoded (foreign
    // or corrupt bytes) or fetched (stale edge) degrades to the ordered shards,
    // which are still emitted beside it. The reader gets the same rows; only
    // the transport is slower.
    .catch(() => fetchShardRows())
    .then((rows) => {
      cached = rows;
      inflight = null;
      return rows;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

/** Kick off the dataset fetch. Idempotent; concurrent callers share one request. */
export function loadCatalog(): Promise<Listing[]> {
  return fetchCatalog();
}

// ---------------------------------------------------------------------------
// Product-page lookup.
//
// A product page needs one row, two counts and a few same-category siblings.
// It used to resolve all three through `fetchCatalog()`, which measured at
// 44.5 MB to render a single page — against 649 KB for Explore, which actually
// searches everything. These two endpoints serve the same answers from ~170 KB.
//
// `bucketForSlug` must stay byte-identical to the emitter's own copy in
// `scripts/emit-catalog-shards.mjs`; both are FNV-1a 32-bit, chosen because it
// is short enough to keep in two places without a shared dependency.
// ---------------------------------------------------------------------------

const PRODUCT_BUCKETS = 256;
const PACKAGE_DATA_DIR = `${CATALOG_DATA_DIR}/pkg`;

function bucketForSlug(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i += 1) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % PRODUCT_BUCKETS;
}

export interface ProductPayload {
  counts: { total: number; versioned: number };
  /**
   * The rows sharing this bucket, as an array.
   *
   * Not a slug-keyed map: 5,217 slugs in this catalog belong to more than one
   * row (17,481 rows in total), and the view's `buildLookup` resolves that by
   * keying ids always and registering a slug only when the emitter stamped it
   * as the row's whole-dataset `linkKey`. The rows arrive with that key
   * already resolved; re-deriving it over the bucket would call a globally
   * shared slug unique in the one bucket that happened to hold its first row.
   */
  rows: Listing[];
}

const productCache = new Map<string, ProductPayload>();
const productInflight = new Map<string, Promise<ProductPayload>>();

/** Fetch the bucket that holds `slug`. Cached per session; failures are not. */
export function fetchProductPayload(slug: string): Promise<ProductPayload> {
  const hit = productCache.get(slug);
  if (hit) return Promise.resolve(hit);
  const running = productInflight.get(slug);
  if (running) return running;

  const url = `${PACKAGE_DATA_DIR}/${String(bucketForSlug(slug)).padStart(3, "0")}.json${DATASET_VERSION}`;
  const p = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`product bucket ${res.status}`);
      return res.json();
    })
    .then((doc: ProductPayload) => {
      const payload: ProductPayload = {
        counts: doc.counts ?? { total: 0, versioned: 0 },
        // The rows already carry the `linkKey` the emitter resolved over the
        // whole dataset; nothing is re-keyed over this bucket. (An artifact
        // old enough to lack the field resolves by id only — never by a slug
        // this route cannot vouch for.)
        rows: Array.isArray(doc.rows) ? doc.rows : [],
      };
      productCache.set(slug, payload);
      productInflight.delete(slug);
      return payload;
    })
    .catch((err) => {
      productInflight.delete(slug);
      throw err;
    });
  productInflight.set(slug, p);
  return p;
}

/**
 * Same-category siblings. Every category this build's page set includes has a
 * file — `lib/categoryFiles.mjs` states why each category gets one and which
 * are bounded slices — so a `null` here means the build handed this page no
 * set that contains the slug, or an older build's file is missing.
 *
 * `siblingCategories` is the build-time set the page was given (from
 * `lib/categoryFiles.mjs`). A category outside it is answered without a
 * request: the file does not exist for that page's build, so asking for it was
 * a guaranteed 404 round trip and a console error. The 404 branch below stays
 * as the fallback for a page rendered against an older build's set.
 */
const siblingCache = new Map<string, Listing[]>();
const siblingInflight = new Map<string, Promise<Listing[] | null>>();

/** `null` result = no sibling file exists for this category (by design). */
export function fetchCategorySiblings(
  category: string,
  siblingCategories: readonly string[],
): Promise<Listing[] | null> {
  const slug = categorySlug(category);
  if (!slug) return Promise.resolve(null);
  if (!siblingCategories.includes(slug)) return Promise.resolve(null);
  const hit = siblingCache.get(slug);
  if (hit) return Promise.resolve(hit);
  const running = siblingInflight.get(slug);
  if (running) return running;

  const p = fetch(`${PACKAGE_DATA_DIR}/cat/${slug}.json${DATASET_VERSION}`)
    .then((res) => {
      // A 404 means this build wrote no file for the category (an older build's
      // page, or a category the set no longer names).
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`category ${res.status}`);
      return res.json();
    })
    .then((rows: Listing[] | null) => {
      const out = rows ?? null;
      if (out) siblingCache.set(slug, out);
      siblingInflight.delete(slug);
      return out;
    })
    .catch((err) => {
      siblingInflight.delete(slug);
      throw err;
    });
  siblingInflight.set(slug, p);
  return p;
}

/**
 * Same-publisher siblings, from the `pub/` file `lib/relatedFiles.mjs` keys by
 * the hash of the exact name. The row's `publisherGroup` flag — stamped by the
 * emitter into the bucket files and by `lib/packageServer.ts` onto the server
 * rows — is the caller's signal that a file was written for this publisher at
 * all; this fetcher assumes the caller checked and treats a 404 as "no file"
 * rather than an error.
 *
 * The file is filtered by exact publisher name: file stems are hashes, and the
 * filter makes a hypothetical hash collision (two names in one file) render
 * correctly rather than mixing two publishers' rows.
 */
const publisherCache = new Map<string, Listing[]>();
const publisherInflight = new Map<string, Promise<Listing[] | null>>();

export function fetchPublisherSiblings(
  publisherName: string | null | undefined,
): Promise<Listing[] | null> {
  if (!publisherName) return Promise.resolve(null);
  const stem = publisherFileStem(publisherName);
  const hit = publisherCache.get(stem);
  if (hit) return Promise.resolve(hit);
  const running = publisherInflight.get(stem);
  if (running) return running;

  const p = fetch(`${PACKAGE_DATA_DIR}/pub/${stem}.json${DATASET_VERSION}`)
    .then((res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`publisher ${res.status}`);
      return res.json();
    })
    .then((rows: Listing[] | null) => {
      const out = rows ? rows.filter((row) => row.publisher?.name === publisherName) : null;
      if (out) publisherCache.set(stem, out);
      publisherInflight.delete(stem);
      return out;
    })
    .catch((err) => {
      publisherInflight.delete(stem);
      throw err;
    });
  publisherInflight.set(stem, p);
  return p;
}

/**
 * Same-source siblings, from the `src/` file `lib/relatedFiles.mjs` keys by
 * the slugified source id. Every row in this catalog names a source and the
 * source set is closed, so unlike the publisher fetcher there is no "does a
 * file exist" flag to consult; a 404 still resolves to `null` rather than an
 * error, for the same older-build reason as the category fetcher.
 */
const sourceCache = new Map<string, Listing[]>();
const sourceInflight = new Map<string, Promise<Listing[] | null>>();

export function fetchSourceSiblings(source: string | null | undefined): Promise<Listing[] | null> {
  const slug = source ? sourceFileSlug(source) : "";
  if (!slug) return Promise.resolve(null);
  const hit = sourceCache.get(slug);
  if (hit) return Promise.resolve(hit);
  const running = sourceInflight.get(slug);
  if (running) return running;

  const p = fetch(`${PACKAGE_DATA_DIR}/src/${slug}.json${DATASET_VERSION}`)
    .then((res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`source ${res.status}`);
      return res.json();
    })
    .then((rows: Listing[] | null) => {
      const out = rows ? rows.filter((row) => row.source === source) : null;
      if (out) sourceCache.set(slug, out);
      sourceInflight.delete(slug);
      return out;
    })
    .catch((err) => {
      sourceInflight.delete(slug);
      throw err;
    });
  sourceInflight.set(slug, p);
  return p;
}

/**
 * The row the edge Worker resolved and handed to this page, if any.
 *
 * The Worker fetches the bucket and resolves the entry before it serves the
 * shell, so it already has the row. It travels with the page in a
 * `#litespm-entry` JSON script tag, and the view reads it synchronously
 * instead of fetching the same ~170-450 KB bucket a second time.
 *
 * Without this, a reader who clicked a product link watched the generic
 * "Find a package" view for the length of that round trip before the entry
 * appeared — the flash the live-browser audit reported as "the link opens the
 * wrong page".
 *
 * Returns null when there is no such tag: a pre-rendered page has its row as
 * a prop, and a page served without the Worker has neither, so the bucket
 * fetch still happens and the view still resolves.
 */
export function readInlineEntry(): Listing | null {
  if (typeof document === "undefined") return null;
  const node = document.getElementById("litespm-entry");
  if (!node || !node.textContent) return null;
  try {
    const parsed = JSON.parse(node.textContent) as Listing;
    return parsed && typeof parsed.id === "string" ? parsed : null;
  } catch {
    // A malformed payload is not a reason to break the page: the bucket
    // fetch below still resolves the entry.
    return null;
  }
}

/**
 * Row-set state for a product page. Mirrors `useCatalog`'s status contract so
 * the view keeps its existing three honest states (index shell, fetch failed,
 * key absent) without change.
 */
export function useProductRow(slug: string | null): {
  status: CatalogStatus;
  payload: ProductPayload | null;
  retry: () => void;
} {
  const [status, setStatus] = useState<CatalogStatus>(() => (slug ? "loading" : "idle"));
  const [payload, setPayload] = useState<ProductPayload | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Same contract as `useCatalog`: a failed fetch may be retried, so
  // `error -> loading` is a legal transition. The attempt counter re-runs the
  // effect rather than adding a second code path.
  const retry = useCallback(() => {
    productCache.delete(slug ?? "");
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setStatus("idle");
      setPayload(null);
      return;
    }
    let alive = true;
    setStatus("loading");
    fetchProductPayload(slug)
      .then((p) => {
        if (!alive) return;
        setPayload(p);
        setStatus("ready");
      })
      .catch(() => {
        if (!alive) return;
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [slug, attempt]);

  return { status, payload, retry };
}

/**
 * Row-set state for a view that starts from prerendered props and upgrades to
 * the full catalog when it needs to filter, search or resolve an entry.
 *
 * `idle` is the normal first-visit state and must stay that way until something
 * asks for more: views call `request()` from an interaction, never from render.
 * `ready` is sticky for the session, so navigating between routes costs
 * nothing after the first request.
 */
export function useCatalog(): {
  status: CatalogStatus;
  items: Listing[] | null;
  request: () => void;
} {
  const [status, setStatus] = useState<CatalogStatus>(() => (cached ? "ready" : "idle"));
  const [items, setItems] = useState<Listing[] | null>(() => cached);

  const request = useCallback(() => {
    // A session that already has the rows needs no request; a failed one is
    // allowed to try again, so `error → loading` is a legal transition.
    setStatus((s) => (s === "idle" || s === "error" ? "loading" : s));
  }, []);

  useEffect(() => {
    if (status !== "loading") return;
    let alive = true;
    fetchCatalog()
      .then((rows) => {
        if (!alive) return;
        setItems(rows);
        setStatus("ready");
      })
      .catch(() => {
        if (!alive) return;
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [status]);

  return { status, items, request };
}

// ---------------------------------------------------------------------------
// Palette facets (LPSM-J009).
//
// One small document — 64 categories with the counts the build measured — so
// the command palette can offer a Categories section before any row has been
// fetched. The bytes are the build's own counts, not a live measurement, so a
// count printed from here is settled by construction, exactly like the
// prerendered facets on `/categories/`.
// ---------------------------------------------------------------------------

/** One row of `/data/catalog-categories.json`, in the order the build sorted it. */
export interface CategoryCount {
  name: string;
  count: number;
}

interface CategoriesDocument {
  schema?: string;
  rowCount?: number;
  datasetDigest?: string;
  categories?: unknown;
}

let categoriesCache: CategoryCount[] | null = null;
let categoriesInflight: Promise<CategoryCount[]> | null = null;

/**
 * Fetch the category facets, once per session.
 *
 * Called by the palette when it opens — an interaction. Nothing on a passive
 * visit calls this, which is what keeps `/data/` out of a cold load.
 *
 * A response that carries no usable list is an error, not an empty catalog: a
 * stale or foreign document must render as "unavailable", never as "there are
 * no categories". Entries with a non-string name or a non-numeric count are
 * dropped rather than coerced, so a malformed row cannot print a made-up
 * number.
 */
export function loadCatalogCategories(): Promise<CategoryCount[]> {
  if (categoriesCache) return Promise.resolve(categoriesCache);
  if (categoriesInflight) return categoriesInflight;
  categoriesInflight = fetch(CATEGORIES_URL, { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`categories fetch failed: HTTP ${res.status}`);
      return res.json() as Promise<unknown>;
    })
    .then((raw) => {
      const doc = raw as CategoriesDocument;
      if (!Array.isArray(doc?.categories)) {
        throw new Error("categories document carried no category list");
      }
      const clean: CategoryCount[] = [];
      for (const entry of doc.categories as Array<Record<string, unknown>>) {
        const { name, count } = entry ?? {};
        if (typeof name === "string" && name.length > 0 && typeof count === "number" && Number.isFinite(count)) {
          clean.push({ name, count });
        }
      }
      if (clean.length === 0) throw new Error("categories document listed no categories");
      categoriesCache = clean;
      categoriesInflight = null;
      return clean;
    })
    .catch((err) => {
      categoriesInflight = null;
      throw err;
    });
  return categoriesInflight;
}

// ---------------------------------------------------------------------------
// Publisher facets.
//
// One document — the publishers that published more than one entry, with the
// count each one's filter returns — so Explore's Publisher control can offer a
// list before the reader has typed anything. The bytes are the build's own
// counts, not a live measurement, so a count printed from here is settled by
// construction, exactly like the category facets and the prerendered facets on
// `/categories/`.
// ---------------------------------------------------------------------------

/** One row of `/data/catalog-publishers.json`. */
export interface PublisherCount {
  name: string;
  count: number;
}

export interface PublisherFacets {
  /** The publishers with more than one entry, largest first. */
  publishers: PublisherCount[];
  /** Every distinct publisher in the snapshot, listed or not. */
  publisherCount: number;
}

interface PublishersDocument {
  schema?: string;
  rowCount?: number;
  datasetDigest?: string;
  publisherCount?: unknown;
  publishers?: unknown;
}

let publishersCache: PublisherFacets | null = null;
let publishersInflight: Promise<PublisherFacets> | null = null;

/**
 * Fetch the publisher facets, once per session.
 *
 * Called when the reader opens the Publisher control — an interaction. A
 * passive visit fetches nothing, which is the same contract the category
 * facets keep.
 *
 * A response that carries no usable list is an error, not an empty catalog: a
 * stale or foreign document must render as "unavailable", never as "there are
 * no publishers". Entries with a non-string name or a non-numeric count are
 * dropped rather than coerced, so a malformed row cannot print a made-up
 * number.
 */
export function loadCatalogPublishers(): Promise<PublisherFacets> {
  if (publishersCache) return Promise.resolve(publishersCache);
  if (publishersInflight) return publishersInflight;
  publishersInflight = fetch(PUBLISHERS_URL, { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`publishers fetch failed: HTTP ${res.status}`);
      return res.json() as Promise<unknown>;
    })
    .then((raw) => {
      const doc = raw as PublishersDocument;
      if (!Array.isArray(doc?.publishers)) {
        throw new Error("publishers document carried no publisher list");
      }
      const clean: PublisherCount[] = [];
      for (const entry of doc.publishers as Array<Record<string, unknown>>) {
        const { name, count } = entry ?? {};
        if (
          typeof name === "string" &&
          name.length > 0 &&
          typeof count === "number" &&
          Number.isFinite(count)
        ) {
          clean.push({ name, count });
        }
      }
      if (clean.length === 0) throw new Error("publishers document listed no publishers");
      const total =
        typeof doc.publisherCount === "number" && Number.isFinite(doc.publisherCount)
          ? doc.publisherCount
          : clean.length;
      publishersCache = { publishers: clean, publisherCount: total };
      publishersInflight = null;
      return publishersCache;
    })
    .catch((err) => {
      publishersInflight = null;
      throw err;
    });
  return publishersInflight;
}
