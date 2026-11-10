//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"

	"github.com/sarv-projects/litespm/internal/config"
)

// spawnDaemonProcess starts `litespm daemon serve` in its own session so it
// outlives the agent's bridge process and is not killed when the MCP host
// closes the pipe.
func spawnDaemonProcess(paths *config.PlatformPaths) error {
	exe, args, err := daemonSpawnCommand(paths)
	if err != nil {
		return err
	}
	return spawnDetached(paths, exe, args, daemonLogPath(paths))
}

// spawnDetached starts exe with args detached from this process, with its
// output appended to logPath. The daemon and the background catalog sync both
// start this way, so neither is killed when the parent command exits.
func spawnDetached(paths *config.PlatformPaths, exe string, args []string, logPath string) error {
	if err := paths.EnsureDirectories(); err != nil {
		return fmt.Errorf("prepare LiteSPM storage: %w", err)
	}
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("open log %s: %w", logPath, err)
	}
	defer logFile.Close()

	cmd := exec.Command(exe, args...)
	cmd.Stdin = nil
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start %s: %w", strings.Join(args, " "), err)
	}
	// Release the child; the daemon owns its own lifecycle now.
	_ = cmd.Process.Release()
	return nil
}
