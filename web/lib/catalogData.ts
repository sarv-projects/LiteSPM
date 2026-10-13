"use client";

// Lazily-fetched catalog rows.
//
// The dataset (69,376 rows, ~52 MB) is NOT part of any JavaScript bundle: the
// build-time pages prerender from `data/catalog.json` through a Server
// Component (server bundles never reach the browser), and the browser fetches
// the same rows only when a page actually needs the full set. The served
// document at `/data/catalog.json` is a shard index emitted by
// `scripts/emit-catalog-shards.mjs` from that same file at build time; the
// rows themselves arrive as ordered shard files that this module concatenates.
//
// Timing is the point of the design. A first visit therefore downloads the
// page's HTML and ~107 kB of First Load JS and nothing else; the dataset is
// requested on the first interaction that needs it (typing in search, changing
// a filter, opening an entry), and never on a passive visit. Until then the
// prerendered rows are on screen and stay on screen — this module does not
// replace them with a spinner.

import { useCallback, useEffect, useState } from "react";
import type { Listing } from "./telemetry";
import { withLinkKeys } from "./catalog";
import bundledRelease from "../data/release.json";

/**
 * Shard index as served: the build-time emitter writes it to
 * `web/public/data/catalog.json`; the rows arrive as the shard files it names
 * and are re-keyed with `withLinkKeys` once concatenated.
 */
export const CATALOG_PATH = "/data/catalog.json";

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
    ? `?v=${encodeURIComponent(digest)}`
    : "";
})();

export const CATALOG_URL = `${CATALOG_PATH}${DATASET_VERSION}`;

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
    return rows;
  });
}

function fetchCatalog(): Promise<Listing[]> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = fetch(CATALOG_URL, { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`catalog fetch failed: HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      // A plain array is a legacy single-file export; the sharded build serves
      // an index document that names the shard files to concatenate in order.
      if (Array.isArray(data)) return data as unknown as Listing[];
      if (!isCatalogIndex(data)) {
        throw new Error("catalog document is neither a row array nor a shard index");
      }
      return fetchRowsFromShards(data);
    })
    .then((rows) => {
      const items = withLinkKeys(rows);
      cached = items;
      inflight = null;
      return items;
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
   * The ~270 rows sharing this bucket, as an array.
   *
   * Not a slug-keyed map: 121 slugs in this catalog belong to more than one
   * row, and the view's `buildLookup` resolves that by keying ids always and
   * slugs only when unambiguous. Keying by slug here would drop a row.
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
        rows: withLinkKeys(Array.isArray(doc.rows) ? doc.rows : []),
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
 * Same-category siblings, or `null` when the category is one of the two that
 * hold most of the catalog — there, twelve arbitrary entries say nothing and
 * the "see all" link is the honest answer.
 */
const siblingCache = new Map<string, Listing[]>();
const siblingInflight = new Map<string, Promise<Listing[] | null>>();

/** `null` result = no sibling file exists for this category (by design). */
export function fetchCategorySiblings(category: string): Promise<Listing[] | null> {
  const slug = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) return Promise.resolve(null);
  const hit = siblingCache.get(slug);
  if (hit) return Promise.resolve(hit);
  const running = siblingInflight.get(slug);
  if (running) return running;

  const p = fetch(`${PACKAGE_DATA_DIR}/cat/${slug}.json${DATASET_VERSION}`)
    .then((res) => {
      // A 404 here is a normal answer, not a failure: it means the category is
      // too large to have a sibling file.
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`category ${res.status}`);
      return res.json();
    })
    .then((rows: Listing[] | null) => {
      const out = rows ? withLinkKeys(rows) : null;
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
