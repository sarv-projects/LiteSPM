package main

// daemon_autostart.go — make `/marketplace` work on a cold machine.
//
// The bridge is spawned by the agent, not by a shell where the person could
// run `litespm daemon serve` first. Without the daemon the bridge correctly
// reports LPSM-IPC-DAEMON-UNREACHABLE, which is honest but makes every
// /marketplace command fail on a fresh install. The bridge therefore starts
// the daemon once, detached, and waits briefly for its socket. The daemon's
// own single-instance lock makes concurrent bridges safe.

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/ipc"
)

const (
	daemonStartWait  = 15 * time.Second
	daemonPollPeriod = 100 * time.Millisecond
)

// connectOrStartDaemon dials the daemon; on a cold machine it starts one and
// retries. The returned error is the last dial error, so the caller can keep
// its standalone fallback and say why.
func connectOrStartDaemon(ctx context.Context, paths *config.PlatformPaths) (*ipc.Client, error) {
	if client, err := ipc.Dial(paths.IPCEndpoint()); err == nil {
		return client, nil
	} else if !daemonAutostartAllowed() {
		return nil, err
	}

	lastErr := error(nil)
	if err := spawnDaemonProcess(paths); err != nil {
		lastErr = err
	} else {
		deadline := time.Now().Add(daemonStartWait)
		for time.Now().Before(deadline) {
			if ctx != nil {
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				default:
				}
			}
			time.Sleep(daemonPollPeriod)
			if client, err := ipc.Dial(paths.IPCEndpoint()); err == nil {
				return client, nil
			} else {
				lastErr = err
			}
		}
	}
	if lastErr == nil {
		lastErr = errors.New("daemon did not become reachable")
	}
	return nil, lastErr
}

func daemonAutostartAllowed() bool {
	if truthyEnv("LITESPM_NO_DAEMON_AUTOSTART") {
		return false
	}
	// A test binary must never leave a daemon behind.
	if strings.HasSuffix(os.Args[0], ".test") || strings.Contains(os.Args[0], ".test.exe") {
		return false
	}
	return true
}

func daemonLogPath(paths *config.PlatformPaths) string {
	return filepath.Join(paths.DataRoot, "daemon.log")
}

// daemonLogTail is a small, bounded diagnostic for the bridge's fallback line.
// It reads only the last max bytes, so a daemon that has been running for
// months cannot make a failed bridge read its whole log into memory.
func daemonLogTail(paths *config.PlatformPaths, max int) string {
	if max <= 0 {
		return ""
	}
	f, err := os.Open(daemonLogPath(paths))
	if err != nil {
		return ""
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return ""
	}
	start := info.Size() - int64(max)
	if start < 0 {
		start = 0
	}
	if _, err := f.Seek(start, io.SeekStart); err != nil {
		return ""
	}
	data, err := io.ReadAll(io.LimitReader(f, int64(max)))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func daemonSpawnCommand(paths *config.PlatformPaths) (string, []string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", nil, fmt.Errorf("locate the running LiteSPM binary: %w", err)
	}
	return exe, []string{"daemon", "serve"}, nil
}
