package main

// marketplace_command.go — installs the in-agent marketplace command next to
// the bridge, and says in one line what the user got.

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/sarv-projects/litespm/internal/host"
)

// installMarketplaceCommand writes (or upgrades) the agent's marketplace
// command after a successful setup and reports it. It never fails a setup: a
// bridge without a popup still works through the agent's MCP tools.
func installMarketplaceCommand(ctx context.Context, w io.Writer, hostID, binary string) {
	res, err := host.InstallMarketplaceCommand(ctx, hostID, host.MarketplaceCommandOptions{Binary: binary})
	if res == nil && err == nil {
		return
	}
	if err != nil {
		fmt.Fprintf(w, "  • Marketplace command: not added (%v)\n", err)
		return
	}
	for _, line := range describeMarketplaceCommand(res) {
		fmt.Fprintln(w, line)
	}
}

func describeMarketplaceCommand(res *host.MarketplaceCommandResult) []string {
	what := "a popup"
	if res.Kind == host.CommandPrompt {
		what = "a command that asks the agent to use LiteSPM's tools"
	}
	var out []string
	if len(res.Skipped) > 0 && len(res.Written) == 0 {
		out = append(out, fmt.Sprintf("  • Marketplace command: skipped, a file you own is already at %s", res.Skipped[0]))
		return out
	}
	out = append(out, fmt.Sprintf("  • Marketplace: type %s in the agent (%s, %s)", res.Invoke, what, res.Mechanism))
	if res.Note != "" {
		out = append(out, "    "+res.Note)
	}
	if !res.Verified {
		out = append(out, "    Written from the vendor's documentation; not yet tested against a live install.")
	}
	return out
}

func selfBinary() string {
	if p, err := os.Executable(); err == nil {
		return p
	}
	return "litespm"
}
