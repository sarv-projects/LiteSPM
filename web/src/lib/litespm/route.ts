/**
 * Pure route model + parsing. No React, no store: server components (the
 * catch-all page) import this to render the right view on the first byte.
 */

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
  | { view: "marketplace"; tab: MarketplaceTab; query: ExploreQuery }
  | { view: "notfound"; path: string }
  | { view: "package"; key: string }
  | { view: "agents" }
  | { view: "agent"; id: string }
  | { view: "docs"; section: string }
  | { view: "publish" }
  | { view: "insights" }
  | { view: "bundles" }
  | { view: "compare"; keys: string[] };

/**
 * One catalog surface. `/marketplace` is the canonical URL (the CLI, the
 * in-agent popups and the docs all link there); `/explore` is kept only as a
 * redirect. The tab is the kind filter, so there is one query model, not two.
 */
export type MarketplaceTab = "all" | "mcp" | "skills" | "plugins" | "installed";
export const MARKETPLACE_TABS: MarketplaceTab[] = ["all", "mcp", "skills", "plugins", "installed"];

const TAB_TO_KIND: Record<string, string | undefined> = { mcp: "mcp", skills: "skill", plugins: "plugin" };
const KIND_TO_TAB: Record<string, MarketplaceTab> = { mcp: "mcp", skill: "skills", plugin: "plugins" };

export function tabForKind(kind?: string): MarketplaceTab {
  return (kind && KIND_TO_TAB[kind]) || "all";
}

export function kindForTab(tab: string): string | undefined {
  return TAB_TO_KIND[tab];
}

/** decodeURIComponent throws on a stray `%`; a malformed link must not crash the app. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const SORT_KEYS: SortKey[] = ["relevance", "rank", "name", "kind", "publisher"];

export function exploreHash(query: ExploreQuery, tab?: MarketplaceTab): string {
  const params = new URLSearchParams();
  const activeTab = tab ?? tabForKind(query.kind);
  if (activeTab !== "all") params.set("tab", activeTab);
  if (query.q) params.set("q", query.q);
  if (activeTab === "all" && query.kind) params.set("kind", query.kind);
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
  return `/marketplace${qs ? `?${qs}` : ""}`;
}

/** Kept for existing callers: a tab id (`skills`, `mcp`, …) plus an optional search. */
export function marketplaceHash(tab: string = "all", q?: string): string {
  const t = (MARKETPLACE_TABS as string[]).includes(tab) ? (tab as MarketplaceTab) : "all";
  return exploreHash({ q, kind: kindForTab(t) }, t);
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

  if (parts[0] === "marketplace" || parts[0] === "explore") {
    const q: ExploreQuery = {};
    for (const key of [
      "q",
      "goal",
      "category",
      "publisher",
      "installability",
      "transport",
      "host",
      "installable",
    ] as const) {
      const value = params.get(key);
      if (value) q[key] = value.slice(0, 200);
    }
    // `tab` is canonical; the old `/explore?kind=mcp` spelling still resolves.
    const rawTab = params.get("tab");
    let tab: MarketplaceTab = (MARKETPLACE_TABS as string[]).includes(rawTab ?? "")
      ? (rawTab as MarketplaceTab)
      : tabForKind(params.get("kind") ?? undefined);
    const kind = kindForTab(tab);
    if (kind) q.kind = kind;
    else if (tab === "all" && params.get("kind")) q.kind = params.get("kind")!;
    const sort = params.get("sort");
    if (sort && SORT_KEYS.includes(sort as SortKey)) q.sort = sort as SortKey;
    const page = parseInt(params.get("page") ?? "1", 10);
    if (page > 1) q.page = Math.min(page, 10_000);
    if (tab === "all" && q.kind) tab = tabForKind(q.kind);
    return { view: "marketplace", tab, query: q };
  }

  if (parts[0] === "package" && parts.length > 1) {
    const rest = parts.slice(1).join("/");
    return { view: "package", key: safeDecode(rest) };
  }

  if (parts[0] === "agents") {
    return { view: "agents" };
  }

  if (parts[0] === "agent" && parts.length > 1) {
    return { view: "agent", id: safeDecode(parts.slice(1).join("/")) };
  }

  if (parts[0] === "docs") {
    return { view: "docs", section: parts[1] ?? "getting-started" };
  }

  if (parts[0] === "publish") {
    return { view: "publish" };
  }

  if (parts[0] === "bundles") {
    return { view: "bundles" };
  }

  if (parts[0] === "insights") {
    return { view: "insights" };
  }

  if (parts[0] === "compare") {
    const keys = (params.get("keys") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .map(safeDecode);
    return { view: "compare", keys };
  }

  return { view: "notfound", path: `/${parts.join("/")}` };
}

