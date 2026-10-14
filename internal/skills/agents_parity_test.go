package skills

import (
	"path/filepath"
	"testing"
)

// TestAgentIDParityRows pins the reference installer's ids for the agents we
// historically spelled differently (pi vs pi-agent, grok vs grok-build) and the
// two targets we lacked (universal, warp), including their documented paths.
func TestAgentIDParityRows(t *testing.T) {
	for _, id := range []string{"universal", "warp", "pi", "grok"} {
		if _, ok := LookupAgent(id); !ok {
			t.Errorf("agent id %q missing from the table", id)
		}
	}

	home := useTempHome(t)
	project := t.TempDir()

	// Aliases resolve to the same directories as their canonical rows.
	for _, pair := range [][2]string{{"pi", "pi-agent"}, {"grok", "grok-build"}} {
		for _, scope := range []string{"project", "global"} {
			aliasDir, aliasOK := AgentSkillDir(pair[0], scope, project, home)
			canonicalDir, canonicalOK := AgentSkillDir(pair[1], scope, project, home)
			if aliasOK != canonicalOK || aliasDir != canonicalDir {
				t.Errorf("%s/%s resolves to %q,%v but %s/%s resolves to %q,%v",
					pair[0], scope, aliasDir, aliasOK, pair[1], scope, canonicalDir, canonicalOK)
			}
		}
	}

	// universal: project .agents/skills, global $XDG_CONFIG_HOME/agents/skills.
	if dir, ok := AgentSkillDir("universal", "project", project, home); !ok || dir != filepath.Join(project, ".agents", "skills") {
		t.Errorf("universal project dir = %q,%v", dir, ok)
	}
	if dir, ok := AgentSkillDir("universal", "global", project, home); !ok || dir != filepath.Join(home, ".config", "agents", "skills") {
		t.Errorf("universal global dir = %q,%v", dir, ok)
	}
	// warp: project .agents/skills, global ~/.agents/skills.
	if dir, ok := AgentSkillDir("warp", "project", project, home); !ok || dir != filepath.Join(project, ".agents", "skills") {
		t.Errorf("warp project dir = %q,%v", dir, ok)
	}
	if dir, ok := AgentSkillDir("warp", "global", project, home); !ok || dir != filepath.Join(home, ".agents", "skills") {
		t.Errorf("warp global dir = %q,%v", dir, ok)
	}
}

// TestPlanInstallSharedUniversalIDsCollapse pins the dedup guarantee for ids
// that intentionally share a directory: several reference-installer agents read
// the universal .agents/skills tree, and selecting two of them must produce one
// write, not two copies racing for the same destination.
func TestPlanInstallSharedUniversalIDsCollapse(t *testing.T) {
	root := t.TempDir()
	writeSkillTree(t, root, "s", "s", "d")
	found, err := DiscoverSkills(root)
	if err != nil || len(found) != 1 {
		t.Fatalf("discover failed: %v %d", err, len(found))
	}
	home := useTempHome(t)
	project := t.TempDir()

	ops := PlanInstall(found, []string{"universal", "warp", "pi", "codex"}, "project", project, home)
	if len(ops) != 1 {
		t.Fatalf("shared .agents/skills ids must collapse to 1 write, got %d (%+v)", len(ops), ops)
	}
	if ops[0].ToDir != filepath.Join(project, ".agents", "skills", "s") {
		t.Errorf("unexpected collapsed destination: %s", ops[0].ToDir)
	}

	// pi and warp also share ~/.agents/skills globally.
	ops = PlanInstall(found, []string{"pi", "warp"}, "global", project, home)
	if len(ops) != 1 || ops[0].ToDir != filepath.Join(home, ".agents", "skills", "s") {
		t.Fatalf("pi+warp global should collapse to ~/.agents/skills, got %+v", ops)
	}
	// universal's global tree is distinct, so it is a second write.
	ops = PlanInstall(found, []string{"pi", "warp", "universal"}, "global", project, home)
	if len(ops) != 2 {
		t.Fatalf("expected 2 distinct global destinations, got %d (%+v)", len(ops), ops)
	}
}
