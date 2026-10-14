package main

// skills_use.go — `litespm skills use`: print a skill's prompt, install nothing.
//
// The point of this command is the opposite of `skills add`: it resolves a
// source with exactly the same grammar, fetches and discovers with exactly the
// same engine (skills.ParseSkillSource, fetchSkillSourceTree,
// skills.DiscoverSkills / discoverSkillsIncludingRoot), writes the one
// selected skill into a temporary directory, prints the SKILL.md instruction
// body to stdout and removes the scratch directory before exiting. It never
// touches a skills ledger, an agent config or an agent skill tree; the temp
// write exists only so the bytes that are printed are the bytes of a real
// skill tree that passed CopySkillDir's symlink/size checks.
//
// stdout carries ONLY the prompt (or the --json metadata). Progress and
// errors go to stderr, because the documented use is a pipe:
//
//	litespm skills use vercel-labs/agent-skills@web-design-guidelines | claude
//
// The prompt is the file body with the YAML frontmatter stripped: frontmatter
// is discovery metadata, not instructions, and keeping it would pipe YAML
// into an agent as content. Because stdout can be a terminal as well as a
// pipe, the body is passed through the escape-stripping path in
// internal/skills (see sanitizePromptForPipe) before a single byte is
// written; a hostile repo must not be able to emit a cursor rewrite into the
// receiving program.
//
// `--agent <id>` is parsed and then honestly refused: this repository has no
// code path that starts an agent host interactively (internal/host and
// internal/agent resolve config paths and launch specs; internal/provider
// starts MCP server processes, not agent CLIs). Refusing beats shelling out to
// a guessed binary name.
//
// The help surface is registered from this file (the import.go / skills_init.go
// pattern): `litespm skills` is the dispatched command and its page lives in
// help.go, so the synopsis line for this subcommand is appended to that page.

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/sarv-projects/litespm/internal/skills"
)

var skillsUseUsageText = `Usage: litespm skills use <source> [--skill <name>] [--json]

Resolve a SKILL.md skill from a source and print its instruction body to
stdout. Nothing is installed: the selected skill is written to a temporary
directory only so it can be read back, and that directory is removed before
exit.

  <source>              owner/repo, owner/repo@skill, an https git URL, or a
                        local directory
  --skill <name>        select the skill by name (default: the @skill selector,
                        or the only skill the source holds)
  --agent <id>          not wired: refused, because no code path here starts an
                        agent host interactively (see the error text)
  --json                machine-readable metadata on stdout instead of the prompt
  --help, -h            show this help text

The printed prompt is the SKILL.md body with frontmatter stripped, sanitized
so no terminal escape or carriage return can reach the pipe. To install a
skill instead, use ` + "`litespm skills add`" + `.

Note: for this command the bare form owner/repo@X names a SKILL, not a git
ref. Pin a revision with a full URL (` + "`...@<ref>`" + ` on https://...) or the
?ref= query parameter.`

// skillsUseOptions is the parsed command line for `litespm skills use`.
type skillsUseOptions struct {
	source  string
	skill   string
	agent   string
	jsonOut bool
	help    bool
}

func skillsUseUsage(w io.Writer) {
	fmt.Fprintln(w, skillsUseUsageText)
}

// parseSkillsUseArgs parses in the same hand-rolled style as the sibling
// skills commands: an unknown flag, a missing value or an extra positional is
// an error; --help is reported so the caller can exit 0.
func parseSkillsUseArgs(args []string) (skillsUseOptions, error) {
	var opts skillsUseOptions
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
		case "--skill":
			v, err := next()
			if err != nil {
				return opts, err
			}
			v = strings.TrimSpace(v)
			if v == "" {
				return opts, fmt.Errorf("flag --skill requires a skill name")
			}
			if opts.skill != "" && !strings.EqualFold(opts.skill, v) {
				return opts, fmt.Errorf("flag --skill may be given once (one prompt is printed)")
			}
			opts.skill = v
		case "--agent", "-a":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.agent = strings.ToLower(strings.TrimSpace(v))
		case "--json":
			opts.jsonOut = true
		case "--help", "-h":
			opts.help = true
		default:
			if strings.HasPrefix(a, "-") {
				return opts, fmt.Errorf("unknown flag %s", a)
			}
			if opts.source != "" {
				return opts, fmt.Errorf("unexpected argument %s", a)
			}
			opts.source = strings.TrimSpace(a)
		}
	}
	if opts.source == "" && !opts.help {
		return opts, fmt.Errorf("missing <source>")
	}
	return opts, nil
}

// skillsUseTempDir creates the scratch directory the prompt is read from. A
// var so tests can record the path and assert the directory is gone after the
// call; production always uses the OS temp directory.
var skillsUseTempDir = func() (string, error) {
	return os.MkdirTemp("", "litespm-skill-use-*")
}

// runSkillsUse is the dispatch entry point for `litespm skills use`.
func runSkillsUse(args []string) int {
	interactive := isTerminal(os.Stdin) && isTerminal(os.Stdout)
	return runSkillsUseTo(os.Stdout, os.Stderr, os.Stdin, interactive, args)
}

// runSkillsUseTo runs the command against explicit streams. interactive
// selects the numbered picker when a source holds several skills and none was
// named; it is computed from real terminals by runSkillsUse and passed
// explicitly by tests. Defers (source cleanup, scratch cleanup) run before
// return because nothing here calls os.Exit.
func runSkillsUseTo(out, errOut io.Writer, stdin io.Reader, interactive bool, args []string) int {
	opts, err := parseSkillsUseArgs(args)
	if err != nil {
		fmt.Fprintf(errOut, "Error: %v\n\n", err)
		skillsUseUsage(errOut)
		return 2
	}
	if opts.help {
		skillsUseUsage(out)
		return 0
	}
	if opts.jsonOut {
		interactive = false
	}

	// --agent fails fast and honors the refusal contract: nothing is fetched,
	// nothing is printed to stdout, and the message says why.
	if opts.agent != "" {
		return refuseSkillsUseAgent(errOut, opts)
	}

	// `owner/repo@skill` names the skill for this command. It is split BEFORE
	// ParseSkillSource, whose own `@` grammar treats the suffix as a git ref;
	// only the bare two-segment form is split, so https URLs keep their pins.
	base, selector := splitSkillsUseSelector(opts.source)
	want := firstNonEmpty(opts.skill, selector)
	if opts.skill != "" && selector != "" && !strings.EqualFold(opts.skill, selector) {
		fmt.Fprintf(errOut, "Error: two different skills were named: %q in the source and %q in --skill\n", selector, opts.skill)
		return 2
	}

	src, err := skills.ParseSkillSource(base)
	if err != nil {
		fmt.Fprintf(errOut, "Error: %v\n", err)
		return 1
	}

	var workRoot string
	var cleanup func()
	if src.Kind == "local" {
		workRoot = src.LocalDir
		cleanup = func() {}
	} else if skills.IsDirectDownloadSource(base) {
		// Same pre-parse decision `add` makes: a bare SKILL.md or an archive
		// URL is not a git repo, and ParseSkillSource describes it as one.
		fetched, clean, fetchErr := skills.FetchSkillDownload(context.Background(), base)
		if fetchErr != nil {
			fmt.Fprintf(errOut, "Error: %v\n", fetchErr)
			return 1
		}
		workRoot, cleanup = fetched, clean
	} else {
		var fetchErr error
		workRoot, cleanup, fetchErr = fetchSkillSourceTree(src)
		if fetchErr != nil {
			fmt.Fprintf(errOut, "Error: %v\n", fetchErr)
			return 1
		}
	}
	defer cleanup()

	// Discovery mirrors `skills add` exactly: root-inclusive in BOTH branches,
	// so a source that is itself a single skill (SKILL.md at its root) and a
	// repository whose skills sit three levels down both work. `use` calling
	// plain DiscoverSkills here would have meant a source that installs fine
	// with `add` reporting "No usable skills found" with `use` — the same
	// source, two answers.
	scanRoot := workRoot
	if src.Subpath != "" {
		scanRoot = filepath.Join(workRoot, filepath.FromSlash(src.Subpath))
	}
	found, err := skills.DiscoverSkillsIncludingRoot(scanRoot)
	if err != nil {
		fmt.Fprintf(errOut, "Error: %v\n", err)
		return 1
	}
	found, hidden := skills.FilterVisibleSkills(found)
	if len(found) == 0 {
		if len(hidden) > 0 {
			fmt.Fprintf(errOut, "No usable skills found: %d skill(s) are marked internal. Set %s=1 to use them.\n",
				len(hidden), skills.InternalSkillsEnvVar)
			return 1
		}
		fmt.Fprintln(errOut, "No usable skills found (need SKILL.md with name and description).")
		return 1
	}

	chosen, code := selectSkillsUseSkill(found, want, interactive, stdin, out, errOut)
	if code != 0 {
		return code
	}

	name, err := skills.SanitizeSkillName(chosen.Pkg.Name)
	if err != nil {
		fmt.Fprintf(errOut, "Error: the skill's name %q cannot become a directory name: %v\n", chosen.Pkg.Name, err)
		return 1
	}

	tmp, err := skillsUseTempDir()
	if err != nil {
		fmt.Fprintf(errOut, "Error: create a scratch directory: %v\n", err)
		return 1
	}
	defer func() {
		if rerr := os.RemoveAll(tmp); rerr != nil {
			// The alternative would be writing the skill into an agent tree;
			// a leftover temp dir named on stderr is the honest failure.
			fmt.Fprintf(errOut, "Warning: could not remove the scratch directory %s: %v\n", tmp, rerr)
		}
	}()

	dst := filepath.Join(tmp, name)
	// CopySkillDir refuses symlinks and non-regular files and bounds the tree,
	// so printing from the copy cannot follow a link out of the temp dir.
	if err := skills.CopySkillDir(chosen.Dir, dst); err != nil {
		fmt.Fprintf(errOut, "Error: %v\n", err)
		return 1
	}
	pkg, err := skills.LoadSkillFromDirectory(dst)
	if err != nil {
		fmt.Fprintf(errOut, "Error: read the copied skill: %v\n", err)
		return 1
	}

	prompt := sanitizePromptForPipe(pkg.Instructions)
	if strings.TrimSpace(prompt) == "" {
		fmt.Fprintln(errOut, "Error: the SKILL.md has no instruction body (frontmatter only); there is nothing to print.")
		return 1
	}

	if opts.jsonOut {
		doc := skillsUseDocument{
			Schema:   "litespm-skills-use/v1",
			Source:   src.Display,
			Selector: want,
			Skill: skillsUseSkill{
				Name:          pkg.Name,
				Description:   pkg.Description,
				License:       pkg.License,
				Version:       pkg.Version,
				Author:        pkg.Author,
				Triggers:      pkg.Triggers,
				ToolsRequired: pkg.ToolsRequired,
			},
			PromptBytes: len(prompt),
		}
		encoded, encErr := json.Marshal(doc)
		if encErr != nil {
			fmt.Fprintf(errOut, "Error: encode metadata: %v\n", encErr)
			return 1
		}
		fmt.Fprintln(out, string(encoded))
		return 0
	}

	// The one and only thing this command puts on stdout.
	fmt.Fprintf(out, "%s\n", prompt)
	return 0
}

// refuseSkillsUseAgent is the honest half of the --agent feature. Returning a
// refusal rather than starting a process is deliberate: no code path in this
// repository launches an agent host, and hardcoding a binary name would be an
// invention, not a feature.
func refuseSkillsUseAgent(errOut io.Writer, opts skillsUseOptions) int {
	if _, ok := skills.LookupAgent(opts.agent); !ok {
		fmt.Fprintf(errOut, "Error: unknown agent %q\nKnown agents: %s\n", opts.agent, strings.Join(skills.AgentIDs(), " "))
		return 1
	}
	fmt.Fprintf(errOut, "Error: --agent is not wired: this build has no code path that starts an agent host interactively (LiteSPM configures hosts; it does not launch them).\n")
	fmt.Fprintf(errOut, "The prompt half works on its own — pipe it to the agent yourself:\n")
	fmt.Fprintf(errOut, "  litespm skills use %s%s | %s\n", opts.source, skillFlagHint(opts), opts.agent)
	return 1
}

// skillFlagHint renders the --skill part of the refusal's example command.
func skillFlagHint(opts skillsUseOptions) string {
	if opts.skill == "" {
		return ""
	}
	return " --skill " + opts.skill
}

// splitSkillsUseSelector separates `owner/repo@skill` into its two parts. Only
// the bare two-segment form is split: anything with a URL scheme keeps its own
// `@ref` grammar untouched, so an explicit pin on an https source still
// resolves through ParseSkillSource. An empty suffix or a base that is not
// exactly owner/repo leaves the input whole.
func splitSkillsUseSelector(raw string) (source, selector string) {
	if strings.Contains(raw, "://") {
		return raw, ""
	}
	at := strings.LastIndex(raw, "@")
	if at <= 0 || at == len(raw)-1 {
		return raw, ""
	}
	base, suffix := raw[:at], raw[at+1:]
	if parts := strings.Split(base, "/"); len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return raw, ""
	}
	return base, suffix
}

// selectSkillsUseSkill resolves the one skill to print. An explicit want (from
// @skill or --skill) must match a discovered skill by name — a selector that
// matches nothing is an error naming the value, never a silent fallback.
// Without a want, a single discovered skill is used; several skills open the
// numbered picker on a terminal, and are a refusal otherwise.
func selectSkillsUseSkill(found []skills.DiscoveredSkill, want string, interactive bool, stdin io.Reader, out, errOut io.Writer) (skills.DiscoveredSkill, int) {
	names := discoveredSkillNames(found)
	if want != "" {
		for _, f := range found {
			if discoveredSkillMatches(f.Pkg, want) {
				return f, 0
			}
		}
		fmt.Fprintf(errOut, "Error: no skill named %q was found in the source.\n", want)
		fmt.Fprintf(errOut, "Available skills: %s\n", strings.Join(names, ", "))
		return skills.DiscoveredSkill{}, 1
	}
	if len(found) == 1 {
		return found[0], 0
	}
	if !interactive {
		fmt.Fprintf(errOut, "Error: the source holds %d skills; name one with --skill <name> or owner/repo@<skill> in non-interactive mode.\n", len(found))
		fmt.Fprintf(errOut, "Available skills: %s\n", strings.Join(names, ", "))
		return skills.DiscoveredSkill{}, 1
	}

	// Same shape as the `skills add` picker: numbered rows, one answer line.
	fmt.Fprintln(out, "◇  Select a skill (one number; one prompt is printed)")
	for i, f := range found {
		fmt.Fprintf(out, "│  %d) %s — %s\n", i+1, f.Pkg.Name, truncateRunes(f.Pkg.Description, 80))
	}
	fmt.Fprint(out, "│  > ")
	line, _ := bufio.NewReader(stdin).ReadString('\n')
	picked, err := parseNumberSelection(line, len(found))
	if err != nil || len(picked) != 1 {
		fmt.Fprintf(errOut, "Error: select exactly one skill (a number between 1 and %d).\n", len(found))
		return skills.DiscoveredSkill{}, 1
	}
	return found[picked[0]], 0
}

// discoveredSkillMatches mirrors the name matching `skills add` uses for
// --skill, plus a sanitized comparison so a selector written the way installs
// spell names (lower-case, dashes) matches a skill whose frontmatter name
// differs only in case.
func discoveredSkillMatches(pkg *skills.SkillPackage, want string) bool {
	if pkg == nil {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(pkg.Name), strings.TrimSpace(want)) {
		return true
	}
	a, errA := skills.SanitizeSkillName(pkg.Name)
	b, errB := skills.SanitizeSkillName(want)
	return errA == nil && errB == nil && a == b
}

func discoveredSkillNames(found []skills.DiscoveredSkill) []string {
	names := make([]string, 0, len(found))
	for _, f := range found {
		if f.Pkg != nil {
			names = append(names, f.Pkg.Name)
		}
	}
	return names
}

// sanitizePromptForPipe makes a third-party SKILL.md body safe to write to a
// terminal or a pipe.
//
// The stripper itself lives in internal/skills/sanitize.go and is unexported
// (sanitize.go's design sanitizes at the parse boundary, but ParseSkillMD only
// sanitizes frontmatter fields — the body is not run through it). The
// exported function whose contract includes that exact stripping is
// TruncateToWidth, which strips terminal escapes (CSI/OSC/DCS/PM/APC, C0, C1,
// DEL — including a carriage return) before it measures. CopySkillDir has
// already refused anything larger than skills.MaxSkillBytes, and a cell count
// never exceeds a byte count, so a MaxSkillBytes budget cannot truncate: the
// call returns the sanitized body unchanged. TestSkillsUseSanitizesPrompt pins
// the escape and CR removal, so a change to that helper cannot silently
// reopen the hole.
func sanitizePromptForPipe(body string) string {
	return skills.TruncateToWidth(body, skills.MaxSkillBytes)
}

// skillsUseDocument is the `--json` payload (schema litespm-skills-use/v1).
// It carries resolved metadata only — never Instructions or RawContent — so a
// machine consumer cannot mistake it for the prompt.
type skillsUseDocument struct {
	Schema      string         `json:"schema"`
	Source      string         `json:"source"`
	Selector    string         `json:"selector,omitempty"`
	Skill       skillsUseSkill `json:"skill"`
	PromptBytes int            `json:"promptBytes"`
}

type skillsUseSkill struct {
	Name          string   `json:"name"`
	Description   string   `json:"description,omitempty"`
	License       string   `json:"license,omitempty"`
	Version       string   `json:"version,omitempty"`
	Author        string   `json:"author,omitempty"`
	Triggers      []string `json:"triggers,omitempty"`
	ToolsRequired []string `json:"toolsRequired,omitempty"`
}

// init registers this subcommand's synopsis on the `skills` help page. The
// top-level help catalog is keyed by dispatch literals and the completeness
// test reads only top-level cases, so a nested `skills use` case needs no new
// key; appending to the existing page is the honest equivalent.
func init() {
	page, ok := helpCatalog["skills"]
	if !ok {
		return
	}
	page.Synopsis = append(page.Synopsis,
		"litespm skills use <source> [--skill <name>] [--json]",
	)
	helpCatalog["skills"] = page
}
