package host

// apply_guard_test.go — the two destructive-failure guards in apply_guard.go:
// a lost backup must never delete a live config, and a plan built against a
// missing file must not apply over a file that appeared since (H5, H9).

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestRestoreBackupRefusesWhenTheRecordedBackupIsGone pins H5: a non-empty
// BackupPath means a backup WAS taken (CreateAtomicBackup returns "" only when
// the source did not exist), so a missing backup file is a lost restore point —
// not "the config did not exist". The old code removed the user's current
// config here, silently discarding every edit made since the install.
func TestRestoreBackupRefusesWhenTheRecordedBackupIsGone(t *testing.T) {
	dir := t.TempDir()
	cfg := filepath.Join(dir, "config.toml")
	missingBackup := filepath.Join(dir, "backups", "codex_20260101_000000_deadbeef.bak")

	edited := "model = \"gpt-5\"\n# edited by hand after the install\n"
	if err := os.WriteFile(cfg, []byte(edited), 0o600); err != nil {
		t.Fatal(err)
	}

	err := RestoreBackup(cfg, missingBackup)
	if err == nil {
		t.Fatal("RestoreBackup deleted the config instead of refusing when the backup is gone")
	}
	if !strings.Contains(err.Error(), missingBackup) {
		t.Errorf("the refusal must name the missing backup path, got: %v", err)
	}
	data, rerr := os.ReadFile(cfg)
	if rerr != nil {
		t.Fatalf("the refusal destroyed the config: %v", rerr)
	}
	if string(data) != edited {
		t.Fatalf("the config was modified: %q", data)
	}

	// The true no-backup case (empty BackupPath) keeps its existing refusal.
	if err := RestoreBackup(cfg, ""); err == nil {
		t.Error("an empty backup path must still refuse")
	}
}

// TestApplyPlanWriteComparesTheExistenceBit pins H9: a plan built when the
// config did not exist must not be applied over a file that appeared since —
// including an empty object, which the original content alone could not
// distinguish from a missing file.
func TestApplyPlanWriteComparesTheExistenceBit(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.toml")

	plan := &HostChangePlan{
		HostID:                 "codex",
		ConfigPath:             path,
		OriginalContent:        "",
		ProposedContent:        "[mcp_servers.litespm]\ncommand = \"litespm\"\nargs = [\"bridge\"]\n",
		OriginalExists:         false,
		OriginalExistenceKnown: true,
	}

	// A file appears after planning, containing the ambiguous empty object.
	if err := os.WriteFile(path, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ApplyPlanWrite(plan); err == nil {
		t.Fatal("a plan built against a missing file applied over a file that appeared")
	}
	if data, _ := os.ReadFile(path); string(data) != "{}" {
		t.Fatalf("the refused apply modified the file: %q", data)
	}

	// With the file gone, the same plan applies.
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := ApplyPlanWrite(plan); err != nil {
		t.Fatalf("the same plan must apply while the file is still absent: %v", err)
	}

	// A plan built against an EXISTING empty object still applies over it.
	if err := os.WriteFile(path, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	existing := &HostChangePlan{
		HostID:                 "codex",
		ConfigPath:             path,
		OriginalContent:        "{}",
		ProposedContent:        "[mcp_servers.litespm]\ncommand = \"litespm\"\n",
		OriginalExists:         true,
		OriginalExistenceKnown: true,
	}
	if err := ApplyPlanWrite(existing); err != nil {
		t.Fatalf("a plan built against the existing {} must apply: %v", err)
	}
}
