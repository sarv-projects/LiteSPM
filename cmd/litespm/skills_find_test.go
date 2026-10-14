package main

// skills_find_test.go — `litespm skills find`, exercised against an injected
// in-memory catalog index: the real client construction is replaced, so the
// tests measure the command's filtering, rendering, owner derivation and
// picker without a synced catalog cache or a network.

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/domain"
)

// findTestListing builds one index row. metadata_verified is the installable
// class so selection output can offer `litespm install`. UpstreamID mirrors
// the compiled catalog's value for a skill row: the listing id's last segment
// (the discovery slug), not the owner/repo path.
func findTestListing(id, name, sourceURL string) *domain.Listing {
	parts := strings.Split(id, ":")
	return &domain.Listing{
		SchemaVersion:  1,
		ID:             id,
		Kind:           domain.KindSkill,
		Name:           name,
		Summary:        name + " summary",
		Source:         domain.SourceReference{URL: sourceURL, UpstreamID: parts[len(parts)-1]},
		Status:         domain.ListingStatusActive,
		Installability: domain.InstallabilityMetadataVerified,
	}
}

func findTestMCP(id, name, sourceURL string) *domain.Listing {
	return &domain.Listing{
		SchemaVersion: 1,
		ID:            id,
		Kind:          domain.KindMCP,
		Name:          name,
		Summary:       name + " mcp summary",
		Source:        domain.SourceReference{URL: sourceURL},
		Status:        domain.ListingStatusActive,
	}
}

// injectSkillsFindIndex replaces the client seam with an in-memory index.
func injectSkillsFindIndex(t *testing.T, listings ...*domain.Listing) *catalog.Client {
	t.Helper()
	client := catalog.NewClient("http://127.0.0.1:1", t.TempDir(), nil)
	client.IndexListings(listings)
	old := skillsFindIndex
	skillsFindIndex = func(*config.PlatformPaths) *catalog.Client { return client }
	t.Cleanup(func() { skillsFindIndex = old })
	return client
}

func TestSkillsFindParseArgs(t *testing.T) {
	t.Run("query words, owner, limit, json", func(t *testing.T) {
		opts, err := parseSkillsFindArgs([]string{"react", "native", "--owner", " vercel-labs ", "--limit", "7", "--json"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if opts.query != "react native" || opts.owner != "vercel-labs" || opts.limit != 7 || !opts.jsonOut {
			t.Errorf("unexpected options: %+v", opts)
		}
	})

	t.Run("defaults", func(t *testing.T) {
		opts, err := parseSkillsFindArgs(nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if opts.query != "" || opts.owner != "" || opts.limit != 25 {
			t.Errorf("unexpected defaults: %+v", opts)
		}
	})

	t.Run("errors", func(t *testing.T) {
		cases := []struct {
			name string
			args []string
			want string
		}{
			{"unknown flag", []string{"--bogus"}, "unknown flag"},
			{"owner without value", []string{"--owner"}, "requires a value"},
			{"empty owner", []string{"--owner", " "}, "requires a name"},
			{"limit without value", []string{"--limit"}, "requires a value"},
			{"limit zero", []string{"--limit", "0"}, "between 1 and 500"},
			{"limit too high", []string{"--limit", "501"}, "between 1 and 500"},
			{"limit not a number", []string{"--limit", "many"}, "between 1 and 500"},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				_, err := parseSkillsFindArgs(tc.args)
				if err == nil || !strings.Contains(err.Error(), tc.want) {
					t.Fatalf("err = %v, want containing %q", err, tc.want)
				}
			})
		}
	})
}

func TestSkillsFindSourceRepoPath(t *testing.T) {
	cases := []struct {
		name     string
		url      string
		repo     string
		owner    string
		wantRepo bool
	}{
		{"github repo", "https://github.com/vercel-labs/agent-skills", "vercel-labs/agent-skills", "vercel-labs", true},
		{"github tree browse", "https://github.com/NVIDIA/skills/tree/main/skills", "NVIDIA/skills", "NVIDIA", true},
		{"github blob", "https://github.com/rootlyhq/rootly-mcp-server/blob/main/examples/skills/x.md", "rootlyhq/rootly-mcp-server", "rootlyhq", true},
		{"github .git suffix", "https://github.com/owner/repo.git", "owner/repo", "owner", true},
		{"skills.sh page", "https://www.skills.sh/vercel-labs/agent-skills/web-design-guidelines", "vercel-labs/agent-skills", "vercel-labs", true},
		{"officialskills page", "https://officialskills.sh/anthropics/skills/template", "anthropics/skills", "anthropics", true},
		{"sourcehut tilde", "https://git.sr.ht/~user/repo", "user/repo", "user", true},
		{"plain web page", "https://catalog.redhat.com/en/ai/skills/detail/x", "", "", false},
		{"unknown host", "https://ai.gendigital.com/agent-trust-hub", "", "", false},
		{"not a url", "not a url", "", "", false},
		{"no url", "", "", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			l := &domain.Listing{Source: domain.SourceReference{URL: tc.url}}
			repo, ok := skillSourceRepoPath(l)
			if ok != tc.wantRepo || repo != tc.repo {
				t.Errorf("skillSourceRepoPath(%q) = (%q, %t), want (%q, %t)", tc.url, repo, ok, tc.repo, tc.wantRepo)
			}
			owner, ok := skillSourceOwner(l)
			if ok != tc.wantRepo || owner != tc.owner {
				t.Errorf("skillSourceOwner(%q) = (%q, %t), want (%q, %t)", tc.url, owner, ok, tc.owner, tc.wantRepo)
			}
		})
	}
}

func TestSkillsFindRunKeywordIsSkillsOnly(t *testing.T) {
	injectSkillsFindIndex(t,
		findTestListing("skill:vercel-labs:react", "react", "https://www.skills.sh/vercel-labs/agent-skills/react"),
		findTestListing("skill:acme:react-query", "react-query", "https://github.com/acme/skills"),
		findTestMCP("mcp:builtin:react-mcp", "react-mcp", "https://github.com/vercel-labs/react-mcp"),
	)

	code, stdout, stderr := captureSkillsStreams(t, func() int {
		return runSkillsFind([]string{"react"})
	})
	if code != 0 {
		t.Fatalf("runSkillsFind = %d, want 0\nstderr:\n%s", code, stderr)
	}
	for _, want := range []string{"react-query", "skill:vercel-labs:react", "skill:acme:react-query"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("stdout is missing %q:\n%s", want, stdout)
		}
	}
	if strings.Contains(stdout, "react-mcp") {
		t.Errorf("an MCP row leaked into skills find output:\n%s", stdout)
	}
}

func TestSkillsFindRunOwnerFilter(t *testing.T) {
	injectSkillsFindIndex(t,
		findTestListing("skill:vercel-labs:web-design-guidelines", "web-design-guidelines", "https://www.skills.sh/vercel-labs/agent-skills/web-design-guidelines"),
		findTestListing("skill:vercel-labs:react", "react", "https://github.com/vercel-labs/json-render/tree/main/react"),
		findTestListing("skill:community:browse-nvidia", "browse-nvidia", "https://github.com/NVIDIA/skills/tree/main/skills"),
		findTestListing("skill:peas:genealogy", "genealogy", "https://paulo.com.br/skills/genealogy-research/SKILL.md"),
		findTestMCP("mcp:builtin:vercel-mcp", "vercel-mcp", "https://github.com/vercel-labs/vercel-mcp"),
	)

	t.Run("matches the source-repo owner, case-insensitively", func(t *testing.T) {
		code, stdout, stderr := captureSkillsStreams(t, func() int {
			return runSkillsFind([]string{"--owner", "VERCEL-LABS"})
		})
		if code != 0 {
			t.Fatalf("runSkillsFind --owner = %d, want 0\nstderr:\n%s", code, stderr)
		}
		for _, want := range []string{"skill:vercel-labs:web-design-guidelines", "skill:vercel-labs:react"} {
			if !strings.Contains(stdout, want) {
				t.Errorf("stdout is missing %q:\n%s", want, stdout)
			}
		}
		for _, forbidden := range []string{"NVIDIA", "paulo.com.br", "vercel-mcp"} {
			if strings.Contains(stdout, forbidden) {
				t.Errorf("stdout must not contain %q:\n%s", forbidden, stdout)
			}
		}
	})

	t.Run("limit applies after the owner filter", func(t *testing.T) {
		code, stdout, _ := captureSkillsStreams(t, func() int {
			return runSkillsFind([]string{"--owner", "vercel-labs", "--limit", "1"})
		})
		if code != 0 {
			t.Fatalf("runSkillsFind --limit = %d, want 0", code)
		}
		if got := strings.Count(stdout, "skill:"); got != 1 {
			t.Errorf("expected exactly one result id, got %d:\n%s", got, stdout)
		}
	})

	t.Run("a publisher claim is not an owner", func(t *testing.T) {
		code, stdout, _ := captureSkillsStreams(t, func() int {
			return runSkillsFind([]string{"--owner", "peas"})
		})
		if code != 0 {
			t.Fatalf("runSkillsFind --owner peas = %d, want 0", code)
		}
		if !strings.Contains(stdout, "No skills found with a source repository owned by") {
			t.Errorf("a URL with no owner/repo path must not match by publisher claim:\n%s", stdout)
		}
	})
}

func TestSkillsFindRunOwnerNoMatch(t *testing.T) {
	injectSkillsFindIndex(t, findTestListing("skill:acme:thing", "thing", "https://github.com/acme/thing"))

	code, stdout, _ := captureSkillsStreams(t, func() int {
		return runSkillsFind([]string{"react", "--owner", "nobody"})
	})
	if code != 0 {
		t.Fatalf("runSkillsFind = %d, want 0 (no matches is not an error)", code)
	}
	for _, want := range []string{`"react"`, `"nobody"`} {
		if !strings.Contains(stdout, want) {
			t.Errorf("the empty-result message is missing %q:\n%s", want, stdout)
		}
	}
}

func TestSkillsFindRunEmptyIndex(t *testing.T) {
	injectSkillsFindIndex(t)

	code, stdout, _ := captureSkillsStreams(t, func() int {
		return runSkillsFind(nil)
	})
	if code != 0 {
		t.Fatalf("runSkillsFind on an empty index = %d, want 0", code)
	}
	for _, want := range []string{"index is empty", "catalog sync"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("stdout is missing %q:\n%s", want, stdout)
		}
	}

	code, stdout, _ = captureSkillsStreams(t, func() int {
		return runSkillsFind([]string{"--json"})
	})
	if code != 0 {
		t.Fatalf("runSkillsFind --json on an empty index = %d, want 0", code)
	}
	var doc skillsFindDocument
	if err := json.Unmarshal([]byte(stdout), &doc); err != nil {
		t.Fatalf("stdout is not JSON: %v\n%s", err, stdout)
	}
	if doc.Count != 0 || doc.IndexCount != 0 || doc.Results == nil {
		t.Errorf("empty-index document should be explicit zeros with an empty results array: %+v", doc)
	}
}

func TestSkillsFindRunJSON(t *testing.T) {
	injectSkillsFindIndex(t,
		findTestListing("skill:vercel-labs:react", "react", "https://www.skills.sh/vercel-labs/agent-skills/react"),
		findTestListing("skill:acme:react-query", "react-query", "https://github.com/acme/skills"),
		findTestMCP("mcp:builtin:react-mcp", "react-mcp", "https://github.com/vercel-labs/react-mcp"),
	)

	code, stdout, stderr := captureSkillsStreams(t, func() int {
		return runSkillsFind([]string{"--owner", "vercel-labs", "--json"})
	})
	if code != 0 {
		t.Fatalf("runSkillsFind --json = %d, want 0\nstderr:\n%s", code, stderr)
	}
	var doc skillsFindDocument
	if err := json.Unmarshal([]byte(stdout), &doc); err != nil {
		t.Fatalf("stdout is not JSON: %v\n%s", err, stdout)
	}
	if doc.Schema != "litespm-skills-find/v1" || doc.Owner != "vercel-labs" || doc.Count != 1 || doc.IndexCount != 3 {
		t.Errorf("unexpected document header: %+v", doc)
	}
	if len(doc.Results) != 1 || doc.Results[0].Owner != "vercel-labs" || doc.Results[0].ID != "skill:vercel-labs:react" {
		t.Errorf("unexpected results: %+v", doc.Results)
	}
}

func TestSkillsFindRunNoQueryNonTerminalPrintsList(t *testing.T) {
	injectSkillsFindIndex(t,
		findTestListing("skill:vercel-labs:react", "react", "https://www.skills.sh/vercel-labs/agent-skills/react"),
	)

	// runSkillsFind sees a piped stdout (captured below), so it must print the
	// table and exit rather than wait on stdin.
	code, stdout, stderr := captureSkillsStreams(t, func() int {
		return runSkillsFind(nil)
	})
	if code != 0 {
		t.Fatalf("runSkillsFind = %d, want 0\nstderr:\n%s", code, stderr)
	}
	if !strings.Contains(stdout, "NAME") || !strings.Contains(stdout, "skill:vercel-labs:react") {
		t.Errorf("a non-terminal run must print the list:\n%s", stdout)
	}
	if strings.Contains(stdout, "Select a skill") {
		t.Errorf("a non-terminal run must not open the picker:\n%s", stdout)
	}
}

func TestSkillsFindInteractivePicker(t *testing.T) {
	injectSkillsFindIndex(t,
		findTestListing("skill:vercel-labs:alpha", "alpha-guidelines", "https://www.skills.sh/vercel-labs/agent-skills/alpha"),
		findTestListing("skill:vercel-labs:beta", "beta-guidelines", "https://www.skills.sh/vercel-labs/agent-skills/beta"),
	)

	t.Run("a number selects and reports the row", func(t *testing.T) {
		var out, errOut bytes.Buffer
		code := runSkillsFindTo(&out, &errOut, strings.NewReader("2\n"), true, nil)
		if code != 0 {
			t.Fatalf("picker = %d, want 0\nstderr:\n%s", code, errOut.String())
		}
		if !strings.Contains(out.String(), "Select a skill") || !strings.Contains(out.String(), "Selected: beta-guidelines") {
			t.Errorf("picker output missing the selection:\n%s", out.String())
		}
		if !strings.Contains(out.String(), "litespm skills use vercel-labs/agent-skills@beta") {
			t.Errorf("picker output should suggest the pipeable next step:\n%s", out.String())
		}
		if !strings.Contains(out.String(), "litespm install skill:vercel-labs:beta") {
			t.Errorf("picker output should offer the install path for an installable row:\n%s", out.String())
		}
	})

	t.Run("EOF degrades to the printed list", func(t *testing.T) {
		var out, errOut bytes.Buffer
		code := runSkillsFindTo(&out, &errOut, strings.NewReader(""), true, nil)
		if code != 0 {
			t.Fatalf("picker with EOF = %d, want 0", code)
		}
		if strings.Contains(out.String(), "Selected:") {
			t.Errorf("no selection was made; output must not claim one:\n%s", out.String())
		}
	})

	t.Run("an out-of-range number is refused", func(t *testing.T) {
		var out, errOut bytes.Buffer
		code := runSkillsFindTo(&out, &errOut, strings.NewReader("99\n"), true, nil)
		if code != 1 {
			t.Fatalf("picker with 99 = %d, want 1", code)
		}
	})
}

func TestSkillsFindUseHelpSynopsisRegistered(t *testing.T) {
	page, ok := helpCatalog["skills"]
	if !ok {
		t.Fatal("the skills help page is missing")
	}
	joined := strings.Join(page.Synopsis, "\n")
	for _, want := range []string{"litespm skills use <source>", "litespm skills find [<query>]"} {
		if !strings.Contains(joined, want) {
			t.Errorf("the skills help page is missing %q:\n%s", want, joined)
		}
	}
}
