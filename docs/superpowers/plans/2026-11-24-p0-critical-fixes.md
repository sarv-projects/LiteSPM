# P0 Critical & Broken Out of the Box Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all P0 critical defects preventing out-of-the-box operation: standalone installer bugs (HTTP 404, piped PowerShell crash, POSIX sh escape expansion), CLI `--help` safety (destructive `uninstall --help`, diagnostic execution, crash without keyring, non-zero exits), audit catalog row parsing, bundle installation, and `install remove <slug>` resolution with wizard hints.

---

### Task 1: Standalone Installers (`install.sh` & `install.ps1`)

**Files:**
- `scripts/install.sh`
- `web/public/install.sh`
- `scripts/install.ps1`
- `web/public/install.ps1`

- [ ] **Step 1.1: Fix HTTP 404 default release version in `install.sh` & `web/public/install.sh`**
  When `LITESPM_VERSION` is unset, default download URLs should use `https://github.com/${REPO}/releases/latest/download/...` instead of pinning to an unreleased version.
- [ ] **Step 1.2: Fix `printf` format in `log_info` in `install.sh` & `web/public/install.sh`**
  Change `printf "    %s\n" "$1"` to `printf "    %b\n" "$1"` so escape sequences are properly interpreted under POSIX sh.
- [ ] **Step 1.3: Fix HTTP 404 default release version in `install.ps1` & `web/public/install.ps1`**
  When `$Version` is unset, default download URLs should use `https://github.com/$Repo/releases/latest/download/...`.
- [ ] **Step 1.4: Guard `$PSScriptRoot` in `install.ps1` & `web/public/install.ps1`**
  Guard `Join-Path $PSScriptRoot "..\litespm.exe"` with `if ($PSScriptRoot)` to avoid `ParameterBindingValidationException` during `irm ... | iex` piped execution.

---

### Task 2: CLI Safety & `--help` Handling

**Files:**
- `cmd/litespm/main.go`
- `cmd/litespm/auth.go`
- `cmd/litespm/audit.go`
- `cmd/litespm/capabilities.go`
- `cmd/litespm/auto_update.go`

- [ ] **Step 2.1: Intercept `--help` / `-h` before destructive or stateful commands in `main.go`**
  Ensure `uninstall --help`, `doctor --help`, `host list --help`, `host detect --help`, `catalog sync --help`, and `host --help` display help and exit 0 without executing modifications or scans.
- [ ] **Step 2.2: Fix `auth --help` in `cmd/litespm/auth.go`**
  Check for `--help` / `-h` at the very start of `runAuth` before touching the keyring or state database.
- [ ] **Step 2.3: Fix `search --help` in `cmd/litespm/main.go`**
  Accept `--help` and `-h` in `searchQueryArgs`, display help and exit 0 instead of reporting an error.
- [ ] **Step 2.4: Fix `audit --help` in `cmd/litespm/audit.go`**
  Accept `--help` and `-h` in `parseAuditOptions`, display help and exit 0 instead of returning error.
- [ ] **Step 2.5: Fix `invoke --help` in `cmd/litespm/capabilities.go`**
  Check if the first argument is `--help` or `-h`, display help and exit 0.
- [ ] **Step 2.6: Prevent auto-update checks on `--help` in `cmd/litespm/auto_update.go`**
  Ensure `autoUpdateCommandAllowed` returns `false` when `--help` or `-h` is in `args`.

---

### Task 3: `litespm audit` Catalog Schema Parsing

**Files:**
- `internal/scan/scan.go`
- `cmd/litespm/audit.go`

- [ ] **Step 3.1: Verify `scan.Row` unmarshals both string and object `source` values**
  Verify `SourceRef` implementation and write unit tests confirming both dataset schemas unmarshal and scan without panics or unmarshal errors.

---

### Task 4: `litespm install bundle:<id>` Resolution

**Files:**
- `cmd/litespm/main.go`
- `internal/bundle/bundles.go`

- [ ] **Step 4.1: Audit all 23 bundles against catalog listing items**
  Ensure `bundle:vibe-coding-frontend` and all bundles resolve smoothly. If an item is a skill or unindexed MCP server, ensure proper routing to skills add or catalog lookup.

---

### Task 5: Slug Resolution for `install remove <slug>` & Wizard Hints

**Files:**
- `cmd/litespm/lifecycle_wire.go`
- `cmd/litespm/wizard.go`

- [ ] **Step 5.1: Enhance `resolveRemoveID` in `cmd/litespm/lifecycle_wire.go`**
  Reuse the slug resolver logic from `resolveRestoreInstall` in `restore.go` so `litespm install remove <name>` (e.g. `litespm install remove github`) resolves to the matching install record.
- [ ] **Step 5.2: Update post-install hint in `cmd/litespm/wizard.go`**
  Update lines 2440 and 2514 to include `or 'litespm restore <name>'`.

---

### Task 6: Comprehensive Verification

- [ ] **Step 6.1: Run all unit and integration tests**
  Execute `go test ./cmd/litespm/...` and `go test ./internal/...` to verify zero regressions.
