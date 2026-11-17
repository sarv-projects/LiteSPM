package main

import (
	"path/filepath"
	"testing"

	"github.com/sarv-projects/litespm/internal/host"
)

// Regression: a setup plan must be shown and a non-interactive caller without
// --yes must be refused. The audit reproduced a config write with no preview
// and no way to say "no".
func TestConfirmHostWriteRefusesNonInteractiveWithoutYes(t *testing.T) {
	plan := &host.HostChangePlan{
		HostID:        "claude-code",
		ConfigPath:    filepath.Join(t.TempDir(), ".claude.json"),
		OriginalContent: "{\n}\n",
		ProposedContent: "{\n  \"mcpServers\": {}\n}\n",
	}
	// Output goes to the real stdout; the assertion is the boolean decision,
	// which must be false for a non-interactive session without --yes.
	if confirmHostWrite(plan, false) {
		t.Fatal("non-interactive setup without --yes must not write")
	}
	if !confirmHostWrite(plan, true) {
		t.Fatal("--yes must permit a scripted setup")
	}
}
