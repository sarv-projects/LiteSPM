package lifecycle

// journal.go — durable write-ahead intent for host-config and skill-directory
// writes.
//
// InstallTxn compensates a handled error in memory, but a process kill between
// the first filesystem write and the SQLite commit leaves the machine mutated
// with no install row. The journal closes that window:
//
//  1. BeginJournal writes an open row before the first write.
//  2. Each successful write appends a step with the exact pre-image backup and
//     post-image digest.
//  3. CommitExec marks the journal committed in the SAME transaction that saves
//     the install rows.
//  4. On startup, RecoverOpenWrites rolls back every journal that is still open
//     and whose install row does not exist.
//
// A kill between a write and its step append is still a (much smaller) window:
// the write happened, but the journal does not know its post-image. The
// in-memory compensation cannot run after a kill either. This is stated in
// STATUS.md rather than hidden; the journal removes the large window between
// the first write and the state commit.

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"time"

	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/skills"
	"github.com/sarv-projects/litespm/internal/state"
)

type Journal struct {
	db        *state.DB
	journalID string
}

type journalStep struct {
	Kind       string
	HostID     string
	Path       string
	BackupPath string
	EntryName  string
	PostDigest string
	PreExists  bool
}

// BeginJournal records the intent to mutate filesystem state for installID.
// The row is written before the first write; a failure here fails the install
// closed rather than proceeding without a recovery record.
func BeginJournal(ctx context.Context, db *state.DB, installID string) (*Journal, error) {
	if db == nil {
		return nil, fmt.Errorf("write journal needs a state database")
	}
	journalID := fmt.Sprintf("wj_%s_%d", installID, time.Now().UTC().UnixNano())
	now := time.Now().UTC().Format("2006-01-02 15:04:05.000000000")
	if _, err := db.Raw().ExecContext(ctx, `
		INSERT INTO write_journal (journal_id, install_id, state, created_at, updated_at)
		VALUES (?, ?, 'open', ?, ?);`, journalID, installID, now, now); err != nil {
		return nil, fmt.Errorf("open write journal: %w", err)
	}
	return &Journal{db: db, journalID: journalID}, nil
}

func (j *Journal) ID() string {
	if j == nil {
		return ""
	}
	return j.journalID
}

// SetInstallID binds the journal to the final install id. The skill path does
// not know its id until the content digest exists, so it opens the journal with
// a provisional id and updates it before the state transaction. A crash before
// the update leaves an install_id with no installs row, which recovery rolls
// back.
func (j *Journal) SetInstallID(ctx context.Context, installID string) error {
	if j == nil {
		return nil
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05.000000000")
	if _, err := j.db.Raw().ExecContext(ctx, `
		UPDATE write_journal SET install_id = ?, updated_at = ? WHERE journal_id = ?;`,
		installID, now, j.journalID); err != nil {
		return fmt.Errorf("bind write journal to install %s: %w", installID, err)
	}
	return nil
}

func (j *Journal) appendStep(ctx context.Context, step journalStep) error {
	if j == nil {
		return nil
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05.000000000")
	_, err := j.db.Raw().ExecContext(ctx, `
		INSERT INTO write_journal_steps
			(journal_id, kind, host_id, path, backup_path, entry_name, post_digest, pre_exists, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
		j.journalID, step.Kind, step.HostID, step.Path, step.BackupPath,
		step.EntryName, step.PostDigest, boolInt(step.PreExists), now)
	if err != nil {
		return fmt.Errorf("append write journal step: %w", err)
	}
	return nil
}

// RecordHostWrite appends the exact rollback material for one host config
// write. Call it immediately after host.InstallServerEntry returns.
func (j *Journal) RecordHostWrite(ctx context.Context, result *host.EntryInstallResult) error {
	if result == nil {
		return fmt.Errorf("write journal: nil host result")
	}
	return j.appendStep(ctx, journalStep{
		Kind:       "host",
		HostID:     result.HostID,
		Path:       result.ConfigPath,
		BackupPath: result.BackupPath,
		EntryName:  result.Name,
		PostDigest: result.WrittenDigest,
		PreExists:  !result.Created,
	})
}

// RecordSkillWrite appends the exact rollback material for one skill
// directory. postDigest is the tree digest of what was written; preExists says
// whether the destination existed before the write.
func (j *Journal) RecordSkillWrite(ctx context.Context, destDir, backupPath string, preExists bool, postDigest string) error {
	return j.appendStep(ctx, journalStep{
		Kind:       "skill",
		Path:       destDir,
		BackupPath: backupPath,
		PostDigest: postDigest,
		PreExists:  preExists,
	})
}

// CommitExec marks the journal committed inside the install-state transaction.
// Atomicity with SaveInstallExec is the point: a crash before commit leaves the
// journal open and startup rolls the files back; a crash after commit leaves
// the install row present, and startup sees it and does not roll back.
func (j *Journal) CommitExec(ctx context.Context, tx *sql.Tx) error {
	if j == nil {
		return nil
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05.000000000")
	if _, err := tx.ExecContext(ctx, `
		UPDATE write_journal SET state = 'committed', updated_at = ? WHERE journal_id = ?;`,
		now, j.journalID); err != nil {
		return fmt.Errorf("commit write journal: %w", err)
	}
	return nil
}

// Abort marks an open journal rolled_back after an in-memory rollback has
// already restored every step. It is best-effort: the files are the truth, and
// a failed marker leaves an open journal that startup will inspect (and may
// refuse to re-restore, which is safer than pretending it is clean).
func (j *Journal) Abort(ctx context.Context) error {
	if j == nil {
		return nil
	}
	return markJournal(ctx, j.db, j.journalID, "rolled_back")
}

// WriteRecoverySummary reports what RecoverOpenWrites did.
type WriteRecoverySummary struct {
	Examined   int
	RolledBack int
	Committed  int
	Failed     int
}

// RecoverOpenWrites rolls back every open journal whose install row does not
// exist. A journal with an existing install row is marked committed: the
// state transaction won the race and the files are the committed install.
func RecoverOpenWrites(ctx context.Context, db *state.DB, dataRoot string) (WriteRecoverySummary, error) {
	var summary WriteRecoverySummary
	if db == nil {
		return summary, nil
	}

	rows, err := db.Raw().QueryContext(ctx, `
		SELECT journal_id, install_id FROM write_journal
		WHERE state = 'open' ORDER BY created_at, journal_id;`)
	if err != nil {
		return summary, fmt.Errorf("read open write journals: %w", err)
	}
	defer rows.Close()

	type openJournal struct {
		id        string
		installID string
	}
	var journals []openJournal
	for rows.Next() {
		var j openJournal
		if err := rows.Scan(&j.id, &j.installID); err != nil {
			return summary, fmt.Errorf("scan open write journal: %w", err)
		}
		journals = append(journals, j)
	}
	if err := rows.Err(); err != nil {
		return summary, fmt.Errorf("read open write journals: %w", err)
	}
	// Close the cursor before the recovery loop: it performs reads and writes
	// on the same SQLite pool, and an open SELECT can hold a connection.
	if err := rows.Close(); err != nil {
		return summary, fmt.Errorf("close open write journals cursor: %w", err)
	}

	var errs []error
	for _, journal := range journals {
		summary.Examined++

		var exists int
		err := db.Raw().QueryRowContext(ctx, `SELECT 1 FROM installs WHERE install_id = ?;`, journal.installID).Scan(&exists)
		if err == nil {
			if markErr := markJournal(ctx, db, journal.id, "committed"); markErr != nil {
				summary.Failed++
				errs = append(errs, markErr)
				continue
			}
			summary.Committed++
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			summary.Failed++
			errs = append(errs, fmt.Errorf("read install %s for journal %s: %w", journal.installID, journal.id, err))
			continue
		}

		steps, stepErr := readJournalSteps(ctx, db, journal.id)
		if stepErr != nil {
			summary.Failed++
			errs = append(errs, stepErr)
			continue
		}
		rollbackErr := rollbackSteps(ctx, steps)
		if rollbackErr != nil {
			summary.Failed++
			_ = markJournal(ctx, db, journal.id, "failed")
			errs = append(errs, fmt.Errorf("journal %s (%s): %w", journal.id, journal.installID, rollbackErr))
			continue
		}
		if markErr := markJournal(ctx, db, journal.id, "rolled_back"); markErr != nil {
			summary.Failed++
			errs = append(errs, markErr)
			continue
		}
		summary.RolledBack++
	}

	return summary, errors.Join(errs...)
}

func readJournalSteps(ctx context.Context, db *state.DB, journalID string) ([]journalStep, error) {
	rows, err := db.Raw().QueryContext(ctx, `
		SELECT kind, COALESCE(host_id, ''), path, COALESCE(backup_path, ''),
		       COALESCE(entry_name, ''), COALESCE(post_digest, ''), pre_exists
		FROM write_journal_steps WHERE journal_id = ? ORDER BY step_id;`, journalID)
	if err != nil {
		return nil, fmt.Errorf("read write journal steps: %w", err)
	}
	defer rows.Close()
	var steps []journalStep
	for rows.Next() {
		var step journalStep
		var preExists int
		if err := rows.Scan(&step.Kind, &step.HostID, &step.Path, &step.BackupPath,
			&step.EntryName, &step.PostDigest, &preExists); err != nil {
			return nil, fmt.Errorf("scan write journal step: %w", err)
		}
		step.PreExists = preExists != 0
		steps = append(steps, step)
	}
	return steps, rows.Err()
}

func rollbackSteps(ctx context.Context, steps []journalStep) error {
	var errs []error
	for i := len(steps) - 1; i >= 0; i-- {
		step := steps[i]
		var err error
		switch step.Kind {
		case "host":
			err = rollbackHostStep(step)
		case "skill":
			err = rollbackSkillStep(step)
		default:
			err = fmt.Errorf("unknown journal step kind %q", step.Kind)
		}
		if err != nil {
			errs = append(errs, fmt.Errorf("rollback %s %s: %w", step.Kind, step.Path, err))
		}
	}
	return errors.Join(errs...)
}

func rollbackHostStep(step journalStep) error {
	if step.PostDigest == "" {
		return fmt.Errorf("no post-write digest recorded")
	}
	return host.RollbackConfigWrite(step.Path, step.BackupPath, step.PostDigest)
}

func rollbackSkillStep(step journalStep) error {
	prov, err := skills.CaptureProvenance(step.Path)
	if err != nil {
		if os.IsNotExist(err) && !step.PreExists {
			return nil
		}
		return err
	}
	if step.PostDigest != "" && prov.Digest != step.PostDigest {
		return fmt.Errorf("skill directory changed after LiteSPM wrote it; refusing to overwrite the newer contents")
	}
	if !step.PreExists {
		return os.RemoveAll(step.Path)
	}
	if step.BackupPath == "" {
		return fmt.Errorf("the destination existed before the write but no pre-image backup was recorded")
	}
	if err := os.RemoveAll(step.Path); err != nil {
		return err
	}
	return copyTree(step.BackupPath, step.Path)
}

func copyTree(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o700)
		}
		if !d.Type().IsRegular() {
			return fmt.Errorf("refusing to restore non-regular file %s", path)
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, info.Mode().Perm())
	})
}

func markJournal(ctx context.Context, db *state.DB, journalID, stateValue string) error {
	now := time.Now().UTC().Format("2006-01-02 15:04:05.000000000")
	_, err := db.Raw().ExecContext(ctx, `
		UPDATE write_journal SET state = ?, updated_at = ? WHERE journal_id = ?;`,
		stateValue, now, journalID)
	if err != nil {
		return fmt.Errorf("mark write journal %s %s: %w", journalID, stateValue, err)
	}
	return nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
