package discover

// discover_auth_test.go — the remote half of the credential lifecycle: a
// remote provider that names a credential profile sends the stored token, and
// a provider whose credential is missing or revoked is REFUSED rather than
// dialled anonymously.
//
// The second half is the one that matters. An anonymous request to an
// endpoint that expects a credential is not "the same request without a
// header" — it is a different request, and it is answered with a 401 that
// looks like a broken endpoint. LiteSPM refuses before the connection.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/mcpclient"
	"github.com/sarv-projects/litespm/internal/secrets"
	"github.com/sarv-projects/litespm/internal/state"
)

// authedRemoteFixture is a streamable-HTTP endpoint that REQUIRES a bearer
// token. It counts the requests that arrived without one, because "the call
// was refused" must mean "no request was made", not "a request was made and
// the server said no".
type authedRemoteFixture struct {
	server     *httptest.Server
	anonymous  atomic.Int32
	authorized atomic.Int32
}

func (f *authedRemoteFixture) endpoint() string { return f.server.URL + "/mcp" }

func (f *authedRemoteFixture) anonymousCount() int32 { return f.anonymous.Load() }

// newAuthedRemoteFixture starts an endpoint that answers 401 to an
// unauthenticated request and speaks MCP to an authenticated one.
func newAuthedRemoteFixture(t *testing.T, token string) *authedRemoteFixture {
	t.Helper()
	fx := &authedRemoteFixture{}
	fx.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+token {
			fx.anonymous.Add(1)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		fx.authorized.Add(1)
		var req struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch req.Method {
		case "tools/list":
			writeFixtureResult(w, req.ID, `{"tools":[
				{"name":"echo","description":"Echo a message",
				 "inputSchema":{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}}
			]}`)
		case "tools/call":
			writeFixtureResult(w, req.ID, `{"content":[{"type":"text","text":"remote-authed-ok"}]}`)
		default:
			if req.ID == nil {
				w.WriteHeader(http.StatusAccepted)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0",
				"id":      json.RawMessage(req.ID),
				"error":   map[string]any{"code": -32601, "message": "Method not found"},
			})
		}
	}))
	t.Cleanup(fx.server.Close)
	return fx
}

// authedRemoteFixtureToolSchema is the input schema the fixture's
// tools/list answers with. The capability row must carry the fingerprint of
// exactly these bytes, or the drift check refuses the call before the
// credential is ever used.
const authedRemoteFixtureToolSchema = `{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}`

// seedAuthedProvider writes the rows a remote invocation needs: the install,
// the component, the credential profile, the provider that names the profile,
// and the capability that is called.
func seedAuthedProvider(t *testing.T, db *state.DB, store secrets.SecretStore, endpoint, profileID, providerID, capabilityID string) {
	t.Helper()
	ctx := context.Background()
	now := time.Now().UTC()
	const installID = "inst_user_mcp_demo_remote_1_0_0"
	if err := db.SaveInstall(ctx, &domain.InstallRecord{
		InstallID: installID, ListingID: "mcp:demo:remote-demo", Version: "1.0.0",
		Scope: domain.ScopeUser, Status: domain.InstallActive, InstalledAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("SaveInstall: %v", err)
	}
	if err := db.SaveInstallComponent(ctx, &domain.InstallComponentRecord{
		InstallID: installID, Kind: domain.ComponentMCPProvider, ComponentName: "remote-demo",
	}); err != nil {
		t.Fatalf("SaveInstallComponent: %v", err)
	}
	// The credential itself lives in the vault; the row holds a pointer.
	if _, err := store.Put(ctx, "oauth", "remote-demo", []byte(`{"access_token":"stored-token-value","token_type":"Bearer"}`)); err != nil {
		t.Fatalf("store the token: %v", err)
	}
	if err := db.SaveAuthProfile(ctx, &domain.AuthProfile{
		ProfileID:   profileID,
		ProviderID:  "remote-demo",
		ProfileType: string("oauth2"),
		SecretRef:   "secret:oauth/remote-demo",
		Status:      "valid",
		CreatedAt:   now,
		UpdatedAt:   now,
	}); err != nil {
		t.Fatalf("SaveAuthProfile: %v", err)
	}
	if err := db.SaveProvider(ctx, &domain.ProviderRecord{
		ProviderID:    providerID,
		InstallID:     installID,
		ComponentName: "remote-demo",
		Transport:     "streamable-http",
		Endpoint:      endpoint,
		AuthProfileID: profileID,
		Status:        "active",
		CreatedAt:     now,
		UpdatedAt:     now,
	}); err != nil {
		t.Fatalf("SaveProvider: %v", err)
	}
	fingerprint, err := mcpclient.FingerprintSchema(json.RawMessage(authedRemoteFixtureToolSchema))
	if err != nil {
		t.Fatalf("FingerprintSchema: %v", err)
	}
	if err := db.SaveCapability(ctx, &domain.CapabilityRecord{
		CapabilityID: capabilityID, ProviderID: providerID, Name: "echo",
		InputSchemaJSON: authedRemoteFixtureToolSchema, SchemaFingerprint: fingerprint,
		DiscoveredAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("SaveCapability: %v", err)
	}
}

// TestRemoteDialSendsTheStoredBearerToken proves the happy path: a remote
// provider that names a valid profile sends the stored token, and the call
// succeeds.
func TestRemoteDialSendsTheStoredBearerToken(t *testing.T) {
	const token = "stored-token-value"
	fx := newAuthedRemoteFixture(t, token)
	db := openState(t)
	ctx := context.Background()
	store, err := secrets.NewMemorySecretStore()
	if err != nil {
		t.Fatalf("NewMemorySecretStore: %v", err)
	}
	providerID := ProviderIDFor("inst_user_mcp_demo_remote_1_0_0", "remote-demo")
	capabilityID := string(domain.NewCapabilityID("inst_user_mcp_demo_remote_1_0_0", "remote-demo", "echo"))
	seedAuthedProvider(t, db, store, fx.endpoint(), "prof_remote-demo", providerID, capabilityID)

	result, err := Invoke(ctx, db, capabilityID, json.RawMessage(`{"message":"hi"}`),
		readOnlyOpt(), WithSecretStore(store))
	if err != nil {
		t.Fatalf("Invoke: %v", err)
	}
	if !strings.Contains(result.Output, "remote-authed-ok") {
		t.Errorf("unexpected tool output: %q", result.Output)
	}
	if got := fx.anonymousCount(); got != 0 {
		t.Errorf("%d request(s) arrived without the bearer token", got)
	}
	if fx.authorized.Load() == 0 {
		t.Error("no request carried the bearer token")
	}
}

// TestRemoteDialRefusesAMissingOrRevokedProfile proves the fail-closed half:
// the invocation is refused and NO request is made. An anonymous request would
// be answered with a 401 that reads like a broken endpoint, which is exactly
// the confusion this refusal removes.
func TestRemoteDialRefusesAMissingOrRevokedProfile(t *testing.T) {
	const token = "stored-token-value"
	fx := newAuthedRemoteFixture(t, token)
	db := openState(t)
	ctx := context.Background()
	store, err := secrets.NewMemorySecretStore()
	if err != nil {
		t.Fatalf("NewMemorySecretStore: %v", err)
	}
	providerID := ProviderIDFor("inst_user_mcp_demo_remote_1_0_0", "remote-demo")
	capabilityID := string(domain.NewCapabilityID("inst_user_mcp_demo_remote_1_0_0", "remote-demo", "echo"))
	seedAuthedProvider(t, db, store, fx.endpoint(), "prof_remote-demo", providerID, capabilityID)

	t.Run("revoked", func(t *testing.T) {
		prof, perr := db.GetAuthProfile(ctx, "prof_remote-demo")
		if perr != nil {
			t.Fatalf("GetAuthProfile: %v", perr)
		}
		prof.Status = "revoked"
		if err := db.SaveAuthProfile(ctx, prof); err != nil {
			t.Fatalf("SaveAuthProfile: %v", err)
		}
		before := fx.anonymousCount()
		_, ierr := Invoke(ctx, db, capabilityID, json.RawMessage(`{"message":"hi"}`),
			readOnlyOpt(), WithSecretStore(store))
		if ierr == nil {
			t.Fatal("Invoke dialled a remote provider whose credential was revoked")
		}
		requireTypedCode(t, ierr, CodeAuthProfileRevoked)
		if got := fx.anonymousCount(); got != before {
			t.Errorf("a request was made without the credential (%d anonymous request(s))", got-before)
		}
	})

	t.Run("credential absent from the vault", func(t *testing.T) {
		prof, perr := db.GetAuthProfile(ctx, "prof_remote-demo")
		if perr != nil {
			t.Fatalf("GetAuthProfile: %v", err)
		}
		prof.Status = "valid"
		if err := db.SaveAuthProfile(ctx, prof); err != nil {
			t.Fatalf("SaveAuthProfile: %v", err)
		}
		// The profile is valid, but the credential behind it is gone (a
		// reset vault, a purged secret). The call must still be refused.
		ref, rerr := secrets.ParseSecretRef(prof.SecretRef)
		if rerr != nil {
			t.Fatalf("ParseSecretRef: %v", rerr)
		}
		if err := store.Delete(ctx, *ref); err != nil {
			t.Fatalf("Delete the credential: %v", err)
		}
		before := fx.anonymousCount()
		_, ierr := Invoke(ctx, db, capabilityID, json.RawMessage(`{"message":"hi"}`),
			readOnlyOpt(), WithSecretStore(store))
		if ierr == nil {
			t.Fatal("Invoke dialled a remote provider whose credential could not be read")
		}
		requireTypedCode(t, ierr, CodeAuthProfileRevoked)
		if got := fx.anonymousCount(); got != before {
			t.Errorf("a request was made without the credential (%d anonymous request(s))", got-before)
		}
	})
}

// TestRemoteAuthHeadersRefuseAnAbsentProfile covers the state the schema
// normally makes impossible: a provider row naming a profile that was never
// recorded. The foreign key keeps it out of reach through the normal writers,
// so the branch is exercised directly — and it is exercised because a state
// database written by an older build must not produce an anonymous call.
func TestRemoteAuthHeadersRefuseAnAbsentProfile(t *testing.T) {
	db := openState(t)
	ctx := context.Background()
	store, err := secrets.NewMemorySecretStore()
	if err != nil {
		t.Fatalf("NewMemorySecretStore: %v", err)
	}
	o := newOptions([]Option{WithSecretStore(store)})
	_, herr := remoteAuthHeaders(ctx, db, ProviderSpec{
		ComponentName: "remote-demo",
		Endpoint:      "https://example.invalid/mcp",
		AuthProfileID: "prof_never-issued",
	}, o)
	if herr == nil {
		t.Fatal("a provider naming an absent profile was dialled anonymously")
	}
	requireTypedCode(t, herr, CodeAuthProfileMissing)
}
