"use client";

// The command palette's model (LPSM-J009).
//
// Everything here is either a fact the page already holds in memory (the host
// registry, the static route list) or a small document the palette fetches the
// first time it opens (the category facets — see `loadCatalogCategories`). The
// catalog's own search path is not duplicated here: capability results come
// from `useCatalogSearch`, the same hook Explore and the landing page use.
//
// What this module deliberately does NOT hold: a category list, a host count
// derived from the dataset, or any row data. Those are catalog bytes, and a
// catalog byte may not enter a JavaScript chunk (J002's acceptance).

import { useCallback, useEffect, useState } from "react";
import { HOSTS } from "./hosts";
import { vendorName } from "./vendorNames";
import { loadCatalogCategories } from "./catalogData";
import { tokenizeText } from "./searchFormat.mjs";
import { AGENT_STORAGE_KEY, findAgentChoice } from "./landing";
import {
  ARCHITECTURE_URL,
  DOCS_URL,
} from "./site";
import type { AgentChoice } from "./landing";
import type { CategoryCount } from "./catalogData";

/** One destination the palette can open: a label, a path, and nothing else. */
export interface PaletteDestination {
  /** Stable identity for the React key and the active-row cursor. */
  key: string;
  label: string;
  /** The technical/descriptive second line, one level deeper. */
  detail?: string;
  /**
   * Extra words this row should answer to that are not in `label`/`detail`
   * (an id, an alias). Read by the matcher, never rendered.
   */
  terms?: string;
  href: string;
}

/**
 * The site's own pages, in the order a developer looks for them.
 *
 * Every href here is a route that exists (or a section anchor the home page
 * really carries — `#install` is `DeveloperZone`'s own id). Nothing links
 * `/docs`, `/tour` or `/compare`: those are `DESIGNED` rows, not pages, and a
 * palette that offers a 404 is worse than one with a short docs list. The two
 * repository documents are named as what they are — external links, the same
 * ones the footer and the landing page's developer zone already use.
 */
export const PALETTE_PAGES: PaletteDestination[] = [
  {
    key: "page:explore",
    label: "Explore the catalog",
    detail: "Search and filter every capability",
    href: "/explore/",
  },
  {
    key: "page:agents",
    label: "Agent hosts",
    detail: `The ${HOSTS.length} hosts LiteSPM can configure`,
    href: "/agents/",
  },
  {
    key: "page:categories",
    label: "Categories",
    detail: "Goals and upstream source categories",
    href: "/categories/",
  },
  {
    key: "page:coverage",
    label: "Coverage",
    detail: "Where the catalog's rows come from — counts, not stars",
    href: "/insights/",
  },
  {
    key: "page:install",
    label: "Install LiteSPM",
    detail: "npm install -g litespm · manual setup per agent",
    href: "/#install",
  },
  {
    key: "page:home",
    label: "Home",
    detail: "The product page",
    href: "/",
  },
  {
    key: "doc:readme",
    label: "README",
    detail: "Install, commands and usage — on GitHub",
    href: DOCS_URL,
  },
  {
    key: "doc:architecture",
    label: "Architecture index",
    detail: "The design documents — on GitHub",
    href: ARCHITECTURE_URL,
  },
];

/**
 * The agents a reader can jump to: one row per bridge adapter, from the same
 * generated registry `/agents` renders (`data/hosts.json` → `lib/hosts.ts`).
 * The display name is the vendor's own where it differs from the registry
 * spelling (`vendorName`), and the second line is the config path this adapter
 * writes — the technical layer, on the row, because that is what a developer
 * scanning agents is looking for.
 */
export const PALETTE_AGENTS: PaletteDestination[] = HOSTS.map((host) => ({
  key: `agent:${host.id}`,
  label: vendorName(host.id, host.name),
  detail: host.userPath || `${host.kind} configuration`,
  terms: `${host.id} ${host.name}`,
  href: `/agents/${host.id}/`,
}));

// ---------------------------------------------------------------------------
// Recents — local, minimal, and stated in the units it stores
// ---------------------------------------------------------------------------

/**
 * What is stored, in full: the label of a destination the reader opened, its
 * path on this site, and the second line that was on screen. That is all —
 * no query text, no timestamps, no counters, no identifiers. The list never
 * leaves the browser (this is a static site with no receiver), and the palette
 * offers "Clear recent destinations" as the last row of the section, so the
 * reader can drop it without leaving the dialog.
 *
 * Why not store the query: a query is the most sensitive thing on this screen
 * ("healthcare", a customer name). A list of pages the reader chose to open is
 * behaviour, and it is the behaviour the "Recent" section is for.
 */
export const RECENT_STORAGE_KEY = "litespm-palette-recent";
export const RECENT_LIMIT = 5;

interface StoredRecent {
  label?: unknown;
  detail?: unknown;
  href?: unknown;
}

/** Two rows are the same destination when they open the same path. */
function isSameDestination(recent: PaletteDestination, href: string): boolean {
  return recent.href === href;
}

/** The remembered destinations, most recent first. Never throws. */
export function readRecentDestinations(): PaletteDestination[] {
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: StoredRecent[] };
    if (!Array.isArray(parsed?.items)) return [];
    const out: PaletteDestination[] = [];
    for (const item of parsed.items) {
      if (typeof item?.label !== "string" || typeof item?.href !== "string") continue;
      out.push({
        key: `recent:${item.href}`,
        label: item.label,
        detail: typeof item.detail === "string" ? item.detail : undefined,
        href: item.href,
      });
      if (out.length >= RECENT_LIMIT) break;
    }
    return out;
  } catch {
    // Storage can be unavailable (private mode, policy); the palette works
    // without a history, it just forgets.
    return [];
  }
}

/** Remember one opened destination; a repeat moves it back to the front. */
export function rememberDestination(destination: PaletteDestination): void {
  try {
    const previous = readRecentDestinations().filter((recent) => !isSameDestination(recent, destination.href));
    const items = [destination, ...previous].slice(0, RECENT_LIMIT).map(({ label, detail, href }) => ({
      label,
      detail,
      href,
    }));
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify({ v: 1, items }));
  } catch {
    /* Best-effort: a full or denied store must not break navigation. */
  }
}

export function clearRecentDestinations(): void {
  try {
    window.localStorage.removeItem(RECENT_STORAGE_KEY);
  } catch {
    /* Storage denied: there is nothing to clear. */
  }
}

// ---------------------------------------------------------------------------
// The reader's remembered agent
// ---------------------------------------------------------------------------

/**
 * The agent chosen on the home page, if one was. EXPLORE turns this choice into
 * a *ranking preference* over a search's own order (compatible rows first,
 * everything else still below) and the palette applies the same preference for
 * the same reason: the site promised to remember "what you use", and a palette
 * that ignored it would answer a different question than Explore's own results
 * list for the identical query.
 */
export function rememberedAgent(): AgentChoice | null {
  try {
    const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
    return stored ? findAgentChoice(stored) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// `/` — whose key is it
// ---------------------------------------------------------------------------

/**
 * `/` focuses a page's own search field where one exists (`SearchBar` — the
 * hero and Explore), and opens the palette where none does.
 *
 * The field wins on the two routes that have one, deliberately: its keyboard
 * behaviour is documented and advertised on screen (the `<kbd>/</kbd>` in the
 * field), and on Explore the field is wired to the visible result list, which a
 * dialog is not. ⌘K/Ctrl-K opens the palette on every route, and the header's
 * search control always does — so no reader is left without a way in.
 *
 * Implemented as a mount registry rather than by reading the DOM: SearchBar
 * tells this module it is on the page, and the palette's handler asks.
 */
let pageSearchFields = 0;

export function registerPageSearchField(): () => void {
  pageSearchFields += 1;
  return () => {
    pageSearchFields = Math.max(0, pageSearchFields - 1);
  };
}

export function pageSearchFieldIsPresent(): boolean {
  return pageSearchFields > 0;
}

// ---------------------------------------------------------------------------
// Matching the small lists
// ---------------------------------------------------------------------------

/**
 * The catalog's tokenizer and prefix rule, applied to the lists the palette
 * holds in memory (agents, categories, pages) — the same `tokenizeText` the
 * index is built with, so `git` matches `GitHub` here for the same reason it
 * does there, and a substring matcher cannot sneak back in.
 *
 * These lists are tiny and already ordered by something real (registry order,
 * entry count), so the ranking stays a two-tier rule: a token that prefixes the
 * label outranks one that only prefixes the detail; ties keep the list's own
 * order. There are no match classes here, and none are claimed.
 */
export function localMatches<T>(
  query: string,
  items: readonly T[],
  fieldsOf: (item: T) => { label: string; detail?: string; terms?: string }
): T[] {
  const tokens = tokenizeText(query);
  if (tokens.length === 0) return items.slice();
  const scored: Array<{ item: T; score: number; at: number }> = [];
  items.forEach((item, at) => {
    const fields = fieldsOf(item);
    const labelTokens = tokenizeText(fields.label);
    const restTokens = tokenizeText([fields.detail, fields.terms].filter(Boolean).join(" "));
    let score = 0;
    for (const token of tokens) {
      const inLabel = labelTokens.some((text) => text.startsWith(token));
      const inRest = restTokens.some((text) => text.startsWith(token));
      if (!inLabel && !inRest) return;
      score += inLabel ? 2 : 1;
    }
    scored.push({ item, score, at });
  });
  scored.sort((a, b) => b.score - a.score || a.at - b.at);
  return scored.map((entry) => entry.item);
}

// ---------------------------------------------------------------------------
// The one fetch: category facets
// ---------------------------------------------------------------------------

export type PaletteCategories =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; categories: CategoryCount[] }
  | { status: "error" };

/**
 * Load the category facets the first time the palette opens — an interaction,
 * which is what the E1 contract allows ("opening it is an interaction and may
 * fetch the dataset"). A passive visit never calls this.
 *
 * The document holds the build's own counts, so a count rendered beside a
 * category is settled by construction; the three states below stop a failed
 * fetch from rendering as "no categories".
 */
export function usePaletteCategories(open: boolean): PaletteCategories {
  const [state, setState] = useState<PaletteCategories>({ status: "idle" });

  const load = useCallback(() => {
    setState((current) => (current.status === "loading" || current.status === "ready" ? current : { status: "loading" }));
    let alive = true;
    loadCatalogCategories()
      .then((categories) => {
        if (!alive) return;
        setState({ status: "ready", categories });
      })
      .catch(() => {
        if (!alive) return;
        setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    return load();
  }, [open, load]);

  return state;
}
