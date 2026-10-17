// Landing-page structures: the "what do you want your AI to do?" taxonomy, the
// "what do you use?" agent strip, the labelled shelves the home page is built
// from, and the provenance counts the trust section prints.
//
// Everything here is a pure function over a row set handed in from above, or a
// table of constants. No JSON import, no `"use client"`, no fetch: the Server
// Component in `app/page.tsx` calls the derivations at build time so the counts
// are in the prerendered HTML, and the client calls `rowWorksWithAgent` over
// rows it already has. Nothing in this module can ask for the dataset.
//
// The topic table maps a hand-written friendly label onto a REAL Explore
// parameter: either an exact `?category=` value from `data/catalog.json` (63
// categories, matched case-sensitively by `useCatalogSearch`) or a `?q=` term
// matched by the same `matchesQuery` the Explore results use. A label that
// cannot name an honest category says so by using `q` — it never invents a slug.

import type { Listing } from "./telemetry";
import { matchesQuery } from "./query";
import { HOSTS, SKILL_TARGETS } from "./hosts";
import { itemMatchesHost } from "./hostIdentity";
import { isDiscontinued } from "./lifecycle";
import { GRID_PAGE, OFFICIAL_SKILLS_CATEGORY, sortListings } from "./catalog";
import { availabilityOf } from "./availability";

/**
 * Re-exported from `lib/catalog.ts`, where the constant lives beside the
 * curated sort that reads it. Every other module keeps importing it from here.
 */
export { OFFICIAL_SKILLS_CATEGORY };

export interface Topic {
  id: string;
  label: string;
  blurb: string;
  /** Exact `?category=` value Explore accepts, when the dataset has one. */
  category?: string;
  /** `?q=` term, for topics the category vocabulary does not cover. */
  query?: string;
  /**
   * Preferred example names, in display order. Verified against the FIRST PAGE
   * of the view the tile links to at build time — a name that is not among the
   * rows Explore shows first is dropped and the gap is backfilled from that
   * page, so the tile cannot advertise a name its own link buries behind a
   * page of results. (It used to be checked against the whole result set,
   * which let a tile show three names none of its first 48 rows contained.)
   */
  examples: string[];
}

export const TOPICS: Topic[] = [
  {
    id: "code",
    label: "Code & Git",
    blurb: "Repositories, reviews, CI and the languages your agent writes.",
    category: "Developer Tools",
    // Drawn from this category's first curated page (the rows Explore shows
    // first); a name that is not there is dropped and backfilled.
    examples: ["21st.dev", "0nMCP — Universal AI API Orchestrator", "0xArchive Market Data"],
  },
  {
    id: "browser",
    label: "Browser",
    blurb: "Drive a real browser: navigate, scrape, screenshot, test.",
    category: "Browser Automation",
    examples: ["playwright-mcp", "chrome-mcp-secure", "browser-use-mcp-server"],
  },
  {
    id: "files",
    label: "Files & Documents",
    blurb: "Read and write docs, PDFs, spreadsheets and notes.",
    query: "document",
    examples: ["document-skills", "Document Tools", "Document Api Endpoint"],
  },
  {
    id: "databases",
    label: "Databases",
    blurb: "Query, migrate and reason about the data your app keeps.",
    category: "Databases",
    examples: ["mongodb", "supabase", "clickhouse"],
  },
  {
    id: "cloud",
    label: "Cloud & DevOps",
    blurb: "Deployments, infrastructure and the pipelines around them.",
    category: "Cloud Infrastructure",
    examples: ["cloudflare", "vercel", "deploy-on-aws"],
  },
  {
    id: "design",
    label: "Design",
    blurb: "Design files, image work and the creative tools in between.",
    category: "Multimedia",
    examples: ["figma", "canva", "Adobe"],
  },
  {
    id: "research",
    label: "Research & Search",
    blurb: "Web search, papers, citations and evidence gathering.",
    category: "Search & Retrieval",
    examples: ["zotero", "brave-search-mcp", "arxiv-mcp-server"],
  },
  {
    id: "communication",
    label: "Communication",
    blurb: "Mail, chat, meetings and the inboxes you already live in.",
    category: "Communication",
    examples: ["slack", "gmail", "zoom"],
  },
  {
    id: "productivity",
    label: "Productivity",
    blurb: "Tasks, calendars, docs and the workflow around your team.",
    category: "Productivity & Workflow",
    examples: ["asana", "clickup", "airtable"],
  },
  {
    id: "knowledge",
    label: "Knowledge & Memory",
    blurb: "Give an agent durable notes it can recall later.",
    category: "Knowledge & Memory",
    examples: ["apple-notes-mcp", "basic-memory", "assistant-mcp"],
  },
  {
    id: "security",
    label: "Security & Testing",
    blurb: "Scans, test runners and the checks that catch regressions.",
    category: "Security & Testing",
    examples: ["auth0", "semgrep", "sonarqube"],
  },
];

export interface TopicStat extends Topic {
  count: number;
  examples: string[];
  href: string;
}

function topicPredicate(topic: Topic): (item: Listing) => boolean {
  if (topic.category) return (item) => item.category === topic.category;
  const q = topic.query ?? "";
  return (item) => matchesQuery(item, q);
}

function topicHref(topic: Topic): string {
  if (topic.category) return `/explore/?category=${encodeURIComponent(topic.category)}`;
  return `/explore/?q=${encodeURIComponent(topic.query ?? "")}`;
}

/**
 * Count and fill each topic against the full row set. Runs at build time in
 * `app/page.tsx`, so the numbers beside the tiles are the same numbers Explore
 * will report after it fetches — both come from this predicate over these rows.
 *
 * Example names come from the FIRST PAGE of the view the tile links to, not
 * from the whole result set: a category topic is ordered the way Explore's
 * browse default orders it (`sortListings(matches, "curated")`), and a query
 * topic is ordered by the caller's `rankQuery` — `app/page.tsx` passes the
 * search index's own ranking (with validation fixtures demoted, exactly as
 * Explore's query path does). A regenerated dataset therefore cannot put a
 * name on a tile that the reader will not see when they follow the tile.
 */
export function deriveTopics(
  items: Listing[],
  rankQuery?: (query: string) => Listing[]
): TopicStat[] {
  return TOPICS.map((topic) => {
    const matches = items.filter(topicPredicate(topic));
    const ordered = topic.category
      ? sortListings(matches, "curated")
      : rankQuery?.(topic.query ?? "") ?? matches;
    const firstPage = ordered.slice(0, GRID_PAGE);
    const present = new Set(firstPage.map((m) => m.name));
    const examples: string[] = [];
    for (const name of topic.examples) {
      if (present.has(name) && examples.length < 3) examples.push(name);
    }
    for (const item of firstPage) {
      if (examples.length >= 3) break;
      if (!examples.includes(item.name)) examples.push(item.name);
    }
    return { ...topic, count: matches.length, examples, href: topicHref(topic) };
  });
}

/* ------------------------------------------------------------------ *
 * "What do you use?"
 * ------------------------------------------------------------------ */

/**
 * The key the agent preference is stored under.
 *
 * It was written out twice (`HomeView.tsx`, `PackageView.tsx`) and read by
 * neither Explore nor any shared module. Exported here so the three surfaces
 * that care about the choice cannot drift apart.
 */
export const AGENT_STORAGE_KEY = "litespm-agent";

export interface AgentChoice {
  /** Value persisted in localStorage. */
  id: string;
  label: string;
  /**
   * The names this agent answers to inside the catalog's host rule
   * (`lib/hostIdentity.ts`). Derived from the two generated registries rather
   * than typed out, so an adapter rename cannot leave the strip pointing at a
   * host that no longer exists.
   *
   * An MCP row names the bridge adapter ("Claude Code CLI"), a skill row names
   * the skill target ("Claude Code"), and a plugin row carries whatever its
   * publisher declared. Matching both spellings is the whole point: one agent,
   * three sources of truth.
   */
  hosts: string[];
}

const AGENT_HOST_IDS: Array<{ id: string; label: string }> = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "opencode", label: "OpenCode" },
  { id: "cursor", label: "Cursor" },
  { id: "cline", label: "Cline" },
];

export const AGENT_CHOICES: AgentChoice[] = [
  // Safety net rather than the primary mechanism: this list is curated, but a
  // product can be discontinued at any time, and the chooser must stop offering
  // it the moment `lifecycle.ts` records that. Roo Code left this list that way
  // — its own docs carry an Extension Shutdown banner, so a chip offering it
  // was a claim we could check and knew to be false.
  ...AGENT_HOST_IDS.filter(({ id }) => !isDiscontinued(id)).map(({ id, label }) => {
    const names = [
      HOSTS.find((h) => h.id === id)?.name,
      SKILL_TARGETS.find((t) => t.id === id)?.displayName,
    ].filter((n): n is string => Boolean(n));
    return { id, label, hosts: names };
  }),
  // No compatibility claim attaches to this one: the reader told us nothing
  // the catalog can check, so it carries an empty host set and no badges.
  { id: "other", label: "Other", hosts: [] },
];

export function findAgentChoice(id: string | null): AgentChoice | null {
  if (!id) return null;
  return AGENT_CHOICES.find((c) => c.id === id) ?? null;
}

/**
 * Does this row declare support for the chosen agent?
 *
 * This is the catalog's own declared semantics, no stronger: an MCP server
 * works with every bridge adapter, a skill with every skills directory, and a
 * plugin with the publisher's own list. `lib/hostIdentity.ts` is the one rule
 * that decides which spellings of an agent are the same host, so the choice's
 * "Claude Code CLI" and a skill row's "Claude Code" are one host. It is a
 * declaration, never a test result — the UI says so next to the badges.
 *
 * Pure over rows the caller already holds. It cannot fetch anything.
 */
export function rowWorksWithAgent(item: Listing, choice: AgentChoice | null): boolean {
  if (!choice || choice.hosts.length === 0) return false;
  return choice.hosts.some((host) => itemMatchesHost(item, host));
}

/* ------------------------------------------------------------------ *
 * Source labels — re-exported from `lib/catalog.ts`, where `rowProvenance`
 * renders them. Kept exported from here because that is where the Explore
 * source filter and the shelf headings have always imported them from.
 * ------------------------------------------------------------------ */

export { SOURCE_LABELS, sourceLabel } from "./catalog";

/** The source id the Official MCP Registry rows carry. */
export const MCP_REGISTRY_SOURCE = "builtin:mcp-registry";

/* ------------------------------------------------------------------ *
 * Shelves — labelled sections, each a real Explore query
 * ------------------------------------------------------------------ */

/**
 * One shelf: a heading, a count, a "view all" link, and a handful of rows.
 *
 * The shelf is the structure the home page is built from (mcpmarket.com's
 * model: six labelled shelves, each with a view-all). What makes it honest
 * here is the pairing: `matches` is the rule, `href` opens an Explore view
 * that applies the *same* rule, and `preferred` only decides which of the
 * matching rows lead — verified against the shelf's own rows at build time,
 * so a name that no longer matches is dropped rather than advertised.
 */
export interface ShelfSpec {
  id: string;
  title: string;
  /** Explore link that returns exactly the rows `matches` selects. */
  href: string;
  matches: (item: Listing) => boolean;
  /**
   * Preferred example names, in display order. A name that is not in the
   * shelf's result set is dropped and the head is backfilled from real rows
   * in the curated order, so a regenerated dataset cannot put a stranger's
   * name on a shelf that no longer contains it.
   */
  preferred: string[];
}

export interface Shelf extends Omit<ShelfSpec, "matches" | "preferred"> {
  count: number;
  items: Listing[];
}

/** Rows shown per shelf: two rows of three on wide screens, like mcpmarket's. */
export const SHELF_SIZE = 6;

export const SHELVES: ShelfSpec[] = [
  {
    id: "installable",
    title: "Installable right now",
    href: "/explore/?installable=1",
    matches: (item) => {
      // The same predicate `litespm install` applies (see lib/availability).
      return availabilityOf(item).installable;
    },
    preferred: [
      "GitHub",
      "Context7",
      "Figma MCP Server",
      "Canva MCP",
      "Supabase",
      "Linear",
      "Neon",
      "Firecrawl MCP Server",
      "io.github.getsentry/sentry-mcp",
    ],
  },
  {
    id: "official-mcp",
    title: "From the Official MCP Registry",
    href: `/explore/?source=${encodeURIComponent(MCP_REGISTRY_SOURCE)}`,
    matches: (item) => item.source === MCP_REGISTRY_SOURCE,
    preferred: [
      "Neon",
      "Firecrawl MCP Server",
      "com.notion/mcp",
      "com.stripe/mcp",
      "io.github.getsentry/sentry-mcp",
      "com.cloudflare.mcp/mcp",
      "io.github.zoom/zoom-meetings",
      "Supabase",
    ],
  },
  {
    id: "official-skills",
    title: "Official agent skills",
    href: `/explore/?category=${encodeURIComponent(OFFICIAL_SKILLS_CATEGORY)}`,
    matches: (item) => item.category === OFFICIAL_SKILLS_CATEGORY,
    preferred: [
      "Brand Guidelines",
      "Frontend Design",
      "Docx",
      "Cloudflare",
      "Clickhouse Best Practices",
      "Building Secure Contracts",
      "Agents Sdk",
      "Canvas Design",
    ],
  },
  {
    id: "skills",
    title: "Agent skills",
    href: "/explore/?kind=skill",
    matches: (item) => item.kind === "skill",
    preferred: [
      "Figma",
      "Linear",
      "Sentry",
      "Gemini Api Dev",
      "Expo Api Routes",
      "Hugging Face Datasets",
      "Netlify Ai Gateway",
      "Cloudflare Deploy",
    ],
  },
  {
    id: "plugins",
    title: "Plugins",
    href: "/explore/?kind=plugin",
    matches: (item) => item.kind === "plugin",
    preferred: [
      "github",
      "linear",
      "notion",
      "stripe",
      "datadog",
      "figma",
      "playwright",
      "hubspot",
      "shopify",
      "chrome-devtools",
    ],
  },
];

/**
 * Count and fill each shelf against the full row set. Runs at build time in
 * `app/page.tsx`, so the numbers beside the headings are the same numbers
 * Explore reports after it applies the shelf's own `href` — both come from
 * this rule over these rows.
 */
export function deriveShelves(items: Listing[], size = SHELF_SIZE): Shelf[] {
  const shelves: Shelf[] = [];
  for (const spec of SHELVES) {
    const matches = items.filter(spec.matches);
    if (matches.length === 0) continue;

    const present = new Set(matches.map((m) => m.name));
    const items_: Listing[] = [];
    const taken = new Set<string>();
    for (const name of spec.preferred) {
      if (items_.length >= size) break;
      if (!present.has(name) || taken.has(name)) continue;
      const row = matches.find((m) => m.name === name);
      if (row) {
        items_.push(row);
        taken.add(name);
      }
    }
    // Backfill in the curated order — the same order Explore's default uses —
    // so the tail of a shelf is deterministic and cannot be a random slice.
    for (const row of sortListings(matches, "curated")) {
      if (items_.length >= size) break;
      if (taken.has(row.name)) continue;
      items_.push(row);
      taken.add(row.name);
    }

    shelves.push({ id: spec.id, title: spec.title, href: spec.href, count: matches.length, items: items_ });
  }
  return shelves;
}

/* ------------------------------------------------------------------ *
 * Provenance — what the trust section is allowed to claim
 * ------------------------------------------------------------------ */

export interface ProvenanceStats {
  total: number;
  /** Rows read from the publisher's own repository manifest. */
  vendorManifest: number;
  /** Rows claimed by a third-party awesome-list. */
  awesomeList: number;
  /** `installability` values, exactly as the wire format publishes them. */
  discoveryOnly: number;
  metadataVerified: number;
  runtimeVerified: number;
  litespmTested: number;
  /** Rows that carry a proven version string. */
  versioned: number;
}

export function deriveProvenance(items: Listing[]): ProvenanceStats {
  const stats: ProvenanceStats = {
    total: items.length,
    vendorManifest: 0,
    awesomeList: 0,
    discoveryOnly: 0,
    metadataVerified: 0,
    runtimeVerified: 0,
    litespmTested: 0,
    versioned: 0,
  };
  for (const item of items) {
    if (item.publisher?.verified) stats.vendorManifest += 1;
    else stats.awesomeList += 1;
    switch (item.installability) {
      case "metadata_verified":
        stats.metadataVerified += 1;
        break;
      case "runtime_verified":
        stats.runtimeVerified += 1;
        break;
      case "litespm_tested":
        stats.litespmTested += 1;
        break;
      default:
        stats.discoveryOnly += 1;
    }
    if (item.version) stats.versioned += 1;
  }
  return stats;
}
