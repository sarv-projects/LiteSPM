package host

// apply_guard.go — one gate every host write passes through.
//
// Every HostAdapter.ApplySetup used to call AtomicWriteFile directly with
// whatever plan it was handed: an empty ProposedContent truncated the user's
// config to zero bytes and reported success, and a plan built from a stale
// read silently clobbered whatever the user (or another tool) wrote since.
// Both failure modes destroy someone else's file, which is the one thing an
// installer into foreign configs must never do.
//
// The gate has three parts:
//
//  1. ValidateApplyPlan rejects a nil plan, an empty ConfigPath and — the
//     H1 case — an empty ProposedContent before anything is read or written.
//  2. checkCompareAndSwap re-reads the config and refuses to write when the
//     on-disk content no longer matches plan.OriginalContent: the plan is
//     stale and applying it would discard the intervening edit.
//  3. RestoreBackup rolls a config back to its pre-edit backup when a later
//     step fails, so a half-applied setup does not strand a corrupt file.
//
// ApplyPlanWrite runs all three (validate, CAS, write) and is what every
// ApplySetup implementation must call instead of AtomicWriteFile.

import (
	"fmt"
	"os"
)

// ValidateApplyPlan rejects plans that must never reach the filesystem.
func ValidateApplyPlan(plan *HostChangePlan) error {
	if plan == nil {
		return fmt.Errorf("host apply plan is nil, refusing to write")
	}
	if plan.ConfigPath == "" {
		return fmt.Errorf("host apply plan has no config path, refusing to write")
	}
	if plan.ProposedContent == "" {
		return fmt.Errorf("host apply plan for %s proposes empty content, refusing to truncate the config", plan.ConfigPath)
	}
	return nil
}

// emptyContent reports whether a config read represents "no file yet".
// PlanSetup uses "" (TOML adapters) and "{}" (JSON adapters) interchangeably
// for a missing file, so the CAS check treats the two as equivalent rather
// than failing every install into a fresh machine.
func emptyContent(s string) bool {
	return s == "" || s == "{}"
}

// checkCompareAndSwap fails when the config changed between PlanSetup and
// ApplySetup. A stale plan applied blindly discards the intervening edit, so
// the caller must re-plan instead. The comparison includes the existence bit:
// a plan built when the file did not exist must not be applied over a file
// that appeared since — including an empty one, which the original content
// alone could not distinguish from a missing file.
func checkCompareAndSwap(plan *HostChangePlan) error {
	current := ""
	exists := false
	if data, err := os.ReadFile(plan.ConfigPath); err == nil {
		current = string(data)
		exists = true
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("re-reading %s for compare-and-swap: %w", plan.ConfigPath, err)
	}

	originalExists := plan.OriginalExists
	if !plan.OriginalExistenceKnown {
		// A plan built before the existence bit existed (or by hand in a
		// test): keep the historical reading, where empty content and "{}"
		// both mean "there was no file".
		if emptyContent(plan.OriginalContent) {
			if exists {
				return fmt.Errorf("config %s appeared after the plan was built (a file now exists), refusing to overwrite it", plan.ConfigPath)
			}
			return nil
		}
		originalExists = true
	}

	if !originalExists {
		if exists {
			return fmt.Errorf("config %s appeared after the plan was built (a file now exists), refusing to overwrite it", plan.ConfigPath)
		}
		return nil
	}
	if !exists {
		return fmt.Errorf("config %s disappeared since the plan was built, refusing to write", plan.ConfigPath)
	}
	if current != plan.OriginalContent {
		return fmt.Errorf("config %s changed since the plan was built, refusing to overwrite it", plan.ConfigPath)
	}
	return nil
}

// ApplyPlanWrite validates a plan, verifies it is still fresh, and writes it.
// It replaces the direct AtomicWriteFile calls in every ApplySetup.
func ApplyPlanWrite(plan *HostChangePlan) error {
	if err := ValidateApplyPlan(plan); err != nil {
		return err
	}
	if err := checkCompareAndSwap(plan); err != nil {
		return err
	}
	if err := AtomicWriteFile(plan.ConfigPath, []byte(plan.ProposedContent), 0600); err != nil {
		return fmt.Errorf("failed to write config %s: %w", plan.ConfigPath, err)
	}
	return nil
}

// RestoreBackup copies a pre-edit backup back over the config. BackupPath must
// be a file produced by CreateAtomicBackup for this config; an empty backup
// path is an error, never a silent success.
//
// A non-empty BackupPath means CreateAtomicBackup found a file and wrote a
// backup (it returns "" only when the source did not exist). So a backup file
// that is GONE is a lost restore point, not "the config did not exist":
// guessing the latter used to delete the user's current config, silently
// discarding every edit made since the install. This refuses instead, and
// names the missing backup.
func RestoreBackup(configPath, backupPath string) error {
	if configPath == "" {
		return fmt.Errorf("restore needs a config path, refusing")
	}
	if backupPath == "" {
		return fmt.Errorf("no backup was taken for %s, nothing to restore", configPath)
	}
	data, err := os.ReadFile(backupPath)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("the recorded pre-install backup %s no longer exists; refusing to guess what %s held before the install (restore the backup file, or use `litespm install remove` to strip only LiteSPM's entries)", backupPath, configPath)
		}
		return fmt.Errorf("reading backup %s: %w", backupPath, err)
	}
	if err := AtomicWriteFile(configPath, data, 0600); err != nil {
		return fmt.Errorf("restoring %s from %s: %w", configPath, backupPath, err)
	}
	return nil
}
