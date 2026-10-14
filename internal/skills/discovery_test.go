package skills

import (
	"os"
	"path/filepath"
	"testing"
)

// TestDiscoverSkillsDepthThree is the headline fix: a repository that lays its
// skills out as skills/<category>/<name>/SKILL.md (google/skills uses
// skills/cloud/<name>) installed zero skills while the walk stopped at depth 2.
func TestDiscoverSkillsDepthThree(t *testing.T) {
	root := t.TempDir()
	writeSkillTree(t, root, "skills/cloud/agent-platform", "agent-platform", "Cloud skill")
	writeSkillTree(t, root, "skills/.curated/web-design", "web-design", "Curated skill")

	found, err := DiscoverSkills(root)
	if err != nil {
		t.Fatalf("discover failed: %v", err)
	}
	names := map[string]bool{}
	for _, f := range found {
		names[f.Pkg.Name] = true
	}
	for _, want := range []string{"agent-platform", "web-design"} {
		if !names[want] {
			t.Errorf("depth-3 skill %q not found; got %v", want, names)
		}
	}
}

// TestDiscoverSkillsIncludingRoot proves a source that is itself a single
// skill directory works: the plain walk skips the root by design, and the
// root-inclusive variant accepts it.
func TestDiscoverSkillsIncludingRoot(t *testing.T) {
	root := t.TempDir()
	writeSkillTree(t, root, ".", "solo", "The source root is the skill")
	if err := os.WriteFile(filepath.Join(root, "reference.md"), []byte("asset"), 0o644); err != nil {
		t.Fatal(err)
	}

	found, err := DiscoverSkills(root)
	if err != nil {
		t.Fatalf("discover failed: %v", err)
	}
	if len(found) != 0 {
		t.Fatalf("plain discovery must skip the source root, got %+v", found)
	}

	found, err = DiscoverSkillsIncludingRoot(root)
	if err != nil {
		t.Fatalf("root-inclusive discovery failed: %v", err)
	}
	if len(found) != 1 || found[0].Pkg.Name != "solo" || found[0].Dir != root || found[0].Rel != "." {
		t.Fatalf("root-inclusive discovery wrong: %+v", found)
	}
}

// TestDiscoverSkillsShallowShadowsDeep keeps the SkipDir-once-found rule at the
// raised bound: a directory that is a skill is never descended into.
func TestDiscoverSkillsShallowShadowsDeep(t *testing.T) {
	root := t.TempDir()
	writeSkillTree(t, root, "group", "outer", "Shallower")
	writeSkillTree(t, root, "group/child", "inner", "Deeper")

	found, err := DiscoverSkills(root)
	if err != nil {
		t.Fatalf("discover failed: %v", err)
	}
	if len(found) != 1 || found[0].Pkg.Name != "outer" {
		t.Fatalf("expected only the shallower skill, got %+v", found)
	}

	// Root-inclusive mode: the root is the shallowest match of all, so without
	// FullDepth it shadows the nested skill.
	rootSkill := t.TempDir()
	writeSkillTree(t, rootSkill, ".", "root-skill", "Root")
	writeSkillTree(t, rootSkill, "nested", "nested-skill", "Nested")
	found, err = DiscoverSkillsIncludingRoot(rootSkill)
	if err != nil {
		t.Fatalf("root-inclusive discovery failed: %v", err)
	}
	if len(found) != 1 || found[0].Pkg.Name != "root-skill" {
		t.Fatalf("expected the root skill to shadow the nested one, got %+v", found)
	}
}

// TestDiscoverSkillsRecursiveFallback proves a layout deeper than the standard
// bound is still found when nothing is found shallower — the second attempt
// that used to be missing.
func TestDiscoverSkillsRecursiveFallback(t *testing.T) {
	root := t.TempDir()
	writeSkillTree(t, root, "package/deep/deeper/still-deeper/name", "buried", "Very deep")

	found, err := DiscoverSkills(root)
	if err != nil {
		t.Fatalf("discover failed: %v", err)
	}
	if len(found) != 1 || found[0].Pkg.Name != "buried" {
		t.Fatalf("recursive fallback did not find the deep skill: %+v", found)
	}

	// The fallback is a fallback: when the standard walk finds something, a
	// deeper non-standard skill is not guessed at without --full-depth.
	root2 := t.TempDir()
	writeSkillTree(t, root2, "shallow", "shallow", "Found at depth 1")
	writeSkillTree(t, root2, "package/deep/deeper/still-deeper/name", "buried", "Very deep")
	found, err = DiscoverSkills(root2)
	if err != nil {
		t.Fatalf("discover failed: %v", err)
	}
	if len(found) != 1 || found[0].Pkg.Name != "shallow" {
		t.Fatalf("expected only the standard-depth skill without FullDepth, got %+v", found)
	}
}

// TestDiscoverSkillsFullDepth pins the escape hatch: FullDepth drops the depth
// bound entirely and keeps searching inside a root that is itself a skill.
func TestDiscoverSkillsFullDepth(t *testing.T) {
	root := t.TempDir()
	writeSkillTree(t, root, ".", "root-skill", "Root")
	writeSkillTree(t, root, "package/deep/deeper/still-deeper/name", "buried", "Very deep")

	found, err := DiscoverSkills(root, DiscoveryOptions{FullDepth: true})
	if err != nil {
		t.Fatalf("full-depth discovery failed: %v", err)
	}
	if len(found) != 1 || found[0].Pkg.Name != "buried" {
		t.Fatalf("expected the deep skill (root excluded), got %+v", found)
	}

	found, err = DiscoverSkillsIncludingRoot(root, DiscoveryOptions{FullDepth: true})
	if err != nil {
		t.Fatalf("full-depth root-inclusive discovery failed: %v", err)
	}
	if len(found) != 2 {
		t.Fatalf("expected root + buried with FullDepth+IncludeRoot, got %+v", found)
	}
	if found[0].Pkg.Name != "root-skill" {
		t.Errorf("root skill should be first (shallowest), got %+v", found)
	}
}

// TestDiscoverSkillsSkipsJunkDirs keeps dependency/build trees from being
// scanned for skills, matching the reference installer's skip list.
func TestDiscoverSkillsSkipsJunkDirs(t *testing.T) {
	root := t.TempDir()
	writeSkillTree(t, root, "node_modules/pkg", "dep", "Dependency junk")
	writeSkillTree(t, root, "dist/bundle", "dist", "Build junk")
	writeSkillTree(t, root, ".git/hooks", "git", "VCS junk")
	writeSkillTree(t, root, "ok", "ok", "Real skill")

	found, err := DiscoverSkills(root)
	if err != nil {
		t.Fatalf("discover failed: %v", err)
	}
	if len(found) != 1 || found[0].Pkg.Name != "ok" {
		t.Fatalf("expected only the real skill, got %+v", found)
	}
}

// TestDiscoverSkillsMissingRoot keeps a missing source an explicit error
// instead of a silent empty result.
func TestDiscoverSkillsMissingRoot(t *testing.T) {
	if _, err := DiscoverSkills(filepath.Join(t.TempDir(), "no-such-dir")); err == nil {
		t.Fatal("a missing source root should be an error")
	}
}
