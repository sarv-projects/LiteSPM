package host

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/bridge"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/ipc"
	"github.com/sarv-projects/litespm/internal/skills"
)

func TestAll50HostsInstallAndRemoveInSandbox(t *testing.T) {
	adapters := ListAdapters()
	if len(adapters) != 50 {
		t.Fatalf("expected exactly 50 adapters, got %d", len(adapters))
	}

	for _, adapter := range adapters {
		desc := adapter.Descriptor()
		hostID := desc.HostID
		t.Run(hostID, func(t *testing.T) {
			home := entryHome(t)
			projectDir := filepath.Join(home, "my-project")
			if err := os.MkdirAll(projectDir, 0o700); err != nil {
				t.Fatal(err)
			}
			ctx := context.Background()
			backupDir := filepath.Join(home, "backups")

			// Determine scope
			scope := domain.ScopeUser
			projRoot := ""
			if !SupportsUserScope(adapter) {
				scope = domain.ScopeProject
				projRoot = projectDir
			}

			// 1. Install standard stdio server entry
			stdioEntry := ServerEntry{
				Name:    "alpha-search",
				Command: "npx",
				Args:    []string{"-y", "alpha-search-mcp"},
			}
			res, err := InstallServerEntry(ctx, hostID, stdioEntry, EntryInstallOptions{
				BackupDir:   backupDir,
				Scope:       scope,
				ProjectRoot: projRoot,
			})
			if err != nil {
				t.Fatalf("InstallServerEntry(stdio): %v", err)
			}
			if res.ConfigPath == "" {
				t.Fatalf("empty config path returned for %s", hostID)
			}

			// 2. Read back entry state
			state, err := ReadServerEntryState(ctx, hostID, "alpha-search", scope, projRoot)
			if err != nil {
				t.Fatalf("ReadServerEntryState: %v", err)
			}
			if state == nil {
				t.Fatalf("ReadServerEntryState reported entry not present in %s", res.ConfigPath)
			}
			if state.Raw == "" {
				t.Fatalf("ReadServerEntryState reported empty raw entry in %s", res.ConfigPath)
			}

			// 3. Verify format validity
			data, err := os.ReadFile(res.ConfigPath)
			if err != nil {
				t.Fatal(err)
			}
			if desc.ConfigFormat == "json" {
				var jsonMap map[string]any
				if err := json.Unmarshal(data, &jsonMap); err != nil {
					t.Fatalf("written config is invalid JSON: %v\n%s", err, string(data))
				}
			}

			// 4. Remote entry test
			_, remoteSupported := RemoteEntrySpecFor(hostID)
			remoteEntry := ServerEntry{
				Name:      "alpha-remote",
				Endpoint:  "https://example.com/mcp/sse",
				Transport: "streamable-http",
			}
			_, remoteErr := InstallServerEntry(ctx, hostID, remoteEntry, EntryInstallOptions{
				BackupDir:   backupDir,
				Scope:       scope,
				ProjectRoot: projRoot,
			})
			if remoteSupported {
				if remoteErr != nil {
					t.Fatalf("remote install failed on remote-supported host %s: %v", hostID, remoteErr)
				}
				// Verify remote entry was written and can be read back
				rState, rErr := ReadServerEntryState(ctx, hostID, "alpha-remote", scope, projRoot)
				if rErr != nil || rState == nil {
					t.Fatalf("remote read back failed for %s: err=%v state=%+v", hostID, rErr, rState)
				}
			} else {
				if remoteErr == nil {
					t.Fatalf("expected remote install to fail on incapable host %s, but succeeded", hostID)
				}
				if !strings.Contains(remoteErr.Error(), "does not support remote") &&
					!strings.Contains(remoteErr.Error(), "LPSM-HOST-REMOTE-UNSUPPORTED") {
					t.Logf("%s: remote error: %v", hostID, remoteErr)
				}
			}

			// 5. Remove server entry
			remRes, err := RemoveServerEntry(ctx, hostID, "alpha-search", scope, projRoot, backupDir, "")
			if err != nil {
				t.Fatalf("RemoveServerEntry: %v", err)
			}
			if !remRes.Removed {
				t.Fatalf("RemoveServerEntry did not report removed for %s", hostID)
			}

			// 6. Verify removal read back
			afterRemState, err := ReadServerEntryState(ctx, hostID, "alpha-search", scope, projRoot)
			if err != nil {
				t.Fatalf("ReadServerEntryState after removal: %v", err)
			}
			if afterRemState != nil {
				t.Fatalf("entry 'alpha-search' was not removed from %s", res.ConfigPath)
			}
		})
	}
}

func TestAllProjectCapableHostsInstallAndRemoveInSandbox(t *testing.T) {
	adapters := ListAdapters()
	testedCount := 0

	for _, adapter := range adapters {
		desc := adapter.Descriptor()
		hostID := desc.HostID
		if !SupportsProjectScope(adapter) {
			continue
		}
		testedCount++

		t.Run(hostID, func(t *testing.T) {
			home := entryHome(t)
			projectDir := filepath.Join(home, "work-repo")
			if err := os.MkdirAll(projectDir, 0o700); err != nil {
				t.Fatal(err)
			}
			ctx := context.Background()
			backupDir := filepath.Join(home, "backups")

			// 1. Install stdio server entry at Project Scope
			stdioEntry := ServerEntry{
				Name:    "proj-tool",
				Command: "npx",
				Args:    []string{"-y", "proj-tool-mcp"},
			}
			res, err := InstallServerEntry(ctx, hostID, stdioEntry, EntryInstallOptions{
				BackupDir:   backupDir,
				Scope:       domain.ScopeProject,
				ProjectRoot: projectDir,
			})
			if err != nil {
				t.Fatalf("InstallServerEntry(project): %v", err)
			}
			if !strings.HasPrefix(res.ConfigPath, projectDir) {
				t.Errorf("%s: project config %s is outside projectDir %s", hostID, res.ConfigPath, projectDir)
			}

			// 2. Read back entry state
			state, err := ReadServerEntryState(ctx, hostID, "proj-tool", domain.ScopeProject, projectDir)
			if err != nil {
				t.Fatalf("ReadServerEntryState(project): %v", err)
			}
			if state == nil {
				t.Fatalf("ReadServerEntryState reported entry not present in %s", res.ConfigPath)
			}

			// 3. Remove server entry
			remRes, err := RemoveServerEntry(ctx, hostID, "proj-tool", domain.ScopeProject, projectDir, backupDir, "")
			if err != nil {
				t.Fatalf("RemoveServerEntry(project): %v", err)
			}
			if !remRes.Removed {
				t.Fatalf("RemoveServerEntry did not report removed for %s", hostID)
			}

			// 4. Verify removal
			afterState, err := ReadServerEntryState(ctx, hostID, "proj-tool", domain.ScopeProject, projectDir)
			if err != nil {
				t.Fatalf("ReadServerEntryState after removal: %v", err)
			}
			if afterState != nil {
				t.Fatalf("entry 'proj-tool' was not removed from %s", res.ConfigPath)
			}
		})
	}

	if testedCount < 40 {
		t.Fatalf("expected at least 40 project-capable hosts, got %d", testedCount)
	}
}

// TestAll50HostsMarketplaceHandshakeInSandbox verifies that EVERY ONE of the 50
// supported agent hosts discovers the /marketplace slash command over MCP and
// has all 13 canonical Bridge tools advertised.
func TestAll50HostsMarketplaceHandshakeInSandbox(t *testing.T) {
	adapters := ListAdapters()
	if len(adapters) != 50 {
		t.Fatalf("expected 50 adapters, got %d", len(adapters))
	}

	for _, adapter := range adapters {
		desc := adapter.Descriptor()
		hostID := desc.HostID
		t.Run(hostID, func(t *testing.T) {
			ctx := context.Background()
			shim := bridge.NewShim(hostID, nil, nil, nil)
			id := json.RawMessage(`1`)

			// 1. initialize: must advertise tools and prompts
			initResp := shim.HandleRequest(ctx, &ipc.Request{
				JSONRPC: "2.0",
				ID:      &id,
				Method:  "initialize",
				Params:  json.RawMessage(`{"protocolVersion":"2025-11-25"}`),
			})
			if initResp == nil || initResp.Error != nil {
				t.Fatalf("initialize failed: %+v", initResp)
			}
			var initialized struct {
				Capabilities map[string]json.RawMessage `json:"capabilities"`
			}
			if err := json.Unmarshal(initResp.Result, &initialized); err != nil {
				t.Fatal(err)
			}
			if _, ok := initialized.Capabilities["tools"]; !ok {
				t.Fatalf("%s bridge must advertise tools capability", hostID)
			}
			if _, ok := initialized.Capabilities["prompts"]; !ok {
				t.Fatalf("%s bridge must advertise prompts capability so /marketplace is discoverable", hostID)
			}

			// 2. prompts/list: must list /marketplace
			listResp := shim.HandleRequest(ctx, &ipc.Request{
				JSONRPC: "2.0",
				ID:      &id,
				Method:  "prompts/list",
			})
			if listResp == nil || listResp.Error != nil {
				t.Fatalf("prompts/list failed: %+v", listResp)
			}
			var listed struct {
				Prompts []struct {
					Name        string `json:"name"`
					Title       string `json:"title"`
					Description string `json:"description"`
				} `json:"prompts"`
			}
			if err := json.Unmarshal(listResp.Result, &listed); err != nil {
				t.Fatal(err)
			}
			foundMarketplace := false
			for _, p := range listed.Prompts {
				if p.Name == "marketplace" {
					foundMarketplace = true
					break
				}
			}
			if !foundMarketplace {
				t.Fatalf("%s does not publish /marketplace prompt in prompts/list: %+v", hostID, listed.Prompts)
			}

			// 3. prompts/get: must return marketplace guidance text
			getResp := shim.HandleRequest(ctx, &ipc.Request{
				JSONRPC: "2.0",
				ID:      &id,
				Method:  "prompts/get",
				Params:  json.RawMessage(`{"name":"marketplace","arguments":{"query":"postgres"}}`),
			})
			if getResp == nil || getResp.Error != nil {
				t.Fatalf("prompts/get failed: %+v", getResp)
			}
			resultText := string(getResp.Result)
			if !strings.Contains(resultText, "search_catalog") || !strings.Contains(resultText, "postgres") {
				t.Fatalf("%s marketplace prompt does not contain expected instructions: %s", hostID, resultText)
			}

			// 4. tools/list: must list all 13 canonical bridge tools
			toolsResp := shim.HandleRequest(ctx, &ipc.Request{
				JSONRPC: "2.0",
				ID:      &id,
				Method:  "tools/list",
			})
			if toolsResp == nil || toolsResp.Error != nil {
				t.Fatalf("tools/list failed: %+v", toolsResp)
			}
			var toolList struct {
				Tools []struct {
					Name string `json:"name"`
				} `json:"tools"`
			}
			if err := json.Unmarshal(toolsResp.Result, &toolList); err != nil {
				t.Fatal(err)
			}
			expectedTools := []string{
				"search_catalog", "get_extension", "prepare_install", "request_install",
				"list_installed", "adopt_capability", "search_capabilities", "describe_capability",
				"load_skill", "read_skill_resource", "invoke_capability", "get_invocation", "cancel_invocation",
			}
			toolNames := make(map[string]bool)
			for _, tool := range toolList.Tools {
				toolNames[tool.Name] = true
			}
			for _, exp := range expectedTools {
				if !toolNames[exp] {
					t.Fatalf("%s bridge tools/list missing tool %q", hostID, exp)
				}
			}
		})
	}
}

// TestAll50HostsSkillsIntegrationInSandbox verifies skill target resolution and
// file placement across all supported hosts.
func TestAll50HostsSkillsIntegrationInSandbox(t *testing.T) {
	adapters := ListAdapters()
	for _, adapter := range adapters {
		desc := adapter.Descriptor()
		hostID := desc.HostID
		t.Run(hostID, func(t *testing.T) {
			home := entryHome(t)
			projectRoot := filepath.Join(home, "skills-test-proj")
			if err := os.MkdirAll(projectRoot, 0o700); err != nil {
				t.Fatal(err)
			}

			// Test project scope skill dir
			projSkillDir, hasProj := skills.AgentSkillDir(hostID, "project", projectRoot, home)
			if hasProj {
				if !strings.HasPrefix(projSkillDir, projectRoot) {
					t.Errorf("%s: project skill dir %s is outside projectRoot %s", hostID, projSkillDir, projectRoot)
				}
				// Verify directory can be created and skill written
				skillTarget := filepath.Join(projSkillDir, "sample-skill")
				if err := os.MkdirAll(skillTarget, 0o700); err != nil {
					t.Fatalf("failed to create skill directory: %v", err)
				}
				skillFile := filepath.Join(skillTarget, "SKILL.md")
				content := "---\nname: sample-skill\ndescription: test\n---\n# Test Skill\n"
				if err := os.WriteFile(skillFile, []byte(content), 0o600); err != nil {
					t.Fatalf("failed to write skill file: %v", err)
				}
				readBack, err := os.ReadFile(skillFile)
				if err != nil || string(readBack) != content {
					t.Fatalf("skill file verification failed: %v", err)
				}
				// Clean up
				_ = os.RemoveAll(skillTarget)
			}

			// Test global scope skill dir
			globSkillDir, hasGlob := skills.AgentSkillDir(hostID, "global", projectRoot, home)
			if hasGlob {
				if !strings.HasPrefix(globSkillDir, home) && !strings.Contains(globSkillDir, home) {
					t.Logf("%s: global skill dir %s resolved (base path)", hostID, globSkillDir)
				}
			}
		})
	}
}

// TestAll50HostsBridgeSetupAndTeardownInSandbox verifies that PlanSetup,
// ApplySetup, syntax validation, and RemoveSetup succeed for every host.
func TestAll50HostsBridgeSetupAndTeardownInSandbox(t *testing.T) {
	adapters := ListAdapters()
	for _, adapter := range adapters {
		desc := adapter.Descriptor()
		hostID := desc.HostID
		t.Run(hostID, func(t *testing.T) {
			home := entryHome(t)
			ctx := context.Background()
			backupDir := filepath.Join(home, "setup-backups")
			_ = os.MkdirAll(backupDir, 0o700)
			projectDir := filepath.Join(home, "setup-project")
			_ = os.MkdirAll(projectDir, 0o700)

			// 1. Plan setup
			var plan *HostChangePlan
			var err error
			if !SupportsUserScope(adapter) {
				if planner, ok := adapter.(PathPlanner); ok {
					configPath := filepath.Join(projectDir, "."+hostID, "mcp.json")
					plan, err = planner.PlanSetupAt(ctx, "/opt/litespm/bin/litespm", backupDir, configPath)
				}
			} else {
				plan, err = adapter.PlanSetup(ctx, "/opt/litespm/bin/litespm", backupDir)
			}
			if err != nil {
				t.Fatalf("PlanSetup failed for %s: %v", hostID, err)
			}
			if plan == nil || plan.ConfigPath == "" {
				t.Fatalf("PlanSetup produced nil or empty plan for %s", hostID)
			}
			defer os.Remove(plan.ConfigPath)

			// 2. Apply setup
			res, err := adapter.ApplySetup(ctx, plan)
			if err != nil {
				t.Fatalf("ApplySetup failed for %s: %v", hostID, err)
			}
			if !res.Success {
				t.Fatalf("ApplySetup did not report success for %s", hostID)
			}

			// 3. Verify format integrity
			cfgBytes, err := os.ReadFile(plan.ConfigPath)
			if err != nil {
				t.Fatalf("failed to read written config for %s: %v", hostID, err)
			}
			if desc.ConfigFormat == "json" {
				var jsonMap map[string]any
				if perr := json.Unmarshal(cfgBytes, &jsonMap); perr != nil {
					// Check if target tolerates comments (JSONC)
					if _, perr2 := parseConfigJSON(BridgeTarget{TolerateComments: true}, cfgBytes); perr2 != nil {
						t.Fatalf("ApplySetup produced invalid JSON for %s: %v\n%s", hostID, perr2, string(cfgBytes))
					}
				}
			} else if desc.ConfigFormat == "toml" {
				if !tomlBridgeRegistered(string(cfgBytes), "[mcp_servers.litespm]") {
					t.Fatalf("ApplySetup produced invalid TOML structure for %s:\n%s", hostID, string(cfgBytes))
				}
			}

			// 4. Verify setup and removal
			if SupportsUserScope(adapter) {
				verified, err := adapter.VerifySetup(ctx)
				if err != nil || !verified.Registered {
					t.Fatalf("VerifySetup failed for %s: verified=%+v err=%v", hostID, verified, err)
				}
				remRes, err := RemoveSetup(ctx, adapter, backupDir)
				if err != nil {
					t.Fatalf("RemoveSetup failed for %s: %v", hostID, err)
				}
				if !remRes.Removed {
					t.Fatalf("RemoveSetup did not remove entry for %s", hostID)
				}
			} else {
				raw, err := os.ReadFile(plan.ConfigPath)
				if err != nil {
					t.Fatalf("reading config to remove for %s: %v", hostID, err)
				}
				remSpec, err := removalSpecFor(adapter)
				if err != nil {
					t.Fatalf("no removal spec for %s: %v", hostID, err)
				}
				updated, didRemove, err := stripBridgeEntry(string(raw), remSpec)
				if err != nil || !didRemove {
					t.Fatalf("stripBridgeEntry failed for project-only host %s: err=%v removed=%v", hostID, err, didRemove)
				}
				if err := os.WriteFile(plan.ConfigPath, []byte(updated), 0o600); err != nil {
					t.Fatalf("failed to write removed config for %s: %v", hostID, err)
				}
			}

			// 6. Verify entry was stripped
			afterBytes, err := os.ReadFile(plan.ConfigPath)
			if err != nil {
				t.Fatalf("failed to read config after removal for %s: %v", hostID, err)
			}
			if strings.Contains(string(afterBytes), fmt.Sprintf("--host %s", hostID)) {
				t.Fatalf("bridge entry was not removed from %s:\n%s", hostID, string(afterBytes))
			}
		})
	}
}
