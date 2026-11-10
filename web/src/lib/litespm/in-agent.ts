/**
 * The in-agent marketplace: what `litespm setup` / `litespm host setup <id>`
 * installs into each agent, and how it behaves there.
 *
 * Two classes:
 *  - popup:  an interactive view inside the agent (no model turn). Every popup
 *            renders one view model, `litespm marketplace rows --json`.
 *  - prompt: a command/skill/workflow file; the agent's own model then drives
 *            the LiteSPM MCP tools.
 * And a third, honest one: agents with no extension API that could host either.
 *
 * `evidence` is how far the claim has been checked, and is shown as such - a
 * popup that only loaded is not described as "verified end to end".
 */

export type InAgentKind = "popup" | "prompt" | "none";

export type InAgentEvidence =
  | "verified" // exercised end to end in the named agent version
  | "validated" // contract validated against the named agent version
  | "load-verified" // the agent loads the extension; behaviour not exercised end to end
  | "unverified" // implemented from the host's documentation, not yet run
  | "n/a";

export interface InAgentEntry {
  /** Registry host id when the agent is one of LiteSPM's hosts. */
  hostId?: string;
  agent: string;
  kind: InAgentKind;
  /** What you type or pick inside the agent. */
  invoke: string;
  /** The mechanism LiteSPM installs. */
  mechanism: string;
  evidence: InAgentEvidence;
  /** Version or flag requirement, or the reason there is no command. */
  note?: string;
}

export const IN_AGENT: InAgentEntry[] = [
  // ---- Popups: interactive, no model turn -------------------------------
  {
    hostId: "pi-agent",
    agent: "Pi",
    kind: "popup",
    invoke: "/marketplace",
    mechanism: "Pi extension",
    evidence: "verified",
  },
  {
    hostId: "opencode",
    agent: "OpenCode",
    kind: "popup",
    invoke: "/litespm-marketplace",
    mechanism: "TUI plugin",
    evidence: "verified",
    note: "Verified on OpenCode 2.2.6.",
  },
  {
    hostId: "claude-code",
    agent: "Claude Code",
    kind: "popup",
    invoke: "/litespm-marketplace",
    mechanism: "Mod pane",
    evidence: "validated",
    note: "Needs Claude Code 2.1.287 or newer.",
  },
  {
    hostId: "github-copilot",
    agent: "GitHub Copilot CLI",
    kind: "popup",
    invoke: "/litespm-marketplace",
    mechanism: "Extension",
    evidence: "load-verified",
    note: "Start Copilot CLI with --experimental. The extension is verified to load.",
  },
  {
    hostId: "amp",
    agent: "Amp",
    kind: "popup",
    invoke: "Command palette → “LiteSPM: Marketplace”",
    mechanism: "Command-palette command",
    evidence: "unverified",
    note: "Not yet run against a live Amp.",
  },

  // ---- Prompt commands: the agent's model drives the MCP tools -----------
  { hostId: "gemini-cli", agent: "Gemini CLI", kind: "prompt", invoke: "/litespm-marketplace", mechanism: "Custom command", evidence: "verified" },
  { hostId: "qwen-code", agent: "Qwen Code", kind: "prompt", invoke: "prompt command", mechanism: "Custom command", evidence: "unverified" },
  { hostId: "kiro-cli", agent: "Kiro CLI", kind: "prompt", invoke: "prompt command", mechanism: "Prompt file", evidence: "unverified" },
  { hostId: "cursor", agent: "Cursor", kind: "prompt", invoke: "prompt command", mechanism: "Command file", evidence: "unverified" },
  { hostId: "augment", agent: "Augment", kind: "prompt", invoke: "prompt command", mechanism: "Command file", evidence: "unverified" },
  { hostId: "roo", agent: "Roo Code", kind: "prompt", invoke: "prompt command", mechanism: "Command file", evidence: "unverified" },
  { hostId: "droid", agent: "Factory Droid", kind: "prompt", invoke: "prompt command", mechanism: "Command file", evidence: "unverified" },
  { hostId: "kilo", agent: "Kilo Code", kind: "prompt", invoke: "/litespm-marketplace", mechanism: "Command file", evidence: "unverified" },
  { hostId: "cline", agent: "Cline", kind: "prompt", invoke: "/litespm-marketplace.md", mechanism: "Workflow", evidence: "unverified" },
  { hostId: "grok-build", agent: "Grok Build", kind: "prompt", invoke: "/litespm-marketplace", mechanism: "Skill", evidence: "unverified" },
  { hostId: "codex", agent: "OpenAI Codex CLI", kind: "prompt", invoke: "$litespm-marketplace", mechanism: "Skill", evidence: "unverified" },
  { hostId: "crush", agent: "Crush", kind: "prompt", invoke: "Ctrl+P → user:litespm-marketplace", mechanism: "Skill", evidence: "unverified" },

  // ---- Not possible: no UI extension API ---------------------------------
  { agent: "Cline (VS Code extension)", hostId: "cline", kind: "none", invoke: "—", mechanism: "—", evidence: "n/a", note: "The extension exposes no UI extension API; the workflow above still works." },
  { agent: "Zed agent panel", hostId: "zed", kind: "none", invoke: "—", mechanism: "—", evidence: "n/a", note: "No UI extension API for the agent panel." },
  { agent: "Windsurf", kind: "none", invoke: "—", mechanism: "—", evidence: "n/a", note: "No UI extension API." },
  { agent: "Continue", kind: "none", invoke: "—", mechanism: "—", evidence: "n/a", note: "No UI extension API." },
  { agent: "Aider", kind: "none", invoke: "—", mechanism: "—", evidence: "n/a", note: "No UI extension API." },
  { agent: "Warp", kind: "none", invoke: "—", mechanism: "—", evidence: "n/a", note: "No UI extension API." },
  { agent: "OpenHands", hostId: "openhands", kind: "none", invoke: "—", mechanism: "—", evidence: "n/a", note: "No UI extension API." },
  { agent: "Goose", kind: "none", invoke: "—", mechanism: "—", evidence: "n/a", note: "Recipes only; there is no command or popup surface." },
  { agent: "iFlow CLI", hostId: "iflow-cli", kind: "none", invoke: "—", mechanism: "—", evidence: "n/a", note: "iFlow has shut down." },
];

export const EVIDENCE_LABEL: Record<InAgentEvidence, string> = {
  verified: "Verified",
  validated: "Validated",
  "load-verified": "Loads (behaviour not fully exercised)",
  unverified: "Unverified (written from vendor docs, not yet run)",
  "n/a": "",
};

/** The command entry for one host id, if it gets a popup or a prompt command. */
export function inAgentFor(hostId: string): InAgentEntry | undefined {
  return IN_AGENT.find((entry) => entry.hostId === hostId && entry.kind !== "none");
}

export function inAgentNoneFor(hostId: string): InAgentEntry | undefined {
  return IN_AGENT.find((entry) => entry.hostId === hostId && entry.kind === "none");
}
