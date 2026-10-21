package main

// install_skill_targets.go — where a catalog skill install may write, decided
// before the approval and sealed into the plan.
//
// A skill is a directory copied into each agent's own skills tree. Until this
// file existed the catalog install path asked the machine at execution time
// ("which agents are detected?") and copied into all of them, so an explicit
// target was either ignored (`install <skill> --host codex` wrote every agent)
// or refused outright. Both are the same defect from different sides: the
// approval did not name the destinations.
//
// The fix is the one the rest of the installer already uses for MCP servers and
// plugins: resolve the target set while planning, seal every destination in the
// plan's host changes, and let execution write only what the plan sealed.
// Because `domain.ComputePlanHash` covers host changes, a destination cannot be
// added or moved after the human approved the plan.

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/skills"
)

// skillWriteAction is the host-change action for one agent's skills tree. The
// MCP path uses `register_command`; a skill writes files, so it gets its own
// action rather than overloading the config-entry one.
const skillWriteAction = "write_skill_dir"

// skillInstallBinding is a caller's target intent, not a resolved set. The
// planner resolves it against this machine and seals the result, so an empty
// request means "the agents detected now" and an explicit request means exactly
// those agents — never a superset.
type skillInstallBinding struct {
	// Requested names skill target ids (see internal/skills.AgentTargets) or
	// "*" for the whole table.
	Requested []string
	// AllDetected is the explicit spelling of the detected default: the same
	// resolved set, stated rather than inferred. The CLI refuses a request that
	// names neither when several agents are detected (there the command is the
	// approval, so a fan-out has to be asked for). The wizard sets it, and the
	// daemon path passes no binding at all, because both show the sealed plan to
	// a human before it runs.
	AllDetected bool
}

// skillDestination is one sealed write root: the directory a skill directory
// will be created inside, not the skill directory itself. The leaf name comes
// from the source's own SKILL.md at fetch time, which is inside the artifact
// and therefore not knowable while planning; sealing the root still bounds
// every write to a directory the plan named.
type skillDestination struct {
	AgentID string
	Root    string
}

// planSkillDestinations resolves the target intent into concrete roots.
//
//   - requested non-empty: exactly those agents, in the order given, deduped
//     by destination (agents can share one skills tree, e.g. the universal
//     `.agents/skills`). An unknown id or an agent with no skills directory
//     for this scope is an error, never a silent drop.
//   - requested empty: every agent detected on this machine, deduped the same
//     way. No detected agent is a refusal with the remedy, not an empty
//     success.
func planSkillDestinations(listing *domain.Listing, scope domain.InstallScope, projectRoot, home string, requested []string) ([]skillDestination, error) {
	if listing == nil || listing.Kind != domain.KindSkill {
		return nil, fmt.Errorf("skill destinations are only defined for a skill listing")
	}
	skillScope := skillScopeFor(scope)

	ids, err := expandAgentSelection(requested)
	if err != nil {
		return nil, err
	}
	explicit := len(ids) > 0
	if !explicit {
		ids = detectedSkillAgentIDs(projectRoot, home)
		if len(ids) == 0 {
			return nil, fmt.Errorf("no agent skills directory was detected on this machine, so there is nowhere to install %s. Name a target explicitly with --agent <id> (repeatable), or set up the agent first", listing.ID)
		}
	}

	var out []skillDestination
	seen := map[string]bool{}
	for _, id := range ids {
		root, ok := skills.AgentSkillDir(id, skillScope, projectRoot, home)
		if !ok {
			if explicit {
				return nil, fmt.Errorf("agent %q has no skills directory for %s scope, so %s cannot be installed there. Use --scope project for a project-scoped tree, or choose another agent", id, scope, listing.ID)
			}
			// A detected agent with no directory for this scope simply has no
			// destination here; the plan lists the agents that do.
			continue
		}
		abs, aerr := filepath.Abs(root)
		if aerr != nil {
			return nil, fmt.Errorf("resolve the skills directory for %q: %w", id, aerr)
		}
		if seen[abs] {
			continue
		}
		seen[abs] = true
		out = append(out, skillDestination{AgentID: id, Root: abs})
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("none of the selected agents has a skills directory for %s scope, so nothing can be written. Use --scope project or choose an agent with a documented skills path", scope)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Root < out[j].Root })
	return out, nil
}

// detectedSkillAgentIDs lists the skill targets installed on this machine,
// in the registry's own (display-name) order. It is the default target set and
// the set `--all-detected` names, so both go through one function.
func detectedSkillAgentIDs(projectRoot, home string) []string {
	var ids []string
	for _, target := range skills.AgentTargets() {
		if skills.AgentInstalled(target, projectRoot, home) {
			ids = append(ids, target.ID)
		}
	}
	return ids
}

// skillScopeFor maps the install scope onto the skills package's vocabulary.
func skillScopeFor(scope domain.InstallScope) string {
	if scope == domain.ScopeUser {
		return "global"
	}
	return "project"
}

// skillHostChanges renders the sealed destinations as plan host changes. The
// entry key is the planned directory name; the path is the agent's skills
// root. Both are hashed into the plan, so the approval covers them.
func skillHostChanges(listing *domain.Listing, dests []skillDestination) []domain.HostChange {
	if listing == nil || len(dests) == 0 {
		return nil
	}
	entryKey := ""
	if name, err := skills.SanitizeSkillName(listing.Name); err == nil {
		entryKey = name
	}
	changes := make([]domain.HostChange, 0, len(dests))
	for _, dest := range dests {
		changes = append(changes, domain.HostChange{
			HostID:     dest.AgentID,
			ConfigPath: dest.Root,
			Action:     skillWriteAction,
			EntryKey:   entryKey,
		})
	}
	return changes
}

// skillDestinationsFromPlan reads the destinations an approved plan sealed.
// A plan with no skill write is refused: execution must never fall back to
// "detect the agents again", because that is the fan-out the seal prevents.
func skillDestinationsFromPlan(plan *domain.InstallPlan) ([]skillDestination, error) {
	if plan == nil {
		return nil, fmt.Errorf("no plan: a skill install needs a recorded plan that seals its destinations")
	}
	var out []skillDestination
	for _, ch := range plan.HostChanges {
		if ch.Action != skillWriteAction {
			continue
		}
		if strings.TrimSpace(ch.HostID) == "" || strings.TrimSpace(ch.ConfigPath) == "" {
			return nil, fmt.Errorf("plan %s carries an incomplete skill write (agent %q, path %q); re-plan the install", plan.PlanID, ch.HostID, ch.ConfigPath)
		}
		out = append(out, skillDestination{AgentID: ch.HostID, Root: ch.ConfigPath})
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("plan %s seals no skill destinations, so there is nothing that could be written. Re-run the install so a plan is approved for the agent you want", plan.PlanID)
	}
	return out, nil
}

// skillAgentsFromPlan is the execution-side view: the agent ids whose trees the
// approved plan may write. installSkillFromListing copies into exactly these.
func skillAgentsFromPlan(plan *domain.InstallPlan) ([]string, error) {
	dests, err := skillDestinationsFromPlan(plan)
	if err != nil {
		return nil, err
	}
	agents := make([]string, 0, len(dests))
	for _, d := range dests {
		agents = append(agents, d.AgentID)
	}
	return agents, nil
}

// verifySkillWriteRoots checks the directories a skill install is about to
// write against the roots the plan sealed, in both directions: no write outside
// the approved set, and no approved destination silently skipped. A moved
// CODEX_HOME (or a changed project root) between plan and execute must fail
// closed rather than redirect the copy.
func verifySkillWriteRoots(dests []skillDestination, ops []skills.InstallOp) error {
	sealed := make(map[string]bool, len(dests))
	for _, d := range dests {
		sealed[d.Root] = true
	}
	wrote := make(map[string]bool, len(ops))
	for _, op := range ops {
		root := filepath.Dir(op.ToDir)
		if !sealed[root] {
			return fmt.Errorf("the plan approved no write to %s, so nothing was copied there: re-plan the install (LPSM-PLAN-STALE)", op.ToDir)
		}
		wrote[root] = true
	}
	for _, d := range dests {
		if !wrote[d.Root] {
			return fmt.Errorf("the plan approved a write into %s but the install planned nothing there (agent %q): re-plan the install (LPSM-PLAN-STALE)", d.Root, d.AgentID)
		}
	}
	return nil
}

// userHome returns the home directory used for agent detection, or "" when it
// cannot be resolved. AgentSkillDir treats "" as "no home", which yields no
// global destination rather than a path under the process's working directory.
func userHome() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return home
}
