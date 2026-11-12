/**
 * Allowlisted Ask AI tools.
 *
 * The orchestrator selects when a tool is relevant; the model may propose
 * only the matching function from the request's narrow schema. Arguments are
 * validated here; no shell, filesystem, arbitrary URL, install or config-write
 * tool is exposed to the public chat endpoint.
 */
import { HOSTS, HOST_ALIASES, SKILL_TARGETS, resolveHost } from "./hosts";
import { retrieveAssistant } from "./assistant-retrieval";
import { retrieveKnowledge } from "./assistant-knowledge";
import { namesCapabilityToInstall } from "./assistant-orchestrator";
import type { LlmFunctionTool } from "../llm/types";

export type AssistantToolName =
  | "catalog.search"
  | "knowledge.search"
  | "hosts.list"
  | "hosts.inspect";

export interface AssistantToolResult {
  name: AssistantToolName;
  ok: boolean;
  data: unknown;
}

function boundedString(value: unknown, max = 240): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
  return clean.length > 0 && clean.length <= max ? clean : null;
}

export async function executeAssistantTool(
  name: AssistantToolName,
  args: Record<string, unknown>,
): Promise<AssistantToolResult> {
  if (name === "catalog.search") {
    const query = boundedString(args.query);
    if (!query) return { name, ok: false, data: { error: "A query of 1–240 characters is required." } };
    const result = await retrieveAssistant(query);
    return {
      name, ok: true,
      data: { total: result.hits.length, queries: result.queries, intent: result.intent, hits: result.hits },
    };
  }

  if (name === "knowledge.search") {
    const query = boundedString(args.query);
    if (!query) return { name, ok: false, data: { error: "A query of 1–240 characters is required." } };
    const hits = await retrieveKnowledge(query, 7);
    return { name, ok: true, data: { total: hits.length, hits } };
  }

  if (name === "hosts.list") {
    return {
      name, ok: true,
      data: {
        mcpHosts: HOSTS.map((host) => ({
          id: host.id,
          name: host.name,
          format: host.kind,
          keyPath: host.keyPath,
          shape: host.shape,
          userPath: host.userPath,
          projectOnly: !!host.projectOnly,
          projectScope: !!host.projectScope,
          projectPath: host.projectPath ?? null,
          remote: !!host.remote,
          remoteTransports: host.remoteTransports ?? [],
          supportedOS: host.supportedOS ?? ["win", "mac", "linux"],
          docsUrl: host.docsUrl ?? null,
        })),
        skillTargets: SKILL_TARGETS.map((target) => ({ id: target.id, name: target.displayName })),
        remoteSummary: {
          supportedCount: HOSTS.filter((host) => !!host.remote).length,
          localOnlyCount: HOSTS.filter((host) => !host.remote).length,
          supportedHostIds: HOSTS.filter((host) => !!host.remote).map((host) => host.id),
          localOnlyHostIds: HOSTS.filter((host) => !host.remote).map((host) => host.id),
        },
        counts: { mcpHosts: HOSTS.length, skillTargets: SKILL_TARGETS.length },
      },
    };
  }

  if (name === "hosts.inspect") {
    const hostId = boundedString(args.hostId, 100);
    if (!hostId) return { name, ok: false, data: { error: "A hostId is required." } };
    const host = resolveHost(hostId);
    if (!host) return { name, ok: false, data: { error: "That host is not in the supported registry." } };
    return {
      name, ok: true,
      data: {
        id: host.id, name: host.name, format: host.kind, keyPath: host.keyPath,
        shape: host.shape, userPath: host.userPath, projectOnly: !!host.projectOnly,
        projectScope: !!host.projectScope, remote: !!host.remote,
        remoteTransports: host.remoteTransports ?? [],
        supportedOS: host.supportedOS ?? ["win", "mac", "linux"],
        docsUrl: host.docsUrl ?? null,
      },
    };
  }

  return { name, ok: false, data: { error: "Tool not allowed." } };
}

function mentionedHost(question: string) {
  const normalized = question.toLowerCase().replace(/\s+/g, " ").trim();
  const aliases = Object.entries(HOST_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, id] of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(normalized)) {
      const host = resolveHost(id);
      if (host) return host;
    }
  }
  return HOSTS.find((host) => normalized.includes(host.id.toLowerCase()) || normalized.includes(host.name.toLowerCase()));
}

export function isHostSetupQuestion(question: string): boolean {
  const asksSetup = /\b(set ?up|connect|register|configure|configuration|install|integrate|add)\b/i.test(question);
  if (!asksSetup) return false;
  // "Install a postgres MCP server into Claude Code" names a capability to
  // install. It is a catalog question; the bridge-setup shortcut explains the
  // opposite ("this does not install a separate MCP package").
  if (namesCapabilityToInstall(question)) return false;
  return /\b(bridge|litespm|lite spm|mcp|agent|host|coding tool)\b/i.test(question) || !!mentionedHost(question);
}

export function isRemoteHostQuestion(question: string): boolean {
  return /\b(remote|url|http|https|sse|streamable|transport)\b/i.test(question) &&
    /\b(hosts?|agents?|mcp)\b/i.test(question);
}

export function assistantToolForQuestion(question: string): { name: AssistantToolName; args: Record<string, unknown> } | null {
  const normalized = question.toLowerCase().replace(/\s+/g, " ").trim();
  // A named capability to install is answered from the catalog, never from the
  // host registry, even when an agent host is mentioned.
  if (namesCapabilityToInstall(normalized) && !isRemoteHostQuestion(normalized)) return null;
  const host = mentionedHost(normalized);
  const asksForHostInventory = /\b(list|show|which|what|all|supported|support|compatible|remote|http|sse|transport|url)\b/i.test(normalized);
  const hostInventoryQuestion = asksForHostInventory &&
    (/\b(hosts|agents)\b/i.test(normalized) || (!host && /\b(host|agent)\b/i.test(normalized)));
  if (hostInventoryQuestion) return { name: "hosts.list", args: {} };

  if (host && (isHostSetupQuestion(normalized) || /\b(host|agent|configuration|config|compatible|mcp|transport|remote)\b/i.test(normalized))) {
    return { name: "hosts.inspect", args: { hostId: host.id } };
  }
  return null;
}

export function assistantToolNames(): AssistantToolName[] {
  return ["catalog.search", "knowledge.search", "hosts.list", "hosts.inspect"];
}


/** Function schemas exposed to tool-capable OpenAI-compatible chat models. */
export const ASSISTANT_FUNCTION_TOOLS: LlmFunctionTool[] = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: "Search LiteSPM's live MCP server, skill and plugin catalog. Use for discovery and recommendations.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", minLength: 1, maxLength: 240 } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_documentation",
      description: "Search LiteSPM's product, architecture, API, security and usage documentation.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", minLength: 1, maxLength: 240 } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_supported_hosts",
      description: "List the supported MCP agent hosts and skill targets.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_host",
      description: "Inspect one supported agent host's configuration format, config path and transport capabilities.",
      parameters: {
        type: "object",
        properties: { hostId: { type: "string", minLength: 1, maxLength: 100 } },
        required: ["hostId"],
        additionalProperties: false,
      },
    },
  },
];

export async function executeAssistantFunction(
  name: string,
  args: Record<string, unknown>,
): Promise<AssistantToolResult> {
  switch (name) {
    case "search_catalog":
      return executeAssistantTool("catalog.search", args);
    case "search_documentation":
      return executeAssistantTool("knowledge.search", args);
    case "list_supported_hosts":
      return executeAssistantTool("hosts.list", args);
    case "inspect_host":
      return executeAssistantTool("hosts.inspect", args);
    default:
      return { name: "hosts.list", ok: false, data: { error: "Function is not in the allowlist." } };
  }
}
