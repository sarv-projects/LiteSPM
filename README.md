<div align="center">

<img src="web/public/logo.svg" alt="LiteSPM" width="80" height="80">

# LiteSPM

**The package manager for AI coding agents.**

*Discover, install, update, and manage MCP servers, agent skills, and plugins across 80+ AI coding agents through a single unified interface.*

[![npm version](https://img.shields.io/npm/v/litespm.svg?color=10b981&logo=npm)](https://www.npmjs.com/package/litespm)
[![CI Status](https://github.com/sarv-projects/LiteSPM/actions/workflows/ci.yml/badge.svg)](https://github.com/sarv-projects/LiteSPM/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Platforms: Windows · macOS · Linux](https://img.shields.io/badge/platforms-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-6b7280.svg)](#install)
[![Supported Agents: 80+](https://img.shields.io/badge/agents-80%2B%20supported-8b5cf6.svg)](#supported-agents)

[Website](https://lite-spm-nine.vercel.app) •
[Marketplace](https://lite-spm-nine.vercel.app/marketplace) •
[Curated Bundles](https://lite-spm-nine.vercel.app/bundles) •
[Documentation](https://lite-spm-nine.vercel.app/docs) •
[Architecture Specs](ARCH/) •
[System Status](STATUS.md)

</div>

---

## ⚡ The Problem

Every AI coding agent maintains its own configuration file format (`cline_mcp_settings.json`, `.claude.json`, `config.toml`, `opencode.jsonc`, `mcp.json`). Every MCP server, agent skill, and plugin ships separate manual setup instructions.

* Setting up 3 agents means manually editing 3 configuration files by hand.
* Installing a single tool across your tools requires remembering vendor-specific syntax, environment variable blocks, and file paths.
* When something breaks or needs removal, nothing tracks what was written, risking data loss or comment deletion.

## 🚀 The Solution: LiteSPM

LiteSPM is a single, zero-telemetry package manager for AI agents. It knows every agent's configuration syntax, verifies package metadata from an index of 69,000+ capabilities, performs surgical byte-exact configuration merges with automatic backups, and undoes any installation cleanly.

* **No account required.**
* **Zero telemetry.**
* **No proxy between your agent and your tools.**
* **Local, deterministic, and reversible.**

---

## 📦 Quickstart

### 1. Install LiteSPM Globally

```bash
npm install -g litespm
```
*(Requires Node.js 22.22.2+ for the launcher, which automatically verifies the native binary via Sigstore. Pre-compiled standalone binaries are also available on [GitHub Releases](https://github.com/sarv-projects/LiteSPM/releases).)*

### 2. Connect Your Agents

You can connect your agents in whatever way suits your workflow:

```bash
# Option A: Interactive Wizard (TUI with automatic agent detection and popular defaults)
litespm

# Option B: Hands-Free Auto-Connect (detects and configures all installed agents at once)
litespm setup --all

# Option C: Targeted Connect
litespm setup --agent cursor
```

### 3. Discover & Install Capabilities

```bash
# Search the local catalog index
litespm search github

# Install an MCP server or skill (installs to all connected agents by default!)
litespm install mcp:github:github-mcp-server

# View what is installed across your agents
litespm list

# Undo any install cleanly without leaving orphaned configuration nodes
litespm install remove <installId>
```

---

## 🔄 Hands-Free Automation & Unified Sync (`litespm sync`)

Never memorize flags or manually re-sync configuration files. LiteSPM provides unified cross-agent synchronization natively on launch and via command:

### 1. Unified Sync Command (`litespm sync`)
Run a complete hands-free synchronization across your entire developer environment in one go:

```bash
# Fully automated zero-interaction sync
litespm sync

# Preview changes without modifying files
litespm sync --dry-run
```

**What `litespm sync` does automatically:**
1. **Self-Update / Upgrade Check**: Checks the release manifest and verifies/upgrades LiteSPM with Sigstore cosign signatures when a newer release exists.
2. **Catalog Sync**: Downloads, verifies, and indexes the latest published capabilities catalog.
3. **Agent Config Cross-Update**: Scans this machine for all supported agents (Cursor, Claude Code, OpenCode, Codex, Cline, Pi, Grok, Zed, etc.), detects configuration files (JSON, TOML, JSONC), and auto-wires any newly installed agents with the LiteSPM bridge and in-agent commands.
4. **Skills & Capabilities Reconcile**: Cross-syncs installed skills into each detected agent's skills directory and reconciles the skills ledger.

### 2. Just-in-Time (JIT) Auto-Connect on Launch
Whenever you run `litespm`, it automatically detects newly installed agents on your machine and connects them immediately without requiring manual configuration prompts.

### 3. Automated Scripts & Background Schedulers
For headless or automated environments:

```bash
# Linux / macOS
./scripts/litespm-sync.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\scripts\litespm-sync.ps1
```

Set-and-forget background schedulers (every 6 hours):
* **Linux / macOS (Cron):** `./scripts/install-cron-sync.sh`
* **Windows (Task Scheduler):** `powershell -ExecutionPolicy Bypass -File .\scripts\install-task-sync.ps1`

---

## 🖥️ The In-Agent Marketplace Experience

Once configured, launch your agent and type the marketplace command. LiteSPM provides native popup dialogs or command triggers directly inside your workflow:

| Agent Host | In-Agent Command | Experience |
|:---|:---|:---|
| **Pi Agent** | `/marketplace` | Native terminal overlay with tabs (MCP, Skills, Plugins, Installed) |
| **OpenCode** | `/litespm-marketplace` | Interactive TUI select dialog (`ui.dialog.select`) |
| **Claude Code** | `/litespm-marketplace` | Native interactive mod pane with tabs and 1-click install |
| **GitHub Copilot CLI** | `/litespm-marketplace` | Interactive terminal select prompt |
| **Cursor, Cline, Roo, Kilo** | `/litespm-marketplace` | Custom command driving LiteSPM bridge tools |
| **Codex, Grok Build** | `$litespm-marketplace` | Embedded capability skill |
| **Crush** | `Ctrl+P` → `user:litespm-marketplace` | Palette skill trigger |
| **Browser GUI** | `litespm marketplace` | Opens full visual dashboard at `https://lite-spm-nine.vercel.app/marketplace` |

---

## 🛠️ Complete CLI Command Reference

### Discovery & Marketplace
| Command | Description |
|:---|:---|
| `litespm` | Interactive TUI wizard for setup, search, installation, and management |
| `litespm search <query>` | Fast SQLite FTS5 search across 69,000+ catalog capabilities |
| `litespm marketplace` | Opens the web marketplace dashboard in your default browser |
| `litespm catalog sync` | Synchronizes local catalog database with latest verified upstream release |

### Installation & Lifecycle Management
| Command | Description |
|:---|:---|
| `litespm install <id>` | Plan, preview, approve, and install an MCP server, skill, or plugin |
| `litespm install <id> --dry-run` | Preview the exact configuration diff and backup destination without writing |
| `litespm install <id> --agent <id>` | Restrict installation to a specific agent (defaults to all configured agents) |
| `litespm install remove <id>` | Surgically removes the package, preserving user-authored comments and custom nodes |
| `litespm list` | Inventory of installed capabilities across agents and scopes |
| `litespm list --json` | Machine-readable JSON output of installed ledger and detected external tools |

### Skills Management (`agentskills.io` standard)
| Command | Description |
|:---|:---|
| `litespm skills add <source>` | Add skills from GitHub (`owner/repo`), Git URLs, bare `SKILL.md`, or folders |
| `litespm skills add <src> --all` | Install a skill to all supported agent directories simultaneously |
| `litespm skills use <source>@<skill>` | Prints the raw skill prompt to stdout (installs nothing, pipe directly into agents) |
| `litespm skills find [<query>]` | Search for skills in the local catalog |
| `litespm skills list` | List all tracked skills in the local ledger |
| `litespm skills update [<name>...]` | Re-fetch and update installed skills from their recorded upstream source |
| `litespm skills remove <name>` | Remove a skill directory tracked by the ledger |
| `litespm skills adopt <name>` | Take ownership of a pre-existing skill already on disk |
| `litespm init [name]` | Scaffold a compliant `SKILL.md` template |

### Agent Host Administration
| Command | Description |
|:---|:---|
| `litespm setup` | Interactive agent connection wizard with detected agent preselection |
| `litespm setup --all` | Automatically detect and wire LiteSPM bridge to all installed hosts with 0 prompts |
| `litespm setup --agent <host-id>` | Connect a specific agent host directly |
| `litespm host detect` | Scans filesystem for installed agent configurations |
| `litespm host list` | Prints supported host adapters with their resolved config file paths |
| `litespm host setup <host-id>` | Connect an agent host directly |
| `litespm host remove <host-id>` | Safely remove LiteSPM's bridge entry from an agent's configuration |
| `litespm copy --from <A> --to <B>` | Port all installed MCP servers from Agent A to Agent B |
| `litespm adopt <name> --host <id>` | Adopt an externally configured MCP server into LiteSPM's managed ledger |
| `litespm restore <installId>` | Roll back a configuration file to its byte-exact pre-install state |

### Diagnostics & System
| Command | Description |
|:---|:---|
| `litespm doctor` | Comprehensive diagnostic check of daemon health, host configs, and filesystem CAS |
| `litespm doctor --repair` | Automatically fix configuration corruptions and broken bridge links |
| `litespm audit` | Security policy and supply chain audit of installed packages and environment |
| `litespm self-update` | Updates LiteSPM binary to the latest cryptographically signed release |
| `litespm uninstall` | Cleanly unlinks LiteSPM bridge from all agents on the machine |
| `litespm help <command>` | Displays comprehensive manual and flags for any command |

---

## 🤖 Supported Agents Directory

LiteSPM supports **80+ AI coding agents** across the ecosystem, with surgical configuration management and native skills support.

### Popular Supported Agents:
* **Terminal Coding Agents:** Claude Code (`~/.claude.json`), OpenAI Codex (`~/.codex/config.toml`), OpenCode (`~/.config/opencode/opencode.jsonc`), Pi Agent (`~/.pi/agent/mcp.json`), Grok Build (`~/.grok/config.toml`), Gemini CLI, GitHub Copilot CLI, Kiro CLI, Qwen Code, Crush, Amp, Devin, Droid.
* **IDEs & Editor Extensions:** Cursor (`~/.cursor/mcp.json`), Cline (`~/.cline/data/settings/cline_mcp_settings.json`), Zed (`settings.json`), Roo Code, Kilo Code, Visual Studio Code (Copilot harness), Augment, Antigravity, Claude Desktop.
* **Autonomous & Research Agents:** AiderDesk, OpenHands, Deep Agents, ForgeCode, Tabnine CLI, IBM Bob, CodeBuddy, and more.

Run `litespm host list` to view the entire live adapter matrix.

---

## 🛡️ Security, Privacy & Integrity

LiteSPM is built for security-sensitive engineering environments:

* **Surgical JSON/TOML Merges:** LiteSPM replaces entries by byte offsets rather than blind serialization. It never strips comments or reorders keys in user configuration files.
* **Fail-Closed Policy Engine:** Unknown transport schemes, unpinned plugin sources, and SSRF pivots (RFC1918 private IP traversal on remote endpoints) are blocked before any network egress or configuration write.
* **No Secret Storage:** Sensitive API keys or tokens are stored as environment variable references (`${env:TOKEN}`) in the agent's native format, never plain text in config files.
* **Human Approval Barrier:** Agents can prepare an `InstallPlan`, but only a human user can approve file mutations. Plans are sealed with a SHA-256 cryptographic digest.
* **Tamper-Evident Content Store:** Packages are extracted into content-addressed trees (`DATA_ROOT/cas/trees/sha256/<hash>`), enabling instant, tamper-evident rollbacks.

---

## ⚙️ Environment Configuration

| Variable | Description |
|:---|:---|
| `LITESPM_NO_AUTO_SYNC=1` | Disables automatic background catalog synchronization (also disabled in `CI`) |
| `LITESPM_DATA_ROOT` | Relocate data directory (defaults to `~/.litespm` or `%LOCALAPPDATA%\litespm`) |
| `LITESPM_CONFIG_ROOT` | Relocate configuration directory |
| `LITESPM_REGISTRY_URL` | Override default catalog registry endpoint |
| `LITESPM_REQUIRE_CATALOG_SIGNATURE=1` | Enforces strict Sigstore cryptographic verification on all catalog updates |
| `LITESPM_NETWORK_TIMEOUT_SEC` | Timeout in seconds for catalog downloads and network requests |
| `INSTALL_INTERNAL_SKILLS=1` | Enables installation of skills marked with `metadata.internal: true` |

---

## 🏗️ Building from Source

```bash
# Clone repository
git clone https://github.com/sarv-projects/LiteSPM.git
cd LiteSPM

# Build CLI binary (Go 1.26+)
go build -o litespm ./cmd/litespm

# Run test suite
go test ./...

# Build Web Marketplace (Next.js 16)
cd web && npm install && npm run build
```

---

## 📄 License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.
