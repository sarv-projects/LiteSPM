//go:build !windows

package main

import (
	"os"
)

// openConsoleInput attempts to open /dev/tty on Unix systems when stdin is redirected
// but stdout/stderr is still connected to an interactive terminal.
func openConsoleInput() (*os.File, error) {
	return os.OpenFile("/dev/tty", os.O_RDWR, 0)
}
