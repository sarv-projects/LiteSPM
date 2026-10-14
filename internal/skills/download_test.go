package skills

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// --- test helpers -----------------------------------------------------------

func skillMD(name, description string) string {
	return "---\nname: " + name + "\ndescription: " + description + "\n---\n\n# " + name + "\n"
}

func testDownloadServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	ts := httptest.NewTLSServer(handler)
	t.Cleanup(ts.Close)
	old := downloadHTTPClient
	downloadHTTPClient = ts.Client()
	t.Cleanup(func() { downloadHTTPClient = old })
	return ts
}

func serveBytes(t *testing.T, body []byte, contentType string) *httptest.Server {
	t.Helper()
	return testDownloadServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", contentType)
		_, _ = w.Write(body)
	})
}

// fetchDownload runs FetchSkillDownload and registers cleanup on success.
func fetchDownload(t *testing.T, raw string) (string, error) {
	t.Helper()
	root, cleanup, err := FetchSkillDownload(context.Background(), raw)
	if err == nil {
		t.Cleanup(cleanup)
	}
	return root, err
}

type zipEntry struct {
	name    string
	body    string
	symlink bool
}

func buildZip(t *testing.T, entries []zipEntry) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, e := range entries {
		hdr := &zip.FileHeader{Name: e.name, Method: zip.Deflate}
		if e.symlink {
			hdr.SetMode(os.ModeSymlink | 0o777)
		}
		w, err := zw.CreateHeader(hdr)
		if err != nil {
			t.Fatalf("zip create %q: %v", e.name, err)
		}
		if _, err := io.WriteString(w, e.body); err != nil {
			t.Fatalf("zip write %q: %v", e.name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

type tarEntry struct {
	name     string
	body     string
	typeflag byte
	link     string
}

func buildTar(t *testing.T, entries []tarEntry) []byte {
	t.Helper()
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	for _, e := range entries {
		hdr := &tar.Header{Name: e.name, Mode: 0o644, Size: int64(len(e.body)), Typeflag: e.typeflag}
		if hdr.Typeflag == 0 {
			hdr.Typeflag = tar.TypeReg
		}
		if e.link != "" {
			hdr.Linkname = e.link
			hdr.Size = 0
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("tar header %q: %v", e.name, err)
		}
		if hdr.Size > 0 {
			if _, err := tw.Write([]byte(e.body)); err != nil {
				t.Fatalf("tar write %q: %v", e.name, err)
			}
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func buildTarGz(t *testing.T, entries []tarEntry) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(buildTar(t, entries)); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// --- IsDirectDownloadSource -------------------------------------------------

func TestIsDirectDownloadSource(t *testing.T) {
	localDir := t.TempDir()
	cases := []struct {
		raw  string
		want bool
	}{
		{"", false},
		{localDir, false},
		{"https://example.com/skills.tar.gz", true},
		{"https://example.com/download", true},
		{"https://skills.example.com/a/b/c", true},
		{"https://example.com/skill.md", true},
		{"https://github.com/owner/repo", false},
		{"https://github.com:443/owner/repo", false},
		{"https://github.com/owner/repo.git", false},
		{"https://github.com/owner/repo/tree/main/skills/x", false},
		{"https://github.com/owner/repo/archive/refs/heads/main.zip", true},
		{"https://github.com/owner/repo/raw/main/skills/x/SKILL.md", true},
		{"https://github.com/owner/repo/releases/download/v1/skills.zip", true},
		{"https://raw.githubusercontent.com/owner/repo/main/skills/x/SKILL.md", true},
		{"https://codeload.github.com/owner/repo/tar.gz/main", true},
		{"https://gitlab.com/group/repo", false},
		{"https://gitlab.com/group/repo/-/archive/main/repo-main.zip", true},
		{"https://gitlab.com/group/repo/-/raw/main/SKILL.md", true},
		{"https://dev.azure.com/org/project/_git/repo", false},
		{"git@github.com:owner/repo.git", false},
		{"ssh://git@github.com/owner/repo.git", false},
		{"http://example.com/skills.zip", false},
		{"file:///tmp/skills.zip", false},
	}
	for _, c := range cases {
		if got := IsDirectDownloadSource(c.raw); got != c.want {
			t.Errorf("IsDirectDownloadSource(%q) = %v, want %v", c.raw, got, c.want)
		}
	}
}

// --- caps -------------------------------------------------------------------

func TestDownloadLimitsEnv(t *testing.T) {
	t.Setenv(downloadMaxBytesEnv, "")
	t.Setenv(extractMaxBytesEnv, "")
	t.Setenv(extractMaxFilesEnv, "")
	limits := downloadLimitsFromEnv()
	if limits.downloadMaxBytes != DefaultDownloadMaxBytes ||
		limits.extractMaxBytes != DefaultExtractMaxBytes ||
		limits.extractMaxFiles != DefaultExtractMaxFiles {
		t.Fatalf("defaults wrong: %+v", limits)
	}

	t.Setenv(downloadMaxBytesEnv, "2048")
	t.Setenv(extractMaxBytesEnv, "4096")
	t.Setenv(extractMaxFilesEnv, "7")
	limits = downloadLimitsFromEnv()
	if limits.downloadMaxBytes != 2048 || limits.extractMaxBytes != 4096 || limits.extractMaxFiles != 7 {
		t.Fatalf("overrides not honoured: %+v", limits)
	}

	// Non-positive or unparsable values fall back to the defaults.
	for _, bad := range []string{"0", "-1", "many"} {
		t.Setenv(downloadMaxBytesEnv, bad)
		t.Setenv(extractMaxBytesEnv, bad)
		t.Setenv(extractMaxFilesEnv, bad)
		limits = downloadLimitsFromEnv()
		if limits.downloadMaxBytes != DefaultDownloadMaxBytes ||
			limits.extractMaxBytes != DefaultExtractMaxBytes ||
			limits.extractMaxFiles != DefaultExtractMaxFiles {
			t.Fatalf("%q should fall back to defaults, got %+v", bad, limits)
		}
	}
}

// --- fetching ---------------------------------------------------------------

func TestFetchSkillDownloadRefusesNonHTTPS(t *testing.T) {
	for _, raw := range []string{"http://example.com/skills.zip", "file:///tmp/skills.zip"} {
		if _, _, err := FetchSkillDownload(context.Background(), raw); err == nil {
			t.Errorf("%q should be refused", raw)
		} else if !strings.Contains(err.Error(), "https") {
			t.Errorf("%q: error should name the https rule, got %v", raw, err)
		}
	}
}

func TestFetchSkillDownloadByteCapStopsOverLargeStream(t *testing.T) {
	t.Setenv(downloadMaxBytesEnv, "1024")
	ts := testDownloadServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		chunk := bytes.Repeat([]byte("a"), 256)
		for i := 0; i < 16; i++ { // 4 KiB total, well past the 1 KiB cap
			if _, err := w.Write(chunk); err != nil {
				return
			}
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
	})
	_, _, err := FetchSkillDownload(context.Background(), ts.URL+"/stream")
	if err == nil {
		t.Fatal("an over-large stream should be refused")
	}
	if !strings.Contains(err.Error(), "larger than 1024 bytes") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestFetchSkillDownloadBareSkillMarkdown(t *testing.T) {
	body := skillMD("lone-skill", "served without any extension")
	ts := serveBytes(t, []byte(body), "text/markdown")
	root, err := fetchDownload(t, ts.URL+"/skill")
	if err != nil {
		t.Fatalf("fetch failed: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(root, "SKILL.md"))
	if err != nil || string(data) != body {
		t.Fatalf("SKILL.md not materialized verbatim: %v", err)
	}
	found, err := DiscoverSkillsIncludingRoot(root)
	if err != nil || len(found) != 1 || found[0].Pkg.Name != "lone-skill" {
		t.Fatalf("single-file skill not discoverable: %v %+v", err, found)
	}
}

func TestFetchSkillDownloadArchiveSniffedWithoutExtension(t *testing.T) {
	zipBytes := buildZip(t, []zipEntry{
		{name: "repo-main/skills/cat/name/SKILL.md", body: skillMD("zip-skill", "from a zip")},
		{name: "repo-main/skills/cat/name/assets/note.txt", body: "note"},
	})
	// The URL has no extension and the server claims nothing helpful: only the
	// zip magic numbers can identify the payload.
	ts := serveBytes(t, zipBytes, "application/octet-stream")
	root, err := fetchDownload(t, ts.URL+"/download")
	if err != nil {
		t.Fatalf("fetch failed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "skills", "cat", "name", "assets", "note.txt")); err != nil {
		t.Fatalf("archive directory structure not preserved: %v", err)
	}
	found, err := DiscoverSkillsIncludingRoot(root)
	if err != nil || len(found) != 1 || found[0].Pkg.Name != "zip-skill" {
		t.Fatalf("archive skill not discoverable: %v %+v", err, found)
	}
}

func TestFetchSkillDownloadTarGzPreservesStructure(t *testing.T) {
	tarBytes := buildTarGz(t, []tarEntry{
		{name: "repo-main/skills/cat/name/SKILL.md", body: skillMD("gz-skill", "from a tar.gz")},
		{name: "repo-main/skills/cat/name/assets/data.json", body: "{}"},
	})
	ts := serveBytes(t, tarBytes, "application/gzip")
	root, err := fetchDownload(t, ts.URL+"/repo.tar.gz")
	if err != nil {
		t.Fatalf("fetch failed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "skills", "cat", "name", "assets", "data.json")); err != nil {
		t.Fatalf("archive directory structure not preserved: %v", err)
	}
	found, err := DiscoverSkillsIncludingRoot(root)
	if err != nil || len(found) != 1 || found[0].Pkg.Name != "gz-skill" {
		t.Fatalf("tar.gz skill not discoverable: %v %+v", err, found)
	}
}

func TestFetchSkillDownloadPlainTarWithoutMagic(t *testing.T) {
	tarBytes := buildTar(t, []tarEntry{
		{name: "lone/SKILL.md", body: skillMD("tar-skill", "from a plain tar")},
	})
	// No gzip/zip magic anywhere, and the content type says nothing: the
	// downloader must probe the tar structure before giving up.
	ts := serveBytes(t, tarBytes, "application/octet-stream")
	root, err := fetchDownload(t, ts.URL+"/download")
	if err != nil {
		t.Fatalf("fetch failed: %v", err)
	}
	found, err := DiscoverSkillsIncludingRoot(root)
	if err != nil || len(found) != 1 || found[0].Pkg.Name != "tar-skill" {
		t.Fatalf("plain tar skill not discoverable: %v %+v", err, found)
	}
}

// TestFetchSkillDownloadRejectsUnsafeZipEntries proves traversal, absolute and
// symlink entries are rejected before anything lands.
func TestFetchSkillDownloadRejectsUnsafeZipEntries(t *testing.T) {
	cases := []struct {
		name  string
		entry zipEntry
		want  string
	}{
		{"traversal", zipEntry{name: "../escape.txt", body: "x"}, "traversal"},
		{"nested traversal", zipEntry{name: "a/../../escape.txt", body: "x"}, "traversal"},
		{"absolute", zipEntry{name: "/etc/evil", body: "x"}, "absolute"},
		{"symlink", zipEntry{name: "link", symlink: true, body: "/etc/passwd"}, "symlink"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ts := serveBytes(t, buildZip(t, []zipEntry{c.entry}), "application/zip")
			_, _, err := FetchSkillDownload(context.Background(), ts.URL+"/x.zip")
			if err == nil {
				t.Fatal("unsafe zip entry should be rejected")
			}
			if !strings.Contains(err.Error(), c.want) {
				t.Errorf("error should mention %q, got %v", c.want, err)
			}
		})
	}
}

func TestFetchSkillDownloadRejectsUnsafeTarEntries(t *testing.T) {
	cases := []struct {
		name  string
		entry tarEntry
		want  string
	}{
		{"traversal", tarEntry{name: "../escape.txt", body: "x"}, "traversal"},
		{"absolute", tarEntry{name: "/etc/evil", body: "x"}, "absolute"},
		{"symlink", tarEntry{name: "link", typeflag: tar.TypeSymlink, link: "/etc/passwd"}, "unsupported"},
		{"hardlink", tarEntry{name: "hard", typeflag: tar.TypeLink, link: "other"}, "unsupported"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ts := serveBytes(t, buildTarGz(t, []tarEntry{c.entry}), "application/gzip")
			_, _, err := FetchSkillDownload(context.Background(), ts.URL+"/x.tgz")
			if err == nil {
				t.Fatal("unsafe tar entry should be rejected")
			}
			if !strings.Contains(err.Error(), c.want) {
				t.Errorf("error should mention %q, got %v", c.want, err)
			}
		})
	}
}

// TestFetchSkillDownloadGzipBombStoppedByExtractCap compresses a small archive
// that inflates far past the extracted-byte cap: the cap while reading must
// stop it, not the archive's advertised sizes.
func TestFetchSkillDownloadGzipBombStoppedByExtractCap(t *testing.T) {
	t.Setenv(extractMaxBytesEnv, "4096")
	body := strings.Repeat("0", 512*1024) // 512 KiB of a highly compressible byte
	bomb := buildTarGz(t, []tarEntry{{name: "repo-main/SKILL.md", body: body}})
	if len(bomb) > len(body)/10 {
		t.Fatalf("fixture is not bomb-shaped: compressed %d bytes for %d extracted", len(bomb), len(body))
	}
	ts := serveBytes(t, bomb, "application/gzip")
	_, _, err := FetchSkillDownload(context.Background(), ts.URL+"/bomb.tgz")
	if err == nil {
		t.Fatal("a decompression bomb should be stopped by the extracted-byte cap")
	}
	if !strings.Contains(err.Error(), "extracts to more than 4096") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestFetchSkillDownloadFileCountCap(t *testing.T) {
	t.Setenv(extractMaxFilesEnv, "2")
	zipBytes := buildZip(t, []zipEntry{
		{name: "a/SKILL.md", body: skillMD("a", "d")},
		{name: "b.txt", body: "b"},
		{name: "c.txt", body: "c"},
	})
	ts := serveBytes(t, zipBytes, "application/zip")
	if _, _, err := FetchSkillDownload(context.Background(), ts.URL+"/many.zip"); err == nil || !strings.Contains(err.Error(), "too many entries") {
		t.Errorf("zip file-count cap: got %v", err)
	}

	tarBytes := buildTarGz(t, []tarEntry{
		{name: "a/SKILL.md", body: skillMD("a", "d")},
		{name: "b.txt", body: "b"},
		{name: "c.txt", body: "c"},
	})
	ts = serveBytes(t, tarBytes, "application/gzip")
	if _, _, err := FetchSkillDownload(context.Background(), ts.URL+"/many.tgz"); err == nil || !strings.Contains(err.Error(), "too many entries") {
		t.Errorf("tar file-count cap: got %v", err)
	}
}

func TestFetchSkillDownloadRejectsNonSkill(t *testing.T) {
	ts := serveBytes(t, []byte("this is neither a skill nor an archive"), "text/plain")
	_, _, err := FetchSkillDownload(context.Background(), ts.URL+"/readme")
	if err == nil || !strings.Contains(err.Error(), "not a SKILL.md file or a supported archive") {
		t.Errorf("unexpected error: %v", err)
	}
}
