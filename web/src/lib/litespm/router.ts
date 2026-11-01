"use client";

import { create } from "zustand";

export type SortKey = "relevance" | "rank" | "name" | "kind" | "publisher";

export interface ExploreQuery {
  q?: string;
  kind?: string;
  goal?: string;
  category?: string;
  publisher?: string;
  installability?: string;
  transport?: string;
  host?: string;
  installable?: string;
  sort?: SortKey;
  page?: number;
}

export type Route =
  | { view: "home" }
  | { view: "explore"; query: ExploreQuery }
  | { view: "package"; key: string }
  | { view: "agents" }
  | { view: "agent"; id: string }
  | { view: "docs"; section: string }
  | { view: "publish" }
  | { view: "insights" }
  | { view: "compare"; keys: string[] };

export const SORT_KEYS: SortKey[] = ["relevance", "rank", "name", "kind", "publisher"];

export function exploreHash(query: ExploreQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.kind) params.set("kind", query.kind);
  if (query.goal) params.set("goal", query.goal);
  if (query.category) params.set("category", query.category);
  if (query.publisher) params.set("publisher", query.publisher);
  if (query.installability) params.set("installability", query.installability);
  if (query.transport) params.set("transport", query.transport);
  if (query.host) params.set("host", query.host);
  if (query.installable) params.set("installable", query.installable);
  if (query.sort && SORT_KEYS.includes(query.sort)) params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return `#/explore${qs ? `?${qs}` : ""}`;
}

export function compareHash(keys: string[]): string {
  return keys.length === 0 ? "#/compare" : `#/compare?keys=${keys.map(encodeURIComponent).join(",")}`;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [path, search] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(search ?? "");

  if (parts[0] === "explore") {
    const q: ExploreQuery = {};
    for (const key of [
      "q",
      "kind",
      "goal",
      "category",
      "publisher",
      "installability",
      "transport",
      "host",
      "installable",
    ] as const) {
      const value = params.get(key);
      if (value) q[key] = value;
    }
    const sort = params.get("sort");
    if (sort && ["relevance", "rank", "name", "kind", "publisher"].includes(sort)) q.sort = sort as SortKey;
    const page = parseInt(params.get("page") ?? "1", 10);
    if (page > 1) q.page = page;
    return { view: "explore", query: q };
  }
  if (parts[0] === "package" && parts[1]) {
    // Link keys may contain slashes: #/package/mcp-registry-io-github-github-mcp-server
    const rest = path.replace(/^package\//, "");
    return { view: "package", key: decodeURIComponent(rest) };
  }
  if (parts[0] === "agents") {
    return { view: "agents" };
  }
  if (parts[0] === "agent" && parts[1]) {
    return { view: "agent", id: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "docs") {
    return { view: "docs", section: parts[1] ?? "introduction" };
  }
  if (parts[0] === "publish") {
    return { view: "publish" };
  }
  if (parts[0] === "insights") {
    return { view: "insights" };
  }
  if (parts[0] === "compare") {
    const keys = (params.get("keys") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .map(decodeURIComponent);
    return { view: "compare", keys };
  }
  return { view: "home" };
}

interface AppState {
  route: Route;
  paletteOpen: boolean;
  assistantOpen: boolean;
  /** Compare tray: the linkKeys currently staged for comparison. */
  compareKeys: string[];
  setPalette: (open: boolean) => void;
  setAssistant: (open: boolean) => void;
  toggleCompare: (linkKey: string) => void;
  clearCompare: () => void;
  navigate: (hash: string) => void;
  syncFromHash: () => void;
}

export const useApp = create<AppState>((set, get) => ({
  route: { view: "home" },
  paletteOpen: false,
  assistantOpen: false,
  compareKeys: [],
  setPalette: (open) =>
    set(open ? { paletteOpen: true, assistantOpen: false } : { paletteOpen: false }),
  setAssistant: (open) =>
    set(open ? { assistantOpen: true, paletteOpen: false } : { assistantOpen: false }),
  toggleCompare: (linkKey) => {
    const keys = get().compareKeys;
    set({
      compareKeys: keys.includes(linkKey)
        ? keys.filter((k) => k !== linkKey)
        : [...keys, linkKey].slice(-4),
    });
  },
  clearCompare: () => set({ compareKeys: [] }),
  navigate: (hash) => {
    const target = hash.startsWith("#") ? hash : `#${hash.startsWith("/") ? hash : `/${hash}`}`;
    if (typeof window !== "undefined") {
      if (window.location.hash === target) {
        set({ route: parseHash(target) });
      } else {
        window.location.hash = target;
      }
    }
  },
  syncFromHash: () => {
    if (typeof window === "undefined") return;
    set({ route: parseHash(window.location.hash) });
  },
}));
