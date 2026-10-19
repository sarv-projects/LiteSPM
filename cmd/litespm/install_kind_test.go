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
	unwired := []domain.ListingKind{
		domain.KindPlugin, domain.KindConnector, domain.KindAgent,
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

	// The plugin reason must not resurrect the retired wording: the catalog
	// now carries the descriptor each manifest published, and the fetch path
	// for it exists. What is missing is the command layer's dispatch of
	// kind=plugin, and the refusal must say exactly that.
	refusal := installKindRefusal(pluginFixture("plugin:example:demo"))
	if strings.Contains(refusal.Error(), "carries no artifact locator") {
		t.Fatalf("plugin refusal repeats the retired claim: %v", refusal)
	}
	if strings.Contains(refusal.Error(), "no fetch path is wired for plugin sources") {
		t.Fatalf("plugin refusal repeats the retired gap: %v", refusal)
	}
	if !strings.Contains(refusal.Error(), "does not dispatch kind=plugin") {
		t.Fatalf("plugin refusal does not name the real gap: %v", refusal)
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

func TestPreparePlanRefusesPluginWithoutSealingAPlan(t *testing.T) {
	const id = "plugin:cursor-plugins:demo-plugin"
	h := newHarnessWith(t, []*domain.Listing{pluginFixture(id)})
	ctx := context.Background()

	if before := countPlans(t, h); before != 0 {
		t.Fatalf("fixture sealed %d plan(s) before the call", before)
	}

	var raw json.RawMessage
	err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{"id": id, "version": "1.0.0"}, &raw)
	if err == nil || !strings.Contains(err.Error(), "LPSM-ARTIFACT-UNAVAILABLE") {
		t.Fatalf("err = %v, want LPSM-ARTIFACT-UNAVAILABLE", err)
	}
	// A plan is a promise the install can be executed: none may be sealed.
	if after := countPlans(t, h); after != 0 {
		t.Fatalf("refusal sealed %d plan(s); a plan for an unexecutable install is a claim the system cannot honour", after)
	}
}

func TestInstallExecuteRefusesPluginWithArtifactUnavailable(t *testing.T) {
	const id = "plugin:cursor-plugins:demo-plugin"
	h := newHarnessWith(t, []*domain.Listing{pluginFixture(id)})

	var raw json.RawMessage
	err := h.client.Call(context.Background(), "install.execute", map[string]any{"listingId": id}, &raw)
	if err == nil || !strings.Contains(err.Error(), "LPSM-ARTIFACT-UNAVAILABLE") {
		t.Fatalf("err = %v, want LPSM-ARTIFACT-UNAVAILABLE", err)
	}
	if strings.Contains(err.Error(), "LPSM-NOT-INSTALLABLE") {
		t.Fatalf("verified plugin metadata was mislabelled as discovery-only: %v", err)
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

// TestWizardRefusesPluginBeforeAskingScopeOrConsent pins the user-facing
// ordering: the scripted conversation answers only the search and the result
// number, so if the wizard asked for a scope or a confirmation the refusal
// would come after a question whose answer could not change anything.
func TestWizardRefusesPluginBeforeAskingScopeOrConsent(t *testing.T) {
	const id = "plugin:cursor-plugins:demo-plugin"
	h := newHarnessWith(t, []*domain.Listing{pluginFixture(id)})
	wizardEnvForHarness(t, h)
	activateWizardListing(t, h, id)

	w, out := newTestWizard(t, "2\ndemo-plugin\n1\nq\n", h.paths)
	w.registeredHosts = func(context.Context) ([]host.HostVerification, error) {
		return []host.HostVerification{{HostID: "cursor", Registered: true, Status: "ready"}}, nil
	}
	w.catalogClient = func() *catalog.Client { return h.catClient }
	w.openState = func() (*state.DB, error) { return h.db, nil }

	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	outStr := out.String()
	if !strings.Contains(outStr, "LiteSPM cannot install Demo Plugin yet") {
		t.Fatalf("the plugin refusal was not printed:\n%s", outStr)
	}
	if !strings.Contains(outStr, "LPSM-ARTIFACT-UNAVAILABLE") && !strings.Contains(outStr, "no fetch path is wired for plugin sources") {
		t.Fatalf("the refusal does not name the artifact gap:\n%s", outStr)
	}
	if !strings.Contains(outStr, "Nothing was changed.") {
		t.Fatalf("the refusal does not say nothing changed:\n%s", outStr)
	}
	// The questions that must NOT have been asked: scope and consent.
	if strings.Contains(outStr, "Install for all your agents on this machine") {
		t.Errorf("the wizard asked for a scope before refusing an uninstallable kind:\n%s", outStr)
	}
	if strings.Contains(outStr, "for all your agents? [Y/n]") || strings.Contains(outStr, "for this project? [Y/n]") {
		t.Errorf("the wizard asked for consent before refusing an uninstallable kind:\n%s", outStr)
	}
	if after := countPlans(t, h); after != 0 {
		t.Fatalf("the refusal sealed %d plan(s)", after)
	}
}

// TestPluginFixtureStaysVerifiedButUninstallable guards the fixture against
// drift: metadata_verified + plugin is exactly the combination the old gates
// mishandled, so the fixture must keep exercising it.
func TestPluginFixtureStaysVerifiedButUninstallable(t *testing.T) {
	l := pluginFixture("plugin:example:demo")
	if l.Kind != domain.KindPlugin || l.Installability != domain.InstallabilityMetadataVerified {
		t.Fatalf("fixture drifted: kind=%q installability=%q", l.Kind, l.Installability)
	}
	if l.IsInstallable() {
		t.Fatal("a metadata_verified plugin must not report installable")
	}
}
