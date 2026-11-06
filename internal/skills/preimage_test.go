package skills

// preimage_test.go — S2: the pre-image of a replaced tree must cover the WHOLE
// tree, .git included. The backup copy and the digest both skipped .git, so a
// forced overwrite of a directory that held repository metadata destroyed
// those bytes with no restore path while the recorded digest silently
// "verified" the incomplete backup.

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const gitConfigBody = "[core]\n\trepositoryformatversion = 0\n"

// forceOverwriteFixture builds a sentinel destination that also holds a .git
// directory, plus the replacement source, and force-installs over it.
func forceOverwriteFixture(t *testing.T) (dst, backup, recorded string) {
	t.Helper()
	in, _ := testInstaller(t)
	src := t.TempDir()
	writeSkillBody(t, src, "# v2\n")
	dst = filepath.Join(t.TempDir(), "skills", "pdf")
	writeSentinelTree(t, dst)
	if err := os.MkdirAll(filepath.Join(dst, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dst, ".git", "config"), []byte(gitConfigBody), 0o644); err != nil {
		t.Fatal(err)
	}
	entry, err := in.Install(context.Background(), InstallRequest{
		Op:         InstallOp{SkillName: "pdf", FromDir: src, ToDir: dst, HostLabel: "claude-code"},
		Source:     SkillSource{Display: "owner/repo"},
		Scope:      "project",
		Force:      true,
		BackupRoot: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("forced install failed: %v", err)
	}
	if entry.PreImageBackup == "" {
		t.Fatal("forced install must record a pre-image backup")
	}
	return dst, entry.PreImageBackup, entry.PreImageDigest
}

// TestForcePreImagePreservesGitDirectory: the .git bytes survive in the backup
// AND the recorded pre-image digest covers them, so altering one of them
// fails verification.
func TestForcePreImagePreservesGitDirectory(t *testing.T) {
	_, backup, recorded := forceOverwriteFixture(t)

	got, err := os.ReadFile(filepath.Join(backup, ".git", "config"))
	if err != nil {
		t.Fatalf("backup lost .git/config: %v", err)
	}
	if string(got) != gitConfigBody {
		t.Errorf(".git/config not preserved byte for byte: %q", got)
	}

	// An intact backup verifies against the recorded digest ...
	prov, err := CapturePreImage(backup)
	if err != nil {
		t.Fatal(err)
	}
	if prov.Digest != recorded {
		t.Errorf("intact backup %s does not verify against recorded pre-image %s", prov.Digest, recorded)
	}
	// ... which must differ from the .git-skipping digest, i.e. really covers
	// the .git content.
	legacy, err := CaptureProvenance(backup)
	if err != nil {
		t.Fatal(err)
	}
	if legacy.Digest == prov.Digest {
		t.Error("pre-image digest does not cover .git: verbatim and VCS-skipping digests agree")
	}

	// Tampering with a .git byte breaks verification.
	if err := os.WriteFile(filepath.Join(backup, ".git", "config"), []byte("[core]\n\ttampered = true\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	tampered, err := CapturePreImage(backup)
	if err != nil {
		t.Fatal(err)
	}
	if tampered.Digest == recorded {
		t.Error("altering a .git byte left the recorded pre-image digest matching")
	}
}

// TestForcePreImageRefusesUnpreservableTree: a tree that cannot be preserved
// verbatim (a symlink inside .git) is refused BEFORE anything is destroyed,
// exactly as symlinks are refused everywhere else on this path.
func TestForcePreImageRefusesUnpreservableTree(t *testing.T) {
	in, _ := testInstaller(t)
	src := t.TempDir()
	writeSkillBody(t, src, "# v2\n")
	dst := filepath.Join(t.TempDir(), "skills", "pdf")
	writeSentinelTree(t, dst)
	if err := os.MkdirAll(filepath.Join(dst, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("/etc/passwd", filepath.Join(dst, ".git", "hooks")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}

	_, err := in.Install(context.Background(), InstallRequest{
		Op:         InstallOp{SkillName: "pdf", FromDir: src, ToDir: dst, HostLabel: "claude-code"},
		Source:     SkillSource{Display: "owner/repo"},
		Scope:      "project",
		Force:      true,
		BackupRoot: t.TempDir(),
	})
	if err == nil {
		t.Fatal("a tree that cannot be preserved verbatim must be refused")
	}
	data, rerr := os.ReadFile(filepath.Join(dst, "SKILL.md"))
	if rerr != nil || !strings.Contains(string(data), "SENTINEL") {
		t.Errorf("refused overwrite must leave the destination untouched: %q %v", data, rerr)
	}
}
