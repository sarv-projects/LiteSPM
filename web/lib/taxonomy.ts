import { listingIdentity } from "./discovery.mjs";
// The editorial goal taxonomy — the browse axis the source categories are not.
//
// Why it exists: measured over this catalog, the sources' own labels put
// 45,373 of 69,376 rows (65.4%) in one bucket, "Developer Tools", and the next
// largest is "Agent Skills" (19,209) — a bin and a format. Neither answers the
// question a reader arrives with ("what can my agent do for me?"). This module
// maps every row onto a small set of task-shaped goals instead.
//
// It is an **editorial grouping, not an upstream fact.** Nothing here is read
// from the publisher's record: a row's goal is decided by this file's rules
// from the row's own text (its source category where that names a domain, then
// its name and summary). The source category survives everywhere — on the
// entry, in Explore, and in the `/categories/` table — as provenance, and the
// row's goal is stated as LiteSPM's own grouping wherever it appears.
//
// The mapping is deterministic and inspectable: an ordered table of regexes,
// matched names first and then summaries, first match wins — no model call and
// no network at build or run time. The rules are ordered by specificity — a
// security row that happens to mention "database" is still security, because
// that rule is asked first — and a name outranks a summary, because the name
// is the publisher's own one-line claim about the thing.
//
// Coverage is reported, not implied (`taxonomyIndex`): how many rows land in a
// goal, how many fall through to the honest remainder (`other`), and the size
// of the largest goal. A row whose text supports no goal is never force-fitted;
// it stays in `other`.
//
// Pure over the row set it is handed, like `lib/catalog.ts`: the build-time
// pages call it over `data/catalog.json`, and the browser calls it again over
// the rows it fetches lazily, so the prerendered numbers and the post-fetch
// numbers cannot disagree.

import type { Listing } from "./telemetry";
import { capSummary } from "./searchFormat.mjs";

/** The eleven task-shaped goals. `other` is the remainder, not a goal. */
export type GoalId =
  | "coding"
  | "web"
  | "data"
  | "research"
  | "productivity"
  | "automation"
  | "infrastructure"
  | "security"
  | "business"
  | "communication"
  | "media";

export type GoalOrOther = GoalId | "other";

export interface GoalDefinition {
  id: GoalId;
  /** The words a reader sees. Task-shaped, not a source label. */
  label: string;
  /** One line, in the same voice as the rest of the site. */
  blurb: string;
}

/**
 * Display order is fixed here; the pages sort facets by count. The set is
 * deliberately small — every additional goal is another bin to fall into, and
 * the measured distribution below has no bucket anywhere near a plurality:
 *
 *   business        7,250  10.5%   money, commerce, marketing, legal
 *   coding          6,371   9.2%   write and ship software
 *   research        6,203   8.9%   search, papers, docs, memory, learning
 *   infrastructure  4,324   6.2%   deploy, serve, monitor, operate
 *   media           4,293   6.2%   video, audio, images, writing
 *   security        3,941   5.7%   auth, secrets, scanning, compliance
 *   data            3,842   5.5%   databases, analytics, dashboards
 *   automation      3,103   4.5%   tests, browsers, scraping, runners
 *   productivity    3,096   4.5%   tasks, notes, documents, calendars
 *   web             2,933   4.2%   sites, interfaces, design, brand
 *   communication   2,818   4.1%   email, chat, meetings, social
 *   other          21,202  30.6%   no goal this map can place — honest remainder
 *
 * (Measured on the 2026-10-15 snapshot, 69,376 rows. The largest goal is 10.5%
 * of the catalog — against the 65.4% the sources' own labels put in
 * "Developer Tools" — and `other` is the remainder the coverage line on
 * `/categories/` reports, never hidden.)
 */
export const GOALS: GoalDefinition[] = [
  {
    id: "coding",
    label: "Coding & Development",
    blurb: "Write, review and ship code: repositories, languages, build and release tooling.",
  },
  {
    id: "web",
    label: "Websites & Design",
    blurb: "Sites, interfaces and visual work: front-end, components, design files and brand assets.",
  },
  {
    id: "data",
    label: "Data & Analytics",
    blurb: "Databases, warehouses, spreadsheets, dashboards and the numbers behind them.",
  },
  {
    id: "research",
    label: "Research & Learning",
    blurb: "Search, papers, documentation, knowledge and memory for an agent — plus learning material.",
  },
  {
    id: "productivity",
    label: "Productivity & Workflow",
    blurb: "Tasks, notes, documents, calendars and project management.",
  },
  {
    id: "automation",
    label: "Testing & Automation",
    blurb: "Tests, browser automation, scraping and the runners that chain steps together.",
  },
  {
    id: "infrastructure",
    label: "Cloud & Infrastructure",
    blurb: "Deployments, containers, servers, networking, monitoring and operations.",
  },
  {
    id: "security",
    label: "Security & Identity",
    blurb: "Authentication, secrets, vulnerability scanning and compliance.",
  },
  {
    id: "business",
    label: "Business & Finance",
    blurb: "Payments, trading, commerce, marketing, sales and legal work.",
  },
  {
    id: "communication",
    label: "Communication & Social",
    blurb: "Email, chat, meetings and the social platforms people already use.",
  },
  {
    id: "media",
    label: "Media & Content",
    blurb: "Video, audio, images, writing and publishing.",
  },
];

/** The remainder. Rendered as a distinct card, never dressed up as a goal. */
export const OTHER_GOAL: { id: "other"; label: string; blurb: string } = {
  id: "other",
  label: "Other",
  blurb:
    "Single-purpose utilities, regional lookups, reference data and the long tail of directories.",
};

/**
 * Source categories that name a goal domain directly. These are the upstream
 * labels; mapping them wholesale is the most honest step available — the
 * catalog itself says "Databases", and the goal for a database row is Data &
 * Analytics. The generic bins (below) cannot be mapped this way, because their
 * names describe a format or a catch-all rather than a task.
 *
 * A category mapped to `other` is one whose name names no goal at all
 * (Sports, Travel, Spirituality); those rows take the remainder rather than
 * being pushed into a goal by a stray keyword.
 */
const CATEGORY_GOALS: Record<string, GoalOrOther> = {
  // data
  "Databases": "data",
  "Data Platforms": "data",
  "Data Science Tools": "data",
  "Data & Analytics": "data",
  "Data Visualization": "data",
  // research
  "Search & Retrieval": "research",
  "Knowledge & Memory": "research",
  "end to end RAG platforms": "research",
  "Education & Research": "research",
  "Biology, Medicine and Bioinformatics": "research",
  "Health & Wellness": "research",
  "Environment & Nature": "research",
  "Aerospace & Astrodynamics": "research",
  "math": "research",
  // security
  "Security & Testing": "security",
  "Cryptography": "security",
  "Identity": "security",
  // infrastructure
  "Cloud Infrastructure": "infrastructure",
  "Monitoring": "infrastructure",
  "Industrial & IoT": "infrastructure",
  // automation
  "Browser Automation": "automation",
  // coding
  "Code Execution": "coding",
  "Command Line": "coding",
  "Frameworks": "coding",
  "Embedded System": "coding",
  // web
  "Accessibility": "web",
  // media
  "Multimedia": "media",
  "Text-to-Speech": "media",
  "Speech-to-Text": "media",
  "Podcasts": "media",
  "Art & Culture": "media",
  "Gaming": "media",
  // communication
  "Communication": "communication",
  "Social Media": "communication",
  "Translation Services": "communication",
  // productivity
  "Productivity & Workflow": "productivity",
  "Product Management": "productivity",
  "Support & Service Management": "productivity",
  // business
  "Finance & Crypto": "business",
  "E-Commerce": "business",
  "Legal": "business",
  "Customer Data Platforms": "business",
  "Real Estate": "business",
  "Business & Operations": "business",
  "Agreements & Coordination": "business",
  // no goal named
  "Location Services": "other",
  "Travel & Transportation": "other",
  "Sports": "other",
  "Spirituality & Esoterica": "other",
  "Delivery": "other",
  "Conversational AI": "other",
  "Security Notice": "other",
};

/**
 * Categories that are format/source bins, not domains. A row filed under
 * "Agent Skills" or "TypeScript Skills" says nothing about what it does, so
 * those rows go through the keyword rules below — the same rules that decide
 * the bulk of "Developer Tools".
 */
const GENERIC_CATEGORIES = new Set([
  "Developer Tools",
  "Agent Skills",
  "TypeScript Skills",
  "Official Skills by",
  "Community Skills",
  "Python Skills",
  "NET Skills",
  "Java Skills",
  "Rust Skills",
  "Core Skills",
  "Other Tools and Integrations",
  "Plugins & Toolkits",
]);

interface Rule {
  id: GoalId;
  /** Tested against the row's own name, first (the strongest signal). */
  name: RegExp;
  /** Tested against name + summary when the name did not match. */
  text: RegExp;
}

/**
 * Ordered rules, first match wins. Order is specificity, not alphabet: the
 * security rule is asked before data so "secrets in a database" stays security,
 * infrastructure before data so "Prometheus database" is monitoring, research
 * before coding so "docs lookup" is research. Within a rule, the name is
 * checked before the summary because a name is the publisher's one-line claim
 * about the thing, while a summary is prose that may mention anything.
 *
 * These patterns are editorial. They were tuned against the snapshot and their
 * misses are reported by `taxonomyIndex`, not hidden: a row no rule claims
 * lands in `other`.
 */
const RULES: Rule[] = [
  {
    id: "security",
    name: /\bsecurity|vulnerab|pentest|firewall|encrypt|secrets?|credential|\boauth\b|\bsso\b|zero.trust|threat|exploit|malware|phishing|\bcyber|compliance|\bgdpr\b|\bhipaa\b|passkey|\bpassword|\b2fa\b|\bmfa\b|\bauth\b|identity|siem|\biam\b|secrets?|cve\b/i,
    text: /\bsecurity|vulnerabilit|pentest|penetration test|firewall|encrypt|secrets?\b|credential|authentication|authoriz|\boauth\b|\bsso\b|zero.trust|threat model|malware|phishing|\bcyber|incident response|compliance|\bgdpr\b|\bhipaa\b|passkey|password|\b2fa\b|\bmfa\b|security audit|permission|\bidentity\b|\bauth\b|\bvault\b|\biam\b/i,
  },
  {
    id: "infrastructure",
    name: /\bcloud\b|\baws\b|amazon web|azure|google cloud|\bgcp\b|kubernetes|\bk8s\b|docker|container|serverless|terraform|pulumi|ansible|infrastructure|deploy|hosting|\bdns\b|\bcdn\b|load balanc|monitoring|observability|prometheus|grafana|datadog|\bsentry\b|uptime|on.call|\bsre\b|nginx|virtual machine|\bbackup|proxmox|hetzner|cloudflare|\bssh\b|\bproxy\b|\blinux\b|\bdevops\b|rabbitmq|\bkafka\b|message broker|network diagnostic|\bwhois\b|\bping\b|\bmtr\b/i,
    text: /\bcloud\b|\baws\b|amazon web services|azure|google cloud|\bgcp\b|kubernetes|\bk8s\b|docker|containers?|serverless|terraform|pulumi|ansible|infrastructure|deploy|deployment|hosting|\bdns\b|\bcdn\b|reverse proxy|load balanc|monitoring|observability|logging|\blogs\b|metrics|\balert|prometheus|grafana|datadog|\bsentry\b|uptime|on.call|\bsre\b|nginx|linux server|virtual machine|\bbackup|\bssh\b|rabbitmq|\bkafka\b|message broker|network diagnostic|\bwhois\b/i,
  },
  {
    id: "data",
    name: /\bsql\b|postgres|mysql|mongo|sqlite|redis|clickhouse|snowflake|bigquery|databricks|duckdb|neo4j|elasticsearch|opensearch|database|warehouse|analytics|dashboard|visuali[sz]|spreadsheet|\bexcel\b|\bcsv\b|pandas|numpy|statistic|data.science|data.pipeline|data.model|metabase|superset|grafana|tableau|power ?bi|airtable|\betl\b|dataset|\bduckdb\b/i,
    text: /\bdatabase|\bsql\b|postgres|mysql|mongo|sqlite|redis|clickhouse|snowflake|bigquery|databricks|duckdb|neo4j|graph database|elasticsearch|opensearch|data warehouse|\betl\b|dataset|analytics|dashboard|visuali[sz]|\bcharts?\b|spreadsheet|\bexcel\b|\bcsv\b|pandas|numpy|statistic|data science|data pipeline|data model|\bschema\b|business intelligence|timeseries|time series/i,
  },
  {
    id: "research",
    name: /research|arxiv|scholar|academic|papers?\b|citation|wikipedia|encycloped|search|serp|knowledge|\bmemory\b|retrieval|\brag\b|vector|embedding|semantic|learn|course|tutorial|education|teach|study|flashcard|quiz|exam|tutor|translate|translation|dictionary|patent|case law|documentation|\bdocs\b|recall|remember/i,
    text: /research|arxiv|scholar|academic|papers?\b|citation|literature|wikipedia|encycloped|web search|search engine|\bserp\b|knowledge base|knowledge graph|\bmemory\b|recall|remember|retrieval|\brag\b|vector (store|database|search)|embedding|semantic search|\blearn|course|tutorial|education|\bteach|\bstudy\b|flashcard|quiz|exam|tutor|linguistic|translate|translation|patent|case law|documentation lookup/i,
  },
  {
    id: "automation",
    name: /playwright|selenium|cypress|puppeteer|browser automation|web automation|scrape|scraping|crawl|crawler|headless|browser use|\brpa\b|test suite|e2e test|end.to.end test|regression test|\btests?\b|testing|\bqa\b|workflow automation|orchestrat|scheduler|\bcron\b|zapier|\bn8n\b|robot|automat|desktop automation|computer use|mouse|keyboard/i,
    text: /\btests?\b|testing|\bqa\b|playwright|selenium|cypress|puppeteer|browser automation|web automation|scrape|scraping|crawl|crawler|automation|automate|workflow automation|orchestrat|scheduler|\bcron\b|zapier|\bn8n\b|robot|headless browser|\brpa\b|desktop automation|computer use|mouse|keyboard|end.to.end test|regression test/i,
  },
  {
    id: "coding",
    name: /\bcode\b|coding|programming|developer|\bdev\b|software|repository|\brepo\b|\bgit\b|github|gitlab|bitbucket|commit|pull request|refactor|lint|debug|compiler|\bsdk\b|package manager|\bnpm\b|\bpip\b|cargo|gradle|maven|dotnet|\bjava\b|\bpython\b|typescript|javascript|\brust\b|golang|\bgo\b|react\b|vue\b|svelte|next\.js|nuxt|django|flask|rails|laravel|spring|codebase|\bide\b|\bcli\b|devops|ci\/cd|code review|test.driven|pair programming|openapi|graphql|api client|nuget|version control|package registry|dependency conflict|dependency upgrade|pub get|package version/i,
    text: /\bcode\b|coding|programming|developer|software development|repository|\bgit\b|github|commit message|pull request|refactor|lint|debug|compiler|package manager|\bnpm\b|\bpip\b|cargo|gradle|maven|dotnet|codebase|code review|unit test|test.driven|pair programming|openapi|graphql|\bsdk\b|source code|write code|code generation|programming language|version control|package conflict|dependency conflict|dependency upgrade|pub get/i,
  },
  {
    id: "web",
    name: /website|frontend|front.end|\bui\b|\bux\b|\bcss\b|tailwind|\bhtml\b|design|figma|canva|\bsketch\b|photoshop|illustrator|brand|\blogo\b|\bicon\b|typography|\bfont\b|theme|template|landing page|responsive|accessib|wireframe|prototype|slide|presentation|diagram|webflow|wordpress|web app|component library/i,
    text: /website|frontend|front.end|\bui\b|\bux\b|\bcss\b|tailwind|\bhtml\b|web design|design system|figma|canva|\bsketch\b|photoshop|illustrator|brand guidelines|\blogo\b|icon set|typography|\bfont\b|landing page|responsive|accessib|wireframe|prototype|presentation|slide deck|diagram|webflow|wordpress theme|component library/i,
  },
  {
    id: "media",
    name: /\bvideo|\baudio|music|podcast|\bsound\b|\bvoice|speech|text.to.speech|\btts\b|transcri|subtitle|caption|image|photo|camera|webcam|screenshot|animation|\b3d\b|\brender|stream|youtube|tiktok|instagram|movie|\bfilm\b|\bmedia\b|copywriting|\bblog\b|\bwriting|newsletter/i,
    text: /\bvideo|\baudio|music|podcast|\bsound\b|voice.over|speech|text.to.speech|\btts\b|transcri|subtitle|caption|image generation|generate images|edit images|\bphoto|camera|webcam|screenshot|animation|\b3d\b|\brender|streaming|youtube|tiktok|instagram|movie|\bfilm\b|\bmedia\b|copywriting|blog post|newsletter|content creation/i,
  },
  {
    id: "communication",
    name: /\bemail|gmail|outlook|smtp|imap|slack|discord|telegram|whatsapp|messenger|\bchat\b|messaging|\bsms\b|\bmail\b|notification|social media|twitter|linkedin|facebook|mastodon|bluesky|reddit|forum|comment|\binbox\b|newsletter platform|community/i,
    text: /\bemail|gmail|outlook|smtp|imap|slack|discord|telegram|whatsapp|messenger|\bchat\b|messaging|\bsms\b|voice call|\bvoip\b|zoom|microsoft teams|meeting|calendar|schedul|invite|notification|social media|twitter|\bx\.com|linkedin|facebook|mastodon|bluesky|reddit|forum|comment|\binbox\b|send mail|mailing|\bmail\b/i,
  },
  {
    id: "productivity",
    name: /\btask|todo|to.do|kanban|\bjira\b|\blinear\b|\basana\b|trello|clickup|notion|obsidian|evernote|\bnote|document|\bdocx\b|\bpdf\b|office suite|\bform\b|survey|questionnaire|bookmark|reminder|roadmap|sprint|backlog|time track|agenda|minutes|product management|project manage|\bplan\b|\bfile\b|\bdrive\b|folder|organiz/i,
    text: /\btasks?\b|to.do|project management|kanban|\bjira\b|\blinear\b|\basana\b|trello|clickup|notion|obsidian|evernote|\bnotes?\b|\bmemo\b|documents?|\bdocx\b|\bpdf\b|word document|office suite|\bforms?\b|survey|questionnaire|bookmark|reminder|roadmap|sprint|backlog|time tracking|agenda|meeting minutes|product management|\bcalendar\b|schedul/i,
  },
  {
    id: "business",
    name: /\bfinance|financial|crypto|blockchain|bitcoin|ethereum|wallet|\btoken|defi|\bnft|trading|\bstock|invest|payment|stripe|paypal|invoice|billing|accounting|bookkeeping|\btax\b|\bbank|loan|insurance|ecommerce|e.commerce|shopify|woocommerce|marketplace|\bsales\b|\bcrm\b|hubspot|salesforce|marketing|\bseo\b|advertis|\bads\b|campaign|\bbusiness|startup|entrepreneur|\blegal|contract|procurement|supply chain|logistics|recruit|hiring|resume|\bjob|real estate|pricing|commerce/i,
    text: /\bfinance|financial|crypto|blockchain|bitcoin|ethereum|wallet|\btokens?\b|defi|\bnft|trading|stock market|invest|payment|stripe|paypal|invoice|billing|accounting|bookkeeping|\btax\b|banking|loan|insurance|ecommerce|e.commerce|shopify|woocommerce|marketplace|sales team|\bcrm\b|hubspot|salesforce|marketing|\bseo\b|advertis|google ads|campaign|\bbusiness|startup|entrepreneur|\blegal|contract|procurement|supply chain|logistics|recruit|hiring|resume|job posting|real estate|pricing/i,
  },
];

/**
 * The MCP registry's namespace convention puts an account and a slash in the
 * name (`io.github.account/repo`). That prefix names the publisher, not the
 * thing, so it is stripped before the name rules run — otherwise every
 * registry row would match the `github` pattern in `coding`.
 */
const REGISTRY_PREFIX = /^io\.github\.[^/]+\//i;

function cleanName(name: string | undefined): string {
  return (name ?? "").replace(REGISTRY_PREFIX, "").replace(/[-_]+/g, " ");
}

/**
 * Which goal a row belongs to, or `"other"` when no rule claims it. Pure,
 * deterministic, and the same on the server and in the browser.
 *
 * The summary is capped with the same `capSummary` the display projection
 * applies before it reaches the browser. That is deliberate: the build-time
 * pages classify `data/catalog.json` (full summaries) while Explore re-runs
 * this function over the projection (summaries capped at 200 characters), and
 * a rule that matched only past the cap would give the select one count and
 * the filtered result another. Classifying exactly the text both sides
 * actually hold is what keeps the prerendered numbers and the post-fetch
 * numbers identical.
 */
export function classifyListing(
  item: Pick<Listing, "name" | "summary" | "category">
): GoalOrOther {
  const category = item.category?.trim() ?? "";
  const direct = CATEGORY_GOALS[category];
  if (direct && !GENERIC_CATEGORIES.has(category)) return direct;

  const name = cleanName(item.name).toLowerCase();
  const text = `${name} ${capSummary(item.summary ?? "").toLowerCase()}`;
  // Names first, across every rule, then summaries: the name is the
  // publisher's own one-line claim, so it outranks a summary that merely
  // mentions a domain word. Without this pass, "Encore Testing" (a test
  // runner whose summary mentions databases) read as Data & Analytics.
  for (const rule of RULES) if (rule.name.test(name)) return rule.id;
  for (const rule of RULES) if (rule.text.test(text)) return rule.id;
  return "other";
}

const GOAL_BY_ID = new Map<GoalOrOther, GoalDefinition | typeof OTHER_GOAL>([
  ...GOALS.map((goal) => [goal.id, goal] as const),
  ["other", OTHER_GOAL],
]);

/* ------------------------------------------------------------------ *
 * Facets and the coverage report
 * ------------------------------------------------------------------ */

export interface GoalFacet {
  id: GoalOrOther;
  label: string;
  blurb: string;
  count: number;
  /** Same shape as `categoryIndex`, so a tile can show a kind mix. */
  byKind: Record<Listing["kind"], number>;
  /** Share of the whole catalog, 0–1. */
  share: number;
  /**
   * The source categories this goal's rows mostly came from, largest first
   * (up to three). This is how the provenance survives inside the editorial
   * grouping: the goal is LiteSPM's, the categories are the sources'.
   */
  topCategories: Array<{ name: string; count: number }>;
}

export interface TaxonomyCoverage {
  /** Distinct packages placed in at least one of the eleven goals. */
  mapped: number;
  /** Distinct packages matching `other`; source variants can overlap facets. */
  other: number;
  /** `mapped / total`, 0–1. */
  coverage: number;
  /**
   * The largest *goal* (never `other`, which is a remainder, not a claim):
   * the number the "no bucket may dominate" rule is measured against.
   */
  largest: { id: GoalOrOther; label: string; count: number; share: number };
}

export interface TaxonomyIndex {
  total: number;
  /** The eleven goals plus the remainder, largest first. */
  facets: GoalFacet[];
  coverage: TaxonomyCoverage;
}

/**
 * Aggregate a row set by goal: counts, kind mix, top source categories and
 * the coverage report. Runs at build time over `data/catalog.json` and in the
 * browser over the lazily-fetched rows, from the same rules — so the numbers
 * on `/categories/` and the numbers after Explore loads cannot disagree.
 */
export function taxonomyIndex(items: Listing[]): TaxonomyIndex {
  const counts = new Map<GoalOrOther, GoalFacet>();
  const categoriesByGoal = new Map<GoalOrOther, Map<string, number>>();
  const seen = new Set<string>();
  const identities = new Set<string>();
  const mappedIdentities = new Set<string>();

  const seed = (id: GoalOrOther): GoalFacet => {
    const definition = GOAL_BY_ID.get(id);
    return {
      id,
      label: definition?.label ?? id,
      blurb: definition?.blurb ?? "",
      count: 0,
      byKind: { mcp: 0, skill: 0, plugin: 0 },
      share: 0,
      topCategories: [],
    };
  };

  for (const item of items) {
    const id = classifyListing(item);
    const identity = listingIdentity(item);
    identities.add(identity);
    const key = id + "|" + identity;
    if (seen.has(key)) continue;
    seen.add(key);
    let facet = counts.get(id);
    if (!facet) {
      facet = seed(id);
      counts.set(id, facet);
    }
    facet.count += 1;
    facet.byKind[item.kind] += 1;
    if (id !== "other") mappedIdentities.add(identity);

    const category = item.category?.trim();
    if (category) {
      let categories = categoriesByGoal.get(id);
      if (!categories) categoriesByGoal.set(id, (categories = new Map()));
      categories.set(category, (categories.get(category) ?? 0) + 1);
    }
  }

  // Every goal appears even when a filtered row set holds none of it, so a
  // facet list cannot silently change shape between the prerender and a fetch.
  for (const goal of GOALS) if (!counts.has(goal.id)) counts.set(goal.id, seed(goal.id));
  if (!counts.has("other")) counts.set("other", seed("other"));

  const total = identities.size;
  const mapped = mappedIdentities.size;
  const facets = Array.from(counts.values())
    .map((facet) => {
      const categories = categoriesByGoal.get(facet.id);
      const topCategories = categories
        ? Array.from(categories, ([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, 3)
        : [];
      return {
        ...facet,
        share: total === 0 ? 0 : facet.count / total,
        topCategories,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const largest = facets
    .filter((facet) => facet.id !== "other")
    .reduce((best, facet) => (facet.count > best.count ? facet : best));

  return {
    total,
    facets,
    coverage: {
      mapped,
      other: counts.get("other")?.count ?? 0,
      coverage: total === 0 ? 0 : mapped / total,
      largest: {
        id: largest.id,
        label: largest.label,
        count: largest.count,
        share: total === 0 ? 0 : largest.count / total,
      },
    },
  };
}

/** Just the facet list — what the Explore goal filter needs. */
export function taxonomyFacets(items: Listing[]): GoalFacet[] {
  return taxonomyIndex(items).facets;
}
