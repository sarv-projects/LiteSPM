package host

import (
	"github.com/sarv-projects/litespm/internal/config"
)

// resolveHomeDir returns the current user's home directory.
//
// Environment overrides are honored first so that configuration discovery
// matches the documented user-scope paths (%USERPROFILE% on Windows, $HOME on
// Unix) and can be redirected safely in sandboxed or test environments. The
// platform user lookup is only used as a fallback when no override is present.
func resolveHomeDir() string {
	return config.ResolveHomeDir()
}
