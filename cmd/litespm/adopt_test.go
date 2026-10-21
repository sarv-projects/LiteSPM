package main

// adopt_test.go — `litespm adopt`: the ownership flow.
//
// The two properties this file pins:
//
//  1. Adopting records an ownership row whose PRE-IMAGE is the node as it
//     stands, and it does not touch the host's configuration file.
//  2. Removing an adopted node puts the file back exactly as it was —
//     byte-identical, down to the formatting of the entry.
//
// And the refusal: a name the host's config does not register is refused with
// LPSM-HOST-CONFIG-NOT-FOUND, because adopting it would record ownership of
// a node that does not exist.

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/deployment"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/state"
)

// adoptFixture is a machine with one agent config that already registers a
// server LiteSPM did not install.
type adoptFixture struct {
	home       string
	configPath string
	original   []byte
	db         *state.DB
}

// newAdoptFixture builds the machine and opens a state database for it.
func newAdoptFixture(t *testing.T) *adoptFixture {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	t.Setenv("LOCALAPPDATA", filepath.Join(home, "AppData", "Local"))

	configPath := filepath.Join(home, ".claude.json")
	original := []byte(`{
  // my own settings
  "theme": "One Dark",
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
	return &adoptFixture{home: home, configPath: configPath, original: original, db: db}
}

// configBytes reads the host config as it is right now.
func (f *adoptFixture) configBytes(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile(f.configPath)
	if err != nil {
		t.Fatalf("read the host config: %v", err)
	}
	return data
}

// TestAdoptRecordsOwnershipWithTheCurrentImage proves the adoption records an
// ownership row whose pre-image is the node as it was, and that it does not
// write to the host's configuration.
func TestAdoptRecordsOwnershipWithTheCurrentImage(t *testing.T) {
	fx := newAdoptFixture(t)
	ctx := context.Background()

	var out, errOut bytes.Buffer
	if code := runAdoptTo(&out, &errOut, fx.db, adoptOptions{name: "github", hostID: "claude-code"}); code != 0 {
		t.Fatalf("runAdoptTo = %d, want 0\nstdout:\n%s\nstderr:\n%s", code, out.String(), errOut.String())
	}

	// The host config was NOT touched: adoption changes LiteSPM's ledger
	// only.
	if got := fx.configBytes(t); !bytes.Equal(got, fx.original) {
		t.Errorf("adoption rewrote the host config:\n%s", got)
	}

	// The ledger holds one ownership row for this locator, and its pre-image
	// is the entry as it was.
	installID := adoptInstallID("claude-code", "github", domain.ScopeUser)
	muts, err := deployment.NewLedger(fx.db.Raw()).MutationsForInstall(ctx, installID)
	if err != nil {
		t.Fatalf("MutationsForInstall: %v", err)
	}
	if len(muts) != 1 {
		t.Fatalf("the ledger holds %d rows for the adoption, want 1: %+v", len(muts), muts)
	}
	m := muts[0]
	if m.HostID != "claude-code" {
		t.Errorf("the row names host %q, want %q", m.HostID, "claude-code")
	}
	if m.Locator != "mcpServers.github" {
		t.Errorf("the row names locator %q, want %q", m.Locator, "mcpServers.github")
	}
	if !deployment.IsAdoption(m) {
		t.Errorf("the row is not marked as an adoption (owner %q)", m.Owner)
	}
	entryState, err := host.ReadServerEntryState(ctx, "claude-code", "github", domain.ScopeUser, "")
	if err != nil || entryState == nil {
		t.Fatalf("read the entry state: %v %v", entryState, err)
	}
	if m.PreImageHash != entryState.Fingerprint {
		t.Errorf("the pre-image is %q, want the entry's own fingerprint %q", m.PreImageHash, entryState.Fingerprint)
	}
	if m.PostImageHash != m.PreImageHash {
		t.Errorf("an adoption writes nothing, so the post-image must equal the pre-image: %q vs %q",
			m.PostImageHash, m.PreImageHash)
	}
	if m.PriorEntry == "" {
		t.Error("the row records no prior entry, so a removal would have nothing to restore")
	}
	if !strings.Contains(m.PriorEntry, "server-github") {
		t.Errorf("the prior entry does not carry the node's own text: %q", m.PriorEntry)
	}
}

// TestRemovingAnAdoptedNodeRestoresThePreImage proves the point of the
// feature: removing an adopted node leaves the host's configuration exactly
// as it was. The entry is RESTORED, not deleted — LiteSPM never created it.
func TestRemovingAnAdoptedNodeRestoresThePreImage(t *testing.T) {
	fx := newAdoptFixture(t)
	ctx := context.Background()

	var out, errOut bytes.Buffer
	if code := runAdoptTo(&out, &errOut, fx.db, adoptOptions{name: "github", hostID: "claude-code"}); code != 0 {
		t.Fatalf("runAdoptTo = %d, want 0\nstdout:\n%s\nstderr:\n%s", code, out.String(), errOut.String())
	}
	installID := adoptInstallID("claude-code", "github", domain.ScopeUser)

	if err := removeInstalledPackage(ctx, fx.db, filepath.Join(fx.home, "data"), installID); err != nil {
		t.Fatalf("remove the adopted install: %v", err)
	}

	got := fx.configBytes(t)
	if !bytes.Equal(got, fx.original) {
		t.Errorf("the host config is not byte-identical to what it was before the adoption:\n--- before ---\n%s\n--- after ---\n%s",
			fx.original, got)
	}
	// The entry is still there: it is the user's, and it was never LiteSPM's
	// to delete.
	if !strings.Contains(string(got), "server-github") {
		t.Errorf("the adopted entry was deleted instead of restored:\n%s", got)
	}
	// And the ownership is gone.
	muts, err := deployment.NewLedger(fx.db.Raw()).MutationsForInstall(ctx, installID)
	if err != nil {
		t.Fatalf("MutationsForInstall: %v", err)
	}
	if len(muts) != 0 {
		t.Errorf("the ownership row survived the removal: %+v", muts)
	}
}

// TestAdoptRefusesANameTheHostDoesNotRegister proves the fail-closed rule: an
// adoption of something LiteSPM does not see is refused, with the typed code
// the plan names.
func TestAdoptRefusesANameTheHostDoesNotRegister(t *testing.T) {
	fx := newAdoptFixture(t)

	var out, errOut bytes.Buffer
	code := runAdoptTo(&out, &errOut, fx.db, adoptOptions{name: "not-there", hostID: "claude-code"})
	if code == 0 {
		t.Fatalf("the adoption of a name the host does not register succeeded:\n%s", out.String())
	}
	if !strings.Contains(errOut.String(), "LPSM-HOST-CONFIG-NOT-FOUND") {
		t.Errorf("the refusal does not carry the typed code:\n%s", errOut.String())
	}
	// Nothing was recorded.
	installs, err := fx.db.ListInstalls(context.Background(), domain.ScopeUser, "")
	if err != nil {
		t.Fatalf("ListInstalls: %v", err)
	}
	if len(installs) != 0 {
		t.Errorf("a refused adoption recorded %d install row(s)", len(installs))
	}
	// And the config was not touched.
	if got := fx.configBytes(t); !bytes.Equal(got, fx.original) {
		t.Errorf("a refused adoption rewrote the host config:\n%s", got)
	}
}

// TestAdoptRefusesAnUnknownHost proves an unknown host is a refusal, not a
// silent success.
func TestAdoptRefusesAnUnknownHost(t *testing.T) {
	fx := newAdoptFixture(t)
	var out, errOut bytes.Buffer
	if code := runAdoptTo(&out, &errOut, fx.db, adoptOptions{name: "github", hostID: "no-such-host"}); code == 0 {
		t.Fatalf("the adoption on an unknown host succeeded:\n%s", out.String())
	}
	if !strings.Contains(errOut.String(), "no-such-host") {
		t.Errorf("the refusal does not name the host:\n%s", errOut.String())
	}
}

// TestAdoptUsageErrorsAreUsageErrors proves the parser is strict.
func TestAdoptUsageErrorsAreUsageErrors(t *testing.T) {
	cases := [][]string{
		{},
		{"github"},
		{"github", "--host"},
		{"github", "--host", "claude-code", "extra"},
		{"github", "--host", "claude-code", "--nope"},
	}
	for _, args := range cases {
		if _, err := parseAdoptArgs(args); err == nil {
			t.Errorf("parseAdoptArgs(%v) accepted a usage error", args)
		}
	}
}

// TestAdoptedEntryEditedByTheUserIsKept proves the review focus: a node the
// user edits after the adoption is KEPT when the ownership is removed, exactly
// like a node LiteSPM installed.
func TestAdoptedEntryEditedByTheUserIsKept(t *testing.T) {
	fx := newAdoptFixture(t)
	ctx := context.Background()

	var out, errOut bytes.Buffer
	if code := runAdoptTo(&out, &errOut, fx.db, adoptOptions{name: "github", hostID: "claude-code"}); code != 0 {
		t.Fatalf("runAdoptTo = %d, want 0\nstderr:\n%s", code, errOut.String())
	}
	installID := adoptInstallID("claude-code", "github", domain.ScopeUser)

	// The user edits the node after the adoption.
	edited := []byte(`{
  // my own settings
  "theme": "One Dark",
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github", "--edited-by-me"]
    }
  }
}
`)
	if err := os.WriteFile(fx.configPath, edited, 0o600); err != nil {
		t.Fatal(err)
	}

	if err := removeInstalledPackage(ctx, fx.db, filepath.Join(fx.home, "data"), installID); err != nil {
		t.Fatalf("remove the adopted install: %v", err)
	}
	got := fx.configBytes(t)
	if !bytes.Equal(got, edited) {
		t.Errorf("a node the user edited was not kept:\n%s", got)
	}
	if !strings.Contains(string(got), "--edited-by-me") {
		t.Errorf("the user's edit was lost:\n%s", got)
	}
}

// TestAdoptRecordsTheEntryInTheInstallLedger proves the adoption is visible
// as an install, so `litespm list` and `litespm install remove` can see it.
func TestAdoptRecordsTheEntryInTheInstallLedger(t *testing.T) {
	fx := newAdoptFixture(t)
	ctx := context.Background()

	var out, errOut bytes.Buffer
	if code := runAdoptTo(&out, &errOut, fx.db, adoptOptions{name: "github", hostID: "claude-code"}); code != 0 {
		t.Fatalf("runAdoptTo = %d, want 0\nstderr:\n%s", code, errOut.String())
	}
	installs, err := fx.db.ListInstalls(ctx, domain.ScopeUser, "")
	if err != nil {
		t.Fatalf("ListInstalls: %v", err)
	}
	if len(installs) != 1 {
		t.Fatalf("the adoption recorded %d install rows, want 1", len(installs))
	}
	rec := installs[0]
	if rec.Kind != domain.KindMCP {
		t.Errorf("the install row has kind %q, want %q", rec.Kind, domain.KindMCP)
	}
	if rec.Status != domain.InstallActive {
		t.Errorf("the install row has status %q, want %q", rec.Status, domain.InstallActive)
	}
	if rec.InstalledAt.IsZero() || time.Since(rec.InstalledAt) > time.Hour {
		t.Errorf("the install row has no sensible install time: %v", rec.InstalledAt)
	}
	comps, err := fx.db.ListInstallComponents(ctx, rec.InstallID)
	if err != nil {
		t.Fatalf("ListInstallComponents: %v", err)
	}
	if len(comps) != 1 || comps[0].ComponentName != "github" {
		t.Errorf("the adoption recorded the wrong components: %+v", comps)
	}
}
