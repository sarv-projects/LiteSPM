package host

// opencode_project_scope_test.go — OpenCode's documented v2 container
// (`mcp.servers.<name>`) and its project-scope config file.
//
// Two vendor facts pin these tests (both verified 2026-10-11):
//   - MCP servers live at `mcp.servers.<name>` (https://opencode.ai/v2/docs/
//     mcp-servers, "Config"); flat members directly under `mcp` are the v1
//     shape the runtime still loads, so every read and removal path must keep
//     finding them.
//   - The project-scope config is `opencode.json(c)` (or
//     `.opencode/opencode.json(c)`) walked upward from the working directory
//     (https://opencode.ai/v2/docs/config, "Locations"), so a named project
//     root resolves to `<root>/opencode.json`.
//
// The entry itself must keep OpenCode's own spelling at both scopes:
// `"type": "local"` with a combined string-array `command`, read back through
// a JSONC-tolerant parser.

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

// opencodeUserConfig is where a user-scope install must land under this test's
// hermetic HOME (XDG resolution, same as DetectConfig).
func opencodeUserConfig(home string) string {
	return filepath.Join(home, ".config", "opencode", "opencode.json")
}

// TestOpenCodeUserScopeInstallWritesDocumentedServersContainer pins the write:
// a user-scope install lands at `mcp.servers.<name>` — not flat under `mcp` —
// keeps the v2 entry shape, preserves a foreign flat sibling, and is still
// removable afterwards.
func TestOpenCodeUserScopeInstallWritesDocumentedServersContainer(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()
	dir := filepath.Join(home, ".config", "opencode")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	original := `{"mcp":{"weather":{"type":"local","command":["python","-m","weather_mcp"]}}}`
	if err := os.WriteFile(opencodeUserConfig(home), []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}

	// The layout the locator and copy derive from must be the one written.
	adapter, err := GetAdapter("opencode")
	if err != nil {
		t.Fatalf("adapter: %v", err)
	}
	if keyPath, _, ok := EntryLayoutForScope(adapter, domain.ScopeUser); !ok || keyPath != "mcp.servers" {
		t.Fatalf("EntryLayoutForScope(opencode, user) = %q, %v; want mcp.servers", keyPath, ok)
	}
	if !SupportsProjectScope(adapter) {
		t.Fatal("OpenCode documents a project opencode.json, so SupportsProjectScope must be true")
	}

	res, err := InstallServerEntry(ctx, "opencode", ServerEntry{
		Name: "demo", Command: "npx", Args: []string{"-y", "demo-mcp"},
	}, EntryInstallOptions{BackupDir: filepath.Join(home, "backups"), Scope: domain.ScopeUser})
	if err != nil {
		t.Fatalf("InstallServerEntry: %v", err)
	}
	if res.ConfigPath != opencodeUserConfig(home) {
		t.Errorf("wrote to %s, want the user config %s", res.ConfigPath, opencodeUserConfig(home))
	}

	data, err := os.ReadFile(res.ConfigPath)
	if err != nil {
		t.Fatal(err)
	}
	root, err := parseHostJSON(data)
	if err != nil {
		t.Fatalf("written config does not parse: %v\n%s", err, data)
	}
	mcpVal, ok := root["mcp"].(map[string]any)
	if !ok {
		t.Fatalf("mcp missing:\n%s", data)
	}
	servers, ok := mcpVal["servers"].(map[string]any)
	if !ok {
		t.Fatalf("install did not land under mcp.servers:\n%s", data)
	}
	entry, ok := servers["demo"].(map[string]any)
	if !ok {
		t.Fatalf("demo missing from mcp.servers:\n%s", data)
	}
	if entry["type"] != "local" {
		t.Errorf("type = %v, want local", entry["type"])
	}
	cmd, ok := entry["command"].([]any)
	if !ok || len(cmd) != 3 || cmd[0] != "npx" || cmd[1] != "-y" || cmd[2] != "demo-mcp" {
		t.Errorf("command = %v, want the combined argv array [npx -y demo-mcp]", entry["command"])
	}
	if _, flat := mcpVal["demo"]; flat {
		t.Errorf("a flat mcp.demo twin was written alongside the nested entry:\n%s", data)
	}
	if _, ok := mcpVal["weather"].(map[string]any); !ok {
		t.Errorf("foreign flat sibling destroyed:\n%s", data)
	}

	// The nested entry removes cleanly, leaving the foreign sibling alone.
	rm, err := RemoveServerEntry(ctx, "opencode", "demo", domain.ScopeUser, "",
		filepath.Join(home, "backups"), "")
	if err != nil || !rm.Removed {
		t.Fatalf("remove: %+v %v", rm, err)
	}
	after, err := os.ReadFile(res.ConfigPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(after), `"demo"`) {
		t.Errorf("entry survived removal:\n%s", after)
	}
	if !strings.Contains(string(after), "weather_mcp") {
		t.Errorf("foreign sibling destroyed by removal:\n%s", after)
	}
}

// TestOpenCodeRemovalFindsLegacyFlatEntry pins the legacy-shape half of the
// contract: an entry written by an earlier LiteSPM release sits flat at
// `mcp.<name>`, and removal must still find it there — with every sibling and
// comment left in place.
func TestOpenCodeRemovalFindsLegacyFlatEntry(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()
	dir := filepath.Join(home, ".config", "opencode")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	original := "{\n  // my tools\n  \"mine\": {\"command\": \"npx\"},\n  \"mcp\": {\n" +
		"    \"weather\": {\"type\": \"local\", \"command\": [\"python\", \"-m\", \"weather_mcp\"]},\n" +
		"    \"demo\": {\"type\": \"local\", \"command\": [\"npx\", \"-y\", \"demo-mcp\"]}\n  }\n}\n"
	if err := os.WriteFile(opencodeUserConfig(home), []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}

	rm, err := RemoveServerEntry(ctx, "opencode", "demo", domain.ScopeUser, "",
		filepath.Join(home, "backups"), "")
	if err != nil || !rm.Removed {
		t.Fatalf("removal did not find the legacy flat entry: %+v %v", rm, err)
	}
	after, err := os.ReadFile(opencodeUserConfig(home))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"// my tools", `"mine"`, "weather_mcp"} {
		if !strings.Contains(string(after), want) {
			t.Errorf("removal lost %q:\n%s", want, after)
		}
	}
	if strings.Contains(string(after), `"demo"`) {
		t.Errorf("flat entry survived removal:\n%s", after)
	}
}

// TestOpenCodeProjectScopeInstallRoundTrip pins the project-scope contract:
// the install resolves to `<root>/opencode.json` (the first candidate of
// OpenCode's upward walk from the working directory), never to the user
// config, and removal reopens the same project file and takes exactly the one
// entry out — JSONC comment, sibling entries and unrelated keys intact.
func TestOpenCodeProjectScopeInstallRoundTrip(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()
	project := t.TempDir()

	// Seed the project file as JSONC with a sibling and an unrelated key, so
	// both install and removal are proven to splice rather than rewrite.
	seed := "{\n  // project tools\n  \"theme\": \"dark\",\n  \"mcp\": {\n" +
		"    \"weather\": {\"type\": \"local\", \"command\": [\"python\", \"-m\", \"weather_mcp\"]}\n  }\n}\n"
	if err := os.WriteFile(filepath.Join(project, "opencode.json"), []byte(seed), 0o600); err != nil {
		t.Fatal(err)
	}

	res, err := InstallServerEntry(ctx, "opencode", ServerEntry{
		Name: "demo", Command: "npx", Args: []string{"-y", "demo-mcp"},
	}, EntryInstallOptions{
		BackupDir:   filepath.Join(home, "backups"),
		Scope:       domain.ScopeProject,
		ProjectRoot: project,
	})
	if err != nil {
		t.Fatalf("project-scope install: %v", err)
	}
	want := filepath.Join(project, "opencode.json")
	if res.ConfigPath != want {
		t.Errorf("wrote to %s, want the project file %s", res.ConfigPath, want)
	}
	if _, statErr := os.Stat(opencodeUserConfig(home)); !os.IsNotExist(statErr) {
		t.Errorf("a project-scope entry must not be written to the user config: %v", statErr)
	}

	data, err := os.ReadFile(want)
	if err != nil {
		t.Fatal(err)
	}
	root, err := parseHostJSON(data)
	if err != nil {
		t.Fatalf("project config does not parse: %v\n%s", err, data)
	}
	servers, ok := lookupInMap(root, []string{"mcp", "servers"})["demo"].(map[string]any)
	if !ok {
		t.Fatalf("project install did not land at mcp.servers.demo:\n%s", data)
	}
	if servers["type"] != "local" {
		t.Errorf("project entry type = %v, want local", servers["type"])
	}
	for _, wantText := range []string{"// project tools", `"theme"`, "weather_mcp"} {
		if !strings.Contains(string(data), wantText) {
			t.Errorf("install lost %q from the project file:\n%s", wantText, data)
		}
	}

	// Removal reopens the same project file and leaves everything else alone.
	rm, err := RemoveServerEntry(ctx, "opencode", "demo", domain.ScopeProject, project,
		filepath.Join(home, "backups"), "")
	if err != nil || !rm.Removed {
		t.Fatalf("remove at the project file: %+v %v", rm, err)
	}
	after, err := os.ReadFile(want)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(after), `"demo"`) {
		t.Errorf("project entry survived removal:\n%s", after)
	}
	for _, wantText := range []string{"// project tools", `"theme"`, "weather_mcp"} {
		if !strings.Contains(string(after), wantText) {
			t.Errorf("removal lost %q from the project file:\n%s", wantText, after)
		}
	}
	if _, perr := parseHostJSON(after); perr != nil {
		t.Errorf("project config no longer parses: %v\n%s", perr, after)
	}
}

// TestOpenCodeListAndCollisionSpanBothShapes pins the read seam that copy,
// install and the ledger share: listing returns entries from either container
// (a legacy flat entry keeps its env and launch line, not a degraded
// pre-existing-detection shadow), a collision is refused even when the
// existing entry sits flat, and a forced re-install MOVES that entry into
// `mcp.servers` instead of leaving two members of one name in the file.
func TestOpenCodeListAndCollisionSpanBothShapes(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()
	dir := filepath.Join(home, ".config", "opencode")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	seed := `{"mcp":{"weather":{"type":"local","command":["python","-m","weather_mcp"]},` +
		`"demo":{"type":"local","command":["npx","-y","flat-demo"],"environment":{"TOKEN":"{env:TOKEN}"}}}}`
	if err := os.WriteFile(opencodeUserConfig(home), []byte(seed), 0o600); err != nil {
		t.Fatal(err)
	}

	entries, err := ListServerEntriesWithValues(ctx, "opencode", domain.ScopeUser, "")
	if err != nil {
		t.Fatalf("ListServerEntriesWithValues: %v", err)
	}
	byName := map[string]HostServerEntry{}
	for _, e := range entries {
		byName[e.Name] = e
	}
	if len(byName) != 2 {
		t.Fatalf("want both flat entries listed, got %+v", entries)
	}
	demo, ok := byName["demo"]
	if !ok {
		t.Fatalf("flat demo entry not listed: %+v", entries)
	}
	if demo.Command != "npx" || len(demo.Args) != 2 || demo.Args[1] != "flat-demo" {
		t.Errorf("flat entry lost its launch line: %+v", demo)
	}
	if demo.Env["TOKEN"] != "{env:TOKEN}" {
		t.Errorf("flat entry lost its env: %+v", demo.Env)
	}

	// The collision is real however the existing entry is shaped.
	_, err = InstallServerEntry(ctx, "opencode", ServerEntry{Name: "demo", Command: "npx"},
		EntryInstallOptions{BackupDir: filepath.Join(home, "backups"), Scope: domain.ScopeUser})
	if err == nil {
		t.Fatal("installing over a flat entry must refuse without force")
	}

	// Force moves it: nested copy written, flat twin stripped.
	if _, err := InstallServerEntry(ctx, "opencode", ServerEntry{Name: "demo", Command: "npx", Args: []string{"-y", "demo-mcp"}},
		EntryInstallOptions{BackupDir: filepath.Join(home, "backups"), Scope: domain.ScopeUser, Force: true}); err != nil {
		t.Fatalf("forced install: %v", err)
	}
	data, err := os.ReadFile(opencodeUserConfig(home))
	if err != nil {
		t.Fatal(err)
	}
	root, err := parseHostJSON(data)
	if err != nil {
		t.Fatalf("config does not parse: %v\n%s", err, data)
	}
	mcpVal, _ := root["mcp"].(map[string]any)
	if _, flat := mcpVal["demo"]; flat {
		t.Errorf("flat twin survived the move:\n%s", data)
	}
	if _, ok := lookupInMap(root, []string{"mcp", "servers"})["demo"]; !ok {
		t.Errorf("moved entry missing from mcp.servers:\n%s", data)
	}
	if _, ok := mcpVal["weather"]; !ok {
		t.Errorf("unrelated flat entry destroyed by the move:\n%s", data)
	}
	if n := strings.Count(string(data), `"demo"`); n != 1 {
		t.Errorf("want exactly one demo entry after the move, found %d:\n%s", n, data)
	}
}

// TestOpenCodeReadsBothShapes pins the read half: setup verify and
// pre-existing-tool detection must report what is on disk in EITHER shape —
// the documented v2 container and the legacy flat members — because a live
// v2.0.26 run still loads the flat one.
func TestOpenCodeReadsBothShapes(t *testing.T) {
	ctx := context.Background()
	bridgeFlat := `{"mcp":{"litespm":{"type":"local","command":["/bin/litespm","bridge","stdio","--host","opencode"]}}}`
	bridgeNested := `{"mcp":{"servers":{"litespm":{"type":"local","command":["/bin/litespm","bridge","stdio","--host","opencode"]}}}}`

	t.Run("verify_flat_bridge", func(t *testing.T) {
		home := entryHome(t)
		dir := filepath.Join(home, ".config", "opencode")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(opencodeUserConfig(home), []byte(bridgeFlat), 0o600); err != nil {
			t.Fatal(err)
		}
		adapter := &OpenCodeAdapter{}
		verify, err := adapter.VerifySetup(ctx)
		if err != nil {
			t.Fatalf("VerifySetup: %v", err)
		}
		if !verify.Registered || verify.Status != "ready" {
			t.Errorf("flat bridge must still verify: %+v", verify)
		}
	})

	t.Run("verify_nested_bridge", func(t *testing.T) {
		home := entryHome(t)
		dir := filepath.Join(home, ".config", "opencode")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(opencodeUserConfig(home), []byte(bridgeNested), 0o600); err != nil {
			t.Fatal(err)
		}
		adapter := &OpenCodeAdapter{}
		verify, err := adapter.VerifySetup(ctx)
		if err != nil {
			t.Fatalf("VerifySetup: %v", err)
		}
		if !verify.Registered || verify.Status != "ready" {
			t.Errorf("documented nested bridge must verify: %+v", verify)
		}
	})

	t.Run("preexisting_detection_unions_both_shapes", func(t *testing.T) {
		home := entryHome(t)
		dir := filepath.Join(home, ".config", "opencode")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		// LiteSPM's own bridge in the flat position must stay invisible; a
		// foreign tool must surface from either shape.
		seed := `{"mcp":{"litespm":{"type":"local","command":["/bin/litespm","bridge","stdio","--host","opencode"]},` +
			`"weather":{"type":"local","command":["python","-m","weather_mcp"]},` +
			`"servers":{"star":{"type":"local","command":["/bin/star"]}}}}`
		if err := os.WriteFile(opencodeUserConfig(home), []byte(seed), 0o600); err != nil {
			t.Fatal(err)
		}
		adapter := &OpenCodeAdapter{}
		comps, err := adapter.DetectPreExistingComponents(ctx)
		if err != nil {
			t.Fatalf("DetectPreExistingComponents: %v", err)
		}
		got := map[string]bool{}
		for _, c := range comps {
			got[c.Name] = true
		}
		for _, want := range []string{"weather", "star"} {
			if !got[want] {
				t.Errorf("foreign entry %q not detected (flat+nested union broken): %+v", want, comps)
			}
		}
		if got[litespmServerName] {
			t.Errorf("LiteSPM's own bridge surfaced as a pre-existing component: %+v", comps)
		}
		if len(comps) != 2 {
			t.Errorf("expected exactly the two foreign entries, got %+v", comps)
		}
	})
}

// TestOpenCodeSetupMigratesFlatBridgeIntoDocumentedContainer pins the bridge
// write: PlanSetup lands the bridge at `mcp.servers.litespm` and takes the
// legacy flat `mcp.litespm` member with it, so one config can never carry two
// bridge registrations that flatten to the same server name. Foreign flat
// members are not collateral.
func TestOpenCodeSetupMigratesFlatBridgeIntoDocumentedContainer(t *testing.T) {
	home := entryHome(t)
	ctx := context.Background()
	dir := filepath.Join(home, ".config", "opencode")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	seed := `{"mine":{"command":"npx"},"mcp":{"weather":{"type":"local","command":["python","-m","weather_mcp"]},` +
		`"litespm":{"type":"local","command":["/bin/old-litespm","bridge","stdio","--host","opencode"]}}}`
	if err := os.WriteFile(opencodeUserConfig(home), []byte(seed), 0o600); err != nil {
		t.Fatal(err)
	}

	adapter := &OpenCodeAdapter{}
	plan, err := adapter.PlanSetup(ctx, "/opt/litespm/litespm", t.TempDir())
	if err != nil {
		t.Fatalf("PlanSetup: %v", err)
	}
	root, err := parseHostJSON([]byte(plan.ProposedContent))
	if err != nil {
		t.Fatalf("proposed config does not parse: %v\n%s", err, plan.ProposedContent)
	}
	mcpVal, _ := root["mcp"].(map[string]any)
	if _, flat := mcpVal[litespmServerName]; flat {
		t.Errorf("legacy flat bridge not migrated out:\n%s", plan.ProposedContent)
	}
	servers, ok := mcpVal["servers"].(map[string]any)
	if !ok {
		t.Fatalf("bridge did not land under mcp.servers:\n%s", plan.ProposedContent)
	}
	bridge, ok := servers[litespmServerName].(map[string]any)
	if !ok {
		t.Fatalf("nested bridge entry missing:\n%s", plan.ProposedContent)
	}
	if bridge["type"] != "local" {
		t.Errorf("bridge type = %v, want local", bridge["type"])
	}
	if _, ok := mcpVal["weather"].(map[string]any); !ok {
		t.Errorf("foreign flat member destroyed by the migration:\n%s", plan.ProposedContent)
	}
	if _, ok := root["mine"]; !ok {
		t.Errorf("unrelated top-level key destroyed:\n%s", plan.ProposedContent)
	}
}
