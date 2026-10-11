// Hand-written notes for the agents the registry describes only by plumbing.
//
// `data/hosts.json` is generated from the Go adapter registry, so it knows a
// host's config format, key path and paths — facts the binary acts on. It knows
// nothing about what the agent IS, because that is not a fact this repository
// can derive: it is a claim about somebody else's product.
//
// So this file holds the human half, and it holds it with provenance. Every
// entry names where its description was read, and an agent with no entry here
// gets no invented prose — the agent page simply shows the registry facts and
// links the configuration documentation the adapter was verified against.
//
// Nothing here may state a capability, an OS, a price or a compatibility the
// cited source does not say. That is the same rule the agent atlas on the
// landing page follows.

export interface HostNote {
  /** One line, verb first: what the agent is for, in plain words. */
  summary: string;
  /** How the agent is run, the way a person would say it. */
  interface: string;
  /** The agent's own site, distinct from the MCP configuration docs. */
  website: string;
  /** Where the description above was read, so a reviewer can check it. */
  source: string;
}

export const HOST_NOTES: Record<string, HostNote> = {
  "claude-code": {
    summary:
      "Anthropic's coding agent. It runs in your terminal, reads and writes your repository, and runs the shell commands you approve.",
    interface: "Terminal CLI",
    website: "https://code.claude.com",
    source: "https://code.claude.com/docs/en/mcp",
  },
  codex: {
    summary:
      "OpenAI's coding agent for the terminal. It plans changes, edits files and runs commands in a sandbox it controls.",
    interface: "Terminal CLI",
    website: "https://developers.openai.com/codex",
    source: "https://learn.chatgpt.com/docs/extend/mcp",
  },
  opencode: {
    summary:
      "An open-source coding agent that runs in your terminal, with its own editor surface and support for many model providers.",
    interface: "Terminal CLI",
    website: "https://opencode.ai",
    source: "https://opencode.ai/v2/docs/mcp-servers",
  },
  "grok-build": {
    summary:
      "xAI's coding agent. It works in your terminal against a repository and can be extended with MCP servers.",
    interface: "Terminal CLI",
    website: "https://x.ai",
    source: "https://docs.x.ai/build/features/mcp-servers",
  },
  "pi-agent": {
    summary:
      "A deliberately small terminal coding agent by Mario Zechner. It is scriptable, extensible with TypeScript, and keeps its configuration in plain files.",
    interface: "Terminal CLI",
    website: "https://github.com/badlogic/pi-mono",
    source: "https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md",
  },
  cline: {
    summary:
      "An agent that lives inside VS Code. It edits your working copy, runs commands and can drive a browser while you watch.",
    interface: "VS Code extension",
    website: "https://cline.bot",
    source: "https://docs.cline.bot/mcp/mcp-overview",
  },
};

/** The note for a host, or undefined when this repository has none — in which
 *  case the page shows registry facts only, and says so. */
export function hostNote(id: string): HostNote | undefined {
  return HOST_NOTES[id];
}
