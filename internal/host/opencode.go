package host

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/sarv-projects/litespm/internal/domain"
)

// OpenCodeAdapter manages integration with OpenCode CLI.
//
// OpenCode v2 documents ONE layout for MCP servers: each one lives at
// `mcp.servers.<name>` (https://opencode.ai/v2/docs/mcp-servers, "Config").
// Flat members directly under `mcp` — what earlier LiteSPM releases wrote —
// are the v1 shape: a live v2.0.26 run still loads them, but the v2 docs state
// that flat names under `mcp` are not the v2 layout. So this adapter WRITES
// the documented nested container and keeps READING both shapes (setup verify,
// pre-existing-tool detection) so a config written in either shape keeps
// reporting what is actually on disk.
type OpenCodeAdapter struct{}

func (a *OpenCodeAdapter) Descriptor() HostDescriptor {
	return HostDescriptor{
		HostID:                 "opencode",
		DisplayName:            "OpenCode CLI",
		SupportedVersions:      []string{">=1.0.0", ">=2.0.0"},
		DefaultConfigFileName:  "opencode.json",
		ConfigFormat:           "json",
		SupportsFormElicit:     false,
		RequiresBootstrapSkill: false,
		SlashCommandTrigger:    "/marketplace",
	}
}

// DetectConfig resolves the global OpenCode config file.
//
// OpenCode resolves its config directory through xdg-basedir, so
// $XDG_CONFIG_HOME applies on every OS including Windows, and OPENCODE_CONFIG_DIR
// overrides the directory outright. Both `opencode.json` and `opencode.jsonc`
// are read, `.jsonc` first (source: ConfigPaths.files() returns
// ["${name}.jsonc", "${name}.json"]).
//
// Two paths this adapter used to probe were removed because no OpenCode release
// reads them: `~/.opencode.json` and `%APPDATA%\OpenCode\opencode.json`. Probing
// them was not harmless — when the real file was absent they became the default
// target, so the bridge was written somewhere OpenCode never looks while setup
// reported success.
func (a *OpenCodeAdapter) DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error) {
	dir := ""
	if v := os.Getenv("OPENCODE_CONFIG_DIR"); v != "" {
		dir = v
	} else {
		dir = filepath.Join(xdgConfigDir(resolveHomeDir()), "opencode")
	}
	candidates := []string{
		filepath.Join(dir, "opencode.jsonc"),
		filepath.Join(dir, "opencode.json"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c, nil
		}
	}
	return candidates[1], nil
}

// ProjectConfigPath implements ProjectConfigPather. OpenCode's project-scope
// config file is `opencode.json` / `opencode.jsonc` at the project root (the
// `.opencode/opencode.json(c)` subdirectory form is the next candidate in the
// same upward walk from the working directory), so a named project resolves to
// the plain file at its root — the first place that walk looks
// (https://opencode.ai/v2/docs/config, "Locations"; verified 2026-10-11). The
// project file shares the user file's schema, so the entry spec — including
// the `mcp.servers` container — is identical at both scopes.
func (a *OpenCodeAdapter) ProjectConfigPath(root string) string {
	return filepath.Join(root, "opencode.json")
}

func (a *OpenCodeAdapter) PlanSetup(ctx context.Context, binaryPath string, backupDir string) (*HostChangePlan, error) {
	configPath, err := a.DetectConfig(ctx, domain.ScopeUser)
	if err != nil {
		return nil, err
	}

	origContent := "{}"
	if data, err := os.ReadFile(configPath); err == nil {
		origContent = string(data)
	}

	backupPath, err := CreateAtomicBackup(configPath, backupDir, "opencode")
	if err != nil {
		return nil, err
	}

	// OpenCode v2 documents servers under `mcp.servers.<name>`
	// (https://opencode.ai/v2/docs/mcp-servers, "Config"), so the bridge goes
	// there. The flat `mcp.litespm` member an earlier LiteSPM release wrote is
	// the v1 shape the runtime still loads: migrate it out here, or one config
	// would carry two bridge registrations that flatten to the same server
	// name. Foreign flat members (`mcp.weather` and friends) are left alone.
	orig := stripLegacyFlatBridgeEntries(origContent)

	bridgeEntry := map[string]any{
		"type": "local",
		// OpenCode local servers use a combined string array command
		// (executable followed by its arguments).
		"command": append([]string{filepath.ToSlash(binaryPath)}, "bridge", "stdio", "--host", "opencode"),
	}

	proposed, err := renderBridgeEntryJSON("opencode", orig, []string{"mcp", "servers"}, bridgeEntry)
	if err != nil {
		return nil, err
	}

	return &HostChangePlan{
		HostID:          "opencode",
		ConfigPath:      configPath,
		OriginalContent: origContent,
		ProposedContent: proposed,
		BackupPath:      backupPath,
	}, nil
}

func (a *OpenCodeAdapter) ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error) {
	if err := ApplyPlanWrite(plan); err != nil {
		return nil, err
	}

	return &HostApplyResult{
		HostID:     plan.HostID,
		ConfigPath: plan.ConfigPath,
		BackupPath: plan.BackupPath,
		Success:    true,
	}, nil
}

// stripLegacyFlatBridgeEntries removes LiteSPM's own bridge members from the
// flat `mcp.<name>` position (the v1 shape) so a setup can migrate the bridge
// into the documented v2 container `mcp.servers.<name>` without leaving a
// second registration behind. It touches only the two names LiteSPM has ever
// written (`litespm` and its pre-rename `litepsm`); foreign flat members stay
// put, and `mcp.servers` itself is never touched — that container is the
// documented home of servers, not residue to prune.
func stripLegacyFlatBridgeEntries(orig string) string {
	out := orig
	for _, name := range []string{litespmServerName, legacyServerName} {
		if stripped, removed, err := stripJSONEntryNamed(out, []string{"mcp"}, name); err == nil && removed {
			out = stripped
		}
	}
	return out
}

func (a *OpenCodeAdapter) VerifySetup(ctx context.Context) (*HostVerification, error) {
	configPath, err := a.DetectConfig(ctx, domain.ScopeUser)
	if err != nil {
		return &HostVerification{HostID: "opencode", Status: "missing"}, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return &HostVerification{HostID: "opencode", ConfigPath: configPath, Status: "missing"}, nil
	}

	rootMap, err := parseHostJSON(data)
	if err != nil {
		return &HostVerification{HostID: "opencode", ConfigPath: configPath, Status: "corrupted"}, nil
	}

	registered := false
	if mcpVal, ok := rootMap["mcp"].(map[string]any); ok {
		// The documented v2 container: `mcp.servers.litespm`.
		if serversVal, ok := mcpVal["servers"].(map[string]any); ok {
			if _, ok := serversVal["litespm"]; ok {
				registered = true
			}
		}
		// The v1 flat shape (`mcp.litespm`) is still loaded by a live v2.0.26
		// run, so it must verify too: the bridge entry is real, and reporting
		// "missing" would send the user to re-run a setup that already
		// succeeded. Both shapes are checked independently — a file holds
		// either one, and during a migration both.
		if _, ok := mcpVal["litespm"]; ok {
			registered = true
		}
	}

	status := "missing"
	if registered {
		status = "ready"
	}

	return &HostVerification{
		HostID:     "opencode",
		ConfigPath: configPath,
		Registered: registered,
		Status:     status,
	}, nil
}

func (a *OpenCodeAdapter) DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error) {
	configPath, err := a.DetectConfig(ctx, domain.ScopeUser)
	if err != nil {
		return nil, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, nil
	}

	rootMap, err := parseHostJSON(data)
	if err != nil {
		return nil, nil
	}

	var results []PreExistingComponent
	mcpVal, ok := rootMap["mcp"].(map[string]any)
	if !ok {
		return nil, nil
	}

	// Both shapes are read: the documented v2 container `mcp.servers.<name>`
	// and the v1 flat members directly under `mcp`. Neither is preferred over
	// what is on disk — a config holds either one (or both during a
	// migration), and a foreign tool configured in the shape LiteSPM does not
	// write must still surface here.
	seen := make(map[string]bool)
	add := func(name string, details any) {
		if name == litespmServerName || name == legacyServerName || name == "servers" {
			return
		}
		if seen[name] {
			return
		}
		seen[name] = true
		results = append(results, a.extractComponent(name, details, configPath))
	}
	if serversVal, ok := mcpVal["servers"].(map[string]any); ok {
		for name, details := range serversVal {
			add(name, details)
		}
	}
	for name, details := range mcpVal {
		add(name, details)
	}

	return results, nil
}

func (a *OpenCodeAdapter) extractComponent(name string, details any, configPath string) PreExistingComponent {
	comp := PreExistingComponent{
		Name:       name,
		Kind:       "mcp",
		ReadOnly:   true,
		SourcePath: configPath,
	}
	if dMap, ok := details.(map[string]any); ok {
		// OpenCode local entries store the executable and its arguments as a
		// single string array under "command"; older entries may use a string
		// "command" plus a separate "args" array.
		switch cmd := dMap["command"].(type) {
		case string:
			comp.Command = cmd
		case []any:
			for i, item := range cmd {
				s, ok := item.(string)
				if !ok {
					continue
				}
				if i == 0 {
					comp.Command = s
				} else {
					comp.Args = append(comp.Args, s)
				}
			}
		}
		if args, ok := dMap["args"].([]any); ok {
			for _, arg := range args {
				if argStr, ok := arg.(string); ok {
					comp.Args = append(comp.Args, argStr)
				}
			}
		}
	}
	return comp
}

// RenderManualSetup prints the snippet the wizard falls back on when it cannot
// write the config itself. It shows the same shape PlanSetup writes:
// bespokeEntrySpecs["opencode"] is KeyPath ["mcp","servers"] with
// ShapeLocalArray, so each server sits at `mcp.servers.<name>` — the layout
// OpenCode v2 documents (https://opencode.ai/v2/docs/mcp-servers, "Config") —
// carrying `"type": "local"` and a combined command array.
func (a *OpenCodeAdapter) RenderManualSetup(binaryPath string) string {
	cleanBin := filepath.ToSlash(binaryPath)
	return fmt.Sprintf(`// Add to opencode.json: servers live under "mcp"."servers" (OpenCode v2).
{
  "mcp": {
    "servers": {
      "litespm": {
        "type": "local",
        "command": [%q, "bridge", "stdio", "--host", "opencode"]
      }
    }
  }
}
`, cleanBin)
}
