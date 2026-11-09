package main

import (
	"context"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/update"
)

func TestVerifyDownloadedUpdateRequiresSignatureByDefault(t *testing.T) {
	t.Setenv("LITESPM_ALLOW_UNSIGNED_RELEASE", "")
	info := &update.ReleaseInfo{Version: "0.3.9", BundleURLs: map[string]string{}}
	err := verifyDownloadedUpdate(context.Background(), nil, info, update.TargetBinaryName(), []byte("binary"), t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "signed self-updates are required by default") {
		t.Fatalf("expected unsigned release refusal, got %v", err)
	}
}

func TestVerifyDownloadedUpdateAllowsExplicitUnsignedReleaseOptOut(t *testing.T) {
	for _, value := range []string{"1", "true", "yes"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("LITESPM_ALLOW_UNSIGNED_RELEASE", value)
			info := &update.ReleaseInfo{Version: "0.3.9", BundleURLs: map[string]string{}}
			if err := verifyDownloadedUpdate(context.Background(), nil, info, update.TargetBinaryName(), []byte("binary"), t.TempDir()); err != nil {
				t.Fatalf("explicit checksum-only opt-out should permit a pre-signing release: %v", err)
			}
		})
	}
}

func TestVerifyDownloadedUpdateUnknownOptOutValueDoesNotWeakenPolicy(t *testing.T) {
	for _, value := range []string{"", "0", "on", "tru", "enabled"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("LITESPM_ALLOW_UNSIGNED_RELEASE", value)
			info := &update.ReleaseInfo{Version: "0.3.9", BundleURLs: map[string]string{}}
			if err := verifyDownloadedUpdate(context.Background(), nil, info, update.TargetBinaryName(), []byte("binary"), t.TempDir()); err == nil {
				t.Fatal("unknown or disabled opt-out value must not permit checksum-only update")
			}
		})
	}
}
