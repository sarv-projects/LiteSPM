package main

// skills_add_overwrite_test.go — S6: `skills add --force` must print the
// overwrite disclosure AGENTS.md promises — `overwrites: <path>` per replaced
// destination plus the shortened pre-image digest — while keeping the
// replaced-count summary line. The digest must identify the bytes that were
// actually replaced, so it is compared against the verbatim pre-image of the
// tree that was on disk when the force run started.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/skills"
)

func TestSkillsAddForcePrintsOverwritesAndPreImageDigest(t *testing.T) {
	home := t.TempDir()
	project := t.TempDir()

	v1 := filepath.Join(t.TempDir(), "v1")
	writeTestSkill(t, filepath.Join(v1, "only-skill"), "only-skill", "v1 body")
	if _, stderr, code := skillsAddCLI(t, project, home, v1, "--skill", "only-skill", "-a", "cursor", "--yes", "--json"); code != 0 {
		t.Fatalf("seed install exit = %d, stderr:\n%s", code, stderr)
	}
	dest := filepath.Join(project, ".agents", "skills", "only-skill")
	if _, err := os.Stat(filepath.Join(dest, "SKILL.md")); err != nil {
		t.Fatalf("seed install wrote nothing: %v", err)
	}
	pre, err := skills.CapturePreImage(dest)
	if err != nil {
		t.Fatalf("fingerprint the tree that will be replaced: %v", err)
	}

	v2 := filepath.Join(t.TempDir(), "v2")
	writeTestSkill(t, filepath.Join(v2, "only-skill"), "only-skill", "v2 body")
	stdout, stderr, code := skillsAddCLI(t, project, home, v2, "--skill", "only-skill", "-a", "cursor", "--yes", "--force")
	if code != 0 {
		t.Fatalf("force install exit = %d, stderr:\n%s", code, stderr)
	}
	// The installer prints the destination in the spelling the filesystem
	// gives it: macOS resolves the /var symlink to /private/var, and Windows
	// can expand an 8.3 short name (RUNNER~1). Accept either spelling of the
	// same directory; both name the replaced destination.
	spellings := []string{"overwrites: " + dest}
	if resolved, err := filepath.EvalSymlinks(dest); err == nil && resolved != dest {
		spellings = append(spellings, "overwrites: "+resolved)
	}
	named := false
	for _, want := range spellings {
		if strings.Contains(stdout, want) {
			named = true
			break
		}
	}
	if !named {
		t.Errorf("stdout must name the replaced destination with an overwrites: line (one of %q), got:\n%s", spellings, stdout)
	}
	want := shortDigest(pre.Digest)
	if !strings.Contains(stdout, "pre-image "+want) {
		t.Errorf("stdout must carry the shortened pre-image digest %q, got:\n%s", want, stdout)
	}
	if !strings.Contains(stdout, "replaced") || !strings.Contains(stdout, "backups: ") {
		t.Errorf("the existing replaced/backups summary line must survive, got:\n%s", stdout)
	}
}
