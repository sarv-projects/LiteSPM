package secrets

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// SecretRef identifies a sensitive credential stored in an OS vault.
type SecretRef struct {
	URI       string `json:"uri"`       // Format: "secret:<namespace>/<key>"
	Namespace string `json:"namespace"` // e.g. "mcp:provider", "oauth"
	Key       string `json:"key"`       // e.g. "github_token"
}

// ParseSecretRef parses a canonical secret URI into a SecretRef.
func ParseSecretRef(uri string) (*SecretRef, error) {
	if !strings.HasPrefix(uri, "secret:") {
		return nil, fmt.Errorf("invalid secret URI %q: must start with 'secret:'", uri)
	}

	rest := strings.TrimPrefix(uri, "secret:")
	parts := strings.SplitN(rest, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil, fmt.Errorf("invalid secret URI %q: expected 'secret:<namespace>/<key>'", uri)
	}

	return &SecretRef{
		URI:       uri,
		Namespace: parts[0],
		Key:       parts[1],
	}, nil
}

// NewSecretRef creates a SecretRef from namespace and key.
func NewSecretRef(namespace, key string) *SecretRef {
	return &SecretRef{
		URI:       fmt.Sprintf("secret:%s/%s", namespace, key),
		Namespace: namespace,
		Key:       key,
	}
}

// SecretMetadata provides non-sensitive metadata for a stored secret.
type SecretMetadata struct {
	URI       string    `json:"uri"`
	Namespace string    `json:"namespace"`
	Key       string    `json:"key"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// SecretStore defines the contract for secure OS credential storage.
type SecretStore interface {
	Put(ctx context.Context, namespace, key string, secretBytes []byte) (*SecretRef, error)
	Get(ctx context.Context, ref SecretRef) ([]byte, error)
	Delete(ctx context.Context, ref SecretRef) error
	Exists(ctx context.Context, ref SecretRef) (bool, error)
	ListMetadata(ctx context.Context, namespace string) ([]SecretMetadata, error)
	Close() error
}

var validEnvNameRegex = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// dangerousEnvVars are the environment variables a launched child must not
// inherit or be handed.
//
// The first group changes how a dynamic loader finds code: LD_PRELOAD makes
// the process load a library the user did not name, and the DYLD_ pair is its
// macOS spelling. The second group changes how an INTERPRETER finds code:
// NODE_OPTIONS=--require executes a file before the entry point, and
// PYTHONSTARTUP/PYTHONPATH/RUBYOPT/PERL5OPT do the same for their runtimes.
// The third group changes what git runs: GIT_SSH_COMMAND is an arbitrary
// command, and a global gitconfig's insteadOf rule can redirect a clone
// anywhere.
//
// The list is not a complete sandbox — a capability is not an OS isolation
// tier (ARCH/05 is explicit about that). It is the set of variables that
// turn "a manifest names an environment variable" into "a manifest runs
// code", which the two-phase approval and the policy gate are there to
// refuse.
var dangerousEnvVars = map[string]bool{
	// Loader injection.
	"LD_PRELOAD":            true,
	"LD_LIBRARY_PATH":       true,
	"LD_AUDIT":              true,
	"DYLD_INSERT_LIBRARIES": true,
	"DYLD_LIBRARY_PATH":     true,
	"DYLD_FRAMEWORK_PATH":   true,
	// Interpreter injection.
	"NODE_OPTIONS":              true,
	"NODE_REPL_EXTERNAL_MODULE": true,
	"PYTHONSTARTUP":             true,
	"PYTHONPATH":                true,
	"PYTHONHOME":                true,
	"PERL5OPT":                  true,
	"PERL5LIB":                  true,
	"RUBYOPT":                   true,
	"RUBYLIB":                   true,
	"JAVA_TOOL_OPTIONS":         true,
	"_JAVA_OPTIONS":             true,
	"BASH_ENV":                  true,
	"ENV":                       true,
	// Command and path rewriting.
	"GIT_SSH_COMMAND":   true,
	"GIT_CONFIG_GLOBAL": true,
	"GIT_CONFIG_SYSTEM": true,
	// Shell and path basics.
	"PATH": true,
	"IFS":  true,
}

// ResolveLaunchSecrets resolves a map of environment variables to secret URIs into plaintext values.
func ResolveLaunchSecrets(ctx context.Context, store SecretStore, secretRefs map[string]string) (map[string]string, error) {
	if len(secretRefs) == 0 {
		return nil, nil
	}

	resolved := make(map[string]string, len(secretRefs))
	for envVar, uri := range secretRefs {
		if !validEnvNameRegex.MatchString(envVar) {
			return nil, fmt.Errorf("invalid environment variable name %q", envVar)
		}
		if dangerousEnvVars[strings.ToUpper(envVar)] {
			return nil, fmt.Errorf("dangerous environment variable %q cannot be injected from manifest", envVar)
		}

		ref, err := ParseSecretRef(uri)
		if err != nil {
			return nil, fmt.Errorf("invalid secret ref for %s: %w", envVar, err)
		}

		secretBytes, err := store.Get(ctx, *ref)
		if err != nil {
			return nil, fmt.Errorf("failed to retrieve secret for %s (%s): %w", envVar, uri, err)
		}

		resolved[envVar] = string(secretBytes)
	}

	return resolved, nil
}
