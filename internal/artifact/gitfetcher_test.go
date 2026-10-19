package artifact

// gitfetcher_test.go — the commit-pinned git tree fetcher.
//
// The tests are hermetic: no network, no GitHub. A local git repository is
// created in a temp dir, committed, and fetched through a file:// locator
// that only the test-only opt-in allows. Everything else — the pin, the
// egress rules, the extraction limits, the canonical digest — is the
// production behaviour.

import (
	"archive/zip"
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

// gitFixtureRepo creates a repository with one commit and returns its
// directory and the commit id.
//
// The repository allows fetching a specific commit id
// (uploadpack.allowReachableSHA1InWant), which is what a public forge does
// and what the fetcher relies on: the pinned commit is fetched by id, never
// by a branch name.
func gitFixtureRepo(t *testing.T, files map[string]string) (dir string, commit string) {
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

// fileURLFor renders a local directory as a file:// locator.
func fileURLFor(dir string) string {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "file://" + filepath.ToSlash(dir)
	}
	return "file://" + filepath.ToSlash(abs)
}

// pluginFixtureFiles is the content of the fixture plugin: a manifest and a
// file next to it.
var pluginFixtureFiles = map[string]string{
	"plugins/demo/plugin.json": `{"name":"demo","mcpServers":{"demo":{"command":"npx","args":["-y","demo-mcp"]}}}`,
	"plugins/demo/server.js":   "console.log('demo')\n",
	"README.md":                "top level\n",
}

func gitTreeRef(repo, commit, subpath string) domain.ArtifactRef {
	return domain.ArtifactRef{
		ArtifactID:   "art_plugin_demo",
		Type:         domain.ArtifactGitTree,
		Locator:      fileURLFor(repo),
		ImmutableRef: commit,
		Subpath:      subpath,
		FetchPolicy:  domain.FetchImmutable,
	}
}

func TestGitTreeFetcherFetchesThePinnedCommit(t *testing.T) {
	repo, commit := gitFixtureRepo(t, pluginFixtureFiles)
	staging := t.TempDir()

	info, err := FetchGitTree(context.Background(), gitTreeRef(repo, commit, "plugins/demo"), staging, GitFetcherOptions{
		AllowLocalFileURL: true,
	})
	if err != nil {
		t.Fatalf("FetchGitTree: %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(staging, "plugin.json")); statErr != nil {
		t.Fatalf("the pinned subpath was not extracted: %v", statErr)
	}
	if _, statErr := os.Stat(filepath.Join(staging, "README.md")); statErr == nil {
		t.Fatal("a file outside the pinned subpath was extracted")
	}
	if info.FileCount != 2 {
		t.Errorf("file count = %d, want 2", info.FileCount)
	}
	// The digest is the canonical tree digest of exactly what was extracted.
	want, err := ComputeCanonicalTreeDigest(staging)
	if err != nil {
		t.Fatal(err)
	}
	if info.TreeDigest != want {
		t.Errorf("tree digest = %q, want the canonical digest %q", info.TreeDigest, want)
	}
}

func TestGitTreeFetcherDigestMatchesTheCanonicalDigestOfTheSameContent(t *testing.T) {
	repo, commit := gitFixtureRepo(t, pluginFixtureFiles)
	staging := t.TempDir()

	info, err := FetchGitTree(context.Background(), gitTreeRef(repo, commit, "plugins/demo"), staging, GitFetcherOptions{
		AllowLocalFileURL: true,
	})
	if err != nil {
		t.Fatalf("FetchGitTree: %v", err)
	}

	// The same content, extracted the other way (a zip archive through the
	// same extractor), must hash identically: a plugin's tree digest is the
	// canonical tree digest, not a git-specific one.
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range map[string]string{
		"plugin.json": pluginFixtureFiles["plugins/demo/plugin.json"],
		"server.js":   pluginFixtureFiles["plugins/demo/server.js"],
	} {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	zipPath := filepath.Join(t.TempDir(), "content.zip")
	if err := os.WriteFile(zipPath, buf.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
	other := t.TempDir()
	zipInfo, err := ExtractFileSafely(zipPath, "zip", other, DefaultExtractionLimits)
	if err != nil {
		t.Fatalf("ExtractFileSafely: %v", err)
	}
	if info.TreeDigest != zipInfo.TreeDigest {
		t.Fatalf("git tree digest %q differs from the canonical digest of the same content %q",
			info.TreeDigest, zipInfo.TreeDigest)
	}
}

func TestGitTreeFetcherRefusesACommitThatIsNotThePinnedOne(t *testing.T) {
	repo, commit := gitFixtureRepo(t, pluginFixtureFiles)
	other := strings.Repeat("a", 40)
	if other == commit {
		other = strings.Repeat("b", 40)
	}
	staging := t.TempDir()

	_, err := FetchGitTree(context.Background(), gitTreeRef(repo, other, "plugins/demo"), staging, GitFetcherOptions{
		AllowLocalFileURL: true,
	})
	if err == nil {
		t.Fatal("a fetch of a commit that does not exist was accepted")
	}
	if code := domain.ErrorCode(err); code != "LPSM-ARTIFACT-UNAVAILABLE" {
		t.Errorf("code = %q, want LPSM-ARTIFACT-UNAVAILABLE (%v)", code, err)
	}
	if entries, readErr := os.ReadDir(staging); readErr == nil && len(entries) > 0 {
		t.Errorf("a refused fetch left %d file(s) behind", len(entries))
	}
}

func TestGitTreeFetcherRefusesAMissingSubpath(t *testing.T) {
	repo, commit := gitFixtureRepo(t, pluginFixtureFiles)
	staging := t.TempDir()

	_, err := FetchGitTree(context.Background(), gitTreeRef(repo, commit, "plugins/nope"), staging, GitFetcherOptions{
		AllowLocalFileURL: true,
	})
	if err == nil {
		t.Fatal("a subpath that is not in the pinned commit was accepted")
	}
	if code := domain.ErrorCode(err); code != "LPSM-ARTIFACT-UNAVAILABLE" {
		t.Errorf("code = %q, want LPSM-ARTIFACT-UNAVAILABLE (%v)", code, err)
	}
	if !strings.Contains(err.Error(), "plugins/nope") {
		t.Errorf("the refusal does not name the missing path: %v", err)
	}
}

func TestGitTreeFetcherRefusesAnUnpinnedArtifact(t *testing.T) {
	repo, commit := gitFixtureRepo(t, pluginFixtureFiles)
	ref := gitTreeRef(repo, commit, "plugins/demo")
	ref.FetchPolicy = domain.FetchHeadRef
	ref.ImmutableRef = ""

	_, err := FetchGitTree(context.Background(), ref, t.TempDir(), GitFetcherOptions{AllowLocalFileURL: true})
	if err == nil {
		t.Fatal("an unpinned artifact was accepted")
	}
	if code := domain.ErrorCode(err); code != "LPSM-ARTIFACT-UNAVAILABLE" {
		t.Errorf("code = %q, want LPSM-ARTIFACT-UNAVAILABLE (%v)", code, err)
	}
}

func TestGitTreeFetcherRefusesAnUnknownArtifactType(t *testing.T) {
	repo, commit := gitFixtureRepo(t, pluginFixtureFiles)
	ref := gitTreeRef(repo, commit, "plugins/demo")
	ref.Type = domain.ArtifactArchive

	_, err := FetchGitTree(context.Background(), ref, t.TempDir(), GitFetcherOptions{AllowLocalFileURL: true})
	if err == nil {
		t.Fatal("a non git-tree artifact was accepted")
	}
	if code := domain.ErrorCode(err); code != "LPSM-ARTIFACT-UNAVAILABLE" {
		t.Errorf("code = %q, want LPSM-ARTIFACT-UNAVAILABLE (%v)", code, err)
	}
}

func TestGitTreeFetcherRefusesEverythingButHTTPS(t *testing.T) {
	repo, commit := gitFixtureRepo(t, pluginFixtureFiles)
	base := gitTreeRef(repo, commit, "plugins/demo")

	cases := []struct {
		name    string
		locator string
	}{
		{"plain http", "http://example.com/repo.git"},
		{"ssh", "ssh://git@example.com/repo.git"},
		{"git protocol", "git://example.com/repo.git"},
		{"credentials", "https://user:pass@example.com/repo.git"},
		{"loopback literal", "https://127.0.0.1/repo.git"},
		{"link-local literal", "https://169.254.169.254/repo.git"},
		{"private literal", "https://10.0.0.5/repo.git"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ref := base
			ref.Locator = tc.locator
			_, err := FetchGitTree(context.Background(), ref, t.TempDir(), GitFetcherOptions{})
			if err == nil {
				t.Fatalf("locator %q was accepted", tc.locator)
			}
			code := domain.ErrorCode(err)
			if code != "LPSM-EGRESS-BLOCKED" && code != "LPSM-ARTIFACT-UNAVAILABLE" {
				t.Errorf("code = %q, want LPSM-EGRESS-BLOCKED (%v)", code, err)
			}
		})
	}
}

func TestGitTreeFetcherRefusesAFileLocatorWithoutTheTestOptIn(t *testing.T) {
	repo, commit := gitFixtureRepo(t, pluginFixtureFiles)
	ref := gitTreeRef(repo, commit, "plugins/demo")

	_, err := FetchGitTree(context.Background(), ref, t.TempDir(), GitFetcherOptions{})
	if err == nil {
		t.Fatal("a file:// locator was accepted without the test opt-in")
	}
	if code := domain.ErrorCode(err); code != "LPSM-EGRESS-BLOCKED" {
		t.Errorf("code = %q, want LPSM-EGRESS-BLOCKED (%v)", code, err)
	}
}

func TestGitTreeFetcherRefusesATraversalSubpath(t *testing.T) {
	repo, commit := gitFixtureRepo(t, pluginFixtureFiles)
	for _, sub := range []string{"../escape", "/etc", "plugins/../../escape"} {
		ref := gitTreeRef(repo, commit, sub)
		_, err := FetchGitTree(context.Background(), ref, t.TempDir(), GitFetcherOptions{AllowLocalFileURL: true})
		if err == nil {
			t.Fatalf("subpath %q was accepted", sub)
		}
	}
}

func TestGitTreeFetcherRunsGitWithAHardenedEnvironment(t *testing.T) {
	env := gitCloneEnv("https", "/tmp/empty-git-config")
	if env["GIT_ALLOW_PROTOCOL"] != "https" {
		t.Errorf("GIT_ALLOW_PROTOCOL = %q, want \"https\"", env["GIT_ALLOW_PROTOCOL"])
	}
	if env["GIT_TERMINAL_PROMPT"] != "0" {
		t.Errorf("GIT_TERMINAL_PROMPT = %q, want \"0\"", env["GIT_TERMINAL_PROMPT"])
	}
	if env["GIT_LFS_SKIP_SMUDGE"] != "1" {
		t.Errorf("GIT_LFS_SKIP_SMUDGE = %q, want \"1\"", env["GIT_LFS_SKIP_SMUDGE"])
	}
	if env["GIT_ASKPASS"] != "" {
		t.Errorf("GIT_ASKPASS = %q, want an empty value", env["GIT_ASKPASS"])
	}
	if env["GIT_CONFIG_GLOBAL"] == "" || env["GIT_CONFIG_SYSTEM"] == "" {
		t.Error("the child git must not read the user's global or system config")
	}
}
