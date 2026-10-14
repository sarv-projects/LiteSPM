package main

// skills_remove_parity_test.go — `skills remove` and `skills list` parity:
// --all is exactly `--skill '*' --agent '*' -y`, removal by exact source takes
// every row from that source and nothing else, agent filters match what the
// ledger recorded, a filter that cannot be honoured safely is refused by name,
// and list filters on the recorded fields instead of silently listing
// everything.

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/skills"
)

func TestSkillsRemoveAllEqualsWildcardFlags(t *testing.T) {
	short, err := parseSkillsRemoveArgs([]string{"--all"})
	if err != nil {
		t.Fatalf("parse --all: %v", err)
	}
	long, err := parseSkillsRemoveArgs([]string{"--skill", "*", "--agent", "*", "-y"})
	if err != nil {
		t.Fatalf("parse wildcard flags: %v", err)
	}
	if !reflect.DeepEqual(short, long) {
		t.Fatalf("--all parsed as %+v, --skill '*' --agent '*' -y parsed as %+v", short, long)
	}
	// Guard against the two spellings agreeing on something that is not
	// actually "everything, non-interactively".
	if !short.all || !hasWildcard(short.skills) || !hasWildcard(short.agents) || !short.yes {
		t.Fatalf("the equivalent spellings must select every skill and agent with -y: %+v", short)
	}
}

func TestSkillsRemoveByExactSource(t *testing.T) {
	dataRoot := t.TempDir()
	paths := &config.PlatformPaths{DataRoot: dataRoot}
	keep := newSkillFixture(t, dataRoot, "keep-skill").install(t, "opencode", "project", "https://github.com/acme/tools.git", "body")
	drop := newSkillFixture(t, dataRoot, "drop-skill").install(t, "opencode", "project", "https://github.com/acme/tools.git", "body")
	other := newSkillFixture(t, dataRoot, "other-skill").install(t, "opencode", "project", "https://github.com/acme/other.git", "body")

	// `owner/repo` canonicalizes to the exact label an install records.
	opts, err := parseSkillsRemoveArgs([]string{"acme/tools"})
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	if len(opts.sources) != 1 || opts.sources[0] != "https://github.com/acme/tools.git" {
		t.Fatalf("source canonicalization: %+v", opts.sources)
	}

	outcomes, err := executeSkillsRemove(opts, paths)
	if err != nil {
		t.Fatalf("executeSkillsRemove failed: %v", err)
	}
	if len(outcomes) != 2 {
		t.Fatalf("expected 2 outcomes (both rows of the source), got %+v", outcomes)
	}
	for _, o := range outcomes {
		if !o.Removed {
			t.Fatalf("row %+v from the named source must be removed", o)
		}
	}
	for _, dir := range []string{keep.DestDir, drop.DestDir} {
		if _, err := os.Stat(dir); !os.IsNotExist(err) {
			t.Errorf("%s must be gone", dir)
		}
	}
	// Nothing else: the other source's skill and its directory survive.
	if _, err := os.Stat(other.DestDir); err != nil {
		t.Errorf("a skill from a different source must not be touched: %v", err)
	}
	ledger, _ := skills.OpenLedger(skills.LedgerPath(dataRoot))
	entries, _ := ledger.All()
	if len(entries) != 1 || entries[0].SkillName != "other-skill" {
		t.Fatalf("unexpected ledger after source removal: %+v", entries)
	}
}

func TestSkillsRemoveSourceSplitNameIsRefused(t *testing.T) {
	dataRoot := t.TempDir()
	paths := &config.PlatformPaths{DataRoot: dataRoot}

	// A local source must exist on disk to parse as a local directory.
	srcA := filepath.Join(t.TempDir(), "source-a")
	srcB := filepath.Join(t.TempDir(), "source-b")
	for _, dir := range []string{srcA, srcB} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	first := newSkillFixture(t, dataRoot, "pdf").install(t, "cursor", "project", srcA, "body")
	second := newSkillFixture(t, dataRoot, "pdf").install(t, "codex", "project", srcB, "body")

	opts, err := parseSkillsRemoveArgs([]string{srcA})
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	outcomes, err := executeSkillsRemove(opts, paths)
	if err != nil {
		t.Fatalf("executeSkillsRemove failed: %v", err)
	}
	// The ledger removes by (name, scope); removing pdf would also take the
	// row from srcB, so the whole name is refused with both rows intact.
	for _, o := range outcomes {
		if o.Removed {
			t.Fatalf("a partial source filter must refuse rather than over-delete: %+v", outcomes)
		}
	}
	if len(outcomes) == 0 || !strings.Contains(outcomes[0].Reason, "would also delete") {
		t.Fatalf("the refusal must name the row it would have destroyed: %+v", outcomes)
	}
	if !strings.Contains(outcomes[0].Reason, second.DestDir) {
		t.Fatalf("the refusal must name the unselected destination: %s", outcomes[0].Reason)
	}
	for _, dir := range []string{first.DestDir, second.DestDir} {
		if _, err := os.Stat(dir); err != nil {
			t.Errorf("a refused removal must leave %s in place: %v", dir, err)
		}
	}
}

func TestSkillsRemoveAgentFilter(t *testing.T) {
	t.Run("agent filter selects only that agent's rows", func(t *testing.T) {
		dataRoot := t.TempDir()
		paths := &config.PlatformPaths{DataRoot: dataRoot}
		cursor := newSkillFixture(t, dataRoot, "pdf").install(t, "cursor", "project", "owner/one", "body")
		codex := newSkillFixture(t, dataRoot, "docx").install(t, "codex", "project", "owner/two", "body")

		opts, err := parseSkillsRemoveArgs([]string{"--skill", "*", "-a", "cursor"})
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		outcomes, err := executeSkillsRemove(opts, paths)
		if err != nil {
			t.Fatalf("executeSkillsRemove failed: %v", err)
		}
		if len(outcomes) != 1 || !outcomes[0].Removed || outcomes[0].Entry.SkillName != "pdf" {
			t.Fatalf("agent filter selected the wrong rows: %+v", outcomes)
		}
		if _, err := os.Stat(cursor.DestDir); !os.IsNotExist(err) {
			t.Error("the cursor row must be removed")
		}
		if _, err := os.Stat(codex.DestDir); err != nil {
			t.Errorf("the codex row must survive the cursor filter: %v", err)
		}
	})

	t.Run("agent wildcard selects every agent", func(t *testing.T) {
		dataRoot := t.TempDir()
		paths := &config.PlatformPaths{DataRoot: dataRoot}
		cursor := newSkillFixture(t, dataRoot, "pdf").install(t, "cursor", "project", "owner/one", "body")
		codex := newSkillFixture(t, dataRoot, "pdf").install(t, "codex", "project", "owner/two", "body")

		opts, err := parseSkillsRemoveArgs([]string{"-a", "*", "pdf"})
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		outcomes, err := executeSkillsRemove(opts, paths)
		if err != nil {
			t.Fatalf("executeSkillsRemove failed: %v", err)
		}
		if len(outcomes) != 2 {
			t.Fatalf("expected both rows removed, got %+v", outcomes)
		}
		for _, o := range outcomes {
			if !o.Removed {
				t.Fatalf("--agent '*' must not filter any agent: %+v", outcomes)
			}
		}
		for _, dir := range []string{cursor.DestDir, codex.DestDir} {
			if _, err := os.Stat(dir); !os.IsNotExist(err) {
				t.Errorf("%s must be gone", dir)
			}
		}
	})

	t.Run("agent filter that would split a name is refused", func(t *testing.T) {
		dataRoot := t.TempDir()
		paths := &config.PlatformPaths{DataRoot: dataRoot}
		first := newSkillFixture(t, dataRoot, "pdf").install(t, "cursor", "project", "owner/one", "body")
		second := newSkillFixture(t, dataRoot, "pdf").install(t, "codex", "project", "owner/two", "body")

		opts, err := parseSkillsRemoveArgs([]string{"-a", "cursor", "pdf"})
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		outcomes, err := executeSkillsRemove(opts, paths)
		if err != nil {
			t.Fatalf("executeSkillsRemove failed: %v", err)
		}
		if len(outcomes) != 1 || outcomes[0].Removed {
			t.Fatalf("expected a single refusal, got %+v", outcomes)
		}
		if !strings.Contains(outcomes[0].Reason, second.DestDir) {
			t.Fatalf("the refusal must name the unselected destination: %s", outcomes[0].Reason)
		}
		for _, dir := range []string{first.DestDir, second.DestDir} {
			if _, err := os.Stat(dir); err != nil {
				t.Errorf("a refused removal must leave %s in place: %v", dir, err)
			}
		}
	})
}

func TestSkillsListFilters(t *testing.T) {
	entries := []skills.LedgerEntry{
		{SkillName: "pdf", AgentID: "cursor", HostLabel: "cursor", Scope: "project", DestDir: "/p/skills/pdf"},
		{SkillName: "docx", AgentID: "codex", HostLabel: "codex", Scope: "global", DestDir: "/g/skills/docx"},
		// A row that predates AgentID: HostLabel is the recorded fallback.
		{SkillName: "legacy", HostLabel: "cursor", Scope: "project", DestDir: "/p/skills/legacy"},
	}

	if got := filterSkillsList(entries, skillsListOptions{}); len(got) != 3 {
		t.Fatalf("no filters => %d entries, want 3", len(got))
	}
	if got := filterSkillsList(entries, skillsListOptions{global: true}); len(got) != 1 || got[0].SkillName != "docx" {
		t.Fatalf("-g filtered wrong: %+v", got)
	}
	if got := filterSkillsList(entries, skillsListOptions{agents: []string{"cursor"}}); len(got) != 2 {
		t.Fatalf("-a cursor => %d entries, want 2 (AgentID and HostLabel fallback)", len(got))
	}
	if got := filterSkillsList(entries, skillsListOptions{agents: []string{"*"}}); len(got) != 3 {
		t.Fatalf("-a '*' must be every agent: %+v", got)
	}
	if got := filterSkillsList(entries, skillsListOptions{global: true, agents: []string{"cursor"}}); len(got) != 0 {
		t.Fatalf("-g -a cursor must AND the filters: %+v", got)
	}
}

func TestSkillsListArgs(t *testing.T) {
	opts, err := parseSkillsListArgs([]string{"-g"})
	if err != nil || !opts.global {
		t.Fatalf("-g => %+v, %v", opts, err)
	}
	opts, err = parseSkillsListArgs([]string{"-a", "cursor", "--json"})
	if err != nil || len(opts.agents) != 1 || opts.agents[0] != "cursor" || !opts.jsonOut {
		t.Fatalf("-a cursor --json => %+v, %v", opts, err)
	}

	// The silent-ignore regression: an unrecognised argument used to be
	// dropped, so `ls -g something` listed everything. It must error now.
	for _, args := range [][]string{
		{"--bogus"},
		{"extra"},
		{"-x"},
		{"--agent"},
		{"--agent", "no-such-agent"},
	} {
		if _, err := parseSkillsListArgs(args); err == nil {
			t.Errorf("parseSkillsListArgs(%v) must error", args)
		}
	}
}

func TestSkillsRemoveUnknownAgentIsRejected(t *testing.T) {
	for _, args := range [][]string{
		{"-a", "no-such-agent", "pdf"},
		{"--skill", "*", "-a", "no-such-agent"},
	} {
		if _, err := parseSkillsRemoveArgs(args); err == nil {
			t.Errorf("parseSkillsRemoveArgs(%v) must reject the unknown agent", args)
		}
	}
}
