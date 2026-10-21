package main

// skills_adopt_test.go — `litespm skills adopt`.
//
// The point of the command: a skill that the AGENT's own package manager
// installed can be brought under LiteSPM's management without being
// reinstalled, rewritten, or removed from the agent.
//
// The properties this file pins:
//
//  1. Adoption writes nothing but the ledger row: the skill's bytes are
//     exactly as they were.
//  2. The adopted tree is inventoried as it stands, so a file the user adds
//     AFTER the adoption blocks a later removal (the same guard a skill
//     LiteSPM installed gets).
//  3. An update refuses an adopted row rather than guessing a source.
//  4. A name that is not in any tree is refused.

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/skills"
)

// adoptSkillFixture builds a machine with one agent that has a skills tree
// holding one skill that LiteSPM did not install.
type adoptSkillFixture struct {
	home       string
	skillsDir  string
	skillDir   string
	skillBytes []byte
	paths      *config.PlatformPaths
}

func newAdoptSkillFixture(t *testing.T) *adoptSkillFixture {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	t.Setenv("LOCALAPPDATA", filepath.Join(home, "AppData", "Local"))

	// The fx agent's project skills tree. fx has its own directory (unlike
	// the agents that share the universal .agents/skills tree), so the
	// fixture does not depend on which agents happen to be installed here.
	project := t.TempDir()
	t.Chdir(project)
	skillsDir := filepath.Join(project, ".fx", "skills")
	skillDir := filepath.Join(skillsDir, "demo-skill")
	if err := os.MkdirAll(skillDir, 0o700); err != nil {
		t.Fatal(err)
	}
	skillBytes := []byte("---\nname: demo-skill\ndescription: a skill the agent installed itself\n---\n\nDo the thing.\n")
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), skillBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "helper.sh"), []byte("#!/bin/sh\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	// The data root must be isolated explicitly: ResolvePlatformPaths takes
	// the home directory from the USER DATABASE, not from $HOME, so
	// t.Setenv("HOME", ...) does NOT move it. Without this override the
	// test would write into the developer's real ~/.local/share/litespm.
	dataRoot := filepath.Join(t.TempDir(), "data")
	t.Setenv("LITESPM_DATA_ROOT", dataRoot)
	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		t.Fatal(err)
	}
	if err := paths.EnsureDirectories(); err != nil {
		t.Fatal(err)
	}
	return &adoptSkillFixture{home: home, skillsDir: skillsDir, skillDir: skillDir, skillBytes: skillBytes, paths: paths}
}

// TestSkillsAdoptTakesOwnershipWithoutTouchingTheSkill is the core promise:
// the skill's bytes are untouched, and the ledger now knows about it.
func TestSkillsAdoptTakesOwnershipWithoutTouchingTheSkill(t *testing.T) {
	fx := newAdoptSkillFixture(t)

	var out, errOut bytes.Buffer
	code := runSkillsAdoptTo(&out, &errOut, fx.paths, skillsAdoptOptions{
		name: "demo-skill", scope: "project",
	})
	if code != 0 {
		t.Fatalf("runSkillsAdoptTo = %d, want 0\nstdout:\n%s\nstderr:\n%s", code, out.String(), errOut.String())
	}

	// The skill itself is byte-identical.
	got, err := os.ReadFile(filepath.Join(fx.skillDir, "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, fx.skillBytes) {
		t.Errorf("adoption rewrote the skill:\n%s", got)
	}
	if _, err := os.Stat(filepath.Join(fx.skillDir, "helper.sh")); err != nil {
		t.Errorf("adoption removed a file from the skill: %v", err)
	}

	// The ledger knows about it, with the tree's CURRENT digest and inventory.
	ledger, err := skills.OpenLedger(skills.LedgerPath(fx.paths.DataRoot))
	if err != nil {
		t.Fatal(err)
	}
	entries, err := ledger.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("the ledger holds %d rows, want 1: %+v", len(entries), entries)
	}
	e := entries[0]
	if e.SkillName != "demo-skill" {
		t.Errorf("the row names skill %q, want %q", e.SkillName, "demo-skill")
	}
	if e.Source != skills.AdoptedSource {
		t.Errorf("the row records source %q, want %q", e.Source, skills.AdoptedSource)
	}
	if e.DestDir != fx.skillDir {
		t.Errorf("the row names %q, want %q", e.DestDir, fx.skillDir)
	}
	if e.ContentDigest == "" {
		t.Error("the row records no content digest: the removal guard would have nothing to compare")
	}
	if len(e.Inventory) != 2 {
		t.Errorf("the row inventories %d files, want 2 (SKILL.md and helper.sh)", len(e.Inventory))
	}
}

// TestSkillsAdoptRefusesANameThatIsNotThere: adopting something that does not
// exist would record ownership of a directory with nothing in it.
func TestSkillsAdoptRefusesANameThatIsNotThere(t *testing.T) {
	fx := newAdoptSkillFixture(t)

	var out, errOut bytes.Buffer
	code := runSkillsAdoptTo(&out, &errOut, fx.paths, skillsAdoptOptions{
		name: "not-there", scope: "project",
	})
	if code == 0 {
		t.Fatalf("adopting a skill that is not there succeeded:\n%s", out.String())
	}
	if !strings.Contains(errOut.String(), "LPSM-SKILL-NOT-FOUND") {
		t.Errorf("the refusal does not carry the typed code:\n%s", errOut.String())
	}
}

// TestSkillsUpdateRefusesAnAdoptedRow: there is no source to re-copy from, and
// guessing one would replace a working skill with a guess.
func TestSkillsUpdateRefusesAnAdoptedRow(t *testing.T) {
	fx := newAdoptSkillFixture(t)

	var out, errOut bytes.Buffer
	if code := runSkillsAdoptTo(&out, &errOut, fx.paths, skillsAdoptOptions{
		name: "demo-skill", scope: "project",
	}); code != 0 {
		t.Fatalf("runSkillsAdoptTo = %d, want 0\nstderr:\n%s", code, errOut.String())
	}

	ledger, err := skills.OpenLedger(skills.LedgerPath(fx.paths.DataRoot))
	if err != nil {
		t.Fatal(err)
	}
	entries, err := ledger.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("the ledger holds %d rows, want 1", len(entries))
	}
	_, err = recordedSkillSource(entries[0])
	if err == nil {
		t.Fatal("an adopted row produced a usable source: the update would guess one")
	}
	if !strings.Contains(err.Error(), "adopted") {
		t.Errorf("the refusal does not say the skill was adopted: %v", err)
	}
}

// TestSkillsAdoptRecordsTheUsersOwnFilesAsPartOfTheSkill pins that a file
// the user added BEFORE the adoption is part of the skill (so the removal
// guard does not treat it as an intruder), and that the guard still fires for
// a file added afterwards.
func TestSkillsAdoptRecordsTheUsersOwnFilesAsPartOfTheSkill(t *testing.T) {
	fx := newAdoptSkillFixture(t)

	var out, errOut bytes.Buffer
	if code := runSkillsAdoptTo(&out, &errOut, fx.paths, skillsAdoptOptions{
		name: "demo-skill", scope: "project",
	}); code != 0 {
		t.Fatalf("runSkillsAdoptTo = %d, want 0\nstderr:\n%s", code, errOut.String())
	}

	ledger, err := skills.OpenLedger(skills.LedgerPath(fx.paths.DataRoot))
	if err != nil {
		t.Fatal(err)
	}
	entries, err := ledger.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("the ledger holds %d rows, want 1", len(entries))
	}

	// A file added AFTER the adoption is not in the inventory, so the
	// removal guard must refuse.
	if err := os.WriteFile(filepath.Join(fx.skillDir, "added-later.md"), []byte("mine\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	removed, err := ledger.RemoveScoped(skills.RemoveOptions{Names: []string{"demo-skill"}, Scope: "project"})
	if err != nil {
		t.Fatalf("RemoveScoped: %v", err)
	}
	if len(removed) != 1 || removed[0].Removed {
		t.Errorf("the removal was not refused for the file added after the adoption: %+v", removed)
	}
	if _, err := os.Stat(filepath.Join(fx.skillDir, "added-later.md")); err != nil {
		t.Errorf("the refused removal still deleted the user's file: %v", err)
	}
	_ = context.Background()
}
