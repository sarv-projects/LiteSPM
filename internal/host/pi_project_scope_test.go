package host

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

// TestPiProjectScopeInstallWritesDotPiMcpJSON pins Pi's documented
// project-scope file: project servers live in `<project>/.pi/mcp.json` in the
// same `mcpServers` container as the user file, and "a project entry replaces
// a user-level entry with the same name"
// (https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md,
// "Configuration files"; verified 2026-10-11). The entry must land in the
// project's file and never in `~/.pi/agent/mcp.json`, and removal must reopen
// the same project file.
func TestPiProjectScopeInstallWritesDotPiMcpJSON(t *testing.T) {
	home := entryHome(t)
	// Keep the user-path resolver inside the temp home even if the ambient
	// environment overrides the agent directory: nothing may touch ~/.pi.
	t.Setenv("PI_CODING_AGENT_DIR", "")
	ctx := context.Background()
	project := t.TempDir()

	adapter, err := GetAdapter("pi-agent")
	if err != nil {
		t.Fatalf("GetAdapter: %v", err)
	}
	if !SupportsProjectScope(adapter) {
		t.Fatal("Pi documents <project>/.pi/mcp.json, so pi-agent must report project-scope support")
	}
	piAdapter, ok := adapter.(*PiAgentAdapter)
	if !ok {
		t.Fatalf("pi-agent resolved to %T, want *PiAgentAdapter", adapter)
	}
	if got, want := piAdapter.ProjectConfigPath(project), filepath.Join(project, ".pi", "mcp.json"); got != want {
		t.Fatalf("ProjectConfigPath(%s) = %s, want %s", project, got, want)
	}

	result, err := InstallServerEntry(ctx, "pi-agent", ServerEntry{
		Name: "demo", Command: "npx", Args: []string{"-y", "demo-mcp"},
	}, EntryInstallOptions{
		BackupDir:   filepath.Join(home, "backups"),
		Scope:       domain.ScopeProject,
		ProjectRoot: project,
	})
	if err != nil {
		t.Fatalf("project-scope install for pi-agent: %v", err)
	}

	want := filepath.Join(project, ".pi", "mcp.json")
	if result.ConfigPath != want {
		t.Errorf("wrote to %s, want the project file %s", result.ConfigPath, want)
	}
	data, err := os.ReadFile(want)
	if err != nil {
		t.Fatalf("the project .pi/mcp.json was not created: %v", err)
	}
	got := string(data)
	if !strings.Contains(got, `"mcpServers"`) || !strings.Contains(got, `"demo"`) {
		t.Errorf("the entry is not under mcpServers in the project file:\n%s", got)
	}
	if _, statErr := os.Stat(filepath.Join(home, ".pi", "agent", "mcp.json")); !os.IsNotExist(statErr) {
		t.Errorf("a project-scope entry must not be written to the user file: %v", statErr)
	}

	// Removal reopens the same project file and never the user file.
	rm, err := RemoveServerEntry(ctx, "pi-agent", "demo", domain.ScopeProject, project, filepath.Join(home, "backups"), "")
	if err != nil || !rm.Removed {
		t.Fatalf("remove at the project file: %v %+v", err, rm)
	}
	data, err = os.ReadFile(want)
	if err != nil {
		t.Fatalf("re-read the project file after removal: %v", err)
	}
	if strings.Contains(string(data), `"demo"`) {
		t.Errorf("entry survived removal:\n%s", data)
	}
	if _, statErr := os.Stat(filepath.Join(home, ".pi", "agent", "mcp.json")); !os.IsNotExist(statErr) {
		t.Errorf("removal must not have touched the user file: %v", statErr)
	}
}

// TestPiExtensionGeneratedUsesRealExtensionAPI pins the companion extension
// ApplySetup writes. The old blob registered `async execute` — RegisteredCommand
// takes `handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>`,
// so the command never ran — and called `pi.mcp.callTool`, a member no
// ExtensionAPI has (verified against pi 0.80.10's bundled types.d.ts:839-999 and
// upstream main types.ts).
//
// The current blob registers /marketplace, a real panel: ctx.ui.custom
// (types.d.ts:116) mounts a Component — pi-tui requires render(width) plus
// invalidate(), with handleInput optional (pi-tui dist/tui.d.ts:10-30) — and the
// panel gets its data by shelling out to the CLI through pi.exec
// (types.d.ts:915), because a command handler cannot invoke a tool at all.
// The emitted TypeScript is type-checked with tsc --strict against the real
// pi 0.80.10 types (a separate, offline check); this test pins the shape that
// check depends on.
func TestPiExtensionGeneratedUsesRealExtensionAPI(t *testing.T) {
	home := entryHome(t)
	t.Setenv("PI_CODING_AGENT_DIR", "")
	ctx := context.Background()

	adapter := &PiAgentAdapter{}
	plan, err := adapter.PlanSetup(ctx, filepath.Join(home, "bin", "litespm"), filepath.Join(home, "backups"))
	if err != nil {
		t.Fatalf("PlanSetup: %v", err)
	}
	if _, err := adapter.ApplySetup(ctx, plan); err != nil {
		t.Fatalf("ApplySetup: %v", err)
	}

	extPath := adapter.ExtensionPath()
	data, err := os.ReadFile(extPath)
	if err != nil {
		t.Fatalf("the companion extension was not written to %s: %v", extPath, err)
	}
	code := string(data)

	if strings.Contains(code, "callTool") || strings.Contains(code, "pi.mcp.") {
		t.Errorf("the extension references the removed pi.mcp.callTool API:\n%s", code)
	}
	if strings.Contains(code, "async execute") {
		t.Errorf("RegisteredCommand has no `execute` member; the command must use `handler`:\n%s", code)
	}
	for _, want := range []string{
		`import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"`,
		`pi.registerCommand("litespm"`,
		"handler: async (args, ctx)",
		"getAllTools()",
		"mcp__litespm__",
		"ctx.ui.notify",
		// The panel.
		`pi.registerCommand("marketplace"`,
		"ctx.ui.custom",
		"render(width: number): string[]",
		"invalidate(): void",
		"handleInput(data: string): void",
		// Its data path: the CLI, not a tool call a command handler cannot make.
		"pi.exec",
		// Pi MCP entries use command as a string; accept argv-shaped legacy
		// configs too, but never take the first character of a string path.
		`typeof command === "string"`,
		`Array.isArray(command)`,
		`"--json"`,
		// Colour comes from the Theme the host passes in, never from an import.
		"ctx.ui.theme",
		"theme.fg",
		// The framing and cursor, which must not shift the columns when the
		// selection moves.
		`"╭"`,
		`"❯ "`,
		// Language a person who has never opened a config file can act on.
		"Press Enter to add it to Pi",
		"Quit and restart Pi to use it.",
	} {
		if !strings.Contains(code, want) {
			t.Errorf("the generated extension is missing %q:\n%s", want, code)
		}
	}

	// The panel must stay self-contained: a runtime import of a host package
	// would make extension loading depend on module resolution inside the
	// agent's install, which is exactly the kind of silent breakage this
	// extension already had once.
	for _, forbidden := range []string{
		"from \"@earendil-works/pi-tui\"",
		"template literal",
	} {
		if strings.Contains(code, forbidden) {
			t.Errorf("the generated extension imports %q; only node: builtins and the type-only ExtensionAPI import are allowed:\n%s", forbidden, code)
		}
	}
}
