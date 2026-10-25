package main

// skills_remove.go — `litespm skills list` and `litespm skills remove`.
//
// `skills list` reads the install ledger and prints what it holds. `skills
// remove` is the counterpart to `skills add`: it deletes only the directories
// the ledger names, refusing anything that no longer looks like a skill we
// installed. `litespm uninstall` reports these directories rather than deleting
// them, because a skills tree may hold the user's own files; this command is
// the explicit, opt-in deletion.
//
// Every selection axis is matched against what the ledger RECORDED at install
// time, never against where a file happens to be now:
//
//   - skill name: positional <name>, --skill <name> (repeatable), '*' = all;
//   - exact source: a positional owner/repo, https URL, or local directory;
//   - agent: --agent <id> (repeatable), '*' = every agent;
//   - scope: --scope, -g, -p (default project; other scopes are refused per
//     entry, never deleted silently).
//
// The ledger's removal API deletes by (skill name, scope). A filter that would
// leave some rows of a selected name behind is therefore refused by name — with
// the destination it would have destroyed named — rather than deleting a row
// the filter excluded.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/skills"
)

func skillsListUsage() {
	fmt.Println(`Usage: litespm skills list [flags]

List the skill directories recorded in the install ledger, with the host and
scope each was installed for.

  --global, -g              only entries whose recorded scope is global
  --agent, -a <agent-id>    only entries recorded for this agent (repeatable;
                            '*' = every agent)
  --json                    machine-readable output on stdout
  --help, -h                show this help text`)
}

type skillsListOptions struct {
	global  bool
	agents  []string
	jsonOut bool
	help    bool
}

func parseSkillsListArgs(args []string) (skillsListOptions, error) {
	var opts skillsListOptions
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch a {
		case "--json":
			opts.jsonOut = true
		case "--global", "-g":
			opts.global = true
		case "--agent", "-a":
			if i+1 >= len(args) {
				return opts, fmt.Errorf("flag %s requires a value", a)
			}
			i++
			opts.agents = append(opts.agents, strings.ToLower(strings.TrimSpace(args[i])))
		case "--help", "-h":
			opts.help = true
		default:
			// An unrecognised argument is an error, never silently dropped:
			// `ls -g` used to list everything, which is worse than refusing.
			return opts, fmt.Errorf("unknown argument %s (list takes -g/--global, -a/--agent <id>, --json)", a)
		}
	}
	if err := validateAgentSelection(opts.agents); err != nil {
		return opts, err
	}
	return opts, nil
}

// validateAgentSelection rejects an unknown agent id before any filter runs: a
// typo must be an error, not a silent empty result. '*' is the wildcard.
func validateAgentSelection(agents []string) error {
	for _, ag := range agents {
		if ag == "*" {
			continue
		}
		if _, ok := skills.LookupAgent(ag); !ok {
			return fmt.Errorf("unknown agent %q; known agents: %s", ag, strings.Join(skills.AgentIDs(), " "))
		}
	}
	return nil
}

// entryRecordedAgent returns the agent the ledger recorded for an entry.
// AgentID is the provenance field; HostLabel has always been written with the
// same value and is the fallback for rows that predate AgentID. Both are
// ledger records — neither is inferred from where the file is now.
func entryRecordedAgent(e skills.LedgerEntry) string {
	if a := strings.TrimSpace(e.AgentID); a != "" {
		return a
	}
	return strings.TrimSpace(e.HostLabel)
}

// entryMatchesAgentFilter reports whether an entry is selected by the --agent
// values. No values, or '*', selects every agent — the same meaning `skills
// add` gives its --agent list.
func entryMatchesAgentFilter(e skills.LedgerEntry, agents []string) bool {
	if len(agents) == 0 || containsString(agents, "*") {
		return true
	}
	return containsString(agents, entryRecordedAgent(e))
}

func containsString(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}

// filterSkillsList returns the entries matching the list filters. The scope is
// matched on the recorded field: a row written before scopes were recorded
// (empty) is not global and is therefore not listed by -g.
func filterSkillsList(entries []skills.LedgerEntry, opts skillsListOptions) []skills.LedgerEntry {
	out := make([]skills.LedgerEntry, 0, len(entries))
	for _, e := range entries {
		if opts.global && e.Scope != "global" {
			continue
		}
		if !entryMatchesAgentFilter(e, opts.agents) {
			continue
		}
		out = append(out, e)
	}
	return out
}

func runSkillsList(args []string) {
	opts, err := parseSkillsListArgs(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n\n", err)
		skillsListUsage()
		os.Exit(2)
	}
	if opts.help {
		skillsListUsage()
		return
	}

	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	entries, err := loadSkillLedgerEntries(paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	filtered := filterSkillsList(entries, opts)

	if opts.jsonOut {
		payload, _ := json.Marshal(map[string]any{"installed": filtered})
		fmt.Println(string(payload))
		return
	}
	if len(entries) == 0 {
		fmt.Println("No skills have been installed by this tool.")
		return
	}
	if len(filtered) == 0 {
		fmt.Println("No installed skills match the given filters.")
		return
	}

	sort.Slice(filtered, func(i, j int) bool {
		if filtered[i].SkillName != filtered[j].SkillName {
			return filtered[i].SkillName < filtered[j].SkillName
		}
		return filtered[i].DestDir < filtered[j].DestDir
	})

	fmt.Printf("Skills managed by this tool (%d director%s):\n\n",
		len(filtered), pluralY(len(filtered)))
	fmt.Printf("%-24s %-16s %-9s %-9s %s\n", "SKILL", "HOST", "SCOPE", "ORIGIN", "DIRECTORY")
	fmt.Println(repeat("-", 88))
	for _, e := range filtered {
		// An adopted skill was not installed by this tool. Saying so is the
		// difference between "LiteSPM put this here" and "LiteSPM manages
		// this", and the difference matters when someone asks why a skill
		// cannot be updated.
		origin := "installed"
		if e.Source == skills.AdoptedSource {
			origin = "adopted"
		}
		fmt.Printf("%-24s %-16s %-9s %-9s %s\n", e.SkillName, e.HostLabel, e.Scope, origin, e.DestDir)
	}
	fmt.Println()
	fmt.Println("Remove with: litespm skills remove <name>  or  litespm skills remove --all")
}

func skillsRemoveUsage() {
	fmt.Println(`Usage: litespm skills remove [<name>|<source> ...] [flags]

  <name>                    remove one or more installed skills by name
  <source>                  owner/repo, https URL, or local dir: removes every
                            skill installed from that exact source
  --skill, -s <name>        select a skill (repeatable; '*' = every skill)
  --agent, -a <agent>       select by the agent recorded at install
                            (repeatable; '*' = every agent)
  --all                     remove every matching skill; exactly equivalent to
                            --skill '*' --agent '*' -y
  --scope <project|global>  restrict removal to this scope (default: project);
                            entries whose recorded scope differs are refused,
                            not deleted
  --global, -g              shorthand for --scope global
  --project, -p             shorthand for --scope project
  --force, -f               remove a directory even if it holds files added
                            after install
  --dry-run, -n             show what would be removed without deleting anything
  --yes, -y                 never prompt (a bare run then needs an explicit
                            selection)
  --json                    machine-readable output
  --help, -h                show this help text

With no name, no source and no --all, an interactive terminal gets a picker
over what the ledger holds; without a terminal that invocation stays a usage
error.

Run ` + "`litespm skills list`" + ` to see what the ledger holds.`)
}

type skillsRemoveOptions struct {
	names      []string // positional skill names
	sources    []string // positional exact sources, canonical form
	skills     []string // --skill values; '*' selects every skill
	agents     []string // --agent values; '*' selects every agent
	all        bool
	yes        bool
	dryRun     bool
	jsonOut    bool
	scope      string
	scopeGiven bool
	force      bool
	help       bool
}

func parseSkillsRemoveArgs(args []string) (skillsRemoveOptions, error) {
	var opts skillsRemoveOptions
	var positionals []string
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
		case "--all":
			opts.all = true
		case "--skill", "-s":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.skills = append(opts.skills, strings.ToLower(strings.TrimSpace(v)))
		case "--agent", "-a":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.agents = append(opts.agents, strings.ToLower(strings.TrimSpace(v)))
		case "--yes", "-y":
			opts.yes = true
		case "--dry-run", "-n":
			opts.dryRun = true
		case "--json":
			opts.jsonOut = true
		case "--force", "-f":
			opts.force = true
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
		case "--help", "-h":
			opts.help = true
		default:
			if strings.HasPrefix(a, "-") {
				return opts, fmt.Errorf("unknown flag %s", a)
			}
			positionals = append(positionals, a)
		}
	}
	if opts.scopeGiven && opts.scope != "project" && opts.scope != "global" {
		return opts, fmt.Errorf("invalid scope %q: want project|global", opts.scope)
	}
	if err := validateAgentSelection(opts.agents); err != nil {
		return opts, err
	}
	// Positionals are either skill names or exact sources. A value that
	// sanitizes to a valid skill name is a name; skill names never contain
	// "/", so anything else must parse as a source (owner/repo, https URL, or
	// local directory).
	for _, p := range positionals {
		if name, err := skills.SanitizeSkillName(p); err == nil {
			opts.names = append(opts.names, name)
			continue
		}
		src, err := skills.ParseSkillSource(p)
		if err != nil {
			return opts, fmt.Errorf("invalid argument %q: not a skill name or a source (%v)", p, err)
		}
		opts.sources = append(opts.sources, src.Display)
	}
	if opts.all {
		if len(opts.names) > 0 || len(opts.sources) > 0 || hasNarrowSelector(opts.skills) || hasNarrowSelector(opts.agents) {
			return opts, fmt.Errorf("--all cannot be combined with named skill, source, or agent selectors; omit --all to narrow the removal")
		}
		// --all is exactly `--skill '*' --agent '*' -y`; recording the same
		// selection makes the two spellings indistinguishable (asserted in
		// tests), so they cannot drift apart.
		opts.skills = appendWildcard(opts.skills)
		opts.agents = appendWildcard(opts.agents)
		opts.yes = true
	}
	if hasWildcard(opts.skills) && hasWildcard(opts.agents) && opts.yes {
		opts.all = true
	}
	if !opts.scopeGiven {
		// Removal is scope-checked: without an explicit scope the command acts
		// on project-scoped installs, mirroring `skills add`. Global entries are
		// left in place and reported, never deleted across scopes silently.
		opts.scope = "project"
	}
	return opts, nil
}

func hasNarrowSelector(values []string) bool {
	for _, value := range values {
		if value != "*" {
			return true
		}
	}
	return false
}

// appendWildcard adds '*' once to a repeatable value list.
func appendWildcard(list []string) []string {
	if hasWildcard(list) {
		return list
	}
	return append(list, "*")
}

func hasWildcard(list []string) bool {
	return containsString(list, "*")
}

func runSkillsRemove(args []string) {
	opts, err := parseSkillsRemoveArgs(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n\n", err)
		skillsRemoveUsage()
		os.Exit(2)
	}
	if opts.help {
		skillsRemoveUsage()
		return
	}

	if needsRemovePicker(opts) {
		runInteractiveSkillsRemove(opts)
		return
	}

	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	outcomes, err := executeSkillsRemove(opts, paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	reportSkillsRemove(opts, outcomes)
}

// needsRemovePicker reports whether the invocation named nothing to remove.
// --all is a selection; so are positional names/sources and --skill values.
// A bare command is the only case that needs the interactive picker.
func needsRemovePicker(opts skillsRemoveOptions) bool {
	return !opts.all && len(opts.names) == 0 && len(opts.skills) == 0 && len(opts.sources) == 0
}

// runInteractiveSkillsRemove is the bare `skills remove` path: a numbered
// picker over what the ledger holds, built from the same primitives as the
// `skills add` prompts. It is only reachable with a terminal on stdin — in a
// pipe or CI there is nobody to answer, so the invocation stays the usage
// error it always was (and --all is the explicit non-interactive form).
func runInteractiveSkillsRemove(opts skillsRemoveOptions) {
	if !stdinIsTerminal() || opts.yes || opts.jsonOut {
		fmt.Fprintln(os.Stderr, "Error: no skills selected; pass <name>..., a <source>, --skill <name>, or --all")
		skillsRemoveUsage()
		os.Exit(2)
	}

	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	entries, err := loadSkillLedgerEntries(paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	candidates := buildRemoveCandidates(entries, opts)
	if len(candidates) == 0 {
		fmt.Println("No installed skills match the current scope/agent filters; nothing to remove.")
		return
	}

	fmt.Println("◇  Select skills to remove (numbers, comma-separated, or 'all')")
	for i, c := range candidates {
		fmt.Printf("│  %d) %-28s [%s] %d destination(s): %s\n",
			i+1, c.SkillName, c.Scope, len(c.Dests), strings.Join(c.Hosts, ", "))
	}
	fmt.Print("│  > ")
	line, readErr := bufio.NewReader(os.Stdin).ReadString('\n')
	if readErr != nil && strings.TrimSpace(line) == "" {
		// EOF on a stdin that could not answer (a closed or null device):
		// the same usage error a pipe gets, not a silent empty selection.
		fmt.Fprintln(os.Stderr, "Error: no skills selected; pass <name>..., a <source>, --skill <name>, or --all")
		skillsRemoveUsage()
		os.Exit(2)
	}
	picked, err := parseNumberSelection(line, len(candidates))
	if err != nil || len(picked) == 0 {
		fmt.Fprintln(os.Stderr, "Error: no skills selected.")
		os.Exit(1)
	}

	// Group the picks by scope: the ledger's removal is scoped, so one call
	// serves one scope. The picker labels every row with its recorded scope,
	// so a selection spanning scopes is explicit, not silent.
	order := []string{}
	byScope := map[string][]string{}
	for _, idx := range picked {
		c := candidates[idx]
		if _, ok := byScope[c.Scope]; !ok {
			order = append(order, c.Scope)
		}
		byScope[c.Scope] = append(byScope[c.Scope], c.SkillName)
	}

	var outcomes []skills.RemovalOutcome
	for _, scope := range order {
		group := opts
		group.names = byScope[scope]
		group.scope = scope
		group.scopeGiven = true
		groupOutcomes, err := executeSkillsRemove(group, paths)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		outcomes = append(outcomes, groupOutcomes...)
	}
	reportSkillsRemove(opts, outcomes)
}

// removeCandidate is one selectable row of the interactive picker: a skill in
// one scope. (skill, scope) is the unit the ledger can remove in one call, so
// the picker presents exactly that and names every destination it covers.
type removeCandidate struct {
	SkillName string
	Scope     string
	Hosts     []string
	Dests     []string
}

func buildRemoveCandidates(entries []skills.LedgerEntry, opts skillsRemoveOptions) []removeCandidate {
	var out []removeCandidate
	index := map[string]int{}
	for _, e := range entries {
		if opts.scopeGiven && e.Scope != opts.scope {
			continue
		}
		if !entryMatchesAgentFilter(e, opts.agents) {
			continue
		}
		key := e.SkillName + "\x00" + e.Scope
		if i, ok := index[key]; ok {
			out[i].Hosts = appendUnique(out[i].Hosts, entryRecordedAgent(e))
			out[i].Dests = append(out[i].Dests, e.DestDir)
			continue
		}
		index[key] = len(out)
		out = append(out, removeCandidate{
			SkillName: e.SkillName,
			Scope:     e.Scope,
			Hosts:     []string{entryRecordedAgent(e)},
			Dests:     []string{e.DestDir},
		})
	}
	return out
}

func appendUnique(list []string, v string) []string {
	if v == "" || containsString(list, v) {
		return list
	}
	return append(list, v)
}

// reportSkillsRemove prints the outcomes and the summary. Refusals are
// reported, never hidden: exit 0 means "the pass ran", not "everything was
// deleted", exactly as before — a removal that was left in place is named with
// its reason.
func reportSkillsRemove(opts skillsRemoveOptions, outcomes []skills.RemovalOutcome) {
	var removed, kept int
	for _, o := range outcomes {
		if o.Removed {
			removed++
		} else {
			kept++
		}
	}

	if opts.jsonOut {
		payload, _ := json.Marshal(map[string]any{
			"dryRun":  opts.dryRun,
			"removed": removed,
			"kept":    kept,
			"outcomes": func() []map[string]string {
				out := make([]map[string]string, 0, len(outcomes))
				for _, o := range outcomes {
					out = append(out, map[string]string{
						"skill":  o.Entry.SkillName,
						"host":   o.Entry.HostLabel,
						"dir":    o.Entry.DestDir,
						"reason": o.Reason,
					})
				}
				return out
			}(),
		})
		fmt.Println(string(payload))
		return
	}

	if len(outcomes) == 0 {
		fmt.Println("Nothing to remove: the ledger has no matching entries.")
		return
	}

	for _, o := range outcomes {
		switch {
		case o.Removed && opts.dryRun:
			fmt.Printf("  - %-20s would remove %s\n", o.Entry.SkillName, o.Entry.DestDir)
		case o.Removed:
			fmt.Printf("  ✓ %-20s removed %s\n", o.Entry.SkillName, o.Entry.DestDir)
		default:
			fmt.Printf("  ○ %-20s left in place: %s\n", o.Entry.SkillName, o.Reason)
		}
	}

	fmt.Println()
	if opts.dryRun {
		fmt.Printf("Dry run: %d director%s would be removed, %d left in place.\n",
			removed, pluralY(removed), kept)
		fmt.Println("Re-run without --dry-run to apply.")
		return
	}
	fmt.Printf("Done: %d removed, %d left in place.\n", removed, kept)
}

// executeSkillsRemove resolves the selection against what the ledger recorded
// and delegates to the ledger's scope-checked removal. Entries no filter
// selects produce no outcomes; a filter that would force the ledger to delete
// a row it excludes is refused per skill name, with the row that would have
// been destroyed named in the reason.
func executeSkillsRemove(opts skillsRemoveOptions, paths *config.PlatformPaths) ([]skills.RemovalOutcome, error) {
	ledger, err := skills.OpenLedger(skills.LedgerPath(paths.DataRoot))
	if err != nil {
		return nil, err
	}
	entries, err := ledger.All()
	if err != nil {
		return nil, fmt.Errorf("reading the install ledger: %w", err)
	}

	// Removal is always scope-checked. parseSkillsRemoveArgs resolves the
	// default (project); resolving it here too keeps the guarantee for callers
	// that build options directly. A cross-scope --all is refused per entry
	// rather than deleting silently.
	scope := opts.scope
	if scope == "" {
		scope = "project"
	}

	names, refusals := planSkillsRemove(entries, opts, scope)

	var outcomes []skills.RemovalOutcome
	if len(names) > 0 {
		removed, rerr := ledger.RemoveScoped(skills.RemoveOptions{
			Names:  names,
			Scope:  scope,
			DryRun: opts.dryRun,
			Force:  opts.force,
		})
		if rerr != nil {
			return removed, rerr
		}
		outcomes = append(outcomes, removed...)
	}
	return append(outcomes, refusals...), nil
}

// planSkillsRemove maps the selection filters onto the ledger's (name, scope)
// removal model. A name whose rows in the target scope are only partly
// selected cannot go through RemoveScoped without deleting the unselected
// rows, so it is refused by name instead.
func planSkillsRemove(entries []skills.LedgerEntry, opts skillsRemoveOptions, scope string) (names []string, refusals []skills.RemovalOutcome) {
	selected := func(e skills.LedgerEntry) bool {
		return entryMatchesSkillSelection(e, opts) &&
			entryMatchesAgentFilter(e, opts.agents) &&
			entryMatchesSourceFilter(e, opts.sources)
	}
	seen := map[string]bool{}
	for _, e := range entries {
		if !selected(e) || seen[e.SkillName] {
			continue
		}
		seen[e.SkillName] = true
		if blocked, ok := firstUnselectedRow(entries, e.SkillName, scope, selected); ok {
			refusals = append(refusals, skills.RemovalOutcome{
				Entry: blocked,
				Reason: fmt.Sprintf("selection would also delete %s (agent %q, scope %q), which no filter selected; narrow the selection or use --all",
					blocked.DestDir, entryRecordedAgent(blocked), blocked.Scope),
			})
			continue
		}
		names = append(names, e.SkillName)
	}
	return names, refusals
}

func firstUnselectedRow(entries []skills.LedgerEntry, name, scope string, selected func(skills.LedgerEntry) bool) (skills.LedgerEntry, bool) {
	for _, e := range entries {
		if e.SkillName != name || e.Scope != scope {
			continue
		}
		if !selected(e) {
			return e, true
		}
	}
	return skills.LedgerEntry{}, false
}

// entryMatchesSkillSelection reports whether an entry is selected on the skill
// axis. Positional names and --skill values are the same axis; '*' (or --all)
// selects every skill. No values at all also selects every skill, because this
// is the layer after argument validation: runSkillsRemove demands an explicit
// selection, while a caller building options directly keeps the ledger's
// "empty names = every name" contract.
func entryMatchesSkillSelection(e skills.LedgerEntry, opts skillsRemoveOptions) bool {
	if opts.all || hasWildcard(opts.skills) {
		return true
	}
	if len(opts.names) == 0 && len(opts.skills) == 0 {
		return true
	}
	for _, n := range opts.names {
		if n == e.SkillName {
			return true
		}
	}
	for _, s := range opts.skills {
		if s == e.SkillName {
			return true
		}
	}
	return false
}

// entryMatchesSourceFilter compares the canonical source label the ledger
// recorded with the canonical form of each requested source. The comparison is
// exact, not a prefix: `remove owner/repo` removes what was installed from
// github.com/owner/repo and nothing that merely shares a prefix.
func entryMatchesSourceFilter(e skills.LedgerEntry, sources []string) bool {
	if len(sources) == 0 {
		return true
	}
	return containsString(sources, e.Source)
}

func hasFlag(args []string, flag string) bool {
	for _, a := range args {
		if a == flag {
			return true
		}
	}
	return false
}

func pluralY(n int) string {
	if n == 1 {
		return "y"
	}
	return "ies"
}

func repeat(s string, n int) string {
	out := make([]byte, 0, len(s)*n)
	for i := 0; i < n; i++ {
		out = append(out, s...)
	}
	return string(out)
}
