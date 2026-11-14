package main

import (
	"bytes"
	"context"
	"testing"
)

func TestSyncParseArgs(t *testing.T) {
	tests := []struct {
		name    string
		args    []string
		wantErr bool
		dryRun  bool
		jsonOut bool
	}{
		{
			name:    "default flags",
			args:    []string{},
			wantErr: false,
			dryRun:  false,
			jsonOut: false,
		},
		{
			name:    "dry run short",
			args:    []string{"-n"},
			wantErr: false,
			dryRun:  true,
		},
		{
			name:    "dry run long with json",
			args:    []string{"--dry-run", "--json"},
			wantErr: false,
			dryRun:  true,
			jsonOut: true,
		},
		{
			name:    "unexpected flag",
			args:    []string{"--unknown-flag"},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			opts, err := parseSyncArgs(tc.args)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !tc.wantErr {
				if opts.dryRun != tc.dryRun {
					t.Errorf("dryRun = %v, want %v", opts.dryRun, tc.dryRun)
				}
				if opts.jsonOut != tc.jsonOut {
					t.Errorf("jsonOut = %v, want %v", opts.jsonOut, tc.jsonOut)
				}
			}
		})
	}
}

func TestSyncExecutionDryRun(t *testing.T) {
	var buf bytes.Buffer
	report, err := executeSync(context.Background(), &buf, syncOptions{
		dryRun:      true,
		skipUpdate:  true,
		skipCatalog: true,
	})
	if err != nil {
		t.Fatalf("executeSync dry run failed: %v", err)
	}
	if report == nil {
		t.Fatal("expected non-nil report")
	}
	if report.Version != Version {
		t.Errorf("report version = %q, want %q", report.Version, Version)
	}
	if report.AgentsDetected == 0 {
		t.Logf("no agents detected on test host; that's normal in hermetic CI")
	}
}
