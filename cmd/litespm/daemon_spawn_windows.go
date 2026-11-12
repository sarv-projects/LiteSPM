//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"

	"github.com/sarv-projects/litespm/internal/config"
)

const (
	createNewProcessGroup = 0x00000200
	createNoWindow        = 0x08000000
)

// spawnDaemonProcess starts `litespm daemon serve` detached from the agent's
// bridge process, with no console window and a log file the user can inspect.
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
	// CREATE_NO_WINDOW gives the child a hidden console that its own console
	// children (git, a helper litespm) inherit. DETACHED_PROCESS must not be
	// added: Windows then ignores CREATE_NO_WINDOW, the child has no console,
	// and every console program it starts opens a visible window.
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: createNewProcessGroup | createNoWindow,
		HideWindow:    true,
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start %s: %w", strings.Join(args, " "), err)
	}
	_ = cmd.Process.Release()
	return nil
}
