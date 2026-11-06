package scan

import (
	"encoding/json"
	"testing"
)

// The catalogue publishes `source` in two shapes: the website dataset writes a
// flat string, the v1 release shards write an object. The scanner runs over
// both files, so both must decode — a review of the live 2026-10-21 release
// found every shard in the object shape, which the string-only field rejected,
// making the whole audit fail for every user who had synced a catalog.
func TestRowSourceAcceptsBothPublishedShapes(t *testing.T) {
	t.Run("flat string (website dataset)", func(t *testing.T) {
		var row Row
		if err := json.Unmarshal([]byte(`{"id":"mcp:a","kind":"mcp","source":"builtin:mcp-registry"}`), &row); err != nil {
			t.Fatalf("flat string source must decode: %v", err)
		}
		if got := string(row.Source); got != "builtin:mcp-registry" {
			t.Fatalf("source = %q, want builtin:mcp-registry", got)
		}
	})

	t.Run("object (v1 release shard)", func(t *testing.T) {
		var row Row
		body := `{"id":"mcp:a","kind":"mcp","source":{"sourceId":"feed:example","upstreamId":"io.example/a","url":"https://example.test/a"}}`
		if err := json.Unmarshal([]byte(body), &row); err != nil {
			t.Fatalf("object source must decode: %v", err)
		}
		if got := string(row.Source); got != "feed:example" {
			t.Fatalf("source = %q, want sourceId feed:example", got)
		}
	})

	t.Run("object without sourceId falls back to upstream then url", func(t *testing.T) {
		var row Row
		if err := json.Unmarshal([]byte(`{"source":{"upstreamId":"io.example/a"}}`), &row); err != nil {
			t.Fatal(err)
		}
		if got := string(row.Source); got != "io.example/a" {
			t.Fatalf("source = %q, want io.example/a", got)
		}
		if err := json.Unmarshal([]byte(`{"source":{"url":"https://example.test/a"}}`), &row); err != nil {
			t.Fatal(err)
		}
		if got := string(row.Source); got != "https://example.test/a" {
			t.Fatalf("source = %q, want the url", got)
		}
	})

	t.Run("missing source is still empty", func(t *testing.T) {
		var row Row
		if err := json.Unmarshal([]byte(`{"id":"mcp:a"}`), &row); err != nil {
			t.Fatal(err)
		}
		if row.Source != "" {
			t.Fatalf("source = %q, want empty", row.Source)
		}
	})

	t.Run("a source in neither shape is an error", func(t *testing.T) {
		var row Row
		if err := json.Unmarshal([]byte(`{"source":[1,2]}`), &row); err == nil {
			t.Fatal("an array source must not decode silently")
		}
	})
}

// Rule 5 (a version with no traceable source) must read the decoded source,
// not the raw field: an object-shaped source is not "no source".
func TestVersionWithoutSourceUsesTheDecodedSource(t *testing.T) {
	var row Row
	body := `{"id":"mcp:a","kind":"mcp","version":"1.2.3","source":{"sourceId":"feed:example"}}`
	if err := json.Unmarshal([]byte(body), &row); err != nil {
		t.Fatal(err)
	}
	for _, f := range Scan(row) {
		if f.Rule == RuleVersionWithoutSource {
			t.Fatalf("rule fired on a row whose source decodes to %q", row.Source)
		}
	}
}
