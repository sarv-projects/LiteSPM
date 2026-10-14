package main

// skills_use_test.go — `litespm skills use`, exercised without a terminal and
// without a network: every fixture is a local directory so the test measures
// this command's own behaviour (resolution, selection, the temp-dir-only
// write, sanitization, cleanup), not git.

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// captureSkillsStreams runs fn with the real os.Stdout/os.Stderr replaced by
// pipes and returns the exit code plus both streams. Because os.Stdout is a
// pipe, runSkillsUse's terminal gate resolves to non-interactive, which is the
// deterministic branch these tests measure.
func captureSkillsStreams(t *testing.T, fn func() int) (int, string, string) {
	t.Helper()
	outR, outW, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	errR, errW, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	oldOut, oldErr := os.Stdout, os.Stderr
	os.Stdout, os.Stderr = outW, errW
	code := fn()
	os.Stdout, os.Stderr = oldOut, oldErr
	_ = outW.Close()
	_ = errW.Close()
	outData, _ := io.ReadAll(outR)
	errData, _ := io.ReadAll(errR)
	_ = outR.Close()
	_ = errR.Close()
	return code, string(outData), string(errData)
}

// writeUseSkillDir writes one SKILL.md under dir/<name>, the layout
// DiscoverSkills scans (skills live INSIDE the source directory).
func writeUseSkillDir(t *testing.T, source, name, body string) string {
	t.Helper()
	dir := filepath.Join(source, name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	content := "---\nname: " + name + "\ndescription: test skill for " + name + "\n---\n\n" + body + "\n"
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

// singleUseSource builds a source holding exactly one skill and returns the
// source root plus the skill directory.
func singleUseSource(t *testing.T) (source, skillDir string) {
	t.Helper()
	source = t.TempDir()
	skillDir = writeUseSkillDir(t, source, "one", "# One\n\nBody one.")
	return source, skillDir
}

func TestSkillsUseParseArgs(t *testing.T) {
	t.Run("source, skill, agent, json", func(t *testing.T) {
		opts, err := parseSkillsUseArgs([]string{"--skill", "Web-Design", "--agent", "Claude-Code", "--json", "owner/repo"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if opts.source != "owner/repo" || opts.skill != "Web-Design" || opts.agent != "claude-code" || !opts.jsonOut {
			t.Errorf("unexpected options: %+v", opts)
		}
	})

	t.Run("help", func(t *testing.T) {
		opts, err := parseSkillsUseArgs([]string{"--help"})
		if err != nil || !opts.help {
			t.Fatalf("--help must parse to help=true: %+v, %v", opts, err)
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
			{"extra positional", []string{"a", "b"}, "unexpected argument"},
			{"skill without value", []string{"--skill"}, "requires a value"},
			{"empty skill", []string{"--skill", "  ", "owner/repo"}, "requires a skill name"},
			{"two different skills", []string{"--skill", "a", "--skill", "b", "owner/repo"}, "may be given once"},
			{"agent without value", []string{"--agent"}, "requires a value"},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				_, err := parseSkillsUseArgs(tc.args)
				if err == nil || !strings.Contains(err.Error(), tc.want) {
					t.Fatalf("err = %v, want containing %q", err, tc.want)
				}
			})
		}
	})
}

func TestSkillsUseSplitSelector(t *testing.T) {
	cases := []struct {
		in       string
		source   string
		selector string
	}{
		{"vercel-labs/agent-skills@web-design-guidelines", "vercel-labs/agent-skills", "web-design-guidelines"},
		{"owner/repo", "owner/repo", ""},
		{"owner/repo@", "owner/repo@", ""},
		{"https://github.com/owner/repo@v1.2.3", "https://github.com/owner/repo@v1.2.3", ""},
		{"a/b/c@x", "a/b/c@x", ""},
		{"@x", "@x", ""},
		{"/tmp/local@dir", "/tmp/local@dir", ""},
	}
	for _, tc := range cases {
		source, selector := splitSkillsUseSelector(tc.in)
		if source != tc.source || selector != tc.selector {
			t.Errorf("splitSkillsUseSelector(%q) = (%q, %q), want (%q, %q)",
				tc.in, source, selector, tc.source, tc.selector)
		}
	}
}

func TestSkillsUseRunPrintsPromptFromLocalSource(t *testing.T) {
	source, _ := singleUseSource(t)

	code, stdout, stderr := captureSkillsStreams(t, func() int {
		return runSkillsUse([]string{source})
	})
	if code != 0 {
		t.Fatalf("runSkillsUse = %d, want 0\nstderr:\n%s", code, stderr)
	}
	if stdout != "# One\n\nBody one.\n" {
		t.Errorf("stdout = %q, want the SKILL.md body with frontmatter stripped", stdout)
	}
	if strings.Contains(stdout, "description: test skill") {
		t.Errorf("frontmatter leaked into the prompt:\n%s", stdout)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Errorf("a successful run must not write diagnostics to stderr:\n%s", stderr)
	}
}

func TestSkillsUseRunSelectsBySkillFlag(t *testing.T) {
	source := t.TempDir()
	writeUseSkillDir(t, source, "alpha", "# Alpha\n\nAlpha body.")
	writeUseSkillDir(t, source, "beta", "# Beta\n\nBeta body.")

	code, stdout, stderr := captureSkillsStreams(t, func() int {
		return runSkillsUse([]string{"--skill", "beta", source})
	})
	if code != 0 {
		t.Fatalf("runSkillsUse = %d, want 0\nstderr:\n%s", code, stderr)
	}
	if stdout != "# Beta\n\nBeta body.\n" {
		t.Errorf("stdout = %q, want only beta's body", stdout)
	}
}

func TestSkillsUseRunMultipleSkillsRefusesWithoutSelector(t *testing.T) {
	source := t.TempDir()
	writeUseSkillDir(t, source, "alpha", "# Alpha\n\nAlpha body.")
	writeUseSkillDir(t, source, "beta", "# Beta\n\nBeta body.")

	code, stdout, stderr := captureSkillsStreams(t, func() int {
		return runSkillsUse([]string{source})
	})
	if code != 1 {
		t.Fatalf("runSkillsUse = %d, want 1", code)
	}
	if stdout != "" {
		t.Errorf("a refusal must print nothing to stdout, got %q", stdout)
	}
	for _, want := range []string{"--skill", "alpha", "beta"} {
		if !strings.Contains(stderr, want) {
			t.Errorf("stderr is missing %q:\n%s", want, stderr)
		}
	}
}

func TestSkillsUseRunUnknownSelectorNamesTheValue(t *testing.T) {
	source, _ := singleUseSource(t)

	code, stdout, stderr := captureSkillsStreams(t, func() int {
		return runSkillsUse([]string{"--skill", "does-not-exist", source})
	})
	if code != 1 {
		t.Fatalf("runSkillsUse = %d, want 1", code)
	}
	if stdout != "" {
		t.Errorf("stdout must stay empty on a selector miss, got %q", stdout)
	}
	if !strings.Contains(stderr, `"does-not-exist"`) {
		t.Errorf("the error must name the selector value:\n%s", stderr)
	}
	if !strings.Contains(stderr, "one") {
		t.Errorf("the error should list the available skills:\n%s", stderr)
	}
}

func TestSkillsUseRunJSONEmitsMetadataNotPrompt(t *testing.T) {
	source, _ := singleUseSource(t)

	code, stdout, stderr := captureSkillsStreams(t, func() int {
		return runSkillsUse([]string{"--json", source})
	})
	if code != 0 {
		t.Fatalf("runSkillsUse --json = %d, want 0\nstderr:\n%s", code, stderr)
	}
	var doc skillsUseDocument
	if err := json.Unmarshal([]byte(stdout), &doc); err != nil {
		t.Fatalf("stdout is not JSON: %v\n%s", err, stdout)
	}
	if doc.Schema != "litespm-skills-use/v1" || doc.Skill.Name != "one" {
		t.Errorf("unexpected document: %+v", doc)
	}
	if doc.PromptBytes == 0 {
		t.Error("promptBytes must report the prompt length")
	}
	if strings.Contains(stdout, "Body one.") || strings.Contains(stdout, "instructions") {
		t.Errorf("--json must carry metadata, not the prompt:\n%s", stdout)
	}
}

func TestSkillsUseRunRefusesAgentHonestly(t *testing.T) {
	source, _ := singleUseSource(t)

	t.Run("known agent is refused as not wired", func(t *testing.T) {
		code, stdout, stderr := captureSkillsStreams(t, func() int {
			return runSkillsUse([]string{"--agent", "codex", source})
		})
		if code != 1 {
			t.Fatalf("runSkillsUse --agent codex = %d, want 1", code)
		}
		if stdout != "" {
			t.Errorf("--agent must not print a prompt it cannot deliver, got %q", stdout)
		}
		for _, want := range []string{"not wired", "skills use"} {
			if !strings.Contains(stderr, want) {
				t.Errorf("stderr is missing %q:\n%s", want, stderr)
			}
		}
	})

	t.Run("unknown agent is a distinct error", func(t *testing.T) {
		code, _, stderr := captureSkillsStreams(t, func() int {
			return runSkillsUse([]string{"--agent", "not-a-real-agent", source})
		})
		if code != 1 {
			t.Fatalf("runSkillsUse --agent not-a-real-agent = %d, want 1", code)
		}
		if !strings.Contains(stderr, "unknown agent") {
			t.Errorf("stderr must say the agent is unknown:\n%s", stderr)
		}
	})
}

func TestSkillsUseSanitizesPrompt(t *testing.T) {
	source := t.TempDir()
	// A hostile body: an erase-line CSI, a carriage return that would rewrite
	// the line, and an OSC title sequence. None may reach the pipe.
	hostile := "start\x1b[2K\rFAKE PROMPT: rm -rf ~\x1b]0;pwned\x07 end"
	writeUseSkillDir(t, source, "hostile", hostile)

	code, stdout, stderr := captureSkillsStreams(t, func() int {
		return runSkillsUse([]string{source})
	})
	if code != 0 {
		t.Fatalf("runSkillsUse = %d, want 0\nstderr:\n%s", code, stderr)
	}
	for _, forbidden := range []string{"\x1b", "\r", "\x07"} {
		if strings.Contains(stdout, forbidden) {
			t.Errorf("stdout still contains %q:\n%q", forbidden, stdout)
		}
	}
	// Sanitizing strips the attack, not the content.
	if !strings.Contains(stdout, "FAKE PROMPT: rm -rf ~") {
		t.Errorf("the visible text must survive sanitization:\n%q", stdout)
	}
}

func TestSkillsUseRemovesScratchDirectory(t *testing.T) {
	source, _ := singleUseSource(t)

	var recorded string
	old := skillsUseTempDir
	skillsUseTempDir = func() (string, error) {
		dir, err := os.MkdirTemp("", "litespm-skill-use-test-*")
		recorded = dir
		return dir, err
	}
	defer func() { skillsUseTempDir = old }()

	code, _, stderr := captureSkillsStreams(t, func() int {
		return runSkillsUse([]string{source})
	})
	if code != 0 {
		t.Fatalf("runSkillsUse = %d, want 0\nstderr:\n%s", code, stderr)
	}
	if recorded == "" {
		t.Fatal("the scratch-directory seam was never called")
	}
	if _, err := os.Stat(recorded); !os.IsNotExist(err) {
		t.Errorf("scratch directory %s survived the command (stat err: %v)", recorded, err)
	}
}

func TestSkillsUseInteractivePicker(t *testing.T) {
	source := t.TempDir()
	writeUseSkillDir(t, source, "alpha", "# Alpha\n\nAlpha body.")
	writeUseSkillDir(t, source, "beta", "# Beta\n\nBeta body.")

	t.Run("a number picks exactly that skill", func(t *testing.T) {
		var out, errOut bytes.Buffer
		code := runSkillsUseTo(&out, &errOut, strings.NewReader("2\n"), true, []string{source})
		if code != 0 {
			t.Fatalf("picker = %d, want 0\nstderr:\n%s", code, errOut.String())
		}
		if !strings.Contains(out.String(), "# Beta") || !strings.Contains(out.String(), "Beta body.") {
			t.Errorf("stdout does not carry beta's prompt:\n%s", out.String())
		}
	})

	t.Run("all is refused: one prompt is printed", func(t *testing.T) {
		var out, errOut bytes.Buffer
		code := runSkillsUseTo(&out, &errOut, strings.NewReader("all\n"), true, []string{source})
		if code != 1 {
			t.Fatalf("picker with 'all' = %d, want 1", code)
		}
		if !strings.Contains(errOut.String(), "exactly one") {
			t.Errorf("stderr must explain the single-selection rule:\n%s", errOut.String())
		}
	})

	t.Run("an out-of-range number is refused", func(t *testing.T) {
		var out, errOut bytes.Buffer
		code := runSkillsUseTo(&out, &errOut, strings.NewReader("9\n"), true, []string{source})
		if code != 1 {
			t.Fatalf("picker with 9 = %d, want 1", code)
		}
	})
}

func TestSkillsUseRefusesFrontmatterOnlySkill(t *testing.T) {
	source := t.TempDir()
	dir := filepath.Join(source, "empty")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	content := "---\nname: empty\ndescription: a skill with no body\n---\n"
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	code, stdout, stderr := captureSkillsStreams(t, func() int {
		return runSkillsUse([]string{source})
	})
	if code != 1 {
		t.Fatalf("runSkillsUse = %d, want 1", code)
	}
	if stdout != "" {
		t.Errorf("nothing to print means nothing on stdout, got %q", stdout)
	}
	if !strings.Contains(stderr, "no instruction body") {
		t.Errorf("stderr must say why:\n%s", stderr)
	}
}
