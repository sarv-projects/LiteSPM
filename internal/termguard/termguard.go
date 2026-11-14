// Package termguard removes a fixed 5 second start-up stall.
//
// bubbletea's package init calls lipgloss.HasDarkBackground(), which writes an
// OSC 11 background-colour query plus a cursor-position request to the
// terminal and then waits up to 5 s for the reply. A terminal that ignores
// OSC 11 (the legacy Windows console, many SSH hops, multiplexers, test PTYs)
// never answers, so EVERY interactive run stalled for exactly 5 s before its
// first prompt — and on terminals that do answer, the query is still a
// visible round-trip and can leak escape bytes into the input.
//
// LiteSPM only uses fixed colours, so it never needs the answer. This package
// tells lipgloss the background up front (from COLORFGBG when the terminal
// publishes it, otherwise "dark"), which marks the value explicit and makes the
// later HasDarkBackground call return instantly without touching the terminal.
//
// It works through initialisation order: the Go spec initialises, among the
// packages whose imports are already initialised, the first in import-path
// order. This module's path sorts before github.com/charmbracelet/bubbletea,
// and it imports lipgloss (so it runs right after lipgloss, as soon as
// bubbletea could). It is a separate module only to own such a path; it is
// wired in by a replace directive in go.mod and fetched from nowhere.
package termguard

import (
	"os"
	"strconv"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

func init() {
	lipgloss.SetHasDarkBackground(darkBackground(os.Getenv("COLORFGBG")))
}

// darkBackground reads the rxvt-style COLORFGBG ("15;0": foreground;background).
// Backgrounds 7 and 9-15 are light; anything unknown is treated as dark.
func darkBackground(colorFGBG string) bool {
	if !strings.Contains(colorFGBG, ";") {
		return true
	}
	parts := strings.Split(colorFGBG, ";")
	n, err := strconv.Atoi(strings.TrimSpace(parts[len(parts)-1]))
	if err != nil {
		return true
	}
	return !(n == 7 || (n >= 9 && n <= 15))
}
