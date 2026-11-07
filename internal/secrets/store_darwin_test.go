//go:build darwin

package secrets

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

// keyringStub records what the mint path did while a test owns the seams.
type keyringStub struct {
	read   func() (string, error)
	minted bool
	stored string
}

// stubKeyring replaces keyringRead/keyringWrite for one test and restores the
// real implementations afterwards. The real read shells out to /usr/bin/security,
// so the stub also keeps these tests independent of the host's Keychain.
func stubKeyring(t *testing.T, read func() (string, error)) *keyringStub {
	t.Helper()
	stub := &keyringStub{read: read}
	prevRead, prevWrite := keyringRead, keyringWrite
	t.Cleanup(func() { keyringRead, keyringWrite = prevRead, prevWrite })
	keyringRead = stub.read
	keyringWrite = func(hexKey string) error {
		stub.minted = true
		stub.stored = hexKey
		return nil
	}
	return stub
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
// locked or denied Keychain is a FAILED READ, not "no key yet". The old
// behaviour minted and stored a replacement, permanently orphaning every
// secret already encrypted under the previous key.
func TestKeyringReadFailureMintsNoReplacementKey(t *testing.T) {
	stub := stubKeyring(t, func() (string, error) {
		return "", errors.New("keychain is locked")
	})

	_, err := getOrGenerateDarwinMasterKey()
	wantVaultUnavailable(t, err, "keychain read failure")
	if stub.minted {
		t.Fatal("a failed keychain read minted and stored a replacement master key")
	}
}

func TestKeyringEmptyReadMintsKey(t *testing.T) {
	stub := stubKeyring(t, func() (string, error) { return "", nil })

	key, err := getOrGenerateDarwinMasterKey()
	if err != nil {
		t.Fatalf("minting the first key failed: %v", err)
	}
	if len(key) != 32 {
		t.Fatalf("minted key has %d bytes, want 32", len(key))
	}
	if !stub.minted {
		t.Fatal("an empty but successful read did not store the minted key")
	}
	if stub.stored != hex.EncodeToString(key) {
		t.Fatal("the stored key does not match the returned key")
	}
}

func TestKeyringValidStoredValueIsUsed(t *testing.T) {
	want := make([]byte, 32)
	if _, err := rand.Read(want); err != nil {
		t.Fatalf("generating test key: %v", err)
	}
	stub := stubKeyring(t, func() (string, error) { return hex.EncodeToString(want), nil })

	key, err := getOrGenerateDarwinMasterKey()
	if err != nil {
		t.Fatalf("reading the stored key failed: %v", err)
	}
	if !bytes.Equal(key, want) {
		t.Fatal("the stored master key was not returned")
	}
	if stub.minted {
		t.Fatal("an existing master key was replaced")
	}
}

func TestKeyringCorruptStoredValueIsNotReplaced(t *testing.T) {
	stub := stubKeyring(t, func() (string, error) { return "not-a-hex-key", nil })

	_, err := getOrGenerateDarwinMasterKey()
	wantVaultUnavailable(t, err, "corrupt stored key")
	if stub.minted {
		t.Fatal("a corrupt stored key was silently replaced")
	}
}
