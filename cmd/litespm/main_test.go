package main

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/discover"
	"github.com/sarv-projects/litespm/internal/doctor"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/install"
	"github.com/sarv-projects/litespm/internal/ipc"
	"github.com/sarv-projects/litespm/internal/policy"
	"github.com/sarv-projects/litespm/internal/provider"
	"github.com/sarv-projects/litespm/internal/secrets"
	"github.com/sarv-projects/litespm/internal/state"
	"github.com/sarv-projects/litespm/internal/update"
)

const testListingID = "mcp:builtin:mcp-registry:demo-tool"

// pipeListener hands one pre-connected in-memory pipe to an ipc.Server so the
// tests drive the real server code path without opening sockets.
type pipeListener struct {
	conns chan net.Conn
	once  sync.Once
}

func newPipeListener() *pipeListener {
	return &pipeListener{conns: make(chan net.Conn, 1)}
}

func (l *pipeListener) Accept() (net.Conn, error) {
	conn, ok := <-l.conns
	if !ok {
		return nil, net.ErrClosed
	}
	return conn, nil
}

func (l *pipeListener) Close() error {
	l.once.Do(func() { close(l.conns) })
	return nil
}

func (l *pipeListener) Addr() net.Addr { return pipeAddr{} }

type pipeAddr struct{}

func (pipeAddr) Network() string { return "pipe" }
func (pipeAddr) String() string  { return "pipe" }

type harness struct {
	paths      *config.PlatformPaths
	db         *state.DB
	engine     *install.Engine
	supervisor *provider.Supervisor
	client     *ipc.Client
	catClient  *catalog.Client
	// store is the vault the daemon was wired with. It is the same object
	// registerCoreHandlers received, so a test can put a credential in it and
	// watch the daemon's own launch path resolve it.
	store *secrets.MemorySecretStore
}

// newHarness builds the daemon's real handler set over an in-memory pipe.
func newHarness(t *testing.T) *harness {
	t.Helper()
	return newHarnessWith(t, nil)
}

// newHarnessWith is newHarness plus extra catalog listings, so tests can drive
// install.execute for kinds other than the seeded MCP listing.
func newHarnessWith(t *testing.T, extra []*domain.Listing) *harness {
	t.Helper()
	return newHarnessWithCatalog(t, extra, nil)
}

// newHarnessWithCatalog is newHarnessWith plus the published version records
// those listings resolve against. The plan builder and RuntimeForListing read
// the version record (never the listing) for the launch line, so a fixture
// listing with a remote (URL) runtime needs its record seeded here — the
// catalog side of every test stays fixture-driven, with no network.
func newHarnessWithCatalog(t *testing.T, extra []*domain.Listing, extraRecords []*domain.VersionRecord) *harness {
	t.Helper()
	return newHarnessFull(t, extra, extraRecords, nil)
}

// newHarnessFull is newHarnessWithCatalog plus a beforeRegister hook: it runs
// after the platform paths exist but before registerCoreHandlers wires the
// handlers, so a test can plant data (a deny-rules file, for example) that the
// handler wiring reads at construction time.
func newHarnessFull(t *testing.T, extra []*domain.Listing, extraRecords []*domain.VersionRecord, beforeRegister func(paths *config.PlatformPaths)) *harness {
	t.Helper()
	tempDir := t.TempDir()
	paths := &config.PlatformPaths{
		ConfigRoot:  filepath.Join(tempDir, "config"),
		DataRoot:    filepath.Join(tempDir, "data"),
		RuntimeRoot: filepath.Join(tempDir, "run"),
	}
	if err := paths.EnsureDirectories(); err != nil {
		t.Fatalf("EnsureDirectories failed: %v", err)
	}

	db, err := state.Open(paths.StateDBPath())
	if err != nil {
		t.Fatalf("state.Open failed: %v", err)
	}

	engine, err := install.NewEngine(db, paths.CASPath(), paths.StagingPath())
	if err != nil {
		t.Fatalf("install.NewEngine failed: %v", err)
	}

	catClient := catalog.NewClient("https://registry.invalid", filepath.Join(tempDir, "catalog"), nil)
	seed := []*domain.Listing{{
		SchemaVersion: 2,
		ID:            testListingID,
		Kind:          domain.KindMCP,
		Name:          "demo-tool",
		Summary:       "demo listing for plan tests",
		// metadata_verified so the plan/install error paths under test are
		// reached; discovery_only rows are refused earlier (see
		// TestInstallExecuteRefusesDiscoveryOnly).
		Installability: domain.InstallabilityMetadataVerified,
		Versions: []domain.VersionSummary{
			{Version: "1.0.0", ImmutableRef: "git:1111111111111111111111111111111111111111"},
			{Version: "2.0.0", ImmutableRef: "git:2222222222222222222222222222222222222222"},
		},
	}}
	seed = append(seed, extra...)
	catClient.IndexListings(seed)
	versionRecords := []*domain.VersionRecord{
		{
			ListingID: testListingID,
			Version:   "1.0.0",
			Components: []domain.Component{{Runtime: &domain.RuntimeDescriptor{
				Type: "stdio", Command: "npx", Args: []string{"-y", "demo-tool"},
			}}},
		},
		{
			ListingID: testListingID,
			Version:   "2.0.0",
			Components: []domain.Component{{Runtime: &domain.RuntimeDescriptor{
				Type: "stdio", Command: "npx", Args: []string{"-y", "demo-tool@2"},
			}}},
		},
	}
	versionRecords = append(versionRecords, extraRecords...)
	catClient.IndexVersionRecords(versionRecords)

	store, err := secrets.NewMemorySecretStore()
	if err != nil {
		t.Fatalf("NewMemorySecretStore failed: %v", err)
	}
	supervisor := provider.NewSupervisor()

	server := ipc.NewServer("test-daemon", ProtocolVersion)
	if beforeRegister != nil {
		beforeRegister(paths)
	}
	// nil config → the secure compiled policy defaults, exactly as a daemon
	// with unreadable configuration would run.
	if err := registerCoreHandlers(server, db, catClient, engine, paths, store, supervisor, policyDefaultsFrom(nil)); err != nil {
		t.Fatalf("registerCoreHandlers failed: %v", err)
	}

	listener := newPipeListener()
	serveDone := make(chan error, 1)
	go func() { serveDone <- server.Serve(listener) }()

	serverConn, clientConn := net.Pipe()
	listener.conns <- serverConn
	client := ipc.NewClientFromConn(clientConn)

	h := &harness{paths: paths, db: db, engine: engine, supervisor: supervisor, client: client, catClient: catClient, store: store}
	t.Cleanup(func() {
		supervisor.StopAll(context.Background())
		_ = client.Close()
		_ = listener.Close()
		_ = server.Stop()
		<-serveDone
		_ = db.Close()
	})
	return h
}

func rpcCode(t *testing.T, err error) int {
	t.Helper()
	if err == nil {
		t.Fatal("expected an RPC error, got nil")
	}
	var rpcErr *ipc.RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *ipc.RPCError, got %T: %v", err, err)
	}
	return rpcErr.Code
}

func TestParseInstallFlags(t *testing.T) {
	cases := []struct {
		name     string
		args     []string
		wantErr  bool
		wantHelp bool
		check    func(t *testing.T, f installFlags)
	}{
		{name: "listing only", args: []string{"mcp:builtin:mcp-registry:pg"},
			check: func(t *testing.T, f installFlags) {
				if f.listingID != "mcp:builtin:mcp-registry:pg" || f.scope != domain.ScopeUser {
					t.Errorf("unexpected flags: %+v", f)
				}
			}},
		{name: "all supported flags", args: []string{"--version", "1.2.3", "--scope", "project", "some:listing:id"},
			check: func(t *testing.T, f installFlags) {
				if f.version != "1.2.3" || f.scope != domain.ScopeProject || f.listingID != "some:listing:id" {
					t.Errorf("unexpected flags: %+v", f)
				}
			}},
		{name: "help", args: []string{"--help"}, wantHelp: true},
		{name: "short help", args: []string{"-h"}, wantHelp: true},
		{name: "missing listing", args: nil, wantErr: true},
		{name: "only flags", args: []string{"--scope", "user"}, wantErr: true},
		{name: "unknown flag", args: []string{"listing", "--nope"}, wantErr: true},
		{name: "invalid scope", args: []string{"--scope", "global", "listing"}, wantErr: true},
		{name: "missing scope value", args: []string{"listing", "--scope"}, wantErr: true},
		{name: "missing version value", args: []string{"listing", "--version"}, wantErr: true},
		{name: "workspace implies project scope", args: []string{"listing", "--workspace", "/tmp/proj"},
			check: func(t *testing.T, f installFlags) {
				if f.workspace != "/tmp/proj" {
					t.Errorf("workspace = %q, want /tmp/proj", f.workspace)
				}
				if f.scope != domain.ScopeProject {
					t.Errorf("scope = %q, want %q (--workspace implies project)", f.scope, domain.ScopeProject)
				}
			}},
		{name: "short workspace flag implies project scope", args: []string{"listing", "-w", "/tmp/proj"},
			check: func(t *testing.T, f installFlags) {
				if f.workspace != "/tmp/proj" || f.scope != domain.ScopeProject {
					t.Errorf("unexpected flags: %+v", f)
				}
			}},
		{name: "explicit project scope with workspace", args: []string{"--scope", "project", "--workspace", "/tmp/proj", "listing"},
			check: func(t *testing.T, f installFlags) {
				if f.scope != domain.ScopeProject || f.workspace != "/tmp/proj" {
					t.Errorf("unexpected flags: %+v", f)
				}
			}},
		{name: "workspace contradicts explicit user scope", args: []string{"--scope", "user", "--workspace", "/tmp/proj", "listing"}, wantErr: true},
		{name: "user scope after workspace contradicts", args: []string{"--workspace", "/tmp/proj", "--scope", "user", "listing"}, wantErr: true},
		{name: "missing workspace value", args: []string{"listing", "--workspace"}, wantErr: true},
		{name: "empty workspace value", args: []string{"listing", "--workspace", ""}, wantErr: true},
		{name: "extra positional", args: []string{"one", "two"}, wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			flags, err := parseInstallFlags(tc.args)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected an error, got flags %+v", flags)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if flags.showHelp != tc.wantHelp {
				t.Errorf("showHelp=%t, want %t", flags.showHelp, tc.wantHelp)
			}
			if tc.check != nil {
				tc.check(t, flags)
			}
		})
	}
}

func TestNewPlanID(t *testing.T) {
	pattern := regexp.MustCompile(`^plan_[0-9A-Za-z]{26}$`)
	seen := make(map[string]bool, 200)
	for i := 0; i < 200; i++ {
		id, err := newPlanID()
		if err != nil {
			t.Fatalf("newPlanID failed: %v", err)
		}
		if !pattern.MatchString(id) {
			t.Fatalf("plan id %q does not match the schema pattern", id)
		}
		if seen[id] {
			t.Fatalf("duplicate plan id %q", id)
		}
		seen[id] = true
	}
}

func TestPreparePlan_PersistsVerifiedPlan(t *testing.T) {
	// The plan declares the install scope's target hosts, which are read from
	// the machine's own agent config files; pin every variable the adapters
	// consult to an empty temp home so the assertions below describe the plan
	// and never this machine's setup.
	pinHostScanHome(t)
	h := newHarness(t)
	ctx := context.Background()

	var plan domain.InstallPlan
	err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{
		"id":      testListingID,
		"version": "1.0.0",
	}, &plan)
	if err != nil {
		t.Fatalf("resolver.prepare_plan failed: %v", err)
	}

	if !regexp.MustCompile(`^plan_[0-9A-Za-z]{26}$`).MatchString(plan.PlanID) {
		t.Errorf("plan id %q violates the schema pattern", plan.PlanID)
	}
	if plan.PlanHash == "" || !strings.HasPrefix(plan.PlanHash, "sha256:") {
		t.Errorf("plan was not sealed with a planHash: %q", plan.PlanHash)
	}
	if plan.Resolved.Version != "1.0.0" {
		t.Errorf("expected resolver selection 1.0.0, got %q", plan.Resolved.Version)
	}
	if len(plan.Resolved.ImmutableRefs) != 1 || plan.Resolved.ImmutableRefs[0] != "git:1111111111111111111111111111111111111111" {
		t.Errorf("expected the selected version's immutable ref, got %+v", plan.Resolved.ImmutableRefs)
	}
	if plan.Resolved.Artifacts == nil || len(plan.Resolved.Artifacts) != 0 {
		t.Errorf("catalog index carries no artifact pointers; expected an empty (non-nil) artifacts list, got %+v", plan.Resolved.Artifacts)
	}
	// This harness has no registered bridge host (pinned empty home) and no
	// published version record (no transport to declare), so the derived
	// effects are exactly the install itself.
	if len(plan.Effects) != 1 || plan.Effects[0] != "package.install" {
		t.Errorf("unexpected effects: %+v", plan.Effects)
	}
	if len(plan.HostChanges) != 0 {
		t.Errorf("no target host, but the plan declares host changes: %+v", plan.HostChanges)
	}
	if plan.RequestedAccess != nil {
		t.Errorf("nothing declared, but the plan requests access: %+v", plan.RequestedAccess)
	}
	// Nothing observed this machine's runtimes, so the plan may not claim any.
	if len(plan.Preconditions.RuntimesFound) != 0 || len(plan.Preconditions.FilesystemPaths) != 0 {
		t.Errorf("preconditions must stay empty when nothing was observed: %+v", plan.Preconditions)
	}
	if plan.Approval.Decision != "" || plan.Approval.ApprovalID != "" {
		t.Errorf("prepare_plan must not pre-record an approval decision: %+v", plan.Approval)
	}
	if plan.CreatedAt.IsZero() || plan.ExpiresAt.Before(plan.CreatedAt) {
		t.Errorf("invalid plan timestamps: %v -> %v", plan.CreatedAt, plan.ExpiresAt)
	}

	// The returned hash must match a recomputation over the returned document.
	recomputed, err := domain.ComputePlanHash(&plan)
	if err != nil {
		t.Fatalf("ComputePlanHash failed: %v", err)
	}
	if recomputed != plan.PlanHash {
		t.Errorf("returned planHash %q does not match recomputation %q", plan.PlanHash, recomputed)
	}

	// And the plan must be reloadable from the journal for install.execute.
	stored, err := h.db.GetPlan(ctx, plan.PlanID)
	if err != nil {
		t.Fatalf("GetPlan failed: %v", err)
	}
	if stored.PlanHash != plan.PlanHash || stored.Resolved.Version != plan.Resolved.Version {
		t.Errorf("stored plan differs from returned plan: %+v", stored)
	}
}

func TestPreparePlan_ErrorCodes(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	cases := []struct {
		name     string
		params   any
		wantCode int
		contains string
	}{
		{"missing id", map[string]any{"version": "1.0.0"}, ipc.CodeInvalidParams, "id is required"},
		{"wrong param type", map[string]any{"id": 123}, ipc.CodeInvalidParams, ""},
		{"unknown listing", map[string]any{"id": "mcp:builtin:mcp-registry:nope"}, ipc.CodeInvalidParams, "not found"},
		{"bad scope", map[string]any{"id": testListingID, "scope": "global"}, ipc.CodeInvalidParams, "invalid scope"},
		{"unresolvable version", map[string]any{"id": testListingID, "version": "9.9.9"}, ipc.CodeInternalError, "LPSM-RESOLVE-CONFLICT"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var raw json.RawMessage
			err := h.client.Call(ctx, "resolver.prepare_plan", tc.params, &raw)
			if code := rpcCode(t, err); code != tc.wantCode {
				t.Errorf("code=%d, want %d (err=%v)", code, tc.wantCode, err)
			}
			if tc.contains != "" && !strings.Contains(err.Error(), tc.contains) {
				t.Errorf("error %q does not contain %q", err, tc.contains)
			}
		})
	}
}

func TestInstallExecute_ErrorMapping(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	t.Run("unknown plan is not-found", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "install.execute", map[string]any{"planId": "plan_MISSING0000000000000000"}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Errorf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
	})

	t.Run("bad params", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "install.execute", map[string]any{"planId": 42}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Errorf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
	})

	t.Run("MCP plan without configured hosts fails closed", func(t *testing.T) {
		var plan domain.InstallPlan
		if err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{"id": testListingID, "version": "1.0.0"}, &plan); err != nil {
			t.Fatalf("prepare_plan failed: %v", err)
		}

		approvalID := approvePlanAsHuman(t, h.db, &plan)
		var raw json.RawMessage
		err := h.client.Call(ctx, "install.execute", map[string]any{"planId": plan.PlanID, "approvalToken": approvalID}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Fatalf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
		if !strings.Contains(err.Error(), "LPSM-INSTALL-TARGET-UNAVAILABLE") {
			t.Errorf("unexpected failure reason: %v", err)
		}

		// The refused request must not leave a journal entry behind.
		var ops int
		if qErr := h.db.Raw().QueryRow("SELECT COUNT(*) FROM operations").Scan(&ops); qErr != nil {
			t.Fatalf("count query failed: %v", qErr)
		}
		if ops != 0 {
			t.Errorf("refused install created %d journal entries", ops)
		}
	})
}

func TestInstallRemove_HonestResults(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	t.Run("not found", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "install.remove", map[string]any{"installId": "inst_missing_0001"}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Errorf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
		if strings.Contains(err.Error(), "removed") {
			t.Errorf("not-found must not read as a removal: %v", err)
		}
	})

	t.Run("missing installId", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "install.remove", map[string]any{}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Errorf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
	})

	t.Run("existing install", func(t *testing.T) {
		now := time.Now().UTC()
		rec := &domain.InstallRecord{
			InstallID:   "inst_user_demo_aaaa",
			ListingID:   testListingID,
			Version:     "1.0.0",
			TreeDigest:  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
			Scope:       domain.ScopeUser,
			Status:      domain.InstallActive,
			InstalledAt: now,
			UpdatedAt:   now,
		}
		if err := h.db.SaveInstall(ctx, rec); err != nil {
			t.Fatalf("SaveInstall failed: %v", err)
		}

		var resp struct {
			Removed   bool   `json:"removed"`
			InstallID string `json:"installId"`
		}
		if err := h.client.Call(ctx, "install.remove", map[string]any{"installId": rec.InstallID}, &resp); err != nil {
			t.Fatalf("install.remove failed: %v", err)
		}
		if !resp.Removed || resp.InstallID != rec.InstallID {
			t.Errorf("unexpected response: %+v", resp)
		}
		if _, err := h.db.GetInstall(ctx, rec.InstallID); err == nil {
			t.Error("install row still exists after removal")
		}
	})
}

// The six handlers registered without a full wiring pass must report their
// real behavior: real data where a caller exists, and an accurate method-not-
// found reason where the subsystem genuinely does not exist yet.
func TestRegisteredHandlers_RealBehavior(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	t.Run("skills.list", func(t *testing.T) {
		var resp struct {
			Skills           []map[string]any `json:"skills"`
			ProgressiveIndex string           `json:"progressiveIndex"`
		}
		if err := h.client.Call(ctx, "skills.list", nil, &resp); err != nil {
			t.Fatalf("skills.list failed: %v", err)
		}
		if resp.Skills == nil {
			t.Error("skills must be an empty list, not null")
		}
		if len(resp.Skills) != 0 {
			t.Errorf("fresh state must report no skills, got %d", len(resp.Skills))
		}
	})

	t.Run("host.detect_config", func(t *testing.T) {
		var raw json.RawMessage
		if err := h.client.Call(ctx, "host.detect_config", nil, &raw); err != nil {
			t.Fatalf("host.detect_config failed: %v", err)
		}
		if len(raw) == 0 {
			t.Error("expected a detection payload")
		}
	})

	t.Run("doctor.run_checks", func(t *testing.T) {
		var report map[string]any
		if err := h.client.Call(ctx, "doctor.run_checks", nil, &report); err != nil {
			t.Fatalf("doctor.run_checks failed: %v", err)
		}
		if _, ok := report["overallStatus"]; !ok {
			t.Errorf("expected a real report, got %v", report)
		}
		if _, ok := report["checks"]; !ok {
			t.Errorf("expected the check list, got %v", report)
		}
	})

	t.Run("system.status", func(t *testing.T) {
		var resp struct {
			Version         string `json:"version"`
			ProtocolVersion string `json:"protocolVersion"`
			PID             int    `json:"pid"`
			Status          string `json:"status"`
		}
		if err := h.client.Call(ctx, "system.status", nil, &resp); err != nil {
			t.Fatalf("system.status failed: %v", err)
		}
		if resp.Version != Version || resp.ProtocolVersion != ProtocolVersion {
			t.Errorf("unexpected identity: %+v", resp)
		}
		if resp.PID <= 0 {
			t.Errorf("expected a real pid, got %d", resp.PID)
		}
	})

	t.Run("provider.probe unknown provider", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "provider.probe", map[string]any{"providerId": "prov_missing"}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Errorf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
	})

	t.Run("provider.probe missing id", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "provider.probe", map[string]any{}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Errorf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
	})

	// provider.invoke, capabilities.search and capabilities.describe are WIRED:
	// they answer over discovered capability rows (internal/discover). A request
	// for a capability that was never discovered must therefore be an
	// InvalidParams complaint, NOT a "not implemented" stub — a stub here would
	// mean the install→discover→invoke chain silently does not work.
	t.Run("provider.invoke unknown capability is wired", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "provider.invoke", map[string]any{
			"capabilityId": "inst_user_mcp_demo_missing_1_0_0/demo/nope",
			"arguments":    map[string]any{},
		}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Errorf("code=%d, want %d — provider.invoke is implemented and must not "+
				"answer MethodNotFound (err=%v)", code, ipc.CodeInvalidParams, err)
		}
	})

	t.Run("capabilities.search returns real rows", func(t *testing.T) {
		var out struct {
			Capabilities []map[string]any `json:"capabilities"`
			Total        int              `json:"totalDiscovered"`
		}
		if err := h.client.Call(ctx, "capabilities.search", map[string]any{"query": "anything"}, &out); err != nil {
			t.Fatalf("capabilities.search: %v", err)
		}
		if out.Capabilities == nil {
			t.Error("capabilities must be an empty list, not null, when nothing is discovered")
		}
	})

	t.Run("capabilities.describe unknown capability is wired", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "capabilities.describe", map[string]any{
			"capabilityId": "inst_user_mcp_demo_missing_1_0_0/demo/nope",
		}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Errorf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
	})

	// The invocation registry is ARCH/34 and it is wired: invocation.get and
	// invocation.cancel answer from the registry, and an id that was never
	// issued is a typed not-found — not a "not implemented" stub.
	for _, method := range []string{"invocation.get", "invocation.cancel"} {
		t.Run(method, func(t *testing.T) {
			var raw json.RawMessage
			err := h.client.Call(ctx, method, map[string]any{"invocationId": "inv_x"}, &raw)
			if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
				t.Errorf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
			}
			if !strings.Contains(err.Error(), "LPSM-INVOCATION-NOT-FOUND") {
				t.Errorf("reason %q must name the typed not-found", err)
			}
		})
	}
}

// invocationFixture is one remote MCP server the daemon can really call.
type invocationFixture struct {
	endpoint string
	release  func()
}

// newInvocationFixture starts a streamable-HTTP MCP server. With block set,
// its tools/call waits until the test releases it: a call that is still in
// flight when the test cancels it.
func newInvocationFixture(t *testing.T, block bool) *invocationFixture {
	t.Helper()
	releaseCh := make(chan struct{})
	var once sync.Once
	release := func() { once.Do(func() { close(releaseCh) }) }

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		reply := func(result string) {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": json.RawMessage(req.ID), "result": json.RawMessage(result),
			})
		}
		switch req.Method {
		case "tools/list":
			reply(`{"tools":[{"name":"echo","description":"Echo a message",
				"inputSchema":{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}}]}`)
		case "tools/call":
			if block {
				select {
				case <-releaseCh:
				case <-r.Context().Done():
					return
				}
			}
			reply(`{"content":[{"type":"text","text":"remote-ok"}]}`)
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": json.RawMessage(req.ID),
				"error": map[string]any{"code": -32601, "message": "Method not found"},
			})
		}
	}))
	t.Cleanup(func() {
		release()
		server.Close()
	})
	return &invocationFixture{endpoint: server.URL + "/mcp", release: release}
}

// seedInvocationCapability discovers the fixture and grants the capability it
// exposes, so a daemon-side invocation reaches the provider instead of the
// policy gate.
func seedInvocationCapability(t *testing.T, db *state.DB, endpoint string) string {
	t.Helper()
	ctx := context.Background()
	const installID = "inst_user_mcp_invocation_demo_1_0_0"
	const component = "invocation-demo"
	seedCapabilityInstall(t, db, installID, "mcp:example:invocation-demo", component)

	found, err := discover.Discover(ctx, db, discover.ProviderSpec{
		InstallID: installID, ComponentName: component,
		Endpoint: endpoint, Transport: "streamable-http",
	})
	if err != nil {
		t.Fatalf("Discover: %v", err)
	}
	if len(found.Capabilities) == 0 {
		t.Fatal("the fixture must expose one capability")
	}
	capabilityID := found.Capabilities[0].CapabilityID
	if _, err := issueCapabilityGrant(ctx, db, capabilityID); err != nil {
		t.Fatalf("issueCapabilityGrant: %v", err)
	}
	return capabilityID
}

// The daemon's provider.invoke writes a receipt, and invocation.get returns
// that same receipt for the invocation id the call reported.
func TestInvocationGetReturnsARecordedInvocation(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	fixture := newInvocationFixture(t, false)
	capabilityID := seedInvocationCapability(t, h.db, fixture.endpoint)

	var invoked struct {
		Output       string `json:"output"`
		IsError      bool   `json:"isError"`
		InvocationID string `json:"invocationId"`
		Receipt      struct {
			ReceiptHash string `json:"receiptHash"`
			Outcome     string `json:"outcome"`
		} `json:"receipt"`
	}
	if err := h.client.Call(ctx, "provider.invoke", map[string]any{
		"capabilityId": capabilityID,
		"arguments":    map[string]any{"message": "hi"},
	}, &invoked); err != nil {
		t.Fatalf("provider.invoke: %v", err)
	}
	if invoked.InvocationID == "" {
		t.Fatal("provider.invoke must report the invocation id")
	}
	if invoked.Receipt.ReceiptHash == "" {
		t.Fatal("provider.invoke must report the receipt")
	}
	if invoked.Receipt.Outcome != "succeeded" {
		t.Errorf("receipt outcome = %q, want %q", invoked.Receipt.Outcome, "succeeded")
	}
	if !strings.Contains(invoked.Output, "remote-ok") {
		t.Errorf("unexpected output: %q", invoked.Output)
	}

	var got struct {
		State   string `json:"state"`
		Receipt struct {
			ReceiptHash string `json:"receiptHash"`
		} `json:"receipt"`
	}
	if err := h.client.Call(ctx, "invocation.get", map[string]any{
		"invocationId": invoked.InvocationID,
	}, &got); err != nil {
		t.Fatalf("invocation.get: %v", err)
	}
	if got.State != "succeeded" {
		t.Errorf("state = %q, want a terminal state", got.State)
	}
	if got.Receipt.ReceiptHash != invoked.Receipt.ReceiptHash {
		t.Errorf("invocation.get returned receipt %q, want %q",
			got.Receipt.ReceiptHash, invoked.Receipt.ReceiptHash)
	}
}

// Cancellation over the wire: the in-flight call is stopped, the invocation
// ends as cancelled, and a repeated cancel is idempotent.
func TestInvocationCancelOverIPC(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	fixture := newInvocationFixture(t, true)
	capabilityID := seedInvocationCapability(t, h.db, fixture.endpoint)

	var submitted struct {
		InvocationID string `json:"invocationId"`
		State        string `json:"state"`
	}
	if err := h.client.Call(ctx, "provider.invoke", map[string]any{
		"capabilityId": capabilityID,
		"arguments":    map[string]any{"message": "hi"},
		"async":        true,
	}, &submitted); err != nil {
		t.Fatalf("provider.invoke: %v", err)
	}
	if submitted.InvocationID == "" {
		t.Fatal("an asynchronous submission must report the invocation id")
	}

	// Wait until the call is really in flight, then cancel it.
	waitForInvocationState(t, h, submitted.InvocationID, "running")

	var cancelled struct {
		State     string `json:"state"`
		Cancelled bool   `json:"cancelled"`
	}
	if err := h.client.Call(ctx, "invocation.cancel", map[string]any{
		"invocationId": submitted.InvocationID,
	}, &cancelled); err != nil {
		t.Fatalf("invocation.cancel: %v", err)
	}
	if cancelled.State != "cancelled" {
		t.Errorf("state = %q, want %q", cancelled.State, "cancelled")
	}

	// Idempotent over the wire: a second cancel returns the same state.
	var again struct {
		State string `json:"state"`
	}
	if err := h.client.Call(ctx, "invocation.cancel", map[string]any{
		"invocationId": submitted.InvocationID,
	}, &again); err != nil {
		t.Fatalf("second invocation.cancel: %v", err)
	}
	if again.State != "cancelled" {
		t.Errorf("the second cancel changed the state: %q", again.State)
	}
}

// waitForInvocationState polls invocation.get until the invocation reaches a
// state, and fails the test when it never does.
func waitForInvocationState(t *testing.T, h *harness, id, want string) {
	t.Helper()
	ctx := context.Background()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var inv struct {
			State string `json:"state"`
		}
		if err := h.client.Call(ctx, "invocation.get", map[string]any{"invocationId": id}, &inv); err != nil {
			t.Fatalf("invocation.get: %v", err)
		}
		if inv.State == want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("the invocation never reached %q", want)
}

func TestRunStartupRecovery_ReportsTruthfully(t *testing.T) {
	ctx := context.Background()
	tempDir := t.TempDir()
	paths := &config.PlatformPaths{
		ConfigRoot:  filepath.Join(tempDir, "config"),
		DataRoot:    filepath.Join(tempDir, "data"),
		RuntimeRoot: filepath.Join(tempDir, "run"),
	}
	if err := paths.EnsureDirectories(); err != nil {
		t.Fatalf("EnsureDirectories failed: %v", err)
	}
	db, err := state.Open(paths.StateDBPath())
	if err != nil {
		t.Fatalf("state.Open failed: %v", err)
	}
	defer db.Close()

	// Interrupted before placement: staging only, must roll back.
	const stagingOp = "op_crash_staging"
	if err := db.CreateOperation(ctx, stagingOp, nil, "install", ""); err != nil {
		t.Fatalf("CreateOperation failed: %v", err)
	}
	if err := db.AdvanceOperationState(ctx, stagingOp, "staging"); err != nil {
		t.Fatalf("AdvanceOperationState failed: %v", err)
	}
	stagingDir := filepath.Join(paths.StagingPath(), stagingOp)
	if err := os.MkdirAll(stagingDir, 0700); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}

	// Interrupted after the metadata commit: install row exists, must finalize.
	const commitOp = "op_crash_commit"
	const crashTree = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
	if err := db.CreateOperation(ctx, commitOp, nil, "install", ""); err != nil {
		t.Fatalf("CreateOperation failed: %v", err)
	}
	if err := db.AdvanceOperationState(ctx, commitOp, "commit_intent"); err != nil {
		t.Fatalf("AdvanceOperationState failed: %v", err)
	}
	if err := db.RecordOperationTree(ctx, commitOp, crashTree, true); err != nil {
		t.Fatalf("RecordOperationTree failed: %v", err)
	}
	now := time.Now().UTC()
	if err := db.SaveInstall(ctx, &domain.InstallRecord{
		InstallID:   "inst_user_crash_aaaa",
		ListingID:   testListingID,
		Version:     "1.0.0",
		TreeDigest:  crashTree,
		Scope:       domain.ScopeUser,
		Status:      domain.InstallActive,
		InstalledAt: now,
		UpdatedAt:   now,
	}); err != nil {
		t.Fatalf("SaveInstall failed: %v", err)
	}

	summary, err := runStartupRecovery(ctx, db, paths.StagingPath(), func(string) string { return "" })
	if err != nil {
		t.Fatalf("runStartupRecovery failed: %v", err)
	}
	if summary.Examined != 2 || summary.RolledBack != 1 || summary.Committed != 1 || summary.Failed != 0 {
		t.Errorf("unexpected summary: %+v", summary)
	}
	if _, err := os.Stat(stagingDir); !os.IsNotExist(err) {
		t.Error("staging directory of the interrupted operation must be removed")
	}
	if nonTerminal, err := db.GetNonTerminalOperations(ctx); err != nil || len(nonTerminal) != 0 {
		t.Errorf("journal must be fully reconciled, %d open (err=%v)", len(nonTerminal), err)
	}

	// A second sweep has nothing left to do.
	summary, err = runStartupRecovery(ctx, db, paths.StagingPath(), nil)
	if err != nil {
		t.Fatalf("second recovery failed: %v", err)
	}
	if summary.Examined != 0 {
		t.Errorf("second sweep must be a no-op, got %+v", summary)
	}
}

// TestReleaseDownloadTarget pins the update-command wiring: the updater must
// download the per-asset binary URL (not the release HTML page) and must fail
// closed when the binary or its checksum is missing.
func TestReleaseDownloadTarget(t *testing.T) {
	const bin = "litespm-linux-amd64"

	t.Run("selects asset url and checksum", func(t *testing.T) {
		info := &update.ReleaseInfo{
			Version:         "1.2.3",
			DownloadURLs:    map[string]string{bin: "https://example.test/" + bin},
			ChecksumsSHA256: map[string]string{bin: "abc123"},
		}
		url, sum, err := releaseDownloadTarget(info, bin)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if url != "https://example.test/"+bin || sum != "abc123" {
			t.Fatalf("wrong target: url=%q sum=%q", url, sum)
		}
	})

	t.Run("missing binary fails closed", func(t *testing.T) {
		info := &update.ReleaseInfo{
			Version:         "1.2.3",
			DownloadURLs:    map[string]string{},
			ChecksumsSHA256: map[string]string{bin: "abc123"},
		}
		if _, _, err := releaseDownloadTarget(info, bin); err == nil {
			t.Fatal("expected an error for a missing binary asset")
		}
	})

	t.Run("missing checksum fails closed", func(t *testing.T) {
		info := &update.ReleaseInfo{
			Version:         "1.2.3",
			DownloadURLs:    map[string]string{bin: "https://example.test/" + bin},
			ChecksumsSHA256: map[string]string{},
		}
		if _, _, err := releaseDownloadTarget(info, bin); err == nil {
			t.Fatal("expected an error for a missing checksum")
		}
	})

	t.Run("nil release info fails closed", func(t *testing.T) {
		if _, _, err := releaseDownloadTarget(nil, bin); err == nil {
			t.Fatal("expected an error for nil release info")
		}
	})
}

func TestDownloadUpdatePayloadHonorsDeadline(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		<-r.Context().Done()
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, err := downloadUpdatePayload(ctx, server.Client(), server.URL, 1024); err == nil {
		t.Fatal("stalled update body unexpectedly completed without the request deadline")
	}
}

func TestReadBounded(t *testing.T) {
	t.Run("within limit", func(t *testing.T) {
		data, err := readBounded(strings.NewReader("hello"), 16)
		if err != nil || string(data) != "hello" {
			t.Fatalf("data=%q err=%v", data, err)
		}
	})
	t.Run("over limit refused", func(t *testing.T) {
		if _, err := readBounded(strings.NewReader("0123456789"), 4); err == nil {
			t.Fatal("expected an oversize error")
		}
	})
	t.Run("invalid limit", func(t *testing.T) {
		if _, err := readBounded(strings.NewReader("x"), 0); err == nil {
			t.Fatal("expected an invalid-limit error")
		}
	})
}

// TestHostApplySetup_RealBehavior drives the host.apply_setup handler through
// the real IPC server. Error paths must report accurately; the success path is
// exercised against a sandboxed HOME so no real host config is touched.
func TestHostApplySetup_RealBehavior(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	t.Run("unknown host is invalid params", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "host.apply_setup", map[string]any{"hostId": "no-such-host"}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Errorf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
		if !strings.Contains(err.Error(), "unknown host adapter") {
			t.Errorf("error %q must name the unknown host", err)
		}
	})

	t.Run("missing hostId is invalid params", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "host.apply_setup", map[string]any{}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Errorf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
	})

	t.Run("non-object params are invalid params", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "host.apply_setup", "not-an-object", &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Errorf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
	})

	t.Run("applies to a sandboxed home", func(t *testing.T) {
		home := t.TempDir()
		// Full home sandbox: the adapter resolves through $HOME on Unix but
		// prefers $USERPROFILE on Windows, and through $XDG_CONFIG_HOME (or
		// $OPENCODE_CONFIG_DIR) for the config directory on every OS — the
		// runner images export real values for several of these, so pinning
		// HOME alone let the test read (and write) the runner's actual home.
		t.Setenv("HOME", home)
		t.Setenv("USERPROFILE", home)
		t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
		t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
		t.Setenv("OPENCODE_CONFIG_DIR", "")
		t.Setenv("CLINE_MCP_SETTINGS_PATH", "")
		t.Setenv("CLINE_DATA_DIR", "")

		var resp struct {
			HostID     string `json:"hostId"`
			ConfigPath string `json:"configPath"`
			Success    bool   `json:"success"`
		}
		if err := h.client.Call(ctx, "host.apply_setup", map[string]any{
			"hostId":     "opencode",
			"binaryPath": "/opt/litespm",
		}, &resp); err != nil {
			t.Fatalf("host.apply_setup failed: %v", err)
		}
		if !resp.Success || resp.HostID != "opencode" {
			t.Fatalf("unexpected response: %+v", resp)
		}
		want := filepath.Join(home, ".config", "opencode", "opencode.json")
		if resp.ConfigPath != want {
			t.Errorf("config path = %q, want %q", resp.ConfigPath, want)
		}
		data, err := os.ReadFile(want)
		if err != nil {
			t.Fatalf("config was not written: %v", err)
		}
		if !strings.Contains(string(data), `"litespm"`) {
			t.Errorf("written config does not contain the litespm entry: %s", data)
		}
	})
}

// TestStartupRecoveryHaltsOnFailedOperation proves the daemon's startup sweep
// does not silently swallow a per-operation recovery failure. When an
// interrupted operation cannot be reconciled the sweep must return an error so
// runDaemonServe halts instead of serving a journal that still contains
// non-terminal entries.
func TestStartupRecoveryHaltsOnFailedOperation(t *testing.T) {
	ctx := context.Background()
	tempDir := t.TempDir()
	paths := &config.PlatformPaths{
		ConfigRoot:  filepath.Join(tempDir, "config"),
		DataRoot:    filepath.Join(tempDir, "data"),
		RuntimeRoot: filepath.Join(tempDir, "run"),
	}
	if err := paths.EnsureDirectories(); err != nil {
		t.Fatalf("EnsureDirectories failed: %v", err)
	}
	db, err := state.Open(paths.StateDBPath())
	if err != nil {
		t.Fatalf("state.Open failed: %v", err)
	}
	defer db.Close()

	const opID = "op_recovery_fail"
	if err := db.CreateOperation(ctx, opID, nil, "install", ""); err != nil {
		t.Fatalf("CreateOperation failed: %v", err)
	}
	if err := db.AdvanceOperationState(ctx, opID, "staging"); err != nil {
		t.Fatalf("AdvanceOperationState failed: %v", err)
	}

	// Point the staging root at a regular file so os.RemoveAll of the
	// per-operation staging directory fails with ENOTDIR. This is a hermetic,
	// permission-independent way to force recoverOperation to fail.
	notADir := filepath.Join(tempDir, "staging-is-a-file")
	if err := os.WriteFile(notADir, []byte("x"), 0o600); err != nil {
		t.Fatalf("failed to create staging blocker file: %v", err)
	}

	summary, err := runStartupRecovery(ctx, db, notADir, nil)
	if err == nil {
		t.Fatalf("startup recovery swallowed a failed operation (summary %+v)", summary)
	}
	if !strings.Contains(err.Error(), "journal recovery could not complete") {
		t.Errorf("error must name the recovery failure: %v", err)
	}
	if summary.Failed != 1 {
		t.Fatalf("expected exactly 1 failed operation, got %+v", summary)
	}

	// The failed operation must remain non-terminal; the daemon halts rather
	// than pretending it was reconciled.
	open, err := db.GetNonTerminalOperations(ctx)
	if err != nil {
		t.Fatalf("GetNonTerminalOperations failed: %v", err)
	}
	if len(open) != 1 || open[0].OperationID != opID {
		t.Fatalf("expected the failed operation to remain non-terminal, got %+v", open)
	}
}

// TestDoctorExitCode pins the doctor exit-code contract from ARCH/20 §2: a
// clean or warn-only report exits 0; a FAIL in a classified category returns
// that category's documented code (catalog 10, resolve 20, approval 30, install
// 40, provider 50, host 60, state 70); when several categories fail the most
// severe (highest) code wins; and an uncategorized FAIL keeps the historical
// STATE_ERROR fallback.
func TestDoctorExitCode(t *testing.T) {
	report := func(checks ...doctor.CheckResult) *doctor.DoctorReport {
		r := &doctor.DoctorReport{}
		for _, c := range checks {
			switch c.Status {
			case doctor.StatusFail:
				r.FailCount++
			case doctor.StatusWarn:
				r.WarnCount++
			default:
				r.PassedCount++
			}
			r.Checks = append(r.Checks, c)
		}
		return r
	}
	fail := func(category doctor.Category) doctor.CheckResult {
		return doctor.CheckResult{Status: doctor.StatusFail, Category: category}
	}

	cases := []struct {
		name string
		rep  *doctor.DoctorReport
		want int
	}{
		{"nil report", nil, 0},
		{"clean", report(doctor.CheckResult{Status: doctor.StatusPass}), 0},
		{"warning only", report(doctor.CheckResult{Status: doctor.StatusWarn, Category: doctor.CategoryState}), 0},
		{"state failure", report(fail(doctor.CategoryState)), 70},
		{"catalog failure", report(fail(doctor.CategoryCatalog)), 10},
		{"resolve failure", report(fail(doctor.CategoryResolve)), 20},
		{"approval failure", report(fail(doctor.CategoryApproval)), 30},
		{"install failure", report(fail(doctor.CategoryInstall)), 40},
		{"provider failure", report(fail(doctor.CategoryProvider)), 50},
		{"host failure", report(fail(doctor.CategoryHost)), 60},
		{"uncategorized failure", report(fail("")), 70},
		{"worst failure wins", report(fail(doctor.CategoryCatalog), fail(doctor.CategoryHost)), 60},
		{"warn does not mask fail", report(
			doctor.CheckResult{Status: doctor.StatusWarn, Category: doctor.CategoryState},
			fail(doctor.CategoryInstall),
		), 40},
		{"fail count without inspectable checks", &doctor.DoctorReport{FailCount: 2}, 70},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := doctorExitCode(tc.rep); got != tc.want {
				t.Fatalf("doctorExitCode(%s) = %d, want %d", tc.name, got, tc.want)
			}
		})
	}
}

// TestInstallExecuteRefusesDiscoveryOnly pins Phase 0.1/T3 at the daemon seam:
// install.execute refuses a discovery_only row with LPSM-NOT-INSTALLABLE.
func TestInstallExecuteRefusesDiscoveryOnly(t *testing.T) {
	const id = "mcp:awesome:heuristic-row"
	h := newHarnessWith(t, []*domain.Listing{{
		SchemaVersion: 1,
		ID:            id,
		Kind:          domain.KindMCP,
		Name:          "heuristic-row",
		Summary:       "discovery-only fixture",
	}})
	var raw json.RawMessage
	err := h.client.Call(context.Background(), "install.execute", map[string]any{"listingId": id}, &raw)
	if err == nil || !strings.Contains(err.Error(), "LPSM-NOT-INSTALLABLE") {
		t.Fatalf("err = %v, want LPSM-NOT-INSTALLABLE", err)
	}
	// The refusal is audited too: this gate fires before a plan or an approval
	// ever exists, and a refusal that leaves no row cannot be distinguished
	// from a request that was never made.
	row := findAuditRow(auditRows(t, h), "package.install")
	if row == nil {
		t.Fatal("a discovery-only refusal wrote no audit event")
	}
	if row[2] != "deny" {
		t.Errorf("audit decision = %q, want %q", row[2], "deny")
	}
	if row[1] != id {
		t.Errorf("audit target = %q, want %q", row[1], id)
	}
}

// TestArchiveInstallPathEnforcesDenyRules pins defect 5: the install engine the
// daemon wires (registerCoreHandlers) must carry the user's real deny tier from
// policy-deny.json, exactly like the skills/MCP paths do. Before the fix the
// engine was built with nil rules, so a deny on the archive/package install
// path was silently ignored and the install proceeded.
func TestArchiveInstallPathEnforcesDenyRules(t *testing.T) {
	const id = "pkg:example:blocked-archive"
	rules, err := json.Marshal([]policy.DenyRule{{
		RuleID: "deny-archive-install", TargetRef: id, Effect: policy.EffectPackageInstall,
	}})
	if err != nil {
		t.Fatal(err)
	}
	// The deny-rules file must exist before registerCoreHandlers builds the
	// engine, so it is planted through the pre-registration hook.
	h := newHarnessFull(t, nil, nil, func(paths *config.PlatformPaths) {
		if werr := os.WriteFile(filepath.Join(paths.DataRoot, policy.DenyRulesFile), rules, 0o600); werr != nil {
			t.Fatalf("write deny rules: %v", werr)
		}
	})

	_, err = h.engine.Execute(context.Background(), install.InstallOptions{
		ListingID: id,
		Version:   "1.0.0",
		TreeSource: func(context.Context, string) (*domain.ExtractedTreeInfo, error) {
			return nil, errors.New("tree source must not be consulted: policy denies before any work")
		},
	})
	if err == nil {
		t.Fatal("archive install ran despite a matching deny rule")
	}
	if code := domain.ErrorCode(err); code != "LPSM-POLICY-UNAUTHORIZED" {
		t.Fatalf("code = %q, want LPSM-POLICY-UNAUTHORIZED (%v)", code, err)
	}
	if !strings.Contains(err.Error(), "deny-archive-install") {
		t.Fatalf("the denial must name the matched rule, got %v", err)
	}
	// The refusal code the skills/MCP paths surface over IPC is unchanged.
	if code := installRPCError(err).Code; code != ipc.CodeUnauthorized {
		t.Errorf("IPC code = %d, want %d (CodeUnauthorized)", code, ipc.CodeUnauthorized)
	}
}

// TestInstallRPCErrorEnumeratesArtifactUnavailable pins defect 8:
// LPSM-ARTIFACT-UNAVAILABLE maps to the same JSON-RPC code (-32602) as its
// sibling LPSM-NOT-INSTALLABLE, so a user refusal no longer surfaces as a
// -32603 internal error.
func TestInstallRPCErrorEnumeratesArtifactUnavailable(t *testing.T) {
	cases := []struct {
		name string
		err  error
	}{
		{"artifact unavailable", domain.ErrArtifactUnavailable("pkg:example:x", "no artifact locator")},
		{"not installable", domain.ErrNotInstallable("pkg:example:x", "discovery-only")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rpcErr := installRPCError(tc.err)
			if rpcErr.Code != ipc.CodeInvalidParams {
				t.Errorf("code = %d, want %d (CodeInvalidParams)", rpcErr.Code, ipc.CodeInvalidParams)
			}
			if rpcErr.Code == ipc.CodeInternalError {
				t.Errorf("a caller-input refusal must not surface as an internal error")
			}
		})
	}
}

// TestToolsListUnionsProjectScope pins the read-path contract: tools.list
// unions the caller's user-scope installs with the project-scope installs of
// the workspace it names, and every item states which scope it came from. A
// caller that names no root — or a different root — sees user scope only,
// never a fabricated project and never an error.
func TestToolsListUnionsProjectScope(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	h := newHarness(t)
	ctx := context.Background()
	now := time.Now().UTC()
	save := func(id string, scope domain.InstallScope, ws string) {
		t.Helper()
		if err := h.db.SaveInstall(ctx, &domain.InstallRecord{
			InstallID: id, ListingID: id, Kind: domain.KindMCP, Version: "1.0.0",
			Scope: scope, WorkspaceID: ws, Status: domain.InstallActive,
			InstalledAt: now, UpdatedAt: now,
		}); err != nil {
			t.Fatalf("SaveInstall %s: %v", id, err)
		}
	}

	project := t.TempDir()
	save("mcp:example:user-one", domain.ScopeUser, "")
	save("mcp:example:proj-one", domain.ScopeProject, domain.WorkspaceIDForProjectRoot(project))

	type item struct {
		ID         string `json:"id"`
		IsExternal bool   `json:"isExternal"`
		Scope      string `json:"scope"`
	}
	list := func(t *testing.T, projectRoot string) []item {
		t.Helper()
		var params any
		if projectRoot != "" {
			params = map[string]any{"projectRoot": projectRoot}
		}
		var resp struct {
			Installs []item `json:"installs"`
		}
		if err := h.client.Call(ctx, "tools.list", params, &resp); err != nil {
			t.Fatalf("tools.list: %v", err)
		}
		installs := make([]item, 0, len(resp.Installs))
		for _, it := range resp.Installs {
			if !it.IsExternal {
				installs = append(installs, it)
			}
		}
		return installs
	}
	scopesOf := func(items []item) map[string]string {
		out := make(map[string]string, len(items))
		for _, it := range items {
			out[it.ID] = it.Scope
		}
		return out
	}

	t.Run("no project root sees user scope only", func(t *testing.T) {
		got := scopesOf(list(t, ""))
		if got["mcp:example:user-one"] != "user" {
			t.Errorf("user install missing or unlabelled: %+v", got)
		}
		if _, ok := got["mcp:example:proj-one"]; ok {
			t.Errorf("a project-scope install leaked without a project root: %+v", got)
		}
	})

	t.Run("a different project root sees user scope only", func(t *testing.T) {
		got := scopesOf(list(t, t.TempDir()))
		if _, ok := got["mcp:example:proj-one"]; ok {
			t.Errorf("another project's install was visible: %+v", got)
		}
		if _, ok := got["mcp:example:user-one"]; !ok {
			t.Errorf("user scope must stay visible: %+v", got)
		}
	})

	t.Run("the matching project root sees both, each labelled", func(t *testing.T) {
		items := list(t, project)
		got := scopesOf(items)
		if got["mcp:example:user-one"] != "user" {
			t.Errorf("user install missing or unlabelled: %+v", got)
		}
		if got["mcp:example:proj-one"] != "project" {
			t.Errorf("project install missing or unlabelled: %+v", got)
		}
		// Deterministic order: user rows first, then project rows.
		var order []string
		for _, it := range items {
			order = append(order, it.ID)
		}
		if len(order) != 2 || order[0] != "mcp:example:user-one" || order[1] != "mcp:example:proj-one" {
			t.Errorf("order = %v, want user rows before project rows", order)
		}
	})
}

// TestSearchQueryArgsParsesFlags pins the usage contract: --json and --limit
// are honoured, every other flag-shaped word is an error rather than part of
// the query. Folding flags into the query was the old behaviour, and it was
// worse than an error: `litespm search github --frozen` searched the literal
// string, the fuzzy index matched github rows anyway, and the user got a
// plausible answer that silently ignored what they asked for.
func TestSearchQueryArgsParsesFlags(t *testing.T) {
	for _, tc := range []struct {
		name    string
		args    []string
		want    searchOptions
		wantErr string
	}{
		{name: "bare words", args: []string{"github", "mcp"},
			want: searchOptions{query: "github mcp", limit: 25}},
		{name: "no arguments", args: nil,
			want: searchOptions{query: "", limit: 25}},
		{name: "json", args: []string{"github", "--json"},
			want: searchOptions{query: "github", json: true, limit: 25}},
		{name: "limit", args: []string{"--limit", "200", "github"},
			want: searchOptions{query: "github", limit: 200}},
		{name: "json and limit together", args: []string{"--json", "--limit", "500"},
			want: searchOptions{query: "", json: true, limit: 500}},
		{name: "unknown flag", args: []string{"github", "--frozen"},
			wantErr: "--frozen"},
		{name: "bare dash word is a query", args: []string{"c++"},
			want: searchOptions{query: "c++", limit: 25}},
		{name: "limit without a value", args: []string{"--limit"},
			wantErr: "--limit needs a number"},
		{name: "limit out of range", args: []string{"--limit", "0"},
			wantErr: "--limit must be a number between 1 and 500"},
		{name: "limit not a number", args: []string{"--limit", "lots"},
			wantErr: "--limit must be a number between 1 and 500"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := searchQueryArgs(tc.args)
			if tc.wantErr != "" {
				if err == nil {
					t.Fatalf("searchQueryArgs(%v) = %+v, want an error mentioning %q", tc.args, got, tc.wantErr)
				}
				if !strings.Contains(err.Error(), tc.wantErr) {
					t.Errorf("error = %q, want it to mention %q", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("searchQueryArgs(%v): %v", tc.args, err)
			}
			if got != tc.want {
				t.Errorf("searchQueryArgs(%v) = %+v, want %+v", tc.args, got, tc.want)
			}
		})
	}
}

// TestDaemonInvokeResolvesSecretReferences proves the daemon hands its vault
// to the launcher: a `secret:<ns>/<key>` reference in a provider's recorded
// environment is resolved from the daemon's own store AT LAUNCH.
//
// The probe is deliberately a command that cannot start. The invocation must
// therefore fail at the SPAWN — which proves the reference was resolved and
// the launch got that far — and must NOT fail with LPSM-SECRET-UNRESOLVED,
// which would mean the daemon launched without a vault to resolve it.
func TestDaemonInvokeResolvesSecretReferences(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	const (
		installID  = "inst_user_mcp_demo_secret_1_0_0"
		component  = "secret-demo"
		toolName   = "echo"
		reference  = "secret:acme/daemon-canary"
		secretText = "sk-live-daemon-canary-7b31"
	)
	now := time.Now().UTC()
	if err := h.db.SaveInstall(ctx, &domain.InstallRecord{
		InstallID: installID, ListingID: "mcp:demo:" + component, Version: "1.0.0",
		Scope: domain.ScopeUser, Status: domain.InstallActive, InstalledAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("SaveInstall: %v", err)
	}
	if err := h.db.SaveInstallComponent(ctx, &domain.InstallComponentRecord{
		InstallID: installID, Kind: domain.ComponentMCPProvider, ComponentName: component,
	}); err != nil {
		t.Fatalf("SaveInstallComponent: %v", err)
	}
	providerID := discover.ProviderIDFor(installID, component)
	if err := h.db.SaveProvider(ctx, &domain.ProviderRecord{
		ProviderID: providerID, InstallID: installID, ComponentName: component,
		Transport: "stdio",
		// A path that does not exist: the launch must fail HERE, after the
		// environment was resolved.
		Command: filepath.Join(t.TempDir(), "no-such-provider-binary"),
		EnvJSON: `{"LITESPM_SECRET_CANARY":"` + reference + `"}`,
		Status:  "active", CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("SaveProvider: %v", err)
	}
	capabilityID := string(domain.NewCapabilityID(domain.InstallID(installID), component, toolName))
	if err := h.db.SaveCapability(ctx, &domain.CapabilityRecord{
		CapabilityID: capabilityID, ProviderID: providerID, Name: toolName,
		InputSchemaJSON: `{"type":"object"}`, SchemaFingerprint: "sha256:daemon-canary",
		DiscoveredAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("SaveCapability: %v", err)
	}
	// The grant is what turns the policy's "ask" into an allow, so the
	// invocation reaches the launcher at all.
	if err := h.db.SaveCapabilityGrant(ctx, &domain.CapabilityGrant{
		GrantID:           "grant_daemon_canary",
		CapabilityID:      capabilityID,
		SchemaFingerprint: "sha256:daemon-canary",
		Status:            "active",
		CreatedAt:         now,
	}, "human-cli"); err != nil {
		t.Fatalf("SaveCapabilityGrant: %v", err)
	}
	// The credential the reference points at lives in the daemon's vault.
	if _, err := h.store.Put(ctx, "acme", "daemon-canary", []byte(secretText)); err != nil {
		t.Fatalf("store the secret: %v", err)
	}

	var raw json.RawMessage
	err := h.client.Call(ctx, "provider.invoke", map[string]any{
		"capabilityId": capabilityID,
		"arguments":    map[string]any{},
	}, &raw)
	if err == nil {
		t.Fatal("the invocation succeeded against a command that does not exist")
	}
	if strings.Contains(err.Error(), discover.CodeSecretUnresolved) {
		t.Errorf("the daemon launched without resolving the secret reference: %v", err)
	}
	if strings.Contains(err.Error(), secretText) {
		t.Errorf("the secret value reached an error message: %v", err)
	}
}
