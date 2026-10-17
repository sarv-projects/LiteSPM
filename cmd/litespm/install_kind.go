package main

// install_kind.go — the KIND axis of the install gate.
//
// Two independent questions decide whether an install may proceed, and each
// has its own typed refusal:
//
//  1. What did the upstream prove? A discovery_only row is searchable
//     metadata with no proven artifact, and every gate refuses it with
//     LPSM-NOT-INSTALLABLE and the per-kind wording it always used. This is
//     domain.Listing.IsInstallable's provenance half.
//  2. Can this build perform the install at all? Only skills (files through
//     the skills ledger) and MCP servers (a host-config entry) have a wired
//     install path (domain.ListingKind.InstallWired). Everything else —
//     plugin above all — is refused with LPSM-ARTIFACT-UNAVAILABLE and a
//     reason that names what is actually missing.
//
// installKindRefusal answers question 2, and every gate asks it FIRST: a
// plugin row is metadata_verified (its vendor manifest published it, and the
// catalog now carries the source descriptor that manifest declared), so asking
// the provenance question first would either mislabel it discovery_only or —
// before this gate existed — let it reach the plan/approval machinery and come
// back with a reason that had stopped being true ("the published catalog
// carries no artifact locator"), or, for resolver.prepare_plan, seal a plan
// for an install that cannot be executed.
//
// One definition of the refusal, so no gate can drift from another: the CLI,
// the wizard, the bridge's resolver.prepare_plan and install.execute, and the
// shared plan builder all call this.

import (
	"fmt"

	"github.com/sarv-projects/litespm/internal/domain"
)

// installKindRefusal returns the typed refusal for a listing whose kind this
// build has no install path for, or nil when the kind is installable in
// principle. It is deliberately about the kind ONLY: the provenance question
// stays with each gate's existing LPSM-NOT-INSTALLABLE branch, which keeps its
// per-kind wording.
//
// The code is LPSM-ARTIFACT-UNAVAILABLE, not LPSM-NOT-INSTALLABLE: the row's
// metadata is verified and the refusal is about the missing artifact fetch
// path, not about unproven metadata.
func installKindRefusal(listing *domain.Listing) *domain.LPSMError {
	if listing == nil || listing.Kind.InstallWired() {
		return nil
	}
	if listing.Kind == domain.KindPlugin {
		// The 2026-10-17 catalog change carries each plugin manifest's own
		// `source` descriptor (git-tree or local-dir, plus pinning state), so
		// the old reason ("no artifact locator") is no longer true for 636
		// rows. What is missing is the fetch path itself, and the refusal
		// names it: nothing in internal/artifact fetches a git tree or a
		// manifest-relative directory yet, and a plugin is never
		// half-installed while that is true.
		return domain.ErrArtifactUnavailable(listing.ID,
			"no fetch path is wired for plugin sources: the catalog carries the source descriptor each vendor manifest declares, but nothing fetches or verifies a git tree or a manifest-relative directory yet, so the plugin cannot be installed")
	}
	return domain.ErrArtifactUnavailable(listing.ID,
		fmt.Sprintf("the %q install path is not wired yet: the published catalog carries no artifact locator for it", listing.Kind))
}
