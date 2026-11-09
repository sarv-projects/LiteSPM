import type { KnowledgeHit } from "./assistant-knowledge";
import type { AssistantToolResult } from "./assistant-tools";

const fence = String.fromCharCode(96).repeat(3);

export function buildHostSetupAnswer(
  toolResult: AssistantToolResult | null,
  hits: KnowledgeHit[],
): string | null {
  if (!toolResult?.ok || toolResult.name !== "hosts.inspect") return null;
  const host = toolResult.data as {
    id: string;
    name: string;
    format: string;
    keyPath: string;
    userPath: string;
    projectScope: boolean;
    projectPath?: string | null;
  };
  if (!host?.id || !host.name || !host.userPath || !host.keyPath) return null;

  const marker = (predicate: (hit: KnowledgeHit) => boolean) => {
    const index = hits.findIndex(predicate);
    return index >= 0 ? "[S" + (index + 1) + "]" : "";
  };
  const commandCitation =
    marker((hit) => hit.source === "npm/README.md" && /Commands/i.test(hit.section)) ||
    marker((hit) => hit.source === "README.md");
  const hostCitation = marker(
    (hit) => hit.source === "README.md" && /Works with your agent/i.test(hit.section),
  );
  if (!commandCitation) return null;

  const lines = [
    "To register LiteSPM's MCP bridge with **" + host.name + "**, run:",
    "",
    fence + "bash",
    "litespm host setup " + host.id,
    fence,
    "",
    "The equivalent setup entry point is litespm setup --agent " + host.id +
      ". Both use the same host setup path. " + commandCitation,
    "",
    "This registers LiteSPM's bridge in the agent configuration; it does not install a separate third-party MCP package.",
    "",
    "**Host adapter details**",
    "- Config format: " + host.format.toUpperCase(),
    "- MCP config key: " + host.keyPath,
    "- Registry default home-relative config path: " + host.userPath,
    "- Project-scoped setup: " + (host.projectScope ? "supported" : "not listed as supported"),
    "The CLI resolves the actual config file for the current machine; the path above is the registry default, not a file you need to create manually.",
  ];
  if (host.projectPath) lines.push("- Project config path: " + host.projectPath);
  if (hostCitation) {
    lines.push("", "LiteSPM documents the supported host adapters and setup workflow here. " + hostCitation);
  }
  lines.push(
    "",
    "To verify whether the bridge is registered, run:",
    "",
    fence + "bash",
    "litespm host detect",
    fence,
  );
  return lines.join("\n");
}

export function buildRemoteHostAnswer(toolResult: AssistantToolResult | null): string | null {
  if (!toolResult?.ok || toolResult.name !== "hosts.list") return null;
  const data = toolResult.data as {
    mcpHosts: Array<{ id: string; name: string; remote: boolean; remoteTransports: string[] }>;
    remoteSummary: { supportedCount: number; localOnlyCount: number };
  };
  if (!Array.isArray(data?.mcpHosts) || !data.remoteSummary) return null;

  const remote = data.mcpHosts.filter((host) => host.remote);
  const localOnly = data.mcpHosts.filter((host) => !host.remote);
  const groups = new Map<string, string[]>();
  for (const host of remote) {
    const transport = host.remoteTransports.length
      ? host.remoteTransports.join(" + ")
      : "Registry default HTTP";
    groups.set(transport, [...(groups.get(transport) ?? []), host.name]);
  }

  const lines = [
    "According to LiteSPM's host registry, **" + data.remoteSummary.supportedCount +
      " of " + data.mcpHosts.length + " supported MCP hosts** accept remote URL-based MCP entries. **" +
      data.remoteSummary.localOnlyCount + " are local-only.**",
    "",
    "### Hosts that accept remote MCP URLs",
  ];
  for (const [transport, names] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push("**" + transport + ":** " + names.join(", "));
  }
  if (localOnly.length) {
    lines.push("", "**Local-only:** " + localOnly.map((host) => host.name).join(", "));
  }
  lines.push(
    "",
    "These transport labels describe the remote MCP entry formats each host adapter can write. They do not mean every MCP server supports every listed transport.",
  );
  return lines.join("\n");
}
