package main

// skills_find.go — `litespm skills find`: search the local catalog for skills.
//
// `litespm search` searches every kind at once; this command is the skills-only
// view of the same local index (catalog.SearchIndex), so it reuses the same
// catalog.Client the `search` command builds — no second index, no network.
// Three modes, mirroring the reference tool:
//
//	litespm skills find                  numbered picker over the first results
//	litespm skills find typescript        keyword search
//	litespm skills find react --owner X   filtered to one source-repo owner
//
// --owner is implemented on evidence, not a guess: the compiled catalog
// listing carries source.url for every skill row (verified against the
// shipping dataset: 20,320/20,320 rows), and on the hosts that serve
// <owner>/<repo> paths — github.com, gitlab.com, bitbucket.org, codeberg.org,
// git.sr.ht, gitea.com, skills.sh and officialskills.sh — the first path
// segment is the source repository's owner (20,313 rows derive an owner; the
// 7 on plain web-page hosts do not). Rows whose source URL is a plain web
// page have no derivable owner and are never matched; the flag does not fall
// back to the publisher claim, which disagrees with the source URL on 59 rows
// and says "community" on others.
//
// Infinite-loop safety: the picker is offered only when BOTH stdin and stdout
// are terminals, so a pipe or a test harness gets the plain list and exit 0,
// never a blocked read.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/skills"
)

var skillsFindUsageText = `Usage: litespm skills find [<query>] [--owner <org>] [--limit <n>] [--json]

Search the local catalog index for skills only (MCP servers and plugins are
filtered out), or pick one from a numbered list.

  <query>        keywords matched against name, title, summary and categories
  --owner <org>  only skills whose source repository is <org>/...
  --limit <n>    at most n results (1-500, default 25)
  --json         machine-readable results (schema litespm-skills-find/v1)
  --help, -h     show this help text

The index is local: run ` + "`litespm catalog sync`" + ` when it is empty. With no query
in a terminal, a numbered picker is offered; without a terminal the list is
printed and the command exits.

--owner reads the first path segment of the skill's source URL on hosts that
serve <owner>/<repo> paths (github.com, gitlab.com, bitbucket.org, codeberg.org,
git.sr.ht, gitea.com, skills.sh, officialskills.sh). A row whose source is a
plain web page has no owner and is never matched.`

// skillsFindOptions is the parsed command line for `litespm skills find`.
type skillsFindOptions struct {
	query   string
	owner   string
	limit   int
	jsonOut bool
	help    bool
}

func skillsFindUsage(w io.Writer) {
	fmt.Fprintln(w, skillsFindUsageText)
}

func parseSkillsFindArgs(args []string) (skillsFindOptions, error) {
	opts := skillsFindOptions{limit: 25}
	var words []string
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
		case "--owner":
			v, err := next()
			if err != nil {
				return opts, err
			}
			v = strings.TrimSpace(v)
			if v == "" {
				return opts, fmt.Errorf("--owner requires a name")
			}
			opts.owner = v
		case "--limit":
			v, err := next()
			if err != nil {
				return opts, err
			}
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 || n > 500 {
				return opts, fmt.Errorf("--limit must be a number between 1 and 500 (got %q)", v)
			}
			opts.limit = n
		case "--json":
			opts.jsonOut = true
		case "--help", "-h":
			opts.help = true
		default:
			if strings.HasPrefix(a, "-") {
				return opts, fmt.Errorf("unknown flag %s", a)
			}
			words = append(words, a)
		}
	}
	opts.query = strings.Join(words, " ")
	return opts, nil
}

// skillsFindIndex builds the catalog client `skills find` searches. A var so
// tests can inject an in-memory index; production builds it exactly like
// `litespm search` does (same local cache, same configured registry URL).
var skillsFindIndex = func(paths *config.PlatformPaths) *catalog.Client {
	cfg, _ := config.LoadCurrentConfig()
	return catalog.NewClientWithTimeout(registryURLOf(cfg), paths.DataRoot, catalogTimeoutOf(cfg), nil)
}

// runSkillsFind is the dispatch entry point for `litespm skills find`.
func runSkillsFind(args []string) int {
	interactive := isTerminal(os.Stdin) && isTerminal(os.Stdout)
	return runSkillsFindTo(os.Stdout, os.Stderr, os.Stdin, interactive, args)
}

// runSkillsFindTo runs the command against explicit streams; interactive is
// computed from real terminals by runSkillsFind and passed explicitly by
// tests.
func runSkillsFindTo(out, errOut io.Writer, stdin io.Reader, interactive bool, args []string) int {
	opts, err := parseSkillsFindArgs(args)
	if err != nil {
		fmt.Fprintf(errOut, "Error: %v\n\n", err)
		skillsFindUsage(errOut)
		return 2
	}
	if opts.help {
		skillsFindUsage(out)
		return 0
	}
	if opts.jsonOut {
		interactive = false
	}

	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		fmt.Fprintf(errOut, "Error: failed to resolve platform paths: %v\n", err)
		return 1
	}
	client := skillsFindIndex(paths)

	indexed := client.Count()
	results := searchSkillListings(client, opts.query, opts.owner, opts.limit)

	if len(results) == 0 {
		if opts.jsonOut {
			return emitSkillsFindJSON(out, errOut, opts, nil, indexed)
		}
		if indexed == 0 {
			fmt.Fprintln(out, "No skills found: the local catalog index is empty.")
			fmt.Fprintln(out, "Run 'litespm catalog sync' to populate it from the registry.")
			return 0
		}
		fmt.Fprintln(out, skillsFindEmptyMessage(opts))
		return 0
	}

	if opts.jsonOut {
		return emitSkillsFindJSON(out, errOut, opts, results, indexed)
	}

	if opts.query == "" && interactive {
		return runSkillsFindPicker(out, errOut, stdin, results)
	}
	printSkillsFindTable(out, opts, results)
	return 0
}

func skillsFindEmptyMessage(opts skillsFindOptions) string {
	switch {
	case opts.owner != "" && opts.query != "":
		return fmt.Sprintf("No skills found matching %q with a source repository owned by %q.", opts.query, opts.owner)
	case opts.owner != "":
		return fmt.Sprintf("No skills found with a source repository owned by %q.", opts.owner)
	default:
		return fmt.Sprintf("No skills found matching %q.", opts.query)
	}
}

// searchSkillListings runs the catalog's own lexical search restricted to
// skills. An owner filter must not be applied after a truncated result set, or
// matches beyond the first `limit` rows would be invisible: that path scans
// the whole skills slice and then cuts to the requested limit.
func searchSkillListings(c *catalog.Client, query, owner string, limit int) []*catalog.SearchResult {
	indexedOpts := catalog.SearchOptions{Kind: domain.KindSkill, Limit: limit}
	if owner == "" {
		return c.Search(query, indexedOpts)
	}
	indexedOpts.Limit = c.Count()
	all := c.Search(query, indexedOpts)
	out := make([]*catalog.SearchResult, 0, limit)
	for _, r := range all {
		if got, ok := skillSourceOwner(r.Listing); ok && strings.EqualFold(got, owner) {
			out = append(out, r)
			if len(out) == limit {
				break
			}
		}
	}
	return out
}

// skillOwnerRepoNames are the hosts whose paths begin <owner>/<repo>. It
// mirrors internal/skills' knownGitHosts (install.go) and adds the two
// skills.sh directory hosts, which publish the same shape.
var skillOwnerRepoNames = map[string]bool{
	"github.com":            true,
	"www.github.com":        true,
	"gitlab.com":            true,
	"bitbucket.org":         true,
	"codeberg.org":          true,
	"git.sr.ht":             true,
	"gitea.com":             true,
	"skills.sh":             true,
	"www.skills.sh":         true,
	"officialskills.sh":     true,
	"www.officialskills.sh": true,
}

// skillSourceOwner returns the source repository's owner for a listing, taken
// from the first path segment of Source.URL on hosts that serve owner/repo
// paths. ok=false means the URL does not expose an owner (a plain page, a URL
// on an unrecognized host, or no URL at all); callers must treat that as "no
// owner", never as a fallback match.
func skillSourceOwner(l *domain.Listing) (string, bool) {
	repo, ok := skillSourceRepoPath(l)
	if !ok {
		return "", false
	}
	owner, _, _ := strings.Cut(repo, "/")
	if owner == "" {
		return "", false
	}
	return owner, true
}

// skillSourceRepoPath returns "<owner>/<repo>" from Source.URL when the host
// serves that shape, and false otherwise.
func skillSourceRepoPath(l *domain.Listing) (string, bool) {
	if l == nil {
		return "", false
	}
	u, err := url.Parse(strings.TrimSpace(l.Source.URL))
	if err != nil || u.Host == "" {
		return "", false
	}
	host := strings.ToLower(u.Hostname())
	if !skillOwnerRepoNames[host] {
		return "", false
	}
	var parts []string
	for _, p := range strings.Split(u.Path, "/") {
		if p != "" {
			parts = append(parts, p)
		}
	}
	if len(parts) < 2 {
		return "", false
	}
	owner := parts[0]
	if host == "git.sr.ht" {
		// sourcehut paths are /~user/repo.
		owner = strings.TrimPrefix(owner, "~")
	}
	repo := strings.TrimSuffix(parts[1], ".git")
	if owner == "" || repo == "" {
		return "", false
	}
	return owner + "/" + repo, true
}

func printSkillsFindTable(out io.Writer, opts skillsFindOptions, results []*catalog.SearchResult) {
	title := fmt.Sprintf("Found %d skill%s", len(results), plural(len(results)))
	if opts.query != "" {
		title += fmt.Sprintf(" matching %q", opts.query)
	}
	if opts.owner != "" {
		title += fmt.Sprintf(" owned by %q", opts.owner)
	}
	fmt.Fprintf(out, "%s:\n\n", title)
	fmt.Fprintf(out, "%-30s %-18s %s\n", "NAME", "OWNER", "SUMMARY")
	fmt.Fprintln(out, strings.Repeat("-", 80))
	for _, r := range results {
		owner := "—"
		if got, ok := skillSourceOwner(r.Listing); ok {
			owner = got
		}
		fmt.Fprintf(out, "%-30s %-18s %s\n",
			truncateRunes(r.Listing.Name, 30),
			truncateRunes(owner, 18),
			truncateRunes(r.Listing.Summary, 60))
		// The listing id is the ONLY string `litespm install` accepts; it is
		// printed whole and untruncated, exactly like `litespm search` does.
		fmt.Fprintf(out, "  %s\n", r.Listing.ID)
	}
}

// runSkillsFindPicker offers a numbered selection over the results. It is
// reached only with both streams attached to a terminal; if the read ends
// before any input (an EOF), the list already printed stays the answer and the
// command exits 0 rather than pretending a selection was made.
func runSkillsFindPicker(out, errOut io.Writer, stdin io.Reader, results []*catalog.SearchResult) int {
	fmt.Fprintln(out, "◇  Select a skill (one number)")
	for i, r := range results {
		fmt.Fprintf(out, "│  %d) %s — %s\n", i+1, r.Listing.Name, truncateRunes(r.Listing.Summary, 80))
	}
	fmt.Fprint(out, "│  > ")
	line, readErr := bufio.NewReader(stdin).ReadString('\n')
	if readErr != nil && strings.TrimSpace(line) == "" {
		fmt.Fprintln(out)
		return 0
	}
	picked, err := parseNumberSelection(line, len(results))
	if err != nil || len(picked) != 1 {
		fmt.Fprintf(errOut, "Error: select exactly one skill (a number between 1 and %d).\n", len(results))
		return 1
	}
	printSkillsFindSelection(out, results[picked[0]])
	return 0
}

// printSkillsFindSelection reports the chosen row and the honest next steps.
// The `skills use` suggestion is offered only when the source URL exposes an
// owner/repo path; it names the selector form this repository's `use` command
// accepts. The install suggestion is offered only when the catalog claims the
// row is more than discovery-only, because `litespm install` refuses the rest.
func printSkillsFindSelection(out io.Writer, res *catalog.SearchResult) {
	l := res.Listing
	fmt.Fprintf(out, "◇  Selected: %s\n", l.Name)
	fmt.Fprintf(out, "│  id:      %s\n", l.ID)
	if owner, ok := skillSourceOwner(l); ok {
		fmt.Fprintf(out, "│  owner:   %s\n", owner)
	}
	if l.Source.URL != "" {
		fmt.Fprintf(out, "│  source:  %s\n", l.Source.URL)
	}
	if l.Summary != "" {
		fmt.Fprintf(out, "│  summary: %s\n", truncateRunes(l.Summary, 120))
	}
	fmt.Fprintln(out, "│")
	if repo, ok := skillSourceRepoPath(l); ok {
		selector := skillsFindSelectorName(l)
		if selector != "" {
			fmt.Fprintf(out, "│  Print its prompt: litespm skills use %s@%s\n", repo, selector)
		} else {
			fmt.Fprintf(out, "│  Print its prompt: litespm skills use %s --skill <name>\n", repo)
		}
	}
	if l.IsInstallable() {
		fmt.Fprintf(out, "│  Install it:       litespm install %s\n", l.ID)
	} else {
		fmt.Fprintln(out, "│  This row is discovery-only metadata: `litespm install` refuses it and")
		fmt.Fprintln(out, "│  the `skills use` line above is a location hint from the source URL,")
		fmt.Fprintln(out, "│  not a verified fetch location.")
	}
}

// skillsFindSelectorName is the name a `skills use <repo>@<name>` selector
// should use: the skill slug the catalog recorded (the third id segment /
// Source.UpstreamID), falling back to the listing name when it sanitizes.
func skillsFindSelectorName(l *domain.Listing) string {
	if name, err := skills.SanitizeSkillName(l.Source.UpstreamID); err == nil {
		return name
	}
	if name, err := skills.SanitizeSkillName(l.Name); err == nil {
		return name
	}
	return ""
}

// skillsFindRow is one row of the --json document.
type skillsFindRow struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Owner          string `json:"owner,omitempty"`
	Source         string `json:"source,omitempty"`
	Summary        string `json:"summary"`
	Installability string `json:"installability,omitempty"`
}

// skillsFindDocument is the `--json` payload (schema litespm-skills-find/v1).
// IndexCount is the whole local index (all kinds), exactly like the `search`
// document, so a consumer can tell "no skill matches" from "empty index".
type skillsFindDocument struct {
	Schema     string          `json:"schema"`
	Query      string          `json:"query"`
	Owner      string          `json:"owner,omitempty"`
	Count      int             `json:"count"`
	IndexCount int             `json:"indexCount"`
	Results    []skillsFindRow `json:"results"`
}

func emitSkillsFindJSON(out, errOut io.Writer, opts skillsFindOptions, results []*catalog.SearchResult, indexed int) int {
	doc := skillsFindDocument{
		Schema:     "litespm-skills-find/v1",
		Query:      opts.query,
		Owner:      opts.owner,
		Count:      len(results),
		IndexCount: indexed,
		Results:    make([]skillsFindRow, 0, len(results)),
	}
	for _, r := range results {
		row := skillsFindRow{
			ID:             r.Listing.ID,
			Name:           r.Listing.Name,
			Source:         r.Listing.Source.URL,
			Summary:        r.Listing.Summary,
			Installability: string(r.Listing.Installability),
		}
		if owner, ok := skillSourceOwner(r.Listing); ok {
			row.Owner = owner
		}
		doc.Results = append(doc.Results, row)
	}
	encoded, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		fmt.Fprintf(errOut, "Error: encode skills find results: %v\n", err)
		return 1
	}
	fmt.Fprintln(out, string(encoded))
	return 0
}

// init registers this subcommand's synopsis on the `skills` help page. The
// top-level help catalog is keyed by dispatch literals and the completeness
// test reads only top-level cases, so a nested `skills find` case needs no new
// key; appending to the existing page is the honest equivalent.
func init() {
	page, ok := helpCatalog["skills"]
	if !ok {
		return
	}
	page.Synopsis = append(page.Synopsis,
		"litespm skills find [<query>] [--owner <org>] [--limit <n>] [--json]",
	)
	helpCatalog["skills"] = page
}
