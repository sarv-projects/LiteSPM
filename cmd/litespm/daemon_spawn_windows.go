//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"

	"github.com/sarv-projects/litespm/internal/config"
)

const (
	createNewProcessGroup = 0x00000200
	detachedProcess       = 0x00000008
	createNoWindow        = 0x08000000
)

// spawnDaemonProcess starts `litespm daemon serve` detached from the agent's
// bridge process, with no console window and a log file the user can inspect.
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
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: detachedProcess | createNewProcessGroup | createNoWindow,
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start LiteSPM daemon: %w", err)
	}
	_ = cmd.Process.Release()
	return nil
}
