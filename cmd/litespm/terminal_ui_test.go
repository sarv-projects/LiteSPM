package main

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestTerminalUIAvailableUsesPlainModeForPipes(t *testing.T) {
	if terminalUIAvailable(strings.NewReader("input"), &bytes.Buffer{}) {
		t.Fatal("piped input/output must use the plain-text path")
	}
}

func TestTerminalUIAvailableRejectsNonTTYCharacterDevices(t *testing.T) {
	file, err := os.OpenFile(os.DevNull, os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	if terminalUIAvailable(file, file) {
		t.Fatal("a character device such as /dev/null must not be treated as an interactive terminal")
	}
}

func TestTerminalSelectHeightIncludesWrappedHeader(t *testing.T) {
	got := terminalSelectHeight(24, "Agent setup", "Choose a setup option for this agent.", 4, 10)
	if got != 7 {
		t.Fatalf("terminalSelectHeight() = %d, want 7 rows for four options and a three-line header", got)
	}
}

func TestTerminalSelectHeightCapsLongOptionLists(t *testing.T) {
	got := terminalSelectHeight(72, "Agent", "Choose one.", 50, 12)
	if got != 14 {
		t.Fatalf("terminalSelectHeight() = %d, want 14 rows for 12 options and a two-line header", got)
	}
}

func TestRunWithSpinnerRunsOperationWithoutTerminal(t *testing.T) {
	calls := 0
	value, err := runWithSpinner(context.Background(), strings.NewReader(""), &bytes.Buffer{}, "syncing", func() (string, error) {
		calls++
		return "done", nil
	})
	if err != nil {
		t.Fatalf("runWithSpinner: %v", err)
	}
	if value != "done" || calls != 1 {
		t.Fatalf("value=%q calls=%d, want done and one call", value, calls)
	}
}
