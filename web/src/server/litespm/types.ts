/**
 * Wire format of `data/litespm/catalog.json` — ported from the LiteSPM
 * repository so this UI reads the exact same fields the upstream dataset
 * publishes. Nothing invented, nothing dropped.
 */

export type ListingKind = "mcp" | "skill" | "plugin";

export type Installability =
  | "discovery_only"
  | "metadata_verified"
  | "runtime_verified"
  | "litespm_tested";

export interface ListingPublisher {
  name: string;
  verified: boolean;
  provenance?: string;
  url?: string;
  avatarUrl?: string;
}

export interface ListingArtifact {
  type?: "git-tree" | "local-dir" | string;
  declaredAs?: string;
  repo?: string;
  path?: string;
  ref?: string;
  sha?: string;
  /** True when the source is pinned to an immutable commit. */
  pinned?: boolean;
}

export interface Listing {
  id: string;
  /** Revision-aware identity retained by the compact search projection. */
  discoveryKey?: string;
  name: string;
  slug: string;
  kind: ListingKind;
  summary: string;
  category: string;
  publisher: ListingPublisher;
  distributor?: { name: string; verified: boolean; url?: string };
  installability?: Installability;
  transport?: string;
  runtime?: string;
  artifact?: ListingArtifact;
  /** GitHub stars of the upstream repo, when a source publishes them. Always null today. */
  stars: number | null;
  version: string | null;
  /** The launch endpoint an MCP row's own record names, when published. */
  url?: string | null;
  /** Publisher-declared source repository (MCP Registry repository.url). */
  repository?: string | null;
  /** True in the browser display projection when the original row has a URL. */
  hasUrl?: boolean;
  /** Publisher-declared host list. Only plugins carry one. */
  compatibleHosts?: string[];
  readme?: string;
  command?: string | null;
  args?: string[] | null;
  skillSource?: string;
  installHint?: string;
  schemaFingerprint?: string;
  tools?: Array<{ name: string; description: string; inputSchema?: unknown }>;
  effects?: Array<{ effect: string; declaredBy: string }>;
  /** Which upstream feed or registry the row was published through. */
  source?: string;
  /** Derived resolution key — stamped by the dataset loader, never wire data. */
  linkKey?: string;
  /** Derived quality score (0–100) — stamped by the dataset loader from real record fields. */
  rankScore?: number;
  publisherGroup?: boolean;
}

export interface ReleaseManifest {
  agentSkillsCount: number;
  createdAt: string;
  datasetDigest: string;
  hostCompatibility: { mcp: string; plugin: string; skill: string };
  itemCount: number;
  manifestDigest: string;
  mcpServersCount: number;
  pluginsCount: number;
  releaseId: string;
  sequence: number;
  statsUpdatedAt: string;
  totalCapabilities: number;
}

export interface Telemetry {
  itemCount: number;
  createdAt?: string;
  releaseId?: string;
  sequence?: number;
  manifestDigest?: string;
  counts: { all: number; mcp: number; skill: number; plugin: number };
}

export interface FeaturedGroup {
  id: string;
  title: string;
  blurb: string;
  viewAllLabel: string;
  viewAllHref: string;
}

export interface FeaturedEntry {
  id: string;
  group: string;
  source: string;
  useCase?: string;
}

export interface FeaturedShelf {
  _comment?: string;
  schema: number;
  groups: FeaturedGroup[];
  entries: FeaturedEntry[];
}
