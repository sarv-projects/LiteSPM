// Package trust implements supply-chain verification hooks (ARCH/36 §5):
// Sigstore/cosign verification, SBOM export from the lock, and signed
// advisory/revocation tracking.
//
// Honesty rule (binding): every verification result defaults to
// "unavailable" until a real verifier produces verified/failed. Unsigned
// artifacts are reported, never passed off as trusted.
package trust

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/lockfile"
)

// Results.
const (
	ResultVerified    = "verified"
	ResultFailed      = "failed"
	ResultUnavailable = "unavailable"
)

// Verdict is one verification outcome.
type Verdict struct {
	Subject string `json:"subject"`
	Method  string `json:"method"` // cosign | sigstore-bundle | sha256-only | none
	Result  string `json:"result"` // verified | failed | unavailable
	Detail  string `json:"detail,omitempty"`
}

// Verifier checks artifact trust. Verify must never return verified without
// a real cryptographic check.
type Verifier interface {
	Verify(ctx context.Context, subject, digest string) Verdict
}

// CosignVerifier shells out to `cosign verify` when the binary exists. When
// cosign is absent (or no identity/issuer is configured) it returns
// unavailable — the honest state, not a pass.
type CosignVerifier struct {
	Identity string
	Issuer   string
	// LookPath allows tests to stub binary discovery.
	LookPath func(name string) (string, error)
}

func (v CosignVerifier) Verify(ctx context.Context, subject, digest string) Verdict {
	look := v.LookPath
	if look == nil {
		look = exec.LookPath
	}
	if _, err := look("cosign"); err != nil {
		return Verdict{Subject: subject, Method: "cosign", Result: ResultUnavailable, Detail: "cosign binary not found; install cosign and configure identity/issuer to verify"}
	}
	if strings.TrimSpace(v.Identity) == "" || strings.TrimSpace(v.Issuer) == "" {
		return Verdict{Subject: subject, Method: "cosign", Result: ResultUnavailable, Detail: "no expected identity/issuer configured; refusing to verify against an unknown signer"}
	}
	args := []string{"verify", "--certificate-identity", v.Identity, "--certificate-oidc-issuer", v.Issuer, subject}
	if digest != "" {
		args = append(args, "--expected-digest", digest)
	}
	// Real check: cosign must exit 0. Output is bounded by context.
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	cmd := exec.CommandContext(ctx, "cosign", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		detail := strings.TrimSpace(string(out))
		if len(detail) > 500 {
			detail = detail[:500]
		}
		return Verdict{Subject: subject, Method: "cosign", Result: ResultFailed, Detail: "cosign: " + detail}
	}
	return Verdict{Subject: subject, Method: "cosign", Result: ResultVerified, Detail: "cosign exit 0 for identity " + v.Identity}
}

// SHA256Verifier checks a downloaded blob against its pinned digest. This is
// integrity, not identity: it returns verified only for digest equality and
// never claims a signer.
func SHA256Verifier(blob []byte, pinned string) Verdict {
	got := lockfile.DigestBytes(blob)
	if pinned == "" {
		return Verdict{Subject: got, Method: "sha256-only", Result: ResultUnavailable, Detail: "no pinned digest to compare against"}
	}
	if got != pinned {
		return Verdict{Subject: got, Method: "sha256-only", Result: ResultFailed, Detail: fmt.Sprintf("digest mismatch: got %s, want %s", got, pinned)}
	}
	return Verdict{Subject: got, Method: "sha256-only", Result: ResultVerified, Detail: "byte digest matches the pin"}
}

// SBOM emits a minimal CycloneDX or SPDX document derived from the lock
// (ARCH/32 §4.1). Every document carries the lock digest it was generated
// from so the two cannot drift, and the output is deterministic: the CycloneDX
// timestamp honours SOURCE_DATE_EPOCH (the repo-wide reproducible-build
// convention used by cmd/litespm.parseBuildCreatedAt and
// scripts/build_full_catalog.py) and the SPDX documentNamespace is derived
// from the lock digest.
//
// No PURL is emitted. A LockedEntry carries the registry listing id, version
// and content digests — not an ecosystem package coordinate
// (pkg:type/namespace/name) — so a purl would be invented identity, which the
// honesty rule forbids.
func SBOM(l *lockfile.Lock, format string) ([]byte, error) {
	switch format {
	case "cyclonedx-json":
		return cyclonedx(l), nil
	case "spdx-json":
		return spdx(l), nil
	default:
		return nil, fmt.Errorf("LPSM-SBOM-FORMAT: %q must be cyclonedx-json|spdx-json", format)
	}
}

func cyclonedx(l *lockfile.Lock) []byte {
	doc := map[string]any{
		"bomFormat":   "CycloneDX",
		"specVersion": "1.5",
		"version":     1,
		"metadata": map[string]any{
			"timestamp": sbomTimestamp(),
			"properties": []any{
				map[string]any{"name": "litespm:lockDigest", "value": l.LockDigest},
			},
		},
	}
	var comps []any
	for _, e := range l.Entries {
		c := map[string]any{"type": "library", "name": e.ID, "version": e.Version}
		if e.License != "" && e.License != lockfile.LicenseNoAssertion {
			c["licenses"] = []any{map[string]any{"license": map[string]any{"id": e.License}}}
		}
		if e.ArtifactSHA256 != "" {
			hex := strings.TrimPrefix(e.ArtifactSHA256, "sha256:")
			c["hashes"] = []any{map[string]any{"alg": "SHA-256", "content": hex}}
		}
		comps = append(comps, c)
	}
	doc["components"] = comps
	b, _ := json.MarshalIndent(doc, "", "  ")
	return b
}

func spdx(l *lockfile.Lock) []byte {
	doc := map[string]any{
		"spdxVersion": "SPDX-2.3",
		"dataLicense": "CC0-1.0",
		"SPDXID":      "SPDXRef-DOCUMENT",
		"name":        "litespm-lock-sbom",
		// Deterministic and unique per lock: the namespace is derived from the
		// content-addressed lock digest, so two generations from the same lock
		// agree and two different locks never collide.
		"documentNamespace": "https://litespm.dev/sbom/" + strings.TrimPrefix(l.LockDigest, "sha256:"),
		"comment":           "generated from lock " + l.LockDigest,
	}
	var pkgs []any
	var rels []any
	for i, e := range l.Entries {
		lic := e.License
		if lic == "" {
			lic = lockfile.LicenseNoAssertion
		}
		spdxID := fmt.Sprintf("SPDXRef-Package-%d", i+1)
		p := map[string]any{
			"SPDXID":           spdxID,
			"name":             e.ID,
			"versionInfo":      e.Version,
			"licenseConcluded": lic,
		}
		if e.ArtifactSHA256 != "" {
			p["checksums"] = []any{map[string]any{"algorithm": "SHA256", "checksumValue": strings.TrimPrefix(e.ArtifactSHA256, "sha256:")}}
		}
		pkgs = append(pkgs, p)
		// The document DESCRIBES every package it lists; SPDX requires the
		// relationship to be explicit.
		rels = append(rels, map[string]any{
			"spdxElementId":      "SPDXRef-DOCUMENT",
			"relatedSpdxElement": spdxID,
			"relationshipType":   "DESCRIBES",
		})
	}
	doc["packages"] = pkgs
	doc["relationships"] = rels
	b, _ := json.MarshalIndent(doc, "", "  ")
	return b
}

// sbomTimestamp returns the CycloneDX metadata timestamp. It honours
// SOURCE_DATE_EPOCH — the repo-wide reproducible-build convention (see
// cmd/litespm.parseBuildCreatedAt and scripts/build_full_catalog.py) — so an
// SBOM generated twice from the same lock is byte-identical; without it the
// wall clock is stamped, the honest default. A malformed value falls back to
// the wall clock rather than failing the export.
func sbomTimestamp() string {
	if epoch := os.Getenv("SOURCE_DATE_EPOCH"); epoch != "" {
		if n, err := strconv.ParseInt(epoch, 10, 64); err == nil {
			return time.Unix(n, 0).UTC().Format(time.RFC3339)
		}
	}
	return time.Now().UTC().Format(time.RFC3339)
}

// Advisory is a signed upstream notice affecting a package range.
type Advisory struct {
	AdvisoryID    string `json:"advisoryId"`
	PackageID     string `json:"packageId"`
	AffectedRange string `json:"affectedRange,omitempty"`
	Severity      string `json:"severity"` // low|medium|high|critical
	Summary       string `json:"summary"`
	Signed        bool   `json:"signed"`
}

// AdvisoryStore tracks advisories and revocations. Unsigned advisories are
// recorded but never trusted for quarantine.
type AdvisoryStore struct {
	advisories []Advisory
	quarantine map[string]string // packageID -> advisoryID
	revoked    map[string]bool   // signer/key id -> revoked
}

// NewAdvisoryStore returns an empty store.
func NewAdvisoryStore() *AdvisoryStore {
	return &AdvisoryStore{quarantine: map[string]string{}, revoked: map[string]bool{}}
}

// Add records an advisory. severity must be known; unsigned advisories are
// stored with a warning and never quarantine.
func (s *AdvisoryStore) Add(a Advisory) error {
	switch a.Severity {
	case "low", "medium", "high", "critical":
	default:
		return fmt.Errorf("LPSM-ADVISORY-SEVERITY: %q", a.Severity)
	}
	if strings.TrimSpace(a.AdvisoryID) == "" || strings.TrimSpace(a.PackageID) == "" {
		return fmt.Errorf("LPSM-ADVISORY-ID: advisoryId and packageId are required")
	}
	s.advisories = append(s.advisories, a)
	if a.Signed {
		s.quarantine[a.PackageID] = a.AdvisoryID
	}
	return nil
}

// Quarantined reports whether a package is quarantined and why. Quarantine
// marks a capability non-invocable/non-installable; it never removes user
// software (removal needs an explicit approved uninstall).
func (s *AdvisoryStore) Quarantined(packageID string) (string, bool) {
	id, ok := s.quarantine[packageID]
	return id, ok
}

// RevokeSigner revokes a signing key/signer (distinct from an advisory).
func (s *AdvisoryStore) RevokeSigner(keyID string) {
	s.revoked[keyID] = true
}

// SignerRevoked reports revocation.
func (s *AdvisoryStore) SignerRevoked(keyID string) bool { return s.revoked[keyID] }

// QuarantinedPackages returns the sorted quarantine list.
func (s *AdvisoryStore) QuarantinedPackages() []string {
	out := make([]string, 0, len(s.quarantine))
	for p := range s.quarantine {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}
