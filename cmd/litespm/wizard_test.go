package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/skills"
	"github.com/sarv-projects/litespm/internal/state"
)

// --- helpers ---------------------------------------------------------------

// hermeticWizardHome points every agent-config environment variable the host
// adapters read at a fresh temp home, so a wizard run never depends on (or
// touches) the machine's real agent configuration.
func hermeticWizardHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	for _, v := range []string{
		"CLINE_MCP_SETTINGS_PATH", "CLINE_DATA_DIR", "CLINE_DIR",
		"PI_CODING_AGENT_DIR", "GROK_HOME", "CODEX_HOME", "OPENCODE_CONFIG_DIR",
	} {
		t.Setenv(v, "")
	}
	return home
}

func tempWizardPaths(t *testing.T) *config.PlatformPaths {
	t.Helper()
	dir := t.TempDir()
	paths := &config.PlatformPaths{
		ConfigRoot:  filepath.Join(dir, "config"),
		DataRoot:    filepath.Join(dir, "data"),
		RuntimeRoot: filepath.Join(dir, "run"),
	}
	if err := paths.EnsureDirectories(); err != nil {
		t.Fatalf("EnsureDirectories: %v", err)
	}
	return paths
}

// newTestWizard builds a wizard that never consults the machine's real state:
// "no host is configured" unless the test overrides the hook.
func newTestWizard(t *testing.T, in string, paths *config.PlatformPaths) (*Wizard, *bytes.Buffer) {
	t.Helper()
	var out bytes.Buffer
	w := NewWizard(strings.NewReader(in), &out, paths)
	w.registeredHosts = func(context.Context) ([]host.HostVerification, error) { return nil, nil }
	return w, &out
}

// wizardRowIndex returns the 1-based menu number of hostID, either in the
// detected-only pool or the full list.
func wizardRowIndex(t *testing.T, w *Wizard, hostID string, detectedOnly bool) int {
	t.Helper()
	rows := w.agentMenuRows(context.Background())
	var pool []agentMenuRow
	for _, r := range rows {
		if detectedOnly && !r.exists {
			continue
		}
		pool = append(pool, r)
	}
	for i, r := range pool {
		if r.descriptor.HostID == hostID {
			return i + 1
		}
	}
	t.Fatalf("host %s not in menu pool (detectedOnly=%v)", hostID, detectedOnly)
	return 0
}

func countLines(s string) int {
	if s == "" {
		return 0
	}
	return strings.Count(s, "\n")
}

// assertBoundedOutput is the regression guard for the 32M-line busy loop: a
// wizard that cannot read input must stop with a bounded amount of output.
func assertBoundedOutput(t *testing.T, out string, maxLines int) {
	t.Helper()
	if n := countLines(out); n > maxLines {
		t.Fatalf("wizard printed %d lines (bound %d): the EOF busy loop is back", n, maxLines)
	}
}

func clineConfigPath(home string) string {
	return filepath.Join(home, ".cline", "data", "settings", "cline_mcp_settings.json")
}

// --- the existing cancellation contract ------------------------------------

func TestWizard_InteractiveAgentSelectionAndCancellation(t *testing.T) {
	hermeticWizardHome(t)
	w, out := newTestWizard(t, "q\n", tempWizardPaths(t))

	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("unexpected wizard error: %v", err)
	}
	outStr := out.String()
	if !strings.Contains(outStr, "LiteSPM") {
		t.Errorf("expected banner in output, got: %s", outStr)
	}
	if !strings.Contains(outStr, "Setup cancelled") {
		t.Errorf("expected cancellation message, got: %s", outStr)
	}
}

func TestWizard_PrintUsage(t *testing.T) {
	printUsage()
}

func TestWizard_InstallSkillFromSourceAction(t *testing.T) {
	hermeticWizardHome(t)
	w, out := newTestWizard(t, "https://github.com/acme/agent-skills\n", tempWizardPaths(t))
	var got string
	w.launchSkillInstaller = func(_ context.Context, source string) error {
		got = source
		return nil
	}

	if err := w.actionInstallSkillFromSource(context.Background()); err != nil {
		t.Fatalf("actionInstallSkillFromSource: %v", err)
	}
	if got != "https://github.com/acme/agent-skills" {
		t.Fatalf("installer source = %q", got)
	}
	if !strings.Contains(out.String(), "skills add") || !strings.Contains(out.String(), "GitHub") {
		t.Fatalf("expected source installer guidance, got:\n%s", out.String())
	}
}

func TestWizard_InstallSkillFromSourceCanReturnToMenu(t *testing.T) {
	w, out := newTestWizard(t, "\n", tempWizardPaths(t))
	called := false
	w.launchSkillInstaller = func(context.Context, string) error {
		called = true
		return nil
	}

	if err := w.actionInstallSkillFromSource(context.Background()); err != nil {
		t.Fatalf("actionInstallSkillFromSource: %v", err)
	}
	if called {
		t.Fatal("installer launched without a source")
	}
	if !strings.Contains(out.String(), "Enter a source") {
		t.Fatalf("expected an empty-source hint, got:\n%s", out.String())
	}
}

func TestWizard_ActionMenuLaunchesSkillInstaller(t *testing.T) {
	hermeticWizardHome(t)
	paths := tempWizardPaths(t)
	db, err := state.Open(paths.StateDBPath())
	if err != nil {
		t.Fatalf("open state db: %v", err)
	}
	defer db.Close()
	w, out := newTestWizard(t, "s\n6\nacme/agent-skills\nq\n", paths)
	w.openState = func() (*state.DB, error) { return db, nil }
	w.catalogClient = func() *catalog.Client { return catalog.NewClient("", t.TempDir(), nil) }
	var gotSource string
	w.launchSkillInstaller = func(_ context.Context, source string) error {
		gotSource = source
		return nil
	}

	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if gotSource != "acme/agent-skills" {
		t.Fatalf("source passed to installer = %q", gotSource)
	}
	if !strings.Contains(out.String(), "Install skills from GitHub") {
		t.Fatalf("menu does not advertise the GitHub installer:\n%s", out.String())
	}
	if !strings.Contains(out.String(), "Agent connection skipped") {
		t.Fatalf("expected the first-run agent skip path:\n%s", out.String())
	}
}

func TestWizard_ActionMenuAllowsSourceInstallWhenManagerStateCannotOpen(t *testing.T) {
	w, out := newTestWizard(t, "2\n6\nacme/agent-skills\nq\n", tempWizardPaths(t))
	w.openState = func() (*state.DB, error) { return nil, errors.New("fixture database error") }
	w.catalogClient = func() *catalog.Client { return catalog.NewClient("", t.TempDir(), nil) }
	var gotSource string
	w.launchSkillInstaller = func(_ context.Context, source string) error {
		gotSource = source
		return nil
	}

	if err := w.runActionMenu(context.Background()); err != nil {
		t.Fatalf("runActionMenu: %v", err)
	}
	if gotSource != "acme/agent-skills" {
		t.Fatalf("source passed to installer = %q", gotSource)
	}
	if !strings.Contains(out.String(), "fixture database error") {
		t.Fatalf("expected state error explanation:\n%s", out.String())
	}
}

// --- item 2: EOF at every input site exits cleanly -------------------------

// TestWizard_EOFStopsAtEveryPrompt feeds an input stream that ends at each
// prompt in turn and asserts a clean stop with a bounded amount of output. The
// old fallback menu ignored the read error and treated EOF as an invalid
// choice, printing 32 million "Invalid option." lines in two minutes.
func TestWizard_EOFStopsAtEveryPrompt(t *testing.T) {
	ctx := context.Background()

	cases := []struct {
		name string
		// configured starts the run on an already-set-up machine, so the
		// prompts behind the action menu are reachable.
		configured bool
		input      func(t *testing.T, home string, w *Wizard) string
	}{
		{
			name:  "agent menu",
			input: func(*testing.T, string, *Wizard) string { return "" },
		},
		{
			name: "configuration confirmation",
			input: func(t *testing.T, home string, w *Wizard) string {
				return fmt.Sprintf("a\n%d\n", wizardRowIndex(t, w, "cline", false))
			},
		},
		{
			name: "fallback menu",
			input: func(t *testing.T, home string, w *Wizard) string {
				return fmt.Sprintf("a\n%d\nn\n", wizardRowIndex(t, w, "cline", false))
			},
		},
		{
			name: "manual path prompt",
			input: func(t *testing.T, home string, w *Wizard) string {
				return fmt.Sprintf("a\n%d\nn\n1\n", wizardRowIndex(t, w, "cline", false))
			},
		},
		{
			name: "bridge change confirmation",
			input: func(t *testing.T, home string, w *Wizard) string {
				return fmt.Sprintf("a\n%d\ny\n", wizardRowIndex(t, w, "cline", false))
			},
		},
		{
			name:       "catalog sync confirmation",
			configured: true,
			input:      func(*testing.T, string, *Wizard) string { return "1\n" },
		},
		{
			name:       "install search query",
			configured: true,
			input:      func(*testing.T, string, *Wizard) string { return "2\n" },
		},
		{
			name:       "remove picker",
			configured: true,
			input:      func(*testing.T, string, *Wizard) string { return "3\n" },
		},
		{
			name:       "GitHub skill source prompt",
			configured: true,
			input:      func(*testing.T, string, *Wizard) string { return "6\n" },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			home := hermeticWizardHome(t)
			paths := tempWizardPaths(t)
			probe, _ := newTestWizard(t, "", paths)
			input := tc.input(t, home, probe)
			w, out := newTestWizard(t, input, paths)
			if tc.configured {
				w.registeredHosts = func(context.Context) ([]host.HostVerification, error) {
					return []host.HostVerification{{HostID: "cline", Registered: true, Status: "ready"}}, nil
				}
			}
			if err := w.Run(ctx); err != nil {
				t.Fatalf("Run: %v", err)
			}
			outStr := out.String()
			assertBoundedOutput(t, outStr, 300)
			if !strings.Contains(outStr, "No more input could be read") {
				t.Errorf("expected the input-ended guidance, got:\n%s", outStr)
			}
			// Nothing may be written when input ends before an agreement.
			if _, err := os.Stat(clineConfigPath(home)); err == nil {
				t.Errorf("a file was written despite the input ending:\n%s", outStr)
			}
		})
	}
}

// --- item 1: the path written is the path the user agreed to ---------------

// TestWizard_ManualPathIsThePathWritten is the target-path invariant: answer
// "n" to the detected file, name a different one, and assert the file that was
// actually written (not just the message). The old wizard silently wrote the
// detected path instead.
func TestWizard_ManualPathIsThePathWritten(t *testing.T) {
	home := hermeticWizardHome(t)
	paths := tempWizardPaths(t)

	detected := clineConfigPath(home)
	if err := os.MkdirAll(filepath.Dir(detected), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(detected, []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	custom := filepath.Join(t.TempDir(), "my_cline_settings.json")

	probe, _ := newTestWizard(t, "", paths)
	idx := wizardRowIndex(t, probe, "cline", true)
	input := fmt.Sprintf("%d\nn\n1\n%s\ny\nq\n", idx, custom)
	w, out := newTestWizard(t, input, paths)

	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	outStr := out.String()

	data, err := os.ReadFile(custom)
	if err != nil {
		t.Fatalf("the chosen path was not written: %v\noutput:\n%s", err, outStr)
	}
	if !strings.Contains(string(data), `"litespm"`) || !strings.Contains(string(data), `"mcpServers"`) {
		t.Errorf("the chosen file does not carry the bridge entry: %s", data)
	}
	if !strings.Contains(outStr, "File written: "+custom) {
		t.Errorf("output does not name the file actually written:\n%s", outStr)
	}
	if strings.Contains(outStr, "File written: "+detected) {
		t.Errorf("output claims the detected file was written:\n%s", outStr)
	}
	orig, err := os.ReadFile(detected)
	if err != nil {
		t.Fatalf("the detected file disappeared: %v", err)
	}
	if string(orig) != "{}\n" {
		t.Errorf("the detected file was modified even though the user declined it: %q", orig)
	}
}

// unplannableAdapter implements HostAdapter (through the embedded interface)
// but NOT PathPlanner, standing in for any adapter that cannot honour a
// user-supplied path.
type unplannableAdapter struct{ host.HostAdapter }

// TestWizard_RefusesUnplannablePathWithoutWriting pins the second half of the
// invariant: when the adapter cannot write the chosen path, nothing is written
// and the refusal names the file the adapter would use instead.
func TestWizard_RefusesUnplannablePathWithoutWriting(t *testing.T) {
	home := hermeticWizardHome(t)
	paths := tempWizardPaths(t)
	custom := filepath.Join(t.TempDir(), "chosen.json")

	w, out := newTestWizard(t, "", paths)
	adapter := unplannableAdapter{HostAdapter: &host.ClineAdapter{}}
	err := w.applyAgentIntegration(context.Background(), adapter, custom)
	if err == nil {
		t.Fatalf("expected a refusal, got success; output:\n%s", out.String())
	}
	if !strings.Contains(err.Error(), "cannot write to a path chosen by hand") {
		t.Errorf("refusal does not explain the limitation: %v", err)
	}
	if !strings.Contains(err.Error(), filepath.Join(home, ".cline")) {
		t.Errorf("refusal does not name the file the adapter would use: %v", err)
	}
	if _, statErr := os.Stat(custom); statErr == nil {
		t.Fatalf("a file was written to a path the adapter cannot honour")
	}
}

// --- item 4: the agent menu comes from the adapter registry ----------------

func TestWizard_AgentMenuComesFromAdapterRegistry(t *testing.T) {
	hermeticWizardHome(t)
	ctx := context.Background()
	w, _ := newTestWizard(t, "", tempWizardPaths(t))

	rows := w.agentMenuRows(ctx)
	adapters := host.ListAdapters()
	if len(rows) != len(adapters) {
		t.Fatalf("menu has %d rows, registry has %d adapters", len(rows), len(adapters))
	}

	seen := map[string]bool{}
	for _, r := range rows {
		if seen[r.descriptor.HostID] {
			t.Errorf("host %s appears twice in the menu", r.descriptor.HostID)
		}
		seen[r.descriptor.HostID] = true

		// A row may only name the config file its own adapter resolves.
		want := ""
		if p, err := r.adapter.DetectConfig(ctx, domain.ScopeUser); err == nil {
			want = p
		}
		if r.configPath != want {
			t.Errorf("row %s names %q, adapter resolves %q", r.descriptor.HostID, r.configPath, want)
		}
		if r.exists != fileExists(want) {
			t.Errorf("row %s exists=%v, fileExists(%q)=%v", r.descriptor.HostID, r.exists, want, fileExists(want))
		}
	}
	for _, a := range adapters {
		if !seen[a.Descriptor().HostID] {
			t.Errorf("adapter %s is missing from the menu", a.Descriptor().HostID)
		}
	}

	// The Pi drift: the old hardcoded row advertised config.json, which no Pi
	// release reads. The derived row must name what the adapter actually reads.
	for _, r := range rows {
		if r.descriptor.HostID != "pi-agent" {
			continue
		}
		if base := filepath.Base(r.configPath); base != "mcp.json" {
			t.Errorf("pi-agent row names %q, want mcp.json", r.configPath)
		}
	}

	// The full list is reachable from the prompt and shows every adapter.
	w2, out := newTestWizard(t, "a\nq\n", tempWizardPaths(t))
	if err := w2.Run(ctx); err != nil {
		t.Fatalf("Run: %v", err)
	}
	outStr := out.String()
	if !strings.Contains(outStr, fmt.Sprintf("All %d supported agents", len(adapters))) {
		t.Errorf("the full-list header does not match the registry count:\n%s", outStr)
	}
	for _, a := range adapters {
		if !strings.Contains(outStr, a.Descriptor().DisplayName) {
			t.Errorf("adapter %s (%s) missing from the full list", a.Descriptor().HostID, a.Descriptor().DisplayName)
		}
	}
	if strings.Contains(outStr, "TS Extension") {
		t.Errorf("the drifted hand-written Pi row is still present:\n%s", outStr)
	}
}

// --- item 3: exists vs will be created -------------------------------------

func TestWizard_ConfigTargetWordingDistinguishesCreateFromEdit(t *testing.T) {
	ctx := context.Background()

	t.Run("missing file will be created", func(t *testing.T) {
		home := hermeticWizardHome(t)
		paths := tempWizardPaths(t)
		probe, _ := newTestWizard(t, "", paths)
		idx := wizardRowIndex(t, probe, "cline", false)
		w, out := newTestWizard(t, fmt.Sprintf("a\n%d\ny\ny\nq\n", idx), paths)
		if err := w.Run(ctx); err != nil {
			t.Fatalf("Run: %v", err)
		}
		outStr := out.String()
		if !strings.Contains(outStr, "No configuration file exists yet") || !strings.Contains(outStr, "will create") {
			t.Errorf("missing-file wording is wrong:\n%s", outStr)
		}
		if strings.Contains(outStr, "Found your existing configuration file") {
			t.Errorf("a missing file was reported as existing:\n%s", outStr)
		}
		if _, err := os.Stat(clineConfigPath(home)); err != nil {
			t.Errorf("the file was not created: %v", err)
		}
	})

	t.Run("existing file will be edited", func(t *testing.T) {
		home := hermeticWizardHome(t)
		paths := tempWizardPaths(t)
		detected := clineConfigPath(home)
		if err := os.MkdirAll(filepath.Dir(detected), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(detected, []byte("{}\n"), 0o600); err != nil {
			t.Fatal(err)
		}
		probe, _ := newTestWizard(t, "", paths)
		idx := wizardRowIndex(t, probe, "cline", true)
		w, out := newTestWizard(t, fmt.Sprintf("%d\ny\ny\nq\n", idx), paths)
		if err := w.Run(ctx); err != nil {
			t.Fatalf("Run: %v", err)
		}
		outStr := out.String()
		if !strings.Contains(outStr, "Found your existing configuration file") {
			t.Errorf("existing-file wording is wrong:\n%s", outStr)
		}
		if strings.Contains(outStr, "will create") {
			t.Errorf("an existing file was reported as created:\n%s", outStr)
		}
	})
}

// --- item 5: no "Adopt" promise --------------------------------------------

func TestWizard_DoesNotPromiseAdopt(t *testing.T) {
	home := hermeticWizardHome(t)
	paths := tempWizardPaths(t)
	detected := clineConfigPath(home)
	if err := os.MkdirAll(filepath.Dir(detected), 0o755); err != nil {
		t.Fatal(err)
	}
	existing := `{"mcpServers":{"other-tool":{"command":"other"}}}`
	if err := os.WriteFile(detected, []byte(existing), 0o600); err != nil {
		t.Fatal(err)
	}

	probe, _ := newTestWizard(t, "", paths)
	idx := wizardRowIndex(t, probe, "cline", true)
	w, out := newTestWizard(t, fmt.Sprintf("%d\ny\ny\nq\n", idx), paths)
	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	outStr := out.String()
	if strings.Contains(outStr, "use 'Adopt' in /marketplace") {
		t.Errorf("the wizard still promises the unimplemented Adopt feature:\n%s", outStr)
	}
	if !strings.Contains(outStr, "other-tool") {
		t.Errorf("the pre-existing server was not reported:\n%s", outStr)
	}
	if !strings.Contains(outStr, "will not change them") {
		t.Errorf("the pre-existing server wording does not say LiteSPM leaves it alone:\n%s", outStr)
	}
}

// --- item 7: the audited engineer vocabulary is gone ------------------------

func TestWizard_VoiceQuotesAreGone(t *testing.T) {
	hermeticWizardHome(t)
	w, out := newTestWizard(t, "q\n", tempWizardPaths(t))
	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	outStr := out.String()
	for _, banned := range []string{
		"Protocol Version",
		"advisory metadata",
		"Verified Host Adapters Compiled",
		"Performing safe atomic configuration merge",
		"Generating integration plan",
	} {
		if strings.Contains(outStr, banned) {
			t.Errorf("audited wording still present: %q\n%s", banned, outStr)
		}
	}
}

// --- item 6: the "what next" actions go through the shared implementations --

func wizardEnvForHarness(t *testing.T, h *harness) {
	t.Helper()
	t.Setenv("LITESPM_DATA_ROOT", h.paths.DataRoot)
	t.Setenv("LITESPM_CONFIG_ROOT", h.paths.ConfigRoot)
	t.Setenv("LITESPM_RUNTIME_ROOT", h.paths.RuntimeRoot)
}

// activateWizardListing marks a harness fixture active in the search index.
// The harness seeds listings for GetListing-based flows; search filters on the
// active status, so the wizard tests re-index the same row with it set.
func activateWizardListing(t *testing.T, h *harness, listingID string) {
	t.Helper()
	listing, err := h.catClient.GetListing(listingID)
	if err != nil {
		t.Fatalf("GetListing(%s): %v", listingID, err)
	}
	listing.Status = domain.ListingStatusActive
	h.catClient.IndexListings([]*domain.Listing{listing})
}

// wizardInstallInput is the scripted conversation that finds and installs the
// demo skill through the wizard's own menu.
const wizardInstallInput = "2\ndemo-skill\n1\n1\ny\nq\n"

func TestWizard_InstallActionLandsInTheSkillsLedger(t *testing.T) {
	h, listingID, home := skillHarness(t)
	wizardEnvForHarness(t, h)
	activateWizardListing(t, h, listingID)

	w, out := newTestWizard(t, wizardInstallInput, h.paths)
	w.registeredHosts = func(context.Context) ([]host.HostVerification, error) {
		return []host.HostVerification{{HostID: "cursor", Registered: true, Status: "ready"}}, nil
	}
	w.catalogClient = func() *catalog.Client { return h.catClient }
	w.openState = func() (*state.DB, error) { return h.db, nil }

	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	outStr := out.String()
	if !strings.Contains(outStr, "✓ Installed skill demo-skill") {
		t.Fatalf("install did not report success:\n%s", outStr)
	}

	// The effect is asserted through the real code path: a skill directory and
	// a skills-ledger row, exactly as `litespm install` writes them.
	if _, err := os.Stat(filepath.Join(home, ".cursor", "skills", "demo-skill", "SKILL.md")); err != nil {
		t.Errorf("skill was not written: %v", err)
	}
	ledger, err := skills.OpenLedger(skills.LedgerPath(h.paths.DataRoot))
	if err != nil {
		t.Fatalf("open ledger: %v", err)
	}
	entries, err := ledger.All()
	if err != nil {
		t.Fatalf("read ledger: %v", err)
	}
	found := false
	for _, e := range entries {
		if e.SkillName == "demo-skill" {
			found = true
		}
	}
	if !found {
		t.Fatalf("no ledger row for the installed skill: %+v", entries)
	}

	// The shared authorization gate also recorded the plan/approval, and the
	// install record is what `list_installed` and removal read.
	recs, err := h.db.ListInstalls(context.Background(), domain.ScopeUser, "")
	if err != nil {
		t.Fatalf("ListInstalls: %v", err)
	}
	foundRec := false
	for _, r := range recs {
		if r.ListingID == listingID {
			foundRec = true
		}
	}
	if !foundRec {
		t.Fatalf("no install record for %s", listingID)
	}
}

// TestWizard_SecondRunReachesMenuWithoutReapplying pins that a bare `litespm`
// on an already-configured machine is a management session: the menu appears
// and no setup write happens.
func TestWizard_SecondRunReachesMenuWithoutReapplying(t *testing.T) {
	h, listingID, _ := skillHarness(t)
	wizardEnvForHarness(t, h)
	activateWizardListing(t, h, listingID)

	w, out := newTestWizard(t, "q\n", h.paths)
	w.registeredHosts = func(context.Context) ([]host.HostVerification, error) {
		return []host.HostVerification{{HostID: "cursor", Registered: true, Status: "ready", ConfigPath: "/tmp/cursor.json"}}, nil
	}
	w.catalogClient = func() *catalog.Client { return h.catClient }
	w.openState = func() (*state.DB, error) { return h.db, nil }

	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	outStr := out.String()
	if !strings.Contains(outStr, "LiteSPM is already set up for") {
		t.Errorf("second run does not report the configured state:\n%s", outStr)
	}
	if !strings.Contains(outStr, "What would you like to do?") {
		t.Errorf("second run did not reach the action menu:\n%s", outStr)
	}
	if strings.Contains(outStr, "Write this change?") || strings.Contains(outStr, "Looking for") {
		t.Errorf("second run re-ran setup instead of showing the menu:\n%s", outStr)
	}
	if !strings.Contains(outStr, "Nothing was changed.") {
		t.Errorf("second run does not state that nothing was changed:\n%s", outStr)
	}
}

// TestWizard_RemoveActionRemovesWhatItInstalled drives the wizard's removal
// through the same ledger-driven engine `litespm install remove` uses.
func TestWizard_RemoveActionRemovesWhatItInstalled(t *testing.T) {
	h, listingID, home := skillHarness(t)
	wizardEnvForHarness(t, h)
	activateWizardListing(t, h, listingID)

	installW, installOut := newTestWizard(t, wizardInstallInput, h.paths)
	installW.registeredHosts = func(context.Context) ([]host.HostVerification, error) {
		return []host.HostVerification{{HostID: "cursor", Registered: true, Status: "ready"}}, nil
	}
	installW.catalogClient = func() *catalog.Client { return h.catClient }
	installW.openState = func() (*state.DB, error) { return h.db, nil }
	if err := installW.Run(context.Background()); err != nil {
		t.Fatalf("install run: %v", err)
	}
	if !strings.Contains(installOut.String(), "✓ Installed skill demo-skill") {
		t.Fatalf("install setup failed:\n%s", installOut.String())
	}
	dest := filepath.Join(home, ".cursor", "skills", "demo-skill")

	removeW, removeOut := newTestWizard(t, "3\n1\ny\nq\n", h.paths)
	removeW.registeredHosts = func(context.Context) ([]host.HostVerification, error) {
		return []host.HostVerification{{HostID: "cursor", Registered: true, Status: "ready"}}, nil
	}
	removeW.catalogClient = func() *catalog.Client { return h.catClient }
	removeW.openState = func() (*state.DB, error) { return h.db, nil }
	if err := removeW.Run(context.Background()); err != nil {
		t.Fatalf("remove run: %v", err)
	}
	outStr := removeOut.String()
	if !strings.Contains(outStr, "This will delete:") || !strings.Contains(outStr, dest) {
		t.Fatalf("removal did not show the destination before deleting:\n%s", outStr)
	}
	if _, err := os.Stat(dest); err == nil {
		t.Fatalf("the skill directory was not removed:\n%s", outStr)
	}
	ledger, err := skills.OpenLedger(skills.LedgerPath(h.paths.DataRoot))
	if err != nil {
		t.Fatalf("open ledger: %v", err)
	}
	entries, err := ledger.All()
	if err != nil {
		t.Fatalf("read ledger: %v", err)
	}
	for _, e := range entries {
		if e.SkillName == "demo-skill" {
			t.Fatalf("ledger still names the removed skill: %+v", e)
		}
	}
}

// --- the remaining "what next" actions -------------------------------------

// newHarnessWizard builds a wizard wired to a test harness: configured state,
// the fixture catalog, and the harness database.
func newHarnessWizard(t *testing.T, h *harness, in string) (*Wizard, *bytes.Buffer) {
	t.Helper()
	w, out := newTestWizard(t, in, h.paths)
	w.registeredHosts = func(context.Context) ([]host.HostVerification, error) {
		return []host.HostVerification{{HostID: "cursor", Registered: true, Status: "ready"}}, nil
	}
	w.catalogClient = func() *catalog.Client { return h.catClient }
	w.openState = func() (*state.DB, error) { return h.db, nil }
	return w, out
}

// TestWizard_SyncFailureNeverClaimsSuccess pins the honesty rule for the one
// action that touches the network: a failed download says so, names the
// command that retries it, and prints no success line.
func TestWizard_SyncFailureNeverClaimsSuccess(t *testing.T) {
	hermeticWizardHome(t)
	paths := tempWizardPaths(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no catalog here", http.StatusInternalServerError)
	}))
	defer server.Close()

	w, out := newTestWizard(t, "1\ny\nq\n", paths)
	w.registeredHosts = func(context.Context) ([]host.HostVerification, error) {
		return []host.HostVerification{{HostID: "cline", Registered: true, Status: "ready"}}, nil
	}
	w.catalogClient = func() *catalog.Client {
		return catalog.NewClient(server.URL, filepath.Join(t.TempDir(), "catalog"), nil)
	}

	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	outStr := out.String()
	if strings.Contains(outStr, "✓ Catalog") {
		t.Errorf("a failed sync printed a success line:\n%s", outStr)
	}
	if !strings.Contains(outStr, "✗ Could not update the catalog") {
		t.Errorf("a failed sync was not reported as a failure:\n%s", outStr)
	}
	if !strings.Contains(outStr, "litespm catalog sync") {
		t.Errorf("a failed sync does not name the command to retry:\n%s", outStr)
	}
}

// TestWizard_ListActionShowsTheSharedInventory drives menu entry [4] and
// asserts it renders the same `litespm list` inventory, including the skill the
// wizard installed.
func TestWizard_ListActionShowsTheSharedInventory(t *testing.T) {
	h, listingID, _ := skillHarness(t)
	wizardEnvForHarness(t, h)
	activateWizardListing(t, h, listingID)

	installW, installOut := newHarnessWizard(t, h, wizardInstallInput)
	if err := installW.Run(context.Background()); err != nil {
		t.Fatalf("install run: %v", err)
	}
	if !strings.Contains(installOut.String(), "✓ Installed skill demo-skill") {
		t.Fatalf("install setup failed:\n%s", installOut.String())
	}

	listW, listOut := newHarnessWizard(t, h, "4\nq\n")
	if err := listW.Run(context.Background()); err != nil {
		t.Fatalf("list run: %v", err)
	}
	outStr := listOut.String()
	if !strings.Contains(outStr, "unique capabilities") {
		t.Errorf("list action did not render the shared inventory:\n%s", outStr)
	}
	if !strings.Contains(outStr, "demo-skill") {
		t.Errorf("list action does not show the installed skill:\n%s", outStr)
	}
}

// TestWizard_EOFStopsInsideHarnessActions is the bounded-output check for the
// two prompts that only exist once the shared engines are reachable: the
// install confirmation and the removal confirmation. Neither may act when the
// input ends before the answer.
func TestWizard_EOFStopsInsideHarnessActions(t *testing.T) {
	ctx := context.Background()

	t.Run("install confirmation", func(t *testing.T) {
		h, listingID, home := skillHarness(t)
		wizardEnvForHarness(t, h)
		activateWizardListing(t, h, listingID)

		w, out := newHarnessWizard(t, h, "2\ndemo-skill\n1\n1\n")
		if err := w.Run(ctx); err != nil {
			t.Fatalf("Run: %v", err)
		}
		outStr := out.String()
		assertBoundedOutput(t, outStr, 300)
		if !strings.Contains(outStr, "No more input could be read") {
			t.Errorf("expected the input-ended guidance, got:\n%s", outStr)
		}
		if _, err := os.Stat(filepath.Join(home, ".cursor", "skills", "demo-skill")); err == nil {
			t.Errorf("a skill was installed although the confirmation never happened:\n%s", outStr)
		}
	})

	t.Run("removal confirmation", func(t *testing.T) {
		h, listingID, home := skillHarness(t)
		wizardEnvForHarness(t, h)
		activateWizardListing(t, h, listingID)

		installW, installOut := newHarnessWizard(t, h, wizardInstallInput)
		if err := installW.Run(ctx); err != nil {
			t.Fatalf("install run: %v", err)
		}
		if !strings.Contains(installOut.String(), "✓ Installed skill demo-skill") {
			t.Fatalf("install setup failed:\n%s", installOut.String())
		}
		dest := filepath.Join(home, ".cursor", "skills", "demo-skill")

		removeW, removeOut := newHarnessWizard(t, h, "3\n1\n")
		if err := removeW.Run(ctx); err != nil {
			t.Fatalf("remove run: %v", err)
		}
		outStr := removeOut.String()
		assertBoundedOutput(t, outStr, 300)
		if !strings.Contains(outStr, "No more input could be read") {
			t.Errorf("expected the input-ended guidance, got:\n%s", outStr)
		}
		if _, err := os.Stat(dest); err != nil {
			t.Errorf("the skill was removed although the confirmation never happened: %v\n%s", err, outStr)
		}
	})
}
