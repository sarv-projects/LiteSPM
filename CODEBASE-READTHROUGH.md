# LiteSPM — Full Read-Through Digest

Every text file read end-to-end; declarations/structure extracted. Excludes dependencies, build output, binaries and >3 MB data files.

## README.md
*267 lines, 13258 bytes*
```
# LiteSPM
## ⚡ The Problem
## 🚀 The Solution: LiteSPM
## 📦 Quickstart
### 1. Install LiteSPM Globally
### 2. Connect Your Agents
# Option A: Interactive Wizard (TUI with automatic agent detection and popular defaults)
# Option B: Hands-Free Auto-Connect (detects and configures all installed agents at once)
# Option C: Targeted Connect
### 3. Discover & Install Capabilities
# Search the local catalog index
# Install an MCP server or skill (installs to all connected agents by default!)
# View what is installed across your agents
# Undo any install cleanly without leaving orphaned configuration nodes
## 🔄 Hands-Free Automation & Unified Sync (`litespm sync`)
### 1. Unified Sync Command (`litespm sync`)
# Fully automated zero-interaction sync
# Preview changes without modifying files
### 2. Just-in-Time (JIT) Auto-Connect on Launch
### 3. Automated Scripts & Background Schedulers
# Linux / macOS
# Windows (PowerShell)
## 🖥️ The In-Agent Marketplace Experience
## 🛠️ Complete CLI Command Reference
### Discovery & Marketplace
### Installation & Lifecycle Management
### Skills Management (`agentskills.io` standard)
### Agent Host Administration
### Diagnostics & System
## 🤖 Supported Agents Directory
### Popular Supported Agents:
## 🛡️ Security, Privacy & Integrity
## ⚙️ Environment Configuration
## 🏗️ Building from Source
# Clone repository
# Build CLI binary (Go 1.26+)
# Run test suite
# Build Web Marketplace (Next.js 16)
## 📄 License
```

## STATUS.md
*266 lines, 77830 bytes*
```
# LiteSPM Status — Truth Baseline
## 1. Control plane
## 2. Catalog & source plane
### Current release: `rel-2026-10-21-01` (sequence 151, 69,376 capabilities)
## 3. Install plane
## 4. Provider & invocation runtime
## 5. Governance & evidence
## 6. Interfaces & packaging
### The site, and the CLI a reader actually installs (2026-10-22)
## What this file supersedes
## Not yet true, and not claimed
```

## AGENTS.md
*275 lines, 32054 bytes*
```
# Supported AI Agents & Integration Guide
## 0. The skills CLI (a first-class surface, not a bridge detail)
## 1. Supported Agent Directory
## 2. Setup Workflow
### Step 1: Install LiteSPM Globally
### Step 2: Run the Interactive Setup and Manager
## 3. The In-Agent `/marketplace` Experience
### UX Architecture: Portable Contract vs. Rich Host UI
### Tab 1: MCP Servers
### Tab 2: Agent Skills
### Tab 3: Plugins
### Tab 4: Installed & Detected External Capabilities
## 4. Agent-Specific Integration Guides
### 4.1 Cline (VS Code Extension)
### 4.2 Pi Agent (`pi-coding-agent`)
### 4.3 Grok Build
### 4.4 OpenAI Codex
### 4.5 OpenCode
### 4.6 Claude Code
### 4.7 Qwen Code (`qwen-code`)
```

## SECURITY.md
*177 lines, 12042 bytes*
```
# Security Policy
## Reporting a vulnerability
## Supported versions
## What LiteSPM is trusted to do
### The approval gate is consent, not a sandbox
## Supply chain
## What we do not claim
## Untrusted input
## Out of scope
```

## TEST.md
*190 lines, 10015 bytes*
```
# Testing Guide: Cline, Pi Agent & Grok Build Adapters
## 1. Test Environment Setup & Mock Fixtures
### 1.1 Mock Cline Fixture with Pre-Existing Servers
### 1.2 Mock Pi Agent Fixture
### 1.3 Mock Grok Build Fixture
# Grok Build configuration file
### 1.4 Additional Host Fixtures
## 2. Test Cases & Verification Procedures
### Test Case 1: Automated Configuration Discovery
### Test Case 2: Missing Configuration Fallback Flow
### Test Case 3: Pre-Edit Backup & Non-Destructive Merge
### Test Case 4: Pre-Existing Tool Discovery & Read-Only Detection (Installed Tab) (`DESIGNED` — `adopt_tool` does not e
### Test Case 5: Slash Command (`/marketplace`) Registration
### Test Case 6: Dynamic Runtime Adapter Advisory Fetching (`DESIGNED` — not implemented)
## 3. Automated Test Execution
# Run unit tests for all host adapters
# Adapters are separate files in the single `host` package (not subpackages),
# so adapter-specific tests are selected with -run filters, e.g.:
# Run end-to-end integration harness (package `test`: canary, conformance, hostile-archive fuzz)
```

## CHANGELOG.md
*1422 lines, 108666 bytes*
```
# Changelog
## [Unreleased]
### Added (working tree, 2026-11-12)
### Changed (working tree, 2026-11-12)
### Fixed (working tree, 2026-11-12)
### Added (working tree, 2026-11-10)
### Fixed (working tree, 2026-11-10)
### Documentation (2026-11-10)
### Fixed
### Fixed
### Fixed
### Changed
### Added
### Changed
## [0.6.0] - 2026-10-22
### Added
### Fixed
### Changed
## [0.5.0] - 2026-10-19
### Added
### Fixed
### Changed
### Fixed in the repository itself
## [0.4.1] - 2026-10-15
### Added
### Fixed
### Changed
### Security
### Known issue
### The sharding fix (carried from the release that never shipped)
## [0.4.0] - 2026-10-11
### Added
### Changed
### Changed
### Fixed
### Removed
### Known limitations
```

## TODO.md
*353 lines, 112166 bytes*
```
# LiteSPM Delivery Ledger & Implementation Roadmap
## Phase A: Architecture Freeze & Contract Verification (Prerequisite)
## Phase B: Core Foundations & Storage Layer
## Phase C: Static Catalog & Discovery Plane
## Phase D: Safe Artifact Extraction & Skill Management
## Phase E: Daemon Supervision, Bridge Shim & Host Adapters
## Phase F: MCP Protocol Profiles, Secrets & OAuth
## Phase G: Marketplaces Federation, In-Agent `/marketplace` & Web Frontend
## Phase H: Release Engineering, Conformance & Packaging
## Phase I: Golden Fixtures, Self-Update & Migrations
## Phase J: Product Surface — Web Redesign & CLI Commands
## Phase K: Sources & Supply-Chain Truth
## Phase L: v1.0 implementation worklist (2026-10-20 external specification, verified row by row)
## Overhaul backlog (next-phase work)
```

## AUDIT.md
*280 lines, 49243 bytes*
```
# LiteSPM — Audit Remediation Backlog
## 0. Status of this change set
## 1. Fix now (High)
### F1 `[FIXED]` — Catalog sync could write files anywhere the user can write
### F2 `[FIXED]` — A published signature was not actually required
### F3 `[FIXED]` — `host.apply_setup` bypassed the plan/approval machinery
### F4 `[FIXED]` + `[ACTION]` — Three live Groq API keys were committed
## 2. Fix next (Medium)
### F5 `[FIXED]` — Vault has no cross-process locking; revocation can be undone
### F6 `[FIXED]` — A transient keyring failure silently rotates the master key
### F7 `[FIXED]` — Archive extraction is not confined when the staging dir already holds a symlink
### F8 `[FIXED]` — Catalog `command`/`args` are interpolated into the copy-paste config snippet unescaped
### F9 `[FIXED]` — A tag push alone builds, signs and publishes a release
### F10 `[FIXED]` — Signing job holds write + OIDC while actions ride movable tags
### F11 `[FIXED]` — `web/package-lock.json` lacks `integrity` for most entries
### F12 `[FIXED]` — The daily catalog-sync job cannot succeed and pushes upstream data unreviewed
### F13 `[FIXED]` — Rate-limit identity is client-controllable
## 3. Hardening backlog (Low)
## 4. Repository, CI and release-process items
## 5. Optional architectural upgrades
## 6. What the audit verified as sound (do not regress)
## 7. Suggested order of work
## 8. Second deep-dive — skills subsystem and host adapters (baseline `64bf56f`)
### 8.1 Confirmed — host adapters
### 8.2 Confirmed — skills subsystem
### 8.3 Verified as sound (second deep-dive)
## 9. Third deep-dive — the web assistant (baseline `18de7b4`)
## 10. Fourth deep-dive — the installed-user journey (baseline `f77a3a3`, this branch)
```

## CURRENT_RUN.md
*2342 lines, 246642 bytes*
```
# Current Run Handover
## Session 2026-11-05 — the browser marketplace, the wizard picker, and 1,928 resolved directory launches
## Session 2026-10-19 (later) — the site's first browser run, the audit command, and the CAS scratch fix
## Session 2026-10-19 — the program: Phase K, ARCH/34, Phase J, and the wiring
## Session 2026-10-16/18 — the product-page pass (site reads as a product, not a project)
### The rule this session established, and the mistake it came from
### What shipped (all on `origin/main` unless noted)
### Two defects worth reading the commit for
### The trust pages are written against the code
### Verified at the end of this session
### Still left, in priority order
### Decisions made here, so they are not re-litigated
## Session 2026-10-14/15 — parity, the wizard, the leak, and the site
### The commits from this session (all now on `origin/main`)
### CI was RED on every push since 2026-10-14 — three separate causes (all fixed by 2026-10-15)
### Status of the two open items (recorded 2026-10-14/15; item 1 resolved the same day)
### What this session changed, by area
### Still open, and deliberately
## Session 2026-10-13 — Hands-On Validation + Four Defects Closed
### Full-repo read of `vercel-labs/skills` — 138/138 files, ~34,800 lines (2026-10-13)
### What the `vercel-labs/skills` comparison showed (2026-10-13)
### How to cut `v0.5.0` — prepared 2026-10-19; ready for the operator
# 1. Confirm the tree is clean and green (from the repo root)
# 2. Commit the release, tag it, and push the tag. The tag is what triggers
#    .github/workflows/release.yml (signed assets, SBOM, npm publish).
# 3. Wait for the release workflow to finish. It publishes 6 platform binaries,
#    the SBOM, the web bundle, SHA256SUMS, and 8 .sigstore.json bundles.
# 4. Publish to npm (the workflow does this too when NPM_TOKEN is set; this is
#    the manual path if the workflow's npm step was skipped deliberately)
# 5. Verify from a clean data root, not from the log
# expect: Release rel-2026-10-17-01, 69376 capabilities indexed
### How to cut `v0.4.1` — executed 2026-10-15; kept as the procedure of record
# 1. Prove the fix is in the tag you are about to cut (already true of HEAD):
# 2. Bump the version npm will fetch for. npm postinstall downloads
#    https://github.com/<owner>/<repo>/releases/download/v${VERSION}/
#    from npm/package.json, and release.yml derives VERSION from the tag name
#    (export VERSION="${GITHUB_REF_NAME#v}"), so these two MUST agree:
# 3. Move CHANGELOG.md [Unreleased] -> [0.4.1] - <date>
# 4. Commit, tag, push. The tag is what triggers the build:
# 5. Only after the GitHub release exists (17 assets for v0.4.1: 6 platform binaries, the SBOM, the
#    web bundle and SHA256SUMS, plus 8 .sigstore.json bundles):
# expect: Release rel-2026-10-15-01, 69376 capabilities indexed
## Active Goal
## Repository State at Audit Close
## Reviewers (All Completed; Read-Only)
## Highest-Priority Findings to Report
## Other Material Findings
## Website/UI Positive Evidence and Limits
## Tooling, Verification, and Limitations
## Website Link-Breakage Fix (2026-10-08 evening)
... (111 more)
```

## HANDOFF.md
*398 lines, 22247 bytes*
```
# Handoff — installer UX upgrade + in-agent marketplace
## 1. What the user asked for
## 2. Reference study: `vercel-labs/skills`
## 3. Findings in LiteSPM
### 3.1 `/litespm:marketplace` is text-only — there is no popup to open
### 3.2 Auto-update is once per shell session, not every run
### 3.3 The wizard is a mix of plain prompts and the good TUI
### 3.4 MCP name conflict aborts the whole install
### 3.5 `list_installed` filter bug
## 4. Changes already made (uncommitted)
### 4.1 `cmd/litespm/auto_update.go`
### 4.2 `cmd/litespm/auto_update_test.go`
### 4.3 `internal/bridge/shim.go`
### 4.4 Earlier, unrelated-to-A changes in the same working tree
## 5. Remaining work for Approach A
### A1. Finish auto-update
### A2. Unify the wizard UI
### A3. Conflict-aware MCP install
### A4. In-agent marketplace behavior
### A5. Re-audit (not started)
## 6. Testing plan
## 7. Constraints and pitfalls
## 8. Decision log
## 9. First commands for the next agent
```

## REMEDIATION-PLAN.md
*122 lines, 18365 bytes*
```
# LiteSPM Remediation Plan
## Where things stand (Oct 5, post-rebrand and post-doc-overhaul)
## Decisions (locked)
## Wave 1 — Phases 0 + 2 (+ crosscheck defects X1–X5) — VERIFIED
## Wave 2 — Phase 3 completion — VERIFIED
### Wave 2 review defects
## Wave 3 — Documentation overhaul (2026-10-05, uncommitted working tree) — `IN_PROGRESS`
## Later phases (open; STATUS.md is authoritative per capability)
## Verification protocol (every wave)
```

## NOTICE
*48 lines, 2131 bytes*
_(no declaration lines)_

## skills-lock.json
*132 lines, 5383 bytes*
```
version
skills
```

## go.mod
*116 lines, 5705 bytes*
_(no declaration lines)_

## wrangler.toml
*23 lines, 859 bytes*
```
[vars]
[assets]
```

## ARCH/00-INDEX.md
*129 lines, 20383 bytes*
```
# Architecture Index & Governance
## 1. Document Status & Precedence
### Document Hierarchy & Normative Authority
## 2. Document Registry
### Foundational Architecture (HLD)
### Low-Level Design Specifications (LLD)
### Companion Operational Guides
## 3. Glossary & Core Architectural Concepts
```

## ARCH/01-PRODUCT.md
*149 lines, 16600 bytes*
```
# Product Contract & User Experience
## 1. Product Identity
## 2. Problem Statement
## 3. Product Goals & Non-Goals
### Goals
### Non-Goals
### Forward-Looking Scope (all `DESIGNED`)
## 4. Multi-Stage Capability Lifecycle
## 5. User Journeys & Interaction Models
### 5.1 Interactive CLI Setup (`litespm`)
### 5.2 In-Agent Interaction (`/marketplace`)
## 6. Product Vocabulary
```

## ARCH/02-HLD.md
*280 lines, 26063 bytes*
```
# High-Level Design (HLD)
## 1. System Topology & Architecture
## 2. Process Separation: Bridge Shim vs. Local Daemon
### 2.1 The Bridge Shim (Thin Client)
### 2.2 The LiteSPM Daemon (Single Writer & Supervisor)
## 3. Concurrency & Transaction Model
## 4. Architectural Sequence Workflows
### 4.1 Catalog Search & Plan Resolution
### 4.2 Plan Approval & Transactional Installation
### 4.3 Policy-Checked Capability Invocation & Schema Drift
### 4.4 Daemon Startup & Crash Recovery
## 5. Trust Boundaries & Security Invariants
## 6. Control-Plane Extensions (`DESIGNED`)
```

## ARCH/03-CATALOG-SOURCES.md
*123 lines, 18214 bytes*
```
# Catalog and Source Federation
## 1. Upstream Federation Model
## 2. Decoupling the Adapter Roles
## 3. Supported Upstream Source Families
## 4. SourceSnapshot & Ingestion State Machine
### Freshness & Failure Semantics
## 5. Ingestion Security & SSRF Defense
## 6. Related Design Records (`DESIGNED`)
```

## ARCH/04-CLIENT-INSTALL.md
*292 lines, 21013 bytes*
```
# Client and Installation Design
## 1. Entry Points and Interactive Workflows
## 2. Interactive Setup Wizard & Agent Auto-Detection
### Step 1: Agent Selection
### Step 2: Automated Path Discovery & Detection Matrix
### Step 3: Graceful Fallback Options
### Step 4: Preview, Then Safe Atomic Configuration Injection
## 3. Local Storage Layout (`DATA_ROOT`)
## 4. Pure Dependency Resolver Algorithm
## 5. Update and Upstream Repack Handling
### 5.1 Passive Update Checks (target — partially implemented)
### 5.2 Update Delta Evaluation — `DESIGNED`
### 5.3 Upstream Repack Detection — `DESIGNED`
## 6. Removal and Garbage Collection
### What exists today
### Target algorithm — `DESIGNED` where noted
```

## ARCH/05-SECURITY.md
*230 lines, 29758 bytes*
```
# Security, Trust, and Credentials
## 1. Core Security Invariant
## 2. Artifact Extraction & Filesystem Safety
### 2.1 Extraction Safety Thresholds
### 2.2 Prohibited Archive Artifacts
## 3. Network Fetch Policy & SSRF Prevention
### 3.1 Enforced today
### 3.2 Still not enforced (`DESIGNED`)
### 3.3 User-Configured Local Sources
## 4. Nested MCP Capability Clamping
## 5. Capability Schema-Drift Defense
## 6. Effect Provenance & Unknown Tools
## 7. Command Marketplace Source Prohibition
## 8. Local Daemon IPC Permissions
## 9. Operating System Secret Storage
## 10. Honest Security Claims
```

## ARCH/06-API-CONTRACTS.md
*396 lines, 25466 bytes*
```
# API and Package Contracts
## 1. Static Catalog API (v1)
### 1.1 Endpoint inventory — what exists, what reads it, what the origin serves
### 1.2 Active Release Pointer (`/v1/current.json`)
### 1.3 Immutable Release Files (`/v1/releases/{release-id}/...`)
## 2. InstallPlan Contract
### 2.1 Current shape (Go serialization)
### 2.2 Schema alignment: Go type ≡ `schemas/install-plan.schema.json`
### 2.3 Cryptographic Plan Hashing Rule (matches the code)
## 3. Local Daemon IPC Contract (JSON-RPC 2.0)
### 3.1 Initial Handshake (`daemon.handshake`)
### 3.2 Supported IPC Methods (19 application handlers; `daemon.handshake` is §3.1)
## 4. Bridge MCP Tool Surface (In-Agent Access)
## 5. Standardized Machine Error Envelope
```

## ARCH/07-DECISIONS.md
*239 lines, 30383 bytes*
```
# Architecture Decision Records (ADRs)
## 1. Foundational Architecture Decisions (D-001 – D-010)
### D-001: Provider-Neutral Shared Product & Local Execution
### D-002: Product and Marketplace Naming
### D-003: Client-Side Downstream Credentials
### D-004: Static Catalog on Cloudflare Pages
### D-005: Source Federation over Monolithic Rewriting
### D-006: Preservation of Package Format Semantics
### D-007: Mandatory Local Plan & User Approval
### D-008: No Silent Auto-Updates by Default
### D-009: Integration-Based Host Support
### D-010: One-Time Host Bridge Registration
## 2. Core Implementation Decisions (D-011 – D-020)
### D-011: Single-Writer Local Control Plane (Daemon)
### D-012: SQLite (WAL) + Content-Addressed Storage (CAS)
### D-013: Split Bridge Architecture (Stateless Shims)
### D-014: Statically Linked Native Adapters in v1
### D-015: Cryptographic Plan Binding (InstallPlan v2)
### D-016: Capability Schema-Drift Invalidates Grants
### D-017: Hand-Rolled MCP JSON-RPC & Named Protocol Profiles
### D-018: TUF Metadata Framework for Future Signed Releases
### D-019: Prohibition of Command Marketplace Sources
### D-020: Five-Stage Support Taxonomy
## 3. Later Decisions (D-021 – D-025)
### D-021: Delete the Connector Package; Re-Wiring Requires a New Decision
### D-022: Canonical Catalog Builder Is the Go `catalogbuild` (D4 — contested, open)
### D-023: Binding Evidence-State Vocabulary
### D-024: Rename to LiteSPM, with Legacy Adoption
### D-025: Restart/Retry Yes, Blind Write-Fallback No
## 4. Product-Surface Decisions (D-026 – D-029)
### D-026: Positioning Line and Product-First Landing
### D-027: Three Visual Densities, Not One Page Language
### D-028: Porting Goes Through One Canonical IR, Never Pairwise Translators
### D-029: Help Documents Only Shipped Commands
## 5. Remote (URL) MCP & Shared Egress (D-030 – D-031)
### D-030: One Shared Egress Guard for Catalog Fetches and MCP Transports
### D-031: `metadata_verified` Extends to Endpoint-Backed MCP Rows From the Registry's Own `remotes[]`
```

## ARCH/08-DELIVERY.md
*236 lines, 23520 bytes*
```
# Delivery Plan & Quality Gates
## 1. Staged Delivery Methodology
### 1.1 Where each phase actually stands
## 2. Phase Breakdown and Acceptance Gates
### Phase A: Architecture Freeze & Schemas (Prerequisite)
### Phase B: Foundation & Storage Layer
### Phase C: Static Catalog & Discovery Plane
### Phase D: Safe Artifact Extraction & Skill Management
### Phase E: Process Supervision, Bridge Shim & Host Adapters
### Phase F: MCP Protocol Profiles, Secrets & OAuth
### Phase G: Marketplace Federation, In-Agent `/marketplace` & CLI TUI
### Phase H: Cross-Platform Build, Conformance & Packaging
### Phase I: Golden Fixtures, Self-Update & Migrations
## 3. Explicitly Deferred Features (Non-Goals for v1)
### 3.1 The `DESIGNED` backlog this plan does not schedule
```

## ARCH/09-RESEARCH.md
*96 lines, 12605 bytes*
```
# Research Ledger & Ecosystem Ground Truth
## 1. Model Context Protocol (MCP)
### 1.1 The 2026-07-28 Protocol Revision
### 1.2 Official MCP Registry & `server.json`
## 2. Agent Skills Specification
## 3. Claude Code Plugin Marketplaces
## 4. OpenAI Portable Agent Plugins
## 5. Grok Build Plugin Marketplaces
## 6. Supply-Chain Provenance & Metadata Verification
## 7. Static Hosting & Cloudflare Pages Limits
```

## ARCH/10-DOMAIN-MODEL.md
*366 lines, 25382 bytes*
```
# Domain Model & Canonical Identifiers
## 1. Canonical Identifier Grammars
### 1.1 Identifier grammars and their state
## 2. Core Domain Entities
### 2.1 Listing
### 2.2 VersionRecord
### 2.3 ArtifactRef
### 2.4 Component
### 2.5 InstallRecord & Project-Scoped State
### 2.6 HostRegistrationRecord
### 2.7 AuthProfile
### 2.8 CapabilityGrant & Identity Binding
### 2.9 EffectDeclaration & Provenance
### 2.10 CompatibilityFact
## 3. Cryptographic & Canonical Hashing (RFC 8785)
### 3.1 Plan Hash (`planHash`)
### 3.2 Schema Fingerprint (`schemaFingerprint`)
```

## ARCH/11-LOCAL-RUNTIME-IPC.md
*286 lines, 15485 bytes*
```
# Local Runtime & IPC Architecture
## 1. Daemon Process Lifecycle
### 1.1 Exclusive Instance Locking
### 1.2 Autostart Behavior — `DESIGNED`, not implemented
## 2. Platform IPC Transports
### 2.1 Windows Named Pipes
### 2.2 Linux & macOS Domain Sockets
## 3. IPC Protocol Contract (JSON-RPC 2.0)
### 3.1 Handshake Procedure (`daemon.handshake`)
### 3.2 Request Cancellation (`$/cancelRequest`)
```

## ARCH/12-STORAGE-TRANSACTIONS-RECOVERY.md
*366 lines, 14067 bytes*
```
# Storage, Transactions & Crash Recovery
## 1. SQLite Engine Configuration
## 2. Schema DDL: The 22 Core Relational Tables
## 3. The 14-State Operation Journal
## 4. Crash Recovery Algorithm
```

## ARCH/13-RESOLVER-INSTALL-ENGINE.md
*214 lines, 12010 bytes*
```
# Resolver & Installation Engine
## 1. Pure Dependency Resolver
### 1.1 Cycle Detection & Diamond Dependency Resolution Algorithm
### 1.2 Version-less listings resolve to the release's implicit pin (2026-10-08)
## 2. Safe Extraction Pipeline
## 3. Two-Phase Atomic Commit Pipeline & Safe CAS Rollback
### Safe CAS Rollback Rules
```

## ARCH/14-BRIDGE-PROVIDER-MCP.md
*372 lines, 23505 bytes*
```
# Bridge, Provider Supervisor & MCP Client
## 1. Bridge Shim Architecture
### 1.1 Real dispatch API
### 1.2 The 13 tools and what each resolves to today
## 2. Provider Supervisor & Process Isolation
### 2.1 Process Cleanup Guarantees
### 2.2 Launch Specification Construction
## 3. Dual MCP Protocol Support (`internal/mcpclient`)
### 3.1 Constructors and probes (exact signatures)
### 3.2 Modern Profile (2026-07-28)
### 3.3 Legacy Profile (2025-11-25)
## 4. Routed vs. Projected Capability Execution
### 4.1 Cryptographic Identity Binding Verification
## 5. Provider health, circuit breaking, fallback — `DESIGNED`
```

## ARCH/15-POLICY-APPROVALS.md
*166 lines, 14332 bytes*
```
# Policy Engine & Approvals Architecture
## 1. Canonical Effect Taxonomy
### 1.1 Effect Provenance & Unknown Tools
## 2. Policy Engine Evaluation Contract
### 2.1 Decision Precedence (current engine reality)
## 3. Approval Channels & Replay Prevention
## 4. Capability Grants & Strong Identity Binding
### Automatic Invalidation on Schema or Code Drift
## 5. Failure, Retry & Fallback Policy
```

## ARCH/16-HOST-ADAPTERS.md
*522 lines, 42968 bytes*
```
# Host Adapters & In-Agent UX
## 1. Extensible HostAdapter Architecture
## 2. Advisory & Metadata Discovery
## 3. Supported Agent Adapters
### 3.1 Cline (VS Code Extension) (`internal/host/cline.go`)
### 3.2 Pi Agent (`pi-coding-agent`) (`internal/host/piagent.go`)
### 3.3 Grok Build (`internal/host/grokbuild.go`)
### 3.4 Claude Code (`internal/host/claudecode.go`)
### 3.5 OpenAI Codex (`internal/host/codex.go`)
### 3.6 OpenCode (`internal/host/opencode.go`)
### 3.7 Data-driven targets: 46 generic + 6 bespoke = 52 total (`internal/host/target.go`, `ARCH/30`)
#### 3.7.2 Server-entry install (catalog MCP servers)
#### 3.7.1 Config-write contract (all hosts, bespoke and generic)
#### 3.7.3 Forwarding environment variables (`--env <NAME>`)
#### 3.7.4 Remote (URL) server entries
## 4. In-Agent `/marketplace` Experience & Capability Browser
### 4.1 Portable Contract vs. Rich Host UI — and what actually resolves
### Tab 1: MCP Servers
### Tab 2: Agent Skills
### Tab 3: Plugins
### Tab 4: Installed & Detected External Capabilities
## 5. In-Agent Marketplace Command Registration — `WIRED` (17 hosts; popups `Verified` for 4, prompt commands for 1)
## 6. Cross-Agent Porting Contract (`DESIGNED`)
### 6.1 Read side (exists)
### 6.2 IR and render side (exists)
### 6.3 Support check (exists)
### 6.4 Write side (exists, reused unchanged)
```

## ARCH/17-SOURCE-ARTIFACT-RUNTIME-ADAPTERS.md
*174 lines, 11537 bytes*
```
# Source, Artifact & Runtime Adapters
## 1. Architectural Decoupling
## 2. Source Adapter Interface (compiled)
### 2.1 Implementations (eight)
### 2.2 Normative constraints
## 3. Artifact Layer (`internal/artifact`) — compiled exports
## 4. Artifact Fetcher Interface — `HTTPArchiveFetcher` implemented
## 5. Runtime Adapter Interface — launch planning `IMPLEMENTED`, materialisation `DESIGNED`
## 6. Precedence & Related Documents
```

## ARCH/18-CATALOG-BUILDER-RELEASE-SEARCH.md
*273 lines, 16938 bytes*
```
# Catalog Builder, Release Architecture & Search
## 1. Deterministic CI Catalog Builder
### 2.1 Sharding is a transport split, not that shard design
## 2. Public Distribution File Structure
### 2.1 Manifest Verification (`manifest.json`)
## 3. Client Search Index & Deterministic Ranking
### 3.1 Deterministic Lexical Scoring Algorithm
## 4. Cache Control & CDN Policies
# Immutable release directory (forever cached)
# Pointer file (always revalidate)
# Signature bundle for the pointer (revalidate with it; never immutable)
## 5. Public Dist Allowlist (CI Leak Protection)
```

## ARCH/19-SECRETS-OAUTH.md
*202 lines, 13342 bytes*
```
# Secrets Management & OAuth Architecture
## 1. SecretStore Interface
### 1.1 Launch-time resolution
## 2. Platform-Specific Secret Vault Backends
### 2.1 The "halt on vault failure" invariant is enforced
## 3. AuthBroker & OAuth 2.0 PKCE Loopback — `WIRED`
### 3.1 Loopback Security Rules
## 4. Persistent Auth Profiles & Secret Linkage
## 5. Configuration & environment precedence
```

## ARCH/20-ERRORS-AUDIT-DOCTOR.md
*152 lines, 12995 bytes*
```
# Errors, Audit & Doctor Framework
## 1. Stable Machine Error Taxonomy
### 1.1 Representative Machine Error Codes
### 1.2 Full Inventory of Codes in the Tree (emission status)
## 2. CLI Exit Code Contract
## 3. Local Audit Log & Redaction
## 4. The `doctor` Diagnostic Framework
### The `--repair` Flag
```

## ARCH/21-TESTING-CONFORMANCE.md
*89 lines, 5548 bytes*
```
# Testing & Conformance Architecture
## 1. Testing Pyramid
## 2. Property-Based Testing
## 3. Hostile Archive Cases (generated in-code — no `fixtures/hostile/` directory)
## 4. Crash-Injection Fault Matrix (`DESIGNED` — no harness in tree)
## 5. MCP Conformance Test Matrix (`DESIGNED` — not executed)
## 6. Secret-Leak Canary Scans
```

## ARCH/22-PLATFORM-RELEASE-MIGRATIONS.md
*78 lines, 7367 bytes*
```
# Platform, Release Engineering & Migrations
## 1. Cross-Platform Compilation Matrix
## 2. Database Migration Lifecycle
### Migration Rules
## 3. Binary Self-Update Architecture
## 4. npm release publication gate
```

## ARCH/23-SCHEMAS-EXAMPLES.md
*242 lines, 10146 bytes*
```
# Schemas & Validation Examples
## 1. Canonical Schema Registry
### 1.1 The validator (`internal/schemacheck`)
## 2. Specification: `install-plan.schema.json`
## 3. Concrete Example Fixtures
### 3.1 Valid Listing Fixture
```

## ARCH/24-FUNCTION-INVENTORY.md
*113 lines, 10004 bytes*
```
# Function Inventory — Aspirational Map
## 1. Actual entry points per package
### Removed / non-existent packages
## 21. Package: `internal/agent` (the one section that matches the tree)
## Authority
```

## ARCH/25-WEB-FRONTEND-UI.md
*377 lines, 26078 bytes*
```
# Web Frontend & UI Architecture (LiteSPM Market)
## 1. Design Vision & Aesthetic Standards
## 2. Page Sections & Component Hierarchy
## 3. Key UI Elements
### 3.1 Header & Dynamic Telemetry Badge
### 3.2 Dynamic Omni-Search & Category Facets
### 3.3 Extension Cards
### 3.4 Package Detail Page (`/package/<slug>`)
## 4. Technical Stack & Deployment
## 5. Design System — Three Densities (J001, `IMPLEMENTED`)
### 5.1 Tokens
### 5.2 Type roles (IBM Plex retained)
### 5.3 Size & motion
### 5.4 Honesty overlay (binding on every surface)
## 6. Landing Page (J002, `IMPLEMENTED`)
## 7. Component & Page Specs (J003–J009; J003/J005/J009 `IMPLEMENTED`, J004/J006–J008 `DESIGNED`)
### 7.1 Two card components, two layers (J003, `IMPLEMENTED`)
### 7.2 Explore additions (J004, `DESIGNED`)
### 7.3 Package page restructure (J005, `IMPLEMENTED`)
### 7.4 Agent Atlas & compare (J006/J007, `DESIGNED`)
### 7.5 Routes & palette (J008 `DESIGNED`, J009 `IMPLEMENTED`)
## 8. User Flows (J002, `IMPLEMENTED`)
### 8.1 Two journeys, one site
### 8.2 Agent-selector state flow
```

## ARCH/26-ECOSYSTEM-IA-PACKAGE-MODEL.md
*622 lines, 48751 bytes*
```
# Ecosystem IA & Package Model
## 1. Status & Precedence
## 2. Ecosystem Snapshot (Informative)
## 3. Core Architectural Decision: Neutral `Package` / `Capability`
### 3.1 Decision
### 3.2 Explicitly rejected: "MCP is the top-level object"
### 3.3 Explicitly rejected: "Plugin is the top-level object"
### 3.4 Internal taxonomy (normative list)
### 3.4.1 Deferred to v2
### 3.4.2 v1 type support status (data reality)
### 3.5 Target v2 record shape (not yet implemented)
## 4. Gap Analysis vs Current Repository
### 4.1 Kind enum vs target type taxonomy
### 4.2 Dataset fields vs target
### 4.3 Trust signal status (fixed — verify, do not regress)
### 4.4 Routing, navigation, and categories
## 5. Source Adapter Matrix (Normative Target)
## 6. Website Information Architecture (Normative)
### 6.1 Primary navigation
### 6.2 Routes
### 6.3 Detail-page serving model
## 7. Page Specifications
### 7.1 `/` — curated, sparse, search-first
### 7.2 `/explore` — power filters
### 7.3 `/package/<slug>` — detail
### 7.4 Trust & provenance UX
## 8. Card Specification
## 9. LiteSPM Differentiator: Compatibility-First
## 10. Explicit Separation: Public Website vs `/marketplace` TUI
## 11. Change Ledger
### 11.1 Design
### 11.2 Add
### 11.3 Refactor
### 11.4 Update
### 11.5 Remove
## 12. Phased Roadmap & Acceptance
### M1 — Website IA
### M2 — Data model + source adapters
### M3 — Trust / security signals
### M4 — Publisher / collections
### M5 — TUI
### v2 (post-v1) — Deferred capability types
### 12.4 Binding rule: do not fabricate usage/security data
## 13. Open Questions (Tracked, Not Decided Here)
```

## ARCH/27-CAPABILITY-SOURCE-SUPPORT-MATRIX.md
*243 lines, 35305 bytes*
```
# Capability & Source Support Matrix
## 0. Scope, honesty rule, and reading the status labels
## 1. The v1 Capability Types
### 1.1 `mcp` — Model Context Protocol server
### 1.2 `skill` — Agent Skill (`SKILL.md`)
### 1.3 `plugin` — packaging bundle
### 1.4 `agent` — installable agent runtime and/or agent definition
### 1.5 `rule` — persistent instruction/policy
### 1.6 `hook` — lifecycle event handler
### 1.7 `tool` — native (non-MCP) tool extension / MCP tool
### 1.8 `lsp` — language server
## 2. Package Sources
## 3. Summary Matrix
## 4. Verification Status
### 4.1 Commands used and observed results (2026-10-02, repo `/home/sarvesh/business_Dev/liteSPM`)
### 4.2 What these checks do and do not prove
### 4.3 ACP note (per instruction)
## 5. Honest gaps summary
```

## ARCH/28-ACP-AGENT-DOCS-VERIFICATION.md
*197 lines, 12503 bytes*
```
# ACP Agent Documentation Verification
## 0. Scope and method
### Verdict vocabulary
## 1. Per-agent findings
## 2. Corrections applied (`internal/agent/overrides.go`)
### 2.1 Launch-affecting
### 2.2 Environment injection
### 2.3 Deprecation
### 2.4 Informational notes (no launch change)
## 3. Corrections deliberately *not* applied
## 4. Binary digest coverage
## 5. Consequences for the adapter
## 6. Remaining verification work
```

## ARCH/29-CONNECTOR-SYSTEM-DESIGN.md
*320 lines, 29420 bytes*
```
# ARCH-29 — Connector System: Local Proxy Execution & Credential Custody
## 1. Why this document exists
## 2. The question that decides the design
## 3. Reference architectures: what was taken and what was refused
### 3.1 Licensing posture comes first
### 3.2 Adopted, with attribution
### 3.3 Explicitly refused
## 4. Proposed architecture
### 4.1 The boundary is enforced by process isolation, not convention
### 4.2 Data model
## 5. Open design questions, recorded not resolved
### 5.1 Minimum viable connector definition
### 5.2 Read and write consent are separate
### 5.3 The vault is the only OAuth client
### 5.4 Health is derived, and refresh is lazy
### 5.5 Triggers are a different problem from actions
## 6. What does not exist
## 7. Evidence
## 8. Status and next steps
```

## ARCH/30-DATA-DRIVEN-BRIDGE-TARGETS.md
*191 lines, 19451 bytes*
```
# ARCH-30 — Data-Driven Agent Bridge Targets
## 1. Problem
## 2. Decision
## 3. Honesty contract
## 4. Config writing is surgical
## 5. Supported shapes
## 6. Path resolution
## 7. Integrity tests
## 8. Verification
### 8.1 Host documentation audit — 2026-10-06
### 8.2 Cross-platform host additions and website path matrix — 2026-11-08
## 9. Known limitations
## 10. Relationship to the 81 skill targets
```

## ARCH/31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md
*519 lines, 55798 bytes*
```
# Competitive Landscape, Proposal Adjudication & Ordered Roadmap
## 1. Status & Precedence
## 2. Evidence vocabulary (binding, repo-wide)
## 3. Competitor positions (what was actually verified)
### 3.1 Verified as described
### 3.2 NOT verified — do not build on these
### 3.3 Where the external analysis was wrong
### 3.4 What re-verifying Microsoft APM corrected (2026-10-06)
## 4. New defects found in this repository during the comparison
### 4.1 The agent-facing install path cannot complete — `WIRED` is false
### 4.2 The published catalog and the client read different files — the sync path is dead at the origin
### 4.3 Decision D4 is contradicted by the repository — there are two catalog builders
### 4.4 `ARCH/18` specifies an output tree the compiler does not produce
## 5. Adjudication of the 60 proposals
## 6. ADD
## 7. UPGRADE
## 8. REFINE
## 9. OPTIMIZE
## 10. REMOVE
## 11. CREATE NEW
## 12. Ordered backlog
## 13. Forbidden claims (binding)
```

## ARCH/32-MANIFEST-LOCK-INTEROP.md
*260 lines, 15895 bytes*
```
# Manifest, Lockfile & Interoperability
## 1. Purpose & Invariants
## 2. Project Manifest — `litespm.yml`
# litespm.yml
# Direct, human-authored requirements. Transitive deps are resolved, not written here.
# Policy for this project (tighten-only; see ARCH/36).
# Optional cadence for `litespm lock --check` in CI.
## 3. Lockfile — `litespm.lock`
# litespm.lock — generated; do not edit by hand
# A stable content digest over the canonical-JSON projection of `resolved`.
## 4. Lock Operations
### 4.1 SBOM export
## 5. Interoperability
## 6. Canonical Identity & Alias Graph
## 7. Acceptance Test Sketch
## 8. Related Documents
```

## ARCH/33-DEPLOYMENT-LEDGER-RECONCILIATION.md
*151 lines, 9247 bytes*
```
# Deployment Ledger & Three-Way Reconciliation
## 1. Problem
## 2. `DeploymentMutation` Ledger
### 2.1 Relationship to `host_backups`
### 2.2 Image hashes
## 3. Locator Grammar
## 4. Three-Way Reconciliation
## 5. Uninstall Semantics
## 6. Update Semantics
## 7. Acceptance Test Sketch
## 8. Related Documents
```

## ARCH/34-RUNTIME-INVOCATION-RECEIPTS.md
*215 lines, 14900 bytes*
```
# Runtime, Invocation Engine & Receipts
## 1. Capability Registry
## 2. Invocation API
## 3. Invocation Engine
## 4. Provider Health & Circuit Breaker
## 5. Bounded Output
## 6. Tamper-Evident Invocation Receipts
## 7. Cross-Provider Fallback
## 8. Acceptance Test Sketch
## 9. Related Documents
```

## ARCH/35-PROFILES-AND-CAPABILITY-LEASES.md
*140 lines, 8148 bytes*
```
# Profiles & Capability Leases
## 1. Why Profiles
## 2. Profile Model
# profile: acme-backend.senior-review
## 3. Profile Verbs
## 4. OCI Distribution
## 5. Capability Leases
## 6. Acceptance Test Sketch
## 7. Related Documents
```

## ARCH/36-ENTERPRISE-POLICY-AND-AUDIT.md
*171 lines, 10198 bytes*
```
# Enterprise Policy, Audit, Provenance & Supply-Chain Trust
## 1. Tighten-Only Policy Hierarchy
### 1.1 `PolicyDecision.provenance`
### 1.2 `litespm policy explain`
## 2. `litespm audit --ci`
## 3. Advisories, Revocation & Quarantine
## 4. TUF-Style Signed Catalog
## 5. SBOM & Provenance
## 6. Air-Gapped Bundles
## 7. Acceptance Test Sketch
## 8. Related Documents
```

## ARCH/37-TUI-AND-COMPLETION.md
*139 lines, 8438 bytes*
```
# TUI, Local Dashboard & Shell Completion
## 1. The Prime Constraint: Zero Business Logic
## 2. TUI as a First-Class Front-End
### 2.1 Tabs
### 2.2 Keybindings & Accessibility
## 3. Staged-Plan "Tray"
## 4. Local Dashboard vs Public Site
## 5. Shell Completion
## 6. `litespm why`
## 7. Acceptance Test Sketch
## 8. Related Documents
```

## ARCH/38-CLI-PRODUCT-SURFACE.md
*493 lines, 23051 bytes*
```
# CLI Product Surface: Port, Orient & Help
## 1. Purpose & Invariants
## 2. Command Taxonomy
## 3. Help System (`IMPLEMENTED` — `cmd/litespm/help.go`)
### 3.1 Structure
### 3.2 LLD
### 3.3 `help concepts`
## 4. `list` and `inventory` (`IMPLEMENTED` — `cmd/litespm/list.go`)
## 5. `copy` — cross-agent porting (`IMPLEMENTED` — `cmd/litespm/copy.go`, `internal/porting`)
### 5.1 Problem & non-goals
### 5.2 HLD — one intermediate representation
### 5.3 LLD — package layout & types
### 5.4 CLI surface
### 5.5 Secrets (normative)
### 5.6 `copy` vs neighbours
### 5.7 Error families (for future `help error <code>`)
### 5.8 Acceptance sketches
## 6. Orient commands (`status`/`diff`/`why`/`outdated`)
## 7. Profiles as "Setups" (pointer)
## 8. Plan/apply spine (pointer)
## 9. Related documents
```

## ARCH/39-SYSTEM-SPECIFICATION.md
*493 lines, 48165 bytes*
```
# 39 — System Specification & Operations Guide
## 1. System Architecture: "What Is What"
### 1.1 The Bridge Shim (Stateless Stdio Facade)
### 1.2 The LiteSPM Daemon (Single-Writer Control Plane)
### 1.3 Storage Layer (`DATA_ROOT`)
## 2. End-to-End Workflows
### 2.1 Global Installation & Interactive Setup (`litespm`)
### 2.2 Skill Installer (`litespm skills add`)
### 2.3 Non-Destructive Update Checking (`DESIGNED`)
### 2.4 The In-Agent `/marketplace` Experience
### 2.5 Capability Schema-Drift & Identity Protection (`WIRED` for the drift gate, `WIRED` for grants)
## 3. Supported Agent Ecosystem
## 4. Repository Structure & Architectural Guide
### 4.1 Command-line surface
## 5. Technical Stack & Development Invariants
## 6. Environment, Origins & Release Order
### Environment variables
### Compiled origins must resolve
### Release order: GitHub assets before npm
## 7. License & Legal
```

## ARCH/40-ASK-AI-ASSISTANT.md
*174 lines, 19749 bytes*
```
# Ask AI: Conversational Assistant, Hybrid RAG and Tool Runtime
## Product contract
## Request orchestration
## Documentation ingestion and RAG
### Optional semantic embeddings
## Catalog retrieval
## Function tools
## Conversation history and memory
## Embedded UI objects
## Evaluation and checks
## Known limitations / release gates
## Deferred follow-up work (not part of the current audit pass)
### True semantic retrieval
### Bounded multi-step tool orchestration
### Native in-agent marketplace UI across hosts
## Audit observations — 2026-11-08
## Remediation pass — 2026-11-08
### Release compatibility remediation
### Ask AI host registry and setup remediation
```

## schemas/catalog-release.schema.json
*76 lines, 1568 bytes*
```
$schema
$id
title
type
required
properties
additionalProperties
```

## schemas/errors.schema.json
*21 lines, 612 bytes*
```
$schema
$id
title
type
required
properties
additionalProperties
```

## schemas/install-plan.schema.json
*189 lines, 5256 bytes*
```
$schema
$id
title
type
required
properties
additionalProperties
```

## schemas/listing.schema.json
*142 lines, 3921 bytes*
```
$schema
$id
title
type
required
properties
additionalProperties
```

## schemas/source.schema.json
*156 lines, 3428 bytes*
```
$schema
$id
title
type
required
properties
additionalProperties
```

## schemas/version.schema.json
*188 lines, 5736 bytes*
```
$schema
$id
title
type
required
properties
additionalProperties
```

## .github/DEPENDENCY-LICENSE-INVENTORY.md
*70 lines, 4528 bytes*
```
# Dependency License Inventory
## Go modules (linked into the `litespm` binary)
### Transitive / bundled third-party notices
## npm package (`npm/package.json`)
## Unresolved
```

## .github/ISSUE_TEMPLATE/new-listing.yml
*80 lines, 3016 bytes*
```
name: New listing
description: Suggest an MCP server, agent skill, or plugin for catalog review.
title: "[Listing] "
body:
```

## .github/workflows/catalog-sync.yml
*84 lines, 2337 bytes*
```
name: Catalog & Rankings Sync
on:
concurrency:
jobs:
```

## .github/workflows/ci.yml
*250 lines, 8952 bytes*
```
name: CI
on:
permissions:
concurrency:
jobs:
```

## .github/workflows/release-audit.yml
*34 lines, 970 bytes*
```
name: Release journey verification
on:
permissions:
jobs:
```

## .github/workflows/release.yml
*286 lines, 12886 bytes*
```
name: Release
on:
permissions:
concurrency:
jobs:
```

## test/archive_install_e2e_test.go
*141 lines, 4268 bytes*
```
package test
import (
func zipBytes(t *testing.T, files map[string][]byte) []byte {
func TestArchiveInstallEndToEnd(t *testing.T) {
```

## test/canary_test.go
*251 lines, 9248 bytes*
```
package test
import (
const (
func findCanaries(haystack string, canaries []string) []string {
func scanTree(root string, canaries []string) (hits []string, scanned int, err error) {
func scanFile(path string, canaries []string, required bool) ([]string, error) {
func assertDetectorFails(t *testing.T, canaries []string) {
func TestSecurity_ZeroPlaintextSecretCanaryLeak(t *testing.T) {
```

## test/catalog_e2e_test.go
*138 lines, 4730 bytes*
```
package test
import (
func TestCatalogRelease_EndToEnd(t *testing.T) {
```

## test/conformance_test.go
*352 lines, 11249 bytes*
```
package test
import (
type pipeListener struct {
func newPipeListener() *pipeListener {
func (l *pipeListener) Accept() (net.Conn, error) {
func (l *pipeListener) Close() error {
func (l *pipeListener) Addr() net.Addr { return pipeAddr{} }
type pipeAddr struct{}
func (pipeAddr) Network() string { return "pipe" }
func (pipeAddr) String() string { return "pipe" }
type conformanceListingProvider struct {
func (c *conformanceListingProvider) GetListing(ctx context.Context, listingID string) (*domain.Listing, error) {
func (c *conformanceListingProvider) GetListingVersions(ctx context.Context, listingID string) ([]resolver.ListingVersio
func createSyntheticArchive(t *testing.T, listingID string) []byte {
func TestE2E_FullLifecycleConformance(t *testing.T) {
```

## test/fuzz_hostile_archive_test.go
*114 lines, 2951 bytes*
```
package test
import (
func TestHostileArchive_ZipSlipPathTraversal(t *testing.T) {
func TestHostileArchive_WindowsDriveLetterEscape(t *testing.T) {
func TestHostileArchive_CaseCollisionRejection(t *testing.T) {
func TestHostileArchive_SymlinkInTarGzRejected(t *testing.T) {
```

## fixtures/hosts/claude/claude.json
*9 lines, 119 bytes*
```
mcpServers
```

## fixtures/hosts/cline/existing_servers_cline_mcp_settings.json
*18 lines, 406 bytes*
```
mcpServers
```

## fixtures/hosts/codex/config.toml
*4 lines, 90 bytes*
```
[mcp_servers.memory]
```

## fixtures/hosts/grok/valid_grok_config.toml
*9 lines, 167 bytes*
```
[general]
[mcp_servers.sqlite]
```

## fixtures/hosts/opencode/opencode_v1.json
*9 lines, 114 bytes*
```
mcp
```

## fixtures/hosts/opencode/opencode_v2.json
*11 lines, 141 bytes*
```
mcp
```

## fixtures/hosts/pi/valid_mcp.json
*10 lines, 145 bytes*
```
model
mcpServers
```

## fixtures/source/acp/registry.json
*1548 lines, 56738 bytes*
```
version
agents
extensions
```

## fixtures/source/claude/marketplace.json
*39 lines, 1290 bytes*
```
name
owner
metadata
plugins
```

## fixtures/source/codex/marketplace.json
*30 lines, 890 bytes*
```
name
interface
plugins
```

## fixtures/source/cursor/marketplace.json
*23 lines, 634 bytes*
```
name
owner
metadata
plugins
```

## fixtures/source/grok-official/marketplace.json
*28 lines, 807 bytes*
```
name
description
owner
plugins
```

## worker/index.js
*31 lines, 1282 bytes*
```
const DEFAULT_WEB_ORIGIN = "https://lite-spm-nine.vercel.app";
export default {
```

# CLI LAYER — cmd/litespm (107 Go files)

## cmd/litespm/adopt.go
*338 lines*
```
package main
import (
const adoptUsage = `Usage: litespm adopt <name> --host <host-id> [--scope user|project] [--workspace <dir>]
type adoptOptions struct {
func parseAdoptArgs(args []string) (adoptOptions, error) {
func runAdopt(args []string) int {
type adoptOutcome struct {
func adoptHostEntry(ctx context.Context, db *state.DB, opts adoptOptions) (*adoptOutcome, error) {
func runAdoptTo(out, errOut io.Writer, db *state.DB, opts adoptOptions) int {
func adoptInstallID(hostID, name string, scope domain.InstallScope) string {
```

## cmd/litespm/adopt_test.go
*310 lines*
```
package main
import (
type adoptFixture struct {
func newAdoptFixture(t *testing.T) *adoptFixture {
func (f *adoptFixture) configBytes(t *testing.T) []byte {
func TestAdoptRecordsOwnershipWithTheCurrentImage(t *testing.T) {
func TestRemovingAnAdoptedNodeRestoresThePreImage(t *testing.T) {
func TestAdoptRefusesANameTheHostDoesNotRegister(t *testing.T) {
func TestAdoptRefusesAnUnknownHost(t *testing.T) {
func TestAdoptUsageErrorsAreUsageErrors(t *testing.T) {
func TestAdoptedEntryEditedByTheUserIsKept(t *testing.T) {
func TestAdoptRecordsTheEntryInTheInstallLedger(t *testing.T) {
```

## cmd/litespm/audit.go
*391 lines*
```
package main
import (
const auditUsage = `Usage: litespm audit [--ci] [--sarif <path>] [--dataset <path>] [--json]
type auditOptions struct {
func parseAuditOptions(args []string) (*auditOptions, error) {
func runAudit(args []string) int {
func auditCatalogueRows(ctx context.Context, paths *config.PlatformPaths, datasetPath string) ([]scan.Row, string, error
func cachedReleaseID(paths *config.PlatformPaths) (string, error) {
func cachedListingRows(paths *config.PlatformPaths, releaseID string) ([]scan.Row, error) {
func auditReceiptChain(paths *config.PlatformPaths) error {
func writeAuditSARIF(path string, findings []scan.Finding) error {
```

## cmd/litespm/audit_events_test.go
*205 lines*
```
package main
import (
func auditRows(t *testing.T, h *harness) [][]string {
type sqlNullString struct {
func (s *sqlNullString) Scan(v any) error {
func (s *sqlNullString) value() string {
func findAuditRow(rows [][]string, action string) []string {
func TestInstallExecuteWritesAuditEvent(t *testing.T) {
func TestInstallExecuteRefusalIsAuditedAsDeny(t *testing.T) {
```

## cmd/litespm/audit_test.go
*160 lines*
```
package main
import (
func TestAuditFailsOnADatasetThatContradictsThePromises(t *testing.T) {
func TestAuditPassesOnASoundDataset(t *testing.T) {
func TestAuditWritesSARIF(t *testing.T) {
func TestAuditRejectsAnUnknownArgument(t *testing.T) {
func TestAuditReadsTheCachedRelease(t *testing.T) {
```

## cmd/litespm/auth.go
*452 lines*
```
package main
import (
const authUsage = `Usage: litespm auth <login|status|logout> [arguments]
type authEnv struct {
func runAuth(args []string) int {
func runAuthTo(out, errOut io.Writer, env *authEnv, args []string) int {
type authLoginOptions struct {
func parseAuthLoginArgs(args []string) (authLoginOptions, error) {
func runAuthLogin(ctx context.Context, out, errOut io.Writer, env *authEnv, args []string) int {
func runAuthStatus(ctx context.Context, out, errOut io.Writer, env *authEnv, provider string) int {
func printAuthProfile(out io.Writer, prof *domain.AuthProfile) {
func runAuthLogout(ctx context.Context, out, errOut io.Writer, env *authEnv, args []string) int {
func openURLInBrowser(rawURL string) error {
```

## cmd/litespm/auth_test.go
*434 lines*
```
package main
import (
func authTestEnv(t *testing.T) *authEnv {
func seedAuthProfile(t *testing.T, env *authEnv, provider, profileID, token string) {
func TestAuthStatusReportsAStoredProfile(t *testing.T) {
func TestAuthStatusForOneProvider(t *testing.T) {
func TestAuthLoginCompletesTheLoopback(t *testing.T) {
func TestAuthLoginFailsClosedWhenTheTokenEndpointRefuses(t *testing.T) {
func TestAuthLogoutRevokesTheCredential(t *testing.T) {
func TestAuthLogoutKeepsARevokedProfileAProviderStillNames(t *testing.T) {
func TestAuthUsageErrorsAreUsageErrors(t *testing.T) {
func TestAuthLoginReadsTheClientSecretFromTheEnvironment(t *testing.T) {
func TestAuthProfileListingNeverCarriesACredential(t *testing.T) {
```

## cmd/litespm/auto_sync.go
*288 lines*
```
package main
import (
const (
type autoSyncStamp struct {
func autoSyncStampPath(paths *config.PlatformPaths) string {
func autoSyncLockPath(paths *config.PlatformPaths) string {
func autoSyncLogPath(paths *config.PlatformPaths) string {
func autoSyncDisabled() bool {
func autoSyncCommandAllowed(args []string) bool {
func commandNeedsCatalog(args []string) bool {
func catalogCached(paths *config.PlatformPaths) bool {
func maybeAutoSyncCatalog(args []string) {
func stampFresh(paths *config.PlatformPaths, now time.Time) bool {
func writeStamp(paths *config.PlatformPaths, now time.Time) {
func writeFileAtomic(path string, data []byte) error {
func autoSyncRunning(paths *config.PlatformPaths) bool {
func startBackgroundSync(paths *config.PlatformPaths, now time.Time) {
func acquireSyncLock(paths *config.PlatformPaths) (func(), bool) {
func newSyncClient(paths *config.PlatformPaths) (*catalog.Client, *config.Config) {
func runAutoSync() int {
func foregroundFirstSync(paths *config.PlatformPaths, w io.Writer) {
func autoSyncNoticeForEmptyCatalog(paths *config.PlatformPaths) string {
```

## cmd/litespm/auto_sync_test.go
*138 lines*
```
package main
import (
func TestAutoSyncCommandPolicy(t *testing.T) {
func splitWords(s string) []string {
func TestAutoSyncStampAndLock(t *testing.T) {
func TestAutoSyncIsOffInTests(t *testing.T) {
func TestAutoSyncIsOffWhenArgsZeroIsRewritten(t *testing.T) {
```

## cmd/litespm/auto_update.go
*331 lines*
```
package main
import (
const (
type autoUpdateMarker struct {
type autoUpdateOptions struct {
func maybeAutoUpdate(args []string) {
func autoUpdateCommandAllowed(args []string) bool {
func autoUpdateSessionID() string {
func autoUpdateDisabledByEnv() bool {
func truthyEnv(name string) bool {
func runAutoUpdate(ctx context.Context, opts autoUpdateOptions) (bool, error) {
func readAutoUpdateMarker(path string) (autoUpdateMarker, bool) {
func writeAutoUpdateMarker(path string, marker autoUpdateMarker) {
func lockAutoUpdate(dir string, now time.Time) (func(), bool) {
```

## cmd/litespm/auto_update_test.go
*205 lines*
```
package main
import (
func autoUpdateFixture(t *testing.T, payload []byte) (autoUpdateOptions, *int) {
func testSHA256Hex(b []byte) string {
func TestAutoUpdateChecksAgainAfterBurst(t *testing.T) {
func TestAutoUpdateSkipsDevBuilds(t *testing.T) {
func TestAutoUpdateLeavesUnrelatedStateUntouched(t *testing.T) {
func TestAutoUpdateCheckFailureRecordsBurstAndDoesNotBlock(t *testing.T) {
func TestAutoUpdateDisabledWhenNotInteractive(t *testing.T) {
func TestAutoUpdateCommandAllowed(t *testing.T) {
```

## cmd/litespm/bridge_skills.go
*272 lines*
```
package main
import (
const maxSkillResourceBytes = 8 << 20
var (
type bridgeSkillSource struct {
func installIsSkill(inst *domain.InstallRecord) bool {
func skillSourcesForBridge(
func resolveInstallSkillDir(
func findBridgeSkillSource(sources []bridgeSkillSource, skillID string) *bridgeSkillSource {
func readSkillResource(root, requested string) ([]byte, error) {
func pathWithin(root, candidate string) bool {
```

## cmd/litespm/bridge_skills_test.go
*127 lines*
```
package main
import (
func TestBridgeSkillToolsSeeLedgerOnlySkill(t *testing.T) {
```

## cmd/litespm/buildinfo.go
*11 lines*
```
package main
import "github.com/sarv-projects/litespm/internal/buildinfo"
func init() {
```

## cmd/litespm/capabilities.go
*489 lines*
```
package main
import (
const capabilitiesUsage = `Usage: litespm capabilities <command> [flags]
func runCapabilities(args []string) {
func parseCapabilityFlags(args []string) (hosts []string, limit int, capabilityID, query string, limitSet bool, err erro
func validateCapabilityCommand(command string, hosts []string, capabilityID, query string, limitSet bool) error {
func installedMCPServers(ctx context.Context, db *state.DB, client *catalog.Client, hosts []string) ([]discover.Provider
func refreshCapabilities(ctx context.Context, db *state.DB, client *catalog.Client, hosts []string) {
func probeTarget(spec discover.ProviderSpec) string {
func probeAll(ctx context.Context, db *state.DB, specs []discover.ProviderSpec, out io.Writer) (total, failed int) {
func listCapabilities(ctx context.Context, db *state.DB, query string, limit int) {
func describeCapability(ctx context.Context, db *state.DB, capabilityID string) {
func runInvoke(args []string) {
func newCatalogClient(paths *config.PlatformPaths) (*catalog.Client, error) {
```

## cmd/litespm/capabilities_test.go
*418 lines*
```
package main
import (
func TestParseCapabilityFlags(t *testing.T) {
func TestValidateCapabilityCommandHostScope(t *testing.T) {
func TestServerEntryNameForMatchesTheInstalledName(t *testing.T) {
func validateHostEntryName(name string) error {
type errString string
func (e errString) Error() string { return string(e) }
func TestCapabilitiesUsageMentionsEveryCommand(t *testing.T) {
func TestMCPInstallWritesTheComponentRowFksRequire(t *testing.T) {
func remoteMCPFixture(t *testing.T) string {
func capabilityListing(id, name string) *domain.Listing {
func seedCapabilityCatalog(t *testing.T, listings []*domain.Listing) *catalog.Client {
func seedCapabilityInstall(t *testing.T, db *state.DB, installID, listingID, component string) {
func TestCapabilitiesRefreshOverAMixedRemoteAndStdioSet(t *testing.T) {
func TestProbeTargetNamesWhatIsDialed(t *testing.T) {
func quotedJSON(s string) string {
```

## cmd/litespm/catalog_build_test.go
*402 lines*
```
package main
import (
const buildTestDataset = `[
func writeBuildDataset(t *testing.T) string {
func TestBuildCatalogReleaseAdvancesAuthority(t *testing.T) {
func TestCatalogBuildPrintsActualManifestDigest(t *testing.T) {
func TestBuildCatalogReleaseRejectsNonAdvancingSequence(t *testing.T) {
func TestBuildCatalogReleaseRejectsReleaseIDReuse(t *testing.T) {
func TestBuildCatalogReleaseSubSecondReleaseTimeStillReproduces(t *testing.T) {
func TestBuildCatalogReleaseMaterializeReproducesBytes(t *testing.T) {
func TestBuildCatalogReleaseMaterializeRejectsChangedDataset(t *testing.T) {
func TestParseBuildCreatedAt(t *testing.T) {
func TestSyncReleaseStatsMerge(t *testing.T) {
func compileSampleBuildOutput(t *testing.T) *catalogbuild.BuildOutput {
```

## cmd/litespm/config_wiring_test.go
*104 lines*
```
package main
import (
func TestCatalogTimeoutOfMapsConfig(t *testing.T) {
func TestRegistryURLOfMapsConfig(t *testing.T) {
func TestPolicyDefaultsFromFailsClosedWithoutConfig(t *testing.T) {
func TestProjectConfigReachesPolicyEngine(t *testing.T) {
```

## cmd/litespm/copy.go
*1302 lines*
```
package main
import (
const copyUsage = `Usage: litespm copy [items|kinds...] --from <host> --to <host> [flags]
type copyFlags struct {
func parseCopyFlags(args []string) (copyFlags, error) {
func splitPositionals(tokens []string) (kinds, items []string) {
func runCopy(args []string) int {
func runCopyTo(out io.Writer, args []string) int {
func askConflictDecision(in *bufio.Reader, out io.Writer, c porting.Conflict) (string, bool) {
func readCopySource(ctx context.Context, paths *config.PlatformPaths,
func readCopyTarget(ctx context.Context, paths *config.PlatformPaths,
func copyLedgerScope(scope domain.InstallScope) string {
func copyKindNoun(kind string, n int, full bool) string {
func copyCountOrder(counts map[string]int) []string {
func formatCopyCounts(counts map[string]int, full bool) string {
func skipLabel(reason string) string {
func printCopyPlan(out io.Writer, plan *porting.CopyPlan, f copyFlags, src *porting.Source, tgt *porting.TargetCaps) {
type copyItemResult struct {
func printCopyResult(out io.Writer, r copyItemResult) {
func applyCopyPlan(out io.Writer, plan *porting.CopyPlan, paths *config.PlatformPaths,
func applyMCPItem(ctx context.Context, db *state.DB, paths *config.PlatformPaths,
func verifyMCPReadBack(ctx context.Context, hostID string, scope domain.InstallScope, projectRoot string, item porting.C
func verifyExecutable(command string) string {
func newCopySkillWriter(db *state.DB, dataRoot string) (*skills.Ledger, *skills.Installer, error) {
func applySkillItem(ctx context.Context, db *state.DB, paths *config.PlatformPaths,
func findLedgerEntry(ledger *skills.Ledger, dest string) (bool, skills.LedgerEntry, error) {
func restoreSkillOverwrite(ledger *skills.Ledger, dest string, prior skills.LedgerEntry, backup string) error {
func isCrossDeviceError(err error) bool {
```

## cmd/litespm/copy_test.go
*800 lines*
```
package main
import (
func pinCopyEnv(t *testing.T) (home, dataRoot string) {
func writeCopyConfig(t *testing.T, path, content string) {
func fileDigest(t *testing.T, path string) string {
func captureCopyStderr(t *testing.T, fn func()) string {
func TestPortingTranslatesOpenCodeCommandArrayToCodexArgs(t *testing.T) {
func TestPortingPlanCountsAndNoWrites(t *testing.T) {
func TestPortingNeverWritesLiteralEnvValues(t *testing.T) {
func TestPortingApplyIsManagedAndUndoable(t *testing.T) {
func TestPortingConflictStrategies(t *testing.T) {
func TestPortingReportsUnsupportedPluginWithReason(t *testing.T) {
func TestPortingSkillCopyRoundTrip(t *testing.T) {
func TestParseCopyFlags(t *testing.T) {
func TestRunCopyUsageExitCodes(t *testing.T) {
func TestSplitPositionals(t *testing.T) {
func TestPortingCopiesRemoteEntryBetweenCapableHosts(t *testing.T) {
func TestPortingCopiesRemoteEntryJsonToTOML(t *testing.T) {
func TestPortingRemoteToIncapableTargetRefusesAndWritesNothing(t *testing.T) {
func TestPortingRemoteCopyRestoresByteIdenticalPreInstallState(t *testing.T) {
```

## cmd/litespm/daemon_autostart.go
*131 lines*
```
package main
import (
const (
func connectOrStartDaemon(ctx context.Context, paths *config.PlatformPaths) (*ipc.Client, error) {
func daemonAutostartAllowed() bool {
func isTestBinaryName(p string) bool {
func daemonLogPath(paths *config.PlatformPaths) string {
func daemonLogTail(paths *config.PlatformPaths, max int) string {
func daemonSpawnCommand(paths *config.PlatformPaths) (string, []string, error) {
```

## cmd/litespm/daemon_lock_test.go
*67 lines*
```
package main
import (
func TestAcquireLock_SingleInstanceAndOwnership(t *testing.T) {
func TestAcquireLock_ReclaimsDeadPIDButNotMalformedYoungFile(t *testing.T) {
```

## cmd/litespm/daemon_spawn_unix.go
*51 lines*
```
package main
import (
func spawnDaemonProcess(paths *config.PlatformPaths) error {
func spawnDetached(paths *config.PlatformPaths, exe string, args []string, logPath string) error {
```

## cmd/litespm/daemon_spawn_windows.go
*61 lines*
```
package main
import (
const (
func spawnDaemonProcess(paths *config.PlatformPaths) error {
func spawnDetached(paths *config.PlatformPaths, exe string, args []string, logPath string) error {
```

## cmd/litespm/grant.go
*231 lines*
```
package main
import (
var grantEffects = []string{"provider.start", "process.spawn"}
func grantIDFor(capabilityID string) string {
func providerDisplay(p *domain.ProviderRecord) string {
func issueCapabilityGrant(ctx context.Context, db *state.DB, capabilityID string) (*domain.CapabilityGrant, error) {
func runGrant(args []string) {
func grantIssue(ctx context.Context, db *state.DB, capabilityID string) {
func grantList(ctx context.Context, db *state.DB) {
func grantRevoke(ctx context.Context, db *state.DB, capabilityID string) {
func shortFingerprint(fp string) string {
```

## cmd/litespm/grant_test.go
*254 lines*
```
package main
import (
func seedGrantFixture(t *testing.T, db *state.DB) (capabilityID, fingerprint string) {
func TestProviderInvokeGateOpensWithAGrant(t *testing.T) {
func TestIssueCapabilityGrantBindsAndRebindsOneRow(t *testing.T) {
func TestIssueCapabilityGrantRefusesUnbindableTargets(t *testing.T) {
func TestGrantRevokeStatus(t *testing.T) {
func TestGrantIDForIsDeterministicPerCapability(t *testing.T) {
```

## cmd/litespm/help.go
*977 lines*
```
package main
import (
type commandHelp struct {
type helpGroup struct {
var helpGroups = []helpGroup{
var helpCatalog = buildHelpCatalog()
func buildHelpCatalog() map[string]commandHelp {
func runHelp(args []string) {
func helpTo(out, errOut io.Writer, args []string) int {
func renderDefaultHelp(w io.Writer) {
func renderShippedList(w io.Writer) {
func renderHelp(w io.Writer, page commandHelp) {
func writeSection(w io.Writer, title string, items []string) {
func writeWrapped(w io.Writer, indent, text string) {
func renderConcepts(w io.Writer) {
```

## cmd/litespm/help_test.go
*340 lines*
```
package main
import (
func dispatchLiterals(t *testing.T) []string {
func TestHelpCoversEveryDispatchCase(t *testing.T) {
func TestHelpGroupingCoversEveryCanonicalCommand(t *testing.T) {
func TestHelpPageTemplateIsComplete(t *testing.T) {
func TestHelpConceptsDefinesVocabulary(t *testing.T) {
func TestHelpRenderPaths(t *testing.T) {
func TestDefaultHelpAdvertisesOnlyShippedCommands(t *testing.T) {
func captureStdout(t *testing.T, fn func()) string {
func TestPrintUsageIsTheDefaultHelp(t *testing.T) {
```

## cmd/litespm/host_table.go
*88 lines*
```
package main
import (
func renderHostList(ctx context.Context, w io.Writer) {
func hostListConfigCell(ctx context.Context, a host.HostAdapter) string {
func renderHostDetect(ctx context.Context, w io.Writer, cwd string) int {
```

## cmd/litespm/host_table_test.go
*89 lines*
```
package main
import (
func TestWriteTable_WidensColumnsToData(t *testing.T) {
func TestRenderHostList_RealPathsSortedAndCounted(t *testing.T) {
func fmtSscanCount(line string, n *int) (int, error) {
func TestRenderHostDetect_LegendNextStepAndNoDriveRootPaths(t *testing.T) {
```

## cmd/litespm/import.go
*543 lines*
```
package main
import (
const importUsage = `Usage: litespm import <format> <path> [flags]
type importFlags struct {
func parseImportFlags(args []string) (importFlags, error) {
func runImport(args []string) int {
func runImportTo(out io.Writer, args []string) int {
func importJSONOutcome(out io.Writer, plan *interop.Plan, flags importFlags, interactive bool, dir string, snapshot impo
func writeImportPlan(out io.Writer, plan *interop.Plan, dir string, snapshot importManifestSnapshot) int {
func resolveImportTarget(dir string) (string, bool, error) {
type importManifestSnapshot struct {
func readImportManifestSnapshot(targetPath string) (importManifestSnapshot, error) {
func verifyImportManifestSnapshot(targetPath string, snapshot importManifestSnapshot) error {
func renderImportedManifest(plan *interop.Plan, dir string, snapshot importManifestSnapshot) (string, error) {
func requireBlock(r manifest.Require) string {
func importProjectName(dir string) string {
var importHelpPage = commandHelp{
func init() {
```

## cmd/litespm/import_test.go
*502 lines*
```
package main
import (
func importFixture(name string) string {
func captureImportStderr(t *testing.T, fn func()) string {
func tempProject(t *testing.T) string {
func TestImportPreviewWritesNothing(t *testing.T) {
func TestImportApplyYesCreatesManifest(t *testing.T) {
func TestImportApplyExtendsPreservingComments(t *testing.T) {
func TestImportApplyRewritesOnChange(t *testing.T) {
func TestImportApplyRejectsStaleManifestSnapshot(t *testing.T) {
func TestImportApplyRejectsManifestCreatedAfterPlan(t *testing.T) {
func TestImportUsageErrors(t *testing.T) {
func TestImportHelp(t *testing.T) {
func TestImportNonInteractiveApplyIsRefusedWithoutYes(t *testing.T) {
func TestImportJSONPreviewAndApply(t *testing.T) {
func TestImportRejectsUntrustedInput(t *testing.T) {
func TestImportRejectsOversizedInput(t *testing.T) {
func TestImportMissingInputFile(t *testing.T) {
func TestImportResolvesDirectoryInput(t *testing.T) {
```

## cmd/litespm/install_authz.go
*511 lines*
```
package main
import (
const (
type installAuthKey struct{}
type installAuthorization struct {
func withInstallAuthorization(ctx context.Context, a installAuthorization) context.Context {
func installAuthorizationFrom(ctx context.Context) (installAuthorization, bool) {
type installGrant struct {
func (g *installGrant) context(ctx context.Context) context.Context {
func (g *installGrant) refund(ctx context.Context, db *state.DB) {
type installConfirmFunc func(plan *domain.InstallPlan) (bool, error)
var errInstallDeclined = errors.New("install declined at the confirmation prompt")
func unauthorizedRPC(msg string) *ipc.RPCError {
func authorizeInstallExecute(ctx context.Context, db *state.DB, listingID, version, scope, planID, approvalID string) (*
func authorizeHumanPluginInstall(
func newApprovalID() (string, error) {
func recordHumanApproval(ctx context.Context, db *state.DB, plan *domain.InstallPlan) (string, error) {
func authorizeHumanInstall(ctx context.Context, db *state.DB, catClient *catalog.Client, listing *domain.Listing, versio
func newPolicyEngine(db *state.DB, dataRoot string, defaults policy.Defaults) (*policy.Engine, error) {
func openCLIPolicyEngine(dataRoot string) (*policy.Engine, func(), error) {
func runApprove(args []string) {
func writeApprovalPrompt(w io.Writer, plan *domain.InstallPlan) {
func approvalVersionLabel(v string) string {
func approvalTargetLine(change domain.HostChange) string {
func firstNonEmpty(vals ...string) string {
```

## cmd/litespm/install_authz_test.go
*514 lines*
```
package main
import (
func authorizedTestContext() context.Context {
func skillPlanForTest(t *testing.T, listing *domain.Listing, scope domain.InstallScope, projectRoot, home string, agents
func approvePlanAsHuman(t *testing.T, db *state.DB, plan *domain.InstallPlan) string {
func isolatedSkillHome(t *testing.T) string {
func skillHarness(t *testing.T) (*harness, string, string) {
func preparePlan(t *testing.T, h *harness, listingID string) domain.InstallPlan {
func preparePlanScoped(t *testing.T, h *harness, listingID, scope string) domain.InstallPlan {
func skillWritten(home string) bool {
func TestInstallExecute_AgentPathWithoutApprovalIsRefused(t *testing.T) {
func TestInstallExecute_NonHumanApprovalRefused(t *testing.T) {
func TestInstallExecute_ApprovalBoundToPlan(t *testing.T) {
func TestInstallExecute_ApprovalIsSingleUse(t *testing.T) {
func TestInstallExecute_FailureRefundsApproval(t *testing.T) {
func TestInstallSkillFromListing_RequiresAuthorization(t *testing.T) {
func TestAuthorizeHumanInstall_RecordsHumanCLIApproval(t *testing.T) {
func TestOpenCLIPolicyEngine_LoadsRealTiers(t *testing.T) {
func approvalPromptFixture(expires time.Time, valueJSONs ...string) *domain.InstallPlan {
func TestApprovalPromptPrintsEndpointForRemotePlan(t *testing.T) {
func TestApprovalPromptStillPrintsCommandForStdioPlan(t *testing.T) {
func TestApprovalPromptSkipsRuntimeOnlyWhenNoneIsSealed(t *testing.T) {
```

## cmd/litespm/install_confirm_test.go
*116 lines*
```
package main
import (
func TestInstallUsageDocumentsYes(t *testing.T) {
func TestParseInstallFlagsAcceptsYes(t *testing.T) {
func TestInstallConfirmWantedSkipsScriptedAndPipedRuns(t *testing.T) {
func TestConfirmInstallPromptDialect(t *testing.T) {
func TestAuthorizeHumanInstallDeclinedLeavesNoState(t *testing.T) {
```

## cmd/litespm/install_env_test.go
*133 lines*
```
package main
import (
func TestParseInstallFlagsEnv(t *testing.T) {
func TestInstallRejectsUnusableEnvNamesBeforeWriting(t *testing.T) {
func TestInstallRefusesEnvForUnverifiedHost(t *testing.T) {
func TestInstallRefusesEnvForShapeThatCannotCarryIt(t *testing.T) {
func TestEnvForwardingClassifiesEveryRegisteredHost(t *testing.T) {
```

## cmd/litespm/install_errors.go
*59 lines*
```
package main
import (
func installFailureText(err error, unicode bool) string {
func searchTermForListingID(id string) string {
func printInstallFailure(w io.Writer, err error) {
```

## cmd/litespm/install_kind.go
*95 lines*
```
package main
import (
var pluginInstallDispatched = true
func installKindRefusal(listing *domain.Listing) *domain.LPSMError {
```

## cmd/litespm/install_kind_test.go
*251 lines*
```
package main
import (
func pluginFixture(id string) *domain.Listing {
func countPlans(t *testing.T, h *harness) int {
func TestInstallKindRefusalCoversEveryUnwiredKind(t *testing.T) {
func TestInstallKindGateAdmitsAPluginOnceTheDispatchExists(t *testing.T) {
func TestPreparePlanRefusesPluginWithoutSealingAPlan(t *testing.T) {
func TestInstallExecuteRefusesPluginWithArtifactUnavailable(t *testing.T) {
func TestWizardRefusesPluginBeforeAskingScopeOrConsent(t *testing.T) {
func TestPluginFixtureStaysVerifiedButUninstallable(t *testing.T) {
```

## cmd/litespm/install_mcp.go
*952 lines*
```
package main
import (
type hostEnvSpec struct {
type mcpInstallBinding struct {
type mcpInstallPlanValue struct {
func mcpInstallPlanValueJSON(binding *mcpInstallBinding) string {
func uniqueHostIDs(hosts []string) []string {
func remoteEndpointPolicy() egress.Policy {
func checkRemoteEndpoint(endpoint string) error {
func remoteEnvRefusal(subject, hostID string) error {
func entryTransportLabel(entry host.ServerEntry) string {
func mcpEntryTreeDigest(endpoint, command string, args []string) string {
func validateSealedRuntime(planID, hostID, subject string, value mcpInstallPlanValue) error {
func mcpInstallBindingFromPlan(ctx context.Context, plan *domain.InstallPlan, listing *domain.Listing, scope domain.Inst
func hostDisplayName(hostID string) string {
func mcpConflictHosts(ctx context.Context, hosts []string, name string, scope domain.InstallScope, projectRoot string) [
type mcpInstallOutcome struct {
func providerRecordForInstall(installID, name string, entry host.ServerEntry) *domain.ProviderRecord {
func installMCPFromListing(
func authorizeMCPInstallPolicy(ctx context.Context, db *state.DB, dataRoot string, listing *domain.Listing, name string,
func undoHostConfigWrite(r *host.EntryInstallResult) error {
func hostConfigFormatFor(hostID string) string {
func serverEntryNameFor(listing *domain.Listing) (string, error) {
func printMCPInstall(outcome *mcpInstallOutcome) {
func printForwardedEnv(outcome *mcpInstallOutcome) {
```

## cmd/litespm/install_mcp_conflict_test.go
*153 lines*
```
package main
import (
func TestMCPConflictHostsFindsExistingEntry(t *testing.T) {
func conflictWizard(input string, out io.Writer) *Wizard {
func TestResolveMCPConflictsSkipKeepsTheOtherHosts(t *testing.T) {
func TestResolveMCPConflictsReplaceKeepsEveryHostAndForces(t *testing.T) {
func TestResolveMCPConflictsCancelWritesNothing(t *testing.T) {
func TestResolveMCPConflictsAllConflictDefaultLeavesIt(t *testing.T) {
func TestInstallMCPFromListingForceReplacesTheExistingEntry(t *testing.T) {
```

## cmd/litespm/install_mcp_test.go
*705 lines*
```
package main
import (
func mcpListing(id, name string) *domain.Listing {
func stdioRuntime() *domain.RuntimeDescriptor {
func homeWithBridge(t *testing.T) (home string, configPath string) {
func TestInstallMCPFromListingRegistersWithConfiguredHosts(t *testing.T) {
func TestInstallMCPFromListingRefusesCollisions(t *testing.T) {
func TestInstallMCPFromListingRefusesWithoutAnyConfiguredHost(t *testing.T) {
func TestInstallMCPPolicyDenyPreventsHostConfigWrite(t *testing.T) {
func TestMCPPolicyDenyMatchesListingIDOrEntryName(t *testing.T) {
func TestInstallMCPFromListingRefusesWhenNoCommandIsPublished(t *testing.T) {
func TestServerEntryNameForNormalizesHostUnsafeNames(t *testing.T) {
func TestInstallMCPFromListingRefusesDiscoveryOnly(t *testing.T) {
const claudeCodeGoldenEntry = `"demo-mcp": {"type":"http","url":"` + remoteEndpoint + `"}`
func TestInstallMCPFromListingRegistersRemoteEndpoint(t *testing.T) {
func TestInstallMCPFromListingRefusesUnsafeRemoteEndpoint(t *testing.T) {
func TestInstallMCPFromListingRefusesInvalidTransportShapes(t *testing.T) {
func TestInstallMCPFromListingRefusesIncapableRemoteHost(t *testing.T) {
func TestInstallMCPFromListingRefusesEnvForRemoteEntry(t *testing.T) {
func TestInstallTreeDigestSeparatesStdioFromRemote(t *testing.T) {
func TestMCPInstallBindingFromPlanRevalidatesTheRuntime(t *testing.T) {
func TestPrintMCPInstallOutcomeText(t *testing.T) {
func TestRemoveProjectInstallDropsItsHostRegistration(t *testing.T) {
```

## cmd/litespm/install_plugin.go
*1259 lines*
```
package main
import (
type pluginArtifact struct {
func (a pluginArtifact) ref() domain.ArtifactRef {
type pluginInstallBinding struct {
type pluginInstallPlanValue struct {
func pluginInstallPlanValueJSON(binding *pluginInstallBinding) string {
type pluginServerEntry struct {
type pluginInstallOutcome struct {
var pluginManifestNames = []string{
var placeholderPattern = regexp.MustCompile(`\$\{[A-Za-z_][A-Za-z0-9_]*\}`)
func pluginArtifactFor(listing *domain.Listing, rec *domain.VersionRecord) (pluginArtifact, error) {
var commitIDPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
func buildPluginInstallPlan(
func pluginHostChanges(ctx context.Context, hosts []string, scope domain.InstallScope, projectRoot string, binding *plug
func pluginConfigPathFor(ctx context.Context, hostID string, scope domain.InstallScope, projectRoot string) string {
func pluginHostCapabilityReason(ctx context.Context, hostID string, scope domain.InstallScope) string {
func pluginInstallBindingFromPlan(ctx context.Context, plan *domain.InstallPlan, listing *domain.Listing, scope domain.I
func installPluginFromListing(
var pluginFetchOptions = artifact.DefaultGitFetcherOptions()
func fetchPluginTree(ctx context.Context, listingID string, art pluginArtifact) (string, func(), error) {
func readPluginManifest(treeDir string, listingID string) (*interop.PluginInstallManifest, error) {
func resolvePluginServerReference(treeDir, ref, listingID string) ([]interop.PluginMCPServer, int, error) {
func pluginServerEntries(listing *domain.Listing, manifest *interop.PluginInstallManifest, envNames []string) ([]pluginS
func placeholderIn(command string, args []string) string {
func preflightPluginHosts(
func authorizePluginInstallPolicy(
func printPluginInstall(outcome *pluginInstallOutcome) {
func printPluginInstallTo(w io.Writer, outcome *pluginInstallOutcome) {
func sortedCountKeys(counts map[string]int) []string {
```

## cmd/litespm/install_plugin_skills.go
*422 lines*
```
package main
import (
const maxPluginSkills = 64
type pluginSkillComponent struct {
type pluginSkillResult struct {
type skippedComponent struct {
func skippedPluginComponents(counts map[string]int) []skippedComponent {
func unprojectedComponentCounts(skipped []skippedComponent) map[string]int {
func resolvePluginSkills(treeDir string, manifest *interop.PluginInstallManifest) ([]pluginSkillComponent, error) {
func skillContainerChildren(treeDir, containerDir string) ([]string, error) {
func resolveInsidePluginTree(treeDir, rel string) (string, error) {
func withinTree(root, p string) bool {
func pluginSkillRootsFor(hosts []string, scope domain.InstallScope, projectRoot string) []skillDestination {
func pluginSkillRootFor(hostID string, scope domain.InstallScope, projectRoot, home string) (string, bool) {
func installPluginSkillComponents(
```

## cmd/litespm/install_plugin_skills_test.go
*357 lines*
```
package main
import (
func pluginWithSkillSource(listing *domain.Listing) *domain.Listing {
var skillsOnlyPluginFiles = map[string]string{
var mixedPluginFiles = map[string]string{
func TestSkillsOnlyPluginInstalls(t *testing.T) {
func TestMixedPluginInstallsBothPortableComponents(t *testing.T) {
var partialPluginFiles = map[string]string{
func TestPluginRefusesAnUnacknowledgedPartialInstall(t *testing.T) {
func TestPluginInstallsPartiallyWhenAcknowledged(t *testing.T) {
func TestResolvePluginSkillsRefusesAnEscapingSymlink(t *testing.T) {
func TestResolvePluginSkillsAcceptsAPathThroughASymlinkedRoot(t *testing.T) {
func TestResolvePluginSkillsRefusesADirectoryWithoutSKILLmd(t *testing.T) {
func TestResolvePluginSkillsExpandsADeclaredSkillsContainer(t *testing.T) {
```

## cmd/litespm/install_plugin_test.go
*768 lines*
```
package main
import (
func pluginFixtureRepo(t *testing.T, files map[string]string) (dir string, commit string) {
func pluginFileURL(dir string) string {
func pluginListing(id string) *domain.Listing {
func pluginCatalog(t *testing.T, listing *domain.Listing, ref domain.ArtifactRef) *catalog.Client {
func pluginGitRef(repo, commit string) domain.ArtifactRef {
func allowLocalPluginFetch(t *testing.T) {
var demoPluginFiles = map[string]string{
func installDemoPlugin(t *testing.T, db *state.DB, dataRoot string, listing *domain.Listing, catClient *catalog.Client, 
func installDemoPluginWithConsent(t *testing.T, db *state.DB, dataRoot string, listing *domain.Listing, catClient *catal
func TestInstallPluginRegistersTheDeclaredMCPServersAndRemovesThem(t *testing.T) {
func TestInstallPluginRestoreReplaysTheBackupByteForByte(t *testing.T) {
func TestInstallPluginRefusesWithoutAnApprovedPlan(t *testing.T) {
func TestInstallPluginRefusesAnArtifactWithNoPin(t *testing.T) {
func TestInstallPluginRefusesAPluginWithNoArtifact(t *testing.T) {
func TestInstallPluginRefusesAnUnknownArtifactType(t *testing.T) {
func TestInstallPluginRefusesAnUnparseableManifest(t *testing.T) {
func TestInstallPluginRefusesAManifestWithACommandSource(t *testing.T) {
func TestInstallPluginRefusesAPluginThatDeclaresNoMCPServer(t *testing.T) {
func TestInstallPluginRefusesALaunchLineWithAPlaceholder(t *testing.T) {
func TestInstallPluginRefusesAHostThatCannotTakeTheEntry(t *testing.T) {
func TestInstallPluginRefusesAnEntryNameThatCollides(t *testing.T) {
func TestInstallPluginRollsBackWhenAHostWriteFails(t *testing.T) {
func TestPluginFetchOptionsAreTheStrictProductionOnes(t *testing.T) {
func TestPluginPlanFromAnAgentPathSealsTheDefaultHostSet(t *testing.T) {
func TestPluginPlanSealsThePartialAcknowledgement(t *testing.T) {
func TestPluginPlanSealsThePinnedArtifact(t *testing.T) {
func TestInstallPluginIntoAProjectScope(t *testing.T) {
```

## cmd/litespm/install_remote_e2e_test.go
*481 lines*
```
package main
import (
const (
func e2eRemoteListing() *domain.Listing {
func e2eRemoteRecord() *domain.VersionRecord {
func e2eMachine(t *testing.T) (home, claudePath, codexPath, zcodePath string, pre map[string]string) {
type e2ePlan struct {
func prepareE2EPlan(t *testing.T, h *harness) e2ePlan {
func tomlTableBody(content, header string) string {
func TestRemoteInstallEndToEndJSONAndTOMLHosts(t *testing.T) {
func TestAuthorizeHumanInstallReportsRemoteCapabilityDrops(t *testing.T) {
func containsHost(hosts []string, want string) bool {
func equalStrings(a, b []string) bool {
func equalAny(a, b any) bool {
```

## cmd/litespm/install_skill.go
*436 lines*
```
package main
import (
type skillInstallOutcome struct {
func installSkillFromListing(
func skillInstallChecker(db *state.DB, dataRoot string, auth installAuthorization) (skills.PolicyChecker, error) {
func undoSkillInstall(ledger *skills.Ledger, e skills.LedgerEntry) error {
func selectSkillForListing(found []skills.DiscoveredSkill, listing *domain.Listing) (skills.DiscoveredSkill, error) {
func safeInstallIDPart(s string) string {
func shortDigest(digest string) string {
func printSkillInstall(outcome *skillInstallOutcome) {
```

## cmd/litespm/install_skill_target_test.go
*251 lines*
```
package main
import (
func skillListing(id, name string) *domain.Listing {
func detectedHome(t *testing.T) string {
func TestPlanSkillDestinationsExplicitAgentIsExactlyThatAgent(t *testing.T) {
func TestPlanSkillDestinationsEmptyRequestUsesDetectedSet(t *testing.T) {
func TestPlanSkillDestinationsRefusesRatherThanDropping(t *testing.T) {
func TestSkillHostChangesAreSealedAndReadBack(t *testing.T) {
func TestSkillAgentsFromPlanRefusesAnUnsealedPlan(t *testing.T) {
func TestVerifySkillWriteRootsFailsClosed(t *testing.T) {
func TestParseInstallFlagsAgentSelection(t *testing.T) {
```

## cmd/litespm/install_skill_targets.go
*235 lines*
```
package main
import (
const skillWriteAction = "write_skill_dir"
type skillInstallBinding struct {
type skillDestination struct {
func planSkillDestinations(listing *domain.Listing, scope domain.InstallScope, projectRoot, home string, requested []str
func detectedSkillAgentIDs(projectRoot, home string) []string {
func skillScopeFor(scope domain.InstallScope) string {
func skillHostChanges(listing *domain.Listing, dests []skillDestination) []domain.HostChange {
func skillDestinationsFromPlan(plan *domain.InstallPlan) ([]skillDestination, error) {
func skillAgentsFromPlan(plan *domain.InstallPlan) ([]string, error) {
func verifySkillWriteRoots(dests []skillDestination, ops []skills.InstallOp) error {
func userHome() string {
```

## cmd/litespm/install_skill_test.go
*228 lines*
```
package main
import (
func openTestState(t *testing.T) *state.DB {
func skillListingFor(id, name, source string) *domain.Listing {
func projectAgent(t *testing.T, project, home string) (string, string) {
func TestInstallSkillFromListingLocal(t *testing.T) {
func TestInstallExecuteSkillThroughDaemon(t *testing.T) {
func TestInstallSkillFromListingFailsClosed(t *testing.T) {
```

## cmd/litespm/install_txn_test.go
*472 lines*
```
package main
import (
func mutationsOf(t *testing.T, db *state.DB, installID string) []deployment.Mutation {
func dropLedgerTable(t *testing.T, db *state.DB) {
func fileBytes(t *testing.T, path string) []byte {
func sha256Hex(data []byte) string {
func TestInstallMCPStateFailureRestoresConfigBytes(t *testing.T) {
func TestInstallMCPStateFailureRemovesCreatedConfig(t *testing.T) {
func TestInstallMCPTwoHostStateFailureRestoresBoth(t *testing.T) {
func assertNoInstallState(t *testing.T, db *state.DB, listingID string) {
func TestInstallMCPRecordsNodeLevelPreImage(t *testing.T) {
func TestInstallRemoveRestoresPriorEntrySymmetrically(t *testing.T) {
func TestInstallRemoveKeepsUserEditedNode(t *testing.T) {
func TestInstallRemovePreLedgerStripsViaRegistrations(t *testing.T) {
func TestInstallSkillStateFailureRollsBack(t *testing.T) {
func TestInstallRemoveSkillIsSymmetric(t *testing.T) {
```

## cmd/litespm/installer_tui.go
*950 lines*
```
package main
import (
var (
var (
var bannerLines = []string{
var bannerPalette = []lipgloss.Color{
func renderWordmarkBanner(subtitle, blurb string) string {
func renderInstallerBanner() string {
func installerStep(out io.Writer, symbol, message string) {
func installerStepDone(out io.Writer, message string) {
func installerStepInfo(out io.Writer, message string) {
func installerStepWarn(out io.Writer, message string) {
func installerStepError(out io.Writer, message string) {
func renderInstallSummaryBox(title string, lines []string) string {
func renderCompletionBox(title string, lines []string, footer string) string {
type promptItem struct {
type searchPromptOptions struct {
type searchPromptResult struct {
type promptEntry struct {
type searchPromptModel struct {
func newSearchPromptModel(opts searchPromptOptions) *searchPromptModel {
func (m *searchPromptModel) moveCursor(delta int) {
func (m *searchPromptModel) resetCursor() {
func (m *searchPromptModel) Init() tea.Cmd { return nil }
func (m *searchPromptModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
func (m *searchPromptModel) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
func (m *searchPromptModel) submit() (tea.Model, tea.Cmd) {
func (m *searchPromptModel) selectedValues() []string {
func (m *searchPromptModel) currentEntry() (promptEntry, bool) {
func (m *searchPromptModel) filtered() []promptItem {
func (m *searchPromptModel) entries() []promptEntry {
const selectAllID = "\x00select-all"
func (m *searchPromptModel) toggleAll() {
func (m *searchPromptModel) toggleGroup(group string) {
func (m *searchPromptModel) View() string {
func (m *searchPromptModel) finalView() string {
func (m *searchPromptModel) selectedLabels() []string {
func (m *searchPromptModel) visibleLimit() int {
func (m *searchPromptModel) visibleSelectedCount() int {
func (m *searchPromptModel) selectAllState() string {
func (m *searchPromptModel) groupState(group string) string {
func disclosure(collapsed bool) string {
func windowFor(total, cursor, limit int) (int, int) {
func wrapText(s string, width int) string {
func wrapLines(s string, width, maxLines int) []string {
... (1 more)
```

## cmd/litespm/installer_tui_test.go
*228 lines*
```
package main
import (
func testPromptItems() []promptItem {
func TestSearchPromptFiltersLabelHintAndDetail(t *testing.T) {
func TestSearchPromptTogglesItemsAndGroups(t *testing.T) {
func TestSearchPromptLockedItemsAlwaysReturnedAndCannotBeToggled(t *testing.T) {
func TestSearchPromptRequiredRefusesEmptySubmit(t *testing.T) {
func TestSearchPromptSingleSelectReturnsHighlightedItem(t *testing.T) {
func TestSearchPromptTypingAndBackspace(t *testing.T) {
func TestSearchPromptEscCancels(t *testing.T) {
func TestSkillPromptItemsGroupByTopFolder(t *testing.T) {
func TestExistingDestinationsCountsOnlyPresentPaths(t *testing.T) {
func TestSearchPromptViewRendersDetailGroupsAndLockedSection(t *testing.T) {
func TestWindowForKeepsCursorVisible(t *testing.T) {
func TestSearchPromptNeverRepeatsAGroupHeading(t *testing.T) {
```

## cmd/litespm/lifecycle_wire.go
*333 lines*
```
package main
import (
func newLifecycleOrchestrator(db *state.DB) *lifecycle.Orchestrator {
func hostStructureTypeFor(hostID string) string {
func hostLocatorFor(hostID, entryName string, scope domain.InstallScope) (string, error) {
func mutationScope(s string) domain.InstallScope {
func skillLedgerScope(s string) string {
func locatorName(m deployment.Mutation) string {
func currentOwnedImage(ctx context.Context, m deployment.Mutation, projectRoot string) string {
func backupDirFor(dataRoot string) string {
func removeInstalledPackage(ctx context.Context, db *state.DB, dataRoot string, installID string) error {
func stripOwnedImage(ctx context.Context, db *state.DB, dataRoot string, m deployment.Mutation) error {
func projectRootForMutation(ctx context.Context, db *state.DB, m deployment.Mutation) (string, error) {
func projectRootForScope(rec *domain.InstallRecord, scope domain.InstallScope) string {
func dropHostRegistrations(ctx context.Context, db *state.DB, hostID string, scope domain.InstallScope, key string) erro
func stripSkillDir(dataRoot string, m deployment.Mutation) error {
func bestEffortRemove(ctx context.Context, db *state.DB, dataRoot string, rec *domain.InstallRecord) error {
```

## cmd/litespm/lifecycle_wire_test.go
*116 lines*
```
package main
import (
func TestHostLocatorForKeepsBespokeHostsByteIdentical(t *testing.T) {
func TestHostLocatorForLocatesTheNodeInstallServerEntryWrote(t *testing.T) {
func lookupLocator(doc map[string]any, locator string) any {
func TestHostLocatorForRefusesInsteadOfGuessing(t *testing.T) {
```

## cmd/litespm/list.go
*1628 lines*
```
package main
import (
const inventorySchema = "litespm.inventory/v1"
const (
const (
const (
type inventoryRecord struct {
type inventoryCounts struct {
type inventoryFilters struct {
type inventoryReport struct {
type listFlags struct {
const listUsage = `Usage: litespm list [agents|mcp|skills|plugins] [flags]
func parseListFlags(args []string) (listFlags, error) {
func normalizeListKind(raw string) (string, error) {
func runList(args []string, asInventory bool) int {
func runListTo(out, errOut io.Writer, args []string, asInventory bool) int {
func resolveProjectDir(dir string) (string, error) {
func gatherInventory(ctx context.Context, db *state.DB, dataRoot string, fl listFlags) (*inventoryReport, error) {
func observeRecords(report *inventoryReport, records []inventoryRecord) string {
func (fl listFlags) matches(rec inventoryRecord, installRows map[string]*domain.InstallRecord) bool {
func stateFilterLabel(fl listFlags) string {
func scopeFilterLabel(fl listFlags) string {
func configRecordFor(ctx context.Context, inst *domain.InstallRecord, componentName string, m deployment.Mutation) inven
func entryStyleFor(rec inventoryRecord) string {
func skillRecordFor(installID string, inst *domain.InstallRecord, entry skills.LedgerEntry, mut deployment.Mutation, has
func skillImageState(dest, recorded string, mut deployment.Mutation, hasMut bool) (st, detail, current string) {
func classifyOwned(m deployment.Mutation, current string) (st, detail, currentDigest string) {
func observedRecordFor(ctx context.Context, hostID string, comp host.PreExistingComponent) inventoryRecord {
func unplacedRecordFor(ctx context.Context, db *state.DB, installID string, inst *domain.InstallRecord) inventoryRecord 
func installKindOf(inst *domain.InstallRecord) string {
func originForListing(listingID string) string {
func installComponentName(ctx context.Context, db *state.DB, installID string) string {
func installIDForPath(installRows map[string]*domain.InstallRecord, dest string) string {
func formatRecordTime(t time.Time) string {
func sortRecords(records []inventoryRecord) {
func canonicalCapabilityKey(rec inventoryRecord) string {
func countRecords(records []inventoryRecord) inventoryCounts {
func marshalInventory(report *inventoryReport) ([]byte, error) {
func (fl listFlags) anyFilterActive() bool {
func countLine(counts inventoryCounts, fl listFlags) string {
func isTerminalWriter(w io.Writer) bool {
func renderList(w io.Writer, report *inventoryReport, fl listFlags) {
func renderListPlain(w io.Writer, report *inventoryReport, fl listFlags) {
func renderHeaderCard(w io.Writer, report *inventoryReport, fl listFlags) {
func renderFooterCard(w io.Writer, counts inventoryCounts) {
... (13 more)
```

## cmd/litespm/list_test.go
*706 lines*
```
package main
import (
const (
type listSeed struct {
func projectAgents(t *testing.T, project, home string, n int) []string {
func writeTestConfig(t *testing.T, path, content string) {
func seedListMachine(t *testing.T) listSeed {
func listJSON(t *testing.T, args []string, asInventory bool) (inventoryReport, string) {
func TestListCountsUniqueCapabilitiesVersusDeployments(t *testing.T) {
func TestListFiltersSelectRowsHonestly(t *testing.T) {
func TestListHumanOutputNamesTheAgentItReads(t *testing.T) {
func rosterRowFor(text, hostID string) string {
func TestInventoryJSONShape(t *testing.T) {
func TestListUsageExitCodes(t *testing.T) {
func TestListDegradesHonestlyOnAnEmptyMachine(t *testing.T) {
```

## cmd/litespm/lock.go
*422 lines*
```
package main
import (
type lockFlags struct {
func parseLockFlags(args []string) (lockFlags, error) {
func lockUsage() {
func newLockCatalogClient() (*catalog.Client, error) {
func newLockResolver(ctx context.Context, catClient *catalog.Client) lockfile.Resolver {
func freezeProjectLock(ctx context.Context, m *manifest.Manifest, catClient *catalog.Client) (*lockfile.Lock, error) {
func checkProjectLock(ctx context.Context, m *manifest.Manifest, catClient *catalog.Client, lockPath string) error {
func sbomFromLock(lockPath, format string) ([]byte, error) {
func verifyProjectLock(manifestPath, lockPath string) ([]string, error) {
func asLockDrift(err error) error {
func frozenVersionFor(dir, listingID, requestedVersion string) (string, error) {
func runLock(ctx context.Context, args []string) {
```

## cmd/litespm/lock_test.go
*553 lines*
```
package main
import (
const lockTestManifest = `schemaVersion = 1
func lockTestListing() *domain.Listing {
func lockTestVersions() []*domain.VersionRecord {
func seedLockCatalog(t *testing.T) *catalog.Client {
func writeLockManifest(t *testing.T, dir string) string {
func freezeLockFixture(t *testing.T, dir string) (*manifest.Manifest, *lockfile.Lock) {
func TestLockFreezeRoundTripFromLocalIndex(t *testing.T) {
func TestLockFreezeDeterministicByteIdentical(t *testing.T) {
func mustLoadManifest(t *testing.T, path string) *manifest.Manifest {
func TestLockCheckCleanPasses(t *testing.T) {
func TestLockCheckHandEditedLockFails(t *testing.T) {
func TestLockCheckMissingLockFails(t *testing.T) {
func TestLockStaleManifestRefused(t *testing.T) {
func TestFrozenInstallPinsLockedVersion(t *testing.T) {
func TestFrozenInstallRefusesListingNotInLock(t *testing.T) {
func TestFrozenInstallRefusesMissingLock(t *testing.T) {
func TestLockSBOMCarriesLockDigest(t *testing.T) {
func TestLockVerifyReportsUnavailableSignatures(t *testing.T) {
func TestParseLockFlags(t *testing.T) {
func TestParseInstallFlagsFrozen(t *testing.T) {
```

## cmd/litespm/main.go
*4802 lines*
```
package main
import (
var Version = "dev"
const (
const skillsUsageLine = "Usage: litespm skills [add <source> | list | use <source> | find [<query>] | update [<name>...]
func main() {
func printUsage() {
func unknownCommandMessage(command string) string {
func nearestCommand(s string) string {
func levenshtein(a, b string) int {
const defaultUpdateDownloadLimit = 64 << 20
const selfUpdateDownloadTimeout = 2 * time.Minute
func selfUpdateUsage() {
func registryURLOf(cfg *config.Config) string {
func catalogTimeoutOf(cfg *config.Config) time.Duration {
func catalogSyncTimeout(cfg *config.Config) time.Duration {
func policyDefaultsFrom(cfg *config.Config) policy.Defaults {
func runSelfUpdate(args []string) {
func downloadUpdatePayload(ctx context.Context, client *http.Client, rawURL string, limit int64) ([]byte, error) {
func releaseDownloadTarget(info *update.ReleaseInfo, binName string) (downloadURL, checksum string, err error) {
func verifyDownloadedUpdate(ctx context.Context, u *update.Updater, info *update.ReleaseInfo, binName string, payload []
func unsignedReleaseAllowed() bool {
func readBounded(r io.Reader, limit int64) ([]byte, error) {
func runInteractiveWizard() {
func setupUsage(w io.Writer) {
func setupUsageError(format string, a ...any) {
func runSetup(args []string) {
func resolveRequestedBinaryPath(requested, self string) (string, error) {
func applyHostSetup(ctx context.Context, hostID string) int {
func applyAllDetectedSetup(ctx context.Context) int {
const bridgeUsage = "Usage: litespm bridge stdio [--host <host-id>] [--workspace <dir>]\n\n" +
func runBridge(args []string) {
func resolveBridgeProjectRoot(workspace string) string {
func runHostCommand(args []string) {
func runHostRemove(ctx context.Context, args []string) {
func runUninstall(ctx context.Context, args []string) int {
type uninstallRemainder struct {
func readUninstallRemainder(ctx context.Context, paths *config.PlatformPaths) uninstallRemainder {
func reportUninstallRemainder(ctx context.Context, paths *config.PlatformPaths) {
func runInstallRemove(args []string) {
func runAgentCommand(args []string) {
func truncate(s string, max int) string {
type searchOptions struct {
const searchCandidateCap = 500
const searchSynopsis = "Usage: litespm search <query> [--installable] [--json] [--limit <n>]"
... (58 more)
```

## cmd/litespm/main_test.go
*1643 lines*
```
package main
import (
const testListingID = "mcp:builtin:mcp-registry:demo-tool"
type pipeListener struct {
func newPipeListener() *pipeListener {
func (l *pipeListener) Accept() (net.Conn, error) {
func (l *pipeListener) Close() error {
func (l *pipeListener) Addr() net.Addr { return pipeAddr{} }
type pipeAddr struct{}
func (pipeAddr) Network() string { return "pipe" }
func (pipeAddr) String() string { return "pipe" }
type harness struct {
func newHarness(t *testing.T) *harness {
func newHarnessWith(t *testing.T, extra []*domain.Listing) *harness {
func newHarnessWithCatalog(t *testing.T, extra []*domain.Listing, extraRecords []*domain.VersionRecord) *harness {
func newHarnessFull(t *testing.T, extra []*domain.Listing, extraRecords []*domain.VersionRecord, beforeRegister func(pat
func rpcCode(t *testing.T, err error) int {
func TestParseInstallFlags(t *testing.T) {
func TestNewPlanID(t *testing.T) {
func TestPreparePlan_PersistsVerifiedPlan(t *testing.T) {
func TestPreparePlan_ErrorCodes(t *testing.T) {
func TestInstallExecute_ErrorMapping(t *testing.T) {
func TestInstallRemove_HonestResults(t *testing.T) {
func TestRegisteredHandlers_RealBehavior(t *testing.T) {
type invocationFixture struct {
func newInvocationFixture(t *testing.T, block bool) *invocationFixture {
func seedInvocationCapability(t *testing.T, db *state.DB, endpoint string) string {
func TestInvocationGetReturnsARecordedInvocation(t *testing.T) {
func TestInvocationCancelOverIPC(t *testing.T) {
func waitForInvocationState(t *testing.T, h *harness, id, want string) {
func TestRunStartupRecovery_ReportsTruthfully(t *testing.T) {
func TestReleaseDownloadTarget(t *testing.T) {
func TestDownloadUpdatePayloadHonorsDeadline(t *testing.T) {
func TestReadBounded(t *testing.T) {
func TestHostApplySetup_RealBehavior(t *testing.T) {
func TestStartupRecoveryHaltsOnFailedOperation(t *testing.T) {
func TestDoctorExitCode(t *testing.T) {
func TestInstallExecuteRefusesDiscoveryOnly(t *testing.T) {
func TestArchiveInstallPathEnforcesDenyRules(t *testing.T) {
func TestInstallRPCErrorEnumeratesArtifactUnavailable(t *testing.T) {
func TestToolsListUnionsProjectScope(t *testing.T) {
func TestSearchQueryArgsParsesFlags(t *testing.T) {
func TestDaemonInvokeResolvesSecretReferences(t *testing.T) {
func TestCatalogSyncTimeoutIgnoresTheCompiledDefault(t *testing.T) {
```

## cmd/litespm/marketplace.go
*101 lines*
```
package main
import (
const marketplaceUsage = `Usage: litespm marketplace [--url <url>] [--no-open]
func marketplaceURL() string {
func runMarketplace(args []string) {
func openBrowser(target string) error {
```

## cmd/litespm/marketplace_command.go
*58 lines*
```
package main
import (
func installMarketplaceCommand(ctx context.Context, w io.Writer, hostID, binary string) {
func describeMarketplaceCommand(res *host.MarketplaceCommandResult) []string {
func selfBinary() string {
```

## cmd/litespm/marketplace_rows.go
*606 lines*
```
package main
import (
const marketplaceRowsSchema = "litespm.marketplace.rows/v1"
var marketplaceTabs = []string{"mcp", "skill", "plugin", "installed"}
type marketplaceRow struct {
type marketplaceRowsDoc struct {
type marketplaceCommands struct {
type marketplaceRowsOptions struct {
const marketplaceRowsUsage = `Usage: litespm marketplace rows [<query>] [--query <q>] [--host <id>]
func parseMarketplaceRowsArgs(args []string) (marketplaceRowsOptions, error) {
var errShowHelp = fmt.Errorf("help requested")
func normalizeMarketplaceKind(raw string) (string, bool) {
func runMarketplaceRows(args []string) int {
func runMarketplaceRowsTo(out, errOut io.Writer, args []string) int {
type marketplaceSearcher interface {
func buildMarketplaceRows(cat marketplaceSearcher, records []inventoryRecord, opts marketplaceRowsOptions) *marketplaceR
func marketplaceRowPriority(r marketplaceRow) int {
func catalogRow(l *domain.Listing) marketplaceRow {
func notInstallableReason(l *domain.Listing) string {
type installedEntry struct {
func installedRowsByID(records []inventoryRecord, host string) map[string]*installedEntry {
func mergeInstalled(row *marketplaceRow, e *installedEntry) {
func installedOnlyRows(cat marketplaceSearcher, installed map[string]*installedEntry) []marketplaceRow {
func normalizeInventoryKind(k string) string {
func renderMarketplaceRowsTable(out io.Writer, doc *marketplaceRowsDoc) {
func marketplaceKindLabel(kind string) string {
var marketplaceFeaturedIDs = []string{
```

## cmd/litespm/marketplace_rows_test.go
*148 lines*
```
package main
import (
type fakeCatalog struct{ listings []*domain.Listing }
func (f *fakeCatalog) Count() int { return len(f.listings) }
func (f *fakeCatalog) GetListing(id string) (*domain.Listing, error) {
func (f *fakeCatalog) Search(q string, opts catalog.SearchOptions) []*catalog.SearchResult {
func listing(id, name string, kind domain.ListingKind, inst domain.Installability) *domain.Listing {
func TestMarketplaceRowsRankingAndInstalledMerge(t *testing.T) {
func TestMarketplaceRowsEmptyQueryStartsWithFeatured(t *testing.T) {
func TestMarketplaceRowsInstalledTab(t *testing.T) {
func TestMarketplaceFeaturedMatchesSite(t *testing.T) {
func TestMarketplaceRowsArgs(t *testing.T) {
```

## cmd/litespm/marketplace_test.go
*32 lines*
```
package main
import (
func TestMarketplaceURL(t *testing.T) {
func TestMarketplaceHelpNamesTheTabsAndTheLimit(t *testing.T) {
```

## cmd/litespm/plan_fields_test.go
*783 lines*
```
package main
import (
func pinHostScanHome(t *testing.T) string {
func writeClaudeBridge(t *testing.T, home string) string {
func TestPlanEffectsDerivation(t *testing.T) {
func TestPreparePlanDeclaresTargetHosts(t *testing.T) {
func TestMCPPlanRejectsChangedHostConfigTarget(t *testing.T) {
func TestRequestedAccessFor(t *testing.T) {
func TestVersionRecordForFailsSoft(t *testing.T) {
func TestHostChangesForSkipsNonMCPKinds(t *testing.T) {
func versionLessSkillFixture() (*domain.Listing, *domain.VersionRecord) {
func assertVersionLessPlan(t *testing.T, row *domain.Listing, rec *domain.VersionRecord) {
func TestBuildInstallPlanResolvesVersionLessSkillRow(t *testing.T) {
func TestBuildInstallPlanRefusesUnnamedSkillFanOut(t *testing.T) {
const remoteEndpoint = "https://mcp.example.com/mcp"
func remoteRuntime() *domain.RuntimeDescriptor {
func remotePlanClient(t *testing.T) (*catalog.Client, *domain.Listing) {
func hostChangeIDs(plan *domain.InstallPlan) []string {
func TestDeclaresRemoteTransportTable(t *testing.T) {
func recordWithTypeCommand(typ, command string) *domain.VersionRecord {
func TestBuildInstallPlanFiltersIncapableHostsForRemoteRuntime(t *testing.T) {
func TestBuildInstallPlanExplicitHostFailsByName(t *testing.T) {
func TestBuildInstallPlanAllIncapableHostsFailWithCapabilityReason(t *testing.T) {
func TestBuildInstallPlanFiltersHostsThatLackTheTransport(t *testing.T) {
func TestBuildInstallPlanRefusesUnsafeEndpoint(t *testing.T) {
func TestBuildInstallPlanRefusesEnvForRemoteRuntime(t *testing.T) {
```

## cmd/litespm/restore.go
*765 lines*
```
package main
import (
type fileAction struct {
type restorePlan struct {
type restoreOutcome struct {
func planRestore(ctx context.Context, db *state.DB, installID string) (*restorePlan, error) {
func planSkillRestore(_ context.Context, rows []deployment.Mutation, plan *restorePlan) error {
func planFileRestore(ctx context.Context, rows []deployment.Mutation, projectRoot string) (*fileAction, string, error) {
func orAbsent(p string) string {
func planHostRestore(ctx context.Context, db *state.DB, hostID string) ([]string, error) {
func applyRestore(ctx context.Context, db *state.DB, dataRoot string, plan *restorePlan) (*restoreOutcome, error) {
func restoreSkillDir(dataRoot, dir string) error {
func restoreInstall(ctx context.Context, db *state.DB, dataRoot, installID string) (*restoreOutcome, error) {
func runRestore(ctx context.Context, args []string) {
func restoreUsage() {
type diffLeaf struct {
func unownedDifferences(structure string, current, backup []byte, owned [][]string) ([]string, error) {
func jsonDiffLeaves(current, backup []byte) ([]diffLeaf, error) {
func parseJSONDoc(data []byte, what string) (map[string]any, error) {
func diffJSON(a, b any, path []string, out *[]diffLeaf) {
func clonePath(p []string) []string { return append([]string(nil), p...) }
func displayPath(p []string) string {
func isOwnedSegments(path []string, owned [][]string) bool {
func tomlDiffLeaves(current, backup []byte) ([]diffLeaf, error) {
func tomlLeaf(name string, nonEmpty bool) diffLeaf {
func tomlSections(content string) (map[string]string, error) {
```

## cmd/litespm/restore_adopt_test.go
*158 lines*
```
package main
import (
type adoptOnlyFixture struct {
func newAdoptOnlyFixture(t *testing.T) *adoptOnlyFixture {
func TestRestoreLeavesAnAdoptedHostConfigAlone(t *testing.T) {
func TestRestoreDropsTheAdoptionsOwnership(t *testing.T) {
```

## cmd/litespm/restore_test.go
*404 lines*
```
package main
import (
func setRestoreEnv(t *testing.T) string {
func TestRestoreRollsBackExactPreInstallBytes(t *testing.T) {
func TestRestoreRemovesEntryFromUntouchedConfig(t *testing.T) {
func TestRestoreRefusesWhenSiblingChanged(t *testing.T) {
func TestRestoreRefusesWhenOwnedNodeEdited(t *testing.T) {
func TestRestoreRemovesCreatedConfigAndRefusesAdditions(t *testing.T) {
func TestRestoreRollsBackTOMLConfig(t *testing.T) {
func TestRestoreSkillDirectoryAndRefusesEdited(t *testing.T) {
```

## cmd/litespm/sandbox_all_agents_test.go
*82 lines*
```
package main
import (
func TestSandboxAllAgentsSetupAll(t *testing.T) {
```

## cmd/litespm/search_install_status_test.go
*141 lines*
```
package main
import (
func searchRow(id string, kind domain.ListingKind, inst domain.Installability) *catalog.SearchResult {
func ids(rs []*catalog.SearchResult) []string {
func TestPartitionInstallableIsStable(t *testing.T) {
func TestSearchQueryArgsInstallable(t *testing.T) {
func TestSearchGlyphsUnicode(t *testing.T) {
func TestWriteSearchTableShowsStatus(t *testing.T) {
func TestInstallFailureTextIsReadable(t *testing.T) {
func TestUnknownCommandMessage(t *testing.T) {
func TestApprovalPromptLabels(t *testing.T) {
```

## cmd/litespm/setup_uninstall_test.go
*340 lines*
```
package main
import (
func sandboxedPaths(t *testing.T) *config.PlatformPaths {
func TestUninstallEpilogueNamesRemainingMCPAndSkills(t *testing.T) {
func TestUninstallEpilogueDoesNotClaimMCPRemovalWithoutRecords(t *testing.T) {
func setupCLI(t *testing.T, home string, args ...string) (string, string, int) {
func TestSetupUninstallHelperProcess(t *testing.T) {
func TestSetupHelpAndUsageErrors(t *testing.T) {
func TestSetupAgentWritesTheSameResultAsHostSetup(t *testing.T) {
```

## cmd/litespm/skills_add.go
*1183 lines*
```
package main
import (
const litespmBanner = `
func skillsAddUsage() {
func isTerminal(f *os.File) bool {
func runSkillsAddForm(out *bufio.Writer, fields ...huh.Field) error {
type skillsAddOptions struct {
func parseSkillsAddArgs(args []string) (skillsAddOptions, error) {
func runSkillsAdd(args []string) {
func skillPromptItems(found []skills.DiscoveredSkill) []promptItem {
func agentPromptItem(agent skills.AgentTarget, scope, project, home string, detected bool) promptItem {
func titleCase(s string) string {
func existingDestinations(ops []skills.InstallOp) int {
func selectSkillsByName(found []skills.DiscoveredSkill, requested []string) (selected []skills.DiscoveredSkill, missing 
func expandAgentSelection(requested []string) ([]string, error) {
func splitAgentsByDetection(targets []skills.AgentTarget, project, home string) (detected, other []skills.AgentTarget) {
func plural(n int) string {
func truncateRunes(s string, n int) string {
func parseNumberSelection(answer string, total int) ([]int, error) {
func shortHome(path, home string) string {
func scopeLabel(scope string) string {
func printInstallSummary(out *bufio.Writer, src skills.SkillSource, selected []skills.DiscoveredSkill, ops []skills.Inst
func printRiskPanel(out *bufio.Writer, src skills.SkillSource, selected []skills.DiscoveredSkill) {
func homeDirForDisplay() string {
type installedSkill struct {
func printCompletion(out *bufio.Writer, src skills.SkillSource, selected []skills.DiscoveredSkill, done []installedSkill
```

## cmd/litespm/skills_add_overwrite_test.go
*69 lines*
```
package main
import (
func TestSkillsAddForcePrintsOverwritesAndPreImageDigest(t *testing.T) {
```

## cmd/litespm/skills_add_test.go
*708 lines*
```
package main
import (
func TestParseSkillsAddArgs(t *testing.T) {
func TestParseNumberSelection(t *testing.T) {
func TestPlural(t *testing.T) {
func TestTruncateRunes(t *testing.T) {
func TestShortHome(t *testing.T) {
func TestPrintInstallSummary(t *testing.T) {
func TestPrintRiskPanel(t *testing.T) {
func TestSkillsAddListShortFlagEqualsLong(t *testing.T) {
func TestSkillsAddAllEqualsWildcardPair(t *testing.T) {
func TestSkillsAddSkillSelectionWildcardAndNames(t *testing.T) {
func TestSkillsAddAgentStarExpandsToTable(t *testing.T) {
func TestSkillsAddAgentStarDestinationDedup(t *testing.T) {
func TestSkillsAddSplitAgentsByDetection(t *testing.T) {
func skillsAddCLI(t *testing.T, project, home string, args ...string) (string, string, int) {
func TestSkillsAddHelperProcess(t *testing.T) {
func decodeInstalledSkills(t *testing.T, stdout string) []installedSkill {
func TestSkillsAddListShortFlagEndToEnd(t *testing.T) {
func TestSkillsAddWildcardSkillsEndToEnd(t *testing.T) {
func TestSkillsAddAllEndToEnd(t *testing.T) {
func TestSkillsAddYesDetectsAgentsEndToEnd(t *testing.T) {
func TestSkillsAddRefusalExitCodes(t *testing.T) {
```

## cmd/litespm/skills_adopt.go
*336 lines*
```
package main
import (
const skillsAdoptUsageText = `Usage: litespm skills adopt <name> [--agent <id>]... [--scope user|project]
type skillsAdoptOptions struct {
func parseSkillsAdoptArgs(args []string) (skillsAdoptOptions, error) {
func runSkillsAdopt(args []string) int {
func runSkillsAdoptTo(out, errOut io.Writer, paths *config.PlatformPaths, opts skillsAdoptOptions) int {
type adoptCandidate struct {
func adoptSkillCandidates(opts skillsAdoptOptions, safeName, projectRoot, home string) ([]adoptCandidate, error) {
func alreadyAdopted(entries []skills.LedgerEntry, destDir string) bool {
func hasSkillManifest(dir string) bool {
func printSkillsAdoptUsage() {
```

## cmd/litespm/skills_adopt_test.go
*231 lines*
```
package main
import (
type adoptSkillFixture struct {
func newAdoptSkillFixture(t *testing.T) *adoptSkillFixture {
func TestSkillsAdoptTakesOwnershipWithoutTouchingTheSkill(t *testing.T) {
func TestSkillsAdoptRefusesANameThatIsNotThere(t *testing.T) {
func TestSkillsUpdateRefusesAnAdoptedRow(t *testing.T) {
func TestSkillsAdoptRecordsTheUsersOwnFilesAsPartOfTheSkill(t *testing.T) {
```

## cmd/litespm/skills_find.go
*494 lines*
```
package main
import (
var skillsFindUsageText = `Usage: litespm skills find [<query>] [--owner <org>] [--limit <n>] [--json]
type skillsFindOptions struct {
func skillsFindUsage(w io.Writer) {
func parseSkillsFindArgs(args []string) (skillsFindOptions, error) {
var skillsFindIndex = func(paths *config.PlatformPaths) *catalog.Client {
func runSkillsFind(args []string) int {
func runSkillsFindTo(out, errOut io.Writer, stdin io.Reader, interactive bool, args []string) int {
func skillsFindEmptyMessage(opts skillsFindOptions) string {
func searchSkillListings(c *catalog.Client, query, owner string, limit int) []*catalog.SearchResult {
var skillOwnerRepoNames = map[string]bool{
func skillSourceOwner(l *domain.Listing) (string, bool) {
func skillSourceRepoPath(l *domain.Listing) (string, bool) {
func printSkillsFindTable(out io.Writer, opts skillsFindOptions, results []*catalog.SearchResult) {
func runSkillsFindPicker(out, errOut io.Writer, stdin io.Reader, results []*catalog.SearchResult) int {
func printSkillsFindSelection(out io.Writer, res *catalog.SearchResult) {
func skillsFindSelectorName(l *domain.Listing) string {
type skillsFindRow struct {
type skillsFindDocument struct {
func emitSkillsFindJSON(out, errOut io.Writer, opts skillsFindOptions, results []*catalog.SearchResult, indexed int) int
func init() {
```

## cmd/litespm/skills_find_test.go
*364 lines*
```
package main
import (
func findTestListing(id, name, sourceURL string) *domain.Listing {
func findTestMCP(id, name, sourceURL string) *domain.Listing {
func injectSkillsFindIndex(t *testing.T, listings ...*domain.Listing) *catalog.Client {
func TestSkillsFindParseArgs(t *testing.T) {
func TestSkillsFindSourceRepoPath(t *testing.T) {
func TestSkillsFindRunKeywordIsSkillsOnly(t *testing.T) {
func TestSkillsFindRunOwnerFilter(t *testing.T) {
func TestSkillsFindRunOwnerNoMatch(t *testing.T) {
func TestSkillsFindRunEmptyIndex(t *testing.T) {
func TestSkillsFindRunJSON(t *testing.T) {
func TestSkillsFindRunNoQueryNonTerminalPrintsList(t *testing.T) {
func TestSkillsFindInteractivePicker(t *testing.T) {
func TestSkillsFindUseHelpSynopsisRegistered(t *testing.T) {
```

## cmd/litespm/skills_force_roundtrip_test.go
*113 lines*
```
package main
import (
func TestSkillsAddForceOverwriteRoundTripRestoresSentinel(t *testing.T) {
func TestParseSkillsAddArgsForce(t *testing.T) {
```

## cmd/litespm/skills_init.go
*311 lines*
```
package main
import (
const skillsInitUsage = `Usage: litespm init [name] [--dir <path>] [--force]
type skillsInitFlags struct {
func parseSkillsInitArgs(args []string) (skillsInitFlags, error) {
func runSkillsInit(args []string) int {
func runSkillsInitTo(out, errOut io.Writer, args []string) int {
func printInitNextSteps(out io.Writer, dirAbs, name string) {
func deriveSkillName(base string) string {
func scaffoldSkillMD(name string) []byte {
var initHelpPage = commandHelp{
func init() {
func withoutString(list []string, s string) []string {
```

## cmd/litespm/skills_init_test.go
*205 lines*
```
package main
import (
func TestInitScaffoldParsesUnderRealLoader(t *testing.T) {
func TestInitCommandWritesDiscoverableSkill(t *testing.T) {
func TestInitRefusesOverExistingFileWithoutForce(t *testing.T) {
func TestInitForceOverwritesExistingFile(t *testing.T) {
func TestInitNameHandling(t *testing.T) {
func TestInitHelpFlag(t *testing.T) {
```

## cmd/litespm/skills_policy.go
*152 lines*
```
package main
import (
type skillPolicyAsker func(ctx context.Context, req skills.PolicyRequest, detail string) bool
func skillPolicyInput(req skills.PolicyRequest) policy.PolicyInput {
func enginePolicyChecker(engine *policy.Engine, ask skillPolicyAsker) skills.PolicyChecker {
type interactivePolicyAsker struct {
func newInteractivePolicyAsker(yes bool) *interactivePolicyAsker {
func (a *interactivePolicyAsker) resolve(_ context.Context, req skills.PolicyRequest, detail string) bool {
func isAffirmative(answer string) bool {
```

## cmd/litespm/skills_remove.go
*799 lines*
```
package main
import (
func skillsListUsage() {
type skillsListOptions struct {
func parseSkillsListArgs(args []string) (skillsListOptions, error) {
func validateAgentSelection(agents []string) error {
func entryRecordedAgent(e skills.LedgerEntry) string {
func entryMatchesAgentFilter(e skills.LedgerEntry, agents []string) bool {
func containsString(list []string, want string) bool {
func filterSkillsList(entries []skills.LedgerEntry, opts skillsListOptions) []skills.LedgerEntry {
func runSkillsList(args []string) {
func skillsRemoveUsage() {
type skillsRemoveOptions struct {
func parseSkillsRemoveArgs(args []string) (skillsRemoveOptions, error) {
func hasNarrowSelector(values []string) bool {
func appendWildcard(list []string) []string {
func hasWildcard(list []string) bool {
func runSkillsRemove(args []string) {
func needsRemovePicker(opts skillsRemoveOptions) bool {
func runInteractiveSkillsRemove(opts skillsRemoveOptions) {
type removeCandidate struct {
func buildRemoveCandidates(entries []skills.LedgerEntry, opts skillsRemoveOptions) []removeCandidate {
func appendUnique(list []string, v string) []string {
func reportSkillsRemove(opts skillsRemoveOptions, outcomes []skills.RemovalOutcome) {
func executeSkillsRemove(opts skillsRemoveOptions, paths *config.PlatformPaths) ([]skills.RemovalOutcome, error) {
func planSkillsRemove(entries []skills.LedgerEntry, opts skillsRemoveOptions, scope string) (names []string, refusals []
func firstUnselectedRow(entries []skills.LedgerEntry, name, scope string, selected func(skills.LedgerEntry) bool) (skill
func entryMatchesSkillSelection(e skills.LedgerEntry, opts skillsRemoveOptions) bool {
func entryMatchesSourceFilter(e skills.LedgerEntry, sources []string) bool {
func hasFlag(args []string, flag string) bool {
func pluralY(n int) string {
func repeat(s string, n int) string {
func removeSkillsPicked(opts skillsRemoveOptions, paths *config.PlatformPaths, candidates []removeCandidate, picked []in
```

## cmd/litespm/skills_remove_parity_test.go
*270 lines*
```
package main
import (
func TestSkillsRemoveAllEqualsWildcardFlags(t *testing.T) {
func TestSkillsRemoveByExactSource(t *testing.T) {
func TestSkillsRemoveSourceSplitNameIsRefused(t *testing.T) {
func TestSkillsRemoveAgentFilter(t *testing.T) {
func TestSkillsListFilters(t *testing.T) {
func TestSkillsListArgs(t *testing.T) {
func TestSkillsRemoveUnknownAgentIsRejected(t *testing.T) {
```

## cmd/litespm/skills_remove_test.go
*185 lines*
```
package main
import (
func TestParseSkillsRemoveArgs(t *testing.T) {
func setupRemoval(t *testing.T) (paths *config.PlatformPaths, projectDir, globalDir string) {
func TestExecuteSkillsRemove_ScopeAndForce(t *testing.T) {
```

## cmd/litespm/skills_update.go
*953 lines*
```
package main
import (
func skillsUpdateUsage() {
type skillsUpdateOptions struct {
func parseSkillsUpdateArgs(args []string) (skillsUpdateOptions, error) {
type skillUpdateResult struct {
func loadSkillLedgerEntries(paths *config.PlatformPaths) ([]skills.LedgerEntry, error) {
func runSkillsUpdate(args []string) {
func resolveUpdateScope(opts skillsUpdateOptions, entries []skills.LedgerEntry, cwd string) skillsUpdateOptions {
func promptUpdateScope(opts skillsUpdateOptions, entries []skills.LedgerEntry, cwd string) skillsUpdateOptions {
func detectUpdateScope(entries []skills.LedgerEntry, cwd string) string {
func projectRootOfEntry(e skills.LedgerEntry) (string, bool) {
func pathContains(parent, child string) bool {
func stdinIsTerminal() bool {
type skillUpdateGroup struct {
func skillUpdateSourceKey(src skills.SkillSource) string {
func executeSkillsUpdate(ctx context.Context, opts skillsUpdateOptions, paths *config.PlatformPaths) ([]skillUpdateResul
func updateSourceForEntry(e skills.LedgerEntry, override *skills.SkillSource, refOverride string) (skills.SkillSource, e
func recordedSkillSource(e skills.LedgerEntry) (skills.SkillSource, error) {
func splitGitHubBrowseDisplay(raw string) (cloneURL, display, repoPath, subpath string, ok bool) {
func recordedPin(ref string) string {
func isBareCommit(ref string) bool {
func executeUpdateGroup(ctx context.Context, g *skillUpdateGroup, installer *skills.Installer, opts skillsUpdateOptions,
func skillUpdateFailures(results []skillUpdateResult) int {
func printUpdateResults(results []skillUpdateResult) {
var gitCloneEnv = []string{
var gitCloneTimeout = func() time.Duration {
func fetchSkillSourceTree(src skills.SkillSource) (root string, cleanup func(), err error) {
func gitHeadCommit(dir string) string {
func discoverSkillsIncludingRoot(root string) ([]skills.DiscoveredSkill, error) {
```

## cmd/litespm/skills_update_git_test.go
*71 lines*
```
package main
import (
func TestGitCloneEnvIsHardened(t *testing.T) {
func TestGitCloneTimeoutIsBounded(t *testing.T) {
```

## cmd/litespm/skills_update_parity_test.go
*317 lines*
```
package main
import (
type skillFixture struct {
func newSkillFixture(t *testing.T, dataRoot, name string) skillFixture {
func (fx skillFixture) install(t *testing.T, agent, scope, recordedSource, body string) skillFixture {
func (fx skillFixture) revise(t *testing.T, body string) {
func mustReadSkillBody(t *testing.T, dir string) string {
func TestSkillsUpdateAllResolvesSourceFromLedger(t *testing.T) {
func TestSkillsUpdateNames(t *testing.T) {
func TestSkillsUpdateSourceOverrideForRowWithoutSource(t *testing.T) {
func TestSkillsUpdateMissingSourceReportsAndContinues(t *testing.T) {
func TestSkillsUpdateScopeSelection(t *testing.T) {
func TestRecordedSkillSourcePinHeuristic(t *testing.T) {
```

## cmd/litespm/skills_update_test.go
*286 lines*
```
package main
import (
func writeTestSkill(t *testing.T, dir, name, body string) {
func installTestSkill(t *testing.T, dataRoot, name, scope, body string) string {
func TestParseSkillsUpdateArgs(t *testing.T) {
func TestExecuteSkillsUpdate_LocalSource(t *testing.T) {
func TestEnginePolicyChecker(t *testing.T) {
```

## cmd/litespm/skills_use.go
*512 lines*
```
package main
import (
var skillsUseUsageText = `Usage: litespm skills use <source> [--skill <name>] [--json]
type skillsUseOptions struct {
func skillsUseUsage(w io.Writer) {
func parseSkillsUseArgs(args []string) (skillsUseOptions, error) {
var skillsUseTempDir = func() (string, error) {
func runSkillsUse(args []string) int {
func runSkillsUseTo(out, errOut io.Writer, stdin io.Reader, interactive bool, args []string) int {
func refuseSkillsUseAgent(errOut io.Writer, opts skillsUseOptions) int {
func skillFlagHint(opts skillsUseOptions) string {
func splitSkillsUseSelector(raw string) (source, selector string) {
func selectSkillsUseSkill(found []skills.DiscoveredSkill, want string, interactive bool, stdin io.Reader, out, errOut io
func discoveredSkillMatches(pkg *skills.SkillPackage, want string) bool {
func discoveredSkillNames(found []skills.DiscoveredSkill) []string {
func sanitizePromptForPipe(body string) string {
type skillsUseDocument struct {
type skillsUseSkill struct {
func init() {
```

## cmd/litespm/skills_use_test.go
*379 lines*
```
package main
import (
func captureSkillsStreams(t *testing.T, fn func() int) (int, string, string) {
func writeUseSkillDir(t *testing.T, source, name, body string) string {
func singleUseSource(t *testing.T) (source, skillDir string) {
func TestSkillsUseParseArgs(t *testing.T) {
func TestSkillsUseSplitSelector(t *testing.T) {
func TestSkillsUseRunPrintsPromptFromLocalSource(t *testing.T) {
func TestSkillsUseRunSelectsBySkillFlag(t *testing.T) {
func TestSkillsUseRunMultipleSkillsRefusesWithoutSelector(t *testing.T) {
func TestSkillsUseRunUnknownSelectorNamesTheValue(t *testing.T) {
func TestSkillsUseRunJSONEmitsMetadataNotPrompt(t *testing.T) {
func TestSkillsUseRunRefusesAgentHonestly(t *testing.T) {
func TestSkillsUseSanitizesPrompt(t *testing.T) {
func TestSkillsUseRemovesScratchDirectory(t *testing.T) {
func TestSkillsUseInteractivePicker(t *testing.T) {
func TestSkillsUseRefusesFrontmatterOnlySkill(t *testing.T) {
```

## cmd/litespm/sync.go
*444 lines*
```
package main
import (
type syncOptions struct {
type syncReport struct {
func syncUsage() {
func parseSyncArgs(args []string) (syncOptions, error) {
func runSync(args []string) int {
func runSyncWithOptions(ctx context.Context, out io.Writer, opts syncOptions) int {
func executeSync(ctx context.Context, out io.Writer, opts syncOptions) (*syncReport, error) {
```

## cmd/litespm/sync_test.go
*85 lines*
```
package main
import (
func TestSyncParseArgs(t *testing.T) {
func TestSyncExecutionDryRun(t *testing.T) {
```

## cmd/litespm/table.go
*70 lines*
```
package main
import (
func writeTable(w io.Writer, indent string, header []string, rows [][]string) {
func writeTableNoRule(w io.Writer, indent string, header []string, rows [][]string) {
func writeTableOpt(w io.Writer, indent string, header []string, rows [][]string, rule bool) {
```

## cmd/litespm/terminal_ui.go
*146 lines*
```
package main
import (
func terminalUIAvailable(in io.Reader, out io.Writer) bool {
func runTerminalForm(in io.Reader, out io.Writer, fields ...huh.Field) error {
func renderLiteSPMWordmark() string {
func renderStatusPill(status string) string {
func renderDiffPreview(lines []string, hiddenCount int) string {
func runWithSpinner[T any](ctx context.Context, in io.Reader, out io.Writer, label string, run func() (T, error)) (T, er
```

## cmd/litespm/terminal_ui_test.go
*29 lines*
```
package main
import (
func TestTerminalUIAvailableUsesPlainModeForPipes(t *testing.T) {
func TestRunWithSpinnerRunsOperationWithoutTerminal(t *testing.T) {
```

## cmd/litespm/ui_kit.go
*248 lines*
```
package main
import (
func uiTermDumb() bool {
func uiWidth(out io.Writer) int {
func uiFit(s string, width int) string {
var (
func uiStepHeader(out io.Writer, n, total int, title string) {
func uiOK(out io.Writer, format string, args ...any) {
func uiWarn(out io.Writer, format string, args ...any) {
func uiErr(out io.Writer, format string, args ...any) {
func uiHint(out io.Writer, format string, args ...any) {
func uiCompactHeader(subtitle string) string {
func uiCard(out io.Writer, tone, title string, lines []string, footer string) string {
func uiKV(label, value string) string {
type choiceOption struct {
func (c choiceOption) display() string {
func uiSelectOne(in io.Reader, out io.Writer, title, description string, options []choiceOption, def string) (string, bo
func uiConfirm(in io.Reader, out io.Writer, title, description, yes, no string, def bool) (bool, error) {
func uiInputText(in io.Reader, out io.Writer, title, description, placeholder string) (string, bool, error) {
func uiElapsed(d time.Duration) string {
func askApply(out io.Writer, question string) bool {
```

## cmd/litespm/ui_kit_test.go
*98 lines*
```
package main
import (
func TestUIFitTruncatesToDisplayWidth(t *testing.T) {
func TestUIElapsedFormats(t *testing.T) {
func TestTerminalUIUnavailableOnDumbTerm(t *testing.T) {
func TestRunWithSpinnerWritesNothingOffTerminal(t *testing.T) {
func TestUICardAndLinesHaveNoANSIOffTerminal(t *testing.T) {
func TestAskApplyFallsBackToTextOffTerminal(t *testing.T) {
```

## cmd/litespm/update_trust_test.go
*43 lines*
```
package main
import (
func TestVerifyDownloadedUpdateRequiresSignatureByDefault(t *testing.T) {
func TestVerifyDownloadedUpdateAllowsExplicitUnsignedReleaseOptOut(t *testing.T) {
func TestVerifyDownloadedUpdateUnknownOptOutValueDoesNotWeakenPolicy(t *testing.T) {
```

## cmd/litespm/usage_exit_test.go
*96 lines*
```
package main
import (
func TestUsageExitCodes(t *testing.T) {
func TestSkillsHelpExitsZero(t *testing.T) {
func TestUsageExitHelperProcess(t *testing.T) {
```

## cmd/litespm/wizard.go
*2781 lines*
```
package main
import (
var errInputEnded = errors.New("input ended before an answer was read")
var errSetupSkipped = errors.New("agent setup skipped")
type Wizard struct {
func NewWizard(in io.Reader, out io.Writer, paths *config.PlatformPaths) *Wizard {
func (w *Wizard) Run(ctx context.Context) error {
func (w *Wizard) finishInput(err error) error {
func (w *Wizard) readLine() (string, error) {
func (w *Wizard) printBanner(firstRun bool) {
func (w *Wizard) printRuntimeSummary() {
func (w *Wizard) configuredHosts(ctx context.Context) ([]host.HostVerification, error) {
func (w *Wizard) printConfiguredSummary(configured []host.HostVerification) {
func (w *Wizard) autoConnectUnconfiguredHosts(ctx context.Context) []string {
func (w *Wizard) runSetup(ctx context.Context) (bool, error) {
type setupRecord struct {
func (w *Wizard) printSetupCard(configured, selected int) {
type agentMenuRow struct {
func (w *Wizard) agentMenuRows(ctx context.Context) []agentMenuRow {
func (w *Wizard) promptAgentSelectionMany(ctx context.Context) ([]host.HostAdapter, error) {
func (w *Wizard) promptAgentSelection(ctx context.Context) (host.HostAdapter, error) {
func (w *Wizard) promptAgentSelectionText(rows, detected []agentMenuRow) (host.HostAdapter, error) {
func (w *Wizard) promptAgentMultiSelectTUI(rows, detected []agentMenuRow) ([]host.HostAdapter, error) {
func (w *Wizard) printAgentRows(rows []agentMenuRow) {
func describeConfigTarget(name, path string) string {
func (w *Wizard) resolveAgentConfig(ctx context.Context, adapter host.HostAdapter) (string, bool, error) {
func (w *Wizard) resolveAgentConfigTTY(ctx context.Context, adapter host.HostAdapter) (string, bool, error) {
func normalizeTypedPath(p string) string {
func (w *Wizard) applyAgentIntegration(ctx context.Context, adapter host.HostAdapter, configPath string) error {
func changePreview(original, proposed string, maxLines int) ([]string, int) {
func (w *Wizard) printNextStep(adapter host.HostAdapter) {
func (w *Wizard) actionMenuItems() []promptItem {
func (w *Wizard) runActionMenu(ctx context.Context) error {
func (w *Wizard) actionRunDoctor(ctx context.Context) error {
func (w *Wizard) actionRunAudit(ctx context.Context) error {
func (w *Wizard) actionDetectAgents(ctx context.Context) error {
func (w *Wizard) actionOpenMarketplace() error {
func (w *Wizard) actionInstallSkillFromSource(ctx context.Context) error {
func (w *Wizard) openStateDB() (*state.DB, func(), error) {
func (w *Wizard) catalog() *catalog.Client {
func (w *Wizard) syncCatalog() *catalog.Client {
func (w *Wizard) actionSyncCatalog(ctx context.Context) error {
func (w *Wizard) pickCatalogResult(results []*catalog.SearchResult, query string) (*domain.Listing, error) {
func (w *Wizard) printListingDetail(l *domain.Listing) {
func (w *Wizard) actionFindAndInstall(ctx context.Context, db *state.DB) error {
... (32 more)
```

## cmd/litespm/wizard_test.go
*925 lines*
```
package main
import (
func hermeticWizardHome(t *testing.T) string {
func tempWizardPaths(t *testing.T) *config.PlatformPaths {
func newTestWizard(t *testing.T, in string, paths *config.PlatformPaths) (*Wizard, *bytes.Buffer) {
func wizardRowIndex(t *testing.T, w *Wizard, hostID string, detectedOnly bool) int {
func countLines(s string) int {
func assertBoundedOutput(t *testing.T, out string, maxLines int) {
func clineConfigPath(home string) string {
func TestWizard_InteractiveAgentSelectionAndCancellation(t *testing.T) {
func TestWizard_PrintUsage(t *testing.T) {
func TestWizard_InstallSkillFromSourceAction(t *testing.T) {
func TestWizard_InstallSkillFromSourceCanReturnToMenu(t *testing.T) {
func TestWizard_ActionMenuLaunchesSkillInstaller(t *testing.T) {
func TestWizard_ActionMenuAllowsSourceInstallWhenManagerStateCannotOpen(t *testing.T) {
func TestWizard_EOFStopsAtEveryPrompt(t *testing.T) {
func TestWizard_ManualPathIsThePathWritten(t *testing.T) {
type unplannableAdapter struct{ host.HostAdapter }
func TestWizard_RefusesUnplannablePathWithoutWriting(t *testing.T) {
func TestWizard_AgentMenuComesFromAdapterRegistry(t *testing.T) {
func TestWizard_ConfigTargetWordingDistinguishesCreateFromEdit(t *testing.T) {
func TestWizard_DoesNotPromiseAdopt(t *testing.T) {
func TestWizard_VoiceQuotesAreGone(t *testing.T) {
func wizardEnvForHarness(t *testing.T, h *harness) {
func activateWizardListing(t *testing.T, h *harness, listingID string) {
const wizardInstallInput = "2\ndemo-skill\n1\n1\ny\nq\n"
func TestWizard_InstallActionLandsInTheSkillsLedger(t *testing.T) {
func TestWizard_SecondRunReachesMenuWithoutReapplying(t *testing.T) {
func TestWizard_RemoveActionRemovesWhatItInstalled(t *testing.T) {
func newHarnessWizard(t *testing.T, h *harness, in string) (*Wizard, *bytes.Buffer) {
func TestWizard_SyncFailureNeverClaimsSuccess(t *testing.T) {
func TestWizard_ListActionShowsTheSharedInventory(t *testing.T) {
func TestWizard_EOFStopsInsideHarnessActions(t *testing.T) {
func TestWizard_EndToEndInteractiveFlowAndMarketplaceCommands(t *testing.T) {
```

## cmd/litespm/wizard_tui_test.go
*486 lines*
```
package main
import (
func TestWizardActionMenuItemsCoverEveryNumberedAction(t *testing.T) {
func TestWizardInstallScopeItemsMapToTheRightScope(t *testing.T) {
func TestWizardMCPInstallSummaryBoxCarriesTheSealedFacts(t *testing.T) {
func TestWizardSkillInstallSummaryBoxCarriesTheSealedDestinations(t *testing.T) {
func mcpPlanFixtureChanges(hostID, configPath, valueJSON string) []domain.HostChange {
func TestWizardInstallCompletionBoxesListHostsAndPaths(t *testing.T) {
func TestWizardMCPInstallShowsSummaryAndCompletion(t *testing.T) {
func TestWizardDeclinedInstallWritesNothing(t *testing.T) {
func TestWizardConfiguredSummaryIsOneCompactLine(t *testing.T) {
func TestWizardCompactConfiguredSummaryHandlesManyHosts(t *testing.T) {
func TestNormalizeTypedPath(t *testing.T) {
func TestWizardScopePromptRejectsTypos(t *testing.T) {
func TestWizardAskYesNoPipePath(t *testing.T) {
```

## cmd/litespm/workspace_scope_test.go
*433 lines*
```
package main
import (
func TestPreparePlanProjectScopeWorkspace(t *testing.T) {
func TestInstallMCPProjectScopeRecordsWorkspace(t *testing.T) {
func seedSkillTree(t *testing.T, casRoot, digest, name, body string) {
func TestInstallSkillUserScopeRecordsNoWorkspace(t *testing.T) {
func TestInstallExecuteProjectScopeRecordsWorkspace(t *testing.T) {
func TestApprovalPromptNamesProjectWorkspace(t *testing.T) {
func TestSkillsReadProjectScopeWithRoot(t *testing.T) {
```

# INTERNAL LIBRARIES — internal/ (44 packages)

## PACKAGE: internal/agent (5 files)

### internal/agent/acp.go — 161 lines
```
package agent
type ACPAdapter struct{}
func NewACPAdapter() *ACPAdapter { return &ACPAdapter{} }
func (a *ACPAdapter) SourceID() string { return "builtin:acp-registry" }
func ParseRegistry(data []byte) (*Registry, error) {
func MatchTarget(goos, goarch string) (Target, bool) {
func HostTarget() (Target, bool) {
func (a *ACPAdapter) Supports(ag Agent) bool {
func (a *ACPAdapter) Resolve(ag Agent, target Target, binaryDir string) (*LaunchSpec, error) {
```

### internal/agent/agent_test.go — 189 lines
```
package agent
const sampleRegistry = `{
func TestParseRegistry(t *testing.T) {
func TestParseRegistryRejectsEmpty(t *testing.T) {
func TestMatchTarget(t *testing.T) {
func TestOverridesAgainstRegistry(t *testing.T) {
func TestACPResolve(t *testing.T) {
```

### internal/agent/overrides.go — 112 lines
```
package agent
type launchOverride struct {
var launchOverrides = map[string]launchOverride{
func overrideFor(id string) (launchOverride, bool) {
func IsDeprecated(id string) bool {
func mergeEnv(base, extra map[string]string) map[string]string {
```

### internal/agent/registry.go — 90 lines
```
package agent
const RegistryURL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json"
const DefaultMaxRegistryBytes = 8 << 20 // 8 MiB
func LoadRegistryFile(path string) (*Registry, error) {
func FetchRegistry(ctx context.Context, client *http.Client, rawURL string, maxBytes int64) (*Registry, error)
func (r *Registry) FindAgent(id string) (*Agent, bool) {
func isLoopbackHost(host string) bool {
```

### internal/agent/types.go — 77 lines
```
package agent
type Target string
const (
type PackageDistribution struct {
type BinaryTarget struct {
type Distribution struct {
type Agent struct {
type Registry struct {
type LaunchSpec struct {
```

## PACKAGE: internal/artifact (10 files)

### internal/artifact/artifact_test.go — 334 lines
```
package artifact
func createTestZip(t *testing.T, files map[string][]byte) []byte {
func createTestTarGz(t *testing.T, files map[string][]byte) []byte {
func TestSpoolDownloadBounded(t *testing.T) {
func TestExtractArchiveSafely_Zip(t *testing.T) {
func TestExtractArchiveSafely_TarGz(t *testing.T) {
func TestComputeCanonicalTreeDigestDeterminism(t *testing.T) {
```

### internal/artifact/extractor.go — 609 lines
```
package artifact
const (
type ExtractionLimits struct {
var DefaultExtractionLimits = ExtractionLimits{
func checkCompressionRatio(totalBytes, archiveSize int64, limits ExtractionLimits) error {
func SpoolDownloadBounded(r io.Reader, maxBytes int64, tempFile *os.File) (int64, string, error) {
func ExtractFileSafely(archivePath string, archiveType string, stagingDir string, limits ExtractionLimits) (*d
func ExtractArchiveSafely(r io.ReaderAt, size int64, archiveType string, stagingDir string) (*domain.Extracted
func ExtractArchiveSafelyWithLimits(r io.ReaderAt, size int64, archiveType string, stagingDir string, limits E
func extractZip(r io.ReaderAt, size int64, stagingDir string, limits ExtractionLimits) (*domain.ExtractedTreeI
func extractTarGz(r io.ReaderAt, size int64, stagingDir string, limits ExtractionLimits) (*domain.ExtractedTre
func validateAndNormalizePath(name string, maxPathLength int, seenLower map[string]string) (string, bool, erro
func refuseSymlinkedParent(stagingDir, targetPath string) error {
func writeBoundedFile(r io.Reader, targetPath string, expectedSize int64, maxSingleSize int64) error {
func ComputeCanonicalTreeDigest(treeDir string) (string, error) {
```

### internal/artifact/extractor_size_test.go — 82 lines
```
package artifact
func TestWriteBoundedFileRefusesAnEntryShorterThanItClaims(t *testing.T) {
func TestWriteBoundedFileRefusesAnEntryLongerThanItClaims(t *testing.T) {
func TestWriteBoundedFileAcceptsAnEntryThatMatches(t *testing.T) {
```

### internal/artifact/extractor_symlink_test.go — 109 lines
```
package artifact
func TestExtractRefusesPlantedSymlinks(t *testing.T) {
```

### internal/artifact/fetcher.go — 416 lines
```
package artifact
type ResolvedArtifact struct {
type FetchResult struct {
type VerifiedArtifact struct {
type ArtifactFetcher interface {
type FetcherOptions struct {
func DefaultFetcherOptions() FetcherOptions {
type HTTPArchiveFetcher struct {
func NewHTTPArchiveFetcher(opts FetcherOptions) *HTTPArchiveFetcher {
func (f *HTTPArchiveFetcher) Supports(ref domain.ArtifactRef) bool {
func (f *HTTPArchiveFetcher) ResolveImmutable(ctx context.Context, ref domain.ArtifactRef) (*ResolvedArtifact,
func (f *HTTPArchiveFetcher) Fetch(ctx context.Context, resolved *ResolvedArtifact, destinationFile string) (*
func (f *HTTPArchiveFetcher) Verify(ctx context.Context, result *FetchResult, expectedDigest string) (*Verifie
func (f *HTTPArchiveFetcher) FetchToTemp(ctx context.Context, ref domain.ArtifactRef, tempDir string) (*Verifi
func (o FetcherOptions) checkHost(ctx context.Context, hostname string) error {
func (o FetcherOptions) dialContext(ctx context.Context, network, addr string) (net.Conn, error) {
func (o FetcherOptions) checkIP(host string, ip net.IP) error {
func detectArchiveType(mediaType, path string) (string, error) {
```

### internal/artifact/fetcher_test.go — 294 lines
```
package artifact
func makeZip(t *testing.T, files map[string][]byte) []byte {
func etagCode(t *testing.T, err error) string {
func TestHTTPArchiveFetcherRefusesNonHTTPS(t *testing.T) {
func TestHTTPArchiveFetcherRefusesCredentials(t *testing.T) {
func TestHTTPArchiveFetcherDefaultTransportHasNoProxy(t *testing.T) {
func TestHTTPArchiveFetcherRefusesNonPublicHosts(t *testing.T) {
func TestHTTPArchiveFetcherUnknownTypeFailsClosed(t *testing.T) {
func TestHTTPArchiveFetcherFetchVerifyExtract(t *testing.T) {
func TestHTTPArchiveFetcherRejectsWrongDigest(t *testing.T) {
func TestHTTPArchiveFetcherVerifyRefusesUnpinned(t *testing.T) {
func TestHTTPArchiveFetcherEnforcesByteBound(t *testing.T) {
func TestHTTPArchiveFetcherRefusesRedirectDowngrade(t *testing.T) {
func TestHTTPArchiveFetcherCapsRedirects(t *testing.T) {
```

### internal/artifact/gitfetcher.go — 555 lines
```
package artifact
const (
var commitIDPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
type GitFetcherOptions struct {
func DefaultGitFetcherOptions() GitFetcherOptions {
type ResolvedGitTree struct {
type GitTreeFetcher struct {
func NewGitTreeFetcher(opts GitFetcherOptions) *GitTreeFetcher {
func (f *GitTreeFetcher) Supports(ref domain.ArtifactRef) bool {
func (f *GitTreeFetcher) supportsLocator(locator string) bool {
func (f *GitTreeFetcher) ResolveImmutable(ctx context.Context, ref domain.ArtifactRef) (*ResolvedGitTree, erro
func (f *GitTreeFetcher) FetchTree(ctx context.Context, resolved *ResolvedGitTree, stagingDir string) (*domain
func (f *GitTreeFetcher) fetchFailure(resolved *ResolvedGitTree, err error) error {
func (f *GitTreeFetcher) archive(ctx context.Context, env []string, repo, treeish, dest string) (int64, error)
func (f *GitTreeFetcher) run(ctx context.Context, env []string, dir string, args ...string) (string, error) {
func (f *GitTreeFetcher) output(ctx context.Context, env []string, dir string, args ...string) string {
func (f *GitTreeFetcher) outputErr(ctx context.Context, env []string, dir string, args ...string) (string, err
func gitCloneEnv(locator, emptyConfig string) map[string]string {
... (4 more)
```

### internal/artifact/gitfetcher_test.go — 316 lines
```
package artifact
func gitFixtureRepo(t *testing.T, files map[string]string) (dir string, commit string) {
func fileURLFor(dir string) string {
var pluginFixtureFiles = map[string]string{
func gitTreeRef(repo, commit, subpath string) domain.ArtifactRef {
func TestGitTreeFetcherFetchesThePinnedCommit(t *testing.T) {
func TestGitTreeFetcherDigestMatchesTheCanonicalDigestOfTheSameContent(t *testing.T) {
func TestGitTreeFetcherRefusesACommitThatIsNotThePinnedOne(t *testing.T) {
func TestGitTreeFetcherRefusesAMissingSubpath(t *testing.T) {
func TestGitTreeFetcherRefusesAnUnpinnedArtifact(t *testing.T) {
func TestGitTreeFetcherRefusesAnUnknownArtifactType(t *testing.T) {
func TestGitTreeFetcherRefusesEverythingButHTTPS(t *testing.T) {
func TestGitTreeFetcherRefusesAFileLocatorWithoutTheTestOptIn(t *testing.T) {
func TestGitTreeFetcherRefusesATraversalSubpath(t *testing.T) {
func TestGitTreeFetcherRunsGitWithAHardenedEnvironment(t *testing.T) {
```

### internal/artifact/limits_test.go — 109 lines
```
package artifact
func limitsFor(mutate func(*ExtractionLimits)) ExtractionLimits {
func TestExtractZipHonorsMaxTreeSize(t *testing.T) {
func TestExtractTarGzHonorsMaxTreeSize(t *testing.T) {
func TestExtractZipHonorsMaxSingleFileSize(t *testing.T) {
func TestExtractZipHonorsMaxFileCount(t *testing.T) {
```

### internal/artifact/ratio_test.go — 106 lines
```
package artifact
func TestExtractZipRefusesCompressionBomb(t *testing.T) {
func TestExtractTarGzRefusesCompressionBomb(t *testing.T) {
func TestExtractAllowsArchiveWithinCompressionRatio(t *testing.T) {
func TestRatioBoundDoesNotRefuseSmallArchives(t *testing.T) {
```

## PACKAGE: internal/auth (6 files)

### internal/auth/auth_test.go — 237 lines
```
package auth
func TestPKCE_GenerationAndVerification(t *testing.T) {
func TestLoopbackListener_SuccessAndStateProtection(t *testing.T) {
func TestAuthBroker_CompleteFlow(t *testing.T) {
```

### internal/auth/broker.go — 375 lines
```
package auth
type AuthBroker struct {
const maxTokenResponseBytes = 1 << 20
func NewAuthHTTPClient() *http.Client {
func requireHTTPSTokenURL(raw string) error {
func NewAuthBroker(db *state.DB, secretStore secrets.SecretStore, httpClient *http.Client) *AuthBroker {
func (b *AuthBroker) DescribeAuth(ctx context.Context, providerID string) (*AuthDescription, error) {
func (b *AuthBroker) StartAuth(ctx context.Context, req AuthStartRequest, listener *LoopbackListener) (*AuthSe
func (b *AuthBroker) ExchangeToken(ctx context.Context, tokenURL, clientID, clientSecret, code, redirectURI, v
func (b *AuthBroker) CompleteAuth(ctx context.Context, sessionID string, tokenRes *TokenResponse) (*domain.Aut
func (b *AuthBroker) RevokeAuth(ctx context.Context, profileID string) error {
func (b *AuthBroker) RefreshAuth(ctx context.Context, profileID, tokenURL, clientID, clientSecret string) erro
func (b *AuthBroker) GetAuthStatus(ctx context.Context, providerID string) (string, error) {
```

### internal/auth/loopback.go — 190 lines
```
package auth
const (
type LoopbackResult struct {
type LoopbackListener struct {
func StartLoopbackListener() (*LoopbackListener, error) {
func (ll *LoopbackListener) Port() int {
func (ll *LoopbackListener) RedirectURI() string {
func (ll *LoopbackListener) StateToken() string {
func (ll *LoopbackListener) handleCallback(w http.ResponseWriter, r *http.Request) {
func (ll *LoopbackListener) sendResult(res LoopbackResult) {
func (ll *LoopbackListener) WaitForCallback(ctx context.Context, timeout time.Duration) (string, error) {
func (ll *LoopbackListener) Close() error {
```

### internal/auth/pkce.go — 45 lines
```
package auth
type PKCEPair struct {
func GeneratePKCE() (*PKCEPair, error) {
func VerifyPKCE(verifier, expectedChallenge string) bool {
```

### internal/auth/profiles.go — 125 lines
```
package auth
func ListProfiles(ctx context.Context, db *state.DB) ([]*domain.AuthProfile, error) {
func ProfileForProvider(ctx context.Context, db *state.DB, providerID string) (*domain.AuthProfile, error) {
func ProfileIDFor(providerID string) string {
func ProvidersUsingProfile(ctx context.Context, db *state.DB, profileID string) (int, error) {
func DeleteProfile(ctx context.Context, db *state.DB, profileID string) error {
func ProfileAge(prof *domain.AuthProfile) time.Duration {
```

### internal/auth/types.go — 67 lines
```
package auth
type AuthType string
const (
type AuthDescription struct {
type AuthSession struct {
type TokenResponse struct {
type AuthStartRequest struct {
type TokenExchanger func(ctx context.Context, tokenURL, clientID, clientSecret, code, redirectURI, verifier st
type AuthProfile = domain.AuthProfile
```

## PACKAGE: internal/binding (2 files)

### internal/binding/binding.go — 130 lines
```
package binding
type Mode string
const (
const DefaultMode = ModeManaged
func ParseMode(raw string) (Mode, error) {
type Request struct {
type Decision struct {
func Resolve(req Request) (Decision, error) {
type PluginComponent struct {
func SupportedComponent(kind domain.ComponentKind) (bool, string) {
func RoutePlugin(components []PluginComponent) (supported, rejected []PluginComponent) {
```

### internal/binding/binding_test.go — 49 lines
```
package binding
func TestManagedIsDefault(t *testing.T) {
func TestNativeIsExplicitOptIn(t *testing.T) {
func TestPluginRouting(t *testing.T) {
```

## PACKAGE: internal/bridge (4 files)

### internal/bridge/bridge_test.go — 829 lines
```
package bridge
type pipeListener struct {
func newPipeListener() *pipeListener {
func (l *pipeListener) Accept() (net.Conn, error) {
func (l *pipeListener) Close() error {
func (l *pipeListener) Addr() net.Addr { return pipeAddr{} }
type pipeAddr struct{}
func (pipeAddr) Network() string { return "pipe" }
func (pipeAddr) String() string { return "pipe" }
func newDaemonBackedShim(t *testing.T, handlers map[string]ipc.HandlerFunc) *Shim {
func TestBridge_InitializeAndListTools(t *testing.T) {
func TestBridge_QwenMarketplacePromptIsPublishedAsSlashCommand(t *testing.T) {
func TestBridge_AllHostsAdvertiseMarketplaceSlashPrompt(t *testing.T) {
func TestBridge_ToolDispatchAndErrorFormatting(t *testing.T) {
func TestBridge_ServeCodec(t *testing.T) {
func TestBridge_All12ToolsDispatch(t *testing.T) {
func TestBridge_PingReportsConnectionState(t *testing.T) {
func TestFormatInstalledPanelStatusTruthfulness(t *testing.T) {
... (6 more)
```

### internal/bridge/pending_client_test.go — 45 lines
```
package bridge
func TestHandshakeIsAnsweredWhileTheDaemonIsStillStarting(t *testing.T) {
```

### internal/bridge/shim.go — 1065 lines
```
package bridge
type MCPTool struct {
type MCPContent struct {
type MCPToolResult struct {
type InstalledStatus string
const (
type CapabilityItem struct {
type Shim struct {
func (s *Shim) SetPendingClient(ch <-chan *ipc.Client) {
const pendingClientWait = 90 * time.Second
func (s *Shim) awaitClient(ctx context.Context) {
func NewShim(hostID string, client *ipc.Client, in io.Reader, out io.Writer) *Shim {
func (s *Shim) initTools() {
func (s *Shim) Serve(ctx context.Context) error {
const currentProtocolVersion = "2026-07-28"
var supportedProtocolVersions = []string{"2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25", currentProtoc
func negotiatedProtocolVersion(params json.RawMessage) string {
func (s *Shim) HandleRequest(ctx context.Context, req *ipc.Request) *ipc.Response {
... (21 more)
```

### internal/bridge/shim_test.go — 120 lines
```
package bridge
func callTool(t *testing.T, shim *Shim, name string, args map[string]any) MCPToolResult {
func TestGetInvocationToolForwardsToTheDaemon(t *testing.T) {
func TestCancelInvocationToolForwardsToTheDaemon(t *testing.T) {
```

## PACKAGE: internal/buildinfo (1 files)

### internal/buildinfo/buildinfo.go — 9 lines
```
package buildinfo
var Version = "dev"
```

## PACKAGE: internal/catalog (13 files)

### internal/catalog/catalog_test.go — 339 lines
```
package catalog
func sampleListings() []*domain.Listing {
func TestSearchRankingAndFiltering(t *testing.T) {
func TestCatalogClientSyncAndIntegrity(t *testing.T) {
func TestReleasePathContractPinsDocumentedLayout(t *testing.T) {
func sortedKeys(m map[string][]byte) []string {
```

### internal/catalog/client.go — 1353 lines
```
package catalog
type SyncResult struct {
type Client struct {
const maxCatalogBodyBytes = 16 << 20
const maxCatalogFileBytes = 64 << 20
const defaultCatalogTimeout = 30 * time.Second
const catalogRequestAttempts = 4
var catalogRetryBackoff = []time.Duration{2 * time.Second, 6 * time.Second, 15 * time.Second}
func isTransientCatalogError(err error) bool {
func doCatalogRequest(ctx context.Context, client *http.Client, req *http.Request) (*http.Response, error) {
func (c *Client) shardHTTPClient() *http.Client {
const defaultShardTimeout = 5 * time.Minute
func catalogPolicy(allowedPrivateHost string) egress.Policy {
func NewClient(baseURL, cacheDir string, httpClient *http.Client) *Client {
func NewClientWithTimeout(baseURL, cacheDir string, timeout time.Duration, httpClient *http.Client) *Client {
func secureCatalogHTTPClient(timeout time.Duration, baseURL string) *http.Client {
func guardedCatalogTransport(base http.RoundTripper, allowedPrivateHost string) http.RoundTripper {
type catalogURLGuardTransport struct {
... (52 more)
```

### internal/catalog/client_body_test.go — 44 lines
```
package catalog
func TestReadCatalogFileBodyAllowsManifestSizedDataAboveMetadataLimit(t *testing.T) {
func TestReadCatalogFileBodyRejectsOversizeAndManifestSizeMismatch(t *testing.T) {
type unreadableReader struct{}
func (unreadableReader) Read([]byte) (int, error) {
var _ io.Reader = unreadableReader{}
func TestReadCatalogFileBodyRejectsOversizedManifestBeforeRead(t *testing.T) {
```

### internal/catalog/client_egress_test.go — 186 lines
```
package catalog
func TestCheckCatalogURLAllowsCustomHTTPSOriginButRejectsUnsafeForms(t *testing.T) {
func TestCatalogRedirectAllowsPublicCrossOriginCDN(t *testing.T) {
func TestCatalogRedirectRejectsPrivateAndNonPublicTargets(t *testing.T) {
func TestCatalogRedirectRejectsDNSFailure(t *testing.T) {
func TestCatalogRedirectRejectsNonDefaultHTTPSPort(t *testing.T) {
func TestCatalogDialRejectsPrivateDNSBeforeConnecting(t *testing.T) {
func TestCatalogDefaultTransportDoesNotDelegateDNSToProxy(t *testing.T) {
func TestCatalogRedirectKeepsDowngradeAndHopBounds(t *testing.T) {
func TestCatalogHTTPRedirectDoesNotReachLoopbackTarget(t *testing.T) {
```

### internal/catalog/client_timeout_test.go — 153 lines
```
package catalog
func TestNewClientUsesDefaultTimeout(t *testing.T) {
func TestNewClientWithTimeoutAppliesConfiguredBound(t *testing.T) {
func TestNewClientWithTimeoutNonPositiveFallsBackToDefault(t *testing.T) {
func TestNewClientWithTimeoutCustomClientKeepsItsTimeout(t *testing.T) {
func TestConfiguredTimeoutBoundsFetch(t *testing.T) {
func TestShardDownloadsCarryTheirOwnBudget(t *testing.T) {
type transientRT struct {
func (t *transientRT) RoundTrip(req *http.Request) (*http.Response, error) {
func TestCatalogRequestRepeatsATransientFailure(t *testing.T) {
func TestCatalogRequestDoesNotRepeatAPermanentFailure(t *testing.T) {
type permanentRT struct{ attempts int }
func (p *permanentRT) RoundTrip(req *http.Request) (*http.Response, error) {
```

### internal/catalog/disk_index.go — 911 lines
```
package catalog
const diskIndexSchema = 4 // 2: gzip documents; 3: summary column; 4: hay column
const fieldSep = "\x1f"
type diskIndex struct {
func diskIndexDir(cacheDir string) string {
func diskIndexPath(cacheDir string, current *catalogbuild.CurrentPointer) string {
func sqliteURI(path string, readOnly bool) string {
func openDiskIndex(cacheDir string, current *catalogbuild.CurrentPointer) (*diskIndex, error) {
func (d *diskIndex) close() {
func buildDiskIndex(cacheDir string, current *catalogbuild.CurrentPointer, listings []*domain.Listing, version
func writeDiskIndex(cacheDir, path string, current *catalogbuild.CurrentPointer, listings []*domain.Listing, v
func pruneDiskIndexes(dir, keep string) {
func lowerAll(values []string) []string {
func (d *diskIndex) search(query string, opts SearchOptions) ([]*SearchResult, error) {
func (d *diskIndex) getManyByRID(rids []int64, summary bool) (map[int64]*domain.Listing, error) {
func scoreColumns(queryNorm string, tokens []string, lid, lname, ltitle, lsummary, lcats, lkws, verify string)
func anyFieldContains(joined, tok string) bool {
func (d *diskIndex) getByRID(rid int64, summary bool) (*domain.Listing, bool, error) {
... (19 more)
```

### internal/catalog/disk_index_test.go — 249 lines
```
package catalog
func fakeRelease(t *testing.T, cacheDir string) *catalogbuild.CurrentPointer {
func parityListings() []*domain.Listing {
func TestDiskIndexMatchesInMemorySearch(t *testing.T) {
func TestClientReopensTheDiskIndexWithoutAFullLoad(t *testing.T) {
func TestTamperedIndexFileIsNotServed(t *testing.T) {
func ids(rs []*SearchResult) string {
func TestLongLivedClientPicksUpANewRelease(t *testing.T) {
```

### internal/catalog/integrity_test.go — 343 lines
```
package catalog
func compileSampleRelease(t *testing.T, releaseID string, sequence int) *catalogbuild.BuildOutput {
func serveFiles(t *testing.T, files map[string][]byte) *httptest.Server {
func rewritePointer(t *testing.T, compiled *catalogbuild.BuildOutput, mutate func(map[string]any)) []byte {
func cacheFiles(t *testing.T, cacheDir string) []string {
func TestSyncRejectsPointerManifestDigestMismatch(t *testing.T) {
func TestSyncRejectsUnsafeReleaseID(t *testing.T) {
func TestSyncRejectsUnsupportedPointerSchema(t *testing.T) {
func TestSyncPersistsServedBytesVerbatim(t *testing.T) {
func TestLoadFromCacheRejectsTamperedManifest(t *testing.T) {
func TestLoadFromCacheRejectsTamperedListings(t *testing.T) {
func TestSyncRejectsStaleContentDigest(t *testing.T) {
```

### internal/catalog/runtime_endpoint_test.go — 97 lines
```
package catalog
func syncClientWithRecords(t *testing.T, releaseID string, sequence int, records []*domain.VersionRecord) *Cli
func TestRuntimeForListingAcceptsEndpointOnlyComponent(t *testing.T) {
func TestRuntimeForListingFailsClosedWithoutALaunchLine(t *testing.T) {
```

### internal/catalog/search.go — 361 lines
```
package catalog
type SearchOptions struct {
type SearchResult struct {
type SearchIndex struct {
func NewSearchIndex() *SearchIndex {
func (idx *SearchIndex) IndexVersions(versions []*domain.VersionRecord) {
func (idx *SearchIndex) VersionRecords(listingID string) []*domain.VersionRecord {
func versionNewer(a, b string) bool {
func (idx *SearchIndex) IndexListings(listings []*domain.Listing) {
func (idx *SearchIndex) Replace(listings []*domain.Listing, versions []*domain.VersionRecord) {
func (idx *SearchIndex) Get(id string) (*domain.Listing, bool) {
func (idx *SearchIndex) Count() int {
func (idx *SearchIndex) Search(query string, opts SearchOptions) []*SearchResult {
func scoreListing(l *domain.Listing, queryNorm string, queryTokens []string) (float64, []string) {
func tokenize(text string) []string {
func (idx *SearchIndex) snapshot() ([]*domain.Listing, []*domain.VersionRecord) {
```

### internal/catalog/shard_name_test.go — 155 lines
```
package catalog
func TestReleaseShardName(t *testing.T) {
func TestPathWithinDir(t *testing.T) {
func TestSyncRefusesTraversingShardName(t *testing.T) {
```

### internal/catalog/signature_test.go — 274 lines
```
package catalog
func signedReleaseFiles(t *testing.T, pointer []byte, bundleBody []byte) map[string][]byte {
func pointerFor(t *testing.T) []byte {
func stubVerifier(scriptedVerdict string) (*trust.BlobVerifier, *[]string, *[]byte) {
var errStubVerification = &stubError{"certificate identity mismatch"}
type stubError struct{ s string }
func (e *stubError) Error() string { return e.s }
func TestSyncVerifiesPublishedPointerSignature(t *testing.T) {
func TestSyncRejectsInvalidPointerSignature(t *testing.T) {
func TestSyncRequiresSignatureWhenConfigured(t *testing.T) {
func TestSyncProceedsWithoutBundleByDefault(t *testing.T) {
func TestSyncUnavailableVerifierRespectsRequireFlag(t *testing.T) {
func TestSyncSignatureFetchErrorRespectsRequireFlag(t *testing.T) {
func TestSyncResultCarriesNoVerificationClaim(t *testing.T) {
```

### internal/catalog/versions_test.go — 239 lines
```
package catalog
func compileReleaseWithRuntime(t *testing.T, releaseID string, sequence int) *catalogbuild.BuildOutput {
func TestSyncFetchesAndCachesVersions(t *testing.T) {
func TestSyncRejectsTamperedVersions(t *testing.T) {
func TestRuntimeForListingFailsClosedWithoutARunnableComponent(t *testing.T) {
func TestVersionRecordsLatestUsesSemver(t *testing.T) {
func componentVersionSegment(t *testing.T, id string) string {
func TestVersionLessListingRoundTripsThroughRelease(t *testing.T) {
```

## PACKAGE: internal/catalogbuild (7 files)

### internal/catalogbuild/catalogbuild_test.go — 156 lines
```
package catalogbuild
func sampleData() ([]*domain.Listing, []*domain.VersionRecord) {
func TestDeterministicReleaseCompilation(t *testing.T) {
func TestManifestIntegrity(t *testing.T) {
func TestWriteToDirectory(t *testing.T) {
```

### internal/catalogbuild/compiler.go — 328 lines
```
package catalogbuild
func ContentDigestOf(listings, versions []byte) string {
type ReleaseManifestFile struct {
type ReleaseManifest struct {
const CurrentPointerSchemaVersion = 1
type CurrentPointer struct {
type BuildOutput struct {
func CompileRelease(
func (b *BuildOutput) WriteToDirectory(baseDir string) error {
const ReleaseShardMaxBytes = 20 << 20
func shardName(base string, index int) string {
func emitSharded(files map[string][]byte, manifest map[string]ReleaseManifestFile, releaseID, base string, row
func manifestShards(manifest map[string]ReleaseManifestFile, base string) int {
func concatShards(files map[string][]byte, releaseID, base string) []byte {
```

### internal/catalogbuild/dataset.go — 609 lines
```
package catalogbuild
type DatasetPublisher struct {
var ProducerSourceIDs = []string{
func IsProducerSourceID(id string) bool {
var sha40 = regexp.MustCompile(`^[0-9a-f]{40}$`)
type DatasetArtifact struct {
func (a *DatasetArtifact) artifactProblem() string {
type DatasetRow struct {
func ParseDataset(raw []byte) ([]DatasetRow, error) {
func LoadDataset(path string) ([]DatasetRow, error) {
func DatasetSnapshotID(dataset []byte) string {
func ConvertDataset(rows []DatasetRow, releaseID, _datasetInputID string, ingestedAt time.Time) ([]*domain.Lis
func convertRow(row DatasetRow, releaseID string, ingestedAt time.Time) (*domain.Listing, *domain.VersionRecor
func artifactRefsFor(row DatasetRow) []domain.ArtifactRef {
func datasetComponents(row DatasetRow, lid domain.ListingID) ([]domain.ComponentSummary, []domain.Component, e
```

### internal/catalogbuild/dataset_provenance_test.go — 133 lines
```
package catalogbuild
func TestDatasetConversionPreservesExplicitSourceWithoutInventingSnapshot(t *testing.T) {
func TestDatasetConversionPreservesExplicitPerRowSnapshot(t *testing.T) {
func TestParseDatasetRejectsInvalidExplicitSource(t *testing.T) {
func TestParseDatasetRejectsSourceTheProducerCannotEmit(t *testing.T) {
func TestParseDatasetRejectsRowThatLostItsSource(t *testing.T) {
func TestProducerSourceIDsAreGrammaticallyValidAndAccepted(t *testing.T) {
```

### internal/catalogbuild/dataset_test.go — 1036 lines
```
package catalogbuild
func shardNamesFor(files map[string]ReleaseManifestFile, base string) []string {
func shardBytesFor(t *testing.T, output *BuildOutput, releaseID, base string) [][]byte {
func concatBytes(shards [][]byte) []byte {
const validMCPRow = `{
const validSkillRow = `{
func TestParseDatasetRejectsMalformedRows(t *testing.T) {
func TestDiscoveryOnlyRowsCarryNoInventedClaims(t *testing.T) {
func TestParseDatasetAcceptsValidRows(t *testing.T) {
func TestRemoteEndpointRows(t *testing.T) {
func TestConvertDatasetClaimsAreHonest(t *testing.T) {
func TestDatasetPipelineAgainstRealCatalog(t *testing.T) {
func TestDatasetSnapshotIDContentAddressed(t *testing.T) {
func TestVersionlessCommandlessVerifiedSkillRow(t *testing.T) {
func artifactPluginRow(artifact string) string {
const artifactSHA = "0123456789abcdef0123456789abcdef01234567"
func TestParseDatasetRejectsInconsistentArtifactDescriptors(t *testing.T) {
func TestArtifactDescriptorBecomesOneArtifactRef(t *testing.T) {
... (3 more)
```

### internal/catalogbuild/verify.go — 136 lines
```
package catalogbuild
func VerifyMaterializedTree(dir string) (*CurrentPointer, *ReleaseManifest, error) {
func validateReleaseIDForVerify(id string) error {
func digestBytes(b []byte) string {
```

### internal/catalogbuild/verify_test.go — 247 lines
```
package catalogbuild
func writeTree(t *testing.T, dir string, out *BuildOutput) string {
func compileFixture(t *testing.T) *BuildOutput {
func TestVerifyMaterializedTreeAcceptsAnUntouchedTree(t *testing.T) {
func TestVerifyMaterializedTreeRejectsTampering(t *testing.T) {
func TestVerifyMaterializedTreeRejectsUnsafePointer(t *testing.T) {
func TestVerifyMaterializedTreeRejectsStaleContentDigest(t *testing.T) {
func replaceFirst(s, old, new string) string {
func indexOf(s, sub string) int {
func contains(haystack, needle string) bool { return indexOf(haystack, needle) >= 0 }
```

## PACKAGE: internal/compat (2 files)

### internal/compat/compat.go — 115 lines
```
package compat
const (
const (
type Record struct {
type Store struct {
func New() *Store { return &Store{} }
func (s *Store) Add(r Record) error {
func (s *Store) Declare(hostID, packageID, note string) error {
func (s *Store) Query(packageID string) []Record {
func (s *Store) VerifiedHosts(packageID string) []string {
func (s *Store) Len() int { return len(s.records) }
```

### internal/compat/compat_test.go — 47 lines
```
package compat
func TestDeclaredNeverVerifies(t *testing.T) {
func TestTestedVerifies(t *testing.T) {
func TestEvidenceRequired(t *testing.T) {
```

## PACKAGE: internal/config (9 files)

### internal/config/config.go — 232 lines
```
package config
const DefaultRegistryURL = "https://litespm.sarveshbh-2022.workers.dev"
type CatalogConfig struct {
type DaemonConfig struct {
type PolicyConfig struct {
type NetworkConfig struct {
type Config struct {
func DefaultConfig(paths *PlatformPaths) *Config {
func LoadConfig(projectDir string) (*Config, error) {
func LoadCurrentConfig() (*Config, error) {
func envOverride(current, legacy string) string {
func applyEnvOverrides(cfg *Config) {
func parseSimpleTOML(filePath string, cfg *Config) error {
```

### internal/config/config_test.go — 104 lines
```
package config
func TestResolvePlatformPaths(t *testing.T) {
func TestEnsureDirectories(t *testing.T) {
func TestConfigLoadingAndOverrides(t *testing.T) {
```

### internal/config/legacy_test.go — 271 lines
```
package config
func clearRootEnv(t *testing.T) {
func TestResolveRootAdoptsLegacyOnly(t *testing.T) {
func TestResolveRootEnvPrecedence(t *testing.T) {
func TestApplyRootOverridesAdoptsLegacyAndKeepsData(t *testing.T) {
func TestApplyRootOverridesEnvBeatsAdoption(t *testing.T) {
func TestEnvOverrideLegacyFallbackAndPrecedence(t *testing.T) {
func writeProjectTOML(t *testing.T, path, body string) {
func TestLoadConfigFallsBackToLegacyProjectConfig(t *testing.T) {
```

### internal/config/load_current_test.go — 110 lines
```
package config
func isolateConfigEnv(t *testing.T) {
func TestLoadCurrentConfigReadsProjectTOML(t *testing.T) {
func TestLoadCurrentConfigFallsBackToDefaultsOutsideAProject(t *testing.T) {
func TestLoadCurrentConfigEnvBeatsProjectFile(t *testing.T) {
```

### internal/config/paths.go — 261 lines
```
package config
type PlatformPaths struct {
type brandNames struct {
var (
func platformRoots(homeDir, username, uid string, brand brandNames) *PlatformPaths {
func ResolvePlatformPaths() (*PlatformPaths, error) {
func applyRootOverrides(paths, legacy *PlatformPaths) {
func resolveRoot(newDefault, legacyDefault, newEnv, legacyEnv string) string {
func pathMissing(p string) bool {
func isDir(p string) bool {
func (p *PlatformPaths) IPCEndpoint() string {
func (p *PlatformPaths) StateDBPath() string {
func (p *PlatformPaths) DaemonLockPath() string {
func (p *PlatformPaths) CASPath() string {
func (p *PlatformPaths) BackupsPath() string {
func (p *PlatformPaths) StagingPath() string {
func (p *PlatformPaths) ReceiptsPath() string {
func (p *PlatformPaths) EnsureDirectories() error {
```

### internal/config/runtime_root.go — 123 lines
```
package config
var ErrUnsafeRuntimeRoot = errors.New("unsafe runtime root")
const (
type UnsafeRuntimeRootError struct {
func (e *UnsafeRuntimeRootError) Error() string {
func (e *UnsafeRuntimeRootError) Unwrap() error { return e.Err }
func (e *UnsafeRuntimeRootError) Is(target error) bool {
func ensureRuntimeRoot(dir string) error {
func verifyRuntimeRoot(dir string, fi os.FileInfo) error {
```

### internal/config/runtime_root_other.go — 15 lines
```
package config
func fileOwnerUID(os.FileInfo) (uint32, bool) { return 0, false }
func currentUID() uint32 { return 0 }
```

### internal/config/runtime_root_test.go — 187 lines
```
package config
func skipUnlessUnix(t *testing.T) {
func mode0700(t *testing.T, dir string) {
func TestEnsureRuntimeRootCreatesPrivateDir(t *testing.T) {
func TestEnsureRuntimeRootTightensLoosenedOwnedDir(t *testing.T) {
func TestEnsureRuntimeRootRefusesSymlink(t *testing.T) {
func TestEnsureRuntimeRootRefusesNonDirectory(t *testing.T) {
func TestEnsureRuntimeRootRefusesForeignOwner(t *testing.T) {
func TestEnsureDirectoriesFailsClosedOnPlantedRuntimeRoot(t *testing.T) {
func TestEnsureRuntimeRootMissingParentIsCreated(t *testing.T) {
```

### internal/config/runtime_root_unix.go — 24 lines
```
package config
func fileOwnerUID(fi os.FileInfo) (uint32, bool) {
func currentUID() uint32 { return uint32(os.Geteuid()) }
```

## PACKAGE: internal/deployment (3 files)

### internal/deployment/adoption_test.go — 69 lines
```
package deployment_test
func TestAdoptionRowRecordsTheNodeAsItStands(t *testing.T) {
func TestAnAdoptedNodeReconcilesAsUnmodifiedUntilItIsEdited(t *testing.T) {
```

### internal/deployment/ledger.go — 291 lines
```
package deployment
type Mutation struct {
type ReconcileOutcome string
const (
const OwnerAdopted = "adopted"
func Adoption(installID, capabilityID, hostID, scope, filePath, structureType, locator, fingerprint, priorEntr
func IsAdoption(m Mutation) bool {
type ReconcileReport struct {
func NewMutationID() (string, error) {
func HashStructure(canonical []byte) string {
type Execer interface {
type Store interface {
type Ledger struct {
func NewLedger(db *sql.DB) *Ledger {
func (l *Ledger) SaveMutation(ctx context.Context, m *Mutation) error {
func SaveMutationExec(ctx context.Context, ex Execer, m *Mutation) error {
func (l *Ledger) MutationsForInstall(ctx context.Context, installID string) ([]Mutation, error) {
func (l *Ledger) MutationsForHost(ctx context.Context, hostID string) ([]Mutation, error) {
... (2 more)
```

### internal/deployment/ledger_test.go — 24 lines
```
package deployment_test
func TestReconcileDecisionTable(t *testing.T) {
```

## PACKAGE: internal/discover (7 files)

### internal/discover/auth.go — 117 lines
```
package discover
const (
func remoteAuthHeaders(ctx context.Context, db *state.DB, spec ProviderSpec, o *options) (map[string]string, e
```

### internal/discover/discover.go — 923 lines
```
package discover
type Policy interface {
type Option func(*options)
type options struct {
func WithPolicy(p Policy) Option { return func(o *options) { o.policy = p } }
func WithSupervisor(s *provider.Supervisor) Option { return func(o *options) { o.supervisor = s } }
func WithActor(actor string) Option { return func(o *options) { o.actor = actor } }
func WithHostID(hostID string) Option { return func(o *options) { o.hostID = hostID } }
func WithEffects(effects ...policy.EffectDeclaration) Option {
func WithSecretStore(store secrets.SecretStore) Option {
func newOptions(opts []Option) *options {
func defaultInvokeEffects() []policy.EffectDeclaration {
func isReadOnlyEffects(effects []policy.EffectDeclaration) bool {
func (o *options) authorize(ctx context.Context, capabilityID, fingerprint string, effects []policy.EffectDecl
type ProviderSpec struct {
const (
var httpStatusPattern = regexp.MustCompile(`http error (\d{3})`)
func httpStatusOf(err error) (int, bool) {
... (26 more)
```

### internal/discover/discover_auth_test.go — 278 lines
```
package discover
type authedRemoteFixture struct {
func (f *authedRemoteFixture) endpoint() string { return f.server.URL + "/mcp" }
func (f *authedRemoteFixture) anonymousCount() int32 { return f.anonymous.Load() }
func newAuthedRemoteFixture(t *testing.T, token string) *authedRemoteFixture {
const authedRemoteFixtureToolSchema = `{"type":"object","properties":{"message":{"type":"string"}},"required":
func seedAuthedProvider(t *testing.T, db *state.DB, store secrets.SecretStore, endpoint, profileID, providerID
func TestRemoteDialSendsTheStoredBearerToken(t *testing.T) {
func TestRemoteDialRefusesAMissingOrRevokedProfile(t *testing.T) {
func TestRemoteAuthHeadersRefuseAnAbsentProfile(t *testing.T) {
```

### internal/discover/discover_policy_test.go — 250 lines
```
package discover
func readOnlyOpt() Option {
type stubPolicy struct {
func (s *stubPolicy) Evaluate(_ context.Context, in policy.PolicyInput) policy.PolicyDecision {
func discoverStrict(t *testing.T, db *state.DB, spec ProviderSpec) domain.CapabilityRecord {
func breakCommand(t *testing.T, db *state.DB, installID string) {
func TestInvokeWithoutPolicyIsFailClosedForNonReadOnly(t *testing.T) {
func TestInvokeWithPolicyDenyAndAskNeverSpawn(t *testing.T) {
func TestInvokeEvaluatesPolicyBeforeSpawnAndAgainstCurrentFingerprint(t *testing.T) {
func TestInvokeWithRealEngineRequiresAMatchingGrant(t *testing.T) {
func TestInvokeAndDiscoverDoNotLeakParentEnvironment(t *testing.T) {
func TestResolveEnvOnlyForwardsNamedVariables(t *testing.T) {
func TestInvokeUsesSuppliedSupervisor(t *testing.T) {
```

### internal/discover/discover_remote_test.go — 515 lines
```
package discover
type remoteFixture struct {
func (f *remoteFixture) endpoint() string { return f.server.URL + "/mcp" }
func (f *remoteFixture) initializeCount() int32 { return f.initializes.Load() }
func newRemoteFixture(t *testing.T) *remoteFixture {
func writeFixtureResult(w http.ResponseWriter, id json.RawMessage, result string) {
func seedRemoteInstall(t *testing.T, db *state.DB, installID, component string) {
func requireZeroRows(t *testing.T, db *state.DB) {
func requireTypedCode(t *testing.T, err error, code string) *domain.LPSMError {
func TestDiscoverAndInvokeOverStreamableHTTP(t *testing.T) {
func TestDiscoverAndInvokeOverLegacySSE(t *testing.T) {
func TestRemoteTransportSelectsTheConnector(t *testing.T) {
func TestMetadataServiceEndpointRefusedBeforeAnyConnection(t *testing.T) {
func TestRemoteUnauthorizedIsATypedAuthErrorWithZeroRows(t *testing.T) {
func TestRemoteUnreachableEndpointIsAConnectionError(t *testing.T) {
func TestDiscoverRefusesSpecWithNeitherTargetAndWithBoth(t *testing.T) {
func TestInvokeRefusesARemoteProviderWithNoEndpointRecorded(t *testing.T) {
```

### internal/discover/discover_secrets_test.go — 186 lines
```
package discover
const secretCanaryValue = "sk-live-canary-4f2a91"
func newSecretStore(t *testing.T, namespace, key, value string) *secrets.MemorySecretStore {
func TestLaunchResolvesSecretReferences(t *testing.T) {
func TestLaunchRefusesAnUnresolvableSecretReference(t *testing.T) {
func TestLaunchRefusesASecretReferenceWithoutAStore(t *testing.T) {
func TestSecretValueNeverReachesAnErrorMessage(t *testing.T) {
```

### internal/discover/discover_test.go — 301 lines
```
package discover
func buildStrictMCPServer(t *testing.T) string {
type req struct {
func main() {
func write(out *bufio.Writer, id json.RawMessage, result any) {
func writeErr(out *bufio.Writer, id json.RawMessage, code int, msg string) {
func exeSuffix() string {
func openState(t *testing.T) *state.DB {
func seedInstall(t *testing.T, db *state.DB, installID string) {
func TestDiscoverPersistsProviderAndCapabilityRows(t *testing.T) {
func TestInvokeCallsTheDiscoveredTool(t *testing.T) {
func TestInvokeRefusesAnUnknownCapability(t *testing.T) {
func TestInvokeRefusesAServerWithNoCommandRecorded(t *testing.T) {
func TestDiscoverRefusesANonStdioTransportRatherThanGuessing(t *testing.T) {
func TestStrictServerBuildIsHermeticAndRunnable(t *testing.T) {
```

## PACKAGE: internal/doctor (9 files)

### internal/doctor/diskspace_other.go — 14 lines
```
package doctor
func queryFreeBytes(path string) (uint64, error) {
```

### internal/doctor/diskspace_unix.go — 22 lines
```
package doctor
func queryFreeBytes(path string) (uint64, error) {
```

### internal/doctor/diskspace_windows.go — 33 lines
```
package doctor
var procGetDiskFreeSpaceExW = syscall.NewLazyDLL("kernel32.dll").NewProc("GetDiskFreeSpaceExW")
func queryFreeBytes(path string) (uint64, error) {
```

### internal/doctor/doctor_test.go — 115 lines
```
package doctor
func TestDoctor_RunChecksAndRepair(t *testing.T) {
func TestDoctor_EveryCheckIsClassified(t *testing.T) {
```

### internal/doctor/engine.go — 843 lines
```
package doctor
type Engine struct {
func NewEngine(paths *config.PlatformPaths, db *state.DB, store secrets.SecretStore) *Engine {
var checkCategories = map[string]Category{
func classify(c CheckResult) CheckResult {
func (e *Engine) RunChecks(ctx context.Context) *DoctorReport {
func (e *Engine) checkDirectories() CheckResult {
func plural(n int) string {
func (e *Engine) checkDatabase(ctx context.Context) CheckResult {
func (e *Engine) checkOperationJournal(ctx context.Context) CheckResult {
const casVerifyLimit = 32
func (e *Engine) checkCASStore() CheckResult {
func isLowerHex(s string, n int) bool {
func (e *Engine) checkStagingHygiene() CheckResult {
func (e *Engine) checkSecretVault(ctx context.Context) (result CheckResult) {
func (e *Engine) checkHostRegistrations(ctx context.Context) CheckResult {
func (e *Engine) checkHostBackups() CheckResult {
func (e *Engine) checkRuntimes() CheckResult {
... (3 more)
```

### internal/doctor/honesty_test.go — 334 lines
```
package doctor
func newTestEngine(t *testing.T) (*Engine, *state.DB, *config.PlatformPaths) {
func TestDoctor_JournalCheckQueriesOperations(t *testing.T) {
func TestDoctor_CASCheckVerifiesTreeDigests(t *testing.T) {
func TestDoctor_StagingCheckNeverPassesOnReadError(t *testing.T) {
type deleteFailingStore struct {
func (s *deleteFailingStore) Delete(ctx context.Context, ref secrets.SecretRef) error {
func TestDoctor_SecretCanarySurfacesDeleteError(t *testing.T) {
func TestDoctor_DiskCheckReportsMeasuredFreeSpace(t *testing.T) {
func TestDoctor_DirectoriesCheckIsReadOnly(t *testing.T) {
func TestDoctor_LazyRootsMissingIsNotAFailure(t *testing.T) {
func TestDoctor_DBCheckMeasuresJournalMode(t *testing.T) {
func TestDoctor_RuntimesCheckWarnsWhenNoneFound(t *testing.T) {
func TestDoctor_HostRegistrationsWarnWhenNoneRegistered(t *testing.T) {
func TestDoctorReportsHowLongEachCheckTook(t *testing.T) {
```

### internal/doctor/repair.go — 155 lines
```
package doctor
func BuildRepairPlan(report *DoctorReport, paths *config.PlatformPaths) *RepairPlan {
func ApplyRepairPlan(ctx context.Context, plan *RepairPlan, paths *config.PlatformPaths, db *state.DB) error {
```

### internal/doctor/repair_test.go — 190 lines
```
package doctor
func repairPaths(t *testing.T) *config.PlatformPaths {
func openRepairDB(t *testing.T, paths *config.PlatformPaths) *state.DB {
func TestApplyRepairPlan_CleanStagingRefusesWithoutJournal(t *testing.T) {
func TestApplyRepairPlan_CleanStagingSkipsActiveOperations(t *testing.T) {
func TestApplyRepairPlan_ReadDirFailureIsReported(t *testing.T) {
func TestApplyRepairPlan_CollectsFailuresAndKeepsGoing(t *testing.T) {
func TestBuildRepairPlan_OnlyProposesKnownActions(t *testing.T) {
```

### internal/doctor/types.go — 72 lines
```
package doctor
type CheckStatus string
const (
type Category string
const (
type CheckResult struct {
type DoctorReport struct {
type RepairAction struct {
type RepairPlan struct {
```

## PACKAGE: internal/domain (8 files)

### internal/domain/canonical.go — 403 lines
```
package domain
func ComputePlanHash(plan *InstallPlan) (string, error) {
func ComputeSchemaFingerprint(jsonSchema []byte) (string, error) {
func ComputeDigest(r io.Reader) (string, error) {
func ComputeBytesDigest(data []byte) string {
func ComputeContentDigest(listings []*Listing, versions []*VersionRecord) (string, error) {
func CanonicalizeJSON(input []byte) ([]byte, error) {
func formatCanonical(v any, buf *bytes.Buffer) error {
func formatCanonicalString(s string, buf *bytes.Buffer) {
func formatCanonicalNumber(numStr string, buf *bytes.Buffer) error {
func sortUTF16(keys []string) {
func compareUTF16(a, b string) int {
func toUTF16Units(r rune) []uint16 {
func EnsureValidUTF8(b []byte) bool {
```

### internal/domain/canonical_test.go — 190 lines
```
package domain
func TestCanonicalizeJSONNumbers(t *testing.T) {
func TestCanonicalizeJSONNumbersRoundTrip(t *testing.T) {
func TestCanonicalizeJSONRejectsNonFinite(t *testing.T) {
func TestCanonicalizeJSONSortsKeysAndKeepsStrings(t *testing.T) {
func TestComputeBytesDigestFormat(t *testing.T) {
func TestComputeContentDigestTracksContent(t *testing.T) {
func TestInstallabilityRequiresWiredKindAndProvenance(t *testing.T) {
```

### internal/domain/domain_test.go — 278 lines
```
package domain
func TestSourceIDParsing(t *testing.T) {
func TestListingID(t *testing.T) {
func TestComponentID(t *testing.T) {
func TestInstallAndCapabilityID(t *testing.T) {
func TestCanonicalizeJSON(t *testing.T) {
func TestPlanHashInvariance(t *testing.T) {
func TestSchemaFingerprint(t *testing.T) {
func TestErrorSerialization(t *testing.T) {
```

### internal/domain/errors.go — 522 lines
```
package domain
const (
func NewError(code, message string, details map[string]any) *LPSMError {
type LPSMError struct {
func (e *LPSMError) Unwrap() error {
func (e *LPSMError) Error() string {
func (e *LPSMError) JSON() ([]byte, error) {
func (e *LPSMError) WithCorrelation(correlationID string) *LPSMError {
func (e *LPSMError) WithDetail(key string, value any) *LPSMError {
func ErrInvalidIdentifier(raw, expectedGrammar string) *LPSMError {
func ErrNotInstallable(listingID, reason string) *LPSMError {
func ErrPlanStale(planID, reason string) *LPSMError {
func ErrPlanExpired(planID string) *LPSMError {
func ErrSchemaDrift(capabilityID, expectedFP, actualFP string) *LPSMError {
func ErrResolveConflict(listingID, reason string) *LPSMError {
func ErrResolveCycle(cyclePath string) *LPSMError {
func ErrApprovalConsumed(approvalID string) *LPSMError {
func ErrApprovalExpired(approvalID string) *LPSMError {
... (20 more)
```

### internal/domain/identifiers.go — 263 lines
```
package domain
var (
func ValidateReleaseID(raw string) error {
type SourceID string
func (s SourceID) String() string {
func ParseSourceID(raw string) (SourceID, error) {
func (s SourceID) Namespace() string {
func (s SourceID) Slug() string {
type ListingID string
func (l ListingID) String() string {
func ParseListingID(raw string) (ListingID, error) {
func NewListingID(kind ListingKind, sourceID SourceID, upstreamID string) ListingID {
func (l ListingID) Kind() ListingKind {
func splitListingID(raw string) (kind, source, encodedUpstream string, ok bool) {
func (l ListingID) SourceID() SourceID {
func (l ListingID) UpstreamID() (string, error) {
type ComponentID string
func (c ComponentID) String() string {
... (9 more)
```

### internal/domain/models.go — 621 lines
```
package domain
type ListingKind string
const (
type Installability string
const (
func (i Installability) Effective() Installability {
func (i Installability) Valid() bool {
func (k ListingKind) InstallWired() bool {
func (l *Listing) IsInstallable() bool {
type ListingStatus string
const (
type ArtifactType string
const (
type FetchPolicy string
const (
type ComponentKind string
const (
type SupportLevel string
... (48 more)
```

### internal/domain/workspace.go — 31 lines
```
package domain
func WorkspaceIDForProjectRoot(root string) string {
```

### internal/domain/workspace_test.go — 64 lines
```
package domain
func TestWorkspaceIDForProjectRoot(t *testing.T) {
```

## PACKAGE: internal/egress (2 files)

### internal/egress/egress.go — 603 lines
```
package egress
const (
type Policy struct {
func (p Policy) maxRedirects() int {
func (p Policy) timeout() time.Duration {
type Lookup func(ctx context.Context, host string) ([]net.IPAddr, error)
func defaultLookup(ctx context.Context, host string) ([]net.IPAddr, error) {
var nonPublicPrefixes = []netip.Prefix{
func normalizeAddr(ip net.IP) (netip.Addr, bool) {
func isPublicAddr(addr netip.Addr) bool {
func IsPublicIP(ip net.IP) bool {
func refusedWithoutKnob(addr netip.Addr) bool {
func IsAllowedAddr(addr netip.Addr, p Policy) bool {
func configuredPrivateDestination(host string, ip net.IP, allowedPrivateHost string) bool {
func ConfiguredPrivateHost(raw string) string {
func IsLoopbackHost(host string) bool {
func (p Policy) allowsDestination(host string, ip net.IP) bool {
func CheckURL(raw string, p Policy) error {
... (17 more)
```

### internal/egress/egress_test.go — 576 lines
```
package egress_test
func netipAddr(ip net.IP) (netip.Addr, bool) {
func catalogPolicy() egress.Policy {
func remotePolicy() egress.Policy {
func publicLookup() egress.Lookup {
func egressCode(t *testing.T, err error) string {
func TestCheckURLAllowsCustomHTTPSOriginButRejectsUnsafeForms(t *testing.T) {
func TestCheckURLRefusesLinkLocalMetadataAndMetadataHostnames(t *testing.T) {
func TestCheckURLLoopbackHTTPAllowedOnlyByPolicy(t *testing.T) {
func TestIsAllowedAddrHonoursUnconditionalRefusalsAndKnobs(t *testing.T) {
func TestDestinationRuleAgreesAcrossEntryPoints(t *testing.T) {
func TestHostnameResolvingToLoopbackRefusedUnderDefaultPolicy(t *testing.T) {
func TestResolveCheckedRefusesMetadataCGNATAndMixedAnswers(t *testing.T) {
func TestPrivateHTTPSRefusedByDefaultAndAllowedOnlyByAllowPrivateOptIn(t *testing.T) {
func TestLinkLocalMetadataAndCGNATRefusedWithAndWithoutAllowPrivate(t *testing.T) {
func mustParseURL(t *testing.T, raw string) *url.URL {
func redirectReq(t *testing.T, raw string) *http.Request {
func TestRedirectAllowsPublicCrossOriginUnderCatalogPolicy(t *testing.T) {
... (11 more)
```

## PACKAGE: internal/envref (3 files)

### internal/envref/caveats.go — 67 lines
```
package envref
func Caveats(s Spec, names []string) []string {
func listOf(names []string) string {
```

### internal/envref/envref.go — 326 lines
```
package envref
type Style string
const (
type UnsetBehaviour string
const (
type Spec struct {
func brace(name string) string { return "${" + name + "}" }
func envPrefixed(name string) string { return "${env:" + name + "}" }
var spec = map[string]Spec{
func SpecFor(hostID string) (Spec, bool) {
func Known(hostID string) bool {
func (s Spec) EnvMap(names []string) map[string]string {
func SortedNames(names []string) []string {
func ValidateName(name string) error {
func ValidateNames(names []string) error {
func Resolve(value string, lookup func(string) (string, bool)) (string, bool) {
func (s Spec) Resolve(value string, lookup func(string) (string, bool)) (string, bool) {
func referenceName(value string) (name, fallback string, hasFallback, ok bool) {
... (1 more)
```

### internal/envref/envref_test.go — 221 lines
```
package envref
func TestValidateName(t *testing.T) {
func TestValidateNamesRejectsDuplicates(t *testing.T) {
func TestReferenceSpellingPerHost(t *testing.T) {
func TestCodexUsesNameListNotSubstitution(t *testing.T) {
func TestOpenCodeFieldAndSyntax(t *testing.T) {
func TestKnownHosts(t *testing.T) {
func TestResolve(t *testing.T) {
func TestFallbackOnlyWhereTheHostDocumentsIt(t *testing.T) {
func TestResolveRejectsInterpolatedStrings(t *testing.T) {
func TestCaveats(t *testing.T) {
func contains(hay []string, needle string) bool {
func indexOf(s, sub string) int {
```

## PACKAGE: internal/fslock (5 files)

### internal/fslock/alive_unix.go — 30 lines
```
package fslock
func ProcessAlive(pid int) bool {
func isRemoveContention(error) bool { return false }
```

### internal/fslock/alive_windows.go — 40 lines
```
package fslock
const (
func ProcessAlive(pid int) bool {
func isRemoveContention(err error) bool {
```

### internal/fslock/lock.go — 307 lines
```
package fslock
var ErrBusy = errors.New("lock is held by a live process")
type BusyError struct {
func (e *BusyError) Error() string {
func (e *BusyError) Is(target error) bool { return target == ErrBusy }
type Lock struct {
func (l *Lock) Path() string { return l.path }
var aliveFn = ProcessAlive
func newToken() (string, error) {
func encode(pid int, token string) string {
func decode(data []byte) (pid int, token string, ok bool) {
func publish(path, content string) error {
const staleUnparseable = 30 * time.Second
func stale(path string) (isStale bool, pid int, gone bool) {
func TryAcquire(path string) (*Lock, error) {
func reclaim(path string) error {
func publishGuard(guard string) (release func(), err error) {
type Options struct {
... (2 more)
```

### internal/fslock/lock_test.go — 166 lines
```
package fslock
func TestAcquireExcludesAndReleaseReopens(t *testing.T) {
func TestReleaseOnlyRemovesOwnLock(t *testing.T) {
func TestStaleLockOfDeadProcessIsReclaimed(t *testing.T) {
func TestYoungUnparseableLockIsNotStolen(t *testing.T) {
func TestConcurrentAcquireIsMutuallyExclusive(t *testing.T) {
func TestProcessAlive(t *testing.T) {
```

### internal/fslock/lock_windows_test.go — 42 lines
```
package fslock
func TestStaleRecoveryRetriesWindowsSharingViolation(t *testing.T) {
```

## PACKAGE: internal/host (51 files)

### internal/host/all_hosts_sandbox_test.go — 484 lines
```
package host
func TestAll52HostsInstallAndRemoveInSandbox(t *testing.T) {
func TestAllProjectCapableHostsInstallAndRemoveInSandbox(t *testing.T) {
func TestAll52HostsMarketplaceHandshakeInSandbox(t *testing.T) {
func TestAll52HostsSkillsIntegrationInSandbox(t *testing.T) {
func TestAll52HostsBridgeSetupAndTeardownInSandbox(t *testing.T) {
```

### internal/host/apply_guard.go — 141 lines
```
package host
func ValidateApplyPlan(plan *HostChangePlan) error {
func emptyContent(s string) bool {
func checkCompareAndSwap(plan *HostChangePlan) error {
func ApplyPlanWrite(plan *HostChangePlan) error {
func RestoreBackup(configPath, backupPath string) error {
```

### internal/host/apply_guard_test.go — 102 lines
```
package host
func TestRestoreBackupRefusesWhenTheRecordedBackupIsGone(t *testing.T) {
func TestApplyPlanWriteComparesTheExistenceBit(t *testing.T) {
```

### internal/host/backup.go — 284 lines
```
package host
const hostConfigWriteLockSuffix = ".litespm-config.lock"
func CreateAtomicBackup(originalPath, backupDir, hostID string) (string, error) {
func AtomicWriteFile(targetPath string, data []byte, perm os.FileMode) error {
func AtomicWriteFileIfUnchanged(targetPath string, data []byte, perm os.FileMode, expected []byte, expectedExi
func RollbackConfigWrite(targetPath, backupPath, expectedDigest string) error {
func rollbackConfigWriteLocked(targetPath, backupPath, expectedDigest string) error {
func resolveAtomicTarget(targetPath string) (string, error) {
func syncParentDir(dir string) {
func atomicWriteFile(targetPath string, data []byte, perm os.FileMode, expected []byte, expectedExists, compar
```

### internal/host/bridge_idempotence_test.go — 86 lines
```
package host
func applyBridgePlan(t *testing.T, plan *HostChangePlan) {
func TestCodexPlanSetupAtIsIdempotent(t *testing.T) {
func TestGrokBuildPlanSetupAtIsIdempotent(t *testing.T) {
```

### internal/host/claudecode.go — 208 lines
```
package host
type ClaudeCodeAdapter struct{}
func (a *ClaudeCodeAdapter) Descriptor() HostDescriptor {
func (a *ClaudeCodeAdapter) DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error) {
func (a *ClaudeCodeAdapter) ProjectConfigPath(root string) string {
func (a *ClaudeCodeAdapter) PlanSetup(ctx context.Context, binaryPath string, backupDir string) (*HostChangePl
func (a *ClaudeCodeAdapter) PlanSetupAt(ctx context.Context, binaryPath string, backupDir string, configPath s
func (a *ClaudeCodeAdapter) ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error) {
func (a *ClaudeCodeAdapter) VerifySetup(ctx context.Context) (*HostVerification, error) {
func (a *ClaudeCodeAdapter) DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error) {
func (a *ClaudeCodeAdapter) RenderManualSetup(binaryPath string) string {
```

### internal/host/cline.go — 317 lines
```
package host
type ClineAdapter struct{}
func (a *ClineAdapter) Descriptor() HostDescriptor {
func (a *ClineAdapter) DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error) {
func legacyClineSettingsPaths(homeDir string) []string {
func clineAuthoritativePath(homeDir string) string {
func (a *ClineAdapter) PlanSetup(ctx context.Context, binaryPath string, backupDir string) (*HostChangePlan, e
func (a *ClineAdapter) PlanSetupAt(ctx context.Context, binaryPath string, backupDir string, configPath string
func (a *ClineAdapter) ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error) {
func (a *ClineAdapter) VerifySetup(ctx context.Context) (*HostVerification, error) {
func (a *ClineAdapter) DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error) {
func (a *ClineAdapter) RenderManualSetup(binaryPath string) string {
```

### internal/host/cline_env_test.go — 238 lines
```
package host
func clearClineEnvOverrides(t *testing.T) {
func TestClineDetectConfigCLINEDir(t *testing.T) {
func TestClineEnvPrecedence(t *testing.T) {
func TestClineOverrideBeatsAnExistingDefaultFile(t *testing.T) {
func TestClineSetupNeverWritesALegacyPath(t *testing.T) {
func TestClineDefaultPathUnchanged(t *testing.T) {
```

### internal/host/codex.go — 262 lines
```
package host
type CodexAdapter struct{}
func (a *CodexAdapter) Descriptor() HostDescriptor {
func (a *CodexAdapter) DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error) {
func (a *CodexAdapter) ProjectConfigPath(root string) string {
func (a *CodexAdapter) PlanSetup(ctx context.Context, binaryPath string, backupDir string) (*HostChangePlan, e
func (a *CodexAdapter) PlanSetupAt(ctx context.Context, binaryPath string, backupDir string, configPath string
func (a *CodexAdapter) ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error) {
func (a *CodexAdapter) VerifySetup(ctx context.Context) (*HostVerification, error) {
func (a *CodexAdapter) DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error) {
func parseTomlMcpComponents(content string, configPath string) []PreExistingComponent {
func (a *CodexAdapter) RenderManualSetup(binaryPath string) string {
```

### internal/host/codex_grok_project_scope_test.go — 172 lines
```
package host
func TestCodexAndGrokBuildSupportProjectScope(t *testing.T) {
func TestProjectScopeInstallRoundTripForCodex(t *testing.T) {
func TestProjectScopeInstallRoundTripForGrokBuild(t *testing.T) {
```

### internal/host/display.go — 171 lines
```
package host
const ProjectOnlyNote = "project only — run inside a project"
type ConfigLocation struct {
func DescribeConfigLocation(ctx context.Context, a HostAdapter) ConfigLocation {
func HomeRelative(p string) string {
type DetectRow struct {
func DescribeDetection(ctx context.Context, cwd string) ([]DetectRow, error) {
func detectRank(r DetectRow) int {
func projectOnlyRow(row DetectRow, g *GenericAdapter, cwd string) DetectRow {
```

### internal/host/display_test.go — 122 lines
```
package host
func projectOnlyAdapter(t *testing.T, id string) *GenericAdapter {
func TestDescribeConfigLocation_ProjectOnlyShowsPattern(t *testing.T) {
func TestDescribeConfigLocation_UserPathIsRealFile(t *testing.T) {
func TestHomeRelative(t *testing.T) {
func TestProjectOnlyRow_NotAProjectShowsNoBogusPath(t *testing.T) {
func TestProjectOnlyRow_GitDirIsAProject(t *testing.T) {
func TestProjectOnlyRow_HostFileMakesItAProject(t *testing.T) {
func TestGenericDetectConfig_ProjectOnlyStillUsesCwdForSetup(t *testing.T) {
func TestDescribeDetection_Order(t *testing.T) {
```

### internal/host/entry_env_test.go — 297 lines
```
package host
func installEnvInto(t *testing.T, hostID, envVarName string, path string) string {
func TestEnvReferenceSpellingReachesTheConfig(t *testing.T) {
func TestCodexForwardsByNameNotBySubstitution(t *testing.T) {
func TestGrokBuildTOMLUsesBraceReference(t *testing.T) {
func TestEnvEntryReadsBackIntact(t *testing.T) {
func TestCodexNameListReadsBackAsResolvableName(t *testing.T) {
func TestNoEnvNamesWritesNoEnvField(t *testing.T) {
func TestTOMLArgsAndEnvReadBack(t *testing.T) {
func TestGenericTargetEnvRelocations(t *testing.T) {
func findBridgeTarget(t *testing.T, id string) *BridgeTarget {
func mustAdapter(t *testing.T, id string) HostAdapter {
```

### internal/host/entry_install.go — 1390 lines
```
package host
type ServerEntry struct {
type EntryInstallOptions struct {
type EntryInstallResult struct {
type entrySpec struct {
func EntryLayoutForScope(adapter HostAdapter, scope domain.InstallScope) (keyPath string, shape string, ok boo
func SupportsUserScope(adapter HostAdapter) bool {
type ProjectConfigPather interface {
func SupportsProjectScope(adapter HostAdapter) bool {
func ProjectConfigPathFor(adapter HostAdapter, root string) (string, bool) {
func detectEntryConfig(ctx context.Context, adapter HostAdapter, scope domain.InstallScope, projectRoot string
func projectConfigPathFor(adapter HostAdapter, root string) (string, error) {
func entrySpecFor(adapter HostAdapter) (entrySpec, bool) {
func entrySpecForScope(adapter HostAdapter, scope domain.InstallScope) (entrySpec, bool) {
var bespokeEntrySpecs = map[string]entrySpec{
func claudeRemoteSpec() *RemoteEntrySpec {
func clineRemoteSpec() *RemoteEntrySpec {
func opencodeRemoteSpec() *RemoteEntrySpec {
... (24 more)
```

### internal/host/entry_install_test.go — 547 lines
```
package host
func entryHome(t *testing.T) string {
func TestInstallServerEntryPreservesTheRestOfTheConfig(t *testing.T) {
func TestInstallServerEntryRefusesCollisions(t *testing.T) {
func TestAtomicWriteFileIfUnchangedRejectsConcurrentEdit(t *testing.T) {
func TestAtomicWriteFileIfUnchangedRefusesUnexpectedCreate(t *testing.T) {
func TestConcurrentInstallServerEntriesPreserveBothMerges(t *testing.T) {
func TestRollbackConfigWriteDoesNotOverwriteEditsAfterInstall(t *testing.T) {
func TestInstallServerEntryRejectsBadNames(t *testing.T) {
func TestInstallServerEntryHostShapes(t *testing.T) {
func TestListServerEntriesNeverReportsTheBridge(t *testing.T) {
func TestProjectScopeWriteBindsToTheNamedProject(t *testing.T) {
func TestProjectScopeRefusesHostsWithoutAProjectPath(t *testing.T) {
func TestProjectScopeInstallRoundTripForClaudeCode(t *testing.T) {
func TestRegisteredBridgeHostsOnlyReportsConfiguredHosts(t *testing.T) {
```

### internal/host/entry_state.go — 353 lines
```
package host
type EntryState struct {
func fingerprintOf(raw string) string {
func entryStateFromContent(spec entrySpec, content, name string) (raw string, present bool, err error) {
func entryStateAt(spec entrySpec, content, name string) (raw string, present bool, err error) {
func ReadServerEntryState(ctx context.Context, hostID, name string, scope domain.InstallScope, projectRoot str
const EntryUnreadable = "unreadable:entry"
func EntryFingerprintNow(ctx context.Context, hostID, name string, scope domain.InstallScope, projectRoot stri
type EntryRemoveResult struct {
func RemoveServerEntry(ctx context.Context, hostID, name string, scope domain.InstallScope, projectRoot, backu
func restoreEntry(spec entrySpec, content, name, prior string) (string, error) {
```

### internal/host/entry_state_test.go — 116 lines
```
package host
func TestEntryFingerprintIsHashOfWrittenEntryAndDetectsEdits(t *testing.T) {
func TestRemoveServerEntryRemovesOnlyTheOwnedEntry(t *testing.T) {
func TestForceReplaceThenRemoveRestoresPriorEntry(t *testing.T) {
```

### internal/host/fuzz_test.go — 72 lines
```
package host
func FuzzMergeJSONEntrySurgical(f *testing.F) {
func FuzzMergeTOMLEntry(f *testing.F) {
```

### internal/host/generic.go — 560 lines
```
package host
type GenericAdapter struct{ Target BridgeTarget }
func NewGenericAdapter(t BridgeTarget) *GenericAdapter { return &GenericAdapter{Target: t} }
func (a *GenericAdapter) Descriptor() HostDescriptor {
func configExt(f ConfigFormat) string {
func supportsTargetOS(supported []string, goos string) bool {
func (a *GenericAdapter) DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error) {
func (a *GenericAdapter) PlanSetup(ctx context.Context, binaryPath, backupDir string) (*HostChangePlan, error)
func (a *GenericAdapter) PlanSetupAt(ctx context.Context, binaryPath, backupDir, configPath string) (*HostChan
func parseHostJSON(data []byte) (map[string]any, error) {
func renderBridgeEntryJSON(hostName, orig string, keyPath []string, entry any) (string, error) {
func (a *GenericAdapter) renderConfig(orig, binaryPath string, projectScope bool) (string, error) {
func (t BridgeTarget) tomlTable() string {
func mergeTOMLEntry(orig, table, block string) (string, error) {
func (a *GenericAdapter) ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error) {
func (a *GenericAdapter) VerifySetup(ctx context.Context) (*HostVerification, error) {
func (a *GenericAdapter) verification(path string, registered bool) *HostVerification {
func (a *GenericAdapter) DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error) {
... (6 more)
```

### internal/host/grokbuild.go — 194 lines
```
package host
type GrokBuildAdapter struct{}
func (a *GrokBuildAdapter) Descriptor() HostDescriptor {
func (a *GrokBuildAdapter) DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error) {
func (a *GrokBuildAdapter) ProjectConfigPath(root string) string {
func (a *GrokBuildAdapter) PlanSetup(ctx context.Context, binaryPath string, backupDir string) (*HostChangePla
func (a *GrokBuildAdapter) PlanSetupAt(ctx context.Context, binaryPath string, backupDir string, configPath st
func (a *GrokBuildAdapter) ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error) {
func (a *GrokBuildAdapter) VerifySetup(ctx context.Context) (*HostVerification, error) {
func (a *GrokBuildAdapter) DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error) {
func (a *GrokBuildAdapter) RenderManualSetup(binaryPath string) string {
```

### internal/host/hermetic_claude_test.go — 11 lines
```
package host
func init() {
```

### internal/host/home.go — 32 lines
```
package host
func resolveHomeDir() string {
```

### internal/host/host_docs_audit_test.go — 306 lines
```
package host
func TestManualSetupSnippetIsPasteableJSON(t *testing.T) {
func TestAmpWritesFlatContainerKey(t *testing.T) {
func TestCrushEntryCarriesRequiredType(t *testing.T) {
func TestBespokeAdaptersHonourDocumentedHomeOverrides(t *testing.T) {
func TestClaudeCodeConfigDirOverride(t *testing.T) {
func TestOpenCodeExplicitConfigFileOverride(t *testing.T) {
func TestPiExtensionPathFollowsAgentDir(t *testing.T) {
func TestClineUsesSharedSettingsPath(t *testing.T) {
```

### internal/host/host_test.go — 686 lines
```
package host
func TestAtomicBackup(t *testing.T) {
func TestCodexAdapter(t *testing.T) {
func TestClaudeCodeAdapter(t *testing.T) {
func TestOpenCodeAdapter_V1_and_V2(t *testing.T) {
func assertManualSetupUsesServersContainer(t *testing.T, manual string) {
func TestOpenCodePlanSetup_EmitsLocalTypeAndArrayCommand(t *testing.T) {
func TestPiAgentAdapter(t *testing.T) {
func TestGrokBuildAdapter(t *testing.T) {
func TestRegistry(t *testing.T) {
func TestGoldenFixturesCompliance(t *testing.T) {
```

### internal/host/json_splice_test.go — 366 lines
```
package host
func spliceHome(t *testing.T) string {
func TestBespokeJSONAdaptersSpliceWithoutRewriting(t *testing.T) {
func TestBespokeJSONAdaptersCreateMissingConfigFile(t *testing.T) {
func TestMergeJSONEntrySurgicalTwoLevelKeyPath(t *testing.T) {
func TestOpenCodeRemovalFindsEntryInEveryLayout(t *testing.T) {
func TestRemovalRefusesRatherThanCorruptsUnrepairableJSON(t *testing.T) {
func TestParseHostJSONToleratesComments(t *testing.T) {
var _ = domain.ScopeUser // keep the domain import meaningful for readers of this file
```

### internal/host/jsonc_merge.go — 388 lines
```
package host
func isJSONSpace(b byte) bool {
func trimJSONSpaceEdges(text string, start, end int) (int, int) {
func jsonValueSpan(text string, keyPath []string) (start, end int, found bool, err error) {
func descendForSpan(dec *json.Decoder, text string, keyPath []string, depth int) ([2]int, bool, error) {
func skipOneValue(dec *json.Decoder) error {
func lineIndentOf(text string, offset int) string {
func indentValue(value any, indent string) (string, error) {
func upsertObjectMember(objText, name string, value any) (string, error) {
func upsertObjectMemberAt(objText, name string, value any, outerIndent string) (string, error) {
func jsonKey(name string) string {
func insertRawMember(objText string, closeRel int, name, literal string) (string, error) {
func leadingIndentOf(text string, offset int) string {
func insertRawMemberAt(objText string, closeRel int, name, literal, outerIndent string) (string, error) {
func lastLiveByte(text string) int {
func isEmptyJSONObject(body string) bool {
func chainLiteral(keys []string, indent string) string {
func ensureKeyPath(raw string, keyPath []string) (string, int, int, error) {
... (2 more)
```

### internal/host/jsonc_merge_html_test.go — 28 lines
```
package host
func TestIndentValueDoesNotHTMLEscape(t *testing.T) {
```

### internal/host/jsonc_merge_indent_test.go — 70 lines
```
package host
func TestCreatedContainerMemberIsIndentedInsideIt(t *testing.T) {
func TestCreatedNestedContainersIndentStepByStep(t *testing.T) {
func containsLine(text, line string) bool {
func splitLines(s string) []string {
```

### internal/host/jsonc_merge_test.go — 488 lines
```
package host
func mustParse(t *testing.T, s string) map[string]any {
func TestStripJSONCommentsPreservesOffsets(t *testing.T) {
func TestStripJSONCommentsKeepsSlashesInStrings(t *testing.T) {
func TestStripJSONCommentsRemovesRealComments(t *testing.T) {
func TestMergeJSONEntrySurgicalPreservesForeignContent(t *testing.T) {
func TestMergeJSONEntrySurgicalToleratesTrailingCommas(t *testing.T) {
func TestStripJSONEntryNamedToleratesTrailingCommas(t *testing.T) {
func TestMergeJSONEntrySurgicalCreatesMissingKeyPath(t *testing.T) {
func TestMergeJSONEntrySurgicalCreatesDeepMissingPath(t *testing.T) {
func TestMergeJSONEntrySurgicalReplacesExistingEntry(t *testing.T) {
func TestMergeJSONEntrySurgicalIsIdempotent(t *testing.T) {
func TestMergeJSONEntrySurgicalOnEmptyFile(t *testing.T) {
func TestMergeJSONEntrySurgicalAgreesWithRemarshal(t *testing.T) {
func jsonEqual(a, b any) bool {
func TestMergeTOMLEntryAppendsWhenAbsent(t *testing.T) {
func TestMergeTOMLEntryReplacesExistingTable(t *testing.T) {
func TestRenderConfigRefusesInvalidJSON(t *testing.T) {
... (9 more)
```

### internal/host/jsonc_trailing_comment_test.go — 52 lines
```
package host
func TestMergeJSONEntrySurgicalWithTrailingComment(t *testing.T) {
```

### internal/host/legacy_adoption_test.go — 436 lines
```
package host
func jsonServersSeed(keyPath []string, servers string) string {
func jsonContainer(t *testing.T, content string, keyPath []string) map[string]any {
func assertSingleCurrentBridge(t *testing.T, content string, keyPath []string) {
func TestGenericAdapterAdoptsLegacyBridgeEntry(t *testing.T) {
func TestGenericAdapterAdoptsWhenLegacyAndCurrentBothPresent(t *testing.T) {
func TestGenericAdapterPreservesCommentsWhileAdopting(t *testing.T) {
func TestGenericAdapterLegacyTOMLAdoption(t *testing.T) {
func TestBespokeJSONAdaptersAdoptLegacyEntry(t *testing.T) {
func TestPiAgentIgnoresForeignContainersAndAdoptsLegacyEntry(t *testing.T) {
func TestOpenCodeAdoptsLegacyEntryInBothLayouts(t *testing.T) {
func TestTOMLBespokeAdaptersAdoptLegacyEntry(t *testing.T) {
func TestStripBridgeEntryRemovesLegacyAndCurrent(t *testing.T) {
func TestRemoveSetupCleansLegacyOnlyEntry(t *testing.T) {
func TestDetectPreExistingComponentsIgnoresLegacyBridge(t *testing.T) {
```

### internal/host/marketplace_command.go — 658 lines
```
package host
var marketplaceAssets embed.FS
const MarketplaceCommandMarker = "litespm-marketplace-command"
const MarketplaceCommandVersion = 2
const ownedMarkerFile = ".litespm-owned"
type MarketplaceCommandKind string
const (
type MarketplaceCommandInfo struct {
type MarketplaceCommandResult struct {
type MarketplaceCommandOptions struct {
type commandFile struct {
type marketplaceCommandSpec struct {
var marketplaceCommandSpecs = map[string]marketplaceCommandSpec{}
func registerMarketplaceCommand(hostID string, spec marketplaceCommandSpec) {
func MarketplaceCommandFor(hostID string) (MarketplaceCommandInfo, bool) {
func MarketplaceCommands() []MarketplaceCommandInfo {
func InstallMarketplaceCommand(ctx context.Context, hostID string, opts MarketplaceCommandOptions) (*Marketpla
func RemoveMarketplaceCommand(ctx context.Context, hostID string) (*MarketplaceCommandResult, error) {
... (24 more)
```

### internal/host/marketplace_command_test.go — 164 lines
```
package host
func registrarHome(t *testing.T) string {
func TestMarketplaceCommandsInstallUpgradeAndRemove(t *testing.T) {
func TestMarketplaceCommandNeverTouchesAUserFile(t *testing.T) {
func TestMarketplaceCommandUpgradesItsOwnFile(t *testing.T) {
func TestClaudeMarketplaceActivationIsSurgical(t *testing.T) {
```

### internal/host/opencode.go — 360 lines
```
package host
type OpenCodeAdapter struct{}
func (a *OpenCodeAdapter) Descriptor() HostDescriptor {
func (a *OpenCodeAdapter) DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error) {
func (a *OpenCodeAdapter) ProjectConfigPath(root string) string {
func firstExistingPath(candidates ...string) string {
func (a *OpenCodeAdapter) PlanSetup(ctx context.Context, binaryPath string, backupDir string) (*HostChangePlan
func (a *OpenCodeAdapter) PlanSetupAt(ctx context.Context, binaryPath string, backupDir string, configPath str
func (a *OpenCodeAdapter) ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error) {
func stripLegacyFlatBridgeEntries(orig string) string {
func (a *OpenCodeAdapter) VerifySetup(ctx context.Context) (*HostVerification, error) {
func (a *OpenCodeAdapter) DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error) {
func (a *OpenCodeAdapter) extractComponent(name string, details any, configPath string) PreExistingComponent {
func (a *OpenCodeAdapter) RenderManualSetup(binaryPath string) string {
```

### internal/host/opencode_project_scope_test.go — 486 lines
```
package host
func opencodeUserConfig(home string) string {
func TestOpenCodeUserScopeInstallWritesDocumentedServersContainer(t *testing.T) {
func TestOpenCodeRemovalFindsLegacyFlatEntry(t *testing.T) {
func TestOpenCodeProjectScopeInstallRoundTrip(t *testing.T) {
func TestOpenCodeProjectScopeFreshProjectCreatesFile(t *testing.T) {
func TestOpenCodeListAndCollisionSpanBothShapes(t *testing.T) {
func TestOpenCodeReadsBothShapes(t *testing.T) {
func TestOpenCodeSetupMigratesFlatBridgeIntoDocumentedContainer(t *testing.T) {
```

### internal/host/pi_project_scope_test.go — 179 lines
```
package host
func TestPiProjectScopeInstallWritesDotPiMcpJSON(t *testing.T) {
func TestPiExtensionGeneratedUsesRealExtensionAPI(t *testing.T) {
```

### internal/host/piagent.go — 296 lines
```
package host
type PiAgentAdapter struct{}
func (a *PiAgentAdapter) Descriptor() HostDescriptor {
func (a *PiAgentAdapter) DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error) {
func piAgentDir() string {
func (a *PiAgentAdapter) ProjectConfigPath(root string) string {
func (a *PiAgentAdapter) ExtensionPath() string {
func (a *PiAgentAdapter) PlanSetup(ctx context.Context, binaryPath string, backupDir string) (*HostChangePlan,
func (a *PiAgentAdapter) PlanSetupAt(ctx context.Context, binaryPath string, backupDir string, configPath stri
var piExtensionCode string
func (a *PiAgentAdapter) ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error) {
func (a *PiAgentAdapter) VerifySetup(ctx context.Context) (*HostVerification, error) {
func (a *PiAgentAdapter) DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error) {
func (a *PiAgentAdapter) RenderManualSetup(binaryPath string) string {
```

### internal/host/registry.go — 91 lines
```
package host
var (
func RegisterAdapter(hostID string, adapter HostAdapter) {
func init() {
func GetAdapter(hostID string) (HostAdapter, error) {
func ListAdapters() []HostAdapter {
func DetectInstalledHosts(ctx context.Context) ([]HostVerification, error) {
```

### internal/host/remote_entry_test.go — 665 lines
```
package host
const remoteTestURL = "https://mcp.example.com/mcp"
type remoteGoldenCase struct {
func goldenFile(file, fileWindows string) string {
func remoteGoldenCases() []remoteGoldenCase {
func remoteHome(t *testing.T) string {
func installRemote(t *testing.T, home, hostID string, entry ServerEntry, force bool) *EntryInstallResult {
func TestRemoteEntryGoldenText(t *testing.T) {
func TestRemoteEntryRoundTrip(t *testing.T) {
func TestRemoteEntryRefusedWhereNeverVerified(t *testing.T) {
func TestRemoteEntryWriteGate(t *testing.T) {
func TestRemoteEntryNameConflictAndForce(t *testing.T) {
func remoteStateHosts() []struct{ hostID, file string } {
func TestRemoteEntryRollbackRestoresPreInstallBytes(t *testing.T) {
func TestRemoveStripsRemoteEntryLeavingSiblings(t *testing.T) {
func TestRemoveRemoteEntryFromCompactFileKeepsSiblings(t *testing.T) {
func TestRemoteEntryForceReplaceThenRemoveRestoresPrior(t *testing.T) {
func TestRemoteUnsupportedCodeIsTheSingleRefusal(t *testing.T) {
... (1 more)
```

### internal/host/remove.go — 628 lines
```
package host
type removalSpec struct {
func (s removalSpec) effectiveKeyPaths() [][]string {
var bespokeRemovalSpecs = map[string]removalSpec{
func removalSpecFor(adapter HostAdapter) (removalSpec, error) {
func openCodeRemovalSpec() removalSpec {
type RemovalResult struct {
func PlanRemoval(ctx context.Context, adapter HostAdapter, backupDir string) (*HostChangePlan, *RemovalResult,
func stripBridgeEntry(content string, spec removalSpec) (string, bool, error) {
func stripServerEntry(content string, spec removalSpec, serverName string) (string, bool, error) {
func stripJSONEntry(content string, keyPath []string) (string, bool, error) {
func stripJSONEntryNamed(content string, keyPath []string, serverName string) (string, bool, error) {
func dropDanglingCommaBeforeBrace(text string) (string, bool) {
func startOfCommentLineBefore(text string, j int) (int, bool) {
func dropPrecedingCommentLine(text string, pos int) (string, int, bool) {
func keyStartForValue(text string, valueStart int) int {
func deleteObjectMember(text string, memberStart, memberEnd int) (string, error) {
func stripTOMLEntry(content string, keyPath []string) (string, bool, error) {
... (3 more)
```

### internal/host/remove_test.go — 339 lines
```
package host
func TestStripJSONEntryRemovesOnlyTheBridgeEntry(t *testing.T) {
func TestStripJSONEntryWhenLastMember(t *testing.T) {
func TestStripJSONEntryWhenOnlyMember(t *testing.T) {
func TestStripJSONEntryAbsentIsNotAnError(t *testing.T) {
func TestStripJSONEntryNestedKeyPath(t *testing.T) {
func TestStripJSONEntryIsIdempotent(t *testing.T) {
func TestStripTOMLEntryRemovesOnlyOurTable(t *testing.T) {
func TestStripTOMLEntryAbsent(t *testing.T) {
func TestRemoveSetupRoundTrip(t *testing.T) {
func TestRemoveSetupOnUninstalledHostIsSafe(t *testing.T) {
func TestRemoveFromAllReportsPerHostOutcomes(t *testing.T) {
func TestRemovalSpecForBespokeAdapters(t *testing.T) {
func TestEveryRegisteredAdapterHasARemovalPath(t *testing.T) {
```

### internal/host/target.go — 438 lines
```
package host
type ConfigFormat string
const (
type EntryShape string
const (
const (
var remoteTransportVocab = []string{TransportStreamableHTTP, TransportSSE}
func normalizeRemoteTransport(transport string) string {
func RegistryRemoteTransport(hostTransport string) string {
type RemoteEntrySpec struct {
func (r *RemoteEntrySpec) Supports(transport string) bool {
type BridgeTarget struct {
const litespmServerName = "litespm"
const legacyServerName = "litepsm"
func bridgeArgs(hostID string) []string {
func (t BridgeTarget) jsonEntryValue(binaryPath string) any {
func quoteCommandArg(s string) string {
func (t BridgeTarget) tomlEntryBlock(binaryPath string) (string, error) {
... (9 more)
```

### internal/host/targets_data.go — 1171 lines
```
package host
func xdgConfigDir(home string) string {
func windowsAppData() string {
func windowsLocalAppData() string {
func claudeDesktopConfigPath(goos, home, appData string) string {
func firstExisting(candidates ...string) string {
const remoteNotVerifiedNote = " remote: not verified — no URL entry object was ever read from this row's DocsU
var verifiedBridgeTargets = []BridgeTarget{
func LookupBridgeTarget(id string) (BridgeTarget, bool) {
func VerifiedBridgeTargets() []BridgeTarget {
```

### internal/host/targets_data_test.go — 793 lines
```
package host
var bespokeAdapterIDs = []string{
func TestBridgeTargetTableHasUniqueIDs(t *testing.T) {
func TestBridgeTargetRowsAreComplete(t *testing.T) {
func TestBridgeTargetTableDoesNotShadowBespokeAdapters(t *testing.T) {
func TestBridgeTargetTableHasNoUndeclaredSharedConfigFiles(t *testing.T) {
func declaresShare(tgt BridgeTarget, other string) bool {
func TestBridgeTargetTableExcludesUnverifiedAgents(t *testing.T) {
func TestSupportedTargetOSIsFailClosed(t *testing.T) {
func TestClaudeDesktopConfigPaths(t *testing.T) {
func TestVSCodeUsesPortableCopilotSchemaAndProjectScope(t *testing.T) {
func TestLookupBridgeTargetIsCaseSensitive(t *testing.T) {
func TestVerifiedBridgeTargetsReturnsACopy(t *testing.T) {
func TestGenericAdapterRoundTrip(t *testing.T) {
func TestGenericAdapterPreservesUserCommentsEndToEnd(t *testing.T) {
func TestGenericAdapterDetectsPreExistingComponentsReadOnly(t *testing.T) {
func TestGenericAdapterHonoursEnvOverride(t *testing.T) {
func TestGenericAdapterProjectOnlyHostUsesProjectFile(t *testing.T) {
... (11 more)
```

### internal/host/testsupport_test.go — 79 lines
```
package host
func useTempHome(t *testing.T) string {
func adapterFor(t *testing.T, id string) *GenericAdapter {
func configPathOf(t *testing.T, adapter *GenericAdapter) string {
func writeConfig(t *testing.T, path, content string) {
func configPathOfAny(t *testing.T, adapter HostAdapter) string {
```

### internal/host/toml_inline_comment_test.go — 161 lines
```
package host
const inlineCommentedLiveConfig = `model = "gpt-5"
func TestTOMLHeaderMatchersIgnoreInlineComments(t *testing.T) {
func TestTOMLLookupFindsInlineCommentedHeader(t *testing.T) {
func TestMergeTOMLEntryReplacesInlineCommentedHeader(t *testing.T) {
func TestStripTOMLEntryNamedRemovesInlineCommentedHeader(t *testing.T) {
func TestPlanRemovalFindsInlineCommentedBridge(t *testing.T) {
```

### internal/host/toml_string.go — 295 lines
```
package host
const TOMLInvalidCode = "LPSM-TOML-INVALID"
var ErrInvalidTOML = errors.New("invalid TOML")
type TOMLInvalidError struct {
func (e *TOMLInvalidError) Error() string {
func (e *TOMLInvalidError) Unwrap() error { return ErrInvalidTOML }
func tomlQuoteString(s string) (string, error) {
func tomlQuoteStringLossy(s string) string {
func isHexByte(c byte) bool {
func isHexRun(s string) bool {
func tomlSkipEscape(content string, i int) (int, error) {
func verifyTOMLDocument(content string) error {
```

### internal/host/toml_string_test.go — 176 lines
```
package host
func TestTOMLQuoteStringUsesOnlyTOMLEscapes(t *testing.T) {
func TestVerifyTOMLDocumentAcceptsValidDocuments(t *testing.T) {
func TestVerifyTOMLDocumentRejectsGoEscapesAndBrokenStrings(t *testing.T) {
func TestInstallServerEntryTOMLEscapesHostileArguments(t *testing.T) {
func TestCodexPlanSetupEscapesControlCharactersInTheBinaryPath(t *testing.T) {
```

### internal/host/toml_verify.go — 169 lines
```
package host
func stripTOMLComment(line string) string {
func tomlHeaderOf(line string) string {
func tomlHeaderMatches(line, table string) bool {
func tomlSectionLines(content, table string) ([]string, bool) {
func tomlTableRegistered(content, table string) bool {
func tomlBridgeRegistered(content, table string) bool {
func spliceTOMLBridgeBlock(content, header, block string) string {
```

### internal/host/toml_verify_test.go — 268 lines
```
package host
const commentedBridgeConfig = `# bridge disabled by hand
const liveBridgeConfig = `[mcp_servers.litespm]
type tomlTestTarget struct {
func tomlTestTargets(t *testing.T, home string) []tomlTestTarget {
func TestVerifySetupTOMLIgnoresCommentedTable(t *testing.T) {
func TestPlanSetupReplacesCommentedTOMLTable(t *testing.T) {
func TestStripTOMLComment(t *testing.T) {
func TestTomlBridgeRegisteredScopesToTheTable(t *testing.T) {
func TestAdaptersStillDetectRealRegistrations(t *testing.T) {
func TestGenericTomlTargetTable(t *testing.T) {
```

### internal/host/types.go — 138 lines
```
package host
type HostDescriptor struct {
type PreExistingComponent struct {
type HostChangePlan struct {
type HostApplyResult struct {
type HostVerification struct {
func fileExists(p string) bool {
type HostAdapter interface {
type PathPlanner interface {
func PlanSetupAt(ctx context.Context, adapter HostAdapter, binaryPath, backupDir, configPath string) (*HostCha
```

## PACKAGE: internal/identity (2 files)

### internal/identity/identity.go — 135 lines
```
package identity
type EdgeType string
const (
type Edge struct {
type Node struct {
type Graph struct {
func New() *Graph {
func aliasKey(sourceID, upstreamID string) string {
func (g *Graph) AddCanonical(id string) error {
func (g *Graph) AddEdge(canonicalID string, e Edge) error {
func (g *Graph) CanonicalFor(sourceID, upstreamID string) (string, bool) {
func (g *Graph) Node(canonicalID string) (*Node, bool) {
func Verified(e Edge) bool {
func (g *Graph) Canonicals() []string {
```

### internal/identity/identity_test.go — 69 lines
```
package identity
const pgID = "mcp:builtin:mcp-registry:postgres"
func testGraph(t *testing.T) *Graph {
func TestAddAndResolve(t *testing.T) {
func TestEvidenceRequired(t *testing.T) {
func TestVerifiedRendering(t *testing.T) {
func TestBadCanonicalRejected(t *testing.T) {
```

## PACKAGE: internal/install (5 files)

### internal/install/e6_test.go — 188 lines
```
package install
func sameZipSource(t *testing.T, files map[string][]byte) ArchiveSourceFunc {
func TestE6_ConcurrentSameDigestHasExactlyOneCreator(t *testing.T) {
func TestE6_RollbackNeverDeletesTreeInUse(t *testing.T) {
func TestE6_CorruptReusedTreeIsQuarantinedAndReplaced(t *testing.T) {
func TestE6_PromoteTreeDoesNotMergeIntoExistingDestination(t *testing.T) {
func TestInstallRecordsRealKindAndPath(t *testing.T) {
```

### internal/install/engine.go — 824 lines
```
package install
type ArchiveSourceFunc func(ctx context.Context, listingID string, version string) (io.ReadCloser, string, err
type TreeSourceFunc func(ctx context.Context, targetStagingDir string) (*domain.ExtractedTreeInfo, error)
type InstallOptions struct {
type planBinding struct {
type Engine struct {
func NewEngine(db *state.DB, casRoot, stagingRoot string) (*Engine, error) {
const casLockTimeout = 2 * time.Minute
func (e *Engine) lockDigest(treeDigest string) (func(), error) {
func (e *Engine) SetPolicy(p *policy.Engine) {
func (e *Engine) step(ctx context.Context, opID, name, status, detail string) {
func (e *Engine) loadPlan(ctx context.Context, opts *InstallOptions) (*planBinding, error) {
func (e *Engine) Execute(ctx context.Context, opts InstallOptions) (*domain.InstallRecord, error) {
func (e *Engine) execute(ctx context.Context, opts InstallOptions, consumed *string) (*domain.InstallRecord, e
func (e *Engine) promoteAndCommit(ctx context.Context, opID, stagingDir, extractedDir string, treeInfo *domain
func (e *Engine) quarantineTree(treeDigest, treePath string) (string, error) {
func promoteTree(src, dst, scratchRoot string) (created bool, err error) {
func (e *Engine) TreePath(treeDigest string) (string, error) {
... (6 more)
```

### internal/install/install_test.go — 323 lines
```
package install
func createTestZip(t *testing.T, files map[string][]byte) []byte {
func setupTestEngine(t *testing.T) (*Engine, *state.DB, string) {
func TestInstall_SuccessAndDeduplication(t *testing.T) {
func TestInstall_ApprovalReplayPrevention(t *testing.T) {
func TestInstall_SafeRollbackPreservesSharedTrees(t *testing.T) {
func TestInstall_PathTraversalRejected(t *testing.T) {
func TestInstall_ScopeCollisionFix(t *testing.T) {
func TestInstall_PolicyEnforcement(t *testing.T) {
```

### internal/install/plan_test.go — 326 lines
```
package install
const testPlanID = "plan_ABCDEFGHIJKMNPQRSTVWXYZ01"
func saveTestPlan(t *testing.T, db *state.DB, plan *domain.InstallPlan) *domain.InstallPlan {
func baseTestPlan(listingID, version string) *domain.InstallPlan {
func testZipSource(files map[string][]byte) ArchiveSourceFunc {
func opState(t *testing.T, db *state.DB) (stateName string, planID string) {
func TestInstall_PlanBoundExecution(t *testing.T) {
func TestInstall_PlanHashMismatchRejected(t *testing.T) {
func TestInstall_PlanExpiredRejected(t *testing.T) {
func TestInstall_PlanUnknownIDRejected(t *testing.T) {
func TestInstall_PlanRequestMismatchRejected(t *testing.T) {
func TestInstall_PlanArtifactDigestVerification(t *testing.T) {
func TestInstall_RollbackIsPerOperation(t *testing.T) {
```

### internal/install/promote_test.go — 115 lines
```
package install
func TestPromoteTreeStagesOutsideTheTreeStore(t *testing.T) {
func TestPromoteTreeScratchIsUniquePerCall(t *testing.T) {
```

## PACKAGE: internal/interop (12 files)

### internal/interop/errors.go — 81 lines
```
package interop
const (
type Error struct {
func (e *Error) Error() string { return e.Code + ": " + e.Detail }
func errorf(code, format string, args ...any) *Error {
func CodeOf(err error) string {
```

### internal/interop/fuzz_test.go — 43 lines
```
package interop
func FuzzParse(f *testing.F) {
```

### internal/interop/interop_test.go — 939 lines
```
package interop
func fixture(t *testing.T, name string) []byte {
func wantCode(t *testing.T, err error, code string) {
func TestNormalizeFormat(t *testing.T) {
func TestSkillsLockHappyPath(t *testing.T) {
func TestSkillsLockV2(t *testing.T) {
func TestSkillsLockGlobalV3(t *testing.T) {
func TestSkillsLockRejectsMaliciousAndMalformed(t *testing.T) {
func TestSkillsLockReportsUnknownFieldsAndSubagents(t *testing.T) {
func TestSizeBound(t *testing.T) {
func TestDepthBoundIgnoresBracketsInStrings(t *testing.T) {
func TestServerJSONSingleObject(t *testing.T) {
func TestServerJSONArray(t *testing.T) {
func TestServerJSONRejectsMaliciousAndMalformed(t *testing.T) {
func TestServerJSONNeverPrintsEnvValues(t *testing.T) {
func TestClaudeMarketplace(t *testing.T) {
func TestCodexMarketplace(t *testing.T) {
func TestMarketplaceCommandSourcesAreRejected(t *testing.T) {
... (16 more)
```

### internal/interop/marketplace.go — 367 lines
```
package interop
func slugifyName(name string) string {
var (
const (
func ParseClaudeMarketplace(data []byte) (*Doc, error) {
func ParseCodexMarketplace(data []byte) (*Doc, error) {
func requireMarketplaceName(root map[string]json.RawMessage, where, name string) error {
func requirePluginsArray(root map[string]json.RawMessage) ([]json.RawMessage, error) {
func claudeEntry(i int, p source.ClaudePluginEntry, manifestVersion string,
func codexEntry(i int, p source.CodexPluginEntry,
func pluginWhere(i int, name string) string {
func checkSourceLocator(where string, s source.FlexSource) error {
func firstNonEmptyStr(vals ...string) string {
```

### internal/interop/parse.go — 326 lines
```
package interop
const (
func Parse(format string, data []byte) (*Doc, error) {
func ReadFileBounded(path string) ([]byte, error) {
func ValidateInput(data []byte) error {
func checkDepth(data []byte, max int) error {
func errDetail(err error) string {
func decodeStrict(data []byte, v any) error {
func decodeRoot(data []byte) (map[string]json.RawMessage, error) {
func requireKey(root map[string]json.RawMessage, key string) (json.RawMessage, error) {
func checkKnownKeys(m map[string]json.RawMessage, known map[string]bool, where string, warnings *[]string) {
func checkSafeField(field, value string) error {
func slug(s string) string {
func sourceIDFor(namespace, raw string) (domain.SourceID, error) {
func listingID(kind domain.ListingKind, sourceID string, upstream string) (string, error) {
var (
func constraintFromRef(ref, field string) (string, string) {
```

### internal/interop/plan.go — 551 lines
```
package interop
const (
var AllFormats = []string{
func NormalizeFormat(tok string) (string, error) {
func DefaultFileName(format string) string {
type ForeignRecord struct {
type ForeignPackage struct {
type ForeignRemote struct {
func (r ForeignRecord) Empty() bool {
func (r ForeignRecord) String() string {
type Entry struct {
type Doc struct {
type Action string
const (
type PlannedEntry struct {
const (
type Plan struct {
func BuildPlan(doc *Doc, targetPath string, existing *manifest.Manifest) *Plan {
... (13 more)
```

### internal/interop/plugin.go — 299 lines
```
package interop
const PluginSchema100 = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
const PluginSchemaClaudeCode = "https://json.schemastore.org/claude-code-plugin-manifest.json"
var PluginInstallSchemas = map[string]bool{
const PluginInstallSchemaList = "Agent Plugins 1.0.0 (" + PluginSchema100 +
var pluginKeys = map[string]bool{
func ParsePlugin(data []byte) (*Doc, error) {
type pluginManifest struct {
type pluginAuthor struct {
func sortedRootKeys(root map[string]json.RawMessage) []string {
func validatePluginName(name string) error {
func validateAuthor(root map[string]json.RawMessage) error {
func validateExtensions(root map[string]json.RawMessage, warnings *[]string) ([]string, error) {
func repositorySlug(repo string) string {
```

### internal/interop/plugin_install.go — 693 lines
```
package interop
type PluginMCPServer struct {
type PluginSkill struct {
type PluginInstallManifest struct {
var pluginInstallMembers = map[string]bool{
var pluginServerMembers = map[string]bool{
func ParsePluginInstallManifest(data []byte) (*PluginInstallManifest, error) {
func ParsePluginMCPServersDocument(data []byte) ([]PluginMCPServer, int, error) {
func parsePluginMCPServerMembers(members map[string]json.RawMessage) ([]PluginMCPServer, int, error) {
func parsePluginMCPServers(root map[string]json.RawMessage, doc *PluginInstallManifest) ([]PluginMCPServer, er
func parsePluginMCPServer(name string, raw json.RawMessage) (PluginMCPServer, bool, error) {
func parsePluginEnvNames(server string, raw json.RawMessage) ([]string, error) {
func validatePluginSource(root map[string]json.RawMessage, doc *PluginInstallManifest) error {
func validatePluginAuthor(root map[string]json.RawMessage) error {
func validatePluginKeywords(root map[string]json.RawMessage) error {
func parsePluginSkills(root map[string]json.RawMessage) ([]PluginSkill, error) {
func pathBase(p string) string { return path.Base(p) }
func pathDir(p string) string { return path.Dir(p) }
... (1 more)
```

### internal/interop/plugin_install_test.go — 224 lines
```
package interop
func TestParsePluginInstallManifestReadsTheDeclaredMCPServers(t *testing.T) {
func TestParsePluginInstallManifestReportsTheComponentsItDoesNotInstall(t *testing.T) {
func TestParsePluginInstallManifestRefusesUnsafeSkillPaths(t *testing.T) {
func TestParsePluginInstallManifestReadsEverySkillsShape(t *testing.T) {
func TestParsePluginInstallManifestRefusesACommandSource(t *testing.T) {
func TestParsePluginInstallManifestRefusesAnUnknownMember(t *testing.T) {
func TestParsePluginInstallManifestRefusesAnUnsupportedSchema(t *testing.T) {
func TestParsePluginInstallManifestRefusesABrokenServerDeclaration(t *testing.T) {
func TestParsePluginInstallManifestRefusesAnOversizedOrDeepDocument(t *testing.T) {
func TestParsePluginInstallManifestRefusesAManifestWithoutAName(t *testing.T) {
func TestParsePluginInstallManifestSkipsADisabledServer(t *testing.T) {
```

### internal/interop/serverjson.go — 356 lines
```
package interop
var serverKnownKeys = map[string]bool{
func ParseServerJSON(data []byte) (*Doc, error) {
func parseServerEntry(idx int, raw json.RawMessage, seen map[string]bool) (*Entry, error) {
func firstNonWS(data []byte) byte {
func knownTransport(t string) bool {
func sortedKeys(m map[string]string) []string {
```

### internal/interop/serverjson_live_test.go — 344 lines
```
package interop
func livePlan(t *testing.T, data []byte) (string, string) {
func assertNoLaunchLine(t *testing.T, parts ...string) {
func TestServerJSONLiveSubset(t *testing.T) {
func TestServerJSONLiveSingleObject(t *testing.T) {
func TestServerJSONListResponseRefusedAccurately(t *testing.T) {
func TestServerJSONLiveSchemaEdgeNeverLaunches(t *testing.T) {
func TestServerJSONRejectsRegistryEdgeMalformations(t *testing.T) {
```

### internal/interop/skillslock.go — 327 lines
```
package interop
var skillsLockRootKeys = map[string]bool{
var skillsLockEntryKeys = map[string]bool{
func ParseSkillsLock(data []byte) (*Doc, error) {
func parseSkillsLockEntry(name string, raw json.RawMessage, version int) (*Entry, bool, error) {
func requireEntryString(obj map[string]json.RawMessage, field, key string) (string, error) {
```

## PACKAGE: internal/inventory (2 files)

### internal/inventory/inventory.go — 77 lines
```
package inventory
type ObservedNode struct {
type Snapshot struct {
type Collector struct {
func New() *Collector { return &Collector{} }
func (c *Collector) Observe(n ObservedNode) error {
func (c *Collector) Snapshot() Snapshot {
func HashImage(canonical []byte) string {
func HashJSON(v any) string {
```

### internal/inventory/inventory_test.go — 24 lines
```
package inventory
func TestObserveAndSnapshot(t *testing.T) {
func TestHashStable(t *testing.T) {
```

## PACKAGE: internal/invocation (6 files)

### internal/invocation/bounds.go — 33 lines
```
package invocation
func BoundOutput(text string, limit int) (string, bool, string) {
```

### internal/invocation/bounds_test.go — 59 lines
```
package invocation
func TestBoundOutputKeepsAShortResultIntact(t *testing.T) {
func TestBoundOutputTruncatesAndNamesTheOriginalSize(t *testing.T) {
func TestBoundOutputNeverSplitsARune(t *testing.T) {
```

### internal/invocation/engine.go — 701 lines
```
package invocation
const (
type Invoker func(ctx context.Context, capabilityID string, arguments json.RawMessage) (Output, error)
type Output struct {
type Invocation = receipts.Invocation
type Options struct {
type Engine struct {
const maxRetainedResults = 32
type call struct {
func NewEngine(opts Options) *Engine {
func mustOpenMemoryStore() *receipts.Store {
func (e *Engine) Submit(ctx context.Context, capabilityID string, arguments json.RawMessage, deadline time.Dur
func (e *Engine) SubmitAndWait(ctx context.Context, capabilityID string, arguments json.RawMessage, deadline t
func (e *Engine) Get(id string) (*receipts.Invocation, error) {
func (e *Engine) Cancel(id string) (*receipts.Invocation, error) {
func (e *Engine) Result(id string) (Output, bool) {
func (e *Engine) Pending() []*receipts.Invocation {
func (e *Engine) run(ctx context.Context, id, capabilityID string, arguments json.RawMessage, provider string,
... (24 more)
```

### internal/invocation/engine_test.go — 414 lines
```
package invocation
var errProviderDied = errors.New("the provider process died")
const testCapability = "inst_user_mcp_demo_1_0_0/srv/tool"
func newTestEngine(t *testing.T, inv Invoker, opts Options) *Engine {
func TestSubmitAndWaitProducesVerifiableReceipt(t *testing.T) {
func TestQueueBoundReturnsProviderBusy(t *testing.T) {
func TestDeadlineExceededIsRecorded(t *testing.T) {
func TestCancelStopsAnInFlightCallAndRecordsCancelled(t *testing.T) {
func TestProviderFailureIsRecordedAsFailed(t *testing.T) {
func TestOversizedOutputIsTruncatedWithDigest(t *testing.T) {
func TestRedactionRemovesSecretsFromResultAndStderr(t *testing.T) {
func TestCancellationReceiptChainsUnderTheProvider(t *testing.T) {
func waitForState(t *testing.T, engine *Engine, id, want string) {
func TestFailedInvocationIsNeverReportedAsSuccess(t *testing.T) {
func TestTerminalFailureWithoutAMessageIsNotSuccess(t *testing.T) {
```

### internal/invocation/redact.go — 80 lines
```
package invocation
type redactRule struct {
var defaultRules = []redactRule{
func Redact(s string) (string, error) {
func redactWith(rules []redactRule, s string) (string, error) {
```

### internal/invocation/redact_test.go — 108 lines
```
package invocation
func TestRedactMasksEveryKnownSecretShape(t *testing.T) {
func TestRedactMarkerNamesTheKindNotTheLength(t *testing.T) {
func TestRedactFailsClosedWhenARuleIsMissing(t *testing.T) {
func TestRedactLeavesOrdinaryTextAlone(t *testing.T) {
```

## PACKAGE: internal/ipc (11 files)

### internal/ipc/client.go — 349 lines
```
package ipc
type Client struct {
func (c *Client) SetIdentity(clientKind, hostID string) {
func Dial(endpoint string) (*Client, error) {
func NewClientFromConn(conn net.Conn) *Client {
func (c *Client) readLoop(codec *LineDelimitedCodec) {
func (c *Client) closePending(err error) {
func (c *Client) writeRequest(req *Request) error {
func (c *Client) reconnect() error {
func isTransportError(err error) bool {
func retryableMethod(method string) bool {
func (c *Client) Handshake(ctx context.Context, clientKind, hostID string) (*HandshakeResult, error) {
func (c *Client) ensureHandshake(ctx context.Context) error {
func (c *Client) Call(ctx context.Context, method string, params any, result any) error {
func (c *Client) call(ctx context.Context, method string, params any, result any) error {
func (c *Client) Notify(method string, params any) error {
func (c *Client) Close() error {
```

### internal/ipc/ipc_test.go — 599 lines
```
package ipc
type mockListener struct {
func newMockListener() *mockListener {
func (m *mockListener) Accept() (net.Conn, error) {
func (m *mockListener) Close() error {
func (m *mockListener) Addr() net.Addr {
func TestIPCHandshakeAndEcho(t *testing.T) {
func TestClientReconnectsAfterHandshakeTransportFailure(t *testing.T) {
func TestIsTransportError(t *testing.T) {
func TestIPCCancellation(t *testing.T) {
func TestServerStopIdempotentAndCancelsHandlers(t *testing.T) {
func TestServerStopDoesNotRaceServeStartup(t *testing.T) {
func TestDuplicateRequestID(t *testing.T) {
func rawHandshake(t *testing.T, codec *LineDelimitedCodec) {
func startRawServer(t *testing.T, configure func(*Server)) (*Server, *LineDelimitedCodec, net.Conn) {
func TestServerRequiresHandshakeBeforeOtherMethods(t *testing.T) {
func TestClientHandshakesAutomatically(t *testing.T) {
func TestServerHandshakeDeadline(t *testing.T) {
... (1 more)
```

### internal/ipc/peer.go — 198 lines
```
package ipc
type PeerIdentity struct {
type PeerAuthStatus struct {
func (p PeerIdentity) Status() *PeerAuthStatus {
type peerIdentityKey struct{}
func PeerFromContext(ctx context.Context) (PeerIdentity, bool) {
type peerCreds struct {
const reasonNotUnixSocket = "connection is not a unix socket (in-memory pipe or other listener): no kernel pee
func checkPeerUID(peerUID, daemonUID int) error {
func classifyPeer(creds *peerCreds, unavailableReason string, cause error, daemonUID int) (PeerIdentity, error
func identityForConn(conn net.Conn, daemonUID int) (PeerIdentity, error) {
```

### internal/ipc/peer_test.go — 279 lines
```
package ipc
func TestPeerUIDEnforcementRule(t *testing.T) {
func TestClassifyPeerStates(t *testing.T) {
func TestHandshakeReportsUnverifiedPeerOnPipeListener(t *testing.T) {
func TestPeerAuthenticationAcceptsSameUIDOverUnixSocket(t *testing.T) {
func TestServerRefusesPeerWithMismatchedUID(t *testing.T) {
```

### internal/ipc/protocol.go — 176 lines
```
package ipc
const (
type Request struct {
type Response struct {
type RPCError struct {
func (e *RPCError) Error() string {
type HandshakeParams struct {
type HandshakeResult struct {
type CancelParams struct {
type LineDelimitedCodec struct {
func NewLineDelimitedCodec(rw io.ReadWriter) *LineDelimitedCodec {
func readBoundedLine(r *bufio.Reader, max int) ([]byte, error) {
func (c *LineDelimitedCodec) ReadRequest() (*Request, error) {
func (c *LineDelimitedCodec) ReadResponse() (*Response, error) {
func (c *LineDelimitedCodec) WriteResponse(resp *Response) error {
func (c *LineDelimitedCodec) WriteRequest(req *Request) error {
```

### internal/ipc/server.go — 480 lines
```
package ipc
type HandlerFunc func(ctx context.Context, params json.RawMessage) (any, *RPCError)
type Server struct {
const (
func NewServer(daemonVersion, protocolVersion string) *Server {
func (s *Server) SetTimeouts(handshake, idle time.Duration) {
func (s *Server) SetMaxConcurrentHandlers(n int) {
func (s *Server) RegisterHandler(method string, handler HandlerFunc) {
func (s *Server) Serve(l net.Listener) error {
func (s *Server) handleConnection(conn net.Conn) {
func (s *Server) authenticatePeer(conn net.Conn) (PeerIdentity, error) {
func (s *Server) refusePeer(conn net.Conn, codec *LineDelimitedCodec, cause error) {
func (s *Server) Stop() error {
```

### internal/ipc/transport_darwin.go — 89 lines
```
package ipc
const (
func peerCredentials(conn net.Conn) (*peerCreds, string, error) {
```

### internal/ipc/transport_linux.go — 57 lines
```
package ipc
const peerMethodSOPEERCRED = "SO_PEERCRED"
func peerCredentials(conn net.Conn) (*peerCreds, string, error) {
```

### internal/ipc/transport_other.go — 28 lines
```
package ipc
func peerCredentials(conn net.Conn) (*peerCreds, string, error) {
```

### internal/ipc/transport_unix.go — 51 lines
```
package ipc
func ListenIPC(endpoint string) (net.Listener, error) {
func DialIPC(endpoint string) (net.Conn, error) {
```

### internal/ipc/transport_windows.go — 56 lines
```
package ipc
func ListenIPC(endpoint string) (net.Listener, error) {
func DialIPC(endpoint string) (net.Conn, error) {
func peerCredentials(conn net.Conn) (*peerCreds, string, error) {
```

## PACKAGE: internal/lifecycle (5 files)

### internal/lifecycle/journal.go — 380 lines
```
package lifecycle
type Journal struct {
type journalStep struct {
func BeginJournal(ctx context.Context, db *state.DB, installID string) (*Journal, error) {
func (j *Journal) ID() string {
func (j *Journal) SetInstallID(ctx context.Context, installID string) error {
func (j *Journal) appendStep(ctx context.Context, step journalStep) error {
func (j *Journal) RecordHostWrite(ctx context.Context, result *host.EntryInstallResult) error {
func (j *Journal) RecordSkillWrite(ctx context.Context, destDir, backupPath string, preExists bool, postDigest
func (j *Journal) CommitExec(ctx context.Context, tx *sql.Tx) error {
func (j *Journal) Abort(ctx context.Context) error {
type WriteRecoverySummary struct {
func RecoverOpenWrites(ctx context.Context, db *state.DB, dataRoot string) (WriteRecoverySummary, error) {
func readJournalSteps(ctx context.Context, db *state.DB, journalID string) ([]journalStep, error) {
func rollbackSteps(ctx context.Context, steps []journalStep) error {
func rollbackHostStep(step journalStep) error {
func rollbackSkillStep(step journalStep) error {
func copyTree(src, dst string) error {
... (2 more)
```

### internal/lifecycle/journal_test.go — 148 lines
```
package lifecycle
func openJournalDB(t *testing.T) *state.DB {
func TestRecoverOpenWritesRestoresHostConfig(t *testing.T) {
func TestRecoverOpenWritesRemovesFreshSkillDirectory(t *testing.T) {
func TestRecoverOpenWritesLeavesCommittedInstallAlone(t *testing.T) {
```

### internal/lifecycle/orchestrator.go — 180 lines
```
package lifecycle
type Orchestrator struct {
func New(db *state.DB) *Orchestrator {
func (o *Orchestrator) Ledger() *deployment.Ledger {
func HashFile(path string) string {
func OwnedWrite(installID, capabilityID, hostID, scope, filePath, structureType, locator, preImage, postImage,
func (o *Orchestrator) RecordOwnedWrite(ctx context.Context, m *deployment.Mutation) error {
type RemovePlan struct {
func (o *Orchestrator) PlanRemove(ctx context.Context, installID string, currentHash func(deployment.Mutation)
func (o *Orchestrator) RemoveInstall(ctx context.Context, installID string, currentHash func(deployment.Mutati
func deleteInstallRows(ctx context.Context, raw *sql.DB, installID string) error {
```

### internal/lifecycle/txn.go — 153 lines
```
package lifecycle
type InstallTxn struct {
func BeginInstall(ctx context.Context) *InstallTxn {
func (t *InstallTxn) Ctx() context.Context { return t.ctx }
func (t *InstallTxn) AttachJournal(j *Journal) {
func (t *InstallTxn) Undo(fn func(context.Context) error) {
func (t *InstallTxn) Commit() error {
func (t *InstallTxn) Rollback() error {
func (t *InstallTxn) RollbackUnlessCommitted() {
func (t *InstallTxn) Committed() bool { return t != nil && t.committed }
func (t *InstallTxn) Pending() int {
```

### internal/lifecycle/txn_test.go — 91 lines
```
package lifecycle
func TestInstallTxnRollsBackInReverseOrder(t *testing.T) {
func TestInstallTxnCommitDisablesRollback(t *testing.T) {
func TestInstallTxnSurfacesCompensationFailures(t *testing.T) {
func TestInstallTxnUndoAfterCommitIsInert(t *testing.T) {
```

## PACKAGE: internal/lockfile (3 files)

### internal/lockfile/lockfile.go — 284 lines
```
package lockfile
const (
const LockFileName = "litespm.lock"
const (
type LockedEntry struct {
type Lock struct {
type Resolver func(id, constraint string) (LockedEntry, error)
func Freeze(m *manifest.Manifest, resolve Resolver) (*Lock, error) {
func (l *Lock) computeDigest() string {
func (l *Lock) Verify() error {
func (l *Lock) CheckManifest(m *manifest.Manifest) error {
func FindUp(dir string) (string, error) {
func (l *Lock) Lookup(id string) (LockedEntry, bool) {
func Load(path string) (*Lock, error) {
func (l *Lock) WriteFile(path string) error {
func (l *Lock) MarshalCanonical() string {
func DigestString(s string) string {
func DigestBytes(b []byte) string {
... (1 more)
```

### internal/lockfile/lockfile_test.go — 125 lines
```
package lockfile
func testManifest(t *testing.T) *manifest.Manifest {
func stubResolver(id, constraint string) (LockedEntry, error) {
func TestFreezeDeterministic(t *testing.T) {
func TestLockRoundTripAndVerify(t *testing.T) {
func TestTamperDetected(t *testing.T) {
func TestNoTimestampsInLock(t *testing.T) {
```

### internal/lockfile/parse.go — 154 lines
```
package lockfile
func Parse(data []byte) (*Lock, error) {
func stripLockComment(line string) string {
func unquoteLock(raw string) string {
func strconv_quote(s string) string { return strconv.Quote(s) }
```

## PACKAGE: internal/manager (2 files)

### internal/manager/manager.go — 139 lines
```
package manager
type Tool string
const (
type Step struct {
type Plan struct {
func For(ecosystem string) (Tool, error) {
func PlanInstall(ecosystem, pkg, version string) (Plan, error) {
type Executor struct {
func (e *Executor) Execute(ctx context.Context, p Plan) error {
func Supported() []Tool {
```

### internal/manager/manager_test.go — 57 lines
```
package manager
func TestPlanNPMDisablesScripts(t *testing.T) {
func TestUnknownEcosystemFailsClosed(t *testing.T) {
func TestExecuteDisabledByDefault(t *testing.T) {
func TestExecuteRunsInOrder(t *testing.T) {
func TestSupportedStable(t *testing.T) {
```

## PACKAGE: internal/manifest (3 files)

### internal/manifest/manifest.go — 219 lines
```
package manifest
const SchemaVersion = 1
var ManifestFileNames = []string{"litespm.toml", "litespm.yml", "litespm.yaml"}
type Require struct {
type Policy struct {
type Manifest struct {
func FindUp(dir string) (string, error) {
func Load(path string) (*Manifest, error) {
func Parse(data []byte) (*Manifest, error) {
func (m *Manifest) BindingMode() string {
func (m *Manifest) MarshalCanonical() string {
```

### internal/manifest/manifest_test.go — 155 lines
```
package manifest
const fixture = `schemaVersion = 1
func TestParseManifest(t *testing.T) {
func TestParseRejectsUnknownTable(t *testing.T) {
func TestParseRejectsBadSchemaVersion(t *testing.T) {
func TestCanonicalRoundTrip(t *testing.T) {
func TestBindingModeDefaultsToManaged(t *testing.T) {
func TestBindingModeNative(t *testing.T) {
func TestParseRejectsInvalidBindingMode(t *testing.T) {
func TestFindUp(t *testing.T) {
```

### internal/manifest/tomlmini.go — 198 lines
```
package manifest
type tomlDoc struct {
func parseTOMLSubset(data []byte) (*tomlDoc, error) {
func stripComment(line string) string {
func unquote(raw string) string {
func quote(s string) string { return strconv.Quote(s) }
func parseStrArray(raw string) []string {
func splitCSV(s string) []string {
func quoteStrArray(items []string) string {
func parseInt(raw string) (int, error) {
```

## PACKAGE: internal/mcpclient (8 files)

### internal/mcpclient/client_2026.go — 355 lines
```
package mcpclient
type StreamableHTTPClient struct {
func remoteEgressPolicy() egress.Policy {
func ConnectStreamableHTTP(ctx context.Context, endpoint string, headers map[string]string, httpClient *http.C
func (c *StreamableHTTPClient) ProtocolVersion() ProtocolVersion {
func (c *StreamableHTTPClient) nextID() string {
func withMeta(params json.RawMessage, meta *RequestMeta) (json.RawMessage, error) {
func (c *StreamableHTTPClient) sendRequest(ctx context.Context, method string, params any, toolName string) (*
func decodeStreamableResponse(data []byte, contentType string) (*JSONRPCResponse, error) {
func decodeSSEPayload(data []byte) (*JSONRPCResponse, error) {
func (c *StreamableHTTPClient) ListTools(ctx context.Context) ([]ToolDefinition, error) {
func (c *StreamableHTTPClient) CallTool(ctx context.Context, name string, args json.RawMessage) (*ToolResult, 
func (c *StreamableHTTPClient) SubscribeToListChanges(ctx context.Context, ch chan<- ListChangeEvent) error {
func (c *StreamableHTTPClient) CloseSession() error {
```

### internal/mcpclient/client_guard_test.go — 140 lines
```
package mcpclient
func requireEgressBlocked(t *testing.T, err error) {
func TestNilClientRefusesUnsafeEndpoints(t *testing.T) {
func TestCallerSuppliedClientIsWrappedByGuard(t *testing.T) {
func TestNilClientRefusesOffOriginRedirect(t *testing.T) {
func TestNilClientAllowsLoopbackHTTPTestServer(t *testing.T) {
```

### internal/mcpclient/client_legacy.go — 358 lines
```
package mcpclient
type LegacyClient struct {
func ConnectLegacy(ctx context.Context, endpoint string, headers map[string]string, httpClient *http.Client) (
func (c *LegacyClient) ProtocolVersion() ProtocolVersion {
func (c *LegacyClient) nextID() uint64 {
func (c *LegacyClient) getSessionID() string {
func (c *LegacyClient) setSessionID(id string) {
func (c *LegacyClient) getVersion() string {
func (c *LegacyClient) performHandshake(ctx context.Context) error {
func (c *LegacyClient) postRPCRaw(ctx context.Context, rpcReq JSONRPCRequest, sessionOverride string) (*JSONRP
func (c *LegacyClient) postRPC(ctx context.Context, rpcReq JSONRPCRequest) (*JSONRPCResponse, error) {
func (c *LegacyClient) postNotification(ctx context.Context, notifyReq map[string]any) error {
func (c *LegacyClient) ListTools(ctx context.Context) ([]ToolDefinition, error) {
func (c *LegacyClient) CallTool(ctx context.Context, name string, args json.RawMessage) (*ToolResult, error) {
func (c *LegacyClient) SubscribeToListChanges(ctx context.Context, ch chan<- ListChangeEvent) error {
func (c *LegacyClient) CloseSession() error {
```

### internal/mcpclient/client_stdio.go — 271 lines
```
package mcpclient
type StdioClient struct {
func ConnectStdio(ctx context.Context, in io.Reader, out io.Writer) (*StdioClient, error) {
func (c *StdioClient) sendNotification(ctx context.Context, method string, params map[string]any) error {
func mustMarshal(v any) string {
func (c *StdioClient) ProtocolVersion() ProtocolVersion {
func (c *StdioClient) nextID() string {
func readBoundedLine(r *bufio.Reader, max int) ([]byte, error) {
func (c *StdioClient) readLoop() {
func (c *StdioClient) closePending(err error) {
func (c *StdioClient) sendRequest(ctx context.Context, req JSONRPCRequest) (*JSONRPCResponse, error) {
func (c *StdioClient) ListTools(ctx context.Context) ([]ToolDefinition, error) {
func (c *StdioClient) CallTool(ctx context.Context, name string, args json.RawMessage) (*ToolResult, error) {
func (c *StdioClient) SubscribeToListChanges(ctx context.Context, ch chan<- ListChangeEvent) error {
func (c *StdioClient) CloseSession() error {
```

### internal/mcpclient/live_test.go — 52 lines
```
package mcpclient
func TestLiveStreamableHTTP_RealServer(t *testing.T) {
```

### internal/mcpclient/mcpclient_test.go — 323 lines
```
package mcpclient
func TestModern2026_StreamableHTTP(t *testing.T) {
func TestLegacy2025_Handshake(t *testing.T) {
func TestStdioClient_InPipe(t *testing.T) {
func TestProbeAndDriftDetection(t *testing.T) {
```

### internal/mcpclient/probe.go — 156 lines
```
package mcpclient
type DiscoveredCapability struct {
func FingerprintSchema(schema json.RawMessage) (string, error) {
func ProbeProvider(ctx context.Context, session ClientSession) ([]DiscoveredCapability, error) {
type DriftKind string
const (
type DriftReport struct {
func DetectDrift(
```

### internal/mcpclient/types.go — 127 lines
```
package mcpclient
type ProtocolVersion string
const (
type ToolDefinition struct {
type ToolContent struct {
type ToolResult struct {
type ListChangeEvent struct {
type ClientSession interface {
type RequestMeta struct {
type ClientInfo struct {
type ClientCaps struct {
type RootsCap struct {
func DefaultClientCaps() ClientCaps {
type JSONRPCRequest struct {
type JSONRPCResponse struct {
type JSONRPCError struct {
func (e *JSONRPCError) Error() string {
type ReadWriteCloser interface {
```

## PACKAGE: internal/policy (5 files)

### internal/policy/defaults_test.go — 217 lines
```
package policy
func TestSecureDefaultsIsCompiledBaseline(t *testing.T) {
func TestNormalizeDefaultsRejectsUnknownLevel(t *testing.T) {
func seedGrant(t *testing.T, ctx context.Context, db *state.DB, capID, fp, tree string) {
func grantInput(capID, fp, tree string) PolicyInput {
func TestDefaults_AlwaysAsk_RequiresApprovalDespiteGrant(t *testing.T) {
func TestDefaults_EnforceSignatures_GatesGrantReverification(t *testing.T) {
func TestDefaults_TrustCurated_RelaxesOnlyTheInstallAskGate(t *testing.T) {
func TestDefaults_UnknownLevelBehavesAsAskOnce(t *testing.T) {
```

### internal/policy/engine.go — 662 lines
```
package policy
type DecisionKind string
const (
type CanonicalEffect string
const (
var ValidEffects = map[CanonicalEffect]bool{
type EffectDeclaration struct {
type PolicyInput struct {
type PolicyDecision struct {
type DenyRule struct {
var blockedNetworkPrefixes = mustPrefixes(
func mustPrefixes(cidrs ...string) []netip.Prefix {
func networkTargetHost(target string) string {
func parseLenientIP(host string) (netip.Addr, bool) {
func isRestrictedNetworkTarget(host string) bool {
func (r DenyRule) matches(input PolicyInput) (matchedEffect CanonicalEffect, ok bool) {
type Engine struct {
const (
... (9 more)
```

### internal/policy/failclosed_test.go — 149 lines
```
package policy
func TestPolicy_GrantTierFailsClosedWhenTheTableCannotBeRead(t *testing.T) {
func TestPolicy_UnreadableGrantRowNeverAuthorizesTheCall(t *testing.T) {
```

### internal/policy/policy_test.go — 419 lines
```
package policy
func setupTestPolicyDB(t *testing.T) (*state.DB, string) {
func TestPolicy_Tier1_InvariantDeny(t *testing.T) {
func TestPolicy_Tier2_UserDeny(t *testing.T) {
func TestPolicy_Tier3_GrantAndDriftDetection(t *testing.T) {
func TestPolicy_Tier4_AskAndTier5_Benign(t *testing.T) {
func TestPolicy_SSRF_StructuralChecks(t *testing.T) {
func TestPolicy_SSRF_ProvenanceCannotBypass(t *testing.T) {
func TestPolicy_EmptyNetworkTargetDenied(t *testing.T) {
func TestPolicy_UnknownEffectDenied(t *testing.T) {
func TestPolicy_DenyRuleHostIDAndConjunction(t *testing.T) {
func TestLoadDenyRules(t *testing.T) {
func TestDenyRuleMatchesTargetRefAliases(t *testing.T) {
func containsRule(ids []string, want string) bool {
```

### internal/policy/rules.go — 40 lines
```
package policy
const DenyRulesFile = "policy-deny.json"
func LoadDenyRules(path string) ([]DenyRule, error) {
```

## PACKAGE: internal/porting (9 files)

### internal/porting/conflict.go — 114 lines
```
package porting
const (
var ConflictStrategies = []string{
func ParseStrategy(s string) (string, error) {
type Conflict struct {
func (c Conflict) Key() string { return ConflictKey(c.Kind, c.ID) }
func ConflictKey(kind, id string) string { return kind + "/" + id }
func ResolveConflict(strategy string, c Conflict, writeAction string) (action, reason string, err error) {
```

### internal/porting/conflict_test.go — 72 lines
```
package porting
func TestParseStrategy(t *testing.T) {
func TestResolveConflictStrategies(t *testing.T) {
func TestConflictKeyRoundTrip(t *testing.T) {
```

### internal/porting/ir.go — 214 lines
```
package porting
const (
func SupportedKind(kind string) bool {
type SourceMCP struct {
type SourceSkill struct {
type SourceOther struct {
type Source struct {
type SkillRecord struct {
func NormalizeMCP(src SourceMCP) (host.ServerEntry, []string) {
func remoteTransportOf(endpoint, transport string) string {
func IRFromHostEntry(e host.HostServerEntry) host.ServerEntry {
func Fingerprint(e host.ServerEntry) string {
func AdoptedListingID(kind, sourceHost, name string) string {
```

### internal/porting/ir_test.go — 156 lines
```
package porting
func TestNormalizeMCPPDropsLiteralEnvValues(t *testing.T) {
func TestNormalizeMCPKeepsReferenceNames(t *testing.T) {
func TestFingerprintCanonical(t *testing.T) {
func TestIRFromHostEntryClassifiesBothSidesTheSameWay(t *testing.T) {
func TestAdoptedListingIDMatchesCatalogGrammar(t *testing.T) {
func TestSupportedKind(t *testing.T) {
```

### internal/porting/plan.go — 671 lines
```
package porting
const (
const (
type CopyOptions struct {
type CopyItem struct {
type CopyPlan struct {
type TargetSkill struct {
type TargetCaps struct {
var (
func CanonicalKind(s string) (string, bool) {
func BuildPlan(src *Source, tgt *TargetCaps, opts CopyOptions) (*CopyPlan, error) {
func (p *CopyPlan) add(item CopyItem) {
func planMCPItem(plan *CopyPlan, src *Source, tgt *TargetCaps, m SourceMCP, strategy string,
func planSkillItem(plan *CopyPlan, tgt *TargetCaps, s SourceSkill, strategy string,
func applyStrategy(plan *CopyPlan, item *CopyItem, c Conflict, strategy, writeAction string) CopyItem {
func shapeChange(from, to string) string {
func (p *CopyPlan) itemIndex(kind, id string) int {
func (p *CopyPlan) Unresolved() []Conflict {
... (6 more)
```

### internal/porting/plan_test.go — 416 lines
```
package porting
func testSource() *Source {
func testTarget() *TargetCaps {
func TestBuildPlanCountsAndShapes(t *testing.T) {
func TestBuildPlanConflictClassification(t *testing.T) {
func TestBuildPlanFilters(t *testing.T) {
func TestBuildPlanReportsUnsupportedPluginWithReason(t *testing.T) {
func TestBuildPlanUnsupportedTargetShapes(t *testing.T) {
func TestBuildPlanSkillActions(t *testing.T) {
func TestBuildPlanSkillUseSourceRefusesUnmanagedTrees(t *testing.T) {
func TestBuildPlanUseSourceMarksOverwrites(t *testing.T) {
func TestBuildPlanRejectsInvalidStrategyAndNilInputs(t *testing.T) {
func TestAllNeedsIsTheSortedUnion(t *testing.T) {
```

### internal/porting/remote_test.go — 259 lines
```
package porting
const remoteURL = "https://mcp.example.com/mcp"
func capableRemoteSpec() *host.RemoteEntrySpec {
func streamableOnlyRemoteSpec() *host.RemoteEntrySpec {
func remoteSource(transport string) *Source {
func remoteTarget(to string, remote *host.RemoteEntrySpec) *TargetCaps {
func TestRemoteIRRoundTrip(t *testing.T) {
func TestFingerprintSeparatesRemoteFromStdio(t *testing.T) {
func TestPlanRemoteToIncapableTargetIsNotCopyable(t *testing.T) {
func TestPlanRemoteTransportNotSupportedByTarget(t *testing.T) {
func TestPlanRemoteBetweenCapableHosts(t *testing.T) {
func TestPlanRemoteConflictClassification(t *testing.T) {
func TestPlanRemoteWithForwardedEnvIsRefused(t *testing.T) {
```

### internal/porting/secrets.go — 143 lines
```
package porting
var varNameRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
type EnvClass struct {
func ClassifyEnv(env map[string]string, nameList []string) EnvClass {
func (c EnvClass) Needs() []string {
func referenceName(value string) (string, bool) {
```

### internal/porting/secrets_test.go — 70 lines
```
package porting
func TestClassifyEnvSplitsReferencesFromLiterals(t *testing.T) {
func TestClassifyEnvNameListIsAReferenceEvenWithAnEmptyValue(t *testing.T) {
func TestNeedsUnionsReferencesAndDroppedNames(t *testing.T) {
func TestReferenceNameRejectsNonReferenceValues(t *testing.T) {
```

## PACKAGE: internal/profiles (2 files)

### internal/profiles/profiles.go — 363 lines
```
package profiles
type Member struct {
type Target struct {
type Profile struct {
func (p *Profile) Validate() error {
func (p *Profile) Digest() string {
func Parse(data []byte) (*Profile, error) {
func Diff(a, b *Profile) []string {
type Lease struct {
func IssueLease(capabilityID, fingerprint, scope, boundID string, grantEffects, permissions []string, ttl time
func (l *Lease) Check(now time.Time, sessionID, liveFingerprint string) error {
func (l *Lease) Revoke(now time.Time) {
func stripInlineComment(line string) string {
func unquoteTOML(s string) string {
func parseInlineArray(s string) []string {
func newLeaseSuffix() string {
```

### internal/profiles/profiles_test.go — 107 lines
```
package profiles
const profileDoc = `schemaVersion = 1
func TestParseProfile(t *testing.T) {
func TestProfileRejectsBadKind(t *testing.T) {
func TestDiff(t *testing.T) {
func TestLeaseLifecycle(t *testing.T) {
func TestLeaseRules(t *testing.T) {
```

## PACKAGE: internal/provider (13 files)

### internal/provider/alive_other_test.go — 6 lines
```
package provider
func processAlive(pid int) bool { return false }
```

### internal/provider/alive_unix_test.go — 10 lines
```
package provider
func processAlive(pid int) bool { return syscall.Kill(pid, 0) == nil }
```

### internal/provider/configured.go — 68 lines
```
package provider
const (
type ConfiguredProvider struct {
type StartReport struct {
func StartConfigured(ctx context.Context, s *Supervisor, entries []ConfiguredProvider) []StartReport {
```

### internal/provider/configured_test.go — 109 lines
```
package provider
func sleepCommand() (string, []string) {
func TestStartConfigured_ReportsEveryOutcome(t *testing.T) {
func TestSnapshotProvider_RealProcessFacts(t *testing.T) {
```

### internal/provider/env.go — 82 lines
```
package provider
var baseEnvKeys = []string{
var windowsBaseEnvKeys = []string{
func BuildChildEnv(extra, secrets map[string]string) []string {
func buildChildEnv(lookup func(string) (string, bool), windows bool, extra, secrets map[string]string) []strin
```

### internal/provider/env_test.go — 171 lines
```
package provider
func fakeLookup(m map[string]string) func(string) (string, bool) {
func TestBuildChildEnv_MinimalBaseOnly(t *testing.T) {
func TestBuildChildEnv_LayeringAndDedupe(t *testing.T) {
func TestBuildChildEnv_WindowsCaseFoldAndSystemRoot(t *testing.T) {
func TestBuildChildEnv_RejectsMalformedEntries(t *testing.T) {
func dumpEnvCommand() (string, []string) {
func TestSupervisor_ParentEnvCanaryNeverReachesChild(t *testing.T) {
func TestSupervisor_IsolationFailureKillsProcessAndFailsClosed(t *testing.T) {
```

### internal/provider/isolation_other.go — 47 lines
```
package provider
func setupProcessIsolation(cmd *exec.Cmd) {}
func postStartProcessIsolation(cmd *exec.Cmd, h *ProviderHandle) error {
func killProcessTree(h *ProviderHandle, gracePeriod time.Duration) error {
func killGroupNow(pid int) {}
```

### internal/provider/isolation_unix.go — 57 lines
```
package provider
func setupProcessIsolation(cmd *exec.Cmd) {
func postStartProcessIsolation(cmd *exec.Cmd, h *ProviderHandle) error {
func killGroupNow(pid int) {
func killProcessTree(h *ProviderHandle, gracePeriod time.Duration) error {
```

### internal/provider/isolation_windows.go — 153 lines
```
package provider
var (
const (
type jobObjectBasicLimitInformation struct {
type ioCounters struct {
type jobObjectExtendedLimitInformation struct {
func getOrCreateJobObject() (syscall.Handle, error) {
func setupProcessIsolation(cmd *exec.Cmd) {
func postStartProcessIsolation(cmd *exec.Cmd, h *ProviderHandle) error {
func killProcessTree(h *ProviderHandle, gracePeriod time.Duration) error {
func killGroupNow(pid int) {}
```

### internal/provider/pdeathsig_linux.go — 23 lines
```
package provider
func setParentDeathSignal(attr *syscall.SysProcAttr) {
func startWatchdogIfRequired(h *ProviderHandle) error {
```

### internal/provider/pdeathsig_other.go — 82 lines
```
package provider
const watchdogGrace = 2 * time.Second
func setParentDeathSignal(attr *syscall.SysProcAttr) {
func startWatchdogIfRequired(h *ProviderHandle) error {
func watchdogLoop(h *ProviderHandle, pid int, readPipe *os.File) {
```

### internal/provider/provider_test.go — 127 lines
```
package provider
func TestRingBuffer_BoundedMemory(t *testing.T) {
func TestRingBuffer_ConcurrentAccess(t *testing.T) {
func TestSupervisor_Lifecycle(t *testing.T) {
```

### internal/provider/supervisor.go — 427 lines
```
package provider
const (
type RingBuffer struct {
func NewRingBuffer(size int) *RingBuffer {
func (r *RingBuffer) Write(p []byte) (n int, err error) {
func (r *RingBuffer) String() string {
type LaunchSpec struct {
type ProviderStatus string
const (
type ProviderHandle struct {
func (h *ProviderHandle) currentStatus() ProviderStatus {
func (h *ProviderHandle) signalExit() {
type InvocationRequest struct {
type InvocationResult struct {
type Supervisor struct {
func NewSupervisor() *Supervisor {
type IsolationError struct {
func (e *IsolationError) Error() string {
... (14 more)
```

## PACKAGE: internal/receipts (4 files)

### internal/receipts/ids.go — 35 lines
```
package receipts
var crockford = base32.NewEncoding("0123456789ABCDEFGHJKMNPQRSTVWXYZ").WithPadding(base32.NoPadding)
func nextID() string {
func NewInvocationID() string {
func DigestOf(b []byte) string {
```

### internal/receipts/receipts.go — 508 lines
```
package receipts
const (
const (
type Receipt struct {
type Invocation struct {
type Store struct {
func Open(path string) (*Store, error) {
func (s *Store) Record(capabilityID, providerInstance, outcome string, started, ended time.Time, inputDigest, 
func (s *Store) RecordReceipt(r Receipt) (*Invocation, error) {
func (s *Store) SetState(id, state string) error {
func (s *Store) AttachCancel(id string, cancel func()) error {
func (s *Store) Pending() []*Invocation {
func (s *Store) Get(id string) (*Invocation, error) {
func (s *Store) Cancel(id string) (*Invocation, error) {
func (s *Store) RegisterPending(id, capabilityID, providerInstance string) {
func (s *Store) VerifyChain() error {
func (s *Store) lastHashLocked(prov string) string {
func (s *Store) List() []string {
... (4 more)
```

### internal/receipts/receipts_chain_test.go — 89 lines
```
package receipts
func recordChain(t *testing.T, s *Store, prov string, n int) []*Invocation {
func TestVerifyChainAcceptsOrderedChain(t *testing.T) {
func TestVerifyChainDetectsReorderedReceipt(t *testing.T) {
func TestVerifyChainDetectsDeletedMiddleReceipt(t *testing.T) {
```

### internal/receipts/receipts_test.go — 314 lines
```
package receipts
func TestRecordGetCancel(t *testing.T) {
func TestChainAndCancelPending(t *testing.T) {
func TestRecordReceiptCarriesEveryFieldAndVerifies(t *testing.T) {
func TestRecordReceiptRefusesAnUnknownOutcome(t *testing.T) {
func TestSetStateRejectsTerminalAndUnknown(t *testing.T) {
func TestAttachCancelIsCalledOnceAndIsIdempotent(t *testing.T) {
func TestAttachCancelIsANoOpOnTerminalInvocations(t *testing.T) {
func TestPendingListsNonTerminalInvocationsOldestFirst(t *testing.T) {
func TestDurableReplay(t *testing.T) {
```

## PACKAGE: internal/resolver (3 files)

### internal/resolver/resolver.go — 246 lines
```
package resolver
type ListingVersionMetadata struct {
type ListingProvider interface {
type Resolver struct {
func NewResolver(provider ListingProvider) *Resolver {
func (r *Resolver) Resolve(ctx context.Context, rootListingID string, rootConstraintStr string) (*domain.Depen
func computeTopologicalOrder(root string, graph map[string][]string) ([]string, error) {
```

### internal/resolver/resolver_test.go — 479 lines
```
package resolver
type mockProvider struct {
func (m *mockProvider) GetListing(ctx context.Context, listingID string) (*domain.Listing, error) {
func (m *mockProvider) GetListingVersions(ctx context.Context, listingID string) ([]ListingVersionMetadata, er
func TestSemVerComparison(t *testing.T) {
func TestParseVersionRejectsMalformedSemVer(t *testing.T) {
func TestSemVerComparisonHandlesLargePrereleaseNumbers(t *testing.T) {
func TestConstraintMatching(t *testing.T) {
func TestResolver_DiamondDependency(t *testing.T) {
func TestResolver_Conflict(t *testing.T) {
func TestResolver_CycleDetection(t *testing.T) {
func TestImplicitVersionIsThePublishedPin(t *testing.T) {
func TestResolveVersionLessListingSelectsImplicitPin(t *testing.T) {
func TestResolveVersionLessListingRefusesRealSemverConstraint(t *testing.T) {
func TestResolveVersionLessListingAcceptsExplicitPin(t *testing.T) {
func TestResolveMultiVersionListingUnchanged(t *testing.T) {
```

### internal/resolver/semver.go — 348 lines
```
package resolver
var semverVersionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-
const ImplicitVersion = "discovery"
type Version struct {
func (v Version) String() string {
func ParseVersion(s string) (Version, error) {
func (v Version) Compare(other Version) int {
func isNumericIdentifier(s string) bool {
func compareNumericIdentifiers(a, b string) int {
type Comparator struct {
func (c Comparator) Matches(v Version) bool {
type Constraint struct {
func ParseConstraint(s string) (Constraint, error) {
func splitOperator(token string) (string, string) {
func (c Constraint) Matches(v Version) bool {
func (c Constraint) Intersect(other Constraint) Constraint {
```

## PACKAGE: internal/runtime (2 files)

### internal/runtime/runtime.go — 227 lines
```
package runtime
type Kind string
const (
type Spec struct {
type Launch struct {
type Adapter interface {
type Registry struct {
func NewRegistry() *Registry {
func (r *Registry) Register(a Adapter) { r.adapters[a.Kind()] = a }
func (r *Registry) Get(k Kind) (Adapter, bool) { a, ok := r.adapters[k]; return a, ok }
func (r *Registry) Kinds() []Kind {
func lookPath(names ...string) string {
type NodeAdapter struct{}
func (NodeAdapter) Kind() Kind { return KindNode }
func (NodeAdapter) Available(_ context.Context) bool {
func (NodeAdapter) Plan(_ context.Context, spec Spec) (Launch, error) {
type PythonAdapter struct{}
func (PythonAdapter) Kind() Kind { return KindPython }
... (15 more)
```

### internal/runtime/runtime_test.go — 65 lines
```
package runtime
func TestRegistryKinds(t *testing.T) {
func TestNativeRefusesUnresolved(t *testing.T) {
func TestOCIRequiresPin(t *testing.T) {
func TestRemoteRefusesHTTP(t *testing.T) {
func TestNodeRequiresCommand(t *testing.T) {
func repeatA(n int) string {
```

## PACKAGE: internal/scan (3 files)

### internal/scan/scan.go — 280 lines
```
package scan
type Severity string
const (
type Finding struct {
const (
type Row struct {
type SourceRef string
func (s *SourceRef) UnmarshalJSON(data []byte) error {
func (s SourceRef) String() string { return string(s) }
type Artifact struct {
var Rules = []string{
func Scan(row Row) []Finding {
func ScanRows(rows []Row) []Finding {
func Counts(findings []Finding) map[Severity]int {
func isDiscoveryOnly(installability string) bool {
func isInternal(metadata map[string]any) bool {
func looksLikeCredential(raw string) bool {
```

### internal/scan/scan_source_test.go — 83 lines
```
package scan
func TestRowSourceAcceptsBothPublishedShapes(t *testing.T) {
func TestVersionWithoutSourceUsesTheDecodedSource(t *testing.T) {
```

### internal/scan/scan_test.go — 162 lines
```
package scan
func TestScanFiresTheRulesItShould(t *testing.T) {
func TestScanIsQuietOnARowThatIsFine(t *testing.T) {
func TestScanAcceptsAPluginWithAPinnedTree(t *testing.T) {
func TestAPlaceholderIsNotACredential(t *testing.T) {
func TestScanRowsIsDeterministic(t *testing.T) {
```

## PACKAGE: internal/schemacheck (3 files)

### internal/schemacheck/contracts_test.go — 546 lines
```
package schemacheck_test
func loadSchema(t *testing.T, name string) *schemacheck.Schema {
func decodeArray(t *testing.T, what string, raw []byte) []any {
func readShards(t *testing.T, dir string, files map[string]json.RawMessage, base string) [][]byte {
func TestCommittedReleaseTreeValidates(t *testing.T) {
func TestCompiledReleaseValidates(t *testing.T) {
func TestSnapshotRecordValidates(t *testing.T) {
func TestErrorEnvelopeValidates(t *testing.T) {
func TestInstallPlanValidates(t *testing.T) {
func TestSchemaPatternsMatchDomainIdentifiers(t *testing.T) {
func pointerString(t *testing.T, doc any, pointer string) string {
func TestPreFixSchemasRejectRealArtifacts(t *testing.T) {
```

### internal/schemacheck/schema.go — 575 lines
```
package schemacheck
type Schema struct {
var knownKeywords = map[string]bool{
func Decode(raw []byte) (any, error) {
func Parse(raw []byte) (*Schema, error) {
func (s *Schema) Resolve(pointer string) (*Schema, error) {
func (s *Schema) Validate(inst any) error {
func (s *Schema) ValidateBytes(raw []byte) error {
func checkNode(raw any, path string) error {
func checkObject(obj map[string]any, path string) error {
func checkTypeSpec(val any, path string) error {
func validTypeName(t string) bool {
func validateNode(node map[string]any, inst any, path string) error {
func validateAny(node any, inst any, path string) error {
func matchesType(spec any, inst any) bool {
func typeMatches(name string, inst any) bool {
func isInteger(inst any) bool {
func numFloat(v any) (float64, bool) {
... (8 more)
```

### internal/schemacheck/schema_test.go — 125 lines
```
package schemacheck_test
func mustParse(t *testing.T, raw string) *schemacheck.Schema {
func validateJSON(t *testing.T, s *schemacheck.Schema, raw string) error {
func TestKeywordAssertions(t *testing.T) {
func TestParseRejectsUnsupportedKeyword(t *testing.T) {
func TestParseRejectsMalformedKeyword(t *testing.T) {
func TestResolvePointer(t *testing.T) {
func TestDecodeRejectsTrailingData(t *testing.T) {
```

## PACKAGE: internal/secrets (13 files)

### internal/secrets/secrets_test.go — 232 lines
```
package secrets
func TestSecretStore_CRUD(t *testing.T) {
func TestResolveLaunchSecrets(t *testing.T) {
func TestParseSecretRef(t *testing.T) {
func TestZeroPlaintextCanaryLeak(t *testing.T) {
func TestFileEncryptedSecretStoreWithKey(t *testing.T) {
func TestOpenSecretStore_FailClosed(t *testing.T) {
```

### internal/secrets/store.go — 7 lines
```
package secrets
func OpenSecretStore() (SecretStore, error) {
```

### internal/secrets/store_darwin.go — 99 lines
```
package secrets
var (
func darwinKeyringRead() (string, error) {
func darwinKeyringWrite(hexKey string) error {
func getOrGenerateDarwinMasterKey() ([]byte, error) {
func newPlatformSecretStore() (SecretStore, error) {
```

### internal/secrets/store_darwin_test.go — 111 lines
```
package secrets
type keyringStub struct {
func stubKeyring(t *testing.T, read func() (string, error)) *keyringStub {
func wantVaultUnavailable(t *testing.T, err error, what string) {
func TestKeyringReadFailureMintsNoReplacementKey(t *testing.T) {
func TestKeyringEmptyReadMintsKey(t *testing.T) {
func TestKeyringValidStoredValueIsUsed(t *testing.T) {
func TestKeyringCorruptStoredValueIsNotReplaced(t *testing.T) {
```

### internal/secrets/store_linux.go — 97 lines
```
package secrets
var (
func linuxKeyringRead() (string, error) {
func linuxKeyringWrite(hexKey string) error {
func getOrGenerateLinuxMasterKey() ([]byte, error) {
func newPlatformSecretStore() (SecretStore, error) {
```

### internal/secrets/store_linux_test.go — 112 lines
```
package secrets
type keyringStub struct {
func stubKeyring(t *testing.T, read func() (string, error)) *keyringStub {
func wantVaultUnavailable(t *testing.T, err error, what string) {
func TestKeyringReadFailureMintsNoReplacementKey(t *testing.T) {
func TestKeyringEmptyReadMintsKey(t *testing.T) {
func TestKeyringValidStoredValueIsUsed(t *testing.T) {
func TestKeyringCorruptStoredValueIsNotReplaced(t *testing.T) {
```

### internal/secrets/store_mem.go — 149 lines
```
package secrets
type memoryEntry struct {
type MemorySecretStore struct {
func NewMemorySecretStore() (*MemorySecretStore, error) {
func (s *MemorySecretStore) Put(ctx context.Context, namespace, key string, secretBytes []byte) (*SecretRef, e
func (s *MemorySecretStore) Get(ctx context.Context, ref SecretRef) ([]byte, error) {
func (s *MemorySecretStore) Delete(ctx context.Context, ref SecretRef) error {
func (s *MemorySecretStore) Exists(ctx context.Context, ref SecretRef) (bool, error) {
func (s *MemorySecretStore) ListMetadata(ctx context.Context, namespace string) ([]SecretMetadata, error) {
func (s *MemorySecretStore) Close() error {
```

### internal/secrets/store_other.go — 15 lines
```
package secrets
func newPlatformSecretStore() (SecretStore, error) {
```

### internal/secrets/store_windows.go — 93 lines
```
package secrets
var readMasterKeyFile = os.ReadFile
func getOrGenerateWindowsMasterKey(vaultPath string) ([]byte, error) {
func newPlatformSecretStore() (SecretStore, error) {
```

### internal/secrets/store_windows_test.go — 98 lines
```
package secrets
func stubReadMasterKeyFile(t *testing.T, read func(string) ([]byte, error)) {
func wantVaultUnavailable(t *testing.T, err error, what string) {
func TestKeyringReadFailureMintsNoReplacementKey(t *testing.T) {
func TestKeyringEmptyExistingFileIsNotReplaced(t *testing.T) {
func TestKeyringMissingFileMintsAndStoresKey(t *testing.T) {
```

### internal/secrets/types.go — 145 lines
```
package secrets
type SecretRef struct {
func ParseSecretRef(uri string) (*SecretRef, error) {
func NewSecretRef(namespace, key string) *SecretRef {
type SecretMetadata struct {
type SecretStore interface {
var validEnvNameRegex = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)
var dangerousEnvVars = map[string]bool{
func ResolveLaunchSecrets(ctx context.Context, store SecretStore, secretRefs map[string]string) (map[string]st
```

### internal/secrets/vault_concurrency_test.go — 167 lines
```
package secrets
func freshVaultKey(t *testing.T) []byte {
func openTestVault(t *testing.T, vaultPath string, key []byte) *FileEncryptedSecretStore {
func TestVaultConcurrentDeleteSurvivesAdd(t *testing.T) {
func TestVaultStaleSnapshotDoesNotResurrectDeletedSecret(t *testing.T) {
```

### internal/secrets/vault_file.go — 285 lines
```
package secrets
type vaultDiskEntry struct {
type serializedVault struct {
type FileEncryptedSecretStore struct {
func NewFileEncryptedSecretStoreWithKey(vaultPath string, key []byte) (*FileEncryptedSecretStore, error) {
func DefaultVaultPath() string {
func (s *FileEncryptedSecretStore) readEntries() (map[string]vaultDiskEntry, error) {
func (s *FileEncryptedSecretStore) load() error {
const vaultLockTimeout = 10 * time.Second
func (s *FileEncryptedSecretStore) mutate(fn func(entries map[string]vaultDiskEntry) error) error {
func (s *FileEncryptedSecretStore) persist(entries map[string]vaultDiskEntry) error {
func (s *FileEncryptedSecretStore) Put(ctx context.Context, namespace, key string, secretBytes []byte) (*Secre
func (s *FileEncryptedSecretStore) Get(ctx context.Context, ref SecretRef) ([]byte, error) {
func (s *FileEncryptedSecretStore) Delete(ctx context.Context, ref SecretRef) error {
func (s *FileEncryptedSecretStore) Exists(ctx context.Context, ref SecretRef) (bool, error) {
func (s *FileEncryptedSecretStore) ListMetadata(ctx context.Context, namespace string) ([]SecretMetadata, erro
func (s *FileEncryptedSecretStore) Close() error {
```

## PACKAGE: internal/skills (38 files)

### internal/skills/agents.go — 288 lines
```
package skills
type AgentBase int
const (
type AgentTarget struct {
var agentTargets = []AgentTarget{
var openclawTarget = AgentTarget{
func AgentTargets() []AgentTarget {
func LookupAgent(id string) (AgentTarget, bool) {
func AgentIDs() []string {
func openClawGlobalDir(home string) string {
func AgentSkillDir(agentID, scope, projectRoot, home string) (string, bool) {
func xdgConfigHome(home string) string {
func AgentInstalled(a AgentTarget, projectRoot, home string) bool {
func lower(s string) string { return strings.ToLower(s) }
```

### internal/skills/agents_parity_test.go — 82 lines
```
package skills
func TestAgentIDParityRows(t *testing.T) {
func TestPlanInstallSharedUniversalIDsCollapse(t *testing.T) {
```

### internal/skills/agents_test.go — 197 lines
```
package skills
func TestAgentTableIntegrity(t *testing.T) {
func TestAgentSkillDirResolution(t *testing.T) {
func TestAgentSkillDirEnvOverrides(t *testing.T) {
func TestOpenClawRenamedHome(t *testing.T) {
func TestAgentInstalled(t *testing.T) {
func TestPlanInstallMultipleAgentsSharedUniversal(t *testing.T) {
```

### internal/skills/discovery_test.go — 194 lines
```
package skills
func TestDiscoverSkillsDepthThree(t *testing.T) {
func TestDiscoverSkillsIncludingRoot(t *testing.T) {
func TestDiscoverSkillsShallowShadowsDeep(t *testing.T) {
func TestDiscoverSkillsRecursiveFallback(t *testing.T) {
func TestDiscoverSkillsFullDepth(t *testing.T) {
func TestDiscoverSkillsSkipsJunkDirs(t *testing.T) {
func TestDiscoverSkillsMissingRoot(t *testing.T) {
func TestDiscoverSkillsClaudePluginManifest(t *testing.T) {
```

### internal/skills/download.go — 608 lines
```
package skills
const (
var downloadHTTPClient = &http.Client{
type downloadLimits struct {
func envPositiveInt64(name string, fallback int64) int64 {
func envPositiveInt(name string, fallback int) int {
func downloadLimitsFromEnv() downloadLimits {
func IsDirectDownloadSource(raw string) bool {
func FetchSkillDownload(ctx context.Context, raw string) (root string, cleanup func(), err error) {
func extractedRoot(extractDir string) string {
func writeBareSkill(tmp, downloaded string) (string, bool) {
func downloadToFile(ctx context.Context, raw, dst string, limits downloadLimits) (contentType string, err erro
func downloadTooLarge(max int64) error {
func detectArchiveKind(path, contentType string) (string, error) {
func isTarFile(path string) bool {
func extractArchive(path, kind, dst string, limits downloadLimits) error {
func extractTarEntries(r io.Reader, dst string, limits downloadLimits) error {
func extractZipArchive(path, dst string, limits downloadLimits) error {
... (5 more)
```

### internal/skills/download_test.go — 414 lines
```
package skills
func skillMD(name, description string) string {
func testDownloadServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
func serveBytes(t *testing.T, body []byte, contentType string) *httptest.Server {
func fetchDownload(t *testing.T, raw string) (string, error) {
type zipEntry struct {
func buildZip(t *testing.T, entries []zipEntry) []byte {
type tarEntry struct {
func buildTar(t *testing.T, entries []tarEntry) []byte {
func buildTarGz(t *testing.T, entries []tarEntry) []byte {
func TestIsDirectDownloadSource(t *testing.T) {
func TestDownloadLimitsEnv(t *testing.T) {
func TestFetchSkillDownloadRefusesNonHTTPS(t *testing.T) {
func TestFetchSkillDownloadByteCapStopsOverLargeStream(t *testing.T) {
func TestFetchSkillDownloadBareSkillMarkdown(t *testing.T) {
func TestFetchSkillDownloadArchiveSniffedWithoutExtension(t *testing.T) {
func TestFetchSkillDownloadTarGzPreservesStructure(t *testing.T) {
func TestFetchSkillDownloadPlainTarWithoutMagic(t *testing.T) {
... (5 more)
```

### internal/skills/install.go — 1122 lines
```
package skills
const MaxSkillBytes = 32 << 20 // 32 MiB
var validSkillName = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)
type SkillSource struct {
var knownGitHosts = map[string]bool{
var githubArtifactPath = regexp.MustCompile(`^/[^/]+/[^/]+/(?:archive/|raw/|releases/(?:download/|latest/downl
func ParseSkillSource(raw string) (SkillSource, error) {
func pinFromQuery(q url.Values) string {
func parseSCPLikeSource(s string) (SkillSource, error) {
func parseSSHSource(raw string, u *url.URL) (SkillSource, error) {
func githubRepoPathFromGitPath(p string) string {
func isAzureReposHost(host string) bool {
func hasAzureGitPath(p string) bool {
func splitAzureReposPath(p string) (prefix, repo string, ok bool) {
func parseAzureReposSource(raw string, u *url.URL) (SkillSource, error) {
func cleanSubpath(raw string) (string, error) {
func splitAtRef(s string) (string, string) {
func (s SkillSource) RecordedRef(observedCommit string) string {
... (29 more)
```

### internal/skills/install_copy_test.go — 110 lines
```
package skills
func writeCopySource(t *testing.T) string {
func TestCopySkillDirRefusesSymlinkAndCleansUp(t *testing.T) {
func TestCopySkillDirEnforcesMaxSkillBytesAndCleansUp(t *testing.T) {
func TestCopySkillDirRefusesExistingDestinationUntouched(t *testing.T) {
```

### internal/skills/install_force_test.go — 452 lines
```
package skills
func captureOverwriteNotices(t *testing.T, fn func(dst string)) {
func writeSentinelTree(t *testing.T, dst string) {
func TestInstallRefusedOverwriteNamesPathAndNotices(t *testing.T) {
func TestInstallOverwriteNoticePrecedesWrite(t *testing.T) {
func TestInstallForcePreImageIsOriginalBytes(t *testing.T) {
func TestInstallForceReplacesLedgerRow(t *testing.T) {
func TestInstallForceNothingToOverwriteIsPlainInstall(t *testing.T) {
func TestInstallForceRequiresBackupRoot(t *testing.T) {
func TestInstallForceRefusesSymlinkedDestination(t *testing.T) {
func TestInstallForceUnreadableLedgerRefusesBeforeDeleting(t *testing.T) {
func TestInstallForceLedgerWriteFailureRollsBackToPreImage(t *testing.T) {
```

### internal/skills/install_test.go — 215 lines
```
package skills
func TestParseSkillSource(t *testing.T) {
func writeSkillTree(t *testing.T, root, rel, name, desc string) {
func TestDiscoverSkills(t *testing.T) {
func TestSanitizeSkillName(t *testing.T) {
func TestPlanInstall(t *testing.T) {
func TestPlanInstallWithRename(t *testing.T) {
func TestCopySkillDir(t *testing.T) {
func TestHostSkillDir(t *testing.T) {
```

### internal/skills/installer.go — 542 lines
```
package skills
type PolicyRequest struct {
type PolicyVerdict struct {
type PolicyChecker func(ctx context.Context, req PolicyRequest) PolicyVerdict
type PolicyDeniedError struct {
func (e *PolicyDeniedError) Error() string {
type Installer struct {
func NewInstaller(ledger *Ledger, checker PolicyChecker) *Installer {
type InstallRequest struct {
func (req InstallRequest) notifyOverwrite(dst string) {
func (in *Installer) Install(ctx context.Context, req InstallRequest) (LedgerEntry, error) {
func (in *Installer) rollbackOverwrite(dst, backup string, cause error) error {
type UpdateRequest struct {
type UpdateOutcome struct {
func (in *Installer) Update(ctx context.Context, req UpdateRequest) (UpdateOutcome, error) {
func (in *Installer) checkPolicy(ctx context.Context, operation string, src SkillSource, skillName, scope, des
func requireSkillFile(dir string) error {
func swapDir(newDir, dest string) (backup string, err error) {
... (1 more)
```

### internal/skills/installer_test.go — 399 lines
```
package skills
func writeSkillBody(t *testing.T, dir, body string) {
func testInstaller(t *testing.T) (*Installer, *Ledger) {
func TestInstallerInstallPolicyDeny(t *testing.T) {
func TestInstallerInstallPolicyAllowRecordsProvenance(t *testing.T) {
func TestInstallerUpdateHappyPath(t *testing.T) {
func TestInstallerUpdateAlreadyCurrent(t *testing.T) {
func TestInstallerUpdateFailureLeavesOldIntact(t *testing.T) {
func TestInstallerUpdatePolicyDenyLeavesOldIntact(t *testing.T) {
func TestInstallerUpdateLedgerFailureRollsBack(t *testing.T) {
func TestInstallerUpdateDryRunChangesNothing(t *testing.T) {
func TestInstallerUpdateRefusesUserAddedFileUnlessForced(t *testing.T) {
func TestInstallerUpdateRefusesSymlinkedDestination(t *testing.T) {
func assertNoSwapArtefacts(t *testing.T, dir string) {
```

### internal/skills/ledger.go — 614 lines
```
package skills
const AdoptedSource = "adopted"
type LedgerEntry struct {
type Ledger struct {
const ledgerLockTimeout = 30 * time.Second
func (l *Ledger) SetRoots(roots ...string) {
func (l *Ledger) withLock(fn func() error) error {
func (l *Ledger) confineDest(dest string) error {
func (l *Ledger) confinedRoot(dest string) (string, error) {
func OpenLedger(path string) (*Ledger, error) {
func LedgerPath(dataRoot string) string {
func (l *Ledger) read() ([]LedgerEntry, error) {
func (l *Ledger) write(entries []LedgerEntry) error {
func (l *Ledger) Add(entries []LedgerEntry) error {
func (l *Ledger) addLocked(entries []LedgerEntry) error {
func (l *Ledger) All() ([]LedgerEntry, error) {
func (l *Ledger) Skills() ([]string, error) {
type RemovalOutcome struct {
... (10 more)
```

### internal/skills/ledger_confine_test.go — 140 lines
```
package skills
func TestLedgerRemoveRefusesDestinationsOutsideSkillsTrees(t *testing.T) {
func TestLedgerRefusesNulSuffixDestination(t *testing.T) {
func TestLedgerRemoveAcceptsDefaultSkillsTree(t *testing.T) {
func TestLedgerExplicitRootsConfine(t *testing.T) {
func TestLedgerCrossInstanceConcurrentAddsLoseNothing(t *testing.T) {
```

### internal/skills/ledger_deletedest_test.go — 76 lines
```
package skills
func TestDeleteDestRemovesOnlyTheMatchingRow(t *testing.T) {
func TestDeleteDestRefusesOutsideSkillsTrees(t *testing.T) {
```

### internal/skills/ledger_gone_test.go — 42 lines
```
package skills
func TestRemoveClearsARowWhoseDirectoryIsGone(t *testing.T) {
```

### internal/skills/ledger_provenance_test.go — 296 lines
```
package skills
func TestLedgerLegacyJSONLoads(t *testing.T) {
func TestLedgerProvenanceRoundTrip(t *testing.T) {
func TestRemoveScopeMismatchRefused(t *testing.T) {
func TestRemoveScopeMismatchRefusesLegacyEntry(t *testing.T) {
func TestRemoveRefusesUserAddedFileAndForceOverrides(t *testing.T) {
func TestRemoveMatchedInventorySucceeds(t *testing.T) {
func TestRemoveRefusesSymlink(t *testing.T) {
func TestRemoveRefusesSymlinkInsideDirectory(t *testing.T) {
func TestRemoveForceDoesNotBypassRepurposedDir(t *testing.T) {
```

### internal/skills/ledger_symlink_test.go — 121 lines
```
package skills
func TestRemovalRefusesMidPathSymlink(t *testing.T) {
```

### internal/skills/ledger_test.go — 179 lines
```
package skills
func writeSkill(t *testing.T, dir string) {
func TestLedgerAddAndList(t *testing.T) {
func TestLedgerRemoveDeletesRecordedDirs(t *testing.T) {
func TestLedgerRemoveRefusesRepurposedDirectory(t *testing.T) {
func TestLedgerRemoveAll(t *testing.T) {
func TestLedgerDryRunChangesNothing(t *testing.T) {
func TestLedgerCorruptFileIsReported(t *testing.T) {
```

### internal/skills/loader.go — 306 lines
```
package skills
type SkillPackage struct {
func ParseSkillMD(content []byte) (*SkillPackage, error) {
func recordMetadataEntry(pkg *SkillPackage, line string) {
func recordInlineMetadata(pkg *SkillPackage, val string) {
func isTruthyMetadata(v string) bool {
func LoadSkillFromDirectory(dirPath string) (*SkillPackage, error) {
func RenderProgressiveIndex(skills []*SkillPackage) string {
func escapeTableCell(s string) string {
func RenderFullPrompt(skill *SkillPackage) string {
```

### internal/skills/loader_body_test.go — 40 lines
```
package skills
func TestParseSkillMDKeepsNoFrontmatterFirstLine(t *testing.T) {
func TestParseSkillMDKeepsFirstLineAfterFrontmatter(t *testing.T) {
```

### internal/skills/namesafety_test.go — 81 lines
```
package skills
func TestSkillNameRefusesStringsThatAreDangerousElsewhere(t *testing.T) {
func TestAcceptedSkillNamesStayOneSegment(t *testing.T) {
```

### internal/skills/preimage_test.go — 126 lines
```
package skills
const gitConfigBody = "[core]\n\trepositoryformatversion = 0\n"
func forceOverwriteFixture(t *testing.T) (dst, backup, recorded string) {
func TestForcePreImagePreservesGitDirectory(t *testing.T) {
func TestForcePreImageRefusesUnpreservableTree(t *testing.T) {
```

### internal/skills/provenance.go — 151 lines
```
package skills
type FileRecord struct {
type Provenance struct {
func CaptureProvenance(dir string) (Provenance, error) {
func CapturePreImage(dir string) (Provenance, error) {
func captureProvenance(dir string, skipVCS bool) (Provenance, error) {
```

### internal/skills/provenance_test.go — 134 lines
```
package skills
func TestCaptureProvenanceDeterministic(t *testing.T) {
func TestCaptureProvenanceFileBoundaryDistinguishes(t *testing.T) {
func TestCaptureProvenanceRefusesSymlink(t *testing.T) {
func TestCapturePreImageDigestIsNeverEmpty(t *testing.T) {
```

### internal/skills/sanitize.go — 193 lines
```
package skills
func sanitizeForDisplay(s string) string {
func stripTerminalEscapes(s string) string {
func skipEscape(s string, i int) int {
func needsStripping(s string) bool {
func truncateRunes(s string, n int) string {
```

### internal/skills/sanitize_test.go — 245 lines
```
package skills
func TestStripTerminalEscapes(t *testing.T) {
func TestParseSkillMDStripsTerminalEscapes(t *testing.T) {
func TestRenderProgressiveIndexSurvivesMarkdownInjection(t *testing.T) {
func TestTruncateRunesDoesNotCorruptUTF8(t *testing.T) {
func TestSanitizeForDisplayCollapsesWhitespace(t *testing.T) {
```

### internal/skills/skills_test.go — 99 lines
```
package skills
const sampleSkillMD = `---
func TestParseSkillMD_Valid(t *testing.T) {
func TestLoadSkillFromDirectory(t *testing.T) {
func TestRenderProgressiveIndexAndPrompt(t *testing.T) {
```

### internal/skills/source_azure_test.go — 95 lines
```
package skills
func TestParseSkillSourceAzureRepos(t *testing.T) {
func TestParseSkillSourceAzureUnsafePathRejected(t *testing.T) {
```

### internal/skills/source_directory_test.go — 35 lines
```
package skills
func TestSkillDirectoryURLResolvesRepositoryAndNamedSkill(t *testing.T) {
func TestSkillDirectoryURLRejectsAmbiguousOrUnsafeIdentity(t *testing.T) {
```

### internal/skills/source_ssh_test.go — 99 lines
```
package skills
func TestParseSkillSourceSSHForms(t *testing.T) {
```

### internal/skills/source_test.go — 74 lines
```
package skills
func TestParseSkillSourceURLForms(t *testing.T) {
func TestParseSkillSourceRejectsInsecureSchemes(t *testing.T) {
func TestSkillSourceRecordedRef(t *testing.T) {
```

### internal/skills/source_tree_test.go — 144 lines
```
package skills
func TestParseSkillSourceGitHubTreeURLs(t *testing.T) {
func TestParseSkillSourceExplicitPinBeatsTreeRef(t *testing.T) {
func TestParseSkillSourceTreeRefsContainingSlash(t *testing.T) {
func TestParseSkillSourceTreeSubpathTraversalRejected(t *testing.T) {
```

### internal/skills/testsupport_test.go — 54 lines
```
package skills
func useTempHome(t *testing.T) string {
func testLedger(t *testing.T, path string) (*Ledger, error) {
```

### internal/skills/visibility.go — 53 lines
```
package skills
const InternalSkillsEnvVar = "INSTALL_INTERNAL_SKILLS"
func InternalSkillsAllowed() bool {
func SkillVisible(pkg *SkillPackage) bool {
func FilterVisibleSkills(found []DiscoveredSkill) (visible, hidden []DiscoveredSkill) {
```

### internal/skills/visibility_test.go — 112 lines
```
package skills
func TestParseSkillMDMetadataInternal(t *testing.T) {
func TestInternalSkillsVisibility(t *testing.T) {
func TestFilterVisibleSkills(t *testing.T) {
```

### internal/skills/width.go — 219 lines
```
package skills
func DisplayWidth(s string) int {
func PadRight(s string, cells int) string {
func TruncateToWidth(s string, cells int) string {
type widthRange struct {
var wideRanges = []widthRange{
func runeWidth(r rune) int {
func isZeroWidth(r rune) bool {
func isWide(r rune) bool {
```

### internal/skills/width_test.go — 160 lines
```
package skills
func TestDisplayWidth(t *testing.T) {
func TestPadRight(t *testing.T) {
func TestTruncateToWidth(t *testing.T) {
```

## PACKAGE: internal/source (20 files)

### internal/source/acp_registry.go — 213 lines
```
package source
type ACPAgentAdapter struct {
func NewACPAgentAdapter(sourceID domain.SourceID, rawFeed []byte) (*ACPAgentAdapter, error) {
func (a *ACPAgentAdapter) SourceID() domain.SourceID { return a.sourceID }
func (a *ACPAgentAdapter) Ingest(ctx context.Context, snapshotID string) (*IngestResult, error) {
func acpArtifacts(ag agent.Agent) []domain.ArtifactRef {
func acpRequirements(ag agent.Agent) []domain.Requirement {
func acpRequirementStrings(reqs []domain.Requirement) []string {
```

### internal/source/acp_registry_test.go — 90 lines
```
package source
func TestACPAgentAdapterIngest(t *testing.T) {
func TestACPAgentAdapterRejectsEmpty(t *testing.T) {
```

### internal/source/adapter.go — 27 lines
```
package source
type IngestResult struct {
type Adapter interface {
```

### internal/source/claude_marketplace.go — 239 lines
```
package source
type ClaudeMarketplaceManifest struct {
type ClaudeMetadata struct {
type ClaudePluginEntry struct {
type ClaudeMarketplaceAdapter struct {
func NewClaudeMarketplaceAdapter(sourceID domain.SourceID) *ClaudeMarketplaceAdapter {
func (a *ClaudeMarketplaceAdapter) Ingest(ctx context.Context, snapshotID string, rawManifest []byte) (*Ingest
```

### internal/source/codex_marketplace.go — 174 lines
```
package source
type CodexMarketplaceManifest struct {
type CodexInterface struct {
type CodexPluginEntry struct {
type CodexPolicy struct {
type CodexMarketplaceAdapter struct {
func NewCodexMarketplaceAdapter(sourceID domain.SourceID) *CodexMarketplaceAdapter {
func (a *CodexMarketplaceAdapter) Ingest(ctx context.Context, snapshotID string, rawManifest []byte) (*IngestR
```

### internal/source/cursor_marketplace.go — 165 lines
```
package source
type CursorMarketplaceManifest struct {
type CursorMetadata struct {
type CursorPluginEntry struct {
type CursorMarketplaceAdapter struct {
func NewCursorMarketplaceAdapter(sourceID domain.SourceID) *CursorMarketplaceAdapter {
func (a *CursorMarketplaceAdapter) Ingest(ctx context.Context, snapshotID string, rawManifest []byte) (*Ingest
```

### internal/source/flex.go — 171 lines
```
package source
type FlexString struct {
func (f *FlexString) UnmarshalJSON(data []byte) error {
func (f FlexString) String() string { return f.Value }
type FlexStrings struct {
func (f *FlexStrings) UnmarshalJSON(data []byte) error {
type FlexSource struct {
func (f *FlexSource) UnmarshalJSON(data []byte) error {
func (f FlexSource) IsCommand() bool {
func (f FlexSource) RepositoryURL() string {
func firstNonEmpty(vals ...string) string {
func slugifyName(name string) string {
func skillBaseName(p string) string {
```

### internal/source/grok_marketplace.go — 196 lines
```
package source
type GrokMarketplaceManifest struct {
type GrokPluginEntry struct {
type GrokMarketplaceAdapter struct {
func NewGrokMarketplaceAdapter(sourceID domain.SourceID) *GrokMarketplaceAdapter {
func (a *GrokMarketplaceAdapter) Ingest(ctx context.Context, snapshotID string, rawManifest []byte) (*IngestRe
func isFullCommitSHA(s string) bool {
```

### internal/source/mcp_registry.go — 559 lines
```
package source
type MCPRegistryServerSchema struct {
type MCPRegistryPublisher struct {
type MCPRegistryRepository struct {
func (r *MCPRegistryRepository) UnmarshalJSON(data []byte) error {
type MCPRegistryTransport struct {
func (t *MCPRegistryTransport) UnmarshalJSON(data []byte) error {
func (t MCPRegistryTransport) TransportType() string {
type MCPRegistryKeyValueInput struct {
type MCPRegistryArgument struct{}
type MCPRegistryPackage struct {
func (p MCPRegistryPackage) Coordinate() string {
type MCPRegistryRemote struct {
func (r MCPRegistryRemote) TransportType() string {
var mcpRegistryHex64 = regexp.MustCompile(`^[a-f0-9]{64}$`)
func IsRegistryListEnvelope(data []byte) bool {
type MCPRegistryAdapter struct {
func NewMCPRegistryAdapter(sourceID domain.SourceID, rawFeed []byte) (*MCPRegistryAdapter, error) {
... (4 more)
```

### internal/source/mcp_registry_live_fixture_test.go — 16 lines
```
package source
const liveRegistrySubset = `
```

### internal/source/mcp_registry_live_test.go — 231 lines
```
package source
func TestMCPRegistryLiveSubsetIngestsWithoutLaunchLines(t *testing.T) {
func TestMCPRegistryLiveRemotesCarryOnlyEndpoints(t *testing.T) {
func TestMCPRegistryEnvelopeFeedRefused(t *testing.T) {
func TestMCPRegistryNamelessObjectRefused(t *testing.T) {
func TestMCPRegistryPackageWithoutCoordinateRefused(t *testing.T) {
func TestMCPRegistryFileSha256LandsInDigestAndIsValidated(t *testing.T) {
func keysOfListings(res *IngestResult) []string {
```

### internal/source/mcp_registry_remote_test.go — 192 lines
```
package source
func TestMCPRegistryRemoteOnlyListingClaimsNoVersion(t *testing.T) {
func TestMCPRegistryMixedListingKeepsOnlyRealVersions(t *testing.T) {
func ingestFeed(t *testing.T, feed []byte) *IngestResult {
func assertNoRemoteSentinel(t *testing.T, res *IngestResult) {
```

### internal/source/mcp_registry_version_test.go — 133 lines
```
package source
func TestMCPRegistryUnversionedPackageIsDiscoveryOnly(t *testing.T) {
func TestMCPInstallabilityRejectsEmptyVersionSummaries(t *testing.T) {
func TestMCPInstallabilityAcceptsAPublishedEndpoint(t *testing.T) {
```

### internal/source/openai_plugin.go — 164 lines
```
package source
type OpenAIPluginManifest struct {
type OpenAIPluginAdapter struct {
func NewOpenAIPluginAdapter(sourceID domain.SourceID) *OpenAIPluginAdapter {
func (a *OpenAIPluginAdapter) Ingest(ctx context.Context, snapshotID string, rawManifest []byte) (*IngestResul
```

### internal/source/skills.go — 249 lines
```
package source
type SkillDocument struct {
type AgentSkillsAdapter struct {
func NewAgentSkillsAdapter(sourceID domain.SourceID, documents map[string][]byte) (*AgentSkillsAdapter, error)
func (a *AgentSkillsAdapter) SourceID() domain.SourceID {
func (a *AgentSkillsAdapter) Ingest(ctx context.Context, snapshotID string) (*IngestResult, error) {
func ParseSkillMarkdown(data []byte) (*SkillDocument, error) {
```

### internal/source/snapshot.go — 443 lines
```
package source
const (
var (
var (
type SnapshotSection struct {
type FetchSection struct {
type SnapshotRecord struct {
func SnapshotContentDigest(body []byte) string {
func snapshotSlugFromPath(path string) string {
func urlPath(raw string) string {
func SnapshotKey(sourceURL string) (string, error) {
func SnapshotDir(root, sourceURL string) (string, error) {
func newSnapshotID(at time.Time) (string, error) {
func upstreamRevision(etag *string) *string {
func strPtr(s string) *string { return &s }
func WriteSnapshot(root string, sourceID domain.SourceID, sourceURL, etag string, httpStatus int, body []byte,
func verifySnapshotRecord(rec *SnapshotRecord, metaPath, url string) error {
func LoadSnapshot(root, sourceURL string) ([]byte, SnapshotRecord, error) {
... (1 more)
```

### internal/source/snapshot_test.go — 375 lines
```
package source
const testSnapshotURL = "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plu
func testSnapshotRoot() string {
func copySnapshotFixture(t *testing.T) string {
func TestSnapshotDirMatchesPythonStore(t *testing.T) {
func TestLoadSnapshotRecordedByPythonStore(t *testing.T) {
func TestIngestFromSnapshotBytes(t *testing.T) {
func TestLoadSnapshotRefusesTamperedRecords(t *testing.T) {
func TestWriteLoadMarkRoundTrip(t *testing.T) {
func TestMarkIngestedMissingSnapshot(t *testing.T) {
func TestWriteSnapshotRefusesInvalidInputs(t *testing.T) {
func mustSnapshotDir(t *testing.T, root, url string) string {
```

### internal/source/source_marketplace_test.go — 318 lines
```
package source
func fixture(t *testing.T, rel string) []byte {
func TestClaudeMarketplaceAdapter(t *testing.T) {
func TestOpenAIPluginAdapter(t *testing.T) {
func TestGrokMarketplaceAdapter(t *testing.T) {
func TestClaudeMarketplaceRealShapes(t *testing.T) {
func TestCodexMarketplaceAdapter(t *testing.T) {
func TestCursorMarketplaceAdapter(t *testing.T) {
func TestGrokMarketplaceRealShape(t *testing.T) {
func TestKnownSources(t *testing.T) {
```

### internal/source/source_test.go — 166 lines
```
package source
func TestMCPRegistryAdapterIngest(t *testing.T) {
func TestAgentSkillsAdapterIngest(t *testing.T) {
```

### internal/source/sources.go — 159 lines
```
package source
type SourceDef struct {
var KnownSources = []SourceDef{
func LookupSource(id domain.SourceID) (SourceDef, bool) {
func PublisherForSource(id domain.SourceID) string {
```

## PACKAGE: internal/state (14 files)

### internal/state/db.go — 109 lines
```
package state
var initialSchemaSQL string
var phase1LifecycleSQL string
var restoreBackupPathSQL string
var queryIndexesSQL string
var writeJournalSQL string
type DB struct {
func Open(dbPath string) (*DB, error) {
func (db *DB) applyBaselinePragmas() error {
func (db *DB) Close() error {
func (db *DB) Raw() *sql.DB {
```

### internal/state/migrations.go — 264 lines
```
package state
const CurrentSchemaVersion = 5
type Migration struct {
var Migrations = []Migration{
func (db *DB) ApplyMigrations(ctx context.Context, backupDir string) error {
func (db *DB) applyOne(ctx context.Context, m Migration) (err error) {
func (db *DB) backupDatabaseFile(backupDir string, currentVer int) error {
```

### internal/state/migrations/001_initial_schema.sql — 265 lines
```
CREATE TABLE IF NOT EXISTS schema_migrations (
CREATE TABLE IF NOT EXISTS settings (
CREATE TABLE IF NOT EXISTS sources (
CREATE TABLE IF NOT EXISTS source_snapshots (
CREATE TABLE IF NOT EXISTS catalog_releases (
CREATE TABLE IF NOT EXISTS plans (
CREATE INDEX IF NOT EXISTS idx_plans_hash ON plans(plan_hash);
CREATE TABLE IF NOT EXISTS approvals (
CREATE INDEX IF NOT EXISTS idx_approvals_subject ON approvals(subject_type, subject_hash);
CREATE TABLE IF NOT EXISTS operations (
CREATE TABLE IF NOT EXISTS operation_steps (
CREATE TABLE IF NOT EXISTS artifacts (
CREATE TABLE IF NOT EXISTS installs (
CREATE TABLE IF NOT EXISTS install_components (
CREATE TABLE IF NOT EXISTS auth_profiles (
CREATE TABLE IF NOT EXISTS providers (
CREATE TABLE IF NOT EXISTS provider_sessions (
CREATE TABLE IF NOT EXISTS capabilities (
... (7 more)
```

### internal/state/migrations/002_phase1_state_lifecycle.sql — 93 lines
```
-- IMPORTANT: this script must run with PRAGMA foreign_keys=OFF on its
-- PRAGMA foreign_key_check before COMMIT). With enforcement on, DROP TABLE
CREATE TABLE installs_new (
ALTER TABLE installs_new RENAME TO installs;
CREATE INDEX IF NOT EXISTS idx_installs_tree_digest ON installs(tree_digest);
CREATE INDEX IF NOT EXISTS idx_installs_listing ON installs(listing_id);
CREATE INDEX IF NOT EXISTS idx_operations_state ON operations(state);
CREATE INDEX IF NOT EXISTS idx_install_components_install ON install_components(install_id);
CREATE INDEX IF NOT EXISTS idx_providers_install ON providers(install_id);
CREATE TABLE IF NOT EXISTS deployment_mutations (
CREATE INDEX IF NOT EXISTS idx_mutations_install ON deployment_mutations(install_id);
CREATE INDEX IF NOT EXISTS idx_mutations_file ON deployment_mutations(file_path, locator);
CREATE TABLE host_registrations_new (
ALTER TABLE host_registrations_new RENAME TO host_registrations;
```

### internal/state/migrations/003_restore_backup_path.sql — 16 lines
```
ALTER TABLE deployment_mutations ADD COLUMN backup_path TEXT NOT NULL DEFAULT '';
```

### internal/state/migrations/004_query_indexes.sql — 28 lines
```
CREATE INDEX IF NOT EXISTS idx_host_registrations_scope_entry
CREATE INDEX IF NOT EXISTS idx_capability_grants_capability
CREATE INDEX IF NOT EXISTS idx_installs_scope_workspace
```

### internal/state/migrations/005_write_journal.sql — 40 lines
```
CREATE TABLE IF NOT EXISTS write_journal (
CREATE INDEX IF NOT EXISTS idx_write_journal_open
CREATE TABLE IF NOT EXISTS write_journal_steps (
CREATE INDEX IF NOT EXISTS idx_write_journal_steps_journal
```

### internal/state/migrations_test.go — 53 lines
```
package state
func TestMigrations_InitialAndIdempotent(t *testing.T) {
func TestMigrations_DowngradeRejection(t *testing.T) {
```

### internal/state/operations.go — 391 lines
```
package state
type OperationRecord struct {
func (db *DB) CreateOperation(ctx context.Context, opID string, planID *string, opType, idempotencyKey string)
func (db *DB) AdvanceOperationState(ctx context.Context, opID, newState string) error {
func (db *DB) advanceOperationStateExec(ctx context.Context, ex execer, opID, newState string) error {
func (db *DB) RecordOperationStep(ctx context.Context, opID, stepName, status, detail string) error {
func (db *DB) RecordOperationTree(ctx context.Context, opID, treeDigest string, createdByOp bool) error {
func (db *DB) WasTreeCreatedByOperation(ctx context.Context, opID, treeDigest string) (bool, error) {
type OperationTree struct {
func (db *DB) GetOperationTrees(ctx context.Context, opID string) ([]OperationTree, error) {
func (db *DB) HasInstallsForTrees(ctx context.Context, digests []string) (bool, error) {
func (db *DB) TreeInUse(ctx context.Context, opID, treeDigest string) (bool, error) {
func (db *DB) GetNonTerminalOperations(ctx context.Context) ([]*OperationRecord, error) {
type RecoverySummary struct {
func (db *DB) RecoverIncompleteOperations(ctx context.Context, stagingRoot string, treePath func(string) strin
func (db *DB) recoverOperation(ctx context.Context, op *OperationRecord, stagingRoot string, treePath func(str
```

### internal/state/phase1_test.go — 259 lines
```
package state
func TestMigrationsListMatchesCurrentSchemaVersion(t *testing.T) {
func indexNames(t *testing.T, db *DB) map[string]bool {
func TestFreshDBAppliesPhase1Migration(t *testing.T) {
func TestUpgradeFromV1PreservesChildRows(t *testing.T) {
func TestSaveInstallUpsertPreservesGrantsAndProviders(t *testing.T) {
func TestSaveHostRegistrationRequiresRealFingerprintAndKeysByEntry(t *testing.T) {
func TestAuditEventIDsDoNotCollide(t *testing.T) {
func TestPreMigrationBackupFailureIsAnError(t *testing.T) {
```

### internal/state/provider_remote_test.go — 205 lines
```
package state
func seedProviderRows(t *testing.T, db *DB, installID, component string) {
func openProviderDB(t *testing.T) *DB {
func TestProviderEndpointRoundTrip(t *testing.T) {
func TestProviderModeRemoteVocabulary(t *testing.T) {
func TestLegacyProviderRecordWithoutEndpointStillLoads(t *testing.T) {
```

### internal/state/repositories.go — 1272 lines
```
package state
func (db *DB) SavePlan(ctx context.Context, plan *domain.InstallPlan) error {
func (db *DB) GetPlan(ctx context.Context, planID string) (*domain.InstallPlan, error) {
func (db *DB) UpdatePlanStatus(ctx context.Context, planID, status string) error {
const approvalTimeLayout = "2006-01-02 15:04:05.000000000"
func parseStoredApprovalTime(v any) (time.Time, bool) {
func (db *DB) RecordApproval(ctx context.Context, approvalID, subjectType, subjectHash, actor, channel, scope 
type ApprovalRecord struct {
func (db *DB) GetApproval(ctx context.Context, approvalID string) (*ApprovalRecord, error) {
func (db *DB) ConsumeApproval(ctx context.Context, approvalID, subjectType, subjectHash string) error {
func (db *DB) RefundApproval(ctx context.Context, approvalID string) error {
func (db *DB) RevokeApproval(ctx context.Context, approvalID string) error {
func (db *DB) SaveInstall(ctx context.Context, rec *domain.InstallRecord) error {
func (db *DB) saveInstallExec(ctx context.Context, ex execer, rec *domain.InstallRecord) error {
func installKindColumn(k domain.ListingKind) (string, error) {
func (db *DB) GetInstall(ctx context.Context, installID string) (*domain.InstallRecord, error) {
func (db *DB) ListInstalls(ctx context.Context, scope domain.InstallScope, workspaceID string) ([]*domain.Inst
func (db *DB) DeleteInstall(ctx context.Context, installID string) error {
... (30 more)
```

### internal/state/state_test.go — 650 lines
```
package state
func openTestDB(t *testing.T) (*DB, string) {
func TestDatabaseOpenAndMigrate(t *testing.T) {
func TestForeignKeysEnforced(t *testing.T) {
func TestApprovalAtomicReplayPrevention(t *testing.T) {
func TestOperationJournalAndRollback(t *testing.T) {
func TestSafeCASRollbackPreservation(t *testing.T) {
func TestProjectScopedInstalls(t *testing.T) {
func TestDeleteInstall_NotFoundIsAnError(t *testing.T) {
func TestCommitInstallOperation_Transactional(t *testing.T) {
func TestListProviders_DecodesConfiguration(t *testing.T) {
func TestRecovery_ResolvesInterruptedRollback(t *testing.T) {
func approvalErrCode(err error) string {
func TestConsumeApproval_ExpiredBranch(t *testing.T) {
func TestConsumeApproval_WrongSubject(t *testing.T) {
func TestRefundApproval(t *testing.T) {
```

### internal/state/tx.go — 97 lines
```
package state
type Execer interface {
type execer = Execer
func (db *DB) WithTx(ctx context.Context, fn func(tx *sql.Tx) error) error {
func (db *DB) SaveInstallExec(ctx context.Context, ex Execer, rec *domain.InstallRecord) error {
func (db *DB) SaveInstallComponentExec(ctx context.Context, ex Execer, comp *domain.InstallComponentRecord) er
func (db *DB) SaveHostRegistrationExec(ctx context.Context, ex Execer, reg *domain.HostRegistrationRecord) err
```

## PACKAGE: internal/termguard (1 files)

### internal/termguard/termguard.go — 49 lines
```
package termguard
func init() {
func darkBackground(colorFGBG string) bool {
```

## PACKAGE: internal/trust (5 files)

### internal/trust/blob.go — 359 lines
```
package trust
const (
type BlobVerifier struct {
func (v BlobVerifier) VerifyBundle(ctx context.Context, path, bundlePath string) Verdict {
type UnavailableError struct{ Err error }
func (e *UnavailableError) Error() string {
func (e *UnavailableError) Unwrap() error {
func NewUnavailableError(err error) error { return &UnavailableError{Err: err} }
func unavailableVerification(err error) error { return NewUnavailableError(err) }
func verifySigstoreBundle(ctx context.Context, artifactPath, bundlePath, identityRegexp, issuer string) error 
func truncateDetail(detail string, max int) string {
type legacyCosignBundle struct {
const bundleV01MediaType = "application/vnd.dev.sigstore.bundle+json;version=0.1"
func loadSigstoreBundle(path string, artifactDigest []byte) (*bundle.Bundle, error) {
func legacyCosignBundleToV01(legacy legacyCosignBundle, artifactDigest []byte) ([]byte, error) {
func decodeBase64Strict(value, what string) ([]byte, error) {
```

### internal/trust/blob_test.go — 197 lines
```
package trust
func regexpMatches(pattern, s string) bool {
func TestBlobVerifierResultMatrix(t *testing.T) {
func TestDecodeBase64Strict(t *testing.T) {
func TestLegacyCosignBundleToV01RejectsIncompleteMetadata(t *testing.T) {
func TestBlobVerifierRealReleaseBundle(t *testing.T) {
func TestDefaultBlobIdentityRegexp(t *testing.T) {
```

### internal/trust/timeout.go — 12 lines
```
package trust
func withTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
```

### internal/trust/trust.go — 276 lines
```
package trust
const (
type Verdict struct {
type Verifier interface {
type CosignVerifier struct {
func (v CosignVerifier) Verify(ctx context.Context, subject, digest string) Verdict {
func SHA256Verifier(blob []byte, pinned string) Verdict {
func SBOM(l *lockfile.Lock, format string) ([]byte, error) {
func cyclonedx(l *lockfile.Lock) []byte {
func spdx(l *lockfile.Lock) []byte {
func sbomTimestamp() string {
type Advisory struct {
type AdvisoryStore struct {
func NewAdvisoryStore() *AdvisoryStore {
func (s *AdvisoryStore) Add(a Advisory) error {
func (s *AdvisoryStore) Quarantined(packageID string) (string, bool) {
func (s *AdvisoryStore) RevokeSigner(keyID string) {
func (s *AdvisoryStore) SignerRevoked(keyID string) bool { return s.revoked[keyID] }
... (1 more)
```

### internal/trust/trust_test.go — 163 lines
```
package trust
func testLock(t *testing.T) *lockfile.Lock {
func TestCosignAbsentIsUnavailable(t *testing.T) {
func TestCosignWithoutIdentityIsUnavailable(t *testing.T) {
func TestSHA256Pin(t *testing.T) {
func TestSBOMCarriesLockDigest(t *testing.T) {
func TestSBOMIsReproducible(t *testing.T) {
func TestAdvisoryQuarantine(t *testing.T) {
```

## PACKAGE: internal/update (4 files)

### internal/update/bundle_test.go — 118 lines
```
package update
type bundleMode int
const (
func bundleManifestServer(t *testing.T, mode bundleMode) *httptest.Server {
func TestCheckForUpdateCapturesSignatureBundleURL(t *testing.T) {
func TestCheckForUpdateRejectsInsecureBundleURL(t *testing.T) {
func TestCheckForUpdateWithoutBundleLeavesBundleURLsEmpty(t *testing.T) {
```

### internal/update/types.go — 25 lines
```
package update
type ReleaseInfo struct {
type UpdateStatus struct {
```

### internal/update/update_test.go — 503 lines
```
package update
type releaseFixture struct {
func newReleaseServer(t *testing.T, version string, payload []byte, opts ...func(*releaseFixture)) *httptest.S
func newTLSUpdater(srv *httptest.Server) *Updater {
func writeExecutable(t *testing.T, path string, data []byte) {
func assertNoUpdateLeftovers(t *testing.T, dir, targetPath string) {
func TestCheckForUpdateAndApplyHappyPath(t *testing.T) {
func TestCheckForUpdateRejectsHTTPManifest(t *testing.T) {
func TestCheckForUpdateRejectsInsecureAssetURL(t *testing.T) {
func TestCheckForUpdateMissingChecksumAsset(t *testing.T) {
func TestCheckForUpdateMissingChecksumEntry(t *testing.T) {
func TestCheckForUpdateRejectsDowngradeUnlessForced(t *testing.T) {
func TestCheckForUpdateBoundsManifestRead(t *testing.T) {
func TestCheckForUpdateRespectsCancelledContext(t *testing.T) {
func TestApplyUpdateChecksumMismatchLeavesTargetUntouched(t *testing.T) {
func TestApplyUpdateAppliesBootablePayloadWithCorrectChecksum(t *testing.T) {
func TestApplyUpdateFailsClosedWithoutChecksum(t *testing.T) {
func TestApplyUpdateRollsBackWhenVerificationFails(t *testing.T) {
... (6 more)
```

### internal/update/updater.go — 610 lines
```
package update
const (
type Updater struct {
func NewUpdater(manifestURL string) *Updater {
func TargetBinaryName() string {
type releaseManifest struct {
func (u *Updater) CheckForUpdate(ctx context.Context, currentVersion string) (*UpdateStatus, *ReleaseInfo, err
func (u *Updater) CheckForUpdateWithOptions(ctx context.Context, currentVersion string, force bool) (*UpdateSt
func (u *Updater) fetch(ctx context.Context, rawURL string, limit int64) ([]byte, error) {
func (u *Updater) FetchAsset(ctx context.Context, rawURL string) ([]byte, error) {
func validateHTTPSURL(raw string) error {
func parseSHA256SUMS(data []byte) map[string]string {
func (u *Updater) ApplyUpdate(ctx context.Context, newBinaryBytes []byte, expectedSHA256, targetBinaryPath, st
func (u *Updater) verifyReplaced(ctx context.Context, targetPath, expected string) error {
func writeExclusiveFile(path string, data []byte, mode os.FileMode) (err error) {
func backupTarget(targetPath, tmpDir string) (string, error) {
func swapBinary(stagedPath, targetPath, backupPath string) error {
func restoreBackup(backupPath, targetPath string) error {
... (5 more)
```

# WEB / NPM / SCRIPTS / DOCS LAYERS

## web/src/app/api/litespm/agent/[id]/route.ts — 29 lines
```
import { NextRequest, NextResponse } from "next/server";
import { buildAgentDetail } from "@/server/litespm/agents";
export const dynamic = "force-dynamic";
function safeDecode(value: string): string {
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
const detail = await buildAgentDetail(safeDecode(id));
```

## web/src/app/api/litespm/agents/route.ts — 16 lines
```
import { NextResponse } from "next/server";
import { buildAgentRows, agentStats } from "@/server/litespm/agents";
export const dynamic = "force-dynamic";
export async function GET() {
```

## web/src/app/api/litespm/assistant/route.ts — 405 lines
```
import { NextRequest, NextResponse } from "next/server";
import { chatComplete, chatCompleteStream } from "@/server/llm/gateway";
import type { AssistantRetrieval } from "@/server/litespm/assistant-retrieval";
import { knowledgeContext, knowledgeCitations, knowledgeCorpusStats, hasValidKnowledgeCitations, type Knowledg
import { assistantToolForQuestion, executeAssistantTool, isHostSetupQuestion, isRemoteHostQuestion } from "@/s
import { routeAssistantIntent, assistantSystemPrompt } from "@/server/litespm/assistant-orchestrator";
import { claimedPackageIds } from "@/server/litespm/assistant-grounding";
import { ensureInstallCommands, followUpSuggestions, installCommandFor, llmFailureMessage, packageLinkFor } fr
import { displayPackageName } from "@/lib/litespm/format";
import { resolveHost } from "@/server/litespm/hosts";
import { buildHostSetupAnswer, buildRemoteHostAnswer } from "@/server/litespm/assistant-host-answers";
import { capSummary } from "@/server/litespm/cap";
import { clientIp, globalBudget, rateLimit } from "@/server/litespm/rate-limit";
import { readJsonBody, RequestBodyTooLargeError } from "@/server/litespm/request-body";
... (69 more)
```

## web/src/app/api/litespm/bundles/route.ts — 18 lines
```
import { NextResponse } from "next/server";
import { getBundles } from "@/server/litespm/bundles";
export const dynamic = "force-dynamic";
export async function GET() {
const bundles = await getBundles();
```

## web/src/app/api/litespm/compare/route.ts — 107 lines
```
import { NextRequest, NextResponse } from "next/server";
import { getDataset } from "@/server/litespm/dataset";
import { availabilityOf } from "@/server/litespm/availability";
import { hostsNamedBy } from "@/server/litespm/identity";
import { classifyListing, GOAL_LABELS } from "@/server/litespm/taxonomy";
export const dynamic = "force-dynamic";
export interface CompareColumn {
export async function GET(request: NextRequest) {
const keysParam = request.nextUrl.searchParams.get("keys") ?? "";
const keys = keysParam
const dataset = await getDataset();
const row = dataset.byKey.get(decoded) ?? dataset.byId.get(decoded);
const availability = availabilityOf(row);
const hosts = hostsNamedBy(row);
```

## web/src/app/api/litespm/featured/route.ts — 16 lines
```
import { NextResponse } from "next/server";
import { getFeaturedShelf } from "@/server/litespm/package-detail";
export const dynamic = "force-dynamic";
export async function GET() {
const shelf = await getFeaturedShelf();
```

## web/src/app/api/litespm/feedback/route.ts — 99 lines
```
import { NextRequest, NextResponse } from "next/server";
import { db, databaseConfigured } from "@/lib/db";
import { clientIp, rateLimit } from "@/server/litespm/rate-limit";
import { readJsonBody, RequestBodyTooLargeError } from "@/server/litespm/request-body";
export const dynamic = "force-dynamic";
const KINDS = new Set(["publisher", "listing-correction", "general"]);
export async function POST(request: NextRequest) {
const limit = rateLimit(`feedback:${clientIp(request)}`, 5, 10 * 60_000);
const body = (await readJsonBody(request, 16 * 1024)) as {
const rawName = typeof body.name === "string" ? body.name.trim() : "";
const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
const rawListing = typeof body.listing === "string" ? body.listing.trim() : "";
const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
const kind = KINDS.has(body.kind ?? "") ? body.kind! : "general";
... (8 more)
```

## web/src/app/api/litespm/insights/route.ts — 16 lines
```
import { NextResponse } from "next/server";
import { getInsights } from "@/server/litespm/insights";
export const dynamic = "force-dynamic";
export async function GET() {
const insights = await getInsights();
```

## web/src/app/api/litespm/installed/route.ts — 37 lines
```
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
const execFileAsync = promisify(execFile);
export const dynamic = "force-dynamic";
export async function GET() {
const bin = process.env.LITESPM_BIN?.trim() || "litespm";
const report = JSON.parse(stdout) as unknown;
```

## web/src/app/api/litespm/list/route.ts — 58 lines
```
import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit, tooManyRequests } from "@/server/litespm/rate-limit";
import { searchCatalog, type SortKey } from "@/server/litespm/search";
export const dynamic = "force-dynamic";
const SORTS: SortKey[] = ["relevance", "rank", "name", "kind", "publisher"];
function field(params: URLSearchParams, name: string, max = 120): string | undefined {
const value = params.get(name);
export async function GET(request: NextRequest) {
const limit = rateLimit(`list:${clientIp(request)}`, 240, 60_000);
const params = request.nextUrl.searchParams;
const sortParam = params.get("sort");
const facetsParam = params.get("facets");
const response = await searchCatalog({
```

## web/src/app/api/litespm/llm/route.ts — 42 lines
```
import { NextRequest, NextResponse } from "next/server";
import { getLlmStatus } from "@/server/llm/gateway";
import { clientIp, rateLimit } from "@/server/litespm/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
const limit = rateLimit(`llm-status:${clientIp(request)}`, 30, 60_000);
const status = getLlmStatus();
const keyed = status.credentials.filter((credential) => credential.keyIndex !== null);
const keyless = status.credentials.filter((credential) => credential.keyIndex === null);
const keyIds = new Set(keyed.map((credential) => `${credential.provider}#${credential.keyIndex}`));
const keylessAdapters = new Set(keyless.map((credential) => credential.provider));
```

## web/src/app/api/litespm/package/[key]/raw/route.ts — 61 lines
```
import { NextRequest, NextResponse } from "next/server";
import { getPackageDetail } from "@/server/litespm/package-detail";
import { displayPackageName } from "@/lib/litespm/format";
export const dynamic = "force-dynamic";
interface Props {
export async function GET(request: NextRequest, { params }: Props) {
const detail = await getPackageDetail(decodeURIComponent(key));
const p = detail.detail;
const name = displayPackageName(p.name);
const installCmd = `litespm install ${p.id}`;
const markdown = `# ${name}
```

## web/src/app/api/litespm/package/[key]/route.ts — 28 lines
```
import { NextRequest, NextResponse } from "next/server";
import { getPackageDetail } from "@/server/litespm/package-detail";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, ctx: { params: Promise<{ key: string }> }) {
const response = await getPackageDetail(key);
```

## web/src/app/api/litespm/search-catalog/route.ts — 17 lines
```
import { NextResponse } from "next/server";
import { buildCompactDataset } from "@/server/litespm/dataset";
export const dynamic = "force-dynamic";
export async function GET() {
```

## web/src/app/api/litespm/search-index/route.ts — 25 lines
```
import { NextResponse } from "next/server";
import { getDataset } from "@/server/litespm/dataset";
import { getSearchIndex, serializeSearchIndex } from "@/server/litespm/bm25";
export const dynamic = "force-dynamic";
export async function GET() {
const dataset = await getDataset();
const index = getSearchIndex(dataset.rows, dataset.release.releaseId);
```

## web/src/app/api/litespm/source/[key]/route.ts — 25 lines
```
import { NextRequest, NextResponse } from "next/server";
import { getSourceDocs } from "@/server/litespm/source-docs";
export const dynamic = "force-dynamic";
export async function GET(_request: NextRequest, ctx: { params: Promise<{ key: string }> }) {
const response = await getSourceDocs(key);
const cacheControl = response.found
```

## web/src/app/api/litespm/stats/route.ts — 16 lines
```
import { NextResponse } from "next/server";
import { catalogStats } from "@/server/litespm/search";
export const dynamic = "force-dynamic";
export async function GET() {
const stats = await catalogStats();
```

## web/src/app/api/litespm/trending/route.ts — 50 lines
```
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { availabilityOf } from "@/server/litespm/availability";
import { getDataset } from "@/server/litespm/dataset";
export const dynamic = "force-dynamic";
export async function GET() {
const top = await db.packageView.findMany({
const dataset = await getDataset();
const items = top
const row = dataset.byKey.get(view.linkKey) ?? dataset.byId.get(view.linkKey);
```

## web/src/app/api/litespm/view/route.ts — 66 lines
```
import { NextRequest, NextResponse } from "next/server";
import { db, databaseConfigured } from "@/lib/db";
import { clientIp, rateLimit } from "@/server/litespm/rate-limit";
import { readJsonBody, RequestBodyTooLargeError } from "@/server/litespm/request-body";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
const ip = clientIp(request);
const limit = rateLimit(`view:${ip}`, 120, 60_000);
const body = (await readJsonBody(request, 8_192)) as { linkKey?: string; kind?: string; name?: string };
const linkKey = body.linkKey?.trim();
const kind = ["mcp", "skill", "plugin"].includes(body.kind ?? "") ? body.kind! : "mcp";
const name = (body.name?.trim() || linkKey).slice(0, 200);
const existing = await db.packageView.findUnique({ where: { linkKey } });
```

## web/src/app/error.tsx — 52 lines
```
import Link from "next/link";
import { useEffect } from "react";
export default function ErrorBoundary({
```

## web/src/app/global-error.tsx — 56 lines
```
import { useEffect } from "react";
import "./globals.css";
export default function GlobalError({
```

## web/src/app/globals.css — 393 lines
```
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

```

## web/src/app/layout.tsx — 82 lines
```
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import facts from "@/lib/litespm/site-facts.json";
const LISTINGS = `${Math.floor(facts.listings / 1000)}k+`;
const SHARE_DESCRIPTION = `Search ${LISTINGS} MCP servers, skills and plugins, and install them into ${facts.h
const geistSans = Geist({
const geistMono = Geist_Mono({
export const metadata: Metadata = {
export default function RootLayout({
```

## web/src/app/not-found.tsx — 21 lines
```
import Link from "next/link";
export default function NotFound() {
```

## web/src/app/opengraph-image.tsx — 84 lines
```
import { ImageResponse } from "next/og";
import facts from "@/lib/litespm/site-facts.json";
export const alt = "LiteSPM — The package manager for AI agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
const SITE_HOST = "lite-spm-nine.vercel.app";
export default function OpengraphImage() {
const listings = `${Math.floor(facts.listings / 1000)}k+`;
```

## web/src/app/page.tsx — 8 lines
```
import { LiteSPMApp } from "@/components/litespm/app";
export default function Page() {
```

## web/src/app/robots.ts — 15 lines
```
import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
const baseUrl = "https://lite-spm-nine.vercel.app";
```

## web/src/app/sitemap.ts — 128 lines
```
import type { MetadataRoute } from "next";
import { availabilityOf } from "@/server/litespm/availability";
import { getDataset } from "@/server/litespm/dataset";
const SITE_ORIGIN = "https://lite-spm-nine.vercel.app";
const DOC_SECTIONS = [
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
const baseUrl = SITE_ORIGIN;
const ds = await getDataset();
const dataset = await getDataset();
const topPackages = dataset.rows
```

## web/src/app/[...slug]/page.tsx — 281 lines
```
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { LiteSPMApp } from "@/components/litespm/app";
import { parsePath } from "@/lib/litespm/route";
import { displayPackageName } from "@/lib/litespm/format";
import facts from "@/lib/litespm/site-facts.json";
import type { PackageDetailData } from "@/lib/litespm/types";
import { getPackageDetail } from "@/server/litespm/package-detail";
import { HOSTS } from "@/server/litespm/hosts";
interface Props {
const ORIGIN = "https://lite-spm-nine.vercel.app";
const KNOWN_SECTIONS = new Set([
const packageDetail = cache((key: string) => getPackageDetail(key));
... (22 more)
```

## web/src/components/litespm/app.tsx — 272 lines
```
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig, motion } from "framer-motion";
import { GitCompareArrows, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useApp, compareHash, type Route } from "@/lib/litespm/router";
import type { PackageDetailData } from "@/lib/litespm/types";
import { Header, AnnouncementBar } from "./header";
import { Footer } from "./footer";
import { HomeView } from "./views/home";
import { MarketplaceView } from "./views/marketplace";
import { DocsView } from "./views/docs";
const viewLoading = () => <div className="min-h-[60vh]" aria-busy="true" />;
const PackageView = dynamic(() => import("./views/package-detail").then((m) => m.PackageView), { loading: view
... (28 more)
```

## web/src/components/litespm/assistant.tsx — 1563 lines
```
import * as React from "react";
import { createPortal } from "react-dom";
import {
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { useWatchlist } from "@/lib/litespm/hooks";
import { displayPackageName } from "@/lib/litespm/format";
import type { AssistantCitation, AssistantMeta, CompareColumn, PackageDetailData } from "@/lib/litespm/types";
import { AvailabilityBadge, KindBadge } from "./primitives";
import { InstallBar } from "./install-bar";
interface AssistantSource {
interface ChatMessage {
type StreamEvent =
... (94 more)
```

## web/src/components/litespm/brand-mark.tsx — 62 lines
```
import * as React from "react";
import brandLogos from "@/../data/brand-logos.json";
const LOGOS = brandLogos as Record<string, { src: string; aspect: number; square: boolean }>;
export function BrandMark({
const logo = React.useMemo(() => {
const key = id.trim().toLowerCase();
const dims =
const initial = name.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "A";
```

## web/src/components/litespm/code-block.tsx — 102 lines
```
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
export function CopyButton({
const copy = React.useCallback(async () => {
const area = document.createElement("textarea");
export function CodeBlock({
```

## web/src/components/litespm/command-palette.tsx — 390 lines
```
import * as React from "react";
import { createPortal } from "react-dom";
import {
import { useApp, exploreHash } from "@/lib/litespm/router";
import { useDebounced } from "@/lib/litespm/hooks";
import { displayPackageName } from "@/lib/litespm/format";
import type { CatalogListResponse } from "@/lib/litespm/types";
import facts from "@/lib/litespm/site-facts.json";
import { KindBadge } from "./primitives";
const TEXT_FIELD_TAGS = ["INPUT", "TEXTAREA", "SELECT"];
const PAGES = [
function fuzzyScore(query: string, text: string): number {
const q = query.trim().toLowerCase();
const t = text.toLowerCase();
... (29 more)
```

## web/src/components/litespm/footer.tsx — 149 lines
```
import { ArrowUpRight, Github, Heart } from "lucide-react";
import { useApp } from "@/lib/litespm/router";
import { useWatchlist } from "@/lib/litespm/hooks";
import { LogoMark } from "./logo";
import { NavLink } from "./nav-link";
const COLUMNS: Array<{
export function Footer() {
const navigate = useApp((s) => s.navigate);
```

## web/src/components/litespm/header.tsx — 301 lines
```
import * as React from "react";
import { useTheme } from "next-themes";
import { Github, Menu, Moon, Search, Sparkles, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApp, type Route } from "@/lib/litespm/router";
import type { CatalogStatsResponse } from "@/lib/litespm/types";
import { formatFull } from "@/lib/litespm/format";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";
const NAV: Array<{ label: string; hash: string; match: Route["view"][] }> = [
export function AnnouncementBar() {
const cached = window.sessionStorage.getItem("litespm-stats-cache");
const handleDismiss = () => {
... (10 more)
```

## web/src/components/litespm/install-bar.tsx — 81 lines
```
import * as React from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
export function InstallBar({
const copy = React.useCallback(async () => {
const area = document.createElement("textarea");
```

## web/src/components/litespm/logo.tsx — 47 lines
```
import { cn } from "@/lib/utils";
export function LogoMark({ className }: { className?: string }) {
export function Logo({ className }: { className?: string }) {
```

## web/src/components/litespm/nav-link.tsx — 44 lines
```
import * as React from "react";
import { toPath, useApp } from "@/lib/litespm/router";
export const NavLink = React.forwardRef<
const navigate = useApp((s) => s.navigate);
```

## web/src/components/litespm/package-card.tsx — 201 lines
```
import * as React from "react";
import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck, Check, Copy, GitCompareArrows, Github, ShieldCheck, Star } from "lucide-reac
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/litespm/router";
import { displayPackageName, formatFull, formatCompact } from "@/lib/litespm/format";
import { useWatchlist } from "@/lib/litespm/hooks";
import type { CatalogHit } from "@/lib/litespm/types";
import { shellArg } from "@/lib/litespm/shell";
import { NavLink } from "./nav-link";
import { AvailabilityBadge, KindBadge } from "./primitives";
import { RankBadge } from "./rank-badge";
export function PackageCard({
const compareKeys = useApp((s) => s.compareKeys);
... (6 more)
```

## web/src/components/litespm/primitives.tsx — 241 lines
```
import * as React from "react";
import { cn } from "@/lib/utils";
import { formatFull } from "@/lib/litespm/format";
export function KindBadge({ kind, className }: { kind: string; className?: string }) {
export function AvailabilityBadge({
export function SectionHeading({
export function Stat({
export function FilterPill({
export function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
export function InsightBarRow({
const width = max === 0 ? 0 : Math.max(1.5, (value / max) * 100);
const subWidth = sub !== undefined && max > 0 ? Math.max(0, (sub / max) * 100) : null;
const content = (
```

## web/src/components/litespm/rank-badge.tsx — 177 lines
```
import * as React from "react";
import { CheckCircle2, Gauge, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { RANK_TIER_META, RANK_EXPLAINER, rankTierOf } from "@/lib/litespm/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PackageDetailData } from "@/lib/litespm/types";
export interface RankBadgeProps {
export function RankBadge({
const tier = rankTierOf(score);
const meta = tier ? RANK_TIER_META[tier] : RANK_TIER_META.solid;
const badgeElement = (
export function RankExplainer({ className }: { className?: string }) {
```

## web/src/components/litespm/target-agent-picker.tsx — 112 lines
```
import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
export function TargetAgentPicker({
const selected = targets.find((t) => t.id === value) ?? targets[0];
const saved = window.localStorage.getItem("litespm_preferred_agent");
```

## web/src/components/litespm/terminal.tsx — 302 lines
```
import * as React from "react";
import { motion } from "framer-motion";
import { Check, Copy, RotateCcw, Terminal } from "lucide-react";
export type ScenarioId = "mcp" | "skills" | "restore";
interface ScriptLine {
const SCENARIOS: Record<
const LINE_STYLES: Record<ScriptLine["kind"], string> = {
export function TerminalHero({
const activeScenario = SCENARIOS[scenario];
const lines = activeScenario.lines;
const timer = setTimeout(() => {
const reduced =
const runLine = (index: number) => {
const line = lines[index];
... (5 more)
```

## web/src/components/litespm/views/agent-detail.tsx — 541 lines
```
import * as React from "react";
import {
import { Button } from "@/components/ui/button";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { formatFull } from "@/lib/litespm/format";
import type { AgentDetailData } from "@/lib/litespm/types";
import { inAgentFor, inAgentNoneFor, EVIDENCE_LABEL } from "@/lib/litespm/in-agent";
import { BrandMark } from "../brand-mark";
import { CodeBlock } from "../code-block";
import { InstallBar } from "../install-bar";
import { FactRow, KindBadge, Stat } from "../primitives";
export function AgentDetailView({ id }: { id: string }) {
const navigate = useApp((s) => s.navigate);
const ua = navigator.userAgent;
... (6 more)
```

## web/src/components/litespm/views/agents.tsx — 709 lines
```
import * as React from "react";
import { motion } from "framer-motion";
import {
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { formatFull } from "@/lib/litespm/format";
import facts from "@/lib/litespm/site-facts.json";
import type { AgentRow, AgentStats } from "@/lib/litespm/types";
import { BrandMark } from "../brand-mark";
type AgentFilter = "all" | "configured" | "skills";
const FILTERS: { id: AgentFilter; label: string }[] = [
const VIEW_STORAGE_KEY = "litespm:agents-view";
function initialGridView(): boolean {
... (21 more)
```

## web/src/components/litespm/views/bundles.tsx — 365 lines
```
import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Copy, Info, Key, Layers, Loader2, Sparkles, Terminal, Wrench } from "lucide-react"
import {
import { cn } from "@/lib/utils";
import { displayPackageName } from "@/lib/litespm/format";
import { shellArg } from "@/lib/litespm/shell";
import type { BundleData, BundleDifficulty, BundlesResponse } from "@/lib/litespm/types";
import { KindBadge } from "../primitives";
import { NavLink } from "../nav-link";
import { TargetAgentPicker } from "../target-agent-picker";
const DIFFICULTY_STYLE: Record<BundleDifficulty, string> = {
const DIFFICULTIES: BundleDifficulty[] = ["Beginner", "Intermediate", "Advanced"];
const ANY_AGENT = { id: "", name: "Any agent (CLI asks)" };
... (12 more)
```

## web/src/components/litespm/views/catalog-browser.tsx — 589 lines
```
import * as React from "react";
import {
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
import { cn } from "@/lib/utils";
import {
import { useDebounced } from "@/lib/litespm/hooks";
import { formatFull } from "@/lib/litespm/format";
import type { CatalogFacets, CatalogListResponse } from "@/lib/litespm/types";
import { NavLink } from "../nav-link";
import { PackageCard } from "../package-card";
import { FilterPill } from "../primitives";
import { RankExplainer } from "../rank-badge";
... (26 more)
```

## web/src/components/litespm/views/compare.tsx — 428 lines
```
import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, GitCompareArrows, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { displayPackageName } from "@/lib/litespm/format";
import type { CatalogListResponse, CompareColumn } from "@/lib/litespm/types";
import { InstallBar } from "../install-bar";
import { AvailabilityBadge, KindBadge } from "../primitives";
import { RankBadge } from "../rank-badge";
const SEARCHABLE_COUNT = 6;
export function CompareView({ keys }: { keys: string[] }) {
const navigate = useApp((s) => s.navigate);
const compareKeys = useApp((s) => s.compareKeys);
... (10 more)
```

## web/src/components/litespm/views/docs.tsx — 1067 lines
```
import * as React from "react";
import { ArrowRight, BookOpen, Cable, Layers, CheckCircle2, CircleDot, HelpCircle, Lock, Package, RotateCcw, S
import { cn } from "@/lib/utils";
import { formatFull } from "@/lib/litespm/format";
import { CodeBlock } from "../code-block";
import { InstallBar } from "../install-bar";
import { NavLink } from "../nav-link";
import facts from "@/lib/litespm/site-facts.json";
import { EVIDENCE_LABEL, IN_AGENT, type InAgentEntry } from "@/lib/litespm/in-agent";
import type { CatalogStatsResponse } from "@/lib/litespm/types";
const SECTIONS: Array<{ id: string; label: string; icon: React.ElementType }> = [
type CommandGroup = "Discover" | "View" | "Install & manage" | "Connect" | "Recover" | "System";
const COMMANDS: Array<{ cmd: string; description: string; example?: string; group: CommandGroup }> = [
const INSTALL_FLAGS = [
... (32 more)
```

## web/src/components/litespm/views/home.tsx — 1073 lines
```
import * as React from "react";
import { motion } from "framer-motion";
import {
import { Button } from "@/components/ui/button";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { formatFull, formatDate, displayPackageName } from "@/lib/litespm/format";
import { useRecentlyViewed } from "@/lib/litespm/hooks";
import type {
import facts from "@/lib/litespm/site-facts.json";
import { IN_AGENT } from "@/lib/litespm/in-agent";
import { InstallBar } from "../install-bar";
import { NavLink } from "../nav-link";
import { TerminalHero } from "../terminal";
import { KindBadge, SectionHeading } from "../primitives";
... (19 more)
```

## web/src/components/litespm/views/insights.tsx — 345 lines
```
import * as React from "react";
import { motion } from "framer-motion";
import { Activity, BarChart3, CheckCircle2, Database, GitBranch, Layers, Loader2, PackageSearch, ShieldCheck, 
import { useApp } from "@/lib/litespm/router";
import { formatFull, formatDate } from "@/lib/litespm/format";
import type { InsightsResponse } from "@/lib/litespm/types";
import { FactRow, InsightBarRow, SectionHeading, Stat } from "../primitives";
export function InsightsView() {
const navigate = useApp((s) => s.navigate);
const t = data.totals;
const installShare = t.unique === 0 ? 0 : t.installable / t.unique;
function ChartCard({
function installabilityLabelPretty(value: string): string {
```

## web/src/components/litespm/views/marketplace.tsx — 342 lines
```
import * as React from "react";
import { Check, Copy, Loader2, RefreshCw, Search, Terminal } from "lucide-react";
import { exploreHash, kindForTab, type ExploreQuery, type MarketplaceTab } from "@/lib/litespm/router";
import { displayPackageName } from "@/lib/litespm/format";
import { cn } from "@/lib/utils";
import { NavLink } from "../nav-link";
import { CatalogBrowser } from "./catalog-browser";
interface InstalledRecord {
interface InstalledReport {
function copyText(text: string): Promise<void> {
function InstallCommand({ command }: { command: string }) {
function InstalledTab() {
const records = state.report.records ?? [];
const kinds = [...new Set(records.map((r) => r.kind))].sort();
... (8 more)
```

## web/src/components/litespm/views/package-detail.tsx — 1110 lines
```
import * as React from "react";
import {
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { recordView, useWatchlist } from "@/lib/litespm/hooks";
import { shellArg } from "@/lib/litespm/shell";
import {
import type { PackageDetailResponse, PackageDetailData } from "@/lib/litespm/types";
import { CopyButton } from "../code-block";
import { InstallBar } from "../install-bar";
import { AvailabilityBadge, FactRow, KindBadge } from "../primitives";
import { RankBadge, RankExplainer } from "../rank-badge";
import { TargetAgentPicker } from "../target-agent-picker";
... (35 more)
```

## web/src/components/litespm/views/package-install.tsx — 380 lines
```
import * as React from "react";
import { AlertTriangle, ChevronDown, ExternalLink, Terminal, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shellArg } from "@/lib/litespm/shell";
import type { PackageDetailData } from "@/lib/litespm/types";
import { CopyButton } from "../code-block";
import { InstallBar } from "../install-bar";
import { TargetAgentPicker } from "../target-agent-picker";
function repoSlug(url: string): string {
const clean = url
const parts = clean.split("/");
function cleanGitRepoUrl(url: string): string {
const githubMatch = /^(https:\/\/(?:www\.)?github\.com\/[^/]+\/[^/]+)/i.exec(url);
const gitlabMatch = /^(https:\/\/(?:www\.)?gitlab\.com\/[^/]+\/[^/]+)/i.exec(url);
... (19 more)
```

## web/src/components/litespm/views/package-source-docs.tsx — 449 lines
```
import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { ExternalLink, FileText, Github } from "lucide-react";
import type { SourceDocsLocation, SourceDocsResponse } from "@/lib/litespm/source-docs-types";
import { CopyButton } from "../code-block";
export type SourceDocsState =
export function useSourceDocs(linkKey: string): SourceDocsState {
const IMAGE_HOSTS = new Set([
function isAllowedImage(url: URL): boolean {
function docDir(source: SourceDocsLocation): string {
function enc(path: string): string {
function resolveTarget(
const value = raw.trim();
const u = new URL(value);
... (43 more)
```

## web/src/components/litespm/views/publish.tsx — 340 lines
```
import * as React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, GitBranch, Loader2, MessageSquare, Package, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
import { useApp } from "@/lib/litespm/router";
const KINDS = [
const STANDARDS = [
export function PublishView() {
const navigate = useApp((s) => s.navigate);
const submit = async (e: React.FormEvent) => {
... (2 more)
```

## web/src/components/ui/accordion.tsx — 67 lines
```
import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"
function Accordion({
function AccordionItem({
function AccordionTrigger({
function AccordionContent({
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
```

## web/src/components/ui/alert-dialog.tsx — 158 lines
```
import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
function AlertDialog({
function AlertDialogTrigger({
function AlertDialogPortal({
function AlertDialogOverlay({
function AlertDialogContent({
function AlertDialogHeader({
function AlertDialogFooter({
function AlertDialogTitle({
function AlertDialogDescription({
function AlertDialogAction({
... (2 more)
```

## web/src/components/ui/alert.tsx — 67 lines
```
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
const alertVariants = cva(
function Alert({
function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
function AlertDescription({
export { Alert, AlertTitle, AlertDescription }
```

## web/src/components/ui/aspect-ratio.tsx — 12 lines
```
import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio"
function AspectRatio({
export { AspectRatio }
```

## web/src/components/ui/avatar.tsx — 54 lines
```
import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { cn } from "@/lib/utils"
function Avatar({
function AvatarImage({
function AvatarFallback({
export { Avatar, AvatarImage, AvatarFallback }
```

## web/src/components/ui/badge.tsx — 47 lines
```
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
const badgeVariants = cva(
function Badge({
const Comp = asChild ? Slot : "span"
export { Badge, badgeVariants }
```

## web/src/components/ui/breadcrumb.tsx — 110 lines
```
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { ChevronRight, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
function Breadcrumb({ ...props }: React.ComponentProps<"nav">) {
function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
function BreadcrumbLink({
const Comp = asChild ? Slot : "a"
function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
function BreadcrumbSeparator({
function BreadcrumbEllipsis({
export {
```

## web/src/components/ui/button.tsx — 60 lines
```
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
const buttonVariants = cva(
function Button({
const Comp = asChild ? Slot : "button"
export { Button, buttonVariants }
```

## web/src/components/ui/calendar.tsx — 214 lines
```
import * as React from "react"
import {
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"
import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
function Calendar({
const defaultClassNames = getDefaultClassNames()
function CalendarDayButton({
const defaultClassNames = getDefaultClassNames()
const ref = React.useRef<HTMLButtonElement>(null)
export { Calendar, CalendarDayButton }
```

## web/src/components/ui/card.tsx — 93 lines
```
import * as React from "react"
import { cn } from "@/lib/utils"
function Card({ className, ...props }: React.ComponentProps<"div">) {
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
export {
```

## web/src/components/ui/carousel.tsx — 242 lines
```
import * as React from "react"
import useEmblaCarousel, {
import { ArrowLeft, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]
type CarouselProps = {
type CarouselContextProps = {
const CarouselContext = React.createContext<CarouselContextProps | null>(null)
function useCarousel() {
const context = React.useContext(CarouselContext)
... (10 more)
```

## web/src/components/ui/chart.tsx — 354 lines
```
import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "@/lib/utils"
const THEMES = { light: "", dark: ".dark" } as const
export type ChartConfig = {
type ChartContextProps = {
const ChartContext = React.createContext<ChartContextProps | null>(null)
function useChart() {
const context = React.useContext(ChartContext)
function ChartContainer({
const uniqueId = React.useId()
const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`
const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
const colorConfig = Object.entries(config).filter(
... (18 more)
```

## web/src/components/ui/checkbox.tsx — 33 lines
```
import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"
function Checkbox({
export { Checkbox }
```

## web/src/components/ui/collapsible.tsx — 34 lines
```
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
function Collapsible({
function CollapsibleTrigger({
function CollapsibleContent({
export { Collapsible, CollapsibleTrigger, CollapsibleContent }
```

## web/src/components/ui/command.tsx — 185 lines
```
import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
function Command({
function CommandDialog({
function CommandInput({
function CommandList({
function CommandEmpty({
function CommandGroup({
function CommandSeparator({
function CommandItem({
function CommandShortcut({
... (1 more)
```

## web/src/components/ui/context-menu.tsx — 253 lines
```
import * as React from "react"
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
function ContextMenu({
function ContextMenuTrigger({
function ContextMenuGroup({
function ContextMenuPortal({
function ContextMenuSub({
function ContextMenuRadioGroup({
function ContextMenuSubTrigger({
function ContextMenuSubContent({
function ContextMenuContent({
function ContextMenuItem({
... (6 more)
```

## web/src/components/ui/dialog.tsx — 144 lines
```
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
function Dialog({
function DialogTrigger({
function DialogPortal({
function DialogClose({
function DialogOverlay({
function DialogContent({
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
function DialogTitle({
function DialogDescription({
... (1 more)
```

## web/src/components/ui/drawer.tsx — 136 lines
```
import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"
import { cn } from "@/lib/utils"
function Drawer({
function DrawerTrigger({
function DrawerPortal({
function DrawerClose({
function DrawerOverlay({
function DrawerContent({
function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
function DrawerTitle({
function DrawerDescription({
export {
```

## web/src/components/ui/dropdown-menu.tsx — 258 lines
```
import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
function DropdownMenu({
function DropdownMenuPortal({
function DropdownMenuTrigger({
function DropdownMenuContent({
function DropdownMenuGroup({
function DropdownMenuItem({
function DropdownMenuCheckboxItem({
function DropdownMenuRadioGroup({
function DropdownMenuRadioItem({
function DropdownMenuLabel({
... (6 more)
```

## web/src/components/ui/form.tsx — 168 lines
```
import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"
import {
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
const Form = FormProvider
type FormFieldContextValue<
const FormFieldContext = React.createContext<FormFieldContextValue>(
const FormField = <
const useFormField = () => {
const fieldContext = React.useContext(FormFieldContext)
const itemContext = React.useContext(FormItemContext)
const formState = useFormState({ name: fieldContext.name })
... (11 more)
```

## web/src/components/ui/hover-card.tsx — 45 lines
```
import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"
import { cn } from "@/lib/utils"
function HoverCard({
function HoverCardTrigger({
function HoverCardContent({
export { HoverCard, HoverCardTrigger, HoverCardContent }
```

## web/src/components/ui/input-otp.tsx — 78 lines
```
import * as React from "react"
import { OTPInput, OTPInputContext } from "input-otp"
import { MinusIcon } from "lucide-react"
import { cn } from "@/lib/utils"
function InputOTP({
function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
function InputOTPSlot({
const inputOTPContext = React.useContext(OTPInputContext)
function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
```

## web/src/components/ui/input.tsx — 22 lines
```
import * as React from "react"
import { cn } from "@/lib/utils"
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
export { Input }
```

## web/src/components/ui/label.tsx — 25 lines
```
import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cn } from "@/lib/utils"
function Label({
export { Label }
```

## web/src/components/ui/menubar.tsx — 277 lines
```
import * as React from "react"
import * as MenubarPrimitive from "@radix-ui/react-menubar"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
function Menubar({
function MenubarMenu({
function MenubarGroup({
function MenubarPortal({
function MenubarRadioGroup({
function MenubarTrigger({
function MenubarContent({
function MenubarItem({
function MenubarCheckboxItem({
function MenubarRadioItem({
... (7 more)
```

## web/src/components/ui/navigation-menu.tsx — 169 lines
```
import * as React from "react"
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu"
import { cva } from "class-variance-authority"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"
function NavigationMenu({
function NavigationMenuList({
function NavigationMenuItem({
const navigationMenuTriggerStyle = cva(
function NavigationMenuTrigger({
function NavigationMenuContent({
function NavigationMenuViewport({
function NavigationMenuLink({
function NavigationMenuIndicator({
... (1 more)
```

## web/src/components/ui/pagination.tsx — 128 lines
```
import * as React from "react"
import {
import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
function PaginationContent({
function PaginationItem({ ...props }: React.ComponentProps<"li">) {
type PaginationLinkProps = {
function PaginationLink({
function PaginationPrevious({
function PaginationNext({
function PaginationEllipsis({
export {
```

## web/src/components/ui/popover.tsx — 49 lines
```
import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { cn } from "@/lib/utils"
function Popover({
function PopoverTrigger({
function PopoverContent({
function PopoverAnchor({
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
```

## web/src/components/ui/progress.tsx — 32 lines
```
import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cn } from "@/lib/utils"
function Progress({
export { Progress }
```

## web/src/components/ui/radio-group.tsx — 46 lines
```
import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { CircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
function RadioGroup({
function RadioGroupItem({
export { RadioGroup, RadioGroupItem }
```

## web/src/components/ui/resizable.tsx — 57 lines
```
import * as React from "react"
import { GripVerticalIcon } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"
import { cn } from "@/lib/utils"
function ResizablePanelGroup({
function ResizablePanel({
function ResizableHandle({
export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
```

## web/src/components/ui/scroll-area.tsx — 59 lines
```
import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import { cn } from "@/lib/utils"
function ScrollArea({
function ScrollBar({
export { ScrollArea, ScrollBar }
```

## web/src/components/ui/select.tsx — 186 lines
```
import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { cn } from "@/lib/utils"
function Select({
function SelectGroup({
function SelectValue({
function SelectTrigger({
function SelectContent({
function SelectLabel({
function SelectItem({
function SelectSeparator({
function SelectScrollUpButton({
function SelectScrollDownButton({
... (1 more)
```

## web/src/components/ui/separator.tsx — 29 lines
```
import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"
import { cn } from "@/lib/utils"
function Separator({
export { Separator }
```

## web/src/components/ui/sheet.tsx — 140 lines
```
import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
function SheetTrigger({
function SheetClose({
function SheetPortal({
function SheetOverlay({
function SheetContent({
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
function SheetTitle({
function SheetDescription({
... (1 more)
```

## web/src/components/ui/sidebar.tsx — 727 lines
```
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, VariantProps } from "class-variance-authority"
import { PanelLeftIcon } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
import { Skeleton } from "@/components/ui/skeleton"
import {
const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
... (48 more)
```

## web/src/components/ui/skeleton.tsx — 14 lines
```
import { cn } from "@/lib/utils"
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
export { Skeleton }
```

## web/src/components/ui/slider.tsx — 64 lines
```
import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "@/lib/utils"
function Slider({
const _values = React.useMemo(
export { Slider }
```

## web/src/components/ui/sonner.tsx — 26 lines
```
import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"
const Toaster = ({ ...props }: ToasterProps) => {
export { Toaster }
```

## web/src/components/ui/switch.tsx — 32 lines
```
import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"
function Switch({
export { Switch }
```

## web/src/components/ui/table.tsx — 117 lines
```
import * as React from "react"
import { cn } from "@/lib/utils"
function Table({ className, ...props }: React.ComponentProps<"table">) {
function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
function TableCell({ className, ...props }: React.ComponentProps<"td">) {
function TableCaption({
export {
```

## web/src/components/ui/tabs.tsx — 67 lines
```
import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"
function Tabs({
function TabsList({
function TabsTrigger({
function TabsContent({
export { Tabs, TabsList, TabsTrigger, TabsContent }
```

## web/src/components/ui/textarea.tsx — 19 lines
```
import * as React from "react"
import { cn } from "@/lib/utils"
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
export { Textarea }
```

## web/src/components/ui/toast.tsx — 129 lines
```
import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
const ToastProvider = ToastPrimitives.Provider
const ToastViewport = React.forwardRef<
const toastVariants = cva(
const Toast = React.forwardRef<
const ToastAction = React.forwardRef<
const ToastClose = React.forwardRef<
const ToastTitle = React.forwardRef<
const ToastDescription = React.forwardRef<
type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>
... (2 more)
```

## web/src/components/ui/toaster.tsx — 35 lines
```
import { useToast } from "@/hooks/use-toast"
import {
export function Toaster() {
```

## web/src/components/ui/toggle-group.tsx — 74 lines
```
import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { toggleVariants } from "@/components/ui/toggle"
const ToggleGroupContext = React.createContext<
function ToggleGroup({
function ToggleGroupItem({
const context = React.useContext(ToggleGroupContext)
export { ToggleGroup, ToggleGroupItem }
```

## web/src/components/ui/toggle.tsx — 48 lines
```
import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
const toggleVariants = cva(
function Toggle({
export { Toggle, toggleVariants }
```

## web/src/components/ui/tooltip.tsx — 62 lines
```
import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"
function TooltipProvider({
function Tooltip({
function TooltipTrigger({
function TooltipContent({
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
```

## web/src/hooks/use-mobile.ts — 20 lines
```
import * as React from "react"
const MOBILE_BREAKPOINT = 768
export function useIsMobile() {
const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
const onChange = () => {
```

## web/src/hooks/use-toast.ts — 194 lines
```
import * as React from "react"
import type {
const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000
type ToasterToast = ToastProps & {
const actionTypes = {
function genId() {
type ActionType = typeof actionTypes
type Action =
interface State {
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const addToRemoveQueue = (toastId: string) => {
const timeout = setTimeout(() => {
export const reducer = (state: State, action: Action): State => {
... (10 more)
```

## web/src/lib/db.ts — 49 lines
```
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
const globalForPrisma = globalThis as unknown as {
function createPrismaClient(): PrismaClient {
const dbUrl = process.env.DATABASE_URL?.trim() || "";
const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
const url = tursoUrl || (dbUrl.startsWith("libsql://") || dbUrl.startsWith("https://") ? dbUrl : "");
const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
const adapter = new PrismaLibSql({ url, authToken });
export function databaseConfigured(): boolean {
const dbUrl = process.env.DATABASE_URL?.trim() || "";
const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
export const db = globalForPrisma.prisma ?? createPrismaClient();
```

## web/src/lib/litespm/format.ts — 118 lines
```
export function formatCompact(n: number): string {
const v = n / 1_000_000;
const v = n / 1_000;
export function formatFull(n: number): string {
export function formatDate(iso: string): string {
export function installabilityLabel(value: string | undefined): string {
export function kindLabel(kind: string): string {
export function kindColor(kind: string): string {
const ACRONYMS: Record<string, string> = {
const GENERIC_NAME = /^(mcp|mcp[-_ ]?server|server|remote[-_ ]?mcp|api|official)$/i;
function brandOf(namespace: string): string {
const parts = namespace.split(".").filter((p) => !/^(com|io|ai|dev|net|org|app|co|mcp|github|www)$/i.test(p));
const word = parts[0] ?? namespace;
export function displayPackageName(name: string): string {
... (7 more)
```

## web/src/lib/litespm/hooks.ts — 119 lines
```
import * as React from "react";
import type { CatalogHit } from "./types";
export interface WatchEntry {
const WATCH_KEY = "litespm:watchlist";
const RECENT_KEY = "litespm:recent";
function readList(key: string): WatchEntry[] {
const raw = window.localStorage.getItem(key);
const parsed = JSON.parse(raw) as WatchEntry[];
function writeList(key: string, list: WatchEntry[]) {
export function useWatchlist() {
const onStorage = (e: StorageEvent) => {
const isWatched = React.useCallback(
const toggle = React.useCallback((hit: { linkKey: string; name: string; kind: string }) => {
const list = readList(WATCH_KEY);
... (10 more)
```

## web/src/lib/litespm/in-agent.ts — 128 lines
```
export type InAgentKind = "popup" | "prompt" | "none";
export type InAgentEvidence =
export interface InAgentEntry {
export const IN_AGENT: InAgentEntry[] = [
export const EVIDENCE_LABEL: Record<InAgentEvidence, string> = {
export function inAgentFor(hostId: string): InAgentEntry | undefined {
export function inAgentNoneFor(hostId: string): InAgentEntry | undefined {
```

## web/src/lib/litespm/route.ts — 197 lines
```
export type SortKey = "relevance" | "rank" | "name" | "kind" | "publisher";
export interface ExploreQuery {
export type Route =
export type MarketplaceTab = "all" | "mcp" | "skills" | "plugins" | "installed";
export const MARKETPLACE_TABS: MarketplaceTab[] = ["all", "mcp", "skills", "plugins", "installed"];
const TAB_TO_KIND: Record<string, string | undefined> = { mcp: "mcp", skills: "skill", plugins: "plugin" };
const KIND_TO_TAB: Record<string, MarketplaceTab> = { mcp: "mcp", skill: "skills", plugin: "plugins" };
export function tabForKind(kind?: string): MarketplaceTab {
export function kindForTab(tab: string): string | undefined {
export function safeDecode(value: string): string {
const decoded = decodeURIComponent(current);
export const SORT_KEYS: SortKey[] = ["relevance", "rank", "name", "kind", "publisher"];
export function exploreHash(query: ExploreQuery, tab?: MarketplaceTab): string {
const params = new URLSearchParams();
... (17 more)
```

## web/src/lib/litespm/router.ts — 89 lines
```
import { create } from "zustand";
import { exploreHash, parsePath, toPath, type Route } from "./route";
export * from "./route";
export function parseLocation(): Route {
const hash = window.location.hash;
const hashRoute = parsePath(hash.replace(/^#/, ""), "");
const cleanPath = toPath(hash);
const route = parsePath(window.location.pathname, window.location.search);
export const parseHash = parsePath;
interface AppState {
export const useApp = create<AppState>((set, get) => ({
const keys = get().compareKeys;
const cleanPath = toPath(target);
const current = window.location.pathname + window.location.search;
```

## web/src/lib/litespm/shell.ts — 15 lines
```
export function shellArg(value: string): string {
```

## web/src/lib/litespm/site-facts.json — 28 lines
```
hosts
remoteHosts
localOnlyHosts
localOnlyHostNames
skillTargets
catalogRows
listings
mcpServers
skills
plugins
releaseId
npmVersion
bridgeTools
```

## web/src/lib/litespm/source-docs-types.ts — 42 lines
```
export interface SourceDocsLocation {
export interface SourceDocsRepoMeta {
export interface SourceDocsResponse {
```

## web/src/lib/litespm/types.ts — 510 lines
```
export type CatalogKind = "mcp" | "skill" | "plugin";
export interface CatalogPublisher {
export interface CatalogHit {
export interface CatalogFacets {
export interface CatalogListResponse {
export interface AvailabilityInfo {
export interface TryPrompt {
export interface PackageDetailData {
export interface PackageDetailResponse {
export interface AgentRow {
export interface AgentStats {
export interface AgentSetupFacts {
export interface AgentDetailData {
export interface CatalogStatsResponse {
... (12 more)
```

## web/src/lib/utils.ts — 7 lines
```
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs: ClassValue[]) {
```

## web/src/server/litespm/agents.ts — 351 lines
```
import { vendorName } from "./vendor-names";
import { hostNote } from "./host-notes";
import { HOST_IDENTITIES, resolveHostId, tallyHosts, hostIdsFor } from "./identity";
import { HOSTS, SKILL_TARGETS, bridgeSnippet, hostPath, hostPathIsHomeDerived, hostSupportsPlatform, compareHo
import { availabilityOf } from "./availability";
import { listingIdentity } from "./discovery";
import { getDataset } from "./dataset";
import type { Listing } from "./types";
export interface KindCount {
export interface AgentRow {
function slugifyAgent(raw: string): string {
const globalForAgentRows = globalThis as unknown as {
export async function buildAgentRows(): Promise<AgentRow[]> {
async function computeAgentRows(): Promise<AgentRow[]> {
... (40 more)
```

## web/src/server/litespm/assistant-answer.ts — 94 lines
```
import { displayPackageName } from "../../lib/litespm/format";
import type { CatalogHit } from "./search";
type HitLike = Pick<CatalogHit, "id" | "linkKey" | "name" | "installable">;
export function installCommandFor(hit: HitLike, hostId?: string): string | null {
const id = hit.id.replace(/[^\w.:@/+-]/g, "");
export function packageLinkFor(hit: Pick<CatalogHit, "linkKey">): string {
function mentions(answer: string, hit: HitLike): boolean {
const lower = answer.toLowerCase();
const display = displayPackageName(hit.name).toLowerCase();
export function ensureInstallCommands(answer: string, hits: HitLike[], hostId?: string, max = 4): string {
const command = installCommandFor(hit, hostId);
const needsCommand = Boolean(command) && !answer.includes(command!) && !answer.includes(`litespm install ${hit
const link = packageLinkFor(hit);
const needsLink = !answer.includes(link) && !answer.includes(`/package/${hit.linkKey}`);
... (6 more)
```

## web/src/server/litespm/assistant-embeddings.ts — 39 lines
```
export async function embedTexts(inputs: string[]): Promise<number[][] | null> {
const apiKey = process.env.EMBEDDING_API_KEY;
const baseUrl = (process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 12_000);
const response = await fetch(`${baseUrl}/embeddings`, {
const payload = await response.json() as { data?: Array<{ index: number; embedding: number[] }> };
const ordered = [...payload.data].sort((a, b) => a.index - b.index);
```

## web/src/server/litespm/assistant-grounding.ts — 30 lines
```
export function installClaims(answer: string): string[] {
export function looksLikePackageId(token: string): boolean {
export function claimedPackageIds(answer: string): string[] {
```

## web/src/server/litespm/assistant-host-answers.ts — 135 lines
```
import type { KnowledgeHit } from "./assistant-knowledge";
import type { AssistantToolResult } from "./assistant-tools";
const fence = String.fromCharCode(96).repeat(3);
export function buildHostSetupAnswer(
const host = toolResult.data as {
const marker = (predicate: (hit: KnowledgeHit) => boolean) => {
const index = hits.findIndex(predicate);
const commandCitation =
const hostCitation = marker(
const lines = [
export function buildRemoteHostAnswer(toolResult: AssistantToolResult | null): string | null {
const data = toolResult.data as {
const remote = data.mcpHosts.filter((host) => host.remote);
const localOnly = data.mcpHosts.filter((host) => !host.remote);
... (3 more)
```

## web/src/server/litespm/assistant-knowledge.ts — 170 lines
```
import corpus from "./generated/assistant-knowledge.json";
import { embedTexts } from "./assistant-embeddings";
export interface KnowledgeChunk {
export interface KnowledgeHit extends KnowledgeChunk {
const chunks = corpus as KnowledgeChunk[];
const STOP = new Set(["the","a","an","and","or","to","of","in","on","for","with","is","are","be","by","as","at
function terms(value: string): string[] {
function queryTokens(query: string): string[] {
function hashedVector(tokens: string[], dimensions = 384): number[] {
const vector = new Array<number>(dimensions).fill(0);
const index = (hash >>> 0) % dimensions;
const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
function cosine(a: number[], b: number[]): number {
const DOCUMENT_COUNT = chunks.length;
... (42 more)
```

## web/src/server/litespm/assistant-orchestrator.ts — 144 lines
```
export type AssistantMode = "conversation" | "knowledge" | "catalog";
export interface RoutedIntent {
type Turn = { role: "user" | "assistant"; content: string };
const SITE_VOCABULARY = /\b(installable|installability|discovery[- ]only|not inspected|litespm score|rank(?:in
const DEFINITIONAL = /\b(what is|what's|what are|what does|what do|difference|differ|meaning|mean|means|why (?
const CATALOG_TERMS = /\b(mcp|servers?|skills?|plugins?|packages?|marketplace|agent hosts?|installable|install
const CATALOG_ACTIONS = /\b(find|search|recommend|suggest|compare|install|discover|show me|which)\b/i;
const PRODUCT_TERMS = /\b(litespm|lite spm|cli|command|commands|setup|host list|host detect|restore|rollback|l
const GREETING = /^(?:hi|hello|hey|hiya|good morning|good afternoon|good evening|yo|sup)[!. ,]*$/i;
const IDENTITY = /\b(who are you|what are you|your name|who am i talking to|introduce yourself)\b/i;
const SOCIAL = /^(?:thanks|thank you|thx|okay|ok|cool|great|got it|nice|bye|goodbye)[!. ,]*$/i;
const CAPABILITY_NOUNS = /\b(mcp servers?|servers?|skills?|plugins?|packages?|connectors?)\b/i;
const PRODUCT_NAMES = /\b(postgres|postgresql|mysql|sqlite|mongodb|redis|supabase|neon|github|gitlab|playwrigh
const INSTALL_VERBS = /\b(install|add|get|find|search|recommend|suggest|looking for|need|want|best|good|top|tr
... (14 more)
```

## web/src/server/litespm/assistant-retrieval.ts — 368 lines
```
import { HOSTS, HOST_ALIASES } from "./hosts";
import { resolveHostId } from "./identity";
import { queryGroups } from "./bm25";
import { searchCatalog, tokenize, type CatalogHit } from "./search";
import { displayPackageName } from "../../lib/litespm/format";
import type { ListingKind } from "./types";
export interface AssistantIntent {
const GOAL_HINTS: Array<[RegExp, string]> = [
const QUERY_WORDS =
const normalizeName = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
function hasWord(haystack: string, word: string): boolean {
const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function parseAssistantIntent(question: string): AssistantIntent {
const q = question.toLowerCase();
... (45 more)
```

## web/src/server/litespm/assistant-tools.ts — 224 lines
```
import { HOSTS, HOST_ALIASES, SKILL_TARGETS, resolveHost } from "./hosts";
import { retrieveAssistant } from "./assistant-retrieval";
import { retrieveKnowledge } from "./assistant-knowledge";
import { namesCapabilityToInstall } from "./assistant-orchestrator";
import type { LlmFunctionTool } from "../llm/types";
export type AssistantToolName =
export interface AssistantToolResult {
function boundedString(value: unknown, max = 240): string | null {
const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
export async function executeAssistantTool(
const query = boundedString(args.query);
const result = await retrieveAssistant(query);
const query = boundedString(args.query);
const hits = await retrieveKnowledge(query, 7);
... (18 more)
```

## web/src/server/litespm/availability.ts — 136 lines
```
import type { Listing } from "./types";
export type AvailabilityId = "remote" | "local" | "source" | "plugin" | "discovery" | "unsupported";
export interface Availability {
const REMOTE: Availability = {
const LOCAL: Availability = {
const SOURCE: Availability = {
const DISCOVERY: Availability = {
const PLUGIN: Availability = {
const UNSUPPORTED: Availability = {
export function availabilityOf(
const artifact = item.artifact;
const installabilityEstablished =
const transport = (item.transport ?? "").toLowerCase();
const command = item.command?.trim();
... (1 more)
```

## web/src/server/litespm/bm25.ts — 440 lines
```
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Listing } from "./types";
import { countToken, queryGroups, tokenCount, tokenField } from "./text";
export interface SearchDoc {
export interface SearchIndex {
type SerializedDoc = [
export interface SerializedSearchIndex {
export function serializeSearchIndex(index: SearchIndex): SerializedSearchIndex {
const doc = index.docs.get(id)!;
function deserializeSearchIndex(serialized: SerializedSearchIndex): SearchIndex {
const docs = new Map<string, SearchDoc>();
function indexDataDir(): string {
... (46 more)
```

## web/src/server/litespm/bundles.ts — 73 lines
```
import { readFileSync } from "node:fs";
import path from "node:path";
import { availabilityOf } from "./availability";
import { getDataset } from "./dataset";
import { HOSTS } from "./hosts";
import { hostIdsFor } from "./identity";
import type { BundleDifficulty, BundleItem, BundlesResponse } from "@/lib/litespm/types";
interface BundleFile {
function readBundleFile(): BundleFile {
function clip(text: string | undefined, max = 180): string {
const value = (text ?? "").trim();
export async function getBundles(): Promise<BundlesResponse> {
const bundles = file.bundles.map((bundle) => {
const row = dataset.byId.get(id);
... (1 more)
```

## web/src/server/litespm/cap.ts — 12 lines
```
export const SUMMARY_CAP = 200;
export function capSummary(summary: unknown): string {
const text = String(summary ?? "");
const slice = text.slice(0, SUMMARY_CAP);
const cut = slice.lastIndexOf(" ");
```

## web/src/server/litespm/config-snippet.ts — 146 lines
```
export const COMMAND_TOKEN_RE = /^[A-Za-z0-9._/@:=+~-]+$/;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;
export function hasControlCharacters(value: string): boolean {
export function isSafeCommandToken(token: unknown): token is string {
export interface CommandLine {
export function validateCommandLine(command: unknown, args: unknown): CommandLine | null {
const TOML_SHORT_ESCAPES: Record<number, string> = {
export function tomlString(value: string): string {
const code = ch.codePointAt(0) ?? 0;
export function jsonSnippet(value: unknown): string {
export interface TomlLocalEntryOptions {
export function tomlLocalEntry(options: TomlLocalEntryOptions): string | null {
const launch = validateCommandLine(options.command, options.args ?? []);
const lines = [
... (1 more)
```

## web/src/server/litespm/counts.ts — 73 lines
```
import { availabilityOf } from "./availability";
import { getCompactDataset } from "./dataset";
import { dedupeKey } from "./ranking";
export interface CatalogCounts {
const globalForCounts = globalThis as unknown as {
async function compute(): Promise<CatalogCounts> {
const dataset = await getCompactDataset();
const names = new Set<string>();
const byKind = { mcp: 0, skill: 0, plugin: 0 };
const level = row.installability ?? "discovery_only";
export function getCatalogCounts(): Promise<CatalogCounts> {
```

## web/src/server/litespm/dataset.ts — 359 lines
```
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { listingIdentity, normalizeListing, uniqueListings } from "./discovery";
import { validateCommandLine } from "./config-snippet";
import { dedupeKey, rankScore } from "./ranking";
import type { FeaturedShelf, Listing, ReleaseManifest, Telemetry } from "./types";
interface HostRow {
interface SkillTargetRow {
interface CliRelease {
export interface Dataset {
function getDataDir(): string {
const direct = path.join(process.cwd(), "data");
function readJson<T>(file: string): T {
... (38 more)
```

## web/src/server/litespm/discovery.ts — 172 lines
```
import type { Listing, ListingArtifact } from "./types";
interface RepoRef {
export function repository(repo: string | undefined | null): RepoRef | null {
const match = repo.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)/);
export function normalizeListing(item: Listing): Listing {
const upstream = repository(item.artifact?.repo);
const name = String(item.publisher?.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const owner = upstream.owner.toLowerCase().replace(/[^a-z0-9]/g, "");
export function listingIdentity(item: Listing): string {
const upstream = repository(item.artifact?.repo);
const path = String(artifact?.path ?? "").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
const revision = artifact?.sha || artifact?.ref || item.version || "";
export function uniqueListings(rows: Listing[]): Listing[] {
const seen = new Set<string>();
... (16 more)
```

## web/src/server/litespm/host-notes.ts — 864 lines
```
export interface HostNote {
export const HOST_NOTES: Record<string, HostNote> = {
export function hostNote(id: string): HostNote | undefined {
```

## web/src/server/litespm/hosts.ts — 410 lines
```
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { availabilityOf } from "./availability";
import type { Listing } from "./types";
export type PlatformOS = "win" | "mac" | "linux";
export type HostFormat = "json" | "toml";
export type HostShape = "object" | "local-array" | "stdio-typed" | "command-string" | "";
export interface HostAdapter {
interface GeneratedHost {
function getDataDir(): string {
const direct = path.join(process.cwd(), "data");
function readJson<T>(file: string): T {
const generatedHosts = readJson<GeneratedHost[]>("hosts.json");
const generatedSkillTargets = readJson<
... (39 more)
```

## web/src/server/litespm/identity.ts — 268 lines
```
import type { Listing } from "./types";
import {
import { availabilityOf } from "./availability";
import { vendorName } from "./vendor-names";
import { listingIdentity } from "./discovery";
export interface SkillTarget {
export interface HostIdentity {
function norm(raw: string): string {
function joinSkillId(id: string): string {
export const HOST_IDENTITIES: HostIdentity[] = (() => {
const byId = new Map<string, HostIdentity>();
const id = joinSkillId(target.id);
const IDENTITY_BY_ID = new Map(HOST_IDENTITIES.map((identity) => [identity.id, identity]));
const STRING_TO_ID = (() => {
... (34 more)
```

## web/src/server/litespm/insights.ts — 258 lines
```
import { getDataset } from "./dataset";
import { availabilityOf } from "./availability";
import { classifyListing, GOALS, OTHER_GOAL, type GoalOrOther } from "./taxonomy";
import { rowMetaMap } from "./search";
import { buildAgentRows } from "./agents";
import { HOSTS, SKILL_TARGETS, hostPath, compareHostsByAdoption } from "./hosts";
import type { Listing } from "./types";
export interface InsightBar {
export interface InsightsResponse {
const globalForInsights = globalThis as unknown as {
export async function getInsights(): Promise<InsightsResponse> {
async function computeInsights(): Promise<InsightsResponse> {
const dataset = await getDataset();
const rows = dataset.rows;
... (25 more)
```

## web/src/server/litespm/package-detail.ts — 312 lines
```
import { getDataset } from "./dataset";
import { availabilityOf } from "./availability";
import { hostsNamedBy, resolveHostId, hostIdentity } from "./identity";
import { tryPrompts } from "./try-prompts";
import { relatedListings } from "./discovery";
import { dedupeKey, rankScoreBreakdown } from "./ranking";
import { classifyListing, GOAL_LABELS } from "./taxonomy";
import { hostsFor } from "./hosts";
import { buildMcpSpec, buildSkillSpec, buildPluginSpec } from "./type-specs";
import { resolveOriginalSource } from "./source-resolver";
import type { Listing } from "./types";
export interface PackageDetailResponse {
export interface PackageDetailData {
export async function getPackageDetail(key: string): Promise<PackageDetailResponse> {
... (18 more)
```

## web/src/server/litespm/ranking.ts — 362 lines
```
import type { Listing } from "./types";
export function norm(value: string | undefined): string {
export function stripNamespace(name: string): string {
const VENDOR_TIER1 = new Set([
const VENDOR_TIER2 = new Set([
const FLAGSHIP_KEYS: Set<string> = new Set([
const OFFICIAL_NAMES: Map<string, Set<string>> = new Map([
const NOTABLE_KEYS: Set<string> = new Set([
const FLAGSHIP_CONTAINS: string[] = [
function junkPenalty(name: string): number {
const trimmed = name.trim();
function namespaceOrg(name: string): string | null {
const ioMatch = /^io\.github\.([a-z0-9._-]+)\//i.exec(name);
const scopeMatch = /^@([a-z0-9][a-z0-9._-]*)\//i.exec(name);
... (22 more)
```

## web/src/server/litespm/rate-limit.ts — 151 lines
```
interface Window {
const RATE_WINDOW_MAX_KEYS = 10_000;
const globalForLimit = globalThis as unknown as {
function windows(): Map<string, Window> {
function pruneWindows(map: Map<string, Window>, now: number): void {
const oldest = map.keys().next().value;
export interface RateLimitResult {
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
const map = windows();
const now = Date.now();
const current = map.get(key);
const globalForBudget = globalThis as unknown as {
function budgets(): Map<string, number[]> {
export function globalBudget(scope: string, max: number, windowMs: number): RateLimitResult {
... (12 more)
```

## web/src/server/litespm/request-body.ts — 68 lines
```
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
const declaredLength = request.headers.get("content-length");
const parsedLength = Number(declaredLength);
const reader = request.body.getReader();
const bytes = new Uint8Array(total);
export class RequestBodyTooLargeError extends Error {
```

## web/src/server/litespm/search.ts — 813 lines
```
import { availabilityOf } from "./availability";
import { HOSTS, SKILL_TARGETS, HOST_ALIASES } from "./hosts";
import { resolveHostId, hostIdsFor } from "./identity";
import { classifyListing } from "./taxonomy";
import { getCliReleases, getCompactDataset, getDataset } from "./dataset";
import { dedupeKey, installableFirst, nameTiebreakBucket } from "./ranking";
import { getCatalogCounts } from "./counts";
import { resolveOriginalSource } from "./source-resolver";
import { candidateRowIds, expandGroups, getSearchIndex, queryGroups, scoreDoc } from "./bm25";
import { tokenize } from "./text";
import type { Listing } from "./types";
export type SortKey = "relevance" | "rank" | "name" | "kind" | "publisher";
export interface CatalogQuery {
export interface CatalogHit {
... (131 more)
```

## web/src/server/litespm/source-docs.ts — 426 lines
```
import { getDataset } from "./dataset";
import { resolveOriginalSource } from "./source-resolver";
import type { Listing } from "./types";
import type {
const FETCH_TIMEOUT_MS = 2_500;
const MAX_BYTES = 512 * 1024;
const CACHE_MAX = 500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 5 * 60 * 1000;
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const REF_RE = /^[A-Za-z0-9._\-/]{1,200}$/;
const SEGMENT_RE = /^[A-Za-z0-9._@+~ -]{1,150}$/;
function validRef(ref: string): boolean {
... (71 more)
```

## web/src/server/litespm/source-resolver.ts — 251 lines
```
import type { Listing } from "./types";
export interface ResolvedSource {
function isAggregator(u?: string | null): boolean {
const GIT_HOSTS = new Set(["github.com", "www.github.com", "gitlab.com", "www.gitlab.com", "bitbucket.org", "w
function httpsUrl(raw: string | null | undefined): string | null {
const url = new URL(raw.trim());
function gitRepoUrl(raw: string | null | undefined): string | null {
const safe = httpsUrl(raw);
export function resolveOriginalSource(row: Listing): ResolvedSource {
const resolved = resolveOriginalSourceUnchecked(row);
const repoUrl = gitRepoUrl(resolved.repoUrl);
function resolveOriginalSourceUnchecked(row: Listing): ResolvedSource {
const m = repoUrl.match(/(?:github|gitlab|bitbucket)\.(?:com|org)\/([^\/]+)(?:\/([^\/#?]+))?/);
const m = repoUrl.match(/(?:github|gitlab|bitbucket)\.(?:com|org)\/([^\/]+)(?:\/([^\/#?]+))?/);
... (10 more)
```

## web/src/server/litespm/taxonomy.ts — 319 lines
```
import type { Listing } from "./types";
import { capSummary } from "./cap";
export type GoalId =
export type GoalOrOther = GoalId | "other";
export interface GoalDefinition {
export const GOALS: GoalDefinition[] = [
export const OTHER_GOAL: { id: "other"; label: string; blurb: string } = {
export const GOAL_LABELS: Record<string, string> = {
const CATEGORY_GOALS: Record<string, GoalOrOther> = {
const GENERIC_CATEGORIES = new Set([
interface Rule {
const RULES: Rule[] = [
const REGISTRY_PREFIX = /^io\.github\.[^/]+\//i;
function cleanName(name: string | undefined): string {
... (8 more)
```

## web/src/server/litespm/text.ts — 248 lines
```
export const STOP_TOKENS = new Set([
const ALIASES: Record<string, string> = {
const POST_STEM_ALIASES: Record<string, string> = {
export function normalizeToken(raw: string): string {
const cleaned = raw
const WORD_CACHE = new Map<string, string>();
function normalizeCleanWord(word: string): string {
const cached = WORD_CACHE.get(word);
const aliased = ALIASES[word] ?? word;
const stemmed = stem(aliased);
const normalized = POST_STEM_ALIASES[stemmed] ?? stemmed;
export function stem(word: string): string {
export function tokenize(q: string): string[] {
export function queryTokens(q: string): string[] {
... (22 more)
```

## web/src/server/litespm/try-prompts.ts — 137 lines
```
import type { Listing } from "./types";
import { availabilityOf } from "./availability";
export interface TryPrompt {
const IMPERATIVE_VERBS = new Set([
const NOT_A_CAPABILITY =
function firstSentence(text: string): string {
const line = text.trim().replace(/\s+/g, " ");
const match = line.match(/^(.+?[.!?])(?:\s|$)/);
function firstWord(sentence: string): string {
export function examplePrompt(item: Listing): TryPrompt | null {
const summary = item.summary?.trim();
const sentence = firstSentence(summary);
const lower = sentence.charAt(0).toLowerCase() + sentence.slice(1);
export function firstLookPrompt(item: Listing): TryPrompt | null {
... (1 more)
```

## web/src/server/litespm/type-specs.ts — 429 lines
```
import type { Listing } from "./types";
import { tomlLocalEntry, jsonSnippet, validateCommandLine } from "./config-snippet";
import { norm, stripNamespace } from "./ranking";
import { HOSTS } from "./hosts";
export interface HostConfigItem {
export interface McpPermissionScope {
export interface McpEnvVar {
export interface McpDetailSpec {
export interface SkillDetailSpec {
export interface PluginDetailSpec {
export function classifyToolAction(name: string): "read" | "write" | "destructive" {
const n = name.toLowerCase();
function hostSupportsRemote(
const wanted = (transport ?? "").toLowerCase();
... (37 more)
```

## web/src/server/litespm/types.ts — 128 lines
```
export type ListingKind = "mcp" | "skill" | "plugin";
export type Installability =
export interface ListingPublisher {
export interface ListingArtifact {
export interface Listing {
export interface ReleaseManifest {
export interface Telemetry {
export interface FeaturedGroup {
export interface FeaturedEntry {
export interface FeaturedShelf {
```

## web/src/server/litespm/vendor-names.ts — 46 lines
```
export const VENDOR_NAMES: Record<string, string> = {
export function vendorName(id: string, fallback: string): string {
```

## web/src/server/llm/gateway.ts — 740 lines
```
import {
import type {
const MAX_KEYS_PER_PROVIDER = 12;
const PER_ATTEMPT_TIMEOUT_MS = 20_000;
const BASE_COOLDOWN_MS = 15_000;
const SERVER_ERROR_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 2 * 60_000;
const STREAM_TTFT_TIMEOUT_MS = 15_000;
const STREAM_IDLE_TIMEOUT_MS = 20_000;
const POOL_TTL_MS = 30_000;
const FIXED_PROVIDERS: Array<{
function collectKeys(envPrefix: string): string[] {
const bare = process.env[envPrefix];
const numbered = process.env[`${envPrefix}_${i}`];
... (83 more)
```

## web/src/server/llm/providers.ts — 586 lines
```
import type { LlmChatRequest } from "./types";
export class LlmAdapterError extends Error {
const DEFAULT_TEMPERATURE = 0.3;
function fetchWithTimeout(
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
const external = init.signal ?? null;
const onExternalAbort = () => controller.abort();
function parseRetryAfter(value: string | null): number | undefined {
const seconds = Number.parseInt(value, 10);
const date = Date.parse(value);
async function readErrorBody(response: Response): Promise<string> {
const text = await response.text();
const json = JSON.parse(text) as { error?: { message?: string }; message?: string };
... (54 more)
```

## web/src/server/llm/types.ts — 106 lines
```
export type LlmStyle = "openai" | "gemini" | "zai";
export interface LlmCredential {
export interface LlmFunctionTool {
export interface LlmToolCall {
export interface LlmChatRequest {
export interface LlmAttempt {
export interface LlmChatSuccess {
export interface LlmChatFailure {
export type LlmChatResult = LlmChatSuccess | LlmChatFailure;
export interface LlmCredentialStatus {
```

## npm/bin/litespm.js — 181 lines
```
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const VERSION = require("../package.json").version;
function getBinaryName() {
const platform = process.platform;
const arch = process.arch;
const ext = platform === "win32" ? ".exe" : "";
function getManagedBinaryPath() {
const binName = getBinaryName();
function resolveBinary() {
const binName = getBinaryName();
const candidates = [
... (7 more)
```

## npm/package-lock.json — 187 lines
```
name
version
lockfileVersion
requires
packages
```

## npm/package.json — 54 lines
```
name
version
description
bin
files
publishConfig
scripts
dependencies
keywords
author
license
repository
homepage
bugs
... (1 more)
```

## npm/README.md — 257 lines
```
# litespm
## Install
## What you get
## Commands
## How the installer works
### Installer environment variables
### Behind a proxy
### If the download fails
### Installing a local build
### Uninstalling
## Requirements
## License
```

## npm/scripts/install-binary.js — 1827 lines
```
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const net = require("net");
const tls = require("tls");
const { spawnSync } = require("child_process");
const { getBinaryName } = require("../bin/litespm.js");
const VERSION = require("../package.json").version;
const DEFAULT_RELEASE_REPO = "sarv-projects/LiteSPM";
const RELEASE_WORKFLOW_FILE = ".github/workflows/release.yml";
const DEFAULT_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
... (212 more)
```

## npm/scripts/uninstall-binary.js — 110 lines
```
const fs = require("fs");
const os = require("os");
const path = require("path");
const VERSION = require("../package.json").version;
function getBinaryName(platform = process.platform, arch = process.arch) {
const osName = platform === "win32" ? "windows" : platform === "darwin" ? "darwin" : platform === "linux" ? "l
const archName = arch === "x64" ? "amd64" : arch === "arm64" ? "arm64" : "";
function resolveManagedPaths({ home = os.homedir(), version = VERSION, platform = process.platform, arch = pro
const binaryName = getBinaryName(platform, arch);
const root = path.resolve(home, ".litespm", "bin");
const versionDir = path.resolve(root, `v${version}`);
const binaryPath = path.join(versionDir, binaryName);
function isRegularFileWithoutFollowingLinks(filePath) {
const stat = fs.lstatSync(filePath);
... (5 more)
```

## npm/test_npm.js — 2013 lines
```
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const {
const {
const VERSION = require("./package.json").version;
const PINNED_IDENTITY = releaseIdentity(DEFAULT_RELEASE_REPO, VERSION);
function check(name, fn) {
async function checkAsync(name, fn) {
async function checkRefusal(name, fn, pattern) {
const reason = err.message.length > 220 ? `${err.message.slice(0, 220)}…` : err.message;
... (232 more)
```

## scripts/audit-pages-dist.sh — 68 lines
```
#!/usr/bin/env bash
```

## scripts/build-release.sh — 112 lines
```
#!/usr/bin/env bash
```

## scripts/build_full_catalog.py — 3987 lines
```
def _mark_incomplete(source_id):
def _mark_refused(source_id, count=1):
def _skills_sh_path_refusal(parsed):
def _is_policy_refused_listing_url(url, source_id):
def _is_public_ip(value):
def _validate_request_url(url, source_id, check_dns=True):
def _is_source_sitemap_url(url, source_id, path_pattern):
def _resolve_public_addresses(host, port):
def _source_https_connection(source_id):
def _load_registry(name, field):
def canonical_slug(text):
def canonical_id(kind, source, upstream):
def base_slug(name):
def manifest_is_command(s):
... (64 more)
```

## scripts/check-web-lock-integrity.mjs — 81 lines
```
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = process.argv[2]
const packages = lock.packages ?? {};
const missing = [];
```

## scripts/check_catalog_coherence.py — 179 lines
```
#!/usr/bin/env python3
def load(path: str):
def fail(message: str) -> None:
def main() -> int:
```

## scripts/check_ci.py — 148 lines
```
def build_headers():
def fetch_json(url, timeout=10):
def print_failure_logs(job_id):
def main():
```

## scripts/check_ci_local.sh — 95 lines
```
#!/usr/bin/env bash
```

## scripts/check_headers.py — 14 lines

## scripts/check_mcp_journey.py — 34 lines

## scripts/check_pages_limits.py — 199 lines
```
#!/usr/bin/env python3
def _stale_release_hint(root: str, name: str) -> str | None:
def main() -> int:
```

## scripts/check_site_links.py — 190 lines
```
#!/usr/bin/env python3
def load_dataset(path):
def link_keys(rows):
def collect_links(root):
def main():
```

## scripts/check_voltagent.py — 20 lines

## scripts/deploy-pages.sh — 103 lines
```
#!/usr/bin/env bash
```

## scripts/enrich_plugin_artifacts.py — 302 lines
```
#!/usr/bin/env python3
def load_manifests(refresh: bool):
def iter_manifest_entries(src, manifest, seen_ids, seen_slugs, notes):
def with_artifact(row, descriptor):
def main() -> int:
```

## scripts/enrich_registry_packages.py — 167 lines
```
#!/usr/bin/env python3
def fetch_page(cursor: str | None) -> dict:
def latest_servers() -> dict[str, dict]:
def main() -> int:
```

## scripts/fetch_test.py — 23 lines

## scripts/fix_skills_sh_refs.py — 104 lines
```
#!/usr/bin/env python3
def default_ref(repo: str) -> str | None:
def main() -> int:
```

## scripts/gen_hosts_ts.go — 219 lines
```
//go:build ignore

// gen_hosts_ts emits web/data/hosts.json from the compiled-in Go host registry.
//
// Why generate instead of hand-maintaining a TS array: the Market UI previously
```

## scripts/install-cron-sync.sh — 19 lines
```
#!/usr/bin/env bash
```

## scripts/install-task-sync.ps1 — 21 lines

## scripts/litespm-sync.ps1 — 41 lines

## scripts/litespm-sync.sh — 48 lines
```
#!/usr/bin/env bash
```

## scripts/migrate_dataset_transport.py — 82 lines
```
#!/usr/bin/env python3
def main() -> int:
```

## scripts/parse_catalogs.py — 26 lines

## scripts/parse_skills.py — 13 lines

## scripts/README.md — 235 lines
```
# `scripts/` — repository scripts
## At a glance
## `build-release.sh` — cross-platform release binaries
## `deploy-pages.sh` — Cloudflare Pages packaging + leak audit
## `build_full_catalog.py` — **the catalog dataset producer**
## `gen_hosts_ts.go` — host registries for the web data files
## `check_ci.py` — latest CI run status
## Upstream research scripts (never wired, never asserting)
## Coverage summary (what is actually enforced)
```

## scripts/refresh_catalog_stats.py — 53 lines
```
#!/usr/bin/env python3
def main() -> int:
```

## scripts/resolve_directory_mcp_launches.py — 271 lines
```
#!/usr/bin/env python3
def canonical_repo_name(name: str | None) -> str:
def github_parts(url: Any) -> tuple[str, str] | tuple[None, None]:
def registry_index(rows: Iterable[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
def resolve_directory_launches(rows: list[dict[str, Any]]) -> dict[str, Any]:
def load_catalog(path: str) -> list[dict[str, Any]]:
def write_catalog(path: str, rows: list[dict[str, Any]]) -> None:
def print_report(report: dict[str, Any]) -> None:
def main(argv: list[str] | None = None) -> int:
```

## scripts/resolve_skills_sh_sources.py — 274 lines
```
#!/usr/bin/env python3
def install_source(page: bytes) -> tuple[str, str] | None:
def safe_rel_path(name: str) -> str | None:
def default_ref(repo: str) -> str | None:
def download_tarball(repo: str, ref: str) -> tuple[bytes | None, str]:
def scan_tarball(data: bytes) -> dict:
def scan_repo(repo: str) -> dict:
def main() -> int:
```

## scripts/retry_skills_sh_sources.py — 141 lines
```
#!/usr/bin/env python3
def scan_head(repo: str) -> dict:
def main() -> int:
```

## scripts/sample_voltagent.py — 10 lines

## scripts/sandbox-all-agents.ps1 — 29 lines
```
#!/usr/bin/env pwsh
```

## scripts/sandbox-all-agents.sh — 16 lines
```
#!/usr/bin/env bash
```

## scripts/snapshot_store.py — 829 lines
```
def default_root():
def snapshot_slug(url):
def snapshot_key(url):
def snapshot_dir(root, url):
def history_dir(root, url):
def digest_bytes(body):
def iso_utc(at=None):
def new_snapshot_id(at=None):
def etag_revision(etag):
def _atomic_write(path, data):
def _record_json(snapshot, fetch):
def _history_entries(hist):
def _dir_size(path):
def _prune_history(hist, incoming_bytes):
... (12 more)
```

## scripts/test_builder_parity.py — 365 lines
```
#!/usr/bin/env python3
def iter_json_array(path):
def python_fields(row):
def go_fields(listing, version_record):
def read_release_tree(out_dir, release_id):
def run_go_builder(out_dir, dataset, pointer):
def compare(python_rows, go_rows):
def main():
```

## scripts/test_catalog_ingestion_safety.py — 492 lines
```
def _public_dns(host, port, type=None):
def _registry_page(servers, next_cursor=None):
def _registry_element(name, description, version="1.0.0", latest=True):
def test_registry_fetch_is_bounded(ok):
def _other_source_ids():
def test_registry_replay_is_offline_and_byte_reproducible(ok):
def main():
```

## scripts/test_cli_journey.sh — 34 lines
```
#!/usr/bin/env bash
```

## scripts/test_mcpmarket_source.py — 473 lines
```
def _public_dns(host, port, type=None):
def run_producer(root, index=CANNED[INDEX_URL], canned=None, env=None,
def snapshot_meta(root, url):
def main():
```

## scripts/test_pages_limits.py — 141 lines
```
def run(bundle: str, *extra: str) -> tuple[int, str]:
def make_bundle(size: int) -> str:
def main() -> int:
```

## scripts/test_remote_endpoints.py — 602 lines
```
def fixture_server(remotes=None, version="2.1.0"):
def build_row(srv):
def test_mcpservers_feed_is_fetched_or_refused(ok):
def _store_records(store_root):
def provenance_report(dataset_path, store_root):
def test_dataset_rows_have_a_recording_behind_them(ok):
def main():
def report_live_provenance():
```

## scripts/test_resolve_directory_mcp_launches.py — 131 lines
```
def registry_row(**overrides):
def directory_row(**overrides):
```

## scripts/test_skill_promotion.py — 1009 lines
```
def _public_dns(host, port, type=None):
def skill_md(name, description):
def skills_sh_page(description, meta_description=None):
def run_producer(root, canned, keep, refresh=False):
def read_catalog(out_dir):
def row_by_id(rows, row_id):
def snapshot_status(root, url):
def check_rate_limit_contract(ok):
def ingestion_status(stdout):
def check_refused_loc_classification(ok):
def main():
```

## scripts/test_snapshot_lifecycle.py — 264 lines
```
def test_every_parsed_snapshot_is_completed() -> int:
def main() -> int:
```

## docs/audit/LEDGER.md — 71 lines
```
# LiteSPM audit ledger — 2026-11 (continuation)
## 1. Components done
## 2. Files inspected (read directly)
## 3. Paths traced
## 4. Commands run / measurements
## 5. Findings
## 6. Open questions
## 7. Pending / not covered
```

## docs/audit/LITESPM-AUDIT-2026-11.md — 582 lines
```
# LiteSPM — Evidence-driven audit, November 2026
## 0. Executive summary
## 1. CLI command inventory
## 2. Feature verification and agent compatibility
### 2.1 Feature matrix
### 2.2 Agent compatibility matrix
## 3. API and data-contract inventory
### 3.1 Daemon IPC (JSON-RPC 2.0, line-delimited)
### 3.2 Bridge (MCP stdio, `internal/bridge/shim.go`)
### 3.3 Website API routes (`web/src/app/api/litespm/**/route.ts`, V-d)
### 3.4 Catalog release tree (V)
### 3.5 State DB, ledgers, lockfile
### 3.6 Contract mismatches / duplicated models
## 4. Reconstructed HLD
... (27 more)
```

## docs/audits/2026-10-22/content-and-competitors.md — 844 lines
```
# LiteSPM website — content, positioning and IA audit
## 0. Executive summary
## 1. Copy inventory (verbatim)
### 1.1 Home page
### 1.2 `/explore`
### 1.3 `/how-it-works`
### 1.4 `/package/<key>/`
### 1.5 `/categories`
### 1.6 `/about` — **does not exist.** There is no `/about` route. The nearest equivalents are `/how
### 1.7 Other pages (for IA)
### 1.8 Layout metadata — the five-positioning problem
## 2. Five-second test (raw HTML, no JavaScript)
## 3. Clarity / jargon
### 3.1 Technically-true-but-evasive claims
... (29 more)
```

## docs/audits/2026-10-22/HANDOVER.md — 289 lines
```
# Session handover — 2026-10-22 (site audit, state-layer follow-ups, gates)
## 1. What this session was asked to do
## 2. What shipped in this session
## 3. What is verified, and how
# Go (green at handover)
# The Python producer suites and the npm wrapper (both green at handover)
# The web gates. `npm run lint` is ~7 minutes: it rebuilds the search index
# and recomputes 30,182 publisher counts on purpose.
# The browser suite (needs the build above; ~8 minutes, 2 workers)
## 4. What is failing, precisely
## 5. What is still open
## 6. Facts that will bite you if you do not know them
## 7. What I did not do, on purpose
## 8. Postscript, written later the same day — 0.6.0 shipped
```

## docs/audits/2026-10-22/visual-identity-followup.md — 95 lines
```
# LiteSPM visual identity audit — current-site follow-up
## Verdict
## System inventory
## Findings
### P1 — mobile masthead hides the product name
### P1 — Explore exposes named source feeds in the public UI
### P2 — the hero allocates an unused desktop column
### P2 — brand and MCP are perceptually too close
### P2 — the hero's secondary glow uses the plugin data hue
### P2 — explanatory copy remains compact on reading pages
### P2 — the submit page explains constraints but gives no new-listing action
## Responsive measurements
## Resolved from the original audit
## Evidence files
```

## docs/audits/2026-10-22/visual-identity.md — 533 lines
```
# LiteSPM — visual design audit (colour, typography, brand, accessibility)
## 0. Method
## 1. Token inventory
### 1a. Surfaces & ink (the substrate)
### 1b. Brand
### 1c. Data hues (the three kinds) and the unused fourth
### 1d. Dark-plane family (dark surfaces only)
### 1e. Non-colour tokens
### 1f. Palette coherence — **coherent, with one real collision**
## 2. Contrast — measured, not estimated
### 2a. The repo's gate: PASSES
### 2b. Every real pair I measured (token-level)
### 2c. The browser probe — **one P0 the token passes cannot see**
## 3. Colour discipline — assessment
... (17 more)
```

## docs/audits/2026-10-23/cli-mcp-journey.txt — 104 lines
```
$ litespm catalog build --dataset /tmp/litespm-mcp-audit-cteoh0xv/dataset.json --out /tmp/litespm-mc
✓ Catalog release built
Release:  rel-audit-local-001 (sequence 1, 1 items)
Snapshot: snap-cac39f4f611ddfb4
Manifest: sha256:9ccb1f4fac8cc4da3ae1db60243a2294cd659464cf64d00a543307bb0f7d5c09
```

## docs/audits/2026-10-23/cli-skill-journey.txt — 54 lines
```
LiteSPM dev (Protocol 2026-07-28, linux/amd64, go1.26.9)
Policy: skill writes require approval (Human authorization required for effectful action); authorize

██╗     ██╗████████╗███████╗██████╗ ███████╗███╗   ███╗
██║     ██║╚══██╔══╝██╔════╝██╔══██╗██╔════╝████╗ ████║
```

## docs/DOCS-REVIEW-2026-11.md — 80 lines
```
# Documentation review — 2026-11
## Facts established (checked 2026-11-10)
## Files reviewed and changed
## Files read only in part or not individually reviewed
## What remains (not fixed)
```

## docs/superpowers/evaluations/2026-10-19-site-evaluation.md — 371 lines
```
# LiteSPM marketing site — adversarial product evaluation
## 1. Executive summary
## 2. Findings table
## 3. "A non-developer could not…"
## 4. Mobile & accessibility findings
### 4.1 Mobile
### 4.2 Accessibility (keyboard, screen reader, contrast, no-JS)
## 5. Competitor comparison
### 5.1 What a user genuinely misses in LiteSPM because of our choices
### 5.2 Improvement ideas (cost + honesty-rule check)
## 6. Console, network and performance findings
## 7. What is genuinely good (do not break this)
```

## docs/superpowers/plans/2026-10-19-arch34-invocation-engine.md — 295 lines
```
# ARCH/34 — Invocation Engine, Registry & Receipts — Implementation Plan
## Global Constraints
## Review Focus
## Task 1: Extend `internal/receipts` to a complete registry
## Task 2: `internal/invocation` — the engine
## Task 3: Wire the daemon
## Task 4: Wire the Bridge tools
## Task 5: Status reconciliation for this track (owner: the orchestrator, not a subagent)
## Self-review
```

## docs/superpowers/plans/2026-10-19-phase-j-product-surface.md — 121 lines
```
# Track 4 — Phase J + Blueprint P1/P2 — Product Surface
## Global Constraints
## Review Focus
## Task 1: F-01 — the `/compare/` overstatement (blocker)
## Task 2: F-02 — the 320 px sideways scroll (major)
## Task 3: F-03, F-04, F-08 — search honesty (major)
## Task 4: F-05 — an install command a human can type (major)
## Task 5: F-06 — the navigation rail that hides a destination (major)
## Task 6: F-07 — the three filters with no control (major)
## Task 7: F-09 — 29 hosts the site names but cannot show (major)
## Task 8: The minor findings, grouped by the file they touch
## Task 9: Phase J rows that are still `DESIGNED`
## Task 10: Blueprint P2 — the install-feasibility module
## Self-review
```

## docs/superpowers/plans/2026-10-19-phase-k-sources-supply-chain.md — 186 lines
```
# Phase K — Sources & Supply Chain (K001–K004, K009 first half) — Implementation Plan
## Global Constraints
## Review Focus
## Task 1: K004 — every parsed snapshot is completed (no records stuck `partial`)
## Task 2: K001 — the official MCP Registry API is fetched and recorded
## Task 3: K003 — `feed:mcpservers-org` gets a real fetch (or a real, recorded failure)
## Task 4: K002 — the provenance contract, proved over the committed dataset
## Task 5: K009 first half — the D4 evidence the ADR needs
## Self-review
```

## docs/superpowers/plans/2026-10-19-program-phase-k-arch34-phase-j-wiring.md — 160 lines
```
# Phase K + ARCH/34 + Phase J + Wiring Program — Implementation Plan
## Global Constraints
## Review Focus
## Program structure
## Task 0: Documentation reconciliation — stale prose (Track 0)
## Track 1 — ARCH/34 (invocation registry, engine, receipts)
## Track 2 — Phase K (sources & supply chain)
## Track 3 — Wiring (the unwired subsystems)
## Track 4 — Phase J + Blueprint P1/P2 (product surface)
## Track 5 — Defect fixes and final status reconciliation
## Self-review
```

## docs/superpowers/plans/2026-10-19-wiring-unwired-subsystems.md — 197 lines
```
# Wiring — The Unwired Subsystems — Implementation Plan
## Global Constraints
## Review Focus
## Task 1: Secrets reach the provider process (F003 / `ResolveLaunchSecrets`)
## Task 2: `litespm auth` — the production path for the OAuth broker (F004)
## Task 3: The `adopt` ownership flow (P5)
## Task 4: `audit --ci` + SARIF, and a static content scan (ARCH/36 §3)
## Task 5: `doctor` timing instrumentation (ARCH/31 §9)
## Task 6: The Go ingest path (`internal/source` reaches production) — K009, second half
## Task 7: The two that have no honest caller yet
## Self-review
```

## docs/superpowers/plans/2026-10-22-visual-audit-fixes.md — 121 lines
```
# Visual Audit Fixes Implementation Plan
## Global Constraints
## Review Focus
### Task 1: Neutral public source labels
### Task 2: Mobile wordmark and single-column hero
### Task 3: Separate brand and MCP color roles
### Task 4: Improve long-form reading size
### Task 5: Add a new-listing GitHub issue form
```

## docs/superpowers/plans/2026-10-23-release-audit.md — 25 lines
```
# LiteSPM release audit remediation
## Work and validation
```

## docs/superpowers/plans/2026-11-14-web-audit-remediation.md — 170 lines
```
# LiteSPM Comprehensive Audit Remediation & Upgrade Implementation Plan
## Global Constraints
## Review Focus
### Task 1: UX & Typography Fixes (Search Dialog Trigger, Bundles Typography)
### Task 2: Publish Submission Fallback (`/publish` & `/api/litespm/feedback`)
### Task 3: Technical SEO & Heading Hierarchy (H1 Accessibility & JSON-LD Schema)
### Task 4: AI & Agent Readiness (`llms.txt` and Plaintext Package Endpoints)
### Task 5: Ask AI Resilience (Multi-Provider Fallback & Citation Softening)
### Task 6: Hero Messaging Dual-Toggle (CLI vs GUI / Cursor)
### Task 7: Full Verification & Build Validation
```

## docs/superpowers/proposals/2026-10-19-blueprint-recheck.md — 156 lines
```
# The blueprint, rechecked against the tree
## 0. The headline
## 1. Already satisfied — do not re-implement
## 2. Genuinely open — and now in flight
## 2a. Measured, new, and not in the blueprint either
## 3. What the recheck changes about the plan
```

## docs/superpowers/proposals/2026-10-19-homepage-product-proposal.md — 163 lines
```
# Homepage — product proposal, from the brief mockup to a top-company product
## 0. What the mockup gets right, and where it stops
## 1. The product position, in one line
## 2. The homepage, section by section (the proposal)
## 3. The design system, adjusted for "top company"
## 4. What "finished" means (the acceptance bar)
## 5. The order of work (and why it is not a week of polish)
```

## docs/superpowers/proposals/2026-10-21-semantic-search.md — 147 lines
```
# Semantic search on the catalog site — the free options, sized
## 0. Where search stands today, measured
## 1. The constraint that decides everything
## 2. Sizing the artifact (this is the whole argument)
## 3. The four options, judged
## 4. Recommended shape (A, with B behind the same interface)
## 5. Acceptance gates (each one falsifiable)
## 6. Risks and the honest answers
## 7. Cost
```

## docs/WEBSITE-AUDIT-2026-11.md — 620 lines
```
# LiteSPM website audit — 2026-11-10
## How to read the evidence labels
## What I did and did not do
# Executive summary — top 10 findings, ranked by impact
# 1. Marketplace vs Explore, and how search connects to the catalog
## 1.1 Are they duplicative? Yes.
## 1.2 Recommendation: one catalog page, with an "Installed" side-panel
## 1.3 How the slash commands and the search bar actually connect to the catalog
## 1.4 What the client loads today
## 1.5 Search algorithm proposal (search on demand, no whole-catalog load)
### A. Client (small, do first)
### B. HTTP cache for the API (small, large win)
### C. Remove the cold-start parse (medium effort, biggest win)
### D. Estimated payload savings (estimates, not measured)
... (32 more)
```
