// width.go — measuring a string the way the terminal will draw it.
//
// The interactive prompt aligns skill names and descriptions into columns with
// `%-32s`-style padding, which counts BYTES (or, with a width verb, runes) —
// not the cells a terminal actually advances. A skill named 文档检索 is 12
// bytes but 8 cells; one named 🎉 deploy is 13 bytes but 9 cells. Padding to
// the byte count over-pads both, and every column to their right drifts.
//
// So: measure cells first, pad to the measurement. The classification here
// follows Unicode's East Asian Width (Wide and Fullwidth are 2 cells, the
// rest 1) plus the zero-width sets terminals skip, in the shape of the
// reference implementation's approxStringWidth table.
package skills

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// DisplayWidth returns how many terminal cells s occupies when printed.
//
// Terminal escapes are stripped first via stripTerminalEscapes (the tested
// stripper sanitize.go already uses), so colour codes and cursor motion
// occupy no cells. Control characters (C0, DEL, C1 — including the tab and
// newline that strip keeps) measure 0, as do combining marks, variation
// selectors, format characters such as ZWJ, and skin-tone modifiers.
// East-Asian-Wide and East-Asian-Fullwidth code points — CJK ideographs,
// Hangul syllables, fullwidth forms, the common emoji blocks — measure 2;
// everything else measures 1.
//
// Honest limitation: this is per-CODE-POINT measurement, not grapheme
// clustering. ZWJ sequences are approximated as the sum of their visible
// parts with the joins counted zero — the family emoji 👨‍👩‍👧 (man ZWJ woman
// ZWJ girl) measures 6 here even though a conforming terminal draws it in 2
// cells. The value for such sequences is an estimate; the code does not
// claim otherwise.
func DisplayWidth(s string) int {
	s = stripTerminalEscapes(s)
	width := 0
	for _, r := range s {
		width += runeWidth(r)
	}
	return width
}

// PadRight pads s with spaces so it occupies exactly cells cells.
// Returns s unchanged if it is already wider; never truncates.
//
// Because the measurement is in cells, PadRight("日本語", 8) adds two spaces
// (8 cells), where fmt's %-8s would add none (9 bytes).
func PadRight(s string, cells int) string {
	w := DisplayWidth(s)
	if w >= cells {
		return s
	}
	return s + strings.Repeat(" ", cells-w)
}

// TruncateToWidth shortens s to at most cells cells, appending "…" when a
// cut happens.
//
// The cut lands on a rune boundary, so a multi-byte character is never split
// in half and the result is always valid UTF-8 (invalid input bytes are
// replaced first). The ellipsis itself occupies 1 cell and is accounted for
// in the budget, so the result is never wider than cells even at cells == 1.
// A string that already fits is returned whole, with no ellipsis.
//
// Escapes are stripped before measuring, as in DisplayWidth; the returned
// string is therefore printable-as-measured.
func TruncateToWidth(s string, cells int) string {
	s = stripTerminalEscapes(s)
	// stripTerminalEscapes is byte-oriented for C0/C1 detection and can pass
	// through a stray high invalid byte; make the promise of valid UTF-8
	// unconditional before slicing anything.
	if !utf8.ValidString(s) {
		s = strings.ToValidUTF8(s, string(utf8.RuneError))
	}
	if cells <= 0 {
		return ""
	}
	if DisplayWidth(s) <= cells {
		return s
	}

	// Reserve one cell for the ellipsis, then walk whole runes: stop before
	// the rune that would overflow the remainder.
	budget := cells - 1
	var sb strings.Builder
	sb.Grow(len(s) + utf8.RuneLen('…'))
	width := 0
	for _, r := range s {
		if width+runeWidth(r) > budget {
			sb.WriteRune('…')
			return sb.String()
		}
		width += runeWidth(r)
		sb.WriteRune(r)
	}
	// Unreachable: the fits case returned above, so some rune must overflow.
	sb.WriteRune('…')
	return sb.String()
}

// widthRange is an inclusive rune interval.
type widthRange struct {
	lo, hi rune
}

// wideRanges are the East-Asian-Wide and East-Asian-Fullwidth intervals:
// 2 cells each. The bulk is "CJK radicals through Yi, except 0x303F"
// (0x2E80-0xA4CF minus the lone narrow ideographic half-fill space), Hangul
// (jamo extended-A and the syllables), CJK compatibility ideographs,
// fullwidth forms, and the common emoji blocks — plus the singleton
// emoji symbols terminals draw double-width (clocks, arrows, balls, sport
// and pictograph signs in 0x23xx-0x2Bxx).
var wideRanges = []widthRange{
	{0x1100, 0x115F},   // Hangul Jamo initial consonants
	{0x231A, 0x231B},   // watch, hourglass flowing sand
	{0x2329, 0x232A},   // angle brackets
	{0x23E9, 0x23EC},   // fast-forward arrows
	{0x23F0, 0x23F0},   // alarm clock
	{0x23F3, 0x23F3},   // hourglass with sand
	{0x25FD, 0x25FE},   // white/black medium small squares
	{0x2614, 0x2615},   // umbrella, hot beverage
	{0x2648, 0x2653},   // zodiac
	{0x267F, 0x267F},   // wheelchair
	{0x2693, 0x2693},   // anchor
	{0x26A1, 0x26A1},   // high voltage
	{0x26AA, 0x26AB},   // circles
	{0x26BD, 0x26BE},   // soccer, baseball
	{0x26C4, 0x26C5},   // snowman, sun behind cloud
	{0x26D4, 0x26D4},   // no entry
	{0x26EA, 0x26EA},   // church
	{0x26F2, 0x26F3},   // fountain, golf
	{0x26F5, 0x26F5},   // sailboat
	{0x26FA, 0x26FA},   // tent
	{0x26FD, 0x26FD},   // fuel pump
	{0x2705, 0x2705},   // white heavy check mark
	{0x270A, 0x270B},   // fists
	{0x2728, 0x2728},   // sparkles
	{0x274C, 0x274C},   // cross mark
	{0x274E, 0x274E},   // negative squared cross mark
	{0x2753, 0x2755},   // question/exclamation ornaments
	{0x2757, 0x2757},   // heavy exclamation mark
	{0x2795, 0x2797},   // heavy plus/minus/division
	{0x27B0, 0x27B0},   // curly loop
	{0x27BF, 0x27BF},   // double curly loop
	{0x2B1B, 0x2B1C},   // large squares
	{0x2B50, 0x2B50},   // white medium star
	{0x2B55, 0x2B55},   // heavy large circle
	{0x2E80, 0x303E},   // CJK radicals … up to (excluding) 0x303F
	{0x3040, 0xA4CF},   // … through Yi, 0x303F is the one narrow exception
	{0xA960, 0xA97C},   // Hangul Jamo Extended-A
	{0xAC00, 0xD7A3},   // Hangul syllables
	{0xF900, 0xFAFF},   // CJK compatibility ideographs
	{0xFF00, 0xFF60},   // fullwidth forms
	{0xFFE0, 0xFFE6},   // fullwidth sign-like
	{0x1F200, 0x1F2FF}, // enclosed ideographic supplement
	{0x1F300, 0x1F9FF}, // common emoji blocks …
	{0x1FA70, 0x1FAFF}, // … and the newer one
}

// runeWidth returns the cell width of a single rune: 0 for controls and
// zero-width characters, 2 for East-Asian Wide/Fullwidth, 1 otherwise.
func runeWidth(r rune) int {
	// Controls first: C0 (which includes tab and newline — they are not
	// visible columns), DEL, and the C1 range.
	if r < 0x20 || (r >= 0x7f && r <= 0x9f) {
		return 0
	}
	// Fast path: printable ASCII is the overwhelming majority of prompt
	// output, and it is unambiguously 1 cell.
	if r < 0x7f {
		return 1
	}

	// Zero-width, checked BEFORE the wide table so that zero-width runes
	// inside wide blocks (U+3099 on kana, skin tones inside 0x1F3xx) do not
	// get swept up as 2.
	if isZeroWidth(r) {
		return 0
	}
	if isWide(r) {
		return 2
	}
	return 1
}

// isZeroWidth reports whether r draws nothing: a join, a mark, or a format
// character that terminals skip when advancing the cursor.
func isZeroWidth(r rune) bool {
	switch {
	case r == 0x200d: // ZWJ — a join, not a cell (see DisplayWidth's caveat)
	case r >= 0xfe00 && r <= 0xfe0f: // variation selectors
	case r >= 0x1f3fb && r <= 0x1f3ff: // emoji skin-tone modifiers
	case unicode.Is(unicode.Mn, r), unicode.Is(unicode.Me, r):
		// Nonspacing and enclosing marks — includes the combining
		// diacriticals 0x0300-0x036F and every other general category M
		// range Go knows about.
	case unicode.Is(unicode.Cf, r):
		// Format characters: ZWJ/ZWNJ, zero-width space/joiners, directional
		// marks, word joiner, BOM.
	default:
		return false
	}
	return true
}

// isWide reports whether r occupies two terminal cells.
func isWide(r rune) bool {
	for _, rg := range wideRanges {
		if r >= rg.lo && r <= rg.hi {
			return true
		}
	}
	return false
}
