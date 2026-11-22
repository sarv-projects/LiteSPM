# 04 — User Experience & Persona Journey Audit

**Audit Target:** `https://lite-spm-nine.vercel.app/`  
**Evaluation Scope:** 6 Distinct Real-World Personas, End-to-End Task Completion, Cognitive Load & Drop-off Points

---

## 1. Persona 1: Complete Beginner (The Curious Non-Technical User)

* **Profile:** Sees LiteSPM mentioned on LinkedIn / Twitter; knows ChatGPT/Claude as web apps, but has little experience with terminal shells or local JSON configurations.
* **Journey: Discovery → Comprehension → Action:**
  1. **Entry Point:** Arrives on Homepage (`/`).
  2. **5-Second Comprehension Test: FAILED (Partial).**
     * *Observation:* Reads "Install AI tools once. Undo them in one command. LiteSPM connects MCP servers, agent skills and plugins to 52 coding agents..."
     * *Confusion:* Does not know what "MCP" means, what "52 coding agents" are, or what a "package manager" does in this context.
  3. **Action Attempted:** Looks for a big "Download App" or "Try in Browser" button.
     * *Friction:* Sees `npm install -g litespm` and a command line interface. The user does not have Node.js or npm installed on their machine.
  4. **Drop-Off Point:** Bounces within 45 seconds because there is no zero-install web trial or GUI app download.
* **Recommendations for Beginner Onboarding:**
  * Add a 1-sentence plain-English subtitle: *"Like an app store for your AI assistants — easily add search, databases, and capabilities to Cursor, Claude, and more without editing code."*
  * Provide a visual video/GIF walkthrough showing LiteSPM running in under 30 seconds.

---

## 2. Persona 2: The "Vibe Coder" (Cursor & Claude Code User)

* **Profile:** Uses Cursor or Claude Code daily to generate applications. Uncomfortable manually editing `cline_mcp_settings.json` or handling environment variables in config files; wants integrations to "just work".
* **Journey: Problem → Search → Selection → Setup:**
  1. **Entry Point:** Lands on `/marketplace` looking for a "GitHub MCP server" or "Postgres adapter".
  2. **Search Experience: SUCCESS.**
     * Types "github" in the search box; results update instantly (< 100ms).
     * Clicks "GitHub MCP Server".
  3. **Installation Intent: SUCCESS with Moderate Friction.**
     * Copies `litespm install github`.
     * Pastes into terminal.
     * If LiteSPM is already installed: Wizard detects Cursor/Claude Code, asks for approval, previews config diff, and writes the server.
     * *Confusion:* If on the website's "Installed" tab, sees "CLI Unavailable" message rather than an explanation that LiteSPM is a terminal tool.
* **Verdict:** High utility once the CLI is installed. Needs a 1-click URL protocol (`litespm://install/github`) to launch the local CLI directly from the browser card.

---

## 3. Persona 3: Experienced Full-Stack Developer

* **Profile:** Senior software engineer utilizing multiple agent hosts (Claude Code CLI, Cursor, Pi Agent). Deep understanding of package managers, Git submodules, and CLI tooling.
* **Journey: Technical Evaluation → Power Workflows:**
  1. **Entry Point:** Evaluates `/docs` and `/agents`.
  2. **Discovery & Validation: EXCELLENT.**
     * Discovers the 52 host adapter matrix (`/agents`).
     * Inspects `/agent/cline` and sees exact config paths and verification commands.
     * Appreciates the `skills use <source> | claude` piping capability.
  3. **Adoption & Trust:**
     * Runs `litespm doctor` and sees comprehensive 10-check diagnostic verification.
     * Tests `litespm restore` and confirms byte-exact rollback of configuration files.
* **Verdict:** High conversion rate and strong product advocacy.

---

## 4. Persona 4: AI Systems & Agent Engineering Specialist

* **Profile:** Architect designing multi-agent workflows; evaluates MCP protocol compliance, transport layers (stdio vs Streamable HTTP / SSE), prompt injection defenses, and schema drift.
* **Journey: Architecture Review → In-Agent Bridge:**
  1. **Entry Point:** Inspects Documentation (`/docs/architecture`) and In-Agent Marketplace.
  2. **Technical Depth Assessment: SUPERB.**
     * Reviews the 13 canonical MCP tools (`search_catalog`, `get_extension`, `prepare_install`, `invoke_capability`).
     * Verifies that LiteSPM runs cold-start MCP handshakes immediately (under 90s timeout protection) so agents never drop connection.
     * Evaluates `internal/interop` plugin manifest parser for partial installation prevention (`LPSM-INSTALL-PARTIAL`).
* **Verdict:** Views LiteSPM as the only production-grade, spec-compliant package manager in the ecosystem.

---

## 5. Persona 5: Security-Conscious Enterprise Engineer

* **Profile:** Enterprise security auditor tasked with vetting third-party developer tooling before internal rollout.
* **Journey: Security Model → Provenance → Supply Chain:**
  1. **Entry Point:** Evaluates `/docs/security` and source repository.
  2. **Security Verification Findings: OUTSTANDING.**
     * Confirms native OS credential vault storage (Windows DPAPI, macOS Keychain, Linux Secret Service); zero tokens stored in plaintext SQLite rows.
     * Confirms that npm installer verifies Sigstore / Fulcio OIDC cryptographic certificates tied to GitHub Actions releases.
     * Verifies Content-Addressable Storage (CAS) preventing zip bombs and path traversal (`archive-slip`).
     * Confirms that LiteSPM servers never proxy or capture local user configuration data.
* **Verdict:** Easily approved for enterprise developer workstation use.

---

## 6. Persona 6: Package Maintainer / Open-Source Publisher

* **Profile:** Creator of an MCP server or `SKILL.md` library seeking distribution and discovery for their tool.
* **Journey: Submission → Listing Creation:**
  1. **Entry Point:** Clicks "Publish" in navigation (`/publish`).
  2. **Form Experience: CLEAN BUT ASYNCHRONOUS.**
     * Sees clear form: Publisher Name, Email, Repository URL, Package Kind, Stated Summary.
     * *Gap:* The submission is an intake request for catalog indexing rather than a self-service developer portal with instant API key issuance or webhooks.
* **Recommendation:** Provide an automated GitHub Action (`litespm-publish-action`) that validates `SKILL.md` or `mcp.json` and submits a PR to the catalog release pipeline automatically.

---

## 7. Master Journey Walkthrough: The Complete Lifecycle

```
[LinkedIn / GitHub] ──> [LiteSPM Homepage] ──> [Marketplace / Bundles] ──> [Select Package]
                                                                                  │
[Clean Undo: litespm restore] <── [Verify: litespm list] <── [Install: litespm install]
```

* **Step 1 (Discovery):** Visitor arrives via social link; impressed by dark technical visual aesthetic.
* **Step 2 (Selection):** Filters by "MCP Servers" and finds Postgres tool.
* **Step 3 (Installation):** Runs single terminal command.
* **Step 4 (Verification):** Tool immediately becomes available in Cursor without restart.
* **Step 5 (Management):** Runs `litespm list` to view inventory.
* **Step 6 (Rollback):** Runs `litespm remove` or `litespm restore`; configuration returns to byte-identical pre-install state.
* **Lifecycle Assessment:** Unrivaled engineering reliability; minor onboarding friction for non-CLI users.
