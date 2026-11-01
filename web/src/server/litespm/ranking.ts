/**
 * LiteSPM ranking — an editorial reputation score (0–100) per listing.
 *
 * The previous score measured metadata completeness, which produced a flat 58
 * across 68k fully-filled rows and let header-fragment and SEO-spam records
 * alphabetize their way to the top. This score measures something a directory
 * can honestly claim: recognition and trustworthiness of the tool itself.
 *
 * Components (max 100):
 *   Editorial recognition ......... 0–35  the tool matches a known flagship of
 *                                         the agent ecosystem (official MCP
 *                                         references, top-vendor servers,
 *                                         Anthropic's official skills), or a
 *                                         notable second tier (0–22), or
 *                                         carries a first-party namespace
 *                                         (0–12)
 *   Vendor authority .............. 0–18  first-party publisher (14/8),
 *                                         verified publisher (+4, capped at 18)
 *   Proven installability ......... 0–15  tested 15 · runtime-verified 12 ·
 *                                         metadata-verified 7 · claimed 2
 *   Record quality ................ 0–12  endpoint, tools, readme, command,
 *                                         version
 *   Description substance ......... 0–5   >=120 chars: 5, >=60: 4, >=25: 2, >=10: 1
 *   GitHub stars (when present) ... 0–15  log scale — future-proof: blends in
 *                                         automatically when counts are present
 *   Junk penalty .................. −45   symbol-initial names, HTTP-header
 *                                         fragments, non-scope "@" names —
 *                                         the SEO/parse-artifact band
 *
 * Exact sum of rubric maximums: 35 + 18 + 15 + 12 + 5 + 15 = 100 points.
 *
 * No popularity data (stars, installs) exists in this dataset, so within an
 * identical editorial standing results tie — the rank sort breaks ties with a
 * junk-aware name bucket, not raw locale order, so artifacts never float up.
 */

import type { Listing } from "./types";

/** Lowercase and keep only [a-z0-9]. Merges "@playwright/mcp" and
 *  "Playwright MCP" into one key. Guard: empty for non-Latin-only names. */
export function norm(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Registry rows spell names "io.github.org/tool" — the tool is the tail. */
export function stripNamespace(name: string): string {
  return name.replace(/^io\.github\.[^/]+\//i, "");
}

/** First-party orgs of the agent ecosystem (tier 1 = ecosystem founders and
 *  the vendors whose servers every directory features). Compared normalized:
 *  "NotionHQ" → "notionhq", "Google Cloud" → "googlecloud". */
const VENDOR_TIER1 = new Set([
  "anthropic", "anthropics", "openai", "github", "microsoft", "google",
  "googlecloud", "googleapis", "aws", "awslabs", "amazon", "cloudflare",
  "supabase", "stripe", "notion", "notionhq", "linear", "sentry",
  "atlassian", "vercel", "netlify", "figma", "slack", "grafana", "posthog",
  "mongodb", "neon", "neondatabase", "shopify", "modelcontextprotocol",
  "playwright", "cursor", "cursorai", "zedindustries", "brave", "tavily",
  "exa", "upstash", "firecrawl", "browserbase", "elevenlabs", "postman",
  "jetbrains", "docker", "hashicorp", "gitlab", "huggingface", "railway",
]);

/** Tier 2 — established vendors whose agent tooling is known but not
 *  ecosystem-defining. */
const VENDOR_TIER2 = new Set([
  "apify", "twilio", "square", "paypal", "hubspot", "zapier", "auth0",
  "turso", "semgrep", "snyk", "sonar", "datadog", "newrelic", "pagerduty",
  "pinecone", "qdrant", "weaviate", "chroma", "elastic", "perplexity",
  "shopifydev", "braintrust", "langchain", "llamaindex", "composio",
  "smithery", "glama", "pipedream", "n8n", "airtable", "asana", "clickup",
  "jira", "confluence", "box", "dropbox", "discord", "telegram", "whatsapp",
]);

/**
 * Flagship tools: distinctive names that are flagship wherever they appear.
 * Keys are normalized (norm()). Matched exactly, or by containment for keys
 * ≥ 8 chars that are distinctive enough to be unambiguous.
 */
const FLAGSHIP_KEYS: Set<string> = new Set([
  // Official references & top-vendor servers (distinctive names)
  "playwrightmcp", "playwright", "chromedevtoolsmcp", "chromedevtools",
  "context7", "desktopcommander", "firecrawl", "firecrawlmcpp",
  "figmadevelopermcp", "framelinkfigmamcp", "gitmcp", "browserbase",
  "mcpserverkubernetes", "kubernetesmcp", "hexstrikeai", "mobilemcp",
  "windowsmcp", "mcpchrome", "serena", "fastmcp", "mcpuse",
  "mcptoolbox", "mcprouter", "mcpagenttoolkit",
  // Distinctive vendor product names — the tool wherever it is published
  // (official repo, feed mirror, or vendor registry namespace)
  "githubmcpserver", "bravesearch", "bravesearchmcpserver", "sentry",
  "sentrymcpserver", "notion", "notionmcpserver", "supabase",
  "supabasemcpserver", "stripe", "linear", "linearmcpserver", "atlassian",
  "confluence", "jira", "figma", "shopify", "grafana", "mcpgrafana",
  "posthog", "mcpposthog", "cloudflare", "cloudflaredocs",
  "cloudflareworkers", "netlify", "vercel", "postman", "postmanmcpserver",
  "exa", "tavily", "elevenlabs", "neon", "mongodb", "googlemaps",
  "dockermcptoolkit",
  // Anthropic official skills with distinctive names
  "canvasdesign", "webartifactsbuilder", "mcpbuilder", "skillcreator",
  "webapptesting", "brandguidelines", "algorithmicart", "themefactory",
  "doccoauthoring", "slackgifcreator", "artifactsbuilder",
  "claudeapi", "claudedocs",
  // Claude Code official plugins with distinctive names
  "prreviewtoolkit", "agentsdkdev", "plugindev", "hookify",
  "codemodernization", "codesimplifier", "claudesecurity",
  "securityguidance", "commitcommands", "featuredev", "codereview",
]);

/**
 * Generic-name flagships: a name like "filesystem" or "github" only earns
 * flagship when the publisher is the org that actually ships that reference
 * server; any other publisher claiming the same name earns the notable tier.
 */
const OFFICIAL_NAMES: Map<string, Set<string>> = new Map([
  ["filesystem", new Set(["modelcontextprotocol"])],
  ["memory", new Set(["modelcontextprotocol"])],
  ["everything", new Set(["modelcontextprotocol"])],
  ["fetch", new Set(["modelcontextprotocol"])],
  ["git", new Set(["modelcontextprotocol"])],
  ["time", new Set(["modelcontextprotocol"])],
  ["sequentialthinking", new Set(["modelcontextprotocol"])],
  ["mcpinspector", new Set(["modelcontextprotocol"])],
  ["github", new Set(["github", "modelcontextprotocol"])],
  ["azuremcp", new Set(["microsoft", "azure"])],
  ["slack", new Set(["modelcontextprotocol", "slack"])],
  ["puppeteer", new Set(["modelcontextprotocol"])],
  ["postgres", new Set(["modelcontextprotocol", "supabase", "neon", "neondatabase"])],
  ["postgresql", new Set(["modelcontextprotocol", "supabase", "neon", "neondatabase"])],
  ["agenttoolkit", new Set(["stripe", "shopify"])],
  ["terraform", new Set(["hashicorp"])],
  // Anthropic official skills with generic names — publisher-gated
  ["docx", new Set(["anthropic", "anthropics"])],
  ["docxskill", new Set(["anthropic", "anthropics"])],
  ["pdf", new Set(["anthropic", "anthropics"])],
  ["pdfskill", new Set(["anthropic", "anthropics"])],
  ["pptx", new Set(["anthropic", "anthropics"])],
  ["xlsx", new Set(["anthropic", "anthropics"])],
  ["internalcomms", new Set(["anthropic", "anthropics"])],
  ["frontenddesign", new Set(["anthropic", "anthropics"])],
  ["documentcreator", new Set(["anthropic", "anthropics"])],
]);

/** Notable second tier — recognized tools that are not flagships. */
const NOTABLE_KEYS: Set<string> = new Set([
  "mcpservers", "agenttoolkitmcp", "mcpregistry", "mcpgateway",
  "mcpmanager", "mcpcompass", "mcpservertemplate", "mcpforge",
  "acp", "awslabsmcp", "azure", "gdrive", "googledrive",
  "googlecalendar", "gmail", "googlesearch", "duckduckgo", "searxng",
  "memorybank", "knowledgememory",
]);

/** Distinctive containment keys — substring match is unambiguous here, and
 *  earns the notable tier unless the publisher or namespace is first-party
 *  (a vendor's own npm scope or io.github org), which earns flagship. */
const FLAGSHIP_CONTAINS: string[] = [
  "context7", "desktopcommander", "chromedevtools", "sequentialthinking",
  "browserbase", "hexstrike", "playwrightmcp", "bravesearch",
  "supabasemcp", "notionmcp", "sentrymcp", "linearmcp", "postmanmcp",
  "neonmcp", "elevenlabsmcp", "firecrawl",
];

/**
 * Junk penalty — the record is a parse artifact or SEO shell, not a tool.
 * Returns points to subtract (0 or 40/45).
 */
function junkPenalty(name: string): number {
  const trimmed = name.trim();
  if (!trimmed) return 40;

  // npm scope "@org/pkg" is a legitimate shape; a bare "@word" is not.
  if (trimmed.startsWith("@")) {
    return /^@[a-z0-9][a-z0-9._-]*\//i.test(trimmed) ? 0 : 40;
  }
  // HTTP-header fragments (" :authority host:port shape, value discarded").
  if (/value discarded|shape,\s*value/i.test(trimmed)) return 45;
  // Any other symbol/emoji/punctuation opening — "🐴 Gulltoppr", ".prompts",
  // "~Alter Identity", "$AI on HyperEVM", "【公式】…".
  if (/^[\p{S}\p{P}\p{C}]/u.test(trimmed)) return 40;
  return 0;
}

/** The org a namespace claims: "io.github.microsoft/playwright-mcp" →
 *  "microsoft"; "@playwright/mcp" → "playwright"; else null. */
function namespaceOrg(name: string): string | null {
  const ioMatch = /^io\.github\.([a-z0-9._-]+)\//i.exec(name);
  if (ioMatch) return norm(ioMatch[1].replaceAll(".", ""));
  const scopeMatch = /^@([a-z0-9][a-z0-9._-]*)\//i.exec(name);
  if (scopeMatch) return norm(scopeMatch[1].replaceAll(".", ""));
  return null;
}

function vendorPoints(org: string | null | undefined): number {
  if (!org) return 0;
  if (VENDOR_TIER1.has(org)) return 14;
  if (VENDOR_TIER2.has(org)) return 8;
  return 0;
}

const INSTALLABILITY_POINTS: Record<string, number> = {
  discovery_only: 2,
  metadata_verified: 7,
  runtime_verified: 12,
  litespm_tested: 15,
};

/** Editorial recognition: how well-known is this specific tool? (0–35) */
function recognitionPoints(name: string, publisherOrg: string): number {
  const exact = norm(stripNamespace(name));
  if (!exact) return 0;
  const isT1 = (org: string | null | undefined): boolean =>
    Boolean(org) && VENDOR_TIER1.has(org as string);

  // Publisher-gated flagship: the reference tool from its first-party org.
  const official = OFFICIAL_NAMES.get(exact);
  if (official && official.has(publisherOrg)) return 35;

  // Distinctive flagship name, wherever it appears (official repo, feed
  // mirror, or vendor registry namespace).
  if (FLAGSHIP_KEYS.has(exact)) return 35;

  // Name embeds a flagship key: a first-party publisher or namespace makes
  // it the vendor's own build; anyone else is a fork, wrapper or proxy —
  // notable tier.
  const contained = FLAGSHIP_CONTAINS.some((key) => exact.includes(key));
  if (contained && (isT1(publisherOrg) || isT1(namespaceOrg(name)))) return 35;

  // Same generic name, different publisher — a re-publication or wrapper.
  if (official) return 22;
  if (contained) return 22;
  if (NOTABLE_KEYS.has(exact)) return 22;

  // Unlisted tool but a first-party namespace: "@microsoft/…" or
  // "io.github.supabase/…" — recognizable provenance.
  const nsOrg = namespaceOrg(name);
  if (nsOrg && (VENDOR_TIER1.has(nsOrg) || VENDOR_TIER2.has(nsOrg))) return 12;

  return 0;
}

export interface RankScoreBreakdown {
  total: number;
  recognition: { points: number; max: 35; reason: string };
  vendorAuthority: { points: number; max: 18; reason: string };
  installability: { points: number; max: 15; reason: string };
  recordQuality: { points: number; max: 12; reason: string };
  description: { points: number; max: 5; reason: string };
  stars: { points: number; max: 15; reason: string };
  penalty: { points: number; reason: string };
}

export function rankScoreBreakdown(row: Listing): RankScoreBreakdown {
  const publisherOrg = norm(row.publisher?.name);

  let recognition = recognitionPoints(row.name, publisherOrg);
  let recReason = "Community listing";
  if (recognition >= 35) {
    recReason = "Flagship reference tool in ecosystem";
  } else if (recognition >= 22) {
    recReason = "Recognized notable implementation";
  } else if (recognition >= 12) {
    recReason = "Verified first-party namespace";
  }
  if (recognition > 22 && norm(stripNamespace(row.name)).includes("fork")) {
    recognition = 22;
    recReason = "Fork of notable repository";
  }

  const baseVendor = Math.max(
    vendorPoints(publisherOrg),
    vendorPoints(namespaceOrg(row.name)),
  );
  const isVerified = Boolean(row.publisher?.verified);
  const vendorPointsEarned = Math.min(18, baseVendor + (isVerified ? 4 : 0));
  let vendorReason = "Independent publisher";
  if (baseVendor >= 14) vendorReason = "Tier-1 ecosystem founding vendor";
  else if (baseVendor >= 8) vendorReason = "Tier-2 recognized ecosystem vendor";
  if (isVerified) vendorReason += " (Verified publisher badge)";

  const installPoints = INSTALLABILITY_POINTS[row.installability ?? "discovery_only"] ?? 2;
  let installReason = "Discovery listing";
  if (installPoints === 15) installReason = "LiteSPM tested in CI/sandbox";
  else if (installPoints === 12) installReason = "Runtime verified against host daemon";
  else if (installPoints === 7) installReason = "Metadata & manifest verified";

  let recordPoints = 0;
  const qualityItems: string[] = [];
  if (row.url || row.hasUrl) { recordPoints += 3; qualityItems.push("Endpoint URL"); }
  if (row.tools?.length) { recordPoints += 3; qualityItems.push(`${row.tools.length} tool schemas`); }
  if (row.readme) { recordPoints += 2; qualityItems.push("README/docs"); }
  if (row.command) { recordPoints += 2; qualityItems.push("Executable command"); }
  if (row.version) { recordPoints += 2; qualityItems.push(`Version ${row.version}`); }

  const summary = (row.summary ?? "").trim();
  let descPoints = 0;
  if (summary.length >= 120) descPoints = 5;
  else if (summary.length >= 60) descPoints = 4;
  else if (summary.length >= 25) descPoints = 2;
  else if (summary.length >= 10) descPoints = 1;

  let starPoints = 0;
  if (typeof row.stars === "number" && row.stars > 0) {
    starPoints = Math.min(15, Math.round(Math.log10(row.stars + 1) * 6));
  }

  const penalty = junkPenalty(row.name);

  const raw = recognition + vendorPointsEarned + installPoints + recordPoints + descPoints + starPoints - penalty;
  const total = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    total,
    recognition: { points: recognition, max: 35, reason: recReason },
    vendorAuthority: { points: vendorPointsEarned, max: 18, reason: vendorReason },
    installability: { points: installPoints, max: 15, reason: installReason },
    recordQuality: { points: recordPoints, max: 12, reason: qualityItems.join(", ") || "Basic record" },
    description: { points: descPoints, max: 5, reason: `${summary.length} character overview` },
    stars: { points: starPoints, max: 15, reason: row.stars ? `${row.stars} GitHub stars` : "No public stars tracked" },
    penalty: { points: penalty, reason: penalty > 0 ? "Junk or SEO-fragment naming penalty" : "No penalties" },
  };
}

/** The composite score. Deterministic from the row's own fields. */
export function rankScore(row: Listing): number {
  return rankScoreBreakdown(row).total;
}

/**
 * Tie-break bucket for rank-sorted results: junk records sort after clean
 * ones regardless of locale order, so ":authority …" never floats above
 * "1099Policy". 0 = clean name, 1 = artifact/spam name.
 */
export function nameTiebreakBucket(name: string): number {
  return junkPenalty(name) > 0 ? 1 : 0;
}

/**
 * The duplicate-collapse key: normalized name. The same tool legitimately
 * appears as both an MCP server and a skill (731 such names in this release),
 * and 20 repo+kind pairs were re-published under multiple publishers — this
 * key groups them so results pages and related rails can collapse twins while
 * each listing keeps its own page.
 */
export function dedupeKey(row: { name: string }): string {
  return row.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
