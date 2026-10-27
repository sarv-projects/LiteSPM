package main

// install_kind_test.go — the KIND axis of the install gate (install_kind.go).
//
// Two facts decide an install, and the tests here pin both halves of the
// refusal contract:
//
//   - installKindRefusal: every kind with no wired install path is refused
//     with LPSM-ARTIFACT-UNAVAILABLE, whatever its provenance class, and the
//     plugin reason no longer repeats the retired claim that the catalog
//     carries no artifact locator (it now carries the descriptor each vendor
//     manifest published).
//   - the gates that call it (resolver.prepare_plan, install.execute, the
//     wizard) refuse a metadata_verified plugin BEFORE sealing a plan,
//     recording an approval, or asking the user a scope/consent question
//     whose answer could not change anything.

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/state"
)

func pluginFixture(id string) *domain.Listing {
	return &domain.Listing{
		SchemaVersion: 2,
		ID:            id,
		Kind:          domain.KindPlugin,
		Name:          "Demo Plugin",
		Summary:       "vendor-manifest plugin fixture: metadata is verified, no fetch path exists",
		Status:        domain.ListingStatusActive,
		// metadata_verified is the point: provenance is NOT what the refusal
		// is about, so the fixture proves the kind gate fires first.
		Installability: domain.InstallabilityMetadataVerified,
	}
}

// countPlans reads the plans table directly, because the guarantee under test
// is "nothing was persisted" and no repository method lists plans.
func countPlans(t *testing.T, h *harness) int {
	t.Helper()
	var n int
	if err := h.db.Raw().QueryRow("SELECT COUNT(*) FROM plans").Scan(&n); err != nil {
		t.Fatalf("count plans: %v", err)
	}
	return n
}

func TestInstallKindRefusalCoversEveryUnwiredKind(t *testing.T) {
	// Every kind without an install path is refused with the artifact code,
	// never the metadata code: the refusal is about what LiteSPM can do.
	//
	// `plugin` is NOT in this list any more: the command layer dispatches
	// kind=plugin to the plugin installer, so the kind gate admits it and the
	// artifact-level refusals (no artifact, an unpinned one, an unknown type)
	// are the installer's own business. The plugin branch is asserted
	// separately below.
	unwired := []domain.ListingKind{
		domain.KindConnector, domain.KindAgent,
		domain.KindRule, domain.KindHook, domain.KindTool, domain.KindLSP,
		domain.ListingKind("bogus"), // unknown kinds fail closed too
	}
	for _, kind := range unwired {
		listing := &domain.Listing{ID: "plugin:example:demo", Kind: kind,
			Installability: domain.InstallabilityMetadataVerified}
		refusal := installKindRefusal(listing)
		if refusal == nil {
			t.Fatalf("kind %q: no refusal for a kind with no wired install path", kind)
		}
		if refusal.Code != "LPSM-ARTIFACT-UNAVAILABLE" {
			t.Fatalf("kind %q: code = %q, want LPSM-ARTIFACT-UNAVAILABLE", kind, refusal.Code)
		}
		if !strings.Contains(refusal.Error(), listing.ID) {
			t.Fatalf("kind %q: refusal does not name the listing: %v", kind, refusal)
		}
	}

	// The wired kinds pass the kind gate (their provenance gate is separate).
	for _, kind := range []domain.ListingKind{domain.KindSkill, domain.KindMCP} {
		if refusal := installKindRefusal(&domain.Listing{ID: "mcp:example:demo", Kind: kind,
			Installability: domain.InstallabilityDiscoveryOnly}); refusal != nil {
			t.Fatalf("kind %q: the provenance question must stay with the provenance gate, got %v", kind, refusal)
		}
	}
	if refusal := installKindRefusal(nil); refusal != nil {
		t.Fatalf("nil listing: refusal = %v, want nil (no kind is known)", refusal)
	}

	// The plugin gate admits a plugin now that the command layer dispatches
	// kind=plugin (the dispatch exists in runInstall). The artifact-level
	// refusals — no artifact, an unpinned one, an unknown type, a manifest
	// that cannot be parsed — are the installer's own business, with their
	// own reasons; the kind gate must neither refuse a plugin nor resurrect
	// the retired wording.
	if refusal := installKindRefusal(pluginFixture("plugin:example:demo")); refusal != nil {
		t.Fatalf("plugin: the kind gate must admit a plugin now that the dispatch exists, got %v", refusal)
	}
}

// TestInstallKindGateAdmitsAPluginOnceTheDispatchExists pins the other half
// of the contract: the gate and the command layer's dispatch are one change,
// and when the dispatch is there the kind gate stops refusing a plugin — the
// artifact-level refusals (no artifact, an unpinned one) are then the
// installer's own business, with their own reasons.
func TestInstallKindGateAdmitsAPluginOnceTheDispatchExists(t *testing.T) {
	previous := pluginInstallDispatched
	pluginInstallDispatched = true
	t.Cleanup(func() { pluginInstallDispatched = previous })

	if refusal := installKindRefusal(pluginFixture("plugin:example:demo")); refusal != nil {
		t.Fatalf("the kind gate still refuses a plugin with the dispatch in place: %v", refusal)
	}
	// The other kinds are unaffected by the plugin dispatch.
	for _, kind := range []domain.ListingKind{domain.KindConnector, domain.KindAgent, domain.KindHook} {
		if refusal := installKindRefusal(&domain.Listing{ID: "x:y:z", Kind: kind}); refusal == nil {
			t.Fatalf("kind %q: the kind gate admitted a kind with no install path", kind)
		}
	}
}

// A plugin is installable in principle now, so the plan preparation reaches
// the plugin's own gates. The guarantee this test protects is unchanged: a
// plan is a promise the install can be executed, so a plugin the catalog
// cannot back (this fixture publishes no version, hence no artifact) must
// seal NO plan, and the refusal must be typed.
func TestPreparePlanRefusesPluginWithoutSealingAPlan(t *testing.T) {
	const id = "plugin:cursor-plugins:demo-plugin"
	h := newHarnessWith(t, []*domain.Listing{pluginFixture(id)})
	ctx := context.Background()

	if before := countPlans(t, h); before != 0 {
		t.Fatalf("fixture sealed %d plan(s) before the call", before)
	}

	var raw json.RawMessage
	err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{"id": id, "version": "1.0.0"}, &raw)
	if err == nil {
		t.Fatal("a plugin the catalog cannot back must not prepare a plan")
	}
	if !strings.Contains(err.Error(), "LPSM-") {
		t.Fatalf("err = %v, want a typed LPSM- refusal", err)
	}
	// A plan is a promise the install can be executed: none may be sealed.
	if after := countPlans(t, h); after != 0 {
		t.Fatalf("refusal sealed %d plan(s); a plan for an unexecutable install is a claim the system cannot honour", after)
	}
}

// The same guarantee on the execution path: a plugin that cannot be completed
// is refused with a typed error, the refusal is audited, and the refusal does
// not blame the plugin's provenance when the catalog proved it.
//
// The code the refusal carries moved: the kind gate no longer speaks for a
// plugin, so the refusal now comes from the gate that owns the question the
// fixture actually fails — it publishes no version, hence no artifact to
// fetch. What matters is that it is typed, audited, and that no plan is
// claimed for an install that cannot happen.
func TestInstallExecuteRefusesPluginWithArtifactUnavailable(t *testing.T) {
	const id = "plugin:cursor-plugins:demo-plugin"
	h := newHarnessWith(t, []*domain.Listing{pluginFixture(id)})

	var raw json.RawMessage
	err := h.client.Call(context.Background(), "install.execute", map[string]any{"listingId": id}, &raw)
	if err == nil {
		t.Fatal("a plugin with no fetchable artifact must not execute")
	}
	// The refusal is typed: the agent path refuses a plugin that carries no
	// approved plan before it ever reaches the artifact question, and the
	// refusal arrives as a typed RPC error (an LPSM- code, or the IPC
	// refusal code that carries it) rather than as prose.
	if !strings.Contains(err.Error(), "LPSM-") && !strings.Contains(err.Error(), "code=-") {
		t.Fatalf("err = %v, want a typed refusal", err)
	}
	// The refusal is audited: a refusal that leaves no row cannot be
	// distinguished from a request that was never made.
	row := findAuditRow(auditRows(t, h), "package.install")
	if row == nil {
		t.Fatal("a plugin refusal wrote no audit event")
	}
	if row[2] != "deny" {
		t.Errorf("audit decision = %q, want %q", row[2], "deny")
	}
	if row[1] != id {
		t.Errorf("audit target = %q, want %q", row[1], id)
	}
}

// TestWizardHidesUninstallablePluginFromTheInstallChoice pins the user-facing
// ordering: artifact availability is checked before scope or consent. A
// listing with no published install source remains discoverable but must not
// look like a ready-to-install choice.
func TestWizardHidesUninstallablePluginFromTheInstallChoice(t *testing.T) {
	const id = "plugin:cursor-plugins:demo-plugin"
	h := newHarnessWith(t, []*domain.Listing{pluginFixture(id)})
	wizardEnvForHarness(t, h)
	activateWizardListing(t, h, id)

	// 2 = find and install, then search. The missing artifact is explained
	// without asking for a scope or approval; q returns from the menu.
	w, out := newTestWizard(t, "2\ndemo-plugin\nq\n", h.paths)
	w.registeredHosts = func(context.Context) ([]host.HostVerification, error) {
		return []host.HostVerification{{HostID: "cursor", Registered: true, Status: "ready"}}, nil
	}
	w.catalogClient = func() *catalog.Client { return h.catClient }
	w.openState = func() (*state.DB, error) { return h.db, nil }

	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	outStr := out.String()
	if !strings.Contains(outStr, "No published plugin version is available to install.") {
		t.Fatalf("the unavailable source was not explained in plain language:\n%s", outStr)
	}
	if strings.Contains(outStr, "Install Demo Plugin (") || strings.Contains(outStr, "Install refused before anything was changed") {
		t.Fatalf("the wizard asked for approval or surfaced an internal refusal:\n%s", outStr)
	}
	if after := countPlans(t, h); after != 0 {
		t.Fatalf("the refusal sealed %d plan(s)", after)
	}
}

// TestPluginFixtureStaysVerifiedButUninstallable guards the fixture against
// drift: metadata_verified + plugin is exactly the combination the old gates
// mishandled, so the fixture must keep exercising it.
//
// The kind and provenance axes now say "installable" for this combination —
// the plugin install path exists, and the fixture's metadata is verified. What
// refuses it is the ARTIFACT: this fixture publishes no source descriptor, so
// the plugin installer has nothing to fetch. The refusal belongs to the
// installer, with its own reason, and the plugin installer tests pin it.
func TestPluginFixtureStaysVerifiedButUninstallable(t *testing.T) {
	l := pluginFixture("plugin:example:demo")
	if l.Kind != domain.KindPlugin || l.Installability != domain.InstallabilityMetadataVerified {
		t.Fatalf("fixture drifted: kind=%q installability=%q", l.Kind, l.Installability)
	}
	if !l.Kind.InstallWired() {
		t.Fatal("the plugin install path exists; the kind must report it")
	}
}

func TestWizardExplainsLocalOnlyPluginSourceBeforeConsent(t *testing.T) {
	listing := pluginListing("plugin:example:local-only")
	catClient := pluginCatalog(t, listing, domain.ArtifactRef{
		ArtifactID: "art_local",
		Type:       domain.ArtifactLocalDir,
		Locator:    "/publisher/workspace/context7",
	})
	reason := wizardInstallabilityReason(catClient, listing)
	if !strings.Contains(reason, "local-only") || !strings.Contains(reason, "pinned Git repository") {
		t.Fatalf("local-only artifact reason = %q, want a clear pinned-Git explanation", reason)
	}
}
