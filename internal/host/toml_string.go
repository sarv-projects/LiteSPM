package host

// toml_string.go — writing and verifying TOML string literals.
//
// The TOML writers used Go's %q to build `command` and `args`. %q emits Go
// escapes — \v, \a, \xNN — and those are not TOML basic-string escapes: a
// publisher-supplied command or argument containing a vertical tab or an ESC
// byte produced a config every TOML parser rejects, and the TOML branch had no
// post-merge verification to catch it (the JSON branch re-parses; TOML did
// not). A rejected config takes the whole host down, not just our entry.
//
// tomlQuoteString emits ONLY the escapes TOML publishes, and
// verifyTOMLDocument re-reads the merged text before it is written, so a writer
// bug fails closed instead of shipping a file the host cannot parse.

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// TOMLInvalidCode is the refusal code for a TOML document LiteSPM would have
// written but could not read back.
const TOMLInvalidCode = "LPSM-TOML-INVALID"

// ErrInvalidTOML is the sentinel every TOML verification refusal unwraps to.
var ErrInvalidTOML = errors.New("invalid TOML")

// TOMLInvalidError reports the document (or the line in it) that failed to
// parse. It is the typed refusal TOML writers fail closed with.
type TOMLInvalidError struct {
	Line   int
	Reason string
}

func (e *TOMLInvalidError) Error() string {
	if e.Line > 0 {
		return fmt.Sprintf("invalid TOML at line %d: %s", e.Line, e.Reason)
	}
	return "invalid TOML: " + e.Reason
}

// Unwrap lets callers test errors.Is(err, ErrInvalidTOML).
func (e *TOMLInvalidError) Unwrap() error { return ErrInvalidTOML }

// tomlQuoteString renders s as a TOML basic string ("), escaping only the
// escapes TOML defines. Invalid UTF-8 is refused rather than escaped: no TOML
// string can represent it, so a faithful write is impossible.
func tomlQuoteString(s string) (string, error) {
	if !utf8.ValidString(s) {
		return "", &TOMLInvalidError{Reason: "string contains invalid UTF-8, which no TOML string can represent"}
	}
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '"':
			b.WriteString(`\"`)
		case '\b':
			b.WriteString(`\b`)
		case '\t':
			b.WriteString(`\t`)
		case '\n':
			b.WriteString(`\n`)
		case '\f':
			b.WriteString(`\f`)
		case '\r':
			b.WriteString(`\r`)
		default:
			// Other C0 controls, DEL and the C1 range have no named TOML
			// escape; \uXXXX is the portable spelling for all of them.
			if r < 0x20 || (r >= 0x7f && r <= 0x9f) {
				fmt.Fprintf(&b, `\u%04X`, r)
				continue
			}
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String(), nil
}

// tomlQuoteStringLossy is tomlQuoteString for the pasteable manual snippet,
// which has nowhere to report an error. Invalid bytes become U+FFFD: the
// snippet stays a valid TOML string (and says so by rendering the replacement
// character), whereas %q would have made it unparseable.
func tomlQuoteStringLossy(s string) string {
	if q, err := tomlQuoteString(s); err == nil {
		return q
	}
	var b strings.Builder
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		if r == utf8.RuneError && size == 1 {
			b.WriteRune(utf8.RuneError)
			i++
			continue
		}
		b.WriteString(s[i : i+size])
		i += size
	}
	q, _ := tomlQuoteString(b.String())
	return q
}

func isHexByte(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

func isHexRun(s string) bool {
	for i := 0; i < len(s); i++ {
		if !isHexByte(s[i]) {
			return false
		}
	}
	return true
}

// tomlSkipEscape validates the escape starting at the backslash at i and
// returns the index of its last byte. Only the escapes TOML publishes are
// accepted; \v, \a and \xNN (Go's spellings) are exactly what this refuses.
func tomlSkipEscape(content string, i int) (int, error) {
	bad := func(reason string) (int, error) {
		return 0, &TOMLInvalidError{Line: 1 + strings.Count(content[:i], "\n"), Reason: reason}
	}
	if i+1 >= len(content) {
		return bad("a backslash at end of input starts no escape")
	}
	switch e := content[i+1]; e {
	case 'b', 't', 'n', 'f', 'r', '"', '\\':
		return i + 1, nil
	case 'u':
		if i+6 > len(content) || !isHexRun(content[i+2:i+6]) {
			return bad("\\u must be followed by exactly four hexadecimal digits")
		}
		return i + 5, nil
	case 'U':
		if i+10 > len(content) || !isHexRun(content[i+2:i+10]) {
			return bad("\\U must be followed by exactly eight hexadecimal digits")
		}
		return i + 9, nil
	default:
		return bad(fmt.Sprintf(`\%c is not a TOML escape (only \b \t \n \f \r \" \\ \uXXXX \UXXXXXXXX)`, e))
	}
}

// verifyTOMLDocument scans a document and refuses the damage a writer can do:
// invalid UTF-8, raw control bytes, and string literals that never close or
// use an escape TOML does not define.
//
// It is deliberately a reader of the string grammar, not of the key grammar:
// the package's line-wise readers already match headers and keys, and this
// layer exists because they cannot see escapes at all (they never decode a
// string). It therefore validates every quoted value, in tables it does not
// otherwise understand, without re-serialising or reformatting any of them.
func verifyTOMLDocument(content string) error {
	if !utf8.ValidString(content) {
		return &TOMLInvalidError{Reason: "document is not valid UTF-8"}
	}

	const (
		normal = iota
		basic
		basicMulti
		literal
		literalMulti
		comment
	)
	state := normal
	line := 1

	for i := 0; i < len(content); i++ {
		c := content[i]
		if c == '\n' {
			line++
		}
		switch state {
		case comment:
			if c == '\n' {
				state = normal
			}

		case normal:
			switch {
			case c == '#':
				state = comment
			case c == '"':
				if strings.HasPrefix(content[i:], `"""`) {
					state = basicMulti
					i += 2
				} else {
					state = basic
				}
			case c == '\'':
				if strings.HasPrefix(content[i:], `'''`) {
					state = literalMulti
					i += 2
				} else {
					state = literal
				}
			case c < 0x20 && c != '\t' && c != '\n' && c != '\r':
				return &TOMLInvalidError{Line: line, Reason: fmt.Sprintf("raw control byte 0x%02X outside a string", c)}
			case c == 0x7f:
				return &TOMLInvalidError{Line: line, Reason: "raw DEL byte outside a string"}
			}

		case basic:
			switch {
			case c == '\n':
				return &TOMLInvalidError{Line: line, Reason: "a basic string is not closed before the end of the line"}
			case c == '"':
				state = normal
			case c == '\\':
				last, err := tomlSkipEscape(content, i)
				if err != nil {
					return err
				}
				i = last
			case c < 0x20 && c != '\t':
				return &TOMLInvalidError{Line: line, Reason: fmt.Sprintf("raw control byte 0x%02X in a basic string", c)}
			case c == 0x7f:
				return &TOMLInvalidError{Line: line, Reason: "raw DEL byte in a basic string"}
			}

		case basicMulti:
			switch {
			case c == '"':
				run := 1
				for i+run < len(content) && content[i+run] == '"' {
					run++
				}
				if run >= 3 {
					state = normal // the last three quotes close the string
				}
				i += run - 1
			case c == '\\':
				// A backslash followed only by whitespace and a newline is a
				// line-ending backslash, which multi-line strings allow.
				j := i + 1
				for j < len(content) && (content[j] == ' ' || content[j] == '\t' || content[j] == '\r') {
					j++
				}
				if j < len(content) && content[j] == '\n' {
					i = j - 1 // let the loop count the newline
					continue
				}
				last, err := tomlSkipEscape(content, i)
				if err != nil {
					return err
				}
				i = last
			case c < 0x20 && c != '\t' && c != '\n' && c != '\r':
				return &TOMLInvalidError{Line: line, Reason: fmt.Sprintf("raw control byte 0x%02X in a multi-line string", c)}
			}

		case literal:
			switch {
			case c == '\n':
				return &TOMLInvalidError{Line: line, Reason: "a literal string is not closed before the end of the line"}
			case c == '\'':
				state = normal
			case c < 0x20 && c != '\t':
				return &TOMLInvalidError{Line: line, Reason: fmt.Sprintf("raw control byte 0x%02X in a literal string", c)}
			}

		case literalMulti:
			if c == '\'' {
				run := 1
				for i+run < len(content) && content[i+run] == '\'' {
					run++
				}
				if run >= 3 {
					state = normal
				}
				i += run - 1
			} else if c < 0x20 && c != '\t' && c != '\n' && c != '\r' {
				return &TOMLInvalidError{Line: line, Reason: fmt.Sprintf("raw control byte 0x%02X in a multi-line literal string", c)}
			}
		}
	}

	switch state {
	case normal, comment:
		return nil
	case basic, literal:
		return &TOMLInvalidError{Reason: "a string literal is left open at the end of the document"}
	default:
		return &TOMLInvalidError{Reason: "a multi-line string literal is left open at the end of the document"}
	}
}
