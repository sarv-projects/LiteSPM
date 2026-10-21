package skills

// installer.go — policy-gated install and update.
//
// CopySkillDir is the raw copy primitive; this file adds the lifecycle layer
// that the CLI needs:
//
//   - Install consults an injectable policy checker BEFORE it writes anything,
//     then records provenance in the ledger;
//   - Update replaces an installed directory with freshly fetched content via
//     an atomic swap, so a failure at any point leaves the previous install
//     intact, and reports an honest no-op when the content is already current.
//
// Fetching is deliberately out of scope. The package performs no network I/O
// and spawns no processes: the caller (the CLI) clones/downloads to a local
// directory and passes that directory in. That keeps this layer hermetic and
// testable and avoids a hidden second transport.
//
// Policy is an injected function rather than an import of internal/policy.
// internal/policy does not import internal/skills, so a direct import would not
// create a cycle today, but a function seam keeps this leaf package free of the
// policy/state dependency chain and lets each host wire the decision source it
// actually uses. A nil checker means "policy not wired" and is recorded as
// such by the caller; it never fabricates an approval.

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// PolicyRequest describes one skill write for a policy consult.
type PolicyRequest struct {
	// Operation is "install" or "update".
	Operation string
	// SkillName is the sanitized skill directory name.
	SkillName string
	// Source is the human-readable source label.
	Source string
	// Scope is "project" or "global".
	Scope string
	// DestDir is the destination skill directory.
	DestDir string
	// Effects are canonical effect identifiers, for example
	// "filesystem.write" or "network.outbound".
	Effects []string
}

// PolicyVerdict is the outcome of a policy consult.
type PolicyVerdict struct {
	// Allowed must be true for the write to proceed. "ask" is not allowed:
	// approval must be obtained out of band and the operation retried.
	Allowed bool
	// Decision is the raw decision string ("allow", "deny", "ask").
	Decision string
	// Reason is a human-readable explanation.
	Reason string
	// Reasons are structured reason codes from the policy engine.
	Reasons []string
}

// PolicyChecker consults the security policy before a skill is written. A nil
// checker means the host has not wired policy (see the integration notes); it
// is never treated as an implicit approval by the package itself.
type PolicyChecker func(ctx context.Context, req PolicyRequest) PolicyVerdict

// PolicyDeniedError carries the policy decision that stopped an operation.
type PolicyDeniedError struct {
	Request PolicyRequest
	Verdict PolicyVerdict
}

func (e *PolicyDeniedError) Error() string {
	decision := e.Verdict.Decision
	if decision == "" {
		decision = "deny"
	}
	detail := e.Verdict.Reason
	if detail == "" && len(e.Verdict.Reasons) > 0 {
		detail = strings.Join(e.Verdict.Reasons, ", ")
	}
	if detail == "" {
		detail = "no reason supplied"
	}
	return fmt.Sprintf("%s of skill %q denied by policy (%s): %s", e.Request.Operation, e.Request.SkillName, decision, detail)
}

// Installer records every directory it creates in a Ledger and, when a policy
// checker is configured, consults it before writing.
type Installer struct {
	Ledger *Ledger
	Policy PolicyChecker
}

// NewInstaller builds an installer over a ledger. A nil checker leaves policy
// unwired.
func NewInstaller(ledger *Ledger, checker PolicyChecker) *Installer {
	return &Installer{Ledger: ledger, Policy: checker}
}

// InstallRequest describes one policy-gated install.
type InstallRequest struct {
	Op     InstallOp
	Source SkillSource
	Scope  string
	// ObservedRef is the commit SHA the caller resolved for the checkout, when
	// available. It is recorded only when the source carries no explicit pin.
	ObservedRef string
	// Force allows Install to overwrite an existing destination — the same
	// semantics and flag spelling as the MCP install's --force. Without it an
	// existing destination is still refused (the refusal names the path);
	// with it the replaced tree is disclosed ("overwrites: <path>", before
	// any write), captured byte-for-byte into BackupRoot, its digest
	// recorded as the ledger entry's pre-image, and only then replaced.
	Force bool
	// BackupRoot is the directory a forced overwrite preserves the replaced
	// copy in. Required whenever Force is set: force with nowhere to keep the
	// old bytes would be silent destruction — the opposite failure of the
	// refusal this replaces.
	BackupRoot string
}

// Install consults policy, copies one planned skill atomically, and records
// provenance. The destination must not already exist unless Force is set (see
// InstallRequest.Force); a forced overwrite captures the pre-image of the
// tree it replaces — digest into the ledger entry, bytes into BackupRoot —
// before the first destructive step. On a ledger failure the freshly written
// directory is removed again (and a replaced copy restored) so the ledger
// remains the single source of truth.
func (in *Installer) Install(ctx context.Context, req InstallRequest) (LedgerEntry, error) {
	if in == nil || in.Ledger == nil {
		return LedgerEntry{}, fmt.Errorf("installer: a ledger is required")
	}
	op := req.Op
	if op.ToDir == "" || op.FromDir == "" || op.SkillName == "" {
		return LedgerEntry{}, fmt.Errorf("installer: incomplete install operation for skill %q", op.SkillName)
	}
	if err := requireSkillFile(op.FromDir); err != nil {
		return LedgerEntry{}, err
	}
	if req.Force && strings.TrimSpace(req.BackupRoot) == "" {
		return LedgerEntry{}, fmt.Errorf("installer: force install of %s requires a BackupRoot to preserve the replaced copy", op.SkillName)
	}

	// A forced overwrite deletes the previous tree, so policy must see the
	// delete effect alongside the write.
	var effects []string
	if req.Force {
		effects = append(effects, "filesystem.delete")
	}
	if err := in.checkPolicy(ctx, "install", req.Source, op.SkillName, req.Scope, op.ToDir, effects...); err != nil {
		return LedgerEntry{}, err
	}

	// An existing destination is disclosed BEFORE any write, then either
	// refused (no force) or captured and replaced (force). The pre-image
	// digest and the byte-exact backup are taken from the same pre-write
	// state, so the overwrite line, the ledger's pre-image and the preserved
	// bytes cannot disagree about what was there.
	var preImageDigest, preImageBackup string
	var priorRow *LedgerEntry
	if info, lerr := os.Lstat(op.ToDir); lerr == nil {
		overwriteNotice(op.ToDir) // PRE-ALWAYS: name what is in the way
		switch {
		case !req.Force:
			return LedgerEntry{}, fmt.Errorf("destination already exists: %s (re-run with --force to overwrite it)", op.ToDir)
		case info.Mode()&os.ModeSymlink != 0:
			return LedgerEntry{}, fmt.Errorf("refusing to overwrite symlinked destination %s", op.ToDir)
		case !info.IsDir():
			return LedgerEntry{}, fmt.Errorf("refusing to overwrite %s: not a directory", op.ToDir)
		}
		// Fingerprint the tree being replaced BEFORE anything is touched: a
		// destination that cannot be fingerprinted (a symlink inside, a
		// non-regular file) is refused, never deleted blind.
		prov, perr := CaptureProvenance(op.ToDir)
		if perr != nil {
			return LedgerEntry{}, fmt.Errorf("capturing the pre-image of %s: %w", op.ToDir, perr)
		}
		preImageDigest = prov.Digest
		// An unreadable ledger stops the overwrite before it starts: without
		// the current rows there is nothing to restore them to.
		entries, aerr := in.Ledger.All()
		if aerr != nil {
			return LedgerEntry{}, fmt.Errorf("reading the skills ledger before overwriting %s: %w", op.ToDir, aerr)
		}
		for i := range entries {
			if entries[i].DestDir == op.ToDir {
				priorRow = &entries[i]
				break
			}
		}
		// Byte-exact backup of the replaced tree, under BackupRoot, before
		// the first destructive step — the digest proves what was there,
		// only these bytes can put it back.
		name, serr := SanitizeSkillName(op.SkillName)
		if serr != nil {
			name = "skill"
		}
		backup := filepath.Join(req.BackupRoot, fmt.Sprintf("skill-%s-%d", name, time.Now().UnixNano()))
		if err := CopySkillDir(op.ToDir, backup); err != nil {
			return LedgerEntry{}, fmt.Errorf("backing up the existing %s before overwrite: %w", op.ToDir, err)
		}
		preImageBackup = backup
		if err := os.RemoveAll(op.ToDir); err != nil {
			return LedgerEntry{}, fmt.Errorf("removing the existing %s for overwrite: %w", op.ToDir, err)
		}
	} else if !os.IsNotExist(lerr) {
		return LedgerEntry{}, fmt.Errorf("checking destination %s: %w", op.ToDir, lerr)
	}

	if err := CopySkillDir(op.FromDir, op.ToDir); err != nil {
		if preImageBackup == "" {
			// CopySkillDir removes its own partial tree, and a copy that
			// never started never owned dst: nothing of ours to clean up.
			return LedgerEntry{}, err
		}
		return LedgerEntry{}, in.rollbackOverwrite(op.ToDir, preImageBackup, err)
	}

	prov, err := CaptureProvenance(op.ToDir)
	if err != nil {
		return LedgerEntry{}, in.rollbackOverwrite(op.ToDir, preImageBackup,
			fmt.Errorf("capturing provenance for %s: %w", op.ToDir, err))
	}
	entry := LedgerEntry{
		SkillName:      op.SkillName,
		AgentID:        op.HostLabel,
		HostLabel:      op.HostLabel,
		DestDir:        op.ToDir,
		Source:         req.Source.Display,
		Scope:          req.Scope,
		ContentDigest:  prov.Digest,
		SourceRef:      req.Source.RecordedRef(req.ObservedRef),
		Inventory:      prov.Inventory,
		PreImageDigest: preImageDigest,
		PreImageBackup: preImageBackup,
	}
	if priorRow != nil {
		// A forced re-install replaces the existing row rather than being
		// dropped by Add's dedupe: the ledger must describe the tree now on
		// disk, and carry the pre-image of the one it replaced.
		entry.InstalledAt = priorRow.InstalledAt
		if err := in.Ledger.ReplaceEntry(op.ToDir, entry); err != nil {
			return LedgerEntry{}, in.rollbackOverwrite(op.ToDir, preImageBackup,
				fmt.Errorf("recording overwrite of %s: %w", op.SkillName, err))
		}
		return entry, nil
	}
	if err := in.Ledger.Add([]LedgerEntry{entry}); err != nil {
		return LedgerEntry{}, in.rollbackOverwrite(op.ToDir, preImageBackup,
			fmt.Errorf("recording install of %s: %w", op.SkillName, err))
	}
	return entry, nil
}

// rollbackOverwrite folds a failed install into the returned error: the
// freshly written directory is removed and — when this install replaced an
// existing tree — the byte-exact backup of the previous copy is put back.
// backup is "" for a fresh install, where only the fresh copy needs removing.
// The original cause is always preserved.
func (in *Installer) rollbackOverwrite(dst, backup string, cause error) error {
	_ = os.RemoveAll(dst)
	if backup == "" {
		return cause
	}
	if err := os.Rename(backup, dst); err != nil {
		return fmt.Errorf("%w; and restoring the previous copy failed (%v) — it is preserved at %s", cause, err, backup)
	}
	return cause
}

// UpdateRequest describes one skill update. NewDir is the caller-fetched
// directory holding the replacement content; this package performs no fetch.
type UpdateRequest struct {
	// Entry is the existing ledger entry to update.
	Entry LedgerEntry
	// NewDir is a local directory containing the replacement skill content.
	NewDir string
	// NewSource optionally replaces the recorded source label.
	NewSource string
	// NewRef optionally records a new source pin/commit.
	NewRef string
	// Force overrides the inventory guard on the destination. It is only
	// needed when the installed directory was modified locally.
	Force bool
	// DryRun evaluates policy and reports what would happen without touching
	// the filesystem or the ledger.
	DryRun bool
	// BackupRoot is the directory the REPLACED tree is preserved in, so the
	// ledger row can name a pre-image that actually exists.
	//
	// An update replaces a tree, exactly as a forced install does, so it owes
	// the same thing: a digest of what was there and a byte-exact copy of
	// it. Without this the update inherited the PREVIOUS row's pre-image —
	// describing a tree that was replaced by an earlier update, and naming a
	// backup path that had already been deleted.
	BackupRoot string
}

// UpdateOutcome reports the result of an update.
type UpdateOutcome struct {
	Entry          LedgerEntry
	Updated        bool
	AlreadyCurrent bool
	// WouldUpdate is set by a dry-run when an update would have proceeded.
	WouldUpdate bool
	Reason      string
}

// Update replaces an installed skill directory via an atomic swap. On any
// failure the previous install remains in place. When the replacement content
// is byte-identical (same tree digest) it reports an honest already-current
// no-op instead of rewriting the tree.
func (in *Installer) Update(ctx context.Context, req UpdateRequest) (UpdateOutcome, error) {
	if in == nil || in.Ledger == nil {
		return UpdateOutcome{}, fmt.Errorf("installer: a ledger is required")
	}
	entry := req.Entry
	if entry.DestDir == "" {
		return UpdateOutcome{}, fmt.Errorf("installer: update entry has no destination")
	}
	if req.NewDir == "" {
		return UpdateOutcome{}, fmt.Errorf("installer: update requires NewDir (the caller must fetch the source)")
	}
	if err := requireSkillFile(req.NewDir); err != nil {
		return UpdateOutcome{Entry: entry}, err
	}

	info, err := os.Lstat(entry.DestDir)
	if err != nil {
		return UpdateOutcome{Entry: entry}, fmt.Errorf("destination %s is not installed: %w", entry.DestDir, err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return UpdateOutcome{Entry: entry}, fmt.Errorf("refusing to update symlinked directory %s", entry.DestDir)
	}
	if !info.IsDir() {
		return UpdateOutcome{Entry: entry}, fmt.Errorf("destination %s is not a directory", entry.DestDir)
	}

	newProv, err := CaptureProvenance(req.NewDir)
	if err != nil {
		return UpdateOutcome{Entry: entry}, fmt.Errorf("capturing provenance for %s: %w", req.NewDir, err)
	}
	if entry.ContentDigest != "" && entry.ContentDigest == newProv.Digest {
		return UpdateOutcome{
			Entry:          entry,
			AlreadyCurrent: true,
			Reason:         "already current: content digest matches the installed copy",
		}, nil
	}

	// Replacing the tree deletes the old one, so apply the same inventory guard
	// as Remove: never destroy files the user added unless Force is set.
	if reason := inventoryGuardReason(entry.DestDir, entry.Inventory, req.Force); reason != "" {
		return UpdateOutcome{Entry: entry}, fmt.Errorf("refusing to update %s: %s", entry.DestDir, reason)
	}

	src := SkillSource{Display: req.NewSource, Pin: req.NewRef}
	if src.Display == "" {
		src.Display = entry.Source
	}
	if err := in.checkPolicy(ctx, "update", src, entry.SkillName, entry.Scope, entry.DestDir); err != nil {
		return UpdateOutcome{Entry: entry}, err
	}

	if req.DryRun {
		return UpdateOutcome{
			Entry:       entry,
			WouldUpdate: true,
			Reason:      fmt.Sprintf("would update: digest %s -> %s", shortDigest(entry.ContentDigest), shortDigest(newProv.Digest)),
		}, nil
	}

	oldDigest := entry.ContentDigest

	// The tree this update replaces is preserved BEFORE the swap, so the
	// ledger row can name a pre-image that describes THIS replacement and a
	// backup that exists. The old row's pre-image described an earlier
	// replacement and named a backup that had already been deleted.
	preImageBackup := ""
	if strings.TrimSpace(req.BackupRoot) != "" {
		name, serr := SanitizeSkillName(entry.SkillName)
		if serr != nil {
			name = "skill"
		}
		backupPath := filepath.Join(req.BackupRoot, fmt.Sprintf("skill-%s-%d", name, time.Now().UnixNano()))
		if err := CopySkillDir(entry.DestDir, backupPath); err != nil {
			return UpdateOutcome{Entry: entry}, fmt.Errorf("backing up the current %s before the update: %w", entry.DestDir, err)
		}
		preImageBackup = backupPath
	}

	backup, err := swapDir(req.NewDir, entry.DestDir)
	if err != nil {
		if preImageBackup != "" {
			_ = os.RemoveAll(preImageBackup)
		}
		return UpdateOutcome{Entry: entry}, err
	}

	updated := entry
	updated.ContentDigest = newProv.Digest
	updated.Inventory = newProv.Inventory
	// The pre-image is the tree THIS update replaced.
	updated.PreImageDigest = oldDigest
	updated.PreImageBackup = preImageBackup
	if req.NewSource != "" {
		updated.Source = req.NewSource
	}
	if ref := src.RecordedRef(""); ref != "" {
		updated.SourceRef = ref
	}

	if err := in.Ledger.ReplaceEntry(entry.DestDir, updated); err != nil {
		// Roll the filesystem back so the ledger and disk stay consistent.
		_ = os.RemoveAll(entry.DestDir)
		if rerr := os.Rename(backup, entry.DestDir); rerr != nil {
			return UpdateOutcome{Entry: entry}, fmt.Errorf("ledger update failed (%v) and rollback failed (%v); previous copy left at %s", err, rerr, backup)
		}
		return UpdateOutcome{Entry: entry}, err
	}
	if err := os.RemoveAll(backup); err != nil {
		return UpdateOutcome{
			Entry:   updated,
			Updated: true,
			Reason:  fmt.Sprintf("updated; previous copy could not be removed from %s: %v", backup, err),
		}, nil
	}
	return UpdateOutcome{
		Entry:   updated,
		Updated: true,
		Reason:  fmt.Sprintf("updated: digest %s -> %s", shortDigest(oldDigest), shortDigest(newProv.Digest)),
	}, nil
}

// checkPolicy consults the policy checker before a write. extraEffects names
// additional effects the operation entails (a forced overwrite declares
// filesystem.delete alongside the write).
func (in *Installer) checkPolicy(ctx context.Context, operation string, src SkillSource, skillName, scope, destDir string, extraEffects ...string) error {
	if in.Policy == nil {
		return nil
	}
	effects := []string{"filesystem.write"}
	if operation == "update" {
		effects = append(effects, "filesystem.delete")
	}
	effects = append(effects, extraEffects...)
	req := PolicyRequest{
		Operation: operation,
		SkillName: skillName,
		Source:    src.Display,
		Scope:     scope,
		DestDir:   destDir,
		Effects:   effects,
	}
	verdict := in.Policy(ctx, req)
	if !verdict.Allowed {
		return &PolicyDeniedError{Request: req, Verdict: verdict}
	}
	return nil
}

// requireSkillFile ensures dir holds a SKILL.md (or skill.md) before it is
// installed or used as an update source.
func requireSkillFile(dir string) error {
	for _, name := range []string{"SKILL.md", "skill.md"} {
		if info, err := os.Lstat(filepath.Join(dir, name)); err == nil && info.Mode().IsRegular() {
			return nil
		}
	}
	return fmt.Errorf("no SKILL.md in %s", dir)
}

// swapDir atomically replaces dest with a copy of newDir and returns the path
// of the previous directory, which is moved aside rather than deleted. The
// caller removes that backup only after the ledger is updated; a failure at any
// step restores the previous install.
func swapDir(newDir, dest string) (backup string, err error) {
	parent := filepath.Dir(dest)
	base := filepath.Base(dest)
	stamp := time.Now().UnixNano()
	tmp := filepath.Join(parent, fmt.Sprintf(".%s.litespm-new-%d", base, stamp))
	backup = filepath.Join(parent, fmt.Sprintf(".%s.litespm-old-%d", base, stamp))

	if err := CopySkillDir(newDir, tmp); err != nil {
		return "", err
	}
	if err := os.Rename(dest, backup); err != nil {
		_ = os.RemoveAll(tmp)
		return "", fmt.Errorf("moving current install aside: %w", err)
	}
	if err := os.Rename(tmp, dest); err != nil {
		if rerr := os.Rename(backup, dest); rerr != nil {
			return "", fmt.Errorf("installing update (%v); rollback failed (%v); previous install left at %s", err, rerr, backup)
		}
		_ = os.RemoveAll(tmp)
		return "", fmt.Errorf("installing update: %w", err)
	}
	return backup, nil
}

func shortDigest(d string) string {
	if d == "" {
		return "(none)"
	}
	if len(d) > 12 {
		return d[:12]
	}
	return d
}
