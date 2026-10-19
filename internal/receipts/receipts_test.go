package receipts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRecordGetCancel(t *testing.T) {
	s, err := Open("")
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now().UTC()
	inv, err := s.Record("inst_x/srv/query", "prov-1", OutcomeSucceeded, start, start.Add(time.Second), "sha256:in", "sha256:out")
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if inv.Receipt == nil || inv.Receipt.ReceiptHash == "" {
		t.Fatal("receipt must be hashed")
	}
	got, err := s.Get(inv.InvocationID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Receipt.ReceiptHash != inv.Receipt.ReceiptHash {
		t.Error("Get must return the same receipt")
	}
	// Cancel on a terminal invocation is idempotent, not an error.
	c, err := s.Cancel(inv.InvocationID)
	if err != nil {
		t.Fatalf("Cancel terminal: %v", err)
	}
	if c.Cancelled || c.State != OutcomeSucceeded {
		t.Errorf("terminal cancel must be a no-op: %+v", c)
	}
	if _, err := s.Get("invocation_nonexistent"); err == nil {
		t.Error("unknown id must fail")
	}
}

func TestChainAndCancelPending(t *testing.T) {
	s, _ := Open("")
	start := time.Now().UTC()
	a, _ := s.Record("cap/a", "prov-9", OutcomeSucceeded, start, start, "", "")
	b, _ := s.Record("cap/b", "prov-9", OutcomeFailed, start, start, "", "")
	if b.Receipt.PrevReceiptHash != a.Receipt.ReceiptHash {
		t.Error("receipts must chain per provider")
	}
	if err := s.VerifyChain(); err != nil {
		t.Fatalf("VerifyChain: %v", err)
	}
	// Tamper is detected.
	b2, _ := s.Get(b.InvocationID)
	_ = b2
	s.mu.Lock()
	s.invocs[b.InvocationID].Receipt.Outcome = OutcomeSucceeded
	s.mu.Unlock()
	if err := s.VerifyChain(); err == nil {
		t.Error("expected tamper detection")
	}
}

// A fully-populated receipt must survive the round trip with every field
// intact, carry a hash that verifies, and link to the previous receipt of the
// same provider instance. A field the hash does not cover could be rewritten
// without the chain noticing — so the fields ARE the hash's inputs.
func TestRecordReceiptCarriesEveryFieldAndVerifies(t *testing.T) {
	s, err := Open("")
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now().UTC()

	first, err := s.RecordReceipt(Receipt{
		CapabilityID:     "cap/a",
		ProviderInstance: "prov-1",
		Outcome:          OutcomeSucceeded,
		StartedAt:        start,
		EndedAt:          start.Add(time.Second),
		InputDigest:      "sha256:in",
		OutputDigest:     "sha256:out",
	})
	if err != nil {
		t.Fatalf("RecordReceipt: %v", err)
	}

	r := Receipt{
		InvocationID:      "invocation_fixed_id_0000000000001",
		CapabilityID:      "cap/b",
		PackageDigest:     "sha256:package",
		SchemaFingerprint: "sha256:schema",
		ProviderInstance:  "prov-1",
		PolicyDecisionID:  "decision-7",
		ApprovalID:        "approval-9",
		Outcome:           OutcomeSucceeded,
		StartedAt:         start,
		EndedAt:           start.Add(time.Second),
		InputDigest:       "sha256:in2",
		OutputDigest:      "sha256:out2",
		Truncated:         true,
	}
	inv, err := s.RecordReceipt(r)
	if err != nil {
		t.Fatalf("RecordReceipt: %v", err)
	}
	if inv.Receipt == nil {
		t.Fatal("the invocation must carry its receipt")
	}
	got := inv.Receipt
	if got.PackageDigest != r.PackageDigest {
		t.Errorf("packageDigest = %q, want %q", got.PackageDigest, r.PackageDigest)
	}
	if got.SchemaFingerprint != r.SchemaFingerprint {
		t.Errorf("schemaFingerprint = %q, want %q", got.SchemaFingerprint, r.SchemaFingerprint)
	}
	if got.PolicyDecisionID != r.PolicyDecisionID {
		t.Errorf("policyDecisionId = %q, want %q", got.PolicyDecisionID, r.PolicyDecisionID)
	}
	if got.ApprovalID != r.ApprovalID {
		t.Errorf("approvalId = %q, want %q", got.ApprovalID, r.ApprovalID)
	}
	if !got.Truncated {
		t.Error("truncated must survive the round trip")
	}
	if got.InputDigest != r.InputDigest || got.OutputDigest != r.OutputDigest {
		t.Errorf("digests did not survive: %+v", got)
	}
	if got.ReceiptHash == "" {
		t.Error("the receipt must be hashed")
	}
	if got.PrevReceiptHash != first.Receipt.ReceiptHash {
		t.Errorf("prevReceiptHash = %q, want the previous receipt's hash %q",
			got.PrevReceiptHash, first.Receipt.ReceiptHash)
	}
	if err := s.VerifyChain(); err != nil {
		t.Fatalf("VerifyChain: %v", err)
	}
}

// A receipt whose outcome is not one of the known outcomes is refused: a
// receipt with an unknown outcome would be a receipt the chain cannot classify.
func TestRecordReceiptRefusesAnUnknownOutcome(t *testing.T) {
	s, _ := Open("")
	_, err := s.RecordReceipt(Receipt{CapabilityID: "cap/a", Outcome: "maybe"})
	if err == nil {
		t.Fatal("an unknown outcome must be refused")
	}
	if !strings.Contains(err.Error(), "LPSM-RECEIPTS-OUTCOME") {
		t.Errorf("unexpected error: %v", err)
	}
}

// A pending invocation moves queued → running. A terminal one refuses: its
// receipt is the record of what happened, and a later state would contradict
// it. An unknown id is a typed not-found, never a silent no-op.
func TestSetStateRejectsTerminalAndUnknown(t *testing.T) {
	s, _ := Open("")
	s.RegisterPending("invocation_pending_1", "cap/a", "prov-1")

	if err := s.SetState("invocation_pending_1", StateRunning); err != nil {
		t.Fatalf("SetState: %v", err)
	}
	inv, err := s.Get("invocation_pending_1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if inv.State != StateRunning {
		t.Errorf("state = %q, want %q", inv.State, StateRunning)
	}

	// Terminal: refused.
	term, err := s.RecordReceipt(Receipt{
		InvocationID: "invocation_pending_1",
		CapabilityID: "cap/a",
		Outcome:      OutcomeSucceeded,
		StartedAt:    time.Now().UTC(),
		EndedAt:      time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("RecordReceipt: %v", err)
	}
	if term.State != OutcomeSucceeded {
		t.Fatalf("state = %q, want %q", term.State, OutcomeSucceeded)
	}
	if err := s.SetState("invocation_pending_1", StateRunning); err == nil {
		t.Error("a terminal invocation must refuse a state change")
	}

	// Unknown: a typed not-found.
	err = s.SetState("invocation_nonexistent", StateRunning)
	if err == nil {
		t.Fatal("an unknown id must be refused")
	}
	if !strings.Contains(err.Error(), "LPSM-INVOCATION-NOT-FOUND") {
		t.Errorf("unexpected error: %v", err)
	}
}

// The attached cancel function is the handle on the in-flight work. It must be
// called exactly once: a repeated cancel returns the same terminal invocation
// and does not signal the call a second time.
func TestAttachCancelIsCalledOnceAndIsIdempotent(t *testing.T) {
	s, _ := Open("")
	s.RegisterPending("invocation_pending_2", "cap/a", "prov-1")

	calls := 0
	if err := s.AttachCancel("invocation_pending_2", func() { calls++ }); err != nil {
		t.Fatalf("AttachCancel: %v", err)
	}

	inv, err := s.Cancel("invocation_pending_2")
	if err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if inv.State != StateCancelled || !inv.Cancelled {
		t.Errorf("cancelled invocation = %+v", inv)
	}
	if calls != 1 {
		t.Fatalf("cancel func called %d times, want exactly 1", calls)
	}

	again, err := s.Cancel("invocation_pending_2")
	if err != nil {
		t.Fatalf("second Cancel: %v", err)
	}
	if again.State != StateCancelled {
		t.Errorf("second cancel changed the state: %+v", again)
	}
	if calls != 1 {
		t.Errorf("cancel func called %d times after a repeated cancel, want 1", calls)
	}
	if err := s.VerifyChain(); err != nil {
		t.Fatalf("VerifyChain after cancel: %v", err)
	}
}

// Attaching a cancel function to a terminal invocation is a no-op (there is
// nothing left to cancel), and attaching twice replaces the function.
func TestAttachCancelIsANoOpOnTerminalInvocations(t *testing.T) {
	s, _ := Open("")
	inv, err := s.RecordReceipt(Receipt{
		InvocationID: "invocation_terminal_1",
		CapabilityID: "cap/a",
		Outcome:      OutcomeSucceeded,
		StartedAt:    time.Now().UTC(),
		EndedAt:      time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("RecordReceipt: %v", err)
	}
	calls := 0
	if err := s.AttachCancel(inv.InvocationID, func() { calls++ }); err != nil {
		t.Fatalf("AttachCancel: %v", err)
	}
	if _, err := s.Cancel(inv.InvocationID); err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if calls != 0 {
		t.Errorf("a terminal invocation must not signal a cancel (%d calls)", calls)
	}
}

// Pending lists the invocations that have not reached a terminal state, oldest
// first: a caller that drains the list in order sees them in issue order.
func TestPendingListsNonTerminalInvocationsOldestFirst(t *testing.T) {
	s, _ := Open("")
	s.RegisterPending("invocation_p1", "cap/a", "prov-1")
	s.RegisterPending("invocation_p2", "cap/b", "prov-1")
	if _, err := s.RecordReceipt(Receipt{
		InvocationID: "invocation_p3",
		CapabilityID: "cap/c",
		Outcome:      OutcomeFailed,
		StartedAt:    time.Now().UTC(),
		EndedAt:      time.Now().UTC(),
	}); err != nil {
		t.Fatalf("RecordReceipt: %v", err)
	}

	pending := s.Pending()
	if len(pending) != 2 {
		t.Fatalf("pending = %d invocations, want 2", len(pending))
	}
	if pending[0].InvocationID != "invocation_p1" || pending[1].InvocationID != "invocation_p2" {
		t.Errorf("pending is not oldest-first: %+v", pending)
	}
}

func TestDurableReplay(t *testing.T) {
	path := filepath.Join(t.TempDir(), "receipts.jsonl")
	s, _ := Open(path)
	start := time.Now().UTC()
	inv, err := s.Record("cap/a", "prov-1", OutcomeSucceeded, start, start, "", "")
	if err != nil {
		t.Fatal(err)
	}
	s2, err := Open(path)
	if err != nil {
		t.Fatalf("replay: %v", err)
	}
	got, err := s2.Get(inv.InvocationID)
	if err != nil {
		t.Fatalf("Get after replay: %v", err)
	}
	if got.Receipt.ReceiptHash != inv.Receipt.ReceiptHash {
		t.Error("replayed receipt differs")
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
}
