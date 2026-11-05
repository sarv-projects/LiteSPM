package main

// auto_update.go — the once-per-session update check.
//
// The first LiteSPM command in a terminal session checks the release channel
// and, when a newer binary exists, verifies and installs it before the command
// runs. It is deliberately narrow:
//
//   - it never opens the state database, the catalog, the skills ledger or any
//     agent configuration file;
//   - it writes only a session marker, a lock file and the binary itself;
//   - it is silent when there is nothing to do, so a command's output is not
//     decorated with update noise;
//   - it fails open: a network or verification problem never blocks the
//     command the person actually asked for.
//
// "Session" is the parent process that started the shell command, with a
// short 3-minute burst window so a wizard spawning `litespm skills add`
// cannot trigger a second check. LITESPM_NO_AUTO_UPDATE=1 or CI=1 disables it.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/update"
)

const (
	autoUpdateSessionTTL = 12 * time.Hour
	autoUpdateBurstTTL   = 3 * time.Minute
	autoUpdateLockTTL    = 10 * time.Minute
	autoUpdateTimeout    = 6 * time.Second
)

type autoUpdateMarker struct {
	Session   string    `json:"session"`
	CheckedAt time.Time `json:"checkedAt"`
	Version   string    `json:"version"`
}

type autoUpdateOptions struct {
	Version     string
	Args        []string
	Interactive bool
	SessionID   string
	CacheDir    string
	ExecPath    string
	Out         io.Writer

	Check    func(ctx context.Context, current string) (*update.UpdateStatus, *update.ReleaseInfo, error)
	Download func(ctx context.Context, rawURL string) ([]byte, error)
	Verify   func(ctx context.Context, info *update.ReleaseInfo, binName string, payload []byte) error
	Apply    func(ctx context.Context, payload []byte, checksum, target, stagingDir string) error

	Now func() time.Time
}

// maybeAutoUpdate is the production entry point. It is called once at startup
// for commands that may run in a terminal.
func maybeAutoUpdate(args []string) {
	if !autoUpdateCommandAllowed(args) {
		return
	}
	if !isTerminal(os.Stdin) || !isTerminal(os.Stdout) {
		return
	}
	cacheDir, err := os.UserCacheDir()
	if err != nil || strings.TrimSpace(cacheDir) == "" {
		return
	}
	cacheDir = filepath.Join(cacheDir, "litespm")
	paths, pathErr := config.ResolvePlatformPaths()
	if pathErr != nil {
		return
	}
	execPath, execErr := os.Executable()
	if execErr != nil {
		return
	}

	u := update.NewUpdater(update.DefaultReleaseManifestURL)
	_, _ = runAutoUpdate(context.Background(), autoUpdateOptions{
		Version:     Version,
		Args:        args,
		Interactive: true,
		SessionID:   autoUpdateSessionID(),
		CacheDir:    cacheDir,
		ExecPath:    execPath,
		Out:         os.Stdout,
		Check: func(checkCtx context.Context, current string) (*update.UpdateStatus, *update.ReleaseInfo, error) {
			ctx, cancel := context.WithTimeout(checkCtx, autoUpdateTimeout)
			defer cancel()
			return u.CheckForUpdate(ctx, current)
		},
		Download: func(downloadCtx context.Context, rawURL string) ([]byte, error) {
			ctx, cancel := context.WithTimeout(downloadCtx, selfUpdateDownloadTimeout)
			defer cancel()
			return downloadUpdatePayload(ctx, nil, rawURL, int64(defaultUpdateDownloadLimit))
		},
		Verify: func(verifyCtx context.Context, info *update.ReleaseInfo, binName string, payload []byte) error {
			return verifyDownloadedUpdate(verifyCtx, u, info, binName, payload, paths.StagingPath())
		},
		Apply: func(applyCtx context.Context, payload []byte, checksum, target, stagingDir string) error {
			return u.ApplyUpdate(applyCtx, payload, checksum, target, stagingDir)
		},
		Now: time.Now,
	})
}

func autoUpdateCommandAllowed(args []string) bool {
	if len(args) == 0 {
		return true
	}
	for _, arg := range args {
		if arg == "--json" {
			return false
		}
	}
	command := args[0]
	switch command {
	case "bridge", "daemon", "version", "--version", "-v", "self-update", "update", "uninstall", "help", "--help", "-h":
		return false
	}
	return true
}

// autoUpdateSessionID identifies the shell session. An explicit override wins,
// then the parent process. A terminal that reuses a shell keeps the same pid,
// so the first command in that shell checks and later ones do not.
func autoUpdateSessionID() string {
	if id := strings.TrimSpace(os.Getenv("LITESPM_SESSION_ID")); id != "" {
		return id
	}
	if id := strings.TrimSpace(os.Getenv("WT_SESSION")); id != "" {
		return "wt:" + id
	}
	if id := strings.TrimSpace(os.Getenv("TERM_SESSION_ID")); id != "" {
		return "term:" + id
	}
	if id := strings.TrimSpace(os.Getenv("TMUX_PANE")); id != "" {
		return "tmux:" + id
	}
	return fmt.Sprintf("ppid:%d", os.Getppid())
}

func autoUpdateDisabledByEnv() bool {
	if truthyEnv("LITESPM_NO_AUTO_UPDATE") {
		return true
	}
	if truthyEnv("CI") {
		return true
	}
	return false
}

func truthyEnv(name string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// runAutoUpdate performs the check and returns whether a replacement was
// installed. All side effects are confined to CacheDir and the binary.
func runAutoUpdate(ctx context.Context, opts autoUpdateOptions) (bool, error) {
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Out == nil {
		opts.Out = io.Discard
	}
	if opts.SessionID == "" {
		opts.SessionID = autoUpdateSessionID()
	}
	if opts.CacheDir == "" {
		return false, errors.New("auto-update cache directory is empty")
	}
	if opts.Check == nil {
		return false, errors.New("auto-update has no check function")
	}
	if autoUpdateDisabledByEnv() || !opts.Interactive {
		return false, nil
	}
	// A source build is not a release. Updating "dev" would replace the
	// developer's binary with a release they did not ask for.
	if strings.TrimSpace(opts.Version) == "" || opts.Version == "dev" {
		return false, nil
	}

	if err := os.MkdirAll(opts.CacheDir, 0o700); err != nil {
		return false, nil
	}
	markerPath := filepath.Join(opts.CacheDir, "update-session.json")
	now := opts.Now()
	if marker, ok := readAutoUpdateMarker(markerPath); ok {
		if marker.Session == opts.SessionID && now.Sub(marker.CheckedAt) < autoUpdateSessionTTL {
			return false, nil
		}
		if now.Sub(marker.CheckedAt) >= 0 && now.Sub(marker.CheckedAt) < autoUpdateBurstTTL {
			return false, nil
		}
	}

	unlock, ok := lockAutoUpdate(opts.CacheDir, now)
	if !ok {
		return false, nil
	}
	defer unlock()

	// Re-check after taking the lock: another process may have finished while
	// this one waited.
	if marker, ok := readAutoUpdateMarker(markerPath); ok {
		if marker.Session == opts.SessionID && now.Sub(marker.CheckedAt) < autoUpdateSessionTTL {
			return false, nil
		}
	}

	status, info, err := opts.Check(ctx, opts.Version)
	if err != nil || status == nil || !status.UpdateAvailable || info == nil {
		// Record the attempt either way. Otherwise a broken network would
		// make every command in the session wait for the same timeout.
		writeAutoUpdateMarker(markerPath, autoUpdateMarker{
			Session:   opts.SessionID,
			CheckedAt: now,
			Version:   opts.Version,
		})
		if err != nil && truthyEnv("LITESPM_DEBUG_UPDATE") {
			fmt.Fprintf(opts.Out, "Update check skipped: %v\n", err)
		}
		return false, nil
	}

	binName := update.TargetBinaryName()
	downloadURL, checksum, err := releaseDownloadTarget(info, binName)
	if err != nil {
		writeAutoUpdateMarker(markerPath, autoUpdateMarker{Session: opts.SessionID, CheckedAt: now, Version: opts.Version})
		if truthyEnv("LITESPM_DEBUG_UPDATE") {
			fmt.Fprintf(opts.Out, "Update %s skipped: %v\n", info.Version, err)
		}
		return false, nil
	}

	fmt.Fprintf(opts.Out, "%s LiteSPM %s → %s\n", uiAccentS.Render("◆"), opts.Version, status.LatestVersion)
	fmt.Fprintf(opts.Out, "%s  downloading and verifying the release\n", uiDim.Render("│"))
	payload, err := opts.Download(ctx, downloadURL)
	if err != nil {
		fmt.Fprintf(opts.Out, "%s  update skipped: %v\n", uiYellowS.Render("▲"), err)
		writeAutoUpdateMarker(markerPath, autoUpdateMarker{Session: opts.SessionID, CheckedAt: now, Version: opts.Version})
		return false, nil
	}
	if opts.Verify != nil {
		if err := opts.Verify(ctx, info, binName, payload); err != nil {
			fmt.Fprintf(opts.Out, "%s  update skipped: %v\n", uiRedS.Render("■"), err)
			writeAutoUpdateMarker(markerPath, autoUpdateMarker{Session: opts.SessionID, CheckedAt: now, Version: opts.Version})
			return false, nil
		}
	}
	if opts.Apply == nil {
		return false, errors.New("auto-update has no apply function")
	}
	if err := opts.Apply(ctx, payload, checksum, opts.ExecPath, opts.CacheDir); err != nil {
		fmt.Fprintf(opts.Out, "%s  update skipped: %v\n", uiYellowS.Render("▲"), err)
		writeAutoUpdateMarker(markerPath, autoUpdateMarker{Session: opts.SessionID, CheckedAt: now, Version: opts.Version})
		return false, nil
	}
	writeAutoUpdateMarker(markerPath, autoUpdateMarker{
		Session:   opts.SessionID,
		CheckedAt: now,
		Version:   status.LatestVersion,
	})
	fmt.Fprintf(opts.Out, "%s  LiteSPM updated to %s  ·  the next command uses it\n", uiGreenS.Render("◇"), status.LatestVersion)
	return true, nil
}

func readAutoUpdateMarker(path string) (autoUpdateMarker, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return autoUpdateMarker{}, false
	}
	var marker autoUpdateMarker
	if err := json.Unmarshal(data, &marker); err != nil {
		return autoUpdateMarker{}, false
	}
	if marker.CheckedAt.IsZero() {
		return autoUpdateMarker{}, false
	}
	return marker, true
}

func writeAutoUpdateMarker(path string, marker autoUpdateMarker) {
	data, err := json.Marshal(marker)
	if err != nil {
		return
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return
	}
	_ = os.Rename(tmp, path)
	_ = os.Remove(tmp)
}

// lockAutoUpdate takes an exclusive lock so two terminals starting at once do
// not both download the same release. A stale lock (crash, killed process) is
// removed after autoUpdateLockTTL.
func lockAutoUpdate(dir string, now time.Time) (func(), bool) {
	path := filepath.Join(dir, "update-session.lock")
	if info, err := os.Stat(path); err == nil {
		if now.Sub(info.ModTime()) < autoUpdateLockTTL {
			return func() {}, false
		}
		_ = os.Remove(path)
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return func() {}, false
	}
	_, _ = fmt.Fprintf(f, "%d\n%s\n", os.Getpid(), now.Format(time.RFC3339))
	_ = f.Close()
	return func() { _ = os.Remove(path) }, true
}
