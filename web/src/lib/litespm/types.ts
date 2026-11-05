/**
 * Client-side types mirroring the LiteSPM catalog API responses — the wire
 * format of the real dataset (see server/litespm/types.ts).
 */

export type CatalogKind = "mcp" | "skill" | "plugin";

export interface CatalogPublisher {
  name: string;
  verified: boolean;
  provenance?: string;
  url?: string;
}

export interface CatalogHit {
  id: string;
  linkKey: string;
  name: string;
  slug: string;
  kind: CatalogKind;
  summary: string;
  category: string;
  goal: string;
  publisher: CatalogPublisher;
  source?: string;
  transport?: string | null;
  runtime?: string | null;
  url?: string | null;
  version: string | null;
  stars: number | null;
  installability?: string;
  installable: boolean;
  /** Composite quality score (0–100). */
  rankScore: number;
  command?: string | null;
  args?: string[] | null;
  installHint?: string;
  repoUrl?: string | null;
  sourceType?: "github" | "gitlab" | "bitbucket" | "git" | "endpoint" | "website" | null;
}

export interface CatalogFacets {
  kinds: [string, number][];
  goals: { id: string; label: string; count: number }[];
  categories: [string, number][];
  sources: [string, number][];
  publishers: [string, number][];
  installability: [string, number][];
  transports: [string, number][];
  hosts: [string, number][];
}

export interface CatalogListResponse {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  items: CatalogHit[];
  facets: CatalogFacets;
}

export interface AvailabilityInfo {
  id: string;
  label: string;
  plain: string;
  installable: boolean;
}

export interface TryPrompt {
  id: "example" | "first-look";
  label: string;
  prompt: string;
  basis: string;
}

export interface PackageDetailData {
  id: string;
  linkKey: string;
  name: string;
  slug: string;
  kind: CatalogKind;
  summary: string;
  category: string;
  goal: string;
  goalLabel: string;
  publisher: CatalogPublisher;
  distributor?: { name: string; verified: boolean; url?: string } | null;
  source?: string;
  installability?: string;
  installable: boolean;
  availability: AvailabilityInfo;
  transport?: string | null;
  runtime?: string | null;
  url?: string | null;
  version: string | null;
  stars: number | null;
  command?: string | null;
  args?: string[] | null;
  installHint?: string;
  skillSource?: string;
  repoUrl?: string | null;
  sourceType?: "github" | "gitlab" | "bitbucket" | "git" | "endpoint" | "website" | null;
  artifact?: {
    type?: string;
    repo?: string;
    path?: string;
    ref?: string;
    sha?: string;
    pinned?: boolean;
    declaredAs?: string;
  } | null;
  compatibleHosts?: string[];
  hosts: Array<{ value: string; name: string; adapter: boolean; hostId?: string }>;
  installTargets: Array<{ id: string; name: string }>;
  alsoAvailable: Array<{
    linkKey: string;
    name: string;
    kind: CatalogKind;
    publisher: string;
    installable: boolean;
  }>;
  rankScore: number;
  prompts: TryPrompt[];
  related: Array<{
    id: string;
    linkKey: string;
    name: string;
    kind: CatalogKind;
    summary: string;
    publisher: string;
    why: string[];
    rankScore: number;
  }>;
  tools: Array<{ name: string; description: string }>;
  effects: Array<{ effect: string; declaredBy: string }>;
  readme?: string;
  rankBreakdown?: {
    total: number;
    recognition: { points: number; max: number; reason: string };
    vendorAuthority: { points: number; max: number; reason: string };
    installability: { points: number; max: number; reason: string };
    recordQuality: { points: number; max: number; reason: string };
    description: { points: number; max: number; reason: string };
    stars: { points: number; max: number; reason: string };
    penalty: { points: number; reason: string };
  };
  mcpSpec?: {
    hasDeclaredTools?: boolean;
    permissions: {
      read: Array<{ category: "read"; name: string; description: string }>;
      write: Array<{ category: "write"; name: string; description: string }>;
      destructive: Array<{ category: "destructive"; name: string; description: string }>;
    };
    authType: string;
    authDescription: string;
    envVars: Array<{ name: string; required: boolean; description: string; example: string }>;
    functions: Array<{
      name: string;
      category: "read" | "write" | "destructive";
      description: string;
      parameters?: string[];
    }>;
    hostConfigs: Array<{
      id: string;
      name: string;
      format: "json" | "toml";
      configPath: string;
      snippet: string;
    }>;
  };
  skillSpec?: {
    versionFallback: string;
    commitHash?: string;
    instructions: string;
    triggerRules: string[];
    skipRules: string[];
    fileTree: Array<{ path: string; type: "file" | "dir"; description: string }>;
    security: {
      scripts: "none" | "present" | "unknown";
      network: "passive" | "active" | "unknown";
      credentials: "none" | "required" | "unknown";
      summary: string;
    };
  };
  pluginSpec?: {
    pinningStatus: "version" | "commit" | "unpinned";
    pinningBadge: string;
    pinningExplanation: string;
    manifest: {
      mcpServers: Array<{ name: string; endpoint?: string; transport: string }>;
      skills: Array<{ name: string; path: string; summary: string }>;
      hostExtras: Array<{ type: "hook" | "command" | "subagent" | "lsp"; name: string; description: string }>;
    };
    remediation: {
      isBlocked: boolean;
      reason: string;
      publisherAction: string;
      userCliBypass: string;
    };
  };
}

export interface PackageDetailResponse {
  found: boolean;
  detail?: PackageDetailData;
}

export interface AgentRow {
  slug: string;
  pageId?: string;
  name: string;
  hostId?: string;
  strings: string[];
  mcp: { count: number; host: string } | null;
  skill: { count: number; host: string } | null;
  plugin: { count: number; host: string } | null;
  total: number;
  /** Compatible entries `litespm install` can actually complete. */
  installable: number;
  /** The compatible entries' largest categories (max 3). */
  topCategories: string[];
  /** Adapter config format, when a compiled-in MCP adapter exists. */
  configFormat?: "json" | "toml";
  /** The vendor documents a remote (URL) MCP entry shape. */
  remoteMcp?: boolean;
  profileType?: string;
  summary?: string;
  interface?: string;
  website?: string;
  capabilities?: string[];
  skillOnly: boolean;
}

export interface AgentStats {
  profiles: number;
  configured: number;
  withSkills: number;
  withPlugins: number;
  totals: number;
  hosts: number;
  skillTargets: number;
}

export interface AgentSetupFacts {
  hostId?: string;
  displayName: string;
  format?: "json" | "toml";
  keyPath?: string;
  shape?: string;
  userPath?: string;
  projectOnly?: boolean;
  projectScope?: boolean;
  projectPath?: string;
  remote?: boolean;
  remoteTransports?: string[];
  generic?: boolean;
  docsUrl?: string;
  skillDirectory?: string;
  skillUniversal?: boolean;
  skillHasGlobal?: boolean;
  bridgeSnippet?: string;
  setupCommand?: string;
}

export interface AgentDetailData {
  row: AgentRow;
  setup: AgentSetupFacts;
  installable: number;
  discoveryOnly: number;
  kinds: { mcp: number; skill: number; plugin: number };
  topCategories: Array<{ name: string; count: number }>;
  noteSource?: string;
}

export interface CatalogStatsResponse {
  telemetry: {
    itemCount: number;
    createdAt?: string;
    releaseId?: string;
    sequence?: number;
    manifestDigest?: string;
    counts: { all: number; mcp: number; skill: number; plugin: number };
  };
  release: {
    releaseId: string;
    createdAt: string;
    sequence: number;
    itemCount: number;
    mcpServersCount: number;
    agentSkillsCount: number;
    pluginsCount: number;
    manifestDigest: string;
    datasetDigest: string;
    statsUpdatedAt: string;
    hostCompatibility: { mcp: string; plugin: string; skill: string };
  };
  cli: Array<{ version: string; publishedAt?: string; notes?: string; installFlags?: string[] }>;
  uniqueTotal: number;
  rawTotal: number;
  byKind: { mcp: number; skill: number; plugin: number };
  installable: number;
  withEndpoint: number;
  publishers: number;
  categories: number;
  sources: [string, number][];
  transports: [string, number][];
  topCategories: [string, number][];
  goalCounts: [string, number][];
  hosts: number;
  skillTargets: number;
}

export interface FeaturedEntryData {
  group: string;
  groupTitle: string;
  viewAllLabel: string;
  viewAllHref: string;
  useCase?: string;
  id: string;
  linkKey: string;
  name: string;
  kind: CatalogKind;
  summary: string;
  category: string;
  publisher: string;
  publisherVerified: boolean;
  transport: string | null;
  version: string | null;
  installable: boolean;
  availabilityLabel: string;
  source: string;
}

export interface FeaturedResponse {
  groups: Array<{ id: string; title: string; blurb: string; viewAllLabel: string; viewAllHref: string }>;
  entries: FeaturedEntryData[];
  releaseId: string;
}

export interface InsightBar {
  label: string;
  value: number;
  sub?: number;
  subLabel?: string;
  href?: string;
}

export interface InsightsResponse {
  release: {
    releaseId: string;
    createdAt: string;
    sequence: number;
    itemCount: number;
    manifestDigest: string;
    datasetDigest: string;
  };
  totals: {
    unique: number;
    raw: number;
    duplicatesRemoved: number;
    installable: number;
    discoveryOnly: number;
    withEndpoint: number;
    publishers: number;
    verifiedPublisherRows: number;
    categories: number;
    sources: number;
  };
  byKind: Array<InsightBar & { id: CatalogKind }>;
  byGoal: Array<InsightBar & { id: string; blurb: string }>;
  byInstallability: InsightBar[];
  byTransport: InsightBar[];
  topCategories: InsightBar[];
  topPublishers: InsightBar[];
  bySource: InsightBar[];
  hostLeaderboard: Array<{
    id: string;
    name: string;
    total: number;
    mcp: number;
    skill: number;
    plugin: number;
    hasAdapter: boolean;
    remote: boolean;
    configPath: string;
    format: string;
  }>;
  taxonomyCoverage: {
    mapped: number;
    other: number;
    coverage: number;
    largest: { id: string; label: string; count: number; share: number };
  };
}

export interface CompareColumn {
  linkKey: string;
  name: string;
  kind: CatalogKind;
  summary: string;
  category: string;
  goalLabel: string;
  publisher: string;
  publisherVerified: boolean;
  source: string;
  installable: boolean;
  availabilityLabel: string;
  installCommand: string;
  transport: string | null;
  runtime: string | null;
  url: string | null;
  version: string | null;
  hosts: string[];
  hostCount: number;
  pinned: boolean;
  artifactRepo: string | null;
  artifactRef: string | null;
  rankScore?: number;
  toolsCount?: number;
  typeSpecificHint?: string;
}

export interface TrendingItem {
  linkKey: string;
  name: string;
  kind: CatalogKind;
  summary: string;
  category: string;
  publisher: string;
  publisherVerified: boolean;
  installable: boolean;
  views: number;
}

export interface AssistantCitation {
  linkKey: string;
  name: string;
  kind: CatalogKind;
  publisher: string;
  installable: boolean;
}

/** Which LLM credential served an assistant answer (from the gateway). */
export interface AssistantMeta {
  provider: string;
  keyIndex: number | null;
  model: string;
  tookMs: number;
  /** True when the answer came from the short-lived cache (instant). */
  cached?: boolean;
  attempts: Array<{
    provider: string;
    keyIndex: number | null;
    outcome: string;
    status?: number;
    ms: number;
  }>;
}
