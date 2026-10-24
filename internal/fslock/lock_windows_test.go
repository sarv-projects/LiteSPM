//go:build windows

package fslock

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Windows readers can temporarily deny deletion even after stale ownership
// has been established. That is contention, not a failed installation.
func TestStaleRecoveryRetriesWindowsSharingViolation(t *testing.T) {
	path := filepath.Join(t.TempDir(), "held.lock")
	oldAlive := aliveFn
	aliveFn = func(pid int) bool { return pid != 424242 }
	defer func() { aliveFn = oldAlive }()
	if err := os.WriteFile(path, []byte(encode(424242, "dead")), 0o600); err != nil {
		t.Fatal(err)
	}
	reader, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	if lock, err := TryAcquire(path); lock != nil || !errors.Is(err, ErrBusy) {
		t.Fatalf("sharing violation must remain retryable: lock=%v err=%v", lock, err)
	}
	if err := reader.Close(); err != nil {
		t.Fatal(err)
	}
	lock, err := Acquire(path, Options{Timeout: time.Second, Poll: time.Millisecond})
	if err != nil {
		t.Fatalf("acquire after reader closes: %v", err)
	}
	if err := lock.Release(); err != nil {
		t.Fatal(err)
	}
}
