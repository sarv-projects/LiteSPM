package main

// skills_add_test.go — the non-interactive, testable surface of `litespm
// skills add`. The interactive prompts themselves are not scripted here (they
// read a terminal); everything around them is: argument parsing, selection
// parsing, the small rendering helpers, and the summary panel.

import (
	"bufio"
	"bytes"
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
