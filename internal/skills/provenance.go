package skills

// provenance.go — content evidence for installed skill directories.
//
// The install ledger originally recorded only a path, a source label, and a
// timestamp. That is not enough to answer two questions that matter later:
//
//   - "is the installed copy the same content as the source I am about to
//     fetch again?" (Update needs this to report an honest no-op);
//   - "has anyone changed this directory since we wrote it?" (Remove must not
//     silently destroy files the user added inside an installed skill).
//
// CaptureProvenance answers both. It walks a skill directory (never following
// symlinks) and produces a deterministic tree digest plus a file inventory of
// relative paths and sizes. The inventory is the list of files this tool
// created; anything else found at removal time is treated as user content.

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
)

// FileRecord is one regular file recorded at install time.
type FileRecord struct {
	// Path is the slash-separated path relative to the skill directory.
	Path string `json:"path"`
	// Size is the file size in bytes at capture time.
	Size int64 `json:"size"`
}

// Provenance is the recorded evidence for one installed skill directory.
type Provenance struct {
	// Digest is a sha256 over the sorted inventory (path, size, content) of
	// every regular file in the tree. It is empty only when the directory has
	// no regular files.
	Digest string
	// Inventory lists every regular file captured, sorted by path.
	Inventory []FileRecord
}

// CaptureProvenance fingerprints a skill directory. Symlinks and non-regular
// files are refused (never followed), matching CopySkillDir: the ledger and
// the copy must agree on what a skill tree may contain. VCS metadata (.git) is
// not part of an installed skill and is skipped.
func CaptureProvenance(dir string) (Provenance, error) {
	return captureProvenance(dir, true)
}

// CapturePreImage fingerprints a REPLACED tree verbatim, including its .git
// directory (and any other dot-directory CopySkillDir would skip). The
// pre-image digest is the ledger's proof of what a forced overwrite or update
// destroyed, so it must cover exactly the bytes the pre-image backup holds:
// the .git-skipping digest used to "match" a backup that silently omitted
// .git, certifying a restore that could never be complete.
//
// The refusals are identical to CaptureProvenance: symlinks and non-regular
// files make the tree un-preservable, and an un-preservable tree is refused
// before anything destructive happens, never half-backuped.
func CapturePreImage(dir string) (Provenance, error) {
	return captureProvenance(dir, false)
}

func captureProvenance(dir string, skipVCS bool) (Provenance, error) {
	info, err := os.Lstat(dir)
	if err != nil {
		return Provenance{}, err
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return Provenance{}, fmt.Errorf("refusing to inventory symlink %s", dir)
	}
	if !info.IsDir() {
		return Provenance{}, fmt.Errorf("not a directory: %s", dir)
	}

	h := sha256.New()
	var inventory []FileRecord
	err = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == dir {
			return nil
		}
		if skipVCS && d.Name() == ".git" {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&fs.ModeSymlink != 0 {
			rel, _ := filepath.Rel(dir, path)
			return fmt.Errorf("refusing to inventory symlink %s", filepath.ToSlash(rel))
		}
		if d.IsDir() {
			return nil
		}
		if !d.Type().IsRegular() {
			rel, _ := filepath.Rel(dir, path)
			return fmt.Errorf("refusing to inventory non-regular file %s", filepath.ToSlash(rel))
		}
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		fi, err := d.Info()
		if err != nil {
			return err
		}
		inventory = append(inventory, FileRecord{Path: rel, Size: fi.Size()})

		// Bind the boundary (path + size) into the digest so two files whose
		// contents happen to concatenate identically do not collide.
		if _, err := fmt.Fprintf(h, "%s\x00%d\x00", rel, fi.Size()); err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(h, f)
		closeErr := f.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		if _, err := h.Write([]byte{0}); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return Provenance{}, err
	}
	sort.Slice(inventory, func(i, j int) bool { return inventory[i].Path < inventory[j].Path })
	return Provenance{Digest: hex.EncodeToString(h.Sum(nil)), Inventory: inventory}, nil
}
