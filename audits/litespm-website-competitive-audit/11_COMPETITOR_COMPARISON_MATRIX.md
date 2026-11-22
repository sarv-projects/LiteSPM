# 11 — Competitor Comparison Matrix & Feature Parity

**Audit Scope:** LiteSPM vs. Top Rivals (Skills.sh, Glama, add-mcp, Microsoft APM, Docker MCP, MCP.so)

---

## 1. Comprehensive Capability Matrix

| Feature / Architecture Dimension | LiteSPM | Skills.sh (Vercel) | Glama MCP | add-mcp | Microsoft APM | Docker MCP | MCP.so |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Supported Package Types** | **MCP, Skills, Plugins** | Skills only | MCP only | MCP only | MCP, Skills, Plugins | MCP only | MCP only |
| **Total Catalog Size** | **68,933** | ~1,200 | **125,336** | ~3,500 | ~500 | ~150 | ~15,000 |
| **Supported Agent Hosts** | **52 Hosts** | ~10 Hosts | 0 (Manual copy) | ~30 Hosts | ~5 Hosts | Desktop only | 0 (Manual copy) |
| **Surgical Config Merging (JSONC/TOML)**| **Yes (Byte-exact)** | Overwrite/append | None | Basic merge | Manifest-driven | Docker UI | None |
| **Pre-Install Config Backup** | **Yes (`backups/`)** | None | None | None | Git-dependent | None | None |
| **One-Command Rollback (`restore`)** | **Yes (`litespm restore`)**| None | None | None | Partial (`apm rollback`) | None | None |
| **In-Agent `/marketplace` Command** | **Yes (52 Hosts)** | None | None | None | None | None | None |
| **Content-Addressable Storage (CAS)** | **Yes (SHA-256 CAS)** | Plain files | None | Plain files | OCI Registry | Container Images | None |
| **Cryptographic Release Verification** | **Sigstore / Fulcio** | npm verify | None | npm verify | Azure Sig | Docker Content Trust | None |
| **Native OS Credential Vault** | **DPAPI / Keychain** | Env vars | None | Plaintext JSON | Azure KeyVault | Docker Secrets | None |
| **Local Offline Catalog Search** | **Yes (Disk Index)** | No | No | No | Local cache | Local DB | No |
| **Live Upstream GitHub Stargazers** | Roadmap | Yes | **Yes** | No | Yes | Yes | Yes |
| **Tool JSON Schema Explorer** | Roadmap | No | **Yes** | No | Yes | Partial | Partial |
| **Process Containerization / Isolation** | Supervisor | Subprocess | None | Subprocess | Subprocess | **Docker Containers** | None |

---

## 2. Feature Strategy Classification: Parity, Differentiators & Traps

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. TABLE STAKES (Must have to be considered a viable product)          │
├────────────────────────────────────────────────────────────────────────┤
│ • Fast, accurate catalog search (< 100ms response).                    │
│ • Clear 1-click copy installation commands for terminal.               │
│ • Accurate documentation of host config paths and requirements.         │
│ • Mobile-responsive marketplace layout across all viewports.           │
│ • Zero installation failures for verified packages.                    │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 2. COMPETITIVE PARITY (Features needed to match rivals)                │
├────────────────────────────────────────────────────────────────────────┤
│ • Pre-computed category landing hubs (Databases, DevOps, Web).          │
│ • Trending packages leaderboard (inspired by Skills.sh).               │
│ • Tool schema function preview on package detail pages (like Glama).   │
│ • Verified publisher profile cards and source repository links.        │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 3. LITESPM DIFFERENTIATORS (Superpowers to aggressively promote)        │
├────────────────────────────────────────────────────────────────────────┤
│ • 52 Agent Host adapters with automated surgical merging.              │
│ • Atomic backups and byte-exact `restore` (peace of mind).             │
│ • Unified package model: MCP servers + SKILL.md + Plugins.             │
│ • In-agent `/marketplace` command in Claude Code, Pi, and OpenCode.    │
│ • DPAPI / Keychain OS credential vaults (zero cloud token leaks).      │
│ • Offline local index search (`litespm search`).                       │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 4. FEATURES TO AVOID (Low-value complexity traps)                      │
├────────────────────────────────────────────────────────────────────────┤
│ ✗ Commercial pay-to-rank sponsorship slots (destroys trust).           │
│ ✗ Scraping 200,000 unverified GitHub repos with zero install recipes.   │
│ ✗ Heavy web-only authentication gates for basic browsing.              │
│ ✗ Mandatory proprietary lockfiles for casual developers.               │
└────────────────────────────────────────────────────────────────────────┘
```
