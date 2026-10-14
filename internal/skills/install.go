package skills

import (
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// install.go — `litespm skills add` engine.
//
// Installs portable SKILL.md skill directories from a GitHub repository (or a
// local directory) into the universal `.agents/skills` tree plus any mapped
// host skill directories. This file holds the pure, testable layer: source
// parsing, skill discovery, install planning, and safe directory copy. All
// prompting lives in cmd/litespm/skills_add.go.

// MaxSkillBytes bounds a single installed skill tree (skills are
// instructions plus small assets; anything larger is almost certainly not a
// skill and is refused rather than truncated).
const MaxSkillBytes = 32 << 20 // 32 MiB

var validSkillName = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// SkillSource is a parsed `--skill` installer source.
type SkillSource struct {
	// Kind is "repo" (owner/name), "url" (https), or "local".
	Kind string
	// Display is the human-readable source label shown in the UI.
	Display string
	// CloneURL is the fetch target for repo/url kinds.
	CloneURL string
	// LocalDir is set for the local kind.
	LocalDir string
	// RepoPath is "owner/name" for repo/url kinds, "" otherwise.
	RepoPath string
	// Git is true when CloneURL is a git remote (a `.git` URL or a recognized
	// git host). False means the URL was left exactly as given.
	Git bool
	// Pin is the optional revision to install: `owner/repo@ref`,
	// `https://host/repo@ref`, or a `?ref=` query parameter. Empty means the
	// source default branch.
	Pin string
	// Subpath is the directory inside the repository that holds the skill,
	// set when the source was a browse URL such as
	// `https://github.com/owner/repo/tree/<ref>/skills/name`. Empty means the
	// repository root. Callers that scan the checkout must join this onto the
	// clone root before discovering skills.
	Subpath string
}

// knownGitHosts are hosts where a bare `owner/name` path is a git remote and a
// missing `.git` suffix is safely inferred. Other HTTPS URLs are left verbatim:
// appending `.git` blindly corrupts normal URLs such as archive or landing
// pages.
var knownGitHosts = map[string]bool{
	"github.com":     true,
	"www.github.com": true,
	"gitlab.com":     true,
	"bitbucket.org":  true,
	"codeberg.org":   true,
	"git.sr.ht":      true,
	"gitea.com":      true,
	"dev.azure.com":  true,
}

// githubArtifactPath matches the GitHub URL shapes that address a file or an
// exported archive inside a repository rather than the repository itself.
var githubArtifactPath = regexp.MustCompile(`^/[^/]+/[^/]+/(?:archive/|raw/|releases/(?:download/|latest/download/))`)

// ParseSkillSource parses an installer source: "owner/repo", an https or ssh
// git URL, or a local directory path. An optional `@<ref>` suffix (or
// `ref`/`pin`/`commit` query parameter) pins the source to a revision; the pin
// is recorded in the ledger but not resolved here (resolution needs the
// fetcher). http:// and file:// are deliberately refused: the installer only
// clones over TLS or ssh.
func ParseSkillSource(raw string) (SkillSource, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return SkillSource{}, fmt.Errorf("empty skill source")
	}

	// Local directory (exists on disk).
	if fi, err := os.Stat(s); err == nil && fi.IsDir() {
		abs, err := filepath.Abs(s)
		if err != nil {
			return SkillSource{}, err
		}
		return SkillSource{Kind: "local", Display: abs, LocalDir: abs}, nil
	}

	// scp-like ssh remote (git@host:owner/repo.git). It must be handled before
	// url.Parse, which reads `git@host` as an opaque scheme rather than as an
	// ssh remote.
	if strings.HasPrefix(s, "git@") {
		return parseSCPLikeSource(s)
	}

	// owner/repo shorthand, with an optional @ref pin.
	if !strings.Contains(s, "://") {
		base, pin := splitAtRef(s)
		parts := strings.Split(base, "/")
		if len(parts) == 2 && validOwnerRepo(parts[0]) && validOwnerRepo(parts[1]) {
			clone := fmt.Sprintf("https://github.com/%s/%s.git", parts[0], parts[1])
			return SkillSource{
				Kind:     "repo",
				Display:  clone,
				CloneURL: clone,
				RepoPath: parts[0] + "/" + parts[1],
				Git:      true,
				Pin:      pin,
			}, nil
		}
		return SkillSource{}, fmt.Errorf("invalid skill source %q: expected owner/repo, an https or ssh git URL, or a local directory", s)
	}

	u, err := url.Parse(s)
	if err != nil {
		return SkillSource{}, fmt.Errorf("invalid skill source %q: not a valid URL", s)
	}
	switch strings.ToLower(u.Scheme) {
	case "ssh":
		if u.Host == "" {
			return SkillSource{}, fmt.Errorf("invalid skill source %q: ssh URL has no host", s)
		}
		return parseSSHSource(s, u)
	case "https":
		if u.Host == "" {
			return SkillSource{}, fmt.Errorf("invalid skill source %q: not a valid https URL", s)
		}
	default:
		// http:// and file: are refused on purpose: they are either plaintext
		// or local-path transports the installer must not fetch through.
		return SkillSource{}, fmt.Errorf("invalid skill source %q: only https and ssh git URLs are accepted", s)
	}

	// Azure Repos addresses a git repository with a /_git/<repo> path and puts
	// the web UI's working context in the query (version=GBmain, path=/dir).
	if isAzureReposHost(u.Hostname()) && hasAzureGitPath(u.Path) {
		return parseAzureReposSource(s, u)
	}

	// Hosted raw files, exported archives and release assets are downloads,
	// not repositories: leave the URL exactly as written and mark it non-git
	// so no caller appends ".git" and tries to clone it.
	if isHostedArtifactURL(u) {
		return SkillSource{Kind: "url", Display: s, CloneURL: s}, nil
	}

	// The URL's escaped path is the source of truth for a browse split: a ref
	// containing "/" can only be told apart from a subpath when its slash is
	// percent-escaped (tree/feat%2Fx/...), which u.Path has already decoded.
	escapedPath := u.EscapedPath()

	// Pin from a query parameter, then from a path @ref. The path form is
	// stripped from the escaped path so the ref is never treated as part of
	// the repository path.
	q := u.Query()
	pin := pinFromQuery(q)
	pathRewritten := false
	if pin == "" {
		if idx := strings.LastIndex(escapedPath, "@"); idx > 0 {
			if v, derr := url.PathUnescape(escapedPath[idx+1:]); derr == nil && strings.TrimSpace(v) != "" {
				pin = strings.TrimSpace(v)
				escapedPath = escapedPath[:idx]
				pathRewritten = true
			}
		}
	}
	u.RawQuery = q.Encode()

	// A GitHub *browse* URL names a directory inside a repository
	// (/<owner>/<repo>/tree/<ref>/<path>), not the repository itself. The
	// generic ".git" suffixing below would produce a clone URL like
	// "/owner/repo/tree/main/skills/x.git", which no git server serves, so
	// split it into a repository clone target plus the pinned ref and subpath.
	if isGitHubHost(u.Hostname()) {
		repoPath, ref, sub, ok, terr := splitGitTreeBrowsePath(escapedPath, pin)
		if terr != nil {
			return SkillSource{}, fmt.Errorf("invalid skill source %q: %w", s, terr)
		}
		if ok {
			clone := (&url.URL{Scheme: "https", Host: u.Host, Path: repoPath + ".git"}).String()
			display := strings.TrimSuffix(clone, ".git")
			if sub != "" {
				display += "/" + sub
			}
			if pin == "" {
				pin = ref
			}
			return SkillSource{
				Kind:     "url",
				Display:  display,
				CloneURL: clone,
				RepoPath: strings.TrimPrefix(repoPath, "/"),
				Git:      true,
				Pin:      pin,
				Subpath:  sub,
			}, nil
		}
	}

	if pathRewritten {
		if p, derr := url.PathUnescape(escapedPath); derr == nil {
			u.Path = p
			u.RawPath = ""
		}
	}
	u.Path = strings.TrimRight(u.Path, "/")
	u.RawPath = ""

	// Only infer a git clone URL on a recognized git host; otherwise leave the
	// URL exactly as the user wrote it.
	if knownGitHosts[strings.ToLower(u.Hostname())] && !strings.HasSuffix(u.Path, ".git") {
		u.Path += ".git"
		u.RawPath = ""
	}
	clone := u.String()
	git := strings.HasSuffix(u.Path, ".git")
	return SkillSource{
		Kind:     "url",
		Display:  strings.TrimSuffix(clone, ".git"),
		CloneURL: clone,
		RepoPath: guessRepoPath(u),
		Git:      git,
		Pin:      pin,
	}, nil
}

// pinFromQuery extracts and removes the first non-empty revision pin among the
// documented query parameters.
func pinFromQuery(q url.Values) string {
	for _, key := range []string{"ref", "pin", "commit", "version"} {
		if v := strings.TrimSpace(q.Get(key)); v != "" {
			q.Del(key)
			return v
		}
	}
	return ""
}

// parseSCPLikeSource parses the scp-like ssh remote form
// `git@host:owner/repo.git` — the reference installer's documented path to a
// private repository. The clone URL is left exactly as given: git needs no
// rewrite for a scp-like remote.
func parseSCPLikeSource(s string) (SkillSource, error) {
	colon := strings.Index(s, ":")
	if colon <= len("git@") || colon == len(s)-1 {
		return SkillSource{}, fmt.Errorf("invalid skill source %q: expected git@host:owner/repo", s)
	}
	host := s[len("git@"):colon]
	if strings.TrimSpace(host) == "" {
		return SkillSource{}, fmt.Errorf("invalid skill source %q: expected git@host:owner/repo", s)
	}
	remotePath, pin := splitAtRef(s[colon+1:])
	remotePath = strings.Trim(remotePath, "/")
	if remotePath == "" {
		return SkillSource{}, fmt.Errorf("invalid skill source %q: expected git@host:owner/repo", s)
	}
	clone := "git@" + host + ":" + remotePath
	src := SkillSource{
		Kind:     "url",
		Display:  strings.TrimSuffix(clone, ".git"),
		CloneURL: clone,
		Git:      true,
		Pin:      pin,
	}
	if strings.EqualFold(host, "github.com") {
		src.RepoPath = githubRepoPathFromGitPath(remotePath)
	}
	return src, nil
}

// parseSSHSource parses ssh://[user@]host[:port]/owner/repo[.git] remotes,
// including a bare `@ref` suffix. The clone URL is the URL as given (minus the
// pin and any query): the ssh transport needs no rewrite.
func parseSSHSource(raw string, u *url.URL) (SkillSource, error) {
	q := u.Query()
	pin := pinFromQuery(q)
	// The ssh transport passes only the remote path to git, so a query string
	// would be sent as part of it; it is dropped after the pins are read.
	u.RawQuery = ""
	if pin == "" {
		if idx := strings.LastIndex(u.Path, "@"); idx > 0 {
			if v := strings.TrimSpace(u.Path[idx+1:]); v != "" {
				pin = v
				u.Path = u.Path[:idx]
			}
		}
	}
	u.Fragment = ""
	u.Path = strings.TrimRight(u.Path, "/")
	u.RawPath = ""
	if u.Path == "" {
		return SkillSource{}, fmt.Errorf("invalid skill source %q: expected ssh://[user@]host/owner/repo", raw)
	}
	clone := u.String()
	src := SkillSource{
		Kind:     "url",
		Display:  strings.TrimSuffix(clone, ".git"),
		CloneURL: clone,
		Git:      true,
		Pin:      pin,
	}
	if strings.EqualFold(u.Hostname(), "github.com") {
		src.RepoPath = githubRepoPathFromGitPath(u.Path)
	}
	return src, nil
}

// githubRepoPathFromGitPath extracts "owner/name" from a github git path for
// display and skills.sh detail links.
func githubRepoPathFromGitPath(p string) string {
	rest := strings.TrimSuffix(strings.Trim(p, "/"), ".git")
	parts := strings.Split(rest, "/")
	if len(parts) >= 2 && parts[0] != "" && parts[1] != "" {
		return parts[0] + "/" + parts[1]
	}
	return ""
}

// isAzureReposHost reports whether host is Azure Repos' standard web/clone
// host. Azure DevOps Server installs use their own hostnames and are not
// guessed at.
func isAzureReposHost(host string) bool {
	return strings.EqualFold(host, "dev.azure.com")
}

// hasAzureGitPath reports whether an Azure URL path carries the /_git/<repo>
// marker that every Azure clone URL uses.
func hasAzureGitPath(p string) bool {
	prefix, repo, ok := splitAzureReposPath(p)
	return ok && prefix != "" && repo != ""
}

// splitAzureReposPath splits .../_git/<repo>[/...] into the path prefix ending
// at "_git" and the repository name.
func splitAzureReposPath(p string) (prefix, repo string, ok bool) {
	segments := strings.Split(strings.Trim(p, "/"), "/")
	for i, seg := range segments {
		if seg != "_git" {
			continue
		}
		if i == 0 || i >= len(segments)-1 {
			return "", "", false
		}
		repo = strings.TrimSuffix(segments[i+1], ".git")
		if repo == "" {
			return "", "", false
		}
		return strings.Join(segments[:i+1], "/"), repo, true
	}
	return "", "", false
}

// parseAzureReposSource parses an Azure Repos web/clone URL. The web UI carries
// the working context in its query, so it is authoritative:
//
//   - version=GB<branch> or GT<tag> pins the revision to <branch>/<tag>; the
//     GB/GT prefixes are Azure's "git branch"/"git tag" markers and are not
//     part of the ref name. GC<sha> is ignored because `git clone --branch`
//     cannot check out a commit.
//   - path=<dir> names the in-repo directory holding the skill.
//
// The query is stripped from the clone URL: Azure's clone endpoint is the bare
// /_git/<repo> path.
func parseAzureReposSource(raw string, u *url.URL) (SkillSource, error) {
	prefix, repo, ok := splitAzureReposPath(u.Path)
	if !ok {
		return SkillSource{}, fmt.Errorf("invalid skill source %q: expected .../_git/<repo>", raw)
	}
	q := u.Query()
	pin := ""
	if v := strings.TrimSpace(q.Get("version")); v != "" {
		switch up := strings.ToUpper(v); {
		case strings.HasPrefix(up, "GB"), strings.HasPrefix(up, "GT"):
			pin = strings.TrimSpace(v[2:])
		}
	}
	if pin == "" {
		for _, key := range []string{"ref", "pin", "commit"} {
			if v := strings.TrimSpace(q.Get(key)); v != "" {
				pin = v
				break
			}
		}
	}
	sub := ""
	if v := q.Get("path"); strings.TrimSpace(v) != "" {
		clean, cerr := cleanSubpath(v)
		if cerr != nil {
			return SkillSource{}, fmt.Errorf("invalid skill source %q: %w", raw, cerr)
		}
		sub = clean
	}
	cloneURL := (&url.URL{Scheme: u.Scheme, Host: u.Host, Path: "/" + prefix + "/" + repo + ".git"}).String()
	display := strings.TrimSuffix(cloneURL, ".git")
	if sub != "" {
		display += "/" + sub
	}
	return SkillSource{
		Kind:     "url",
		Display:  display,
		CloneURL: cloneURL,
		RepoPath: strings.Trim(prefix+"/"+repo, "/"),
		Git:      true,
		Pin:      pin,
		Subpath:  sub,
	}, nil
}

// cleanSubpath normalizes an in-repo subpath taken from a URL into
// forward-slash segments and refuses traversal.
func cleanSubpath(raw string) (string, error) {
	raw = strings.ReplaceAll(raw, "\\", "/")
	var parts []string
	for _, seg := range strings.Split(raw, "/") {
		switch seg {
		case "", ".":
			continue
		case "..":
			return "", fmt.Errorf("unsafe subpath %q: must not contain a \"..\" segment", raw)
		}
		parts = append(parts, seg)
	}
	return strings.Join(parts, "/"), nil
}

// splitAtRef splits "base@ref" on the last '@'. A leading '@' (or none) leaves
// the whole string as base and returns an empty ref.
func splitAtRef(s string) (string, string) {
	idx := strings.LastIndex(s, "@")
	if idx <= 0 || idx == len(s)-1 {
		return s, ""
	}
	return s[:idx], s[idx+1:]
}

// RecordedRef returns the ref to persist for this source: an explicit pin wins,
// otherwise the commit SHA the caller observed for the checkout (for example
// from `git rev-parse HEAD`). Empty means the source is unpinned.
func (s SkillSource) RecordedRef(observedCommit string) string {
	if s.Pin != "" {
		return s.Pin
	}
	return observedCommit
}

var validOwnerRepo = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`).MatchString

// isGitHubHost reports whether the host is GitHub's web front end, whose
// /tree/<ref>/<path> browse URLs address a directory rather than a repository.
func isGitHubHost(host string) bool {
	return host == "github.com" || host == "www.github.com"
}

// isHostedArtifactURL reports whether u addresses a hosted file or exported
// archive on a code-hosting site (a raw file, an archive export, or a release
// asset). These are downloads, not git remotes: appending ".git" to one
// produces a URL no server serves.
func isHostedArtifactURL(u *url.URL) bool {
	if u == nil {
		return false
	}
	switch strings.ToLower(u.Hostname()) {
	case "raw.githubusercontent.com", "codeload.github.com", "objects.githubusercontent.com":
		return true
	case "github.com", "www.github.com":
		return githubArtifactPath.MatchString(u.Path)
	case "gitlab.com":
		return strings.Contains(u.Path, "/-/archive/") || strings.Contains(u.Path, "/-/raw/")
	}
	return false
}

// splitGitTreeBrowsePath splits a GitHub browse path
// /<owner>/<repo>/tree/<ref>[/<subpath>...] (or /blob/) into the repository
// path, the ref and the subpath. It reports false for anything that is not a
// browse path, and an error for a browse path whose subpath escapes the
// repository (a `..` segment).
//
// The path passed in is the URL's ESCAPED path. A ref containing "/" cannot be
// told apart from a subpath in the raw form (tree/feat/x/skills/y is equally
// ref "feat" + subpath "x/skills/y"), so the deterministic escapes are:
//
//   - percent-escape the slash inside the ref: tree/feat%2Fx/skills/y;
//   - pass the ref explicitly as ?ref=feat/x, which consumes its path segments.
//
// Without either, the first path segment is the ref, matching the reference
// installer.
func splitGitTreeBrowsePath(escapedPath, explicitPin string) (repoPath, ref, subpath string, ok bool, err error) {
	parts := strings.Split(strings.Trim(escapedPath, "/"), "/")
	if len(parts) < 4 || parts[0] == "" || parts[1] == "" || parts[3] == "" {
		return "", "", "", false, nil
	}
	if parts[2] != "tree" && parts[2] != "blob" {
		return "", "", "", false, nil
	}
	decode := func(seg string) (string, bool) {
		v, derr := url.PathUnescape(seg)
		if derr != nil {
			return "", false
		}
		return v, true
	}
	decodeJoin := func(segs []string) (string, bool) {
		out := make([]string, 0, len(segs))
		for _, seg := range segs {
			v, ok := decode(seg)
			if !ok {
				return "", false
			}
			out = append(out, v)
		}
		return strings.Join(out, "/"), true
	}
	owner, ok1 := decode(parts[0])
	repo, ok2 := decode(parts[1])
	if !ok1 || !ok2 || owner == "" || repo == "" {
		return "", "", "", false, nil
	}
	repoPath = "/" + owner + "/" + repo

	// An explicit pin that matches the leading tree segments consumes them, so
	// a ref containing "/" (tree/feat/x/skills/y?ref=feat/x) is disambiguated.
	if explicitPin != "" {
		pinParts := strings.Split(strings.Trim(strings.ReplaceAll(explicitPin, "\\", "/"), "/"), "/")
		if len(pinParts) > 0 && len(parts)-3 >= len(pinParts) {
			match := true
			for i := range pinParts {
				seg, ok := decode(parts[3+i])
				if !ok || seg != pinParts[i] {
					match = false
					break
				}
			}
			if match {
				sub, ok := decodeJoin(parts[3+len(pinParts):])
				if !ok {
					return "", "", "", false, nil
				}
				clean, cerr := cleanSubpath(sub)
				if cerr != nil {
					return "", "", "", false, cerr
				}
				return repoPath, "", clean, true, nil
			}
		}
	}

	// Default split: the ref is the first path segment. A slash escaped inside
	// that segment (tree/feat%2Fx/...) decodes into a multi-segment ref here.
	ref, ok = decode(parts[3])
	if !ok {
		return "", "", "", false, nil
	}
	sub, ok := decodeJoin(parts[4:])
	if !ok {
		return "", "", "", false, nil
	}
	clean, cerr := cleanSubpath(sub)
	if cerr != nil {
		return "", "", "", false, cerr
	}
	return repoPath, ref, clean, true, nil
}

// guessRepoPath extracts "owner/name" from a github.com URL for display and
// skills.sh detail links. Returns "" when the URL is not a GitHub repo URL.
func guessRepoPath(u *url.URL) string {
	if u == nil || u.Hostname() != "github.com" {
		return ""
	}
	rest := strings.TrimSuffix(u.Path, ".git")
	rest = strings.Trim(rest, "/")
	parts := strings.Split(rest, "/")
	if len(parts) >= 2 && parts[0] != "" && parts[1] != "" {
		return parts[0] + "/" + parts[1]
	}
	return ""
}

// DiscoveredSkill is one SKILL.md directory found under a source tree.
type DiscoveredSkill struct {
	// Dir is the absolute skill directory.
	Dir string
	// Rel is the path relative to the source root (for display).
	Rel string
	// Pkg is the parsed skill frontmatter.
	Pkg *SkillPackage
}

// DiscoveryOptions controls how a source tree is searched for skills.
type DiscoveryOptions struct {
	// FullDepth drops the depth bound entirely and searches every directory
	// (still skipping the junk dirs below), however deep. It also keeps
	// searching inside a root that is itself a skill. This is the escape
	// hatch for layouts deeper than the standard three levels.
	FullDepth bool
	// IncludeRoot also accepts the source root itself when it holds a valid
	// SKILL.md — the mode for a source that *is* a skill directory (a browse
	// subpath, a direct download, or an archive holding one skill).
	IncludeRoot bool
}

// maxSkillDepth bounds the standard walk: the root is depth 0, so a skill at
// skills/<category>/<name>/SKILL.md is depth 3 and is found. The walk used to
// stop at depth 2, which made exactly that layout install zero skills.
const maxSkillDepth = 3

// skipSkillDirs are directories the discovery walk never descends into: VCS
// metadata plus the dependency/build trees the reference installer also
// ignores. A SKILL.md inside one is not an installable source skill.
var skipSkillDirs = map[string]bool{
	".git":         true,
	"node_modules": true,
	"dist":         true,
	"build":        true,
	"__pycache__":  true,
}

// DiscoverSkills walks root and returns every directory containing
// SKILL.md/skill.md with valid frontmatter (name and description required)
// under it. Invalid skills are skipped, never fatal. A directory that contains
// a skill is never descended into, so a shallower skill shadows a deeper one.
//
// The standard walk is bounded (maxSkillDepth) and, when it finds nothing, is
// retried recursively before reporting an empty result, so a repository that
// nests skills somewhere unusual is still found. Pass
// DiscoveryOptions{FullDepth: true} to drop the bound outright.
//
// The root itself is NOT considered; use DiscoverSkillsIncludingRoot for a
// source that may be a single skill directory. Internal skills (frontmatter
// metadata.internal: true) are not dropped here: they carry Pkg.Internal, and
// the caller must consult SkillVisible/FilterVisibleSkills so a hidden skill
// can be reported instead of silently vanishing.
func DiscoverSkills(root string, opts ...DiscoveryOptions) ([]DiscoveredSkill, error) {
	return discoverSkills(root, resolveDiscoveryOptions(opts))
}

// DiscoverSkillsIncludingRoot is DiscoverSkills with IncludeRoot set: a source
// that is itself a single skill directory (SKILL.md at its root) is found.
// This is the mode to use for a fetched skill source; plain DiscoverSkills
// deliberately skips the root, so scanning a project never treats the project
// root as one skill.
func DiscoverSkillsIncludingRoot(root string, opts ...DiscoveryOptions) ([]DiscoveredSkill, error) {
	o := resolveDiscoveryOptions(opts)
	o.IncludeRoot = true
	return discoverSkills(root, o)
}

func resolveDiscoveryOptions(opts []DiscoveryOptions) DiscoveryOptions {
	if len(opts) == 0 {
		return DiscoveryOptions{}
	}
	return opts[0]
}

func discoverSkills(root string, o DiscoveryOptions) ([]DiscoveredSkill, error) {
	info, err := os.Stat(root)
	if err != nil {
		return nil, fmt.Errorf("skill source %s: %w", root, err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("skill source %s is not a directory", root)
	}

	if o.FullDepth {
		out, werr := walkSkills(root, 0) // 0 = unbounded
		if werr != nil {
			return nil, werr
		}
		if o.IncludeRoot {
			if sk, ok := skillAt(root); ok {
				out = append([]DiscoveredSkill{sk}, out...)
			}
		}
		return out, nil
	}

	// A root that is itself a skill is the shallowest match: without FullDepth
	// it shadows everything below it, exactly like any other found skill.
	if o.IncludeRoot {
		if sk, ok := skillAt(root); ok {
			return []DiscoveredSkill{sk}, nil
		}
	}

	out, werr := walkSkills(root, maxSkillDepth)
	if werr != nil {
		return nil, werr
	}
	if len(out) == 0 {
		// The standard locations found nothing: retry without the depth bound
		// before reporting an empty result.
		return walkSkills(root, 0)
	}
	return out, nil
}

// walkSkills collects valid skill directories under root, excluding root
// itself. maxDepth 0 means unbounded; otherwise the root is depth 0, so
// maxDepth 3 admits a skill three levels down.
func walkSkills(root string, maxDepth int) ([]DiscoveredSkill, error) {
	rootDepth := len(strings.Split(filepath.Clean(root), string(filepath.Separator)))
	var out []DiscoveredSkill
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable subtrees
		}
		if !d.IsDir() {
			return nil
		}
		if path != root && skipSkillDirs[d.Name()] {
			return filepath.SkipDir
		}
		depth := len(strings.Split(filepath.Clean(path), string(filepath.Separator))) - rootDepth
		if maxDepth > 0 && depth > maxDepth {
			return filepath.SkipDir
		}
		if depth == 0 {
			return nil // the walk root is the caller's decision
		}
		pkg, lerr := LoadSkillFromDirectory(path)
		if lerr != nil {
			return nil
		}
		if strings.TrimSpace(pkg.Name) == "" || strings.TrimSpace(pkg.Description) == "" {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		out = append(out, DiscoveredSkill{Dir: path, Rel: rel, Pkg: pkg})
		return filepath.SkipDir // a skill dir is never a parent of another skill
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// skillAt reports root itself as a discoverable skill when its SKILL.md parses
// and carries both required fields.
func skillAt(root string) (DiscoveredSkill, bool) {
	pkg, err := LoadSkillFromDirectory(root)
	if err != nil {
		return DiscoveredSkill{}, false
	}
	if strings.TrimSpace(pkg.Name) == "" || strings.TrimSpace(pkg.Description) == "" {
		return DiscoveredSkill{}, false
	}
	return DiscoveredSkill{Dir: root, Rel: ".", Pkg: pkg}, true
}

// SanitizeSkillName validates a skill directory name for installation.
func SanitizeSkillName(name string) (string, error) {
	n := strings.ToLower(strings.TrimSpace(name))
	if !validSkillName.MatchString(n) {
		return "", fmt.Errorf("invalid skill name %q: must match [a-z0-9-]", name)
	}
	return n, nil
}

// pathExists is a seam for tests.
var pathExists = func(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// overwriteLine is the exact disclosure text for a destination that an
// install is about to replace — or refuse because it is in the way.
func overwriteLine(dst string) string {
	return "overwrites: " + dst
}

// overwriteNotice is told about EVERY destination that already exists when an
// install reaches it — before the refusal (no --force) and before the
// overwrite (--force) — so the user always learns what is in the way before
// anything is written. It is a var so tests can capture the lines. The line
// goes to stderr: stdout belongs to command output (and --json payloads), and
// a pre-write disclosure printed there would corrupt them.
var overwriteNotice = func(dst string) {
	fmt.Fprintln(os.Stderr, overwriteLine(dst))
}

// AgentSkillDir, HostSkillDir, LookupAgent and the agent table live in
// agents.go. HostSkillDir is kept as a compatibility alias.
func HostSkillDir(agentID, scope, projectRoot, home string) (string, bool) {
	return AgentSkillDir(agentID, scope, projectRoot, home)
}

// Note (D1): there is deliberately no separate UniversalSkillDir helper. The
// universal `.agents/skills` tree is just the ProjectDir of every agent whose
// AgentTarget has Universal=true, and AgentSkillDir resolves it -- including
// the env-override precedence those agents follow. A second resolver would be
// dead code that could silently drift from the agent table.

// InstallOp is one planned skill copy.
type InstallOp struct {
	SkillName string
	FromDir   string
	ToDir     string
	// HostLabel is shown in the summary ("universal" or the agent id).
	HostLabel string
}

// PlanInstall builds copy operations: every selected skill is installed into
// each selected agent's own skill directory (repo-local for scope=project,
// user-global for scope=global). Agents that share a directory (several read
// the universal `.agents/skills` tree) collapse to a single write, so a second
// copy never collides with the first.
func PlanInstall(skills []DiscoveredSkill, agents []string, scope, projectRoot, home string) []InstallOp {
	var ops []InstallOp
	seenDest := map[string]bool{}
	for _, sk := range skills {
		name, err := SanitizeSkillName(sk.Pkg.Name)
		if err != nil {
			continue
		}
		for _, ag := range agents {
			dir, ok := AgentSkillDir(ag, scope, projectRoot, home)
			if !ok {
				continue
			}
			dst := filepath.Join(dir, name)
			if seenDest[dst] {
				continue
			}
			seenDest[dst] = true
			ops = append(ops, InstallOp{
				SkillName: name,
				FromDir:   sk.Dir,
				ToDir:     dst,
				HostLabel: ag,
			})
		}
	}
	return ops
}

// CopySkillDir copies a skill directory tree to dst. Symlinks are refused
// (never followed, never recreated), hidden VCS dirs are skipped, and the
// total is bounded by MaxSkillBytes. dst must not exist; when it does, the
// overwrite notice names it BEFORE the refusal, so the user is always told
// what is in the way.
func CopySkillDir(src, dst string) error {
	if _, err := os.Lstat(dst); err == nil {
		overwriteNotice(dst) // pre-write disclosure, even though we then refuse
		return fmt.Errorf("destination already exists: %s", dst)
	}
	var total int64
	err := filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if d.Name() == ".git" {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		// Refuse symlinks and non-regular files outright (FIFOs, devices, sockets)
		if d.Type()&fs.ModeSymlink != 0 {
			return fmt.Errorf("refusing to copy symlink %s", rel)
		}
		if !d.IsDir() && !d.Type().IsRegular() {
			return fmt.Errorf("refusing to copy non-regular file %s", rel)
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return fmt.Errorf("refusing to copy symlink %s", rel)
		}
		total += info.Size()
		if total > MaxSkillBytes {
			return fmt.Errorf("skill exceeds %d bytes", MaxSkillBytes)
		}
		return copyFile(path, target, info.Mode(), info.Size())
	})
	if err != nil {
		// dst did not exist when we started and everything under it was
		// created by this call, so a failed copy must not leave a partial
		// tree behind: it would be indistinguishable from an installed skill,
		// and every retry would refuse with "destination already exists".
		_ = os.RemoveAll(dst)
		return err
	}
	return nil
}

func copyFile(src, dst string, mode fs.FileMode, expectedSize int64) error {
	in, err := os.OpenFile(src, os.O_RDONLY, 0)
	if err != nil {
		return err
	}
	defer in.Close()

	// Verify opened file is still regular (no TOCTOU swap to symlink or pipe)
	fi, err := in.Stat()
	if err != nil {
		return err
	}
	if !fi.Mode().IsRegular() {
		return fmt.Errorf("file %s is not regular after opening", src)
	}

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode.Perm())
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, io.LimitReader(in, expectedSize+1))
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}
