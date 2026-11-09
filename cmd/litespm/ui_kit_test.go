package main

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/x/ansi"
)

func TestUIFitTruncatesToDisplayWidth(t *testing.T) {
	got := uiFit("0123456789", 6)
	if w := ansi.StringWidth(got); w > 6 {
		t.Fatalf("uiFit width = %d, want <= 6 (%q)", w, got)
	}
	if !strings.HasSuffix(got, "…") {
		t.Fatalf("a truncated string must end in an ellipsis, got %q", got)
	}
	if got := uiFit("short", 20); got != "short" {
		t.Fatalf("a string that fits must be returned unchanged, got %q", got)
	}
}

func TestUIElapsedFormats(t *testing.T) {
	cases := map[time.Duration]string{
		850 * time.Millisecond:  "850ms",
		4200 * time.Millisecond: "4.2s",
		67 * time.Second:        "1m07s",
	}
	for d, want := range cases {
		if got := uiElapsed(d); got != want {
			t.Errorf("uiElapsed(%v) = %q, want %q", d, got, want)
		}
	}
}

// A TERM=dumb terminal cannot draw prompts or spinners, so every surface must
// take the plain text path exactly as a pipe does.
func TestTerminalUIUnavailableOnDumbTerm(t *testing.T) {
	t.Setenv("TERM", "dumb")
	if !uiTermDumb() {
		t.Fatal("TERM=dumb must be detected")
	}
	if terminalUIAvailable(os.Stdin, os.Stdout) {
		t.Fatal("terminalUIAvailable must be false for TERM=dumb")
	}
}

// Piped output carries no ANSI and no spinner frames: the spinner helper runs
// the work and writes nothing when the streams are not a terminal.
func TestRunWithSpinnerWritesNothingOffTerminal(t *testing.T) {
	var out bytes.Buffer
	got, err := runWithSpinner(context.Background(), strings.NewReader(""), &out, "working", func() (int, error) {
		return 7, nil
	})
	if err != nil || got != 7 {
		t.Fatalf("runWithSpinner = %d, %v; want 7, nil", got, err)
	}
	if out.Len() != 0 {
		t.Fatalf("a non-terminal spinner must write nothing, wrote %q", out.String())
	}
}

func TestUICardAndLinesHaveNoANSIOffTerminal(t *testing.T) {
	var out bytes.Buffer
	uiOK(&out, "done %d", 1)
	uiWarn(&out, "careful")
	uiErr(&out, "broken")
	uiHint(&out, "hint")
	uiStepHeader(&out, 2, 3, "Choose agents")
	out.WriteString(uiCard(&out, "ok", "Title", []string{uiKV("wrote", "~/file")}, "footer"))
	if strings.Contains(out.String(), "\x1b") {
		t.Fatalf("styled output off a terminal must be plain, got %q", out.String())
	}
	for _, want := range []string{"✓ done 1", "! careful", "✗ broken", "Step 2 of 3 · Choose agents", "wrote", "footer"} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("output is missing %q:\n%s", want, out.String())
		}
	}
}

// The cancel path of the TTY-only removal flow must not break the text
// fallback: a pipe still gets the numbered list and "Nothing was removed.".
func TestAskApplyFallsBackToTextOffTerminal(t *testing.T) {
	var out bytes.Buffer
	// os.Stdin in `go test` is not a terminal, so askApply must use the
	// one-line prompt and treat the empty stdin as "no".
	if askApply(&out, "Apply 1 change(s) to x?") {
		t.Fatal("an unanswered prompt must decline")
	}
	if !strings.Contains(out.String(), "[y/N]") {
		t.Fatalf("the fallback prompt must keep its [y/N] form, got %q", out.String())
	}
}
