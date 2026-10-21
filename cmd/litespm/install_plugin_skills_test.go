package main

// install_plugin_skills_test.go — the portable half of a plugin.
//
// A plugin that bundles only skills used to be refused ("declares no MCP
// server"), which was this build's projection limit rather than a property of
// the plugin. These tests drive the whole path — plan (skills roots sealed),
// human approval, fetch of the pinned tree, ledger copy into the sealed root,
// component rows, reported skips — and pin the failures: an escaping path, a
// skill directory with no SKILL.md, and a partial install that must say so.

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/interop"
	"github.com/sarv-projects/litespm/internal/skills"
)

// pluginWithSkillSource gives the fixture a provenance URL the skills ledger
// can record. The bytes still come from the pinned tree; this is the source
// label a later `litespm skills list` reports.
func pluginWithSkillSource(listing *domain.Listing) *domain.Listing {
	listing.Source = domain.SourceReference{
		SourceID:   "example",
		UpstreamID: "demo-plugin",
		URL:        "https://github.com/example/demo-plugin",
	}
	return listing
}

// skillsOnlyPluginFiles is a plugin whose only portable component is a skill.
var skillsOnlyPluginFiles = map[string]string{
	"plugins/demo/plugin.json":         `{"name":"demo","version":"1.0.0","skills":["skills/pdf"]}`,
	"plugins/demo/skills/pdf/SKILL.md": "---\nname: pdf\ndescription: Work with PDF files\n---\n\nRead the PDF before answering.\n",
}

// mixedPluginFiles bundles one MCP server and one skill.
var mixedPluginFiles = map[string]string{
	"plugins/demo/plugin.json":         `{"name":"demo","version":"1.0.0","mcpServers":{"demo-scanner":{"command":"npx","args":["-y","demo-scanner"]}},"skills":["skills/pdf/SKILL.md"]}`,
	"plugins/demo/skills/pdf/SKILL.md": "---\nname: pdf\ndescription: Work with PDF files\n---\n\nRead the PDF.\n",
}

func TestSkillsOnlyPluginInstalls(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	home, _ := homeWithBridge(t)

	repo, commit := pluginFixtureRepo(t, skillsOnlyPluginFiles)
	listing := pluginWithSkillSource(pluginListing("plugin:example:skills-only"))
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))

	outcome, err := installDemoPlugin(t, db, dataRoot, listing, catClient, []string{"claude-code"})
	if err != nil {
		t.Fatalf("a skills-only plugin must install: %v", err)
	}
	if len(outcome.Servers) != 0 {
		t.Errorf("servers = %+v, want none", outcome.Servers)
	}
	if len(outcome.Skills) != 1 || outcome.Skills[0].SkillName != "pdf" {
		t.Fatalf("skills = %+v, want the one declared skill", outcome.Skills)
	}
	dest := filepath.Join(home, ".claude", "skills", "pdf")
	if _, err := os.Stat(filepath.Join(dest, "SKILL.md")); err != nil {
		t.Fatalf("the skill was not copied into the sealed root: %v", err)
	}
	if outcome.Skills[0].Destinations[0] != dest {
		t.Errorf("destination = %q, want %q", outcome.Skills[0].Destinations[0], dest)
	}

	// The copy is in the skills ledger: the same record a standalone skill
	// install writes, so `skills list` / `skills remove` see it.
	ledger, err := skills.OpenLedger(skills.LedgerPath(dataRoot))
	if err != nil {
		t.Fatal(err)
	}
	entries, err := ledger.All()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, e := range entries {
		if e.DestDir == dest && e.SkillName == "pdf" {
			found = true
			if e.SourceRef == "" {
				t.Error("the ledger entry records no source revision")
			}
		}
	}
	if !found {
		t.Fatalf("the copied skill has no ledger entry: %+v", entries)
	}

	// The install row exists and names the copied directory: an entry nothing
	// records is an orphan.
	rec, err := db.GetInstall(context.Background(), outcome.InstallID)
	if err != nil {
		t.Fatalf("install record: %v", err)
	}
	if rec.Kind != domain.KindPlugin || rec.InstallPath != dest {
		t.Errorf("install record = kind %q path %q, want plugin at %q", rec.Kind, rec.InstallPath, dest)
	}

	// Removal is symmetric: the ledger-driven path deletes the copy and its
	// row, exactly as it does for a standalone skill.
	if err := removeInstalledPackage(context.Background(), db, dataRoot, outcome.InstallID); err != nil {
		t.Fatalf("remove: %v", err)
	}
	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Errorf("removal left the copied skill at %s", dest)
	}
	remaining, err := ledger.All()
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range remaining {
		if e.DestDir == dest {
			t.Errorf("removal left the ledger row for %s", dest)
		}
	}
}

func TestMixedPluginInstallsBothPortableComponents(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	home, configPath := homeWithBridge(t)

	repo, commit := pluginFixtureRepo(t, mixedPluginFiles)
	listing := pluginWithSkillSource(pluginListing("plugin:example:mixed"))
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))

	outcome, err := installDemoPlugin(t, db, dataRoot, listing, catClient, []string{"claude-code"})
	if err != nil {
		t.Fatalf("install: %v", err)
	}
	config, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(config), `"demo-scanner"`) {
		t.Errorf("the MCP component was not registered:\n%s", config)
	}
	if len(outcome.Skills) != 1 {
		t.Fatalf("skills = %+v, want one", outcome.Skills)
	}
	if _, err := os.Stat(filepath.Join(home, ".claude", "skills", "pdf", "SKILL.md")); err != nil {
		t.Errorf("the skill component was not copied: %v", err)
	}
}

// partialPluginFiles bundles one portable skill with two host-specific classes
// LiteSPM has no adapter for. Its skip set is exactly the case the consent gate
// exists for.
var partialPluginFiles = map[string]string{
	"plugins/demo/plugin.json": `{"name":"demo","version":"1.0.0",
		"skills":["skills/pdf"],
		"hooks":{"PreToolUse":[{"command":"echo hi"}]},
		"commands":[{"name":"scan"}]}`,
	"plugins/demo/skills/pdf/SKILL.md": "---\nname: pdf\ndescription: Work with PDF files\n---\n",
}

// TestPluginRefusesAnUnacknowledgedPartialInstall pins the consent gate: a
// plugin that declares components this build cannot project installs only its
// portable half, so without --allow-partial it is refused before any write and
// the refusal names what would be skipped.
func TestPluginRefusesAnUnacknowledgedPartialInstall(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	home, configPath := homeWithBridge(t)
	original, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}

	repo, commit := pluginFixtureRepo(t, partialPluginFiles)
	listing := pluginWithSkillSource(pluginListing("plugin:example:partial"))
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))

	_, err = installDemoPlugin(t, db, dataRoot, listing, catClient, []string{"claude-code"})
	if err == nil {
		t.Fatal("a partial plugin install proceeded without the acknowledgement")
	}
	if code := domain.ErrorCode(err); code != "LPSM-INSTALL-PARTIAL" {
		t.Fatalf("code = %q, want LPSM-INSTALL-PARTIAL (%v)", code, err)
	}
	for _, want := range []string{"hooks", "commands", "--allow-partial"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("the refusal does not name %q: %v", want, err)
		}
	}

	// Nothing was written: no config edit, no copied skill, no install row.
	written, rerr := os.ReadFile(configPath)
	if rerr != nil {
		t.Fatal(rerr)
	}
	if string(written) != string(original) {
		t.Errorf("the refused install modified the host config:\n%s", written)
	}
	if _, serr := os.Stat(filepath.Join(home, ".claude", "skills", "pdf")); !os.IsNotExist(serr) {
		t.Errorf("the refused install copied the skill into %s", filepath.Join(home, ".claude", "skills", "pdf"))
	}
	installs, ierr := db.ListInstalls(context.Background(), domain.ScopeUser, "")
	if ierr != nil {
		t.Fatal(ierr)
	}
	if len(installs) != 0 {
		t.Errorf("the refused install recorded %d install(s): %+v", len(installs), installs)
	}
}

// TestPluginInstallsPartiallyWhenAcknowledged proves the other half: with the
// acknowledgement sealed in the plan the portable components install, the skip
// set is still reported, and the result says the install was partial AND that
// a person acknowledged it.
func TestPluginInstallsPartiallyWhenAcknowledged(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	home, _ := homeWithBridge(t)

	repo, commit := pluginFixtureRepo(t, partialPluginFiles)
	listing := pluginWithSkillSource(pluginListing("plugin:example:partial"))
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))

	outcome, err := installDemoPluginWithConsent(t, db, dataRoot, listing, catClient, []string{"claude-code"}, true)
	if err != nil {
		t.Fatalf("an acknowledged partial install must proceed: %v", err)
	}
	if !outcome.AllowPartial {
		t.Error("the outcome does not record the acknowledgement")
	}
	kinds := map[string]string{}
	for _, skipped := range outcome.Skipped {
		kinds[skipped.Kind] = skipped.Reason
	}
	for _, want := range []string{"hooks", "commands"} {
		if kinds[want] == "" {
			t.Errorf("%s were not reported as skipped: %+v", want, outcome.Skipped)
		}
	}
	if len(outcome.Skills) != 1 {
		t.Fatalf("skills = %+v, want the one portable component", outcome.Skills)
	}
	if _, serr := os.Stat(filepath.Join(home, ".claude", "skills", "pdf", "SKILL.md")); serr != nil {
		t.Errorf("the acknowledged install did not copy the portable component: %v", serr)
	}
	// The result must not claim the plugin is whole — and must say why it was
	// allowed to be partial.
	var out strings.Builder
	printPluginInstallTo(&out, outcome)
	if !strings.Contains(out.String(), "PARTIAL") {
		t.Errorf("the result does not say the install is partial:\n%s", out.String())
	}
	if !strings.Contains(out.String(), "acknowledged with --allow-partial") {
		t.Errorf("the result does not name the acknowledgement:\n%s", out.String())
	}
}

func TestResolvePluginSkillsRefusesAnEscapingSymlink(t *testing.T) {
	tree := t.TempDir()
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "SKILL.md"), []byte("---\nname: evil\ndescription: x\n---\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(tree, "skills")); err != nil {
		t.Skipf("symlinks are not available here: %v", err)
	}
	if _, err := resolveInsidePluginTree(tree, "skills"); err == nil {
		t.Fatal("a component path that resolves outside the plugin tree was accepted")
	}
	// A plain traversal is refused before the filesystem is touched.
	if _, err := resolveInsidePluginTree(tree, "../outside"); err == nil {
		t.Fatal("a traversal path was accepted")
	}
}

// A resolved child compared against an unresolved root is refused by the
// containment check, which is what broke every plugin install on macOS (where
// /var is a symlink to /private/var). Resolving the root too fixes it, and
// this test reproduces the shape without needing a Mac.
func TestResolvePluginSkillsAcceptsAPathThroughASymlinkedRoot(t *testing.T) {
	real := t.TempDir()
	skillDir := filepath.Join(real, "skills", "pdf")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte("---\nname: pdf\ndescription: x\n---\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "linked-tree")
	if err := os.Symlink(real, link); err != nil {
		t.Skipf("symlinks are not available here: %v", err)
	}

	got, err := resolveInsidePluginTree(link, "skills/pdf")
	if err != nil {
		t.Fatalf("a component inside a symlinked tree was refused: %v", err)
	}
	if !strings.HasSuffix(got, filepath.Join("skills", "pdf")) {
		t.Fatalf("resolved %q, want it to end at skills/pdf", got)
	}
}

func TestResolvePluginSkillsRefusesADirectoryWithoutSKILLmd(t *testing.T) {
	tree := t.TempDir()
	if err := os.MkdirAll(filepath.Join(tree, "skills", "empty"), 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := &interop.PluginInstallManifest{Skills: []interop.PluginSkill{{Name: "empty", Path: "skills/empty"}}}
	if _, err := resolvePluginSkills(tree, manifest); err == nil {
		t.Fatal("a declared skill directory without SKILL.md was accepted")
	}
}
