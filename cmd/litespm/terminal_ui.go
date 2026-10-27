package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/term"
)

func terminalUIAvailable(in io.Reader, out io.Writer) bool {
	inFile, inOK := in.(*os.File)
	outFile, outOK := out.(*os.File)
	if !inOK || !outOK {
		return false
	}
	return term.IsTerminal(inFile.Fd()) && term.IsTerminal(outFile.Fd())
}

func runTerminalForm(in io.Reader, out io.Writer, fields ...huh.Field) error {
	return huh.NewForm(huh.NewGroup(fields...)).
		WithInput(in).
		WithOutput(out).
		WithTheme(liteSPMTheme()).
		WithShowHelp(true).
		Run()
}

type terminalOption struct {
	label string
	value string
}

func terminalTextLines(value string, width int) int {
	if value == "" {
		return 0
	}
	if width < 1 {
		width = 1
	}
	lines := 0
	for _, paragraph := range strings.Split(value, "\n") {
		words := strings.Fields(paragraph)
		if len(words) == 0 {
			lines++
			continue
		}
		lineWidth := 0
		for _, word := range words {
			wordWidth := lipgloss.Width(word)
			if lineWidth == 0 {
				lineWidth = wordWidth
				continue
			}
			if lineWidth+1+wordWidth > width {
				lines++
				lineWidth = wordWidth
				continue
			}
			lineWidth += 1 + wordWidth
		}
		lines++
	}
	return lines
}

func terminalSelectHeight(width int, title, description string, optionCount, preferredOptions int) int {
	if optionCount <= 0 {
		return 0
	}
	visibleOptions := optionCount
	if preferredOptions > 0 && visibleOptions > preferredOptions {
		visibleOptions = preferredOptions
	}
	headerHeight := terminalTextLines(title, width) + terminalTextLines(description, width)
	return visibleOptions + headerHeight
}

func runTerminalSelect(in io.Reader, out io.Writer, title, description string, options []terminalOption, height int) (string, error) {
	if len(options) == 0 {
		return "", nil
	}
	choices := make([]huh.Option[string], 0, len(options))
	for _, option := range options {
		choices = append(choices, huh.NewOption(option.label, option.value))
	}
	selected := options[0].value
	field := huh.NewSelect[string]().
		Title(title).
		Description(description).
		Options(choices...).
		Value(&selected)
	width := terminalContentWidth(out, 80) - 8
	height = terminalSelectHeight(width, title, description, len(options), height)
	if height > 0 {
		field.WithHeight(height)
	}
	if err := runTerminalForm(in, out, field); err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			return "", nil
		}
		return "", err
	}
	return selected, nil
}

func runTerminalConfirm(in io.Reader, out io.Writer, title, description, affirmative, negative string, defaultValue bool) (bool, error) {
	value := defaultValue
	field := huh.NewConfirm().
		Title(title).
		Description(description).
		Affirmative(affirmative).
		Negative(negative).
		Value(&value)
	if err := runTerminalForm(in, out, field); err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			return false, nil
		}
		return false, err
	}
	return value, nil
}

func runTerminalInput(in io.Reader, out io.Writer, title, description, placeholder string) (string, error) {
	value := ""
	field := huh.NewInput().
		Title(title).
		Description(description).
		Placeholder(placeholder).
		Value(&value)
	if err := runTerminalForm(in, out, field); err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			return "", nil
		}
		return "", err
	}
	return strings.TrimSpace(value), nil
}

func liteSPMTheme() *huh.Theme {
	theme := huh.ThemeBase()
	accent := lipgloss.AdaptiveColor{Light: "#2457A7", Dark: "#8AB4F8"}
	muted := lipgloss.AdaptiveColor{Light: "#5B6472", Dark: "#929AA6"}
	selected := lipgloss.AdaptiveColor{Light: "#176B52", Dark: "#69C3A1"}
	theme.Focused.Base = theme.Focused.Base.BorderForeground(muted)
	theme.Focused.Title = theme.Focused.Title.Foreground(accent).Bold(true)
	theme.Focused.NoteTitle = theme.Focused.NoteTitle.Foreground(accent).Bold(true)
	theme.Focused.Description = theme.Focused.Description.Foreground(muted)
	theme.Focused.SelectSelector = theme.Focused.SelectSelector.Foreground(accent).Bold(true)
	theme.Focused.MultiSelectSelector = theme.Focused.MultiSelectSelector.Foreground(accent)
	theme.Focused.SelectedOption = theme.Focused.SelectedOption.Foreground(selected).Bold(true)
	theme.Focused.SelectedPrefix = lipgloss.NewStyle().Foreground(selected).SetString("✓ ")
	theme.Focused.UnselectedPrefix = lipgloss.NewStyle().Foreground(muted).SetString("  ")
	theme.Focused.TextInput.Prompt = theme.Focused.TextInput.Prompt.Foreground(accent)
	theme.Focused.TextInput.Cursor = theme.Focused.TextInput.Cursor.Foreground(accent)
	theme.Focused.ErrorIndicator = theme.Focused.ErrorIndicator.Foreground(lipgloss.AdaptiveColor{Light: "#B42318", Dark: "#F28B82"})
	theme.Focused.ErrorMessage = theme.Focused.ErrorMessage.Foreground(lipgloss.AdaptiveColor{Light: "#B42318", Dark: "#F28B82"})
	theme.Group.Title = theme.Focused.Title
	theme.Group.Description = theme.Focused.Description
	theme.Blurred = theme.Focused
	theme.Blurred.Base = theme.Focused.Base.BorderStyle(lipgloss.HiddenBorder())
	theme.Blurred.Card = theme.Blurred.Base
	theme.Blurred.NextIndicator = lipgloss.NewStyle()
	theme.Blurred.PrevIndicator = lipgloss.NewStyle()
	return theme
}

func renderLiteSPMWordmark() string {
	brand := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#89b4fa"))
	muted := lipgloss.NewStyle().Foreground(lipgloss.Color("#a6adc8"))
	return brand.Render("LiteSPM") + muted.Render("  ·  AGENT CAPABILITY MANAGER")
}

func renderCapabilityCard(width int, name, kind, id, summary string) string {
	brand := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#cdd6f4"))
	accent := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#89b4fa"))
	muted := lipgloss.NewStyle().Foreground(lipgloss.Color("#a6adc8"))
	content := strings.Join([]string{
		brand.Render(name) + "  " + accent.Render(kind),
		muted.Render(id),
		summary,
	}, "\n")
	contentWidth := width - 12
	if contentWidth < 32 {
		contentWidth = 32
	}
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#45475a")).
		Padding(0, 1).
		Width(contentWidth).
		Render(content)
}

func terminalContentWidth(out io.Writer, fallback int) int {
	file, ok := out.(*os.File)
	if !ok {
		return fallback
	}
	width, _, err := term.GetSize(file.Fd())
	if err != nil || width < 40 {
		return fallback
	}
	if width > 100 {
		return 88
	}
	return width
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
