package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/domain"
)

type fakeCatalog struct{ listings []*domain.Listing }

func (f *fakeCatalog) Count() int { return len(f.listings) }

func (f *fakeCatalog) GetListing(id string) (*domain.Listing, error) {
	for _, l := range f.listings {
		if l.ID == id {
			return l, nil
		}
	}
	return nil, fmt.Errorf("not found")
}

func (f *fakeCatalog) Search(q string, opts catalog.SearchOptions) []*catalog.SearchResult {
	var out []*catalog.SearchResult
	for _, l := range f.listings {
		if opts.Kind != "" && l.Kind != opts.Kind {
			continue
		}
		if q != "" && !strings.Contains(strings.ToLower(l.Name), strings.ToLower(q)) {
			continue
		}
		out = append(out, &catalog.SearchResult{Listing: l, Score: 1})
	}
	return out
}

func listing(id, name string, kind domain.ListingKind, inst domain.Installability) *domain.Listing {
	return &domain.Listing{ID: id, Name: name, Kind: kind, Installability: inst, Status: domain.ListingStatusActive}
}

// Installable rows lead a search, metadata-only rows follow with a reason,
// and an installed row carries its install id and is removable.
func TestMarketplaceRowsRankingAndInstalledMerge(t *testing.T) {
	cat := &fakeCatalog{listings: []*domain.Listing{
		listing("mcp:dir:github", "GitHub", domain.KindMCP, domain.InstallabilityDiscoveryOnly),
		listing("mcp:reg:github", "GitHub", domain.KindMCP, domain.InstallabilityMetadataVerified),
		listing("skill:x:github", "GitHub helper", domain.KindSkill, domain.InstallabilityMetadataVerified),
	}}
	records := []inventoryRecord{{ID: "skill:x:github", Kind: "skill", Agent: "pi-agent", State: "managed", InstallID: "inst_1"}}
	doc := buildMarketplaceRows(cat, records, marketplaceRowsOptions{query: "github", host: "pi-agent", limit: 10})

	if doc.Schema != marketplaceRowsSchema || len(doc.Rows) != 3 {
		t.Fatalf("doc: %+v", doc)
	}
	got := []string{doc.Rows[0].ID, doc.Rows[1].ID, doc.Rows[2].ID}
	want := []string{"skill:x:github", "mcp:reg:github", "mcp:dir:github"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("order %v, want %v (installed here, installable, metadata-only)", got, want)
	}
	if r := doc.Rows[0]; !r.InstalledHere || !r.Removable || r.InstallID != "inst_1" {
		t.Fatalf("installed row not merged: %+v", r)
	}
	if r := doc.Rows[2]; r.Installable || r.Reason == "" {
		t.Fatalf("metadata-only row must say why it cannot install: %+v", r)
	}
	if strings.Join(doc.Commands.Install, " ") != "install --host pi-agent" {
		t.Fatalf("install verb: %v", doc.Commands.Install)
	}
	if doc.Counts["mcp"] != 2 || doc.Counts["skill"] != 1 || doc.Counts["installed"] != 1 {
		t.Fatalf("counts: %v", doc.Counts)
	}
}

// An empty query starts from the curated picks and hides metadata-only rows.
func TestMarketplaceRowsEmptyQueryStartsWithFeatured(t *testing.T) {
	cat := &fakeCatalog{listings: []*domain.Listing{
		listing("mcp:a:aaa", "$AAA first alphabetically", domain.KindMCP, domain.InstallabilityMetadataVerified),
		listing("mcp:a:meta", "Meta only", domain.KindMCP, domain.InstallabilityDiscoveryOnly),
		listing(marketplaceFeaturedIDs[0], "GitHub", domain.KindMCP, domain.InstallabilityMetadataVerified),
	}}
	doc := buildMarketplaceRows(cat, nil, marketplaceRowsOptions{limit: 10})
	if len(doc.Rows) != 2 || doc.Rows[0].ID != marketplaceFeaturedIDs[0] {
		t.Fatalf("rows: %+v", doc.Rows)
	}
}

// The installed tab lists inventory rows, including observed ones, which are
// shown but never offered for removal.
func TestMarketplaceRowsInstalledTab(t *testing.T) {
	cat := &fakeCatalog{}
	records := []inventoryRecord{
		{ID: "observed:claude-code:mine", Name: "mine", Kind: "mcp", Agent: "claude-code", State: "observed"},
		{ID: "skill:x:y", Name: "y", Kind: "skill", Agent: "claude-code", State: "managed", InstallID: "inst_y"},
	}
	doc := buildMarketplaceRows(cat, records, marketplaceRowsOptions{kind: "installed", host: "claude-code", limit: 10})
	if len(doc.Rows) != 2 {
		t.Fatalf("rows: %+v", doc.Rows)
	}
	for _, r := range doc.Rows {
		if r.ID == "observed:claude-code:mine" && (r.Removable || r.Reason == "") {
			t.Fatalf("observed row must be read-only with a reason: %+v", r)
		}
		if r.ID == "skill:x:y" && !r.Removable {
			t.Fatalf("managed row must be removable: %+v", r)
		}
	}
}

// The popup's starting view and the site's home shelf are the same twelve.
func TestMarketplaceFeaturedMatchesSite(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "web", "data", "featured.json"))
	if err != nil {
		t.Skipf("web/data/featured.json not available: %v", err)
	}
	var doc struct {
		Entries []struct {
			ID string `json:"id"`
		} `json:"entries"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, e := range doc.Entries {
		ids = append(ids, e.ID)
	}
	if strings.Join(ids, "\n") != strings.Join(marketplaceFeaturedIDs, "\n") {
		t.Fatalf("marketplaceFeaturedIDs drifted from web/data/featured.json:\nsite: %v\ncli:  %v", ids, marketplaceFeaturedIDs)
	}
}

func TestMarketplaceRowsArgs(t *testing.T) {
	o, err := parseMarketplaceRowsArgs([]string{"git", "hub", "--agent", "opencode", "--kind", "skills", "--limit", "5", "--json"})
	if err != nil || o.query != "git hub" || o.host != "opencode" || o.kind != "skill" || o.limit != 5 || !o.jsonOut {
		t.Fatalf("parsed %+v err=%v", o, err)
	}
	for _, bad := range [][]string{{"--kind", "hooks"}, {"--limit", "0"}, {"--bogus"}, {"a", "--query", "b"}} {
		if _, err := parseMarketplaceRowsArgs(bad); err == nil {
			t.Errorf("%v accepted", bad)
		}
	}
}
