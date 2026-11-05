package main

// bridge_skills.go — the read path behind the bridge's skill tools.
//
// The bridge tools originally walked only install_records and treated
// TreeDigest as a materialized CAS tree. Two real install paths broke that
// assumption:
//
//   - `litespm skills add` writes the skills ledger and creates no install
//     record at all;
//   - `litespm install <catalog-skill>` stores the ledger's content digest in
//     tree_digest, but the ledger tree is a destination directory, not a CAS
//     tree.
//
// The result was a split inventory: `litespm list` saw ledger skills, while
// load_skill/read_skill_resource/list_installed did not. This file is the one
// resolver both paths use: install records first (CAS, then recorded
// install_path, then deployment-ledger skill-dir mutations), then ledger rows
// whose destination actually contains a readable SKILL.md.

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/sarv-projects/litespm/internal/deployment"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/install"
	"github.com/sarv-projects/litespm/internal/skills"
	"github.com/sarv-projects/litespm/internal/state"
)

const maxSkillResourceBytes = 8 << 20

var (
	errSkillPathTraversal = errors.New("path traversal denied")
	errSkillResourceLarge = fmt.Errorf("skill resource exceeds the %d MiB limit", maxSkillResourceBytes>>20)
)

type bridgeSkillSource struct {
	ID          string
	Name        string
	Dir         string
	AgentID     string
	Scope       domain.InstallScope
	Pkg         *skills.SkillPackage
	FromInstall bool
}

func installIsSkill(inst *domain.InstallRecord) bool {
	if inst.Kind == domain.KindSkill {
		return true
	}
	if inst.Kind != "" {
		return false
	}
	// Legacy rows predate the Kind field; the canonical listing id still
	// carries the kind.
	lid, err := domain.ParseListingID(inst.ListingID)
	return err == nil && lid.Kind() == domain.KindSkill
}

// skillSourcesForBridge resolves every skill visible to a bridge call in the
// same order the CLI inventory uses: user scope first, then the named project.
// A source is included only when its SKILL.md can actually be read; a broken
// tree is omitted rather than listed as if it were usable.
func skillSourcesForBridge(
	ctx context.Context,
	db *state.DB,
	engine *install.Engine,
	dataRoot, projectRoot string,
) ([]bridgeSkillSource, error) {
	installs, err := installsForProjectRoot(ctx, db, projectRoot)
	if err != nil {
		return nil, err
	}

	seenDirs := make(map[string]struct{})
	seenIDs := make(map[string]struct{})
	var out []bridgeSkillSource

	for _, inst := range installs {
		if !installIsSkill(inst) {
			continue
		}
		dir := resolveInstallSkillDir(ctx, db, engine, inst)
		if dir == "" {
			continue
		}
		sp, err := skills.LoadSkillFromDirectory(dir)
		if err != nil {
			continue
		}
		seenDirs[dir] = struct{}{}
		seenIDs[inst.ListingID] = struct{}{}
		out = append(out, bridgeSkillSource{
			ID:          inst.ListingID,
			Name:        sp.Name,
			Dir:         dir,
			Scope:       inst.Scope,
			Pkg:         sp,
			FromInstall: true,
		})
	}

	ledger, err := skills.OpenLedger(skills.LedgerPath(dataRoot))
	if err != nil {
		return nil, err
	}
	entries, err := ledger.All()
	if err != nil {
		return nil, err
	}

	projectAbs := projectRoot
	if projectAbs != "" {
		if abs, absErr := filepath.Abs(projectAbs); absErr == nil {
			projectAbs = abs
		}
	}

	for _, entry := range entries {
		scope := domain.ScopeUser
		if strings.EqualFold(entry.Scope, "project") {
			if projectAbs == "" || !pathWithin(projectAbs, entry.DestDir) {
				continue
			}
			scope = domain.ScopeProject
		}
		if _, ok := seenDirs[entry.DestDir]; ok {
			continue
		}
		sp, err := skills.LoadSkillFromDirectory(entry.DestDir)
		if err != nil {
			continue
		}
		id := "skill:" + entry.SkillName
		if _, exists := seenIDs[id]; exists {
			suffix := entry.AgentID
			if suffix == "" {
				suffix = "ledger"
			}
			id = id + "@" + suffix
		}
		seenIDs[id] = struct{}{}
		seenDirs[entry.DestDir] = struct{}{}
		out = append(out, bridgeSkillSource{
			ID:      id,
			Name:    sp.Name,
			Dir:     entry.DestDir,
			AgentID: entry.AgentID,
			Scope:   scope,
			Pkg:     sp,
		})
	}

	return out, nil
}

func resolveInstallSkillDir(
	ctx context.Context,
	db *state.DB,
	engine *install.Engine,
	inst *domain.InstallRecord,
) string {
	if engine != nil && inst.TreeDigest != "" {
		if treePath, err := engine.TreePath(inst.TreeDigest); err == nil {
			if _, err := skills.LoadSkillFromDirectory(treePath); err == nil {
				return treePath
			}
		}
	}
	if inst.InstallPath != "" {
		if _, err := skills.LoadSkillFromDirectory(inst.InstallPath); err == nil {
			return inst.InstallPath
		}
	}
	mutations, err := deployment.NewLedger(db.Raw()).MutationsForInstall(ctx, inst.InstallID)
	if err != nil {
		return ""
	}
	for _, mutation := range mutations {
		if mutation.StructureType != "skill-dir" {
			continue
		}
		if _, err := skills.LoadSkillFromDirectory(mutation.FilePath); err == nil {
			return mutation.FilePath
		}
	}
	return ""
}

func findBridgeSkillSource(sources []bridgeSkillSource, skillID string) *bridgeSkillSource {
	for i := range sources {
		if sources[i].ID == skillID {
			return &sources[i]
		}
	}
	// Accept a bare skill name for ledger-only skills: the user sees
	// "skill:<name>" in list_installed, but an agent may reasonably pass the
	// name it just read. This is a lookup convenience, not a second identity.
	for i := range sources {
		if sources[i].Name == skillID || "skill:"+sources[i].Name == skillID {
			return &sources[i]
		}
	}
	return nil
}

func readSkillResource(root, requested string) ([]byte, error) {
	if strings.TrimSpace(requested) == "" {
		return nil, errSkillPathTraversal
	}
	cleanRel := filepath.Clean(requested)
	if !filepath.IsLocal(cleanRel) {
		return nil, errSkillPathTraversal
	}

	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	filePath := filepath.Join(rootAbs, cleanRel)
	rel, err := filepath.Rel(rootAbs, filePath)
	if err != nil || !filepath.IsLocal(rel) {
		return nil, errSkillPathTraversal
	}

	info, err := os.Lstat(filePath)
	if err != nil {
		return nil, err
	}
	if info.Mode()&os.ModeSymlink != 0 || info.IsDir() {
		return nil, fmt.Errorf("skill resource %q is not a regular file", cleanRel)
	}
	if info.Size() > maxSkillResourceBytes {
		return nil, errSkillResourceLarge
	}

	// Resolve the root and the file before reading so a symlinked parent
	// directory cannot move the read outside the installed tree. The Lstat
	// above rejects a symlinked file; this catches a symlinked ancestor.
	resolvedRoot, err := filepath.EvalSymlinks(rootAbs)
	if err != nil {
		return nil, err
	}
	resolvedFile, err := filepath.EvalSymlinks(filePath)
	if err != nil {
		return nil, err
	}
	resolvedRel, err := filepath.Rel(resolvedRoot, resolvedFile)
	if err != nil || !filepath.IsLocal(resolvedRel) {
		return nil, errSkillPathTraversal
	}

	return os.ReadFile(resolvedFile)
}

func pathWithin(root, candidate string) bool {
	if root == "" || candidate == "" {
		return false
	}
	rel, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator)) && filepath.IsLocal(rel))
}
