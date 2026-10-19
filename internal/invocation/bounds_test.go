package invocation

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/sarv-projects/litespm/internal/receipts"
)

// A result inside the bound is returned whole, and is not marked truncated.
func TestBoundOutputKeepsAShortResultIntact(t *testing.T) {
	const text = "a short result"
	got, truncated, digest := BoundOutput(text, 1024)
	if got != text {
		t.Errorf("text = %q, want %q", got, text)
	}
	if truncated {
		t.Error("a result inside the bound must not be marked truncated")
	}
	if digest != receipts.DigestOf([]byte(text)) {
		t.Errorf("digest = %q, want the digest of the text", digest)
	}
}

// An oversized result is truncated with an explicit marker that names the
// original size, and the digest is the digest of the ORIGINAL bytes.
func TestBoundOutputTruncatesAndNamesTheOriginalSize(t *testing.T) {
	original := strings.Repeat("x", 5000)
	got, truncated, digest := BoundOutput(original, 100)
	if !truncated {
		t.Error("an oversized result must be marked truncated")
	}
	if !strings.HasPrefix(got, strings.Repeat("x", 100)) {
		t.Errorf("the result must keep the first bytes: %q", got[:20])
	}
	if !strings.Contains(got, "5000") {
		t.Errorf("the marker must name the original byte count: %q", got)
	}
	if len(got) > 100+64 {
		t.Errorf("the result is %d bytes — it must stay bounded", len(got))
	}
	if digest != receipts.DigestOf([]byte(original)) {
		t.Errorf("digest = %q, want the digest of the original bytes", digest)
	}
}

// The bound cuts bytes, not runes: a truncated result must stay valid UTF-8.
func TestBoundOutputNeverSplitsARune(t *testing.T) {
	original := strings.Repeat("é", 100) // two bytes per rune
	got, truncated, _ := BoundOutput(original, 51)
	if !truncated {
		t.Fatal("the result must be marked truncated")
	}
	if !utf8.ValidString(got) {
		t.Error("the truncated result is not valid UTF-8")
	}
}
