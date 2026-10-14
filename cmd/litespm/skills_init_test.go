package main

// skills_init_test.go — `litespm init` scaffolding.
//
// The load-bearing test is TestInitScaffoldParsesUnderRealLoader: the bytes
// this command writes are fed through the real parser (skills.ParseSkillMD)
// and the real discovery walk (skills.DiscoverSkills), so a scaffold that
// stops being installable fails here rather than in a user's terminal.

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/skills"
)

// TestInitScaffoldParsesUnderRealLoader feeds scaffoldSkillMD's output to
// skills.ParseSkillMD and asserts it parses with no error and the required
// fields round-trip.
func TestInitScaffoldParsesUnderRealLoader(t *testing.T) {
	content := scaffoldSkillMD("demo-skill")

	pkg, err := skills.ParseSkillMD(content)
	if err != nil {
		t.Fatalf("ParseSkillMD(scaffold) = %v, want nil", err)
	}
	if pkg.Name != "demo-skill" {
		t.Errorf("Name = %q, want %q", pkg.Name, "demo-skill")
	}
	if strings.TrimSpace(pkg.Description) == "" {
		t.Error("Description is empty: name and description are the required fields")
	}
	if strings.Contains(pkg.Description, "TODO") {
		t.Errorf("Description is a placeholder: %q", pkg.Description)
	}
	// The name must survive the same validation installs apply.
	if sanitized, err := skills.SanitizeSkillName(pkg.Name); err != nil || sanitized != "demo-skill" {
		t.Errorf("SanitizeSkillName(%q) = %q, %v; want demo-skill, nil", pkg.Name, sanitized, err)
	}
	for _, section := range []string{"## When to use", "## How to run"} {
		if !strings.Contains(pkg.Instructions, section) {
			t.Errorf("body is missing %q:\n%s", section, pkg.Instructions)
		}
	}
	if len(pkg.Instructions) == 0 {
		t.Error("body is empty: the scaffold must be useful as-is")
	}
}

// TestInitCommandWritesDiscoverableSkill runs the command itself into a temp
// directory and proves the result is discovered by the real walk, which
// requires a name and a description — i.e. the scaffold is installable as-is.
func TestInitCommandWritesDiscoverableSkill(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "cool-skill")

	var out, errOut bytes.Buffer
	if code := runSkillsInitTo(&out, &errOut, []string{"--dir", target}); code != 0 {
		t.Fatalf("runSkillsInitTo = %d, want 0\nstdout: %s\nstderr: %s", code, out.String(), errOut.String())
	}
	if !strings.Contains(out.String(), "✓ Created") || !strings.Contains(out.String(), "Next steps:") {
		t.Errorf("success output does not name the created path and next steps:\n%s", out.String())
	}

	data, err := os.ReadFile(filepath.Join(target, "SKILL.md"))
	if err != nil {
		t.Fatalf("read scaffold: %v", err)
	}
	pkg, err := skills.ParseSkillMD(data)
	if err != nil {
		t.Fatalf("ParseSkillMD(written file) = %v", err)
	}
	// No name given: it is derived from the target directory.
	if pkg.Name != "cool-skill" {
		t.Errorf("derived Name = %q, want %q", pkg.Name, "cool-skill")
	}

	found, err := skills.DiscoverSkills(root)
	if err != nil {
		t.Fatalf("DiscoverSkills: %v", err)
	}
	if len(found) != 1 {
		t.Fatalf("DiscoverSkills found %d skills, want 1", len(found))
	}
	if found[0].Pkg.Name != "cool-skill" || strings.TrimSpace(found[0].Pkg.Description) == "" {
		t.Errorf("discovered skill has name %q description %q, want cool-skill with a description",
			found[0].Pkg.Name, found[0].Pkg.Description)
	}
}

// TestInitRefusesOverExistingFileWithoutForce pins the refusal path: exit 1
// (the repo's "refused" code), a message naming --force, and an untouched file.
func TestInitRefusesOverExistingFileWithoutForce(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "proj-dir")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)

	var out, errOut bytes.Buffer
	if code := runSkillsInitTo(&out, &errOut, nil); code != 0 {
		t.Fatalf("first run = %d, want 0\nstderr: %s", code, errOut.String())
	}
	first, err := os.ReadFile(filepath.Join(dir, "SKILL.md"))
	if err != nil {
		t.Fatalf("read scaffold: %v", err)
	}

	out.Reset()
	errOut.Reset()
	if code := runSkillsInitTo(&out, &errOut, nil); code != 1 {
		t.Errorf("second run = %d, want 1 (refused)\nstderr: %s", code, errOut.String())
	}
	if !strings.Contains(errOut.String(), "already exists") || !strings.Contains(errOut.String(), "--force") {
		t.Errorf("refusal does not name the file and the way forward:\n%s", errOut.String())
	}
	second, err := os.ReadFile(filepath.Join(dir, "SKILL.md"))
	if err != nil {
		t.Fatalf("read scaffold after refusal: %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Error("refused run modified the existing SKILL.md")
	}
}

// TestInitForceOverwritesExistingFile pins the --force path: exit 0 and the
// file replaced with the new scaffold.
func TestInitForceOverwritesExistingFile(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "proj-dir")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)

	var out, errOut bytes.Buffer
	if code := runSkillsInitTo(&out, &errOut, nil); code != 0 {
		t.Fatalf("first run = %d, want 0\nstderr: %s", code, errOut.String())
	}

	out.Reset()
	errOut.Reset()
	if code := runSkillsInitTo(&out, &errOut, []string{"second-skill", "--force"}); code != 0 {
		t.Fatalf("--force run = %d, want 0\nstderr: %s", code, errOut.String())
	}
	data, err := os.ReadFile(filepath.Join(dir, "SKILL.md"))
	if err != nil {
		t.Fatalf("read scaffold: %v", err)
	}
	if !bytes.Contains(data, []byte("name: second-skill")) {
		t.Errorf("file was not overwritten with the new scaffold:\n%s", data)
	}
}

// TestInitNameHandling covers derivation, explicit-name validation and the
// strict argument parser.
func TestInitNameHandling(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"my-skill", "my-skill"},
		{"My Skills", "my-skills"},
		{"Cool_Skill!", "cool-skill"},
		{"Café", "caf"},
		{"", "my-skill"},
		{"___", "my-skill"},
		{strings.Repeat("a", 80), strings.Repeat("a", 64)},
	} {
		if got := deriveSkillName(tc.in); got != tc.want {
			t.Errorf("deriveSkillName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}

	// An explicit name installs would reject is a usage error (exit 2).
	target := filepath.Join(t.TempDir(), "s")
	var out, errOut bytes.Buffer
	if code := runSkillsInitTo(&out, &errOut, []string{"Bad Name!", "--dir", target}); code != 2 {
		t.Errorf("invalid explicit name = %d, want 2\nstderr: %s", code, errOut.String())
	}
	if _, err := os.Stat(filepath.Join(target, "SKILL.md")); err == nil {
		t.Error("usage error wrote a SKILL.md")
	}

	for _, args := range [][]string{
		{"--nope"},
		{"--dir"},
		{"one", "two"},
	} {
		if _, err := parseSkillsInitArgs(args); err == nil {
			t.Errorf("parseSkillsInitArgs(%v) = nil error, want an error", args)
		}
	}
}

// TestInitHelpFlag covers --help: exit 0 with the usage text, nothing written.
func TestInitHelpFlag(t *testing.T) {
	var out, errOut bytes.Buffer
	if code := runSkillsInitTo(&out, &errOut, []string{"--help"}); code != 0 {
		t.Errorf("--help = %d, want 0", code)
	}
	if !strings.Contains(out.String(), "Usage: litespm init") {
		t.Errorf("--help output is missing the usage line:\n%s", out.String())
	}
}
