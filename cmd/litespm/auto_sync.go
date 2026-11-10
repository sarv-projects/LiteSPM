package main

// auto_sync.go — keep the catalog fresh without anyone running
// `litespm catalog sync`.
//
// Every LiteSPM run checks, at most once per autoSyncInterval, whether the
// catalog origin has a newer release. The check runs in a detached
// `litespm catalog sync --auto` process, so the command the person asked for
// never waits for it: the background process downloads only the 210-byte
// release pointer when nothing changed, and otherwise downloads, verifies and
// indexes the new release and swaps the index in when it is complete. Every
// signature and digest check of a manual sync applies.
//
// The one case that waits is a first run that needs the catalog (a search or
// an install with nothing downloaded yet): there is nothing to search, so the
// download runs in the foreground with a progress line on stderr.
//
// LITESPM_NO_AUTO_SYNC=1 or CI=1 turns it off; offline, it is silent.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/config"
)

const (
	autoSyncInterval = 6 * time.Hour
	// autoSyncLockTTL outlives the slowest sync (download + verify + index).
	autoSyncLockTTL = 30 * time.Minute
)

type autoSyncStamp struct {
	CheckedAt time.Time `json:"checkedAt"`
}

func autoSyncStampPath(paths *config.PlatformPaths) string {
	return filepath.Join(paths.DataRoot, "catalog-autosync.json")
}

func autoSyncLockPath(paths *config.PlatformPaths) string {
	return filepath.Join(paths.DataRoot, "catalog-sync.lock")
}

func autoSyncLogPath(paths *config.PlatformPaths) string {
	return filepath.Join(paths.DataRoot, "catalog-sync.log")
}

func autoSyncDisabled() bool {
	return truthyEnv("LITESPM_NO_AUTO_SYNC") || truthyEnv("CI") || !daemonAutostartAllowed()
}

// autoSyncCommandAllowed excludes the commands that must stay exactly as
// they are: the MCP bridge and daemon (stdio protocol, long-lived), the
// manual catalog verbs, and the purely informational ones.
func autoSyncCommandAllowed(args []string) bool {
	if len(args) == 0 {
		return true
	}
	switch args[0] {
	case "bridge", "daemon", "catalog", "version", "--version", "-v", "help", "--help", "-h",
		"self-update", "update", "uninstall", "init":
		return false
	}
	for _, a := range args {
		if a == "--help" || a == "-h" {
			return false
		}
	}
	return true
}

// commandNeedsCatalog reports whether the command reads the catalog, so a
// first run should download it before running.
func commandNeedsCatalog(args []string) bool {
	if len(args) == 0 {
		return true // the wizard's find-and-install
	}
	switch args[0] {
	case "search", "lock":
		return true
	case "install":
		return len(args) < 2 || args[1] != "remove"
	case "marketplace", "market":
		return len(args) > 1 && args[1] == "rows"
	case "skills":
		return len(args) > 1 && args[1] == "find"
	}
	return false
}

func catalogCached(paths *config.PlatformPaths) bool {
	_, err := os.Stat(filepath.Join(paths.DataRoot, "v1", "current.json"))
	return err == nil
}

// maybeAutoSyncCatalog is the production entry point, called once at startup.
func maybeAutoSyncCatalog(args []string) {
	if autoSyncDisabled() || !autoSyncCommandAllowed(args) {
		return
	}
	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		return
	}
	if !catalogCached(paths) && commandNeedsCatalog(args) {
		// A popup asks for rows without a terminal and has its own timeout:
		// download in the background and let it say so, rather than holding
		// the agent's UI for a minute.
		if !isTerminal(os.Stderr) && len(args) > 0 && (args[0] == "marketplace" || args[0] == "market") {
			startBackgroundSync(paths, time.Now())
			return
		}
		foregroundFirstSync(paths, os.Stderr)
		return
	}
	if stampFresh(paths, time.Now()) {
		return
	}
	startBackgroundSync(paths, time.Now())
}

func stampFresh(paths *config.PlatformPaths, now time.Time) bool {
	data, err := os.ReadFile(autoSyncStampPath(paths))
	if err != nil {
		return false
	}
	var s autoSyncStamp
	if json.Unmarshal(data, &s) != nil || s.CheckedAt.IsZero() {
		return false
	}
	age := now.Sub(s.CheckedAt)
	return age >= 0 && age < autoSyncInterval
}

func writeStamp(paths *config.PlatformPaths, now time.Time) {
	data, _ := json.Marshal(autoSyncStamp{CheckedAt: now.UTC()})
	_ = writeFileAtomic(autoSyncStampPath(paths), data)
}

func writeFileAtomic(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// autoSyncRunning reports whether a sync holds the lock (for the popups'
// "downloading" notice).
func autoSyncRunning(paths *config.PlatformPaths) bool {
	info, err := os.Stat(autoSyncLockPath(paths))
	return err == nil && time.Since(info.ModTime()) < autoSyncLockTTL
}

// startBackgroundSync stamps first (so a burst of commands starts one sync,
// not one each) and starts the detached sync.
func startBackgroundSync(paths *config.PlatformPaths, now time.Time) {
	if autoSyncRunning(paths) {
		return
	}
	writeStamp(paths, now)
	exe, err := os.Executable()
	if err != nil {
		return
	}
	_ = spawnDetached(paths, exe, []string{"catalog", "sync", "--auto"}, autoSyncLogPath(paths))
}

// acquireSyncLock takes the cross-process sync lock; a lock older than the
// TTL (a crashed sync) is taken over.
func acquireSyncLock(paths *config.PlatformPaths) (func(), bool) {
	path := autoSyncLockPath(paths)
	if info, err := os.Stat(path); err == nil {
		if time.Since(info.ModTime()) < autoSyncLockTTL {
			return func() {}, false
		}
		_ = os.Remove(path)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return func() {}, false
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return func() {}, false
	}
	_, _ = fmt.Fprintf(f, "%d\n%s\n", os.Getpid(), time.Now().UTC().Format(time.RFC3339))
	_ = f.Close()
	return func() { _ = os.Remove(path) }, true
}

// newSyncClient builds the catalog client a sync uses.
func newSyncClient(paths *config.PlatformPaths) (*catalog.Client, *config.Config) {
	cfg, _ := config.LoadCurrentConfig()
	return catalog.NewClientWithTimeout(registryURLOf(cfg), paths.DataRoot, catalogSyncTimeout(cfg), nil), cfg
}

// runAutoSync is `litespm catalog sync --auto`: quiet, locked, logged.
func runAutoSync() int {
	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		return 1
	}
	unlock, ok := acquireSyncLock(paths)
	if !ok {
		return 0 // another sync is running
	}
	defer unlock()
	client, cfg := newSyncClient(paths)
	ctx, cancel := context.WithTimeout(context.Background(), catalogSyncTimeout(cfg)+5*time.Minute)
	defer cancel()
	started := time.Now()
	res, err := client.Sync(ctx)
	stamp := time.Now().UTC().Format(time.RFC3339)
	if err != nil {
		fmt.Printf("%s auto-sync failed after %s: %v\n", stamp, time.Since(started).Round(time.Second), err)
		return 1
	}
	if res.Updated {
		fmt.Printf("%s auto-sync: release %s (sequence %d, %d capabilities) in %s\n", stamp, res.ReleaseID, res.Sequence, res.ItemCount, time.Since(started).Round(time.Second))
	}
	writeStamp(paths, time.Now())
	return 0
}

// foregroundFirstSync downloads the catalog when nothing is cached yet and
// the command needs it. Progress goes to w (stderr), so a command's stdout
// (JSON included) stays clean.
func foregroundFirstSync(paths *config.PlatformPaths, w io.Writer) {
	unlock, ok := acquireSyncLock(paths)
	if !ok {
		fmt.Fprintln(w, "The LiteSPM catalog is downloading in another process; try again in a minute.")
		return
	}
	defer unlock()
	client, cfg := newSyncClient(paths)
	tty := isTerminal(os.Stderr)
	lastPrint := time.Time{}
	client.SetProgress(func(done, total int64) {
		if !tty || time.Since(lastPrint) < 150*time.Millisecond && done < total {
			return
		}
		lastPrint = time.Now()
		fmt.Fprintf(w, "\r\x1b[2K  Downloading the LiteSPM catalog (first run)… %d MB / %d MB", done>>20, total>>20)
		if done >= total {
			fmt.Fprintf(w, "\r\x1b[2K  Verifying and indexing the catalog…")
		}
	})
	if !tty {
		fmt.Fprintln(w, "Downloading the LiteSPM catalog (first run)…")
	}
	ctx, cancel := context.WithTimeout(context.Background(), catalogSyncTimeout(cfg)+5*time.Minute)
	defer cancel()
	started := time.Now()
	res, err := client.Sync(ctx)
	if tty {
		fmt.Fprint(w, "\r\x1b[2K")
	}
	if err != nil {
		fmt.Fprintf(w, "Could not download the LiteSPM catalog: %v\n", err)
		fmt.Fprintln(w, "Run `litespm catalog sync` when you are online.")
		return
	}
	writeStamp(paths, time.Now())
	fmt.Fprintf(w, "✓ Catalog ready · %d capabilities · %s\n", res.ItemCount, time.Since(started).Round(time.Second))
}

// autoSyncNoticeForEmptyCatalog is what a popup shows while the first
// download runs in the background.
func autoSyncNoticeForEmptyCatalog(paths *config.PlatformPaths) string {
	if autoSyncRunning(paths) {
		return "The LiteSPM catalog is downloading for the first time (about a minute). Open the marketplace again shortly."
	}
	if autoSyncDisabled() {
		return "The local catalog is empty. Run `litespm catalog sync` once to download it."
	}
	return "The local catalog is empty; it downloads automatically on your next `litespm` command, or run `litespm catalog sync`."
}
