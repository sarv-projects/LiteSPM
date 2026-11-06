package secrets

import (
	"context"
	"crypto/rand"
	"path/filepath"
	"sync"
	"testing"
)

// freshVaultKey returns 32 random bytes for an isolated test vault.
func freshVaultKey(t *testing.T) []byte {
	t.Helper()
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("generating vault master key: %v", err)
	}
	return key
}

func openTestVault(t *testing.T, vaultPath string, key []byte) *FileEncryptedSecretStore {
	t.Helper()
	store, err := NewFileEncryptedSecretStoreWithKey(vaultPath, key)
	if err != nil {
		t.Fatalf("opening vault %s: %v", vaultPath, err)
	}
	return store
}

// TestVaultConcurrentDeleteSurvivesAdd pins the audit finding that the vault
// had no cross-process locking and wrote whole-file snapshots: a process that
// loaded the vault before a logout finished could persist its stale snapshot
// and resurrect the revoked credential, while a concurrent add racing the
// same overwrite could vanish.
//
// Two stores are opened over one vault file, as two LiteSPM processes would
// share ~/.local/share/litespm/secrets/vault.enc. A start barrier releases a
// Delete and a Put into the same instant; the assertions then read the file
// through a third, freshly opened store, so only durable file state counts.
//
// This reproduces the defect deterministically rather than racily: the
// adder's in-memory snapshot always contains the victim and the deleter's
// snapshot never contains the new credential, so with whole-file writes no
// possible final file can both drop the victim and keep the new credential —
// whichever writer lands last loses the other's update. No injected hook is
// needed to park a writer.
func TestVaultConcurrentDeleteSurvivesAdd(t *testing.T) {
	ctx := context.Background()
	vaultPath := filepath.Join(t.TempDir(), "vault.enc")
	key := freshVaultKey(t)

	seed := openTestVault(t, vaultPath, key)
	victim, err := seed.Put(ctx, "audit", "victim", []byte("revoked-credential"))
	if err != nil {
		t.Fatalf("seeding victim credential: %v", err)
	}
	if err := seed.Close(); err != nil {
		t.Fatalf("closing seed store: %v", err)
	}

	// Both stores load the vault before either mutates it: each holds the
	// snapshot a real process would have taken at startup.
	deleter := openTestVault(t, vaultPath, key)
	adder := openTestVault(t, vaultPath, key)
	t.Cleanup(func() { _ = deleter.Close(); _ = adder.Close() })

	start := make(chan struct{})
	var wg sync.WaitGroup
	var deleteErr, putErr error
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		deleteErr = deleter.Delete(ctx, *victim)
	}()
	go func() {
		defer wg.Done()
		<-start
		_, putErr = adder.Put(ctx, "audit", "fresh", []byte("kept"))
	}()
	close(start)
	wg.Wait()

	if deleteErr != nil {
		t.Fatalf("Delete(victim) failed: %v", deleteErr)
	}
	if putErr != nil {
		t.Fatalf("Put(fresh) failed: %v", putErr)
	}

	freshRef := NewSecretRef("audit", "fresh")
	check := openTestVault(t, vaultPath, key)
	defer check.Close()

	exists, err := check.Exists(ctx, *victim)
	if err != nil {
		t.Fatalf("Exists(victim): %v", err)
	}
	if exists {
		t.Fatal("revocation was undone: the deleted credential is back in the vault file")
	}
	exists, err = check.Exists(ctx, *freshRef)
	if err != nil {
		t.Fatalf("Exists(fresh): %v", err)
	}
	if !exists {
		t.Fatal("concurrent add was lost: the new credential is not in the vault file")
	}
	got, err := check.Get(ctx, *freshRef)
	if err != nil {
		t.Fatalf("Get(fresh): %v", err)
	}
	if string(got) != "kept" {
		t.Fatalf("fresh credential value = %q, want %q", got, "kept")
	}
}

// TestVaultStaleSnapshotDoesNotResurrectDeletedSecret covers the same defect
// without any concurrency: a store that loaded the vault before a deletion
// must merge into the current file when it next writes, not persist the
// snapshot it holds. The concurrent test above can in principle be satisfied
// by serialization alone; this one pins the re-read-and-merge half on its own.
func TestVaultStaleSnapshotDoesNotResurrectDeletedSecret(t *testing.T) {
	ctx := context.Background()
	vaultPath := filepath.Join(t.TempDir(), "vault.enc")
	key := freshVaultKey(t)

	seed := openTestVault(t, vaultPath, key)
	victim, err := seed.Put(ctx, "audit", "victim", []byte("revoked-credential"))
	if err != nil {
		t.Fatalf("seeding victim credential: %v", err)
	}
	if err := seed.Close(); err != nil {
		t.Fatalf("closing seed store: %v", err)
	}

	staleWriter := openTestVault(t, vaultPath, key) // its snapshot holds the victim
	defer staleWriter.Close()
	logout := openTestVault(t, vaultPath, key) // the other process
	defer logout.Close()

	if err := logout.Delete(ctx, *victim); err != nil {
		t.Fatalf("Delete(victim): %v", err)
	}
	freshRef, err := staleWriter.Put(ctx, "audit", "fresh", []byte("kept"))
	if err != nil {
		t.Fatalf("Put(fresh) from stale writer: %v", err)
	}

	check := openTestVault(t, vaultPath, key)
	defer check.Close()
	exists, err := check.Exists(ctx, *victim)
	if err != nil {
		t.Fatalf("Exists(victim): %v", err)
	}
	if exists {
		t.Fatal("stale snapshot resurrected the deleted credential")
	}
	exists, err = check.Exists(ctx, *freshRef)
	if err != nil {
		t.Fatalf("Exists(fresh): %v", err)
	}
	if !exists {
		t.Fatal("the add that followed the deletion was lost")
	}
}
