package policy

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
)

// The grant tier is the one that binds a call to a capability the operator
// approved once, with the schema, the code and the endpoint it was approved
// for. If the tier cannot be evaluated, the call must be denied: an engine
// that silently skips the check it cannot perform fails OPEN, and a database
// that cannot answer its own grant table would turn every drift check off.
func TestPolicy_GrantTierFailsClosedWhenTheTableCannotBeRead(t *testing.T) {
	ctx := context.Background()
	db, _ := setupTestPolicyDB(t)
	defer db.Close()

	engine := NewEngine(db, nil)

	input := PolicyInput{
		Actor:             "agent",
		TargetRef:         "cap_unreadable",
		CapabilityID:      "cap_unreadable",
		SchemaFingerprint: "sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
		Operation:         "invoke",
		Effects: []EffectDeclaration{
			{Effect: EffectExternalRead, Provenance: domain.ProvenanceCurated},
		},
	}

	// With the table in place and no grant rows, the tier has nothing to
	// enforce and the decision falls through to the default level.
	before := engine.Evaluate(ctx, input)
	if len(before.ReasonCodes) > 0 && before.ReasonCodes[0] == "LPSM-POLICY-GRANT-UNAVAILABLE" {
		t.Fatalf("an empty grant table must not deny as unavailable: %+v", before)
	}

	// Now the table cannot be read at all.
	if _, err := db.Raw().ExecContext(ctx, `DROP TABLE capability_grants;`); err != nil {
		t.Fatalf("failed to drop the grant table: %v", err)
	}

	after := engine.Evaluate(ctx, input)
	if after.Decision != DecisionDeny {
		t.Fatalf("an unreadable grant table must deny, got %+v", after)
	}
	if len(after.ReasonCodes) == 0 || after.ReasonCodes[0] != "LPSM-POLICY-GRANT-UNAVAILABLE" {
		t.Fatalf("expected LPSM-POLICY-GRANT-UNAVAILABLE, got %+v", after)
	}
	if !strings.Contains(strings.ToLower(after.Detail), "grant") {
		t.Fatalf("the denial must name the evidence it could not read: %+v", after)
	}
}

// A grant row that cannot be read as the binding it claims to be must not
// authorize the call. The row is the evidence that the schema, the code and
// the endpoint are the ones the operator approved; a row whose binding is
// unreadable proves nothing, so the call is refused - whether the refusal
// names the unreadable row or the drift it creates, the point is that the
// grant does not allow it.
func TestPolicy_UnreadableGrantRowNeverAuthorizesTheCall(t *testing.T) {
	ctx := context.Background()
	db, _ := setupTestPolicyDB(t)
	defer db.Close()

	engine := NewEngine(db, nil)

	// The capability has to exist: the grant table's foreign key would
	// refuse a row that names nothing, and a refusal here would not be the
	// failure this test is about.
	const capID = "cap_bad"
	const tree = "sha256:aaaabbbbccccddddeeeeffff1111222233334444555566667777888899990000"
	const fingerprint = "sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff"
	if err := db.SaveInstall(ctx, &domain.InstallRecord{
		InstallID:   "inst_bad",
		ListingID:   "bad",
		Version:     "1.0.0",
		TreeDigest:  tree,
		Scope:       domain.ScopeUser,
		Status:      domain.InstallActive,
		InstalledAt: time.Now(),
		UpdatedAt:   time.Now(),
	}); err != nil {
		t.Fatalf("failed to save the install: %v", err)
	}
	if err := db.SaveInstallComponent(ctx, &domain.InstallComponentRecord{
		InstallID:     "inst_bad",
		Kind:          domain.ComponentMCPProvider,
		ComponentName: "comp_bad",
		Path:          "/test",
	}); err != nil {
		t.Fatalf("failed to save the component: %v", err)
	}
	if err := db.SaveProvider(ctx, &domain.ProviderRecord{
		ProviderID:    "prov_bad",
		InstallID:     "inst_bad",
		ComponentName: "inst_bad",
		Transport:     "local-stdio",
		CreatedAt:     time.Now(),
	}); err != nil {
		t.Fatalf("failed to save the provider: %v", err)
	}
	if err := db.SaveCapability(ctx, &domain.CapabilityRecord{
		CapabilityID:      capID,
		ProviderID:        "prov_bad",
		Name:              "bad",
		SchemaFingerprint: fingerprint,
		DiscoveredAt:      time.Now(),
	}); err != nil {
		t.Fatalf("failed to save the capability: %v", err)
	}

	// A row whose schema_fingerprint is not the fingerprint the call
	// presents: the binding cannot be confirmed, so the grant cannot speak
	// for the call.
	if _, err := db.Raw().ExecContext(ctx, `
	INSERT INTO capability_grants (grant_id, capability_id, schema_fingerprint, cas_tree_digest, status, granted_by, granted_at)
	VALUES ('grant_bad', ?, 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', NULL, 'active', 'user', CURRENT_TIMESTAMP);`, capID); err != nil {
		t.Fatalf("failed to insert the mismatched grant: %v", err)
	}

	input := PolicyInput{
		Actor:             "agent",
		TargetRef:         capID,
		CapabilityID:      capID,
		SchemaFingerprint: fingerprint,
		CASTreeDigest:     tree,
		Operation:         "invoke",
		Effects: []EffectDeclaration{
			{Effect: EffectExternalRead, Provenance: domain.ProvenanceCurated},
		},
	}

	decision := engine.Evaluate(ctx, input)
	if decision.Decision == DecisionAllow {
		t.Fatalf("a grant whose binding does not match must not authorize the call: %+v", decision)
	}
	if decision.Decision != DecisionDeny {
		t.Fatalf("expected a denial, got %+v", decision)
	}
	if len(decision.ReasonCodes) > 0 && decision.ReasonCodes[0] == "ACTIVE_CAPABILITY_GRANT" {
		t.Fatalf("the grant authorized a call it does not cover: %+v", decision)
	}
}
