package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveHomeDirPrefersEnvironment(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)
	if got := ResolveHomeDir(); got != dir {
		t.Fatalf("ResolveHomeDir = %q, want %q", got, dir)
	}
}

func TestAdoptAccountRootPreservesExistingState(t *testing.T) {
	base := t.TempDir()
	resolved := filepath.Join(base, "env-home", ".local", "share", "litespm")
	account := filepath.Join(base, "account-home", ".local", "share", "litespm")
	if err := os.MkdirAll(account, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("LITESPM_DATA_ROOT", "")
	t.Setenv("LITEPSM_DATA_ROOT", "")
	if got := adoptAccountRoot(resolved, account, "LITESPM_DATA_ROOT", "LITEPSM_DATA_ROOT"); got != account {
		t.Fatalf("existing account root not adopted: got %q want %q", got, account)
	}

	// An explicit override still wins, even when the account root exists.
	t.Setenv("LITESPM_DATA_ROOT", resolved)
	if got := adoptAccountRoot(resolved, account, "LITESPM_DATA_ROOT", "LITEPSM_DATA_ROOT"); got != resolved {
		t.Fatalf("explicit override lost: got %q want %q", got, resolved)
	}
}
