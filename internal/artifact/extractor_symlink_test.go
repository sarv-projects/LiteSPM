package artifact

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestExtractRefusesPlantedSymlinks reproduces F7: extraction must never write
// through a symlink that already sits in the staging directory. A local actor
// with write access to the staging tree can pre-plant
//
//   - a symlink AT the leaf the archive is about to write, and
//   - a symlink AT a PARENT component of the entry's path,
//
// and for both archive formats the extraction must either refuse or replace
// the link without following it. The link target must stay byte-identical.
func TestExtractRefusesPlantedSymlinks(t *testing.T) {
	for _, format := range []string{"zip", "tar.gz"} {
		t.Run(format, func(t *testing.T) {
			archive := func(t *testing.T, files map[string][]byte) []byte {
				t.Helper()
				if format == "zip" {
					return createTestZip(t, files)
				}
				return createTestTarGz(t, files)
			}

			t.Run("pre-planted leaf symlink", func(t *testing.T) {
				tempDir := t.TempDir()
				stagingDir := filepath.Join(tempDir, "staging")
				if err := os.MkdirAll(stagingDir, 0o700); err != nil {
					t.Fatal(err)
				}

				target := filepath.Join(tempDir, "outside-target")
				const untouched = "do not overwrite me\n"
				if err := os.WriteFile(target, []byte(untouched), 0o644); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(target, filepath.Join(stagingDir, "payload.txt")); err != nil {
					t.Skipf("symlinks unsupported: %v", err)
				}

				archivePath := filepath.Join(tempDir, "archive")
				data := archive(t, map[string][]byte{"payload.txt": []byte("from the archive\n")})
				if err := os.WriteFile(archivePath, data, 0o644); err != nil {
					t.Fatal(err)
				}

				if _, err := ExtractFileSafely(archivePath, format, stagingDir, DefaultExtractionLimits); err != nil {
					// A refusal is acceptable: nothing was written through.
					_ = err
				} else {
					// Otherwise the leaf must now be a real file, not the link.
					fi, lerr := os.Lstat(filepath.Join(stagingDir, "payload.txt"))
					if lerr != nil || fi.Mode()&os.ModeSymlink != 0 {
						t.Fatalf("extraction succeeded but left a symlink at the leaf: %v (err=%v)", fi, lerr)
					}
					if b, rerr := os.ReadFile(filepath.Join(stagingDir, "payload.txt")); rerr != nil || string(b) != "from the archive\n" {
						t.Fatalf("extracted leaf content = %q, err=%v", b, rerr)
					}
				}
				if b, rerr := os.ReadFile(target); rerr != nil || string(b) != untouched {
					t.Fatalf("the leaf symlink target was written through: content=%q err=%v", b, rerr)
				}
			})

			t.Run("pre-planted symlinked parent", func(t *testing.T) {
				tempDir := t.TempDir()
				stagingDir := filepath.Join(tempDir, "staging")
				if err := os.MkdirAll(stagingDir, 0o700); err != nil {
					t.Fatal(err)
				}

				outside := filepath.Join(tempDir, "outside")
				if err := os.MkdirAll(outside, 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(outside, filepath.Join(stagingDir, "dir")); err != nil {
					t.Skipf("symlinks unsupported: %v", err)
				}

				archivePath := filepath.Join(tempDir, "archive")
				data := archive(t, map[string][]byte{"dir/payload.txt": []byte("escaped\n")})
				if err := os.WriteFile(archivePath, data, 0o644); err != nil {
					t.Fatal(err)
				}

				_, err := ExtractFileSafely(archivePath, format, stagingDir, DefaultExtractionLimits)
				if err == nil {
					t.Fatal("extraction through a symlinked parent must be refused")
				}
				if !strings.Contains(err.Error(), "symlink") {
					t.Fatalf("refusal must name the symlink, got: %v", err)
				}
				if _, serr := os.Lstat(filepath.Join(outside, "payload.txt")); !os.IsNotExist(serr) {
					t.Fatalf("extraction wrote through the symlinked parent (stat err=%v)", serr)
				}
				fi, lerr := os.Lstat(filepath.Join(stagingDir, "dir"))
				if lerr != nil || fi.Mode()&os.ModeSymlink == 0 {
					t.Fatalf("the pre-planted parent symlink must be left untouched: %v (err=%v)", fi, lerr)
				}
			})
		})
	}
}
