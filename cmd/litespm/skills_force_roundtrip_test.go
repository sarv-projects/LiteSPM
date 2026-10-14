package main

// skills_force_roundtrip_test.go — the `skills add --force` overwrite path,
// end to end: a hand-edited (sentinel) skill is overwritten by the canonical
// version, and the product's REAL rollback entry point for a replaced skill
// tree — restoreSkillOverwrite, the transaction compensation copy.go uses —
// brings the sentinel bytes back.

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/skills"
)

func TestSkillsAddForceOverwriteRoundTripRestoresSentinel(t *testing.T) {
	ctx := context.Background()
	dataRoot := t.TempDir()
	ledger, err := skills.OpenLedger(skills.LedgerPath(dataRoot))
	if err != nil {
		t.Fatal(err)
	}
	installer := skills.NewInstaller(ledger, nil)

	// A normal v1 install, so the destination is ledger-managed.
	srcV1 := filepath.Join(t.TempDir(), "pdf")
	writeTestSkill(t, srcV1, "pdf", "v1 body")
	dst := filepath.Join(t.TempDir(), "skills", "pdf")
	if _, err := installer.Install(ctx, skills.InstallRequest{
		Op:     skills.InstallOp{SkillName: "pdf", FromDir: srcV1, ToDir: dst, HostLabel: "codex"},
		Source: skills.SkillSource{Display: "owner/repo"},
		Scope:  "global",
	}); err != nil {
		t.Fatalf("seed the v1 install: %v", err)
	}

	// The user hand-edits the skill: the sentinel that must survive the
	// round trip byte-for-byte.
	sentinel := "---\nname: pdf\ndescription: test skill for pdf\n---\n# SENTINEL — my hand edit\n"
	if err := os.WriteFile(filepath.Join(dst, "SKILL.md"), []byte(sentinel), 0o644); err != nil {
		t.Fatal(err)
	}

	// The ledger row the overwrite will replace.
	found, prior, err := findLedgerEntry(ledger, dst)
	if err != nil || !found {
		t.Fatalf("prior ledger row: found=%v err=%v", found, err)
	}

	// --force install of the canonical v2 over the sentinel.
	srcV2 := filepath.Join(t.TempDir(), "pdf")
	writeTestSkill(t, srcV2, "pdf", "v2 canonical body")
	entry2, err := installer.Install(ctx, skills.InstallRequest{
		Op:         skills.InstallOp{SkillName: "pdf", FromDir: srcV2, ToDir: dst, HostLabel: "codex"},
		Source:     skills.SkillSource{Display: "owner/repo"},
		Scope:      "global",
		Force:      true,
		BackupRoot: filepath.Join(dataRoot, "backups"),
	})
	if err != nil {
		t.Fatalf("force install failed: %v", err)
	}
	if entry2.PreImageDigest == "" || entry2.PreImageBackup == "" {
		t.Fatalf("force install recorded no pre-image: %+v", entry2)
	}
	if data, _ := os.ReadFile(filepath.Join(dst, "SKILL.md")); strings.Contains(string(data), "SENTINEL") {
		t.Fatal("the sentinel should be gone after the overwrite")
	}

	// Rollback through the real restore entry point.
	if err := restoreSkillOverwrite(ledger, dst, prior, entry2.PreImageBackup); err != nil {
		t.Fatalf("restoreSkillOverwrite failed: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dst, "SKILL.md"))
	if err != nil || string(data) != sentinel {
		t.Fatalf("the sentinel content did not come back: %q %v", data, err)
	}
	// The ledger row reverted to the pre-overwrite record, and the backup
	// was consumed by being moved back into place.
	restoredFound, restored, err := findLedgerEntry(ledger, dst)
	if err != nil || !restoredFound {
		t.Fatalf("restored ledger row: found=%v err=%v", restoredFound, err)
	}
	if restored.ContentDigest != prior.ContentDigest || restored.PreImageDigest != "" {
		t.Errorf("ledger row did not revert: %+v, want %+v", restored, prior)
	}
	if _, err := os.Stat(entry2.PreImageBackup); !os.IsNotExist(err) {
		t.Error("the backup directory should have been moved back into place")
	}
}

func TestParseSkillsAddArgsForce(t *testing.T) {
	for _, flag := range []string{"--force", "-f"} {
		opts, err := parseSkillsAddArgs([]string{flag, "owner/repo"})
		if err != nil {
			t.Fatalf("%s: %v", flag, err)
		}
		if !opts.force {
			t.Errorf("%s did not set force: %+v", flag, opts)
		}
	}
	opts, err := parseSkillsAddArgs([]string{"owner/repo"})
	if err != nil {
		t.Fatal(err)
	}
	if opts.force {
		t.Errorf("force must default to false: %+v", opts)
	}
}
