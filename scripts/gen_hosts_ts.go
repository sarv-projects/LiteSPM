//go:build ignore

// gen_hosts_ts emits web/data/hosts.json from the compiled-in Go host registry.
//
// Why generate instead of hand-maintaining a TS array: the Market UI previously
// hard-coded six hosts while the registry had grown to fifty, so the public site
// understated its own capability by 8x. A generated file cannot drift.
//
// Usage:  go run scripts/gen_hosts_ts.go
//
// The emitted userPath is the Unix-resolution of the adapter's user-scope
// config, with the home directory replaced by "~". Windows paths are NOT
// synthesised: the registry deliberately refuses to guess them (see
// ARCH/30), so neither does this generator.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/skills"
)

const fakeHome = "/tmp/__litespm_home__"

// fakeRoot is the stand-in project directory project-scope paths are resolved
// against, so the emitted path is published relative to a repository root
// rather than as an absolute machine path.
const fakeRoot = "/tmp/__litespm_project__"
const fakeRootSlash = fakeRoot + "/"

type emittedHost struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Format    string `json:"format"`
	KeyPath   string `json:"keyPath,omitempty"`
	Shape     string `json:"shape,omitempty"`
	UserPath  string `json:"userPath,omitempty"`
	Projected bool   `json:"projectOnly,omitempty"`
	DocsURL   string `json:"docsUrl,omitempty"`
	Generic   bool   `json:"generic"`
	// ProjectScope is true when `install --scope project` can write this host,
	// and ProjectPath is the file it writes, relative to the project root.
	// Both come from the adapters, so the site cannot advertise a project
	// config the binary refuses.
	ProjectScope bool   `json:"projectScope,omitempty"`
	ProjectPath  string `json:"projectPath,omitempty"`
	// Remote marks a host whose registry row carries a verified remote (URL)
	// MCP entry spelling (host.RemoteEntrySpecFor). Absent on every host that
	// must refuse a remote install, so the site can state the capability
	// without restating the matrix.
	Remote bool `json:"remote,omitempty"`
	// RemoteTransports is the registry vocabulary that host can express for a
	// URL entry — `streamable-http` and/or `sse`, the authority the binary's
	// writer checks before it writes a remote entry.
	//
	// The flag alone was not enough for the site: it knew a host COULD take a
	// URL, but not which transports it documents, so `lib/installFeasibility.ts`
	// kept a second, hand-written copy of the same fact. When the adapters were
	// re-verified (46 of 50 hosts, 2026-10-21) the hand-written table stayed
	// behind at eight rows and the site reported `unknown` — never `supported`
	// — for 38 hosts the binary would happily install into. Emitting the set
	// here is the fix the table's own comment asked for: one source.
	RemoteTransports []string `json:"remoteTransports,omitempty"`
}

func main() {
	os.Setenv("HOME", fakeHome)
	// Codex resolves its config through CODEX_HOME before HOME; pin that
	// override too so generated site data never captures the generator host's
	// private home directory.
	os.Setenv("CODEX_HOME", filepath.Join(fakeHome, ".codex"))
	os.Setenv("XDG_CONFIG_HOME", filepath.Join(fakeHome, ".config"))
	// APPDATA is meaningless on Unix and windowsAppData() ignores it there, so
	// setting it would change nothing. Left unset deliberately.

	ctx := context.Background()
	var out []emittedHost

	for _, a := range host.ListAdapters() {
		d := a.Descriptor()
		row := emittedHost{
			ID:     d.HostID,
			Name:   d.DisplayName,
			Format: d.ConfigFormat,
		}
		if g, ok := a.(*host.GenericAdapter); ok {
			row.Generic = true
			row.DocsURL = g.Target.DocsURL
			if g.Target.UserPath == nil {
				row.Projected = true
			}
		}
		// The container key path and entry shape come from the registry for
		// EVERY adapter, the six hand-written ones included
		// (host.EntryLayoutForScope resolves bespokeEntrySpecs for those). The
		// web UI used to hard-code those six and its rows drifted from the
		// adapters (its OpenCode row disagreed with opencode.go), so the
		// drift is removed at the source instead of being patched in
		// TypeScript. The site documents the user-scope layout.
		if keyPath, shape, ok := host.EntryLayoutForScope(a, domain.ScopeUser); ok {
			row.KeyPath = keyPath
			row.Shape = shape
		}
		// The remote (URL) capability comes from the same query install and
		// copy use (host.RemoteEntrySpecFor), so the emitted flag can never
		// disagree with what the binary will actually write.
		if spec, ok := host.RemoteEntrySpecFor(d.HostID); ok {
			row.Remote = true
			// The transport set travels with the flag, sorted so two runs over
			// the same registry are byte-identical.
			if len(spec.Transports) > 0 {
				row.RemoteTransports = append([]string(nil), spec.Transports...)
				sort.Strings(row.RemoteTransports)
			}
		}
		// Project scope, from the same predicate `install --scope project` uses
		// (host.SupportsProjectScope) and the same path it writes
		// (host.ProjectConfigPathFor). A site row can therefore never advertise a
		// project config the adapter refuses, which is the honesty rule the agent
		// atlas is built on: every chip is a fact one of the Go tables states.
		row.ProjectScope = host.SupportsProjectScope(a)
		if row.ProjectScope {
			if path, ok := host.ProjectConfigPathFor(a, fakeRoot); ok {
				// Published relative to the project, so it reads as a location
				// inside a repository rather than as an absolute machine path.
				row.ProjectPath = strings.TrimPrefix(tidyPath(path), fakeRootSlash)
			}
		}
		if p, err := a.DetectConfig(ctx, domain.ScopeUser); err == nil && p != "" {
			row.UserPath = tidyPath(p)
		}
		out = append(out, row)
	}

	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })

	dest := filepath.Join("web", "data", "hosts.json")
	if err := writeJSON(dest, out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("wrote %s with %d hosts\n", dest, len(out))

	// Skill install targets are a DIFFERENT registry from bridge adapters:
	// bridge adapters are hosts whose config file we can edit; skill targets are
	// hosts we can write a SKILL.md into. The catalog needs both, because an
	// MCP server is installable into every bridge host while a skill is only
	// installable into the targets that have a skills directory.
	type emittedSkillTarget struct {
		ID          string `json:"id"`
		DisplayName string `json:"displayName"`
		Universal   bool   `json:"universal,omitempty"`
		HasGlobal   bool   `json:"hasGlobal"`
		ProjectDir  string `json:"projectDir"`
		GlobalDir   string `json:"globalDir,omitempty"`
		Base        string `json:"base"`
		EnvVar      string `json:"envVar,omitempty"`
		DefaultBase string `json:"defaultBase,omitempty"`
	}
	var skillTargets []emittedSkillTarget
	for _, t := range skills.AgentTargets() {
		base := "home"
		switch t.Base {
		case skills.BaseXDG:
			base = "xdg"
		case skills.BaseEnv:
			base = "env"
		}
		skillTargets = append(skillTargets, emittedSkillTarget{
			ID:          t.ID,
			DisplayName: t.DisplayName,
			Universal:   t.Universal,
			HasGlobal:   t.GlobalDir != "",
			ProjectDir:  t.ProjectDir,
			GlobalDir:   t.GlobalDir,
			Base:        base,
			EnvVar:      t.EnvVar,
			DefaultBase: t.DefaultBase,
		})
	}
	sort.Slice(skillTargets, func(i, j int) bool { return skillTargets[i].ID < skillTargets[j].ID })
	skillDest := filepath.Join("web", "data", "skill-targets.json")
	if err := writeJSON(skillDest, skillTargets); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("wrote %s with %d skill targets\n", skillDest, len(skillTargets))
}

func writeJSON(dest string, v any) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	blob, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(dest, append(blob, '\n'), 0o644)
}

// tidyPath turns the sandbox home back into a portable "~" form and normalises
// separators, so the emitted value is a documentation path, not a local one.
//
// Project-scope-only hosts (codestudio, ona, roo) resolve against the working
// directory, which would otherwise publish the maintainer's local checkout path
// on the public site. Those become a "<project>" placeholder instead.
func tidyPath(p string) string {
	p = filepath.ToSlash(p)
	if strings.HasPrefix(p, fakeHome) {
		return "~" + strings.TrimPrefix(p, fakeHome)
	}
	if wd, err := os.Getwd(); err == nil {
		wd = filepath.ToSlash(wd)
		if p == wd {
			return "<project>"
		}
		if strings.HasPrefix(p, wd+"/") {
			return "<project>" + strings.TrimPrefix(p, wd)
		}
	}
	return p
}
