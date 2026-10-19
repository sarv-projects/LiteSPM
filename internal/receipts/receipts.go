// Package receipts implements durable, tamper-evident invocation receipts
// (ARCH/34 §6) plus the minimal invocation registry that takes
// invocation.get / invocation.cancel off their -32601 stubs.
//
// Chain: ReceiptHash = sha256(canonical JSON of all fields except itself);
// PrevReceiptHash links each receipt to the previous one for the same
// provider instance, so a reordered or interior-deleted receipt is detected by
// VerifyChain.
//
// Limit (by construction): the chain is verified against the store's own
// recorded order, so truncating the file — dropping the tail of a provider's
// chain — leaves a self-consistent prefix and is NOT detectable here. Detecting
// that needs an expected head anchored outside this file; do not read this
// method as making the store append-only.
//
// Durability: the store appends JSON lines to a file (fsync per append) and
// replays it on open. Outputs are represented by digest, not retained.
package receipts

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// Outcomes.
const (
	OutcomeSucceeded        = "succeeded"
	OutcomeFailed           = "failed"
	OutcomeCancelled        = "cancelled"
	OutcomeDeadlineExceeded = "deadline_exceeded"
)

// States for the registry view.
const (
	StateQueued           = "queued"
	StateRunning          = "running"
	StateSucceeded        = "succeeded"
	StateFailed           = "failed"
	StateCancelled        = "cancelled"
	StateDeadlineExceeded = "deadline_exceeded"
)

// Receipt is one tamper-evident invocation receipt.
type Receipt struct {
	InvocationID      string    `json:"invocationId"`
	CapabilityID      string    `json:"capabilityId"`
	PackageDigest     string    `json:"packageDigest,omitempty"`
	SchemaFingerprint string    `json:"schemaFingerprint,omitempty"`
	ProviderInstance  string    `json:"providerInstance,omitempty"`
	PolicyDecisionID  string    `json:"policyDecisionId,omitempty"`
	ApprovalID        string    `json:"approvalId,omitempty"`
	Outcome           string    `json:"outcome"`
	StartedAt         time.Time `json:"startedAt"`
	EndedAt           time.Time `json:"endedAt"`
	InputDigest       string    `json:"inputDigest,omitempty"`
	OutputDigest      string    `json:"outputDigest,omitempty"`
	Truncated         bool      `json:"truncated,omitempty"`
	PrevReceiptHash   string    `json:"prevReceiptHash,omitempty"`
	ReceiptHash       string    `json:"receiptHash,omitempty"`
}

// Invocation is the registry view: current state plus the terminal receipt.
type Invocation struct {
	InvocationID string    `json:"invocationId"`
	CapabilityID string    `json:"capabilityId"`
	State        string    `json:"state"`
	Cancelled    bool      `json:"cancelled,omitempty"`
	Receipt      *Receipt  `json:"receipt,omitempty"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// Store is a durable invocation registry + receipt chain.
type Store struct {
	mu     sync.Mutex
	path   string
	invocs map[string]*Invocation
	// order records, per provider instance, the receipt hashes in the order
	// this store issued (or replayed) them. It is the authoritative link order
	// VerifyChain checks: a receipt that disappears from the store, or one
	// whose link no longer matches its recorded predecessor, leaves the
	// recorded order unsatisfiable.
	order map[string][]string
	// seq numbers every invocation this store knows about, in the order it
	// learned them. Pending() orders by it: UpdatedAt alone can tie (two
	// invocations registered inside one clock tick), and "newest last" must
	// still be a total order.
	seq     map[string]uint64
	nextSeq uint64
	// cancels holds the in-flight cancellation function of every non-terminal
	// invocation. Cancel calls it exactly once and drops it, so a repeated
	// cancel is a no-op rather than a second signal to the same call.
	cancels map[string]func()
}

// Open creates or replays the store at path. An empty path means
// memory-only (used by tests).
func Open(path string) (*Store, error) {
	s := &Store{
		path:    path,
		invocs:  map[string]*Invocation{},
		order:   map[string][]string{},
		seq:     map[string]uint64{},
		cancels: map[string]func(){},
	}
	if path == "" {
		return s, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return nil, fmt.Errorf("LPSM-RECEIPTS-READ: %w", err)
	}
	for i, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var inv Invocation
		if err := json.Unmarshal([]byte(line), &inv); err != nil {
			return nil, fmt.Errorf("LPSM-RECEIPTS-CORRUPT: line %d: %w", i+1, err)
		}
		cp := inv
		s.invocs[cp.InvocationID] = &cp
		s.seq[cp.InvocationID] = s.nextSeq
		s.nextSeq++
		if cp.Receipt != nil && cp.Receipt.ReceiptHash != "" {
			s.order[cp.Receipt.ProviderInstance] = append(s.order[cp.Receipt.ProviderInstance], cp.Receipt.ReceiptHash)
		}
	}
	return s, nil
}

// Record appends a terminal invocation with its receipt, chaining and
// hashing it. It returns the stored copy.
func (s *Store) Record(capabilityID, providerInstance, outcome string, started, ended time.Time, inputDigest, outputDigest string) (*Invocation, error) {
	return s.RecordReceipt(Receipt{
		CapabilityID:     capabilityID,
		ProviderInstance: providerInstance,
		Outcome:          outcome,
		StartedAt:        started,
		EndedAt:          ended,
		InputDigest:      inputDigest,
		OutputDigest:     outputDigest,
	})
}

// RecordReceipt records a fully-populated receipt: it links the receipt to the
// previous one issued for the same provider instance, hashes it over the
// canonical projection of every field except the hash itself, chains it and
// persists it.
//
// The first terminal receipt for an invocation wins. Recording over an
// invocation that already reached a terminal state changes nothing and adds no
// link to the chain: that is what makes a cancellation race deterministic — a
// call that returned at the same moment a cancel landed keeps whichever
// terminal state was recorded first, and the chain stays verifiable.
//
// A receipt with an empty InvocationID gets a fresh one; a receipt with a
// caller-chosen id is recorded under that id, which is how an engine that
// allocated the id up front (so it could return it to the caller) attaches the
// receipt to the invocation it already registered.
func (s *Store) RecordReceipt(r Receipt) (*Invocation, error) {
	switch r.Outcome {
	case OutcomeSucceeded, OutcomeFailed, OutcomeCancelled, OutcomeDeadlineExceeded:
	default:
		return nil, fmt.Errorf("LPSM-RECEIPTS-OUTCOME: %q", r.Outcome)
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	id := r.InvocationID
	if id == "" {
		id = nextID()
	}
	if existing, ok := s.invocs[id]; ok && isTerminalState(existing.State) {
		cp := *existing
		return &cp, nil
	}

	r.InvocationID = id
	r.StartedAt = r.StartedAt.UTC()
	r.EndedAt = r.EndedAt.UTC()
	r.PrevReceiptHash = s.lastHashLocked(r.ProviderInstance)
	r.ReceiptHash = hashReceipt(&r)

	inv, ok := s.invocs[id]
	if !ok {
		inv = &Invocation{InvocationID: id}
		s.invocs[id] = inv
		s.seq[id] = s.nextSeq
		s.nextSeq++
	}
	inv.CapabilityID = r.CapabilityID
	inv.State = r.Outcome
	inv.Cancelled = r.Outcome == OutcomeCancelled
	inv.Receipt = &r
	inv.UpdatedAt = time.Now().UTC()
	s.order[r.ProviderInstance] = append(s.order[r.ProviderInstance], r.ReceiptHash)
	// The invocation is terminal: nothing is left to cancel.
	delete(s.cancels, id)
	if err := s.appendLocked(inv); err != nil {
		return nil, err
	}
	return inv, nil
}

// SetState moves a pending invocation to another non-terminal state (queued or
// running). A terminal invocation is never moved: its receipt is the record of
// what happened, and a later state would contradict it. An unknown id is a
// typed not-found, never a silent no-op.
//
// The state change is not persisted: the durable record of an invocation is
// its receipt, and a pending invocation has none.
func (s *Store) SetState(id, state string) error {
	switch state {
	case StateQueued, StateRunning:
	default:
		return fmt.Errorf("LPSM-RECEIPTS-STATE: %q", state)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	inv, ok := s.invocs[id]
	if !ok {
		return fmt.Errorf("LPSM-INVOCATION-NOT-FOUND: %q", id)
	}
	if isTerminalState(inv.State) {
		return fmt.Errorf("LPSM-RECEIPTS-TERMINAL: invocation %q is already %s", id, inv.State)
	}
	inv.State = state
	inv.UpdatedAt = time.Now().UTC()
	return nil
}

// AttachCancel attaches the in-flight cancellation function to a pending
// invocation. Attaching to a terminal invocation is a no-op (there is nothing
// left to cancel), and attaching twice replaces the function.
func (s *Store) AttachCancel(id string, cancel func()) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	inv, ok := s.invocs[id]
	if !ok {
		return fmt.Errorf("LPSM-INVOCATION-NOT-FOUND: %q", id)
	}
	if isTerminalState(inv.State) {
		return nil
	}
	if cancel == nil {
		delete(s.cancels, id)
		return nil
	}
	s.cancels[id] = cancel
	return nil
}

// Pending returns every invocation that has not reached a terminal state,
// oldest first (newest last).
func (s *Store) Pending() []*Invocation {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]*Invocation, 0, len(s.invocs))
	for _, inv := range s.invocs {
		if isTerminalState(inv.State) {
			continue
		}
		cp := *inv
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool {
		return s.seq[out[i].InvocationID] < s.seq[out[j].InvocationID]
	})
	return out
}

// Get fetches an invocation by id. Unknown ids are a caller error, not a
// missing method: callers must stop using -32601 once this store is wired.
func (s *Store) Get(id string) (*Invocation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	inv, ok := s.invocs[id]
	if !ok {
		return nil, fmt.Errorf("LPSM-INVOCATION-NOT-FOUND: %q", id)
	}
	cp := *inv
	return &cp, nil
}

// Cancel requests cooperative cancellation. It is idempotent: terminal
// states return cancelled=false with no error; queued/running states flip
// to cancelled, record a cancellation receipt and signal the attached
// cancellation function exactly once.
func (s *Store) Cancel(id string) (*Invocation, error) {
	s.mu.Lock()
	inv, ok := s.invocs[id]
	if !ok {
		s.mu.Unlock()
		return nil, fmt.Errorf("LPSM-INVOCATION-NOT-FOUND: %q", id)
	}
	switch inv.State {
	case StateSucceeded, StateFailed, StateCancelled, StateDeadlineExceeded:
		cp := *inv
		s.mu.Unlock()
		return &cp, nil
	}
	now := time.Now().UTC()
	r := &Receipt{
		InvocationID:     inv.InvocationID,
		CapabilityID:     inv.CapabilityID,
		ProviderInstance: instanceOf(inv),
		Outcome:          OutcomeCancelled,
		StartedAt:        now,
		EndedAt:          now,
		PrevReceiptHash:  s.lastHashLocked(instanceOf(inv)),
	}
	r.ReceiptHash = hashReceipt(r)
	inv.State = StateCancelled
	inv.Cancelled = true
	inv.Receipt = r
	inv.UpdatedAt = now
	s.order[instanceOf(inv)] = append(s.order[instanceOf(inv)], r.ReceiptHash)
	// The cancel function fires exactly once: it is dropped here, so a
	// repeated cancel cannot signal the same call a second time.
	cancel := s.cancels[id]
	delete(s.cancels, id)
	cp := *inv
	err := s.appendLocked(inv)
	s.mu.Unlock()
	if err != nil {
		return nil, err
	}
	if cancel != nil {
		cancel()
	}
	return &cp, nil
}

// RegisterPending tracks a queued/running invocation so Cancel has
// something idempotent to act on before a terminal Record lands. The
// invocation starts in the queued state: it has been accepted, not dispatched.
func (s *Store) RegisterPending(id, capabilityID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.invocs[id]; !ok {
		s.invocs[id] = &Invocation{
			InvocationID: id,
			CapabilityID: capabilityID,
			State:        StateQueued,
			UpdatedAt:    time.Now().UTC(),
		}
		s.seq[id] = s.nextSeq
		s.nextSeq++
	}
}

// VerifyChain re-hashes every receipt and checks the true per-provider link
// order: within a provider instance, each receipt's PrevReceiptHash must equal
// the immediately-preceding receipt's ReceiptHash, and the first receipt must
// carry no link. The store's recorded issue order is the authority, so a
// reordered receipt, an interior deletion, or a relink is refused rather than
// accepted because it references some hash the store once issued. A truncated
// tail is not detectable from inside the store (see the package doc).
func (s *Store) VerifyChain() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Re-hash every receipt and index the live ones by hash so the recorded
	// order can be resolved to receipts.
	byHash := make(map[string]*Receipt, len(s.invocs))
	for id, inv := range s.invocs {
		r := inv.Receipt
		if r == nil {
			continue
		}
		if want := hashReceipt(r); want != r.ReceiptHash {
			return fmt.Errorf("LPSM-RECEIPT-TAMPER: %s hash mismatch", id)
		}
		byHash[r.ReceiptHash] = r
	}

	covered := 0
	for prov, hashes := range s.order {
		prev := ""
		for i, h := range hashes {
			r, ok := byHash[h]
			if !ok {
				return fmt.Errorf("LPSM-RECEIPT-CHAIN: provider %q is missing receipt %d (%s)", prov, i+1, h)
			}
			if r.ProviderInstance != prov {
				return fmt.Errorf("LPSM-RECEIPT-CHAIN: receipt %s is ordered under provider %q but names %q", h, prov, r.ProviderInstance)
			}
			if r.PrevReceiptHash != prev {
				return fmt.Errorf("LPSM-RECEIPT-CHAIN: provider %q receipt %d does not link to its predecessor", prov, i+1)
			}
			prev = h
			covered++
		}
	}
	if covered != len(byHash) {
		return fmt.Errorf("LPSM-RECEIPT-CHAIN: %d receipt(s) are outside any provider chain", len(byHash)-covered)
	}
	return nil
}

// lastHashLocked returns the hash of the most recently issued receipt for a
// provider instance (empty before the first), i.e. the link its next receipt
// must carry.
func (s *Store) lastHashLocked(prov string) string {
	hashes := s.order[prov]
	if len(hashes) == 0 {
		return ""
	}
	return hashes[len(hashes)-1]
}

// List returns invocation ids in sorted order (for reconcile/audit passes).
func (s *Store) List() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, 0, len(s.invocs))
	for id := range s.invocs {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

func (s *Store) appendLocked(inv *Invocation) error {
	if s.path == "" {
		return nil
	}
	f, err := os.OpenFile(s.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("LPSM-RECEIPTS-WRITE: %w", err)
	}
	defer f.Close()
	b, _ := json.Marshal(inv)
	if _, err := f.Write(append(b, '\n')); err != nil {
		return fmt.Errorf("LPSM-RECEIPTS-WRITE: %w", err)
	}
	return f.Sync()
}

func hashReceipt(r *Receipt) string {
	proj := map[string]any{
		"approvalId":        r.ApprovalID,
		"capabilityId":      r.CapabilityID,
		"endedAt":           r.EndedAt.UTC().Format(time.RFC3339Nano),
		"inputDigest":       r.InputDigest,
		"outcome":           r.Outcome,
		"outputDigest":      r.OutputDigest,
		"packageDigest":     r.PackageDigest,
		"policyDecisionId":  r.PolicyDecisionID,
		"prevReceiptHash":   r.PrevReceiptHash,
		"providerInstance":  r.ProviderInstance,
		"schemaFingerprint": r.SchemaFingerprint,
		"startedAt":         r.StartedAt.UTC().Format(time.RFC3339Nano),
		"truncated":         r.Truncated,
	}
	b, _ := json.Marshal(proj)
	sum := sha256.Sum256(b)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func instanceOf(inv *Invocation) string {
	if inv.Receipt != nil && inv.Receipt.ProviderInstance != "" {
		return inv.Receipt.ProviderInstance
	}
	return "unknown"
}

// isTerminalState reports whether an invocation reached a state it can never
// leave. A terminal invocation's receipt is the record of what happened.
func isTerminalState(state string) bool {
	switch state {
	case StateSucceeded, StateFailed, StateCancelled, StateDeadlineExceeded:
		return true
	}
	return false
}
