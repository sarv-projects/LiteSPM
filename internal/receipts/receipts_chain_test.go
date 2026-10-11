package receipts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// recordChain records n successful receipts for one provider instance and
// returns them in issue order.
func recordChain(t *testing.T, s *Store, prov string, n int) []*Invocation {
	t.Helper()
	start := time.Now().UTC()
	out := make([]*Invocation, 0, n)
	for i := range n {
		inv, err := s.Record("cap/"+string(rune('a'+i)), prov, OutcomeSucceeded, start, start.Add(time.Duration(i)*time.Second), "", "")
		if err != nil {
			t.Fatalf("Record: %v", err)
		}
		out = append(out, inv)
	}
	return out
}

func TestVerifyChainAcceptsOrderedChain(t *testing.T) {
	s, _ := Open("")
	recordChain(t, s, "prov-1", 3)
	if err := s.VerifyChain(); err != nil {
		t.Fatalf("an ordered chain was rejected: %v", err)
	}
}

// TestVerifyChainDetectsReorderedReceipt pins the weak-link defect: the old
// check accepted any link to a hash the store had issued, so swapping two
// receipts in a provider's log left every link pointing at a known hash and
// slipped through. The recorded order is the authority: the second receipt in
// the reordered chain no longer links to the first.
func TestVerifyChainDetectsReorderedReceipt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "receipts.jsonl")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	recordChain(t, s, "prov-1", 3)

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	if len(lines) != 3 {
		t.Fatalf("want 3 replayed receipt lines, got %d", len(lines))
	}
	lines[1], lines[2] = lines[2], lines[1]
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	reopened, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := reopened.VerifyChain(); err == nil {
		t.Fatal("a reordered receipt chain was accepted")
	}
}

// TestVerifyChainDetectsDeletedMiddleReceipt pins the same defect from the
// other direction: removing a middle receipt and splicing the surviving tail
// onto an earlier receipt leaves every link pointing at a hash the store
// issued, which the old check accepted. The recorded order still names the
// deleted receipt, so the chain is refused.
func TestVerifyChainDetectsDeletedMiddleReceipt(t *testing.T) {
	s, _ := Open("")
	invs := recordChain(t, s, "prov-1", 3)

	s.mu.Lock()
	delete(s.invocs, invs[1].InvocationID)
	invs[2].Receipt.PrevReceiptHash = invs[0].Receipt.ReceiptHash
	invs[2].Receipt.ReceiptHash = hashReceipt(invs[2].Receipt)
	s.mu.Unlock()

	if err := s.VerifyChain(); err == nil {
		t.Fatal("a deleted middle receipt was accepted")
	}
}
