package config

import (
	"os"
	"os/user"
	"runtime"
)

// ResolveHomeDir returns the home directory used for user-facing configuration
// and skill trees. Environment overrides win so containers and CI can redirect
// a machine into a sandbox; the platform account home is only a fallback.
// This is the single source of truth shared with internal/host.
func ResolveHomeDir() string {
	if runtime.GOOS == "windows" {
		if h := os.Getenv("USERPROFILE"); h != "" {
			return h
		}
	}
	if h := os.Getenv("HOME"); h != "" {
		return h
	}
	if h := os.Getenv("USERPROFILE"); h != "" {
		return h
	}
	if usr, err := user.Current(); err == nil && usr != nil {
		return usr.HomeDir
	}
	return ""
}

// AccountHomeDir returns the platform account home even when an environment
// override is set. It is used only to keep an existing installation's state
// where it was created; new installs follow ResolveHomeDir.
func AccountHomeDir() string {
	if usr, err := user.Current(); err == nil && usr != nil && usr.HomeDir != "" {
		return usr.HomeDir
	}
	return os.Getenv("USERPROFILE")
}
