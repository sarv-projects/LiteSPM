package main

// skills_adopt.go — `litespm skills adopt`: taking ownership of a skill that
// is ALREADY in an agent's skills tree.
//
// # Why this exists
//
// An agent's skills tree is full of skills LiteSPM did not put there: the
// ones the user installed with the agent's OWN package manager, the ones a
// plugin dropped in, the ones that were there before LiteSPM existed.
// LiteSPM could see them (every agent target directory is on disk) and could
// do nothing with them — `litespm skills list` did not show them, so
// `litespm skills remove` could not take one out and `litespm skills update`
// could not refresh one.
//
// Adopting a skill is ownership, and ownership is reversible, exactly as it
// is for an MCP server (`litespm adopt <name> --host <id>`). It records the
// skill as LiteSPM's in the skills ledger, WITHOUT moving, rewriting or
// reinstalling a single byte of the skill itself. The tree is inventoried
// as it stands, so a later removal knows which files belong to the skill and
// which ones the user added afterwards.
//
// # The rule that makes it safe
//
// A removal must never delete something LiteSPM did not create. The adopted
// row therefore records the tree's CURRENT digest and its CURRENT inventory,
// so the removal guard behaves exactly as it does for a skill LiteSPM
// installed: a file the user added after the adoption blocks the removal
// unless --force is given.
//
// # What it refuses
//
// A skill that is not in the tree is refused: adopting something that is not
// there would record ownership of a directory that does not exist, and the
// removal that follows would have nothing to restore.
//
// # What an adopted skill cannot do
//
// It cannot be UPDATED. LiteSPM does not know where an adopted skill came
// from — it may have been installed by the agent's own package manager, from
// a private repository, or by hand — so there is nothing to re-copy from.
// `litespm skills update` says so plainly instead of guessing a source. The
// agent's own package manager remains the way to refresh an adopted skill;
// that is the point of adopting rather than reinstalling.

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/skills"
)

const skillsAdoptUsageText = `Usage: litespm skills adopt <name> [--agent <id>]... [--scope user|project]

Adopts a skill that is ALREADY in an agent's skills tree, so LiteSPM manages
it from now on. The skill is NOT reinstalled, NOT rewritten, and NOT removed
from the agent's own package manager: only LiteSPM's ledger changes, so
'litespm skills list' shows it and 'litespm skills remove' can take it out.

  <name>       the skill directory name in the agent's skills tree
  --agent      the agent whose tree holds it (repeatable). Default: every
               agent whose skills tree contains a skill with that name.
  --scope      user (the agent's global skills tree) or project (the
               repository's tree). Default: project.

An adopted skill has no recorded source, so 'litespm skills update' cannot
refresh it — that stays the job of the agent's own package manager.`

// skillsAdoptOptions is the parsed command line.
type skillsAdoptOptions struct {
	name   string
	agents []string
	scope  string
	help   bool
}

// parseSkillsAdoptArgs parses `litespm skills adopt` strictly.
func parseSkillsAdoptArgs(args []string) (skillsAdoptOptions, error) {
	opts := skillsAdoptOptions{scope: "project"}
	positional := 0
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--help", "-h":
			opts.help = true
			return opts, nil
		case "--agent", "-a":
			if i+1 >= len(args) {
				return opts, fmt.Errorf("flag %s requires a value", args[i])
			}
			i++
			value := strings.ToLower(strings.TrimSpace(args[i]))
			if value == "" {
				return opts, fmt.Errorf("flag %s requires an agent id", args[i])
			}
			opts.agents = append(opts.agents, value)
		case "--scope", "-s":
			if i+1 >= len(args) {
				return opts, fmt.Errorf("flag %s requires a value", args[i])
			}
			i++
			scope := strings.ToLower(strings.TrimSpace(args[i]))
			if scope != "user" && scope != "project" {
				return opts, fmt.Errorf("invalid --scope %q: must be user or project", args[i])
			}
			opts.scope = scope
		default:
			if strings.HasPrefix(args[i], "-") {
				return opts, fmt.Errorf("unknown flag %q", args[i])
			}
			positional++
			if positional > 1 {
				return opts, fmt.Errorf("unexpected argument %q", args[i])
			}
			opts.name = strings.TrimSpace(args[i])
		}
	}
	if opts.name == "" {
		return opts, fmt.Errorf("missing <name>")
	}
	return opts, nil
}

// runSkillsAdopt is the production entry point.
func runSkillsAdopt(args []string) int {
	opts, err := parseSkillsAdoptArgs(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n\n", err)
		printSkillsAdoptUsage()
		return 2
	}
	if opts.help {
		printSkillsAdoptUsage()
		return 0
	}
	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: failed to resolve platform paths: %v\n", err)
		return 1
	}
	if err := paths.EnsureDirectories(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: failed to initialize storage directories: %v\n", err)
		return 1
	}
	return runSkillsAdoptTo(os.Stdout, os.Stderr, paths, opts)
}

// runSkillsAdoptTo runs the adoption against explicit streams, so a test can
// read what was printed.
func runSkillsAdoptTo(out, errOut io.Writer, paths *config.PlatformPaths, opts skillsAdoptOptions) int {
	home, err := os.UserHomeDir()
	if err != nil {
		home = ""
	}
	projectRoot, err := os.Getwd()
	if err != nil {
		projectRoot = ""
	}

	// The skill name is the DIRECTORY name, and it must be a safe one: it
	// becomes a path component.
	safeName, err := skills.SanitizeSkillName(opts.name)
	if err != nil {
		fmt.Fprintf(errOut, "Adopt error: %v\n", err)
		return 2
	}

	ledger, err := skills.OpenLedger(skills.LedgerPath(paths.DataRoot))
	if err != nil {
		fmt.Fprintf(errOut, "Adopt error: open the skills ledger: %v\n", err)
		return 1
	}
	existing, err := ledger.All()
	if err != nil {
		fmt.Fprintf(errOut, "Adopt error: read the skills ledger: %v\n", err)
		return 1
	}

	// The candidates: every agent whose skills tree holds a directory with
	// that name. An explicit --agent narrows the search to those agents.
	candidates, err := adoptSkillCandidates(opts, safeName, projectRoot, home)
	if err != nil {
		fmt.Fprintf(errOut, "Adopt error: %v\n", err)
		return 1
	}
	if len(candidates) == 0 {
		e := domain.NewError("LPSM-SKILL-NOT-FOUND", fmt.Sprintf(
			"no agent's skills tree holds a skill named %q, so there is nothing to adopt", safeName),
			map[string]any{"name": safeName, "scope": opts.scope})
		fmt.Fprintf(errOut, "Adopt error: %v\n", e)
		return 1
	}

	var adopted []skills.LedgerEntry
	for _, c := range candidates {
		// Already ours? Say so instead of writing a second row for the same
		// directory.
		if alreadyAdopted(existing, c.destDir) {
			fmt.Fprintf(out, "  %-16s %s is already managed by LiteSPM\n", c.agent.ID, c.destDir)
			continue
		}
		// The tree must be a real skill: a directory with a SKILL.md.
		if !hasSkillManifest(c.destDir) {
			fmt.Fprintf(errOut, "Adopt error: %s has no SKILL.md, so it is not a skill\n", c.destDir)
			return 1
		}
		// Inventory the tree AS IT STANDS. This is the pre-image: the
		// removal guard compares against it, so a file the user adds later
		// is detected and the removal is refused without --force.
		prov, perr := skills.CaptureProvenance(c.destDir)
		if perr != nil {
			fmt.Fprintf(errOut, "Adopt error: read %s: %v\n", c.destDir, perr)
			return 1
		}
		adopted = append(adopted, skills.LedgerEntry{
			SkillName:     safeName,
			AgentID:       c.agent.ID,
			HostLabel:     c.agent.DisplayName,
			DestDir:       c.destDir,
			Source:        skills.AdoptedSource,
			Scope:         opts.scope,
			InstalledAt:   time.Now().UTC(),
			ContentDigest: prov.Digest,
			Inventory:     prov.Inventory,
		})
	}

	if len(adopted) == 0 {
		fmt.Fprintln(out, "Nothing to adopt: every matching skill is already managed by LiteSPM.")
		return 0
	}
	if err := ledger.Add(adopted); err != nil {
		fmt.Fprintf(errOut, "Adopt error: record the adoption in the ledger: %v\n", err)
		return 1
	}

	for _, e := range adopted {
		fmt.Fprintf(out, "✓ Adopted %q in %s\n", e.SkillName, e.HostLabel)
		fmt.Fprintf(out, "  Path:    %s (unchanged)\n", e.DestDir)
		fmt.Fprintf(out, "  Digest:  %s\n", e.ContentDigest)
		fmt.Fprintf(out, "  Files:   %d\n", len(e.Inventory))
		fmt.Fprintf(out, "  Undo:    litespm skills remove %s\n", e.SkillName)
	}
	fmt.Fprintln(out, "\nThe skill was not reinstalled or rewritten, and it is still the agent's own.")
	fmt.Fprintln(out, "An adopted skill has no recorded source, so `litespm skills update` cannot refresh it;")
	fmt.Fprintln(out, "that stays the job of the agent's own package manager.")
	return 0
}

// adoptCandidate is one agent whose tree holds the skill.
type adoptCandidate struct {
	agent   skills.AgentTarget
	destDir string
}

// adoptSkillCandidates finds the agents whose skills tree holds the skill.
//
// With an explicit --agent, the named agents are the candidates and a name
// that resolves to no skill there is an error, not a silent skip: the user
// named a place to look.
func adoptSkillCandidates(opts skillsAdoptOptions, safeName, projectRoot, home string) ([]adoptCandidate, error) {
	targets := skills.AgentTargets()
	if len(opts.agents) > 0 {
		wanted := map[string]bool{}
		for _, a := range opts.agents {
			wanted[a] = true
		}
		filtered := make([]skills.AgentTarget, 0, len(opts.agents))
		for _, t := range targets {
			if wanted[strings.ToLower(t.ID)] {
				filtered = append(filtered, t)
			}
		}
		if len(filtered) == 0 {
			return nil, fmt.Errorf("no agent matches %s; run `litespm skills list --all` to see the known agents", strings.Join(opts.agents, ", "))
		}
		targets = filtered
	}

	// Many agents share the universal .agents/skills tree, so the same
	// directory can resolve from several of them. One DIRECTORY is one
	// adoption: the ledger keys on the destination, and recording the same
	// tree twice under two agent ids would make the removal filters
	// disagree with each other.
	var out []adoptCandidate
	seen := map[string]bool{}
	for _, t := range targets {
		dir, ok := skills.AgentSkillDir(t.ID, opts.scope, projectRoot, home)
		if !ok {
			continue
		}
		dest := filepath.Join(dir, safeName)
		if seen[dest] {
			continue
		}
		if st, err := os.Lstat(dest); err != nil || !st.IsDir() {
			continue
		}
		seen[dest] = true
		out = append(out, adoptCandidate{agent: t, destDir: dest})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].destDir < out[j].destDir })
	return out, nil
}

// alreadyAdopted reports whether the ledger already names this directory.
func alreadyAdopted(entries []skills.LedgerEntry, destDir string) bool {
	for _, e := range entries {
		if e.DestDir == destDir {
			return true
		}
	}
	return false
}

// hasSkillManifest reports whether the directory holds a SKILL.md.
func hasSkillManifest(dir string) bool {
	for _, name := range []string{"SKILL.md", "skill.md"} {
		if st, err := os.Stat(filepath.Join(dir, name)); err == nil && !st.IsDir() {
			return true
		}
	}
	return false
}

// printSkillsAdoptUsage prints the usage page.
func printSkillsAdoptUsage() {
	fmt.Println(skillsAdoptUsageText)
}
