package main

// install_plugin_skills.go — the portable half of a plugin: its skills.
//
// A plugin bundles servers, skills, and host-specific extras (commands, hooks,
// subagents, LSP servers). Servers are registered in a host config; skills are
// directories, so they are copied into each agent's own skills tree exactly as
// a standalone skill is — same ledger, same provenance, same compensation.
//
// The destination ROOTS are sealed into the approved plan (`write_skill_dir`
// host changes), so this file may only write where a human approved. The skill
// directory name comes from the SKILL.md inside the pinned tree, which is why
// the plan seals the root and the component report names the leaf.
//
// A plugin whose only portable component is a skill is installable: the old
// "no MCP server, nothing to register" refusal was a projection limit, not a
// property of the plugin. The host-specific extras are reported as skipped
// with a reason and never installed, and the result says the install was
// partial rather than describing it as the whole plugin.

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/interop"
	"github.com/sarv-projects/litespm/internal/lifecycle"
	"github.com/sarv-projects/litespm/internal/skills"
	"github.com/sarv-projects/litespm/internal/state"
)

// maxPluginSkills bounds how many skill components one plugin may install. A
// manifest is untrusted input, and an install that copies a thousand trees is
// not an install anyone approved.
const maxPluginSkills = 64

// pluginSkillComponent is one skill inside a fetched plugin tree.
type pluginSkillComponent struct {
	// Name is the declared directory name. The SKILL.md's own frontmatter
	// name wins when it has one; this is the fallback label.
	Name string
	// Dir is the absolute directory inside the temporary, digest-verified
	// tree. It exists only for the duration of the install.
	Dir string
}

// pluginSkillResult reports one skill component's installed copies.
type pluginSkillResult struct {
	SkillName    string
	Destinations []string
	Digest       string
}

// skippedComponent is one declared component class LiteSPM does not project,
// with the reason. It is reported, never silently dropped.
type skippedComponent struct {
	Kind   string
	Count  int
	Reason string
}

// skippedPluginComponents turns the manifest's declared-but-unprojected counts
// into reported components with a reason each. Ordering is stable so the
// approval prompt and the result read the same twice.
func skippedPluginComponents(counts map[string]int) []skippedComponent {
	if len(counts) == 0 {
		return nil
	}
	reasons := map[string]string{
		"commands":         "host-specific command definitions; no adapter translates them",
		"agents":           "host-specific subagent definitions; no adapter translates them",
		"hooks":            "host-specific hooks; LiteSPM never executes a plugin's hooks",
		"lspServers":       "LSP server definitions; no adapter translates them",
		"disabled servers": "the plugin's own manifest disables them",
	}
	kinds := make([]string, 0, len(counts))
	for kind := range counts {
		kinds = append(kinds, kind)
	}
	sort.Strings(kinds)
	out := make([]skippedComponent, 0, len(kinds))
	for _, kind := range kinds {
		reason := reasons[kind]
		if reason == "" {
			reason = "no adapter installs this component class"
		}
		out = append(out, skippedComponent{Kind: kind, Count: counts[kind], Reason: reason})
	}
	return out
}

// unprojectedComponentCounts is the part of the skip set an install must be
// told about: every class this build could not project, except the servers
// the plugin's own manifest disables. A disabled server is the plugin author's
// decision rather than a projection limit, so it is reported but does not
// require an acknowledgement.
func unprojectedComponentCounts(skipped []skippedComponent) map[string]int {
	out := make(map[string]int, len(skipped))
	for _, component := range skipped {
		if component.Kind == "disabled servers" || component.Count <= 0 {
			continue
		}
		out[component.Kind] = component.Count
	}
	return out
}

// resolvePluginSkills turns the manifest's declared skills into directories
// inside the verified tree.
//
// Declared paths are honoured; a manifest that declares none but ships a
// conventional `skills/<name>/SKILL.md` layout (the Claude Code plugin shape)
// is read from that layout, because for that format the directory IS the
// declaration. Every path is re-checked against the tree: a traversal, an
// absolute path, or a symlink that leaves the tree is refused.
func resolvePluginSkills(treeDir string, manifest *interop.PluginInstallManifest) ([]pluginSkillComponent, error) {
	seen := map[string]bool{}
	out := make([]pluginSkillComponent, 0, len(manifest.Skills))
	add := func(dir, declaredName string) error {
		abs, err := filepath.Abs(dir)
		if err != nil {
			return err
		}
		if seen[abs] {
			return nil
		}
		info, statErr := os.Lstat(filepath.Join(abs, "SKILL.md"))
		if statErr != nil {
			return fmt.Errorf("the plugin's skill directory %s has no SKILL.md: %w", abs, statErr)
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("the plugin's skill entry point %s is not a regular file", filepath.Join(abs, "SKILL.md"))
		}
		seen[abs] = true
		name := declaredName
		if name == "" {
			name = filepath.Base(abs)
		}
		out = append(out, pluginSkillComponent{Name: name, Dir: abs})
		return nil
	}

	if len(manifest.Skills) > 0 {
		for _, declared := range manifest.Skills {
			dir, err := resolveInsidePluginTree(treeDir, declared.Path)
			if err != nil {
				return nil, err
			}
			if err := add(dir, declared.Name); err != nil {
				return nil, err
			}
		}
	} else {
		conventional := filepath.Join(treeDir, "skills")
		entries, err := os.ReadDir(conventional)
		if err != nil {
			if os.IsNotExist(err) {
				return nil, nil
			}
			return nil, fmt.Errorf("read the plugin's skills directory: %w", err)
		}
		for _, entry := range entries {
			if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			dir, err := resolveInsidePluginTree(treeDir, filepath.ToSlash(filepath.Join("skills", entry.Name())))
			if err != nil {
				return nil, err
			}
			if _, statErr := os.Lstat(filepath.Join(dir, "SKILL.md")); statErr != nil {
				continue // a directory that is not a skill is not a component
			}
			if err := add(dir, ""); err != nil {
				return nil, err
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Dir < out[j].Dir })
	if len(out) > maxPluginSkills {
		return nil, fmt.Errorf("the plugin declares %d skills, more than the %d this build installs in one plugin; install the skills from their own sources instead", len(out), maxPluginSkills)
	}
	return out, nil
}

// resolveInsidePluginTree resolves a declared relative path against the
// verified tree and refuses anything that leaves it. The extractor already
// rejects an escaping symlink; this is the check at the point of use, because
// the manifest is the untrusted input that chooses the path.
func resolveInsidePluginTree(treeDir, rel string) (string, error) {
	clean := strings.TrimSpace(rel)
	if clean == "" {
		return "", fmt.Errorf("the plugin's manifest names an empty component path")
	}
	if filepath.IsAbs(clean) {
		return "", fmt.Errorf("the plugin's manifest points a component at %q, which is an absolute path; a plugin may only reference files inside its own tree", rel)
	}
	root, err := filepath.Abs(treeDir)
	if err != nil {
		return "", err
	}
	full, err := filepath.Abs(filepath.Join(root, filepath.FromSlash(clean)))
	if err != nil {
		return "", err
	}
	if full != root && !strings.HasPrefix(full, root+string(filepath.Separator)) {
		return "", fmt.Errorf("the plugin's manifest points a component at %q, which is outside the plugin's own tree", rel)
	}
	resolved, err := filepath.EvalSymlinks(full)
	if err != nil {
		return "", fmt.Errorf("the plugin's manifest points a component at %q, which could not be resolved: %w", rel, err)
	}
	if resolved != root && !strings.HasPrefix(resolved, root+string(filepath.Separator)) {
		return "", fmt.Errorf("the plugin's manifest points a component at %q, which resolves outside the plugin's own tree", rel)
	}
	return resolved, nil
}

// pluginSkillRootsFor is the plan-time destination list: every target host
// that is also a skills target gets one sealed root.
func pluginSkillRootsFor(hosts []string, scope domain.InstallScope, projectRoot string) []skillDestination {
	home := userHome()
	var out []skillDestination
	seen := map[string]bool{}
	for _, hostID := range hosts {
		root, ok := pluginSkillRootFor(hostID, scope, projectRoot, home)
		if !ok || seen[root] {
			continue
		}
		seen[root] = true
		out = append(out, skillDestination{AgentID: hostID, Root: root})
	}
	return out
}

// pluginSkillRootFor answers where one host's skills tree is for this scope.
func pluginSkillRootFor(hostID string, scope domain.InstallScope, projectRoot, home string) (string, bool) {
	dir, ok := skills.AgentSkillDir(hostID, skillScopeFor(scope), projectRoot, home)
	if !ok {
		return "", false
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", false
	}
	return abs, true
}

// installPluginSkillComponents copies every component into every sealed
// destination, inside the plugin install's one unit of work.
//
// Each copy runs through the skills installer, so it consults policy, records
// provenance in the same ledger a standalone skill uses, and registers the
// same compensating undo. A failure rolls the whole plugin install back — the
// config edits and the copied directories are one transaction.
func installPluginSkillComponents(
	ctx context.Context,
	txn *lifecycle.InstallTxn,
	db *state.DB,
	dataRoot string,
	listing *domain.Listing,
	binding *pluginInstallBinding,
	components []pluginSkillComponent,
	scope domain.InstallScope,
) ([]pluginSkillResult, []skills.LedgerEntry, error) {
	if len(components) == 0 || len(binding.SkillDests) == 0 {
		return nil, nil, nil
	}
	auth, authorized := installAuthorizationFrom(ctx)
	if !authorized {
		return nil, nil, domain.ErrUnauthorized("plugin.install",
			"no recorded plan and approval authorize these skill copies")
	}
	ledger, err := skills.OpenLedger(skills.LedgerPath(dataRoot))
	if err != nil {
		return nil, nil, fmt.Errorf("open skill ledger: %w", err)
	}
	checker, err := skillInstallChecker(db, dataRoot, auth)
	if err != nil {
		return nil, nil, err
	}
	installer := skills.NewInstaller(ledger, checker)

	sourceURL := strings.TrimSpace(listing.Source.URL)
	src, err := skills.ParseSkillSource(sourceURL)
	if err != nil {
		return nil, nil, domain.ErrArtifactUnavailable(listing.ID,
			fmt.Sprintf("the plugin's source %q is not a usable reference for the skills it bundles: %v", sourceURL, err))
	}
	skillScope := skillScopeFor(scope)
	backupRoot := filepath.Join(dataRoot, "backups")

	var results []pluginSkillResult
	var entries []skills.LedgerEntry
	for _, component := range components {
		found, derr := discoverSkillsIncludingRoot(component.Dir)
		if derr != nil {
			return nil, nil, fmt.Errorf("read the plugin's skill %s: %w", component.Dir, derr)
		}
		if len(found) == 0 {
			return nil, nil, domain.ErrArtifactUnavailable(listing.ID,
				fmt.Sprintf("the plugin's skill directory %s contains no SKILL.md with a name and description", component.Dir))
		}
		discovered := found[0]
		name, nerr := skills.SanitizeSkillName(discovered.Pkg.Name)
		if nerr != nil {
			return nil, nil, domain.ErrArtifactUnavailable(listing.ID,
				fmt.Sprintf("the plugin's skill %s has no usable name: %v", component.Dir, nerr))
		}
		result := pluginSkillResult{SkillName: name}
		for _, dest := range binding.SkillDests {
			entry, ierr := installer.Install(ctx, skills.InstallRequest{
				Op: skills.InstallOp{
					SkillName: name,
					FromDir:   discovered.Dir,
					ToDir:     filepath.Join(dest.Root, name),
					HostLabel: dest.AgentID,
				},
				Source:      src,
				Scope:       skillScope,
				ObservedRef: binding.Artifact.Commit,
				Force:       binding.Force,
				BackupRoot:  backupRoot,
			})
			if ierr != nil {
				return nil, nil, fmt.Errorf("copying the plugin's skill %s into %s: %w", name, dest.AgentID, ierr)
			}
			result.Destinations = append(result.Destinations, entry.DestDir)
			result.Digest = entry.ContentDigest
			entries = append(entries, entry)
			written := entry
			txn.Undo(func(ctx context.Context) error { return undoSkillInstall(ledger, written) })
		}
		results = append(results, result)
	}
	return results, entries, nil
}
