/// <reference lib="webworker" />

// Dedicated Web Worker that owns the catalog search index.
//
// It does **not** receive the catalog rows. The previous worker was seeded with
// all 69,376 rows on every init — a ~52 MB structured clone on the main thread
// — and then spent seconds building a MiniSearch index over them. Now the
// worker fetches the postings index emitted at build time
// (`/data/catalog-search-index.bin.gz`, 2.7 MiB gzipped), decodes it into typed
// arrays, and answers queries with ranked **row indices**. The main thread
// keeps the display projection and hydrates exactly the rows it renders.
//
// Fetching from the worker rather than posting the bytes in keeps the main
// thread free: the 2.7 MiB of compressed index never lands in a main-thread
// ArrayBuffer and never crosses a structured clone.
//
// The query semantics live in `lib/searchFormat.mjs` — the same
// `querySearchIndex` the in-thread fallback calls, so both paths answer with
// the same row set as `matchesQuery`, which `scripts/check-search-index.mjs`
// proves over the real dataset.

import { querySearchIndex } from "./searchFormat.mjs";
import { fetchSearchIndex } from "./searchAssets";
import type { DecodedSearchIndex } from "./searchAssets";

/** Messages the main thread sends to the worker. */
export type WorkerInboundMessage =
  | { type: "load"; url: string }
  | { type: "search"; id: number; query: string };

/** Messages the worker sends back to the main thread. */
export type WorkerOutboundMessage =
  | { type: "ready"; rowCount: number }
  | { type: "error"; message: string }
  | { type: "results"; id: number; indices: number[] };

type SearchRequest = Extract<WorkerInboundMessage, { type: "search" }>;

/** Bound as a dedicated worker; `dom` types would otherwise type this as Window. */
const scope = self as unknown as DedicatedWorkerGlobalScope;

let index: DecodedSearchIndex | null = null;
let state: "idle" | "loading" | "ready" | "error" = "idle";
// Searches that arrive before the index exists are queued and flushed on load.
const pending: SearchRequest[] = [];
const MAX_PENDING = 25;

function post(message: WorkerOutboundMessage): void {
  scope.postMessage(message);
}

function respond(message: SearchRequest): void {
  if (!index) {
    post({ type: "results", id: message.id, indices: [] });
    return;
  }
  try {
    post({ type: "results", id: message.id, indices: querySearchIndex(index, message.query) });
  } catch {
    // Never crash the worker on a bad search; report "no results".
    post({ type: "results", id: message.id, indices: [] });
  }
}

function flushPending(): void {
  while (pending.length > 0) {
    const message = pending.shift();
    if (message) respond(message);
  }
}

async function load(url: string): Promise<void> {
  if (state === "loading" || state === "ready") return;
  state = "loading";
  try {
    const loaded = await fetchSearchIndex(url);
    index = loaded.index;
    state = "ready";
    post({ type: "ready", rowCount: loaded.rowCount });
    flushPending();
  } catch (error) {
    state = "error";
    pending.length = 0;
    post({
      type: "error",
      message: error instanceof Error ? error.message : "search index load failed",
    });
  }
}

scope.onmessage = (event: MessageEvent<WorkerInboundMessage>): void => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.type === "load") {
    void load(message.url);
    return;
  }
  if (message.type === "search") {
    if (state === "ready") {
      respond(message);
      return;
    }
    if (state === "error") {
      // The main thread is told about the failure and switches to its own
      // fallback; answer defensively so a late search cannot hang.
      post({ type: "results", id: message.id, indices: [] });
      return;
    }
    if (pending.length >= MAX_PENDING) pending.shift();
    pending.push(message);
  }
};

export {};
