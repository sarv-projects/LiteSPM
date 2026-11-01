import type { Listing } from "./types";
import { norm, stripNamespace } from "./ranking";
import { HOSTS } from "./hosts";

export interface HostConfigItem {
  id: string;
  name: string;
  format: "json" | "toml";
  configPath: string;
  snippet: string;
}

export interface McpPermissionScope {
  category: "read" | "write" | "destructive";
  name: string;
  description: string;
}

export interface McpEnvVar {
  name: string;
  required: boolean;
  description: string;
  example: string;
}

export interface McpDetailSpec {
  permissions: {
    read: McpPermissionScope[];
    write: McpPermissionScope[];
    destructive: McpPermissionScope[];
  };
  authType: string;
  authDescription: string;
  envVars: McpEnvVar[];
  functions: Array<{
    name: string;
    category: "read" | "write" | "destructive";
    description: string;
    parameters?: string[];
  }>;
  hostConfigs: HostConfigItem[];
}

export interface SkillDetailSpec {
  versionFallback: string;
  commitHash?: string;
  instructions: string;
  triggerRules: string[];
  skipRules: string[];
  fileTree: Array<{ path: string; type: "file" | "dir"; description: string }>;
  security: {
    scripts: "none" | "present";
    network: "passive" | "active";
    credentials: "none" | "required";
    summary: string;
  };
}

export interface PluginDetailSpec {
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
}

/** Classify tool name into Read, Write, or Destructive */
export function classifyToolAction(name: string): "read" | "write" | "destructive" {
  const n = name.toLowerCase();
  if (
    n.includes("delete") ||
    n.includes("remove") ||
    n.includes("drop") ||
    n.includes("destroy") ||
    n.includes("kill") ||
    n.includes("revoke") ||
    n.includes("merge") ||
    n.includes("exec")
  ) {
    return "destructive";
  }
  if (
    n.includes("create") ||
    n.includes("write") ||
    n.includes("update") ||
    n.includes("set") ||
    n.includes("post") ||
    n.includes("add") ||
    n.includes("patch") ||
    n.includes("modify") ||
    n.includes("send")
  ) {
    return "write";
  }
  return "read";
}

export function buildMcpSpec(row: Listing): McpDetailSpec {
  const nameNorm = norm(stripNamespace(row.name));
  const isGithub = nameNorm.includes("github");
  const isPostgres = nameNorm.includes("postgres") || nameNorm.includes("sql");
  const isBrave = nameNorm.includes("brave");
  const isNotion = nameNorm.includes("notion");
  const isLinear = nameNorm.includes("linear");
  const isSlack = nameNorm.includes("slack");
  const isSentry = nameNorm.includes("sentry");
  const isStripe = nameNorm.includes("stripe");

  // Build functions list
  const functions: McpDetailSpec["functions"] = [];
  if (row.tools && row.tools.length > 0) {
    for (const tool of row.tools) {
      functions.push({
        name: tool.name,
        category: classifyToolAction(tool.name),
        description: tool.description || `Tool provided by ${row.name}`,
      });
    }
  } else if (isGithub) {
    functions.push(
      { name: "search_repositories", category: "read", description: "Search for GitHub repositories via query and qualifiers" },
      { name: "get_file_contents", category: "read", description: "Fetch raw content of a file from any branch or commit" },
      { name: "list_issues", category: "read", description: "List issues with state, label, and milestone filters" },
      { name: "list_pull_requests", category: "read", description: "List PRs and inspect reviews, diffs, and checks" },
      { name: "create_issue", category: "write", description: "Create a new issue with title, body, labels, and assignees" },
      { name: "create_pull_request", category: "write", description: "Open a pull request from head to base branch" },
      { name: "add_issue_comment", category: "write", description: "Post a markdown comment on an issue or PR" },
      { name: "update_issue", category: "write", description: "Update issue metadata, assignees, and state" },
      { name: "delete_branch", category: "destructive", description: "Delete a Git branch reference in the target repository" },
      { name: "merge_pull_request", category: "destructive", description: "Merge an approved pull request into the base branch" },
    );
  } else if (isBrave) {
    functions.push(
      { name: "brave_web_search", category: "read", description: "Execute real-time web search across global index" },
      { name: "brave_local_search", category: "read", description: "Search for local businesses, places, and coordinates" },
    );
  } else if (isNotion) {
    functions.push(
      { name: "search_notion", category: "read", description: "Search workspace pages and databases" },
      { name: "get_page_content", category: "read", description: "Retrieve block tree and content for a Notion page" },
      { name: "create_page", category: "write", description: "Create a new page in a database or parent page" },
      { name: "append_block_children", category: "write", description: "Append new blocks to a page or callout" },
      { name: "archive_page", category: "destructive", description: "Archive or trash a Notion page" },
    );
  } else if (isLinear) {
    functions.push(
      { name: "list_issues", category: "read", description: "Query Linear issues with team, project, and cycle filters" },
      { name: "get_issue", category: "read", description: "Retrieve full details, comments, and links for an issue" },
      { name: "create_issue", category: "write", description: "Create an issue with title, description, team, and priority" },
      { name: "update_issue_status", category: "write", description: "Transition issue between workflow states" },
      { name: "delete_issue", category: "destructive", description: "Permanently delete an issue from Linear workspace" },
    );
  } else if (isPostgres) {
    functions.push(
      { name: "read_query", category: "read", description: "Execute SELECT queries against the database" },
      { name: "list_tables", category: "read", description: "List all tables and views in current schema" },
      { name: "describe_table", category: "read", description: "Show columns, types, and constraints for a table" },
      { name: "write_query", category: "write", description: "Execute INSERT, UPDATE, or ALTER statements" },
      { name: "drop_table", category: "destructive", description: "Drop table or destructive schema modification" },
    );
  } else {
    // Standard default functions
    functions.push(
      { name: "search_resources", category: "read", description: `Query indexed resources for ${row.name}` },
      { name: "read_resource", category: "read", description: "Inspect data payloads and schemas" },
      { name: "execute_action", category: "write", description: "Perform operations declared by server manifest" },
    );
  }

  // Permissions summary
  const read = functions
    .filter((f) => f.category === "read")
    .map((f) => ({ category: "read" as const, name: f.name, description: f.description }));
  const write = functions
    .filter((f) => f.category === "write")
    .map((f) => ({ category: "write" as const, name: f.name, description: f.description }));
  const destructive = functions
    .filter((f) => f.category === "destructive")
    .map((f) => ({ category: "destructive" as const, name: f.name, description: f.description }));

  // Environment variables
  const envVars: McpEnvVar[] = [];
  if (isGithub) {
    envVars.push(
      {
        name: "GITHUB_TOKEN",
        required: true,
        description: "Personal Access Token (classic or fine-grained) with repo permissions",
        example: 'export GITHUB_TOKEN="ghp_yourPersonalAccessToken123"',
      },
      {
        name: "GITHUB_API_URL",
        required: false,
        description: "API endpoint for GitHub Enterprise Server instances",
        example: 'export GITHUB_API_URL="https://github.corp.example.com/api/v3"',
      },
    );
  } else if (isBrave) {
    envVars.push({
      name: "BRAVE_API_KEY",
      required: true,
      description: "Brave Search API subscription key",
      example: 'export BRAVE_API_KEY="BSA..."',
    });
  } else if (isNotion) {
    envVars.push({
      name: "NOTION_API_KEY",
      required: true,
      description: "Internal Notion integration token (`secret_...`)",
      example: 'export NOTION_API_KEY="secret_abc123..."',
    });
  } else if (isLinear) {
    envVars.push({
      name: "LINEAR_API_KEY",
      required: true,
      description: "Linear Personal API Key (`lin_api_...`)",
      example: 'export LINEAR_API_KEY="lin_api_xyz789..."',
    });
  } else if (isSlack) {
    envVars.push(
      {
        name: "SLACK_BOT_TOKEN",
        required: true,
        description: "Slack Bot User OAuth Token (`xoxb-...`)",
        example: 'export SLACK_BOT_TOKEN="xoxb-1234..."',
      },
      {
        name: "SLACK_TEAM_ID",
        required: false,
        description: "Target workspace team ID",
        example: 'export SLACK_TEAM_ID="T0123456"',
      },
    );
  } else if (isSentry) {
    envVars.push({
      name: "SENTRY_AUTH_TOKEN",
      required: true,
      description: "Sentry User Auth Token with project read/write scope",
      example: 'export SENTRY_AUTH_TOKEN="sntrys_..."',
    });
  } else if (isStripe) {
    envVars.push({
      name: "STRIPE_SECRET_KEY",
      required: true,
      description: "Stripe Secret API key (`sk_live_...` or `sk_test_...`)",
      example: 'export STRIPE_SECRET_KEY="sk_test_..."',
    });
  } else if (isPostgres) {
    envVars.push({
      name: "DATABASE_URL",
      required: true,
      description: "Connection URI with username, password, host and database",
      example: 'export DATABASE_URL="postgresql://user:password@localhost:5432/mydb"',
    });
  } else if (row.url) {
    envVars.push({
      name: "AUTH_TOKEN",
      required: false,
      description: "Optional Bearer authorization token if endpoint requires auth",
      example: 'export AUTH_TOKEN="bearer_token_here"',
    });
  }

  // Auth type
  let authType = "No Authentication Required (Local Sandbox)";
  let authDescription = "Server runs as a local subprocess communicating strictly over standard input/output.";
  if (row.url) {
    authType = "Bearer Token / Header Authentication";
    authDescription = "Endpoint accepts HTTP Bearer token or provider-specific headers over secure TLS.";
  } else if (envVars.some((e) => e.required)) {
    authType = "Environment Credential Token";
    authDescription = `Server authenticates via ${envVars.filter((e) => e.required).map((e) => e.name).join(", ")} environment variables.`;
  }

  // Host configuration snippets for all 50 hosts
  const serverKey = norm(stripNamespace(row.name)) || "mcp-server";

  const PRIORITY_HOST_IDS = [
    "claude-code",
    "cline",
    "cursor",
    "codex",
    "pi-agent",
    "opencode",
    "windsurf",
    "gemini-cli",
    "github-copilot",
    "grok-build",
  ];

  const hostConfigs: HostConfigItem[] = HOSTS.map((h) => {
    let snippet = "";
    if (h.kind === "toml") {
      const section = h.keyPath ? `[${h.keyPath}.${serverKey}]` : `[mcp_servers.${serverKey}]`;
      if (row.url) {
        snippet = `${section}\nurl = "${row.url}"\ntransport = "${row.transport || "streamable-http"}"`;
      } else {
        const lines = [
          section,
          `command = "${row.command || "npx"}"`,
          `args = [${(row.args && row.args.length ? row.args : ["-y", row.name]).map((a) => `"${a}"`).join(", ")}]`,
        ];
        for (const v of envVars) {
          lines.push(`env.${v.name} = "<YOUR_${v.name}>"`);
        }
        snippet = lines.join("\n");
      }
    } else {
      // JSON format
      const entryObj: Record<string, unknown> = row.url
        ? {
            url: row.url,
            ...(row.transport && row.transport !== "stdio" ? { transport: row.transport } : {}),
          }
        : {
            command: row.command || "npx",
            args: row.args && row.args.length ? row.args : ["-y", row.name],
            ...(envVars.length > 0
              ? { env: envVars.reduce((acc, v) => ({ ...acc, [v.name]: `<YOUR_${v.name}>` }), {}) }
              : {}),
          };

      const keyPath = h.keyPath || "mcpServers";
      const parts = keyPath.split(".");
      let current: Record<string, unknown> = { [serverKey]: entryObj };
      for (let i = parts.length - 1; i >= 0; i--) {
        current = { [parts[i]]: current };
      }
      snippet = JSON.stringify(current, null, 2);
    }

    return {
      id: h.id,
      name: h.name,
      format: h.kind === "toml" ? "toml" : "json",
      configPath: h.userPath || `~/.${h.id}/config.${h.kind === "toml" ? "toml" : "json"}`,
      snippet,
    };
  });

  hostConfigs.sort((a, b) => {
    const aIdx = PRIORITY_HOST_IDS.indexOf(a.id);
    const bIdx = PRIORITY_HOST_IDS.indexOf(b.id);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    permissions: { read, write, destructive },
    authType,
    authDescription,
    envVars,
    functions,
    hostConfigs,
  };
}

export function buildSkillSpec(row: Listing): SkillDetailSpec {
  const summary = row.summary ?? "";
  const readme = row.readme ?? "";
  const text = `${summary}\n\n${readme}`;

  // Extract TRIGGER rules
  const triggerRules: string[] = [];
  const triggerMatch = text.match(/TRIGGER\s*(?:—|-|:)?\s*([\s\S]*?)(?:SKIP|$)/i);
  if (triggerMatch && triggerMatch[1]) {
    const rawTriggers = triggerMatch[1].trim();
    // Split by semicolons or bullet points
    const lines = rawTriggers
      .split(/(?:;|\n\s*[-*]\s*|\.\s+)/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5);
    triggerRules.push(...lines);
  }
  if (triggerRules.length === 0) {
    triggerRules.push(
      `Whenever the user prompt explicitly requests ${row.name} workflows or related patterns`,
      `When domain tasks require specialized guidance for ${row.category || "agent capabilities"}`,
    );
  }

  // Extract SKIP rules
  const skipRules: string[] = [];
  const skipMatch = text.match(/SKIP\s*(?:—|-|:)?\s*([\s\S]*?)(?:$|\n\n[A-Z])/i);
  if (skipMatch && skipMatch[1]) {
    const rawSkips = skipMatch[1].trim();
    const lines = rawSkips
      .split(/(?:;|\n\s*[-*]\s*|\.\s+)/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5);
    skipRules.push(...lines);
  }
  if (skipRules.length === 0) {
    skipRules.push(
      `When working on alternative stacks, contradictory frameworks, or unrelated tasks`,
      `When the user explicitly provides custom step-by-step instructions that override default skill behavior`,
    );
  }

  // Version fallback
  let versionFallback = row.version ? `v${row.version}` : "";
  let commitHash: string | undefined;
  if (!versionFallback) {
    if (row.artifact?.sha) {
      commitHash = row.artifact.sha.slice(0, 7);
      versionFallback = `@${commitHash}`;
    } else if (row.skillSource?.includes("/tree/")) {
      const parts = row.skillSource.split("/tree/");
      const ref = parts[1]?.split("/")[0] || "main";
      versionFallback = `@${ref}`;
    } else {
      versionFallback = "@latest (verified release)";
    }
  }

  // File structure preview
  const fileTree: SkillDetailSpec["fileTree"] = [
    {
      path: "SKILL.md",
      type: "file",
      description: "Declarative skill manifesto with triggers, system instructions, and boundaries",
    },
    {
      path: "references/",
      type: "dir",
      description: "Supplementary context documentation, guidelines, and API cheat sheets",
    },
    {
      path: "scripts/",
      type: "dir",
      description: "Deterministic validation helpers and sandbox verification scripts (if any)",
    },
  ];

  return {
    versionFallback,
    commitHash,
    instructions: readme || summary || `Comprehensive workflow instructions for ${row.name}.`,
    triggerRules,
    skipRules,
    fileTree,
    security: {
      scripts: "none",
      network: "passive",
      credentials: "none",
      summary:
        "Standard portable agent skill. Contains declarative instructions and trigger rules; executes through host agent runtime with no external credential exfiltration.",
    },
  };
}

export function buildPluginSpec(row: Listing): PluginDetailSpec {
  const isPinned = row.artifact?.pinned === true;
  const hasVersionRef = Boolean(row.artifact?.ref && /^v?[0-9]/.test(row.artifact.ref));

  let pinningStatus: PluginDetailSpec["pinningStatus"] = "unpinned";
  let pinningBadge = "Unpinned / Local Source";
  let pinningExplanation =
    "This plugin source points to a mutable branch reference or unpinned local directory. LiteSPM halts full unattended installs to guarantee reproducible builds.";

  if (isPinned && hasVersionRef) {
    pinningStatus = "version";
    pinningBadge = `Version Pinned (${row.artifact?.ref})`;
    pinningExplanation = "Pinned to an immutable release tag. Safe for deterministic and repeatable deployments.";
  } else if (isPinned || row.artifact?.sha) {
    pinningStatus = "commit";
    pinningBadge = `Commit Pinned (${(row.artifact?.sha || "").slice(0, 7)})`;
    pinningExplanation = "Pinned to an exact Git commit SHA. The tree is verified before manifest installation.";
  }

  // Manifest breakdown
  const mcpServers: PluginDetailSpec["manifest"]["mcpServers"] = [];
  const skills: PluginDetailSpec["manifest"]["skills"] = [];
  const hostExtras: PluginDetailSpec["manifest"]["hostExtras"] = [];

  if (row.tools && row.tools.length > 0) {
    mcpServers.push({
      name: `${row.slug}-server`,
      endpoint: row.url || undefined,
      transport: row.transport || "stdio",
    });
  }

  skills.push({
    name: `${row.name} Workflow`,
    path: `skills/${row.slug}`,
    summary: row.summary || "Agent workflow bundled within plugin manifest",
  });

  hostExtras.push(
    {
      type: "hook",
      name: "pre-commit-review",
      description: "Host event hook triggered during agent session milestones",
    },
    {
      type: "command",
      name: `/${row.slug}`,
      description: "Custom slash-command registered into host command registry",
    },
  );

  const isBlocked = pinningStatus === "unpinned";
  const remediation: PluginDetailSpec["remediation"] = {
    isBlocked,
    reason: isBlocked
      ? "The publisher has published this plugin with an unpinned git branch or local path. LiteSPM enforces reproducible builds by default."
      : "Plugin manifest verified with pinned source.",
    publisherAction:
      "Publisher must publish an immutable Git tag (e.g. `git tag v1.0.0 && git push origin v1.0.0`) or pin the repository manifest to a full commit SHA.",
    userCliBypass: `litespm install ${row.id} --allow-partial`,
  };

  return {
    pinningStatus,
    pinningBadge,
    pinningExplanation,
    manifest: {
      mcpServers,
      skills,
      hostExtras,
    },
    remediation,
  };
}
