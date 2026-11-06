//go:build linux

package secrets

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os/exec"
	"strings"

	"github.com/sarv-projects/litespm/internal/domain"
)

// keyringRead and keyringWrite are the two keyring operations, swapped in
// tests. keyringRead returning ("", nil) means the keyring answered and holds
// no key; any non-nil error means the read failed (missing tool, locked
// keyring, D-Bus failure) and the caller must abort rather than mint a
// replacement — a replacement would silently make every stored secret
// undecryptable.
var (
	keyringRead  = linuxKeyringRead
	keyringWrite = linuxKeyringWrite
)

// linuxKeyringRead looks the master key up in the FreeDesktop Secret Service.
//
// secret-tool is deliberately ambiguous between "no such item" and "the
// service could not be reached": both exit 1. It prints the underlying error
// to stderr when a GError occurs, and prints nothing on a miss (see
// secret-tool.c, secret_tool_action_lookup: `if (value == NULL) return 1;`),
// so exit status 1 with empty stderr is a miss and anything else is a failed
// read. Exit status 1 with stderr output is the D-Bus/locked-keyring case.
func linuxKeyringRead() (string, error) {
	if _, err := exec.LookPath("secret-tool"); err != nil {
		return "", fmt.Errorf("FreeDesktop Secret Service (secret-tool) not available in PATH: %w", err)
	}

	cmd := exec.Command("secret-tool", "lookup", "service", "litespm", "account", "master-key")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && exitErr.ExitCode() == 1 && stderr.Len() == 0 {
			return "", nil // no item stored: the keyring was reachable
		}
		return "", fmt.Errorf("secret-tool lookup failed: %w (stderr: %s)", err, strings.TrimSpace(stderr.String()))
	}
	return string(out), nil
}

func linuxKeyringWrite(hexKey string) error {
	cmd := exec.Command("secret-tool", "store", "--label=LiteSPM Vault Key", "service", "litespm", "account", "master-key")
	cmd.Stdin = strings.NewReader(hexKey)
	return cmd.Run()
}

func getOrGenerateLinuxMasterKey() ([]byte, error) {
	stored, err := keyringRead()
	if err != nil {
		return nil, domain.ErrAuthVaultUnavailable(fmt.Sprintf("failed to read vault master key from the keyring: %v", err))
	}

	if stored = strings.TrimSpace(stored); stored != "" {
		key, decodeErr := hex.DecodeString(stored)
		if decodeErr != nil || len(key) != 32 {
			return nil, domain.ErrAuthVaultUnavailable("stored vault master key is corrupt or not 32 bytes; refusing to replace it")
		}
		return key, nil
	}

	// The keyring is reachable and holds no key: this is the only path that
	// may mint one.
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("failed to generate random vault key: %w", err)
	}

	if err := keyringWrite(hex.EncodeToString(key)); err != nil {
		return nil, domain.ErrAuthVaultUnavailable(fmt.Sprintf("failed to store vault master key via secret-tool: %v", err))
	}

	return key, nil
}

func newPlatformSecretStore() (SecretStore, error) {
	vaultPath := DefaultVaultPath()
	key, err := getOrGenerateLinuxMasterKey()
	if err != nil {
		return nil, err
	}
	return NewFileEncryptedSecretStoreWithKey(vaultPath, key)
}
