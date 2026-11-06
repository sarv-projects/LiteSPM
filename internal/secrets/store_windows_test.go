//go:build windows

package secrets

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

func stubReadMasterKeyFile(t *testing.T, read func(string) ([]byte, error)) {
	t.Helper()
	prev := readMasterKeyFile
	t.Cleanup(func() { readMasterKeyFile = prev })
	readMasterKeyFile = read
}

func wantVaultUnavailable(t *testing.T, err error, what string) {
	t.Helper()
	if err == nil {
		t.Fatalf("%s: expected an error", what)
	}
	if got := domain.ErrorCode(err); got != domain.CodeAuthVaultUnavailable {
		t.Fatalf("%s: error code = %q, want %q (err: %v)", what, got, domain.CodeAuthVaultUnavailable, err)
	}
}

// TestKeyringReadFailureMintsNoReplacementKey pins the audit finding: a
// locked or unreadable master-key file is a FAILED READ, not "no key yet".
// The old behaviour minted and stored a replacement, permanently orphaning
// every secret already encrypted under the previous key.
func TestKeyringReadFailureMintsNoReplacementKey(t *testing.T) {
	dir := t.TempDir()
	vaultPath := filepath.Join(dir, "secrets", "vault.enc")
	keyFile := filepath.Join(dir, "secrets", "master.key")

	stubReadMasterKeyFile(t, func(string) ([]byte, error) {
		return nil, errors.New("the process cannot access the file because it is being used by another process")
	})

	_, err := getOrGenerateWindowsMasterKey(vaultPath)
	wantVaultUnavailable(t, err, "key file read failure")
	if _, statErr := os.Stat(keyFile); !os.IsNotExist(statErr) {
		t.Fatalf("a failed key file read replaced the master key (stat: %v)", statErr)
	}
}

func TestKeyringEmptyExistingFileIsNotReplaced(t *testing.T) {
	dir := t.TempDir()
	vaultPath := filepath.Join(dir, "secrets", "vault.enc")
	keyFile := filepath.Join(dir, "secrets", "master.key")

	stubReadMasterKeyFile(t, func(string) ([]byte, error) { return []byte{}, nil })

	_, err := getOrGenerateWindowsMasterKey(vaultPath)
	wantVaultUnavailable(t, err, "empty key file")
	if _, statErr := os.Stat(keyFile); !os.IsNotExist(statErr) {
		t.Fatalf("an empty key file was replaced (stat: %v)", statErr)
	}
}

// TestKeyringMissingFileMintsAndStoresKey is the one allowed rotation: no
// key file at all means "first run", so mint and persist, and the DPAPI blob
// written must decrypt back to the same key.
func TestKeyringMissingFileMintsAndStoresKey(t *testing.T) {
	dir := t.TempDir()
	vaultPath := filepath.Join(dir, "secrets", "vault.enc")
	keyFile := filepath.Join(dir, "secrets", "master.key")

	stubReadMasterKeyFile(t, func(string) ([]byte, error) { return nil, os.ErrNotExist })

	key, err := getOrGenerateWindowsMasterKey(vaultPath)
	if err != nil {
		t.Fatalf("minting the first key failed: %v", err)
	}
	if len(key) != 32 {
		t.Fatalf("minted key has %d bytes, want 32", len(key))
	}
	if _, err := os.Stat(keyFile); err != nil {
		t.Fatalf("minted key was not stored: %v", err)
	}

	// Read it back through the real DPAPI path: the stored blob must decrypt
	// to the same key, not a fresh one.
	stubReadMasterKeyFile(t, os.ReadFile)
	stored, err := getOrGenerateWindowsMasterKey(vaultPath)
	if err != nil {
		t.Fatalf("reading the minted key back failed: %v", err)
	}
	if !bytes.Equal(stored, key) {
		t.Fatal("the stored DPAPI blob did not decrypt to the minted key")
	}
}
