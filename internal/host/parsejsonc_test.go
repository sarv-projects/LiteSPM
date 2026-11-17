package host

import "testing"

func TestParseJSONCToleratesCommentsAndTrailingCommas(t *testing.T) {
	input := []byte(`{
  // a comment the surgical writer preserves
  "mcpServers": {
    "litespm": { "command": "litespm", "args": ["bridge", "stdio", "--host", "cline"], },
  },
  "theme": "dark",
}`)
	got, err := ParseJSONC(input)
	if err != nil {
		t.Fatalf("JSONC with comments and a trailing comma must parse: %v", err)
	}
	if got["theme"] != "dark" {
		t.Fatalf("theme = %v, want dark", got["theme"])
	}
	mcp, ok := got["mcpServers"].(map[string]any)
	if !ok || mcp["litespm"] == nil {
		t.Fatalf("mcpServers.litespm missing: %#v", got["mcpServers"])
	}
}

func TestParseJSONCKeepsSlashesInStrings(t *testing.T) {
	got, err := ParseJSONC([]byte(`{"url":"https://example.com/a//b"}`))
	if err != nil {
		t.Fatal(err)
	}
	if got["url"] != "https://example.com/a//b" {
		t.Fatalf("URL was mangled: %v", got["url"])
	}
}
