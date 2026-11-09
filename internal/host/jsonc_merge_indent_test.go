package host

import (
	"encoding/json"
	"testing"
)

// A container LiteSPM creates (`"mcpServers": {}`) has its closing brace on
// the key's own line, so the member inserted into it used to be indented from
// column 0 of the slice — level with its parent key, with the brace pulled
// back to column 0. The member must sit one level inside its container.
func TestCreatedContainerMemberIsIndentedInsideIt(t *testing.T) {
	raw := "{\n  \"numStartups\": 3\n}\n"
	got, err := mergeJSONEntrySurgicalNamed(raw, []string{"mcpServers"}, "litespm",
		map[string]any{"command": "litespm", "args": []string{"bridge"}})
	if err != nil {
		t.Fatal(err)
	}
	want := "{\n  \"numStartups\": 3,\n  \"mcpServers\": {\n    \"litespm\": {\"args\":[\"bridge\"],\"command\":\"litespm\"}\n  }\n}\n"
	if got != want {
		t.Fatalf("layout:\n%s\nwant:\n%s", got, want)
	}
	var v map[string]any
	if err := json.Unmarshal([]byte(got), &v); err != nil {
		t.Fatalf("result does not parse: %v\n%s", err, got)
	}
}

// Two levels of created containers nest one indent step each.
func TestCreatedNestedContainersIndentStepByStep(t *testing.T) {
	raw := "{\n  \"a\": 1\n}\n"
	got, err := mergeJSONEntrySurgicalNamed(raw, []string{"mcp", "servers"}, "litespm", map[string]any{"x": 1})
	if err != nil {
		t.Fatal(err)
	}
	var v map[string]any
	if err := json.Unmarshal([]byte(got), &v); err != nil {
		t.Fatalf("result does not parse: %v\n%s", err, got)
	}
	mcp, _ := v["mcp"].(map[string]any)
	servers, _ := mcp["servers"].(map[string]any)
	if _, ok := servers["litespm"]; !ok {
		t.Fatalf("entry not at mcp.servers.litespm:\n%s", got)
	}
	if !containsLine(got, `      "litespm": {"x":1}`) {
		t.Fatalf("member not indented three levels deep:\n%s", got)
	}
}

func containsLine(text, line string) bool {
	for _, l := range splitLines(text) {
		if l == line {
			return true
		}
	}
	return false
}

func splitLines(s string) []string {
	var out []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			out = append(out, s[start:i])
			start = i + 1
		}
	}
	return append(out, s[start:])
}
