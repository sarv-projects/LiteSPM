package trust

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/lockfile"
	"github.com/sarv-projects/litespm/internal/manifest"
)

func testLock(t *testing.T) *lockfile.Lock {
	t.Helper()
	m, err := manifest.Parse([]byte("schemaVersion = 1\n[project]\nname = \"x\"\n[[requires]]\nid = \"mcp:builtin:mcp-registry:pg\"\nconstraint = \"1.0.0\"\n"))
	if err != nil {
		t.Fatal(err)
	}
	l, err := lockfile.Freeze(m, func(id, _ string) (lockfile.LockedEntry, error) {
		return lockfile.LockedEntry{ID: id, Version: "1.0.0", ArtifactSHA256: "sha256:" + strings.Repeat("c", 64), License: "Apache-2.0"}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return l
}

func TestCosignAbsentIsUnavailable(t *testing.T) {
	v := CosignVerifier{Identity: "x", Issuer: "y", LookPath: func(string) (string, error) {
		return "", errors.New("not found")
	}}
	ver := v.Verify(context.Background(), "ghcr.io/x/y@sha256:z", "")
	if ver.Result != ResultUnavailable {
		t.Errorf("missing cosign must be unavailable, got %v", ver)
	}
}

func TestCosignWithoutIdentityIsUnavailable(t *testing.T) {
	v := CosignVerifier{LookPath: func(s string) (string, error) { return "/usr/bin/" + s, nil }}
	if ver := v.Verify(context.Background(), "img", ""); ver.Result != ResultUnavailable {
		t.Errorf("unconfigured verifier must be unavailable, got %v", ver)
	}
}

func TestSHA256Pin(t *testing.T) {
	blob := []byte("hello")
	pinned := lockfile.DigestBytes(blob)
	if ver := SHA256Verifier(blob, pinned); ver.Result != ResultVerified {
		t.Errorf("matching pin: %v", ver)
	}
	if ver := SHA256Verifier(blob, "sha256:"+strings.Repeat("0", 64)); ver.Result != ResultFailed {
		t.Errorf("mismatch must fail: %v", ver)
	}
	if ver := SHA256Verifier(blob, ""); ver.Result != ResultUnavailable {
		t.Errorf("no pin must be unavailable: %v", ver)
	}
}

func TestSBOMCarriesLockDigest(t *testing.T) {
	l := testLock(t)
	for _, f := range []string{"cyclonedx-json", "spdx-json"} {
		b, err := SBOM(l, f)
		if err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		var doc map[string]any
		if err := json.Unmarshal(b, &doc); err != nil {
			t.Fatalf("%s is not JSON: %v", f, err)
		}
		if !strings.Contains(string(b), l.LockDigest) {
			t.Errorf("%s does not carry the lock digest", f)
		}
	}
	if _, err := SBOM(l, "bogus"); err == nil {
		t.Error("bad SBOM format must fail")
	}
}

// TestSBOMIsReproducible pins the SBOM determinism fix: two generations from
// the same lock must be byte-identical, and the CycloneDX timestamp must be
// pinned to SOURCE_DATE_EPOCH rather than the wall clock (the wall clock is
// what made the output non-reproducible). The SPDX document namespace must be
// derived from the lock digest and carry a DESCRIBES relationship per package.
func TestSBOMIsReproducible(t *testing.T) {
	t.Setenv("SOURCE_DATE_EPOCH", "1759665600") // 2025-10-05T12:00:00Z
	l := testLock(t)

	for _, format := range []string{"cyclonedx-json", "spdx-json"} {
		first, err := SBOM(l, format)
		if err != nil {
			t.Fatalf("%s: %v", format, err)
		}
		second, err := SBOM(l, format)
		if err != nil {
			t.Fatalf("%s: %v", format, err)
		}
		if !bytes.Equal(first, second) {
			t.Errorf("%s is not byte-reproducible across calls:\n%s\n%s", format, first, second)
		}
	}

	cdx, err := SBOM(l, "cyclonedx-json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(cdx, []byte("2025-10-05T12:00:00Z")) {
		t.Errorf("cyclonedx timestamp is not pinned to SOURCE_DATE_EPOCH: %s", cdx)
	}

	spdxDoc, err := SBOM(l, "spdx-json")
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		DocumentNamespace string `json:"documentNamespace"`
		Relationships     []struct {
			SpdxElementID    string `json:"spdxElementId"`
			RelationshipType string `json:"relationshipType"`
		} `json:"relationships"`
		Packages []struct {
			SPDXID string `json:"SPDXID"`
		} `json:"packages"`
	}
	if err := json.Unmarshal(spdxDoc, &doc); err != nil {
		t.Fatalf("spdx is not JSON: %v", err)
	}
	if !strings.Contains(doc.DocumentNamespace, strings.TrimPrefix(l.LockDigest, "sha256:")) {
		t.Errorf("spdx namespace %q does not derive from lock digest %q", doc.DocumentNamespace, l.LockDigest)
	}
	if len(doc.Packages) == 0 || len(doc.Relationships) != len(doc.Packages) {
		t.Fatalf("want one DESCRIBES relationship per package, got %d relationships for %d packages", len(doc.Relationships), len(doc.Packages))
	}
	for _, r := range doc.Relationships {
		if r.RelationshipType != "DESCRIBES" || r.SpdxElementID != "SPDXRef-DOCUMENT" {
			t.Errorf("unexpected relationship %+v", r)
		}
	}
}

func TestAdvisoryQuarantine(t *testing.T) {
	s := NewAdvisoryStore()
	unsigned := Advisory{AdvisoryID: "adv_1", PackageID: "mcp:x:y:z", Severity: "critical", Summary: "bad", Signed: false}
	if err := s.Add(unsigned); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.Quarantined("mcp:x:y:z"); ok {
		t.Error("unsigned advisory must not quarantine")
	}
	signed := Advisory{AdvisoryID: "adv_2", PackageID: "mcp:x:y:z", Severity: "high", Summary: "bad", Signed: true}
	if err := s.Add(signed); err != nil {
		t.Fatal(err)
	}
	if id, ok := s.Quarantined("mcp:x:y:z"); !ok || id != "adv_2" {
		t.Errorf("signed advisory must quarantine: %v %v", id, ok)
	}
	s.RevokeSigner("key-1")
	if !s.SignerRevoked("key-1") {
		t.Error("revocation must stick")
	}
}
