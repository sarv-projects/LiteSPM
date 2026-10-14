package main

// setup_uninstall_test.go — the `setup` argument surface and the `uninstall`
// epilogue.
//
// `runUninstall` returns its exit code (main maps it to os.Exit), so the real
// uninstall flow runs in-process against a sandboxed HOME and data root. The
// `setup` paths end in os.Exit, so they are exercised in a child process of
// this test binary with a null stdin — the pattern usage_exit_test.go and
// skills_add_test.go established.

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/skills"
	"github.com/sarv-projects/litespm/internal/state"
)

// sandboxedPaths points HOME, the XDG roots and every LITESPM_* root at
// temporary directories, so the real uninstall flow can neither see nor touch
// the developer's agent configs, and returns the resolved paths.
func sandboxedPaths(t *testing.T) *config.PlatformPaths {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	t.Setenv("LITESPM_DATA_ROOT", filepath.Join(t.TempDir(), "data"))
	t.Setenv("LITESPM_CONFIG_ROOT", filepath.Join(t.TempDir(), "config"))
	t.Setenv("LITESPM_RUNTIME_ROOT", filepath.Join(t.TempDir(), "runtime"))

	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		t.Fatalf("ResolvePlatformPaths: %v", err)
	}
	return paths
}

// TestUninstallEpilogueNamesRemainingMCPAndSkills seeds MCP install records in
// both scopes and one skills-ledger row, then runs the real uninstall flow. The
// epilogue must count and name the MCP removal command with each recorded
// install id — the entries `litespm install` registered are exactly what the
// old epilogue never mentioned — and the skills-removal forms.
func TestUninstallEpilogueNamesRemainingMCPAndSkills(t *testing.T) {
	paths := sandboxedPaths(t)

	db, err := state.Open(paths.StateDBPath())
	if err != nil {
		t.Fatalf("open state: %v", err)
	}
	recs := []*domain.InstallRecord{
		{
			InstallID:   "inst_user_mcp:example:demo_1.0.0",
			ListingID:   "mcp:example:demo",
			Kind:        domain.KindMCP,
			Version:     "1.0.0",
			Scope:       domain.ScopeUser,
			Status:      domain.InstallActive,
			InstalledAt: time.Now().UTC(),
			UpdatedAt:   time.Now().UTC(),
		},
		{
			InstallID:   "inst_project_mcp:example:other_1.0.0",
			ListingID:   "mcp:example:other",
			Kind:        domain.KindMCP,
			Version:     "1.0.0",
			Scope:       domain.ScopeProject,
			WorkspaceID: "ws-demo",
			ProjectRoot: "/tmp/demo-project",
			Status:      domain.InstallActive,
			InstalledAt: time.Now().UTC(),
			UpdatedAt:   time.Now().UTC(),
		},
	}
	for _, rec := range recs {
		if err := db.SaveInstall(context.Background(), rec); err != nil {
			t.Fatalf("seed install record %s: %v", rec.InstallID, err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close state: %v", err)
	}

	ledgerPath := skills.LedgerPath(paths.DataRoot)
	if err := os.MkdirAll(filepath.Dir(ledgerPath), 0o700); err != nil {
		t.Fatalf("create ledger dir: %v", err)
	}
	entry := skills.LedgerEntry{
		SkillName:   "demo-skill",
		AgentID:     "claude-code",
		HostLabel:   "claude-code",
		DestDir:     filepath.Join(os.Getenv("HOME"), ".claude", "skills", "demo-skill"),
		Source:      "example/skills",
		Scope:       "global",
		InstalledAt: time.Now().UTC(),
	}
	blob, err := json.Marshal([]skills.LedgerEntry{entry})
	if err != nil {
		t.Fatalf("encode ledger: %v", err)
	}
	if err := os.WriteFile(ledgerPath, blob, 0o600); err != nil {
		t.Fatalf("seed ledger: %v", err)
	}

	out := captureStdout(t, func() {
		if code := runUninstall(context.Background(), nil); code != 0 {
			t.Fatalf("runUninstall = %d, want 0", code)
		}
	})

	for _, want := range []string{
		"litespm install remove inst_user_mcp:example:demo_1.0.0",
		"litespm install remove inst_project_mcp:example:other_1.0.0",
		"still records 2 MCP server installs",
		"copied 1 skill directory",
		"litespm skills list",
		"litespm skills remove --all",
		"litespm skills remove --all --global",
		"Backups written next to each config",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("uninstall output is missing %q:\n%s", want, out)
		}
	}
}

// TestUninstallEpilogueDoesNotClaimMCPRemovalWithoutRecords is the other half:
// with nothing recorded, the epilogue must not name `install remove` or claim
// that MCP installs remain, and reading the remainder must not create a state
// database just to answer the question.
func TestUninstallEpilogueDoesNotClaimMCPRemovalWithoutRecords(t *testing.T) {
	paths := sandboxedPaths(t)

	out := captureStdout(t, func() {
		if code := runUninstall(context.Background(), nil); code != 0 {
			t.Fatalf("runUninstall = %d, want 0", code)
		}
	})

	if strings.Contains(out, "litespm install remove") {
		t.Errorf("uninstall named an MCP removal command with no install records:\n%s", out)
	}
	if strings.Contains(out, "still records") {
		t.Errorf("uninstall claimed MCP installs remain when none is recorded:\n%s", out)
	}
	if strings.Contains(out, "litespm skills remove") {
		t.Errorf("uninstall named a skills removal command with no ledger entries:\n%s", out)
	}
	if !strings.Contains(out, "No MCP server installs or skill directories are recorded as remaining.") {
		t.Errorf("uninstall did not report the empty remainder:\n%s", out)
	}
	if !strings.Contains(out, "Backups written next to each config") {
		t.Errorf("uninstall dropped the backups note:\n%s", out)
	}
	if _, err := os.Stat(paths.StateDBPath()); !os.IsNotExist(err) {
		t.Errorf("uninstall created a state database just to read the remainder (stat err = %v)", err)
	}
}

// setupCLI runs the real CLI in a child process of this test binary with a
// sandboxed home and data root and a null stdin (so every run is
// non-interactive). It returns stdout, stderr and the exit code.
func setupCLI(t *testing.T, home string, args ...string) (string, string, int) {
	t.Helper()
	childArgs := append([]string{"-test.run=^TestSetupUninstallHelperProcess$", "--"}, args...)
	cmd := exec.Command(os.Args[0], childArgs...)
	cmd.Env = append(os.Environ(),
		"HOME="+home,
		"USERPROFILE="+home,
		"XDG_CONFIG_HOME="+filepath.Join(home, ".config"),
		"APPDATA="+filepath.Join(home, "AppData", "Roaming"),
		"CODEX_HOME=",
		"LITESPM_DATA_ROOT="+filepath.Join(home, "data"),
		"LITESPM_CONFIG_ROOT="+filepath.Join(home, "config"),
		"LITESPM_RUNTIME_ROOT="+filepath.Join(home, "runtime"),
	)
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	err := cmd.Run()
	if ee, ok := err.(*exec.ExitError); ok {
		return out.String(), errBuf.String(), ee.ExitCode()
	}
	if err != nil {
		t.Fatalf("run litespm %v: %v", args, err)
	}
	return out.String(), errBuf.String(), 0
}

// TestSetupUninstallHelperProcess runs the real CLI main with the argv after
// "--". It is selected only in the child process and is a no-op in a normal
// run.
func TestSetupUninstallHelperProcess(t *testing.T) {
	for i, a := range os.Args {
		if a != "--" {
			continue
		}
		os.Args = append([]string{"litespm"}, os.Args[i+1:]...)
		main()
		return
	}
}

// TestSetupHelpAndUsageErrors pins the argument surface of `litespm setup`:
// `--help`/`-h` print the setup page and exit 0, every other argument is a
// usage error (2) that names the accepted forms, and a non-interactive
// invocation with no argument refuses (1) with the non-interactive
// alternatives instead of dying on end-of-input.
func TestSetupHelpAndUsageErrors(t *testing.T) {
	cases := []struct {
		name     string
		args     []string
		wantCode int
		wantOut  []string
		wantErr  []string
	}{
		{
			name:     "setup --help prints the page and exits 0",
			args:     []string{"setup", "--help"},
			wantCode: 0,
			wantOut:  []string{"LITESPM SETUP", "USAGE", "litespm setup [--agent <host-id>]", "WHAT IT DOES", "EXIT CODES"},
		},
		{
			name:     "setup -h prints the same page",
			args:     []string{"setup", "-h"},
			wantCode: 0,
			wantOut:  []string{"LITESPM SETUP", "WHAT IT DOES NOT"},
		},
		{
			name:     "a junk argument is a usage error naming the accepted form",
			args:     []string{"setup", "bogus"},
			wantCode: 2,
			wantErr:  []string{"Setup error", `unexpected argument "bogus"`, "litespm setup [--agent <host-id>]"},
		},
		{
			name:     "an unknown flag is a usage error",
			args:     []string{"setup", "--bogus"},
			wantCode: 2,
			wantErr:  []string{"Setup error", "litespm setup [--agent <host-id>]"},
		},
		{
			name:     "--agent without a value is a usage error",
			args:     []string{"setup", "--agent"},
			wantCode: 2,
			wantErr:  []string{"Setup error", "--agent requires a host id", "litespm setup [--agent <host-id>]"},
		},
		{
			name:     "no terminal refuses and names the non-interactive alternatives",
			args:     []string{"setup"},
			wantCode: 1,
			wantErr: []string{
				"needs an interactive terminal",
				"litespm setup --agent <host-id>",
				"litespm host setup <host-id>",
			},
		},
		{
			name:     "the bare invocation refuses the same way",
			args:     nil,
			wantCode: 1,
			wantErr:  []string{"needs an interactive terminal", "litespm host setup <host-id>"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out, errOut, code := setupCLI(t, t.TempDir(), tc.args...)
			if code != tc.wantCode {
				t.Fatalf("litespm %v exit = %d, want %d\nstdout:\n%s\nstderr:\n%s",
					tc.args, code, tc.wantCode, out, errOut)
			}
			for _, want := range tc.wantOut {
				if !strings.Contains(out, want) {
					t.Errorf("stdout is missing %q:\n%s", want, out)
				}
			}
			for _, want := range tc.wantErr {
				if !strings.Contains(errOut, want) {
					t.Errorf("stderr is missing %q:\n%s", want, errOut)
				}
			}
		})
	}
}

// TestSetupAgentWritesTheSameResultAsHostSetup runs the two spellings against
// two identical fresh homes and requires the same written config and the same
// report (modulo the sandbox path). Both call applyHostSetup, so a future
// divergence — a second write path, a different adapter call — fails here.
func TestSetupAgentWritesTheSameResultAsHostSetup(t *testing.T) {
	homeA := t.TempDir()
	homeB := t.TempDir()

	outA, errA, codeA := setupCLI(t, homeA, "host", "setup", "codex")
	if codeA != 0 {
		t.Fatalf("host setup exit = %d\nstderr:\n%s", codeA, errA)
	}
	outB, errB, codeB := setupCLI(t, homeB, "setup", "--agent", "codex")
	if codeB != 0 {
		t.Fatalf("setup --agent exit = %d\nstderr:\n%s", codeB, errB)
	}

	cfgA := filepath.Join(homeA, ".codex", "config.toml")
	cfgB := filepath.Join(homeB, ".codex", "config.toml")
	blobA, err := os.ReadFile(cfgA)
	if err != nil {
		t.Fatalf("read %s: %v", cfgA, err)
	}
	blobB, err := os.ReadFile(cfgB)
	if err != nil {
		t.Fatalf("read %s: %v", cfgB, err)
	}
	if !bytes.Equal(blobA, blobB) {
		t.Fatalf("the two forms wrote different configs:\n--- host setup ---\n%s\n--- setup --agent ---\n%s", blobA, blobB)
	}
	if !strings.Contains(string(blobA), "[mcp_servers.litespm]") {
		t.Fatalf("the written config does not carry the bridge entry:\n%s", blobA)
	}

	// The child is a Go test binary, so after main() returns the framework
	// appends its own PASS line; strip it before comparing the reports.
	normalize := func(s, home string) string {
		s = strings.ReplaceAll(s, home, "$HOME")
		return strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(s), "PASS"))
	}
	if normalize(outA, homeA) != normalize(outB, homeB) {
		t.Fatalf("the two forms printed different reports:\n--- host setup ---\n%s\n--- setup --agent ---\n%s", outA, outB)
	}
}
