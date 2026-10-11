package host

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/sarv-projects/litespm/internal/domain"
)

// ClineAdapter manages integration with Cline VS Code Extension.
type ClineAdapter struct{}

func (a *ClineAdapter) Descriptor() HostDescriptor {
	return HostDescriptor{
		HostID:                 "cline",
		DisplayName:            "Cline (VS Code Extension)",
		SupportedVersions:      []string{">=2.0.0"},
		DefaultConfigFileName:  "cline_mcp_settings.json",
		ConfigFormat:           "json",
		SupportsFormElicit:     true,
		RequiresBootstrapSkill: false,
		SlashCommandTrigger:    "/marketplace",
	}
}

// DetectConfig resolves the Cline MCP settings file.
//
// Cline moved this file out of the VS Code extension's globalStorage into a
// location shared by every Cline client: the extension source states "the MCP
// settings file lives at ~/.cline/data/settings/cline_mcp_settings.json
// (shared across VSCode, CLI, and JetBrains clients)", and reads the old
// globalStorage path only as a ONE-SHOT legacy migration. Writing to the
// globalStorage path therefore does nothing on any current install, while
// `CLINE_MCP_SETTINGS_PATH`, `CLINE_DATA_DIR` or `CLINE_DIR` relocate the
// real one (https://docs.cline.bot/getting-started/config,
// https://docs.cline.bot/mcp/mcp-overview):
//
//   - CLINE_MCP_SETTINGS_PATH — the full path of the settings file itself.
//   - CLINE_DATA_DIR — replaces ~/.cline/data/, so the file lives at
//     $CLINE_DATA_DIR/settings/cline_mcp_settings.json.
//   - CLINE_DIR — replaces ~/.cline/ wholesale, so the file lives at
//     $CLINE_DIR/data/settings/cline_mcp_settings.json.
//
// Precedence among the three is MOST SPECIFIC WINS:
// CLINE_MCP_SETTINGS_PATH > CLINE_DATA_DIR > CLINE_DIR > default. The vendor
// docs list each variable but never state an order among them; most-specific-
// wins is the only order consistent with their semantics — a variable that
// names the exact file pins more than one that names a directory, which in
// turn pins more than one that only replaces the parent of the data dir — and
// it degrades gracefully: setting a broader variable in addition to a narrower
// one changes nothing while the narrower one is set.
//
// After the env overrides come the shared default path, then the legacy
// globalStorage files for a client too old to have migrated. When nothing
// exists yet we create the most specific override's path, or the shared path
// when no override is set, because that is the file every current Cline reads.
func (a *ClineAdapter) DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error) {
	homeDir := resolveHomeDir()

	var candidates []string
	preferred := ""
	if override := os.Getenv("CLINE_MCP_SETTINGS_PATH"); override != "" {
		candidates = append(candidates, override)
		preferred = override
	}
	if dataDir := os.Getenv("CLINE_DATA_DIR"); dataDir != "" {
		candidate := filepath.Join(dataDir, "settings", "cline_mcp_settings.json")
		candidates = append(candidates, candidate)
		if preferred == "" {
			preferred = candidate
		}
	}
	if clineDir := os.Getenv("CLINE_DIR"); clineDir != "" {
		candidate := filepath.Join(clineDir, "data", "settings", "cline_mcp_settings.json")
		candidates = append(candidates, candidate)
		if preferred == "" {
			preferred = candidate
		}
	}
	shared := filepath.Join(homeDir, ".cline", "data", "settings", "cline_mcp_settings.json")
	candidates = append(candidates, shared)

	// Legacy: unverified VS Code / VS Code Insiders globalStorage locations
	// kept as last-resort READ targets (see legacyClineSettingsPaths).
	for _, c := range legacyClineSettingsPaths(homeDir) {
		candidates = append(candidates, c)
	}

	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c, nil
		}
	}
	// Nothing exists yet. Create the file the running client reads: the
	// override if one is set, otherwise the shared path.
	if preferred != "" {
		return preferred, nil
	}
	return shared, nil
}

// legacyClineSettingsPaths lists pre-migration VS Code globalStorage
// locations, in Cline's own order.
//
// These are UNVERIFIED legacy paths: they appear in no current vendor
// documentation page (https://docs.cline.bot/getting-started/config,
// https://docs.cline.bot/mcp/mcp-overview). They survive only as last-resort
// READ targets for a pre-migration client whose config never moved; nothing
// ever writes to them.
func legacyClineSettingsPaths(homeDir string) []string {
	suffix := filepath.Join("User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
	var roots []string
	if runtime.GOOS == "windows" {
		if appData := os.Getenv("APPDATA"); appData != "" {
			roots = append(roots, filepath.Join(appData, "Code"), filepath.Join(appData, "Code - Insiders"))
		}
		roots = append(roots, filepath.Join(homeDir, ".config", "Code"), filepath.Join(homeDir, ".config", "Code - Insiders"))
	} else if runtime.GOOS == "darwin" {
		roots = append(roots,
			filepath.Join(homeDir, "Library", "Application Support", "Code"),
			filepath.Join(homeDir, "Library", "Application Support", "Code - Insiders"))
	} else {
		roots = append(roots,
			filepath.Join(homeDir, ".config", "Code"),
			filepath.Join(homeDir, ".config", "Code - Insiders"))
	}
	paths := make([]string, 0, len(roots))
	for _, r := range roots {
		paths = append(paths, filepath.Join(r, suffix))
	}
	return paths
}

func (a *ClineAdapter) PlanSetup(ctx context.Context, binaryPath string, backupDir string) (*HostChangePlan, error) {
	configPath, err := a.DetectConfig(ctx, domain.ScopeUser)
	if err != nil {
		return nil, err
	}

	origContent := "{}"
	if data, err := os.ReadFile(configPath); err == nil {
		origContent = string(data)
	}

	backupPath, err := CreateAtomicBackup(configPath, backupDir, "cline")
	if err != nil {
		return nil, err
	}

	// Surgical splice, not parse-and-re-serialize: Cline's config lives in
	// VS Code's globalStorage settings and is hand-edited, so comments, key
	// order, indentation and the trailing newline must survive byte-for-byte.
	proposed, err := renderBridgeEntryJSON("cline", origContent, []string{"mcpServers"}, map[string]any{
		"command": filepath.ToSlash(binaryPath),
		"args":    []string{"bridge", "stdio", "--host", "cline"},
	})
	if err != nil {
		return nil, err
	}

	return &HostChangePlan{
		HostID:          "cline",
		ConfigPath:      configPath,
		OriginalContent: origContent,
		ProposedContent: proposed,
		BackupPath:      backupPath,
	}, nil
}

func (a *ClineAdapter) ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error) {
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

func (a *ClineAdapter) VerifySetup(ctx context.Context) (*HostVerification, error) {
	configPath, err := a.DetectConfig(ctx, domain.ScopeUser)
	if err != nil {
		return &HostVerification{HostID: "cline", Status: "missing"}, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return &HostVerification{HostID: "cline", ConfigPath: configPath, Status: "missing"}, nil
	}

	rootMap, err := parseHostJSON(data)
	if err != nil {
		return &HostVerification{HostID: "cline", ConfigPath: configPath, Status: "corrupted"}, nil
	}

	mcpServers, ok := rootMap["mcpServers"].(map[string]any)
	if !ok {
		return &HostVerification{HostID: "cline", ConfigPath: configPath, Status: "missing"}, nil
	}

	_, registered := mcpServers["litespm"]
	status := "missing"
	if registered {
		status = "ready"
	}

	return &HostVerification{
		HostID:     "cline",
		ConfigPath: configPath,
		Registered: registered,
		Status:     status,
	}, nil
}

func (a *ClineAdapter) DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error) {
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

	mcpServers, ok := rootMap["mcpServers"].(map[string]any)
	if !ok {
		return nil, nil
	}

	var results []PreExistingComponent
	for name, details := range mcpServers {
		if name == litespmServerName || name == legacyServerName {
			continue
		}
		comp := PreExistingComponent{
			Name:       name,
			Kind:       "mcp",
			ReadOnly:   true,
			SourcePath: configPath,
		}
		if dMap, ok := details.(map[string]any); ok {
			if cmd, ok := dMap["command"].(string); ok {
				comp.Command = cmd
			}
			if args, ok := dMap["args"].([]any); ok {
				for _, arg := range args {
					if argStr, ok := arg.(string); ok {
						comp.Args = append(comp.Args, argStr)
					}
				}
			}
		}
		results = append(results, comp)
	}

	return results, nil
}

func (a *ClineAdapter) RenderManualSetup(binaryPath string) string {
	cleanBin := filepath.ToSlash(binaryPath)
	return fmt.Sprintf(`// Add to cline_mcp_settings.json:
"mcpServers": {
  "litespm": {
    "command": %q,
    "args": ["bridge", "stdio", "--host", "cline"]
  }
}
`, cleanBin)
}
