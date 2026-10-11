// Package schemacheck implements the small JSON Schema (draft 2020-12) subset
// the committed schemas/ documents actually use, so that a schema that drifts
// away from the artifacts the Go code emits fails a test instead of shipping
// as a contract no artifact can satisfy.
//
// Supported assertion keywords: type (a name or an array of names), required,
// properties, additionalProperties (boolean or schema), items, enum, const,
// pattern, minimum, maximum, minLength, maxLength, minItems, maxItems,
// uniqueItems, oneOf, anyOf and allOf. The annotation keywords $schema, $id,
// title, description, default, format, examples, $comment and deprecated are
// parsed and ignored, exactly as draft 2020-12 defines them (format is an
// annotation by default, so it is not enforced).
//
// Any keyword outside that set is rejected at Parse time: a validator that
// silently ignored a constraint the schema author wrote would be worse than no
// validator at all, because the drift it hid would look checked.
//
// Scope: this guards the repository's own schemas against the artifacts its own
// code emits. It is not a public validation service — it has no recursion-depth
// or complexity limit, so it must not be handed an adversarial schema or
// instance (uniqueItems is quadratic; a deep schema recurses).
package schemacheck

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"reflect"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"
)

// Schema is a parsed JSON Schema document, or one subschema of it.
type Schema struct {
	root map[string]any // the whole document, used by Resolve
	node map[string]any // the node validation starts at
}

// knownKeywords is the exact set of keywords Parse accepts. Anything else is a
// typo or an unsupported constraint and must not be silently ignored.
var knownKeywords = map[string]bool{
	// Annotations (draft 2020-12 §, parsed and ignored).
	"$schema":     true,
	"$id":         true,
	"title":       true,
	"description": true,
	"default":     true,
	"format":      true,
	"examples":    true,
	"$comment":    true,
	"deprecated":  true,
	// Assertions.
	"type":                 true,
	"required":             true,
	"properties":           true,
	"additionalProperties": true,
	"items":                true,
	"enum":                 true,
	"const":                true,
	"pattern":              true,
	"minimum":              true,
	"maximum":              true,
	"minLength":            true,
	"maxLength":            true,
	"minItems":             true,
	"maxItems":             true,
	"uniqueItems":          true,
	"oneOf":                true,
	"anyOf":                true,
	"allOf":                true,
}

// Decode parses JSON bytes into the value model Validate expects. Numbers
// become json.Number so an integer stays exact instead of round-tripping
// through float64.
func Decode(raw []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, fmt.Errorf("schemacheck: decode instance: %w", err)
	}
	// Reject trailing data so a truncated or concatenated document cannot pass.
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		return nil, fmt.Errorf("schemacheck: decode instance: trailing data after JSON value")
	}
	return v, nil
}

// Parse parses and structurally checks a schema document.
func Parse(raw []byte) (*Schema, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var doc map[string]any
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("schemacheck: parse schema: %w", err)
	}
	if err := checkNode(doc, ""); err != nil {
		return nil, err
	}
	return &Schema{root: doc, node: doc}, nil
}

// Resolve returns the subschema at an RFC 6901 JSON Pointer within the
// document (for example "/properties/snapshot"). An empty pointer returns the
// root schema. The resolved node is structurally checked like Parse does.
func (s *Schema) Resolve(pointer string) (*Schema, error) {
	if pointer == "" {
		return s, nil
	}
	if !strings.HasPrefix(pointer, "/") {
		return nil, fmt.Errorf("schemacheck: pointer %q must start with '/'", pointer)
	}
	var cur any = s.root
	for _, tok := range strings.Split(pointer[1:], "/") {
		tok = strings.ReplaceAll(strings.ReplaceAll(tok, "~1", "/"), "~0", "~")
		obj, ok := cur.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("schemacheck: pointer %q: %q is not an object", pointer, tok)
		}
		next, ok := obj[tok]
		if !ok {
			return nil, fmt.Errorf("schemacheck: pointer %q: no key %q", pointer, tok)
		}
		cur = next
	}
	node, ok := cur.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("schemacheck: pointer %q does not address an object schema", pointer)
	}
	if err := checkNode(node, pointer); err != nil {
		return nil, err
	}
	return &Schema{root: s.root, node: node}, nil
}

// Validate checks an already-decoded instance (see Decode) against the schema.
func (s *Schema) Validate(inst any) error {
	return validateNode(s.node, inst, "")
}

// ValidateBytes decodes raw JSON and validates it against the schema.
func (s *Schema) ValidateBytes(raw []byte) error {
	inst, err := Decode(raw)
	if err != nil {
		return err
	}
	return s.Validate(inst)
}

// checkNode structurally validates a schema node so a malformed keyword fails
// at Parse time rather than being ignored at validation time.
func checkNode(raw any, path string) error {
	switch n := raw.(type) {
	case bool:
		return nil
	case map[string]any:
		return checkObject(n, path)
	default:
		return fmt.Errorf("schemacheck: %s: schema node must be an object or boolean, got %s", loc(path), jsonTypeName(raw))
	}
}

func checkObject(obj map[string]any, path string) error {
	for key, val := range obj {
		if !knownKeywords[key] {
			return fmt.Errorf("schemacheck: %s: unsupported keyword %q", loc(path), key)
		}
		switch key {
		case "properties":
			props, ok := val.(map[string]any)
			if !ok {
				return fmt.Errorf("schemacheck: %s/properties must be an object", loc(path))
			}
			for name, sub := range props {
				if err := checkNode(sub, path+"/properties/"+name); err != nil {
					return err
				}
			}
		case "additionalProperties", "items":
			if err := checkNode(val, path+"/"+key); err != nil {
				return err
			}
		case "oneOf", "anyOf", "allOf":
			list, ok := val.([]any)
			if !ok || len(list) == 0 {
				return fmt.Errorf("schemacheck: %s/%s must be a non-empty array", loc(path), key)
			}
			for i, sub := range list {
				if err := checkNode(sub, fmt.Sprintf("%s/%s/%d", path, key, i)); err != nil {
					return err
				}
			}
		case "type":
			if err := checkTypeSpec(val, path); err != nil {
				return err
			}
		case "required":
			list, ok := val.([]any)
			if !ok {
				return fmt.Errorf("schemacheck: %s/required must be an array", loc(path))
			}
			for _, r := range list {
				if _, ok := r.(string); !ok {
					return fmt.Errorf("schemacheck: %s/required entries must be strings", loc(path))
				}
			}
		case "enum":
			list, ok := val.([]any)
			if !ok || len(list) == 0 {
				return fmt.Errorf("schemacheck: %s/enum must be a non-empty array", loc(path))
			}
		case "pattern":
			if _, ok := val.(string); !ok {
				return fmt.Errorf("schemacheck: %s/pattern must be a string", loc(path))
			}
		case "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems":
			if _, ok := numInt(val); !ok {
				return fmt.Errorf("schemacheck: %s/%s must be an integer", loc(path), key)
			}
		case "uniqueItems":
			if _, ok := val.(bool); !ok {
				return fmt.Errorf("schemacheck: %s/uniqueItems must be a boolean", loc(path))
			}
		}
		// Annotations and const accept any shape and need no check.
	}
	return nil
}

func checkTypeSpec(val any, path string) error {
	switch t := val.(type) {
	case string:
		if !validTypeName(t) {
			return fmt.Errorf("schemacheck: %s/type: unknown type %q", loc(path), t)
		}
	case []any:
		if len(t) == 0 {
			return fmt.Errorf("schemacheck: %s/type array must not be empty", loc(path))
		}
		for _, x := range t {
			name, ok := x.(string)
			if !ok || !validTypeName(name) {
				return fmt.Errorf("schemacheck: %s/type entries must be known type names", loc(path))
			}
		}
	default:
		return fmt.Errorf("schemacheck: %s/type must be a string or array of strings", loc(path))
	}
	return nil
}

func validTypeName(t string) bool {
	switch t {
	case "object", "array", "string", "number", "integer", "boolean", "null":
		return true
	}
	return false
}

func validateNode(node map[string]any, inst any, path string) error {
	if want, ok := node["const"]; ok && !jsonEqual(want, inst) {
		return fmt.Errorf("schemacheck: %s: value %s does not equal const %s", loc(path), compact(inst), compact(want))
	}
	if raw, ok := node["enum"]; ok {
		list, _ := raw.([]any)
		if !containsJSON(list, inst) {
			return fmt.Errorf("schemacheck: %s: value %s is not one of the enum values %s", loc(path), compact(inst), compact(raw))
		}
	}
	if spec, ok := node["type"]; ok && !matchesType(spec, inst) {
		return fmt.Errorf("schemacheck: %s: expected type %s, got %s", loc(path), compact(spec), jsonTypeName(inst))
	}
	if spec, ok := node["pattern"].(string); ok {
		if str, ok := inst.(string); ok {
			re, err := compilePattern(spec)
			if err != nil {
				return err
			}
			if !re.MatchString(str) {
				return fmt.Errorf("schemacheck: %s: string %q does not match pattern %q", loc(path), str, spec)
			}
		}
	}
	if raw, ok := node["minLength"]; ok {
		if str, ok := inst.(string); ok {
			if n, _ := numInt(raw); utf8.RuneCountInString(str) < n {
				return fmt.Errorf("schemacheck: %s: string is shorter than minLength %d", loc(path), n)
			}
		}
	}
	if raw, ok := node["maxLength"]; ok {
		if str, ok := inst.(string); ok {
			if n, _ := numInt(raw); utf8.RuneCountInString(str) > n {
				return fmt.Errorf("schemacheck: %s: string is longer than maxLength %d", loc(path), n)
			}
		}
	}
	if raw, ok := node["minimum"]; ok {
		if f, ok := numFloat(inst); ok {
			min, _ := numFloat(raw)
			if f < min {
				return fmt.Errorf("schemacheck: %s: value %v is below minimum %v", loc(path), f, min)
			}
		}
	}
	if raw, ok := node["maximum"]; ok {
		if f, ok := numFloat(inst); ok {
			max, _ := numFloat(raw)
			if f > max {
				return fmt.Errorf("schemacheck: %s: value %v is above maximum %v", loc(path), f, max)
			}
		}
	}

	if arr, ok := inst.([]any); ok {
		if raw, ok := node["minItems"]; ok {
			if n, _ := numInt(raw); len(arr) < n {
				return fmt.Errorf("schemacheck: %s: array has %d items, fewer than minItems %d", loc(path), len(arr), n)
			}
		}
		if raw, ok := node["maxItems"]; ok {
			if n, _ := numInt(raw); len(arr) > n {
				return fmt.Errorf("schemacheck: %s: array has %d items, more than maxItems %d", loc(path), len(arr), n)
			}
		}
		if raw, ok := node["uniqueItems"].(bool); ok && raw {
			for i, x := range arr {
				for j, y := range arr[:i] {
					if jsonEqual(x, y) {
						return fmt.Errorf("schemacheck: %s: array items %d and %d are equal but uniqueItems is true", loc(path), j, i)
					}
				}
			}
		}
		if sub, ok := node["items"]; ok {
			for i, el := range arr {
				if err := validateAny(sub, el, fmt.Sprintf("%s/%d", path, i)); err != nil {
					return err
				}
			}
		}
	}

	if obj, ok := inst.(map[string]any); ok {
		if raw, ok := node["required"]; ok {
			list, _ := raw.([]any)
			for _, r := range list {
				name, _ := r.(string)
				if _, present := obj[name]; !present {
					return fmt.Errorf("schemacheck: %s: missing required property %q", loc(path), name)
				}
			}
		}
		props, _ := node["properties"].(map[string]any)
		for name, sub := range props {
			if val, present := obj[name]; present {
				if err := validateAny(sub, val, path+"/"+name); err != nil {
					return err
				}
			}
		}
		if raw, ok := node["additionalProperties"]; ok {
			switch ap := raw.(type) {
			case bool:
				if !ap {
					for name := range obj {
						if _, declared := props[name]; !declared {
							return fmt.Errorf("schemacheck: %s: unexpected property %q", loc(path), name)
						}
					}
				}
			case map[string]any:
				for name, val := range obj {
					if _, declared := props[name]; declared {
						continue
					}
					if err := validateNode(ap, val, path+"/"+name); err != nil {
						return err
					}
				}
			}
		}
	}

	if raw, ok := node["allOf"]; ok {
		list, _ := raw.([]any)
		for _, sub := range list {
			if err := validateAny(sub, inst, path); err != nil {
				return err
			}
		}
	}
	if raw, ok := node["anyOf"]; ok {
		list, _ := raw.([]any)
		matched := false
		for _, sub := range list {
			if validateAny(sub, inst, path) == nil {
				matched = true
				break
			}
		}
		if !matched {
			return fmt.Errorf("schemacheck: %s: value %s matches none of anyOf", loc(path), compact(inst))
		}
	}
	if raw, ok := node["oneOf"]; ok {
		list, _ := raw.([]any)
		matched := 0
		for _, sub := range list {
			if validateAny(sub, inst, path) == nil {
				matched++
			}
		}
		if matched != 1 {
			return fmt.Errorf("schemacheck: %s: value %s matches %d of oneOf (want exactly 1)", loc(path), compact(inst), matched)
		}
	}
	return nil
}

func validateAny(node any, inst any, path string) error {
	switch n := node.(type) {
	case bool:
		if !n {
			return fmt.Errorf("schemacheck: %s: schema is false", loc(path))
		}
		return nil
	case map[string]any:
		return validateNode(n, inst, path)
	default:
		return fmt.Errorf("schemacheck: %s: invalid schema node", loc(path))
	}
}

func matchesType(spec any, inst any) bool {
	switch t := spec.(type) {
	case string:
		return typeMatches(t, inst)
	case []any:
		for _, x := range t {
			if name, ok := x.(string); ok && typeMatches(name, inst) {
				return true
			}
		}
		return false
	}
	return true
}

func typeMatches(name string, inst any) bool {
	switch name {
	case "object":
		_, ok := inst.(map[string]any)
		return ok
	case "array":
		_, ok := inst.([]any)
		return ok
	case "string":
		_, ok := inst.(string)
		return ok
	case "boolean":
		_, ok := inst.(bool)
		return ok
	case "null":
		return inst == nil
	case "number":
		_, ok := inst.(json.Number)
		return ok
	case "integer":
		return isInteger(inst)
	}
	return true
}

func isInteger(inst any) bool {
	n, ok := inst.(json.Number)
	if !ok {
		return false
	}
	if _, err := n.Int64(); err == nil {
		return true
	}
	f, err := n.Float64()
	return err == nil && f == math.Trunc(f)
}

func numFloat(v any) (float64, bool) {
	n, ok := v.(json.Number)
	if !ok {
		return 0, false
	}
	f, err := n.Float64()
	if err != nil {
		return 0, false
	}
	return f, true
}

func numInt(v any) (int, bool) {
	n, ok := v.(json.Number)
	if !ok {
		return 0, false
	}
	i, err := n.Int64()
	if err != nil {
		return 0, false
	}
	return int(i), true
}

func jsonEqual(a, b any) bool { return reflect.DeepEqual(a, b) }

func containsJSON(list []any, inst any) bool {
	for _, v := range list {
		if jsonEqual(v, inst) {
			return true
		}
	}
	return false
}

func jsonTypeName(v any) string {
	switch v.(type) {
	case nil:
		return "null"
	case map[string]any:
		return "object"
	case []any:
		return "array"
	case string:
		return "string"
	case bool:
		return "boolean"
	case json.Number:
		return "number"
	default:
		return fmt.Sprintf("%T", v)
	}
}

func compact(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(b)
}

func loc(path string) string {
	if path == "" {
		return "/"
	}
	return path
}

var patternCache sync.Map // string -> *regexp.Regexp

func compilePattern(p string) (*regexp.Regexp, error) {
	if v, ok := patternCache.Load(p); ok {
		return v.(*regexp.Regexp), nil
	}
	re, err := regexp.Compile(p)
	if err != nil {
		return nil, fmt.Errorf("schemacheck: invalid pattern %q: %w", p, err)
	}
	patternCache.Store(p, re)
	return re, nil
}
