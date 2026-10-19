package artifact

// gitfetcher.go — the GitTreeFetcher: a commit-pinned, shallow git clone that
// yields a verified, extracted tree with the canonical tree digest.
//
// This is the strategy ARCH/17 §4 named as still to be written ("GitTreeFetcher
// (shallow commit-pinned clone, canonical tree digest)"). It exists because
// the published catalog carries plugin artifacts that are not archives: 636 of
// the 638 plugin rows name a git repository, a subpath inside it, a ref and —
// for 390 of them — a pinned commit id.
//
// # What it guarantees
//
//   - HTTPS only, and the host passes the shared egress/SSRF guard
//     (internal/egress): https, no embedded credentials, and every address the
//     host resolves to must be a public one. The archive fetcher in this
//     package owns its socket and can pin the checked IP at dial time; git
//     owns its own socket, so this fetcher can only resolve and refuse. The
//     residual window (git resolving the name again, a few milliseconds later)
//     is stated here rather than hidden.
//   - The clone is pinned to a COMMIT ID, never to a branch or tag: the
//     resolved commit must equal the declared one, byte for byte. A ref alone
//     is refused — a ref is a mutable name, and content that changes under an
//     install is not an install.
//   - The child git is hardened: only the https transport is allowed, no
//     terminal prompt, no credential helper, no askpass, LFS disabled, and
//     neither the user's global nor the system git config is read (a hostile
//     global config could otherwise re-enable a transport, install a
//     credential helper, or rewrite the URL).
//   - The fetch is shallow (--depth 1) and fetches exactly the pinned commit,
//     so the world is never cloned.
//   - The fetched content goes through the SAME safe extractor every other
//     artifact goes through (archive-slip, symlink, size, file-count and the
//     100:1 compression-ratio rules), and the result carries the canonical
//     tree digest — so a plugin's tree hashes the way every other artifact
//     hashes.
//
// # What it refuses
//
// A repository that cannot be reached, a commit that does not resolve, a
// subpath that is not in the pinned commit, a manifest-shaped tree it cannot
// read: every one of those is a typed error and NOTHING is extracted.

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/egress"
)

const (
	// DefaultGitTimeout bounds one git fetch. A hung TCP peer would otherwise
	// hang the command forever: exec carries no deadline of its own.
	DefaultGitTimeout = 5 * time.Minute

	// DefaultGitMaxArchiveBytes bounds the archive produced from the pinned
	// tree before it is handed to the extractor. The extractor's own limits
	// (tree size, file count, single-file size) still apply on top.
	DefaultGitMaxArchiveBytes int64 = DefaultMaxArchiveSize
)

// commitIDPattern is a full 40-hex lowercase commit id. The catalog's
// producer only marks a descriptor pinned when its sha clears this bar, and
// the pin is what makes the fetch reproducible.
var commitIDPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)

// GitFetcherOptions bounds and gates a git fetch. The zero value is not
// usable; use DefaultGitFetcherOptions.
type GitFetcherOptions struct {
	// Timeout caps the whole fetch. Zero means DefaultGitTimeout.
	Timeout time.Duration
	// Limits bounds the extraction. The zero value means
	// DefaultExtractionLimits.
	Limits ExtractionLimits
	// MaxArchiveBytes caps the archive produced from the pinned tree. Zero
	// means DefaultGitMaxArchiveBytes.
	MaxArchiveBytes int64
	// AllowLocalFileURL permits a file:// locator. It exists for tests and
	// local development; production must leave it false, so the default is
	// fail-closed: only https repositories are fetched.
	AllowLocalFileURL bool
	// GitBinary is the git executable. Empty means "git".
	GitBinary string
	// Lookup overrides DNS resolution for the egress check. Nil uses the
	// system resolver.
	Lookup egress.Lookup
	// Policy is the egress policy. The zero value is the strict one: https
	// only, no private and no loopback destinations.
	Policy egress.Policy
}

// DefaultGitFetcherOptions returns the production posture: https only, the
// shared egress guard, a bounded and timed-out clone, and the standard
// extraction limits.
func DefaultGitFetcherOptions() GitFetcherOptions {
	return GitFetcherOptions{
		Timeout:         DefaultGitTimeout,
		Limits:          DefaultExtractionLimits,
		MaxArchiveBytes: DefaultGitMaxArchiveBytes,
	}
}

// ResolvedGitTree is a validated, ready-to-fetch git tree: the repository, the
// commit it is pinned to, and the path inside it.
type ResolvedGitTree struct {
	Ref     domain.ArtifactRef
	RepoURL string
	// Commit is the pinned commit id (40 hex, lowercase).
	Commit string
	// Subpath is the repository-relative path of the tree, "" for the whole
	// repository.
	Subpath string
}

// GitTreeFetcher fetches a commit-pinned git tree.
type GitTreeFetcher struct {
	opts GitFetcherOptions
}

// NewGitTreeFetcher builds a fetcher.
func NewGitTreeFetcher(opts GitFetcherOptions) *GitTreeFetcher {
	if opts.Timeout <= 0 {
		opts.Timeout = DefaultGitTimeout
	}
	if opts.MaxArchiveBytes <= 0 || opts.MaxArchiveBytes > DefaultMaxArchiveSize {
		opts.MaxArchiveBytes = DefaultGitMaxArchiveBytes
	}
	if opts.Limits.MaxTreeSize == 0 && opts.Limits.MaxFileCount == 0 && opts.Limits.MaxArchiveSize == 0 {
		opts.Limits = DefaultExtractionLimits
	}
	if opts.GitBinary == "" {
		opts.GitBinary = "git"
	}
	return &GitTreeFetcher{opts: opts}
}

// Supports reports whether this fetcher handles the reference: a git tree
// whose locator is an https repository (a file:// locator only when the
// test-only opt-in is set).
func (f *GitTreeFetcher) Supports(ref domain.ArtifactRef) bool {
	if ref.Type != domain.ArtifactGitTree {
		return false
	}
	return f.supportsLocator(ref.Locator)
}

func (f *GitTreeFetcher) supportsLocator(locator string) bool {
	u, err := url.Parse(strings.TrimSpace(locator))
	if err != nil {
		return false
	}
	switch u.Scheme {
	case "https":
		return u.Host != "" && u.User == nil
	case "file":
		return f.opts.AllowLocalFileURL
	}
	return false
}

// ResolveImmutable validates the reference and resolves it to a fetchable
// target. It refuses every non-https scheme, credentials in the URL, a host
// that resolves into a range the egress policy does not permit, an artifact
// that is not pinned to an immutable commit, and a subpath that leaves the
// repository.
func (f *GitTreeFetcher) ResolveImmutable(ctx context.Context, ref domain.ArtifactRef) (*ResolvedGitTree, error) {
	if ref.Type != domain.ArtifactGitTree {
		return nil, domain.ErrArtifactUnavailable(ref.ArtifactID,
			fmt.Sprintf("artifact type %q is not a git tree; only a commit-pinned git tree is fetched here", ref.Type))
	}
	locator := strings.TrimSpace(ref.Locator)
	if locator == "" {
		return nil, domain.ErrArtifactUnavailable(ref.ArtifactID, "the artifact names no repository")
	}
	u, err := url.Parse(locator)
	if err != nil {
		return nil, domain.ErrEgressBlocked(locator, fmt.Sprintf("unparseable repository URL: %v", err))
	}
	if u.User != nil {
		return nil, domain.ErrEgressBlocked(locator, "URLs embedding credentials are refused")
	}
	switch u.Scheme {
	case "https":
		// The shared egress guard: https only, a host, no credentials, and
		// no literal address in a range no policy may allow.
		if err := egress.CheckURL(locator, f.opts.Policy); err != nil {
			return nil, err
		}
		// Every address the host resolves to must be a permitted destination:
		// one bad answer poisons the whole host.
		if _, err := egress.ResolveCheckedWithLookup(ctx, u.Hostname(), f.opts.Policy, f.opts.Lookup); err != nil {
			return nil, err
		}
	case "file":
		if !f.opts.AllowLocalFileURL {
			return nil, domain.ErrEgressBlocked(locator,
				"only https repositories are fetched; a local repository is never a published artifact")
		}
	default:
		return nil, domain.ErrEgressBlocked(locator,
			fmt.Sprintf("scheme %q is not allowed; only https is fetched", u.Scheme))
	}

	// The pin. A ref (a branch or tag name) is mutable, so it is never
	// enough: the artifact must name the commit itself.
	if ref.FetchPolicy != domain.FetchImmutable {
		return nil, domain.ErrArtifactUnavailable(ref.ArtifactID,
			"the artifact is not pinned to an immutable commit: a branch or tag name is mutable, "+
				"so the content it names can change under the install")
	}
	commit := strings.ToLower(strings.TrimSpace(ref.ImmutableRef))
	if !commitIDPattern.MatchString(commit) {
		return nil, domain.ErrArtifactUnavailable(ref.ArtifactID,
			fmt.Sprintf("the artifact declares no immutable commit id (%q); a pin must be a full 40-hex commit id", ref.ImmutableRef))
	}
	subpath, err := normalizeGitSubpath(ref.Subpath)
	if err != nil {
		return nil, domain.ErrArtifactUnavailable(ref.ArtifactID, err.Error())
	}
	return &ResolvedGitTree{Ref: ref, RepoURL: locator, Commit: commit, Subpath: subpath}, nil
}

// FetchTree fetches the pinned commit, extracts the pinned subpath into
// stagingDir through the safe extractor, and returns the canonical tree
// digest of what was written.
//
// Every failure is typed and leaves nothing behind: the clone lives in a
// temporary directory that is removed on every path out, and the extraction
// is the shared one, so an archive-slip, a symlink, an oversized file or a
// compression bomb is refused exactly as it is for any other artifact.
func (f *GitTreeFetcher) FetchTree(ctx context.Context, resolved *ResolvedGitTree, stagingDir string) (*domain.ExtractedTreeInfo, error) {
	if resolved == nil {
		return nil, domain.ErrArtifactUnavailable("", "fetch called without a resolved artifact")
	}
	if _, err := exec.LookPath(f.opts.GitBinary); err != nil {
		return nil, domain.ErrArtifactUnavailable(resolved.Ref.ArtifactID,
			"git is required to fetch a plugin's pinned tree, and no git executable was found on PATH")
	}

	work, err := os.MkdirTemp("", "litespm-gittree-*")
	if err != nil {
		return nil, fmt.Errorf("create the clone workspace: %w", err)
	}
	defer func() { _ = os.RemoveAll(work) }()

	// An empty git config stands in for the user's global and system config:
	// the child git must not read them (a hostile global config could
	// re-enable a transport, install a credential helper, or rewrite the
	// URL). The file is created empty rather than pointed at /dev/null so the
	// same path works on every platform.
	emptyConfig := filepath.Join(work, "empty-git-config")
	if err := os.WriteFile(emptyConfig, nil, 0o600); err != nil {
		return nil, fmt.Errorf("prepare the git configuration: %w", err)
	}
	env := gitEnv(gitCloneEnv(resolved.RepoURL, emptyConfig))

	repo := filepath.Join(work, "repo")
	if err := os.MkdirAll(repo, 0o700); err != nil {
		return nil, fmt.Errorf("prepare the clone directory: %w", err)
	}
	templateDir := filepath.Join(work, "empty-template")
	if err := os.MkdirAll(templateDir, 0o700); err != nil {
		return nil, fmt.Errorf("prepare the git template directory: %w", err)
	}

	// init → remote → fetch the pinned commit. The fetch is shallow and
	// names the commit id, so the world is never cloned and a moved branch
	// cannot change what is fetched.
	if _, err := f.run(ctx, env, repo,
		"-c", "init.templateDir="+templateDir,
		"-c", "credential.helper=",
		"init", "--quiet"); err != nil {
		return nil, err
	}
	if _, err := f.run(ctx, env, repo, "remote", "add", "origin", resolved.RepoURL); err != nil {
		return nil, err
	}
	if _, err := f.run(ctx, env, repo,
		"-c", "credential.helper=",
		"fetch", "--quiet", "--depth", "1", "--no-tags",
		"--no-recurse-submodules", "origin", resolved.Commit); err != nil {
		return nil, f.fetchFailure(resolved, err)
	}

	// The fetched object must BE the pinned commit: a ref that moved, a
	// server that answered with something else, or a fetch that resolved to
	// a different object are all refused here.
	fetched := strings.TrimSpace(f.output(ctx, env, repo, "rev-parse", "FETCH_HEAD"))
	if !strings.EqualFold(fetched, resolved.Commit) {
		return nil, domain.ErrArtifactUnavailable(resolved.Ref.ArtifactID,
			fmt.Sprintf("the remote resolved commit %q where the artifact pins %q; the pinned content is not what the remote served",
				fetched, resolved.Commit))
	}
	kind := strings.TrimSpace(f.output(ctx, env, repo, "cat-file", "-t", resolved.Commit))
	if kind != "commit" {
		return nil, domain.ErrArtifactUnavailable(resolved.Ref.ArtifactID,
			fmt.Sprintf("the pinned object %s is a %s, not a commit", resolved.Commit, kind))
	}

	// The tree to extract: the pinned commit, or the pinned path inside it.
	treeish := resolved.Commit
	if resolved.Subpath != "" {
		treeish = resolved.Commit + ":" + resolved.Subpath
		// The path must exist IN THE PINNED COMMIT: `git rev-parse` on the
		// path resolves inside that commit only, so a path that exists on
		// another branch cannot satisfy it.
		if _, err := f.run(ctx, env, repo, "rev-parse", "--verify", treeish); err != nil {
			return nil, domain.ErrArtifactUnavailable(resolved.Ref.ArtifactID,
				fmt.Sprintf("the pinned commit %s does not contain the path %q", resolved.Commit, resolved.Subpath))
		}
		if kind := strings.TrimSpace(f.output(ctx, env, repo, "cat-file", "-t", treeish)); kind != "tree" {
			return nil, domain.ErrArtifactUnavailable(resolved.Ref.ArtifactID,
				fmt.Sprintf("the pinned path %q is a %s, not a directory", resolved.Subpath, kind))
		}
	}

	archivePath := filepath.Join(work, "tree.tar.gz")
	size, err := f.archive(ctx, env, repo, treeish, archivePath)
	if err != nil {
		return nil, err
	}
	file, err := os.Open(archivePath)
	if err != nil {
		return nil, fmt.Errorf("open the extracted archive: %w", err)
	}
	defer file.Close()

	// The SAME safe extractor every other artifact goes through: the
	// archive-slip, symlink, size, file-count and compression-ratio rules
	// apply, and the result carries the canonical tree digest.
	info, err := ExtractArchiveSafelyWithLimits(file, size, "tar.gz", stagingDir, f.opts.Limits)
	if err != nil {
		return nil, err
	}
	return info, nil
}

// fetchFailure turns a failed fetch into a typed refusal that says what the
// remote did, because "fatal: could not read from remote repository" is not
// an answer a user can act on.
func (f *GitTreeFetcher) fetchFailure(resolved *ResolvedGitTree, err error) error {
	detail := err.Error()
	switch {
	case strings.Contains(detail, "does not allow request for unadvertised object"),
		strings.Contains(detail, "Server does not allow request for unadvertised object"):
		return domain.ErrArtifactUnavailable(resolved.Ref.ArtifactID,
			fmt.Sprintf("the remote refused a fetch of the pinned commit %s: it does not serve a commit that is not advertised by a ref, "+
				"so a pinned plugin cannot be fetched from it", resolved.Commit))
	case strings.Contains(detail, "Could not resolve host"),
		strings.Contains(detail, "unable to access"):
		return domain.ErrArtifactUnavailable(resolved.Ref.ArtifactID,
			fmt.Sprintf("the repository %s could not be reached: %s", resolved.RepoURL, detail))
	}
	return domain.ErrArtifactUnavailable(resolved.Ref.ArtifactID,
		fmt.Sprintf("fetching the pinned commit %s from %s failed: %s", resolved.Commit, resolved.RepoURL, detail))
}

// archive streams `git archive` for the treeish into a gzip file and returns
// the archive's size. The gzip stream is what the extractor reads, so the
// compression-ratio bound applies to the bytes the tree actually expands to.
func (f *GitTreeFetcher) archive(ctx context.Context, env []string, repo, treeish, dest string) (int64, error) {
	out, err := os.Create(dest)
	if err != nil {
		return 0, fmt.Errorf("create the archive file: %w", err)
	}
	defer out.Close()

	gz := gzip.NewWriter(out)
	cmd := exec.CommandContext(ctx, f.opts.GitBinary, "-C", repo, "archive", "--format=tar", treeish)
	cmd.Env = env
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = gz
	runErr := cmd.Run()
	if cerr := gz.Close(); cerr != nil && runErr == nil {
		runErr = cerr
	}
	if runErr != nil {
		_ = os.Remove(dest)
		return 0, domain.ErrArtifactUnavailable("",
			fmt.Sprintf("the pinned tree %s could not be archived: %v %s", treeish, runErr, strings.TrimSpace(stderr.String())))
	}
	info, err := out.Stat()
	if err != nil {
		return 0, fmt.Errorf("stat the archive file: %w", err)
	}
	if info.Size() > f.opts.MaxArchiveBytes {
		_ = os.Remove(dest)
		return 0, domain.ErrArchiveSlip(fmt.Sprintf(
			"the archive of the pinned tree is %d bytes, over the %d byte limit", info.Size(), f.opts.MaxArchiveBytes))
	}
	return info.Size(), nil
}

// run executes a git command in the repository and returns its output.
func (f *GitTreeFetcher) run(ctx context.Context, env []string, dir string, args ...string) (string, error) {
	out, err := f.outputErr(ctx, env, dir, args...)
	if err != nil {
		return "", err
	}
	return out, nil
}

// output runs a git command and returns its standard output, discarding it.
func (f *GitTreeFetcher) output(ctx context.Context, env []string, dir string, args ...string) string {
	out, _ := f.outputErr(ctx, env, dir, args...)
	return out
}

// outputErr runs a git command and returns its standard output.
func (f *GitTreeFetcher) outputErr(ctx context.Context, env []string, dir string, args ...string) (string, error) {
	runCtx, cancel := context.WithTimeout(ctx, f.opts.Timeout)
	defer cancel()
	cmd := exec.CommandContext(runCtx, f.opts.GitBinary, args...)
	cmd.Dir = dir
	cmd.Env = env
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		if runCtx.Err() == context.DeadlineExceeded {
			return "", domain.ErrArtifactUnavailable("",
				fmt.Sprintf("git %s timed out after %s", strings.Join(args, " "), f.opts.Timeout))
		}
		return "", fmt.Errorf("git %s: %v %s", strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return string(out), nil
}

// gitCloneEnv is the hardened environment the child git runs with.
//
// Every entry is a documented failure of an unhardened clone:
//
//   - GIT_ALLOW_PROTOCOL names the ONE transport this fetch may use. A
//     "[protocol x] allow = always" in the user's global config cannot
//     re-enable file:, ext: or a plain http transport, because the
//     environment variable is authoritative.
//   - GIT_TERMINAL_PROMPT=0 and an empty GIT_ASKPASS mean a credential
//     helper or an askpass dialog can never appear mid-install.
//   - credential.helper= (on the command line) empties the helper list, so
//     a helper configured anywhere cannot be used.
//   - LFS is disabled two ways: GIT_LFS_SKIP_SMUDGE covers an installed
//     git-lfs, and the empty filter.lfs.* settings kill the filter even
//     when git-lfs is absent (a repository with LFS content and a broken
//     filter fails checkout otherwise).
//   - GIT_CONFIG_GLOBAL / GIT_CONFIG_SYSTEM point at an empty file, so the
//     user's global and system configuration are not read at all: a global
//     config could otherwise install a credential helper, re-enable a
//     transport, or rewrite the URL with url.<base>.insteadOf.
//
// The protocol list is exactly the scheme of the locator that was validated:
// "https" for a published repository, and "file" only for the test-only
// local opt-in.
func gitCloneEnv(locator, emptyConfig string) map[string]string {
	protocol := "https"
	if strings.HasPrefix(strings.TrimSpace(locator), "file:") {
		protocol = "file"
	}
	return map[string]string{
		"GIT_ALLOW_PROTOCOL":  protocol,
		"GIT_TERMINAL_PROMPT": "0",
		"GIT_ASKPASS":         "",
		"SSH_ASKPASS":         "",
		"GIT_LFS_SKIP_SMUDGE": "1",
		"filter.lfs.required": "false",
		"filter.lfs.smudge":   "",
		"filter.lfs.clean":    "",
		"filter.lfs.process":  "",
		"GIT_CONFIG_GLOBAL":   emptyConfig,
		"GIT_CONFIG_SYSTEM":   emptyConfig,
		"GIT_CONFIG_NOSYSTEM": "1",
		"GIT_ATTR_NOSYSTEM":   "1",
	}
}

// gitEnv merges the hardening overrides into the ambient environment.
//
// The overrides REPLACE any value the caller's environment already carries
// for the same key instead of being appended after it: a duplicate key in
// the child's environment is resolved by the first match, so an ambient
// GIT_ALLOW_PROTOCOL=file would otherwise win over the https-only rule.
func gitEnv(overrides map[string]string) []string {
	base := os.Environ()
	out := make([]string, 0, len(base)+len(overrides))
	for _, kv := range base {
		key, _, _ := strings.Cut(kv, "=")
		if _, replaced := overrides[key]; replaced {
			continue
		}
		out = append(out, kv)
	}
	for key, value := range overrides {
		out = append(out, key+"="+value)
	}
	return out
}

// normalizeGitSubpath validates the repository-relative path of the tree. An
// absolute path, a traversal segment, a backslash or a NUL byte is refused:
// the path names a directory inside somebody else's repository, and it is
// joined onto a local path.
func normalizeGitSubpath(subpath string) (string, error) {
	s := strings.TrimSpace(subpath)
	if s == "" {
		return "", nil
	}
	if strings.ContainsRune(s, 0) {
		return "", fmt.Errorf("the artifact's path contains a NUL byte")
	}
	if strings.Contains(s, "\\") {
		return "", fmt.Errorf("the artifact's path %q contains a backslash; a repository path is slash-separated", subpath)
	}
	if strings.HasPrefix(s, "/") {
		return "", fmt.Errorf("the artifact's path %q is absolute; a repository path is relative to the repository root", subpath)
	}
	for _, segment := range strings.Split(s, "/") {
		switch segment {
		case "", ".":
			return "", fmt.Errorf("the artifact's path %q is not a plain repository-relative path", subpath)
		case "..":
			return "", fmt.Errorf("the artifact's path %q traverses out of the repository", subpath)
		}
	}
	return s, nil
}

// FetchGitTree resolves, fetches and verifies one git-tree artifact into
// stagingDir, returning the canonical tree digest of the extracted tree.
//
// It is the one-call form of the fetcher: resolve (which is where the https,
// egress and pin rules are applied), fetch the pinned commit, and extract it
// through the shared safe extractor.
func FetchGitTree(ctx context.Context, ref domain.ArtifactRef, stagingDir string, opts GitFetcherOptions) (*domain.ExtractedTreeInfo, error) {
	fetcher := NewGitTreeFetcher(opts)
	resolved, err := fetcher.ResolveImmutable(ctx, ref)
	if err != nil {
		return nil, err
	}
	return fetcher.FetchTree(ctx, resolved, stagingDir)
}

// ensure the gzip writer is the one the archive is written through.
var _ io.Writer = (*gzip.Writer)(nil)
