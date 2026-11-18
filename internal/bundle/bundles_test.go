package bundle

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestRegistryMatchesWebBundleSource(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("no source path")
	}
	source := filepath.Join(filepath.Dir(file), "..", "..", "web", "data", "bundles.json")
	raw, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Bundles []struct {
			ID    string   `json:"id"`
			Items []string `json:"items"`
		} `json:"bundles"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	if len(doc.Bundles) != len(items) {
		t.Fatalf("registry has %d bundles, source has %d", len(items), len(doc.Bundles))
	}
	for _, b := range doc.Bundles {
		got, ok := Items(b.ID)
		if !ok {
			t.Fatalf("bundle %s missing", b.ID)
		}
		if len(got) != len(b.Items) {
			t.Fatalf("bundle %s has %d items, want %d", b.ID, len(got), len(b.Items))
		}
		for i := range got {
			if got[i] != b.Items[i] {
				t.Fatalf("bundle %s item %d = %q, want %q", b.ID, i, got[i], b.Items[i])
			}
		}
	}
}
