package catalog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
)

func TestNewClientUsesDefaultTimeout(t *testing.T) {
	c := NewClient("https://registry.invalid", t.TempDir(), nil)
	if c.httpClient.Timeout != 30*time.Second {
		t.Errorf("default client timeout = %v, want 30s", c.httpClient.Timeout)
	}
	if c.httpClient.CheckRedirect == nil {
		t.Error("default client must carry the redirect policy")
	}
}

func TestNewClientWithTimeoutAppliesConfiguredBound(t *testing.T) {
	c := NewClientWithTimeout("https://registry.invalid", t.TempDir(), 7*time.Second, nil)
	if c.httpClient.Timeout != 7*time.Second {
		t.Errorf("client timeout = %v, want the configured 7s", c.httpClient.Timeout)
	}
	if c.httpClient.CheckRedirect == nil {
		t.Error("configured client must still carry the redirect policy")
	}
}

func TestNewClientWithTimeoutNonPositiveFallsBackToDefault(t *testing.T) {
	c := NewClientWithTimeout("https://registry.invalid", t.TempDir(), 0, nil)
	if c.httpClient.Timeout != 30*time.Second {
		t.Errorf("timeout 0 must select the compiled default, got %v", c.httpClient.Timeout)
	}
}

// A caller-supplied transport owns its own timeout; the constructor only
// fills in the redirect policy it is missing.
func TestNewClientWithTimeoutCustomClientKeepsItsTimeout(t *testing.T) {
	custom := &http.Client{Timeout: 5 * time.Second}
	c := NewClientWithTimeout("https://registry.invalid", t.TempDir(), time.Second, custom)
	if c.httpClient.Timeout != 5*time.Second {
		t.Errorf("custom client timeout was overwritten: %v", c.httpClient.Timeout)
	}
	if c.httpClient.CheckRedirect == nil {
		t.Error("redirect policy must be attached to a custom client that has none")
	}
}

// The configured bound has to actually stop a hung origin, not merely be
// recorded on the struct.
func TestConfiguredTimeoutBoundsFetch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(600 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewClientWithTimeout(srv.URL, t.TempDir(), 100*time.Millisecond, nil)
	start := time.Now()
	_, err := c.FetchCurrent(context.Background())
	if err == nil {
		t.Fatal("expected the fetch to fail on the configured timeout")
	}
	if elapsed := time.Since(start); elapsed > 500*time.Millisecond {
		t.Errorf("fetch ran %v, well beyond the 100ms bound", elapsed)
	}
}

// A shard is up to 20 MiB; the metadata bound is 30s. The two budgets are
// separate, and an explicitly configured timeout still governs both — the
// operator asked for it.
func TestShardDownloadsCarryTheirOwnBudget(t *testing.T) {
	unconfigured := NewClientWithTimeout("https://registry.invalid", t.TempDir(), 0, nil)
	if got := unconfigured.httpClient.Timeout; got != defaultCatalogTimeout {
		t.Errorf("metadata budget = %v, want %v", got, defaultCatalogTimeout)
	}
	if got := unconfigured.shardClient.Timeout; got != defaultShardTimeout {
		t.Errorf("shard budget = %v, want %v", got, defaultShardTimeout)
	}
	if defaultShardTimeout <= defaultCatalogTimeout {
		t.Errorf("the shard budget (%v) must exceed the metadata budget (%v)",
			defaultShardTimeout, defaultCatalogTimeout)
	}

	configured := NewClientWithTimeout("https://registry.invalid", t.TempDir(), 7*time.Second, nil)
	if got := configured.httpClient.Timeout; got != 7*time.Second {
		t.Errorf("configured metadata budget = %v, want 7s", got)
	}
	if got := configured.shardClient.Timeout; got != 7*time.Second {
		t.Errorf("configured shard budget = %v, want 7s — a configured timeout governs shards too", got)
	}
}

// A resolver blip is infrastructure, not a policy decision: the same lookup may
// succeed a second later. The client repeats a transient failure and does not
// repeat a permanent one.
type transientRT struct {
	attempts int
	fail     int
}

func (t *transientRT) RoundTrip(req *http.Request) (*http.Response, error) {
	t.attempts++
	if t.attempts <= t.fail {
		return nil, domain.ErrEgressTransient("catalog.invalid", "DNS resolution failed: i/o timeout")
	}
	return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Header: http.Header{}}, nil
}

func TestCatalogRequestRepeatsATransientFailure(t *testing.T) {
	rt := &transientRT{fail: 2}
	client := &http.Client{Transport: rt}
	req, err := http.NewRequest(http.MethodGet, "https://catalog.invalid/v1/current.json", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := doCatalogRequest(context.Background(), client, req)
	if err != nil {
		t.Fatalf("a transient failure must be retried, got: %v", err)
	}
	defer resp.Body.Close()
	if rt.attempts != 3 {
		t.Errorf("attempts = %d, want 3 (two transient failures, then success)", rt.attempts)
	}
}

func TestCatalogRequestDoesNotRepeatAPermanentFailure(t *testing.T) {
	rt := &permanentRT{}
	client := &http.Client{Transport: rt}
	req, err := http.NewRequest(http.MethodGet, "https://catalog.invalid/v1/current.json", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := doCatalogRequest(context.Background(), client, req); err == nil {
		t.Fatal("expected the permanent refusal to be returned")
	}
	if rt.attempts != 1 {
		t.Errorf("attempts = %d, want 1 — a policy refusal is not retried", rt.attempts)
	}
}

// permanentRT always refuses the way the guard refuses a private destination.
type permanentRT struct{ attempts int }

func (p *permanentRT) RoundTrip(req *http.Request) (*http.Response, error) {
	p.attempts++
	return nil, domain.ErrEgressBlocked("catalog.invalid", "host resolves into a private range")
}
