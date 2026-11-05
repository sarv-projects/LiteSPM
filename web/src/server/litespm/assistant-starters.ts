/**
 * Precomputed answers for the four suggestion chips.
 *
 * These questions are known before the visitor asks them, so paying a cold LLM
 * round-trip is wasted latency. The answers are curated against the release
 * named below; if the catalog release changes, `starterFor` refuses them and
 * the normal retrieval + LLM path runs instead. That keeps the fast path from
 * ever serving a package that no longer exists.
 */

export interface StarterCitation {
  linkKey: string;
  name: string;
  kind: string;
  publisher: string;
  installable: boolean;
}

export interface StarterAnswer {
  answer: string;
  keys: string[];
  citations: StarterCitation[];
}

const STARTER_RELEASE_ID = "rel-2026-11-05-03";

const STARTERS: Record<string, StarterAnswer> = {
  "What can LiteSPM install for working with Postgres?": {
    answer:
      "LiteSPM has 271 installable Postgres-related listings. For actual database access, the strongest options are **PostgreSQL MCP Server** (27 tools for queries, schema, CRUD, DBA and HA) and **ai.waystation/postgres** (connect to a PostgreSQL instance and inspect data and schemas). For coding help, **Postgres** by planetscale covers optimization, connection troubleshooting and best practices; **Postgres Drizzle** covers schemas, migrations, indexing and Drizzle ORM. If you only need read-only production inspection, choose a read-only server from the cards below.",
    keys: [
      "skill:planetscale:postgres",
      "mcp:builtin:mcp-registry:io.github.itunified-io-postgres",
      "mcp:builtin:mcp-registry:ai.waystation-postgres",
      "skill:ccheney:postgres-drizzle",
    ],
    citations: [
      { linkKey: "skill:planetscale:postgres", name: "Postgres", kind: "skill", publisher: "planetscale", installable: true },
      { linkKey: "mcp:builtin:mcp-registry:io.github.itunified-io-postgres", name: "PostgreSQL MCP Server", kind: "mcp", publisher: "itunified-io", installable: true },
      { linkKey: "mcp:builtin:mcp-registry:ai.waystation-postgres", name: "ai.waystation/postgres", kind: "mcp", publisher: "ai.waystation", installable: true },
      { linkKey: "skill:ccheney:postgres-drizzle", name: "Postgres Drizzle", kind: "skill", publisher: "ccheney", installable: true },
    ],
  },
  "I want my agent to browse the web — what should I install?": {
    answer:
      "For real browser control, install **playwright-mcp** by Microsoft; it gives the agent a browser it can navigate, click and inspect. **Browser Automation** by mindstone is a second MCP option with a broader automation surface. For agent guidance, **Browser** by browserbase and **Playwright** by bobmatnyc are installable skills that teach the workflow around the tool. Start with one MCP server and one skill rather than installing every browser package.",
    keys: [
      "mcp:microsoft:playwright-mcp",
      "mcp-server-browser-automation",
      "skill:browserbase:browser",
      "skill:bobmatnyc:playwright",
    ],
    citations: [
      { linkKey: "mcp:microsoft:playwright-mcp", name: "playwright-mcp", kind: "mcp", publisher: "microsoft", installable: true },
      { linkKey: "mcp-server-browser-automation", name: "Browser Automation", kind: "mcp", publisher: "mindstone", installable: true },
      { linkKey: "skill:browserbase:browser", name: "Browser", kind: "skill", publisher: "browserbase", installable: true },
      { linkKey: "skill:bobmatnyc:playwright", name: "Playwright", kind: "skill", publisher: "bobmatnyc", installable: true },
    ],
  },
  "Which skills help with PDF documents?": {
    answer:
      "The official **Pdf** skill by Anthropic is the best general starting point for reading, creating and editing PDFs. **Pdf Extraction** by claude-office-skills focuses on pulling structured content out of documents. If the agent needs a service rather than a skill, **PDF Toolkit** and **PDF to Markdown** are installable MCP servers for generation, conversion and extraction. Pick the skill first if you only need instructions; pick an MCP server if the agent must process files without a separate tool.",
    keys: [
      "skill:anthropics:pdf",
      "skill:claude-office-skills:pdf-extraction",
      "mcp:builtin:mcp-registry:com.tensormaster-pdf",
      "mcp:builtin:mcp-registry:dev.pdf2md-pdf-to-markdown",
    ],
    citations: [
      { linkKey: "skill:anthropics:pdf", name: "Pdf", kind: "skill", publisher: "anthropics", installable: true },
      { linkKey: "skill:claude-office-skills:pdf-extraction", name: "Pdf Extraction", kind: "skill", publisher: "claude-office-skills", installable: true },
      { linkKey: "mcp:builtin:mcp-registry:com.tensormaster-pdf", name: "PDF Toolkit", kind: "mcp", publisher: "com.tensormaster", installable: true },
      { linkKey: "mcp:builtin:mcp-registry:dev.pdf2md-pdf-to-markdown", name: "PDF to Markdown (pdf2md.dev)", kind: "mcp", publisher: "dev.pdf2md", installable: true },
    ],
  },
  "How do I set up LiteSPM with Claude Code?": {
    answer:
      "Run `litespm setup --agent claude-code`. It finds `~/.claude.json`, shows the one `mcpServers.litespm` entry it will add, saves a backup, and writes the bridge. Restart Claude Code, then run `/mcp` to confirm the `litespm` server is connected. For a project-only setup, run the same command from the project root or use `litespm install <id> --scope project`. If you want the browser marketplace at the same time, run `litespm marketplace`.",
    keys: [],
    citations: [],
  },
};

export function starterFor(question: string, releaseId: string): StarterAnswer | null {
  if (releaseId !== STARTER_RELEASE_ID) return null;
  return STARTERS[question.trim()] ?? null;
}
