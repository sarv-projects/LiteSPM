// Hand-written notes for the agents the registry describes only by plumbing.
//
// `data/hosts.json` is generated from the Go adapter registry, so it knows a
// host's config format, key path and paths — facts the binary acts on. It knows
// nothing about what the agent IS, because that is not a fact this repository
// can derive: it is a claim about somebody else's product.
//
// So this file holds the human half, and it holds it with provenance. Every
// entry names where its description was read, and an agent with no entry here
// gets no invented prose — the agent page shows the registry facts and links
// the configuration documentation the adapter was verified against.
//
// Nothing here may state a capability, an OS, a price or a compatibility the
// cited source does not say. That is the same rule the agent atlas on the
// landing page follows. `capabilities` is the same contract in list form:
// each line was read from `source`, not composed.

export interface HostNote {
  /** What the agent is, verb first, in plain words. */
  summary: string;
  /** How the agent is run, the way a person would say it. */
  interface: string;
  /** The agent's own site, distinct from the MCP configuration docs. */
  website: string;
  /** Where the description and capabilities were read, so a reviewer can check. */
  source: string;
  /** Two or three things the agent does, from its own documentation. */
  capabilities: string[];
}

export const HOST_NOTES: Record<string, HostNote> = {
  "claude-code": {
    summary:
      "Claude Code is a coding agent you run in your terminal. Point it at a project, ask in plain language, and it reads the codebase, edits files, runs commands, and works with your git history.",
    interface: "Terminal CLI (also IDE extensions, desktop app, and web)",
    website: "https://code.claude.com",
    source: "https://code.claude.com/docs/en/overview",
    capabilities: [
      "Reads your codebase, edits files, and runs commands",
      "Works directly with git: stages changes, commits, branches, opens pull requests",
      "Connects to external tools and data via MCP",
    ],
  },
  codex: {
    summary:
      "Codex is OpenAI's coding agent for your terminal. Start it in a project folder, describe the task, and it inspects files, makes edits, runs your local tools, and shows you the result to review.",
    interface: "Terminal CLI",
    website: "https://openai.com/codex/",
    source: "https://developers.openai.com/codex/cli",
    capabilities: [
      "Works against your local repository: inspects files, makes edits, runs tools already on your machine",
      "Code review mode reports prioritised findings without touching your working tree",
      "Runs non-interactively (codex exec) for scripts and CI",
    ],
  },
  opencode: {
    summary:
      "OpenCode is an open source AI coding agent that runs in your terminal. Open it in a project, ask it to explain code or build a feature, and it moves between a plan you approve and edits it makes.",
    interface: "Terminal CLI (also desktop app and IDE extension)",
    website: "https://opencode.ai",
    source: "https://opencode.ai/docs",
    capabilities: [
      "Plan mode proposes how it will implement a feature before it touches files",
      "Runs /init to analyse your project and create an AGENTS.md file",
      "Works with any LLM provider you configure API keys for",
    ],
  },
  "grok-build": {
    summary: "Grok Build is xAI's coding agent that runs in your terminal. Give it a task in a project folder and it works through your code in an interactive TUI, or run it headlessly from a script.",
    interface: "Terminal CLI (interactive TUI, headless, or ACP)",
    website: "https://x.ai/build",
    source: "https://docs.x.ai/build/overview",
    capabilities: [
      "Interactive fullscreen TUI with mouse support",
      "Headless mode (grok -p) for scripts, bots and automation",
      "Loads skills, plugins, hooks and MCP servers; supports custom models",
    ],
  },

  "pi-agent": {
    summary: "Pi is an extensible AI agent that works from your terminal. Give it a goal and a working folder, and it inspects files, runs commands, edits content, and works through multi-step tasks. Use it as is, prompt it to adapt itself to your workflow, or build on it with the SDK.",
    interface: "Terminal CLI",
    website: "https://pi.dev",
    source: "https://pi.dev/docs/latest",
    capabilities: [
      "Inspects files, runs commands and edits content through multi-step tasks",
      "Resume or branch a saved session without losing history",
      "Print mode, JSON event stream and RPC mode for scripted and embedded use",
    ],
  },

  cline: {
    summary:
      "Cline is an open source coding agent that lives in your editor and terminal. It reads and writes files, runs terminal commands, and uses a browser, asking your approval before each action.",
    interface: "VS Code extension (also CLI, desktop app, JetBrains plugin)",
    website: "https://cline.bot",
    source: "https://docs.cline.bot/cline-overview",
    capabilities: [
      "Reads and writes files, runs terminal commands, uses a browser",
      "Every action requires your explicit approval",
      "Runs as a VS Code extension, CLI, desktop app or JetBrains plugin",
    ],
  },
  cursor: {
    summary: "Cursor is a coding agent for building ambitious software. You describe the change you want; it reads your project, edits files, runs shell commands, and lets you inspect the diff before you merge.",
    interface: "AI code editor and coding agent (desktop app, CLI, and web)",
    website: "https://cursor.com",
    source: "https://cursor.com/docs",
    capabilities: [
      "Completes coding tasks, edits code and runs shell commands",
      "Plan Mode creates an implementation plan before writing any code",
      "Review changes: inspect diffs and run checks before you merge",
    ],
  },

  "gemini-cli": {
    summary:
      "Gemini CLI is an open source agent that brings Gemini into your terminal. Ask it about your code or hand it a task, and it edits files, runs shell commands, and pulls in web context as it works.",
    interface: "Terminal CLI",
    website: "https://geminicli.com",
    source: "https://github.com/google-gemini/gemini-cli/blob/main/README.md",
    capabilities: [
      "File operations, shell commands, web fetching and Google Search grounding",
      "MCP support for custom integrations",
      "Runs non-interactively in scripts with structured JSON output",
    ],
  },
  "github-copilot": {
    summary: "GitHub Copilot is an AI coding assistant built into your editor and GitHub itself. It suggests code as you type, answers questions about your code, and can take a task, make the changes, and open a pull request for your review.",
    interface: "Editor extension, terminal CLI, desktop app, and GitHub.com",
    website: "https://github.com/features/copilot",
    source: "https://docs.github.com/en/copilot/get-started/about-github-copilot",
    capabilities: [
      "Inline code suggestions as you type in your IDE",
      "Reviews code and pull requests, with summaries and suggestions",
      "Agent researches a repository, edits files and prepares a pull request",
    ],
  },

  amp: {
    summary: "Amp is a coding agent you run from the terminal, the web, or its desktop and mobile apps. Give it a task and it inspects and changes your code, and can keep working on a remote machine after you close your laptop.",
    interface: "Terminal CLI, web app, and Mac/iPhone/iPad apps",
    website: "https://ampcode.com",
    source: "https://ampcode.com/docs/markdown",
    capabilities: [
      "Runs on your own machine from the CLI, or on ampcode.com with no install",
      "Orbs: a remote machine per thread that keeps working after you close your laptop",
      "Connects to MCP servers; extended with skills and plugins",
    ],
  },

  "aider-desk": {
    summary:
      "AiderDesk is a desktop app built on top of aider, the terminal pair programmer. You work on a codebase in its window while an agent plans and makes changes, and you review every change as a diff before it lands.",
    interface: "Desktop app",
    website: "https://aiderdesk.hotovo.com",
    source: "https://aiderdesk.hotovo.com/docs",
    capabilities: [
      "A diff viewer and tool approvals show every proposed change before it lands",
      "Git worktrees isolate risky work so you can merge back when ready",
      "Agent mode plans and executes tasks with your approval; supports MCP servers",
    ],
  },
  antigravity: {
    summary: "Antigravity is Google's agent-first desktop app for building with AI agents. It is your command center for running several local agents in parallel: group conversations into Projects, work across multiple workspaces, and let long-running workflows run in the background while other agents research, implement and test.",
    interface: "Desktop application (macOS, Windows, Linux, Googlebook)",
    website: "https://antigravity.google",
    source: "https://antigravity.google/product",
    capabilities: [
      "Orchestrates multiple subagents across all your environments",
      "Groups conversations into Projects and works across multiple workspaces",
      "Automates routine tasks with scheduled messages",
    ],
  },
  "antigravity-cli": {
    summary: "Antigravity CLI is the terminal-first surface for working with Antigravity agents. Open a fresh terminal, run the launcher, and drive everything from your keyboard — it carries a minimal resource footprint designed for speed, SSH sessions and remote work.",
    interface: "Terminal user interface (TUI), keyboard-first",
    website: "https://antigravity.google/product/antigravity-cli",
    source: "https://antigravity.google/product/antigravity-cli",
    capabilities: [
      "Edit, orchestrate and build in natural language from the terminal",
      "Runs subagents in parallel so larger tasks get tackled faster",
      "Slash commands reach plugins, MCP, skills and hooks configurations instantly",
    ],
  },
  astrbot: {
    summary: "AstrBot is an open-source, cross-platform AI assistant that runs directly in your chat apps. Deploy it on your own machine, connect it to QQ, Telegram, Discord, Slack and the rest, and it enables automation and smart collaboration with flexible agent orchestration.",
    interface: "Self-hosted server (one-click launcher, desktop app, Docker, uv or pip)",
    website: "https://astrbot.app",
    source: "https://astrbot.app/",
    capabilities: [
      "Native MCP support to expand AI capabilities without hard limits",
      "Isolated agent sandbox runtimes to keep the system safe and stable",
      "1000+ community plugins covering productivity, group operations and integrations",
    ],
  },
  augment: {
    summary: "Auggie CLI puts the power of Augment's agent and context engine in your terminal. Run it as a full-screen interactive session alongside your favorite editor, or hand it a prompt in print mode and let it act in your scripts and automated workflows.",
    interface: "Terminal CLI (interactive TUI plus non-interactive print mode)",
    website: "https://www.augmentcode.com",
    source: "https://docs.augmentcode.com/cli/overview",
    capabilities: [
      "Build features and debug issues with a standalone interactive agent",
      "Get instant feedback, insight and suggestions for your PRs and builds",
      "Triage customer issues and alerts from your observability stack",
    ],
  },
  bob: {
    summary: "IBM Bob is an AI-powered development partner that works right alongside you in your codebase to help you build quality software faster. Explain what you want in natural language and it generates the implementation in context, or spawn focused agents and subagents that run long-running tasks in parallel in the background.",
    interface: "IDE extension (plus Bob Shell for the terminal)",
    website: "https://bob.ibm.com",
    source: "https://bob.ibm.com/",
    capabilities: [
      "Spawns focused agents and subagents that contribute to your code base in parallel",
      "Literate Coding turns a natural-language explanation into the implementation in context",
      "Bob Shell brings the agent to your command line for scripts and CI/CD pipelines",
    ],
  },
  "codearts-agent": {
    summary: "Huawei Cloud CodeArts Agent is a coding agent built for real-world software engineering. It understands project context and coding intent and handles R&D tasks such as requirements analysis, coding, debugging and optimization, and testing — and, through natural language interaction, lets anyone create applications, tools, content and automated workflows.",
    interface: "AI-native IDE, VS Code/JetBrains extensions, and a CLI (TUI and command line)",
    website: "https://www.huaweicloud.com/intl/en-us/product/codearts/ai.html",
    source: "https://support.huaweicloud.com/intl/en-us/productdesc-codeartsagent/codeartsagent_pd_0001.html",
    capabilities: [
      "Converts natural language descriptions into executable tasks through intelligent planning",
      "Generates, analyzes, troubleshoots, tests and verifies your code",
      "Ships as an IDE, VS Code/JetBrains extensions, and a CLI for terminal scenarios",
    ],
  },
  "command-code": {
    summary: "Command Code is a coding agent you run in your terminal. Install it with npm, open a project, and it reads your code, edits files, runs commands, and connects to external services through MCP servers.",
    interface: "Terminal CLI",
    website: "https://commandcode.ai",
    source: "https://commandcode.ai/docs/mcp",
    capabilities: [
      "Connects to MCP servers so you can query databases, drive issue trackers, and call APIs from a session",
      "Ships with planning, skills, hooks, memory, background tasks, and git worktree support",
      "Imports MCP servers, skills, agents, and memory from Claude Code, Codex, Cursor, OpenCode, and Gemini CLI",
    ],
  },
  crush: {
    summary: "Crush is a terminal-based AI coding assistant built by Charm. It connects to your choice of LLM and gives it tools to read, write, and execute code, with LSP-powered context about your project as you work.",
    interface: "Terminal user interface",
    website: "https://charm.land/crush",
    source: "https://charmbracelet-crush.mintlify.app/",
    capabilities: [
      "Switches between Anthropic, OpenAI, Gemini, Bedrock, and more, even mid-session with context preserved",
      "Keeps separate sessions and contexts per project, and pulls in extra context through Language Server Protocol",
      "Extends itself with MCP servers and Agent Skills",
    ],
  },
  devin: {
    summary: "Devin is the AI software engineer that takes work off your team's plate before it lands in the backlog. Hand it a Linear or Jira ticket, an entire feature, a bug report or a chunk of app testing, and it writes, runs and tests the code while you watch in its embedded IDE and take over whenever you like. Reach it by tagging it in a Slack or Teams thread, delegating a task from the web app, or running Devin for Terminal locally for quick fixes and code exploration.",
    interface: "Web application with an embedded IDE, plus Slack, Teams and a terminal CLI",
    website: "https://devin.ai",
    source: "https://docs.devin.ai/get-started/devin-intro.md",
    capabilities: [
      "Tackle many tasks in parallel: Linear/Jira tickets, entire features from scratch, and bug reports",
      "Follow Devin's work in the embedded IDE and take over mid-task",
      "Run Devin for Terminal locally for quick fixes, code exploration, and interactive coding",
    ],
  },
  droid: {
    summary: "Install Droid, delegate your first task, and scale from a single session to an automated SDLC. Delegate a task, review the diff, and merge it from the Factory App or your terminal, or put code review, QA and documentation on autopilot across your repos. Droid runs the same everywhere, so pick the surface that fits: the desktop app, the CLI, or a browser with nothing to install.",
    interface: "Desktop app, terminal CLI, and web and mobile sessions",
    website: "https://factory.com",
    source: "https://docs.factory.com/welcome/index.md",
    capabilities: [
      "Delegate a task, review the diff, and merge from the App or your terminal",
      "Put code review, QA, and documentation on autopilot across your repos",
      "Run the same Droid from the desktop app, the CLI, or any browser",
    ],
  },
  firebender: {
    summary: "Say what you want and Firebender builds it for you in a collaborative way, right inside your IDE. It runs as a coding agent deeply integrated into Android Studio and JetBrains IDEs, and it connects to your favorite tools and services. Get it from the JetBrains plugin marketplace and onboard in a few minutes.",
    interface: "Plugin for Android Studio and JetBrains IDEs",
    website: "https://firebender.com",
    source: "https://docs.firebender.com/get-started/welcome.md",
    capabilities: [
      "Build what you ask for collaboratively inside the IDE",
      "Run inside Android Studio and JetBrains IDEs",
      "Connect to your favorite tools and services",
    ],
  },
  forgecode: {
    summary: "Run ForgeCode in your terminal and let it read files, write patches, run commands, and keep context across the whole session. Work in three ways: an interactive TUI for multi-step work, a one-shot CLI run with -p, or the zsh plugin's : prefix for quick prompts. Switch between the forge, sage and muse agents to implement features, map architecture, or write an implementation plan.",
    interface: "Terminal: interactive TUI, one-shot CLI mode, and a zsh plugin mode",
    website: "https://forgecode.dev",
    source: "https://github.com/tailcallhq/forgecode",
    capabilities: [
      "Read files, write patches, and run commands while holding context across the session",
      "Work in an interactive TUI, one-shot CLI mode, or the zsh : prefix",
      "Pick the forge, sage, or muse agent for implementation, research, or planning",
    ],
  },
  fx: {
    summary: "Install fx as one tiny native binary and start an interactive session or run a single request with fx ask, with no background service required. Written in Zig, this open-source coding agent harness keeps things minimal and fast, from its system prompt design down to its 6.74 MiB binary, and its output is closer to a Unix shell than an IDE in the terminal. Embed the core with libfx, add your own tools, and connect skills or MCP servers.",
    interface: "Terminal CLI, embeddable as a library (libfx)",
    website: "https://fx.sh",
    source: "https://fx.sh/",
    capabilities: [
      "Install one 6.74 MiB native binary for your terminal, CI, or agent sandbox",
      "Embed the core with libfx, add your own tools, and connect skills or MCP servers",
      "Stay model and provider agnostic: local models, gateways, direct API access, or subscriptions",
    ],
  },
  "iflow-cli": {
    summary: "iFlow CLI was an AI assistant that ran directly in your terminal, analyzing code repositories, executing coding tasks, and automating everything from simple file operations to complex workflows. It offered free AI models, one-click SubAgent and MCP installs from the iFlow Open Market, and conversation history saving and rollback.",
    interface: "Terminal CLI, with VS Code and JetBrains plugins",
    website: "https://platform.iflow.cn/",
    source: "https://github.com/iflow-ai/iflow-cli",
    capabilities: [
      "Analyze code repositories and execute coding tasks directly in the terminal",
      "Install SubAgents and MCP in one click from the iFlow Open Market",
      "Save and roll back conversation history with iflow --resume and /chat",
    ],
  },
  jazz: {
    summary: "Jazz is an open-source AI assistant that reads and edits files, runs commands, researches the web, and creates documents and visuals. You choose its model and permissions, then use the same agent from your terminal, scripts, CI, schedules, or chat apps.",
    interface: "Terminal CLI (also scripts, CI, schedules and chat apps)",
    website: "https://jazz-cli.vercel.app",
    source: "https://jazz-cli.vercel.app/docs/index.md",
    capabilities: [
      "Reads and edits files, runs commands, researches the web",
      "Runs from your terminal, scripts, CI, schedules or chat apps",
      "Set budgets and gate actions behind approvals",
    ],
  },
  junie: {
    summary: "Junie is an AI coding agent from JetBrains. Junie CLI runs in your terminal and Junie Local runs inside JetBrains IDEs, and it keeps you in control — you review, guide, and approve changes as it works.",
    interface: "Terminal CLI (also runs inside JetBrains IDEs)",
    website: "https://junie.jetbrains.com",
    source: "https://junie.jetbrains.com/",
    capabilities: [
      "Built on the IntelliJ IDEA engine",
      "Bring your own key: supports 10+ models",
      "Review, guide and approve changes as it works",
    ],
  },
  kilo: {
    summary: "Kilo Code is an open-source AI coding assistant that works wherever you do — in your IDE, terminal, browser, or on the go. Generate code, automate reviews, debug issues, and ship faster with AI that understands your codebase.",
    interface: "Terminal CLI (also IDE extensions, web, mobile and Slack)",
    website: "https://kilo.ai",
    source: "https://kilo.ai/docs/getting-started",
    capabilities: [
      "Specialized agents for Code, Plan, Debug and Ask — or create your own",
      "Runs in VS Code, JetBrains and the Kilo CLI from your terminal",
      "Sessions sync across IDE, browser, mobile and Slack",
    ],
  },
  kimchi: {
    summary: "Kimchi Coding is an autonomous AI coding agent: describe a task in plain English and the harness reads your codebase, plans the work, writes code, runs commands and verifies the results, all in a terminal session. An orchestrator classifies each task and hands subtasks to the models best suited to them.",
    interface: "Terminal CLI (coding harness in a terminal session)",
    website: "https://kimchi.dev",
    source: "https://docs.kimchi.dev/docs/coding-overview",
    capabilities: [
      "Multi-model orchestration routes planning, building and reviewing to specialist models",
      "Ferment runs multi-step projects across sessions and picks up where it left off",
      "Built-in LSP and DAP support for type-aware edits and real debugging",
    ],
  },
  "kimi-code-cli": {
    summary: "Kimi Code CLI is an AI agent that runs in the terminal and carries out software development tasks and day-to-day terminal operations — reading and modifying code, running shell commands, searching files and fetching web pages. It plans and adjusts its next steps from the feedback it gets as it works.",
    interface: "Terminal CLI (interactive TUI)",
    website: "https://www.kimi.com/code",
    source: "https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html",
    capabilities: [
      "Writes and modifies code — new features, bug fixes, refactors",
      "Explores an unfamiliar codebase and answers questions about it",
      "Asks for confirmation before it modifies files or runs shell commands",
    ],
  },
  "kiro-cli": {
    summary: "Kiro CLI brings AI-assisted development to your terminal. Build, test, and deploy applications using natural language commands and automated workflows.",
    interface: "Terminal CLI (interactive chat, headless mode)",
    website: "https://kiro.dev",
    source: "https://kiro.dev/docs/cli.md",
    capabilities: [
      "Interactive chat with a terminal UI — syntax highlighting, panels and themes",
      "Headless mode runs prompts non-interactively in CI/CD pipelines",
      "Voice mode dictates prompts hands-free with local Whisper speech-to-text",
    ],
  },
  kode: {
    summary: "Run Kode in your terminal and let it understand your codebase, edit files, run commands, and handle whole workflows for you. It works with 20+ AI models and providers, and it picks up your project's AGENTS.md instructions automatically.",
    interface: "Terminal AI assistant, run interactively or in one-shot mode",
    website: "https://github.com/shareAI-lab/Kode-cli",
    source: "https://github.com/shareAI-lab/Kode-cli",
    capabilities: [
      "Edit files and run shell commands as it works",
      "Switch and combine multiple AI models in one session",
      "Read AGENTS.md project instructions automatically",
    ],
  },
  mux: {
    summary: "Run several coding agents at once in Xum, each in its own isolated workspace, straight from your browser or desktop. Xum is open source and LLM provider-agnostic, so you can point it at any model provider. Install it on macOS, Linux or Windows and manage the whole suite of agents from one place.",
    interface: "Desktop and browser app that runs agents in isolated workspaces",
    website: "https://xum.coder.com",
    source: "https://xum.cdr.dev/index.md",
    capabilities: [
      "Run parallel coding agents, each in an isolated workspace",
      "Work with any LLM provider",
      "Review rich markdown output like mermaid diagrams and LaTeX",
    ],
  },
  neovate: {
    summary: "Use Neovate to generate code, fix bugs, review code, and add tests from the command line. Install it with npm, sign in to a provider or set your own API key, choose a model, then describe what you want and approve the changes it proposes.",
    interface: "CLI you run interactively or headless",
    website: "https://neovateai.dev",
    source: "https://github.com/neovateai/neovate-code",
    capabilities: [
      "Generate code, fix bugs, review code and add tests",
      "Run interactively or headless",
      "Use any provider's API key, then switch models with /model",
    ],
  },
  ona: {
    summary: "Hand work to background agents running in the cloud and get pull requests back, from any device. Ona triggers agent fleets with repeatable workflows on PRs, schedules or webhooks, and keeps every execution governed with audit trails, scoped credentials and kernel-level policy enforcement.",
    interface: "Cloud platform that runs background agents for you",
    website: "https://ona.com",
    source: "https://ona.com/",
    capabilities: [
      "Run background agents that turn tasks into pull requests",
      "Trigger agent fleets on PRs, schedules, or webhooks",
      "Give each agent a full cloud environment with your tools and permissions",
    ],
  },
  openhands: {
    summary: "Run software engineering agents across your real workflows with OpenHands, an open source platform. Use the GUI for interactive agent sessions, the CLI for terminal-native work, or the SDK to embed agentic development in your own tools and products.",
    interface: "Open source platform with a GUI, CLI and SDK",
    website: "https://www.openhands.dev/",
    source: "https://www.openhands.dev/",
    capabilities: [
      "Run interactive agent sessions in the GUI",
      "Drive terminal-native workflows with the CLI",
      "Embed agents in your own tools with the SDK",
    ],
  },
  pochi: {
    summary: "Chat with Pochi inside VS Code to generate and ship applications. Pochi is an open-source AI coding agent built as a VS Code extension: bring your own LLM provider by configuring API keys, or sign in for Pochi's managed models, shared task histories and team management.",
    interface: "VS Code extension",
    website: "https://getpochi.com",
    source: "https://docs.getpochi.com/",
    capabilities: [
      "Install from the VS Code Marketplace or OpenVSX",
      "Use any LLM provider by configuring API keys",
      "Share task histories and manage your team with an account",
    ],
  },
  "posit-assistant": {
    summary: "Posit Assistant is the agentic harness for data science. Load a dataset and ask questions in plain language, describe the dashboard you want and get a working app, or paste an error and let it pinpoint and fix the bug — working inside Positron, RStudio, or your terminal, connected to live R and Python runtimes.",
    interface: "Positron, RStudio, and the terminal",
    website: "https://assistant.posit.co",
    source: "https://assistant.posit.co/",
    capabilities: [
      "Explores your data from a plain-language question, with summary statistics and publication-ready visualizations",
      "Scaffolds a working dashboard from a description, wiring up layouts and inputs",
      "Reads your session context, loaded packages, and variables to debug and fix code",
    ],
  },
  qoder: {
    summary: "Qoder is an agentic platform for real work, bringing AI into software development, terminal workflows, managed cloud execution, and everyday productivity. Instead of stopping at a suggestion, it understands the task and its context, plans the work, uses tools to execute it, verifies the result, and iterates until the deliverable is ready.",
    interface: "Agentic platform — desktop workspace, IDE, JetBrains plugin, terminal CLI, and cloud agents",
    website: "https://qoder.com",
    source: "https://docs.qoder.com/product-series/what-is-qoder",
    capabilities: [
      "Gives agents persistent context from code, knowledge, rules, tools, and files",
      "Runs multi-step work end to end — plan, execute, verify, iterate — keeping review points",
      "Covers the whole family: Qoder IDE, Qoder CLI, JetBrains plugin, and cloud agents",
    ],
  },
  "qoder-cn": {
    summary: "Qoder CN is Alibaba Cloud's AI agent product series, covering software development and everyday office work in one family — a desktop workspace, an IDE, a JetBrains plugin, and a terminal CLI. It runs on domestic models such as GLM, DeepSeek, Kimi, and MiniMax, deployed end to end on China's clouds to meet data-security and compliance requirements. The series was renamed from Tongyi Lingma (通义灵码) on May 20, 2026.",
    interface: "Desktop workspace, IDE, JetBrains plugin, and terminal CLI",
    website: "https://qoder.cn",
    source: "https://docs.qoder.cn/product-overview/introduction-of-qodercn",
    capabilities: [
      "Runs on mainstream domestic models, fully deployed in-country for data security and compliance",
      "Ships a desktop workspace, an IDE, a JetBrains plugin, and a terminal CLI",
      "Offers enterprise options for finance and government: dedicated editions, private knowledge enhancement, dedicated VPC deployment",
    ],
  },
  "qwen-code": {
    summary: "Qwen Code is the open-source AI coding agent for your terminal, editor, desktop, browser, and chat. Open it in a project, describe what you want built, and it plans the work, writes and edits code, runs commands, and reaches external tools over MCP.",
    interface: "Terminal CLI (also desktop app, web UI, IDE plugins, and chat)",
    website: "https://qwenlm.github.io/qwen-code-docs/",
    source: "https://github.com/QwenLM/qwen-code",
    capabilities: [
      "Agentic out of the box: Auto-Memory, Auto-Skills, SubAgents, Agent Teams, and MCP",
      "Speaks multiple protocols — OpenAI, Anthropic, Gemini, and Qwen APIs, plus local models like Ollama and vLLM",
      "Goes beyond the terminal with IDE plugins, a desktop app, a web UI, SDKs, and chat integrations",
    ],
  },
  roo: {
    // The shutdown itself is stated, once, by the banner the page renders from
    // `lib/lifecycle.ts`. Repeating it here made the reader read the same fact
    // twice in a row, so the note describes what the product was.
    summary: "Roo Code was an open-source AI coding agent for VS Code — model-agnostic, with actual file system access, terminal control, and multi-step workflows.",
    interface: "VS Code extension",
    website: "https://docs.roocode.com",
    source: "https://roocodeinc.github.io/Roo-Code/",
    capabilities: [
      "Generates code from natural language descriptions and specs",
      "Refactors and debugs existing code, and writes or updates documentation",
      "Utilizes MCP servers for external tools and services",
    ],
  },
  rovodev: {
    // Same rule as `roo`: the end-of-life notice is the banner's job, not the
    // description's, so this says what the product is and stops.
    summary: "Rovo Dev is Atlassian's AI coding agent for software teams: plan, generate, and review code in your terminal, IDE, Bitbucket, and GitHub. It plans against knowledge from across the Atlassian platform, turns Jira work items into code, and validates changes against acceptance criteria in Jira.",
    interface: "Terminal CLI, IDE (VS Code), Bitbucket, and GitHub",
    website: "https://www.atlassian.com/software/rovo-dev",
    source: "https://www.atlassian.com/software/rovo-dev",
    capabilities: [
      "Plans code changes from requirements and knowledge from across the Atlassian platform",
      "Generates implementation aligned to those plans, including refactoring, tests, and docs",
      "Reviews code and validates changes against acceptance criteria in Jira",
    ],
  },
  "tabnine-cli": {
    summary: "Tabnine CLI is an AI-powered coding assistant that runs directly in your terminal. Ask it a question about your project, request a code review, or hand it a task, and it gathers context from your files, runs its built-in tools, and answers back in the terminal.",
    interface: "Terminal CLI",
    website: "https://docs.tabnine.com/main/getting-started/tabnine-cli",
    source: "https://docs.tabnine.com/main/getting-started/tabnine-cli/getting-started",
    capabilities: [
      "Interactive chat in the terminal, plus a non-interactive mode for scripts and automation",
      "Built-in file operations and shell commands, with remote code search across large codebases",
      "Code review, code generation and refactoring from plain-language prompts",
    ],
  },
  zcode: {
    summary: "ZCode is an agentic development environment built around GLM-5.3. Give it a task in plain language and the ZCode Agent plans, codes, tests and reviews the work in one long-running task, while you follow along and add instructions from the desktop, your phone, or a chat bot.",
    interface: "Desktop app (also mobile Remote and Bot Channel)",
    website: "https://zcode.z.ai",
    source: "https://zcode.z.ai/en/docs/welcome",
    capabilities: [
      "Keeps files, terminal output, browser context and Git state inside one task",
      "Handles coding, debugging, testing, project preview and change review from natural-language instructions",
      "Sensitive commands and file changes go through confirmation before they run",
    ],
  },
  zed: {
    summary: "Zed is an open-source code editor with built-in collaboration and AI tools. Open the Agent Panel from the keyboard, describe the change you want, and its built-in agent works through your project while you keep editing.",
    interface: "Open-source code editor",
    website: "https://zed.dev",
    source: "https://zed.dev/docs",
    capabilities: [
      "Prompt the built-in agent from the Agent Panel (Cmd+Shift+A / Ctrl+Shift+A)",
      "Inline assistance in the editor with Ctrl+Enter",
      "Configure AI providers through the AI overview, and add language and theme extensions",
    ],
  },
  codestudio: {
    summary: "The Syncfusion MCP Server brings deep knowledge of Syncfusion's component libraries into an AI-powered IDE. Through Model Context Protocol it serves documentation, API references and code generation, so an agent follows Syncfusion's own integration practices.",
    interface: "MCP server for AI-powered IDEs",
    website: "https://www.syncfusion.com/",
    source: "https://ej2.syncfusion.com/angular/documentation/mcp",
    capabilities: [
      "Serves Syncfusion documentation and API references into the IDE",
      "Generates component code inside the development environment",
      "Reinforces best practices for Syncfusion component integration",
    ],
  },
  cortex: {
    summary: "CoCo CLI is the command-line way to use Snowflake CoCo, the AI agent built into the Snowflake platform for data engineering, analytics, machine learning and agent-building work. It runs an autonomous agent framework against your own Snowflake account, with an understanding of its role-based access control, schemas and best practices.",
    interface: "Command line, desktop IDE, and Snowsight (web)",
    website: "https://www.snowflake.com/en/product/features/coco/",
    source: "https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code",
    capabilities: [
      "Works directly against your Snowflake environment, aware of its RBAC, schemas and conventions",
      "Takes on data analysis, machine learning and data engineering tasks",
      "Reaches external tools and data through Model Context Protocol servers",
    ],
  },
  deepagents: {
    summary: "Deep Agents Code (dcode) is LangChain's open source coding agent for the terminal, built on the Deep Agents SDK. It works with any large language model, carries memory between conversations, and gates code execution behind approval controls.",
    interface: "Terminal coding agent (dcode)",
    website: "https://docs.langchain.com/oss/deepagents/code/overview",
    source: "https://docs.langchain.com/oss/deepagents/code/overview",
    capabilities: [
      "Works with any large language model, and can switch provider or model",
      "Persistent memory carries context across conversations",
      "Approval controls gate code execution; skills shape how it behaves",
    ],
  },
};

/** The note for a host, or undefined when this repository has none — in which
 *  case the page shows registry facts and the verified configuration docs, and
 *  says so in one line rather than a paragraph of disclaimer. */
export function hostNote(id: string): HostNote | undefined {
  return HOST_NOTES[id];
}
