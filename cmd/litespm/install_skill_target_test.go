package main

// install_skill_target_test.go — where a catalog skill install may write, and
// what the approval is allowed to cover.
//
// A skill is a directory copied into each agent's own skills tree. The catalog
// install path used to ask the machine at execution time ("which agents are
// detected?") and copy into all of them, so `install <skill> --host codex`
// either ignored the flag or had to be refused. Both are the same defect: the
// approval did not name the destinations. The target set is now resolved while
// planning, sealed in the plan's host changes (which the plan hash covers) and
// re-read at execution, so a copy can only land where a human approved.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/skills"
)

func skillListing(id, name string) *domain.Listing {
	return &domain.Listing{
		ID:     id,
		Kind:   domain.KindSkill,
		Name:   name,
		Source: domain.SourceReference{SourceID: "test", UpstreamID: "test", URL: "https://github.com/example/skills"},
	}
}

// detectedHome is a home directory where two agents are "installed": Claude
// Code (`~/.claude`) and Codex (`~/.codex`). Their skills roots differ, so a
// test can tell which one was written.
func detectedHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	for _, marker := range []string{".claude", ".codex"} {
		if err := os.MkdirAll(filepath.Join(home, marker), 0o755); err != nil {
			t.Fatalf("create %s: %v", marker, err)
		}
	}
	// The agent homes are read from the environment first; a developer machine
	// with CODEX_HOME set must not decide the expected root here.
	t.Setenv("CODEX_HOME", "")
	t.Setenv("CLAUDE_CONFIG_DIR", "")
	return home
}

func TestPlanSkillDestinationsExplicitAgentIsExactlyThatAgent(t *testing.T) {
	home := detectedHome(t)
	project := t.TempDir()

	dests, err := planSkillDestinations(skillListing("skill:test:demo", "Demo Skill"), domain.ScopeUser, project, home, []string{"codex"})
	if err != nil {
		t.Fatalf("plan a single target: %v", err)
	}
	if len(dests) != 1 {
		t.Fatalf("naming one agent planned %d destinations: %+v", len(dests), dests)
	}
	if dests[0].AgentID != "codex" {
		t.Errorf("agent = %q, want codex", dests[0].AgentID)
	}
	want := filepath.Join(home, ".codex", "skills")
	if dests[0].Root != want {
		t.Errorf("root = %q, want %q", dests[0].Root, want)
	}
}

func TestPlanSkillDestinationsEmptyRequestUsesDetectedSet(t *testing.T) {
	home := detectedHome(t)
	project := t.TempDir()

	dests, err := planSkillDestinations(skillListing("skill:test:demo", "Demo Skill"), domain.ScopeUser, project, home, nil)
	if err != nil {
		t.Fatalf("plan the detected set: %v", err)
	}
	got := map[string]bool{}
	for _, d := range dests {
		got[d.AgentID] = true
	}
	for _, want := range []string{"claude-code", "codex"} {
		if !got[want] {
			t.Errorf("detected set is missing %s: %+v", want, dests)
		}
	}
	if got["cursor"] {
		t.Errorf("detected set invented an agent that is not installed: %+v", dests)
	}
}

func TestPlanSkillDestinationsRefusesRatherThanDropping(t *testing.T) {
	home := detectedHome(t)
	project := t.TempDir()
	listing := skillListing("skill:test:demo", "Demo Skill")

	if _, err := planSkillDestinations(listing, domain.ScopeUser, project, home, []string{"not-an-agent"}); err == nil {
		t.Fatal("an unknown agent id must be refused, not silently dropped")
	} else if !strings.Contains(err.Error(), `unknown agent "not-an-agent"`) {
		t.Errorf("refusal should name the unknown agent, got: %v", err)
	}

	// Eve documents a project tree only, so a user-scope request has nowhere
	// to write. Naming it must be an error that says so, not an empty success.
	if _, err := planSkillDestinations(listing, domain.ScopeUser, project, home, []string{"eve"}); err == nil {
		t.Fatal("an agent with no user-scope skills directory must be refused")
	} else if !strings.Contains(err.Error(), "no skills directory for user scope") {
		t.Errorf("refusal should say why, got: %v", err)
	}

	// No detected agent at all: the remedy, not a silent no-op.
	emptyHome := t.TempDir()
	if _, err := planSkillDestinations(listing, domain.ScopeUser, project, emptyHome, nil); err == nil {
		t.Fatal("no detected agent must be refused")
	} else if !strings.Contains(err.Error(), "--agent") {
		t.Errorf("refusal should name the flag that targets one, got: %v", err)
	}
}

func TestSkillHostChangesAreSealedAndReadBack(t *testing.T) {
	home := detectedHome(t)
	project := t.TempDir()
	// The entry key is the directory name the source will use, so the fixture
	// names a skill that sanitizes to itself.
	listing := skillListing("skill:test:demo", "demo")

	dests, err := planSkillDestinations(listing, domain.ScopeUser, project, home, []string{"codex", "claude-code"})
	if err != nil {
		t.Fatalf("plan destinations: %v", err)
	}
	changes := skillHostChanges(listing, dests)
	if len(changes) != len(dests) {
		t.Fatalf("host changes = %d, destinations = %d", len(changes), len(dests))
	}
	for _, ch := range changes {
		if ch.Action != skillWriteAction {
			t.Errorf("action = %q, want %q", ch.Action, skillWriteAction)
		}
		if ch.EntryKey != "demo" {
			t.Errorf("entry key = %q, want the sanitized skill directory name", ch.EntryKey)
		}
		if !filepath.IsAbs(ch.ConfigPath) {
			t.Errorf("sealed path %q is not absolute", ch.ConfigPath)
		}
	}

	plan := &domain.InstallPlan{PlanID: "plan_test", HostChanges: changes}
	agents, err := skillAgentsFromPlan(plan)
	if err != nil {
		t.Fatalf("read agents from the plan: %v", err)
	}
	if len(agents) != 2 {
		t.Fatalf("agents = %v, want the two sealed targets", agents)
	}
}

func TestSkillAgentsFromPlanRefusesAnUnsealedPlan(t *testing.T) {
	// The old behaviour: a plan with no destinations, execution re-detecting.
	// It must be a refusal now, because re-detecting is how the fan-out
	// happened.
	if _, err := skillAgentsFromPlan(&domain.InstallPlan{PlanID: "plan_empty"}); err == nil {
		t.Fatal("a plan that seals no skill destination must be refused")
	}
}

func TestVerifySkillWriteRootsFailsClosed(t *testing.T) {
	approved := []skillDestination{{AgentID: "codex", Root: filepath.Join("/home", "u", ".codex", "skills")}}

	// A write outside the approved root (a relocated agent home, a hand-edited
	// plan) is refused.
	outside := []skills.InstallOp{{SkillName: "demo", ToDir: filepath.Join("/home", "u", ".claude", "skills", "demo")}}
	if err := verifySkillWriteRoots(approved, outside); err == nil {
		t.Fatal("a write outside the sealed root must be refused")
	}

	// An approved destination that produced no write is also a failure: the
	// user approved a directory and the install would leave it untouched.
	if err := verifySkillWriteRoots(approved, nil); err == nil {
		t.Fatal("a sealed destination with no planned write must be refused")
	}

	// The approved write passes.
	inside := []skills.InstallOp{{SkillName: "demo", ToDir: filepath.Join(approved[0].Root, "demo")}}
	if err := verifySkillWriteRoots(approved, inside); err != nil {
		t.Fatalf("the approved write was refused: %v", err)
	}
}

func TestParseInstallFlagsAgentSelection(t *testing.T) {
	cases := []struct {
		name    string
		args    []string
		wantErr bool
		check   func(t *testing.T, f installFlags)
	}{
		{name: "agent is repeatable and canonicalized", args: []string{"--agent", "Codex", "-a", "claude-code", "skill:test:demo"},
			check: func(t *testing.T, f installFlags) {
				if len(f.agents) != 2 || f.agents[0] != "codex" || f.agents[1] != "claude-code" {
					t.Errorf("agents = %v, want [codex claude-code]", f.agents)
				}
			}},
		{name: "wildcard is accepted verbatim", args: []string{"--agent", "*", "skill:test:demo"},
			check: func(t *testing.T, f installFlags) {
				if len(f.agents) != 1 || f.agents[0] != "*" {
					t.Errorf("agents = %v, want [*]", f.agents)
				}
			}},
		{name: "all-detected alone", args: []string{"--all-detected", "skill:test:demo"},
			check: func(t *testing.T, f installFlags) {
				if !f.allDetected || len(f.agents) != 0 {
					t.Errorf("flags = %+v, want allDetected with no named agent", f)
				}
			}},
		{name: "all-detected contradicts agent", args: []string{"--all-detected", "--agent", "codex", "skill:test:demo"}, wantErr: true},
		{name: "all-detected contradicts host", args: []string{"--all-detected", "--host", "codex", "skill:test:demo"}, wantErr: true},
		{name: "allow-partial is off unless asked for", args: []string{"plugin:test:demo"},
			check: func(t *testing.T, f installFlags) {
				if f.allowPartial {
					t.Error("allowPartial is set without the flag")
				}
			}},
		{name: "allow-partial is recorded", args: []string{"--allow-partial", "plugin:test:demo"},
			check: func(t *testing.T, f installFlags) {
				if !f.allowPartial || f.listingID != "plugin:test:demo" {
					t.Errorf("flags = %+v, want allowPartial for the plugin", f)
				}
			}},
		{name: "agent needs a value", args: []string{"skill:test:demo", "--agent"}, wantErr: true},
		{name: "agent needs a non-empty value", args: []string{"skill:test:demo", "--agent", "  "}, wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			flags, err := parseInstallFlags(tc.args)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected an error, got %+v", flags)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.check != nil {
				tc.check(t, flags)
			}
		})
	}
}
