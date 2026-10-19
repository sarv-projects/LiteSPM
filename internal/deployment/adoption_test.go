package deployment_test

// adoption_test.go — the ownership row an adoption records.
//
// An adoption is the one ledger row LiteSPM did not write: the pre-image and
// the post-image are the same image, and the prior entry is the node's own
// text. That is what makes a later removal RESTORE the node instead of
// deleting it.

import (
	"testing"

	"github.com/sarv-projects/litespm/internal/deployment"
)

func TestAdoptionRowRecordsTheNodeAsItStands(t *testing.T) {
	const fingerprint = "sha256:abc123"
	const prior = `{"args":["-y","server-github"],"command":"npx"}`

	m := deployment.Adoption("inst_user_adopt_claude-code_github", "mcp:adopted:github",
		"claude-code", "user", "/home/u/.claude.json", "json-object",
		"mcpServers.github", fingerprint, prior)

	if !deployment.IsAdoption(*m) {
		t.Error("the row is not marked as an adoption")
	}
	if m.PreImageHash != fingerprint {
		t.Errorf("the pre-image is %q, want the node's own fingerprint %q", m.PreImageHash, fingerprint)
	}
	if m.PostImageHash != fingerprint {
		t.Errorf("an adoption writes nothing, so the post-image must be the node's own image: %q", m.PostImageHash)
	}
	if m.PriorEntry != prior {
		t.Errorf("the prior entry is %q, want the node's own text %q", m.PriorEntry, prior)
	}
	if m.Owner != deployment.OwnerAdopted {
		t.Errorf("the owner is %q, want %q", m.Owner, deployment.OwnerAdopted)
	}
	if m.Locator != "mcpServers.github" {
		t.Errorf("the locator is %q, want %q", m.Locator, "mcpServers.github")
	}
	// The row is complete enough for the ledger to accept it: an install, a
	// host, a file and a locator.
	if m.InstallID == "" || m.HostID == "" || m.FilePath == "" || m.Locator == "" {
		t.Errorf("the row is missing a required field: %+v", m)
	}
}

func TestAnAdoptedNodeReconcilesAsUnmodifiedUntilItIsEdited(t *testing.T) {
	const fingerprint = "sha256:abc123"
	m := deployment.Adoption("inst_user_adopt_claude-code_github", "mcp:adopted:github",
		"claude-code", "user", "/home/u/.claude.json", "json-object",
		"mcpServers.github", fingerprint, "")

	// Untouched: the node is what LiteSPM took ownership of, so a removal
	// may act on it (by RESTORING it, because the prior entry says so).
	if r := deployment.Reconcile(*m, fingerprint); r.Outcome != deployment.ReconcileUnmodified {
		t.Errorf("an untouched adopted node should reconcile as unmodified, got %s", r.Outcome)
	}
	// Edited by the user: the node is theirs now, and it is kept.
	if r := deployment.Reconcile(*m, "sha256:edited"); r.Outcome != deployment.ReconcileUserEdited {
		t.Errorf("an edited adopted node should reconcile as user_edited, got %s", r.Outcome)
	}
	// Gone: reported as missing, never recreated.
	if r := deployment.Reconcile(*m, ""); r.Outcome != deployment.ReconcileMissing {
		t.Errorf("a missing adopted node should reconcile as missing, got %s", r.Outcome)
	}
}
