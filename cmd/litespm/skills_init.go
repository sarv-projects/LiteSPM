package main

// skills_init.go — `litespm init`: scaffold a valid SKILL.md.
//
// Authoring a skill should not require reading the format specification
// first. This command writes a SKILL.md that the real loader
// (internal/skills.ParseSkillMD) parses and that `litespm skills add`
// discovers: a name in the [a-z0-9-] form installs require, a genuine
// single-sentence description, and a body with the two sections an agent
// reads (## When to use, ## How to run). The scaffold is a working starter
// skill, not a blank form that must be filled in to be legal.
//
// `init` was previously a second spelling of the setup wizard; the wizard
// keeps `litespm setup` and the bare invocation, and `init` dispatches here.
//
// The help page is registered from this file (the same pattern as
// import.go), so the command and its documentation ship as one unit while
// help.go stays untouched.

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/sarv-projects/litespm/internal/skills"
)

const skillsInitUsage = `Usage: litespm init [name] [--dir <path>] [--force]

Scaffold a valid SKILL.md so a skill can be authored without reading the
format specification first.

  <name>       the skill's name (lowercase letters, digits and dashes). Default:
               derived from the target directory's name.
  --dir, -d    write <dir>/SKILL.md instead of the current directory's
               (the directory is created when missing).
  --force, -f  overwrite an existing SKILL.md instead of refusing.
  --help, -h   show this help text.`

// skillsInitFlags is the parsed command line for `litespm init`.
type skillsInitFlags struct {
	name     string
	dir      string
	force    bool
	showHelp bool
}

// parseSkillsInitArgs parses `litespm init` arguments strictly, in the same
// style as the other hand-rolled parsers: an unknown flag, a missing flag
// value or an extra positional argument is an error (the caller exits 2).
// `--help`/`-h` is reported separately so it can exit 0.
func parseSkillsInitArgs(args []string) (skillsInitFlags, error) {
	var fl skillsInitFlags
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
		case "--dir", "-d":
			v, err := next()
			if err != nil {
				return fl, err
			}
			if strings.TrimSpace(v) == "" {
				return fl, fmt.Errorf("flag %s requires a directory", a)
			}
			fl.dir = v
		case "--force", "-f":
			fl.force = true
		case "--help", "-h":
			fl.showHelp = true
		default:
			if strings.HasPrefix(a, "-") {
				return fl, fmt.Errorf("unknown flag %s", a)
			}
			if fl.name != "" {
				return fl, fmt.Errorf("unexpected argument %s", a)
			}
			fl.name = strings.ToLower(strings.TrimSpace(a))
		}
	}
	return fl, nil
}

// runSkillsInit is the dispatch entry point for `litespm init`.
func runSkillsInit(args []string) int {
	return runSkillsInitTo(os.Stdout, os.Stderr, args)
}

// runSkillsInitTo runs the command against explicit writers so tests can
// capture both streams and assert the exit code: 0 success, 1 refused or
// failed, 2 usage (the ARCH/20 contract printed on every help page).
func runSkillsInitTo(out, errOut io.Writer, args []string) int {
	fl, err := parseSkillsInitArgs(args)
	if err != nil {
		fmt.Fprintf(errOut, "init: %v\n\n", err)
		fmt.Fprintln(errOut, skillsInitUsage)
		return 2
	}
	if fl.showHelp {
		fmt.Fprintln(out, skillsInitUsage)
		return 0
	}

	dir := fl.dir
	if dir == "" {
		cwd, werr := os.Getwd()
		if werr != nil {
			fmt.Fprintf(errOut, "init: resolve the working directory: %v\n", werr)
			return 1
		}
		dir = cwd
	}
	dirAbs, err := filepath.Abs(dir)
	if err != nil {
		fmt.Fprintf(errOut, "init: resolve %s: %v\n", dir, err)
		return 1
	}

	// An explicit name that installs would reject is a usage error, caught
	// before anything is written; an absent name is derived from the target
	// directory and always normalizes to something valid.
	name := fl.name
	if name == "" {
		name = deriveSkillName(filepath.Base(dirAbs))
	} else if _, serr := skills.SanitizeSkillName(name); serr != nil {
		fmt.Fprintf(errOut, "init: %v\n\n", serr)
		fmt.Fprintln(errOut, skillsInitUsage)
		return 2
	}

	target := filepath.Join(dirAbs, "SKILL.md")
	if _, serr := os.Stat(target); serr == nil && !fl.force {
		fmt.Fprintf(errOut, "init: %s already exists; re-run with --force to overwrite it, or --dir <path> to scaffold elsewhere\n", target)
		return 1
	}

	if err := os.MkdirAll(dirAbs, 0o755); err != nil {
		fmt.Fprintf(errOut, "init: create %s: %v\n", dirAbs, err)
		return 1
	}
	if err := os.WriteFile(target, scaffoldSkillMD(name), 0o644); err != nil {
		fmt.Fprintf(errOut, "init: write %s: %v\n", target, err)
		return 1
	}

	fmt.Fprintf(out, "✓ Created %s (skill: %s)\n\n", target, name)
	printInitNextSteps(out, dirAbs, name)
	return 0
}

// printInitNextSteps prints what to do with the scaffold just written. The
// install lines name real flags of `litespm skills add`, and the source they
// name is the directory that CONTAINS the skill's directory, because a scan
// discovers skills one level down — DiscoverSkills deliberately skips the
// source root itself.
func printInitNextSteps(out io.Writer, dirAbs, name string) {
	source := filepath.Dir(dirAbs)
	if cwd, err := os.Getwd(); err == nil {
		if rel, rerr := filepath.Rel(cwd, source); rerr == nil && rel != "" {
			source = rel
		}
	}
	fmt.Fprintln(out, "Next steps:")
	fmt.Fprintln(out, "  1. Write a real description: replace the frontmatter `description` sentence")
	fmt.Fprintln(out, "     with what this skill does and when an agent should reach for it.")
	fmt.Fprintln(out, "  2. If the skill needs scripts, references or data, put them in an assets/")
	fmt.Fprintln(out, "     directory next to SKILL.md and reference them from the body by relative path.")
	fmt.Fprintln(out, "  3. Check it parses the way installs read it:")
	fmt.Fprintf(out, "       litespm skills add %s --list\n", source)
	fmt.Fprintln(out, "  4. Install it into your agents:")
	fmt.Fprintf(out, "       litespm skills add %s --skill %s --agent codex --global --yes\n", source, name)
	fmt.Fprintln(out)
	fmt.Fprintln(out, "`skills add` discovers skills in the directories INSIDE its source, so the")
	fmt.Fprintln(out, "source above is the directory that contains this skill's directory.")
}

// deriveSkillName turns a directory name into a skill name installs accept
// ([a-z0-9-], per internal/skills' validSkillName). Anything that normalizes
// to nothing falls back to "my-skill", so the scaffold is always valid.
func deriveSkillName(base string) string {
	var sb strings.Builder
	for _, r := range strings.ToLower(base) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-':
			sb.WriteRune(r)
		default:
			sb.WriteRune('-')
		}
	}
	name := strings.Trim(sb.String(), "-")
	if len(name) > 64 {
		name = strings.TrimRight(name[:64], "-")
	}
	if _, err := skills.SanitizeSkillName(name); err != nil {
		return "my-skill"
	}
	return name
}

// scaffoldSkillMD renders the starter SKILL.md. Everything it writes parses
// under internal/skills.ParseSkillMD and is discovered by DiscoverSkills: the
// frontmatter carries the two required fields (name, description) and the
// body is a working starter workflow with the two sections an agent reads.
func scaffoldSkillMD(name string) []byte {
	return []byte(fmt.Sprintf(`---
name: %s
description: Orient an agent in a new project by summarizing what it contains, how it is laid out, and what to look at next.
---

# %s

Fast orientation for an agent that has just been pointed at a project.
Adapt the sections below to your own workflow: the frontmatter is what gets
installed, the body is what runs.

## When to use

Use this skill when someone asks what a project is or where to start and the
agent can read the project's files. Skip it for questions about a single file
or function; ordinary reading is faster.

## How to run

1. List the top-level files and directories of the project.
2. Read the README; when there is none, read the nearest manifest at the root
   (package.json, go.mod, pyproject.toml, Cargo.toml) to identify its purpose.
3. Report three short parts: what the project does, its main components, and
   two concrete next steps for the person who asked.
`, name, name))
}

// initHelpPage is `litespm help init` (ARCH/38 §3.1 template).
var initHelpPage = commandHelp{
	Canonical: "init",
	Group:     "MANAGE",
	Purpose:   "Scaffold a valid SKILL.md so a skill can be authored without reading the format spec.",
	Synopsis: []string{
		"litespm init [name] [--dir <path>] [--force]",
	},
	Does: []string{
		"Writes <dir>/SKILL.md — the current directory when --dir is omitted — with the frontmatter this loader requires (a real name and a single-sentence description) and a body with `## When to use` and `## How to run` sections, so the result is a working starter skill, not a blank form.",
		"The name comes from the argument, else from the target directory's name, normalized to the [a-z0-9-] form installs require.",
		"`--force` overwrites an existing SKILL.md; without it, an existing file is refused untouched.",
	},
	DoesNot: []string{
		"Does not edit, validate, install, update or remove an existing skill — that is `litespm skills add` and its siblings.",
		"Does not scaffold scripts, references or assets: put supporting files in an assets/ directory next to SKILL.md yourself.",
	},
	Examples: []string{
		"litespm init",
		"litespm init my-skill",
		"litespm init my-skill --dir skills/my-skill --force",
	},
	SeeAlso: []string{"skills", "install"},
}

func init() {
	helpCatalog["init"] = initHelpPage
	for i, g := range helpGroups {
		if g.Label != "MANAGE" {
			continue
		}
		entries := make([]string, 0, len(g.Entries)+1)
		for _, name := range g.Entries {
			entries = append(entries, name)
			if name == "skills" {
				entries = append(entries, "init")
			}
		}
		if len(entries) == len(g.Entries) { // skills missing: append defensively
			entries = append(entries, "init")
		}
		helpGroups[i].Entries = entries
	}

	// `init` used to be an alias of the setup wizard, and help.go still lists
	// it as one. Now that `init` dispatches to the scaffolder, take the stale
	// alias off the setup page so `litespm help setup` no longer claims the
	// two are the same command.
	if setup, ok := helpCatalog["setup"]; ok {
		setup.Aliases = withoutString(setup.Aliases, "init")
		synopsis := make([]string, 0, len(setup.Synopsis))
		for _, line := range setup.Synopsis {
			if !strings.Contains(line, "litespm init") {
				synopsis = append(synopsis, line)
			}
		}
		setup.Synopsis = synopsis
		helpCatalog["setup"] = setup
	}
}

// withoutString returns list without any occurrence of s.
func withoutString(list []string, s string) []string {
	out := make([]string, 0, len(list))
	for _, v := range list {
		if v != s {
			out = append(out, v)
		}
	}
	return out
}
