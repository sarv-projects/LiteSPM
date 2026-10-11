package domain

import (
	"path/filepath"
	"regexp"
	"testing"
)

// TestWorkspaceIDForProjectRoot pins the workspace identity contract: the id is
// a pure function of the absolute project path, so the same directory is one
// workspace forever, distinct directories are distinct workspaces, and a root
// with no project context (empty or relative) yields no workspace at all.
func TestWorkspaceIDForProjectRoot(t *testing.T) {
	t.Run("deterministic for the same absolute root", func(t *testing.T) {
		root := filepath.Join(t.TempDir(), "project")
		first := WorkspaceIDForProjectRoot(root)
		if first == "" {
			t.Fatal("an absolute root must have a workspace id")
		}
		for i := range 5 {
			if got := WorkspaceIDForProjectRoot(root); got != first {
				t.Fatalf("call %d returned %q, want the stable %q", i, got, first)
			}
		}
	})

	t.Run("path spelling does not change the workspace", func(t *testing.T) {
		root := filepath.Join(t.TempDir(), "project")
		canonical := WorkspaceIDForProjectRoot(root)
		for _, spelling := range []string{root + string(filepath.Separator), filepath.Join(root, ".")} {
			if got := WorkspaceIDForProjectRoot(spelling); got != canonical {
				t.Errorf("WorkspaceIDForProjectRoot(%q) = %q, want %q (same directory)", spelling, got, canonical)
			}
		}
	})

	t.Run("empty and relative roots have no workspace", func(t *testing.T) {
		for _, root := range []string{"", ".", "relative/path", ".."} {
			if got := WorkspaceIDForProjectRoot(root); got != "" {
				t.Errorf("WorkspaceIDForProjectRoot(%q) = %q, want \"\"", root, got)
			}
		}
	})

	t.Run("distinct roots have distinct ids", func(t *testing.T) {
		base := t.TempDir()
		one := WorkspaceIDForProjectRoot(filepath.Join(base, "one"))
		two := WorkspaceIDForProjectRoot(filepath.Join(base, "two"))
		if one == "" || two == "" {
			t.Fatalf("absolute roots produced empty ids: %q, %q", one, two)
		}
		if one == two {
			t.Fatalf("distinct roots share the workspace id %q", one)
		}
	})

	t.Run("prefix and length", func(t *testing.T) {
		id := WorkspaceIDForProjectRoot(filepath.Join(t.TempDir(), "project"))
		if !regexp.MustCompile(`^ws_[0-9a-f]{16}$`).MatchString(id) {
			t.Errorf("workspace id %q does not match ^ws_[0-9a-f]{16}$", id)
		}
	})
}
