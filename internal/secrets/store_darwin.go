//go:build darwin

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
// tests. keyringRead returning ("", nil) means the Keychain answered and
// holds no key; any non-nil error means the read failed (missing CLI, locked
// or denied Keychain) and the caller must abort rather than mint a
// replacement — a replacement would silently make every stored secret
// undecryptable.
var (
	keyringRead  = darwinKeyringRead
	keyringWrite = darwinKeyringWrite
)

// darwinKeyringRead reads the master key from the login Keychain.
//
// `security find-generic-password` exits 44 when the item does not exist
// (errSecItemNotFound = -25300 truncated to the process exit status of
// 8 bits) and a different status — a locked Keychain, a denied prompt, a
// missing login keychain — when the read failed. 44 therefore means "no key
// stored", never "could not read".
func darwinKeyringRead() (string, error) {
	if _, err := exec.LookPath("/usr/bin/security"); err != nil {
		return "", fmt.Errorf("macOS security CLI not found: %w", err)
	}

	cmd := exec.Command("/usr/bin/security", "find-generic-password", "-s", "litespm", "-a", "master-key", "-w")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && exitErr.ExitCode() == 44 {
			return "", nil // errSecItemNotFound: no key stored
		}
		return "", fmt.Errorf("security find-generic-password failed: %w (stderr: %s)", err, strings.TrimSpace(stderr.String()))
	}
	return string(out), nil
}

func darwinKeyringWrite(hexKey string) error {
	// E5: never pass the key as an argv word (visible in `ps`). Like the
	// Linux backend, pipe it on stdin: `security ... -w` with no value reads
	// the password from stdin.
	cmd := exec.Command("/usr/bin/security", "add-generic-password", "-U", "-s", "litespm", "-a", "master-key", "-w")
	cmd.Stdin = strings.NewReader(hexKey)
	return cmd.Run()
}

func getOrGenerateDarwinMasterKey() ([]byte, error) {
	stored, err := keyringRead()
	if err != nil {
		return nil, domain.ErrAuthVaultUnavailable(fmt.Sprintf("failed to read vault master key from the Keychain: %v", err))
	}

	if stored = strings.TrimSpace(stored); stored != "" {
		key, decodeErr := hex.DecodeString(stored)
		if decodeErr != nil || len(key) != 32 {
			return nil, domain.ErrAuthVaultUnavailable("stored vault master key is corrupt or not 32 bytes; refusing to replace it")
		}
		return key, nil
	}

	// The Keychain is reachable and holds no key: this is the only path that
	// may mint one.
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("failed to generate random vault key: %w", err)
	}

	if err := keyringWrite(hex.EncodeToString(key)); err != nil {
		return nil, domain.ErrAuthVaultUnavailable(fmt.Sprintf("failed to store vault master key in macOS Keychain: %v", err))
	}

	return key, nil
}

func newPlatformSecretStore() (SecretStore, error) {
	vaultPath := DefaultVaultPath()
	key, err := getOrGenerateDarwinMasterKey()
	if err != nil {
		return nil, err
	}
	return NewFileEncryptedSecretStoreWithKey(vaultPath, key)
}
