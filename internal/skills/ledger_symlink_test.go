package skills

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestRemovalRefusesMidPathSymlink reproduces S3: the removal guard Lstat'd
// only the LEAF destination, so a symlink at a parent component was traversed
// and os.RemoveAll deleted a real directory outside the ledger root.
//
// Policy: any symlink component between the skills root that confines the
// destination and the leaf is refused, with and without Force. The subtree
// behind the link must stay byte-identical.
func TestRemovalRefusesMidPathSymlink(t *testing.T) {
	t.Run("symlinked parent directory", func(t *testing.T) {
		tmp := t.TempDir()
		root := filepath.Join(tmp, "root")
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatal(err)
		}

		// The victim is a real skill directory OUTSIDE the ledger root.
		elsewhere := filepath.Join(tmp, "elsewhere")
		victim := filepath.Join(elsewhere, "demo")
		writeSkill(t, victim)
		if err := os.WriteFile(filepath.Join(victim, "payload.txt"), []byte("victim bytes\n"), 0o644); err != nil {
			t.Fatal(err)
		}

		// The configured skills root contains `skills` as a symlink to
		// elsewhere, so the lexical destination <root>/skills/demo resolves
		// to the real <tmp>/elsewhere/demo.
		if err := os.Symlink(elsewhere, filepath.Join(root, "skills")); err != nil {
			t.Skipf("symlinks unsupported: %v", err)
		}

		l, _ := testLedger(t, filepath.Join(root, "ledger.json"))
		prov, err := CaptureProvenance(victim)
		if err != nil {
			t.Fatal(err)
		}
		_ = l.Add([]LedgerEntry{{
			SkillName: "demo",
			DestDir:   filepath.Join(root, "skills", "demo"),
			Scope:     "project",
			Inventory: prov.Inventory,
		}})

		for _, force := range []bool{false, true} {
			outcomes, err := l.RemoveScoped(RemoveOptions{Scope: "project", Force: force})
			if err != nil {
				t.Fatal(err)
			}
			if len(outcomes) != 1 || outcomes[0].Removed {
				t.Fatalf("force=%v: a mid-path symlink must be refused, got %+v", force, outcomes)
			}
			if !strings.Contains(outcomes[0].Reason, "symlink") {
				t.Fatalf("force=%v: refusal must mention symlink: %q", force, outcomes[0].Reason)
			}
		}

		after, err := CaptureProvenance(victim)
		if err != nil {
			t.Fatalf("the victim tree must remain capturable: %v", err)
		}
		if after.Digest != prov.Digest {
			t.Fatalf("the victim tree changed: digest %s -> %s", prov.Digest, after.Digest)
		}
	})

	t.Run("symlinked leaf under the ledger root", func(t *testing.T) {
		tmp := t.TempDir()
		root := filepath.Join(tmp, "root")
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatal(err)
		}

		// The ledger root contains `demo` as a symlink to <tmp>/elsewhere/victim,
		// a directory with a file inside.
		victim := filepath.Join(tmp, "elsewhere", "victim")
		writeSkill(t, victim)
		if err := os.WriteFile(filepath.Join(victim, "payload.txt"), []byte("victim bytes\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(victim, filepath.Join(root, "demo")); err != nil {
			t.Skipf("symlinks unsupported: %v", err)
		}

		l, _ := testLedger(t, filepath.Join(root, "ledger.json"))
		prov, err := CaptureProvenance(victim)
		if err != nil {
			t.Fatal(err)
		}
		_ = l.Add([]LedgerEntry{{SkillName: "demo", DestDir: filepath.Join(root, "demo"), Scope: "project", Inventory: prov.Inventory}})

		for _, force := range []bool{false, true} {
			outcomes, err := l.RemoveScoped(RemoveOptions{Scope: "project", Force: force})
			if err != nil {
				t.Fatal(err)
			}
			if len(outcomes) != 1 || outcomes[0].Removed {
				t.Fatalf("force=%v: a symlinked destination must be refused, got %+v", force, outcomes)
			}
			if !strings.Contains(outcomes[0].Reason, "symlink") {
				t.Fatalf("force=%v: refusal must mention symlink: %q", force, outcomes[0].Reason)
			}
		}

		after, err := CaptureProvenance(victim)
		if err != nil {
			t.Fatalf("the victim tree must remain capturable: %v", err)
		}
		if after.Digest != prov.Digest {
			t.Fatalf("the victim tree changed: digest %s -> %s", prov.Digest, after.Digest)
		}
	})
}
