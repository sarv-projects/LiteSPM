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
    scripts: "none" | "present" | "unknown";
    network: "passive" | "active" | "unknown";
    credentials: "none" | "required" | "unknown";
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

function hostSupportsRemote(
  host: (typeof HOSTS)[number],
  transport: string | null | undefined,
): boolean {
  if (!host.remote) return false;
  const wanted = (transport ?? "").toLowerCase();
  const supported = (host.remoteTransports ?? []).map((value) => value.toLowerCase());
  if (supported.length === 0) return true;
  if (!wanted || wanted === "streamable-http" || wanted === "http") {
    return supported.includes("streamable-http") || supported.includes("http");
  }
  return supported.includes(wanted);
}

function nestValue(keyPath: string, leaf: unknown): Record<string, unknown> {
  const parts = keyPath.split(".").filter(Boolean);
  let current: unknown = leaf;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    current = { [parts[i]]: current };
  }
  return current as Record<string, unknown>;
}

/** The entry shape the host adapter writes for a local stdio server. */
function mcpLocalSnippet(
  host: (typeof HOSTS)[number],
  row: Listing,
  serverKey: string,
  envVars: McpEnvVar[],
): string | null {
  const command = row.command?.trim();
  if (!command) return null;
  const args = row.args?.length ? row.args : [];

  if (host.kind === "toml") {
    const section = host.keyPath
      ? `[${host.keyPath}.${serverKey}]`
      : `[mcp_servers.${serverKey}]`;
    const lines = [section, `command = "${command}"`, `args = [${args.map((arg) => `"${arg}"`).join(", ")}]`];
    if (host.shape === "stdio-typed") lines.push(`type = "stdio"`);
    if (envVars.length > 0) {
      // TOML hosts spell environment values differently (inline table, child
      // table, or a string reference). Do not guess a shape here; the
      // Environment Variables section names what is required.
      lines.push(`# required env: ${envVars.map((env) => env.name).join(", ")} (use this host's documented syntax)`);
    }
    return lines.join("\n");
  }

  let entry: unknown;
  switch (host.shape) {
    case "local-array":
      entry = { type: "local", command: [command, ...args] };
      break;
    case "stdio-typed":
      entry = { type: "stdio", command, args };
      break;
    case "command-string":
      entry = [command, ...args].join(" ");
      break;
    default:
      entry = { command, args };
      break;
  }

  if (envVars.length > 0 && (host.shape === "stdio-typed" || host.shape === "")) {
    (entry as Record<string, unknown>).env = envVars.reduce(
      (acc, env) => ({ ...acc, [env.name]: `<YOUR_${env.name}>` }),
      {},
    );
  }

  return JSON.stringify(nestValue(host.keyPath || "mcpServers", { [serverKey]: entry }), null, 2);
}

export function buildMcpSpec(row: Listing): McpDetailSpec {
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

  const remote = Boolean(row.url);
  const hasLaunchLine = remote || Boolean(row.command?.trim());

  // Auth type is a statement about the published record, not a guess.
  let authType = "No verified launch line";
  let authDescription =
    "The publisher has not published a verified command or endpoint for this row, so LiteSPM cannot install it.";
  if (remote) {
    authType = "Remote endpoint";
    authDescription = `The entry names ${row.url} over ${row.transport || "streamable-http"}. Authorization headers, if any, are configured in the agent host; LiteSPM does not publish or copy a credential.`;
  } else if (row.command?.trim()) {
    authType = "Local process (stdio)";
    authDescription = `The published runtime launches ${row.command} over standard input/output. LiteSPM writes the command the publisher declared; it does not invent a fallback.`;
  }

  const serverKey = norm(stripNamespace(row.name)) || "mcp-server";

  // Only hosts that can express this row are shown. A remote row is offered
  // only to the registry's remote-capable hosts; a local row only when the
  // publisher actually published a command. For remote rows the exact entry
  // spelling is host-specific and is generated by the adapter at install time,
  // so the page says that instead of printing a guessed shape.
  const hostConfigs: HostConfigItem[] = [];
  if (hasLaunchLine) {
    for (const host of HOSTS) {
      if (remote && !hostSupportsRemote(host, row.transport)) continue;
      const snippet = remote
        ? `LiteSPM generates the exact ${host.name} remote entry at install time. The host adapter owns the URL/transport spelling; this page does not guess it.`
        : mcpLocalSnippet(host, row, serverKey, envVars);
      if (!snippet) continue;
      hostConfigs.push({
        id: host.id,
        name: host.name,
        format: host.kind === "toml" ? "toml" : "json",
        configPath: host.userPath || "resolved by LiteSPM at install time",
        snippet,
      });
    }
  }

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

  // Extract TRIGGER rules only when the published text actually carries them.
  // An empty list is an honest answer; inventing a trigger changes when an
  // agent loads the skill.
  const triggerRules: string[] = [];
  const triggerMatch = text.match(/TRIGGER\s*(?:—|-|:)?\s*([\s\S]*?)(?:SKIP|$)/i);
  if (triggerMatch && triggerMatch[1]) {
    const rawTriggers = triggerMatch[1].trim();
    const lines = rawTriggers
      .split(/(?:;|\n\s*[-*]\s*|\.\s+)/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5);
    triggerRules.push(...lines);
  }

  // Extract SKIP rules only when published.
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

  // Version fallback: say what is published, never a guessed release.
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
      versionFallback = "version not published";
    }
  }

  return {
    versionFallback,
    commitHash,
    instructions: readme || summary,
    triggerRules,
    skipRules,
    // The catalog does not publish a file inventory. The old page invented
    // references/ and scripts/ directories for every skill; render no tree
    // rather than a fictional one.
    fileTree: [],
    security: {
      scripts: "unknown",
      network: "unknown",
      credentials: "unknown",
      summary:
        "LiteSPM has not inspected this skill's files. The catalog publishes declarative metadata, not a security audit; review the source before use.",
    },
  };
}

export function buildPluginSpec(row: Listing): PluginDetailSpec {
  const isPinned = row.artifact?.pinned === true;
  const commit =
    row.artifact?.sha && /^[0-9a-f]{40}$/i.test(row.artifact.sha)
      ? row.artifact.sha
      : row.artifact?.ref && /^[0-9a-f]{40}$/i.test(row.artifact.ref)
        ? row.artifact.ref
        : "";

  let pinningStatus: PluginDetailSpec["pinningStatus"] = "unpinned";
  let pinningBadge = "Unpinned / Local Source";
  let pinningExplanation =
    "LiteSPM cannot install this plugin: only a commit-pinned git tree can be fetched and verified. A branch, tag, or local directory is refused.";

  if (isPinned && commit) {
    // The CLI fetches the 40-hex commit, not a tag. Show the commit even when
    // the publisher also names a release tag; a tag is a label, the commit is
    // the immutable object that was verified.
    pinningStatus = "commit";
    pinningBadge = `Commit Pinned (${commit.slice(0, 7)})`;
    pinningExplanation =
      "Pinned to an exact Git commit SHA. The tree is fetched at that commit and verified before manifest installation.";
  }

  const isBlocked = pinningStatus === "unpinned";
  const remediation: PluginDetailSpec["remediation"] = {
    isBlocked,
    reason: isBlocked
      ? "The publisher has published this plugin with an unpinned git branch or local path. LiteSPM refuses it rather than installing content that can change under the approval."
      : "Plugin source is pinned and can be verified.",
    publisherAction:
      "Publisher must publish an immutable Git tag (e.g. `git tag v1.0.0 && git push origin v1.0.0`) or pin the repository manifest to a full commit SHA.",
    // There is no CLI bypass for an unpinned source. --allow-partial only
    // acknowledges skipped component classes after a pinned tree is read.
    userCliBypass: "",
  };

  return {
    pinningStatus,
    pinningBadge,
    pinningExplanation,
    // The catalog publishes the artifact locator, not the plugin's manifest.
    // The manifest is read from the pinned tree at install time, so this page
    // must not invent servers, skills, or host extras.
    manifest: {
      mcpServers: [],
      skills: [],
      hostExtras: [],
    },
    remediation,
  };
}
