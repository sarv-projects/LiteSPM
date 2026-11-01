"use client";

import * as React from "react";

import type { CatalogHit } from "./types";

/* ------------------------------------------------------------------ *
 * Watchlist — starred packages, persisted in localStorage.
 * ------------------------------------------------------------------ */

export interface WatchEntry {
  linkKey: string;
  name: string;
  kind: string;
  savedAt: number;
}

const WATCH_KEY = "litespm:watchlist";
const RECENT_KEY = "litespm:recent";

function readList(key: string): WatchEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchEntry[];
    return Array.isArray(parsed) ? parsed.filter((e) => e && e.linkKey) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: WatchEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, 60)));
  } catch {
    /* storage unavailable — degrade silently */
  }
}

export function useWatchlist() {
  const [entries, setEntries] = React.useState<WatchEntry[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setEntries(readList(WATCH_KEY));
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === WATCH_KEY) setEntries(readList(WATCH_KEY));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isWatched = React.useCallback(
    (linkKey: string) => entries.some((e) => e.linkKey === linkKey),
    [entries],
  );

  const toggle = React.useCallback((hit: { linkKey: string; name: string; kind: string }) => {
    const list = readList(WATCH_KEY);
    const next = list.some((e) => e.linkKey === hit.linkKey)
      ? list.filter((e) => e.linkKey !== hit.linkKey)
      : [{ linkKey: hit.linkKey, name: hit.name, kind: hit.kind, savedAt: Date.now() }, ...list];
    writeList(WATCH_KEY, next);
    setEntries(next);
  }, []);

  return { entries, hydrated, isWatched, toggle };
}

/* ------------------------------------------------------------------ *
 * Recently viewed — the last packages opened, most recent first.
 * ------------------------------------------------------------------ */

export function recordView(hit: { linkKey: string; name: string; kind: string }) {
  if (typeof window === "undefined") return;
  const list = readList(RECENT_KEY).filter((e) => e.linkKey !== hit.linkKey);
  const next = [{ linkKey: hit.linkKey, name: hit.name, kind: hit.kind, savedAt: Date.now() }, ...list];
  writeList(RECENT_KEY, next);
}

export function useRecentlyViewed() {
  const [entries, setEntries] = React.useState<WatchEntry[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setEntries(readList(RECENT_KEY));
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === RECENT_KEY) setEntries(readList(RECENT_KEY));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const refresh = React.useCallback(() => setEntries(readList(RECENT_KEY)), []);
  return { entries, hydrated, refresh };
}

/* ------------------------------------------------------------------ *
 * Search state helpers
 * ------------------------------------------------------------------ */

/** Debounce a fast-changing value (search input). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function hitToCompareCandidate(hit: CatalogHit) {
  return { linkKey: hit.linkKey, name: hit.name, kind: hit.kind };
}
