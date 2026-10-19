package invocation

import (
	"strings"
	"testing"
)

// Every secret shape the redaction pass knows must be masked, and the marker
// must name the KIND of secret — never its length, never its value.
func TestRedactMasksEveryKnownSecretShape(t *testing.T) {
	cases := []struct {
		name   string
		input  string
		secret string
		marker string
	}{
		{
			name:   "github token",
			input:  "token=ghp_abcdefghijklmnopqrstuvwxyz012345",
			secret: "ghp_abcdefghijklmnopqrstuvwxyz012345",
			marker: "[REDACTED:github-token]",
		},
		{
			name:   "api key",
			input:  "key=sk-1234567890abcdef",
			secret: "sk-1234567890abcdef",
			marker: "[REDACTED:api-key]",
		},
		{
			name:   "bearer header",
			input:  "Authorization: Bearer sk-1234567890abcdef",
			secret: "sk-1234567890abcdef",
			marker: "[REDACTED:bearer-token]",
		},
		{
			name:   "aws access key",
			input:  "AKIAIOSFODNN7EXAMPLE",
			secret: "AKIAIOSFODNN7EXAMPLE",
			marker: "[REDACTED:aws-access-key]",
		},
		{
			name:   "connection string",
			input:  "postgres://admin:hunter2@db.internal:5432/app",
			secret: "hunter2",
			marker: "[REDACTED:connection-string]",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out, err := Redact(tc.input)
			if err != nil {
				t.Fatalf("Redact: %v", err)
			}
			if strings.Contains(out, tc.secret) {
				t.Errorf("the secret survived the redaction: %q", out)
			}
			if !strings.Contains(out, tc.marker) {
				t.Errorf("output %q does not carry the marker %q", out, tc.marker)
			}
		})
	}
}

// The marker names the kind and nothing else: a marker that leaked the
// length of the secret would tell a reader how long it is.
func TestRedactMarkerNamesTheKindNotTheLength(t *testing.T) {
	secret := "ghp_abcdefghijklmnopqrstuvwxyz012345"
	out, err := Redact("token=" + secret)
	if err != nil {
		t.Fatalf("Redact: %v", err)
	}
	if out != "token=[REDACTED:github-token]" {
		t.Errorf("unexpected redaction: %q", out)
	}
	if strings.Contains(out, "36") {
		t.Errorf("the marker leaks the length of the secret: %q", out)
	}
}

// A rule that is not compiled is a programming error, and the pass fails
// closed: the caller must not persist or return an unredacted payload.
func TestRedactFailsClosedWhenARuleIsMissing(t *testing.T) {
	out, err := redactWith([]redactRule{{name: "broken"}}, "a secret")
	if err == nil {
		t.Fatalf("a missing rule must fail the redaction, got %q", out)
	}
	if !strings.Contains(err.Error(), "LPSM-INVOCATION-REDACTION-FAILED") {
		t.Errorf("unexpected error: %v", err)
	}
	if out != "" {
		t.Errorf("a failed redaction must not return the payload, got %q", out)
	}
}

// Text without a secret is returned unchanged: the redaction pass must not
// rewrite the payload it is trusted to keep.
func TestRedactLeavesOrdinaryTextAlone(t *testing.T) {
	const plain = "the query returned 42 rows in 13ms"
	out, err := Redact(plain)
	if err != nil {
		t.Fatalf("Redact: %v", err)
	}
	if out != plain {
		t.Errorf("Redact changed ordinary text: %q", out)
	}
}
