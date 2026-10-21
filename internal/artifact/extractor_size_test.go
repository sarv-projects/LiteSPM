package artifact

// extractor_size_test.go — the archive's own size claims are checked.
//
// The extractor wrote at most declaredSize+1 bytes and never compared what it
// wrote with what the archive DECLARED. A truncated entry was therefore
// written short and accepted, and the tree digest then covered the truncated
// bytes — so the install succeeded with a silently corrupt file and recorded
// the corruption as the truth.
//
// The check is in both directions: fewer bytes than declared means the
// archive is inconsistent with itself, and more means the entry was
// truncated rather than installed.
//
// (A zip whose declared size lies is already refused by Go's own reader,
// which validates the CRC and the size at the header. The tar path is the
// reachable one: a truncated archive yields fewer bytes than its header
// claims, and that is what these tests pin.)

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteBoundedFileRefusesAnEntryShorterThanItClaims(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "notes.txt")

	// The archive claims 5 bytes and produces 2.
	err := writeBoundedFile(strings.NewReader("ab"), target, 5, 1024)
	if err == nil {
		t.Fatal("an entry shorter than it declared was written and accepted")
	}
	if !strings.Contains(err.Error(), "declares") {
		t.Errorf("the refusal does not say the size did not match: %v", err)
	}
	// And nothing is left behind that a later step could mistake for the
	// file's real content.
	if _, statErr := os.Stat(target); statErr == nil {
		data, _ := os.ReadFile(target)
		t.Errorf("the short file was left on disk: %q", data)
	}
}

func TestWriteBoundedFileRefusesAnEntryLongerThanItClaims(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "notes.txt")

	// The archive claims 5 bytes and produces 50.
	err := writeBoundedFile(bytes.NewReader([]byte(strings.Repeat("x", 50))), target, 5, 1024)
	if err == nil {
		t.Fatal("an entry longer than it declared was written truncated and accepted")
	}
	if !strings.Contains(err.Error(), "declares") {
		t.Errorf("the refusal does not say the size did not match: %v", err)
	}
	if _, statErr := os.Stat(target); statErr == nil {
		data, _ := os.ReadFile(target)
		t.Errorf("the truncated file was left on disk: %q", data)
	}
}

func TestWriteBoundedFileAcceptsAnEntryThatMatches(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "notes.txt")

	content := []byte("exactly this many bytes")
	if err := writeBoundedFile(bytes.NewReader(content), target, int64(len(content)), 1024); err != nil {
		t.Fatalf("an entry that matched its declared size was refused: %v", err)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, content) {
		t.Errorf("the file does not hold what the archive held:\n got %q\nwant %q", got, content)
	}
}
