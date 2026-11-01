import type { Listing } from "./types";

/**
 * Whether a catalog row can actually be installed, derived from the same
 * predicate the CLI uses (see the upstream repository's availability model).
 *
 *   1. **plugin** → only when it publishes a FETCHABLE, PINNED source: a
 *      `git-tree` with a commit id (390 of 638 plugin rows do).
 *   2. **installability is `discovery_only`** → never.
 *   3. **MCP** additionally needs a transport/launch line.
 *   4. **skill** → installs through the content-addressed skills ledger from
 *      the source it was published in.
 *
 * Measured against this release (69,376 rows): 26,554 install (38%).
 */
export type AvailabilityId = "remote" | "source" | "plugin" | "discovery" | "unsupported";

export interface Availability {
  id: AvailabilityId;
  /** Short chip text. */
  label: string;
  /** The long form, for a tooltip and for screen readers. */
  plain: string;
  /** True when `litespm install` can actually complete for this row. */
  installable: boolean;
}

const REMOTE: Availability = {
  id: "remote",
  label: "Remote endpoint",
  plain: "Runs on the publisher's own hosted endpoint. Nothing is downloaded to your machine.",
  installable: true,
};

const SOURCE: Availability = {
  id: "source",
  label: "Installs from source",
  plain: "LiteSPM copies the files and records what it wrote, so the install can be undone.",
  installable: true,
};

const DISCOVERY: Availability = {
  id: "discovery",
  label: "Publisher setup details needed",
  plain:
    "The publisher needs to provide a source or connection command before LiteSPM can prepare installation steps.",
  installable: false,
};

const PLUGIN: Availability = {
  id: "plugin",
  label: "Installs a plugin",
  plain:
    "LiteSPM fetches the plugin's pinned source, reads its own manifest, and registers the MCP servers that manifest declares.",
  installable: true,
};

const UNSUPPORTED: Availability = {
  id: "unsupported",
  label: "Source not available",
  plain:
    "The publisher needs to provide a version-pinned source before LiteSPM can prepare installation steps for this plugin.",
  installable: false,
};

export function availabilityOf(
  item: Pick<Listing, "kind"> &
    Partial<Pick<Listing, "skillSource" | "installability" | "artifact">> & {
      transport?: string | null;
    },
): Availability {
  if (item.kind === "plugin") {
    const artifact = item.artifact;
    if (!artifact) return UNSUPPORTED;
    if (artifact.type !== "git-tree") return UNSUPPORTED;
    if (!artifact.pinned) return UNSUPPORTED;
    return PLUGIN;
  }

  const installabilityEstablished =
    item.installability === "metadata_verified" ||
    item.installability === "runtime_verified" ||
    item.installability === "litespm_tested";
  if (!installabilityEstablished) return DISCOVERY;

  if (item.kind === "mcp" && !item.transport) return DISCOVERY;

  return item.kind === "skill" ? SOURCE : REMOTE;
}

/** Counts for a set of rows, for the one-line summary above a list. */
export function availabilityCounts(items: Listing[]): Record<AvailabilityId, number> {
  const counts: Record<AvailabilityId, number> = {
    remote: 0,
    source: 0,
    plugin: 0,
    discovery: 0,
    unsupported: 0,
  };
  for (const item of items) counts[availabilityOf(item).id] += 1;
  return counts;
}
