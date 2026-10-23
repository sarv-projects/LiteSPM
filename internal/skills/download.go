package skills

// download.go — direct-download skill sources.
//
// A source that is not a git repository and not a local directory is fetched
// over https as a direct download: either a single SKILL.md body, or an
// archive (zip, tar, tar.gz/tgz) whose bytes sniff as one. No file extension
// is required: the magic numbers are the decision, and Content-Type is only a
// second opinion. The download and its extraction are bounded while reading
// (an advertised Content-Length is a hint, never the trusted limit), archive
// entries that could escape the extraction directory are refused, and the
// result is a plain directory the discovery walk can read.
//
// The three caps are named exactly as the reference installer names them, so
// an existing environment keeps its settings: SKILLS_DOWNLOAD_MAX_BYTES (10
// MiB), SKILLS_EXTRACT_MAX_BYTES (25 MiB) and SKILLS_EXTRACT_MAX_FILES (1000).

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	// DefaultDownloadMaxBytes bounds one downloaded file.
	DefaultDownloadMaxBytes int64 = 10 << 20 // 10 MiB
	// DefaultExtractMaxBytes bounds the total bytes an archive may extract to.
	DefaultExtractMaxBytes int64 = 25 << 20 // 25 MiB
	// DefaultExtractMaxFiles bounds the number of archive entries.
	DefaultExtractMaxFiles = 1000

	downloadMaxBytesEnv = "SKILLS_DOWNLOAD_MAX_BYTES"
	extractMaxBytesEnv  = "SKILLS_EXTRACT_MAX_BYTES"
	extractMaxFilesEnv  = "SKILLS_EXTRACT_MAX_FILES"
)

// downloadHTTPClient performs direct downloads. It is a package variable so
// tests can point it at a TLS test server. The redirect policy keeps the
// https-only rule across hops: a plaintext redirect is the one way a download
// would leave it.
var downloadHTTPClient = &http.Client{
	Timeout: 30 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return errors.New("stopped after 10 redirects")
		}
		if req.URL.Scheme != "https" {
			return fmt.Errorf("refusing redirect to non-https URL %s", req.URL)
		}
		return nil
	},
}

type downloadLimits struct {
	downloadMaxBytes int64
	extractMaxBytes  int64
	extractMaxFiles  int
}

func envPositiveInt64(name string, fallback int64) int64 {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func envPositiveInt(name string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func downloadLimitsFromEnv() downloadLimits {
	return downloadLimits{
		downloadMaxBytes: envPositiveInt64(downloadMaxBytesEnv, DefaultDownloadMaxBytes),
		extractMaxBytes:  envPositiveInt64(extractMaxBytesEnv, DefaultExtractMaxBytes),
		extractMaxFiles:  envPositiveInt(extractMaxFilesEnv, DefaultExtractMaxFiles),
	}
}

// IsDirectDownloadSource reports whether raw names a direct download — a
// single SKILL.md or an archive — rather than a git repository or a local
// directory. The decision lives here alone so every caller classifies a source
// the same way:
//
//   - a local directory on disk is a local source;
//   - git@host:path and ssh:// URLs are git sources;
//   - a host in the recognized git-host table (ParseSkillSource's) is a git
//     source;
//   - a URL whose path ends in .git is a git source;
//   - hosted raw/archive/release URLs (GitHub/GitLab exports) are downloads;
//   - any other https URL is a download, with no extension required.
//
// http:// and file: are neither: they stay refused by ParseSkillSource, which
// is where the https-only rule is enforced.
func IsDirectDownloadSource(raw string) bool {
	s := strings.TrimSpace(raw)
	if s == "" || strings.HasPrefix(s, "git@") {
		return false
	}
	if fi, err := os.Stat(s); err == nil && fi.IsDir() {
		return false
	}
	if !strings.HasPrefix(s, "https://") {
		return false
	}
	u, err := url.Parse(s)
	if err != nil || u.Host == "" {
		return false
	}
	if isSkillDirectoryHost(u.Hostname()) {
		return false
	}
	if isHostedArtifactURL(u) {
		return true
	}
	if knownGitHosts[strings.ToLower(u.Hostname())] {
		return false
	}
	return !strings.HasSuffix(strings.TrimRight(u.Path, "/"), ".git")
}

// FetchSkillDownload downloads raw over https, refuses anything that is not a
// SKILL.md body or a supported archive, and returns a local directory holding
// the skill tree plus a cleanup function that removes the temporary tree.
//
// The download is bounded while reading: Content-Length is only a rejection
// hint, and a decompression bomb is stopped by the extracted-byte counter, not
// by the archive's advertised sizes. The returned directory is the archive's
// single top-level directory when it has exactly one, otherwise the extraction
// root; discovery uses DiscoverSkillsIncludingRoot so a root SKILL.md works.
func FetchSkillDownload(ctx context.Context, raw string) (root string, cleanup func(), err error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", nil, fmt.Errorf("empty download URL")
	}
	u, uerr := url.Parse(s)
	if uerr != nil {
		return "", nil, fmt.Errorf("invalid download URL %q", raw)
	}
	if u.Scheme != "https" {
		return "", nil, fmt.Errorf("refusing to download %q: only https URLs are accepted", raw)
	}
	if u.Host == "" {
		return "", nil, fmt.Errorf("invalid download URL %q: no host", raw)
	}
	limits := downloadLimitsFromEnv()

	tmp, terr := os.MkdirTemp("", "litespm-skill-download-*")
	if terr != nil {
		return "", nil, terr
	}
	cleanup = func() { _ = os.RemoveAll(tmp) }

	downloaded := filepath.Join(tmp, "source.download")
	contentType, derr := downloadToFile(ctx, s, downloaded, limits)
	if derr != nil {
		cleanup()
		return "", nil, derr
	}
	fi, serr := os.Stat(downloaded)
	if serr != nil {
		cleanup()
		return "", nil, serr
	}
	if fi.Size() == 0 {
		cleanup()
		return "", nil, fmt.Errorf("downloaded %s is empty", s)
	}

	extractDir := filepath.Join(tmp, "extract")
	kind, kerr := detectArchiveKind(downloaded, contentType)
	if kerr != nil {
		cleanup()
		return "", nil, kerr
	}

	if kind != "" {
		if xerr := extractArchive(downloaded, kind, extractDir, limits); xerr != nil {
			// The bytes won (no magic) but the header claimed an archive:
			// give the bare-SKILL.md interpretation one chance before failing.
			if skillDir, ok := writeBareSkill(tmp, downloaded); ok {
				return skillDir, cleanup, nil
			}
			cleanup()
			return "", nil, fmt.Errorf("extracting %s: %w", s, xerr)
		}
		return extractedRoot(extractDir), cleanup, nil
	}

	// A body that is not an archive may be a single-file skill: a bare SKILL.md
	// body (frontmatter with both required fields).
	if skillDir, ok := writeBareSkill(tmp, downloaded); ok {
		return skillDir, cleanup, nil
	}

	// A plain tar carries no leading magic; probe it before failing.
	if isTarFile(downloaded) {
		if xerr := extractArchive(downloaded, "tar", extractDir, limits); xerr != nil {
			cleanup()
			return "", nil, fmt.Errorf("extracting %s: %w", s, xerr)
		}
		return extractedRoot(extractDir), cleanup, nil
	}

	cleanup()
	return "", nil, fmt.Errorf("downloaded %s is not a SKILL.md file or a supported archive", s)
}

// extractedRoot returns the archive's single top-level directory when it has
// exactly one, otherwise the extraction directory itself.
func extractedRoot(extractDir string) string {
	if single := singleTopLevelDirectory(extractDir); single != "" {
		return single
	}
	return extractDir
}

// writeBareSkill materializes a downloaded body as a single-file skill when it
// parses as SKILL.md with both required fields.
func writeBareSkill(tmp, downloaded string) (string, bool) {
	data, err := os.ReadFile(downloaded)
	if err != nil {
		return "", false
	}
	pkg, perr := ParseSkillMD(data)
	if perr != nil || strings.TrimSpace(pkg.Name) == "" || strings.TrimSpace(pkg.Description) == "" {
		return "", false
	}
	dir := filepath.Join(tmp, "skill")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", false
	}
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), data, 0o644); err != nil {
		return "", false
	}
	return dir, true
}

// downloadToFile streams raw into dst, enforcing the download cap as bytes
// arrive, and returns the response's media type (sans parameters).
func downloadToFile(ctx context.Context, raw, dst string, limits downloadLimits) (contentType string, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return "", fmt.Errorf("downloading %s: %w", raw, err)
	}
	resp, err := downloadHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("downloading %s: %w", raw, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return "", fmt.Errorf("download failed with HTTP %s", resp.Status)
	}
	if resp.Request != nil && resp.Request.URL != nil && resp.Request.URL.Scheme != "https" {
		return "", fmt.Errorf("refusing to download %s: resolved to non-https URL %s", raw, resp.Request.URL)
	}
	// The declared length is a rejection hint, never the limit that is trusted.
	if cl := strings.TrimSpace(resp.Header.Get("Content-Length")); cl != "" {
		if n, perr := strconv.ParseInt(cl, 10, 64); perr == nil && n > limits.downloadMaxBytes {
			return "", downloadTooLarge(limits.downloadMaxBytes)
		}
	}
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", err
	}
	n, copyErr := io.Copy(out, io.LimitReader(resp.Body, limits.downloadMaxBytes+1))
	closeErr := out.Close()
	if copyErr != nil {
		return "", fmt.Errorf("downloading %s: %w", raw, copyErr)
	}
	if closeErr != nil {
		return "", closeErr
	}
	if n > limits.downloadMaxBytes {
		return "", downloadTooLarge(limits.downloadMaxBytes)
	}
	ct := strings.ToLower(strings.TrimSpace(resp.Header.Get("Content-Type")))
	if i := strings.IndexByte(ct, ';'); i >= 0 {
		ct = strings.TrimSpace(ct[:i])
	}
	return ct, nil
}

func downloadTooLarge(max int64) error {
	return fmt.Errorf("download is larger than %d bytes; set %s to override", max, downloadMaxBytesEnv)
}

// detectArchiveKind decides from the bytes (magic numbers) and then from the
// Content-Type whether the downloaded file is an archive, and which reader it
// needs. "gzip" means gzip+tar; "tar" also covers a plain uncompressed tar.
func detectArchiveKind(path, contentType string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	head := make([]byte, 512)
	n, rerr := io.ReadFull(f, head)
	if rerr != nil && rerr != io.ErrUnexpectedEOF && rerr != io.EOF {
		return "", rerr
	}
	head = head[:n]
	if n >= 2 && head[0] == 0x1f && head[1] == 0x8b {
		return "gzip", nil
	}
	if n >= 4 && head[0] == 'P' && head[1] == 'K' && (head[2] == 3 || head[2] == 5 || head[2] == 7) {
		return "zip", nil
	}
	switch {
	case strings.Contains(contentType, "zip"):
		return "zip", nil
	case strings.Contains(contentType, "gzip") || strings.Contains(contentType, "gunzip"):
		return "gzip", nil
	case strings.Contains(contentType, "tar"):
		return "tar", nil
	}
	return "", nil
}

// isTarFile probes whether path looks like an uncompressed tar archive.
func isTarFile(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	tr := tar.NewReader(f)
	_, err = tr.Next()
	return err == nil
}

func extractArchive(path, kind, dst string, limits downloadLimits) error {
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	switch kind {
	case "zip":
		return extractZipArchive(path, dst, limits)
	case "gzip":
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		gz, err := gzip.NewReader(f)
		if err != nil {
			return fmt.Errorf("reading gzip archive: %w", err)
		}
		defer gz.Close()
		return extractTarEntries(gz, dst, limits)
	case "tar":
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		return extractTarEntries(f, dst, limits)
	}
	return fmt.Errorf("unsupported archive kind %q", kind)
}

// extractTarEntries extracts a tar stream, enforcing both caps as entries are
// read: a decompression bomb is stopped by the extracted-byte counter, never
// by a declared size. Only regular files and directories are accepted; an
// entry with an absolute path, a ".." component, a symlink, a hardlink or any
// other type is refused.
func extractTarEntries(r io.Reader, dst string, limits downloadLimits) error {
	tr := tar.NewReader(r)
	var entries int
	var total int64
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return fmt.Errorf("reading tar archive: %w", err)
		}
		entries++
		if entries > limits.extractMaxFiles {
			return fmt.Errorf("archive contains too many entries (more than %d); set %s to override", limits.extractMaxFiles, extractMaxFilesEnv)
		}
		name, nerr := safeArchivePath(hdr.Name)
		if nerr != nil {
			return nerr
		}
		if name == "" {
			continue
		}
		target := filepath.Join(dst, filepath.FromSlash(name))
		if !pathWithin(dst, target) {
			return fmt.Errorf("archive entry %q escapes the extraction directory", hdr.Name)
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg, tar.TypeRegA:
			if hdr.Size < 0 {
				return fmt.Errorf("archive entry %q has a negative size", hdr.Name)
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
			if err != nil {
				return err
			}
			remaining := limits.extractMaxBytes - total
			if remaining < 0 {
				out.Close()
				return extractTooLarge(limits.extractMaxBytes)
			}
			n, cerr := io.Copy(out, io.LimitReader(tr, remaining+1))
			closeErr := out.Close()
			if cerr != nil {
				return fmt.Errorf("extracting %q: %w", hdr.Name, cerr)
			}
			if closeErr != nil {
				return closeErr
			}
			total += n
			if total > limits.extractMaxBytes {
				return extractTooLarge(limits.extractMaxBytes)
			}
			if n != hdr.Size {
				return fmt.Errorf("archive entry %q is truncated", hdr.Name)
			}
		default:
			return fmt.Errorf("archive contains unsupported entry %q (type %q): only regular files and directories are allowed", hdr.Name, hdr.Typeflag)
		}
	}
}

func extractZipArchive(path, dst string, limits downloadLimits) error {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return fmt.Errorf("reading zip archive: %w", err)
	}
	defer zr.Close()
	if len(zr.File) > limits.extractMaxFiles {
		return fmt.Errorf("archive contains too many entries (%d); set %s to override", len(zr.File), extractMaxFilesEnv)
	}
	var total int64
	for _, f := range zr.File {
		name, nerr := safeArchivePath(f.Name)
		if nerr != nil {
			return nerr
		}
		if name == "" {
			continue
		}
		target := filepath.Join(dst, filepath.FromSlash(name))
		if !pathWithin(dst, target) {
			return fmt.Errorf("archive entry %q escapes the extraction directory", f.Name)
		}
		mode := f.Mode()
		if mode&os.ModeSymlink != 0 {
			return fmt.Errorf("archive contains a symlink %q; refusing", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		// mode 0 means the writer recorded no Unix permissions (common for
		// zips built on Windows); it is a regular file, not a special one.
		if mode != 0 && !mode.IsRegular() {
			return fmt.Errorf("archive contains non-regular entry %q; refusing", f.Name)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("opening %q: %w", f.Name, err)
		}
		out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if err != nil {
			rc.Close()
			return err
		}
		remaining := limits.extractMaxBytes - total
		if remaining < 0 {
			rc.Close()
			out.Close()
			return extractTooLarge(limits.extractMaxBytes)
		}
		n, cerr := io.Copy(out, io.LimitReader(rc, remaining+1))
		rcErr := rc.Close()
		outErr := out.Close()
		if cerr != nil {
			return fmt.Errorf("extracting %q: %w", f.Name, cerr)
		}
		if rcErr != nil {
			return rcErr
		}
		if outErr != nil {
			return outErr
		}
		total += n
		if total > limits.extractMaxBytes {
			return extractTooLarge(limits.extractMaxBytes)
		}
	}
	return nil
}

func extractTooLarge(max int64) error {
	return fmt.Errorf("archive extracts to more than %d bytes; set %s to override", max, extractMaxBytesEnv)
}

// safeArchivePath normalizes an archive entry name and refuses names that
// could escape the extraction root: absolute paths, UNC paths, Windows
// drive-qualified paths, NUL bytes, and ".." components. Backslashes are
// treated as separators, so a zip written on Windows cannot smuggle one past
// the checks.
func safeArchivePath(raw string) (string, error) {
	if raw == "" {
		return "", nil
	}
	if strings.ContainsRune(raw, 0) {
		return "", fmt.Errorf("archive contains an entry name with a NUL byte")
	}
	name := strings.ReplaceAll(raw, "\\", "/")
	if strings.HasPrefix(name, "//") {
		return "", fmt.Errorf("archive contains a UNC path %q", raw)
	}
	if strings.HasPrefix(name, "/") {
		return "", fmt.Errorf("archive contains absolute path %q", raw)
	}
	if len(name) >= 2 && name[1] == ':' && isASCIIAlpha(name[0]) {
		return "", fmt.Errorf("archive contains a drive-qualified path %q", raw)
	}
	var parts []string
	for _, seg := range strings.Split(name, "/") {
		switch seg {
		case "", ".":
			continue
		case "..":
			return "", fmt.Errorf("archive contains a path traversal entry %q", raw)
		}
		parts = append(parts, seg)
	}
	return strings.Join(parts, "/"), nil
}

func isASCIIAlpha(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z')
}

// pathWithin reports whether target stays inside base after cleaning.
func pathWithin(base, target string) bool {
	rel, err := filepath.Rel(base, target)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// singleTopLevelDirectory returns the only top-level directory of dir (common
// for archives that wrap the repository in one folder), or "" when there is
// more than one entry or the single entry is a file. __MACOSX is ignored, as
// the reference installer does.
func singleTopLevelDirectory(dir string) string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}
	only := ""
	for _, e := range entries {
		if e.Name() == "__MACOSX" {
			continue
		}
		if only != "" || !e.IsDir() {
			return ""
		}
		only = filepath.Join(dir, e.Name())
	}
	return only
}
