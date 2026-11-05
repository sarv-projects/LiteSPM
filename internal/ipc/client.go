package ipc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/sarv-projects/litespm/internal/buildinfo"
)

// Client represents a connected JSON-RPC 2.0 client session.
type Client struct {
	conn    net.Conn
	codec   *LineDelimitedCodec
	seq     uint64
	pending map[string]chan *Response
	mu      sync.Mutex
	done    chan struct{}

	// connMu guards the connection and codec, which a transport failure can
	// replace while calls are in flight.
	connMu      sync.Mutex
	reconnectMu sync.Mutex
	endpoint    string
	redial      func() (net.Conn, error)

	// The daemon refuses every method until daemon.handshake succeeds on the
	// connection. The client performs it lazily before its first call, using
	// the identity set by SetIdentity ("cli" by default).
	hsMu       sync.Mutex
	handshaken bool
	kind       string
	hostID     string
}

// SetIdentity sets the clientKind/hostId sent in the automatic handshake. Call
// before the first Call.
func (c *Client) SetIdentity(clientKind, hostID string) {
	c.hsMu.Lock()
	defer c.hsMu.Unlock()
	c.kind, c.hostID = clientKind, hostID
}

// Dial connects to a LiteSPM daemon IPC endpoint.
func Dial(endpoint string) (*Client, error) {
	conn, err := DialIPC(endpoint)
	if err != nil {
		return nil, err
	}

	c := &Client{
		conn:     conn,
		codec:    NewLineDelimitedCodec(conn),
		pending:  make(map[string]chan *Response),
		done:     make(chan struct{}),
		endpoint: endpoint,
		redial: func() (net.Conn, error) {
			return DialIPC(endpoint)
		},
	}

	go c.readLoop(c.codec)
	return c, nil
}

// NewClientFromConn wraps an existing net.Conn into a Client (useful for in-memory or pipe testing).
func NewClientFromConn(conn net.Conn) *Client {
	c := &Client{
		conn:    conn,
		codec:   NewLineDelimitedCodec(conn),
		pending: make(map[string]chan *Response),
		done:    make(chan struct{}),
	}
	go c.readLoop(c.codec)
	return c
}

func (c *Client) readLoop(codec *LineDelimitedCodec) {
	for {
		resp, err := codec.ReadResponse()
		if err != nil {
			// A read loop from a replaced connection must not fail calls
			// belonging to the new one.
			c.connMu.Lock()
			current := c.codec == codec
			c.connMu.Unlock()
			if current {
				c.closePending(err)
			}
			return
		}

		if resp.ID != nil {
			idStr := string(*resp.ID)
			c.mu.Lock()
			ch, ok := c.pending[idStr]
			if ok {
				delete(c.pending, idStr)
			}
			c.mu.Unlock()

			if ok {
				ch <- resp
			}
		}
	}
}

func (c *Client) closePending(err error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, ch := range c.pending {
		ch <- &Response{
			JSONRPC: "2.0",
			Error: &RPCError{
				Code:    CodeInternalError,
				Message: fmt.Sprintf("connection closed: %v", err),
			},
		}
	}
	c.pending = make(map[string]chan *Response)
}

// writeRequest writes through the current codec without holding connMu while
// the network write blocks.
func (c *Client) writeRequest(req *Request) error {
	c.connMu.Lock()
	codec := c.codec
	c.connMu.Unlock()
	return codec.WriteRequest(req)
}

// reconnect replaces a dead daemon connection with a fresh one. The daemon
// keeps no per-connection state beyond the handshake, so a new connection is
// the whole recovery. Old calls are left to fail; a retry is the caller's
// decision (see Call).
func (c *Client) reconnect() error {
	c.reconnectMu.Lock()
	defer c.reconnectMu.Unlock()
	c.connMu.Lock()
	redial := c.redial
	old := c.conn
	c.connMu.Unlock()
	if redial == nil {
		return errors.New("client has no dialer to reconnect with")
	}
	conn, err := redial()
	if err != nil {
		return err
	}
	codec := NewLineDelimitedCodec(conn)
	c.connMu.Lock()
	c.conn = conn
	c.codec = codec
	c.connMu.Unlock()
	if old != nil {
		_ = old.Close()
	}
	c.hsMu.Lock()
	c.handshaken = false
	c.hsMu.Unlock()
	go c.readLoop(codec)
	return nil
}

// isTransportError reports whether an error means the socket is gone rather
// than the daemon refusing the request.
func isTransportError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrClosedPipe) || errors.Is(err, net.ErrClosed) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "broken pipe") ||
		strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "connection closed") ||
		strings.Contains(msg, "use of closed network connection") ||
		strings.Contains(msg, "unexpected eof")
}

// retryableMethod is the read-only subset that can be replayed after a
// transport failure without risking a duplicate write. A handshake failure is
// always safe to retry (the method was never sent); a post-handshake failure
// is not.
func retryableMethod(method string) bool {
	switch method {
	case "daemon.status", "daemon.health", "catalog.search", "catalog.get_item",
		"tools.list", "capabilities.search", "capabilities.describe",
		"skills.load_body", "skills.read_resource", "invocation.get":
		return true
	}
	return false
}

// Handshake performs the mandatory initial handshake with the daemon.
func (c *Client) Handshake(ctx context.Context, clientKind, hostID string) (*HandshakeResult, error) {
	params := HandshakeParams{
		ClientVersion: buildinfo.Version,
		ClientKind:    clientKind,
		HostID:        hostID,
		PID:           os.Getpid(),
	}

	var res HandshakeResult
	if err := c.call(ctx, "daemon.handshake", params, &res); err != nil {
		return nil, fmt.Errorf("handshake failed: %w", err)
	}
	c.hsMu.Lock()
	c.handshaken = true
	c.hsMu.Unlock()
	return &res, nil
}

// ensureHandshake performs the handshake once, before the first real call.
func (c *Client) ensureHandshake(ctx context.Context) error {
	c.hsMu.Lock()
	if c.handshaken {
		c.hsMu.Unlock()
		return nil
	}
	kind, hostID := c.kind, c.hostID
	c.hsMu.Unlock()
	if kind == "" {
		kind = "cli"
	}
	_, err := c.Handshake(ctx, kind, hostID)
	return err
}

// Call sends a JSON-RPC request and blocks until a response is received or
// ctx is cancelled. The connection handshake is performed first if it has not
// happened yet.
func (c *Client) Call(ctx context.Context, method string, params any, result any) error {
	if method != "daemon.handshake" {
		if err := c.ensureHandshake(ctx); err != nil {
			// The handshake failed before the real method was sent, so a
			// reconnect plus one more handshake cannot duplicate anything.
			if isTransportError(err) {
				if rerr := c.reconnect(); rerr == nil {
					if herr := c.ensureHandshake(ctx); herr == nil {
						return c.call(ctx, method, params, result)
					}
				}
			}
			return err
		}
	}
	err := c.call(ctx, method, params, result)
	if err != nil && isTransportError(err) && retryableMethod(method) {
		if rerr := c.reconnect(); rerr == nil {
			if herr := c.ensureHandshake(ctx); herr == nil {
				return c.call(ctx, method, params, result)
			}
		}
	}
	return err
}

func (c *Client) call(ctx context.Context, method string, params any, result any) error {
	seq := atomic.AddUint64(&c.seq, 1)
	idRaw := json.RawMessage(fmt.Sprintf("%d", seq))
	idStr := string(idRaw)

	var paramsRaw json.RawMessage
	if params != nil {
		bytes, err := json.Marshal(params)
		if err != nil {
			return fmt.Errorf("failed to marshal params: %w", err)
		}
		paramsRaw = bytes
	}

	req := &Request{
		JSONRPC: "2.0",
		ID:      &idRaw,
		Method:  method,
		Params:  paramsRaw,
	}

	ch := make(chan *Response, 1)
	c.mu.Lock()
	c.pending[idStr] = ch
	c.mu.Unlock()

	if err := c.writeRequest(req); err != nil {
		c.mu.Lock()
		delete(c.pending, idStr)
		c.mu.Unlock()
		return fmt.Errorf("failed to write request: %w", err)
	}

	select {
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.pending, idStr)
		c.mu.Unlock()

		// Send cancellation notification
		_ = c.Notify("$/cancelRequest", CancelParams{ID: idRaw})
		return ctx.Err()

	case resp := <-ch:
		if resp.Error != nil {
			return resp.Error
		}
		if result != nil && len(resp.Result) > 0 {
			if err := json.Unmarshal(resp.Result, result); err != nil {
				return fmt.Errorf("failed to unmarshal result: %w", err)
			}
		}
		return nil
	}
}

// Notify sends a JSON-RPC notification (no ID, no response expected).
func (c *Client) Notify(method string, params any) error {
	var paramsRaw json.RawMessage
	if params != nil {
		bytes, err := json.Marshal(params)
		if err != nil {
			return err
		}
		paramsRaw = bytes
	}

	req := &Request{
		JSONRPC: "2.0",
		Method:  method,
		Params:  paramsRaw,
	}

	return c.writeRequest(req)
}

// Close closes the client connection.
func (c *Client) Close() error {
	return c.conn.Close()
}
