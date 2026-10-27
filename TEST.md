# Testing Guide: Cline, Pi Agent & Grok Build Adapters

This document details the test scenarios, mock configurations, and verification procedures for the initial trio of agent adapters: **Cline**, **Pi Agent**, and **Grok Build**.

---

## 1. Test Environment Setup & Mock Fixtures

Golden fixtures and test files are maintained in `fixtures/hosts/`:

```text
fixtures/hosts/
  ├── claude/
  │   └── claude.json
  ├── cline/
  │   └── existing_servers_cline_mcp_settings.json
  ├── codex/
  │   └── config.toml
  ├── grok/
  │   └── valid_grok_config.toml
  ├── opencode/
  │   ├── opencode_v1.json
  │   └── opencode_v2.json
  └── pi/
      └── valid_mcp.json
```

### 1.1 Mock Cline Fixture with Pre-Existing Servers
`fixtures/hosts/cline/existing_servers_cline_mcp_settings.json`:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/test/workspace"],
      "disabled": false
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_mocktoken12345"
      },
      "disabled": true
    }
  }
}
```

### 1.2 Mock Pi Agent Fixture
`fixtures/hosts/pi/valid_mcp.json`:
```json
{
  "model": "anthropic:claude-3-5-sonnet",
  "mcpServers": {
    "local_bash": {
      "command": "/bin/bash",
      "args": ["-l"]
    }
  }
}
```
Pi's configuration key is `mcpServers`, and it is the only container LiteSPM writes or reads for Pi (`internal/host/piagent.go`). The fixture matches that key, and `TestGoldenFixturesCompliance/PiAgent_Nested` merges the bridge into `mcpServers`, asserts the pre-existing `local_bash` server survives, and asserts nothing is written into a container Pi does not read. Project scope is `.pi/mcp.json` (trust-gated).

### 1.3 Mock Grok Build Fixture
`fixtures/hosts/grok/valid_grok_config.toml` (located at `~/.grok/config.toml`; project scope `.grok/config.toml`):
```toml
# Grok Build configuration file
[general]
theme = "dark"
auto_reload = true

[mcp_servers.sqlite]
command = "uvx"
args = ["mcp-server-sqlite", "--db-path", "test.db"]
```

### 1.4 Additional Host Fixtures
*   `fixtures/hosts/claude/claude.json` — user-scope `mcpServers` layout for Claude Code.
*   `fixtures/hosts/codex/config.toml` — `[mcp_servers.*]` layout for OpenAI Codex.
*   `fixtures/hosts/opencode/opencode_v1.json` — flat `mcp.<name>` layout.
*   `fixtures/hosts/opencode/opencode_v2.json` — nested `mcp.servers` layout.

---

## 2. Test Cases & Verification Procedures

### Test Case 1: Automated Configuration Discovery
*   **Objective:** Verify that `DetectConfig` locates target files across operating systems (including candidate paths for Pi: `~/.pi/agent/mcp.json`, Grok: `~/.grok/config.toml`, Codex: `~/.codex/config.toml`, Claude Code: `~/.claude.json`, OpenCode: `~/.config/opencode/opencode.json`).
*   **Procedure:**
    1. Set mock environment variables (`APPDATA` on Windows, `HOME` on Unix).
    2. Invoke `adapter.DetectConfig(ctx, domain.ScopeUser)`.
    3. Assert returned path matches the platform specification.

### Test Case 2: Missing Configuration Fallback Flow
*   **Objective:** Verify the interactive CLI gracefully prompts when configuration is missing, and
    that the path it writes is the path the user agreed to.
*   **Status:** `litespm setup` (and the bare `litespm`) opens the interactive wizard, which needs a
    terminal; `litespm setup --agent <host-id>` is the non-interactive form and runs the same
    plan/apply path as `litespm host setup <host-id>` (`cmd/litespm/main.go:537-578`). `litespm init`
    does not open the wizard — it scaffolds a `SKILL.md` (`:72-75`, `cmd/litespm/skills_init.go`).
*   **Fixed 2026-10-14 (the manual path is now path-exact by construction):** `host.PlanSetupAt`
    refuses a plan whose `ConfigPath` is not the named path (`internal/host/types.go:82-117`), and the
    wizard writes only after the `Write this change? [Y/n]` confirmation
    (`cmd/litespm/wizard.go:450-483`). Before this, `PlanSetup` re-derived the path from
    `DetectConfig` and the typed path was accepted but ignored; that is the defect this procedure
    exists to catch. Pinned by `TestWizard_ManualPathIsThePathWritten` and
    `TestWizard_RefusesUnplannablePathWithoutWriting` (`cmd/litespm/wizard_test.go`;
    `go test ./cmd/litespm/ -run 'TestWizard_(ManualPath|RefusesUnplannable)'`).
*   **Procedure:**
    1. Run `litespm` (wizard) in an environment without VS Code and choose Cline.
    2. Answer `n` to the proposed configuration file. (When detection fails outright the same menu
       follows `Could not work out where Cline keeps its configuration file.` —
       `cmd/litespm/wizard.go:385`.)
    3. Assert stdout displays the fallback menu (`[1] Type the full path of the configuration file`,
       `[2] Print a snippet to paste into the file yourself`, `[3] Look for the file again`).
    4. Choose `[1]` and pass a custom path via stdin
       (`fixtures/hosts/cline/existing_servers_cline_mcp_settings.json`).
    5. Assert the preview names that path, and that the file written is that path — the proposed
       file must be left untouched. **Must fail if the write lands anywhere else.**

### Test Case 3: Pre-Edit Backup & Non-Destructive Merge
*   **Objective:** Ensure unrelated keys and pre-existing servers are never overwritten.
*   **Procedure:**
    1. Apply setup to `existing_servers_cline_mcp_settings.json`.
    2. Verify `DATA_ROOT/backups/cline_<YYYYMMDD_HHMMSS>_<8-hex>.bak` was created with identical
       pre-edit content (`internal/host/backup.go:19-45`; flat directory, mode `0600`).
    3. Assert `filesystem` and `github` entries remain intact in the modified file.
    4. Assert `mcpServers.litespm` is injected with the version-pinned executable path.

### Test Case 4: Pre-Existing Tool Discovery & Read-Only Detection (Installed Tab) (`DESIGNED` — `adopt_tool` does not exist)
*   **Objective:** Verify that LiteSPM scans and detects pre-existing native tools in read-only mode.
*   **Status:** Detection is implemented (`tools.list` returns external components from
    `DetectPreExistingComponents`, `cmd/litespm/main.go:2356-2369`). There is **no `adopt_tool()`
    tool and no `LPSM-HOST-READONLY-EXTERNAL` error code**; adopting an external tool is not
    implemented ([STATUS.md](STATUS.md) §5).
*   **Procedure:**
    1. Boot Bridge Shim with `--host cline`.
    2. Call MCP tool `list_installed()`.
    3. Assert the returned list includes the pre-existing tools marked `isExternal: true` with no
       health status (the daemon does not health-check installs, so status renders `— Unknown`
       rather than `ready`/`disabled`).
    4. Assert no mutation of external entries is possible (there is no adopt/toggle tool).

### Test Case 5: In-agent Marketplace Prompt
*   **Objective:** Publish the MCP marketplace prompt to each bridge host and show only verified
    host-specific commands in the setup wizard.
*   **Status:** The bridge advertises `prompts` and serves `marketplace` for every MCP host.
    Host clients choose whether to show the prompt as a slash command, a picker, or not at all.
    `SlashCommandTrigger` stores only verified literal commands; an empty value means the wizard
    instructs users to ask the agent to browse through the connected MCP tools. The Pi Agent also
    creates `<agent-dir>/extensions/litespm.ts`, which registers its native `/marketplace` command
    and `/litespm` helper. That extension is not removed by `host remove`/`uninstall`.
*   **Procedure:** `internal/bridge/bridge_test.go` checks prompt capability, listing, and retrieval
    for all 50 MCP host IDs. `internal/host/targets_data_test.go` pins exact documented commands,
    and `cmd/litespm/wizard_test.go` confirms the wizard uses a command only when one is verified.
    Agent entry-point evidence is maintained in
    `docs/audits/2026-10-25/marketplace-agent-entrypoints.md`.

### Test Case 6: Dynamic Runtime Adapter Advisory Fetching (`DESIGNED` — not implemented)
*   **Objective:** Verify the client queries the remote manifest at runtime for compatibility advisories without executing remote code.
*   **Status:** The setup flow does **not** fetch `/v1/current.json`. The only wizard step that does
    is the explicit *Update the capability catalog* action, which names the origin, says it installs
    nothing, and asks first (`cmd/litespm/wizard.go:656-705`) — the same `catalog sync` the CLI runs.
    Advisories are not published at all (`TODO.md` `LPSM-E006`), and there is **no `--catalog-url`
    flag**. Runtime advisory fetching is not implemented.
*   **Procedure (intended):**
    1. Start local mock HTTP server serving `/v1/current.json` (the `advisories` array is **not published today** — the Go-built pointer carries no such field and the dead key was removed from `web/data/release.json`, `TODO.md` `LPSM-E006`; there is no separate `/v1/adapters.json` endpoint).
    2. Point the client at it via `LITESPM_REGISTRY_URL` (the implemented override; no `--catalog-url` flag exists).
    3. Verify that advisory metadata and version warnings from `current.json` appear without executing remote code.
    4. Disconnect network and verify clean fallback to compiled-in adapters.

---

## 3. Automated Test Execution

Run the adapter test suite:

```bash
# Run unit tests for all host adapters
go test -v ./internal/host/...

# Adapters are separate files in the single `host` package (not subpackages),
# so adapter-specific tests are selected with -run filters, e.g.:
go test -v ./internal/host/... -run 'Test(PiAgent|GrokBuild|Codex|ClaudeCode|OpenCode)Adapter'

# Run end-to-end integration harness (package `test`: canary, conformance, hostile-archive fuzz)
go test -v ./test/...
```
