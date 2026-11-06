package host

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/sarv-projects/litespm/internal/domain"
)

// CodexAdapter manages integration with OpenAI Codex CLI.
type CodexAdapter struct{}

func (a *CodexAdapter) Descriptor() HostDescriptor {
	return HostDescriptor{
		HostID:                 "codex",
		DisplayName:            "OpenAI Codex CLI",
		SupportedVersions:      []string{">=0.1.0"},
		DefaultConfigFileName:  "config.toml",
		ConfigFormat:           "toml",
		SupportsFormElicit:     false,
		RequiresBootstrapSkill: true,
		SlashCommandTrigger:    "/marketplace",
	}
}

// DetectConfig resolves Codex's user-level config file.
//
// Codex stores its local state under `CODEX_HOME` (default `~/.codex`), and
// "Codex stores its local state under CODEX_HOME (defaults to ~/.codex)" is
// explicit in both the docs and its source. This adapter previously ignored the
// variable, so a relocated home (CI, dev containers) received the bridge in a
// file Codex never reads while `host verify` reported ready. The skills table in
// internal/skills already honoured CODEX_HOME, so the two subsystems disagreed
// about where the same directory is.
//
// The `%APPDATA%\Codex\config.toml` fallback is gone: it is in no OpenAI
// documentation, and the documented Windows system-config path is the different
// `%ProgramData%\OpenAI\Codex\config.toml`, which is an administrator-owned
// file we must not write.
func (a *CodexAdapter) DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error) {
	dir := os.Getenv("CODEX_HOME")
	if dir == "" {
		dir = filepath.Join(resolveHomeDir(), ".codex")
	}
	return filepath.Join(dir, "config.toml"), nil
}

// ProjectConfigPath implements ProjectConfigPather. Codex documents a
// project-scoped `config.toml` beside the project: "Codex stores MCP
// configuration in `config.toml` … By default this is `~/.codex/config.toml`,
// but you can also scope MCP servers to a project with `.codex/config.toml`
// (trusted projects only)". The trusted-projects gate is Codex's own load-time
// policy — Codex reads a project config only for projects the user has marked
// trusted — not a write-time concern of ours: writing the entry is always safe,
// and whether Codex currently honours the file is Codex's decision to make.
//
// The container key is the SAME at both scopes, so this host needs no
// per-scope entry spec — only a path: the MCP docs say "Configure each MCP
// server with a `[mcp_servers.<server-name>]` table in the configuration file"
// for `~/.codex/config.toml` *or* a project-scoped `.codex/config.toml`, and
// the configuration reference confirms project files are the same `config.toml`
// format with a small ignore-list (`model_provider`, `notify`, …) that does
// not include `mcp_servers`.
// Sources: https://learn.chatgpt.com/docs/extend/mcp and
// https://learn.chatgpt.com/docs/config-file/config-reference — verified
// 2026-10-11.
func (a *CodexAdapter) ProjectConfigPath(root string) string {
	return filepath.Join(root, ".codex", "config.toml")
}

func (a *CodexAdapter) PlanSetup(ctx context.Context, binaryPath string, backupDir string) (*HostChangePlan, error) {
	configPath, err := a.DetectConfig(ctx, domain.ScopeUser)
	if err != nil {
		return nil, err
	}
	return a.PlanSetupAt(ctx, binaryPath, backupDir, configPath)
}

// PlanSetupAt implements PathPlanner: the merge is planned against the
// caller's explicit path, so the file written is the file chosen.
func (a *CodexAdapter) PlanSetupAt(ctx context.Context, binaryPath string, backupDir string, configPath string) (*HostChangePlan, error) {
	if strings.TrimSpace(configPath) == "" {
		return nil, fmt.Errorf("codex: no configuration path was given, refusing to plan a write")
	}

	origContent := ""
	origExists := false
	if data, err := os.ReadFile(configPath); err == nil {
		origContent = string(data)
		origExists = true
	}

	backupPath, err := CreateAtomicBackup(configPath, backupDir, "codex")
	if err != nil {
		return nil, err
	}

	cleanBin := filepath.ToSlash(binaryPath)
	quotedBin, qerr := tomlQuoteString(cleanBin)
	if qerr != nil {
		return nil, fmt.Errorf("codex: %s: %w", TOMLInvalidCode, qerr)
	}
	entry := fmt.Sprintf("\n[mcp_servers.litespm]\ncommand = %s\nargs = [\"bridge\", \"stdio\", \"--host\", \"codex\"]\n", quotedBin)

	// Adopt a pre-rename `[mcp_servers.litepsm]` table before writing the
	// current one, so an upgraded host keeps exactly one bridge table.
	base := origContent
	if cleaned, removed, err := stripTOMLEntryNamed(base, []string{"mcp_servers"}, legacyServerName); err == nil && removed {
		base = cleaned
	}

	// The splice replaces a live table (inline comment included) and appends
	// otherwise; a commented-out table is not a registration, so nothing is
	// "updated" that no live header opens. The splice is a fixed point: a
	// second run is byte-identical to the first.
	proposed := spliceTOMLBridgeBlock(base, "[mcp_servers.litespm]", strings.Trim(entry, "\n"))

	// Nothing is planned that the host could not read: the merged text is
	// re-parsed here, before any plan exists, so an escaping bug fails closed.
	if verr := verifyTOMLDocument(proposed); verr != nil {
		return nil, fmt.Errorf("codex: %s: the merged config would not parse as TOML, refusing to plan: %w", TOMLInvalidCode, verr)
	}

	return &HostChangePlan{
		HostID:                 "codex",
		ConfigPath:             configPath,
		OriginalContent:        origContent,
		ProposedContent:        proposed,
		BackupPath:             backupPath,
		OriginalExists:         origExists,
		OriginalExistenceKnown: true,
	}, nil
}

func (a *CodexAdapter) ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error) {
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

func (a *CodexAdapter) VerifySetup(ctx context.Context) (*HostVerification, error) {
	configPath, err := a.DetectConfig(ctx, domain.ScopeUser)
	if err != nil {
		return &HostVerification{HostID: "codex", Status: "missing"}, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return &HostVerification{HostID: "codex", ConfigPath: configPath, Status: "missing"}, nil
	}

	content := string(data)
	registered := tomlBridgeRegistered(content, "[mcp_servers.litespm]")
	status := "missing"
	if registered {
		status = "ready"
	}

	return &HostVerification{
		HostID:     "codex",
		ConfigPath: configPath,
		Configured: configPath != "" && fileExists(configPath),
		Registered: registered,
		Status:     status,
	}, nil
}

func (a *CodexAdapter) DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error) {
	configPath, err := a.DetectConfig(ctx, domain.ScopeUser)
	if err != nil {
		return nil, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, nil
	}

	return parseTomlMcpComponents(string(data), configPath), nil
}

func parseTomlMcpComponents(content string, configPath string) []PreExistingComponent {
	var results []PreExistingComponent
	lines := strings.Split(content, "\n")
	var currentComp *PreExistingComponent

	flush := func() {
		if currentComp != nil && currentComp.Name != "" && currentComp.Name != litespmServerName && currentComp.Name != legacyServerName {
			results = append(results, *currentComp)
		}
		currentComp = nil
	}

	for _, l := range lines {
		header := tomlHeaderOf(l)
		if header != "" {
			flush()
			if strings.HasPrefix(header, "[mcp_servers.") && strings.HasSuffix(header, "]") {
				name := strings.TrimSuffix(strings.TrimPrefix(header, "[mcp_servers."), "]")
				if name != litespmServerName && name != legacyServerName {
					currentComp = &PreExistingComponent{
						Name:       name,
						Kind:       "mcp",
						ReadOnly:   true,
						SourcePath: configPath,
					}
				}
			}
			continue
		}
		trimmed := strings.TrimSpace(l)
		if strings.HasPrefix(trimmed, "#") {
			continue
		}

		if currentComp != nil {
			trimmed = stripTOMLComment(l)
			if strings.HasPrefix(trimmed, "command") && strings.Contains(trimmed, "=") {
				parts := strings.SplitN(trimmed, "=", 2)
				val := strings.TrimSpace(parts[1])
				val = strings.Trim(val, `"'`)
				currentComp.Command = val
			} else if strings.HasPrefix(trimmed, "args") && strings.Contains(trimmed, "=") {
				parts := strings.SplitN(trimmed, "=", 2)
				val := strings.TrimSpace(parts[1])
				if strings.HasPrefix(val, "[") && strings.HasSuffix(val, "]") {
					inner := strings.TrimSuffix(strings.TrimPrefix(val, "["), "]")
					items := strings.Split(inner, ",")
					for _, it := range items {
						it = strings.TrimSpace(it)
						it = strings.Trim(it, `"'`)
						if it != "" {
							currentComp.Args = append(currentComp.Args, it)
						}
					}
				}
			}
		}
	}
	flush()
	return results
}

func (a *CodexAdapter) RenderManualSetup(binaryPath string) string {
	cleanBin := filepath.ToSlash(binaryPath)
	return fmt.Sprintf(`# Add to ~/.codex/config.toml
[mcp_servers.litespm]
command = %s
args = ["bridge", "stdio", "--host", "codex"]
`, tomlQuoteStringLossy(cleanBin))
}
