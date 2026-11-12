package host

// display.go — read-only, human-facing descriptions of where each host keeps
// its configuration, for `litespm host list` and `litespm host detect`.
//
// Nothing here is consulted by setup: DetectConfig/PlanSetup/VerifySetup keep
// their behaviour exactly, and these helpers only decide what is DISPLAYED.

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"github.com/sarv-projects/litespm/internal/domain"
)

// ProjectOnlyNote is shown instead of a path for a project-scope-only host when
// the working directory is not a project.
const ProjectOnlyNote = "project only — run inside a project"

// ConfigLocation is where an adapter keeps its config, as shown to a person.
type ConfigLocation struct {
	// Path is the resolved user-scope config file; "" when the host has none.
	Path string
	// ProjectOnly marks a host that documents only a repo-local config file.
	ProjectOnly bool
	// ProjectPattern is the project file as `<project>/…`; set when ProjectOnly.
	ProjectPattern string
	// Unsupported carries the reason when the host cannot run on this OS.
	Unsupported string
}

// DescribeConfigLocation resolves the user-scope config path an adapter uses on
// this machine (the same resolution `host detect` and setup use), or the
// project-file pattern for a project-only host.
func DescribeConfigLocation(ctx context.Context, a HostAdapter) ConfigLocation {
	if g, ok := a.(*GenericAdapter); ok && g.Target.UserPath == nil && g.Target.ProjectPath != nil {
		if !supportsTargetOS(g.Target.SupportedOS, runtime.GOOS) {
			return ConfigLocation{Unsupported: "not supported on " + runtime.GOOS}
		}
		return ConfigLocation{
			ProjectOnly:    true,
			ProjectPattern: filepath.ToSlash(g.Target.ProjectPath("<project>")),
		}
	}
	p, err := a.DetectConfig(ctx, domain.ScopeUser)
	if err != nil {
		return ConfigLocation{Unsupported: err.Error()}
	}
	return ConfigLocation{Path: p}
}

// HomeRelative renders a path under the user's home as `~\…` (`~/…` off
// Windows); any other path is returned unchanged.
func HomeRelative(p string) string {
	home := resolveHomeDir()
	if p == "" || home == "" {
		return p
	}
	home = filepath.Clean(home)
	clean := filepath.Clean(p)
	sep := string(filepath.Separator)
	hasPrefix := strings.HasPrefix(clean, home+sep)
	if runtime.GOOS == "windows" {
		hasPrefix = len(clean) > len(home) && strings.EqualFold(clean[:len(home)], home) && clean[len(home)] == filepath.Separator
	}
	if hasPrefix {
		return "~" + sep + clean[len(home)+1:]
	}
	return p
}

// DetectRow is one line of `host detect`.
type DetectRow struct {
	HostID     string
	Configured bool
	Registered bool
	Status     string
	// Path is the config file to show; "" when none applies.
	Path string
	// Project marks Path as a project-scope file.
	Project bool
	// Note replaces the path when there is none to show.
	Note string
}

// DescribeDetection runs detection and prepares display rows, sorted with
// found configs first (bridge connected first), then the rest by host id.
//
// cwd is the directory treated as the current project. A host that only
// supports project scope is shown against cwd only when cwd is a project
// (it has a .git, or the host's project file exists there); otherwise it gets
// ProjectOnlyNote rather than a path under whatever directory the user is in.
func DescribeDetection(ctx context.Context, cwd string) ([]DetectRow, error) {
	verifs, err := DetectInstalledHosts(ctx)
	if err != nil {
		return nil, err
	}
	rows := make([]DetectRow, 0, len(verifs))
	for _, v := range verifs {
		row := DetectRow{HostID: v.HostID, Configured: v.Configured, Registered: v.Registered, Status: v.Status, Path: v.ConfigPath}
		if a, aerr := GetAdapter(v.HostID); aerr == nil {
			if g, ok := a.(*GenericAdapter); ok && g.Target.UserPath == nil && g.Target.ProjectPath != nil {
				row = projectOnlyRow(row, g, cwd)
			}
		}
		rows = append(rows, row)
	}
	sort.SliceStable(rows, func(i, j int) bool {
		ri, rj := detectRank(rows[i]), detectRank(rows[j])
		if ri != rj {
			return ri < rj
		}
		return rows[i].HostID < rows[j].HostID
	})
	return rows, nil
}

func detectRank(r DetectRow) int {
	switch {
	case r.Configured && r.Registered:
		return 0
	case r.Configured:
		return 1
	default:
		return 2
	}
}

func projectOnlyRow(row DetectRow, g *GenericAdapter, cwd string) DetectRow {
	if !supportsTargetOS(g.Target.SupportedOS, runtime.GOOS) {
		row.Path, row.Note = "", "not supported on "+runtime.GOOS
		row.Configured, row.Registered, row.Status = false, false, "missing"
		return row
	}
	candidates := []string{}
	if cwd != "" {
		candidates = append(candidates, g.Target.ProjectPath(cwd))
		for _, alt := range g.Target.AltProjectPaths {
			candidates = append(candidates, alt(cwd))
		}
	}
	existing := ""
	for _, c := range candidates {
		if fileExists(c) {
			existing = c
			break
		}
	}
	inProject := existing != ""
	if !inProject && cwd != "" {
		_, gerr := os.Stat(filepath.Join(cwd, ".git"))
		inProject = gerr == nil
	}
	if !inProject {
		row.Path, row.Note, row.Project = "", ProjectOnlyNote, false
		row.Configured, row.Registered, row.Status = false, false, "missing"
		return row
	}
	row.Project = true
	if existing != "" {
		row.Path = existing
	} else {
		row.Path = candidates[0]
	}
	return row
}
