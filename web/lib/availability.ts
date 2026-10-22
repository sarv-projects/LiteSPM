import type { Listing } from "./telemetry";

/**
 * Whether a catalog row can actually be installed, derived from the same
 * predicate the CLI uses.
 *
 * `litespm install` refuses a row unless both installability questions answer
 * yes, and the CLI asks the kind question first (`cmd/litespm/install_kind.go`):
 * `domain.Listing.IsInstallable()` is the conjunction of a kind this build has
 * an install path for (`ListingKind.InstallWired`) and a non-`discovery_only`
 * installability. The badge has to agree with the binary or it advertises
 * installs that fail, so the rule here is copied rather than invented:
 *
 *   1. **plugin** → only when it publishes a FETCHABLE, PINNED source: a
 *      `git-tree` with a commit id. The install path exists (2026-10-19): the
 *      pinned tree is fetched and verified, the plugin's manifest is parsed,
 *      and the MCP servers the manifest declares are registered in each target
 *      host's config. A plugin that publishes no artifact, an unpinned one, or
 *      a `local-dir` one is refused by the plugin installer with its own
 *      reason (`LPSM-ARTIFACT-UNAVAILABLE`). Measured on the 2026-10-17
 *      release: 390 of the 638 plugin rows publish a pinned git tree.
 *   2. **installability is `discovery_only`** → never. That is the provenance
 *      half, gated in `install_skill.go:73` and `install_mcp.go:378` and
 *      refused with `LPSM-NOT-INSTALLABLE`.
 *   3. **MCP** additionally needs a transport: the launch line comes from the
 *      published version record's `command` or `endpoint`, and a row with
 *      neither dies at `LPSM-ARTIFACT-UNAVAILABLE` (`install_mcp.go:389`).
 *   4. **skill** → installs through the content-addressed skills ledger from the
 *      source it was published in.
 *
 * Measured against the 2026-10-15 release (69,376 rows):
 *
 *   remote       25,400  MCP, metadata_verified, with an endpoint
 *   source          764  skills that are metadata_verified
 *   plugin          390  plugins that publish a pinned git tree
 *   discovery    42,574  MCP (23,017) and skills (19,556) that are discovery_only
 *   unsupported     248  plugins with no fetchable pinned source
 *
 * **26,554 of 69,376 rows install (38%).** An earlier revision of this module
 * marked every skill installable — 20,320 rather than 764 — because it read the
 * *kind* and ignored `installability`. Skills are not exempt from the gate;
 * only 764 of them carry verified metadata.
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

/*
 * These strings are a chip's tooltip and, on some cards, part of the link's
 * accessible name. They are read one at a time, next to the row they describe,
 * so each is one clause and none of them explains the catalog to the reader —
 * a label that needs a paragraph behind it is the wrong label.
 */
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
  label: "Discovery only",
  // The reason, not just the verdict: a skill's publisher page publishes a
  // repository that this catalog did not adopt, so the row was never
  // verified (20,320 skills, of which 19,556 are discovery-only for exactly
  // this reason). Saying so is the honest half; the other half is the manual
  // path that still works — `litespm skills add <repo>` — which
  // InstallBand prints next to the disabled button.
  plain:
    "Listed, but not installed: the catalog never verified a source it could clone — a repository for a skill, a command or an endpoint for a server. It can still be installed by hand from the repository the publisher names.",
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
  label: "Not installable",
  plain:
    "LiteSPM cannot fetch this entry: it publishes no source, or a source it cannot fetch (a local directory, or a tree that is not pinned to a commit).",
  installable: false,
};

/**
 * @param item any row; `kind`, `installability` and `transport` are read.
 *
 * `transport` accepts an explicit `null` as well as `undefined`: every test
 * below is a truthiness test, and a row that records no transport at all and a
 * row that records `null` describe the same catalog entry. Narrowing the
 * parameter to `undefined` only forced callers reading raw rows to invent a
 * difference that the logic does not make.
 */
export function availabilityOf(
  item: Pick<Listing, "kind"> &
    Partial<Pick<Listing, "skillSource" | "installability" | "artifact">> & {
      transport?: string | null;
    }
): Availability {
  // 1. A plugin installs only when it publishes a FETCHABLE, PINNED source:
  //    a git tree with a commit id. The install path fetches that commit,
  //    verifies the tree, and registers the MCP servers the plugin's own
  //    manifest declares. A local directory is not something a user of the
  //    catalogue can fetch, and an unpinned tree is a mutable source.
  //
  //    `pinned` is the whole of the "and there is a commit id" half: the
  //    builder sets it exactly when the descriptor published a 40-hex commit
  //    (`pinned: bool(_SHA40.match(sha))` in `scripts/build_full_catalog.py`).
  //    The id itself is not re-read here because the search projection carries
  //    the fact and not the value — one rule has to serve both paths.
  if (item.kind === "plugin") {
    const artifact = item.artifact;
    if (!artifact) return UNSUPPORTED;
    if (artifact.type !== "git-tree") return UNSUPPORTED;
    if (!artifact.pinned) return UNSUPPORTED;
    return PLUGIN;
  }

  // 2. The CLI's own gate: `installability != "discovery_only"`.
  const installabilityEstablished =
    item.installability === "metadata_verified" ||
    item.installability === "runtime_verified" ||
    item.installability === "litespm_tested";
  if (!installabilityEstablished) return DISCOVERY;

  // 3. An MCP row still needs a launch line; without one the CLI refuses at
  //    LPSM-ARTIFACT-UNAVAILABLE rather than installing a guessed command.
  if (item.kind === "mcp" && !item.transport) return DISCOVERY;

  // 4. MCP with an endpoint, or a skill installed through the ledger.
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
