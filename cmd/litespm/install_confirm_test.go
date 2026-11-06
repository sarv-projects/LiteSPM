package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

func TestInstallUsageDocumentsYes(t *testing.T) {
	for _, want := range []string{"[--yes]", "--yes"} {
		if !strings.Contains(installUsage, want) {
			t.Errorf("install usage is missing %q", want)
		}
	}
}

func TestParseInstallFlagsAcceptsYes(t *testing.T) {
	for _, arg := range []string{"--yes", "-y"} {
		flags, err := parseInstallFlags([]string{"mcp:example:demo", arg})
		if err != nil {
			t.Fatalf("%s: %v", arg, err)
		}
		if !flags.yes {
			t.Errorf("%s did not set yes", arg)
		}
	}
	flags, err := parseInstallFlags([]string{"mcp:example:demo"})
	if err != nil {
		t.Fatal(err)
	}
	if flags.yes {
		t.Error("yes must default to false")
	}
}

// The question is only asked of a person: scripted and piped runs skip it, and
// the test process has no terminal, so the default must not ask either.
func TestInstallConfirmWantedSkipsScriptedAndPipedRuns(t *testing.T) {
	if installConfirmWanted(installFlags{yes: true}) {
		t.Error("--yes must skip the question")
	}
	if installConfirmWanted(installFlags{dryRun: true}) {
		t.Error("--dry-run must skip the question")
	}
	if installConfirmWanted(installFlags{}) {
		t.Error("a run without a terminal must not ask")
	}
}

func TestConfirmInstallPromptDialect(t *testing.T) {
	cases := map[string]bool{
		"\n": true, "y\n": true, "Y\n": true, "yes\n": true, "YES\n": true,
		"n\n": false, "no\n": false, "whatever\n": false, "": false,
	}
	for input, want := range cases {
		var out strings.Builder
		got, err := confirmInstallPrompt(strings.NewReader(input), &out)
		if err != nil {
			t.Fatalf("input %q: %v", input, err)
		}
		if got != want {
			t.Errorf("input %q -> %v, want %v", input, got, want)
		}
	}

	var out strings.Builder
	if _, err := confirmInstallPrompt(strings.NewReader("n\n"), &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "[Y/n]") {
		t.Errorf("the prompt must state its dialect, got %q", out.String())
	}
}

// A declined confirmation must leave the machine as it found it: the person saw
// the sealed plan, and nothing was recorded for it.
func TestAuthorizeHumanInstallDeclinedLeavesNoState(t *testing.T) {
	h, listingID, _ := skillHarness(t)
	listing, err := h.catClient.GetListing(listingID)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	var shown *domain.InstallPlan
	calls := 0
	confirm := func(plan *domain.InstallPlan) (bool, error) {
		calls++
		shown = plan
		return false, nil
	}
	_, _, err = authorizeHumanInstall(ctx, h.db, h.catClient, listing, "1.0.0", domain.ScopeUser, "", nil, nil, confirm)
	if !errors.Is(err, errInstallDeclined) {
		t.Fatalf("err = %v, want errInstallDeclined", err)
	}
	if calls != 1 || shown == nil {
		t.Fatalf("confirm calls = %d, plan = %v; want exactly one call with the plan", calls, shown)
	}
	if shown.PlanHash == "" || len(shown.HostChanges) == 0 {
		t.Errorf("the confirmation must show the sealed plan: hash=%q changes=%d", shown.PlanHash, len(shown.HostChanges))
	}
	if _, err := h.db.GetPlan(ctx, shown.PlanID); err == nil {
		t.Error("a declined install recorded a plan row")
	}

	// Negative control: without a confirm callback the path still records and
	// grants, so the parameter is optional in behaviour, not only in shape.
	grant, _, err := authorizeHumanInstall(ctx, h.db, h.catClient, listing, "1.0.0", domain.ScopeUser, "", nil, nil, nil)
	if err != nil || grant == nil {
		t.Fatalf("no-confirm install: grant=%v err=%v", grant, err)
	}
}
