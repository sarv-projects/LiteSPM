package secrets

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/fslock"
)

type vaultDiskEntry struct {
	EncryptedData []byte         `json:"encrypted_data"`
	Nonce         []byte         `json:"nonce"`
	Metadata      SecretMetadata `json:"metadata"`
}

type serializedVault struct {
	Version int                       `json:"version"`
	Entries map[string]vaultDiskEntry `json:"entries"`
}

// FileEncryptedSecretStore provides a persistent encrypted secret vault on disk using AES-256-GCM.
type FileEncryptedSecretStore struct {
	vaultPath string
	key       []byte
	gcm       cipher.AEAD
	entries   map[string]vaultDiskEntry
	mu        sync.RWMutex
}

// NewFileEncryptedSecretStoreWithKey initializes or loads a persistent AES-256-GCM encrypted vault with an explicit 32-byte key.
func NewFileEncryptedSecretStoreWithKey(vaultPath string, key []byte) (*FileEncryptedSecretStore, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("encryption key must be exactly 32 bytes, got %d", len(key))
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("cipher init error: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("gcm init error: %w", err)
	}

	store := &FileEncryptedSecretStore{
		vaultPath: vaultPath,
		key:       key,
		gcm:       gcm,
		entries:   make(map[string]vaultDiskEntry),
	}

	if err := store.load(); err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("failed to load encrypted vault: %w", err)
	}
	return store, nil
}

// DefaultVaultPath returns the platform-standard location of the encrypted secrets vault.
func DefaultVaultPath() string {
	if runtime.GOOS == "windows" {
		if appData := os.Getenv("LOCALAPPDATA"); appData != "" {
			return filepath.Join(appData, "LiteSPM", "secrets", "vault.enc")
		}
	} else if runtime.GOOS == "darwin" {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, "Library", "Application Support", "LiteSPM", "secrets", "vault.enc")
		}
	}

	if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
		return filepath.Join(xdg, "litespm", "secrets", "vault.enc")
	}
	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Join(home, ".local", "share", "litespm", "secrets", "vault.enc")
	}
	return filepath.Join(".", "secrets", "vault.enc")
}

// readEntries reads and decodes the vault file. The returned map is never nil.
func (s *FileEncryptedSecretStore) readEntries() (map[string]vaultDiskEntry, error) {
	data, err := os.ReadFile(s.vaultPath)
	if err != nil {
		return nil, err
	}

	var vault serializedVault
	if err := json.Unmarshal(data, &vault); err != nil {
		return nil, err
	}
	if vault.Entries == nil {
		vault.Entries = make(map[string]vaultDiskEntry)
	}
	return vault.Entries, nil
}

func (s *FileEncryptedSecretStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	entries, err := s.readEntries()
	if err != nil {
		return err
	}
	s.entries = entries
	return nil
}

// vaultLockTimeout bounds how long one mutation waits for another process
// that holds the vault lock.
const vaultLockTimeout = 10 * time.Second

// mutate runs one read-modify-write cycle against the vault file.
//
// The in-process mutex only orders callers of this store; the file lock in
// internal/fslock orders every process that opens the same vault (the CLI,
// the daemon, a script). The vault is re-read UNDER that lock and fn mutates
// that fresh map, so a store that loaded its snapshot before another process
// added or deleted an entry merges its change into the current file instead
// of stamping the stale snapshot over it — which is how a logout (Delete)
// used to be undone by any concurrent writer, and how a concurrent add used
// to be silently dropped.
func (s *FileEncryptedSecretStore) mutate(fn func(entries map[string]vaultDiskEntry) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	lock, err := fslock.Acquire(s.vaultPath+".lock", fslock.Options{Timeout: vaultLockTimeout})
	if err != nil {
		return fmt.Errorf("failed to lock vault %s: %w", s.vaultPath, err)
	}
	defer func() { _ = lock.Release() }()

	entries, err := s.readEntries()
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to read encrypted vault: %w", err)
	}
	if entries == nil {
		entries = make(map[string]vaultDiskEntry)
	}
	if err := fn(entries); err != nil {
		return err
	}
	if err := s.persist(entries); err != nil {
		return fmt.Errorf("failed to persist encrypted vault: %w", err)
	}
	s.entries = entries
	return nil
}

func (s *FileEncryptedSecretStore) persist(entries map[string]vaultDiskEntry) error {
	dir := filepath.Dir(s.vaultPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}

	vault := serializedVault{
		Version: 1,
		Entries: entries,
	}

	data, err := json.MarshalIndent(vault, "", "  ")
	if err != nil {
		return err
	}

	tmpFile := s.vaultPath + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0600); err != nil {
		return err
	}
	if err := os.Chmod(tmpFile, 0600); err != nil {
		_ = os.Remove(tmpFile)
		return err
	}
	if err := os.Rename(tmpFile, s.vaultPath); err != nil {
		_ = os.Remove(tmpFile)
		return err
	}
	return os.Chmod(s.vaultPath, 0600)
}

func (s *FileEncryptedSecretStore) Put(ctx context.Context, namespace, key string, secretBytes []byte) (*SecretRef, error) {
	ref := NewSecretRef(namespace, key)
	nonce := make([]byte, s.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := s.gcm.Seal(nil, nonce, secretBytes, []byte(ref.URI))
	now := time.Now().UTC()

	err := s.mutate(func(entries map[string]vaultDiskEntry) error {
		createdAt := now
		if existing, ok := entries[ref.URI]; ok {
			createdAt = existing.Metadata.CreatedAt
		}

		entries[ref.URI] = vaultDiskEntry{
			EncryptedData: ciphertext,
			Nonce:         nonce,
			Metadata: SecretMetadata{
				URI:       ref.URI,
				Namespace: namespace,
				Key:       key,
				CreatedAt: createdAt,
				UpdatedAt: now,
			},
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return ref, nil
}

func (s *FileEncryptedSecretStore) Get(ctx context.Context, ref SecretRef) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entry, ok := s.entries[ref.URI]
	if !ok {
		return nil, domain.ErrNotFound("secret", ref.URI)
	}

	plaintext, err := s.gcm.Open(nil, entry.Nonce, entry.EncryptedData, []byte(ref.URI))
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt secret %s: %w", ref.URI, err)
	}

	return plaintext, nil
}

func (s *FileEncryptedSecretStore) Delete(ctx context.Context, ref SecretRef) error {
	return s.mutate(func(entries map[string]vaultDiskEntry) error {
		if _, ok := entries[ref.URI]; !ok {
			return domain.ErrNotFound("secret", ref.URI)
		}
		delete(entries, ref.URI)
		return nil
	})
}

func (s *FileEncryptedSecretStore) Exists(ctx context.Context, ref SecretRef) (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	_, ok := s.entries[ref.URI]
	return ok, nil
}

func (s *FileEncryptedSecretStore) ListMetadata(ctx context.Context, namespace string) ([]SecretMetadata, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []SecretMetadata
	for _, entry := range s.entries {
		if namespace == "" || entry.Metadata.Namespace == namespace {
			result = append(result, entry.Metadata)
		}
	}
	return result, nil
}

func (s *FileEncryptedSecretStore) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.key {
		s.key[i] = 0
	}
	s.entries = make(map[string]vaultDiskEntry)
	return nil
}
