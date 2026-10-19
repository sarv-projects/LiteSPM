package bridge

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/ipc"
)

// callTool calls one Bridge tool and returns the tool result.
func callTool(t *testing.T, shim *Shim, name string, args map[string]any) MCPToolResult {
	t.Helper()
	params, err := json.Marshal(map[string]any{"name": name, "arguments": args})
	if err != nil {
		t.Fatalf("marshal the tool call: %v", err)
	}
	idRaw := json.RawMessage(`1`)
	resp := shim.HandleRequest(context.Background(), &ipc.Request{
		JSONRPC: "2.0",
		ID:      &idRaw,
		Method:  "tools/call",
		Params:  params,
	})
	if resp == nil {
		t.Fatalf("%s returned no response", name)
	}
	var result MCPToolResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	return result
}

// get_invocation forwards to the daemon: the invocation the daemon answers
// with is what the model sees, and the id the model sent is the id the daemon
// received. The Bridge never invents an invocation of its own.
func TestGetInvocationToolForwardsToTheDaemon(t *testing.T) {
	var gotID string
	shim := newDaemonBackedShim(t, map[string]ipc.HandlerFunc{
		"invocation.get": func(ctx context.Context, params json.RawMessage) (any, *ipc.RPCError) {
			var req struct {
				InvocationID string `json:"invocationId"`
			}
			if err := json.Unmarshal(params, &req); err != nil {
				return nil, &ipc.RPCError{Code: ipc.CodeInvalidParams, Message: err.Error()}
			}
			gotID = req.InvocationID
			return map[string]any{
				"invocationId": req.InvocationID,
				"state":        "succeeded",
				"receipt": map[string]any{
					"receiptHash": "sha256:abc123",
					"outcome":     "succeeded",
				},
			}, nil
		},
	})

	result := callTool(t, shim, "get_invocation", map[string]any{"invocationId": "invocation_abc"})
	if result.IsError {
		t.Fatalf("get_invocation failed: %s", result.Content[0].Text)
	}
	if gotID != "invocation_abc" {
		t.Errorf("the daemon received %q, want %q", gotID, "invocation_abc")
	}
	text := result.Content[0].Text
	if !strings.Contains(text, "invocation_abc") {
		t.Errorf("the tool output does not name the invocation: %s", text)
	}
	if !strings.Contains(text, "sha256:abc123") {
		t.Errorf("the tool output does not carry the receipt hash: %s", text)
	}
}

// cancel_invocation forwards to the daemon too, and renders the invocation
// the daemon cancelled — not a local claim that it was cancelled.
func TestCancelInvocationToolForwardsToTheDaemon(t *testing.T) {
	var gotID string
	shim := newDaemonBackedShim(t, map[string]ipc.HandlerFunc{
		"invocation.cancel": func(ctx context.Context, params json.RawMessage) (any, *ipc.RPCError) {
			var req struct {
				InvocationID string `json:"invocationId"`
			}
			if err := json.Unmarshal(params, &req); err != nil {
				return nil, &ipc.RPCError{Code: ipc.CodeInvalidParams, Message: err.Error()}
			}
			gotID = req.InvocationID
			return map[string]any{
				"invocationId": req.InvocationID,
				"state":        "cancelled",
				"cancelled":    true,
				"receipt": map[string]any{
					"receiptHash": "sha256:def456",
					"outcome":     "cancelled",
				},
			}, nil
		},
	})

	result := callTool(t, shim, "cancel_invocation", map[string]any{"invocationId": "invocation_xyz"})
	if result.IsError {
		t.Fatalf("cancel_invocation failed: %s", result.Content[0].Text)
	}
	if gotID != "invocation_xyz" {
		t.Errorf("the daemon received %q, want %q", gotID, "invocation_xyz")
	}
	text := result.Content[0].Text
	if !strings.Contains(text, "invocation_xyz") {
		t.Errorf("the tool output does not name the invocation: %s", text)
	}
	if !strings.Contains(text, "cancelled") {
		t.Errorf("the tool output does not report the state: %s", text)
	}
	if !strings.Contains(text, "sha256:def456") {
		t.Errorf("the tool output does not carry the receipt hash: %s", text)
	}
}
