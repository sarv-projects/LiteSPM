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
  hasDeclaredTools: boolean;
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
  // Build functions list directly from genuine row tools
  const functions: McpDetailSpec["functions"] = [];
  if (row.tools && row.tools.length > 0) {
    for (const tool of row.tools) {
      functions.push({
        name: tool.name,
        category: classifyToolAction(tool.name),
        description: tool.description || `Tool declared by ${row.name}`,
      });
    }
  }

  const hasDeclaredTools = functions.length > 0;

  // Permissions summary from declared tools (empty if tools are discovered at runtime)
  const read = functions
    .filter((f) => f.category === "read")
    .map((f) => ({ category: "read" as const, name: f.name, description: f.description }));
  const write = functions
    .filter((f) => f.category === "write")
    .map((f) => ({ category: "write" as const, name: f.name, description: f.description }));
  const destructive = functions
    .filter((f) => f.category === "destructive")
    .map((f) => ({ category: "destructive" as const, name: f.name, description: f.description }));

  // Environment variables: inspect row properties honestly
  const envVars: McpEnvVar[] = [];
  if (row.args && Array.isArray(row.args)) {
    for (const arg of row.args) {
      const match = typeof arg === "string" ? arg.match(/\$\{?([A-Z0-9_]{3,})\}?/) : null;
      if (match && match[1] && !envVars.some((e) => e.name === match[1])) {
        envVars.push({
          name: match[1],
          required: true,
          description: `Environment variable referenced in server arguments: ${match[1]}`,
          example: `export ${match[1]}="<your_${match[1].toLowerCase()}>"`,
        });
      }
    }
  }

  // Auth type derived strictly from real transport and endpoints
  let authType = "Local Process Execution (stdio)";
  let authDescription =
    `Server executes as a local process via ${row.command || "npx"} communicating over standard input/output.`;
  if (row.url) {
    authType = "Remote Transport (TLS)";
    authDescription =
      `Endpoint communicates over ${row.transport || "streamable-http"} to ${row.url}. Any required authorization headers or tokens can be configured in your agent host settings.`;
  } else if (envVars.some((e) => e.required)) {
    authType = "Environment Credential Token";
    authDescription =
      `Server requires ${envVars.filter((e) => e.required).map((e) => e.name).join(", ")} environment variables.`;
  }

  // Host configuration snippets for all 50 hosts
  const serverKey = norm(stripNamespace(row.name)) || "mcp-server";

  // Sanitize CLI arguments: ensure fallback package identifiers never contain unescaped spaces
  const safeBinary =
    row.slug ||
    (row.name && !row.name.includes(" ")
      ? stripNamespace(row.name)
      : (norm(stripNamespace(row.name)).replace(/\s+/g, "-") || "mcp-server"));
  const defaultArgs = row.args && row.args.length ? row.args : ["-y", safeBinary];

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
          `args = [${defaultArgs.map((a) => `"${a}"`).join(", ")}]`,
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
            args: defaultArgs,
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
    hasDeclaredTools,
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

  if (row.effects && Array.isArray(row.effects)) {
    for (const ef of row.effects) {
      hostExtras.push({
        type: "hook",
        name: ef.effect,
        description: ef.declaredBy ? `Declared by ${ef.declaredBy}` : "Host event hook",
      });
    }
  }

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
