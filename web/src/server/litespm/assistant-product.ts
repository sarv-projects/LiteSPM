/**
 * Product-knowledge branch for Ask AI.
 *
 * The catalog retriever cannot answer "what is LiteSPM?" — the word "whats"
 * matched WhatsApp and the model was handed WhatsApp packages. Product
 * questions are not catalog searches, so they get a deterministic answer from
 * this module and never enter BM25. That keeps both the answer and the
 * latency honest.
 */

function normalize(question: string): string {
  return question
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^whats\b/, "what is")
    .replace(/^what s\b/, "what is");
}

const OVERVIEW = `LiteSPM is an open-source package manager for AI agent capabilities.

It indexes **69,376 listings** — 48,418 MCP servers, 20,320 skills and 638 plugins — and installs them into **50 agent hosts** such as Cursor, GitHub Copilot, Cline, Claude Code, OpenAI Codex, Gemini CLI, Zed, OpenCode and Devin.

Every install follows one path: **search, preview the exact config entry, approve, back up, write, and record it in a ledger.** \`litespm restore <installId>\` rolls a config back byte-for-byte, and \`litespm install remove <installId>\` only removes nodes LiteSPM wrote. There is no account and no credentials proxy.

Start with:

\`\`\`bash
npm install -g litespm
litespm
\`\`\`

Other useful commands: \`litespm search <text>\`, \`litespm install <id>\`, \`litespm list\`, \`litespm marketplace\`, and the marketplace prompt inside a connected agent.`;

const COMMANDS = `The main LiteSPM commands are:

\`\`\`bash
npm install -g litespm             # install the CLI
litespm                            # setup + management wizard
litespm search postgres            # search the local catalog
litespm install <id>               # install into detected agents
litespm install <id> --agent claude-code
litespm install remove <installId> # remove one install
litespm list                       # what is installed
litespm inventory --json           # one record per deployment
litespm restore <installId>        # roll a config back
litespm marketplace                # open the browser marketplace
litespm host list                  # every supported agent
litespm skills add <source>        # install SKILL.md skills
litespm skills use <src>@<skill>   # print a prompt, install nothing
litespm doctor                     # check and repair the install
litespm self-update                # replace the binary with a newer release
\`\`\`

Inside a connected host, the prompt is \`/marketplace\` on Claude Code, Codex and Cline, and \`/litespm:marketplace\` on OpenCode (type it, accept the completion, then press Enter). Qwen Code 0.14.4 does not map MCP prompts to slash commands: run \`/mcp\` to confirm the \`litespm\` server and use its 13 tools conversationally.`;

const SECURITY = `LiteSPM is local-first: no account, no telemetry and no credentials proxy. Before writing, it previews the exact entry, saves a backup, and records the change in a ledger. \`litespm restore <installId>\` restores the previous file bytes; \`litespm install remove <installId>\` strips only the nodes LiteSPM wrote and leaves manual edits alone. Skills are reported as **unverified** unless a real audit source exists — LiteSPM does not invent a safety score.`;

const AGENTS = `LiteSPM supports **50 MCP agent hosts** and **81 skill targets**. Examples include Cursor, GitHub Copilot, Cline, Claude Code, OpenAI Codex, Gemini CLI, Zed, OpenCode, Devin, OpenHands and Qwen Code. Run \`litespm host list\` for the full table, or \`litespm host detect\` for the ones on this machine.`;

/**
 * Return a product answer, or null when the question is a catalog search.
 * The patterns deliberately describe LiteSPM itself; "what can LiteSPM install
 * for Postgres" remains a catalog query.
 */
export function productAnswer(question: string): string | null {
  const q = normalize(question);
  if (!/\blite ?spm\b/.test(q)) return null;

  // Catalog questions that happen to mention LiteSPM.
  if (/\b(install|find|search|recommend|suggest|compare)\b/.test(q) && !/\b(how|what is|what does|who|why|is)\b.*\blite ?spm\s+(work|do|free|made|built|safe|open source)\b/.test(q)) {
    if (/\binstall\b.*\b(for|with|that|to)\b/.test(q) || /\b(find|search|recommend|suggest|compare)\b/.test(q)) {
      return null;
    }
  }

  if (/\b(commands?|cli|usage|flags?)\b/.test(q) && /\blite ?spm\b/.test(q)) return COMMANDS;
  if (/\b(security|safe|backup|backups|restore|rollback|ledger|permissions?)\b/.test(q)) return SECURITY;
  if (/\b(agents?|hosts?|supported|support|compatible)\b/.test(q)) return AGENTS;
  if (/\b(is|are)\b.*\b(free|open source|paid|cost|price|license)\b/.test(q)) {
    return "LiteSPM is open source under the Apache-2.0 license and free to use. The catalog, CLI and browser marketplace do not require an account or a paid plan.";
  }
  if (/\b(who|maintainer|maintained|built|made|created|owner)\b/.test(q)) {
    return "LiteSPM is developed in the open at `github.com/sarv-projects/LiteSPM` and published on npm as `litespm`. The repository contains the CLI, the catalog pipeline and the browser marketplace.";
  }
  if (/\b(how|work|works|pipeline|architecture|behind)\b/.test(q)) {
    return `LiteSPM works in four steps:

1. **Discover** — search the local catalog index, or hand the CLI a GitHub repo, URL or local folder.
2. **Preview** — show the exact entry and destination for every selected agent.
3. **Write safely** — save a backup, apply the surgical config merge, and record the change in a ledger.
4. **Undo** — restore the previous bytes or remove only the nodes LiteSPM wrote.

The browser marketplace and the in-agent \`/marketplace\` prompt read the same catalog and the same install path.`;
  }

  return OVERVIEW;
}
