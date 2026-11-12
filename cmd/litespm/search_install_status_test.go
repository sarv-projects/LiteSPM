package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/domain"
)

func searchRow(id string, kind domain.ListingKind, inst domain.Installability) *catalog.SearchResult {
	return &catalog.SearchResult{Listing: &domain.Listing{ID: id, Name: id, Kind: kind, Installability: inst}}
}

func ids(rs []*catalog.SearchResult) []string {
	out := make([]string, len(rs))
	for i, r := range rs {
		out[i] = r.Listing.ID
	}
	return out
}

func TestPartitionInstallableIsStable(t *testing.T) {
	in := []*catalog.SearchResult{
		searchRow("a", domain.KindMCP, domain.InstallabilityDiscoveryOnly),
		searchRow("b", domain.KindSkill, domain.InstallabilityMetadataVerified),
		searchRow("c", domain.KindSkill, domain.InstallabilityDiscoveryOnly),
		searchRow("d", domain.KindMCP, domain.InstallabilityMetadataVerified),
	}
	if got := strings.Join(ids(partitionInstallable(in)), ","); got != "b,d,a,c" {
		t.Errorf("partition = %s, want b,d,a,c", got)
	}
	if got := strings.Join(ids(in), ","); got != "a,b,c,d" {
		t.Errorf("partition mutated its input: %s", got)
	}
	if got := strings.Join(ids(filterInstallable(in)), ","); got != "b,d" {
		t.Errorf("filter = %s, want b,d", got)
	}
}

func TestSearchQueryArgsInstallable(t *testing.T) {
	got, err := searchQueryArgs([]string{"postgres", "--installable", "--json"})
	if err != nil || !got.installable || !got.json || got.query != "postgres" {
		t.Errorf("got %+v, %v", got, err)
	}
}

func TestSearchGlyphsUnicode(t *testing.T) {
	env := func(m map[string]string) func(string) string { return func(k string) string { return m[k] } }
	cases := []struct {
		name string
		env  map[string]string
		goos string
		want bool
	}{
		{"utf8 locale", map[string]string{"LANG": "en_US.UTF-8"}, "linux", true},
		{"no_color wins", map[string]string{"LANG": "en_US.UTF-8", "NO_COLOR": "1"}, "linux", false},
		{"dumb", map[string]string{"LANG": "en_US.UTF-8", "TERM": "dumb"}, "linux", false},
		{"latin1", map[string]string{"LC_ALL": "C", "LANG": "en_US.UTF-8"}, "linux", false},
		{"no locale linux", nil, "linux", false},
		{"windows terminal", map[string]string{"WT_SESSION": "x"}, "windows", true},
		{"windows plain", nil, "windows", false},
	}
	for _, tc := range cases {
		if got := searchGlyphsUnicode(env(tc.env), tc.goos); got != tc.want {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestWriteSearchTableShowsStatus(t *testing.T) {
	rows := []*catalog.SearchResult{
		searchRow("skill:x:ok", domain.KindSkill, domain.InstallabilityMetadataVerified),
		searchRow("skill:x:no", domain.KindSkill, domain.InstallabilityDiscoveryOnly),
	}
	var b bytes.Buffer
	writeSearchTable(&b, rows, false)
	out := b.String()
	for _, want := range []string{"STATUS", "+ installable", "- listing only", "(1 installable)", "skill:x:ok", "--installable"} {
		if !strings.Contains(out, want) {
			t.Errorf("table lacks %q:\n%s", want, out)
		}
	}
	b.Reset()
	writeSearchTable(&b, rows, true)
	if !strings.Contains(b.String(), "✓ installable") || !strings.Contains(b.String(), "– listing only") {
		t.Errorf("unicode table lacks glyphs:\n%s", b.String())
	}
}

func TestInstallFailureTextIsReadable(t *testing.T) {
	err := domain.ErrNotInstallable("skill:planetscale:postgres", "internal detail")
	got := installFailureText(err, true)
	for _, want := range []string{"✗ skill:planetscale:postgres can't be installed", "(LPSM-NOT-INSTALLABLE)", "Try: litespm search postgres --installable"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in %q", want, got)
		}
	}
	for _, bad := range []string{"map[", "category:", "details:"} {
		if strings.Contains(got, bad) {
			t.Errorf("leaked %q in %q", bad, got)
		}
	}
	if ascii := installFailureText(err, false); !strings.HasPrefix(ascii, "x ") {
		t.Errorf("ascii fallback = %q", ascii)
	}
	other := installFailureText(domain.ErrArtifactUnavailable("mcp:a:b", "no launch line"), true)
	if strings.Contains(other, "map[") || !strings.Contains(other, "no launch line") {
		t.Errorf("other typed error = %q", other)
	}
	// The structured error itself is unchanged for log and RPC paths.
	if !strings.Contains(err.Error(), "details:") || err.Details["listingId"] != "skill:planetscale:postgres" {
		t.Errorf("LPSMError lost its structured detail: %v", err)
	}
}

func TestUnknownCommandMessage(t *testing.T) {
	if got := unknownCommandMessage("serch"); !strings.Contains(got, `Unknown command "serch". Did you mean "search"?`) || !strings.Contains(got, "litespm help") {
		t.Errorf("got %q", got)
	}
	if got := unknownCommandMessage("zzzzzzzz"); strings.Contains(got, "Did you mean") {
		t.Errorf("unexpected suggestion: %q", got)
	}
}

func TestApprovalPromptLabels(t *testing.T) {
	plan := &domain.InstallPlan{}
	plan.Resolved.Version = "discovery"
	plan.HostChanges = []domain.HostChange{{HostID: "claude-code", ConfigPath: "/p/skills"}}
	var b bytes.Buffer
	writeApprovalPrompt(&b, plan)
	out := b.String()
	if strings.Contains(out, "discovery") || strings.Contains(out, "()") {
		t.Errorf("prompt still leaks internal markers:\n%s", out)
	}
	if !strings.Contains(out, "unversioned") || !strings.Contains(out, "  target  : claude-code -> /p/skills\n") {
		t.Errorf("prompt =\n%s", out)
	}
}
