package skills

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// A skill is someone else's markdown, cloned from a repository the user has
// never read, and every field in it is printed to the user's terminal at the
// moment they are deciding whether to trust it. These tests pin the stripping
// that makes that safe.

func TestStripTerminalEscapes(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "CSI cursor movement and erase",
			// The classic: clear the line, then carriage-return, then write
			// whatever the attacker wants the victim to read.
			in:   "\x1b[2K\rFake prompt: rm -rf ~",
			want: "Fake prompt: rm -rf ~",
		},
		{
			name: "CSI with colour",
			in:   "\x1b[31mred\x1b[0m text",
			want: "red text",
		},
		{
			name: "OSC window title, BEL terminated",
			in:   "\x1b]0;pwned\x07visible",
			want: "visible",
		},
		{
			name: "OSC hyperlink, ST terminated",
			in:   "\x1b]8;;https://evil.example\x1b\\link\x1b]8;;\x1b\\",
			want: "link",
		},
		{
			name: "DCS",
			in:   "\x1bPsome device data\x1b\\after",
			want: "after",
		},
		{
			name: "APC and PM",
			in:   "\x1b_apc\x1b\\A\x1b^pm\x1b\\B",
			want: "AB",
		},
		{
			name: "two-character escape",
			in:   "\x1b#8after",
			want: "after",
		},
		{
			name: "raw C1 controls",
			in:   "a\x9bb\x9dc",
			want: "abc",
		},
		{
			name: "remaining C0 controls and DEL, tab and newline kept",
			in:   "a\x00b\x08c\x7fd\te\nf",
			want: "abcd\te\nf",
		},
		{
			name: "three-byte designation sequences lose their final byte too",
			in:   "a\x1b#8b\x1b(0c\x1b)Bd",
			want: "abcd",
		},
		{
			name: "a continuation byte inside a valid multi-byte character survives",
			// 日本語 is E6 97 A5 / E6 9C AC /E8 AA 9E. Byte 0x97 and byte 0x9E
			// sit inside the C1 range, so a byte-wise C1 strip would corrupt
			// every non-Latin description on the page.
			in:   "日本語 documentation",
			want: "日本語 documentation",
		},
		{
			name: "trailing lone escape contributes nothing",
			in:   "tail\x1b",
			want: "tail",
		},
		{
			name: "an unterminated CSI does not run off the end",
			in:   "a\x1b[38;5;12",
			want: "a",
		},
		{
			name: "plain text is untouched",
			in:   "Retrieve up-to-date documentation",
			want: "Retrieve up-to-date documentation",
		},
		{
			name: "non-latin text survives",
			in:   "文档检索 エラー Ω≈ç√∫",
			want: "文档检索 エラー Ω≈ç√∫",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := stripTerminalEscapes(tc.in); got != tc.want {
				t.Errorf("stripTerminalEscapes(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// The parse boundary is where this has to happen: a sink added later cannot
// forget to strip if the value was never hostile to begin with.
func TestParseSkillMDStripsTerminalEscapes(t *testing.T) {
	const hostile = "---\n" +
		"name: \"\x1b[2K\rLegit Looking Skill\"\n" +
		"description: \"\x1b]0;pwned\x07Does a thing\"\n" +
		"triggers:\n" +
		"  - \"\x1b[31malert\"\n" +
		"tools:\n" +
		"  - \"\x9bnet\"\n" +
		"---\n\n# Body\n\nInstructions.\n"

	pkg, err := ParseSkillMD([]byte(hostile))
	if err != nil {
		t.Fatalf("ParseSkillMD: %v", err)
	}

	assertClean := func(field, got string) {
		t.Helper()
		if strings.ContainsRune(got, 0x1b) {
			t.Errorf("%s still contains an escape: %q", field, got)
		}
		for _, r := range got {
			if r == 0x7f || (r < 0x20 && r != '\n' && r != '\t') || (r >= 0x80 && r <= 0x9f) {
				t.Errorf("%s still contains control rune U+%04X: %q", field, r, got)
			}
		}
	}

	assertClean("Name", pkg.Name)
	assertClean("Description", pkg.Description)
	for _, s := range pkg.Triggers {
		assertClean("Triggers", s)
	}
	for _, s := range pkg.ToolsRequired {
		assertClean("ToolsRequired", s)
	}

	if pkg.Name != "Legit Looking Skill" {
		t.Errorf("Name = %q, want %q", pkg.Name, "Legit Looking Skill")
	}
	if pkg.Description != "Does a thing" {
		t.Errorf("Description = %q, want %q", pkg.Description, "Does a thing")
	}
	if len(pkg.Triggers) != 1 || pkg.Triggers[0] != "alert" {
		t.Errorf("Triggers = %q, want [alert]", pkg.Triggers)
	}
	if len(pkg.ToolsRequired) != 1 || pkg.ToolsRequired[0] != "net" {
		t.Errorf("ToolsRequired = %q, want [net]", pkg.ToolsRequired)
	}
}

// A `|` in a description used to split the row and corrupt the whole table.
func TestRenderProgressiveIndexSurvivesMarkdownInjection(t *testing.T) {
	pkgs := []*SkillPackage{
		{Name: "evil", Description: "a | b | c"},
		{Name: "multi", Description: "first line\nsecond line"},
	}
	out := RenderProgressiveIndex(pkgs)

	for _, line := range strings.Split(strings.TrimRight(out, "\n"), "\n") {
		if !strings.HasPrefix(line, "|") {
			continue
		}
		// Count only UNESCAPED separators: a `\|` is data the escaping
		// produced, not a cell boundary. An injection would add real cells.
		if got := strings.Count(strings.ReplaceAll(line, `\|`, ""), "|"); got != strings.Count("| **x** | x | x | x |", "|") {
			t.Errorf("row has %d separators, want 5, so a value split it: %q", got, line)
		}
	}
	if !strings.Contains(out, `a \| b \| c`) {
		t.Errorf("expected the pipes to be escaped, got:\n%s", out)
	}
}

// The old renderer sliced bytes, which cut multi-byte characters in half.
func TestTruncateRunesDoesNotCorruptUTF8(t *testing.T) {
	const s = "日本語の説明テキスト" // 10 runes, 30 bytes
	if n := utf8.RuneCountInString(s); n != 10 {
		t.Fatalf("fixture is %d runes, expected 10", n)
	}
	got := truncateRunes(s, 8)
	if !utf8.ValidString(got) {
		t.Fatalf("truncateRunes produced invalid UTF-8: %q", got)
	}
	if n := utf8.RuneCountInString(got); n != 8 {
		t.Errorf("rune count = %d, want 8 (%q)", n, got)
	}
	if !strings.HasSuffix(got, "...") {
		t.Errorf("expected an ellipsis marking the cut, got %q", got)
	}

	// A short string is returned whole, with no ellipsis.
	if got := truncateRunes("short", 10); got != "short" {
		t.Errorf("truncateRunes(short, 10) = %q, want %q", got, "short")
	}
	// What the old `desc[:77]` would have done to a longer body: a byte slice
	// through the middle of a multi-byte character is not valid UTF-8.
	long := strings.Repeat("あ", 40)
	legacy := long[:77]
	if utf8.ValidString(legacy) {
		t.Errorf("expected the old byte slice to cut a character in half")
	}
}

func TestSanitizeForDisplayCollapsesWhitespace(t *testing.T) {
	cases := map[string]string{
		"a\nb":          "a b",
		"a\r\nb":        "a b",
		"  padded  ":    "padded",
		"a\tb":          "a b",
		"":              "",
		"one\n\n\nmany": "one many",
	}
	for in, want := range cases {
		if got := sanitizeForDisplay(in); got != want {
			t.Errorf("sanitizeForDisplay(%q) = %q, want %q", in, got, want)
		}
	}
}
