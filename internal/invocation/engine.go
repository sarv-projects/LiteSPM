// Package invocation implements the invocation engine of ARCH/34 §3: the
// bounded deadline, the per-provider concurrency limit, the queue
// backpressure, the cancellation path, the redaction pass and the bounded
// result every call produces.
//
// The engine owns no registry of its own. The durable invocation registry is
// internal/receipts.Store — there is exactly one in the tree — and the engine
// writes every invocation into it: a queued row when the call is accepted, a
// receipt when it reaches a terminal state.
//
// Limits (by construction, and deliberately not claimed otherwise):
//
//   - A provider that dies mid-call fails the invocation with a typed error
//     and a failed receipt. It is never restarted automatically, and the call
//     is never retried against another provider (ARCH/34 §3, §7).
//   - The result is held in memory for the lifetime of the process. The
//     durable record keeps digests, not payloads (ARCH/34 §6).
package invocation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/sarv-projects/litespm/internal/discover"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/receipts"
)

// Defaults for the engine's limits. A zero Options field takes its default.
const (
	// DefaultMaxConcurrentPerProvider is how many calls one provider serves
	// at the same time.
	DefaultMaxConcurrentPerProvider = 4
	// DefaultMaxQueuedPerProvider is how many calls may wait for a slot
	// before the engine refuses them.
	DefaultMaxQueuedPerProvider = 16
	// DefaultMaxOutputBytes bounds one provider result.
	DefaultMaxOutputBytes = 1 << 20
	// DefaultMaxDeadline bounds one call, queue wait included.
	DefaultMaxDeadline = 60 * time.Second
)

// Invoker performs one capability call. It is the only place the engine
// touches a provider: the engine owns the limits around the call, never the
// call itself.
type Invoker func(ctx context.Context, capabilityID string, arguments json.RawMessage) (Output, error)

// Output is one call's result.
type Output struct {
	Text      string `json:"text"`
	IsError   bool   `json:"isError"`
	Truncated bool   `json:"truncated,omitempty"`
	Digest    string `json:"digest,omitempty"`
	// Stderr is the provider's stderr. It is never part of a result: it may
	// inform the error envelope, after redaction, and it is never returned to
	// a model.
	Stderr string `json:"-"`
}

// Invocation is the registry view the engine returns. It is an alias for
// receipts.Invocation so the tree holds exactly one invocation type.
type Invocation = receipts.Invocation

// Options configures the engine. Every zero field takes its default.
type Options struct {
	// Invoker performs the call. Without one the engine refuses every
	// submission: an engine that cannot call anything must not pretend to.
	Invoker Invoker
	// MaxConcurrentPerProvider bounds the calls one provider serves at the
	// same time (default 4).
	MaxConcurrentPerProvider int
	// MaxQueuedPerProvider bounds the calls waiting for a slot (default 16).
	// A call past the bound is refused with LPSM-PROVIDER-BUSY.
	MaxQueuedPerProvider int
	// MaxOutputBytes bounds one result (default 1 MiB).
	MaxOutputBytes int
	// MaxDeadline bounds one call (default 60s). A caller's longer deadline
	// is clamped to this one.
	MaxDeadline time.Duration
	// Store is the invocation registry the engine writes into. Without one
	// the engine creates an in-memory store, so a caller that forgets it
	// still gets a working engine (with receipts that do not survive a
	// restart).
	Store *receipts.Store
	// Clock reads the current time. It exists so a test can pin the
	// timestamps; the default is time.Now.
	Clock func() time.Time
}

// Engine runs capability calls under the ARCH/34 §3 limits.
type Engine struct {
	invoker Invoker
	// Store is the invocation registry the engine writes into.
	Store *receipts.Store
	clock func() time.Time

	maxConcurrent int
	maxQueued     int
	maxOutput     int
	maxDeadline   time.Duration

	mu      sync.Mutex
	slots   map[string]*providerSlot
	calls   map[string]*call
	results map[string]Output
	// resultOrder is the oldest-first order of the retained results, so the
	// oldest can be dropped when the retention bound is reached.
	resultOrder []string
	errors      map[string]string
}

// maxRetainedResults is how many results the engine keeps in memory. The
// durable record holds digests, not payloads (ARCH/34 §6), so a result that
// nobody reads is dropped rather than kept forever.
const maxRetainedResults = 32

// call is one in-flight invocation.
type call struct {
	cancel context.CancelFunc
	done   chan struct{}
}

// NewEngine builds an engine. A nil Store is replaced by an in-memory one.
func NewEngine(opts Options) *Engine {
	e := &Engine{
		invoker:       opts.Invoker,
		Store:         opts.Store,
		clock:         opts.Clock,
		maxConcurrent: opts.MaxConcurrentPerProvider,
		maxQueued:     opts.MaxQueuedPerProvider,
		maxOutput:     opts.MaxOutputBytes,
		maxDeadline:   opts.MaxDeadline,
		slots:         map[string]*providerSlot{},
		calls:         map[string]*call{},
		results:       map[string]Output{},
		errors:        map[string]string{},
	}
	if e.Store == nil {
		e.Store = mustOpenMemoryStore()
	}
	if e.clock == nil {
		e.clock = time.Now
	}
	if e.maxConcurrent <= 0 {
		e.maxConcurrent = DefaultMaxConcurrentPerProvider
	}
	if e.maxQueued <= 0 {
		e.maxQueued = DefaultMaxQueuedPerProvider
	}
	if e.maxOutput <= 0 {
		e.maxOutput = DefaultMaxOutputBytes
	}
	if e.maxDeadline <= 0 {
		e.maxDeadline = DefaultMaxDeadline
	}
	return e
}

// mustOpenMemoryStore opens the in-memory store. It cannot fail: an empty
// path is memory-only.
func mustOpenMemoryStore() *receipts.Store {
	s, err := receipts.Open("")
	if err != nil {
		// Open("") only fails on a read error, and there is no path to read.
		panic("invocation: the in-memory receipt store could not be opened: " + err.Error())
	}
	return s
}

// Submit accepts a call and returns immediately with the queued invocation.
// The call itself runs on the engine's goroutine.
//
// A provider that is already saturated does not block the caller: the call
// queues behind the calls in flight, and when the queue is full it is refused
// with LPSM-PROVIDER-BUSY.
func (e *Engine) Submit(ctx context.Context, capabilityID string, arguments json.RawMessage, deadline time.Duration) (*receipts.Invocation, error) {
	if e.invoker == nil {
		return nil, fmt.Errorf("LPSM-INVOCATION-NO-INVOKER: the engine has no invoker configured")
	}
	provider := providerKey(capabilityID)
	slot := e.slotFor(provider)

	// The slot is taken without blocking; a call that cannot take one queues.
	held := slot.tryAcquire()
	if !held {
		if !slot.enqueue(e.maxQueued) {
			return nil, fmt.Errorf("LPSM-PROVIDER-BUSY: provider %s has %d in flight and %d queued",
				provider, slot.inFlightCount(), slot.queuedCount())
		}
	}

	id := receipts.NewInvocationID()
	e.Store.RegisterPending(id, capabilityID, provider)

	callCtx, cancel := context.WithTimeout(ctx, e.clampDeadline(deadline))

	// The cancel function is the handle on the in-flight work: the store
	// calls it when the invocation is cancelled, so a cancel reaches the
	// provider call even when it came in through the store alone.
	if err := e.Store.AttachCancel(id, cancel); err != nil {
		cancel()
		return nil, err
	}

	e.mu.Lock()
	e.calls[id] = &call{cancel: cancel, done: make(chan struct{})}
	e.mu.Unlock()

	go e.run(callCtx, id, capabilityID, arguments, provider, slot, held)

	inv, err := e.Store.Get(id)
	if err != nil {
		return nil, err
	}
	return inv, nil
}

// SubmitAndWait submits a call and blocks until it reaches a terminal state.
// It is what the daemon's provider.invoke uses by default: the call is
// synchronous, but it still goes through the engine, so it always leaves a
// receipt behind.
//
// A failed call returns BOTH the invocation and the error: the invocation
// carries the state and the receipt, the error carries the reason.
func (e *Engine) SubmitAndWait(ctx context.Context, capabilityID string, arguments json.RawMessage, deadline time.Duration) (*receipts.Invocation, error) {
	inv, err := e.Submit(ctx, capabilityID, arguments, deadline)
	if err != nil {
		return nil, err
	}
	return e.wait(inv.InvocationID)
}

// Get returns one invocation by id. An unknown id is a typed not-found.
func (e *Engine) Get(id string) (*receipts.Invocation, error) {
	return e.Store.Get(id)
}

// Cancel requests the cancellation of an invocation. It is idempotent: a
// repeated cancel returns the same terminal invocation, and the in-flight
// call is signalled exactly once.
func (e *Engine) Cancel(id string) (*receipts.Invocation, error) {
	// The store flips the state, writes the cancellation receipt and calls
	// the attached cancel function — which cancels the call's context.
	inv, err := e.Store.Cancel(id)
	if err != nil {
		return nil, err
	}
	e.mu.Lock()
	c := e.calls[id]
	e.mu.Unlock()
	if c != nil {
		// The store already signalled through the attached function; doing
		// it again is harmless (a context cancel is idempotent) and covers
		// the case where the attached function was replaced.
		c.cancel()
	}
	return inv, nil
}

// Result returns the result of a completed invocation: the text the provider
// returned (bounded and redacted), the error flag, whether it was truncated
// and its digest.
//
// The durable record keeps a digest, not the payload (ARCH/34 §6), so the
// result lives in memory for the lifetime of the process. The engine keeps a
// bounded number of them: a result that is never read is dropped, so a long
// run cannot grow without limit.
func (e *Engine) Result(id string) (Output, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	out, ok := e.results[id]
	return out, ok
}

// Pending returns every invocation that has not reached a terminal state.
func (e *Engine) Pending() []*receipts.Invocation {
	return e.Store.Pending()
}

// run is the dispatch goroutine of one invocation.
func (e *Engine) run(ctx context.Context, id, capabilityID string, arguments json.RawMessage, provider string, slot *providerSlot, held bool) {
	if !held {
		if !slot.acquire(ctx) {
			// The deadline expired while the call waited for a slot: the
			// invocation never reached the provider.
			e.finishCall(id)
			e.recordTerminal(id, capabilityID, arguments, provider, receipts.OutcomeDeadlineExceeded,
				e.clock(), e.clock(), "", false, "")
			return
		}
	}
	defer slot.release()
	defer e.finishCall(id)

	_ = e.Store.SetState(id, receipts.StateRunning)

	started := e.clock()
	outcome := make(chan callOutcome, 1)
	go func() {
		out, err := e.invoker(ctx, capabilityID, arguments)
		outcome <- callOutcome{out: out, err: err}
	}()

	var res callOutcome
	got := false
	select {
	case res = <-outcome:
		got = true
	case <-ctx.Done():
		select {
		case res = <-outcome:
			// The call returned at the same moment the context ended.
			got = true
		default:
		}
	}

	// The deadline is the engine's own bound, and it wins over a result.
	//
	// A provider that was cancelled by the deadline usually returns right
	// after - it woke up because its context ended - and that "success" is
	// the engine's own cancellation coming back as a result. Recording it
	// would report a call that overran its bound as a call that finished.
	// The old form read the channel first and only then asked whether the
	// context had ended, so which of the two the select happened to take
	// decided the outcome; under the race detector the late result was
	// usually there first, and a call that overran its deadline was
	// recorded as a success.
	//
	// A cancellation is different: the caller's context ended, and a result
	// that arrived with it is real work that got done.
	expired := false
	switch {
	case errors.Is(ctx.Err(), context.DeadlineExceeded):
		expired = true
	case ctx.Err() != nil && !got:
		expired = true
	}
	ended := e.clock()

	if expired {
		// The context ended. A deadline is the engine's own bound; a
		// cancellation is the caller's (or a cancel request) and is recorded
		// as a cancellation, not as an expired deadline.
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			e.recordTerminal(id, capabilityID, arguments, provider, receipts.OutcomeDeadlineExceeded,
				started, ended, "", false,
				fmt.Sprintf("LPSM-INVOCATION-DEADLINE: the invocation exceeded its deadline of %s", e.maxDeadline))
			return
		}
		e.recordCancelled(id)
		return
	}
	if res.err != nil {
		e.recordFailure(id, capabilityID, arguments, provider, started, ended, res)
		return
	}
	e.recordSuccess(id, capabilityID, arguments, provider, started, ended, res.out)
}

// callOutcome is what the invoker returned.
type callOutcome struct {
	out Output
	err error
}

// recordSuccess records a completed call: the result is redacted, bounded and
// kept in memory, and the receipt digests it.
func (e *Engine) recordSuccess(id, capabilityID string, arguments json.RawMessage, provider string, started, ended time.Time, out Output) {
	text, err := Redact(out.Text)
	if err != nil {
		// The redaction pass itself failed: the invocation fails closed and
		// nothing unredacted is persisted.
		e.recordTerminal(id, capabilityID, arguments, provider, receipts.OutcomeFailed,
			started, ended, "", false,
			"LPSM-INVOCATION-REDACTION-FAILED: the provider result could not be redacted")
		return
	}
	stderr, err := Redact(out.Stderr)
	if err != nil {
		e.recordTerminal(id, capabilityID, arguments, provider, receipts.OutcomeFailed,
			started, ended, "", false,
			"LPSM-INVOCATION-REDACTION-FAILED: the provider stderr could not be redacted")
		return
	}
	bounded, truncated, digest := BoundOutput(text, e.maxOutput)
	e.remember(id, Output{
		Text:      bounded,
		IsError:   out.IsError,
		Truncated: truncated,
		Digest:    digest,
		Stderr:    stderr,
	})
	e.recordTerminal(id, capabilityID, arguments, provider, receipts.OutcomeSucceeded,
		started, ended, digest, truncated, "")
}

// recordFailure records a call that failed. The provider's error and its
// stderr are redacted before they are stored or returned; a redaction failure
// fails the invocation closed instead of leaking the raw text.
func (e *Engine) recordFailure(id, capabilityID string, arguments json.RawMessage, provider string, started, ended time.Time, res callOutcome) {
	message, err := Redact(res.err.Error())
	if err != nil {
		e.recordTerminal(id, capabilityID, arguments, provider, receipts.OutcomeFailed,
			started, ended, "", false,
			"LPSM-INVOCATION-REDACTION-FAILED: the provider error could not be redacted")
		return
	}
	stderr, err := Redact(res.out.Stderr)
	if err != nil {
		e.recordTerminal(id, capabilityID, arguments, provider, receipts.OutcomeFailed,
			started, ended, "", false,
			"LPSM-INVOCATION-REDACTION-FAILED: the provider stderr could not be redacted")
		return
	}
	if stderr != "" {
		// The stderr informs the error envelope, redacted. It never becomes
		// part of a result.
		message = fmt.Sprintf("%s (provider stderr: %s)", message, stderr)
	}
	e.remember(id, Output{Stderr: stderr})
	e.recordTerminal(id, capabilityID, arguments, provider, receipts.OutcomeFailed,
		started, ended, "", false, message)
}

// recordTerminal writes the terminal receipt of an invocation.
//
// The store owns the terminal state: when a cancellation landed first, the
// receipt this call wanted to write is refused and the cancelled invocation
// is what the store holds. That is what makes the race between a finishing
// call and a cancel deterministic.
func (e *Engine) recordTerminal(id, capabilityID string, arguments json.RawMessage, provider, outcome string, started, ended time.Time, outDigest string, truncated bool, message string) {
	r := receipts.Receipt{
		InvocationID:     id,
		CapabilityID:     capabilityID,
		ProviderInstance: provider,
		Outcome:          outcome,
		StartedAt:        started,
		EndedAt:          ended,
		InputDigest:      inputDigest(arguments),
		OutputDigest:     outDigest,
		Truncated:        truncated,
	}
	inv, err := e.Store.RecordReceipt(r)
	if err != nil {
		return
	}
	if inv.State != outcome {
		// Someone else owns the terminal state (a cancellation): the receipt
		// this call wanted to write was not recorded, and the call reports
		// the state the store holds.
		return
	}
	if message != "" {
		e.setError(id, message)
	}
}

// recordCancelled records the cancellation of an invocation whose context
// ended before the call did. The store owns the terminal state: when a
// cancellation was already recorded, this changes nothing.
func (e *Engine) recordCancelled(id string) {
	if _, err := e.Store.Cancel(id); err != nil {
		return
	}
}

// setError remembers the failure message of an invocation.
func (e *Engine) setError(id, message string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.errors[id] = message
}

// remember stores the result of an invocation in memory. The number of
// retained results is bounded: the oldest ones are dropped, so a long run
// cannot grow without limit.
func (e *Engine) remember(id string, out Output) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if _, seen := e.results[id]; !seen {
		e.resultOrder = append(e.resultOrder, id)
	}
	e.results[id] = out
	for len(e.resultOrder) > maxRetainedResults {
		oldest := e.resultOrder[0]
		e.resultOrder = e.resultOrder[1:]
		delete(e.results, oldest)
	}
}

// wait blocks until the invocation reaches a terminal state.
func (e *Engine) wait(id string) (*receipts.Invocation, error) {
	ticker := time.NewTicker(2 * time.Millisecond)
	defer ticker.Stop()
	for {
		// Wait for the in-flight call's completion signal before reading the
		// registry. recordTerminal commits the terminal state first and
		// records the failure message second, so a reader that polls the
		// registry can observe "failed, no message" in between and used to
		// report that as a success — a false pass in exactly the calls whose
		// job is to report a refusal. finishCall closes done only after
		// recordTerminal has returned, so this orders the two writes.
		e.mu.Lock()
		c := e.calls[id]
		e.mu.Unlock()
		if c != nil {
			select {
			case <-c.done:
			case <-ticker.C:
			}
			continue
		}

		inv, err := e.Store.Get(id)
		if err != nil {
			return nil, err
		}
		if !isTerminal(inv.State) {
			<-ticker.C
			continue
		}
		if msg := e.errorMessage(id); msg != "" {
			return inv, fmt.Errorf("%s", msg)
		}
		if inv.State == receipts.StateCancelled {
			return inv, fmt.Errorf("LPSM-INVOCATION-CANCELLED: the invocation was cancelled")
		}
		// Defence in depth: a terminal state other than success must never
		// surface as a success, even if a future writer forgets the reason.
		if inv.State != receipts.StateSucceeded {
			return inv, fmt.Errorf("LPSM-INVOCATION-UNEXPLAINED: the invocation ended in state %q without a recorded reason", inv.State)
		}
		return inv, nil
	}
}

// errorMessage returns the failure message of an invocation, if it has one.
func (e *Engine) errorMessage(id string) string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.errors[id]
}

// finishCall closes the call's completion signal and forgets it.
func (e *Engine) finishCall(id string) {
	e.mu.Lock()
	c := e.calls[id]
	delete(e.calls, id)
	e.mu.Unlock()
	if c != nil {
		close(c.done)
	}
}

// slotFor returns the concurrency slot of one provider.
func (e *Engine) slotFor(provider string) *providerSlot {
	e.mu.Lock()
	defer e.mu.Unlock()
	slot, ok := e.slots[provider]
	if !ok {
		slot = newProviderSlot(e.maxConcurrent)
		e.slots[provider] = slot
	}
	return slot
}

// clampDeadline bounds a requested deadline to the engine's maximum. A
// request of zero (or less) uses the maximum.
func (e *Engine) clampDeadline(requested time.Duration) time.Duration {
	if requested <= 0 || requested > e.maxDeadline {
		return e.maxDeadline
	}
	return requested
}

// providerKey is the concurrency key of a call: the provider that serves it.
// A capability id is <install>/<component>/<tool>, so the component names
// the provider. An id that does not parse falls back to the whole id, which
// keeps unrelated capabilities from sharing a limit.
func providerKey(capabilityID string) string {
	if _, installID, component, _, err := domain.ParseCapabilityID(capabilityID); err == nil {
		return discover.ProviderIDFor(string(installID), component)
	}
	return "prov_unparsed_" + capabilityID
}

// inputDigest is the digest of the canonicalised arguments.
func inputDigest(arguments json.RawMessage) string {
	return receipts.DigestOf(canonicalArguments(arguments))
}

// canonicalArguments returns the canonical JSON form of the arguments: the
// same arguments written in a different key order digest the same.
func canonicalArguments(arguments json.RawMessage) []byte {
	if len(arguments) == 0 {
		return []byte("null")
	}
	var value any
	if err := json.Unmarshal(arguments, &value); err != nil {
		return arguments
	}
	b, err := json.Marshal(value)
	if err != nil {
		return arguments
	}
	return b
}

// isTerminal reports whether a state is one an invocation never leaves.
func isTerminal(state string) bool {
	switch state {
	case receipts.StateSucceeded, receipts.StateFailed, receipts.StateCancelled, receipts.StateDeadlineExceeded:
		return true
	}
	return false
}

// providerSlot is one provider's concurrency budget: a semaphore of slots and
// the number of calls waiting for one.
type providerSlot struct {
	sem chan struct{}

	mu       sync.Mutex
	queued   int
	inFlight int
}

// newProviderSlot builds a slot with maxConcurrent slots.
func newProviderSlot(maxConcurrent int) *providerSlot {
	return &providerSlot{sem: make(chan struct{}, maxConcurrent)}
}

// tryAcquire takes a slot without blocking. It reports whether one was free.
func (s *providerSlot) tryAcquire() bool {
	select {
	case s.sem <- struct{}{}:
		s.mu.Lock()
		s.inFlight++
		s.mu.Unlock()
		return true
	default:
		return false
	}
}

// enqueue books a place in the queue. It reports false when the queue is full.
func (s *providerSlot) enqueue(maxQueued int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.queued >= maxQueued {
		return false
	}
	s.queued++
	return true
}

// acquire waits for a slot and takes it. It reports false when the context
// ended first — a call that waited past its deadline never runs.
func (s *providerSlot) acquire(ctx context.Context) bool {
	select {
	case s.sem <- struct{}{}:
		s.mu.Lock()
		s.queued--
		s.inFlight++
		s.mu.Unlock()
		return true
	case <-ctx.Done():
		s.mu.Lock()
		s.queued--
		s.mu.Unlock()
		return false
	}
}

// release gives the slot back.
func (s *providerSlot) release() {
	s.mu.Lock()
	s.inFlight--
	s.mu.Unlock()
	<-s.sem
}

// inFlightCount is the number of calls running right now.
func (s *providerSlot) inFlightCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.inFlight
}

// queuedCount is the number of calls waiting for a slot.
func (s *providerSlot) queuedCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.queued
}
