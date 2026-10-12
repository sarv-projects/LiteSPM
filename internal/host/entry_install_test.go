package host

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

func entryHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	// LOCALAPPDATA must be pinned too. Windows hosts that document it (Crush:
	// %LOCALAPPDATA%\crush\crush.json) otherwise resolved to the machine's real
	// profile — a path OUTSIDE the sandbox, so the test both inspected a file
	// it did not create and left the sandbox's purpose unmet.
	t.Setenv("LOCALAPPDATA", filepath.Join(home, "AppData", "Local"))
	return home
}

// TestInstallServerEntryPreservesTheRestOfTheConfig is the property that matters
// most for an installer: it adds ONE member and leaves the user's file otherwise
// untouched, byte for byte.
func TestInstallServerEntryPreservesTheRestOfTheConfig(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()

	claudeFile := filepath.Join(home, ".claude.json")
	original := "{\n  // my settings\n  \"theme\": \"One Dark\",\n" +
		"  \"mcpServers\": { \"mine\": { \"command\": \"npx\", \"args\": [\"-y\", \"mine\"] } }\n}\n"
	if err := os.WriteFile(claudeFile, []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}

	result, err := InstallServerEntry(ctx, "claude-code", ServerEntry{
		Name: "brave-search", Command: "npx", Args: []string{"-y", "brave-search-mcp-server"},
	}, EntryInstallOptions{BackupDir: filepath.Join(home, "backups"), Scope: domain.ScopeUser})
	if err != nil {
		t.Fatalf("InstallServerEntry: %v", err)
	}
	if result.HostID != "claude-code" || result.Replaced || result.Created {
		t.Errorf("unexpected result: %+v", result)
	}

	after, err := os.ReadFile(claudeFile)
	if err != nil {
		t.Fatal(err)
	}
	got := string(after)
	for _, want := range []string{"// my settings", `"theme": "One Dark"`, `"mine": { "command": "npx", "args": ["-y", "mine"] }`} {
		if !strings.Contains(got, want) {
			t.Errorf("install destroyed %q:\n%s", want, got)
		}
	}
	if strings.Count(got, `"command"`) != 2 {
		t.Errorf("expected exactly one new command entry:\n%s", got)
	}
	if !strings.HasSuffix(got, "}\n") {
		t.Errorf("trailing newline lost:\n%q", got)
	}

	// A backup of the pre-edit file must exist, since this is a user file.
	entries, err := os.ReadDir(filepath.Join(home, "backups"))
	if err != nil || len(entries) == 0 {
		t.Fatalf("no backup was written (err=%v)", err)
	}
}

// TestInstallServerEntryRefusesCollisions stops an install from silently
// reconfiguring a server the user set up by hand.
func TestInstallServerEntryRefusesCollisions(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()
	claudeFile := filepath.Join(home, ".claude.json")
	original := `{"mcpServers":{"mine":{"command":"/usr/local/bin/my-own-server"}}}`
	if err := os.WriteFile(claudeFile, []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}

	entry := ServerEntry{Name: "mine", Command: "npx", Args: []string{"-y", "other"}}
	if _, err := InstallServerEntry(ctx, "claude-code", entry, EntryInstallOptions{
		BackupDir: filepath.Join(home, "backups"), Scope: domain.ScopeUser,
	}); err == nil {
		t.Fatal("install overwrote an existing entry without --force")
	}

	after, _ := os.ReadFile(claudeFile)
	if string(after) != original {
		t.Errorf("a refused install must not modify the file:\n%s", after)
	}

	// With force it replaces, and says so.
	result, err := InstallServerEntry(ctx, "claude-code", entry, EntryInstallOptions{
		BackupDir: filepath.Join(home, "backups"), Scope: domain.ScopeUser, Force: true,
	})
	if err != nil {
		t.Fatalf("forced install: %v", err)
	}
	if !result.Replaced {
		t.Errorf("forced install did not report a replacement: %+v", result)
	}
	after, _ = os.ReadFile(claudeFile)
	if !strings.Contains(string(after), "-y") || strings.Contains(string(after), "my-own-server") {
		t.Errorf("forced install did not replace the entry:\n%s", after)
	}
}

func TestAtomicWriteFileIfUnchangedRejectsConcurrentEdit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("user edit"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := AtomicWriteFileIfUnchanged(path, []byte("merged"), 0o600, []byte("original"), true); err == nil {
		t.Fatal("stale config snapshot was written over a concurrent edit")
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != "user edit" {
		t.Fatalf("concurrent edit was overwritten: %q", after)
	}
}

func TestAtomicWriteFileIfUnchangedRefusesUnexpectedCreate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte("created concurrently"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := AtomicWriteFileIfUnchanged(path, []byte("replacement"), 0o600, nil, false); err == nil {
		t.Fatal("unexpectedly replaced a file created after the absent snapshot")
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != "created concurrently" {
		t.Fatalf("concurrent create was overwritten: %q", after)
	}
}

func TestConcurrentInstallServerEntriesPreserveBothMerges(t *testing.T) {
	home := entryHome(t)
	configPath := filepath.Join(home, ".claude.json")
	if err := os.WriteFile(configPath, []byte(`{"mcpServers":{"mine":{"command":"npx"}}}`), 0o600); err != nil {
		t.Fatal(err)
	}

	start := make(chan struct{})
	errCh := make(chan error, 2)
	var wg sync.WaitGroup
	for _, name := range []string{"alpha", "beta"} {
		name := name
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := InstallServerEntry(context.Background(), "claude-code", ServerEntry{
				Name: name, Command: "npx", Args: []string{"-y", name},
			}, EntryInstallOptions{Scope: domain.ScopeUser, BackupDir: t.TempDir()})
			errCh <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			t.Fatalf("concurrent entry install failed: %v", err)
		}
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{`"alpha"`, `"beta"`, `"mine"`} {
		if !strings.Contains(string(data), name) {
			t.Errorf("merged config lost %s: %s", name, data)
		}
	}
}

func TestRollbackConfigWriteDoesNotOverwriteEditsAfterInstall(t *testing.T) {
	for _, tc := range []struct {
		name    string
		created bool
		changed bool
	}{
		{name: "restore unchanged existing config"},
		{name: "preserve edited existing config", changed: true},
		{name: "remove unchanged created config", created: true},
		{name: "preserve edited created config", created: true, changed: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			home := entryHome(t)
			configPath := filepath.Join(home, ".claude.json")
			original := []byte(`{"theme":"dark","mcpServers":{"mine":{"command":"npx"}}}`)
			if !tc.created {
				if err := os.WriteFile(configPath, original, 0o600); err != nil {
					t.Fatal(err)
				}
			}
			result, err := InstallServerEntry(context.Background(), "claude-code", ServerEntry{
				Name: "demo", Command: "npx", Args: []string{"-y", "demo"},
			}, EntryInstallOptions{Scope: domain.ScopeUser, BackupDir: filepath.Join(home, "backups")})
			if err != nil {
				t.Fatalf("InstallServerEntry: %v", err)
			}

			var edited []byte
			if tc.changed {
				written, err := os.ReadFile(configPath)
				if err != nil {
					t.Fatal(err)
				}
				edited = append(written, []byte("\n// concurrent user edit\n")...)
				if err := os.WriteFile(configPath, edited, 0o600); err != nil {
					t.Fatal(err)
				}
			}

			err = RollbackConfigWrite(result.ConfigPath, result.BackupPath, result.WrittenDigest)
			if tc.changed {
				if err == nil {
					t.Fatal("rollback unexpectedly overwrote a later config edit")
				}
				if got, readErr := os.ReadFile(configPath); readErr != nil || string(got) != string(edited) {
					t.Fatalf("later edit was not preserved: got %q, read error %v", got, readErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("rollback unchanged config: %v", err)
			}
			if tc.created {
				if _, err := os.Stat(configPath); !os.IsNotExist(err) {
					t.Fatalf("created config still exists after rollback: %v", err)
				}
			} else if got, err := os.ReadFile(configPath); err != nil || string(got) != string(original) {
				t.Fatalf("pre-install config was not restored: got %q, err %v", got, err)
			}
		})
	}
}

func TestInstallServerEntryRejectsBadNames(t *testing.T) {
	ctx := context.Background()
	for _, name := range []string{"", "litespm", "has space", "quote\"name", "dot.name", "../escape"} {
		if err := ValidateServerEntryName(name); err == nil {
			t.Errorf("name %q was accepted", name)
		}
	}
	for _, name := range []string{"brave-search", "context7", "my_server", "srv2"} {
		if err := ValidateServerEntryName(name); err != nil {
			t.Errorf("name %q was rejected: %v", name, err)
		}
	}
	_ = ctx
}

// TestInstallServerEntryHostShapes walks the shape variants the audit confirmed:
// a plain object host, OpenCode's required `type` + argv array, and a TOML host.
func TestInstallServerEntryHostShapes(t *testing.T) {
	t.Run("opencode_requires_type_local_and_argv", func(t *testing.T) {
		home := entryHome(t)
		ctx := context.Background()
		dir := filepath.Join(home, ".config", "opencode")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		if _, err := InstallServerEntry(ctx, "opencode", ServerEntry{
			Name: "brave-search", Command: "npx", Args: []string{"-y", "brave-search-mcp-server"},
		}, EntryInstallOptions{BackupDir: filepath.Join(home, "backups"), Scope: domain.ScopeUser}); err != nil {
			t.Fatalf("InstallServerEntry: %v", err)
		}
		data, err := os.ReadFile(filepath.Join(dir, "opencode.json"))
		if err != nil {
			t.Fatal(err)
		}
		root, err := parseHostJSON(data)
		if err != nil {
			t.Fatalf("written config does not parse: %v\n%s", err, data)
		}
		// OpenCode's documented v2 container is mcp.servers; the flat `mcp.<name>`
		// shape is a legacy layout LiteSPM still reads but no longer writes.
		mcp, ok := root["mcp"].(map[string]any)
		if !ok {
			t.Fatalf("mcp container missing:\n%s", data)
		}
		entry, ok := mcp["servers"].(map[string]any)["brave-search"].(map[string]any)
		if !ok {
			t.Fatalf("entry missing from mcp.servers:\n%s", data)
		}
		if entry["type"] != "local" {
			t.Errorf("opencode requires type=local: %v", entry)
		}
		cmd, ok := entry["command"].([]any)
		if !ok || len(cmd) != 3 || cmd[0] != "npx" {
			t.Errorf("opencode requires a combined argv array: %v", entry["command"])
		}
	})

	t.Run("codex_writes_a_toml_table", func(t *testing.T) {
		home := entryHome(t)
		ctx := context.Background()
		dir := filepath.Join(home, ".codex")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		original := "# my codex settings\nmodel = \"gpt-5\"\n\n[mcp_servers.mine]\ncommand = \"npx\"\n"
		if err := os.WriteFile(filepath.Join(dir, "config.toml"), []byte(original), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := InstallServerEntry(ctx, "codex", ServerEntry{
			Name: "brave-search", Command: "npx", Args: []string{"-y", "brave-search-mcp-server"},
		}, EntryInstallOptions{BackupDir: filepath.Join(home, "backups"), Scope: domain.ScopeUser}); err != nil {
			t.Fatalf("InstallServerEntry: %v", err)
		}
		data, err := os.ReadFile(filepath.Join(dir, "config.toml"))
		if err != nil {
			t.Fatal(err)
		}
		got := string(data)
		if !strings.Contains(got, "[mcp_servers.brave-search]") {
			t.Errorf("table missing:\n%s", got)
		}
		if !strings.Contains(got, `command = "npx"`) || !strings.Contains(got, `args = ["-y", "brave-search-mcp-server"]`) {
			t.Errorf("entry fields wrong:\n%s", got)
		}
		if !strings.Contains(got, "# my codex settings") || !strings.Contains(got, "[mcp_servers.mine]") {
			t.Errorf("user content destroyed:\n%s", got)
		}
	})
}

// TestListServerEntriesNeverReportsTheBridge keeps the collision check from
// firing on LiteSPM's own entry.
func TestListServerEntriesNeverReportsTheBridge(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()
	claudeFile := filepath.Join(home, ".claude.json")
	if err := os.WriteFile(claudeFile, []byte(`{"mcpServers":{"litespm":{"command":"/usr/local/bin/litespm"},"context7":{"command":"npx"}}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	names, err := ListServerEntries(ctx, "claude-code", domain.ScopeUser, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 1 || names[0] != "context7" {
		t.Errorf("expected only the foreign entry, got %v", names)
	}
}

// TestProjectScopeWriteBindsToTheNamedProject pins the write target of a
// project-scope entry. It used to be whatever directory the CALLER happened to
// be in — DetectConfig derives a project path from the process working
// directory — while the install record named the workspace it was told, so a
// `litespm install --workspace <dir>` run from elsewhere wrote the entry into
// one project's config and recorded another's. The two must be the same file,
// or the project's own reads never find what LiteSPM says it installed.
func TestProjectScopeWriteBindsToTheNamedProject(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()

	// A directory that is not the project. Nothing may be written here.
	elsewhere := t.TempDir()
	prior, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(elsewhere); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(prior) })

	project := t.TempDir()
	result, err := InstallServerEntry(ctx, "cursor", ServerEntry{Name: "demo", Command: "npx"}, EntryInstallOptions{
		BackupDir:   filepath.Join(home, "backups"),
		Scope:       domain.ScopeProject,
		ProjectRoot: project,
	})
	if err != nil {
		t.Fatalf("InstallServerEntry: %v", err)
	}
	want := filepath.Join(project, ".cursor", "mcp.json")
	if result.ConfigPath != want {
		t.Errorf("wrote to %s, want the named project's config %s", result.ConfigPath, want)
	}
	if _, err := os.Stat(want); err != nil {
		t.Fatalf("the project config was not created: %v", err)
	}
	if _, err := os.Stat(filepath.Join(elsewhere, ".cursor", "mcp.json")); !os.IsNotExist(err) {
		t.Errorf("the entry also landed in the caller's working directory: %v", err)
	}
	if _, err := os.Stat(filepath.Join(home, ".cursor", "mcp.json")); !os.IsNotExist(err) {
		t.Errorf("a project-scope entry must not be written to the user config: %v", err)
	}

	// Removal has to reopen the same file it wrote. Deriving the path from the
	// working directory here would answer "no config file at this path" and
	// leave the entry behind, so the root travels with the scope.
	rm, err := RemoveServerEntry(ctx, "cursor", "demo", domain.ScopeProject, project, filepath.Join(home, "backups"), "")
	if err != nil || !rm.Removed {
		t.Fatalf("remove at the named project: %v %+v", err, rm)
	}
	data, readErr := os.ReadFile(want)
	if readErr == nil && strings.Contains(string(data), `"demo"`) {
		t.Errorf("entry survived removal:\n%s", data)
	}
}

// TestProjectScopeRefusesHostsWithoutAProjectPath is the honesty rule for the
// other direction: a bespoke adapter that ignores the scope argument in
// DetectConfig would answer with its user config file, so a project-scope
// install recorded against it would land in a file the record does not
// describe. Refusing — with the fix in the message — beats writing it anyway.
// Claude Code no longer belongs here: it documents `.mcp.json` at the project
// root and opts in through ProjectConfigPather (see the round-trip test below).
func TestProjectScopeRefusesHostsWithoutAProjectPath(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()
	project := t.TempDir()

	_, err := InstallServerEntry(ctx, "cline", ServerEntry{Name: "demo", Command: "npx"}, EntryInstallOptions{
		BackupDir:   filepath.Join(home, "backups"),
		Scope:       domain.ScopeProject,
		ProjectRoot: project,
	})
	if err == nil {
		t.Fatal("a project-scope install for a host with no project config path must be refused")
	}
	if !strings.Contains(err.Error(), "--scope user") {
		t.Errorf("the refusal must name what to do instead, got: %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(home, ".cline", "data", "settings", "cline_mcp_settings.json")); !os.IsNotExist(statErr) {
		t.Errorf("the refusal must not have written the user config: %v", statErr)
	}

	for _, tc := range []struct {
		hostID string
		want   bool
	}{
		// Opted in through host.ProjectConfigPather, each with the project file
		// its own vendor documents (see the per-host project-scope tests).
		{"claude-code", true}, // <root>/.mcp.json
		{"codex", true},       // <root>/.codex/config.toml
		{"grok-build", true},  // <root>/.grok/config.toml
		{"opencode", true},    // <root>/opencode.json
		{"pi-agent", true},    // <root>/.pi/mcp.json
		// Data-driven targets carry their project path in the BridgeTarget row.
		{"cursor", true},
		{"gemini-cli", true},
		// Cline documents no project MCP file at all, so it refuses.
		{"cline", false},
	} {
		adapter, aerr := GetAdapter(tc.hostID)
		if aerr != nil {
			t.Fatalf("adapter %s: %v", tc.hostID, aerr)
		}
		if got := SupportsProjectScope(adapter); got != tc.want {
			t.Errorf("SupportsProjectScope(%s)=%v, want %v", tc.hostID, got, tc.want)
		}
	}
}

// TestProjectScopeInstallRoundTripForClaudeCode pins the first bespoke
// adapter with a documented project file: Claude Code's `.mcp.json` at the
// project root, with the same `mcpServers` container as `~/.claude.json`
// (https://code.claude.com/docs/en/mcp, "Project scope" / MCP installation
// scopes). The entry must land in the project's file and never in the user's
// config, and removal must reopen the same file and take the entry out.
func TestProjectScopeInstallRoundTripForClaudeCode(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()
	project := t.TempDir()

	result, err := InstallServerEntry(ctx, "claude-code", ServerEntry{
		Name: "demo", Command: "npx", Args: []string{"-y", "demo-mcp"},
	}, EntryInstallOptions{
		BackupDir:   filepath.Join(home, "backups"),
		Scope:       domain.ScopeProject,
		ProjectRoot: project,
	})
	if err != nil {
		t.Fatalf("project-scope install for claude-code: %v", err)
	}
	want := filepath.Join(project, ".mcp.json")
	if result.ConfigPath != want {
		t.Errorf("wrote to %s, want the project file %s", result.ConfigPath, want)
	}
	data, readErr := os.ReadFile(want)
	if readErr != nil {
		t.Fatalf("the project .mcp.json was not created: %v", readErr)
	}
	if !strings.Contains(string(data), `"mcpServers"`) || !strings.Contains(string(data), `"demo"`) {
		t.Errorf("the entry is not in the project .mcp.json:\n%s", data)
	}
	if _, statErr := os.Stat(filepath.Join(home, ".claude.json")); !os.IsNotExist(statErr) {
		t.Errorf("a project-scope entry must not be written to the user config: %v", statErr)
	}

	// Removal reopens the same project file — the entry leaves it without
	// touching the user config.
	rm, err := RemoveServerEntry(ctx, "claude-code", "demo", domain.ScopeProject, project, filepath.Join(home, "backups"), "")
	if err != nil || !rm.Removed {
		t.Fatalf("remove at the project file: %v %+v", err, rm)
	}
	data, readErr = os.ReadFile(want)
	if readErr != nil {
		t.Fatalf("re-read the project file after removal: %v", readErr)
	}
	if strings.Contains(string(data), `"demo"`) {
		t.Errorf("entry survived removal:\n%s", data)
	}
}

// TestRegisteredBridgeHostsOnlyReportsConfiguredHosts is the consent boundary:
// a host the user never set LiteSPM up in is never a default install target.
func TestRegisteredBridgeHostsOnlyReportsConfiguredHosts(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()
	if hosts := RegisteredBridgeHosts(ctx, domain.ScopeUser); len(hosts) != 0 {
		t.Errorf("a machine with no setup must report no hosts, got %v", hosts)
	}

	claudeFile := filepath.Join(home, ".claude.json")
	if err := os.WriteFile(claudeFile, []byte(`{"mcpServers":{"litespm":{"command":"/usr/local/bin/litespm","args":["bridge","stdio","--host","claude-code"]}}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	hosts := RegisteredBridgeHosts(ctx, domain.ScopeUser)
	if len(hosts) != 1 || hosts[0] != "claude-code" {
		t.Errorf("expected only the configured host, got %v", hosts)
	}
}
