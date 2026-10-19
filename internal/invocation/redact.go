package invocation

import (
	"fmt"
	"regexp"
)

// redactRule is one secret pattern and the marker that replaces it.
type redactRule struct {
	// name is the kind of secret the rule masks. It names the kind, never
	// the length or the shape of what was matched.
	name string
	// pattern is the secret pattern. A nil pattern is a programming error:
	// the redaction pass fails closed rather than pass a payload through.
	pattern *regexp.Regexp
	// marker replaces every match.
	marker string
}

// defaultRules is the redaction pass: the secret shapes a provider is
// expected to print into its output, its stderr or its error.
//
// The order matters: the widest rule for a shape runs first, so a credential
// inside an Authorization header is masked as a header value rather than
// leaving the scheme behind.
var defaultRules = []redactRule{
	{
		name:    "bearer-token",
		pattern: regexp.MustCompile(`(?i)\bbearer\s+[A-Za-z0-9._~+/=\-]{6,}`),
		marker:  "[REDACTED:bearer-token]",
	},
	{
		name:    "connection-string",
		pattern: regexp.MustCompile(`\b[a-zA-Z][a-zA-Z0-9+.\-]*://[^\s:/@]+:[^\s/@]+@[^\s]+`),
		marker:  "[REDACTED:connection-string]",
	},
	{
		name:    "github-token",
		pattern: regexp.MustCompile(`\bgh[pousr]_[A-Za-z0-9]{16,}`),
		marker:  "[REDACTED:github-token]",
	},
	{
		name:    "api-key",
		pattern: regexp.MustCompile(`\bsk-[A-Za-z0-9_\-]{8,}`),
		marker:  "[REDACTED:api-key]",
	},
	{
		name:    "aws-access-key",
		pattern: regexp.MustCompile(`\bAKIA[0-9A-Z]{16}`),
		marker:  "[REDACTED:aws-access-key]",
	},
}

// Redact masks the secret patterns in s.
//
// Every match is replaced with a fixed marker that names the KIND of secret
// (`[REDACTED:github-token]`) and never the length of what was matched, so a
// redacted payload leaks nothing about the secret it hid.
//
// The pass fails closed: if a rule is missing, Redact returns an error and
// the caller must not persist or return the payload.
func Redact(s string) (string, error) {
	return redactWith(defaultRules, s)
}

// redactWith applies the given rules to s.
func redactWith(rules []redactRule, s string) (string, error) {
	if s == "" {
		return "", nil
	}
	out := s
	for _, rule := range rules {
		if rule.pattern == nil {
			return "", fmt.Errorf("LPSM-INVOCATION-REDACTION-FAILED: the %s pattern is not compiled", rule.name)
		}
		out = rule.pattern.ReplaceAllString(out, rule.marker)
	}
	return out, nil
}
