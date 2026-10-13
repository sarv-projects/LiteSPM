package mcpclient

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestLiveStreamableHTTP_RealServer exercises the modern streamable-http
// client against a real, publicly reachable MCP server.
//
// It is opt-in (LITESPM_LIVE_MCP=1) because it needs network egress, and CI
// must not depend on a third party's uptime. The hermetic
// TestModern2026_StreamableHTTP is the primary gate: its fake server now
// behaves like a strict one and rejects a top-level _meta with -32600 and
// refuses a request whose _meta lacks the namespaced envelope keys.
//
// The distinction matters, because that fake server is exactly what let the
// original bug through: it happily decoded a top-level _meta that every
// real strict server refused, so the suite stayed green while
// `litespm capabilities refresh` could not probe a single streamable-http
// endpoint. This test exists to keep the mock and reality from drifting apart
// again. It ran against https://mcp.context7.com/mcp when the fix landed and
// returned 2 tools.
func TestLiveStreamableHTTP_RealServer(t *testing.T) {
	if os.Getenv("LITESPM_LIVE_MCP") == "" {
		t.Skip("set LITESPM_LIVE_MCP=1 to probe a real streamable-http server")
	}
	endpoint := os.Getenv("LITESPM_LIVE_MCP_ENDPOINT")
	if endpoint == "" {
		endpoint = "https://mcp.context7.com/mcp"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	sess, err := ConnectStreamableHTTP(ctx, endpoint, nil, nil)
	if err != nil {
		t.Fatalf("ConnectStreamableHTTP(%s): %v", endpoint, err)
	}

	tools, err := sess.ListTools(ctx)
	if err != nil {
		t.Fatalf("ListTools against %s: %v", endpoint, err)
	}
	if len(tools) == 0 {
		t.Fatalf("%s exposed no tools; the handshake did not really succeed", endpoint)
	}
	t.Logf("%s exposed %d tools", endpoint, len(tools))
}
