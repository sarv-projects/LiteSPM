//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
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
	if err := paths.EnsureDirectories(); err != nil {
		return fmt.Errorf("prepare LiteSPM storage: %w", err)
	}
	logFile, err := os.OpenFile(daemonLogPath(paths), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("open daemon log: %w", err)
	}
	defer logFile.Close()

	cmd := exec.Command(exe, args...)
	cmd.Stdin = nil
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start LiteSPM daemon: %w", err)
	}
	// Release the child; the daemon owns its own lifecycle now.
	_ = cmd.Process.Release()
	return nil
}
