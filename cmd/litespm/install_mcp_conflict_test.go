package main

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

// TestMCPConflictHostsFindsExistingEntry pins the shared lookup the wizard's
// conflict question and the installer's refusal both use. homeWithBridge makes
// claude-code carry an entry named "mine" (plus the bridge), and cursor has no
// config at all in that home, so exactly one host may be reported.
func TestMCPConflictHostsFindsExistingEntry(t *testing.T) {
	homeWithBridge(t)
	ctx := context.Background()

	conflicts := mcpConflictHosts(ctx, []string{"claude-code", "cursor"}, "mine", domain.ScopeUser, "")
	if len(conflicts) != 1 || conflicts[0] != "claude-code" {
		t.Fatalf("conflicts = %v, want exactly [claude-code]", conflicts)
	}
	if conflicts := mcpConflictHosts(ctx, []string{"claude-code"}, "demo-mcp", domain.ScopeUser, ""); len(conflicts) != 0 {
		t.Fatalf("a name nobody registered was reported as a conflict: %v", conflicts)
	}
}

func conflictWizard(input string, out io.Writer) *Wizard {
	return NewWizard(strings.NewReader(input), out, nil)
}

// The default answer is to leave the existing agents alone and install into the
// ones that do not have the server yet: the conflicting host is dropped from the
// target set (so the plan does not cover it) and force stays false.
func TestResolveMCPConflictsSkipKeepsTheOtherHosts(t *testing.T) {
	var out strings.Builder
	w := conflictWizard("1\n", &out)

	choice, ok, err := w.resolveMCPConflicts("context7",
		[]string{"antigravity", "cursor", "codex"}, []string{"antigravity"})
	if err != nil || !ok {
		t.Fatalf("skip: ok = %v, err = %v", ok, err)
	}
	if want := []string{"cursor", "codex"}; strings.Join(choice.hosts, ",") != strings.Join(want, ",") {
		t.Errorf("hosts = %v, want %v", choice.hosts, want)
	}
	if choice.force {
		t.Error("skipping must not force a replacement")
	}
	for _, want := range []string{"already registered", "Replace the existing entry there (a backup is kept)", "Install into the other 2 agents"} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("prompt is missing %q:\n%s", want, out.String())
		}
	}
}

// Replace keeps every host in the target set and turns on force, so the plan the
// user approves covers the overwrite of the existing entry.
func TestResolveMCPConflictsReplaceKeepsEveryHostAndForces(t *testing.T) {
	w := conflictWizard("2\n", io.Discard)

	choice, ok, err := w.resolveMCPConflicts("context7",
		[]string{"antigravity", "cursor", "codex"}, []string{"antigravity"})
	if err != nil || !ok {
		t.Fatalf("replace: ok = %v, err = %v", ok, err)
	}
	if want := "antigravity,cursor,codex"; strings.Join(choice.hosts, ",") != want {
		t.Errorf("hosts = %v, want %s", choice.hosts, want)
	}
	if !choice.force {
		t.Error("replace must set force, or the installer refuses the collision")
	}
}

// Cancel writes nothing: ok=false, so the caller stops before the plan exists.
func TestResolveMCPConflictsCancelWritesNothing(t *testing.T) {
	for _, answer := range []string{"3\n", "nonsense\n"} {
		w := conflictWizard(answer, io.Discard)
		if _, ok, err := w.resolveMCPConflicts("context7",
			[]string{"antigravity", "cursor"}, []string{"antigravity"}); err != nil || ok {
			t.Errorf("answer %q: ok = %v, err = %v; want a clean stop", answer, ok, err)
		}
	}
}

// When every target already has the server, the same three answers must not
// invent a target set: the default leaves the machine untouched and says so.
func TestResolveMCPConflictsAllConflictDefaultLeavesIt(t *testing.T) {
	var out strings.Builder
	w := conflictWizard("\n", &out)

	if _, ok, err := w.resolveMCPConflicts("context7",
		[]string{"antigravity"}, []string{"antigravity"}); err != nil || ok {
		t.Fatalf("ok = %v, err = %v; want a clean stop", ok, err)
	}
	if !strings.Contains(out.String(), "Leave it exactly as it is") {
		t.Errorf("the all-conflict prompt must offer leaving it alone:\n%s", out.String())
	}
}

// The replace answer has to work at the install level too: force overwrites the
// user's existing entry, records the pre-image, and keeps the per-write backup
// the removal path restores from.
func TestInstallMCPFromListingForceReplacesTheExistingEntry(t *testing.T) {
	db := openTestState(t)
	dataRoot := t.TempDir()
	_, configPath := homeWithBridge(t)

	outcome, err := installMCPFromListing(authorizedTestContext(), db, dataRoot,
		mcpListing("mcp:example:demo-mcp", "mine"), "1.0.0", domain.ScopeUser, "",
		[]string{"claude-code"}, true, stdioRuntime(), nil)
	if err != nil {
		t.Fatalf("forced install: %v", err)
	}
	if len(outcome.Hosts) != 1 {
		t.Fatalf("hosts = %+v, want one", outcome.Hosts)
	}
	result := outcome.Hosts[0]
	if !result.Replaced {
		t.Error("the result must record that an existing entry was replaced")
	}
	if result.PriorEntry == "" || result.PriorFingerprint == "" {
		t.Error("the pre-image of the replaced entry must be recorded, or remove cannot restore it")
	}
	if result.BackupPath == "" {
		t.Error("no pre-write backup was taken for a config that existed")
	}
	if _, statErr := os.Stat(result.BackupPath); statErr != nil {
		t.Errorf("the recorded backup is not on disk: %v", statErr)
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		MCPServers map[string]map[string]any `json:"mcpServers"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatalf("written config is not JSON: %v\n%s", err, data)
	}
	entry := doc.MCPServers["mine"]
	if entry["command"] != "npx" {
		t.Errorf("entry was not replaced with the installed launch line: %#v", entry)
	}
	if _, ok := doc.MCPServers["litespm"]; !ok {
		t.Errorf("the bridge entry was disturbed by a forced replacement:\n%s", data)
	}
}
