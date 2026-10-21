package main

// restore_adopt_test.go — restoring an ADOPTED install.
//
// An adoption is ownership of a node LiteSPM did not write. `litespm adopt`
// records the node's current image as its pre-image and the node's own text
// as its prior entry, and touches nothing in the host's configuration.
//
// The rule that follows from that: undoing an adoption must leave the user's
// configuration exactly as it was. It must never delete the file, and it must
// never discard the node.
//
// This file pins that rule. The bug it guards against was real: the restore
// planner read an adoption's empty BackupPath as "the install created this
// file" and the applier then removed the user's whole host config.

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/state"
)

// adoptOnlyFixture is a machine whose host configuration holds nothing but
// the server that is about to be adopted.
//
// It is deliberately unlike newAdoptFixture's config (which also carries a
// "theme" key): with unrelated content in the file, the restore's
// unowned-difference guard refuses the restore and the file is safe. With the
// adopted node as the file's ONLY content, every leaf of the file lies inside
// the owned locator, so the guard passes — which is exactly the case that
// reached the deletion.
type adoptOnlyFixture struct {
	home       string
	configPath string
	original   []byte
	db         *state.DB
}

func newAdoptOnlyFixture(t *testing.T) *adoptOnlyFixture {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	t.Setenv("LOCALAPPDATA", filepath.Join(home, "AppData", "Local"))

	configPath := filepath.Join(home, ".claude.json")
	original := []byte(`{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
`)
	if err := os.WriteFile(configPath, original, 0o600); err != nil {
		t.Fatal(err)
	}
	db, err := state.Open(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatalf("state.Open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return &adoptOnlyFixture{home: home, configPath: configPath, original: original, db: db}
}

// TestRestoreLeavesAnAdoptedHostConfigAlone is the regression: restoring an
// adopted install must not delete the user's host configuration, and must not
// discard the adopted node.
func TestRestoreLeavesAnAdoptedHostConfigAlone(t *testing.T) {
	fx := newAdoptOnlyFixture(t)
	ctx := context.Background()

	var out, errOut bytes.Buffer
	if code := runAdoptTo(&out, &errOut, fx.db, adoptOptions{name: "github", hostID: "claude-code"}); code != 0 {
		t.Fatalf("runAdoptTo = %d, want 0\nstdout:\n%s\nstderr:\n%s", code, out.String(), errOut.String())
	}
	installID := adoptInstallID("claude-code", "github", domain.ScopeUser)

	if _, err := os.Stat(fx.configPath); err != nil {
		t.Fatalf("the host config is gone before the restore: %v", err)
	}

	plan, err := planRestore(ctx, fx.db, installID)
	if err != nil {
		t.Fatalf("planRestore refused the adoption: %v", err)
	}
	for _, f := range plan.Files {
		if f.Created {
			t.Errorf("the restore plan marks %s as a file LiteSPM created; an adoption wrote nothing, so the plan would delete the user's config", f.Path)
		}
		if f.Backup != "" {
			t.Errorf("the restore plan names backup %q for an adoption; an adoption has no pre-install backup", f.Backup)
		}
	}

	if _, err := applyRestore(ctx, fx.db, filepath.Join(fx.home, "data"), plan); err != nil {
		t.Fatalf("applyRestore: %v", err)
	}

	got, err := os.ReadFile(fx.configPath)
	if err != nil {
		t.Fatalf("DATA LOSS: the restore deleted the user's host config %s: %v", fx.configPath, err)
	}
	if !bytes.Equal(got, fx.original) {
		t.Errorf("the host config is not byte-identical to what it was before the adoption:\n--- before ---\n%s\n--- after ---\n%s",
			fx.original, got)
	}
	if !strings.Contains(string(got), "server-github") {
		t.Errorf("the adopted entry was discarded instead of left alone:\n%s", got)
	}
}

// TestRestoreDropsTheAdoptionsOwnership proves the ownership is still undone:
// restoring an adoption releases the node, so a later `install remove` has
// nothing left to restore and LiteSPM no longer claims the entry.
func TestRestoreDropsTheAdoptionsOwnership(t *testing.T) {
	fx := newAdoptOnlyFixture(t)
	ctx := context.Background()

	var out, errOut bytes.Buffer
	if code := runAdoptTo(&out, &errOut, fx.db, adoptOptions{name: "github", hostID: "claude-code"}); code != 0 {
		t.Fatalf("runAdoptTo = %d, want 0\nstdout:\n%s\nstderr:\n%s", code, out.String(), errOut.String())
	}
	installID := adoptInstallID("claude-code", "github", domain.ScopeUser)

	plan, err := planRestore(ctx, fx.db, installID)
	if err != nil {
		t.Fatalf("planRestore: %v", err)
	}
	if _, err := applyRestore(ctx, fx.db, filepath.Join(fx.home, "data"), plan); err != nil {
		t.Fatalf("applyRestore: %v", err)
	}

	// The install row is gone: the ownership was released.
	if _, err := fx.db.GetInstall(ctx, installID); err == nil {
		t.Errorf("the adoption's install row survived the restore: LiteSPM still claims the node")
	}

	// And the node is still the user's, untouched.
	entryState, err := host.ReadServerEntryState(ctx, "claude-code", "github", "user", "")
	if err != nil {
		t.Fatalf("read the entry state after the restore: %v", err)
	}
	if entryState == nil {
		t.Fatal("the adopted entry is gone after the restore")
	}
}
