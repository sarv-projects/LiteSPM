package bridge

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/ipc"
)

// A cold daemon loads the whole catalog before it listens. The handshake and
// tools/list must not wait for it: agents time the handshake out.
func TestHandshakeIsAnsweredWhileTheDaemonIsStillStarting(t *testing.T) {
	shim := NewShim("opencode", nil, nil, nil)
	pending := make(chan *ipc.Client) // never delivers during the handshake
	shim.SetPendingClient(pending)
	ctx := context.Background()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for _, method := range []string{"initialize", "tools/list", "prompts/list"} {
			id := json.RawMessage(`1`)
			resp := shim.HandleRequest(ctx, &ipc.Request{JSONRPC: "2.0", ID: &id, Method: method, Params: json.RawMessage(`{}`)})
			if resp == nil || resp.Error != nil {
				t.Errorf("%s: %+v", method, resp)
			}
		}
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the handshake waited for the daemon")
	}

	// A tool call waits for the connection; a failed connection (nil) gives
	// the standalone error instead of hanging.
	go func() { pending <- nil }()
	res := shim.DispatchTool(ctx, "search_catalog", json.RawMessage(`{"query":"x"}`))
	if !res.IsError {
		t.Fatalf("a failed daemon connection must surface as a tool error: %+v", res)
	}
}
