package trust

// blob.go verifies detached Sigstore bundles for release artifacts.
//
// Verification is performed in-process with sigstore-go. The consumer does not
// need the cosign executable: it loads the public-good Sigstore trust root via
// TUF, validates the bundle's signature, certificate, SCT and Rekor proof, and
// pins both the GitHub Actions OIDC issuer and this repository's tagged release
// workflow identity. A checksum alone is never treated as publisher identity.

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/sigstore/sigstore-go/pkg/bundle"
	"github.com/sigstore/sigstore-go/pkg/root"
	"github.com/sigstore/sigstore-go/pkg/verify"
)

const (
	// DefaultBundleSuffix is the asset-name suffix release.yml appends to
	// every artifact it signs.
	DefaultBundleSuffix = ".sigstore.json"

	// DefaultBlobIdentityRegexp pins the certificate SAN to this
	// repository's release workflow on a release tag. Case-insensitive on
	// purpose: GitHub's OIDC workflow_ref claim can differ in case from the
	// clone URL, and repository names are unique case-insensitively on
	// GitHub, so (?i) cannot admit a different repository.
	DefaultBlobIdentityRegexp = `(?i)^https://github\.com/sarv-projects/LiteSPM/\.github/workflows/release\.yml@refs/tags/v[0-9]+\.[0-9]+\.[0-9]+[^/]*$`

	// DefaultBlobIssuer is the OIDC issuer that signs GitHub Actions'
	// federated identity.
	DefaultBlobIssuer = "https://token.actions.githubusercontent.com"
)

// BlobVerifier verifies a file against a detached Sigstore bundle written by
// `cosign sign-blob --bundle`. Verification itself uses sigstore-go; Cosign is
// only needed in the release workflow that creates signatures, not by users.
type BlobVerifier struct {
	// IdentityRegexp matches the certificate's SAN URI (Go RE2).
	IdentityRegexp string
	// Issuer matches the certificate's OIDC issuer claim.
	Issuer string
	// VerifyFunc is a test seam for the cryptographic verifier. Production
	// callers should leave it nil so the in-process Sigstore verifier runs.
	VerifyFunc func(ctx context.Context, artifactPath, bundlePath, identityRegexp, issuer string) error
}

// VerifyBundle checks path against the Sigstore bundle at bundlePath.
// Result semantics: verified only after sigstore-go validates the artifact
// digest, certificate identity, OIDC issuer, SCT and transparency-log proof.
func (v BlobVerifier) VerifyBundle(ctx context.Context, path, bundlePath string) Verdict {
	subject := path
	if strings.TrimSpace(path) == "" || strings.TrimSpace(bundlePath) == "" {
		return Verdict{Subject: subject, Method: "sigstore-bundle", Result: ResultUnavailable, Detail: "no file or bundle path to verify"}
	}

	identity := v.IdentityRegexp
	if strings.TrimSpace(identity) == "" {
		identity = DefaultBlobIdentityRegexp
	}
	issuer := v.Issuer
	if strings.TrimSpace(issuer) == "" {
		issuer = DefaultBlobIssuer
	}
	if strings.TrimSpace(identity) == "" || strings.TrimSpace(issuer) == "" {
		return Verdict{Subject: subject, Method: "sigstore-bundle", Result: ResultUnavailable, Detail: "no expected identity/issuer configured; refusing to verify against an unknown signer"}
	}

	verifyFn := v.VerifyFunc
	if verifyFn == nil {
		verifyFn = verifySigstoreBundle
	}
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	if err := verifyFn(ctx, path, bundlePath, identity, issuer); err != nil {
		result := ResultFailed
		var unavailable *UnavailableError
		if errors.As(err, &unavailable) {
			result = ResultUnavailable
		}
		return Verdict{Subject: subject, Method: "sigstore-bundle", Result: result, Detail: "sigstore-go: " + truncateDetail(err.Error(), 500)}
	}
	return Verdict{Subject: subject, Method: "sigstore-bundle", Result: ResultVerified,
		Detail: fmt.Sprintf("bundle verified against identity %s", identity)}
}

// UnavailableError marks a verification attempt that could not be completed
// (for example, the public Sigstore trust root could not be fetched). Callers
// must never treat it as a successful verification. Different consumers may
// choose different fail-closed/fallback policies for this explicit state.
type UnavailableError struct{ Err error }

func (e *UnavailableError) Error() string {
	if e == nil || e.Err == nil {
		return "verification unavailable"
	}
	return e.Err.Error()
}
func (e *UnavailableError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

// NewUnavailableError wraps a cause so callers and tests can preserve the
// distinction between a bad signature and unavailable trust material.
func NewUnavailableError(err error) error { return &UnavailableError{Err: err} }

func unavailableVerification(err error) error { return NewUnavailableError(err) }

func verifySigstoreBundle(ctx context.Context, artifactPath, bundlePath, identityRegexp, issuer string) error {
	select {
	case <-ctx.Done():
		return unavailableVerification(ctx.Err())
	default:
	}

	artifact, err := os.Open(artifactPath)
	if err != nil {
		return unavailableVerification(fmt.Errorf("open artifact: %w", err))
	}
	hasher := sha256.New()
	if _, err := io.Copy(hasher, artifact); err != nil {
		_ = artifact.Close()
		return unavailableVerification(fmt.Errorf("hash artifact: %w", err))
	}
	if err := artifact.Close(); err != nil {
		return unavailableVerification(fmt.Errorf("close artifact after hashing: %w", err))
	}
	digest := hasher.Sum(nil)

	// The root is fetched/updated through TUF using the root embedded in
	// sigstore-go as the initial trust anchor. This removes any dependency on
	// a separately installed cosign binary while retaining the same public
	// Sigstore trust chain.
	trustedMaterial, err := root.FetchTrustedRoot()
	if err != nil {
		return unavailableVerification(fmt.Errorf("load Sigstore trusted root through TUF: %w", err))
	}

	select {
	case <-ctx.Done():
		return unavailableVerification(ctx.Err())
	default:
	}

	verifier, err := verify.NewVerifier(
		trustedMaterial,
		verify.WithSignedCertificateTimestamps(1),
		verify.WithTransparencyLog(1),
		verify.WithObserverTimestamps(1),
	)
	if err != nil {
		return unavailableVerification(fmt.Errorf("configure Sigstore verifier: %w", err))
	}

	certID, err := verify.NewShortCertificateIdentity(issuer, "", "", identityRegexp)
	if err != nil {
		return unavailableVerification(fmt.Errorf("configure release signer identity: %w", err))
	}

	signedBundle, err := loadSigstoreBundle(bundlePath, digest[:])
	if err != nil {
		return fmt.Errorf("load Sigstore bundle: %w", err)
	}

	if _, err := verifier.Verify(
		signedBundle,
		verify.NewPolicy(
			verify.WithArtifactDigest("sha256", digest[:]),
			verify.WithCertificateIdentity(certID),
		),
	); err != nil {
		return fmt.Errorf("verify signature, artifact digest, certificate identity and transparency proof: %w", err)
	}
	return nil
}

func truncateDetail(detail string, max int) string {
	detail = strings.TrimSpace(detail)
	if len(detail) > max {
		return detail[:max]
	}
	return detail
}

// legacyCosignBundle is the detached bundle shape emitted by older cosign
// versions (`base64Signature`, `cert`, `rekorBundle`). Newer releases publish
// the protobuf bundle directly. npm's installer already normalizes both wire
// formats; the native verifier must do the same to keep Go and npm equivalent.
type legacyCosignBundle struct {
	Base64Signature string `json:"base64Signature"`
	Cert            string `json:"cert"`
	RekorBundle     struct {
		Payload struct {
			Body           string      `json:"body"`
			IntegratedTime json.Number `json:"integratedTime"`
			LogIndex       json.Number `json:"logIndex"`
			LogID          string      `json:"logID"`
		} `json:"Payload"`
		SignedEntryTimestamp string `json:"SignedEntryTimestamp"`
	} `json:"rekorBundle"`
}

const bundleV01MediaType = "application/vnd.dev.sigstore.bundle+json;version=0.1"

func loadSigstoreBundle(path string, artifactDigest []byte) (*bundle.Bundle, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var shape map[string]json.RawMessage
	if err := json.Unmarshal(raw, &shape); err != nil {
		return nil, fmt.Errorf("bundle is not valid JSON: %w", err)
	}
	if shape == nil {
		return nil, fmt.Errorf("bundle must be a JSON object")
	}

	if _, ok := shape["mediaType"]; ok {
		var parsed bundle.Bundle
		if err := parsed.UnmarshalJSON(raw); err != nil {
			return nil, fmt.Errorf("invalid Sigstore protobuf bundle: %w", err)
		}
		return &parsed, nil
	}
	if _, sig := shape["base64Signature"]; !sig {
		return nil, fmt.Errorf("bundle is neither a Sigstore protobuf bundle nor a legacy cosign bundle")
	}
	if _, cert := shape["cert"]; !cert {
		return nil, fmt.Errorf("legacy cosign bundle is missing cert")
	}
	if _, rekor := shape["rekorBundle"]; !rekor {
		return nil, fmt.Errorf("legacy cosign bundle is missing rekorBundle")
	}

	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var legacy legacyCosignBundle
	if err := decoder.Decode(&legacy); err != nil {
		return nil, fmt.Errorf("decode legacy cosign bundle: %w", err)
	}
	protobufJSON, err := legacyCosignBundleToV01(legacy, artifactDigest)
	if err != nil {
		return nil, err
	}
	var parsed bundle.Bundle
	if err := parsed.UnmarshalJSON(protobufJSON); err != nil {
		return nil, fmt.Errorf("invalid normalized legacy cosign bundle: %w", err)
	}
	return &parsed, nil
}

func legacyCosignBundleToV01(legacy legacyCosignBundle, artifactDigest []byte) ([]byte, error) {
	if len(artifactDigest) != sha256.Size {
		return nil, fmt.Errorf("legacy bundle normalization requires a SHA-256 artifact digest")
	}
	payload := legacy.RekorBundle.Payload
	if payload.Body == "" || payload.IntegratedTime.String() == "" || payload.LogIndex.String() == "" || payload.LogID == "" {
		return nil, fmt.Errorf("legacy bundle Rekor payload is missing body, integratedTime, logIndex or logID")
	}
	if legacy.RekorBundle.SignedEntryTimestamp == "" {
		return nil, fmt.Errorf("legacy bundle is missing Rekor SignedEntryTimestamp")
	}

	pemBytes, err := decodeBase64Strict(legacy.Cert, "bundle cert")
	if err != nil {
		return nil, err
	}
	certBlock, rest := pem.Decode(pemBytes)
	if certBlock == nil || certBlock.Type != "CERTIFICATE" || len(bytes.TrimSpace(rest)) != 0 {
		return nil, fmt.Errorf("legacy bundle cert is not a single PEM certificate")
	}

	signature, err := decodeBase64Strict(legacy.Base64Signature, "bundle signature")
	if err != nil {
		return nil, err
	}
	canonicalizedBody, err := decodeBase64Strict(payload.Body, "Rekor entry body")
	if err != nil {
		return nil, err
	}
	signedEntryTimestamp, err := decodeBase64Strict(legacy.RekorBundle.SignedEntryTimestamp, "Rekor signed entry timestamp")
	if err != nil {
		return nil, err
	}
	logIDHex := strings.TrimSpace(payload.LogID)
	if len(logIDHex) == 0 || len(logIDHex)%2 != 0 {
		return nil, fmt.Errorf("legacy bundle Rekor logID is not valid hexadecimal")
	}
	logID, err := hex.DecodeString(logIDHex)
	if err != nil {
		return nil, fmt.Errorf("legacy bundle Rekor logID is not valid hexadecimal: %w", err)
	}
	integratedTime, err := payload.IntegratedTime.Int64()
	if err != nil || integratedTime <= 0 {
		return nil, fmt.Errorf("legacy bundle Rekor integratedTime is not a positive integer")
	}
	logIndex, err := payload.LogIndex.Int64()
	if err != nil || logIndex < 0 {
		return nil, fmt.Errorf("legacy bundle Rekor logIndex is not a non-negative integer")
	}

	// This is a format conversion only. The digest is computed from the bytes
	// on disk; sigstore-go still performs all certificate, signature, issuer,
	// SCT and Rekor SET cryptographic verification afterwards.
	normalized := map[string]any{
		"mediaType": bundleV01MediaType,
		"verificationMaterial": map[string]any{
			"x509CertificateChain": map[string]any{
				"certificates": []any{map[string]any{"rawBytes": base64.StdEncoding.EncodeToString(certBlock.Bytes)}},
			},
			"tlogEntries": []any{map[string]any{
				"logIndex":       fmt.Sprintf("%d", logIndex),
				"logId":          map[string]any{"keyId": base64.StdEncoding.EncodeToString(logID)},
				"kindVersion":    map[string]any{"kind": "hashedrekord", "version": "0.0.1"},
				"integratedTime": fmt.Sprintf("%d", integratedTime),
				"inclusionPromise": map[string]any{
					"signedEntryTimestamp": base64.StdEncoding.EncodeToString(signedEntryTimestamp),
				},
				"canonicalizedBody": base64.StdEncoding.EncodeToString(canonicalizedBody),
			}},
		},
		"messageSignature": map[string]any{
			"messageDigest": map[string]any{
				"algorithm": "SHA2_256",
				"digest":    base64.StdEncoding.EncodeToString(artifactDigest),
			},
			"signature": base64.StdEncoding.EncodeToString(signature),
		},
	}
	return json.Marshal(normalized)
}

func decodeBase64Strict(value, what string) ([]byte, error) {
	compact := strings.Join(strings.Fields(value), "")
	if compact == "" || len(compact)%4 != 0 {
		return nil, fmt.Errorf("%s is not valid base64", what)
	}
	decoded, err := base64.StdEncoding.Strict().DecodeString(compact)
	if err != nil || len(decoded) == 0 || base64.StdEncoding.EncodeToString(decoded) != compact {
		return nil, fmt.Errorf("%s is not valid base64", what)
	}
	return decoded, nil
}
