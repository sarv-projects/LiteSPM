package main

// skills_add_test.go — the non-interactive, testable surface of `litespm
// skills add`. The interactive prompts themselves are not scripted here (they
// read a terminal); everything around them is: argument parsing, selection
// parsing, the small rendering helpers, and the summary panel.

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/skills"
)

func TestParseSkillsAddArgs(t *testing.T) {
	t.Run("source only defaults to project scope", func(t *testing.T) {
		opts, err := parseSkillsAddArgs([]string{"owner/repo"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if opts.source != "owner/repo" || opts.scope != "project" || opts.scopeGiven {
			t.Errorf("unexpected options: %+v", opts)
		}
	})

	t.Run("explicit global scope", func(t *testing.T) {
		opts, err := parseSkillsAddArgs([]string{"--scope", "Global", "owner/repo"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if opts.scope != "global" || !opts.scopeGiven {
			t.Errorf("scope = %q (given=%t), want global", opts.scope, opts.scopeGiven)
		}
	})

	t.Run("global shorthand implies global scope", func(t *testing.T) {
		opts, err := parseSkillsAddArgs([]string{"-g", "owner/repo"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !opts.global || opts.scope != "global" {
			t.Errorf("unexpected options: %+v", opts)
		}
	})

	t.Run("repeatable skill and agent flags", func(t *testing.T) {
		opts, err := parseSkillsAddArgs([]string{"--skill", "pdf", "--skill", "docx", "--agent", "Cursor", "-a", "codex", "owner/repo"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(opts.skills) != 2 || opts.skills[0] != "pdf" || opts.skills[1] != "docx" {
			t.Errorf("skills = %v", opts.skills)
		}
		if len(opts.agents) != 2 || opts.agents[0] != "cursor" || opts.agents[1] != "codex" {
			t.Errorf("agents = %v (must be lower-cased)", opts.agents)
		}
	})

	t.Run("boolean flags", func(t *testing.T) {
		opts, err := parseSkillsAddArgs([]string{"--list", "-y", "--json", "owner/repo"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !opts.list || !opts.yes || !opts.jsonOut {
			t.Errorf("unexpected options: %+v", opts)
		}
	})

	t.Run("errors", func(t *testing.T) {
		cases := []struct {
			name string
			args []string
			want string
		}{
			{"missing source", nil, "missing <source>"},
			{"unknown flag", []string{"--bogus", "owner/repo"}, "unknown flag"},
			{"unexpected argument", []string{"a", "b"}, "unexpected argument"},
			{"invalid scope", []string{"--scope", "weird", "owner/repo"}, "invalid scope"},
			{"flag without value", []string{"--skill"}, "requires a value"},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				_, err := parseSkillsAddArgs(tc.args)
				if err == nil || !strings.Contains(err.Error(), tc.want) {
					t.Fatalf("err = %v, want containing %q", err, tc.want)
				}
			})
		}
	})
}

func TestParseNumberSelection(t *testing.T) {
	cases := []struct {
		name    string
		answer  string
		total   int
		want    []int
		wantErr bool
	}{
		{"all keyword", "all", 3, []int{0, 1, 2}, false},
		{"star keyword", "*", 2, []int{0, 1}, false},
		{"comma list", "1,3", 3, []int{0, 2}, false},
		{"deduplicates", "2,2", 3, []int{1}, false},
		{"empty is no selection", "", 3, nil, false},
		{"out of range", "1,9", 3, nil, true},
		{"zero is invalid", "0", 3, nil, true},
		{"garbage", "x", 3, nil, true},
		{"mixed garbage", "1,x", 3, nil, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseNumberSelection(tc.answer, tc.total)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected an error, got %v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("selection = %v, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("selection = %v, want %v", got, tc.want)
				}
			}
		})
	}
}

func TestPlural(t *testing.T) {
	if got := plural(1); got != "" {
		t.Errorf("plural(1) = %q, want empty", got)
	}
	for _, n := range []int{0, 2, 5} {
		if got := plural(n); got != "s" {
			t.Errorf("plural(%d) = %q, want %q", n, got, "s")
		}
	}
}

func TestTruncateRunes(t *testing.T) {
	cases := []struct {
		in   string
		n    int
		want string
	}{
		{"hello", 10, "hello"},
		{"hello", 5, "hello"},
		{"hello world", 8, "hello w…"},
		{"héllo wörld", 6, "héllo…"},
	}
	for _, tc := range cases {
		if got := truncateRunes(tc.in, tc.n); got != tc.want {
			t.Errorf("truncateRunes(%q, %d) = %q, want %q", tc.in, tc.n, got, tc.want)
		}
	}
}

func TestShortHome(t *testing.T) {
	home := "/home/user"
	cases := []struct {
		path string
		want string
	}{
		{home, "~"},
		{home + "/.cursor/skills", "~/.cursor/skills"},
		{"/elsewhere/x", "/elsewhere/x"},
	}
	for _, tc := range cases {
		if got := shortHome(tc.path, home); got != tc.want {
			t.Errorf("shortHome(%q, %q) = %q, want %q", tc.path, home, got, tc.want)
		}
	}
	if got := shortHome("/x/y", ""); got != "/x/y" {
		t.Errorf("shortHome with no home must be identity, got %q", got)
	}
}

func TestPrintInstallSummary(t *testing.T) {
	src := skills.SkillSource{Display: "owner/repo", RepoPath: "owner/repo"}
	selected := []skills.DiscoveredSkill{
		{Dir: "/tmp/pdf", Pkg: &skills.SkillPackage{Name: "pdf", Description: "make PDFs"}},
	}
	ops := []skills.InstallOp{
		{SkillName: "pdf", ToDir: "/home/user/.cursor/skills/pdf", HostLabel: "cursor"},
		{SkillName: "pdf", ToDir: "/home/user/.agents/skills/pdf", HostLabel: "universal"},
	}

	var buf bytes.Buffer
	out := bufio.NewWriter(&buf)
	printInstallSummary(out, src, selected, ops)
	if err := out.Flush(); err != nil {
		t.Fatal(err)
	}
	got := buf.String()

	for _, want := range []string{"Installation Summary", "owner/repo", "pdf", "/home/user/.cursor/skills/pdf", "/home/user/.agents/skills/pdf"} {
		if !strings.Contains(got, want) {
			t.Errorf("summary is missing %q:\n%s", want, got)
		}
	}
}

func TestPrintRiskPanel(t *testing.T) {
	src := skills.SkillSource{Display: "owner/repo", RepoPath: "owner/repo"}
	selected := []skills.DiscoveredSkill{
		{Dir: "/tmp/pdf", Pkg: &skills.SkillPackage{Name: "PDF Maker", Description: "x"}},
	}

	var buf bytes.Buffer
	out := bufio.NewWriter(&buf)
	printRiskPanel(out, src, selected)
	if err := out.Flush(); err != nil {
		t.Fatal(err)
	}
	got := buf.String()

	if !strings.Contains(got, "unverified") {
		t.Errorf("risk panel must report every skill unverified:\n%s", got)
	}
	if !strings.Contains(got, "https://skills.sh/owner/repo") {
		t.Errorf("risk panel is missing the audit lookup link:\n%s", got)
	}
}

// --- parity with the reference `skills add` CLI: -l, wildcards, --all ------
//
// The reference invocations these pin:
//
//	npx skills add <src> --list | -l
//	npx skills add <src> --skill frontend-design --skill skill-creator
//	npx skills add <src> --skill '*'
//	npx skills add <src> --agent '*'
//	npx skills add <src> --all
//	npx skills add <src> --skill frontend-design -g -a claude-code -y
//	npx skills add <src> --skill '*' -a cursor

// TestSkillsAddListShortFlagEqualsLong pins `-l` to `--list`: the same option
// and nothing else.
func TestSkillsAddListShortFlagEqualsLong(t *testing.T) {
	short, err := parseSkillsAddArgs([]string{"owner/repo", "-l"})
	if err != nil {
		t.Fatalf("-l: %v", err)
	}
	long, err := parseSkillsAddArgs([]string{"owner/repo", "--list"})
	if err != nil {
		t.Fatalf("--list: %v", err)
	}
	if !short.list {
		t.Errorf("-l did not set list: %+v", short)
	}
	if !reflect.DeepEqual(short, long) {
		t.Errorf("-l = %+v, want the same options as --list = %+v", short, long)
	}
}

// TestSkillsAddAllEqualsWildcardPair pins --all to the exact options of the
// wildcard pair plus --yes, so the shorthand cannot drift into a separate
// code path.
func TestSkillsAddAllEqualsWildcardPair(t *testing.T) {
	all, err := parseSkillsAddArgs([]string{"owner/repo", "--all"})
	if err != nil {
		t.Fatalf("--all: %v", err)
	}
	explicit, err := parseSkillsAddArgs([]string{"owner/repo", "--skill", "*", "--agent", "*", "--yes"})
	if err != nil {
		t.Fatalf("wildcard pair: %v", err)
	}
	if !reflect.DeepEqual(all, explicit) {
		t.Errorf("--all = %+v, want exactly the wildcard pair %+v", all, explicit)
	}
	if !all.yes {
		t.Error("--all must imply --yes: it promises no prompts")
	}
}

// TestSkillsAddSkillSelectionWildcardAndNames exercises the --skill resolver
// for both wildcards and literal names, including the honest miss that keeps
// "unknown skill(s)" for values that genuinely match nothing.
func TestSkillsAddSkillSelectionWildcardAndNames(t *testing.T) {
	found := []skills.DiscoveredSkill{
		{Dir: "/src/frontend-design", Pkg: &skills.SkillPackage{Name: "frontend-design", Description: "d"}},
		{Dir: "/src/skill-creator", Pkg: &skills.SkillPackage{Name: "skill-creator", Description: "d"}},
		{Dir: "/src/pdf", Pkg: &skills.SkillPackage{Name: "pdf", Description: "d"}},
	}
	names := func(list []skills.DiscoveredSkill) []string {
		out := make([]string, 0, len(list))
		for _, f := range list {
			out = append(out, f.Pkg.Name)
		}
		return out
	}

	t.Run("wildcard selects every discovered skill, in discovery order", func(t *testing.T) {
		selected, missing := selectSkillsByName(found, []string{"*"})
		if len(missing) != 0 {
			t.Fatalf("missing = %v, want none", missing)
		}
		if got, want := names(selected), []string{"frontend-design", "skill-creator", "pdf"}; !reflect.DeepEqual(got, want) {
			t.Errorf("selected = %v, want %v", got, want)
		}
	})

	t.Run("wildcard matching nothing is an honest miss", func(t *testing.T) {
		selected, missing := selectSkillsByName(nil, []string{"*"})
		if len(selected) != 0 {
			t.Errorf("selected = %v, want none", names(selected))
		}
		if !reflect.DeepEqual(missing, []string{"*"}) {
			t.Errorf("missing = %v, want [*]: a wildcard that matches nothing must error", missing)
		}
	})

	t.Run("literal names select, case-insensitively and de-duplicated", func(t *testing.T) {
		selected, missing := selectSkillsByName(found, []string{"Frontend-Design", "skill-creator", "frontend-design"})
		if len(missing) != 0 {
			t.Fatalf("missing = %v, want none", missing)
		}
		if got, want := names(selected), []string{"frontend-design", "skill-creator"}; !reflect.DeepEqual(got, want) {
			t.Errorf("selected = %v, want %v", got, want)
		}
	})

	t.Run("bogus names are reported by value, real ones still match", func(t *testing.T) {
		selected, missing := selectSkillsByName(found, []string{"firebase", "frontend-design"})
		if got, want := names(selected), []string{"frontend-design"}; !reflect.DeepEqual(got, want) {
			t.Errorf("selected = %v, want %v", got, want)
		}
		if !reflect.DeepEqual(missing, []string{"firebase"}) {
			t.Errorf("missing = %v, want [firebase]", missing)
		}
	})
}

// TestSkillsAddAgentStarExpandsToTable pins --agent '*' to the full agent table
// and keeps the unknown-agent error for real typos.
func TestSkillsAddAgentStarExpandsToTable(t *testing.T) {
	expanded, err := expandAgentSelection([]string{"*"})
	if err != nil {
		t.Fatalf("--agent '*': %v", err)
	}
	if want := skills.AgentIDs(); !reflect.DeepEqual(expanded, want) {
		t.Errorf("--agent '*' resolved to %d agents, want the full table of %d", len(expanded), len(want))
	}

	// '*' plus an explicit agent must not name that agent twice.
	withCursor, err := expandAgentSelection([]string{"*", "cursor"})
	if err != nil {
		t.Fatal(err)
	}
	cursors := 0
	for _, id := range withCursor {
		if id == "cursor" {
			cursors++
		}
	}
	if cursors != 1 {
		t.Errorf("cursor appears %d times after '*' + cursor, want once", cursors)
	}

	if _, err := expandAgentSelection([]string{"bogus-agent"}); err == nil {
		t.Fatal("unknown agent must still be an error")
	} else if !strings.Contains(err.Error(), `unknown agent "bogus-agent"`) || !strings.Contains(err.Error(), "Known agents:") {
		t.Errorf("error = %q, must name the value and the known list", err)
	}
}

// TestSkillsAddAgentStarDestinationDedup is the load-bearing property: '*' may
// name every agent, but agents that share one skill directory still produce
// exactly one copy per destination (PlanInstall's documented collapse).
func TestSkillsAddAgentStarDestinationDedup(t *testing.T) {
	home := t.TempDir()
	project := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	for _, a := range skills.AgentTargets() {
		if a.EnvVar != "" {
			t.Setenv(a.EnvVar, "")
		}
	}

	agents, err := expandAgentSelection([]string{"*"})
	if err != nil {
		t.Fatal(err)
	}
	found := []skills.DiscoveredSkill{{
		Dir: filepath.Join(t.TempDir(), "pdf"),
		Pkg: &skills.SkillPackage{Name: "pdf", Description: "d"},
	}}
	ops := skills.PlanInstall(found, agents, "project", project, home)

	// Expected: one copy per unique destination, computed from the same agent
	// table PlanInstall resolves against.
	wantDirs := map[string]bool{}
	for _, id := range agents {
		if dir, ok := skills.AgentSkillDir(id, "project", project, home); ok {
			wantDirs[filepath.Join(dir, "pdf")] = true
		}
	}
	if len(ops) != len(wantDirs) {
		t.Errorf("ops = %d, want %d unique destinations: agents sharing a directory must collapse", len(ops), len(wantDirs))
	}
	seen := map[string]int{}
	for _, op := range ops {
		seen[op.ToDir]++
	}
	for dir, n := range seen {
		if n != 1 {
			t.Errorf("destination %s would be written %d times, want once", dir, n)
		}
	}
	universal := filepath.Join(project, ".agents", "skills", "pdf")
	if seen[universal] != 1 {
		t.Errorf("universal destination %s has %d copies, want exactly 1", universal, seen[universal])
	}
	if len(ops) >= len(agents) {
		t.Errorf("test no longer exercises sharing: %d agents produced %d op(s)", len(agents), len(ops))
	}
}

// TestSkillsAddSplitAgentsByDetection pins presence detection to the agent
// table: a fresh home detects nobody, and one agent's directory detects only
// that agent -- the non-interactive --yes fallback's decision procedure.
func TestSkillsAddSplitAgentsByDetection(t *testing.T) {
	home := t.TempDir()
	project := t.TempDir()
	targets := skills.AgentTargets()

	detected, other := splitAgentsByDetection(targets, project, home)
	if len(detected) != 0 || len(other) != len(targets) {
		t.Fatalf("fresh home/project: detected %d of %d agents, want 0", len(detected), len(targets))
	}

	if err := os.MkdirAll(filepath.Join(home, ".cursor"), 0o755); err != nil {
		t.Fatal(err)
	}
	detected, other = splitAgentsByDetection(targets, project, home)
	if len(detected) != 1 || detected[0].ID != "cursor" {
		ids := make([]string, 0, len(detected))
		for _, a := range detected {
			ids = append(ids, a.ID)
		}
		t.Fatalf("detected = %v, want exactly [cursor]", ids)
	}
	if len(other) != len(targets)-1 {
		t.Errorf("other = %d agents, want %d", len(other), len(targets)-1)
	}
}

// --- end-to-end parity runs -------------------------------------------------
//
// runSkillsAdd ends in os.Exit, so the real command is exercised in a child
// process of this test binary (the pattern usage_exit_test.go uses), with a
// sandboxed HOME and data root and a null stdin, which makes every run
// non-interactive.

// skillsAddCLI runs `litespm skills add <args...>` in a child process with
// project as its working directory and home as its user directory. It returns
// stdout, stderr and the exit code.
func skillsAddCLI(t *testing.T, project, home string, args ...string) (string, string, int) {
	t.Helper()
	childArgs := append([]string{"-test.run=^TestSkillsAddHelperProcess$", "--", "skills", "add"}, args...)
	cmd := exec.Command(os.Args[0], childArgs...)
	cmd.Dir = project
	cmd.Env = append(os.Environ(),
		"HOME="+home,
		"USERPROFILE="+home,
		"XDG_CONFIG_HOME="+filepath.Join(home, ".config"),
		"APPDATA="+filepath.Join(home, "AppData", "Roaming"),
		"LITESPM_DATA_ROOT="+t.TempDir(),
		"LITESPM_CONFIG_ROOT="+t.TempDir(),
		"LITESPM_RUNTIME_ROOT="+t.TempDir(),
	)
	for _, a := range skills.AgentTargets() {
		if a.EnvVar != "" {
			cmd.Env = append(cmd.Env, a.EnvVar+"=")
		}
	}
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	err := cmd.Run()
	if ee, ok := err.(*exec.ExitError); ok {
		return out.String(), errBuf.String(), ee.ExitCode()
	} else if err != nil {
		t.Fatalf("run skills add %v: %v", args, err)
	}
	return out.String(), errBuf.String(), 0
}

// TestSkillsAddHelperProcess runs the real CLI main with the argv after "--".
// It is selected only in the child process and is a no-op in a normal run.
func TestSkillsAddHelperProcess(t *testing.T) {
	for i, a := range os.Args {
		if a != "--" {
			continue
		}
		os.Args = append([]string{"litespm"}, os.Args[i+1:]...)
		main()
		return
	}
}

// decodeInstalledSkills decodes the --json install summary. The child is a Go
// test binary, so after main() returns the testing framework appends its own
// "PASS" line to stdout; the command's payload is the first line.
func decodeInstalledSkills(t *testing.T, stdout string) []installedSkill {
	t.Helper()
	line := strings.TrimSpace(strings.SplitN(stdout, "\n", 2)[0])
	payload := struct {
		Installed []installedSkill `json:"installed"`
	}{}
	if err := json.Unmarshal([]byte(line), &payload); err != nil {
		t.Fatalf("stdout is not the JSON summary (%v):\n%s", err, stdout)
	}
	return payload.Installed
}

// TestSkillsAddListShortFlagEndToEnd makes `-l` prove it behaves identically to
// `--list` at the process level: byte-identical output, nothing written.
func TestSkillsAddListShortFlagEndToEnd(t *testing.T) {
	home := t.TempDir()
	project := t.TempDir()
	src := filepath.Join(t.TempDir(), "source")
	writeTestSkill(t, filepath.Join(src, "frontend-design"), "frontend-design", "frontend")
	writeTestSkill(t, filepath.Join(src, "skill-creator"), "skill-creator", "creator")

	shortOut, shortErr, code := skillsAddCLI(t, project, home, src, "-l")
	if code != 0 {
		t.Fatalf("-l exit = %d, stderr:\n%s", code, shortErr)
	}
	longOut, longErr, code := skillsAddCLI(t, project, home, src, "--list")
	if code != 0 {
		t.Fatalf("--list exit = %d, stderr:\n%s", code, longErr)
	}
	if shortOut != longOut {
		t.Errorf("-l output differs from --list:\n-l:\n%s\n--list:\n%s", shortOut, longOut)
	}
	for _, want := range []string{"frontend-design", "skill-creator"} {
		if !strings.Contains(shortOut, want) {
			t.Errorf("listing is missing %q:\n%s", want, shortOut)
		}
	}
	if _, err := os.Stat(filepath.Join(project, ".agents")); !os.IsNotExist(err) {
		t.Errorf("--list must not write agent directories (err=%v)", err)
	}
}

// TestSkillsAddWildcardSkillsEndToEnd is the `--skill '*' -a cursor` parity
// invocation: every discovered skill lands in the one selected agent's dir.
func TestSkillsAddWildcardSkillsEndToEnd(t *testing.T) {
	home := t.TempDir()
	project := t.TempDir()
	src := filepath.Join(t.TempDir(), "source")
	writeTestSkill(t, filepath.Join(src, "frontend-design"), "frontend-design", "frontend")
	writeTestSkill(t, filepath.Join(src, "skill-creator"), "skill-creator", "creator")

	stdout, stderr, code := skillsAddCLI(t, project, home, src, "--skill", "*", "-a", "cursor", "--yes", "--json")
	if code != 0 {
		t.Fatalf("exit = %d, stderr:\n%s", code, stderr)
	}
	installed := decodeInstalledSkills(t, stdout)
	if len(installed) != 2 {
		t.Fatalf("installed %d entries, want 2 (one per discovered skill): %+v", len(installed), installed)
	}
	for _, name := range []string{"frontend-design", "skill-creator"} {
		if _, err := os.Stat(filepath.Join(project, ".agents", "skills", name, "SKILL.md")); err != nil {
			t.Errorf("wildcard did not install %s: %v", name, err)
		}
	}
}

// TestSkillsAddAllEndToEnd runs the reference CLI's `--all` invocation: every
// discovered skill to every known agent, non-interactively, with agents that
// share one directory collapsing to one copy each.
func TestSkillsAddAllEndToEnd(t *testing.T) {
	home := t.TempDir()
	project := t.TempDir()
	src := filepath.Join(t.TempDir(), "source")
	writeTestSkill(t, filepath.Join(src, "frontend-design"), "frontend-design", "frontend")
	writeTestSkill(t, filepath.Join(src, "skill-creator"), "skill-creator", "creator")

	stdout, stderr, code := skillsAddCLI(t, project, home, src, "--all", "--json")
	if code != 0 {
		t.Fatalf("exit = %d, stderr:\n%s", code, stderr)
	}
	installed := decodeInstalledSkills(t, stdout)

	wantDirs := map[string]bool{}
	for _, a := range skills.AgentTargets() {
		if dir, ok := skills.AgentSkillDir(a.ID, "project", project, home); ok {
			wantDirs[dir] = true
		}
	}
	if len(installed) != 2*len(wantDirs) {
		t.Fatalf("installed %d entries, want %d (2 skills x %d unique agent dirs)",
			len(installed), 2*len(wantDirs), len(wantDirs))
	}
	seen := map[string]int{}
	for _, in := range installed {
		seen[in.To]++
	}
	if len(seen) != len(installed) {
		t.Errorf("installed %d entries over %d destinations: shared destinations were not collapsed", len(installed), len(seen))
	}
	for _, name := range []string{"frontend-design", "skill-creator"} {
		for dir := range wantDirs {
			if _, err := os.Stat(filepath.Join(dir, name, "SKILL.md")); err != nil {
				t.Errorf("--all did not install %s to %s: %v", name, dir, err)
			}
		}
	}
	if len(skills.AgentTargets()) <= len(wantDirs) {
		t.Errorf("expected shared destinations: %d agents resolved to %d dirs", len(skills.AgentTargets()), len(wantDirs))
	}
}

// TestSkillsAddYesDetectsAgentsEndToEnd is the reference CLI's non-interactive
// flow without --agent: a detectable agent directory is used automatically, and
// only an undetectable machine is refused.
func TestSkillsAddYesDetectsAgentsEndToEnd(t *testing.T) {
	t.Run("detectable agent is used without --agent", func(t *testing.T) {
		home := t.TempDir()
		if err := os.MkdirAll(filepath.Join(home, ".cursor"), 0o755); err != nil {
			t.Fatal(err)
		}
		project := t.TempDir()
		src := filepath.Join(t.TempDir(), "source")
		writeTestSkill(t, filepath.Join(src, "only-skill"), "only-skill", "one")

		stdout, stderr, code := skillsAddCLI(t, project, home, src, "--yes", "--json")
		if code != 0 {
			t.Fatalf("exit = %d, stderr:\n%s", code, stderr)
		}
		if got := decodeInstalledSkills(t, stdout); len(got) != 1 {
			t.Fatalf("installed %d entries, want 1 (the detectable agent)", len(got))
		}
		if _, err := os.Stat(filepath.Join(project, ".agents", "skills", "only-skill", "SKILL.md")); err != nil {
			t.Errorf("the detected agent (cursor) was not installed to: %v", err)
		}
	})

	t.Run("nothing detectable is refused, naming what could not be found", func(t *testing.T) {
		home := t.TempDir() // no agent directories at all
		project := t.TempDir()
		src := filepath.Join(t.TempDir(), "source")
		writeTestSkill(t, filepath.Join(src, "only-skill"), "only-skill", "one")

		_, stderr, code := skillsAddCLI(t, project, home, src, "--yes", "--json")
		if code != 1 {
			t.Fatalf("exit = %d, want 1 (refusal), stderr:\n%s", code, stderr)
		}
		if !strings.Contains(stderr, "no agents selected") || !strings.Contains(stderr, "none detected") {
			t.Errorf("refusal must name what could not be found:\n%s", stderr)
		}
		if _, err := os.Stat(filepath.Join(project, ".agents")); !os.IsNotExist(err) {
			t.Errorf("a refused run must not install anything (err=%v)", err)
		}
	})
}

// TestSkillsAddRefusalExitCodes pins the established convention: usage errors
// exit 2, every refusal or failure exits 1 (see runSkillsAdd and main.go).
func TestSkillsAddRefusalExitCodes(t *testing.T) {
	home := t.TempDir()
	project := t.TempDir()
	src := filepath.Join(t.TempDir(), "source")
	writeTestSkill(t, filepath.Join(src, "only-skill"), "only-skill", "one")
	emptySrc := t.TempDir()

	cases := []struct {
		name string
		args []string
		want int
		says string
	}{
		{"usage error", nil, 2, "missing <source>"},
		{"unknown flag", []string{src, "--bogus"}, 2, "unknown flag"},
		{"unknown skill", []string{src, "--skill", "bogus", "--json"}, 1, "unknown skill(s): bogus"},
		{"unknown agent", []string{src, "--skill", "only-skill", "-a", "bogus", "--yes", "--json"}, 1, `unknown agent "bogus"`},
		{"no --yes non-interactively", []string{src, "--skill", "only-skill", "-a", "cursor", "--json"}, 1, "refusing to install non-interactively without --yes"},
		{"wildcard against an empty source", []string{emptySrc, "--skill", "*", "--yes", "--json"}, 1, "No installable skills found"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, stderr, code := skillsAddCLI(t, project, home, tc.args...)
			if code != tc.want {
				t.Fatalf("exit = %d, want %d\nstderr:\n%s", code, tc.want, stderr)
			}
			if !strings.Contains(stderr, tc.says) {
				t.Errorf("stderr must contain %q:\n%s", tc.says, stderr)
			}
		})
	}
}
