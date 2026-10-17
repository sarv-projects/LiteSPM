package catalogbuild

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/artifact"
	"github.com/sarv-projects/litespm/internal/domain"
)

// shardNamesFor lists a base name's files in a manifest, in shard order. The
// index is zero-padded, so sorting by name orders them by index.
func shardNamesFor(files map[string]ReleaseManifestFile, base string) []string {
	names := []string{}
	for name := range files {
		if name == base+".json" || strings.HasPrefix(name, base+"-") {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names
}

// shardBytesFor returns one base name's emitted bytes, in shard order.
func shardBytesFor(t *testing.T, output *BuildOutput, releaseID, base string) [][]byte {
	t.Helper()
	names := shardNamesFor(output.Manifest.Files, base)
	if len(names) == 0 {
		t.Fatalf("builder emitted no %s file (keys: %v)", base, sortedOutputKeys(output))
	}
	out := make([][]byte, 0, len(names))
	for _, name := range names {
		content, ok := output.Files[fmt.Sprintf("v1/releases/%s/%s", releaseID, name)]
		if !ok {
			t.Fatalf("manifest names %s but the builder did not emit it", name)
		}
		out = append(out, content)
	}
	return out
}

func concatBytes(shards [][]byte) []byte {
	var out []byte
	for _, shard := range shards {
		out = append(out, shard...)
	}
	return out
}

const validMCPRow = `{
	"id": "mcp:brave:brave-search-mcp-server",
	"kind": "mcp",
	"name": "brave-search-mcp-server",
	"slug": "brave-search-mcp-server",
	"summary": "Web search using Brave's Search API.",
	"category": "Search & Retrieval",
	"publisher": {"name": "brave", "url": "https://github.com/brave"},
	"transport": "stdio",
	"version": "1.0.0",
	"command": "npx",
	"args": ["-y", "brave-search-mcp-server-mcp"],
	"installability": "metadata_verified"
}`

const validSkillRow = `{
	"id": "skill:example:demo-skill",
	"kind": "skill",
	"name": "demo-skill",
	"slug": "demo-skill",
	"summary": "A demo skill",
	"category": "Dev Skills",
	"publisher": {"name": "example", "url": "https://example.com"},
	"version": "0.1.0",
	"skillSource": "https://example.com/demo",
	"installability": "metadata_verified"
}`

// TestParseDatasetRejectsMalformedRows pins the fail-closed contract: the
// generator normalizes ids to the domain grammar (canonical_id in
// scripts/build_full_catalog.py), so any violation here means producer and
// domain have drifted and the release must not build.
func TestParseDatasetRejectsMalformedRows(t *testing.T) {
	cases := []struct {
		name    string
		dataset string
		want    string
	}{
		{"empty dataset", `[]`, "contains no rows"},
		{"not json", `{"nope": true}`, "decode dataset"},
		{
			"id outside domain grammar (spaces)",
			`[{"id":"skill:community:agent trust hub","kind":"skill","name":"n","summary":"s","category":"c","publisher":{"name":"community"},"version":"1.0.0"}]`,
			"does not match the domain grammar",
		},
		{
			"id outside domain grammar (query junk)",
			`[{"id":"mcp:planetscale:cli?tab=readme-ov-file","kind":"mcp","name":"n","summary":"s","category":"c","publisher":{"name":"planetscale"},"transport":"stdio","version":"1.0.0","command":"x","args":[]}]`,
			"does not match the domain grammar",
		},
		{
			"id kind disagrees with row kind",
			`[{"id":"mcp:example:demo","kind":"skill","name":"n","summary":"s","category":"c","publisher":{"name":"e"},"version":"1.0.0"}]`,
			"disagrees with row kind",
		},
		{"duplicate id", `[` + validMCPRow + `,` + validMCPRow + `]`, "duplicate id"},
		{
			"missing name",
			`[{"id":"mcp:example:demo","kind":"mcp","name":"","summary":"s","category":"c","publisher":{"name":"e"},"transport":"stdio","version":"1.0.0","command":"x","args":[]}]`,
			"missing name",
		},
		{
			"discovery_only row with a guessed launch command",
			`[{"id":"mcp:example:demo","kind":"mcp","name":"n","summary":"s","category":"c","publisher":{"name":"e"},"transport":"stdio","version":"","command":"npx","args":[],"installability":"discovery_only"}]`,
			"commands must be proven",
		},
		{
			"discovery_only row with an unproven remote endpoint",
			`[{"id":"mcp:example:demo","kind":"mcp","name":"n","summary":"s","category":"c","publisher":{"name":"e"},"transport":"streamable-http","version":"","url":"https://mcp.example.com/mcp","installability":"discovery_only"}]`,
			"endpoints must be proven",
		},
		{
			"unknown installability",
			`[{"id":"mcp:example:demo","kind":"mcp","name":"n","summary":"s","category":"c","publisher":{"name":"e"},"installability":"trusted"}]`,
			"unknown installability",
		},
		{
			"missing version",
			`[{"id":"mcp:example:demo","kind":"mcp","name":"n","summary":"s","category":"c","publisher":{"name":"e"},"transport":"stdio","version":"","command":"x","args":[],"installability":"metadata_verified"}]`,
			"has no version",
		},
		{
			"mcp row without a launch line",
			`[{"id":"mcp:example:demo","kind":"mcp","name":"n","summary":"s","category":"c","publisher":{"name":"e"},"transport":"stdio","version":"1.0.0","command":"","args":[],"installability":"metadata_verified"}]`,
			"no launch line",
		},
		{
			"mcp row without transport",
			`[{"id":"mcp:example:demo","kind":"mcp","name":"n","summary":"s","category":"c","publisher":{"name":"e"},"transport":"","version":"1.0.0","command":"x","args":[],"installability":"metadata_verified"}]`,
			"no transport",
		},
		{
			"mcp endpoint row without transport",
			`[{"id":"mcp:example:demo","kind":"mcp","name":"n","summary":"s","category":"c","publisher":{"name":"e"},"transport":"","version":"2.0.0","url":"https://mcp.example.com/mcp","installability":"metadata_verified"}]`,
			"no transport",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseDataset([]byte(tc.dataset))
			if err == nil {
				t.Fatal("expected an error, got none")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error %q does not contain %q", err.Error(), tc.want)
			}
		})
	}
}

// TestDiscoveryOnlyRowsCarryNoInventedClaims pins Phase 0.1: a heuristic row
// with no proven version or launch line is accepted as searchable metadata,
// converts with installability discovery_only, no version, and no runtime.
// The zero value of the installability field is treated as discovery_only.
func TestDiscoveryOnlyRowsCarryNoInventedClaims(t *testing.T) {
	for _, explicit := range []string{`"installability":"discovery_only",`, ``} {
		raw := `[{` + explicit + `"id":"mcp:acme:widget","kind":"mcp","name":"widget","summary":"s","category":"c","publisher":{"name":"acme"}}]`
		rows, err := ParseDataset([]byte(raw))
		if err != nil {
			t.Fatalf("discovery-only row rejected: %v", err)
		}
		listings, versions, err := ConvertDataset(rows, "rel-1", "snap-1", time.Now().UTC())
		if err != nil {
			t.Fatalf("ConvertDataset: %v", err)
		}
		if listings[0].Installability != domain.InstallabilityDiscoveryOnly || listings[0].IsInstallable() {
			t.Errorf("installability = %q, want discovery_only and not installable", listings[0].Installability)
		}
		if len(listings[0].Versions) != 0 || versions[0].Version != "" {
			t.Errorf("a version was invented: %+v / %q", listings[0].Versions, versions[0].Version)
		}
		for _, c := range versions[0].Components {
			if c.Runtime != nil {
				t.Errorf("a runtime was invented: %+v", c.Runtime)
			}
		}
	}
}

func TestParseDatasetAcceptsValidRows(t *testing.T) {
	rows, err := ParseDataset([]byte(`[` + validMCPRow + `,` + validSkillRow + `]`))
	if err != nil {
		t.Fatalf("valid dataset rejected: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
}

// TestRemoteEndpointRows pins the remote (URL) MCP catalog data path (B1
// Phase 1): a row whose launch line is the publisher's own remotes[] endpoint
// parses above discovery_only, converts to a RuntimeDescriptor carrying
// Endpoint and no Command, keeps the published version in the listing and the
// version record, and is installable -- while the fail-closed rules still
// refuse an endpoint on a discovery_only row, an endpoint without transport,
// and a verified row with neither launch line. Existing stdio rows are
// unaffected, and a row carrying both command and endpoint launches the
// command (stdio wins; the endpoint is unused).
func TestRemoteEndpointRows(t *testing.T) {
	// The producer's shape for a remote row: command/args are null (never
	// invented) and the sanitized endpoint rides in url + transport.
	const remoteRow = `{
		"id": "mcp:builtin:mcp-registry:acme-remote",
		"kind": "mcp",
		"name": "acme-remote",
		"slug": "acme-remote",
		"summary": "Acme's hosted MCP endpoint.",
		"category": "Developer Tools",
		"publisher": {"name": "acme", "url": "https://acme.example"},
		"source": "builtin:mcp-registry",
		"transport": "streamable-http",
		"version": "2.1.0",
		"url": "https://mcp.acme.example/mcp",
		"command": null,
		"args": null,
		"installability": "metadata_verified"
	}`
	const discoveryEndpointRow = `{
		"id": "mcp:builtin:mcp-registry:acme-unproven",
		"kind": "mcp",
		"name": "acme-unproven",
		"summary": "s",
		"category": "c",
		"publisher": {"name": "acme"},
		"transport": "streamable-http",
		"url": "https://mcp.acme.example/mcp",
		"installability": "discovery_only"
	}`
	const endpointWithoutTransport = `{
		"id": "mcp:builtin:mcp-registry:acme-bare-endpoint",
		"kind": "mcp",
		"name": "acme-bare-endpoint",
		"summary": "s",
		"category": "c",
		"publisher": {"name": "acme"},
		"transport": "",
		"version": "2.1.0",
		"url": "https://mcp.acme.example/mcp",
		"installability": "metadata_verified"
	}`
	const verifiedWithoutLaunchLine = `{
		"id": "mcp:builtin:mcp-registry:acme-nothing",
		"kind": "mcp",
		"name": "acme-nothing",
		"summary": "s",
		"category": "c",
		"publisher": {"name": "acme"},
		"transport": "stdio",
		"version": "2.1.0",
		"command": "",
		"installability": "metadata_verified"
	}`
	const bothCommandAndEndpoint = `{
		"id": "mcp:builtin:mcp-registry:acme-both",
		"kind": "mcp",
		"name": "acme-both",
		"summary": "s",
		"category": "c",
		"publisher": {"name": "acme"},
		"transport": "stdio",
		"version": "1.0.0",
		"url": "https://mcp.acme.example/mcp",
		"command": "npx",
		"args": ["-y", "acme-mcp"],
		"installability": "metadata_verified"
	}`

	cases := []struct {
		name    string
		dataset string
		wantErr string // empty: the row must parse
		check   func(t *testing.T, listing *domain.Listing, version *domain.VersionRecord)
	}{
		{
			name:    "remote endpoint row parses and converts",
			dataset: remoteRow,
			check: func(t *testing.T, listing *domain.Listing, version *domain.VersionRecord) {
				if !listing.IsInstallable() {
					t.Errorf("installability = %q, want above discovery_only", listing.Installability)
				}
				if len(listing.Versions) != 1 || listing.Versions[0].Version != "2.1.0" {
					t.Errorf("listing Versions = %+v, want the published version 2.1.0", listing.Versions)
				}
				if version.Version != "2.1.0" {
					t.Errorf("version record version = %q, want 2.1.0", version.Version)
				}
				if len(version.Components) != 1 {
					t.Fatalf("components = %+v, want one", version.Components)
				}
				rt := version.Components[0].Runtime
				if rt == nil {
					t.Fatal("remote row converted with no runtime descriptor")
				}
				if rt.Endpoint != "https://mcp.acme.example/mcp" {
					t.Errorf("runtime endpoint = %q, want the published URL", rt.Endpoint)
				}
				if rt.Type != "streamable-http" {
					t.Errorf("runtime type = %q, want the published transport", rt.Type)
				}
				if rt.Command != "" || len(rt.Args) != 0 {
					t.Errorf("a command was invented for an endpoint row: %+v", rt)
				}
			},
		},
		{
			name:    "stdio row unchanged (regression)",
			dataset: validMCPRow,
			check: func(t *testing.T, listing *domain.Listing, version *domain.VersionRecord) {
				if !listing.IsInstallable() {
					t.Errorf("installability = %q, want above discovery_only", listing.Installability)
				}
				rt := version.Components[0].Runtime
				if rt == nil || rt.Command != "npx" || rt.Type != "stdio" || rt.Endpoint != "" {
					t.Errorf("stdio runtime changed: %+v", rt)
				}
			},
		},
		{
			name:    "stdio wins when both command and endpoint are present",
			dataset: bothCommandAndEndpoint,
			check: func(t *testing.T, listing *domain.Listing, version *domain.VersionRecord) {
				rt := version.Components[0].Runtime
				if rt == nil || rt.Command != "npx" || rt.Type != "stdio" {
					t.Fatalf("stdio runtime not used: %+v", rt)
				}
				if rt.Endpoint != "" {
					t.Errorf("endpoint %q must not reach the runtime when a command wins", rt.Endpoint)
				}
			},
		},
		{
			name:    "discovery_only row carrying an endpoint is rejected",
			dataset: discoveryEndpointRow,
			wantErr: "endpoints must be proven",
		},
		{
			name:    "endpoint row without transport is rejected",
			dataset: endpointWithoutTransport,
			wantErr: "no transport",
		},
		{
			name:    "verified row with neither command nor endpoint is rejected",
			dataset: verifiedWithoutLaunchLine,
			wantErr: "no launch line",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rows, err := ParseDataset([]byte(`[` + tc.dataset + `]`))
			if tc.wantErr != "" {
				if err == nil {
					t.Fatal("expected an error, got none")
				}
				if !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("error %q does not contain %q", err.Error(), tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("ParseDataset: %v", err)
			}
			listings, versions, err := ConvertDataset(rows, "rel-1", "snap-1", time.Now().UTC())
			if err != nil {
				t.Fatalf("ConvertDataset: %v", err)
			}
			tc.check(t, listings[0], versions[0])
		})
	}
}

// TestConvertDatasetClaimsAreHonest pins every claim the converter is allowed
// to write: schema version, active status, "unverified" verification (the
// dataset carries no audit evidence), provenance pointing at the snapshot and
// release, and component support levels that do not overclaim the install path.
func TestConvertDatasetClaimsAreHonest(t *testing.T) {
	rows, err := ParseDataset([]byte(`[` + validMCPRow + `,` + validSkillRow + `]`))
	if err != nil {
		t.Fatalf("ParseDataset: %v", err)
	}

	ingestedAt := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	listings, versions, err := ConvertDataset(rows, "rel-2026-10-05-01", "snap-deadbeef", ingestedAt)
	if err != nil {
		t.Fatalf("ConvertDataset: %v", err)
	}
	if len(listings) != 2 || len(versions) != 2 {
		t.Fatalf("expected 2 listings and 2 versions, got %d and %d", len(listings), len(versions))
	}

	for i, listing := range listings {
		row := rows[i]
		if listing.ID != row.ID {
			t.Errorf("listing %d: id %q != row id %q", i, listing.ID, row.ID)
		}
		if listing.SchemaVersion != 1 {
			t.Errorf("listing %s: schemaVersion %d, want 1", listing.ID, listing.SchemaVersion)
		}
		if listing.Status != domain.ListingStatusActive {
			t.Errorf("listing %s: status %q, want active", listing.ID, listing.Status)
		}
		if listing.VerificationSummary.Level != "unverified" {
			t.Errorf("listing %s: verification %q, want unverified (dataset carries no audit evidence)",
				listing.ID, listing.VerificationSummary.Level)
		}
		if listing.Provenance.SourceSnapshotID != "" ||
			listing.Provenance.CatalogReleaseID != "rel-2026-10-05-01" ||
			!listing.Provenance.IngestedAt.Equal(ingestedAt) {
			t.Errorf("listing %s: provenance not stamped: %+v", listing.ID, listing.Provenance)
		}
		if row.Version != "" && (len(listing.Versions) != 1 || listing.Versions[0].Version != row.Version) {
			t.Errorf("listing %s: versions %+v do not carry dataset version %q", listing.ID, listing.Versions, row.Version)
		}
		// The dataset's popularity figure is deliberately null; nothing may
		// invent one downstream. The domain model must not grow a field for it.
		if _, err := json.Marshal(listing); err != nil {
			t.Errorf("listing %s: marshal: %v", listing.ID, err)
		}
	}

	// MCP launch line preserved, but support is NOT claimed: installing a
	// catalog-sourced MCP server is not wired yet (STATUS.md install row).
	mcpListing, mcpVersion := listings[0], versions[0]
	if len(mcpListing.ComponentsSummary) != 1 || mcpListing.ComponentsSummary[0].Kind != domain.ComponentMCPProvider {
		t.Errorf("mcp components summary: %+v", mcpListing.ComponentsSummary)
	}
	if len(mcpVersion.Components) != 1 {
		t.Fatalf("mcp version components: %+v", mcpVersion.Components)
	}
	mcpComponent := mcpVersion.Components[0]
	if mcpComponent.Runtime == nil {
		t.Fatal("mcp component has no runtime descriptor: launch line dropped")
	}
	if mcpComponent.Runtime.Command != "npx" || mcpComponent.Runtime.Type != "stdio" {
		t.Errorf("mcp runtime: %+v, want command npx / type stdio", mcpComponent.Runtime)
	}
	if mcpComponent.SupportedByLiteSPM != domain.SupportUnknown {
		t.Errorf("mcp support %q: catalog install path is not wired; must be unknown, not a claim",
			mcpComponent.SupportedByLiteSPM)
	}

	// Skill components are shipped today (skills lifecycle), so SupportYes is
	// honest for them.
	skillListing, skillVersion := listings[1], versions[1]
	if len(skillVersion.Components) != 1 || skillVersion.Components[0].SupportedByLiteSPM != domain.SupportYes {
		t.Errorf("skill component: %+v, want SupportYes", skillVersion.Components)
	}
	if len(skillListing.ComponentsSummary) != 1 || skillListing.ComponentsSummary[0].Kind != domain.ComponentSkill {
		t.Errorf("skill components summary: %+v", skillListing.ComponentsSummary)
	}

	// Version records must be complete arrays (never null) so the emitted
	// JSON satisfies schemas/version.schema.json.
	for _, v := range versions {
		if v.Artifacts == nil || v.Components == nil || v.Dependencies == nil ||
			v.Requirements == nil || v.PermissionsDeclared == nil ||
			v.CompatibilityClaims == nil || v.TestEvidence == nil {
			t.Errorf("version %s/%s has a null array field: %+v", v.ListingID, v.Version, v)
		}
		if v.SourceSnapshotID != "" || !v.FetchedAt.Equal(ingestedAt) {
			t.Errorf("version %s/%s provenance not stamped: %+v", v.ListingID, v.Version, v)
		}
	}
}

// TestDatasetPipelineAgainstRealCatalog runs the committed 5,814-row dataset
// through the exact validation and conversion a release build performs. If the
// generator ever regresses on id grammar (spaces, query junk, duplicates),
// this is the test that fails before any tree is published.
func TestDatasetPipelineAgainstRealCatalog(t *testing.T) {
	datasetPath := filepath.Join("..", "..", "web", "data", "catalog.json")
	raw, err := os.ReadFile(datasetPath)
	if err != nil {
		t.Fatalf("read committed dataset %s: %v", datasetPath, err)
	}

	var control []json.RawMessage
	if err := json.Unmarshal(raw, &control); err != nil {
		t.Fatalf("decode dataset for independent row count: %v", err)
	}

	// K002 provenance contract: every emitted row carries the
	// domain.SourceID it was ingested from. A missing or grammar-invalid
	// `source` means the producer stopped stamping provenance, and the
	// dataset must not build silently without it.
	var provenance []struct {
		ID     string `json:"id"`
		Source string `json:"source"`
	}
	if err := json.Unmarshal(raw, &provenance); err != nil {
		t.Fatalf("decode dataset for per-row source provenance: %v", err)
	}
	if len(provenance) != len(control) {
		t.Fatalf("decoded %d provenance rows but dataset has %d", len(provenance), len(control))
	}
	for i, r := range provenance {
		if _, err := domain.ParseSourceID(r.Source); err != nil {
			t.Fatalf("row %d (%s): missing or invalid source %q: %v", i, r.ID, r.Source, err)
		}
	}

	rows, err := ParseDataset(raw)
	if err != nil {
		t.Fatalf("committed dataset failed validation: %v", err)
	}
	if len(rows) != len(control) {
		t.Fatalf("validated %d rows but dataset has %d", len(rows), len(control))
	}
	if len(rows) < 5000 {
		t.Fatalf("dataset has only %d rows: expected thousands (truncated dataset?)", len(rows))
	}

	ingestedAt := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)
	snapshotID := DatasetSnapshotID(raw)
	listings, versions, err := ConvertDataset(rows, "rel-2026-10-05-01", snapshotID, ingestedAt)
	if err != nil {
		t.Fatalf("ConvertDataset: %v", err)
	}
	if len(listings) != len(rows) || len(versions) != len(rows) {
		t.Fatalf("converted %d listings / %d versions for %d rows", len(listings), len(versions), len(rows))
	}

	seen := make(map[string]bool, len(listings))
	for i, listing := range listings {
		row := rows[i]
		if seen[listing.ID] {
			t.Fatalf("duplicate listing id %q", listing.ID)
		}
		seen[listing.ID] = true
		if listing.ID != row.ID || string(listing.Kind) != row.Kind {
			t.Fatalf("row %d: listing id/kind %q/%q != dataset %q/%q", i, listing.ID, listing.Kind, row.ID, row.Kind)
		}
		if listing.Status != domain.ListingStatusActive ||
			listing.VerificationSummary.Level != "unverified" ||
			listing.Provenance.SourceSnapshotID != "" {
			t.Fatalf("listing %s: dishonest or unstamped claim: status=%q verification=%q provenance=%+v",
				listing.ID, listing.Status, listing.VerificationSummary.Level, listing.Provenance)
		}
		if versions[i].ListingID != row.ID {
			t.Fatalf("version record %d names %q, want %q", i, versions[i].ListingID, row.ID)
		}
	}

	// The whole corpus must compile into a release tree — the real build's
	// first stage — and the compiled listings must round-trip at full count.
	// At real-catalog magnitude that tree is SHARDED: no single file may exceed
	// the 25 MiB per-asset limit a static CDN enforces, and every shard must be
	// a complete array the client can decode on its own.
	output, err := CompileRelease("rel-2026-10-05-01", 1, []string{snapshotID}, listings, versions, ingestedAt)
	if err != nil {
		t.Fatalf("CompileRelease over real dataset: %v", err)
	}
	listingShards := shardBytesFor(t, output, "rel-2026-10-05-01", "listings")
	versionShards := shardBytesFor(t, output, "rel-2026-10-05-01", "versions")
	var roundTrip []*domain.Listing
	for _, shard := range listingShards {
		if len(shard) > ReleaseShardMaxBytes {
			t.Fatalf("listings shard is %d bytes, over the %d-byte ceiling", len(shard), ReleaseShardMaxBytes)
		}
		var part []*domain.Listing
		if err := json.Unmarshal(shard, &part); err != nil {
			t.Fatalf("a compiled listings shard does not decode on its own: %v", err)
		}
		roundTrip = append(roundTrip, part...)
	}
	for _, shard := range versionShards {
		if len(shard) > ReleaseShardMaxBytes {
			t.Fatalf("versions shard is %d bytes, over the %d-byte ceiling", len(shard), ReleaseShardMaxBytes)
		}
	}
	if len(roundTrip) != len(rows) {
		t.Fatalf("compiled listings round-tripped %d of %d across %d shards", len(roundTrip), len(rows), len(listingShards))
	}
	if output.Manifest.ItemCount != len(rows) {
		t.Fatalf("manifest itemCount %d != %d", output.Manifest.ItemCount, len(rows))
	}
	// contentDigest is the digest of the release's CONTENT, however many files
	// that content was split across: the ordered concatenation of the shards.
	if actual := ContentDigestOf(concatBytes(listingShards), concatBytes(versionShards)); actual != output.Manifest.ContentDigest {
		t.Errorf("contentDigest %s != %s over the concatenated shards", output.Manifest.ContentDigest, actual)
	}

	// The compiled manifest must decode into its own Go types with sizes at
	// real-catalog magnitude (millions of bytes): RFC 8785 number formatting
	// once emitted scientific notation for exactly this case, which
	// encoding/json refuses to read into an int64 size field.
	manifestBytes, ok := output.Files["v1/releases/rel-2026-10-05-01/manifest.json"]
	if !ok {
		t.Fatalf("builder did not emit manifest.json (keys: %v)", sortedOutputKeys(output))
	}
	var manifest ReleaseManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatalf("compiled manifest does not decode into ReleaseManifest: %v", err)
	}
	// Every shard is a manifest entry like any other file, so anything that
	// verifies a file verifies a shard without knowing the difference.
	for _, name := range shardNamesFor(manifest.Files, "listings") {
		entry, ok := manifest.Files[name]
		if !ok {
			t.Fatalf("compiled manifest has no %s entry", name)
		}
		actual := output.Files[fmt.Sprintf("v1/releases/rel-2026-10-05-01/%s", name)]
		if entry.Size != int64(len(actual)) {
			t.Errorf("manifest %s size %d != actual %d", name, entry.Size, len(actual))
		}
		if entry.Digest != domain.ComputeBytesDigest(actual) {
			t.Errorf("manifest %s digest %s != %s", name, entry.Digest, domain.ComputeBytesDigest(actual))
		}
	}
	totalShardBytes := 0
	for _, shard := range listingShards {
		totalShardBytes += len(shard)
	}
	if totalShardBytes < 1_000_000 {
		t.Errorf("listings total %d bytes: expected real-catalog magnitude to exercise large-size formatting", totalShardBytes)
	}
	if manifestDigest := domain.ComputeBytesDigest(manifestBytes); output.ManifestDigest != manifestDigest {
		t.Errorf("BuildOutput.ManifestDigest %s != digest of emitted manifest %s", output.ManifestDigest, manifestDigest)
	}
}

func TestDatasetSnapshotIDContentAddressed(t *testing.T) {
	a := DatasetSnapshotID([]byte("one"))
	b := DatasetSnapshotID([]byte("one"))
	c := DatasetSnapshotID([]byte("two"))
	if a != b {
		t.Fatalf("identical bytes produced different snapshot ids: %q vs %q", a, b)
	}
	if a == c {
		t.Fatalf("different bytes produced the same snapshot id: %q", a)
	}
	if !strings.HasPrefix(a, "snap-") {
		t.Fatalf("snapshot id %q lacks snap- prefix", a)
	}
}

// TestVersionlessCommandlessVerifiedSkillRow pins the producer contract added
// with installability-research A1: a skill row may claim metadata_verified on
// the strength of a fetched SKILL.md alone -- no version, no launch command --
// because the skills lifecycle installs a plain directory. publisher.url
// carries the same GitHub source as skillSource (the producer sets both on
// promotion), so Source.URL resolves to the skill's git location for the
// installer's ParseSkillSource.
func TestVersionlessCommandlessVerifiedSkillRow(t *testing.T) {
	const dataset = `[{
		"id": "skill:volttagent-awesome-agent-skills:anthropics-docx",
		"kind": "skill",
		"name": "anthropics/docx",
		"slug": "anthropics-docx",
		"summary": "Create, edit, and extract text from DOCX files.",
		"category": "Documents",
		"publisher": {"name": "VoltAgent", "url": "https://github.com/anthropics/docx"},
		"source": "git:anthropics-skills",
		"skillSource": "https://github.com/anthropics/docx",
		"installability": "metadata_verified"
	}]`

	rows, err := ParseDataset([]byte(dataset))
	if err != nil {
		t.Fatalf("version-less verified skill row rejected: %v", err)
	}
	row := rows[0]
	if row.Version != "" || len(row.Args) != 0 {
		t.Errorf("version/args must stay empty: %q %v", row.Version, row.Args)
	}

	listings, versions, err := ConvertDataset(rows, "rel-1", "snap-1", time.Now().UTC())
	if err != nil {
		t.Fatalf("ConvertDataset: %v", err)
	}
	listing, version := listings[0], versions[0]

	if listing.Installability != domain.InstallabilityMetadataVerified || !listing.IsInstallable() {
		t.Errorf("installability = %q (installable=%v), want metadata_verified and installable",
			listing.Installability, listing.IsInstallable())
	}
	if len(listing.Versions) != 0 {
		t.Errorf("listing versions = %+v, want no version summaries (nothing upstream published one)", listing.Versions)
	}
	if version.Version != "" {
		t.Errorf("version record %q, want empty (honest absence)", version.Version)
	}
	if version.ListingID != listing.ID {
		t.Errorf("version record listing %q != %q", version.ListingID, listing.ID)
	}

	if got := listing.Source.URL; got != "https://github.com/anthropics/docx" {
		t.Errorf("Source.URL = %q, want the skillSource GitHub URL", got)
	}
	if got := listing.PublisherClaim.URL; got != listing.Source.URL {
		t.Errorf("publisher URL %q != source URL %q; promotion must set both", got, listing.Source.URL)
	}

	if len(version.Components) != 1 {
		t.Fatalf("components = %+v, want one skill component", version.Components)
	}
	component := version.Components[0]
	if component.Kind != domain.ComponentSkill || component.SupportedByLiteSPM != domain.SupportYes {
		t.Errorf("component = %+v, want a shipped skill component", component)
	}
	if component.Runtime != nil {
		t.Errorf("a runtime was invented for a skill row: %+v", component.Runtime)
	}
	// Component IDs embed a version; with none proven they must carry the
	// literal "discovery" marker rather than an invented release.
	if !strings.Contains(component.ID, "@discovery#") {
		t.Errorf("component id %q lacks the discovery version marker", component.ID)
	}
}

// artifactPluginRow builds a valid plugin dataset row carrying one descriptor
// object (or `null`). Plugin rows are where the producer transcribes the
// vendor manifest's own `source` since the 2026-10-17 change.
func artifactPluginRow(artifact string) string {
	return `[{
		"id": "plugin:example:demo-plugin",
		"kind": "plugin",
		"name": "demo-plugin",
		"slug": "example-demo-plugin",
		"summary": "s",
		"category": "Plugins & Toolkits",
		"publisher": {"name": "example", "url": "https://github.com/example/plugins"},
		"installability": "metadata_verified",
		"artifact": ` + artifact + `
	}]`
}

const artifactSHA = "0123456789abcdef0123456789abcdef01234567"

// TestParseDatasetRejectsInconsistentArtifactDescriptors pins the fail-closed
// artifact validation: a descriptor whose claims cannot all be true is
// producer/domain drift, and a release must not be built from it.
func TestParseDatasetRejectsInconsistentArtifactDescriptors(t *testing.T) {
	cases := []struct {
		name    string
		dataset string
		want    string
	}{
		{
			"unknown descriptor type",
			artifactPluginRow(`{"type":"tarball","declaredAs":"url","repo":"https://github.com/acme/plug","pinned":false}`),
			"unknown artifact type",
		},
		{
			"git-tree without a repository",
			artifactPluginRow(`{"type":"git-tree","declaredAs":"url","sha":"` + artifactSHA + `","pinned":true}`),
			"must name the repository",
		},
		{
			"local-dir without a directory",
			artifactPluginRow(`{"type":"local-dir","declaredAs":"local","repo":"https://github.com/acme/plug","pinned":false}`),
			"must name the directory",
		},
		{
			"local-dir without a repository",
			artifactPluginRow(`{"type":"local-dir","declaredAs":"local","path":"./plugins/x","pinned":false}`),
			"must name the repository",
		},
		{
			"pinned with a short sha",
			artifactPluginRow(`{"type":"git-tree","declaredAs":"url","repo":"https://github.com/acme/plug","sha":"abc1234","pinned":true}`),
			"full 40-hex",
		},
		{
			"pinned with no sha at all",
			artifactPluginRow(`{"type":"git-tree","declaredAs":"url","repo":"https://github.com/acme/plug","pinned":true}`),
			"full 40-hex",
		},
		{
			"pinned with an uppercase sha (the bar is lowercase)",
			artifactPluginRow(`{"type":"git-tree","declaredAs":"url","repo":"https://github.com/acme/plug","sha":"` + strings.Repeat("A", 40) + `","pinned":true}`),
			"full 40-hex",
		},
		{
			"a local directory cannot be pinned to a commit",
			artifactPluginRow(`{"type":"local-dir","declaredAs":"local","repo":"https://github.com/acme/plug","path":"./plugins/x","sha":"` + artifactSHA + `","pinned":true}`),
			"only a git tree can be pinned",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseDataset([]byte(tc.dataset))
			if err == nil {
				t.Fatal("expected an error, got none")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error %q does not contain %q", err.Error(), tc.want)
			}
		})
	}
}

// TestArtifactDescriptorBecomesOneArtifactRef pins the mapping field by field
// for every shape the seven manifests publish, including the two rules that
// keep the mapping honest: a mutable `ref` never lands in ImmutableRef, and a
// non-40-hex sha is transcribed as unpinned rather than silently upgraded.
func TestArtifactDescriptorBecomesOneArtifactRef(t *testing.T) {
	cases := []struct {
		name     string
		artifact string
		want     domain.ArtifactRef
	}{
		{
			"pinned git-tree",
			`{"type":"git-tree","declaredAs":"url","repo":"https://github.com/acme/plug.git","sha":"` + artifactSHA + `","pinned":true}`,
			domain.ArtifactRef{
				ArtifactID:   "art_plugin_example_demo-plugin",
				Type:         domain.ArtifactGitTree,
				Locator:      "https://github.com/acme/plug.git",
				ImmutableRef: artifactSHA,
				FetchPolicy:  domain.FetchImmutable,
			},
		},
		{
			"unpinned git-tree: ref and path carried, ref never an immutableRef",
			`{"type":"git-tree","declaredAs":"git-subdir","repo":"https://github.com/acme/mono.git","path":"plugins/demo","ref":"v1.2.3","pinned":false}`,
			domain.ArtifactRef{
				ArtifactID:  "art_plugin_example_demo-plugin",
				Type:        domain.ArtifactGitTree,
				Locator:     "https://github.com/acme/mono.git",
				Subpath:     "plugins/demo",
				FetchPolicy: domain.FetchHeadRef,
			},
		},
		{
			"local-dir: manifest spelling kept without the ./ prefix, local-only",
			`{"type":"local-dir","declaredAs":"relative-path","repo":"https://github.com/anthropics/skills","path":"./plugins/demo","pinned":false}`,
			domain.ArtifactRef{
				ArtifactID:  "art_plugin_example_demo-plugin",
				Type:        domain.ArtifactLocalDir,
				Locator:     "https://github.com/anthropics/skills",
				Subpath:     "plugins/demo",
				FetchPolicy: domain.FetchLocalOnly,
			},
		},
		{
			"short sha is transcribed verbatim and stays unpinned",
			`{"type":"git-tree","declaredAs":"url","repo":"https://github.com/acme/plug","sha":"abc1234","pinned":false}`,
			domain.ArtifactRef{
				ArtifactID:  "art_plugin_example_demo-plugin",
				Type:        domain.ArtifactGitTree,
				Locator:     "https://github.com/acme/plug",
				FetchPolicy: domain.FetchHeadRef,
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rows, err := ParseDataset([]byte(artifactPluginRow(tc.artifact)))
			if err != nil {
				t.Fatalf("descriptor rejected: %v", err)
			}
			_, versions, err := ConvertDataset(rows, "rel-1", "snap-1", time.Now().UTC())
			if err != nil {
				t.Fatalf("ConvertDataset: %v", err)
			}
			refs := versions[0].Artifacts
			if len(refs) != 1 {
				t.Fatalf("artifacts = %+v, want exactly one", refs)
			}
			if !reflect.DeepEqual(refs[0], tc.want) {
				t.Errorf("artifact = %+v\nwant        %+v", refs[0], tc.want)
			}
		})
	}
}

// TestPluginRowWithoutDescriptorKeepsEmptyArtifacts: absence is the honest
// answer, and the array stays non-nil so the emitted JSON satisfies
// schemas/version.schema.json.
func TestPluginRowWithoutDescriptorKeepsEmptyArtifacts(t *testing.T) {
	rows, err := ParseDataset([]byte(artifactPluginRow(`null`)))
	if err != nil {
		t.Fatalf("descriptor-less plugin row rejected: %v", err)
	}
	if rows[0].Artifact != nil {
		t.Fatalf("artifact = %+v, want nil", rows[0].Artifact)
	}
	_, versions, err := ConvertDataset(rows, "rel-1", "snap-1", time.Now().UTC())
	if err != nil {
		t.Fatalf("ConvertDataset: %v", err)
	}
	if versions[0].Artifacts == nil || len(versions[0].Artifacts) != 0 {
		t.Fatalf("artifacts = %#v, want an empty non-nil array", versions[0].Artifacts)
	}
}

// TestRealCatalogPluginArtifactsMapAndRemainUnfetchable runs the committed
// dataset through the same validation a release build performs and pins the
// plugin half of LPSM-D003: every transcribed descriptor becomes exactly one
// ArtifactRef, its pinning is carried faithfully, and NONE of them can be
// fetched by the only wired fetcher (HTTPArchiveFetcher supports archive/mcpb
// over HTTPS only) -- which is why every plugin install still fails closed
// with LPSM-ARTIFACT-UNAVAILABLE.
func TestRealCatalogPluginArtifactsMapAndRemainUnfetchable(t *testing.T) {
	datasetPath := filepath.Join("..", "..", "web", "data", "catalog.json")
	raw, err := os.ReadFile(datasetPath)
	if err != nil {
		t.Fatalf("read committed dataset %s: %v", datasetPath, err)
	}
	rows, err := ParseDataset(raw)
	if err != nil {
		t.Fatalf("committed dataset rejected: %v", err)
	}

	var fetcher artifact.HTTPArchiveFetcher
	pluginRows := 0
	withDescriptor := 0
	pinned := 0
	byType := map[domain.ArtifactType]int{}
	for i, row := range rows {
		if row.Kind != "plugin" {
			continue
		}
		pluginRows++
		if row.Artifact == nil {
			continue
		}
		withDescriptor++
		a := row.Artifact
		// The producer's pinning convention, checked on real data: pinned is
		// exactly "the sha clears the 40-hex lowercase bar". ParseDataset
		// enforces the forward direction; the reverse is a producer rule, and
		// this is where a regression in it shows up.
		if got := sha40.MatchString(a.SHA); got != a.Pinned {
			t.Errorf("row %d (%s): pinned=%v but sha %q clears the bar: %v", i, row.ID, a.Pinned, a.SHA, got)
		}

		refs := artifactRefsFor(row)
		if len(refs) != 1 {
			t.Fatalf("row %d (%s): artifacts = %+v, want exactly one per descriptor", i, row.ID, refs)
		}
		ref := refs[0]
		byType[ref.Type]++
		switch ref.Type {
		case domain.ArtifactGitTree:
			if ref.Locator == "" {
				t.Errorf("row %d (%s): git-tree artifact has no locator", i, row.ID)
			}
			if a.Pinned {
				pinned++
				if ref.ImmutableRef != a.SHA || ref.FetchPolicy != domain.FetchImmutable {
					t.Errorf("row %d (%s): pinned descriptor mapped to %+v", i, row.ID, ref)
				}
			} else if ref.ImmutableRef != "" || ref.FetchPolicy != domain.FetchHeadRef {
				t.Errorf("row %d (%s): unpinned descriptor mapped to %+v", i, row.ID, ref)
			}
		case domain.ArtifactLocalDir:
			if ref.Locator == "" {
				t.Errorf("row %d (%s): local-dir artifact has no locator", i, row.ID)
			}
			// Subpath is the manifest's own spelling minus a leading "./". An
			// entry at the repository root (the five askills rows spell it
			// "./") legitimately trims to "" — that is "the repo root", not a
			// missing value.
			if want := strings.TrimPrefix(strings.TrimSpace(a.Path), "./"); ref.Subpath != want {
				t.Errorf("row %d (%s): local-dir subpath %q, want the manifest's path %q", i, row.ID, ref.Subpath, want)
			}
			if ref.FetchPolicy != domain.FetchLocalOnly || ref.ImmutableRef != "" {
				t.Errorf("row %d (%s): local-dir descriptor mapped to %+v", i, row.ID, ref)
			}
		default:
			t.Errorf("row %d (%s): descriptor type %q outside the producer's vocabulary", i, row.ID, ref.Type)
		}
		if ref.Digest != "" || ref.Size != 0 || ref.MediaType != "" {
			t.Errorf("row %d (%s): digest/size/media type were invented: %+v", i, row.ID, ref)
		}
		if fetcher.Supports(ref) {
			t.Errorf("row %d (%s): the wired archive fetcher claims to support %+v; plugin installs must stay unfetchable",
				i, row.ID, ref)
		}
	}

	if pluginRows == 0 || withDescriptor == 0 {
		t.Fatalf("no plugin descriptor found in %s: plugin rows=%d, with descriptor=%d; the producer stopped carrying them",
			datasetPath, pluginRows, withDescriptor)
	}
	t.Logf("plugin rows: %d, with descriptor: %d, pinned: %d, by type: %v",
		pluginRows, withDescriptor, pinned, byType)
}

func sortedOutputKeys(b *BuildOutput) []string {
	keys := make([]string, 0, len(b.Files))
	for k := range b.Files {
		keys = append(keys, k)
	}
	return keys
}
