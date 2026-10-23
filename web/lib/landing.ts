// Landing-page structures: the goal tiles the home page opens with, the
// curated shelf of installable entries, the "what do you use?" agent strip,
// and the counts the trust section is allowed to print.
//
// Everything here is a pure function over a row set handed in from above, or a
// table of constants. No dataset import, no `"use client"`, no fetch: the
// Server Component in `app/page.tsx` calls the derivations at build time so the
// counts are in the prerendered HTML, and the client calls `rowWorksWithAgent`
// over rows it already has. Nothing in this module can ask for the dataset.
//
// ## The two tables the page is built from
//
// **The goal tiles** are a browse axis, not a search. Every tile opens
// Explore's own `?goal=` filter, so a tile and the page it opens are the same
// filter over the same rows - one taxonomy, one mapping, no tile that quietly
// means something else. The goal ids are Explore's own values
// (`lib/taxonomy.ts` owns the taxonomy; this file only names the eight goals
// the home page leads with), and the browser suite asserts that each tile
// opens a real, non-empty result set.
//
// **The curated shelf** is the opposite of a rule: it is an editorial list, in
// `data/featured.json`, of catalog **ids** - never display names. A name is
// not an identity ("Figma" is fourteen rows, and the one the old shelf picked
// was a discovery-only row that could not be installed), so the shelf names
// the row it means and the build checks it.
//
// The check is the point. `deriveShelves` refuses to build when a curated id
// is not in the catalog, when the row it names cannot be installed, when the
// row came from a different source than the file declares, or when the row
// depends on a host whose vendor has ended. A curated set that has drifted out
// of the dataset is a build failure, not a page that quietly advertises a
// package that no longer exists.

import type { Listing } from "./telemetry";
import { HOSTS, SKILL_TARGETS } from "./hosts";
import { itemMatchesHost } from "./hostIdentity";
import { isDiscontinued } from "./lifecycle";
import { availabilityOf } from "./availability";
import { OFFICIAL_SKILLS_CATEGORY } from "./catalog";
import featuredData from "../data/featured.json";

/**
 * Re-exported from `lib/catalog.ts`, where the constant lives beside the
 * curated sort that reads it. Every other module keeps importing it from here.
 */
export { OFFICIAL_SKILLS_CATEGORY };

/* ------------------------------------------------------------------ *
 * Goal tiles - "what do you want your AI to do?"
 * ------------------------------------------------------------------ */

export interface Topic {
  id: string;
  /**
   * The goal id Explore filters on (`?goal=`). This is `lib/taxonomy.ts`'s own
   * vocabulary, not a second one: the tile and the page it opens are the same
   * filter over the same rows.
   */
  goal: string;
  label: string;
  blurb: string;
}

/**
 * The eight goals the home page leads with.
 *
 * The taxonomy has eleven. Three are left off the home page on purpose:
 * "Media & Content" and "Communication & Social" are the two a reader reaches
 * for a specific product (a transcript, an inbox) rather than a task, and
 * "Business & Finance" is covered by the payment server in the curated shelf.
 * The two goals that cover documents and tasks are one tile here - the
 * taxonomy's own "Productivity & Workflow" goal is "tasks, notes, documents,
 * calendars and project management", and splitting it would put the same
 * filter under two different labels.
 */
export const TOPICS: Topic[] = [
  {
    id: "coding",
    goal: "coding",
    label: "Work with code",
    blurb: "Read a repository, open a pull request, run the tests.",
  },
  {
    id: "documents",
    goal: "productivity",
    label: "Documents, notes and tasks",
    blurb: "Read a PDF or a Word file, keep notes, and track the work in between.",
  },
  {
    id: "design",
    goal: "web",
    label: "Work with designs",
    blurb: "Design files, front-ends, brand assets and the components around them.",
  },
  {
    id: "browser",
    goal: "automation",
    label: "Automate the browser",
    blurb: "Drive a real browser: navigate, scrape, screenshot, test.",
  },
  {
    id: "research",
    goal: "research",
    label: "Research and summarise",
    blurb: "Search, papers, documentation and an agent's own memory.",
  },
  {
    id: "data",
    goal: "data",
    label: "Connect databases",
    blurb: "Query Postgres and the rest, and read the numbers behind the app.",
  },
  {
    id: "infrastructure",
    goal: "infrastructure",
    label: "Ship and deploy",
    blurb: "Deployments, containers, DNS, logs and the pipelines around them.",
  },
  {
    id: "security",
    goal: "security",
    label: "Keep secrets safe",
    blurb: "Authentication, secret storage, scanning and compliance.",
  },
];

export interface TopicStat extends Topic {
  /** The Explore view this tile opens. */
  href: string;
}

/**
 * The goal tiles.
 *
 * The parameters are kept so the call site in `app/page.tsx` does not have to
 * change, but the tiles no longer need either: a goal tile is a link to a
 * filter, not a search, so it needs no ranking over the rows and no examples
 * drawn from them. The tile deliberately prints **no count** - the proposal
 * this page is built from asks for an icon, a plain benefit and a chevron, and
 * a raw count on a goal tile is the number most likely to be read as a
 * promise the site cannot keep.
 *
 * The browser suite is what checks the tiles: it opens each one and asserts a
 * real, non-empty result set comes back.
 */
export function deriveTopics(
  _items?: Listing[],
  _rankQuery?: (query: string) => Listing[]
): TopicStat[] {
  return TOPICS.map((topic) => ({
    ...topic,
    href: `/explore/?goal=${encodeURIComponent(topic.goal)}`,
  }));
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
 * This follows the install path LiteSPM can configure: local MCP servers use
 * documented config adapters, URL servers use only adapters that declare the
 * exact transport, skills use documented user-scope directories, and plugins
 * retain the publisher's own host list. `lib/hostIdentity.ts` is the one rule
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
 * Source labels - re-exported from `lib/catalog.ts`, where `rowProvenance`
 * renders them. Kept exported from here because that is where the Explore
 * source filter and the shelf headings have always imported them from.
 * ------------------------------------------------------------------ */

export { SOURCE_LABELS, sourceLabel } from "./catalog";


/* ------------------------------------------------------------------ *
 * The curated shelf - an editorial list of installable entries
 * ------------------------------------------------------------------ */

/** One curated entry: the catalog id, the row it resolved to, and the line. */
export interface CuratedEntry {
  /** The catalog id, exactly as the dataset carries it. */
  id: string;
  /** The row this id resolved to. */
  item: Listing;
  /** The editorial use-case line. Plain language; must not contradict the row. */
  useCase: string;
}

/** One group of curated entries, with the link that lists all of them. */
export interface CuratedGroup {
  id: string;
  title: string;
  blurb: string;
  viewAll: { label: string; href: string };
  entries: CuratedEntry[];
}

/**
 * Resolve the curated shelf against the dataset.
 *
 * Every id in `data/featured.json` is checked, and the build fails when one
 * does not hold:
 *
 *  1. **The id must exist.** A curated set may not name a package that is not
 *     in the snapshot. The site never invents a package.
 *  2. **The row must be installable.** The predicate is `availabilityOf` -
 *     the same one `litespm install` applies, and the same one Explore's
 *     "installable" filter uses. A discovery-only row and a plugin are both
 *     refused, which is what stops the shelf from advertising an install that
 *     the binary would reject.
 *  3. **The source must be the one declared.** The file says where each entry
 *     came from; the dataset has to agree.
 *  4. **No discontinued host.** A host whose vendor has ended cannot carry a
 *     recommendation. (`lib/lifecycle.ts` records those; only a plugin names
 *     hosts explicitly - the check is here so the rule survives the next kind
 *     that does.)
 *
 * The errors are build errors on purpose: a curated set that has drifted out
 * of the dataset should stop the build, not reach a reader as a dead link.
 */
export function deriveShelves(items: Listing[]): CuratedGroup[] {
  const rows = new Map<string, Listing>();
  for (const item of items) rows.set(item.id, item);

  const groups = new Map<string, CuratedGroup>();
  for (const group of featuredData.groups) {
    if (groups.has(group.id)) {
      throw new Error(
        `data/featured.json declares the group "${group.id}" twice. Every group id must be unique.`
      );
    }
    groups.set(group.id, {
      id: group.id,
      title: group.title,
      blurb: group.blurb,
      viewAll: { label: group.viewAllLabel, href: group.viewAllHref },
      entries: [],
    });
  }

  const seen = new Set<string>();
  for (const entry of featuredData.entries) {
    const group = groups.get(entry.group);
    if (!group) {
      throw new Error(
        `data/featured.json puts "${entry.id}" in the group "${entry.group}", which is not one of the groups it declares (${[
          ...groups.keys(),
        ].join(", ")}).`
      );
    }
    if (seen.has(entry.id)) {
      throw new Error(
        `data/featured.json lists "${entry.id}" twice. One id may appear once, or the shelf would show the same entry twice.`
      );
    }
    seen.add(entry.id);

    const item = rows.get(entry.id);
    if (!item) {
      throw new Error(
        `data/featured.json names "${entry.id}", and the catalog snapshot does not contain it. ` +
          `Remove it from the curated set, or re-publish the catalog.`
      );
    }

    const availability = availabilityOf(item);
    if (!availability.installable) {
      throw new Error(
        `data/featured.json names "${entry.id}", and LiteSPM cannot install it: ${availability.plain} ` +
          `A curated entry has to be installable, or the shelf would advertise an install the binary refuses.`
      );
    }

    if (item.source !== entry.source) {
      throw new Error(
        `data/featured.json says "${entry.id}" came from "${entry.source}", and the catalog says ` +
          `"${item.source ?? "no source at all"}". The curated set must state the row's own source.`
      );
    }

    for (const host of item.compatibleHosts ?? []) {
      if (isDiscontinued(host)) {
        throw new Error(
          `data/featured.json names "${entry.id}", whose declared host "${host}" has ended. ` +
            `A host whose vendor has shut it down cannot carry a recommendation.`
        );
      }
    }

    group.entries.push({ id: entry.id, item, useCase: entry.useCase });
  }

  // A group with nothing in it is not a group; drop it rather than render an
  // empty heading. The ids are checked above, so this can only happen when a
  // group is declared and never filled.
  return featuredData.groups
    .map((group) => groups.get(group.id))
    .filter((group): group is CuratedGroup => group !== undefined && group.entries.length > 0);
}

/* ------------------------------------------------------------------ *
 * Provenance - what the trust section is allowed to claim
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
  /**
   * Rows `litespm install` can actually complete for — the same predicate
   * Explore's "installable" filter uses, so the number on the page is the
   * number the page's own filter produces.
   */
  installable: number;
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
    installable: 0,
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
    if (availabilityOf(item).installable) stats.installable += 1;
  }
  return stats;
}
