package main

// skills_update_parity_test.go — `skills update` parity: update-all resolves
// each row's source from the ledger, named updates select by name, an unusable
// row is reported without aborting the rest of the run, and scope selection
// (-g/-p/-y) follows the scope the ledger recorded.

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/skills"
)

// skillFixture is one installed skill: the source tree it was installed from
// (which a test may mutate to produce a newer revision) and the destination
// directory the ledger records.
type skillFixture struct {
	DataRoot  string
	Name      string
	SourceDir string
	DestDir   string
}

func newSkillFixture(t *testing.T, dataRoot, name string) skillFixture {
	t.Helper()
	return skillFixture{
		DataRoot:  dataRoot,
		Name:      name,
		SourceDir: filepath.Join(t.TempDir(), name),
		DestDir:   filepath.Join(t.TempDir(), "skills", name),
	}
}

// install records a real install from the fixture's source tree. The installer
// stores exactly the display label it is handed, which is how a test pins a
// recorded source (an empty string records no source at all).
func (fx skillFixture) install(t *testing.T, agent, scope, recordedSource, body string) skillFixture {
	t.Helper()
	writeTestSkill(t, fx.SourceDir, fx.Name, body)
	ledger, err := skills.OpenLedger(skills.LedgerPath(fx.DataRoot))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := skills.NewInstaller(ledger, nil).Install(context.Background(), skills.InstallRequest{
		Op:     skills.InstallOp{SkillName: fx.Name, FromDir: fx.SourceDir, ToDir: fx.DestDir, HostLabel: agent},
		Source: skills.SkillSource{Display: recordedSource},
		Scope:  scope,
	}); err != nil {
		t.Fatalf("install fixture %s: %v", fx.Name, err)
	}
	return fx
}

// revise rewrites the fixture's source tree, so an update has something new to
// find.
func (fx skillFixture) revise(t *testing.T, body string) {
	t.Helper()
	writeTestSkill(t, fx.SourceDir, fx.Name, body)
}

func mustReadSkillBody(t *testing.T, dir string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestSkillsUpdateAllResolvesSourceFromLedger(t *testing.T) {
	dataRoot := t.TempDir()
	fx := newSkillFixture(t, dataRoot, "ledger-skill")
	// The row records the fixture's source directory, a path that exists only
	// in the ledger: the invocation below supplies no --source at all, so v2
	// can only be found by reading the row.
	fx.install(t, "opencode", "project", fx.SourceDir, "v1 installed")
	fx.revise(t, "v2 from the ledger source")

	results, err := executeSkillsUpdate(context.Background(), skillsUpdateOptions{yes: true}, &config.PlatformPaths{DataRoot: dataRoot})
	if err != nil {
		t.Fatalf("executeSkillsUpdate failed: %v", err)
	}
	if len(results) != 1 || results[0].Status != "updated" {
		t.Fatalf("expected one updated result, got %+v", results)
	}
	if results[0].Name != "ledger-skill" {
		t.Fatalf("updated %q, want ledger-skill", results[0].Name)
	}
	if got := mustReadSkillBody(t, fx.DestDir); !strings.Contains(got, "v2 from the ledger source") {
		t.Fatalf("update did not use the source recorded in the ledger:\n%s", got)
	}
}

func TestSkillsUpdateNames(t *testing.T) {
	dataRoot := t.TempDir()
	paths := &config.PlatformPaths{DataRoot: dataRoot}
	pdf := newSkillFixture(t, dataRoot, "pdf")
	pdf.install(t, "opencode", "project", pdf.SourceDir, "v1")
	docx := newSkillFixture(t, dataRoot, "docx")
	docx.install(t, "opencode", "project", docx.SourceDir, "v1")
	pdf.revise(t, "pdf v2")
	docx.revise(t, "docx v2")

	t.Run("one name updates only that skill", func(t *testing.T) {
		results, err := executeSkillsUpdate(context.Background(), skillsUpdateOptions{names: []string{"pdf"}, yes: true}, paths)
		if err != nil {
			t.Fatalf("executeSkillsUpdate failed: %v", err)
		}
		if len(results) != 1 || results[0].Status != "updated" || results[0].Name != "pdf" {
			t.Fatalf("unexpected results: %+v", results)
		}
		if got := mustReadSkillBody(t, pdf.DestDir); !strings.Contains(got, "pdf v2") {
			t.Fatalf("pdf was not updated:\n%s", got)
		}
		if got := mustReadSkillBody(t, docx.DestDir); strings.Contains(got, "docx v2") {
			t.Fatalf("docx must not be touched when only pdf was named:\n%s", got)
		}
	})

	t.Run("unknown name errors naming the value", func(t *testing.T) {
		results, err := executeSkillsUpdate(context.Background(), skillsUpdateOptions{names: []string{"no-such-skill"}}, paths)
		if err != nil {
			t.Fatalf("executeSkillsUpdate failed: %v", err)
		}
		if len(results) != 1 || results[0].Status != "not_installed" {
			t.Fatalf("expected one not_installed result, got %+v", results)
		}
		if results[0].Name != "no-such-skill" || !strings.Contains(results[0].Reason, `"no-such-skill"`) {
			t.Fatalf("the error must name the unknown value: %+v", results[0])
		}
		if skillUpdateFailures(results) == 0 {
			t.Fatal("an unknown name must count as a failure")
		}
	})
}

// A row with no usable source can still be updated through --source, the
// documented override for ledgers written before provenance was recorded.
func TestSkillsUpdateSourceOverrideForRowWithoutSource(t *testing.T) {
	dataRoot := t.TempDir()
	fx := newSkillFixture(t, dataRoot, "orphan")
	fx.install(t, "opencode", "project", "", "v1")
	fx.revise(t, "v2 via the override")

	results, err := executeSkillsUpdate(context.Background(), skillsUpdateOptions{
		source: fx.SourceDir, yes: true,
	}, &config.PlatformPaths{DataRoot: dataRoot})
	if err != nil {
		t.Fatalf("executeSkillsUpdate failed: %v", err)
	}
	if len(results) != 1 || results[0].Status != "updated" {
		t.Fatalf("--source must rescue a row with no recorded source: %+v", results)
	}
	if got := mustReadSkillBody(t, fx.DestDir); !strings.Contains(got, "v2 via the override") {
		t.Fatalf("the override source was not used:\n%s", got)
	}
	ledger, _ := skills.OpenLedger(skills.LedgerPath(dataRoot))
	entries, _ := ledger.All()
	if len(entries) != 1 || entries[0].Source != fx.SourceDir {
		t.Fatalf("the override must be recorded as the row's new source: %+v", entries)
	}
}

func TestSkillsUpdateMissingSourceReportsAndContinues(t *testing.T) {
	dataRoot := t.TempDir()
	good := newSkillFixture(t, dataRoot, "good")
	good.install(t, "opencode", "project", good.SourceDir, "v1")
	// A row written with no source recorded (the pre-provenance shape).
	newSkillFixture(t, dataRoot, "bad").install(t, "opencode", "project", "", "v1")
	good.revise(t, "good v2")

	results, err := executeSkillsUpdate(context.Background(), skillsUpdateOptions{yes: true}, &config.PlatformPaths{DataRoot: dataRoot})
	if err != nil {
		t.Fatalf("a missing row source must not abort the run: %v", err)
	}
	byName := map[string]skillUpdateResult{}
	for _, r := range results {
		byName[r.Name] = r
	}
	if got := byName["good"]; got.Status != "updated" {
		t.Fatalf("the usable row must still update: %+v", got)
	}
	if got := byName["bad"]; got.Status != "error" || !strings.Contains(got.Reason, "no source recorded") {
		t.Fatalf("the unusable row must be reported per skill: %+v", got)
	}
	if n := skillUpdateFailures(results); n != 1 {
		t.Fatalf("skillUpdateFailures = %d, want exactly the one partial failure", n)
	}
	if got := mustReadSkillBody(t, good.DestDir); !strings.Contains(got, "good v2") {
		t.Fatalf("good was not updated:\n%s", got)
	}
}

func TestSkillsUpdateScopeSelection(t *testing.T) {
	t.Run("scope flags", func(t *testing.T) {
		project, err := parseSkillsUpdateArgs([]string{"-p"})
		if err != nil || project.scope != "project" || !project.scopeGiven {
			t.Fatalf("-p => %+v, %v", project, err)
		}
		global, err := parseSkillsUpdateArgs([]string{"-g"})
		if err != nil || global.scope != "global" || !global.scopeGiven {
			t.Fatalf("-g => %+v, %v", global, err)
		}
		yes, err := parseSkillsUpdateArgs([]string{"-y"})
		if err != nil || !yes.yes || yes.scopeGiven {
			t.Fatalf("-y => %+v, %v", yes, err)
		}
	})

	t.Run("-y auto-detects project inside a project-scope install", func(t *testing.T) {
		projectRoot := t.TempDir()
		// claude-code's documented PROJECT dir is .claude/skills; that is the
		// recorded-agent-derived path the detector reconstructs.
		entries := []skills.LedgerEntry{{
			SkillName: "pdf", Scope: "project", AgentID: "claude-code", HostLabel: "claude-code",
			DestDir: filepath.Join(projectRoot, ".claude", "skills", "pdf"),
		}}
		for _, cwd := range []string{projectRoot, filepath.Join(projectRoot, "src")} {
			got := resolveUpdateScope(skillsUpdateOptions{yes: true}, entries, cwd)
			if got.scope != "project" || !got.scopeGiven {
				t.Fatalf("cwd %s => %+v, want auto-detected project", cwd, got)
			}
		}
	})

	t.Run("-y auto-detects global when no project-scope install covers the cwd", func(t *testing.T) {
		entries := []skills.LedgerEntry{{
			SkillName: "pdf", Scope: "global", HostLabel: "opencode",
			DestDir: filepath.Join(t.TempDir(), "skills", "pdf"),
		}}
		got := resolveUpdateScope(skillsUpdateOptions{yes: true}, entries, t.TempDir())
		if got.scope != "global" || !got.scopeGiven {
			t.Fatalf("=> %+v, want auto-detected global", got)
		}
	})

	t.Run("an explicit scope is never overridden by -y", func(t *testing.T) {
		entries := []skills.LedgerEntry{{
			SkillName: "pdf", Scope: "project", AgentID: "cursor",
			DestDir: filepath.Join(t.TempDir(), ".cursor", "skills", "pdf"),
		}}
		got := resolveUpdateScope(skillsUpdateOptions{yes: true, scope: "global", scopeGiven: true}, entries, t.TempDir())
		if got.scope != "global" || !got.scopeGiven {
			t.Fatalf("=> %+v, want the explicit global scope to survive", got)
		}
	})

	t.Run("execute filters on the recorded scope, not the directory", func(t *testing.T) {
		dataRoot := t.TempDir()
		proj := newSkillFixture(t, dataRoot, "proj-skill")
		proj.install(t, "opencode", "project", proj.SourceDir, "v1")
		glob := newSkillFixture(t, dataRoot, "glob-skill")
		glob.install(t, "opencode", "global", glob.SourceDir, "v1")
		proj.revise(t, "proj v2")
		glob.revise(t, "glob v2")

		results, err := executeSkillsUpdate(context.Background(), skillsUpdateOptions{scope: "project", scopeGiven: true, yes: true}, &config.PlatformPaths{DataRoot: dataRoot})
		if err != nil {
			t.Fatalf("executeSkillsUpdate failed: %v", err)
		}
		byName := map[string]skillUpdateResult{}
		for _, r := range results {
			byName[r.Name] = r
		}
		if got := byName["proj-skill"]; got.Status != "updated" {
			t.Fatalf("project entry must update under -p: %+v", got)
		}
		if got := byName["glob-skill"]; got.Status != "skipped" || !strings.Contains(got.Reason, "scope mismatch") {
			t.Fatalf("global entry must be skipped under -p: %+v", got)
		}
		if got := mustReadSkillBody(t, glob.DestDir); strings.Contains(got, "glob v2") {
			t.Fatalf("a scope-skipped entry must not be written:\n%s", got)
		}
	})
}

func TestRecordedSkillSourcePinHeuristic(t *testing.T) {
	// A bare commit recorded for an unpinned install is provenance, not a pin:
	// `git clone --branch <sha>` only works for a branch tip, so re-applying it
	// would break every update of an unpinned source.
	unpinned := skills.LedgerEntry{SkillName: "pdf", Source: "owner/repo", SourceRef: "0123456789abcdef0123456789abcdef01234567"}
	src, err := recordedSkillSource(unpinned)
	if err != nil {
		t.Fatalf("recordedSkillSource failed: %v", err)
	}
	if src.Pin != "" {
		t.Fatalf("a recorded commit %q must not become a pin", unpinned.SourceRef)
	}

	// A named ref is honoured.
	pinned := skills.LedgerEntry{SkillName: "pdf", Source: "owner/repo", SourceRef: "v2.1.0"}
	src, err = recordedSkillSource(pinned)
	if err != nil {
		t.Fatalf("recordedSkillSource failed: %v", err)
	}
	if src.Pin != "v2.1.0" {
		t.Fatalf("pin = %q, want v2.1.0", src.Pin)
	}

	// A GitHub browse label records the subpath appended to the clone URL;
	// it is split back out rather than mis-parsed into a clone URL with the
	// subpath inside it.
	browse := skills.LedgerEntry{SkillName: "pdf", Source: "https://github.com/acme/tools/skills/pdf", SourceRef: "main"}
	src, err = recordedSkillSource(browse)
	if err != nil {
		t.Fatalf("recordedSkillSource failed: %v", err)
	}
	if src.CloneURL != "https://github.com/acme/tools.git" || src.Subpath != "skills/pdf" || src.Pin != "main" {
		t.Fatalf("browse source rebuilt wrong: %+v", src)
	}
}
