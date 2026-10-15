package skills

// install_force_test.go — the overwrite half of the skills install path:
// the PRE-ALWAYS "overwrites: <path>" disclosure, the unchanged refusal of an
// existing destination without --force, and the forced overwrite's pre-image
// capture (digest into the ledger entry, byte-exact backup on disk).

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// captureOverwriteNotices redirects the overwrite disclosure to fn for the
// duration of the test.
func captureOverwriteNotices(t *testing.T, fn func(dst string)) {
	t.Helper()
	prev := overwriteNotice
	overwriteNotice = fn
	t.Cleanup(func() { overwriteNotice = prev })
}

// writeSentinelTree puts a recognizable "user content" skill at dst.
func writeSentinelTree(t *testing.T, dst string) {
	t.Helper()
	writeSkillBody(t, dst, "# SENTINEL — the bytes that were there\n")
	if err := os.WriteFile(filepath.Join(dst, "my-notes.txt"), []byte("hand-edited notes"), 0o644); err != nil {
		t.Fatal(err)
	}
}

// TestInstallRefusedOverwriteNamesPathAndNotices: without --force an existing
// destination is still refused (same behaviour, same exit path), the refusal
// NAMES the path, and the overwrite line is emitted anyway so the user learns
// what is in the way.
func TestInstallRefusedOverwriteNamesPathAndNotices(t *testing.T) {
	in, ledger := testInstaller(t)
	var notices []string
	captureOverwriteNotices(t, func(dst string) { notices = append(notices, dst) })

	src := t.TempDir()
	writeSkillBody(t, src, "# v2\n")
	dst := filepath.Join(t.TempDir(), "skills", "pdf")
	writeSentinelTree(t, dst)

	_, err := in.Install(context.Background(), InstallRequest{
		Op:     InstallOp{SkillName: "pdf", FromDir: src, ToDir: dst, HostLabel: "claude-code"},
		Source: SkillSource{Display: "owner/repo"},
		Scope:  "project",
	})
	if err == nil {
		t.Fatal("existing destination must still be refused without --force")
	}
	if !strings.Contains(err.Error(), "destination already exists") {
		t.Errorf("refusal must keep its wording, got: %v", err)
	}
	if !strings.Contains(err.Error(), dst) {
		t.Errorf("refusal must name the path %s, got: %v", dst, err)
	}
	if len(notices) != 1 || notices[0] != dst {
		t.Errorf("overwrite notice must name the path exactly once, got %v", notices)
	}
	data, rerr := os.ReadFile(filepath.Join(dst, "SKILL.md"))
	if rerr != nil || !strings.Contains(string(data), "SENTINEL") {
		t.Errorf("refused install must not touch the destination: %q %v", data, rerr)
	}
	if all, _ := ledger.All(); len(all) != 0 {
		t.Errorf("refused install must not touch the ledger: %+v", all)
	}
}

// TestInstallOverwriteNoticePrecedesWrite: the disclosure fires BEFORE any
// write — the sentinel is still on disk at the moment the line is emitted.
func TestInstallOverwriteNoticePrecedesWrite(t *testing.T) {
	in, _ := testInstaller(t)
	src := t.TempDir()
	writeSkillBody(t, src, "# v2\n")
	dst := filepath.Join(t.TempDir(), "skills", "pdf")
	writeSentinelTree(t, dst)

	var lines []string
	sentinelPresentAtNotice := false
	captureOverwriteNotices(t, func(noticed string) {
		lines = append(lines, overwriteLine(noticed))
		if data, err := os.ReadFile(filepath.Join(dst, "SKILL.md")); err == nil && strings.Contains(string(data), "SENTINEL") {
			sentinelPresentAtNotice = true
		}
	})

	if _, err := in.Install(context.Background(), InstallRequest{
		Op:         InstallOp{SkillName: "pdf", FromDir: src, ToDir: dst, HostLabel: "claude-code"},
		Source:     SkillSource{Display: "owner/repo"},
		Scope:      "project",
		Force:      true,
		BackupRoot: t.TempDir(),
	}); err != nil {
		t.Fatalf("forced install failed: %v", err)
	}
	if len(lines) != 1 || lines[0] != overwriteLine(dst) {
		t.Errorf("expected exactly the line %q, got %v", overwriteLine(dst), lines)
	}
	if !sentinelPresentAtNotice {
		t.Error("the overwrite line must be emitted before any write: the sentinel was already gone")
	}
	data, err := os.ReadFile(filepath.Join(dst, "SKILL.md"))
	if err != nil || !strings.Contains(string(data), "# v2") {
		t.Fatalf("forced install did not replace the destination: %q %v", data, err)
	}
}

// TestInstallForcePreImageIsOriginalBytes is the load-bearing assertion: the
// ledger's pre-image is the digest of the ORIGINAL bytes — not "", not the
// new bytes — and the preserved backup is byte-exact.
func TestInstallForcePreImageIsOriginalBytes(t *testing.T) {
	in, ledger := testInstaller(t)
	src := t.TempDir()
	writeSkillBody(t, src, "# v2\n")
	dst := filepath.Join(t.TempDir(), "skills", "pdf")
	writeSentinelTree(t, dst)

	// Independent computation of what is about to be replaced.
	original, err := CaptureProvenance(dst)
	if err != nil {
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

	if entry.PreImageDigest == "" {
		t.Fatal("pre-image is empty: force must record what it replaced")
	}
	if entry.PreImageDigest != original.Digest {
		t.Errorf("pre-image %q is not the ORIGINAL tree's digest %q", entry.PreImageDigest, original.Digest)
	}
	if entry.ContentDigest == entry.PreImageDigest {
		t.Errorf("pre-image equals the new content digest %q although the install replaced a different tree", entry.ContentDigest)
	}
	replaced, err := CaptureProvenance(dst)
	if err != nil {
		t.Fatal(err)
	}
	if entry.ContentDigest != replaced.Digest {
		t.Errorf("post-image %q is not the new tree's digest %q", entry.ContentDigest, replaced.Digest)
	}

	// The row persisted to disk carries the same pre-image.
	reopened, _ := testLedger(t, ledger.path)
	all, _ := reopened.All()
	if len(all) != 1 {
		t.Fatalf("expected one ledger row, got %+v", all)
	}
	if all[0].PreImageDigest != original.Digest {
		t.Errorf("persisted pre-image %q is not the original digest %q", all[0].PreImageDigest, original.Digest)
	}
	raw, err := os.ReadFile(ledger.path)
	if err != nil {
		t.Fatal(err)
	}
	var wire []map[string]any
	if err := json.Unmarshal(raw, &wire); err != nil {
		t.Fatalf("ledger is not valid JSON: %v", err)
	}
	if got, _ := wire[0]["preImageDigest"].(string); got != original.Digest {
		t.Errorf("wire field preImageDigest = %q, want the original digest %q", got, original.Digest)
	}

	// The preserved backup is byte-exact: same digest, user file included.
	if entry.PreImageBackup == "" {
		t.Fatal("no backup recorded: the replaced bytes would be unrecoverable")
	}
	backupProv, err := CaptureProvenance(entry.PreImageBackup)
	if err != nil {
		t.Fatalf("backup not readable: %v", err)
	}
	if backupProv.Digest != original.Digest {
		t.Errorf("backup digest %q does not match the replaced tree %q", backupProv.Digest, original.Digest)
	}
	if data, err := os.ReadFile(filepath.Join(entry.PreImageBackup, "my-notes.txt")); err != nil || string(data) != "hand-edited notes" {
		t.Errorf("backup lost the user's file: %q %v", data, err)
	}
	// And the user file is gone from the destination — a real overwrite.
	if _, err := os.Stat(filepath.Join(dst, "my-notes.txt")); !os.IsNotExist(err) {
		t.Error("forced overwrite must replace the whole tree")
	}
}

// TestInstallForceReplacesLedgerRow: a forced re-install updates the existing
// row (the ledger must describe the tree on disk) instead of being dropped by
// Add's dedupe, and keeps the original install time.
func TestInstallForceReplacesLedgerRow(t *testing.T) {
	in, ledger := testInstaller(t)
	v1 := t.TempDir()
	writeSkillBody(t, v1, "# v1\n")
	dst := filepath.Join(t.TempDir(), "skills", "pdf")

	first, err := in.Install(context.Background(), InstallRequest{
		Op:     InstallOp{SkillName: "pdf", FromDir: v1, ToDir: dst, HostLabel: "claude-code"},
		Source: SkillSource{Display: "owner/repo"},
		Scope:  "project",
	})
	if err != nil {
		t.Fatal(err)
	}
	before, _ := testLedger(t, ledger.path)
	rows, _ := before.All()
	if len(rows) != 1 || rows[0].InstalledAt.IsZero() {
		t.Fatalf("expected one stamped row, got %+v", rows)
	}
	installedAt := rows[0].InstalledAt

	v2 := t.TempDir()
	writeSkillBody(t, v2, "# v2\n")
	second, err := in.Install(context.Background(), InstallRequest{
		Op:         InstallOp{SkillName: "pdf", FromDir: v2, ToDir: dst, HostLabel: "claude-code"},
		Source:     SkillSource{Display: "owner/repo"},
		Scope:      "project",
		Force:      true,
		BackupRoot: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("forced re-install failed: %v", err)
	}
	if second.PreImageDigest != first.ContentDigest {
		t.Errorf("pre-image %q is not the digest of the install it replaced (%q)", second.PreImageDigest, first.ContentDigest)
	}

	after, _ := testLedger(t, ledger.path)
	rows, _ = after.All()
	if len(rows) != 1 {
		t.Fatalf("forced re-install must keep a single row, got %+v", rows)
	}
	if rows[0].ContentDigest != second.ContentDigest {
		t.Errorf("ledger row still describes the old tree: %+v", rows[0])
	}
	if rows[0].PreImageDigest != first.ContentDigest {
		t.Errorf("ledger row lost the pre-image: %+v", rows[0])
	}
	if !rows[0].InstalledAt.Equal(installedAt) {
		t.Errorf("install time changed on re-install: %v -> %v", installedAt, rows[0].InstalledAt)
	}
}

// TestInstallForceNothingToOverwriteIsPlainInstall: --force with a free
// destination is an ordinary install — no notice, no pre-image.
func TestInstallForceNothingToOverwriteIsPlainInstall(t *testing.T) {
	in, _ := testInstaller(t)
	var notices []string
	captureOverwriteNotices(t, func(dst string) { notices = append(notices, dst) })

	src := t.TempDir()
	writeSkillBody(t, src, "# v1\n")
	dst := filepath.Join(t.TempDir(), "skills", "pdf")

	entry, err := in.Install(context.Background(), InstallRequest{
		Op:         InstallOp{SkillName: "pdf", FromDir: src, ToDir: dst, HostLabel: "claude-code"},
		Source:     SkillSource{Display: "owner/repo"},
		Scope:      "project",
		Force:      true,
		BackupRoot: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("force install onto a free destination failed: %v", err)
	}
	if entry.PreImageDigest != "" || entry.PreImageBackup != "" {
		t.Errorf("nothing was replaced, so there is no pre-image: %+v", entry)
	}
	if len(notices) != 0 {
		t.Errorf("no overwrite line without something in the way, got %v", notices)
	}
}

// TestInstallForceRequiresBackupRoot: force with nowhere to preserve the
// replaced copy refuses BEFORE touching the destination.
func TestInstallForceRequiresBackupRoot(t *testing.T) {
	in, _ := testInstaller(t)
	var notices []string
	captureOverwriteNotices(t, func(dst string) { notices = append(notices, dst) })

	src := t.TempDir()
	writeSkillBody(t, src, "# v2\n")
	dst := filepath.Join(t.TempDir(), "skills", "pdf")
	writeSentinelTree(t, dst)

	_, err := in.Install(context.Background(), InstallRequest{
		Op:     InstallOp{SkillName: "pdf", FromDir: src, ToDir: dst, HostLabel: "claude-code"},
		Source: SkillSource{Display: "owner/repo"},
		Scope:  "project",
		Force:  true,
	})
	if err == nil || !strings.Contains(err.Error(), "BackupRoot") {
		t.Fatalf("force without BackupRoot must refuse, got: %v", err)
	}
	if len(notices) != 0 {
		t.Errorf("nothing was going to be overwritten, got notices %v", notices)
	}
	data, rerr := os.ReadFile(filepath.Join(dst, "SKILL.md"))
	if rerr != nil || !strings.Contains(string(data), "SENTINEL") {
		t.Errorf("refused force must not touch the destination: %q %v", data, rerr)
	}
}

// TestInstallForceRefusesSymlinkedDestination: force never follows a
// symlinked destination out of the skills tree.
func TestInstallForceRefusesSymlinkedDestination(t *testing.T) {
	in, _ := testInstaller(t)
	src := t.TempDir()
	writeSkillBody(t, src, "# v2\n")
	real := t.TempDir()
	writeSkillBody(t, real, "# real\n")
	dst := filepath.Join(t.TempDir(), "skills", "linked")
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(real, dst); err != nil {
		t.Skipf("symlinks unsupported: %v", err)
	}

	_, err := in.Install(context.Background(), InstallRequest{
		Op:         InstallOp{SkillName: "linked", FromDir: src, ToDir: dst, HostLabel: "claude-code"},
		Source:     SkillSource{Display: "owner/repo"},
		Scope:      "project",
		Force:      true,
		BackupRoot: t.TempDir(),
	})
	if err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("a symlinked destination must be refused, got: %v", err)
	}
	if data, rerr := os.ReadFile(filepath.Join(real, "SKILL.md")); rerr != nil || !strings.Contains(string(data), "# real") {
		t.Errorf("symlink target must be left alone: %q %v", data, rerr)
	}
}

// TestInstallForceUnreadableLedgerRefusesBeforeDeleting: with no readable
// ledger there is nothing a rollback could be restored into, so the overwrite
// stops before the first destructive step.
func TestInstallForceUnreadableLedgerRefusesBeforeDeleting(t *testing.T) {
	ledgerPath := filepath.Join(t.TempDir(), "ledger.json")
	l, err := testLedger(t, ledgerPath)
	if err != nil {
		t.Fatal(err)
	}
	in := NewInstaller(l, nil)
	src := t.TempDir()
	writeSkillBody(t, src, "# v2\n")
	dst := filepath.Join(t.TempDir(), "skills", "pdf")
	writeSentinelTree(t, dst)
	backupRoot := t.TempDir()

	// Corrupt the ledger after it was opened (reads are lazy).
	if err := os.WriteFile(ledgerPath, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err = in.Install(context.Background(), InstallRequest{
		Op:         InstallOp{SkillName: "pdf", FromDir: src, ToDir: dst, HostLabel: "claude-code"},
		Source:     SkillSource{Display: "owner/repo"},
		Scope:      "project",
		Force:      true,
		BackupRoot: backupRoot,
	})
	if err == nil || !strings.Contains(err.Error(), "ledger") {
		t.Fatalf("an unreadable ledger must stop the overwrite, got: %v", err)
	}
	data, rerr := os.ReadFile(filepath.Join(dst, "SKILL.md"))
	if rerr != nil || !strings.Contains(string(data), "SENTINEL") {
		t.Errorf("destination must be intact when the overwrite refuses early: %q %v", data, rerr)
	}
	if left, _ := os.ReadDir(backupRoot); len(left) != 0 {
		t.Errorf("no backup should exist for a refused overwrite, found %v", left)
	}
}

// TestInstallForceLedgerWriteFailureRollsBackToPreImage: when the ledger
// cannot record the overwrite AFTER the tree was replaced, the previous copy
// is restored byte-for-byte from the backup.
func TestInstallForceLedgerWriteFailureRollsBackToPreImage(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("permissions-based sabotage is ineffective as root")
	}
	// Windows ignores the mode bits on a DIRECTORY: os.Chmod on a directory
	// only touches the read-only attribute of a file, so the sabotage below is
	// a silent no-op there and the ledger write succeeds — the test then fails
	// its own "expected the ledger write to fail" assertion rather than testing
	// anything. This is a limitation of the mechanism, not of the code under
	// test: the rollback path is identical on every platform and is covered on
	// the Linux and macOS CI runners. Making it portable would mean finding a
	// way to fail the lock acquire fast on Windows too, and every candidate
	// either hangs for the 30s acquire timeout or fails the read as well (which
	// would move the failure before the tree is replaced, defeating the test).
	if runtime.GOOS == "windows" {
		t.Skip("chmod on a directory is a no-op on Windows, so the sabotage cannot induce the failure")
	}
	ledgerDir := t.TempDir()
	l, err := testLedger(t, filepath.Join(ledgerDir, "ledger.json"))
	if err != nil {
		t.Fatal(err)
	}
	in := NewInstaller(l, nil)
	v1 := t.TempDir()
	writeSkillBody(t, v1, "# v1\n")
	dst := filepath.Join(t.TempDir(), "skills", "pdf")
	if _, err := in.Install(context.Background(), InstallRequest{
		Op:     InstallOp{SkillName: "pdf", FromDir: v1, ToDir: dst, HostLabel: "claude-code"},
		Source: SkillSource{Display: "owner/repo"},
		Scope:  "project",
	}); err != nil {
		t.Fatal(err)
	}
	// Hand-edit the installed copy so the overwrite has a real pre-image.
	if err := os.WriteFile(filepath.Join(dst, "SKILL.md"), []byte("# SENTINEL\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Make the ledger's directory read-only: the row lookup (a plain read)
	// still succeeds, but writing the replacement row cannot create its lock
	// file, so the write fails after the tree was replaced.
	if err := os.Chmod(ledgerDir, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(ledgerDir, 0o700) })

	v2 := t.TempDir()
	writeSkillBody(t, v2, "# v2\n")
	_, err = in.Install(context.Background(), InstallRequest{
		Op:         InstallOp{SkillName: "pdf", FromDir: v2, ToDir: dst, HostLabel: "claude-code"},
		Source:     SkillSource{Display: "owner/repo"},
		Scope:      "project",
		Force:      true,
		BackupRoot: t.TempDir(),
	})
	if err == nil {
		t.Fatal("expected the ledger write to fail")
	}
	data, rerr := os.ReadFile(filepath.Join(dst, "SKILL.md"))
	if rerr != nil || string(data) != "# SENTINEL\n" {
		t.Fatalf("rollback must restore the exact pre-image bytes, got %q %v", data, rerr)
	}
}
