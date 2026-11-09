package trust

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func regexpMatches(pattern, s string) bool {
	ok, err := regexp.MatchString(pattern, s)
	return err == nil && ok
}

// The verifier's contract: verified only after the in-process Sigstore verifier
// returns nil; any malformed or unverifiable published bundle fails closed.
func TestBlobVerifierResultMatrix(t *testing.T) {
	blob := filepath.Join(t.TempDir(), "litespm-linux-amd64")
	if err := os.WriteFile(blob, []byte("payload"), 0o600); err != nil {
		t.Fatal(err)
	}
	bundle := blob + DefaultBundleSuffix
	if err := os.WriteFile(bundle, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Run("verified by in-process verifier", func(t *testing.T) {
		called := false
		v := BlobVerifier{VerifyFunc: func(_ context.Context, artifactPath, bundlePath, identity, issuer string) error {
			called = true
			if artifactPath != blob || bundlePath != bundle {
				t.Fatalf("unexpected verification paths: %q %q", artifactPath, bundlePath)
			}
			if identity != DefaultBlobIdentityRegexp || issuer != DefaultBlobIssuer {
				t.Fatalf("unexpected trust policy: identity=%q issuer=%q", identity, issuer)
			}
			return nil
		}}
		verdict := v.VerifyBundle(context.Background(), blob, bundle)
		if !called || verdict.Result != ResultVerified {
			t.Fatalf("called=%v result=%q (%s), want verified", called, verdict.Result, verdict.Detail)
		}
		if verdict.Method != "sigstore-bundle" {
			t.Errorf("method = %q", verdict.Method)
		}
	})

	t.Run("failed verification is not downgraded", func(t *testing.T) {
		v := BlobVerifier{VerifyFunc: func(context.Context, string, string, string, string) error {
			return errors.New("signature mismatch")
		}}
		verdict := v.VerifyBundle(context.Background(), blob, bundle)
		if verdict.Result != ResultFailed {
			t.Fatalf("result = %q, want failed", verdict.Result)
		}
		if !strings.Contains(verdict.Detail, "signature mismatch") {
			t.Errorf("detail must carry verifier output, got: %q", verdict.Detail)
		}
	})

	t.Run("unavailable when trust material cannot be obtained", func(t *testing.T) {
		v := BlobVerifier{VerifyFunc: func(context.Context, string, string, string, string) error {
			return unavailableVerification(errors.New("Sigstore trust root is unreachable"))
		}}
		verdict := v.VerifyBundle(context.Background(), blob, bundle)
		if verdict.Result != ResultUnavailable {
			t.Fatalf("result = %q, want unavailable", verdict.Result)
		}
	})

	t.Run("unavailable for missing inputs", func(t *testing.T) {
		v := BlobVerifier{VerifyFunc: func(context.Context, string, string, string, string) error {
			t.Fatal("must not invoke verifier without inputs")
			return nil
		}}
		if got := v.VerifyBundle(context.Background(), "", bundle); got.Result != ResultUnavailable {
			t.Errorf("empty path result = %q, want unavailable", got.Result)
		}
		if got := v.VerifyBundle(context.Background(), blob, ""); got.Result != ResultUnavailable {
			t.Errorf("empty bundle result = %q, want unavailable", got.Result)
		}
	})

	t.Run("custom signer policy is passed through", func(t *testing.T) {
		v := BlobVerifier{
			IdentityRegexp: `^https://example\.com/release@refs/tags/v[0-9]+$`,
			Issuer:         "https://issuer.example.com",
			VerifyFunc: func(_ context.Context, _, _, identity, issuer string) error {
				if identity != `^https://example\.com/release@refs/tags/v[0-9]+$` || issuer != "https://issuer.example.com" {
					t.Fatalf("custom trust policy not passed through: %q %q", identity, issuer)
				}
				return nil
			},
		}
		if got := v.VerifyBundle(context.Background(), blob, bundle); got.Result != ResultVerified {
			t.Fatalf("custom identity verification result = %q (%s)", got.Result, got.Detail)
		}
	})
}

func TestDecodeBase64Strict(t *testing.T) {
	if _, err := decodeBase64Strict("AQID", "test"); err != nil {
		t.Fatalf("valid base64 rejected: %v", err)
	}
	for _, bad := range []string{"", "not-base64", "AQI", "AQ==junk"} {
		if _, err := decodeBase64Strict(bad, "test"); err == nil {
			t.Errorf("invalid base64 %q accepted", bad)
		}
	}
}

func TestLegacyCosignBundleToV01RejectsIncompleteMetadata(t *testing.T) {
	legacy := legacyCosignBundle{}
	if _, err := legacyCosignBundleToV01(legacy, make([]byte, 32)); err == nil {
		t.Fatal("incomplete legacy bundle must be rejected")
	}
}

func TestBlobVerifierRealReleaseBundle(t *testing.T) {
	artifactPath := strings.TrimSpace(os.Getenv("LITESPM_SIGSTORE_TEST_ARTIFACT"))
	bundlePath := strings.TrimSpace(os.Getenv("LITESPM_SIGSTORE_TEST_BUNDLE"))
	if artifactPath == "" || bundlePath == "" {
		t.Skip("set LITESPM_SIGSTORE_TEST_ARTIFACT and LITESPM_SIGSTORE_TEST_BUNDLE to verify a real release bundle")
	}
	verdict := (BlobVerifier{}).VerifyBundle(context.Background(), artifactPath, bundlePath)
	if verdict.Result != ResultVerified {
		t.Fatalf("real legacy release bundle was not verified: %s: %s", verdict.Result, verdict.Detail)
	}

	artifact, err := os.ReadFile(artifactPath)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(artifact)
	legacyBytes, err := os.ReadFile(bundlePath)
	if err != nil {
		t.Fatal(err)
	}
	decoder := json.NewDecoder(bytes.NewReader(legacyBytes))
	decoder.UseNumber()
	var legacy legacyCosignBundle
	if err := decoder.Decode(&legacy); err != nil {
		t.Fatal(err)
	}
	normalized, err := legacyCosignBundleToV01(legacy, digest[:])
	if err != nil {
		t.Fatalf("normalize legacy bundle to protobuf: %v", err)
	}
	normalizedPath := filepath.Join(t.TempDir(), "normalized.sigstore.json")
	if err := os.WriteFile(normalizedPath, normalized, 0o600); err != nil {
		t.Fatal(err)
	}
	verdict = (BlobVerifier{}).VerifyBundle(context.Background(), artifactPath, normalizedPath)
	if verdict.Result != ResultVerified {
		t.Fatalf("normalized protobuf release bundle was not verified: %s: %s", verdict.Result, verdict.Detail)
	}
}

// The default identity regexp must pin the release workflow on a tag ref and
// reject everything else — it is the whole point of keyless signing.
func TestDefaultBlobIdentityRegexp(t *testing.T) {
	matches := []string{
		"https://github.com/sarv-projects/LiteSPM/.github/workflows/release.yml@refs/tags/v0.3.0",
		"https://github.com/sarv-projects/LiteSPM/.github/workflows/release.yml@refs/tags/v1.2.3-rc.1",
		// GitHub's OIDC claim may normalize the repo case differently from
		// the clone URL; repo names are case-insensitively unique, so this
		// cannot be a different repository.
		"https://github.com/sarv-projects/litespm/.github/workflows/release.yml@refs/tags/v0.3.0",
	}
	misses := []string{
		// A fork's workflow, same tag name.
		"https://github.com/attacker/LiteSPM/.github/workflows/release.yml@refs/tags/v0.3.0",
		// PR-triggered run.
		"https://github.com/sarv-projects/LiteSPM/.github/workflows/release.yml@refs/pull/12/merge",
		// A different workflow in the same repo.
		"https://github.com/sarv-projects/LiteSPM/.github/workflows/ci.yml@refs/tags/v0.3.0",
		// Branch ref, not a release tag.
		"https://github.com/sarv-projects/LiteSPM/.github/workflows/release.yml@refs/heads/main",
	}
	for _, s := range matches {
		if !regexpMatches(DefaultBlobIdentityRegexp, s) {
			t.Errorf("expected match: %s", s)
		}
	}
	for _, s := range misses {
		if regexpMatches(DefaultBlobIdentityRegexp, s) {
			t.Errorf("expected NO match: %s", s)
		}
	}
}
