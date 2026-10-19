package invocation

import (
	"fmt"
	"unicode/utf8"

	"github.com/sarv-projects/litespm/internal/receipts"
)

// BoundOutput bounds a provider result to limit bytes.
//
// It returns the (possibly truncated) text, whether it was truncated, and the
// digest of the ORIGINAL bytes — the bytes a consumer of an untruncated
// result would verify — so a truncated result can still be checked against
// the receipt.
//
// The truncation is explicit: the marker names the original byte count, so a
// reader can tell a truncated result from a short one. A result is never
// silently dropped and never returned whole (ARCH/34 §5).
func BoundOutput(text string, limit int) (string, bool, string) {
	digest := receipts.DigestOf([]byte(text))
	if limit <= 0 || len(text) <= limit {
		return text, false, digest
	}
	cut := text[:limit]
	// Never split a multi-byte rune: the result must stay valid UTF-8.
	for len(cut) > 0 && !utf8.ValidString(cut) {
		cut = cut[:len(cut)-1]
	}
	marker := fmt.Sprintf("\n[truncated: %d bytes total, %d shown]", len(text), len(cut))
	return cut + marker, true, digest
}
