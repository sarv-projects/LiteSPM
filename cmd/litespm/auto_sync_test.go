package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/config"
)

func TestAutoSyncCommandPolicy(t *testing.T) {
	allowed := [][]string{{}, {"search", "x"}, {"install", "id"}, {"list"}, {"marketplace", "rows", "--json"}}
	for _, a := range allowed {
		if !autoSyncCommandAllowed(a) {
			t.Errorf("%v should trigger the auto-sync check", a)
		}
	}
	// The stdio bridge and daemon must stay byte-clean and fast; the manual
	// catalog verbs and informational commands do their own thing.
	refused := [][]string{{"bridge", "stdio"}, {"daemon", "serve"}, {"catalog", "sync"}, {"catalog", "sync", "--auto"},
		{"version"}, {"--version"}, {"help"}, {"search", "--help"}, {"self-update"}, {"uninstall"}}
	for _, a := range refused {
		if autoSyncCommandAllowed(a) {
			t.Errorf("%v must not trigger an auto-sync", a)
		}
	}
	needs := map[string]bool{
		"search x": true, "install id": true, "install remove inst": false, "marketplace rows": true,
		"marketplace": false, "skills find": true, "skills list": false, "list": false, "": true,
	}
	for line, want := range needs {
		var args []string
		if line != "" {
			args = splitWords(line)
		}
		if got := commandNeedsCatalog(args); got != want {
			t.Errorf("commandNeedsCatalog(%q) = %v, want %v", line, got, want)
		}
	}
}

func splitWords(s string) []string {
	var out []string
	cur := ""
	for _, r := range s {
		if r == ' ' {
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		cur += string(r)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

func TestAutoSyncStampAndLock(t *testing.T) {
	dir := t.TempDir()
	paths := &config.PlatformPaths{DataRoot: dir}
	now := time.Now()
	if stampFresh(paths, now) {
		t.Fatal("no stamp yet must not be fresh")
	}
	writeStamp(paths, now)
	if !stampFresh(paths, now.Add(time.Hour)) {
		t.Fatal("a stamp an hour old is fresh")
	}
	if stampFresh(paths, now.Add(autoSyncInterval+time.Minute)) {
		t.Fatal("a stamp older than the interval is stale")
	}

	unlock, ok := acquireSyncLock(paths)
	if !ok {
		t.Fatal("first lock refused")
	}
	if _, ok2 := acquireSyncLock(paths); ok2 {
		t.Fatal("a second sync took a held lock")
	}
	if !autoSyncRunning(paths) {
		t.Fatal("a held lock must read as running")
	}
	unlock()
	if autoSyncRunning(paths) {
		t.Fatal("released lock still reads as running")
	}

	// A crashed sync's lock is taken over after the TTL.
	lock := autoSyncLockPath(paths)
	if err := os.WriteFile(lock, []byte("1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-autoSyncLockTTL - time.Minute)
	if err := os.Chtimes(lock, old, old); err != nil {
		t.Fatal(err)
	}
	unlock, ok = acquireSyncLock(paths)
	if !ok {
		t.Fatal("a stale lock was not taken over")
	}
	unlock()
	if _, err := os.Stat(filepath.Join(dir, "catalog-sync.lock")); err == nil {
		t.Fatal("lock file left behind")
	}
}

// Auto-sync never runs from a test binary, so no test can start a real
// background download.
func TestAutoSyncIsOffInTests(t *testing.T) {
	if !autoSyncDisabled() {
		t.Fatal("auto-sync must be disabled in a test binary")
	}
}
