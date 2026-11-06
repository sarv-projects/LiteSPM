package main

// wizard_tui_test.go — the parts of the wizard's TUI work that can be pinned
// without a terminal: the prompt rows the two menus are built from, what the
// pre-install summary and the completion boxes say, and the compact
// "already set up" summary. The end-to-end install paths are exercised through
// the wizard's non-TTY fallbacks, which read the same scripted input the other
// wizard tests use.

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/skills"
)

// --- the manager menu -------------------------------------------------------

// TestWizardActionMenuItemsCoverEveryNumberedAction pins the two menus
// together: every action the numbered fallback accepts must also exist as a
// prompt row, with the same id, so the TUI cannot drift from the text menu.
func TestWizardActionMenuItemsCoverEveryNumberedAction(t *testing.T) {
	hermeticWizardHome(t)
	w, _ := newTestWizard(t, "", tempWizardPaths(t))
	w.catalogClient = func() *catalog.Client { return catalog.NewClient("", t.TempDir(), nil) }

	items := w.actionMenuItems()
	byID := map[string]promptItem{}
	for _, item := range items {
		if item.ID == "" || item.Label == "" {
			t.Errorf("menu row %+v has no id or label", item)
		}
		if _, dup := byID[item.ID]; dup {
			t.Errorf("menu id %q appears twice", item.ID)
		}
		byID[item.ID] = item
	}
	for _, id := range []string{"1", "2", "3", "4", "5", "6", "7", "q"} {
		item, ok := byID[id]
		if !ok {
			t.Fatalf("the prompt menu has no row for action %q", id)
		}
		if item.Group == "" {
			t.Errorf("menu row %q is not grouped", id)
		}
	}
	if len(items) != 8 {
		t.Errorf("the menu has %d rows, want 8", len(items))
	}
	for id, want := range map[string]string{"6": "skill", "7": "marketplace"} {
		if !strings.Contains(strings.ToLower(byID[id].Label), want) {
			t.Errorf("row %q does not advertise %q: %q", id, want, byID[id].Label)
		}
	}
}

// TestWizardInstallScopeItemsMapToTheRightScope pins the scope prompt: two
// rows whose ids map onto the scope the install actually uses, and the
// numbered fallback's answers mapping the same way.
func TestWizardInstallScopeItemsMapToTheRightScope(t *testing.T) {
	items := installScopePromptItems()
	if len(items) != 2 {
		t.Fatalf("the scope prompt has %d rows, want 2", len(items))
	}
	byID := map[string]promptItem{}
	for _, item := range items {
		byID[item.ID] = item
		if item.Hint == "" || item.Detail == "" {
			t.Errorf("scope row %q carries no hint or detail: %+v", item.ID, item)
		}
	}
	if _, ok := byID["user"]; !ok {
		t.Error("the scope prompt has no user row")
	}
	if _, ok := byID["project"]; !ok {
		t.Error("the scope prompt has no project row")
	}

	for id, want := range map[string]domain.InstallScope{
		"user":    domain.ScopeUser,
		"1":       domain.ScopeUser,
		"":        domain.ScopeUser,
		"project": domain.ScopeProject,
		"2":       domain.ScopeProject,
	} {
		got, ok := installScopeFromPromptID(id)
		if !ok || got != want {
			t.Errorf("installScopeFromPromptID(%q) = (%q, %v), want (%q, true)", id, got, ok, want)
		}
	}
	if _, ok := installScopeFromPromptID("garbage"); ok {
		t.Error("an unknown scope answer was accepted")
	}
}

// --- the pre-install summary -----------------------------------------------

// TestWizardMCPInstallSummaryBoxCarriesTheSealedFacts pins the contents of the
// pre-install summary: the listing, the version, the scope, the target agents
// with the file each one will be written to, the launch line (or endpoint with
// its transport), the effects, the conflict answer and the backup note.
func TestWizardMCPInstallSummaryBoxCarriesTheSealedFacts(t *testing.T) {
	hermeticWizardHome(t)
	paths := tempWizardPaths(t)
	w, _ := newTestWizard(t, "", paths)

	listing := &domain.Listing{ID: "mcp:acme:context7", Kind: domain.KindMCP, Name: "context7"}
	value, err := json.Marshal(mcpInstallPlanValue{Runtime: domain.RuntimeDescriptor{
		Type: "stdio", Command: "npx", Args: []string{"-y", "@acme/context7"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	plan := &domain.InstallPlan{
		PlanID:      "plan_fixture",
		Request:     domain.PlanRequest{ListingID: listing.ID, RequestedVersion: "1.2.3", TargetScope: domain.ScopeUser},
		Resolved:    domain.PlanResolved{Version: "1.2.3"},
		Effects:     []string{"package.install", "host.config.write"},
		HostChanges: mcpPlanFixtureChanges("cline", "/home/user/.cline/data/settings/cline_mcp_settings.json", string(value)),
	}
	box := w.installSummaryBox(listing, &installGrant{Plan: plan, Scope: domain.ScopeUser},
		`No target agent already registers an entry named "context7".`)

	for _, want := range []string{
		"Install summary",
		"context7",
		"mcp:acme:context7",
		"1.2.3",
		"this machine",
		"npx -y @acme/context7",
		"package.install",
		hostDisplayName("cline"),
		"/home/user/.cline/data/settings/cline_mcp_settings.json",
		"No target agent already registers an entry named",
		"backed up",
	} {
		if !strings.Contains(box, want) {
			t.Errorf("the install summary does not contain %q:\n%s", want, box)
		}
	}

	// A remote row's summary states the endpoint and the transport the entry
	// is written with, never a command that does not exist.
	remoteValue, err := json.Marshal(mcpInstallPlanValue{Runtime: domain.RuntimeDescriptor{
		Type: "sse", Endpoint: "https://mcp.example.com/sse",
	}})
	if err != nil {
		t.Fatal(err)
	}
	plan.HostChanges = mcpPlanFixtureChanges("cline", "/home/user/.cline/data/settings/cline_mcp_settings.json", string(remoteValue))
	remoteBox := w.installSummaryBox(listing, &installGrant{Plan: plan, Scope: domain.ScopeUser}, "")
	for _, want := range []string{"endpoint", "https://mcp.example.com/sse", "sse"} {
		if !strings.Contains(remoteBox, want) {
			t.Errorf("the remote install summary does not contain %q:\n%s", want, remoteBox)
		}
	}
}

// TestWizardSkillInstallSummaryBoxCarriesTheSealedDestinations pins the skill
// summary: the destinations the plan sealed, and the no-overwrite note.
func TestWizardSkillInstallSummaryBoxCarriesTheSealedDestinations(t *testing.T) {
	hermeticWizardHome(t)
	w, _ := newTestWizard(t, "", tempWizardPaths(t))

	listing := &domain.Listing{ID: "skill:acme:demo", Kind: domain.KindSkill, Name: "demo-skill"}
	plan := &domain.InstallPlan{
		PlanID:   "plan_fixture",
		Request:  domain.PlanRequest{ListingID: listing.ID, RequestedVersion: "2.0.0", TargetScope: domain.ScopeUser},
		Resolved: domain.PlanResolved{Version: "2.0.0"},
		Effects:  []string{"package.install", "filesystem.write"},
		HostChanges: []domain.HostChange{{
			HostID: "cursor", ConfigPath: "/home/user/.cursor/skills",
			Action: skillWriteAction, EntryKey: "demo-skill",
		}},
	}
	box := w.installSummaryBox(listing, &installGrant{Plan: plan, Scope: domain.ScopeUser}, "")
	for _, want := range []string{
		"Install summary",
		"demo-skill",
		"2.0.0",
		skillAgentLabel("cursor"),
		"/home/user/.cursor/skills",
		"filesystem.write",
		"Nothing existing is overwritten",
	} {
		if !strings.Contains(box, want) {
			t.Errorf("the skill install summary does not contain %q:\n%s", want, box)
		}
	}
}

// mcpPlanFixtureChanges builds the host changes an MCP plan seals for one host.
func mcpPlanFixtureChanges(hostID, configPath, valueJSON string) []domain.HostChange {
	return []domain.HostChange{{
		HostID:     hostID,
		ConfigPath: configPath,
		Action:     "register_command",
		EntryKey:   "context7",
		ValueJSON:  valueJSON,
	}}
}

// --- the completion boxes ---------------------------------------------------

// TestWizardInstallCompletionBoxesListHostsAndPaths pins what the task asks a
// completion box to carry: the entry or skill name, every host with the config
// path (or directory) written, and the footer that says nothing else changed.
func TestWizardInstallCompletionBoxesListHostsAndPaths(t *testing.T) {
	t.Run("mcp", func(t *testing.T) {
		const configPath = "/home/user/.cline/data/settings/cline_mcp_settings.json"
		box := mcpInstallCompletionBox(&mcpInstallOutcome{
			Entry: host.ServerEntry{Name: "context7", Command: "npx", Args: []string{"-y", "@acme/context7"}},
			Hosts: []*host.EntryInstallResult{{HostID: "cline", ConfigPath: configPath, Created: true}},
		})
		for _, want := range []string{
			"✓ Registered MCP server context7",
			"npx -y @acme/context7",
			hostDisplayName("cline"),
			configPath,
			"Nothing else was changed",
		} {
			if !strings.Contains(box, want) {
				t.Errorf("the MCP completion box does not contain %q:\n%s", want, box)
			}
		}
	})

	t.Run("skill", func(t *testing.T) {
		const dest = "/home/user/.cursor/skills/demo-skill"
		box := skillInstallCompletionBox(&skillInstallOutcome{
			SkillName:    "demo-skill",
			Destinations: []string{dest},
			LedgerEntries: []skills.LedgerEntry{{
				SkillName: "demo-skill", AgentID: "cursor", HostLabel: "cursor", DestDir: dest,
			}},
		})
		for _, want := range []string{
			"✓ Installed skill demo-skill",
			skillAgentLabel("cursor"),
			dest,
			"Nothing else was changed",
		} {
			if !strings.Contains(box, want) {
				t.Errorf("the skill completion box does not contain %q:\n%s", want, box)
			}
		}
	})
}

// --- the end-to-end non-TTY flows -------------------------------------------

// TestWizardMCPInstallShowsSummaryAndCompletion drives a real MCP install
// through the wizard's scripted prompts and asserts the two boxes around the
// write: the summary before it (built from the sealed plan) and the completion
// box after it, plus the config file the completion box names.
func TestWizardMCPInstallShowsSummaryAndCompletion(t *testing.T) {
	h := newHarnessWith(t, nil)
	wizardEnvForHarness(t, h)
	activateWizardListing(t, h, testListingID)
	_, configPath := homeWithBridge(t)

	w, out := newHarnessWizard(t, h, "2\ndemo-tool\n1\n1\ny\nq\n")
	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	got := out.String()

	for _, want := range []string{
		"Install summary",
		"demo-tool",
		"npx -y demo-tool",
		hostDisplayName("claude-code"),
		configPath,
		"No target agent already registers an entry named",
		"✓ Registered MCP server demo-tool",
		"Nothing else was changed",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("the wizard output does not contain %q:\n%s", want, got)
		}
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("the install did not write the host config: %v", err)
	}
	if !strings.Contains(string(data), `"demo-tool"`) {
		t.Errorf("the host config does not carry the installed entry: %s", data)
	}
}

// TestWizardDeclinedInstallWritesNothing pins the confirmation's order: the
// summary is shown, the answer is no, and neither the host config nor a skill
// directory is touched.
func TestWizardDeclinedInstallWritesNothing(t *testing.T) {
	h := newHarnessWith(t, nil)
	wizardEnvForHarness(t, h)
	activateWizardListing(t, h, testListingID)
	_, configPath := homeWithBridge(t)

	w, out := newHarnessWizard(t, h, "2\ndemo-tool\n1\n1\nn\nq\n")
	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	got := out.String()
	if !strings.Contains(got, "Install summary") {
		t.Fatalf("the summary was not shown before the confirmation:\n%s", got)
	}
	if !strings.Contains(got, "Not installed. Nothing was changed.") {
		t.Fatalf("a declined install did not say nothing changed:\n%s", got)
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("the pre-existing config disappeared: %v", err)
	}
	if strings.Contains(string(data), `"demo-tool"`) {
		t.Errorf("a declined install wrote the entry anyway: %s", data)
	}
	if strings.Contains(got, "✓ Registered MCP server") {
		t.Errorf("a declined install printed a completion box:\n%s", got)
	}
}

// --- the compact configured summary ----------------------------------------

// TestWizardConfiguredSummaryIsOneCompactLine pins the compact summary: the
// count and the names, the substrings the other wizard tests assert, no
// per-host configuration paths, and a pointer at `litespm host detect`.
func TestWizardConfiguredSummaryIsOneCompactLine(t *testing.T) {
	hermeticWizardHome(t)
	w, out := newTestWizard(t, "", tempWizardPaths(t))
	w.printConfiguredSummary([]host.HostVerification{
		{HostID: "cline", ConfigPath: "/tmp/cline/cline_mcp_settings.json"},
		{HostID: "cursor", ConfigPath: "/tmp/cursor/mcp.json"},
	})
	got := out.String()
	if !strings.Contains(got, "LiteSPM is already set up for") {
		t.Fatalf("the asserted substring is gone:\n%s", got)
	}
	if !strings.Contains(got, "Nothing was changed.") {
		t.Fatalf("the summary no longer says nothing was changed:\n%s", got)
	}
	if !strings.Contains(got, "litespm host detect") {
		t.Fatalf("the summary does not point at `litespm host detect`:\n%s", got)
	}
	for _, want := range []string{"2", hostDisplayName("cline"), hostDisplayName("cursor")} {
		if !strings.Contains(got, want) {
			t.Errorf("the summary does not name %q:\n%s", want, got)
		}
	}
	for _, unwanted := range []string{"/tmp/cline/cline_mcp_settings.json", "/tmp/cursor/mcp.json"} {
		if strings.Contains(got, unwanted) {
			t.Errorf("the compact summary still prints the path %q:\n%s", unwanted, got)
		}
	}
	if n := countLines(got); n > 3 {
		t.Errorf("the configured summary is %d lines, want at most 3:\n%s", n, got)
	}
}

// TestWizardCompactConfiguredSummaryHandlesManyHosts keeps the one-line
// promise with a long list: the count stays honest and the names are capped
// rather than wrapped over the whole screen.
func TestWizardCompactConfiguredSummaryHandlesManyHosts(t *testing.T) {
	hermeticWizardHome(t)
	w, out := newTestWizard(t, "", tempWizardPaths(t))
	var configured []host.HostVerification
	for i := 0; i < 12; i++ {
		configured = append(configured, host.HostVerification{
			HostID:     "host-" + strconv.Itoa(i),
			ConfigPath: filepath.Join("/tmp", "host-"+strconv.Itoa(i), "config.json"),
		})
	}
	w.printConfiguredSummary(configured)
	got := out.String()
	if !strings.Contains(got, "12") {
		t.Errorf("the summary does not carry the count:\n%s", got)
	}
	if !strings.Contains(got, "+4 more") {
		t.Errorf("a 12-agent summary does not cap the list:\n%s", got)
	}
	if n := countLines(got); n > 3 {
		t.Errorf("the configured summary is %d lines, want at most 3:\n%s", n, got)
	}
}
