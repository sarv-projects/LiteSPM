package catalog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/catalogbuild"
	"github.com/sarv-projects/litespm/internal/domain"
)

// TestReleaseShardName pins the only two names a release may use for a base.
// The manifest is untrusted input whose names become URL segments and cache
// file paths, so anything else — separators, `..`, odd extensions — is not a
// shard name no matter how harmless it looks.
func TestReleaseShardName(t *testing.T) {
	valid := []string{
		"listings.json",
		"listings-0000.json",
		"listings-0001.json",
		"listings-99999.json",
	}
	for _, name := range valid {
		if !releaseShardName("listings", name) {
			t.Errorf("releaseShardName(%q) = false, want true", name)
		}
	}

	invalid := []string{
		"listings-../../../../etc/passwd",
		"listings-../victim.txt",
		"listings-0000.json/../x",
		"listings-0000.json/x",
		"/listings-0000.json",
		"listings-0000",
		"listings-.json",
		"listings-000a.json",
		"listings-000.json",
		"listings-0000.json\x00",
		"versions.json",
		"manifest.json",
	}
	for _, name := range invalid {
		if releaseShardName("listings", name) {
			t.Errorf("releaseShardName(%q) = true, want false", name)
		}
	}
}

// TestPathWithinDir pins the second, independent gate behind
// releaseShardName. It is lexical on purpose: a traversing path is refused
// without resolving anything on disk.
func TestPathWithinDir(t *testing.T) {
	dir := filepath.FromSlash("/a/b/c")
	cases := []struct {
		path string
		want bool
	}{
		{filepath.FromSlash("/a/b/c/x.json"), true},
		{filepath.FromSlash("/a/b/c/nested/x.json"), true},
		{dir, true},
		{filepath.FromSlash("/a/b/x"), false},
		{filepath.FromSlash("/a/b/c/../x"), false},
		{filepath.FromSlash("/a/x"), false},
	}
	for _, tc := range cases {
		if got := pathWithinDir(dir, tc.path); got != tc.want {
			t.Errorf("pathWithinDir(%q, %q) = %v, want %v", dir, tc.path, got, tc.want)
		}
	}
}

// TestSyncRefusesTraversingShardName is the regression for the cache-escape
// defect: a hostile origin that names a shard "listings-../../…" must be
// refused before anything is written, and a file outside the cache directory
// must be left exactly as it was.
func TestSyncRefusesTraversingShardName(t *testing.T) {
	tmpRoot := t.TempDir()
	cacheDir := filepath.Join(tmpRoot, "cache")

	// Enough `../` to climb out of cache/v1/releases/rel-probe to tmpRoot.
	name := "listings-" + strings.Repeat("../", 6) + "victim.txt"
	body := []byte("[]")
	versions := []byte("[]")
	files := map[string]catalogbuild.ReleaseManifestFile{
		name:            {Size: int64(len(body)), Digest: domain.ComputeBytesDigest(body)},
		"versions.json": {Size: int64(len(versions)), Digest: domain.ComputeBytesDigest(versions)},
	}
	manifest := catalogbuild.ReleaseManifest{
		SchemaVersion: 1,
		ReleaseID:     "rel-probe",
		CreatedAt:     "2026-01-01T00:00:00Z",
		ContentDigest: catalogbuild.ContentDigestOf(body, versions),
		Status:        "active",
		Files:         files,
	}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	pointer := catalogbuild.CurrentPointer{
		SchemaVersion:  catalogbuild.CurrentPointerSchemaVersion,
		ReleaseID:      "rel-probe",
		Sequence:       1,
		ManifestDigest: domain.ComputeBytesDigest(manifestBytes),
	}
	pointerBytes, err := json.Marshal(pointer)
	if err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/v1/current.json":
			_, _ = w.Write(pointerBytes)
		case strings.HasSuffix(r.URL.Path, ".sigstore.json"):
			w.WriteHeader(http.StatusNotFound)
		case strings.HasSuffix(r.URL.Path, "manifest.json"):
			_, _ = w.Write(manifestBytes)
		case strings.HasSuffix(r.URL.Path, "victim.txt"):
			_, _ = w.Write(body)
		case strings.HasSuffix(r.URL.Path, "versions.json"):
			_, _ = w.Write(versions)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	victim := filepath.Join(tmpRoot, "victim.txt")
	if err := os.WriteFile(victim, []byte("ORIGINAL-USER-DATA"), 0o644); err != nil {
		t.Fatal(err)
	}

	client := NewClient(srv.URL, cacheDir, srv.Client())
	if _, err := client.Sync(context.Background()); err == nil {
		t.Fatal("Sync accepted a manifest with a traversing shard name")
	} else if !strings.Contains(err.Error(), "not a valid shard name") {
		t.Errorf("refusal must name the invalid shard name, got: %v", err)
	}

	data, err := os.ReadFile(victim)
	if err != nil {
		t.Fatalf("read victim: %v", err)
	}
	if string(data) != "ORIGINAL-USER-DATA" {
		t.Fatalf("a file outside the cache directory was overwritten: %q", string(data))
	}
}
