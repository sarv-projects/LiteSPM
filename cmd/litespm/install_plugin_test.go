package main

// install_plugin_test.go — the plugin install path.
//
// The tests are hermetic: no network, no GitHub. A local git repository
// holds the plugin's tree, and the fetch reaches it through the test-only
// file:// opt-in. What is under test is the whole path — plan, human
// approval, policy gate, host-config write, ledger rows — and the fact that
// `litespm install remove` puts the config back byte-for-byte.

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/artifact"
	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/state"
)

// pluginFixtureRepo creates a repository holding one plugin and returns its
// directory and the commit id.
func pluginFixtureRepo(t *testing.T, files map[string]string) (dir string, commit string) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dir = t.TempDir()
	run := func(args ...string) string {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Fixture", "GIT_AUTHOR_EMAIL=fixture@example.invalid",
			"GIT_COMMITTER_NAME=Fixture", "GIT_COMMITTER_EMAIL=fixture@example.invalid",
			"GIT_CONFIG_GLOBAL="+filepath.Join(dir, "no-global-config"),
			"GIT_CONFIG_SYSTEM="+filepath.Join(dir, "no-system-config"),
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
		return strings.TrimSpace(string(out))
	}
	run("init", "--quiet", "-b", "main")
	run("config", "uploadpack.allowReachableSHA1InWant", "true")
	run("config", "uploadpack.allowAnySHA1InWant", "true")
	for name, body := range files {
		full := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	run("add", "-A")
	run("commit", "--quiet", "-m", "fixture")
	return dir, run("rev-parse", "HEAD")
}

// pluginFileURL renders a local directory as a file:// locator.
func pluginFileURL(dir string) string {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "file://" + filepath.ToSlash(dir)
	}
	return "file://" + filepath.ToSlash(abs)
}

// pluginListing is the catalog row of a plugin.
func pluginListing(id string) *domain.Listing {
	return &domain.Listing{
		SchemaVersion:  2,
		ID:             id,
		Kind:           domain.KindPlugin,
		Name:           "demo-plugin",
		Summary:        "a plugin fixture",
		Status:         domain.ListingStatusActive,
		Installability: domain.InstallabilityMetadataVerified,
		Versions:       []domain.VersionSummary{{Version: "1.0.0"}},
	}
}

// pluginCatalog seeds a catalog client with the plugin's listing and its
// published version record.
func pluginCatalog(t *testing.T, listing *domain.Listing, ref domain.ArtifactRef) *catalog.Client {
	t.Helper()
	client := catalog.NewClient("https://registry.invalid", filepath.Join(t.TempDir(), "catalog"), nil)
	client.IndexListings([]*domain.Listing{listing})
	client.IndexVersionRecords([]*domain.VersionRecord{{
		ListingID: listing.ID,
		Version:   "1.0.0",
		Artifacts: []domain.ArtifactRef{ref},
	}})
	return client
}

// pluginGitRef is the artifact of the fixture plugin: a pinned commit in a
// local repository.
func pluginGitRef(repo, commit string) domain.ArtifactRef {
	return domain.ArtifactRef{
		ArtifactID:   "art_plugin_demo",
		Type:         domain.ArtifactGitTree,
		Locator:      pluginFileURL(repo),
		ImmutableRef: commit,
		Subpath:      "plugins/demo",
		FetchPolicy:  domain.FetchImmutable,
	}
}

// allowLocalPluginFetch points the plugin fetch at a local fixture
// repository for the duration of the test.
func allowLocalPluginFetch(t *testing.T) {
	t.Helper()
	previous := pluginFetchOptions
	pluginFetchOptions.AllowLocalFileURL = true
	t.Cleanup(func() { pluginFetchOptions = previous })
}

// demoPluginFiles is a plugin that declares one MCP server.
var demoPluginFiles = map[string]string{
	"plugins/demo/plugin.json": `{"name":"demo","version":"1.0.0","mcpServers":{"demo-scanner":{"command":"npx","args":["-y","demo-scanner"]}}}`,
	"plugins/demo/server.js":   "console.log('demo')\n",
}

// installDemoPlugin runs the whole path: plan, approval, install.
func installDemoPlugin(t *testing.T, db *state.DB, dataRoot string, listing *domain.Listing, catClient *catalog.Client, hosts []string) (*pluginInstallOutcome, error) {
	t.Helper()
	ctx := context.Background()
	grant, _, err := authorizeHumanPluginInstall(ctx, db, catClient, listing, "1.0.0", domain.ScopeUser, "", hosts, true, false, nil)
	if err != nil {
		return nil, err
	}
	binding, err := pluginInstallBindingFromPlan(ctx, grant.Plan, listing, domain.ScopeUser)
	if err != nil {
		return nil, err
	}
	return installPluginFromListing(grant.context(ctx), db, dataRoot, listing, grant.Version, domain.ScopeUser, "", binding)
}

func TestInstallPluginRegistersTheDeclaredMCPServersAndRemovesThem(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	_, configPath := homeWithBridge(t)

	repo, commit := pluginFixtureRepo(t, demoPluginFiles)
	listing := pluginListing("plugin:example:demo-plugin")
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))

	outcome, err := installDemoPlugin(t, db, dataRoot, listing, catClient, []string{"claude-code"})
	if err != nil {
		t.Fatalf("install: %v", err)
	}

	// The host config gained the plugin's MCP server entry, and nothing else
	// was disturbed.
	written, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(written), `"demo-scanner"`) {
		t.Fatalf("the plugin's server entry was not written:\n%s", written)
	}
	if !strings.Contains(string(written), `"litespm"`) || !strings.Contains(string(written), `"mine"`) {
		t.Fatalf("existing entries were disturbed:\n%s", written)
	}

	// The install, the component and the host registration rows exist: an
	// entry in a config that nothing records is an orphan.
	rec, err := db.GetInstall(context.Background(), outcome.InstallID)
	if err != nil {
		t.Fatalf("install record: %v", err)
	}
	if rec.Kind != domain.KindPlugin || rec.ListingID != listing.ID {
		t.Errorf("unexpected install record: %+v", rec)
	}
	if rec.TreeDigest == "" {
		t.Error("the install row records no tree digest")
	}
	components, err := db.ListInstallComponents(context.Background(), outcome.InstallID)
	if err != nil {
		t.Fatalf("components: %v", err)
	}
	if len(components) != 1 || components[0].ComponentName != "demo-scanner" {
		t.Errorf("components = %+v, want the one declared server", components)
	}

	// The removal is symmetric: the plugin's own entry is gone, the user's
	// entries are untouched, and the rows that described the install are
	// gone with it.
	if err := removeInstalledPackage(context.Background(), db, dataRoot, outcome.InstallID); err != nil {
		t.Fatalf("remove: %v", err)
	}
	after, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(after), `"demo-scanner"`) {
		t.Fatalf("the plugin's entry survived the removal:\n%s", after)
	}
	if !strings.Contains(string(after), `"litespm"`) || !strings.Contains(string(after), `"mine"`) {
		t.Fatalf("the user's own entries were disturbed by the removal:\n%s", after)
	}
	if _, err := db.GetInstall(context.Background(), outcome.InstallID); err == nil {
		t.Error("the install row survived the removal")
	}
}

// TestInstallPluginRestoreReplaysTheBackupByteForByte proves the second half
// of reversibility: the pre-install backup is kept, and `litespm restore`
// replays it byte-for-byte, so the machine can be put back exactly as it
// was — not merely structurally.
func TestInstallPluginRestoreReplaysTheBackupByteForByte(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	_, configPath := homeWithBridge(t)
	original, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}

	repo, commit := pluginFixtureRepo(t, demoPluginFiles)
	listing := pluginListing("plugin:example:demo-plugin")
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))

	outcome, err := installDemoPlugin(t, db, dataRoot, listing, catClient, []string{"claude-code"})
	if err != nil {
		t.Fatalf("install: %v", err)
	}
	if _, err := restoreInstall(context.Background(), db, dataRoot, outcome.InstallID); err != nil {
		t.Fatalf("restore: %v", err)
	}
	after, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(original) {
		t.Fatalf("the restore did not replay the backup byte-for-byte:\n%s", after)
	}
}

func TestInstallPluginRefusesWithoutAnApprovedPlan(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	_, configPath := homeWithBridge(t)
	original, _ := os.ReadFile(configPath)

	repo, commit := pluginFixtureRepo(t, demoPluginFiles)
	listing := pluginListing("plugin:example:demo-plugin")
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))
	ctx := context.Background()
	grant, _, err := authorizeHumanPluginInstall(ctx, db, catClient, listing, "1.0.0", domain.ScopeUser, "", []string{"claude-code"}, true, false, nil)
	if err != nil {
		t.Fatalf("authorize: %v", err)
	}
	binding, err := pluginInstallBindingFromPlan(ctx, grant.Plan, listing, domain.ScopeUser)
	if err != nil {
		t.Fatalf("binding: %v", err)
	}
	// No approval in the context: the installer must refuse before it
	// fetches anything.
	_, err = installPluginFromListing(ctx, db, dataRoot, listing, grant.Version, domain.ScopeUser, "", binding)
	if err == nil {
		t.Fatal("an unapproved plugin install proceeded")
	}
	if code := domain.ErrorCode(err); code != "LPSM-POLICY-UNAUTHORIZED" {
		t.Errorf("code = %q, want LPSM-POLICY-UNAUTHORIZED (%v)", code, err)
	}
	after, _ := os.ReadFile(configPath)
	if string(after) != string(original) {
		t.Error("a refused install modified the config")
	}
}

func TestInstallPluginRefusesAnArtifactWithNoPin(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	listing := pluginListing("plugin:example:demo-plugin")
	repo, commit := pluginFixtureRepo(t, demoPluginFiles)
	ref := pluginGitRef(repo, commit)
	ref.FetchPolicy = domain.FetchHeadRef
	ref.ImmutableRef = ""
	catClient := pluginCatalog(t, listing, ref)

	_, _, err := authorizeHumanPluginInstall(context.Background(), db, catClient, listing, "1.0.0",
		domain.ScopeUser, "", []string{"claude-code"}, true, false, nil)
	if err == nil {
		t.Fatal("an unpinned plugin artifact was accepted")
	}
	if code := domain.ErrorCode(err); code != "LPSM-ARTIFACT-UNAVAILABLE" {
		t.Errorf("code = %q, want LPSM-ARTIFACT-UNAVAILABLE (%v)", code, err)
	}
}

func TestInstallPluginRefusesAPluginWithNoArtifact(t *testing.T) {
	db := openTestState(t)
	listing := pluginListing("plugin:example:demo-plugin")
	catClient := pluginCatalog(t, listing, domain.ArtifactRef{})

	_, _, err := authorizeHumanPluginInstall(context.Background(), db, catClient, listing, "1.0.0",
		domain.ScopeUser, "", []string{"claude-code"}, true, false, nil)
	if err == nil {
		t.Fatal("a plugin with no artifact was accepted")
	}
	if code := domain.ErrorCode(err); code != "LPSM-ARTIFACT-UNAVAILABLE" {
		t.Errorf("code = %q, want LPSM-ARTIFACT-UNAVAILABLE (%v)", code, err)
	}
}

func TestInstallPluginRefusesAnUnknownArtifactType(t *testing.T) {
	db := openTestState(t)
	listing := pluginListing("plugin:example:demo-plugin")
	ref := domain.ArtifactRef{
		ArtifactID: "art_x", Type: domain.ArtifactArchive,
		Locator: "https://example.com/plugin.zip", Digest: "sha256:" + strings.Repeat("a", 64),
		FetchPolicy: domain.FetchImmutable,
	}
	catClient := pluginCatalog(t, listing, ref)

	_, _, err := authorizeHumanPluginInstall(context.Background(), db, catClient, listing, "1.0.0",
		domain.ScopeUser, "", []string{"claude-code"}, true, false, nil)
	if err == nil {
		t.Fatal("a non git-tree artifact was accepted")
	}
	if code := domain.ErrorCode(err); code != "LPSM-ARTIFACT-UNAVAILABLE" {
		t.Errorf("code = %q, want LPSM-ARTIFACT-UNAVAILABLE (%v)", code, err)
	}
}

func TestInstallPluginRefusesAnUnparseableManifest(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	_, configPath := homeWithBridge(t)
	original, _ := os.ReadFile(configPath)

	repo, commit := pluginFixtureRepo(t, map[string]string{
		"plugins/demo/plugin.json": "{ this is not json",
	})
	listing := pluginListing("plugin:example:demo-plugin")
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))

	_, err := installDemoPlugin(t, db, dataRoot, listing, catClient, []string{"claude-code"})
	if err == nil {
		t.Fatal("an unparseable manifest was accepted")
	}
	after, _ := os.ReadFile(configPath)
	if string(after) != string(original) {
		t.Error("a refused install modified the config")
	}
}

func TestInstallPluginRefusesAManifestWithACommandSource(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	_, configPath := homeWithBridge(t)
	original, _ := os.ReadFile(configPath)

	repo, commit := pluginFixtureRepo(t, map[string]string{
		"plugins/demo/plugin.json": `{"name":"demo","source":{"source":"command","command":"sh install.sh"},"mcpServers":{"demo":{"command":"npx"}}}`,
	})
	listing := pluginListing("plugin:example:demo-plugin")
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))

	_, err := installDemoPlugin(t, db, dataRoot, listing, catClient, []string{"claude-code"})
	if err == nil {
		t.Fatal("a manifest with a command source was accepted")
	}
	if !strings.Contains(err.Error(), "LPSM-IMPORT-005") {
		t.Errorf("the refusal does not carry the command-source code: %v", err)
	}
	after, _ := os.ReadFile(configPath)
	if string(after) != string(original) {
		t.Error("a refused install modified the config")
	}
}

func TestInstallPluginRefusesAPluginThatDeclaresNoMCPServer(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	_, configPath := homeWithBridge(t)
	original, _ := os.ReadFile(configPath)

	repo, commit := pluginFixtureRepo(t, map[string]string{
		"plugins/demo/plugin.json": `{"name":"demo","commands":[{"name":"scan"}]}`,
	})
	listing := pluginListing("plugin:example:demo-plugin")
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))

	_, err := installDemoPlugin(t, db, dataRoot, listing, catClient, []string{"claude-code"})
	if err == nil {
		t.Fatal("a plugin with no MCP server was accepted")
	}
	if code := domain.ErrorCode(err); code != "LPSM-ARTIFACT-UNAVAILABLE" {
		t.Errorf("code = %q, want LPSM-ARTIFACT-UNAVAILABLE (%v)", code, err)
	}
	if !strings.Contains(err.Error(), "no MCP server") {
		t.Errorf("the refusal does not say what is missing: %v", err)
	}
	after, _ := os.ReadFile(configPath)
	if string(after) != string(original) {
		t.Error("a refused install modified the config")
	}
}

func TestInstallPluginRefusesALaunchLineWithAPlaceholder(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	_, configPath := homeWithBridge(t)
	original, _ := os.ReadFile(configPath)

	repo, commit := pluginFixtureRepo(t, map[string]string{
		"plugins/demo/plugin.json": `{"name":"demo","mcpServers":{"demo":{"command":"${CLAUDE_PLUGIN_ROOT}/server.js"}}}`,
	})
	listing := pluginListing("plugin:example:demo-plugin")
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))

	_, err := installDemoPlugin(t, db, dataRoot, listing, catClient, []string{"claude-code"})
	if err == nil {
		t.Fatal("a launch line with a placeholder was accepted")
	}
	after, _ := os.ReadFile(configPath)
	if string(after) != string(original) {
		t.Error("a refused install modified the config")
	}
}

func TestInstallPluginRefusesAHostThatCannotTakeTheEntry(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	dataRoot := t.TempDir()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))

	// A plugin that declares a REMOTE server, installed into a host that
	// documents no remote entry spelling: the host cannot take the entry,
	// so the install refuses instead of writing a broken one.
	repo, commit := pluginFixtureRepo(t, map[string]string{
		"plugins/demo/plugin.json": `{"name":"demo","mcpServers":{"demo-remote":{"url":"https://mcp.example.com/mcp","type":"http"}}}`,
	})
	listing := pluginListing("plugin:example:demo-plugin")
	catClient := pluginCatalog(t, listing, pluginGitRef(repo, commit))

	_, err := installDemoPlugin(t, db, dataRoot, listing, catClient, []string{"roo"})
	if err == nil {
		t.Fatal("a host that cannot take a remote entry was accepted")
	}
	if code := domain.ErrorCode(err); code != "LPSM-INSTALL-TARGET-UNAVAILABLE" {
		t.Errorf("code = %q, want LPSM-INSTALL-TARGET-UNAVAILABLE (%v)", code, err)
	}
}

func TestInstallPluginRefusesAnEntryNameThatCollides(t *testing.T) {
	allowLocalPluginFetch(t)
	db := openTestState(t)
	_, configPath := homeWithBridge(t)
	original, _ := os.ReadFile(configPath)

	// The host already registers a server with the plugin's name.
	listing := pluginListing("plugin:example:demo-plugin")
	withCollision := map[string]string{
		"plugins/demo/plugin.json": `{"name":"demo","mcpServers":{"mine":{"command":"npx"}}}`,
	}
	repo2, commit2 := pluginFixtureRepo(t, withCollision)
	catClient2 := pluginCatalog(t, listing, pluginGitRef(repo2, commit2))

	_, err := installDemoPlugin(t, db, t.TempDir(), listing, catClient2, []string{"claude-code"})
	if err == nil {
		t.Fatal("a colliding entry name was accepted")
	}
	if code := domain.ErrorCode(err); code != "LPSM-NAME-CONFLICT" {
		t.Errorf("code = %q, want LPSM-NAME-CONFLICT (%v)", code, err)
	}
	after, _ := os.ReadFile(configPath)
	if string(after) != string(original) {
		t.Error("a refused install modified the config")
	}
}

func TestPluginFetchOptionsAreTheStrictProductionOnes(t *testing.T) {
	// The test seam must not weaken the production posture: the local-file
	// opt-in is off unless a test turns it on.
	if pluginFetchOptions.AllowLocalFileURL {
		t.Fatal("the production fetch options allow a local repository")
	}
	if pluginFetchOptions.Timeout <= 0 {
		t.Error("the production fetch has no timeout")
	}
	_ = artifact.DefaultGitFetcherOptions()
}
