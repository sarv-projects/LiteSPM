package host

// jsonc_merge.go — surgical JSON/JSONC member upsert.
//
// Why not just parse and re-marshal: several verified hosts keep user-authored
// `//` and `/* */` comments in their config (Zed, Amp, Qoder, CodeBuddy,
// CodeArts, Pochi). Parsing into map[string]any and calling MarshalIndent would
// silently delete every one of those comments — a data-loss bug in an installer
// whose whole job is to modify other people's config files safely.
//
// So for comment-tolerant hosts we locate the target object by byte offset and
// splice only the `litespm` member into it. Everything else in the file —
// comments, key order, indentation, blank lines — survives untouched.
//
// stripJSONComments replaces comments with equivalent whitespace, so offsets
// found in the stripped text are valid offsets into the original. That property
// is what makes this approach safe, and jsonc_offsets_preserved_strip_comments
// in the test file pins it.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

// isJSONSpace reports whether b is JSON insignificant whitespace.
func isJSONSpace(b byte) bool {
	return b == ' ' || b == '\t' || b == '\n' || b == '\r'
}

// trimJSONSpaceEdges narrows [start,end) past surrounding whitespace.
func trimJSONSpaceEdges(text string, start, end int) (int, int) {
	for start < end && isJSONSpace(text[start]) {
		start++
	}
	for end > start && isJSONSpace(text[end-1]) {
		end--
	}
	return start, end
}

// jsonValueSpan returns the byte range of the JSON value stored at keyPath,
// walking from the root object. found is false when the path does not exist.
// text must be comment-stripped (offsets are meaningful) and root must be a
// JSON object.
func jsonValueSpan(text string, keyPath []string) (start, end int, found bool, err error) {
	if len(keyPath) == 0 {
		return 0, 0, false, fmt.Errorf("empty key path")
	}
	dec := json.NewDecoder(strings.NewReader(text))
	span, found, err := descendForSpan(dec, text, keyPath, 0)
	if err != nil {
		return 0, 0, false, err
	}
	return span[0], span[1], found, nil
}

// descendForSpan recurses one key level down, returning the value span.
func descendForSpan(dec *json.Decoder, text string, keyPath []string, depth int) ([2]int, bool, error) {
	tok, err := dec.Token()
	if err != nil {
		return [2]int{}, false, fmt.Errorf("expected object at depth %d: %w", depth, err)
	}
	delim, ok := tok.(json.Delim)
	if !ok || delim != '{' {
		return [2]int{}, false, fmt.Errorf("expected object at depth %d, got %v", depth, tok)
	}
	for dec.More() {
		keyTok, err := dec.Token()
		if err != nil {
			return [2]int{}, false, err
		}
		key, _ := keyTok.(string)
		if key != keyPath[depth] {
			if err := skipOneValue(dec); err != nil {
				return [2]int{}, false, err
			}
			continue
		}
		if depth == len(keyPath)-1 {
			var raw json.RawMessage
			if err := dec.Decode(&raw); err != nil {
				return [2]int{}, false, err
			}
			// InputOffset() reports the end of the last token, but the colon
			// separating key from value has already been consumed, so the
			// offset alone points one byte too far right. Deriving the start
			// from the decoded length is exact: RawMessage receives the value
			// bytes verbatim, without surrounding whitespace.
			end := int(dec.InputOffset())
			s, e := trimJSONSpaceEdges(text, end-len(raw), end)
			return [2]int{s, e}, true, nil
		}
		return descendForSpan(dec, text, keyPath, depth+1)
	}
	return [2]int{}, false, nil
}

// skipOneValue advances the decoder past exactly one value.
func skipOneValue(dec *json.Decoder) error {
	var raw json.RawMessage
	return dec.Decode(&raw)
}

// lineIndentOf returns the whitespace between the start of the line containing
// offset and that offset. It returns "" when the line holds other content
// before the offset, so we never invent indentation mid-expression.
func lineIndentOf(text string, offset int) string {
	lineStart := strings.LastIndex(text[:offset], "\n") + 1
	candidate := text[lineStart:offset]
	if strings.TrimSpace(candidate) != "" {
		return ""
	}
	return candidate
}

// indentValue renders a compact JSON value with continuation lines indented to
// match the surrounding document.
func indentValue(value any, indent string) (string, error) {
	// SetEscapeHTML(false): json.Marshal rewrites <, > and & as \u003c, \u003e
	// and \u0026. That is valid JSON but turns a hand-readable
	// `mongodb-mcp-server@<3` into `@\u003c3` in a file the user will open.
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(value); err != nil {
		return "", err
	}
	compact := strings.TrimSuffix(buf.String(), "\n")
	lines := strings.Split(compact, "\n")
	for i := 1; i < len(lines); i++ {
		lines[i] = indent + lines[i]
	}
	return strings.Join(lines, "\n"), nil
}

// upsertObjectMember inserts or replaces one member of a JSON object literal,
// leaving the rest of the literal byte-identical. objText may contain comments;
// they are stripped for locating only, never rewritten.
func upsertObjectMember(objText, name string, value any) (string, error) {
	return upsertObjectMemberAt(objText, name, value, "")
}

// upsertObjectMemberAt is upsertObjectMember for an object literal that is a
// slice of a larger document; outerIndent is the leading indentation of the
// line the slice begins on (see insertRawMemberAt).
func upsertObjectMemberAt(objText, name string, value any, outerIndent string) (string, error) {
	locatable := stripTrailingCommas(stripJSONComments(objText))
	start, end, found, err := jsonValueSpan(locatable, []string{name})
	if err != nil && strings.Contains(err.Error(), "expected object") {
		return objText, nil // not an object literal; leave it for the caller
	}
	if err != nil {
		return "", err
	}
	if found {
		rendered, err := indentValue(value, lineIndentOf(objText, start))
		if err != nil {
			return "", err
		}
		return objText[:start] + rendered + objText[end:], nil
	}
	closeRel := strings.LastIndex(objText, "}")
	if closeRel < 0 {
		return "", fmt.Errorf("object literal has no closing brace")
	}
	closeIndent := lineIndentOf(objText, closeRel)
	if closeIndent == "" && !strings.Contains(objText[:closeRel], "\n") {
		closeIndent = outerIndent
	}
	rendered, err := indentValue(value, closeIndent+"  ")
	if err != nil {
		return "", err
	}
	return insertRawMemberAt(objText, closeRel, name, rendered, outerIndent)
}

// jsonKey renders a member name as a JSON string.
//
// fmt's %q is Go syntax, not JSON: an invalid UTF-8 byte became `"\xf0"`,
// which no JSON parser accepts. Entry-name validation rejects such names, but
// the splice must not be the step that turns a rejected name into a corrupt
// file when a future caller forgets to validate.
func jsonKey(name string) string {
	b, err := json.Marshal(name)
	if err != nil {
		// A string cannot fail to marshal; keep the function total anyway.
		return `""`
	}
	return string(b)
}

// insertRawMember writes `"name": literal` into an object literal immediately
// before its closing brace at offset closeRel.
//
// The separator comma must sit immediately after the last LIVE member. When the
// container's tail is a comment (`// add your servers here`), appending `,`
// after the comment text buries the comma inside the comment: the next member
// then has no separator and the document stops parsing. So the comma is placed
// at the last live byte instead, and the member follows the comment.
func insertRawMember(objText string, closeRel int, name, literal string) (string, error) {
	return insertRawMemberAt(objText, closeRel, name, literal, "")
}

// leadingIndentOf returns the whitespace that begins the line containing
// offset, whatever follows it on that line.
func leadingIndentOf(text string, offset int) string {
	lineStart := strings.LastIndex(text[:offset], "\n") + 1
	end := lineStart
	for end < len(text) && (text[end] == ' ' || text[end] == '\t') {
		end++
	}
	return text[lineStart:end]
}

// insertRawMemberAt is insertRawMember for an object literal that is a SLICE
// of a larger document. outerIndent is the leading indentation of the document
// line the slice begins on.
//
// The closing brace's indentation used to be read from the slice alone. For a
// container LiteSPM had just created (`"mcpServers": {}`) the brace shares its
// line with the key, so the slice holds no indentation at all and the new
// member landed at column 2 under a key at column 2:
//
//	"mcpServers": {
//	"litespm": {...}
//	}
//
// A brace on the slice's first line takes the enclosing line's indentation.
// Anywhere else the slice's own text already carries the context, and the
// previous rule is kept.
func insertRawMemberAt(objText string, closeRel int, name, literal, outerIndent string) (string, error) {
	closeIndent := lineIndentOf(objText, closeRel)
	if closeIndent == "" && !strings.Contains(objText[:closeRel], "\n") {
		closeIndent = outerIndent
	}
	memberIndent := closeIndent + "  "
	body := strings.TrimRight(objText[:closeRel], " \t\r\n")
	member := fmt.Sprintf("%s: %s", jsonKey(name), literal)
	if isEmptyJSONObject(body) {
		return body + "\n" + memberIndent + member + "\n" + closeIndent + objText[closeRel:], nil
	}
	// Decide from the comment-stripped text: is there a live member before us,
	// and does it already end in a comma? A comment after the brace hides both
	// answers from a raw-text check.
	live := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(stripJSONComments(body)), "{"))
	if live == "" || strings.HasSuffix(live, ",") {
		// No live member yet, or a trailing comma already separates the next
		// member from the last one. Either way nothing needs a separator, and
		// the member follows the comment on its own line.
		return body + "\n" + memberIndent + member + "\n" + closeIndent + objText[closeRel:], nil
	}
	last := lastLiveByte(body)
	if last < 0 {
		return "", fmt.Errorf("object literal has no live member to extend")
	}
	withComma := body[:last+1] + "," + body[last+1:]
	return withComma + "\n" + memberIndent + member + "\n" + closeIndent + objText[closeRel:], nil
}

// lastLiveByte returns the index of the last byte of text that is neither
// whitespace nor part of a comment, or -1 when there is none.
func lastLiveByte(text string) int {
	stripped := stripJSONComments(text)
	for i := len(stripped) - 1; i >= 0; i-- {
		if !isJSONSpace(stripped[i]) {
			return i
		}
	}
	return -1
}

// isEmptyJSONObject reports whether a `{...}` prefix contains no members.
func isEmptyJSONObject(body string) bool {
	return strings.TrimSpace(body) == "{"
}

// chainLiteral renders the value for a container member whose NAME is
// supplied by the caller: the remaining container chain in keys, ending in an
// EMPTY object so the caller's own upsert inserts the correctly named member.
//
//	keys = []          -> {}                       (member "mcpServers")
//	keys = ["servers"] -> {"servers": {}}          (member "mcp")
//
// The leaf used to be hardcoded to a `litespm` member. That is right for the
// bridge entry itself, but ensureKeyPath is shared with server-entry installs:
// installing a server into a fresh config created the missing container with
// a `litespm` member holding the SERVER's launch line — a phantom bridge
// entry whose command was a third-party binary, which then made VerifySetup
// report the host as bridged. The named upsert that follows always writes the
// right member, so the container just needs to exist.
func chainLiteral(keys []string, indent string) string {
	if len(keys) == 0 {
		return "{}"
	}
	inner := indent + "  "
	child := chainLiteral(keys[1:], inner)
	return "{\n" + inner + fmt.Sprintf("%s: %s", jsonKey(keys[0]), child) + "\n" + indent + "}"
}

// ensureKeyPath makes sure the object at keyPath exists, creating any missing
// intermediate levels (as empty objects), and returns the resulting text plus
// the byte range of that object's value.
func ensureKeyPath(raw string, keyPath []string) (string, int, int, error) {
	if len(keyPath) == 0 {
		return "", 0, 0, fmt.Errorf("empty key path")
	}
	cur := raw
	for depth := range keyPath {
		locatable := stripTrailingCommas(stripJSONComments(cur))
		s, e, found, err := jsonValueSpan(locatable, keyPath[:depth+1])
		if err != nil {
			return "", 0, 0, err
		}
		if found {
			if !strings.HasPrefix(strings.TrimSpace(locatable[s:e]), "{") {
				return "", 0, 0, fmt.Errorf(
					"key %q holds a non-object value; refusing to overwrite it", keyPath[depth])
			}
			continue
		}
		containerStart, containerEnd := 0, len(cur)
		if depth > 0 {
			s, e, found, err := jsonValueSpan(locatable, keyPath[:depth])
			if err != nil {
				return "", 0, 0, err
			}
			if !found {
				return "", 0, 0, fmt.Errorf("intermediate key %v missing unexpectedly", keyPath[:depth])
			}
			containerStart, containerEnd = s, e
		}
		objText := cur[containerStart:containerEnd]
		memberIndent := lineIndentOf(cur, containerStart) + "  "
		// The inserted member is named keyPath[depth]; its value is the rest
		// of the container chain, ending empty for the caller's upsert.
		value := chainLiteral(keyPath[depth+1:], memberIndent)
		closeRel := strings.LastIndex(objText, "}")
		if closeRel < 0 {
			return "", 0, 0, fmt.Errorf("cannot create %v: parent is not an object", keyPath[:depth])
		}
		updated, err := insertRawMemberAt(objText, closeRel, keyPath[depth], value, leadingIndentOf(cur, containerStart))
		if err != nil {
			return "", 0, 0, err
		}
		cur = cur[:containerStart] + updated + cur[containerEnd:]
	}
	locatable := stripTrailingCommas(stripJSONComments(cur))
	s, e, found, err := jsonValueSpan(locatable, keyPath)
	if err != nil {
		return "", 0, 0, err
	}
	if !found {
		return "", 0, 0, fmt.Errorf("failed to create key path %v", keyPath)
	}
	return cur, s, e, nil
}

// mergeJSONEntrySurgical upserts the `litespm` member into the object at
// keyPath without reformatting the rest of the document. Comments, key order
// and indentation outside the touched object are preserved byte-for-byte.
func mergeJSONEntrySurgical(raw string, keyPath []string, value any) (string, error) {
	return mergeJSONEntrySurgicalNamed(raw, keyPath, litespmServerName, value)
}

// mergeJSONEntrySurgicalNamed is mergeJSONEntrySurgical for an arbitrary member
// name. The bridge is always called `litespm`, but a catalog install writes the
// SERVER's name into the same container, so the name cannot be hardcoded here.
func mergeJSONEntrySurgicalNamed(raw string, keyPath []string, name string, value any) (string, error) {
	if strings.TrimSpace(stripJSONComments(raw)) == "" {
		raw = "{}"
	}
	cur, start, end, err := ensureKeyPath(raw, keyPath)
	if err != nil {
		return "", err
	}
	objText := cur[start:end]
	updated, err := upsertObjectMemberAt(objText, name, value, leadingIndentOf(cur, start))
	if err != nil {
		return "", err
	}
	if updated == objText {
		return cur, nil
	}
	return cur[:start] + updated + cur[end:], nil
}
