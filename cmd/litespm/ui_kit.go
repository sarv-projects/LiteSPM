package main

// ui_kit.go — the one visual language every interactive LiteSPM surface uses.
//
// A small set of helpers (step header, status lines, cards, arrow-key select,
// spinner with elapsed time) built on the palette in installer_tui.go. Every
// helper degrades by itself: on a pipe, with NO_COLOR, or with TERM=dumb the
// output is plain text with no ANSI and no animation, so a transcript, a log
// file and a screen reader all see the same words.

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"golang.org/x/term"
)

// uiTermDumb reports a terminal that cannot draw anything but text.
func uiTermDumb() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("TERM")), "dumb")
}

// uiWidth is the usable width of out, clamped to a readable range. It falls
// back to $COLUMNS and then 80 when out is not a terminal.
func uiWidth(out io.Writer) int {
	width := 0
	if f, ok := out.(*os.File); ok {
		if w, _, err := term.GetSize(int(f.Fd())); err == nil {
			width = w
		}
	}
	if width <= 0 {
		fmt.Sscanf(os.Getenv("COLUMNS"), "%d", &width)
	}
	if width <= 0 {
		width = 80
	}
	if width > 120 {
		width = 120
	}
	if width < 40 {
		width = 40
	}
	return width
}

// uiFit truncates s to width display cells with an ellipsis. It is ANSI-aware,
// so a styled string is never cut inside an escape sequence.
func uiFit(s string, width int) string {
	if width <= 0 || ansi.StringWidth(s) <= width {
		return s
	}
	return ansi.Truncate(s, width, "…")
}

// --- status lines ----------------------------------------------------------

var (
	uiStepStyle = lipgloss.NewStyle().Foreground(uiAccent).Bold(true)
)

// uiStepHeader prints "◆ Step 2 of 3 · Choose agents" preceded by a blank line.
func uiStepHeader(out io.Writer, n, total int, title string) {
	fmt.Fprintf(out, "\n%s %s%s\n",
		uiStepStyle.Render("◆"),
		uiStepStyle.Render(fmt.Sprintf("Step %d of %d", n, total)),
		uiBold.Render(" · "+title))
}

// uiOK, uiWarn, uiErr and uiHint are the four line kinds. Each is one
// indented line; none of them wraps, so a long value is truncated to the
// terminal width rather than broken mid-word.
func uiOK(out io.Writer, format string, args ...any) {
	fmt.Fprintf(out, "%s %s\n", uiGreenS.Bold(true).Render("✓"), uiFit(fmt.Sprintf(format, args...), uiWidth(out)-2))
}

func uiWarn(out io.Writer, format string, args ...any) {
	fmt.Fprintf(out, "%s %s\n", uiYellowS.Bold(true).Render("!"), uiFit(fmt.Sprintf(format, args...), uiWidth(out)-2))
}

func uiErr(out io.Writer, format string, args ...any) {
	fmt.Fprintf(out, "%s %s\n", uiRedS.Bold(true).Render("✗"), uiFit(fmt.Sprintf(format, args...), uiWidth(out)-2))
}

func uiHint(out io.Writer, format string, args ...any) {
	fmt.Fprintf(out, "  %s\n", uiDim.Render(uiFit(fmt.Sprintf(format, args...), uiWidth(out)-2)))
}

// uiCompactHeader is the one-line header shown on every screen after the
// first. The big wordmark is reserved for the first run (see printBanner).
func uiCompactHeader(subtitle string) string {
	line := uiStepStyle.Render("◆") + " " + uiBold.Render("LiteSPM")
	if subtitle != "" {
		line += uiDim.Render("  ·  " + subtitle)
	}
	return line
}

// uiCard renders a rounded summary card. tone is "ok", "warn", "err" or "" for
// the neutral muted border. Lines are truncated to fit the terminal.
func uiCard(out io.Writer, tone, title string, lines []string, footer string) string {
	border := uiMuted
	titleStyle := uiBold
	switch tone {
	case "ok":
		border, titleStyle = uiGreen, uiGreenS.Bold(true)
	case "warn":
		border, titleStyle = uiYellow, uiYellowS.Bold(true)
	case "err":
		border, titleStyle = uiRed, uiRedS.Bold(true)
	}
	inner := uiWidth(out) - 6
	body := make([]string, 0, len(lines)+4)
	body = append(body, titleStyle.Render(uiFit(title, inner)), "")
	for _, l := range lines {
		body = append(body, uiFit(l, inner))
	}
	if footer != "" {
		body = append(body, "", uiDim.Render(uiFit(footer, inner)))
	}
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(border).
		Padding(0, 1).
		Render(strings.Join(body, "\n"))
}

// uiKV formats an aligned "label  value" row for a card.
func uiKV(label, value string) string {
	return fmt.Sprintf("%s %s", uiDim.Render(fmt.Sprintf("%-10s", label)), value)
}

// --- arrow-key select / confirm / input -----------------------------------

// choiceOption is one row of an arrow-key select.
type choiceOption struct {
	ID    string
	Label string
	Hint  string
}

func (c choiceOption) display() string {
	if c.Hint == "" {
		return c.Label
	}
	return c.Label + uiDim.Render("  "+c.Hint)
}

// uiSelectOne asks the person to pick one option with the arrow keys. ok=false
// means they cancelled (Esc or Ctrl-C). def preselects an option by ID. It must
// only be called on a real terminal; the callers keep their text fallback for
// pipes.
func uiSelectOne(in io.Reader, out io.Writer, title, description string, options []choiceOption, def string) (string, bool, error) {
	choice := def
	if choice == "" && len(options) > 0 {
		choice = options[0].ID
	}
	opts := make([]huh.Option[string], 0, len(options))
	for _, o := range options {
		opts = append(opts, huh.NewOption(o.display(), o.ID))
	}
	height := len(options) + 3
	if description != "" {
		height++
	}
	field := huh.NewSelect[string]().
		Title(title).
		Description(description).
		Options(opts...).
		Value(&choice).
		WithHeight(height)
	if err := runTerminalForm(in, out, field); err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			return "", false, nil
		}
		return "", false, err
	}
	return choice, true, nil
}

// uiConfirm asks a yes/no question with a two-button confirm. Cancelling is a
// "no". yes/no label the buttons ("Install"/"Cancel").
func uiConfirm(in io.Reader, out io.Writer, title, description, yes, no string, def bool) (bool, error) {
	answer := def
	field := huh.NewConfirm().
		Title(title).
		Description(description).
		Affirmative(yes).
		Negative(no).
		Value(&answer)
	if err := runTerminalForm(in, out, field); err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			return false, nil
		}
		return false, err
	}
	return answer, nil
}

// uiInputText asks for one line of text. ok=false means cancelled.
func uiInputText(in io.Reader, out io.Writer, title, description, placeholder string) (string, bool, error) {
	value := ""
	field := huh.NewInput().Title(title).Description(description).Placeholder(placeholder).Value(&value)
	if err := runTerminalForm(in, out, field); err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			return "", false, nil
		}
		return "", false, err
	}
	return strings.TrimSpace(value), true, nil
}

// --- time ------------------------------------------------------------------

// uiElapsed formats a duration for a status line: "850ms", "4.2s", "1m07s".
func uiElapsed(d time.Duration) string {
	switch {
	case d < time.Second:
		return fmt.Sprintf("%dms", d.Milliseconds())
	case d < time.Minute:
		return fmt.Sprintf("%.1fs", d.Seconds())
	default:
		return fmt.Sprintf("%dm%02ds", int(d.Minutes()), int(d.Seconds())%60)
	}
}

// askApply is the shared "apply these changes?" question of import and copy:
// an arrow-key confirm on a terminal, the one-line [y/N] prompt otherwise.
// Declining, cancelling and an ended input all mean "no".
func askApply(out io.Writer, question string) bool {
	if terminalUIAvailable(os.Stdin, out) {
		fmt.Fprintln(out, "")
		ok, _ := uiConfirm(os.Stdin, out, question, "", "Apply", "Cancel", false)
		return ok
	}
	fmt.Fprintf(out, "\n%s [y/N] ", question)
	line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	return isAffirmative(line)
}
