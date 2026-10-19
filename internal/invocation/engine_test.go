package invocation

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/receipts"
)

// errProviderDied is what a provider that dies mid-call reports.
var errProviderDied = errors.New("the provider process died")

// testCapability is the capability id the engine tests call. It parses as a
// real capability id, so the engine resolves a real provider key from it.
const testCapability = "inst_user_mcp_demo_1_0_0/srv/tool"

// newTestEngine builds an engine over an in-memory store.
func newTestEngine(t *testing.T, inv Invoker, opts Options) *Engine {
	t.Helper()
	store, err := receipts.Open("")
	if err != nil {
		t.Fatalf("receipts.Open: %v", err)
	}
	opts.Store = store
	opts.Invoker = inv
	return NewEngine(opts)
}

// The happy path of the whole engine: a call that succeeds leaves a receipt
// whose hash verifies. A receipt that does not verify is not a receipt.
func TestSubmitAndWaitProducesVerifiableReceipt(t *testing.T) {
	engine := newTestEngine(t, func(ctx context.Context, capabilityID string, arguments json.RawMessage) (Output, error) {
		return Output{Text: "ok"}, nil
	}, Options{})

	inv, err := engine.SubmitAndWait(context.Background(), testCapability, json.RawMessage(`{"a":1}`), 0)
	if err != nil {
		t.Fatalf("SubmitAndWait: %v", err)
	}
	if inv.State != receipts.StateSucceeded {
		t.Fatalf("state = %q, want %q", inv.State, receipts.StateSucceeded)
	}
	if inv.Receipt == nil {
		t.Fatal("a completed invocation must carry a receipt")
	}
	if inv.Receipt.ReceiptHash == "" {
		t.Error("the receipt must be hashed")
	}
	if inv.Receipt.InputDigest == "" {
		t.Error("the receipt must digest the input")
	}
	if inv.Receipt.OutputDigest == "" {
		t.Error("the receipt must digest the output")
	}
	if err := engine.Store.VerifyChain(); err != nil {
		t.Fatalf("VerifyChain: %v", err)
	}
}

// The queue bound: with one slot and one place in the queue, a third call for
// the same provider is refused immediately with a typed busy error instead of
// piling up or blocking the caller.
func TestQueueBoundReturnsProviderBusy(t *testing.T) {
	release := make(chan struct{})
	var once sync.Once
	engine := newTestEngine(t, func(ctx context.Context, capabilityID string, arguments json.RawMessage) (Output, error) {
		<-release
		return Output{Text: "ok"}, nil
	}, Options{
		MaxConcurrentPerProvider: 1,
		MaxQueuedPerProvider:     1,
	})
	defer once.Do(func() { close(release) })

	ctx := context.Background()
	first, err := engine.Submit(ctx, testCapability, json.RawMessage(`{}`), 0)
	if err != nil {
		t.Fatalf("first Submit: %v", err)
	}
	// The first call holds the only slot; the second one queues behind it.
	second, err := engine.Submit(ctx, testCapability, json.RawMessage(`{}`), 0)
	if err != nil {
		t.Fatalf("second Submit: %v", err)
	}
	if first.InvocationID == second.InvocationID {
		t.Fatal("every invocation needs its own id")
	}

	start := time.Now()
	_, err = engine.Submit(ctx, testCapability, json.RawMessage(`{}`), 0)
	elapsed := time.Since(start)
	if err == nil {
		t.Fatal("a call past the queue bound must be refused")
	}
	if !strings.Contains(err.Error(), "LPSM-PROVIDER-BUSY") {
		t.Fatalf("unexpected error: %v", err)
	}
	if elapsed > time.Second {
		t.Errorf("the refusal took %s — it must fail fast", elapsed)
	}
}

// Every invocation has a bounded deadline: a call that outlives it ends as
// deadline_exceeded, with a receipt that says so.
func TestDeadlineExceededIsRecorded(t *testing.T) {
	engine := newTestEngine(t, func(ctx context.Context, capabilityID string, arguments json.RawMessage) (Output, error) {
		select {
		case <-ctx.Done():
		case <-time.After(2 * time.Second):
		}
		return Output{Text: "late"}, nil
	}, Options{MaxDeadline: 50 * time.Millisecond})

	start := time.Now()
	inv, err := engine.SubmitAndWait(context.Background(), testCapability, json.RawMessage(`{}`), 0)
	elapsed := time.Since(start)
	if err == nil {
		t.Fatal("a call that outlived its deadline must fail")
	}
	if inv == nil {
		t.Fatal("the invocation must be returned with the error")
	}
	if inv.State != receipts.StateDeadlineExceeded {
		t.Fatalf("state = %q, want %q", inv.State, receipts.StateDeadlineExceeded)
	}
	if inv.Receipt == nil || inv.Receipt.Outcome != receipts.OutcomeDeadlineExceeded {
		t.Fatalf("the receipt must record the deadline: %+v", inv.Receipt)
	}
	if elapsed > time.Second {
		t.Errorf("the call took %s — the deadline must cut it short", elapsed)
	}
}

// Cancellation is real: it reaches the in-flight call through its context,
// the invocation ends as cancelled, and the chain still verifies afterwards.
func TestCancelStopsAnInFlightCallAndRecordsCancelled(t *testing.T) {
	observed := make(chan struct{})
	var sawCancel bool
	var mu sync.Mutex
	engine := newTestEngine(t, func(ctx context.Context, capabilityID string, arguments json.RawMessage) (Output, error) {
		<-ctx.Done()
		mu.Lock()
		sawCancel = true
		mu.Unlock()
		close(observed)
		return Output{Text: "cancelled"}, nil
	}, Options{})

	inv, err := engine.Submit(context.Background(), testCapability, json.RawMessage(`{}`), 0)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	// Wait until the call is actually running before cancelling it.
	waitForState(t, engine, inv.InvocationID, receipts.StateRunning)

	cancelled, err := engine.Cancel(inv.InvocationID)
	if err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if cancelled.State != receipts.StateCancelled {
		t.Fatalf("state = %q, want %q", cancelled.State, receipts.StateCancelled)
	}
	if cancelled.Receipt == nil || cancelled.Receipt.Outcome != receipts.OutcomeCancelled {
		t.Fatalf("the receipt must record the cancellation: %+v", cancelled.Receipt)
	}

	select {
	case <-observed:
	case <-time.After(2 * time.Second):
		t.Fatal("the in-flight call never saw the cancellation")
	}
	mu.Lock()
	got := sawCancel
	mu.Unlock()
	if !got {
		t.Error("the provider call must observe the cancellation")
	}
	if err := engine.Store.VerifyChain(); err != nil {
		t.Fatalf("VerifyChain after cancel: %v", err)
	}

	// Idempotent: a second cancel returns the same terminal invocation.
	again, err := engine.Cancel(inv.InvocationID)
	if err != nil {
		t.Fatalf("second Cancel: %v", err)
	}
	if again.State != receipts.StateCancelled {
		t.Errorf("the second cancel changed the state: %+v", again)
	}
}

// A provider that dies mid-call is a typed failure with a failed receipt —
// never an empty success.
func TestProviderFailureIsRecordedAsFailed(t *testing.T) {
	engine := newTestEngine(t, func(ctx context.Context, capabilityID string, arguments json.RawMessage) (Output, error) {
		return Output{}, errProviderDied
	}, Options{})

	inv, err := engine.SubmitAndWait(context.Background(), testCapability, json.RawMessage(`{}`), 0)
	if err == nil {
		t.Fatal("a dead provider must fail the invocation")
	}
	if inv == nil {
		t.Fatal("the invocation must be returned with the error")
	}
	if inv.State != receipts.StateFailed {
		t.Fatalf("state = %q, want %q", inv.State, receipts.StateFailed)
	}
	if inv.Receipt == nil || inv.Receipt.Outcome != receipts.OutcomeFailed {
		t.Fatalf("the receipt must record the failure: %+v", inv.Receipt)
	}
	if err := engine.Store.VerifyChain(); err != nil {
		t.Fatalf("VerifyChain: %v", err)
	}
}

// An oversized result is truncated with an explicit marker; the digest in the
// receipt is the digest of the ORIGINAL bytes, so a consumer can still tell
// what the provider actually returned.
func TestOversizedOutputIsTruncatedWithDigest(t *testing.T) {
	big := strings.Repeat("a", 2<<20)
	engine := newTestEngine(t, func(ctx context.Context, capabilityID string, arguments json.RawMessage) (Output, error) {
		return Output{Text: big}, nil
	}, Options{MaxOutputBytes: 1024})

	inv, err := engine.SubmitAndWait(context.Background(), testCapability, json.RawMessage(`{}`), 0)
	if err != nil {
		t.Fatalf("SubmitAndWait: %v", err)
	}
	result, ok := engine.Result(inv.InvocationID)
	if !ok {
		t.Fatal("the result must be available")
	}
	if !result.Truncated {
		t.Error("the result must be marked truncated")
	}
	if len(result.Text) > 1024+128 {
		t.Errorf("the recorded output is %d bytes — it must be bounded", len(result.Text))
	}
	if !strings.Contains(result.Text, "truncated") {
		t.Errorf("the truncation must be explicit: %q", result.Text[:64])
	}
	if inv.Receipt == nil {
		t.Fatal("a completed invocation must carry a receipt")
	}
	if !inv.Receipt.Truncated {
		t.Error("the receipt must record the truncation")
	}
	if want := receipts.DigestOf([]byte(big)); inv.Receipt.OutputDigest != want {
		t.Errorf("output digest = %q, want the digest of the original bytes %q",
			inv.Receipt.OutputDigest, want)
	}
}

// Redaction keeps secrets out of every artifact: the result, the receipt and
// the error the caller sees.
func TestRedactionRemovesSecretsFromResultAndStderr(t *testing.T) {
	const token = "ghp_abcdefghijklmnopqrstuvwxyz012345"
	const bearer = "sk-1234567890abcdef"
	engine := newTestEngine(t, func(ctx context.Context, capabilityID string, arguments json.RawMessage) (Output, error) {
		return Output{
			Text:   "token=" + token,
			Stderr: "Authorization: Bearer " + bearer,
		}, nil
	}, Options{})

	inv, err := engine.SubmitAndWait(context.Background(), testCapability, json.RawMessage(`{}`), 0)
	if err != nil {
		t.Fatalf("SubmitAndWait: %v", err)
	}
	result, ok := engine.Result(inv.InvocationID)
	if !ok {
		t.Fatal("the result must be available")
	}
	if strings.Contains(result.Text, token) {
		t.Errorf("the result still carries the token: %q", result.Text)
	}
	if strings.Contains(result.Stderr, bearer) {
		t.Errorf("the stderr still carries the secret: %q", result.Stderr)
	}
	if inv.Receipt != nil && strings.Contains(inv.Receipt.ReceiptHash, token) {
		t.Error("the receipt carries the token")
	}
}

// The cancellation receipt of a pending invocation must land in the same
// provider chain as the receipts around it: a receipt filed under an
// anonymous provider would break the per-provider link the chain is built on.
func TestCancellationReceiptChainsUnderTheProvider(t *testing.T) {
	block := make(chan struct{})
	engine := newTestEngine(t, func(ctx context.Context, capabilityID string, arguments json.RawMessage) (Output, error) {
		if strings.Contains(string(arguments), "block") {
			select {
			case <-block:
			case <-ctx.Done():
			}
		}
		return Output{Text: "ok"}, nil
	}, Options{})

	first, err := engine.SubmitAndWait(context.Background(), testCapability, json.RawMessage(`{}`), 0)
	if err != nil {
		t.Fatalf("first call: %v", err)
	}
	second, err := engine.Submit(context.Background(), testCapability, json.RawMessage(`{"block":true}`), 0)
	if err != nil {
		t.Fatalf("second Submit: %v", err)
	}
	waitForState(t, engine, second.InvocationID, receipts.StateRunning)
	cancelled, err := engine.Cancel(second.InvocationID)
	if err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if cancelled.Receipt.ProviderInstance != first.Receipt.ProviderInstance {
		t.Errorf("the cancelled receipt is filed under %q, want the provider %q",
			cancelled.Receipt.ProviderInstance, first.Receipt.ProviderInstance)
	}
	if cancelled.Receipt.PrevReceiptHash != first.Receipt.ReceiptHash {
		t.Error("the cancelled receipt must link to the previous receipt of its provider")
	}
	close(block)
	if err := engine.Store.VerifyChain(); err != nil {
		t.Fatalf("VerifyChain: %v", err)
	}
}

// waitForState waits until the invocation reaches a state, and fails the test
// when it never does.
func waitForState(t *testing.T, engine *Engine, id, want string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		inv, err := engine.Get(id)
		if err != nil {
			t.Fatalf("Get: %v", err)
		}
		if inv.State == want {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatalf("the invocation never reached %q", want)
}
