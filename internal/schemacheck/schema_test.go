package schemacheck_test

import (
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/schemacheck"
)

func mustParse(t *testing.T, raw string) *schemacheck.Schema {
	t.Helper()
	s, err := schemacheck.Parse([]byte(raw))
	if err != nil {
		t.Fatalf("Parse(%s): %v", raw, err)
	}
	return s
}

func validateJSON(t *testing.T, s *schemacheck.Schema, raw string) error {
	t.Helper()
	return s.ValidateBytes([]byte(raw))
}

func TestKeywordAssertions(t *testing.T) {
	tests := []struct {
		name      string
		schema    string
		instance  string
		wantErr   bool
		errSubstr string
	}{
		{"type ok", `{"type":"string"}`, `"x"`, false, ""},
		{"type mismatch", `{"type":"string"}`, `1`, true, "expected type"},
		{"type array of names ok", `{"type":["string","null"]}`, `null`, false, ""},
		{"type array of names mismatch", `{"type":["string","null"]}`, `1`, true, "expected type"},
		{"integer accepts 1.0", `{"type":"integer"}`, `1.0`, false, ""},
		{"integer rejects 1.5", `{"type":"integer"}`, `1.5`, true, "expected type"},
		{"required present", `{"required":["a"]}`, `{"a":1}`, false, ""},
		{"required missing", `{"required":["a"]}`, `{}`, true, "missing required"},
		{"const ok", `{"const":1}`, `1`, false, ""},
		{"const mismatch", `{"const":1}`, `2`, true, "const"},
		{"enum ok", `{"enum":["a","b"]}`, `"b"`, false, ""},
		{"enum mismatch", `{"enum":["a","b"]}`, `"c"`, true, "enum"},
		{"pattern ok", `{"type":"string","pattern":"^a+$"}`, `"aaa"`, false, ""},
		{"pattern mismatch", `{"type":"string","pattern":"^a+$"}`, `"b"`, true, "pattern"},
		{"minimum ok", `{"type":"integer","minimum":0}`, `0`, false, ""},
		{"minimum violated", `{"type":"integer","minimum":1}`, `0`, true, "minimum"},
		{"maximum violated", `{"type":"integer","maximum":1}`, `2`, true, "maximum"},
		{"minLength violated", `{"type":"string","minLength":1}`, `""`, true, "minLength"},
		{"maxLength violated", `{"type":"string","maxLength":1}`, `"ab"`, true, "maxLength"},
		{"minItems violated", `{"type":"array","minItems":1}`, `[]`, true, "minItems"},
		{"maxItems violated", `{"type":"array","maxItems":1}`, `[1,2]`, true, "maxItems"},
		{"uniqueItems ok", `{"type":"array","uniqueItems":true}`, `[1,2,3]`, false, ""},
		{"uniqueItems violated", `{"type":"array","uniqueItems":true}`, `[1,2,1]`, true, "uniqueItems"},
		{"items violated", `{"type":"array","items":{"type":"string"}}`, `["a",1]`, true, "expected type"},
		{"properties ok", `{"type":"object","properties":{"a":{"type":"string"}},"additionalProperties":false}`, `{"a":"x"}`, false, ""},
		{"properties extra rejected", `{"type":"object","properties":{"a":{"type":"string"}},"additionalProperties":false}`, `{"a":"x","b":1}`, true, "unexpected property"},
		{"additionalProperties schema rejected", `{"type":"object","additionalProperties":{"type":"string"}}`, `{"a":1}`, true, "expected type"},
		{"additionalProperties schema ok", `{"type":"object","additionalProperties":{"type":"string"}}`, `{"a":"x"}`, false, ""},
		{"oneOf exactly one", `{"oneOf":[{"type":"string"},{"type":"integer"}]}`, `"x"`, false, ""},
		{"oneOf none", `{"oneOf":[{"type":"string"},{"type":"integer"}]}`, `true`, true, "oneOf"},
		{"anyOf one matches", `{"anyOf":[{"type":"string"},{"type":"integer"}]}`, `1`, false, ""},
		{"anyOf none", `{"anyOf":[{"type":"string"},{"type":"integer"}]}`, `true`, true, "anyOf"},
		{"allOf all pass", `{"allOf":[{"type":"integer"},{"minimum":1}]}`, `2`, false, ""},
		{"allOf one fails", `{"allOf":[{"type":"integer"},{"minimum":1}]}`, `0`, true, "minimum"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := mustParse(t, tc.schema)
			err := validateJSON(t, s, tc.instance)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				if !strings.Contains(err.Error(), tc.errSubstr) {
					t.Fatalf("error %q does not contain %q", err.Error(), tc.errSubstr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestParseRejectsUnsupportedKeyword(t *testing.T) {
	_, err := schemacheck.Parse([]byte(`{"type":"object","patternProperties":{"x":{"type":"string"}}}`))
	if err == nil || !strings.Contains(err.Error(), "unsupported keyword") {
		t.Fatalf("expected unsupported-keyword error, got %v", err)
	}
}

func TestParseRejectsMalformedKeyword(t *testing.T) {
	if _, err := schemacheck.Parse([]byte(`{"type":"strng"}`)); err == nil {
		t.Fatalf("expected unknown-type error")
	}
	if _, err := schemacheck.Parse([]byte(`{"type":"array","uniqueItems":"yes"}`)); err == nil {
		t.Fatalf("expected non-boolean uniqueItems error")
	}
}

func TestResolvePointer(t *testing.T) {
	s := mustParse(t, `{"properties":{"snapshot":{"type":"object","properties":{"sourceId":{"type":"string"}},"additionalProperties":false}}}`)
	sub, err := s.Resolve("/properties/snapshot")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if err := sub.ValidateBytes([]byte(`{"sourceId":"git:x"}`)); err != nil {
		t.Fatalf("sub-schema validation: %v", err)
	}
	if err := sub.ValidateBytes([]byte(`{"other":1}`)); err == nil {
		t.Fatalf("expected sub-schema to reject unknown property")
	}
	if _, err := s.Resolve("/properties/missing"); err == nil {
		t.Fatalf("expected error for missing pointer key")
	}
}

func TestDecodeRejectsTrailingData(t *testing.T) {
	if _, err := schemacheck.Decode([]byte(`{} {}`)); err == nil {
		t.Fatalf("expected trailing-data error")
	}
}
