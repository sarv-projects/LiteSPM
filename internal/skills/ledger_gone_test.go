package skills

import (
	"os"
	"path/filepath"
	"testing"
)

// A skill whose directory was deleted outside LiteSPM must still be removable:
// the row is cleared, not kept forever as an unremovable ghost.
func TestRemoveClearsARowWhoseDirectoryIsGone(t *testing.T) {
	root := t.TempDir()
	ledger, err := OpenLedger(filepath.Join(t.TempDir(), "skills-ledger.json"))
	if err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(root, ".claude", "skills", "pdf")
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := ledger.Add([]LedgerEntry{{SkillName: "pdf", DestDir: dest}}); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(dest); err != nil {
		t.Fatal(err)
	}
	outcomes, err := ledger.Remove([]string{"pdf"}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(outcomes) != 1 || !outcomes[0].Removed {
		t.Fatalf("outcome %+v, want removed", outcomes)
	}
	left, err := ledger.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(left) != 0 {
		t.Fatalf("ghost row kept: %+v", left)
	}
}
