//go:build windows

package main

import (
	"os"
)

// openConsoleInput attempts to open the Windows console input buffer device CONIN$.
// When PowerShell 5.1 runs npm-installed wrapper scripts or npx, stdin is often
// redirected to a pipe ($input | ...), but CONIN$ remains accessible if the process
// is running inside an interactive console window.
func openConsoleInput() (*os.File, error) {
	// Open with O_RDWR so SetConsoleMode (e.g. for raw terminal input in huh) succeeds.
	f, err := os.OpenFile("CONIN$", os.O_RDWR, 0)
	if err == nil {
		return f, nil
	}
	// Fall back to read-only if read-write fails.
	return os.Open("CONIN$")
}
