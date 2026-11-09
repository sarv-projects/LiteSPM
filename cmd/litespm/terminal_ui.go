package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/lipgloss"
)

func terminalUIAvailable(in io.Reader, out io.Writer) bool {
	// TERM=dumb cannot draw a prompt, a spinner or a colour: take the plain
	// text path exactly as a pipe does.
	if uiTermDumb() {
		return false
	}
	inFile, inOK := in.(*os.File)
	outFile, outOK := out.(*os.File)
	if !inOK || !outOK {
		return false
	}
	inInfo, inErr := inFile.Stat()
	outInfo, outErr := outFile.Stat()
	return inErr == nil && outErr == nil && inInfo.Mode()&os.ModeCharDevice != 0 && outInfo.Mode()&os.ModeCharDevice != 0
}

func runTerminalForm(in io.Reader, out io.Writer, fields ...huh.Field) error {
	return huh.NewForm(huh.NewGroup(fields...)).
		WithInput(in).
		WithOutput(out).
		WithTheme(huh.ThemeCatppuccin()).
		WithShowHelp(true).
		Run()
}

func renderLiteSPMWordmark() string {
	brand := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#89b4fa"))
	muted := lipgloss.NewStyle().Foreground(lipgloss.Color("#a6adc8"))
	return brand.Render("LiteSPM") + muted.Render("  ·  AGENT CAPABILITY MANAGER")
}

// renderStatusPill formats an agent or capability status badge using lipgloss.
func renderStatusPill(status string) string {
	switch strings.ToLower(status) {
	case "configured", "ready", "pass":
		return lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#a6e3a1")).
			Render("● " + status)
	case "detected", "warn":
		return lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#f9e2af")).
			Render("○ " + status)
	case "missing", "not configured", "stopped":
		return lipgloss.NewStyle().
			Foreground(lipgloss.Color("#6c7086")).
			Render("— " + status)
	default:
		return lipgloss.NewStyle().
			Foreground(lipgloss.Color("#cdd6f4")).
			Render(status)
	}
}

// renderDiffPreview renders colored and structured syntax-highlighted diff lines
// for file modifications before confirmation.
func renderDiffPreview(lines []string, hiddenCount int) string {
	addedStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#a6e3a1"))
	removedStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#f38ba8"))
	borderBox := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#45475a")).
		Padding(0, 1)

	var sb strings.Builder
	for i, l := range lines {
		if strings.HasPrefix(l, "+") {
			sb.WriteString(addedStyle.Render(l))
		} else if strings.HasPrefix(l, "-") {
			sb.WriteString(removedStyle.Render(l))
		} else {
			sb.WriteString(l)
		}
		if i < len(lines)-1 {
			sb.WriteString("\n")
		}
	}
	if hiddenCount > 0 {
		muted := lipgloss.NewStyle().Foreground(lipgloss.Color("#6c7086")).Italic(true)
		sb.WriteString("\n" + muted.Render(fmt.Sprintf("… and %d more changed line(s)", hiddenCount)))
	}

	return borderBox.Render(sb.String())
}

// runWithSpinner runs a slow operation behind an animated spinner with the
// elapsed time. On a terminal the spinner line is erased when the operation
// ends, so the caller's own ✓/✗ line replaces it; on a pipe or a dumb
// terminal nothing is drawn at all.
func runWithSpinner[T any](ctx context.Context, in io.Reader, out io.Writer, label string, run func() (T, error)) (T, error) {
	if !terminalUIAvailable(in, out) {
		return run()
	}
	type result struct {
		value T
		err   error
	}
	done := make(chan result, 1)
	go func() {
		value, err := run()
		done <- result{value: value, err: err}
	}()
	frames := []rune("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")
	style := lipgloss.NewStyle().Foreground(uiAccent).Bold(true)
	start := time.Now()
	ticker := time.NewTicker(90 * time.Millisecond)
	defer ticker.Stop()
	fmt.Fprint(out, "\x1b[?25l") // hide the cursor while animating
	defer fmt.Fprint(out, "\x1b[?25h")
	width := uiWidth(out)
	index := 0
	for {
		line := label
		if elapsed := time.Since(start); elapsed >= 2*time.Second {
			line += uiDim.Render("  " + uiElapsed(elapsed.Truncate(time.Second)))
		}
		fmt.Fprintf(out, "\r\x1b[2K%s %s", style.Render(string(frames[index%len(frames)])), uiFit(line, width-2))
		index++
		select {
		case result := <-done:
			fmt.Fprint(out, "\r\x1b[2K")
			return result.value, result.err
		case <-ticker.C:
		case <-ctx.Done():
			result := <-done
			fmt.Fprint(out, "\r\x1b[2K")
			return result.value, result.err
		}
	}
}
