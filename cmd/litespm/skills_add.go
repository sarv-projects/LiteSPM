package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/charmbracelet/huh"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/skills"
)

const litespmBanner = `
██╗     ██╗████████╗███████╗██████╗ ███████╗███╗   ███╗
██║     ██║╚══██╔══╝██╔════╝██╔══██╗██╔════╝████╗ ████║
██║     ██║   ██║   █████╗  ██████╔╝███████╗██╔████╔██║
██║     ██║   ██║   ██╔══╝  ██╔═══╝ ╚════██║██║╚██╔╝██║
███████╗██║   ██║   ███████╗██║     ███████║██║ ╚═╝ ██║
╚══════╝╚═╝   ╚═╝   ╚══════╝╚═╝     ╚══════╝╚═╝     ╚═╝`

func skillsAddUsage() {
	fmt.Println(`Usage: litespm skills add <source> [flags]

Install portable SKILL.md skills from a GitHub repository or local directory.

  <source>                  owner/repo, https or ssh git URL, local directory,
                            a direct SKILL.md URL, or a .zip/.tar/.tar.gz
                            archive URL (no file extension required)

Flags:
  --skill <name>            Select a skill (repeatable; "*" = every skill; defaults to interactive)
  --agent <host-id>         Target an agent host (repeatable; "*" = every known agent; defaults to interactive)
  --global, -g              Install user-global (default: this repo only)
  --scope <project|global>  Explicit install scope
  --list, -l                List discovered skills without installing
  --yes, -y                 Non-interactive: install all discovered skills
  --all                     Every skill to every agent, no prompts (same as --skill '*' --agent '*' --yes)
  --full-depth              Scan the whole tree, ignoring the depth bound and
                            junk-directory skips (for a repo layout that does
                            not follow the skills/<name> convention)
  --force, -f               Overwrite an existing destination (keeps a backup)
  --json                    Machine-readable summary on stdout

Skills marked metadata.internal are hidden and refused unless
INSTALL_INTERNAL_SKILLS=1 is set.

Each selected skill is copied into every selected agent's own skill
directory: repo-local for project scope, or the user-global dir for global
scope (honours CODEX_HOME, CLAUDE_CONFIG_DIR, GROK_HOME and XDG_CONFIG_HOME).
Hosts with no dedicated dir (cline, pi-agent) share the universal
.agents/skills tree. Risk data is not collected: every skill is reported
unverified until a real audit source exists.`)
}

func isTerminal(f *os.File) bool {
	fi, err := f.Stat()
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeCharDevice != 0
}

func runSkillsAddForm(out *bufio.Writer, fields ...huh.Field) error {
	if err := out.Flush(); err != nil {
		return err
	}
	err := runTerminalForm(os.Stdin, os.Stdout, fields...)
	if flushErr := out.Flush(); err == nil {
		err = flushErr
	}
	return err
}

type skillsAddOptions struct {
	source     string
	skills     []string
	agents     []string
	global     bool
	scope      string
	scopeGiven bool
	list       bool
	yes        bool
	force      bool
	fullDepth  bool
	jsonOut    bool
}

func parseSkillsAddArgs(args []string) (skillsAddOptions, error) {
	var opts skillsAddOptions
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
			opts.skills = append(opts.skills, v)
		case "--agent", "-a":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.agents = append(opts.agents, strings.ToLower(v))
		case "--global", "-g":
			opts.global = true
		case "--scope":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.scope = strings.ToLower(v)
			opts.scopeGiven = true
		case "--list", "-l":
			opts.list = true
		case "--yes", "-y":
			opts.yes = true
		case "--all":
			// The reference CLI's --all is shorthand for every skill to
			// every agent with no prompts. It is implemented as exactly the
			// wildcard pair plus --yes, so the shorthand and the wildcard
			// path cannot drift apart.
			opts.skills = append(opts.skills, "*")
			opts.agents = append(opts.agents, "*")
			opts.yes = true
		case "--force", "-f":
			opts.force = true
		case "--full-depth":
			// The reference CLI bounds its scan to a known list of skill
			// container directories and offers this flag to escape it. Our
			// scan is a whole-tree walk with a depth bound instead, so the
			// escape here drops the bound and the junk-directory skips — the
			// same situation: a repo the convention does not describe.
			opts.fullDepth = true
		case "--json":
			opts.jsonOut = true
		case "--help", "-h":
			skillsAddUsage()
			os.Exit(0)
		default:
			if strings.HasPrefix(a, "-") {
				return opts, fmt.Errorf("unknown flag %s", a)
			}
			if opts.source != "" {
				return opts, fmt.Errorf("unexpected argument %s", a)
			}
			opts.source = a
		}
	}
	if opts.source == "" {
		return opts, fmt.Errorf("missing <source>")
	}
	if opts.scope == "" {
		if opts.global {
			opts.scope = "global"
		} else {
			opts.scope = "project"
		}
	}
	if opts.scope != "project" && opts.scope != "global" {
		return opts, fmt.Errorf("invalid scope %q: want project|global", opts.scope)
	}
	return opts, nil
}

func runSkillsAdd(args []string) {
	opts, err := parseSkillsAddArgs(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n\n", err)
		skillsAddUsage()
		os.Exit(2)
	}

	interactive := isTerminal(os.Stdin) && !opts.yes && !opts.jsonOut
	interactiveTUI := interactive && isTerminal(os.Stdout)

	home, _ := os.UserHomeDir()
	project, _ := os.Getwd()

	platformPaths, err := config.ResolvePlatformPaths()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error resolving platform paths: %v\n", err)
		os.Exit(1)
	}

	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()

	if !opts.jsonOut {
		fmt.Fprint(out, renderInstallerBanner())
		out.Flush()
	}

	// A source that is not a git repo at all — a bare SKILL.md over https, or a
	// .zip/.tar/.tar.gz/.tgz, extension optional — has to be decided BEFORE
	// ParseSkillSource: that parser will happily describe any https URL as a
	// git tree, and fetchSkillSourceTree then git-clones it and fails. The
	// decision lives in internal/skills so `add` and `update` cannot disagree
	// about what counts as a download.
	isDownload := skills.IsDirectDownloadSource(opts.source)

	type fetchedSource struct {
		src     skills.SkillSource
		root    string
		cleanup func()
	}
	fetch := func() (fetchedSource, error) {
		if isDownload {
			root, clean, fetchErr := skills.FetchSkillDownload(context.Background(), opts.source)
			if fetchErr != nil {
				return fetchedSource{}, fetchErr
			}
			// There is no git tree, so there is no commit to record; the
			// display label stays the URL the user gave.
			return fetchedSource{
				src:     skills.SkillSource{Kind: "download", Display: opts.source},
				root:    root,
				cleanup: clean,
			}, nil
		}
		parsed, parseErr := skills.ParseSkillSource(opts.source)
		if parseErr != nil {
			return fetchedSource{}, parseErr
		}
		if parsed.Kind == "local" {
			return fetchedSource{src: parsed, root: parsed.LocalDir, cleanup: func() {}}, nil
		}
		root, clean, fetchErr := fetchSkillSourceTree(parsed)
		if fetchErr != nil {
			return fetchedSource{}, fetchErr
		}
		return fetchedSource{src: parsed, root: root, cleanup: clean}, nil
	}

	fetched, fetchErr := runWithSpinner(context.Background(), os.Stdin, os.Stdout, "Fetching source", fetch)
	if fetchErr != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", fetchErr)
		os.Exit(1)
	}
	src, workRoot, cleanup := fetched.src, fetched.root, fetched.cleanup
	defer cleanup()
	if !opts.jsonOut {
		installerStepDone(out, fmt.Sprintf("Source  %s", src.Display))
		if src.Kind == "local" {
			installerStepInfo(out, "Reading the local folder; nothing is copied in yet.")
		} else {
			installerStepInfo(out, "Source fetched and checked out.")
		}
	}

	// Record the exact commit the checkout resolved to when the source is a git
	// tree; an explicit pin in the source (owner/repo@ref) still wins inside
	// SkillSource.RecordedRef.
	observedRef := ""
	if src.Kind != "local" {
		observedRef = gitHeadCommit(workRoot)
	}

	scanRoot := workRoot
	if src.Subpath != "" {
		scanRoot = filepath.Join(workRoot, filepath.FromSlash(src.Subpath))
	}
	// Root-inclusive in BOTH branches. The two cases the reference installer
	// handles and we used to fail: a source directory that is itself a skill
	// (SKILL.md at its root), and a repository whose skills sit three levels
	// down (skills/<category>/<name>/SKILL.md). The scan is bounded by depth
	// and skips junk directories; --full-depth drops both for a layout the
	// convention does not describe.
	discoveryOpts := skills.DiscoveryOptions{FullDepth: opts.fullDepth}
	var found []skills.DiscoveredSkill
	found, err = skills.DiscoverSkillsIncludingRoot(scanRoot, discoveryOpts)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	// A skill marked metadata.internal is hidden from listing and refused for
	// install unless INSTALL_INTERNAL_SKILLS is set. FilterVisibleSkills hands
	// back what it hid rather than dropping it, so a user who asked for that
	// skill by name learns why it was not offered instead of seeing "not
	// found".
	found, hidden := skills.FilterVisibleSkills(found)
	if len(found) == 0 {
		if len(hidden) > 0 {
			fmt.Fprintf(os.Stderr, "No installable skills found: %d skill(s) are marked internal. Set %s=1 to install them.\n",
				len(hidden), skills.InternalSkillsEnvVar)
			os.Exit(1)
		}
		fmt.Fprintln(os.Stderr, "No installable skills found (need SKILL.md with name and description).")
		os.Exit(1)
	}

	if opts.list {
		fmt.Printf("Skills in %s (%d):\n\n", src.Display, len(found))
		for _, f := range found {
			fmt.Printf("  %-28s %s\n", f.Pkg.Name, f.Pkg.Description)
		}
		return
	}

	// --- Skill selection ---
	in := bufio.NewReader(os.Stdin)

	askLine := func() string {
		line, _ := in.ReadString('\n')
		return strings.TrimSpace(line)
	}

	if !opts.jsonOut {
		installerStepDone(out, fmt.Sprintf("Found %d skill%s", len(found), plural(len(found))))
		if len(hidden) > 0 {
			installerStepWarn(out, fmt.Sprintf("%d internal skill(s) hidden; set %s=1 to include them.", len(hidden), skills.InternalSkillsEnvVar))
		}
		installerStepInfo(out, "")
	}

	if len(opts.skills) == 0 && src.RequestedSkill != "" {
		opts.skills = []string{src.RequestedSkill}
	}
	var selected []skills.DiscoveredSkill
	if len(opts.skills) > 0 {
		var missing []string
		selected, missing = selectSkillsByName(found, opts.skills)
		if len(missing) > 0 {
			fmt.Fprintf(os.Stderr, "Error: unknown skill(s): %s\nAvailable:", strings.Join(missing, ", "))
			for _, f := range found {
				fmt.Fprintf(os.Stderr, " %s", f.Pkg.Name)
			}
			fmt.Fprintln(os.Stderr)
			os.Exit(1)
		}
	} else if len(found) == 1 || opts.yes || !interactive {
		if !interactive && len(found) > 1 && !opts.yes {
			fmt.Fprintln(os.Stderr, "Error: multiple skills found; re-run with --skill <name> (repeatable) or --yes in non-interactive mode.")
			os.Exit(1)
		}
		selected = found
	}

	// --- Scope selection (global, or this repo only) ---
	if interactive && !opts.scopeGiven && !opts.global {
		if interactiveTUI {
			out.Flush()
			picked, promptErr := runSearchPrompt(os.Stdin, os.Stdout, searchPromptOptions{
				Title:       "Installation scope",
				Description: "Choose where LiteSPM should copy the selected skills.",
				Single:      true,
				ShowDetail:  true,
				DetailLines: 2,
				Preselected: []string{"project"},
				Items: []promptItem{
					{
						ID:     "project",
						Label:  "This project",
						Hint:   "committed with this repository",
						Detail: "Writes into this repository's agent skill folders. Teammates who check out the project get the skills with it.",
					},
					{
						ID:     "global",
						Label:  "Global",
						Hint:   "available across all your projects",
						Detail: "Writes into your user-level agent skill folders. Every project on this machine can use the skill.",
					},
				},
			})
			if promptErr != nil {
				fmt.Fprintf(os.Stderr, "Error selecting installation scope: %v\n", promptErr)
				os.Exit(1)
			}
			if picked.Cancelled || len(picked.Selected) == 0 {
				fmt.Fprintln(out, "Cancelled.")
				return
			}
			opts.scope = picked.Selected[0]
		} else {
			fmt.Fprintln(out, "◇  Installation scope")
			fmt.Fprintln(out, "│  1) This repo only")
			fmt.Fprintln(out, "│  2) Global (user-wide)")
			fmt.Fprint(out, "│  > ")
			out.Flush()
			switch askLine() {
			case "2", "global":
				opts.scope = "global"
			default:
				opts.scope = "project"
			}
		}
	}
	if !opts.jsonOut {
		installerStepDone(out, fmt.Sprintf("Scope  %s", scopeLabel(opts.scope)))
	}

	// --- Agent selection ---
	targets := skills.AgentTargets()
	var agents []string
	if len(opts.agents) > 0 {
		// "*" expands to the full table from internal/skills/agents.go.
		// Expanding is NOT the destination de-duplication: agents that share
		// one skill directory still collapse in PlanInstall, so this cannot
		// produce duplicate copies of a skill.
		expanded, err := expandAgentSelection(opts.agents)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		agents = expanded
	}
	if len(agents) == 0 && !interactive {
		// No live prompt is available to fall back on, so auto-detection
		// decides the target set -- the same default the interactive picker
		// offers for an empty answer. Only when nothing at all is detectable
		// is this an error, and the message then names what could not be
		// found rather than prescribing --agent blindly.
		detected, _ := splitAgentsByDetection(targets, project, home)
		for _, a := range detected {
			agents = append(agents, a.ID)
		}
		if len(agents) == 0 {
			fmt.Fprintln(os.Stderr, "Error: no agents selected and none detected; re-run with --agent <host-id> (repeatable) in non-interactive mode.")
			os.Exit(1)
		}
	}

	if len(selected) == 0 && interactive {
		var picked []int
		if interactiveTUI {
			out.Flush()
			result, promptErr := runSearchPrompt(os.Stdin, os.Stdout, searchPromptOptions{
				Title:       fmt.Sprintf("Choose skills to install  ·  %d available", len(found)),
				Description: "Type to filter. Groups can be toggled as a whole; the detail pane previews the highlighted skill.",
				Items:       skillPromptItems(found),
				Required:    true,
				Searchable:  true,
				SelectAll:   true,
				ShowDetail:  true,
				DetailLines: 3,
				MaxVisible:  11,
			})
			if promptErr != nil {
				fmt.Fprintf(os.Stderr, "Error selecting skills: %v\n", promptErr)
				os.Exit(1)
			}
			if result.Cancelled || len(result.Selected) == 0 {
				fmt.Fprintln(out, "Cancelled.")
				return
			}
			for _, id := range result.Selected {
				index, convErr := strconv.Atoi(id)
				if convErr == nil && index >= 0 && index < len(found) {
					picked = append(picked, index)
				}
			}
		} else {
			fmt.Fprintln(out, "◇  Select skills to install (numbers, comma-separated, or 'all')")
			for i, f := range found {
				fmt.Fprintf(out, "│  %d) %s — %s\n", i+1, f.Pkg.Name, truncateRunes(f.Pkg.Description, 80))
			}
			fmt.Fprint(out, "│  > ")
			out.Flush()
			answer := askLine()
			var err error
			picked, err = parseNumberSelection(answer, len(found))
			if err != nil || len(picked) == 0 {
				fmt.Fprintln(os.Stderr, "Error: no skills selected.")
				os.Exit(1)
			}
		}
		for _, idx := range picked {
			selected = append(selected, found[idx])
		}
	} else if len(selected) == 0 {
		selected = found
	}

	if len(opts.agents) == 0 && interactive {
		// Detected agents first (installed on this machine), then the rest.
		// Popularity is NOT used to order agents: we have no measured usage
		// data, so this is presence-first then alphabetical.
		detectedTargets, otherTargets := splitAgentsByDetection(targets, project, home)
		ids := make([]string, 0, len(targets))
		detectedIDs := make([]string, 0, len(detectedTargets))
		for _, a := range detectedTargets {
			detectedIDs = append(detectedIDs, a.ID)
		}
		if interactiveTUI {
			// Universal agents share one `.agents/skills` tree, so including
			// a detected universal tree costs no extra copy and is the
			// reference installer's "always included" model. Only detected
			// universal agents are locked: an explicit non-universal choice
			// must not silently create a universal tree nobody asked for.
			var locked, detectedOther, other []promptItem
			for _, agent := range detectedTargets {
				item := agentPromptItem(agent, opts.scope, project, home, true)
				if agent.Universal {
					locked = append(locked, item)
				} else {
					item.Group = "Detected on this machine"
					detectedOther = append(detectedOther, item)
				}
			}
			for _, agent := range otherTargets {
				item := agentPromptItem(agent, opts.scope, project, home, false)
				item.Group = "Other agents"
				other = append(other, item)
			}
			items := make([]promptItem, 0, len(detectedOther)+len(other))
			items = append(items, detectedOther...)
			items = append(items, other...)
			preselected := make([]string, 0, len(detectedOther))
			for _, item := range detectedOther {
				preselected = append(preselected, item.ID)
			}
			out.Flush()
			result, promptErr := runSearchPrompt(os.Stdin, os.Stdout, searchPromptOptions{
				Title:       fmt.Sprintf("Choose agents  ·  %d detected of %d supported", len(detectedTargets), len(targets)),
				Description: "Detected agents are preselected. Shared `.agents/skills` destinations are always included; each write is backed up separately.",
				Items:       items,
				Locked:      locked,
				Preselected: preselected,
				Required:    true,
				Searchable:  true,
				SelectAll:   true,
				ShowDetail:  true,
				DetailLines: 2,
				MaxVisible:  11,
			})
			if promptErr != nil {
				fmt.Fprintf(os.Stderr, "Error selecting agents: %v\n", promptErr)
				os.Exit(1)
			}
			if result.Cancelled || len(result.Selected) == 0 {
				fmt.Fprintln(out, "Cancelled.")
				return
			}
			agents = result.Selected
		} else {
			fmt.Fprintf(out, "◇  %d agents (%d detected)\n", len(targets), len(detectedTargets))
			fmt.Fprintln(out, "◇  Which agents do you want to install to?")
			i := 1
			for _, group := range []struct {
				label string
				list  []skills.AgentTarget
			}{{"Detected", detectedTargets}, {"All agents", otherTargets}} {
				if len(group.list) == 0 {
					continue
				}
				if group.label == "All agents" {
					fmt.Fprintln(out, "│")
				}
				fmt.Fprintf(out, "◇  %s\n", group.label)
				for _, agent := range group.list {
					dir, ok := skills.AgentSkillDir(agent.ID, opts.scope, project, home)
					pathText := "no global location"
					if ok {
						pathText = shortHome(dir, home)
					} else if opts.scope != "global" {
						pathText = "—"
					}
					mark := " "
					if agent.Universal {
						mark = "◦"
					}
					fmt.Fprintf(out, "│  %d) [%s] %-22s %s\n", i, mark, agent.DisplayName, pathText)
					ids = append(ids, agent.ID)
					i++
				}
			}
			fmt.Fprintln(out, "│  [ ] needs its own dir   [◦] shares .agents/skills")
			fmt.Fprint(out, "│  numbers, comma-separated, or empty for detected > ")
			out.Flush()
			answer := strings.TrimSpace(askLine())
			if answer == "" {
				agents = detectedIDs
			} else {
				picked, err := parseNumberSelection(answer, len(ids))
				if err != nil {
					fmt.Fprintln(os.Stderr, "Error: invalid agent selection.")
					os.Exit(1)
				}
				for _, idx := range picked {
					agents = append(agents, ids[idx])
				}
			}
			if len(agents) == 0 {
				fmt.Fprintln(os.Stderr, "Error: no agents selected and none detected.")
				os.Exit(1)
			}
		}
	}

	ops := skills.PlanInstall(selected, agents, opts.scope, project, home)
	if len(ops) == 0 {
		fmt.Fprintln(os.Stderr, "Error: nothing to install.")
		os.Exit(1)
	}

	if !interactive && !opts.yes {
		fmt.Fprintln(os.Stderr, "Error: refusing to install non-interactively without --yes.")
		os.Exit(1)
	}

	// Refuse an overwrite before the summary instead of failing halfway
	// through the copy loop. The installer can replace a destination with a
	// byte-exact backup, but only when the person asked for it.
	overwrites := existingDestinations(ops)
	if overwrites > 0 && !opts.force {
		if !interactive {
			fmt.Fprintf(os.Stderr, "Error: %d destination(s) already contain these skills. Re-run with --force to replace them (a backup is kept).\n", overwrites)
			os.Exit(1)
		}
		replace := false
		if interactiveTUI {
			out.Flush()
			field := huh.NewConfirm().
				Title(fmt.Sprintf("%d destination(s) already exist", overwrites)).
				Description("Replace them with the newly discovered copies? Each existing directory is backed up byte-for-byte first.").
				Affirmative("Replace with backup").
				Negative("Cancel").
				Value(&replace)
			if err := runSkillsAddForm(out, field); err != nil {
				if errors.Is(err, huh.ErrUserAborted) {
					fmt.Fprintln(out, "Cancelled.")
					return
				}
				fmt.Fprintf(os.Stderr, "Error confirming overwrite: %v\n", err)
				os.Exit(1)
			}
		} else {
			fmt.Fprintf(out, "◇  %d destination(s) already exist. Replace them with a backup? [y/N] > ", overwrites)
			out.Flush()
			answer := strings.ToLower(askLine())
			replace = answer == "y" || answer == "yes"
		}
		if !replace {
			fmt.Fprintln(out, "Cancelled. Nothing was changed.")
			return
		}
		opts.force = true
	}

	proceed := opts.yes
	if !opts.jsonOut {
		printInstallSummary(out, src, selected, ops)
		printRiskPanel(out, src, selected)
		if interactive {
			if interactiveTUI {
				out.Flush()
				field := huh.NewConfirm().
					Title("Proceed with installation?").
					Description(fmt.Sprintf("%d skill%s → %d destination%s · %s", len(selected), plural(len(selected)), len(ops), plural(len(ops)), scopeLabel(opts.scope))).
					Affirmative("Install").
					Negative("Cancel").
					Value(&proceed)
				if err := runSkillsAddForm(out, field); err != nil {
					if errors.Is(err, huh.ErrUserAborted) {
						fmt.Fprintln(out, "Cancelled.")
						return
					}
					fmt.Fprintf(os.Stderr, "Error confirming installation: %v\n", err)
					os.Exit(1)
				}
			} else {
				fmt.Fprint(out, "◇  Proceed with installation? [y/N] > ")
				out.Flush()
				answer := strings.ToLower(askLine())
				proceed = answer == "y" || answer == "yes"
			}
		} else {
			proceed = true
		}
		if !proceed {
			fmt.Fprintln(out, "Cancelled. Nothing was changed.")
			return
		}
	}

	// --- Install ---
	//
	// Every directory we create is recorded in the ledger, with a content digest
	// and a file inventory so update/remove can reason about it later. Without
	// the ledger the tool could write into a dozen agent trees and have no way
	// to enumerate them again, which would make removal impossible.
	ledger, ledgerErr := skills.OpenLedger(skills.LedgerPath(platformPaths.DataRoot))
	if ledgerErr != nil {
		fmt.Fprintf(os.Stderr, "Error opening the install ledger: %v\n", ledgerErr)
		os.Exit(1)
	}

	// The policy engine gates every write and runs with its real tiers: the
	// state database (capability grants) and the user's deny rules. The engine
	// always asks for an effectful install; that ask was already answered by
	// this command's consent (the interactive proceed prompt, or --yes), so the
	// resolver records that here rather than inventing an approval. A "deny"
	// still stops the write.
	policyEngine, closePolicy, policyErr := openCLIPolicyEngine(platformPaths.DataRoot)
	if policyErr != nil {
		fmt.Fprintf(os.Stderr, "Error loading the policy engine: %v\n", policyErr)
		os.Exit(1)
	}
	defer closePolicy()
	checker := enginePolicyChecker(policyEngine, func(context.Context, skills.PolicyRequest, string) bool {
		return true
	})
	installer := skills.NewInstaller(ledger, checker)

	if !opts.jsonOut {
		installerStepInfo(out, "Policy: these writes were authorized by your install consent; deny rules still apply.")
		out.Flush()
	}
	var replaced []string
	done, installErr := runWithSpinner(context.Background(), os.Stdin, os.Stdout,
		fmt.Sprintf("Installing %d skill%s into %d destination%s", len(selected), plural(len(selected)), len(ops), plural(len(ops))),
		func() ([]installedSkill, error) {
			var installed []installedSkill
			for _, op := range ops {
				if _, err := installer.Install(context.Background(), skills.InstallRequest{
					Op:          op,
					Source:      src,
					Scope:       opts.scope,
					ObservedRef: observedRef,
					Force:       opts.force,
					BackupRoot:  platformPaths.BackupsPath(),
					OnOverwrite: func(dst string) { replaced = append(replaced, dst) },
				}); err != nil {
					var denied *skills.PolicyDeniedError
					if errors.As(err, &denied) {
						return installed, err
					}
					return installed, fmt.Errorf("installing %s to %s: %w", op.SkillName, op.ToDir, err)
				}
				installed = append(installed, installedSkill{Skill: op.SkillName, To: op.ToDir, Host: op.HostLabel})
			}
			return installed, nil
		})
	if installErr != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", installErr)
		os.Exit(1)
	}
	if !opts.jsonOut {
		installerStepDone(out, fmt.Sprintf("Installed %d skill%s into %d destination%s", len(selected), plural(len(selected)), len(done), plural(len(done))))
		if len(replaced) > 0 {
			installerStepInfo(out, fmt.Sprintf("%d existing destination%s replaced · backups: %s",
				len(replaced), plural(len(replaced)), shortHome(platformPaths.BackupsPath(), home)))
		}
	}

	if opts.jsonOut {
		payload, _ := json.Marshal(map[string]any{
			"source":    src.Display,
			"scope":     opts.scope,
			"installed": done,
		})
		fmt.Println(string(payload))
		return
	}

	printCompletion(out, src, selected, done, home)
}

// skillPromptItems shapes discovered skills for the searchable picker. The
// group is the first path segment (the reference installer's plugin grouping),
// so a repository with skills/<category>/<name>/SKILL.md can be folded and
// toggled by category.
func skillPromptItems(found []skills.DiscoveredSkill) []promptItem {
	items := make([]promptItem, 0, len(found))
	for i, skill := range found {
		rel := filepath.ToSlash(skill.Rel)
		group := "General"
		if parts := strings.Split(rel, "/"); len(parts) > 1 && parts[0] != "" && parts[0] != "." {
			group = titleCase(parts[0])
		}
		detail := strings.TrimSpace(skill.Pkg.Description)
		if detail == "" {
			detail = "No description was published for this skill."
		}
		detail += "\nPath: " + rel
		if skill.Pkg.Version != "" {
			detail += "  ·  v" + skill.Pkg.Version
		}
		if len(skill.Pkg.Triggers) > 0 {
			detail += "\nTriggers: " + strings.Join(skill.Pkg.Triggers, ", ")
		}
		if len(skill.Pkg.ToolsRequired) > 0 {
			detail += "\nTools: " + strings.Join(skill.Pkg.ToolsRequired, ", ")
		}
		hint := ""
		if skill.Pkg.Version != "" {
			hint = "v" + skill.Pkg.Version
		}
		items = append(items, promptItem{
			ID:     strconv.Itoa(i),
			Label:  skill.Pkg.Name,
			Hint:   hint,
			Detail: detail,
			Group:  group,
		})
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Group != items[j].Group {
			return items[i].Group < items[j].Group
		}
		return strings.ToLower(items[i].Label) < strings.ToLower(items[j].Label)
	})
	return items
}

// agentPromptItem describes one agent destination. The detail names the exact
// directory for the selected scope; no path is guessed when the agent has no
// documented location.
func agentPromptItem(agent skills.AgentTarget, scope, project, home string, detected bool) promptItem {
	detail := agent.DisplayName + " reads skills from "
	if dir, ok := skills.AgentSkillDir(agent.ID, scope, project, home); ok {
		detail += shortHome(dir, home) + "."
	} else {
		detail += "no documented location for this scope, so selecting it has no effect."
	}
	if agent.Universal {
		detail += "\nShared tree: this agent reads the same `.agents/skills` folder as other universal agents, so it is copied once."
	}
	if detected {
		detail += "\nDetected on this machine."
	}
	hint := "shared .agents/skills"
	if !agent.Universal {
		hint = ""
		if dir, ok := skills.AgentSkillDir(agent.ID, scope, project, home); ok {
			hint = shortHome(dir, home)
		}
	}
	return promptItem{ID: agent.ID, Label: agent.DisplayName, Hint: hint, Detail: detail}
}

func titleCase(s string) string {
	parts := strings.FieldsFunc(s, func(r rune) bool { return r == '-' || r == '_' || r == ' ' })
	for i, part := range parts {
		if part == "" {
			continue
		}
		r := []rune(strings.ToLower(part))
		r[0] = []rune(strings.ToUpper(string(r[0])))[0]
		parts[i] = string(r)
	}
	if len(parts) == 0 {
		return s
	}
	return strings.Join(parts, " ")
}

// existingDestinations counts planned writes whose final skill directory is
// already on disk. The caller asks before replacing anything.
func existingDestinations(ops []skills.InstallOp) int {
	n := 0
	for _, op := range ops {
		if _, err := os.Lstat(op.ToDir); err == nil {
			n++
		}
	}
	return n
}

// selectSkillsByName resolves --skill values against the discovered skills.
// "*" selects every discovered skill; every other value matches a skill name
// case-insensitively. Values that genuinely match nothing -- including "*"
// against an empty discovery -- are returned in missing, so the caller refuses
// honestly instead of reporting an empty selection as success.
func selectSkillsByName(found []skills.DiscoveredSkill, requested []string) (selected []skills.DiscoveredSkill, missing []string) {
	if len(requested) == 0 {
		return nil, nil
	}
	wildcard := false
	want := map[string]bool{}
	for _, v := range requested {
		if v == "*" {
			wildcard = true
			continue
		}
		want[strings.ToLower(v)] = true
	}
	for _, f := range found {
		name := strings.ToLower(f.Pkg.Name)
		if wildcard || want[name] {
			selected = append(selected, f)
			delete(want, name)
		}
	}
	for m := range want {
		missing = append(missing, m)
	}
	if wildcard && len(found) == 0 {
		missing = append(missing, "*")
	}
	sort.Strings(missing)
	return selected, missing
}

// expandAgentSelection resolves --agent values into known agent ids. "*"
// expands to the full skills.AgentTargets table; any other value must be a
// known id or the error names the value and the known list, exactly as the
// pre-wildcard lookup did. The result is de-duplicated by id, but destination
// de-duplication (agents sharing one skill directory) is NOT done here: that
// stays in PlanInstall, which is the single place destinations are collapsed.
func expandAgentSelection(requested []string) ([]string, error) {
	if len(requested) == 0 {
		return nil, nil
	}
	known := map[string]bool{}
	for _, id := range skills.AgentIDs() {
		known[id] = true
	}
	var out []string
	seen := map[string]bool{}
	add := func(id string) {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	for _, ag := range requested {
		if ag == "*" {
			for _, id := range skills.AgentIDs() {
				add(id)
			}
			continue
		}
		if !known[ag] {
			return nil, fmt.Errorf("unknown agent %q\nKnown agents: %s", ag, strings.Join(skills.AgentIDs(), " "))
		}
		add(ag)
	}
	return out, nil
}

// splitAgentsByDetection partitions the agent table into the targets detected
// as installed on this machine and the rest, preserving table order. It is
// presence-first only: no usage or popularity data exists, so nothing here is
// a ranking. The interactive picker and the non-interactive agent fallback
// share it so both decide "detected" the same way.
func splitAgentsByDetection(targets []skills.AgentTarget, project, home string) (detected, other []skills.AgentTarget) {
	for _, a := range targets {
		if skills.AgentInstalled(a, project, home) {
			detected = append(detected, a)
		} else {
			other = append(other, a)
		}
	}
	return detected, other
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

// parseNumberSelection parses "1,3" or "all" into zero-based indexes.
func parseNumberSelection(answer string, total int) ([]int, error) {
	a := strings.ToLower(strings.TrimSpace(answer))
	if a == "all" || a == "*" {
		idx := make([]int, total)
		for i := range idx {
			idx[i] = i
		}
		return idx, nil
	}
	var out []int
	seen := map[int]bool{}
	for _, part := range strings.Split(a, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		n, err := strconv.Atoi(part)
		if err != nil || n < 1 || n > total {
			return nil, fmt.Errorf("invalid selection %q", part)
		}
		if !seen[n-1] {
			seen[n-1] = true
			out = append(out, n-1)
		}
	}
	return out, nil
}

// shortHome renders a path with the home directory collapsed to "~".
func shortHome(path, home string) string {
	if home != "" {
		if path == home {
			return "~"
		}
		// Accept either separator. This is a display helper, and on Windows a
		// path can arrive with forward slashes from a config file or from user
		// input; matching only filepath.Separator left those unreplaced and
		// printed the full home path.
		for _, sep := range []string{"/", string(filepath.Separator)} {
			if strings.HasPrefix(path, home+sep) {
				return "~" + path[len(home):]
			}
		}
	}
	return path
}

func scopeLabel(scope string) string {
	if scope == "global" {
		return "Global (user-wide)"
	}
	return "This repo only"
}

func printInstallSummary(out *bufio.Writer, src skills.SkillSource, selected []skills.DiscoveredSkill, ops []skills.InstallOp) {
	title := src.RepoPath
	if title == "" {
		title = src.Display
	}
	lines := []string{
		uiDim.Render("source") + "  " + truncateRunes(title, 58),
		uiDim.Render("skills") + "  " + fmt.Sprintf("%d selected", len(selected)),
		uiDim.Render("writes") + "  " + fmt.Sprintf("%d destination%s", len(ops), plural(len(ops))),
		"",
	}

	// One block per skill, with every destination it will be copied into.
	type target struct{ dir, host string }
	order := []string{}
	bySkill := map[string][]target{}
	for _, op := range ops {
		if _, ok := bySkill[op.SkillName]; !ok {
			order = append(order, op.SkillName)
		}
		bySkill[op.SkillName] = append(bySkill[op.SkillName], target{dir: op.ToDir, host: op.HostLabel})
	}
	for _, name := range order {
		lines = append(lines, uiGreenS.Render("✓")+" "+uiBold.Render(name))
		for _, t := range bySkill[name] {
			marker := ""
			if _, err := os.Lstat(t.dir); err == nil {
				marker = uiYellowS.Render("  (exists · backup first)")
			}
			lines = append(lines, "  "+uiDim.Render("→")+" "+shortHome(t.dir, homeDirForDisplay())+marker)
		}
	}
	if len(order) == 0 {
		lines = append(lines, uiDim.Render("Nothing selected."))
	}
	fmt.Fprintln(out, renderInstallSummaryBox("Installation Summary", lines))
	fmt.Fprintln(out, "")
}

func printRiskPanel(out *bufio.Writer, src skills.SkillSource, selected []skills.DiscoveredSkill) {
	lines := []string{
		uiDim.Render("skill") + strings.Repeat(" ", 20) + uiDim.Render("verdict"),
	}
	for _, f := range selected {
		name, _ := skills.SanitizeSkillName(f.Pkg.Name)
		lines = append(lines, fmt.Sprintf("%-25s %s", truncateRunes(name, 25), uiYellowS.Render("unverified")))
	}
	lines = append(lines, "")
	if src.RepoPath != "" {
		lines = append(lines, uiDim.Render("Details: ")+"https://skills.sh/"+src.RepoPath)
	} else {
		lines = append(lines, uiDim.Render("Audit lookup supports public GitHub repos only."))
	}
	lines = append(lines, uiDim.Render("No audit data was collected. Review skills before use."))
	fmt.Fprintln(out, renderInstallSummaryBox("Security Risk Assessment", lines))
	fmt.Fprintln(out, "")
}

func homeDirForDisplay() string {
	home, _ := os.UserHomeDir()
	return home
}

type installedSkill struct {
	Skill string `json:"skill"`
	To    string `json:"to"`
	Host  string `json:"host"`
}

func printCompletion(out *bufio.Writer, src skills.SkillSource, selected []skills.DiscoveredSkill, done []installedSkill, home string) {
	title := src.RepoPath
	if title == "" {
		title = src.Display
	}
	bySkill := map[string][]string{}
	order := []string{}
	for _, d := range done {
		if _, ok := bySkill[d.Skill]; !ok {
			order = append(order, d.Skill)
		}
		bySkill[d.Skill] = append(bySkill[d.Skill], d.To)
	}
	var lines []string
	for _, name := range order {
		lines = append(lines, uiGreenS.Render("✓")+" "+uiBold.Render(name))
		seen := map[string]bool{}
		shown := 0
		for _, path := range bySkill[name] {
			short := shortHome(path, home)
			if seen[short] {
				continue
			}
			seen[short] = true
			if shown >= 3 {
				continue
			}
			lines = append(lines, "  "+uiDim.Render("→")+" "+short)
			shown++
		}
		if extra := len(seen) - shown; extra > 0 {
			lines = append(lines, "  "+uiDim.Render(fmt.Sprintf("→ +%d more destination%s", extra, plural(extra))))
		}
	}
	if len(lines) == 0 {
		lines = append(lines, uiDim.Render("No files were written."))
	}
	headline := fmt.Sprintf("Installed %d skill%s into %d destination%s", len(order), plural(len(order)), len(done), plural(len(done)))
	footer := "Done. Review skills before use; they run with full agent permissions.\nNext: litespm skills list · litespm skills update"
	fmt.Fprintln(out, renderCompletionBox(headline, lines, footer))
	fmt.Fprintln(out, "")
}
