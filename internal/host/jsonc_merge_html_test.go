package host

import (
	"strings"
	"testing"
)

// json.Marshal rewrites <, > and & as \u003c, \u003e and \u0026. A catalog
// argument such as `mongodb-mcp-server@<3` must reach the user's config file as
// written, not as an escape sequence they would have to decode by eye.
func TestIndentValueDoesNotHTMLEscape(t *testing.T) {
	got, err := indentValue(map[string]any{"args": []string{"-y", "pkg@<3", "a&b", ">=2"}}, "  ")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(got, `\u00`) {
		t.Fatalf("HTML-escaped output: %s", got)
	}
	for _, want := range []string{"pkg@<3", "a&b", ">=2"} {
		if !strings.Contains(got, want) {
			t.Fatalf("output %s lost %q", got, want)
		}
	}
	if strings.HasSuffix(got, "\n") {
		t.Fatalf("trailing newline leaked into a spliced value: %q", got)
	}
}
