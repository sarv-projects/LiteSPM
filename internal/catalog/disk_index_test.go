package catalog

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/catalogbuild"
	"github.com/sarv-projects/litespm/internal/domain"
)

// fakeRelease writes the minimum cache layout an index is anchored to: a
// pointer and a manifest naming no shards.
func fakeRelease(t *testing.T, cacheDir string) *catalogbuild.CurrentPointer {
	t.Helper()
	dir := filepath.Join(cacheDir, "v1", "releases", "rel-test-idx")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := []byte(`{"releaseId":"rel-test-idx","files":{}}`)
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), manifest, 0o644); err != nil {
		t.Fatal(err)
	}
	return &catalogbuild.CurrentPointer{
		SchemaVersion:  catalogbuild.CurrentPointerSchemaVersion,
		ReleaseID:      "rel-test-idx",
		Sequence:       7,
		ManifestDigest: domain.ComputeBytesDigest(manifest),
	}
}

func parityListings() []*domain.Listing {
	mk := func(id, name, title, summary string, kind domain.ListingKind, cats, kws []string, level string) *domain.Listing {
		l := &domain.Listing{ID: id, Name: name, Title: title, Summary: summary, Kind: kind,
			Categories: cats, Keywords: kws, Status: domain.ListingStatusActive}
		l.VerificationSummary.Level = level
		return l
	}
	out := []*domain.Listing{
		mk("mcp:a:github", "GitHub", "GitHub MCP", "Repos, issues and PRs", domain.KindMCP, []string{"Developer Tools"}, []string{"git", "vcs"}, "signature_verified"),
		mk("mcp:b:github", "GitHub", "", "Another GitHub server", domain.KindMCP, nil, nil, ""),
		mk("mcp:c:mongo", "Mongo", "MongoDB", "Document database", domain.KindMCP, []string{"Databases"}, []string{"nosql"}, "security_audited"),
		mk("skill:x:go-style", "Go Style", "", "Idiomatic Go review", domain.KindSkill, []string{"Code Review"}, []string{"golang"}, ""),
		mk("plugin:p:pdf", "pdf", "PDF tools", "Read and write PDF files", domain.KindPlugin, []string{"Documents"}, nil, ""),
		mk("skill:x:pdf", "PDF", "", "Use this skill for PDFs", domain.KindSkill, []string{"Documents"}, []string{"pdf"}, ""),
		mk("mcp:u:café", "Café Menü", "", "Unicode naïve résumé", domain.KindMCP, []string{"Ünïcode"}, nil, ""),
	}
	for i := 0; i < 40; i++ {
		out = append(out, mk(fmt.Sprintf("mcp:gen:%02d", i), fmt.Sprintf("Server %02d", i), "", "generic postgres helper", domain.KindMCP, []string{"Databases"}, nil, ""))
	}
	inactive := mk("mcp:old:github", "GitHub Legacy", "", "deprecated", domain.KindMCP, nil, nil, "")
	inactive.Status = "deprecated"
	return append(out, inactive)
}

// The disk index must return exactly what the in-memory index returns, for
// every query shape: empty, short tokens (no trigram), multi-token, exact
// id/name, prefix, unicode, kind/category/status filters and limits.
func TestDiskIndexMatchesInMemorySearch(t *testing.T) {
	cacheDir := t.TempDir()
	current := fakeRelease(t, cacheDir)
	listings := parityListings()
	versions := []*domain.VersionRecord{
		{ListingID: "mcp:a:github", Version: "1.9.0"},
		{ListingID: "mcp:a:github", Version: "1.10.0"},
		{ListingID: "mcp:a:github", Version: "not-semver"},
	}
	disk, err := buildDiskIndex(cacheDir, current, listings, versions)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	mem := NewSearchIndex()
	mem.Replace(listings, versions)

	cases := []struct {
		q    string
		opts SearchOptions
	}{
		{"", SearchOptions{}},
		{"", SearchOptions{Limit: 100}},
		{"github", SearchOptions{}},
		{"GitHub", SearchOptions{Limit: 1}},
		{"ithu", SearchOptions{}},
		{"go", SearchOptions{}},
		{"go review", SearchOptions{}},
		{"mcp:a:github", SearchOptions{}},
		{"pdf", SearchOptions{}},
		{"pdf", SearchOptions{Kind: domain.KindSkill}},
		{"postgres", SearchOptions{Limit: 100}},
		{"database", SearchOptions{Category: "databases", Limit: 100}},
		{"db", SearchOptions{}},
		{"café", SearchOptions{}},
		{"ünïcode", SearchOptions{}},
		{"github", SearchOptions{Status: "deprecated"}},
		{"nothing-matches-this", SearchOptions{}},
		{"---", SearchOptions{}},
		{`quote"inside`, SearchOptions{}},
	}
	for _, tc := range cases {
		want := mem.Search(tc.q, tc.opts)
		got, err := disk.search(tc.q, tc.opts)
		if err != nil {
			t.Fatalf("%q %+v: %v", tc.q, tc.opts, err)
		}
		if len(got) != len(want) {
			t.Fatalf("%q %+v: %d results, memory has %d", tc.q, tc.opts, len(got), len(want))
		}
		for i := range want {
			if got[i].Listing.ID != want[i].Listing.ID || got[i].Score != want[i].Score ||
				!reflect.DeepEqual(got[i].MatchedFields, want[i].MatchedFields) {
				t.Fatalf("%q %+v: row %d disk=%s/%v/%v memory=%s/%v/%v", tc.q, tc.opts, i,
					got[i].Listing.ID, got[i].Score, got[i].MatchedFields,
					want[i].Listing.ID, want[i].Score, want[i].MatchedFields)
			}
		}
	}

	l, ok, err := disk.get("mcp:c:mongo")
	if err != nil || !ok || l.Name != "Mongo" || l.VerificationSummary.Level != "security_audited" {
		t.Fatalf("get: %+v %v %v", l, ok, err)
	}
	if _, ok, _ := disk.get("missing"); ok {
		t.Fatal("get found a missing id")
	}
	recs, err := disk.versionRecords("mcp:a:github")
	if err != nil || len(recs) != 3 || recs[0].Version != "1.10.0" || recs[2].Version != "not-semver" {
		t.Fatalf("version order: %+v %v", recs, err)
	}
	if disk.count != len(listings) {
		t.Fatalf("count %d want %d", disk.count, len(listings))
	}
}

// A second client opens the index directly, without parsing the release.
func TestClientReopensTheDiskIndexWithoutAFullLoad(t *testing.T) {
	compiled := compileSampleRelease(t, "rel-2026-10-05-01", 1)
	server := serveFiles(t, compiled.Files)
	defer server.Close()
	cacheDir := t.TempDir()
	client := NewClient(server.URL, cacheDir, server.Client())
	if _, err := client.Sync(context.Background()); err != nil {
		t.Fatalf("Sync: %v", err)
	}
	if client.diskOrNil() == nil {
		t.Fatal("Sync did not build the disk index")
	}
	want := client.Search("postgres", SearchOptions{})

	offline := NewClient("http://127.0.0.1:1", cacheDir, nil)
	if offline.diskOrNil() == nil {
		t.Fatal("a second client did not open the disk index")
	}
	if offline.index.Count() != 0 {
		t.Fatal("the release was parsed into memory although the index was usable")
	}
	got := offline.Search("postgres", SearchOptions{})
	if len(got) == 0 || len(got) != len(want) || got[0].Listing.ID != want[0].Listing.ID {
		t.Fatalf("reopened search %v, want %v", ids(got), ids(want))
	}
}

// An index file that no longer matches its release is never served: the
// client goes back to the verified full load.
func TestTamperedIndexFileIsNotServed(t *testing.T) {
	compiled := compileSampleRelease(t, "rel-2026-10-05-01", 1)
	server := serveFiles(t, compiled.Files)
	defer server.Close()
	cacheDir := t.TempDir()
	client := NewClient(server.URL, cacheDir, server.Client())
	if _, err := client.Sync(context.Background()); err != nil {
		t.Fatalf("Sync: %v", err)
	}
	client.detachDisk()
	entries, _ := os.ReadDir(diskIndexDir(cacheDir))
	if len(entries) != 1 {
		t.Fatalf("index files: %v", entries)
	}
	path := filepath.Join(diskIndexDir(cacheDir), entries[0].Name())
	if err := os.WriteFile(path, []byte("not a database"), 0o644); err != nil {
		t.Fatal(err)
	}
	offline := NewClient("http://127.0.0.1:1", cacheDir, nil)
	// The garbage file was refused; the verified shards were loaded instead
	// (and a correct index rebuilt beside it).
	if got := offline.Search("postgres", SearchOptions{}); len(got) == 0 {
		t.Fatal("a corrupt index made the catalog unusable")
	}
}

func ids(rs []*SearchResult) string {
	var out []string
	for _, r := range rs {
		out = append(out, r.Listing.ID)
	}
	return strings.Join(out, ",")
}

// A long-lived client (the daemon) picks up a release another process synced,
// without a restart and without parsing it.
func TestLongLivedClientPicksUpANewRelease(t *testing.T) {
	first := compileSampleRelease(t, "rel-2026-10-05-01", 1)
	server := serveFiles(t, first.Files)
	cacheDir := t.TempDir()
	syncer := NewClient(server.URL, cacheDir, server.Client())
	if _, err := syncer.Sync(context.Background()); err != nil {
		t.Fatalf("Sync 1: %v", err)
	}
	server.Close()

	daemon := NewClient("http://127.0.0.1:1", cacheDir, nil)
	if daemon.diskOrNil() == nil || daemon.currentReleaseID != "rel-2026-10-05-01" {
		t.Fatal("daemon did not open the first release's index")
	}

	second := compileSampleRelease(t, "rel-2026-10-06-01", 2)
	server2 := serveFiles(t, second.Files)
	defer server2.Close()
	syncer2 := NewClient(server2.URL, cacheDir, server2.Client())
	if _, err := syncer2.Sync(context.Background()); err != nil {
		t.Fatalf("Sync 2: %v", err)
	}

	// Force the periodic pointer check.
	daemon.mu.Lock()
	daemon.pointerCheckedAt = time.Time{}
	daemon.pointerMod = time.Time{}
	daemon.mu.Unlock()
	_ = daemon.Search("postgres", SearchOptions{})
	if daemon.currentReleaseID != "rel-2026-10-06-01" {
		t.Fatalf("daemon still on %s", daemon.currentReleaseID)
	}
	if daemon.index.Count() != 0 {
		t.Fatal("the new release was parsed into memory instead of opened from its index")
	}
}
