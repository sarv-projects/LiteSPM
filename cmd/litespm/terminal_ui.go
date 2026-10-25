package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/lipgloss"
)

func terminalUIAvailable(in io.Reader, out io.Writer) bool {
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
	style := lipgloss.NewStyle().Foreground(lipgloss.Color("#89b4fa")).Bold(true)
	ticker := time.NewTicker(90 * time.Millisecond)
	defer ticker.Stop()
	index := 0
	for {
		fmt.Fprintf(out, "\r%s %s", style.Render(string(frames[index%len(frames)])), label)
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
