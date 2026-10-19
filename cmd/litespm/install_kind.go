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
//     install path (domain.ListingKind.InstallWired). A plugin has one now —
//     a pinned git tree is fetched and verified, and the MCP servers its
//     manifest declares are registered in each target host's config — but it
//     is only reachable once the command layer dispatches kind=plugin, and
//     the gate and the dispatch are one change (see
//     pluginInstallDispatched below).
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

// pluginInstallDispatched reports whether the command layer dispatches
// kind=plugin to the plugin installer (cmd/litespm/install_plugin.go).
//
// The gate and the dispatch are ONE change, and the flag keeps them together:
// opening the gate without the dispatch would make the daemon seal a plan it
// cannot execute and the wizard ask a question whose answer could not change
// anything.
//
// The dispatch EXISTS as of 2026-10-19: `runInstall` routes kind=plugin to
// `installPluginFromListing` through the same plan, approval, transaction and
// removal path as an MCP server, and the daemon's `install.execute` does the
// same through `install_plugin.go`. The artifact-level refusals (no artifact,
// an unpinned one, an unknown type, a manifest that cannot be parsed) are
// raised by the plugin installer itself, with their own reasons — the kind
// gate no longer has to speak for them.
var pluginInstallDispatched = true

// installKindRefusal returns the typed refusal for a listing whose kind this
// build has no install path for, or nil when the kind is installable in
// principle. It is deliberately about the kind ONLY: the provenance question
// stays with each gate's existing LPSM-NOT-INSTALLABLE branch, which keeps its
// per-kind wording.
//
// The code is LPSM-ARTIFACT-UNAVAILABLE, not LPSM-NOT-INSTALLABLE: the row's
// metadata is verified and the refusal is about the missing install path, not
// about unproven metadata.
func installKindRefusal(listing *domain.Listing) *domain.LPSMError {
	if listing == nil {
		return nil
	}
	if listing.Kind == domain.KindPlugin {
		if pluginInstallDispatched {
			// The plugin install path is reachable: the artifact-level
			// refusals (no artifact, an unpinned one, an unknown type) are
			// raised by the plugin installer itself, with their own reasons.
			return nil
		}
		// The 2026-10-17 catalog change carries each plugin manifest's own
		// `source` descriptor (git-tree or local-dir, plus pinning state),
		// and the fetch path for it now exists: a pinned git tree is fetched,
		// verified and extracted through the shared safe extractor, and the
		// MCP servers the plugin's manifest declares are registered in each
		// target host's config. What is missing is the command layer's
		// dispatch of kind=plugin, and a plugin is never half-installed
		// while that is true.
		return domain.ErrArtifactUnavailable(listing.ID,
			"the plugin install path is implemented (a commit-pinned git tree is fetched and verified, "+
				"and the MCP servers the plugin's manifest declares are registered in each target host's config), "+
				"but this build's command layer does not dispatch kind=plugin yet, so the plugin cannot be installed from it")
	}
	if listing.Kind.InstallWired() {
		return nil
	}
	return domain.ErrArtifactUnavailable(listing.ID,
		fmt.Sprintf("the %q install path is not wired yet: the published catalog carries no artifact locator for it", listing.Kind))
}
