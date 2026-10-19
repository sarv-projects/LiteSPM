package install

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A promotion that has to copy stages the copy OUTSIDE the CAS tree store.
//
// The old shape wrote the partial tree beside its destination
// (`<digest>.tmp-<nanos>`), inside `trees/<algo>/`, where every reader of that
// directory had to know to ignore it — and a crash between the copy and the
// rename left it there for good. The scratch directory is now a dedicated one
// under the CAS root: a name there can never be mistaken for a tree, and the
// promotion's own cleanup removes it.
func TestPromoteTreeStagesOutsideTheTreeStore(t *testing.T) {
	root := t.TempDir()

	src := filepath.Join(root, "staged")
	if err := os.MkdirAll(src, 0o700); err != nil {
		t.Fatalf("failed to create the staged tree: %v", err)
	}
	if err := os.WriteFile(filepath.Join(src, "SKILL.md"), []byte("skill\n"), 0o600); err != nil {
		t.Fatalf("failed to write the staged file: %v", err)
	}

	// A destination whose parent is a regular file. The first rename fails
	// (ENOTDIR), the Lstat fails too (the parent is not a directory), so the
	// copy-then-rename path runs — and its final rename fails the same way.
	trees := filepath.Join(root, "trees")
	if err := os.WriteFile(trees, []byte("not a directory"), 0o600); err != nil {
		t.Fatalf("failed to write the blocking file: %v", err)
	}
	dst := filepath.Join(trees, "sha256", "deadbeef")
	scratch := filepath.Join(root, "tmp")

	created, err := promoteTree(src, dst, scratch)
	if err == nil {
		t.Fatalf("promoteTree into a non-directory parent = (%t, nil), want an error", created)
	}
	if created {
		t.Fatal("promoteTree reported a created tree for a promotion that failed")
	}

	// The staged copy is gone: the scratch directory is empty.
	entries, err := os.ReadDir(scratch)
	if err != nil && !os.IsNotExist(err) {
		t.Fatalf("failed to read the promotion scratch dir: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("promotion scratch %s holds %d leftovers after a failed promotion", scratch, len(entries))
	}

	// And nothing that looks like a promotion temp was left inside the tree
	// store — the shape this test exists to prevent.
	var offenders []string
	err = filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if strings.Contains(d.Name(), ".tmp-") {
			offenders = append(offenders, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("failed to walk the CAS root: %v", err)
	}
	if len(offenders) != 0 {
		t.Fatalf("promotion left a temp tree inside the CAS store: %v", offenders)
	}
}

// The scratch directory is created on demand and holds one directory per
// promotion, so two promotions of different trees cannot collide.
func TestPromoteTreeScratchIsUniquePerCall(t *testing.T) {
	root := t.TempDir()
	scratch := filepath.Join(root, "tmp")

	for i := 0; i < 2; i++ {
		src := filepath.Join(root, "staged", string(rune('a'+i)))
		if err := os.MkdirAll(src, 0o700); err != nil {
			t.Fatalf("failed to create the staged tree: %v", err)
		}
		if err := os.WriteFile(filepath.Join(src, "a.txt"), []byte("x"), 0o600); err != nil {
			t.Fatalf("failed to write the staged file: %v", err)
		}
		// A destination that already exists: the promotion reports that it
		// lost the race and leaves the staged tree alone.
		dst := filepath.Join(root, "trees", "sha256", "existing")
		if err := os.MkdirAll(dst, 0o700); err != nil {
			t.Fatalf("failed to create the destination: %v", err)
		}
		created, err := promoteTree(src, dst, scratch)
		if err != nil {
			t.Fatalf("promoteTree into an existing destination: %v", err)
		}
		if created {
			t.Fatal("promoteTree claimed to create a destination that already existed")
		}
	}

	entries, err := os.ReadDir(scratch)
	if err != nil && !os.IsNotExist(err) {
		t.Fatalf("failed to read the promotion scratch dir: %v", err)
	}
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), "promote-") {
			t.Fatalf("the promotion scratch holds %q, which is not a promotion directory", entry.Name())
		}
	}
}
