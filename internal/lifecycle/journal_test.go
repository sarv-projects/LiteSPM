package lifecycle

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/skills"
	"github.com/sarv-projects/litespm/internal/state"
)

func openJournalDB(t *testing.T) *state.DB {
	t.Helper()
	db, err := state.Open(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatalf("state.Open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestRecoverOpenWritesRestoresHostConfig(t *testing.T) {
	ctx := context.Background()
	db := openJournalDB(t)
	dir := t.TempDir()
	configPath := filepath.Join(dir, "agent.json")
	backupPath := filepath.Join(dir, "agent.json.bak")
	pre := []byte(`{"mcpServers":{}}`)
	post := []byte(`{"mcpServers":{"demo":{"command":"npx"}}}`)
	if err := os.WriteFile(backupPath, pre, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, post, 0o600); err != nil {
		t.Fatal(err)
	}

	journal, err := BeginJournal(ctx, db, "inst_crash_host")
	if err != nil {
		t.Fatal(err)
	}
	if err := journal.RecordHostWrite(ctx, &host.EntryInstallResult{
		HostID:        "claude-code",
		ConfigPath:    configPath,
		Name:          "demo",
		BackupPath:    backupPath,
		WrittenDigest: domain.ComputeBytesDigest(post),
	}); err != nil {
		t.Fatal(err)
	}

	summary, err := RecoverOpenWrites(ctx, db, t.TempDir())
	if err != nil {
		t.Fatalf("RecoverOpenWrites: %v", err)
	}
	if summary.RolledBack != 1 || summary.Failed != 0 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	got, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(pre) {
		t.Fatalf("config was not restored byte-for-byte:\n got %s\nwant %s", got, pre)
	}
}

func TestRecoverOpenWritesRemovesFreshSkillDirectory(t *testing.T) {
	ctx := context.Background()
	db := openJournalDB(t)
	dest := filepath.Join(t.TempDir(), "skills", "pdf")
	if err := os.MkdirAll(dest, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dest, "SKILL.md"), []byte("---\nname: pdf\ndescription: PDF\n---\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	prov, err := skills.CaptureProvenance(dest)
	if err != nil {
		t.Fatal(err)
	}

	journal, err := BeginJournal(ctx, db, "inst_crash_skill")
	if err != nil {
		t.Fatal(err)
	}
	if err := journal.RecordSkillWrite(ctx, dest, "", false, prov.Digest); err != nil {
		t.Fatal(err)
	}

	summary, err := RecoverOpenWrites(ctx, db, t.TempDir())
	if err != nil {
		t.Fatalf("RecoverOpenWrites: %v", err)
	}
	if summary.RolledBack != 1 || summary.Failed != 0 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Fatalf("fresh skill directory was not removed: %v", err)
	}
}

func TestRecoverOpenWritesLeavesCommittedInstallAlone(t *testing.T) {
	ctx := context.Background()
	db := openJournalDB(t)
	dest := filepath.Join(t.TempDir(), "skills", "pdf")
	if err := os.MkdirAll(dest, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dest, "SKILL.md"), []byte("---\nname: pdf\ndescription: PDF\n---\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	prov, err := skills.CaptureProvenance(dest)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := db.SaveInstall(ctx, &domain.InstallRecord{
		InstallID: "inst_committed", ListingID: "skill:acme:pdf", Kind: domain.KindSkill,
		Version: "1.0.0", TreeDigest: prov.Digest, Scope: domain.ScopeUser,
		Status: domain.InstallActive, InstalledAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatal(err)
	}

	journal, err := BeginJournal(ctx, db, "inst_committed")
	if err != nil {
		t.Fatal(err)
	}
	if err := journal.RecordSkillWrite(ctx, dest, "", false, prov.Digest); err != nil {
		t.Fatal(err)
	}

	summary, err := RecoverOpenWrites(ctx, db, t.TempDir())
	if err != nil {
		t.Fatalf("RecoverOpenWrites: %v", err)
	}
	if summary.Committed != 1 || summary.RolledBack != 0 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	if _, err := os.Stat(filepath.Join(dest, "SKILL.md")); err != nil {
		t.Fatalf("committed skill was removed: %v", err)
	}
}
