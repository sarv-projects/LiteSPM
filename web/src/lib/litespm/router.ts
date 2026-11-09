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
  | { view: "marketplace"; tab: string; q?: string }
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
  return `/explore${qs ? `?${qs}` : ""}`;
}

export function marketplaceHash(tab: string = "skills", q?: string): string {
  const params = new URLSearchParams();
  if (tab && tab !== "skills") params.set("tab", tab);
  if (q) params.set("q", q);
  const qs = params.toString();
  return `/marketplace${qs ? `?${qs}` : ""}`;
}

export function compareHash(keys: string[]): string {
  return keys.length === 0 ? "/compare" : `/compare?keys=${keys.map(encodeURIComponent).join(",")}`;
}

export function toPath(target: string): string {
  if (!target) return "/";
  // Only hashes beginning with "#/" are application routes. Ordinary
  // fragment identifiers (for example #main-content) must remain anchors.
  if (target.startsWith("#/")) return target.slice(1);
  if (target.startsWith("#")) return target.length > 1 ? target : "/";
  return target.startsWith("/") ? target : `/${target}`;
}

export function parsePath(fullPath: string, searchStr: string = ""): Route {
  const cleanPath = fullPath.replace(/^#\/?/, "").replace(/^\/+/, "");
  const [pathPart, inlineSearch] = cleanPath.split("?");
  const parts = pathPart ? pathPart.split("/").filter(Boolean) : [];
  const params = new URLSearchParams(searchStr || inlineSearch || "");

  if (parts.length === 0 || parts[0] === "") {
    return { view: "home" };
  }

  if (parts[0] === "marketplace") {
    const tab = params.get("tab") ?? "skills";
    const q = params.get("q") ?? undefined;
    return { view: "marketplace", tab, q };
  }

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

  if (parts[0] === "package" && parts.length > 1) {
    const rest = parts.slice(1).join("/");
    return { view: "package", key: decodeURIComponent(rest) };
  }

  if (parts[0] === "agents") {
    return { view: "agents" };
  }

  if (parts[0] === "agent" && parts.length > 1) {
    return { view: "agent", id: decodeURIComponent(parts.slice(1).join("/")) };
  }

  if (parts[0] === "docs") {
    return { view: "docs", section: parts[1] ?? "getting-started" };
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

export function parseLocation(): Route {
  if (typeof window === "undefined") return { view: "home" };

  // Check for backward-compatible hash routing: #/package/... or #/explore?...
  const hash = window.location.hash;
  if (hash.startsWith("#/")) {
    const hashRoute = parsePath(hash.replace(/^#/, ""), "");
    // Upgrade URL in place to clean path without reloading
    const cleanPath = toPath(hash);
    try {
      window.history.replaceState(null, "", cleanPath);
    } catch {}
    return hashRoute;
  }

  return parsePath(window.location.pathname, window.location.search);
}

// Backward-compatible alias for existing imports
export const parseHash = parsePath;

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
  navigate: (target: string) => void;
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
  navigate: (target) => {
    const cleanPath = toPath(target);
    if (typeof window !== "undefined") {
      const current = window.location.pathname + window.location.search;
      if (current !== cleanPath) {
        window.history.pushState(null, "", cleanPath);
      }
      set({ route: parsePath(cleanPath) });
    }
  },
  syncFromHash: () => {
    if (typeof window === "undefined") return;
    set({ route: parseLocation() });
  },
}));
