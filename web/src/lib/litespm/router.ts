"use client";

import { create } from "zustand";

import { exploreHash, parsePath, toPath, type Route } from "./route";

// The pure model lives in ./route (importable from server components); this
// module re-exports it so existing imports keep working.
export * from "./route";

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

  const route = parsePath(window.location.pathname, window.location.search);
  // `/explore` is a retired alias of `/marketplace`: show the canonical URL.
  if (route.view === "marketplace" && window.location.pathname.startsWith("/explore")) {
    try {
      window.history.replaceState(null, "", exploreHash(route.query, route.tab));
    } catch {}
  }
  return route;
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
  navigate: (target: string, options?: { replace?: boolean }) => void;
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
  navigate: (target, options) => {
    const cleanPath = toPath(target);
    if (typeof window !== "undefined") {
      const current = window.location.pathname + window.location.search;
      if (current !== cleanPath) {
        // `replace` is for refinements of the same page (typing in the search
        // box) so Back leaves the page instead of replaying every keystroke.
        if (options?.replace) window.history.replaceState(null, "", cleanPath);
        else window.history.pushState(null, "", cleanPath);
      }
      set({ route: parsePath(cleanPath) });
    }
  },
  syncFromHash: () => {
    if (typeof window === "undefined") return;
    set({ route: parseLocation() });
  },
}));
