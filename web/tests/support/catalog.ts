// Dataset and build fixtures for the browser suite.
//
// Every entry a spec navigates to is derived from the committed dataset and
// the build's own artifacts — never hardcoded — so the suite keeps testing the
// site that actually shipped when the catalog changes. The deliberate
// exceptions are the flagship colon-bearing entry and a publisher-sibling
// recommendation fixture; each is named because the test covers that exact
// behavior and fails loudly if its catalog contract disappears.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** `web/` — this file lives in `web/tests/support/`. */
export const WEB_ROOT = join(__dirname, "..", "..");
export const OUT_DIR = join(WEB_ROOT, "out");

export interface Listing {
  id: string;
  name: string;
  slug: string;
  kind: "mcp" | "skill" | "plugin";
  category: string;
  summary?: string;
  transport?: string | null;
  url?: string | null;
  installability?: string;
  /** Publisher-declared hosts — carried by plugin rows only. */
  compatibleHosts?: string[];
  source?: string;
  hosts?: string[];
  publisher?: { name?: string; url?: string; verified?: boolean };
  linkKey?: string;
}

let cachedRows: Listing[] | null = null;

export function catalogRows(): Listing[] {
  if (!cachedRows) {
    cachedRows = JSON.parse(
      readFileSync(join(WEB_ROOT, "data", "catalog.json"), "utf8")
    ) as Listing[];
  }
  return cachedRows;
}

/**
 * The whole-dataset key rule, exactly as `lib/catalog.ts` `withLinkKeys`
 * resolves it: the slug when it is unique across the dataset, the id
 * otherwise. Ids carry `:`, which is why an ambiguous slug is excluded from
 * the pre-rendered set.
 */
let cachedKeys: Map<string, string> | null = null;

export function linkKeyByRowId(): Map<string, string> {
  if (!cachedKeys) {
    const counts = new Map<string, number>();
    for (const row of catalogRows()) counts.set(row.slug, (counts.get(row.slug) ?? 0) + 1);
    cachedKeys = new Map(
      catalogRows().map((row) => [row.id, counts.get(row.slug) === 1 ? row.slug : row.id])
    );
  }
  return cachedKeys;
}

export function keyOf(row: Listing): string {
  return linkKeyByRowId().get(row.id) ?? row.id;
}

/** The keys the build itself advertises at `/package/entries/sitemap.xml`. */
let cachedSitemapKeys: Set<string> | null = null;

export function preRenderedKeys(): Set<string> {
  if (!cachedSitemapKeys) {
    const xml = readFileSync(join(OUT_DIR, "package", "entries", "sitemap.xml"), "utf8");
    const keys = new Set<string>();
    for (const match of xml.matchAll(/<loc>[^<]*\/package\/([^<]+)\/<\/loc>/g)) {
      keys.add(decodeURIComponent(match[1]));
    }
    cachedSitemapKeys = keys;
  }
  return cachedSitemapKeys;
}

export interface EntryFixture {
  row: Listing;
  /** The whole-dataset key (`linkKey ?? id`). */
  key: string;
  /** Canonical address: `/package/<key>/`. */
  href: string;
  /** The legacy query address: `/package/?slug=<key>`. */
  queryHref: string;
}

export function entryFixture(row: Listing): EntryFixture {
  const key = keyOf(row);
  return {
    row,
    key,
    href: `/package/${encodeURIComponent(key)}/`,
    queryHref: `/package/?slug=${encodeURIComponent(key)}`,
  };
}

/** True when the key can be a directory name on every OS (`isStaticEntryKey`). */
function isSafeKey(key: string): boolean {
  return (
    /^[a-z0-9][a-z0-9._-]*$/.test(key) &&
    !key.includes("..") &&
    !key.endsWith(".") &&
    !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(key)
  );
}

/**
 * A pre-rendered entry: the first key in the build's entries sitemap, in plain
 * string order. The sitemap is written by the same selection rule
 * `generateStaticParams` uses, so "advertised" and "served" cannot disagree.
 */
export function preRenderedEntry(): EntryFixture {
  const keys = preRenderedKeys();
  if (keys.size === 0) {
    throw new Error(
      "no pre-rendered entries in out/package/entries/sitemap.xml — run `npm run build` first"
    );
  }
  const byKey = new Map(catalogRows().map((row) => [keyOf(row), row]));
  for (const key of [...keys].sort()) {
    const row = byKey.get(key);
    if (row) return entryFixture(row);
  }
  throw new Error("the entries sitemap names no key that data/catalog.json contains");
}

/**
 * A non-pre-rendered entry: a file-safe key that is not in the sitemap and
 * that carries a summary, so the Worker's no-JS identity block has both a name
 * and a summary to serve. Plain string order keeps the pick deterministic.
 */
export function nonPreRenderedEntry(): EntryFixture {
  const pre = preRenderedKeys();
  const candidates = catalogRows()
    .filter((row) => {
      const key = keyOf(row);
      return isSafeKey(key) && !pre.has(key) && Boolean(row.summary?.trim());
    })
    .sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  const row = candidates[0];
  if (!row) throw new Error("no non-pre-rendered entry with a safe key was found");
  return entryFixture(row);
}

/**
 * The flagship colon-bearing entry: the official GitHub MCP server. Its slug
 * (`github-mcp-server`) is shared with another publisher's row, so its key is
 * the colon-bearing id and it is served by the edge Worker, not by a
 * pre-rendered file — the exact shape the P0 was reported with.
 */
export const FLAGSHIP_ID = "mcp:builtin:mcp-registry:io.github.github-github-mcp-server";

export function flagshipEntry(): EntryFixture {
  const row = catalogRows().find((candidate) => candidate.id === FLAGSHIP_ID);
  if (!row) {
    throw new Error(
      `the flagship entry ${FLAGSHIP_ID} is not in data/catalog.json — update the fixture deliberately, do not drop the case`
    );
  }
  const fixture = entryFixture(row);
  if (!fixture.key.includes(":")) {
    throw new Error(
      `the flagship entry's key is ${fixture.key}, not a colon-bearing id — the colon case is no longer covered`
    );
  }
  if (preRenderedKeys().has(fixture.key)) {
    throw new Error(
      `the flagship entry is now pre-rendered (${fixture.key}) — the Worker path is no longer covered by it`
    );
  }
  return fixture;
}

/** A vendor skill with an installable sibling for the related-entry rail. */
export function recommendationEntry(): EntryFixture {
  const id = "skill:cloudflare:wrangler";
  const row = catalogRows().find((candidate) => candidate.id === id);
  if (!row) {
    throw new Error(`the related-entry fixture ${id} is not in data/catalog.json`);
  }
  return entryFixture(row);
}

/** HTML-escape the way React escapes text and attribute values. */
export function htmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Does this served-HTML body contain the text, escaped or not? */
export function htmlContains(html: string, text: string): boolean {
  return html.includes(text) || html.includes(htmlEscape(text));
}
