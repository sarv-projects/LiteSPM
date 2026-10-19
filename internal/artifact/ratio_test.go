package artifact

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ARCH/05 §2.1 requires a compression-ratio bound: an archive must not expand
// to a small multiple of its compressed size. A size limit alone does not
// stop a bomb — 8 MiB of zeroes is a few KiB on the wire and a perfectly
// ordinary 8 MiB on disk — so the ratio is checked while the tree is written.
//
// The check is applied to the bytes actually streamed out of the archive, not
// only to the sizes the archive declares, so a file that lies about its own
// length is caught too.

// A zip whose payload is highly compressible must be refused once its
// expansion passes the permitted ratio.
func TestExtractZipRefusesCompressionBomb(t *testing.T) {
	tempDir := t.TempDir()
	// 8 MiB of a single repeated byte deflates to a few KiB.
	bomb := createTestZip(t, map[string][]byte{
		"data.bin": []byte(strings.Repeat("\x00", 8*1024*1024)),
	})
	zipPath := filepath.Join(tempDir, "bomb.zip")
	if err := os.WriteFile(zipPath, bomb, 0o644); err != nil {
		t.Fatal(err)
	}

	limits := limitsFor(func(l *ExtractionLimits) { l.MaxCompressionRatio = 100 })
	_, err := ExtractFileSafely(zipPath, "zip", filepath.Join(tempDir, "staging"), limits)
	if err == nil {
		t.Fatal("expected the compression-ratio bound to refuse the archive")
	}
	if !strings.Contains(err.Error(), "compression ratio") {
		t.Errorf("the refusal must name the ratio, got: %v", err)
	}
	if !strings.Contains(err.Error(), "LPSM-CAS-ARCHIVE-SLIP") {
		t.Errorf("error must carry the archive-slip class, got: %v", err)
	}
}

// Same bound for tar.gz.
func TestExtractTarGzRefusesCompressionBomb(t *testing.T) {
	tempDir := t.TempDir()
	bomb := createTestTarGz(t, map[string][]byte{
		"data.bin": []byte(strings.Repeat("\x00", 8*1024*1024)),
	})
	path := filepath.Join(tempDir, "bomb.tar.gz")
	if err := os.WriteFile(path, bomb, 0o644); err != nil {
		t.Fatal(err)
	}

	limits := limitsFor(func(l *ExtractionLimits) { l.MaxCompressionRatio = 100 })
	_, err := ExtractFileSafely(path, "tar.gz", filepath.Join(tempDir, "staging"), limits)
	if err == nil {
		t.Fatal("expected the compression-ratio bound to refuse the archive")
	}
	if !strings.Contains(err.Error(), "compression ratio") {
		t.Errorf("the refusal must name the ratio, got: %v", err)
	}
}

// A normal archive must still extract: the bound refuses bombs, not content.
// Incompressible bytes keep the ratio near 1:1.
func TestExtractAllowsArchiveWithinCompressionRatio(t *testing.T) {
	tempDir := t.TempDir()
	payload := make([]byte, 512*1024)
	for i := range payload {
		payload[i] = byte(i*7 + i/251)
	}
	archive := createTestZip(t, map[string][]byte{"data.bin": payload})
	zipPath := filepath.Join(tempDir, "normal.zip")
	if err := os.WriteFile(zipPath, archive, 0o644); err != nil {
		t.Fatal(err)
	}

	info, err := ExtractFileSafely(zipPath, "zip", filepath.Join(tempDir, "staging"), DefaultExtractionLimits)
	if err != nil {
		t.Fatalf("a normal archive must extract, got: %v", err)
	}
	if info.TotalBytes != int64(len(payload)) {
		t.Errorf("expected %d extracted bytes, got %d", len(payload), info.TotalBytes)
	}
}

// The ratio bound is a backstop behind the absolute size limits, so it must
// not refuse a small archive whose absolute size is still tiny. A 64 KiB
// payload that deflates 200:1 is well under any absolute limit.
func TestRatioBoundDoesNotRefuseSmallArchives(t *testing.T) {
	tempDir := t.TempDir()
	small := createTestZip(t, map[string][]byte{
		"tiny.bin": []byte(strings.Repeat("\x00", 64*1024)),
	})
	zipPath := filepath.Join(tempDir, "small.zip")
	if err := os.WriteFile(zipPath, small, 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := ExtractFileSafely(zipPath, "zip", filepath.Join(tempDir, "staging"), DefaultExtractionLimits); err != nil {
		t.Fatalf("a small archive must extract, got: %v", err)
	}
}
