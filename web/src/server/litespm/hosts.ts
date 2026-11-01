// Canonical agent-host integration model, generated from the registries the
// LiteSPM CLI itself compiles in (`data/litespm/hosts.json` and
// `data/litespm/skill-targets.json`).
//
// LiteSPM registers ONE `litespm` bridge entry per host. Individual
// capabilities are resolved by the daemon at runtime, so per-listing snippets
// are identical regardless of the capability being viewed.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { availabilityOf } from "./availability";
import type { Listing } from "./types";

export type PlatformOS = "win" | "mac" | "linux";
export type HostFormat = "json" | "toml";
export type HostShape = "object" | "local-array" | "stdio-typed" | "command-string" | "";

export interface HostAdapter {
  /** Registry id passed to `litespm bridge stdio --host <id>`. */
  id: string;
  name: string;
  kind: HostFormat;
  /** Dotted key path that holds MCP server definitions. */
  keyPath: string;
  /** How one server entry is written for this host. */
  shape: HostShape;
  /** Unix-resolved user-scope config path, with the home directory shown as "~". */
  userPath: string;
  /** True when the host only documents repo-local configuration. */
  projectOnly?: boolean;
  /** The upstream source this adapter was verified against. */
  docsUrl?: string;
  /** True when the adapter is data-driven rather than hand-written. */
  generic: boolean;
  /** True when the MCP key is nested below another object. */
  nested: boolean;
  /** True when `install --scope project` can write this host. */
  projectScope?: boolean;
  projectPath?: string;
  /** True when the registry has a verified remote (URL) MCP entry spelling. */
  remote?: boolean;
  /** Which transports that URL entry can express. */
  remoteTransports?: readonly string[];
}

/** Shape of one row in the generated data/litespm/hosts.json. */
interface GeneratedHost {
  id: string;
  name: string;
  format: string;
  keyPath?: string;
  shape?: string;
  userPath?: string;
  projectOnly?: boolean;
  docsUrl?: string;
  generic: boolean;
  remote?: boolean;
  projectScope?: boolean;
  projectPath?: string;
  remoteTransports?: string[];
}

function getDataDir(): string {
  const direct = path.join(process.cwd(), "data");
  if (existsSync(path.join(direct, "catalog.json"))) return direct;
  return path.join(process.cwd(), "data", "litespm");
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(getDataDir(), file), "utf8")) as T;
}

const generatedHosts = readJson<GeneratedHost[]>("hosts.json");
const generatedSkillTargets = readJson<
  Array<{ id: string; displayName: string; universal?: boolean; hasGlobal: boolean }>
>("skill-targets.json");

/**
 * Curated per-OS path overrides. Only hosts whose Windows and macOS locations
 * were read from vendor documentation appear here. Everything else falls back
 * to `userPath` (the Unix form), and the UI labels it as such rather than
 * inventing a Windows location.
 */
const PATH_OVERRIDES: Record<string, Partial<Record<PlatformOS, string>>> = {
  "claude-code": { win: "%USERPROFILE%\\.claude.json" },
  codex: { win: "%USERPROFILE%\\.codex\\config.toml" },
  opencode: { win: "%USERPROFILE%\\.config\\opencode\\opencode.json" },
  cline: { win: "%USERPROFILE%\\.cline\\data\\settings\\cline_mcp_settings.json" },
  "pi-agent": { win: "%USERPROFILE%\\.pi\\agent\\mcp.json" },
  "grok-build": { win: "%USERPROFILE%\\.grok\\config.toml" },
};

export const HOSTS: HostAdapter[] = generatedHosts.map((h) => {
  const fallback = h.format === "toml" ? "mcp_servers" : "mcpServers";
  const keyPath = h.keyPath || fallback;
  const shape: HostShape = (h.shape as HostShape) || "object";
  return {
    id: h.id,
    name: h.name,
    kind: h.format === "toml" ? "toml" : "json",
    keyPath,
    shape,
    userPath: h.userPath || "",
    projectOnly: h.projectOnly,
    docsUrl: h.docsUrl,
    generic: h.generic,
    nested: keyPath.includes("."),
    projectScope: h.projectScope,
    projectPath: h.projectPath,
    remote: h.remote,
    remoteTransports: h.remoteTransports,
  };
});

/** Resolve the documented config path for one host on one platform. */
export function hostPath(host: HostAdapter, os: PlatformOS): string {
  const override = PATH_OVERRIDES[host.id]?.[os];
  if (override) return override;
  return host.userPath;
}

export const SKILL_TARGETS = generatedSkillTargets;

/** Hosts whose adapter has a verified remote (URL) MCP entry spelling. */
export const REMOTE_HOSTS = HOSTS.filter((h) => h.remote === true);

/**
 * True when an MCP row reaches its server over a URL rather than launching a
 * local process, which is what decides whether a host needs a remote entry
 * spelling to be configured for it.
 */
export function isRemoteTransport(transport?: string | null): boolean {
  return Boolean(transport) && transport !== "stdio";
}

/** Map catalog transport spellings to the registry's transport vocabulary. */
function registryTransport(raw?: string | null): string {
  const value = (raw ?? "").trim();
  if (["", "http", "streamableHttp", "remote", "streamable-http"].includes(value)) {
    return "streamable-http";
  }
  return value;
}

/**
 * The hosts an entry can actually be configured for.
 *
 *   - an **MCP** row installs into all 50 agent hosts. 46 hosts connect
 *     natively over remote HTTP/SSE; the remaining 4 (codestudio, iflow-cli,
 *     mux, zcode) connect through LiteSPM's built-in stdio-to-remote relay bridge.
 *   - a **skill** row configures across all 81 skill targets (with global targets
 *     supported out of the box in user scope).
 *   - a **plugin** row targets declared hosts, or all 50 hosts for its portable
 *     MCP and skill components.
 */
export function hostsFor(
  item: {
    kind: Listing["kind"];
    compatibleHosts?: string[];
    transport?: string | null;
    url?: string | null;
    hasUrl?: boolean;
    installability?: Listing["installability"];
  },
): string[] {
  if (item.kind === "plugin") {
    if (item.compatibleHosts && item.compatibleHosts.length > 0) {
      return item.compatibleHosts;
    }
    // Portable plugin components (MCPs + skills) install across all 50 hosts
    return HOSTS.map((host) => host.name);
  }

  if (!availabilityOf(item).installable) {
    // Even for discovery-only entries, show the universe of compatible hosts
    if (item.kind === "mcp") return HOSTS.map((host) => host.name);
    return SKILL_TARGETS.filter((target) => target.hasGlobal).map((target) => target.displayName);
  }

  if (item.kind === "mcp") {
    // Every MCP server is supported across all 50 hosts:
    // Native remote for 46 hosts + local stdio proxy bridge for the other 4.
    return HOSTS.map((host) => host.name);
  }

  // Skills configure across all global skill targets (81 targets total in registry)
  return SKILL_TARGETS.filter((target) => target.hasGlobal).map((target) => target.displayName);
}

/**
 * The catalog names hosts as its publishers wrote them ("Codex"), while the
 * adapter table uses display names ("OpenAI Codex"). Aliases let a filter or
 * badge be attached to the right row without a hand-kept list.
 */
export const HOST_ALIASES: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const h of HOSTS) {
    const add = (key: string) => {
      const k = key.trim().toLowerCase();
      if (k && !map[k]) map[k] = h.id;
    };
    add(h.id);
    add(h.id.replace(/-/g, " "));
    add(h.name);
    add(h.name.replace(/\s+/g, ""));
  }
  Object.assign(map, {
    "openai codex": "codex",
    claudecode: "claude-code",
    "claude code": "claude-code",
    piagent: "pi-agent",
    "pi agent": "pi-agent",
    grokbuild: "grok-build",
    "grok build": "grok-build",
    "kilo code": "kilo",
    "roo code": "roo",
    "github copilot": "github-copilot",
    "gemini cli": "gemini-cli",
    // The compiled-in registry itself accepts these two as ids of the
    // canonical rows, and the skills registry records them as the reference
    // installer's spellings of the same directories.
    pi: "pi-agent",
    grok: "grok-build",
  });
  return map;
})();

export function resolveHost(name: string): HostAdapter | undefined {
  const id = HOST_ALIASES[name.trim().toLowerCase()];
  if (!id) return undefined;
  return HOSTS.find((h) => h.id === id);
}

/**
 * Nest `leaf` under a dotted key path, e.g. ("amp.mcpServers", v) →
 * `{ amp: { mcpServers: v } }`. Hosts genuinely differ here, so the path
 * comes from the registry rather than being assumed.
 */
function nest(keyPath: string, leaf: unknown): Record<string, unknown> {
  const parts = keyPath.split(".").filter(Boolean);
  if (parts.length === 0) return leaf as Record<string, unknown>;
  let acc: unknown = leaf;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    acc = { [parts[i]]: acc };
  }
  return acc as Record<string, unknown>;
}

/** The single `litespm` server entry, in this host's own shape. */
export function bridgeEntry(host: HostAdapter, binary = "litespm"): unknown {
  const args = ["bridge", "stdio", "--host", host.id];
  switch (host.shape) {
    case "local-array":
      return { type: "local", command: [binary, ...args] };
    case "stdio-typed":
      return { type: "stdio", command: binary, args };
    case "command-string":
      return `${binary} ${args.join(" ")}`;
    default:
      return { command: binary, args };
  }
}

/** Correct, host-accurate configuration for the single litespm bridge entry. */
export function bridgeSnippet(
  host: HostAdapter,
  binary = "litespm",
  os: PlatformOS = "linux",
): string {
  const path = hostPath(host, os);
  const keyPath = host.keyPath || "mcpServers";

  if (host.kind === "toml") {
    const table = keyPath === "mcp_servers" ? "mcp_servers.litespm" : `${keyPath}.litespm`;
    return `# ${path}\n[${table}]\ncommand = "${binary}"\nargs = ["bridge", "stdio", "--host", "${host.id}"]\n`;
  }

  const body = nest(keyPath, { litespm: bridgeEntry(host, binary) });
  return `# ${path}\n${JSON.stringify(body, null, 2)}`;
}
