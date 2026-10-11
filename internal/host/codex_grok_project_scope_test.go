package host

// codex_grok_project_scope_test.go — project-scope support for the two TOML
// adapters whose vendors document a project config file next to the repo:
//
//   - Codex: `<root>/.codex/config.toml` (user scope stays
//     `$CODEX_HOME/config.toml`), same `[mcp_servers.<name>]` tables.
//     https://learn.chatgpt.com/docs/extend/mcp,
//     https://learn.chatgpt.com/docs/config-file/config-reference
//   - Grok Build: `<root>/.grok/config.toml` (user scope stays
//     `$GROK_HOME/config.toml`), same tables; the vendor's own
//     `grok mcp add --scope project` writes that file.
//     https://docs.x.ai/build/settings, https://docs.x.ai/build/features/mcp-servers
//
// Verified against those documents 2026-10-11. The round trip mirrors the
// Claude Code pin in entry_install_test.go: install at project scope lands in
// the project's file under the documented container, leaves the user config
// untouched, and RemoveServerEntry at the same scope reopens the same file.

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

// TestCodexAndGrokBuildSupportProjectScope pins the capability gate: both
// adapters opted in through ProjectConfigPather, so the project-scope plan
// builder no longer refuses them.
func TestCodexAndGrokBuildSupportProjectScope(t *testing.T) {
	for _, hostID := range []string{"codex", "grok-build"} {
		adapter, err := GetAdapter(hostID)
		if err != nil {
			t.Fatalf("adapter %s: %v", hostID, err)
		}
		if !SupportsProjectScope(adapter) {
			t.Errorf("SupportsProjectScope(%s)=false, want true (both vendors document a project config.toml)", hostID)
		}
	}
}

// TestProjectScopeInstallRoundTripForCodex pins Codex's project file:
// `<root>/.codex/config.toml` with the entry under `[mcp_servers.<name>]`.
// $CODEX_HOME is redirected to a temp dir and pre-seeded with a sentinel user
// config, so nothing real is touched and "untouched" is a byte comparison, not
// just a missing-file check.
func TestProjectScopeInstallRoundTripForCodex(t *testing.T) {
	home := entryHome(t)
	codexHome := t.TempDir()
	t.Setenv("CODEX_HOME", codexHome)
	ctx := context.Background()
	project := t.TempDir()

	userConfig := filepath.Join(codexHome, "config.toml")
	sentinel := "# my codex settings\nmodel = \"gpt-6.1-sol\"\n"
	if err := os.WriteFile(userConfig, []byte(sentinel), 0o600); err != nil {
		t.Fatal(err)
	}

	result, err := InstallServerEntry(ctx, "codex", ServerEntry{
		Name: "demo", Command: "npx", Args: []string{"-y", "demo-mcp"},
	}, EntryInstallOptions{
		BackupDir:   filepath.Join(home, "backups"),
		Scope:       domain.ScopeProject,
		ProjectRoot: project,
	})
	if err != nil {
		t.Fatalf("project-scope install for codex: %v", err)
	}
	want := filepath.Join(project, ".codex", "config.toml")
	if result.ConfigPath != want {
		t.Errorf("wrote to %s, want the project file %s", result.ConfigPath, want)
	}
	data, readErr := os.ReadFile(want)
	if readErr != nil {
		t.Fatalf("the project .codex/config.toml was not created: %v", readErr)
	}
	if !strings.Contains(string(data), "[mcp_servers.demo]") {
		t.Errorf("the entry is not under [mcp_servers.demo] in the project config:\n%s", data)
	}

	after, readErr := os.ReadFile(userConfig)
	if readErr != nil {
		t.Fatalf("the user config disappeared during a project-scope write: %v", readErr)
	}
	if string(after) != sentinel {
		t.Errorf("a project-scope entry must leave $CODEX_HOME/config.toml untouched:\ngot:\n%s\nwant:\n%s", after, sentinel)
	}

	// Removal reopens the same project file — the entry leaves it without
	// touching the user config.
	rm, err := RemoveServerEntry(ctx, "codex", "demo", domain.ScopeProject, project, filepath.Join(home, "backups"), "")
	if err != nil || !rm.Removed {
		t.Fatalf("remove at the project file: %v %+v", err, rm)
	}
	data, readErr = os.ReadFile(want)
	if readErr != nil {
		t.Fatalf("re-read the project file after removal: %v", readErr)
	}
	if strings.Contains(string(data), "[mcp_servers.demo]") {
		t.Errorf("entry survived removal:\n%s", data)
	}
	if after, readErr = os.ReadFile(userConfig); readErr != nil || string(after) != sentinel {
		t.Errorf("removal must not touch $CODEX_HOME/config.toml: %v\n%s", readErr, after)
	}
}

// TestProjectScopeInstallRoundTripForGrokBuild is the same pin for Grok
// Build's `<root>/.grok/config.toml`, with $GROK_HOME redirected to a temp dir
// and a sentinel user config proving the user scope stayed byte-identical.
func TestProjectScopeInstallRoundTripForGrokBuild(t *testing.T) {
	home := entryHome(t)
	grokHome := t.TempDir()
	t.Setenv("GROK_HOME", grokHome)
	ctx := context.Background()
	project := t.TempDir()

	userConfig := filepath.Join(grokHome, "config.toml")
	sentinel := "# my grok settings\n[ui]\ntheme = \"auto\"\n"
	if err := os.WriteFile(userConfig, []byte(sentinel), 0o600); err != nil {
		t.Fatal(err)
	}

	result, err := InstallServerEntry(ctx, "grok-build", ServerEntry{
		Name: "demo", Command: "npx", Args: []string{"-y", "demo-mcp"},
	}, EntryInstallOptions{
		BackupDir:   filepath.Join(home, "backups"),
		Scope:       domain.ScopeProject,
		ProjectRoot: project,
	})
	if err != nil {
		t.Fatalf("project-scope install for grok-build: %v", err)
	}
	want := filepath.Join(project, ".grok", "config.toml")
	if result.ConfigPath != want {
		t.Errorf("wrote to %s, want the project file %s", result.ConfigPath, want)
	}
	data, readErr := os.ReadFile(want)
	if readErr != nil {
		t.Fatalf("the project .grok/config.toml was not created: %v", readErr)
	}
	if !strings.Contains(string(data), "[mcp_servers.demo]") {
		t.Errorf("the entry is not under [mcp_servers.demo] in the project config:\n%s", data)
	}

	after, readErr := os.ReadFile(userConfig)
	if readErr != nil {
		t.Fatalf("the user config disappeared during a project-scope write: %v", readErr)
	}
	if string(after) != sentinel {
		t.Errorf("a project-scope entry must leave $GROK_HOME/config.toml untouched:\ngot:\n%s\nwant:\n%s", after, sentinel)
	}

	rm, err := RemoveServerEntry(ctx, "grok-build", "demo", domain.ScopeProject, project, filepath.Join(home, "backups"), "")
	if err != nil || !rm.Removed {
		t.Fatalf("remove at the project file: %v %+v", err, rm)
	}
	data, readErr = os.ReadFile(want)
	if readErr != nil {
		t.Fatalf("re-read the project file after removal: %v", readErr)
	}
	if strings.Contains(string(data), "[mcp_servers.demo]") {
		t.Errorf("entry survived removal:\n%s", data)
	}
	if after, readErr = os.ReadFile(userConfig); readErr != nil || string(after) != sentinel {
		t.Errorf("removal must not touch $GROK_HOME/config.toml: %v\n%s", readErr, after)
	}
}
