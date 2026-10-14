package skills

import (
	"path/filepath"
	"strings"
	"testing"
)

// The reference installer has to handle a skill literally named `__proto__`
// correctly at runtime, because its lock is a JS object keyed by skill name and
// `__proto__` as a key is a prototype-pollution hazard. Our ledger is a slice
// of records rather than a map keyed by name, so that hazard does not transfer
// — but a skill of that name is still a directory on disk and still a string
// that reaches the terminal.
//
// We do not handle it correctly at runtime; we refuse it at the boundary, which
// is the stronger answer: `validSkillName` rejects it long before anything
// could create the directory, write the ledger row, or print the name. This
// test pins that, so a future relaxation of the regex cannot quietly reintroduce
// the hazard our design avoids by construction.
func TestSkillNameRefusesStringsThatAreDangerousElsewhere(t *testing.T) {
	cases := []struct {
		name string // the test's own label
		in   string
		why  string
	}{
		{"proto", "__proto__", "a JS prototype-pollution key"},
		// `constructor` and `prototype` are deliberately NOT here. They pass
		// validSkillName, and unlike the reference installer we do not need to
		// refuse them: our ledger is a slice of records, not a JS object keyed
		// by skill name, and no JavaScript in this project ever reads it. A
		// directory called `constructor` is just a directory. Refusing a legal
		// name to defend against a hazard this design does not have would be
		// theatre, and it would break a user who genuinely named a skill that.
		{"parent", "..", "the filesystem's parent segment"},
		{"traversal", "../../etc", "path traversal"},
		{"absolute", "/etc/passwd", "an absolute path"},
		{"dotfile", ".hidden", "leading dot: a hidden file"},
		{"space", "two words", "a space would break the numbered prompt"},
		{"pipe", "a|b", "a markdown table cell separator"},
		{"escape", "a\x1b[2K", "a terminal escape sequence (CWE-150)"},
		{"newline", "a\nb", "a newline would break out of the line it lands in"},
		{"empty", "", "nothing to name a directory after"},
		{"dash", "-lead", "a leading dash reads as a flag in a shell"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := SanitizeSkillName(tc.in)
			if err == nil {
				t.Fatalf("SanitizeSkillName(%q) accepted it (%q) — %s must never become a directory or ledger key",
					tc.in, got, tc.why)
			}
			if got != "" {
				t.Errorf("SanitizeSkillName(%q) returned %q alongside an error; a rejected name must return nothing", tc.in, got)
			}
		})
	}
}

// Whatever passes validation must be safe as a single path segment on every
// platform, and must not be reinterpretable as a traversal once joined.
func TestAcceptedSkillNamesStayOneSegment(t *testing.T) {
	for _, in := range []string{"skill", "my-skill", "skill2", "a-b-c", "9lives"} {
		got, err := SanitizeSkillName(in)
		if err != nil {
			t.Errorf("SanitizeSkillName(%q) refused a name that should be legal: %v", in, err)
			continue
		}
		if got != in {
			t.Errorf("SanitizeSkillName(%q) = %q, want it unchanged", in, got)
		}
		joined := filepath.Join("/base", got)
		if filepath.Base(joined) != in {
			t.Errorf("%q escaped its directory: joined to %q", in, joined)
		}
		if strings.ContainsAny(got, "/\\") {
			t.Errorf("%q contains a separator after validation", got)
		}
	}
}
