// sanitize.go — making another person's SKILL.md safe to print.
//
// A skill's name, description, triggers and required-tool list are read out of
// a file the user did not write, and every one of them is interpolated into
// formatted terminal output: the progressive index table, the skills-add
// summary, the ledger, `litespm skills list`. Nothing stripped them, so a
// skill named
//
//	\x1b[2K\rFake prompt: `rm -rf ~`
//
// would clear the victim's line and overwrite it with text of the attacker's
// choosing, at the exact moment the victim is reading an install summary.
// That is the terminal-escape class, CWE-150, and it is a real gap here: the
// file is untrusted by definition (an install clones and reads a stranger's
// repository) and the sink is the user's own screen.
//
// Sanitizing at the parse boundary rather than at each sink means a consumer
// added later cannot forget to do it. This mirrors what a comparable
// installer's frontmatter handling does, and it is the single most one-sided
// omission found when comparing the two.
package skills

import (
	"strings"
	"unicode/utf8"
)

// sanitizeForDisplay returns s as one printable line.
//
// Terminal escapes are stripped first, then the whitespace they left behind is
// collapsed, so a value that contained newlines cannot break out of the line it
// lands in — which for a markdown table cell is also the difference between a
// table that renders and one that shatters.
func sanitizeForDisplay(s string) string {
	if s == "" {
		return ""
	}
	return strings.Join(strings.Fields(stripTerminalEscapes(s)), " ")
}

// stripTerminalEscapes removes the control sequences a hostile file uses to
// drive a victim's terminal.
//
// It removes, and removes whole rather than byte-by-byte (a half-consumed
// sequence leaves its terminator behind, which is its own escape):
//
//	OSC   ESC ] … BEL | ESC ] … ESC \     window title, clipboard, hyperlink
//	DCS   ESC P … ESC \                   device control
//	PM    ESC ^ … ESC \                   privacy message
//	APC   ESC _ … ESC \                   application program control
//	CSI   ESC [ … final(0x40-0x7E)        cursor motion, erase, colour, modes
//	ESC # ESC ( ESC ) ESC * ESC + <c>     three-byte designation sequences
//	ESC <c>                               any other two-byte escape
//	C1    raw U+0080-U+009F bytes         8-bit equivalents of the above
//	C0    0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F
//
// Tab and newline survive; they are legitimate description content and are
// collapsed by sanitizeForDisplay anyway.
//
// Decoding is deliberate rather than a rune range, because the two cases look
// alike and behave oppositely. A raw C1 control arrives as a single invalid
// UTF-8 byte, so ranging over the string yields U+FFFD for it and it slips
// through a rune-based check. But the SECOND byte of a legitimate multi-byte
// character also falls in 0x80-0x9F — stripping that by byte would corrupt
// every non-Latin description. So: decode, pass valid runes through untouched,
// and drop a byte only when it decodes to nothing.
func stripTerminalEscapes(s string) string {
	if !needsStripping(s) {
		return s
	}

	var sb strings.Builder
	sb.Grow(len(s))

	for i := 0; i < len(s); {
		b := s[i]
		switch {
		case b == 0x1b:
			i = skipEscape(s, i)
		case b == '\n' || b == '\t':
			sb.WriteByte(b)
			i++
		case b < utf8.RuneSelf:
			if b < 0x20 || b == 0x7f { // C0 controls and DEL
				i++
				continue
			}
			sb.WriteByte(b)
			i++
		default:
			r, size := utf8.DecodeRuneInString(s[i:])
			if r == utf8.RuneError && size == 1 {
				// An invalid byte: a raw C1 control, or worse. Dropped.
				i++
				continue
			}
			if r >= 0x7f && r <= 0x9f { // decoded C1 controls
				i += size
				continue
			}
			sb.WriteRune(r)
			i += size
		}
	}

	return sb.String()
}

// skipEscape returns the index just past the escape sequence that starts at i,
// where s[i] is ESC. A truncated sequence consumes what is left of the string.
func skipEscape(s string, i int) int {
	i++ // past ESC
	if i >= len(s) {
		return i // a trailing lone ESC contributes nothing
	}
	switch s[i] {
	case '[': // CSI: introducer, parameter/intermediate bytes, one final byte
		i++
		for i < len(s) && !(s[i] >= 0x40 && s[i] <= 0x7e) {
			i++
		}
		if i < len(s) {
			i++
		}
	case ']': // OSC: BEL- or ST-terminated
		for i < len(s) && s[i] != 0x07 {
			if s[i] == 0x1b && i+1 < len(s) && s[i+1] == '\\' {
				return i + 2
			}
			i++
		}
		if i < len(s) {
			i++ // past BEL
		}
	case 'P', '^', '_': // DCS / PM / APC: ST-terminated
		for i < len(s) && !(s[i] == 0x1b && i+1 < len(s) && s[i+1] == '\\') {
			i++
		}
		if i+1 < len(s) && s[i] == 0x1b {
			i += 2
		}
	case '#', '(', ')', '*', '+':
		i += 2 // three-byte designation sequences: the last byte is not payload
	default:
		i++ // any other escape consumes exactly one more byte
	}
	return i
}

// needsStripping reports whether s carries anything stripTerminalEscapes would
// remove, so the overwhelmingly common clean case returns the original string.
func needsStripping(s string) bool {
	for i := 0; i < len(s); i++ {
		b := s[i]
		if b == 0x1b || b == 0x7f || (b < 0x20 && b != '\n' && b != '\t') {
			return true
		}
		// Only a raw byte here: a continuation byte inside a valid multi-byte
		// character must not trigger a rewrite.
		if b >= 0x80 && b <= 0x9f {
			if !utf8.ValidString(s) {
				return true
			}
		}
	}
	return false
}

// truncateRunes shortens s to at most n runes, marking the cut with an ellipsis.
//
// The table renderer used to slice bytes — `desc[:77]` — which cuts a multi-byte
// character in half and prints invalid UTF-8 for any description in a non-Latin
// script. Counting runes costs nothing here and cannot corrupt the string.
func truncateRunes(s string, n int) string {
	if n <= 0 {
		return ""
	}
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	if n <= 3 {
		return string([]rune(s)[:n])
	}
	return string([]rune(s)[:n-3]) + "..."
}
