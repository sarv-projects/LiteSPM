package host

// jsonc_trailing_comment_test.go — a JSONC container whose last line is a
// comment must still accept a new member.
//
// The defect this pins: insertRawMember appended `,\n<member>` after the
// container's trailing text, so when that text was a comment the separator
// comma landed inside the comment. The next member then had no separator and
// the merged document no longer parsed — a fail-closed refusal the user could
// not act on.

import (
	"strings"
	"testing"
)

func TestMergeJSONEntrySurgicalWithTrailingComment(t *testing.T) {
	cases := []struct {
		name string
		orig string
	}{
		// The exact shape from the audit report.
		{"comma-then-line-comment", "{\"mcpServers\": {\"a\": {}, // add your servers here\n}}"},
		{"line-comment-no-comma", "{\"mcpServers\": {\"a\": {} // add your servers here\n}}"},
		{"block-comment", "{\"mcpServers\": {\"a\": {} /* add your servers here */\n}}"},
		{"comment-only-container", "{\"mcpServers\": { // add your servers here\n}}"},
		{"comment-before-close-on-own-line", "{\n  \"mcpServers\": {\n    \"a\": {}\n    // add your servers here\n  }\n}"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out, err := mergeJSONEntrySurgicalNamed(tc.orig, []string{"mcpServers"}, "litespm",
				map[string]any{"command": "litespm", "args": []string{"bridge"}})
			if err != nil {
				t.Fatalf("merge refused: %v\ninput: %s", err, tc.orig)
			}
			root, err := parseConfigJSON(BridgeTarget{TolerateComments: true}, []byte(out))
			if err != nil {
				t.Fatalf("merged output does not re-parse: %v\ninput:  %s\noutput: %s", err, tc.orig, out)
			}
			if _, ok := lookupInMap(root, []string{"mcpServers"})["litespm"]; !ok {
				t.Fatalf("the new member is missing:\n%s", out)
			}
			if _, ok := lookupInMap(root, []string{"mcpServers"})["a"]; !ok && strings.Contains(tc.orig, `"a"`) {
				t.Fatalf("the existing member was lost:\n%s", out)
			}
			if !strings.Contains(out, "add your servers here") {
				t.Fatalf("the user's comment was dropped:\n%s", out)
			}
		})
	}
}
