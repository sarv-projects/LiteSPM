package skills

// loader_body_test.go — S4: ParseSkillMD dropped the first body line of a
// frontmatter-less SKILL.md, so a "# My Skill" heading never reached the name
// fallback and body text lost line 0.

import (
	"strings"
	"testing"
)

func TestParseSkillMDKeepsNoFrontmatterFirstLine(t *testing.T) {
	pkg, err := ParseSkillMD([]byte("# My Skill\n\nDo the thing.\n"))
	if err != nil {
		t.Fatal(err)
	}
	if pkg.Name != "my-skill" {
		t.Errorf("first body line must reach the name fallback, got %q", pkg.Name)
	}
	if !strings.HasPrefix(pkg.Instructions, "# My Skill") {
		t.Errorf("body lost its first line: %q", pkg.Instructions)
	}
	if !strings.Contains(pkg.Instructions, "Do the thing.") {
		t.Errorf("body text lost: %q", pkg.Instructions)
	}
}

func TestParseSkillMDKeepsFirstLineAfterFrontmatter(t *testing.T) {
	pkg, err := ParseSkillMD([]byte("---\nname: pdf\n---\n# Heading\nbody\n"))
	if err != nil {
		t.Fatal(err)
	}
	if pkg.Name != "pdf" {
		t.Errorf("frontmatter name lost: %q", pkg.Name)
	}
	if !strings.HasPrefix(pkg.Instructions, "# Heading") {
		t.Errorf("first body line after frontmatter lost: %q", pkg.Instructions)
	}
}
