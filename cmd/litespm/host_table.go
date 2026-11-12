package main

import (
	"context"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/sarv-projects/litespm/internal/host"
)

// renderHostList prints every registered adapter with the config file it
// resolves on this machine, sorted by display name (case-insensitive).
func renderHostList(ctx context.Context, w io.Writer) {
	adapters := host.ListAdapters()
	sort.SliceStable(adapters, func(i, j int) bool {
		a, b := adapters[i].Descriptor(), adapters[j].Descriptor()
		an, bn := strings.ToLower(a.DisplayName), strings.ToLower(b.DisplayName)
		if an != bn {
			return an < bn
		}
		return a.HostID < b.HostID
	})
	fmt.Fprintf(w, "Registered Agent Host Adapters (%d):\n\n", len(adapters))
	rows := make([][]string, 0, len(adapters))
	for _, a := range adapters {
		d := a.Descriptor()
		rows = append(rows, []string{d.HostID, d.DisplayName, d.ConfigFormat, hostListConfigCell(ctx, a)})
	}
	writeTable(w, "", []string{"HOST ID", "DISPLAY NAME", "FORMAT", "CONFIG FILE"}, rows)
}

// hostListConfigCell is the real user-scope config path, home-relative, or the
// project file pattern for a host that only has a project-scope file.
func hostListConfigCell(ctx context.Context, a host.HostAdapter) string {
	loc := host.DescribeConfigLocation(ctx, a)
	switch {
	case loc.Unsupported != "":
		return "(" + loc.Unsupported + ")"
	case loc.ProjectOnly:
		return loc.ProjectPattern + " (project only)"
	default:
		return host.HomeRelative(loc.Path)
	}
}

// renderHostDetect prints which agent configs exist on this machine and whether
// LiteSPM's bridge is connected. cwd decides how project-only hosts are shown.
func renderHostDetect(ctx context.Context, w io.Writer, cwd string) int {
	fmt.Fprintln(w, "Scanning for installed agent configurations...")
	detected, err := host.DescribeDetection(ctx, cwd)
	if err != nil {
		fmt.Fprintf(w, "Detection error: %v\n", err)
		return 1
	}
	rows := make([][]string, 0, len(detected))
	connected := 0
	for _, v := range detected {
		fileStatus := "missing"
		if v.Configured {
			fileStatus = "found"
		}
		bridge := "not linked"
		if v.Registered {
			bridge = "connected"
			connected++
		}
		where := v.Path
		switch {
		case v.Note != "":
			where = v.Note
		case v.Project:
			where += " (project)"
		}
		rows = append(rows, []string{v.HostID, fileStatus, bridge, where})
	}
	writeTable(w, "", []string{"HOST ID", "CONFIG FILE", "BRIDGE", "CONFIG PATH"}, rows)
	fmt.Fprintln(w)
	fmt.Fprintln(w, "CONFIG FILE: whether the agent's config exists · BRIDGE: whether LiteSPM is connected")
	if connected == 0 {
		fmt.Fprintln(w, "Connect one: litespm setup --agent <id>")
	} else {
		fmt.Fprintf(w, "%d of %d agent(s) connected. Connect another: litespm setup --agent <id>\n", connected, len(detected))
	}
	return 0
}
