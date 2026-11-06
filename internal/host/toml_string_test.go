package host

// toml_string_test.go — only TOML escapes may reach a TOML config, and the
// merged document is re-parsed before it is written.
//
// The audited defect: TOML values were built with Go's %q. `%q` renders a
// vertical tab as \v and an ESC byte as \x1b, and neither is a TOML escape:
// InstallServerEntry(codex, {Command: "cmd\v1", Args: [...]}) wrote a config
// every TOML parser rejects, and nothing re-parsed it before the write.

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

func TestTOMLQuoteStringUsesOnlyTOMLEscapes(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{`plain`, `"plain"`},
		{"cmd\v1", `"cmd\u000B1"`}, // \v is Go, not TOML
		{"a\x1bb", `"a\u001Bb"`},   // \xNN is Go, not TOML
		{"c\ad", `"c\u0007d"`},     // \a is Go, not TOML
		{"tab\there", `"tab\there"`},
		{"nl\nhere", `"nl\nhere"`},
		{"cr\rhere", `"cr\rhere"`},
		{"bs\\here", `"bs\\here"`},
		{`quote"here`, `"quote\"here"`},
		{"\u009b31m", `"\u009B31m"`}, // C1 control
		{"ünïcode ✓", "\"ünïcode ✓\""},
	}
	for _, c := range cases {
		got, err := tomlQuoteString(c.in)
		if err != nil {
			t.Fatalf("tomlQuoteString(%q): %v", c.in, err)
		}
		if got != c.want {
			t.Errorf("tomlQuoteString(%q) = %s, want %s", c.in, got, c.want)
		}
	}

	if _, err := tomlQuoteString(string([]byte{0xff, 0xfe})); err == nil {
		t.Error("invalid UTF-8 has no TOML spelling and must be refused")
	} else if !errors.Is(err, ErrInvalidTOML) {
		t.Errorf("invalid UTF-8 refusal is not a TOMLInvalidError: %v", err)
	}
}

func TestVerifyTOMLDocumentAcceptsValidDocuments(t *testing.T) {
	good := `model = "gpt-5"
# a comment with "double" and 'single' quotes, and an # hash
[mcp_servers.demo] # inline comment
command = "cmd\u000B1"
args = ["a\u001Bb", 'lit\eral', "plain"]
env = { "TOKEN" = "${TOKEN}" }
count = 3
enabled = true
when = 1979-05-27T07:32:00Z

answer = """
line one
line two \
  continued
"""
raw = '''
no \escape here
'''
`
	if err := verifyTOMLDocument(good); err != nil {
		t.Fatalf("a valid document was refused: %v", err)
	}
}

func TestVerifyTOMLDocumentRejectsGoEscapesAndBrokenStrings(t *testing.T) {
	// The exact bytes the old writer produced: Go's %q spelling of a slope
	// command. This is what the verifier exists to catch.
	oldStyle := fmt.Sprintf("command = %q", "cmd\v1")
	bad := []string{
		oldStyle,
		`command = "a\x1bb"`,
		`command = "c\ad"`,
		`command = "unterminated`,
		`command = 'unterminated`,
		"command = \"raw\x0bbyte\"",
		`command = """unterminated`,
	}
	for _, doc := range bad {
		err := verifyTOMLDocument(doc)
		if err == nil {
			t.Errorf("verifyTOMLDocument accepted %q", doc)
			continue
		}
		if !errors.Is(err, ErrInvalidTOML) {
			t.Errorf("refusal for %q is not typed as ErrInvalidTOML: %v", doc, err)
		}
	}
}

// TestInstallServerEntryTOMLEscapesHostileArguments is the audit's exact case:
// the install either writes a file the package's own reader accepts, or it
// refuses; it never leaves an unparseable file.
func TestInstallServerEntryTOMLEscapesHostileArguments(t *testing.T) {
	home := entryHome(t)
	t.Setenv("CODEX_HOME", filepath.Join(home, ".codex"))
	ctx := context.Background()
	path := filepath.Join(home, ".codex", "config.toml")

	entry := ServerEntry{Name: "demo", Command: "cmd\v1", Args: []string{"a\x1bb", "c\ad"}}
	_, err := InstallServerEntry(ctx, "codex", entry, EntryInstallOptions{
		BackupDir: filepath.Join(home, "backups"), Scope: domain.ScopeUser,
	})
	if err != nil {
		if data, rerr := os.ReadFile(path); rerr == nil {
			t.Fatalf("install refused (%v) but left a file behind: %q", err, data)
		}
		t.Logf("install refused the unrepresentable entry: %v", err)
		return
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	got := string(data)
	if verr := verifyTOMLDocument(got); verr != nil {
		t.Fatalf("install wrote a config that does not parse: %v\n%s", verr, got)
	}
	if strings.ContainsRune(got, '\v') || strings.Contains(got, `\v1`) || strings.Contains(got, `\x1b`) || strings.Contains(got, `\ad`) {
		t.Fatalf("a Go-only escape reached the config:\n%s", got)
	}
	for _, want := range []string{`\u000B`, `\u001B`, `\u0007`} {
		if !strings.Contains(got, want) {
			t.Errorf("expected the TOML escape %s in:\n%s", want, got)
		}
	}

	// The package's own line reader must read the values back byte-for-byte.
	spec := entrySpec{Format: FormatTOML, KeyPath: []string{"mcp_servers"}, HostID: "codex"}
	entries := tomlServerEntries(spec, got)
	if len(entries) != 1 {
		t.Fatalf("read back %d entries, want 1:\n%s", len(entries), got)
	}
	if entries[0].Command != "cmd\v1" {
		t.Errorf("command round-trip = %q, want %q", entries[0].Command, "cmd\v1")
	}
	if len(entries[0].Args) != 2 || entries[0].Args[0] != "a\x1bb" || entries[0].Args[1] != "c\ad" {
		t.Errorf("args round-trip = %q", entries[0].Args)
	}
}

// TestCodexPlanSetupEscapesControlCharactersInTheBinaryPath pins the bespoke
// TOML writer: a path carrying a control byte must still produce a document the
// verifier accepts, and must not contain the Go spelling.
func TestCodexPlanSetupEscapesControlCharactersInTheBinaryPath(t *testing.T) {
	home := useTempHome(t)
	t.Setenv("CODEX_HOME", filepath.Join(home, ".codex"))
	plan, err := (&CodexAdapter{}).PlanSetup(context.Background(), "/opt/lite\x0bspm", filepath.Join(home, "backups"))
	if err != nil {
		t.Fatalf("PlanSetup: %v", err)
	}
	if verr := verifyTOMLDocument(plan.ProposedContent); verr != nil {
		t.Fatalf("the planned config does not parse: %v\n%s", verr, plan.ProposedContent)
	}
	if !strings.Contains(plan.ProposedContent, `\u000B`) {
		t.Fatalf("the control byte was not escaped:\n%s", plan.ProposedContent)
	}
}
