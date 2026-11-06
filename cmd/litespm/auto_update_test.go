package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/update"
)

func autoUpdateFixture(t *testing.T, payload []byte) (autoUpdateOptions, *int) {
	t.Helper()
	t.Setenv("CI", "")
	t.Setenv("LITESPM_NO_AUTO_UPDATE", "")
	cacheDir := t.TempDir()
	target := filepath.Join(t.TempDir(), "litespm")
	if err := os.WriteFile(target, []byte("old"), 0o755); err != nil {
		t.Fatal(err)
	}
	binName := update.TargetBinaryName()
	calls := 0
	opts := autoUpdateOptions{
		Version:     "1.0.0",
		Interactive: true,
		SessionID:   "test-session",
		CacheDir:    cacheDir,
		ExecPath:    target,
		Out:         io.Discard,
		Now:         func() time.Time { return time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC) },
		Check: func(context.Context, string) (*update.UpdateStatus, *update.ReleaseInfo, error) {
			calls++
			return &update.UpdateStatus{CurrentVersion: "1.0.0", LatestVersion: "1.1.0", UpdateAvailable: true},
				&update.ReleaseInfo{
					Version:         "1.1.0",
					DownloadURLs:    map[string]string{binName: "https://example.invalid/" + binName},
					ChecksumsSHA256: map[string]string{binName: testSHA256Hex(payload)},
				}, nil
		},
		Download: func(context.Context, string) ([]byte, error) { return payload, nil },
		Apply: func(_ context.Context, got []byte, checksum, target, _ string) error {
			if string(got) != string(payload) {
				t.Fatalf("apply payload = %q", got)
			}
			return os.WriteFile(target, got, 0o755)
		},
	}
	return opts, &calls
}

func testSHA256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func TestAutoUpdateChecksAgainAfterBurst(t *testing.T) {
	payload := []byte("new binary")
	opts, calls := autoUpdateFixture(t, payload)
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	opts.Now = func() time.Time { return now }

	updated, err := runAutoUpdate(context.Background(), opts)
	if err != nil {
		t.Fatalf("runAutoUpdate: %v", err)
	}
	if !updated {
		t.Fatal("expected an update")
	}
	got, err := os.ReadFile(opts.ExecPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(payload) {
		t.Fatalf("target = %q", got)
	}

	// A child process inside the burst window must not download again.
	updated, err = runAutoUpdate(context.Background(), opts)
	if err != nil {
		t.Fatalf("second runAutoUpdate: %v", err)
	}
	if updated {
		t.Fatal("second run inside the burst window updated again")
	}
	if *calls != 1 {
		t.Fatalf("check calls after burst = %d, want 1", *calls)
	}

	// The next run after the burst checks again, even in the same shell.
	now = now.Add(autoUpdateBurstTTL + time.Second)
	if _, err := runAutoUpdate(context.Background(), opts); err != nil {
		t.Fatalf("third runAutoUpdate: %v", err)
	}
	if *calls != 2 {
		t.Fatalf("check calls after the burst = %d, want 2", *calls)
	}
}

func TestAutoUpdateSkipsDevBuilds(t *testing.T) {
	payload := []byte("new binary")
	opts, calls := autoUpdateFixture(t, payload)
	opts.Version = "dev"
	updated, err := runAutoUpdate(context.Background(), opts)
	if err != nil || updated {
		t.Fatalf("dev build updated: updated=%v err=%v", updated, err)
	}
	if *calls != 0 {
		t.Fatalf("dev build called the network: %d", *calls)
	}
}

func TestAutoUpdateLeavesUnrelatedStateUntouched(t *testing.T) {
	payload := []byte("new binary")
	opts, _ := autoUpdateFixture(t, payload)
	stateDir := t.TempDir()
	files := map[string][]byte{
		"litespm.db":         []byte("state database bytes"),
		"skills-ledger.json": []byte(`{"skills":[]}`),
		"opencode.json":      []byte(`{"mcp":{}}`),
	}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(stateDir, name), body, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	before := map[string][]byte{}
	for name := range files {
		before[name], _ = os.ReadFile(filepath.Join(stateDir, name))
	}
	if _, err := runAutoUpdate(context.Background(), opts); err != nil {
		t.Fatal(err)
	}
	for name, want := range before {
		got, err := os.ReadFile(filepath.Join(stateDir, name))
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != string(want) {
			t.Fatalf("%s changed from %q to %q", name, want, got)
		}
	}
}

func TestAutoUpdateCheckFailureRecordsBurstAndDoesNotBlock(t *testing.T) {
	opts, calls := autoUpdateFixture(t, []byte("new binary"))
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	opts.Now = func() time.Time { return now }
	opts.Check = func(context.Context, string) (*update.UpdateStatus, *update.ReleaseInfo, error) {
		*calls++
		return nil, nil, context.DeadlineExceeded
	}
	updated, err := runAutoUpdate(context.Background(), opts)
	if err != nil || updated {
		t.Fatalf("failed check: updated=%v err=%v", updated, err)
	}
	// The marker is written, so a child process does not retry the timeout.
	if _, err := runAutoUpdate(context.Background(), opts); err != nil {
		t.Fatal(err)
	}
	if *calls != 1 {
		t.Fatalf("check calls inside the burst = %d, want 1", *calls)
	}
	// The next user run retries instead of staying silent for a session.
	now = now.Add(autoUpdateBurstTTL + time.Second)
	if _, err := runAutoUpdate(context.Background(), opts); err != nil {
		t.Fatal(err)
	}
	if *calls != 2 {
		t.Fatalf("check calls after the burst = %d, want 2", *calls)
	}
}

func TestAutoUpdateDisabledWhenNotInteractive(t *testing.T) {
	opts, calls := autoUpdateFixture(t, []byte("new binary"))
	opts.Interactive = false
	updated, err := runAutoUpdate(context.Background(), opts)
	if err != nil || updated || *calls != 0 {
		t.Fatalf("non-interactive run: updated=%v err=%v calls=%d", updated, err, *calls)
	}
}

func TestAutoUpdateCommandAllowed(t *testing.T) {
	cases := []struct {
		args []string
		want bool
	}{
		{nil, true},
		{[]string{"skills", "add", "x"}, true},
		{[]string{"install", "mcp:x"}, true},
		{[]string{"bridge", "stdio"}, false},
		{[]string{"daemon", "serve"}, false},
		{[]string{"--version"}, false},
		{[]string{"install", "--json", "x"}, false},
	}
	for _, tc := range cases {
		if got := autoUpdateCommandAllowed(tc.args); got != tc.want {
			t.Errorf("autoUpdateCommandAllowed(%v) = %v, want %v", tc.args, got, tc.want)
		}
	}
}
