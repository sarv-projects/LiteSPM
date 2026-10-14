package main

// skills_update.go — `litespm skills update`.
//
// `skills add` records what it wrote (source, digest, inventory). Update is the
// counterpart that refreshes an installed skill from a freshly fetched source
// while keeping the install ledger and the on-disk tree consistent. Fetching is
// done here (git clone or a local directory); the skills package performs the
// policy consult and the atomic swap.
//
// With no arguments, update refreshes every installed skill, resolving each
// row's source from that row's own ledger entry. --source remains as an
// override for rows with no usable recorded source. A row whose source cannot
// be resolved is reported per skill and the run continues; the exit code still
// reflects that something failed.
//
// Honest results: an unchanged source reports "already current", a --dry-run
// reports "would update" without touching disk, a scope mismatch is reported
// and skipped, and a source that does not contain the named skill is an error,
// never a silent no-op.

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/skills"
)

func skillsUpdateUsage() {
	fmt.Println(`Usage: litespm skills update [<name>...] [flags]

Update installed skills from the source each one was installed from. With no
names, every installed skill is updated. Each ledger row records its source;
--source overrides that for every selected row.

  <name>...                 installed skill names (default: every installed skill)
  --source, -s <src>        override the recorded source (owner/repo, https git
                            URL, or local directory)
  --ref, -r <r>             git branch/tag to fetch (remote sources only)
  --scope <project|global>  only update ledger entries in this scope
  --global, -g              shorthand for --scope global
  --project, -p             shorthand for --scope project
  --force, -f               replace a directory even if it has user-added files
  --dry-run, -n             report what would change without writing
  --yes, -y                 non-interactive: auto-detect the scope (project when
                            the working directory is inside a project-scope
                            install, else global) and approve a policy "ask"
  --json                    machine-readable output on stdout

Without a scope flag an interactive terminal is asked; without one (a pipe or
CI) every scope is updated, which is the historical behaviour. Run
` + "`litespm skills list`" + ` to see what the ledger holds.`)
}

type skillsUpdateOptions struct {
	names      []string
	source     string
	ref        string
	scope      string
	scopeGiven bool
	force      bool
	dryRun     bool
	jsonOut    bool
	yes        bool
	help       bool
}

func parseSkillsUpdateArgs(args []string) (skillsUpdateOptions, error) {
	var opts skillsUpdateOptions
	for i := 0; i < len(args); i++ {
		a := args[i]
		next := func() (string, error) {
			if i+1 >= len(args) {
				return "", fmt.Errorf("flag %s requires a value", a)
			}
			i++
			return args[i], nil
		}
		switch a {
		case "--source", "-s":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.source = v
		case "--ref", "-r":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.ref = v
		case "--scope":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.scope = strings.ToLower(v)
			opts.scopeGiven = true
		case "--global", "-g":
			opts.scope = "global"
			opts.scopeGiven = true
		case "--project", "-p":
			opts.scope = "project"
			opts.scopeGiven = true
		case "--force", "-f":
			opts.force = true
		case "--dry-run", "-n":
			opts.dryRun = true
		case "--json":
			opts.jsonOut = true
		case "--yes", "-y":
			opts.yes = true
		case "--help", "-h":
			opts.help = true
		default:
			if strings.HasPrefix(a, "-") {
				return opts, fmt.Errorf("unknown flag %s", a)
			}
			opts.names = append(opts.names, a)
		}
	}
	if opts.scopeGiven && opts.scope != "project" && opts.scope != "global" {
		return opts, fmt.Errorf("invalid scope %q: want project|global", opts.scope)
	}
	return opts, nil
}

// skillUpdateResult is one honest per-entry outcome.
type skillUpdateResult struct {
	Name          string `json:"name"`
	Host          string `json:"host,omitempty"`
	Dir           string `json:"dir,omitempty"`
	Status        string `json:"status"`
	Reason        string `json:"reason,omitempty"`
	ContentDigest string `json:"contentDigest,omitempty"`
	SourceRef     string `json:"sourceRef,omitempty"`
}

// loadSkillLedgerEntries reads every row of the install ledger at a data root.
// Only scope auto-detection and the interactive picker use it; both must run
// before executeSkillsUpdate opens the ledger for the actual work.
func loadSkillLedgerEntries(paths *config.PlatformPaths) ([]skills.LedgerEntry, error) {
	ledger, err := skills.OpenLedger(skills.LedgerPath(paths.DataRoot))
	if err != nil {
		return nil, err
	}
	return ledger.All()
}

func runSkillsUpdate(args []string) {
	opts, err := parseSkillsUpdateArgs(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n\n", err)
		skillsUpdateUsage()
		os.Exit(2)
	}
	if opts.help {
		skillsUpdateUsage()
		return
	}

	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Settle the scope before doing any work: --yes auto-detects, a terminal
	// is asked, and everything else keeps the historical all-scopes default.
	// An unreadable ledger is not fatal here; executeSkillsUpdate reports it.
	if entries, lerr := loadSkillLedgerEntries(paths); lerr == nil {
		cwd, _ := os.Getwd()
		hadScope := opts.scopeGiven
		opts = resolveUpdateScope(opts, entries, cwd)
		if !hadScope && opts.yes {
			fmt.Fprintf(os.Stderr, "Scope: %s (auto-detected by --yes; pass --scope, -g or -p to choose)\n", scopeLabel(opts.scope))
		}
	}

	results, err := executeSkillsUpdate(context.Background(), opts, paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	if opts.jsonOut {
		payload, _ := json.Marshal(map[string]any{
			"source":  opts.source,
			"dryRun":  opts.dryRun,
			"results": results,
		})
		fmt.Println(string(payload))
	} else {
		printUpdateResults(results)
	}

	if n := skillUpdateFailures(results); n > 0 {
		os.Exit(1)
	}
}

// resolveUpdateScope settles which scope this run targets when no scope flag
// was given. Three paths, in order of explicitness:
//
//   - --yes never prompts: the scope is auto-detected from the ledger (project
//     when the working directory belongs to a project-scope install, else
//     global), so the run stays non-interactive. --yes keeps its original
//     meaning too — the policy "ask" approval in newInteractivePolicyAsker;
//     the two meanings are additive.
//   - an interactive terminal is asked (project / global / every scope);
//   - anything else (a pipe or CI) has no way to answer and keeps the
//     historical behaviour of updating every scope.
func resolveUpdateScope(opts skillsUpdateOptions, entries []skills.LedgerEntry, cwd string) skillsUpdateOptions {
	if opts.scopeGiven {
		return opts
	}
	if opts.yes {
		opts.scope = detectUpdateScope(entries, cwd)
		opts.scopeGiven = true
		return opts
	}
	if !stdinIsTerminal() || opts.jsonOut {
		return opts
	}
	return promptUpdateScope(opts, entries, cwd)
}

// promptUpdateScope is the interactive scope question for a bare update. The
// auto-detected choice is the default a plain Enter accepts.
func promptUpdateScope(opts skillsUpdateOptions, entries []skills.LedgerEntry, cwd string) skillsUpdateOptions {
	auto := detectUpdateScope(entries, cwd)
	fmt.Println("◇  Update scope")
	fmt.Println("│  1) This project only")
	fmt.Println("│  2) Global (user-wide)")
	fmt.Println("│  3) Every scope")
	fmt.Printf("│  Enter accepts the auto-detected scope (%s); or enter 1/2/3 > ", auto)
	line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	switch strings.ToLower(strings.TrimSpace(line)) {
	case "1", "project":
		opts.scope, opts.scopeGiven = "project", true
	case "2", "global":
		opts.scope, opts.scopeGiven = "global", true
	case "3", "all", "every":
		opts.scope, opts.scopeGiven = "", false
	default:
		opts.scope, opts.scopeGiven = auto, true
	}
	if opts.scopeGiven {
		fmt.Printf("│  Scope: %s\n", scopeLabel(opts.scope))
	} else {
		fmt.Println("│  Scope: every scope")
	}
	return opts
}

// detectUpdateScope implements --yes scope auto-detection: project when the
// working directory belongs to a project-scope install, else global.
//
// The ledger records the installed directory, not the project root it was
// laid under, so "belongs to" is answered three ways: cwd inside the installed
// directory, the installed directory inside cwd (cwd is the project root), or
// cwd inside the project root reconstructed from the entry's recorded agent
// and that agent's documented project skill directory.
func detectUpdateScope(entries []skills.LedgerEntry, cwd string) string {
	if strings.TrimSpace(cwd) == "" {
		return "global"
	}
	abs, err := filepath.Abs(cwd)
	if err != nil {
		return "global"
	}
	for _, e := range entries {
		if e.Scope != "project" || strings.TrimSpace(e.DestDir) == "" {
			continue
		}
		dest := filepath.Clean(e.DestDir)
		if pathContains(abs, dest) || pathContains(dest, abs) {
			return "project"
		}
		if root, ok := projectRootOfEntry(e); ok && pathContains(root, abs) {
			return "project"
		}
	}
	return "global"
}

// projectRootOfEntry reconstructs the project root an entry's destination was
// laid under, using the skill name every install records and the per-agent
// project directory from the agent table. The longest matching ProjectDir
// wins, so a specific tree like "data/skills" cannot lose to the generic
// "skills" that happens to be its suffix.
func projectRootOfEntry(e skills.LedgerEntry) (string, bool) {
	name, err := skills.SanitizeSkillName(e.SkillName)
	if err != nil {
		return "", false
	}
	dest := filepath.Clean(e.DestDir)
	sep := string(filepath.Separator)
	best := ""
	bestLen := -1
	for _, t := range skills.AgentTargets() {
		pd := filepath.FromSlash(t.ProjectDir)
		if pd == "" {
			continue
		}
		root := strings.TrimSuffix(dest, sep+filepath.Join(pd, name))
		if root == dest || root == "" || root == sep || !filepath.IsAbs(root) {
			continue
		}
		if len(pd) > bestLen {
			best, bestLen = root, len(pd)
		}
	}
	if bestLen < 0 {
		return "", false
	}
	return best, true
}

// pathContains reports whether child is parent itself or lives underneath it.
func pathContains(parent, child string) bool {
	rel, err := filepath.Rel(parent, child)
	if err != nil {
		return false
	}
	return rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)))
}

// stdinIsTerminal reports whether stdin can actually answer an interactive
// prompt. It is deliberately stricter than isTerminal (skills_add.go):
// os/exec hands a child with no stdin the null device, which IS a character
// device but answers every read with EOF, so a prompt that trusted
// ModeCharDevice alone would present a picker nobody can answer. The null
// device is detected explicitly and refused.
func stdinIsTerminal() bool {
	fi, err := os.Stdin.Stat()
	if err != nil || fi.Mode()&os.ModeCharDevice == 0 {
		return false
	}
	if devNull, err := os.Stat(os.DevNull); err == nil && os.SameFile(fi, devNull) {
		return false
	}
	return true
}

// skillUpdateGroup is one fetched source plus every ledger entry that resolves
// to it. Fetching once per group means updating ten skills from one repository
// performs one clone, not ten.
type skillUpdateGroup struct {
	src     skills.SkillSource
	entries []skills.LedgerEntry
}

func skillUpdateSourceKey(src skills.SkillSource) string {
	return strings.Join([]string{src.Kind, src.CloneURL, src.LocalDir, src.Pin, src.Subpath}, "\x00")
}

// executeSkillsUpdate performs the work and returns one result per matched
// ledger entry (plus a not_installed result per requested name with no entry).
// A returned error is fatal: the ledger cannot be read, or an explicitly named
// --source cannot be parsed or fetched. Per-entry failures — including a row
// whose recorded source is missing or unusable — are reported in the results
// and never abort the remaining entries.
func executeSkillsUpdate(ctx context.Context, opts skillsUpdateOptions, paths *config.PlatformPaths) ([]skillUpdateResult, error) {
	ledger, err := skills.OpenLedger(skills.LedgerPath(paths.DataRoot))
	if err != nil {
		return nil, err
	}
	entries, err := ledger.All()
	if err != nil {
		return nil, fmt.Errorf("reading the install ledger: %w", err)
	}

	// The optional --source override: parsed once and applied to every
	// selected row. Without it, every row resolves from its own recorded
	// source (see recordedSkillSource).
	var override *skills.SkillSource
	if strings.TrimSpace(opts.source) != "" {
		src, err := skills.ParseSkillSource(opts.source)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(opts.ref) != "" {
			if src.Kind == "local" {
				return nil, fmt.Errorf("--ref applies only to git sources; %s is a local directory", src.Display)
			}
			src.Pin = strings.TrimSpace(opts.ref)
		}
		override = &src
	}

	// Deduplicate and sanitize the requested names. No names means every
	// installed skill (the update-all path).
	wanted := make([]string, 0, len(opts.names))
	seen := make(map[string]bool, len(opts.names))
	for _, raw := range opts.names {
		name, err := skills.SanitizeSkillName(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid skill name %q", raw)
		}
		if !seen[name] {
			seen[name] = true
			wanted = append(wanted, name)
		}
	}
	updateAll := len(opts.names) == 0

	var results []skillUpdateResult
	matched := map[string]bool{}
	groups := []*skillUpdateGroup{}
	groupIndex := map[string]*skillUpdateGroup{}
	for _, e := range entries {
		if !updateAll && !seen[e.SkillName] {
			continue
		}
		if !updateAll {
			matched[e.SkillName] = true
		}
		if opts.scopeGiven && e.Scope != opts.scope {
			results = append(results, skillUpdateResult{
				Name:   e.SkillName,
				Host:   e.HostLabel,
				Dir:    e.DestDir,
				Status: "skipped",
				Reason: fmt.Sprintf("scope mismatch: installed scope %q, requested %q", e.Scope, opts.scope),
			})
			continue
		}

		src, err := updateSourceForEntry(e, override, opts.ref)
		if err != nil {
			results = append(results, skillUpdateResult{
				Name:   e.SkillName,
				Host:   e.HostLabel,
				Dir:    e.DestDir,
				Status: "error",
				Reason: err.Error(),
			})
			continue
		}
		key := skillUpdateSourceKey(src)
		g := groupIndex[key]
		if g == nil {
			g = &skillUpdateGroup{src: src}
			groupIndex[key] = g
			groups = append(groups, g)
		}
		g.entries = append(g.entries, e)
	}

	// The policy engine is only opened when there is something to write; a
	// no-op run must not require a state database to exist.
	if len(groups) > 0 {
		asker := newInteractivePolicyAsker(opts.yes)
		policyEngine, closePolicy, policyErr := openCLIPolicyEngine(paths.DataRoot)
		if policyErr != nil {
			return nil, fmt.Errorf("load policy: %w", policyErr)
		}
		defer closePolicy()
		installer := skills.NewInstaller(ledger, enginePolicyChecker(policyEngine, asker.resolve))
		for _, g := range groups {
			groupResults, ferr := executeUpdateGroup(ctx, g, installer, opts, override != nil)
			if ferr != nil {
				return nil, ferr
			}
			results = append(results, groupResults...)
		}
	}

	for _, name := range wanted {
		if !matched[name] {
			results = append(results, skillUpdateResult{
				Name:   name,
				Status: "not_installed",
				Reason: fmt.Sprintf("no ledger entry for skill %q", name),
			})
		}
	}
	return results, nil
}

// updateSourceForEntry resolves the source one ledger row will be updated
// from. An explicit --source overrides every row (the fallback for rows that
// recorded no usable source); otherwise the row's own recorded source and ref
// are used, and a row that recorded none is reported by the caller rather than
// guessed at.
func updateSourceForEntry(e skills.LedgerEntry, override *skills.SkillSource, refOverride string) (skills.SkillSource, error) {
	if override != nil {
		return *override, nil
	}
	src, err := recordedSkillSource(e)
	if err != nil {
		return src, err
	}
	if ref := strings.TrimSpace(refOverride); ref != "" {
		if src.Kind == "local" {
			return src, fmt.Errorf("--ref applies only to git sources; the source recorded for %s is a local directory", e.SkillName)
		}
		src.Pin = ref
	}
	return src, nil
}

// recordedSkillSource rebuilds a SkillSource from one ledger row.
//
// The row records the source label (Source) and a ref (SourceRef) but no
// subpath. A source installed from a GitHub browse URL (…/tree/<ref>/<sub>)
// records the subpath appended to the clone URL — a shape no other source can
// produce — so it is split back into repository plus subpath here. Nothing
// else is guessed: a row with no source, or a label that no longer parses, is
// reported and skipped.
func recordedSkillSource(e skills.LedgerEntry) (skills.SkillSource, error) {
	raw := strings.TrimSpace(e.Source)
	if raw == "" {
		return skills.SkillSource{}, fmt.Errorf("no source recorded for %s in the ledger; re-run with --source <src>", e.SkillName)
	}
	src, err := skills.ParseSkillSource(raw)
	if err != nil {
		return skills.SkillSource{}, fmt.Errorf("the recorded source %q for %s is not usable: %w; re-run with --source <src>", raw, e.SkillName, err)
	}
	if clone, display, repo, sub, ok := splitGitHubBrowseDisplay(raw); ok {
		src.Kind = "url"
		src.CloneURL = clone
		src.Display = display
		src.RepoPath = repo
		src.Subpath = sub
		src.Git = true
	}
	if src.Pin == "" {
		src.Pin = recordedPin(e.SourceRef)
	}
	return src, nil
}

// splitGitHubBrowseDisplay inverts the label an install from a GitHub browse
// URL recorded: "https://github.com/<owner>/<repo>/<subpath>", with no ".git"
// suffix and more than two path segments. ParseSkillSource turns that into a
// clone URL that appends ".git" to the subpath, so it is rebuilt here. Hosts
// other than GitHub are left alone because their repository paths can
// legitimately contain extra segments (GitLab subgroups).
func splitGitHubBrowseDisplay(raw string) (cloneURL, display, repoPath, subpath string, ok bool) {
	u, err := url.Parse(raw)
	if err != nil || (u.Host != "github.com" && u.Host != "www.github.com") {
		return "", "", "", "", false
	}
	path := strings.Trim(u.Path, "/")
	if path == "" || strings.HasSuffix(path, ".git") {
		return "", "", "", "", false
	}
	parts := strings.Split(path, "/")
	if len(parts) <= 2 || parts[0] == "" || parts[1] == "" {
		return "", "", "", "", false
	}
	repoPath = parts[0] + "/" + parts[1]
	subpath = strings.Join(parts[2:], "/")
	cloneURL = "https://" + u.Host + "/" + repoPath + ".git"
	display = "https://" + u.Host + "/" + repoPath + "/" + subpath
	return cloneURL, display, repoPath, subpath, true
}

// recordedPin decides whether a recorded SourceRef should be re-applied as a
// pin. An unpinned install stores the observed commit SHA there
// (SkillSource.RecordedRef), and `git clone --branch <sha>` only works for a
// branch tip, so a bare commit is provenance rather than a pin: updates follow
// the source's default branch. A named ref (tag or branch) is honoured. The
// ledger records no separate "was this an explicit pin" flag, so a pin that
// itself looks like a bare commit is treated as a commit; that is reported on
// the source field's docs, not silently re-pinned.
func recordedPin(ref string) string {
	ref = strings.TrimSpace(ref)
	if ref == "" || isBareCommit(ref) {
		return ""
	}
	return ref
}

// isBareCommit reports whether ref looks like a git object id (7–40 lowercase
// hex characters) rather than a human-named ref.
func isBareCommit(ref string) bool {
	if len(ref) < 7 || len(ref) > 40 {
		return false
	}
	for _, r := range ref {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f') {
			return false
		}
	}
	return true
}

// executeUpdateGroup fetches one source and updates every entry resolved to
// it. A fetch failure is per-entry only when the source came from the ledger:
// an explicitly named --source is a single requested operation, so its failure
// stays fatal, exactly as it was before update-all existed.
func executeUpdateGroup(ctx context.Context, g *skillUpdateGroup, installer *skills.Installer, opts skillsUpdateOptions, explicitSource bool) ([]skillUpdateResult, error) {
	var results []skillUpdateResult
	appendErrors := func(err error) {
		for _, e := range g.entries {
			results = append(results, skillUpdateResult{
				Name:   e.SkillName,
				Host:   e.HostLabel,
				Dir:    e.DestDir,
				Status: "error",
				Reason: err.Error(),
			})
		}
	}

	src := g.src
	workRoot, cleanup, err := fetchSkillSourceTree(src)
	if err != nil {
		if explicitSource {
			return nil, err
		}
		appendErrors(err)
		return results, nil
	}
	defer cleanup()

	commit := ""
	if src.Kind != "local" {
		commit = gitHeadCommit(workRoot)
	}
	newRef := src.RecordedRef(commit)

	scanRoot := workRoot
	if src.Subpath != "" {
		scanRoot = filepath.Join(workRoot, filepath.FromSlash(src.Subpath))
	}
	found, err := discoverSkillsIncludingRoot(scanRoot)
	if err != nil {
		if explicitSource {
			return nil, err
		}
		appendErrors(err)
		return results, nil
	}
	// An update must not quietly install a skill that a fresh `add` would have
	// refused: the internal-skill gate has to apply on both paths, or
	// INSTALL_INTERNAL_SKILLS would only be enforced on first install.
	visible, hidden := skills.FilterVisibleSkills(found)
	if len(visible) == 0 && len(hidden) > 0 {
		err := fmt.Errorf("%d skill(s) in %s are marked internal; set %s=1 to update them",
			len(hidden), src.Display, skills.InternalSkillsEnvVar)
		if explicitSource {
			return nil, err
		}
		appendErrors(err)
		return results, nil
	}
	found = visible
	byName := make(map[string]string, len(found))
	for _, f := range found {
		name, err := skills.SanitizeSkillName(f.Pkg.Name)
		if err != nil {
			continue
		}
		if _, dup := byName[name]; !dup {
			byName[name] = f.Dir
		}
	}

	for _, e := range g.entries {
		dir := byName[e.SkillName]
		if dir == "" {
			results = append(results, skillUpdateResult{
				Name:   e.SkillName,
				Host:   e.HostLabel,
				Dir:    e.DestDir,
				Status: "error",
				Reason: "the source does not contain a skill named " + e.SkillName,
			})
			continue
		}

		outcome, err := installer.Update(ctx, skills.UpdateRequest{
			Entry:     e,
			NewDir:    dir,
			NewSource: src.Display,
			NewRef:    newRef,
			Force:     opts.force,
			DryRun:    opts.dryRun,
		})
		if err != nil {
			results = append(results, skillUpdateResult{
				Name:   e.SkillName,
				Host:   e.HostLabel,
				Dir:    e.DestDir,
				Status: "error",
				Reason: err.Error(),
			})
			continue
		}

		res := skillUpdateResult{
			Name:          outcome.Entry.SkillName,
			Host:          outcome.Entry.HostLabel,
			Dir:           outcome.Entry.DestDir,
			Reason:        outcome.Reason,
			ContentDigest: outcome.Entry.ContentDigest,
			SourceRef:     outcome.Entry.SourceRef,
		}
		switch {
		case outcome.Updated:
			res.Status = "updated"
		case outcome.WouldUpdate:
			res.Status = "would_update"
		case outcome.AlreadyCurrent:
			res.Status = "already_current"
		default:
			res.Status = "no_change"
		}
		results = append(results, res)
	}
	return results, nil
}

func skillUpdateFailures(results []skillUpdateResult) int {
	n := 0
	for _, r := range results {
		if r.Status == "error" || r.Status == "not_installed" {
			n++
		}
	}
	return n
}

func printUpdateResults(results []skillUpdateResult) {
	if len(results) == 0 {
		fmt.Println("Nothing to update: no matching ledger entries.")
		return
	}
	var updated, would, current, skipped, failed int
	for _, r := range results {
		switch r.Status {
		case "updated":
			updated++
			fmt.Printf("  ✓ %-20s updated %s\n", r.Name, r.Dir)
		case "would_update":
			would++
			fmt.Printf("  - %-20s would update %s (%s)\n", r.Name, r.Dir, r.Reason)
		case "already_current":
			current++
			fmt.Printf("  = %-20s already current\n", r.Name)
		case "skipped":
			skipped++
			fmt.Printf("  ○ %-20s skipped: %s\n", r.Name, r.Reason)
		case "not_installed":
			failed++
			fmt.Printf("  ! %-20s not installed: %s\n", r.Name, r.Reason)
		default:
			failed++
			fmt.Printf("  ! %-20s failed: %s\n", r.Name, r.Reason)
		}
	}
	fmt.Println()
	fmt.Printf("%d updated · %d would update · %d already current · %d skipped · %d failed\n",
		updated, would, current, skipped, failed)
}

// fetchSkillSourceTree materializes a source into a local directory. Remote
// sources are shallow-cloned (honoring a branch/tag pin); local sources are
// used in place and need no cleanup.
// gitCloneEnv hardens the child git against the caller's ambient environment.
// Every one of these is a documented failure of an unhardened clone: a
// credential helper or askpass popping UI mid-install (GIT_TERMINAL_PROMPT),
// a `[protocol "x"] allow = always` in the user's global gitconfig
// re-enabling a transport we never intended (GIT_ALLOW_PROTOCOL), and a repo
// with LFS content plus a broken filter failing checkout (the filter.lfs.*
// overrides, which kill the filter even when git-lfs is absent — the case
// GIT_LFS_SKIP_SMUDGE alone does not cover).
//
// https:ssh:git is narrower than the reference installer's
// https:http:ssh:git:file: plain http and file: are transports we never
// legitimately need, and refusing them here is enforced even against a hostile
// global config rather than only against our own input.
//
// ssh is required, not optional. git maps BOTH `git@host:owner/repo.git` and
// `ssh://host/path` to its ssh transport, so while this read `https:git` a
// clone of an admitted ssh source died with "fatal: transport 'ssh' not
// allowed" before any network I/O — admitting ssh in ParseSkillSource without
// listing it here would have been inert. GIT_TERMINAL_PROMPT=0 stays: ssh agent
// auth is not a terminal prompt, so hardening and ssh sources coexist.
var gitCloneEnv = []string{
	"GIT_ALLOW_PROTOCOL=https:ssh:git",
	"GIT_TERMINAL_PROMPT=0",
	"GIT_LFS_SKIP_SMUDGE=1",
	"filter.lfs.required=false",
	"filter.lfs.smudge=",
	"filter.lfs.clean=",
	"filter.lfs.process=",
}

// gitCloneTimeout bounds a clone. Without it a hung TCP peer hangs the CLI
// indefinitely, because exec.Command carries no deadline of its own. Overridable
// because a slow link and a large repo are legitimate reasons to need longer.
var gitCloneTimeout = func() time.Duration {
	if v := strings.TrimSpace(os.Getenv("SKILLS_GIT_TIMEOUT")); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return 5 * time.Minute
}()

func fetchSkillSourceTree(src skills.SkillSource) (root string, cleanup func(), err error) {
	if src.Kind == "local" {
		return src.LocalDir, func() {}, nil
	}
	// A source that is not a git repo at all — a bare SKILL.md over https, or a
	// .zip/.tar/.tar.gz, extension optional. This is checked here as well as at
	// the `add` call site because `update` reaches this function from two more
	// directions (a --source override and a source re-read from the ledger), and
	// a download-sourced skill that could be installed but never updated would
	// be a trap. The decision itself lives in internal/skills, so all three
	// paths agree on what counts as a download.
	if skills.IsDirectDownloadSource(src.Display) {
		return skills.FetchSkillDownload(context.Background(), src.Display)
	}
	if _, lookErr := exec.LookPath("git"); lookErr != nil {
		return "", nil, fmt.Errorf("git is required to fetch remote skill sources")
	}
	tmp, err := os.MkdirTemp("", "litespm-skills-update-*")
	if err != nil {
		return "", nil, err
	}
	cleanup = func() { _ = os.RemoveAll(tmp) }

	args := []string{"clone", "--depth", "1"}
	if strings.TrimSpace(src.Pin) != "" {
		args = append(args, "--branch", src.Pin)
	}
	args = append(args, src.CloneURL, tmp)

	// git runs with the caller's ambient environment, which means it also
	// honours the user's global gitconfig: a credential helper or askpass can
	// pop UI mid-install, a `[protocol "x"] allow = always` can re-enable a
	// transport we never intended, and a hung TCP peer would hang this command
	// forever because there is no deadline. ParseSkillSource has already
	// refused anything that is not an https URL, so the transports we actually
	// need are exactly https and git-over-https — but refusing them here is
	// still load-bearing, because it is enforced even against a hostile
	// global config rather than only against our own input.
	//
	// LFS is disabled two ways for the same reason the reference installer
	// does it: GIT_LFS_SKIP_SMUDGE covers an installed git-lfs, and emptying
	// the filter.lfs.* config kills the filter even when git-lfs is absent,
	// where a repo with LFS content and a broken filter fails checkout.
	cloneCtx, cancel := context.WithTimeout(context.Background(), gitCloneTimeout)
	defer cancel()
	cmd := exec.CommandContext(cloneCtx, "git", args...)
	cmd.Env = append(os.Environ(), gitCloneEnv...)
	if out, cloneErr := cmd.CombinedOutput(); cloneErr != nil {
		cleanup()
		if cloneCtx.Err() == context.DeadlineExceeded {
			return "", nil, fmt.Errorf("cloning %s timed out after %s; the remote did not respond in time (raise it with SKILLS_GIT_TIMEOUT)", src.Display, gitCloneTimeout)
		}
		return "", nil, fmt.Errorf("failed to clone %s: %v\n%s", src.Display, cloneErr, strings.TrimSpace(string(out)))
	}
	return tmp, cleanup, nil
}

// gitHeadCommit returns the checked-out commit of a git tree, or "" when the
// tree is not a git repository.
func gitHeadCommit(dir string) string {
	out, err := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// discoverSkillsIncludingRoot discovers skills under root and also accepts a
// source that is itself a single skill directory (SKILL.md at the root), which
// a repository scan intentionally skips.
//
// This now delegates to the engine's exported discovery instead of re-scanning
// twice here. That is not only deduplication: the local version could only find
// a root SKILL.md when nothing else was found, so it missed the three-level
// layout (skills/<category>/<name>/SKILL.md) that the engine's walk reaches.
// `add` calls the exported helper directly for the same reason.
func discoverSkillsIncludingRoot(root string) ([]skills.DiscoveredSkill, error) {
	return skills.DiscoverSkillsIncludingRoot(root)
}
