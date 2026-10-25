package main

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestTerminalUIAvailableUsesPlainModeForPipes(t *testing.T) {
	if terminalUIAvailable(strings.NewReader("input"), &bytes.Buffer{}) {
		t.Fatal("piped input/output must use the plain-text path")
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
