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
 *   1. **plugin** → never. `AddSteps` excludes the kind and the CLI fails closed
 *      with `LPSM-ARTIFACT-UNAVAILABLE`; the catalog carries each plugin's
 *      published source descriptor but no fetch path is wired for it, so a
 *      plugin is refused *even when its metadata is verified* (all 638 are).
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
 *   remote       25,401  MCP, metadata_verified, with an endpoint
 *   source          764  skills that are metadata_verified
 *   discovery    42,573  MCP (23,017) and skills (19,556) that are discovery_only
 *   unsupported     638  plugins
 *
 * **26,165 of 69,376 rows install (38%).** An earlier revision of this module
 * marked every skill installable — 20,320 rather than 764 — because it read the
 * *kind* and ignored `installability`. Skills are not exempt from the gate;
 * only 764 of them carry verified metadata.
 */
export type AvailabilityId = "remote" | "source" | "discovery" | "unsupported";

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
  plain: "No command and no endpoint are published, so this entry can be listed but not installed.",
  installable: false,
};

const UNSUPPORTED: Availability = {
  id: "unsupported",
  label: "Not installable",
  plain: "Plugin installs are not supported yet — LiteSPM will not install a partial bundle.",
  installable: false,
};

/**
 * @param item any row; `kind`, `installability` and `transport` are read.
 */
export function availabilityOf(
  item: Pick<Listing, "kind"> &
    Partial<Pick<Listing, "transport" | "skillSource" | "installability">>
): Availability {
  // 1. Plugin installs are refused by kind, before any metadata is consulted.
  if (item.kind === "plugin") return UNSUPPORTED;

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
    discovery: 0,
    unsupported: 0,
  };
  for (const item of items) counts[availabilityOf(item).id] += 1;
  return counts;
}
