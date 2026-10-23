// Canonical agent-host integration model for the Market UI.
//
// The host list is GENERATED from the compiled-in Go registry, not hand-written.
// Regenerate with:
//
//     go run scripts/gen_hosts_ts.go
//
// It used to be a hand-maintained array of six hosts while the registry had
// grown to fifty, so the public site understated its own capability by 8x. A
// generated file cannot drift, and `npm run type-check` plus the catalog build
// both read the same source.
//
// LiteSPM registers ONE `litespm` bridge entry per host. Individual capabilities
// are resolved by the daemon at runtime, so per-listing snippets are identical
// regardless of the capability being viewed.

import generated from "../data/hosts.json";
import generatedSkillTargets from "../data/skill-targets.json";
import { availabilityOf } from "./availability";
import type { Listing } from "./telemetry";

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
  /**
   * Unix-resolved user-scope config path, with the home directory shown as "~".
   * Windows paths are intentionally absent: the registry refuses to guess them
   * (see ARCH/30), so the UI does not either.
   */
  userPath: string;
  /** True when the host only documents repo-local configuration. */
  projectOnly?: boolean;
  /** The upstream source this adapter was verified against. */
  docsUrl?: string;
  /** True when the adapter is data-driven rather than hand-written. */
  generic: boolean;
  /** True when the MCP key is nested below another object. */
  nested: boolean;
  /**
   * True when `install --scope project` can write this host, and the file it
   * writes, relative to the project root. Both are emitted from the Go
   * adapters (host.SupportsProjectScope / host.ProjectConfigPathFor), so this
   * file cannot advertise a project config the binary refuses.
   */
  projectScope?: boolean;
  projectPath?: string;
  /**
   * True when the registry has a verified remote (URL) MCP entry spelling for
   * this host (`host.RemoteEntrySpecFor`); absent means a remote install there
   * is refused fail-closed. Forty-six of the fifty rows carry it (the four
   * that do not publish no such object). It was declared on `GeneratedHost`
   * below and then dropped by the mapper, so no surface could read it;
   * `/compare` needs it and carries it through instead.
   */
  remote?: boolean;
  /**
   * Which transports that URL entry can express — `streamable-http` and/or
   * `sse` — straight from the registry's `RemoteEntrySpec.Transports`, which
   * is the authority the binary writes against.
   *
   * The site used to keep its own hand-written copy of this set in
   * `lib/installFeasibility.ts`, and it fell behind the registry from eight
   * rows to forty-six, so a reader was told the transport was unknown for
   * thirty-eight agents the binary would install into. The generator emits it
   * now, so there is one table.
   */
  remoteTransports?: readonly string[];
}

/** Shape of one row in the generated web/data/hosts.json. */
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
  /** True when the registry has a verified remote (URL) MCP entry spelling
   *  for this host (host.RemoteEntrySpecFor); absent means a remote install
   *  there is refused fail-closed. Deliberately not part of HostShape: remote
   *  is an axis beside the stdio entry shape, not a fifth shape. */
  remote?: boolean;
  /**
   * True when `install --scope project` can write this host, and the file it
   * writes, relative to the project root. Both are emitted from the Go
   * adapters (host.SupportsProjectScope / host.ProjectConfigPathFor), so this
   * file cannot advertise a project config the binary refuses.
   */
  projectScope?: boolean;
  projectPath?: string;
  /** Transports this host documents for a URL entry (streamable-http, sse). */
  remoteTransports?: string[];
}

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
  // Cline moved the file out of VS Code's globalStorage into the shared
  // ~/.cline/data/settings path every current client reads (see
  // internal/host/cline.go); the previous win/mac overrides pointed at a
  // location current Cline only reads once, as a legacy migration.
  cline: { win: "%USERPROFILE%\\.cline\\data\\settings\\cline_mcp_settings.json" },
  "pi-agent": { win: "%USERPROFILE%\\.pi\\agent\\mcp.json" },
  "grok-build": { win: "%USERPROFILE%\\.grok\\config.toml" },
};

export const HOSTS: HostAdapter[] = (generated as GeneratedHost[]).map((h) => {
  // keyPath and shape are emitted by scripts/gen_hosts_ts.go for every
  // adapter — the six hand-written ones included — from the same registry the
  // binary writes with, so this file no longer restates them. The fallbacks
  // below only cover a host the registry declares no layout for.
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

/**
 * Skill install targets, generated from internal/skills/agents.go. A different
 * registry from bridge adapters: these are hosts with a skills directory we can
 * write a SKILL.md into, which is a smaller and differently-shaped set than
 * "hosts whose MCP config we can edit".
 *
 * `hasGlobal` ships in the generated file and was declared nowhere: an agent
 * with no user-level skills directory (`internal/skills/agents.go` leaves
 * `GlobalDir` empty) can only take project-scope skills. Two of the 81 rows are
 * that shape, and `/compare` states it.
 */
export const SKILL_TARGETS: Array<{
  id: string;
  displayName: string;
  universal?: boolean;
  hasGlobal: boolean;
}> = generatedSkillTargets as Array<{
  id: string;
  displayName: string;
  universal?: boolean;
  hasGlobal: boolean;
}>;

/**
 * Which agent hosts a capability can be installed into.
 *
 * This is a property of the KIND, not of the individual row:
 *
 *   mcp     local rows can use every adapter; URL rows need a documented
 *           spelling for the row's exact transport.
 *   skill   every target with a documented user-scope skills directory.
 *   plugin  publisher-declared, because a bundle's reach genuinely varies.
 *
 * The builder previously stamped the same seven host names onto all 4,079 MCP
 * servers, which made the public site report nine hosts while the binary shipped
 * fifty. Deriving it here means the claim cannot drift from the registries.
 */
/**
 * Hosts whose adapter has a verified remote (URL) MCP entry spelling.
 *
 * The registry ships one only where the adapter was checked against the
 * vendor's own documentation. On every other host the binary refuses a remote
 * install fail-closed, so these are the only hosts a remote row can honestly
 * be said to work with.
 */
export const REMOTE_HOSTS = HOSTS.filter((h) => h.remote === true);

/**
 * True when an MCP row reaches its server over a URL rather than launching a
 * local process, which is what decides whether a host needs a remote entry
 * spelling to be configured for it.
 *
 * A row that states no transport is not remote: it has no launch line either,
 * which is why such a row is discovery-only everywhere (see `availabilityOf`).
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
 * Three different claims wear this one list, and they are not the same claim:
 *
 *   - a **plugin** row carries the publisher's own declared hosts. That is data
 *     about the plugin, printed as "Publisher-declared", so it is returned as
 *     published even though LiteSPM will not install a plugin yet.
 *   - a **skill** row and a **local MCP** row are derived from the entry's kind:
 *     LiteSPM can write any adapter's config, or any skills directory. That is a
 *     claim about LiteSPM, so `availabilityOf` gates it — a row the binary
 *     refuses to install is listed for no host at all.
 *   - a **remote MCP** row needs a host with a verified URL spelling, so it is
 *     only hosts whose `remoteTransports` include the row's exact transport;
 *     the other adapters refuse the install fail-closed, and a capable remote
 *     adapter may still reject a different transport.
 */
export function hostsFor(item: {
  kind: Listing["kind"];
  compatibleHosts?: string[];
  transport?: string | null;
  url?: string | null;
  installability?: Listing["installability"];
}): string[] {
  // A plugin's list is the publisher's own declaration, and every surface that
  // prints it says so ("Publisher-declared"). That is a statement about the
  // plugin, not about LiteSPM's ability to install it, so the install gate does
  // not apply — the entry page says "Not installable" separately, and dropping
  // the list here would delete real publisher data.
  if (item.kind === "plugin") return item.compatibleHosts || [];

  // An MCP row and a skill are different: their host list is derived by LiteSPM
  // from the entry's kind, so it *is* an install claim. `availabilityOf` is the
  // gate the install panel, the try-prompts, the ranking and the pre-rendered
  // entry selection already use; without it every discovery-only row — 23,018
  // MCP and 19,556 skill rows — claimed every adapter while the page directly
  // above the list said "Install unavailable".
  if (!availabilityOf(item).installable) return [];

  if (item.kind === "mcp") {
    // A transport without a published endpoint is registered from its local
    // launch command. For a URL entry, only hosts whose registry explicitly
    // accepts this transport can take the config LiteSPM writes.
    if (isRemoteTransport(item.transport) && item.url) {
      const transport = registryTransport(item.transport);
      return HOSTS.filter((host) => host.remote === true && host.remoteTransports?.includes(transport))
        .map((host) => host.name);
    }
    return HOSTS.map((host) => host.name);
  }
  // The website's installer defaults to user scope. Targets without a global
  // skills directory require an explicit project-scope install and shouldn't
  // be included in this default compatibility list.
  return SKILL_TARGETS.filter((target) => target.hasGlobal).map((target) => target.displayName);
}

/**
 * The catalog names hosts as its publishers wrote them ("Codex"), while the
 * adapter table uses display names ("OpenAI Codex"). Aliases are what let a
 * "managed" badge be attached to the right row instead of being silently
 * dropped for want of an exact string match. Built from the generated table so
 * every registered host is resolvable without a hand-kept list.
 *
 * Exported because `lib/hostIdentity.ts` uses this same table as the join
 * between the two registries: the skills registry's "Pi"/"Grok" rows are the
 * reference installer's spellings of the adapters these aliases already name.
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
  // Publisher spellings that differ from both the id and the display name.
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
    // canonical rows (`internal/host/registry.go` maps "pi" → PiAgentAdapter
    // and "grok" → GrokBuildAdapter), and `internal/skills/agents.go` records
    // them as the reference installer's spellings of the same directories.
    // The catalog carries them as skill-target strings ("Pi", "Grok"), so
    // without this they read as hosts no adapter manages — which is not true.
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
 * `{ amp: { mcpServers: v } }`. Hosts genuinely differ here (Amp nests under
 * `amp`, Crush reads `mcp` at the root), so the path comes from the registry
 * rather than being assumed.
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
export function bridgeSnippet(host: HostAdapter, binary = "litespm", os: PlatformOS = "linux"): string {
  const path = hostPath(host, os);
  const keyPath = host.keyPath || "mcpServers";

  if (host.kind === "toml") {
    const table = keyPath === "mcp_servers" ? "mcp_servers.litespm" : `${keyPath}.litespm`;
    return `# ${path}\n[${table}]\ncommand = "${binary}"\nargs = ["bridge", "stdio", "--host", "${host.id}"]\n`;
  }

  const body = nest(keyPath, { litespm: bridgeEntry(host, binary) });
  return `# ${path}\n${JSON.stringify(body, null, 2)}`;
}
