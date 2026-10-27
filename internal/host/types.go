package host

import (
	"context"
	"fmt"
	"strings"

	"github.com/sarv-projects/litespm/internal/domain"
)

// HostDescriptor encapsulates metadata about a supported agent host.
type HostDescriptor struct {
	HostID                 string   `json:"hostId"`
	DisplayName            string   `json:"displayName"`
	SupportedVersions      []string `json:"supportedVersions"`
	DefaultConfigFileName  string   `json:"defaultConfigFileName"`
	ConfigFormat           string   `json:"configFormat"` // json | toml
	SupportsFormElicit     bool     `json:"supportsFormElicit"`
	RequiresBootstrapSkill bool     `json:"requiresBootstrapSkill"`
	SlashCommandTrigger    string   `json:"slashCommandTrigger,omitempty"`
}

// PreExistingComponent represents a native capability detected in host configuration (read-only).
type PreExistingComponent struct {
	Name        string   `json:"name"`
	Kind        string   `json:"kind"` // mcp | skill
	Command     string   `json:"command,omitempty"`
	Args        []string `json:"args,omitempty"`
	ReadOnly    bool     `json:"readOnly"` // Always true by default
	SourcePath  string   `json:"sourcePath"`
	Description string   `json:"description,omitempty"`
}

// HostChangePlan describes proposed changes to host configuration.
type HostChangePlan struct {
	HostID          string `json:"hostId"`
	ConfigPath      string `json:"configPath"`
	OriginalContent string `json:"originalContent"`
	ProposedContent string `json:"proposedContent"`
	BackupPath      string `json:"backupPath"`
}

// HostApplyResult captures the result of applying configuration changes.
type HostApplyResult struct {
	HostID     string `json:"hostId"`
	ConfigPath string `json:"configPath"`
	BackupPath string `json:"backupPath"`
	Success    bool   `json:"success"`
}

// HostVerification describes whether LiteSPM is properly registered with the host.
type HostVerification struct {
	HostID     string `json:"hostId"`
	ConfigPath string `json:"configPath"`
	Registered bool   `json:"registered"`
	Status     string `json:"status"` // ready | missing | corrupted
}

// HostAdapter defines the contract for interacting with an agent host environment.
type HostAdapter interface {
	Descriptor() HostDescriptor
	DetectConfig(ctx context.Context, scope domain.InstallScope) (string, error)
	PlanSetup(ctx context.Context, binaryPath string, backupDir string) (*HostChangePlan, error)
	ApplySetup(ctx context.Context, plan *HostChangePlan) (*HostApplyResult, error)
	VerifySetup(ctx context.Context) (*HostVerification, error)
	DetectPreExistingComponents(ctx context.Context) ([]PreExistingComponent, error)
	RenderManualSetup(binaryPath string) string
}

// PathPlanner is the optional half of the adapter contract for planning a
// bridge setup against a caller-supplied config path instead of the path
// DetectConfig would choose.
//
// It is deliberately separate from HostAdapter: the interface above stays
// unchanged for every existing caller and implementation, and a caller that
// needs an explicit path asks for this capability by name through PlanSetupAt
// rather than assuming every adapter can honour one.
type PathPlanner interface {
	PlanSetupAt(ctx context.Context, binaryPath string, backupDir string, configPath string) (*HostChangePlan, error)
}

// PlanSetupAt plans a setup for an explicit config path and returns a plan
// whose ConfigPath is exactly the path the caller named. When an adapter
// cannot plan at that path, it returns an error naming the file the adapter
// would use instead — and writes nothing. It never silently redirects the
// write to a file the caller did not choose: that is the one failure mode an
// installer into someone else's configuration must not have.
func PlanSetupAt(ctx context.Context, adapter HostAdapter, binaryPath, backupDir, configPath string) (*HostChangePlan, error) {
	if adapter == nil {
		return nil, fmt.Errorf("no host adapter was given, so no setup can be planned")
	}
	if strings.TrimSpace(configPath) == "" {
		return nil, fmt.Errorf("no configuration path was given, so no setup can be planned")
	}
	planner, ok := adapter.(PathPlanner)
	if !ok {
		fallback, err := adapter.DetectConfig(ctx, domain.ScopeUser)
		if err != nil || strings.TrimSpace(fallback) == "" {
			fallback = "(this adapter reports no configuration path)"
		}
		return nil, fmt.Errorf(
			"adapter %q cannot write to a path chosen by hand; it can only use %s. Nothing was written",
			adapter.Descriptor().HostID, fallback)
	}
	plan, err := planner.PlanSetupAt(ctx, binaryPath, backupDir, configPath)
	if err != nil {
		return nil, err
	}
	if plan == nil {
		return nil, fmt.Errorf("adapter %q returned no plan for %s, refusing to write", adapter.Descriptor().HostID, configPath)
	}
	if plan.ConfigPath != configPath {
		return nil, fmt.Errorf("adapter %q planned a write to %s, but %s was chosen; refusing to write anywhere else",
			adapter.Descriptor().HostID, plan.ConfigPath, configPath)
	}
	return plan, nil
}
