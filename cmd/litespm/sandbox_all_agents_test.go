package main

// sandbox_all_agents_test.go — the "every agent" sandbox at the command layer.
//
// internal/host/all_hosts_sandbox_test.go proves the adapter API for all 50
// hosts. This test drives the actual `litespm setup --all` implementation
// (applyAllDetectedSetup) against a throwaway home containing a minimal config
// file for every host that supports user scope, then verifies each bridge entry
// through the same VerifySetup the CLI uses.
//
// It intentionally does not install vendor binaries. An "agent" here is its
// documented configuration file; that is the surface LiteSPM edits, and it is
// the only surface a hermetic test can exercise for all 50 hosts.

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
)

func TestSandboxAllAgentsSetupAll(t *testing.T) {
	home := t.TempDir()
	for _, key := range []string{
		"HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME",
		"CLINE_MCP_SETTINGS_PATH", "CLINE_DATA_DIR", "CLINE_DIR",
		"PI_CODING_AGENT_DIR", "GROK_HOME", "CLAUDE_CONFIG_DIR", "CODEX_HOME",
		"OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR", "QWEN_HOME",
	} {
		t.Setenv(key, filepath.Join(home, strings.ToLower(key)))
	}
	// CLINE_MCP_SETTINGS_PATH is a file, not a directory.
	t.Setenv("CLINE_MCP_SETTINGS_PATH", filepath.Join(home, "cline", "cline_mcp_settings.json"))

	ctx := context.Background()
	var expected []host.HostAdapter
	for _, adapter := range host.ListAdapters() {
		if !host.SupportsUserScope(adapter) {
			continue
		}
		configPath, err := adapter.DetectConfig(ctx, domain.ScopeUser)
		if err != nil || configPath == "" {
			t.Logf("%s: no user-scope config path (%v); covered by the adapter sandbox", adapter.Descriptor().HostID, err)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(configPath), 0o700); err != nil {
			t.Fatalf("%s: create config directory: %v", adapter.Descriptor().HostID, err)
		}
		content := "{}"
		if strings.HasSuffix(strings.ToLower(configPath), ".toml") {
			content = ""
		}
		if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
			t.Fatalf("%s: write seed config %s: %v", adapter.Descriptor().HostID, configPath, err)
		}
		expected = append(expected, adapter)
	}
	if len(expected) == 0 {
		t.Fatal("sandbox did not seed a user-scope config for any adapter")
	}

	if code := applyAllDetectedSetup(ctx); code != 0 {
		t.Fatalf("litespm setup --all returned exit code %d", code)
	}

	for _, adapter := range expected {
		desc := adapter.Descriptor()
		verification, err := adapter.VerifySetup(ctx)
		if err != nil {
			t.Errorf("%s: VerifySetup: %v", desc.HostID, err)
			continue
		}
		if verification == nil || !verification.Registered {
			t.Errorf("%s: setup --all did not register the bridge", desc.HostID)
		}
	}
}
