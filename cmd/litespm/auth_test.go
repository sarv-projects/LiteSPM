package main

// auth_test.go — `litespm auth`: the OAuth broker's production path.
//
// The three facts this file pins:
//
//  1. `auth status` reports the stored profile: the provider, the profile id
//     and where the credential lives — and NEVER the credential.
//  2. `auth login` completes a PKCE loopback: the token endpoint answers the
//     exchange, a profile row is written, and the authorization code never
//     appears in the output.
//  3. `auth logout` revokes the credential: the token is purged from the
//     vault and the profile is gone (or kept, revoked, when a provider still
//     names it).
//
// Everything runs against a temporary database, an in-memory vault and a
// local TLS server: no network, no desktop, no real credential.

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/auth"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/secrets"
	"github.com/sarv-projects/litespm/internal/state"
)

// authTestEnv builds the environment the auth verbs run against: a temporary
// state database and an in-memory vault.
func authTestEnv(t *testing.T) *authEnv {
	t.Helper()
	db, err := state.Open(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatalf("state.Open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	store, err := secrets.NewMemorySecretStore()
	if err != nil {
		t.Fatalf("NewMemorySecretStore: %v", err)
	}
	return &authEnv{db: db, store: store}
}

// seedAuthProfile writes a profile row and the credential it points at.
func seedAuthProfile(t *testing.T, env *authEnv, provider, profileID, token string) {
	t.Helper()
	ctx := context.Background()
	if _, err := env.store.Put(ctx, "oauth", provider, []byte(`{"access_token":"`+token+`","token_type":"Bearer"}`)); err != nil {
		t.Fatalf("store the credential: %v", err)
	}
	now := time.Now().UTC()
	if err := env.db.SaveAuthProfile(ctx, &domain.AuthProfile{
		ProfileID:   profileID,
		ProviderID:  provider,
		ProfileType: "oauth2",
		SecretRef:   "secret:oauth/" + provider,
		Status:      "valid",
		CreatedAt:   now,
		UpdatedAt:   now,
	}); err != nil {
		t.Fatalf("SaveAuthProfile: %v", err)
	}
}

// TestAuthStatusReportsAStoredProfile proves the status verb names the
// provider and the profile id, and prints no token material.
func TestAuthStatusReportsAStoredProfile(t *testing.T) {
	env := authTestEnv(t)
	const token = "sk-status-canary-4c19"
	seedAuthProfile(t, env, "github", "prof_github", token)

	var out, errOut bytes.Buffer
	if code := runAuthTo(&out, &errOut, env, []string{"status"}); code != 0 {
		t.Fatalf("runAuthTo(status) = %d, want 0\nstdout:\n%s\nstderr:\n%s", code, out.String(), errOut.String())
	}
	text := out.String()
	if !strings.Contains(text, "github") {
		t.Errorf("the status does not name the provider:\n%s", text)
	}
	if !strings.Contains(text, "prof_github") {
		t.Errorf("the status does not name the profile id:\n%s", text)
	}
	if strings.Contains(text, token) {
		t.Errorf("the status printed the token:\n%s", text)
	}
	if !strings.Contains(text, "secret:oauth/github") {
		t.Errorf("the status does not report where the credential lives:\n%s", text)
	}
}

// TestAuthStatusForOneProvider proves the single-provider form, and that a
// provider with no profile is an honest non-zero answer rather than a blank
// success.
func TestAuthStatusForOneProvider(t *testing.T) {
	env := authTestEnv(t)
	const token = "sk-status-canary-4c19"
	seedAuthProfile(t, env, "github", "prof_github", token)

	var out, errOut bytes.Buffer
	if code := runAuthTo(&out, &errOut, env, []string{"status", "github"}); code != 0 {
		t.Fatalf("runAuthTo(status github) = %d, want 0\nstdout:\n%s", code, out.String())
	}
	if !strings.Contains(out.String(), "prof_github") {
		t.Errorf("the status does not name the profile id:\n%s", out.String())
	}
	if strings.Contains(out.String(), token) {
		t.Errorf("the status printed the token:\n%s", out.String())
	}

	out.Reset()
	errOut.Reset()
	if code := runAuthTo(&out, &errOut, env, []string{"status", "never-authenticated"}); code == 0 {
		t.Errorf("runAuthTo(status never-authenticated) = 0, want non-zero:\n%s", out.String())
	}
	if !strings.Contains(out.String(), "No credential is recorded") {
		t.Errorf("the refusal does not say what is missing:\n%s", out.String())
	}
}

// TestAuthLoginCompletesTheLoopback proves the full PKCE flow: the token
// endpoint answers the exchange, the profile row is written, the credential
// lands in the vault — and the authorization code never appears in the output.
func TestAuthLoginCompletesTheLoopback(t *testing.T) {
	const authorizationCode = "auth-code-9d2f7c-do-not-print"
	const accessToken = "sk-login-canary-1a2b3c"

	var gotCode string
	tokenServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		gotCode = r.Form.Get("code")
		if r.Form.Get("code_verifier") == "" {
			http.Error(w, "no PKCE verifier was sent", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":  accessToken,
			"token_type":    "Bearer",
			"expires_in":    3600,
			"refresh_token": "refresh-canary",
		})
	}))
	defer tokenServer.Close()

	env := authTestEnv(t)
	// The client trusts the test server's certificate, and the browser
	// opener plays the browser: it follows the authorization URL and
	// redirects back to the loopback listener with a code.
	env.httpClient = tokenServer.Client()
	env.openBrowser = func(authURL string) error {
		u, err := url.Parse(authURL)
		if err != nil {
			return err
		}
		q := u.Query()
		redirect, err := url.Parse(q.Get("redirect_uri"))
		if err != nil {
			return err
		}
		rq := redirect.Query()
		rq.Set("code", authorizationCode)
		rq.Set("state", q.Get("state"))
		redirect.RawQuery = rq.Encode()
		resp, err := http.Get(redirect.String())
		if err != nil {
			return err
		}
		_ = resp.Body.Close()
		return nil
	}

	var out, errOut bytes.Buffer
	code := runAuthTo(&out, &errOut, env, []string{
		"login", "github",
		"--client-id", "litespm-test",
		"--auth-url", "https://idp.invalid/authorize",
		"--token-url", tokenServer.URL + "/token",
	})
	if code != 0 {
		t.Fatalf("runAuthTo(login) = %d, want 0\nstdout:\n%s\nstderr:\n%s", code, out.String(), errOut.String())
	}
	if gotCode != authorizationCode {
		t.Errorf("the token endpoint saw code %q, want %q", gotCode, authorizationCode)
	}

	// A profile row exists and names the provider.
	prof, err := env.db.GetAuthProfile(context.Background(), "prof_github")
	if err != nil {
		t.Fatalf("GetAuthProfile: %v", err)
	}
	if prof.ProviderID != "github" {
		t.Errorf("the profile names provider %q, want %q", prof.ProviderID, "github")
	}
	if prof.Status != "valid" {
		t.Errorf("the profile status is %q, want %q", prof.Status, "valid")
	}

	// The credential is in the vault, and only the reference is anywhere else.
	ref, err := secrets.ParseSecretRef(prof.SecretRef)
	if err != nil {
		t.Fatalf("ParseSecretRef: %v", err)
	}
	raw, err := env.store.Get(context.Background(), *ref)
	if err != nil {
		t.Fatalf("the credential was not stored: %v", err)
	}
	if !strings.Contains(string(raw), accessToken) {
		t.Errorf("the stored credential does not carry the access token: %s", raw)
	}

	// The authorization code never appears in the output.
	if strings.Contains(out.String(), authorizationCode) {
		t.Errorf("the authorization code appears in the output:\n%s", out.String())
	}
	if strings.Contains(errOut.String(), authorizationCode) {
		t.Errorf("the authorization code appears on stderr:\n%s", errOut.String())
	}
	// And neither does the token.
	if strings.Contains(out.String(), accessToken) {
		t.Errorf("the access token appears in the output:\n%s", out.String())
	}
}

// TestAuthLoginFailsClosedWhenTheTokenEndpointRefuses proves the flow does
// not report a login that did not happen.
func TestAuthLoginFailsClosedWhenTheTokenEndpointRefuses(t *testing.T) {
	tokenServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "invalid_grant", http.StatusBadRequest)
	}))
	defer tokenServer.Close()

	env := authTestEnv(t)
	env.httpClient = tokenServer.Client()
	env.openBrowser = func(authURL string) error {
		u, _ := url.Parse(authURL)
		q := u.Query()
		redirect, _ := url.Parse(q.Get("redirect_uri"))
		rq := redirect.Query()
		rq.Set("code", "the-code")
		rq.Set("state", q.Get("state"))
		redirect.RawQuery = rq.Encode()
		resp, err := http.Get(redirect.String())
		if err == nil {
			_ = resp.Body.Close()
		}
		return nil
	}

	var out, errOut bytes.Buffer
	code := runAuthTo(&out, &errOut, env, []string{
		"login", "github",
		"--client-id", "litespm-test",
		"--auth-url", "https://idp.invalid/authorize",
		"--token-url", tokenServer.URL + "/token",
	})
	if code == 0 {
		t.Fatalf("a refused token exchange reported success:\n%s", out.String())
	}
	if !strings.Contains(errOut.String(), "token exchange failed") {
		t.Errorf("the failure is not reported as a token-exchange failure:\n%s", errOut.String())
	}
	// No profile row was written for a login that did not happen.
	if _, err := env.db.GetAuthProfile(context.Background(), "prof_github"); err == nil {
		t.Error("a failed login left a profile row behind")
	}
}

// TestAuthLogoutRevokesTheCredential proves the revocation purges the token
// from the vault and drops the profile row.
func TestAuthLogoutRevokesTheCredential(t *testing.T) {
	env := authTestEnv(t)
	const token = "sk-logout-canary-77aa"
	seedAuthProfile(t, env, "github", "prof_github", token)

	var out, errOut bytes.Buffer
	if code := runAuthTo(&out, &errOut, env, []string{"logout", "prof_github"}); code != 0 {
		t.Fatalf("runAuthTo(logout) = %d, want 0\nstdout:\n%s\nstderr:\n%s", code, out.String(), errOut.String())
	}
	if strings.Contains(out.String(), token) {
		t.Errorf("the logout printed the token:\n%s", out.String())
	}
	// The row is gone.
	if _, err := env.db.GetAuthProfile(context.Background(), "prof_github"); err == nil {
		t.Error("the profile row survived the logout")
	}
	// And the credential is gone from the vault.
	ref, err := secrets.ParseSecretRef("secret:oauth/github")
	if err != nil {
		t.Fatalf("ParseSecretRef: %v", err)
	}
	if _, err := env.store.Get(context.Background(), *ref); err == nil {
		t.Error("the credential survived the logout in the vault")
	}
}

// TestAuthLogoutKeepsARevokedProfileAProviderStillNames proves the FK case:
// the credential is purged, the row is kept as revoked, and the provider that
// names it is left refusing rather than pointing at nothing.
func TestAuthLogoutKeepsARevokedProfileAProviderStillNames(t *testing.T) {
	env := authTestEnv(t)
	const token = "sk-logout-canary-77aa"
	seedAuthProfile(t, env, "github", "prof_github", token)

	ctx := context.Background()
	now := time.Now().UTC()
	if err := env.db.SaveInstall(ctx, &domain.InstallRecord{
		InstallID: "inst_user_mcp_demo_github_1_0_0", ListingID: "mcp:demo:github",
		Version: "1.0.0", Scope: domain.ScopeUser, Status: domain.InstallActive,
		InstalledAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("SaveInstall: %v", err)
	}
	if err := env.db.SaveInstallComponent(ctx, &domain.InstallComponentRecord{
		InstallID: "inst_user_mcp_demo_github_1_0_0", Kind: domain.ComponentMCPProvider, ComponentName: "github",
	}); err != nil {
		t.Fatalf("SaveInstallComponent: %v", err)
	}
	if err := env.db.SaveProvider(ctx, &domain.ProviderRecord{
		ProviderID: "prov_github", InstallID: "inst_user_mcp_demo_github_1_0_0",
		ComponentName: "github", Transport: "streamable-http", Endpoint: "https://example.invalid/mcp",
		AuthProfileID: "prof_github", Status: "active", CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("SaveProvider: %v", err)
	}

	var out, errOut bytes.Buffer
	if code := runAuthTo(&out, &errOut, env, []string{"logout", "prof_github"}); code != 0 {
		t.Fatalf("runAuthTo(logout) = %d, want 0\nstdout:\n%s\nstderr:\n%s", code, out.String(), errOut.String())
	}
	prof, err := env.db.GetAuthProfile(ctx, "prof_github")
	if err != nil {
		t.Fatalf("the profile row was deleted even though a provider names it: %v", err)
	}
	if prof.Status != "revoked" {
		t.Errorf("the kept profile has status %q, want %q", prof.Status, "revoked")
	}
	// The credential is still purged.
	ref, _ := secrets.ParseSecretRef(prof.SecretRef)
	if _, err := env.store.Get(ctx, *ref); err == nil {
		t.Error("the credential survived the logout in the vault")
	}
}

// TestAuthUsageErrorsAreUsageErrors proves the parser is strict: an unknown
// flag, a missing required flag and a second positional are all exit 2.
func TestAuthUsageErrorsAreUsageErrors(t *testing.T) {
	env := authTestEnv(t)
	cases := [][]string{
		{"login"},
		{"login", "github"},
		{"login", "github", "--client-id", "x", "--auth-url", "https://a.invalid", "--nope"},
		{"login", "github", "--client-id"},
		{"status", "github", "extra"},
		{"logout"},
		{"logout", "prof_github", "extra"},
		{"nonsense"},
	}
	for _, args := range cases {
		var out, errOut bytes.Buffer
		if code := runAuthTo(&out, &errOut, env, args); code != 2 {
			t.Errorf("runAuthTo(%v) = %d, want 2 (a usage error)", args, code)
		}
	}
}

// TestAuthLoginReadsTheClientSecretFromTheEnvironment proves the secret can
// be passed by variable name, so it never has to be typed on a command line.
func TestAuthLoginReadsTheClientSecretFromTheEnvironment(t *testing.T) {
	t.Setenv("LITESPM_TEST_CLIENT_SECRET", "shhh-this-is-the-secret")
	opts, err := parseAuthLoginArgs([]string{
		"github",
		"--client-id", "litespm-test",
		"--auth-url", "https://idp.invalid/authorize",
		"--token-url", "https://idp.invalid/token",
		"--client-secret-env", "LITESPM_TEST_CLIENT_SECRET",
	})
	if err != nil {
		t.Fatalf("parseAuthLoginArgs: %v", err)
	}
	if opts.clientSecret != "shhh-this-is-the-secret" {
		t.Errorf("the client secret was not read from the environment")
	}
	// A variable that is not set is a usage error, not an empty secret.
	if _, err := parseAuthLoginArgs([]string{
		"github",
		"--client-id", "litespm-test",
		"--auth-url", "https://idp.invalid/authorize",
		"--token-url", "https://idp.invalid/token",
		"--client-secret-env", "LITESPM_TEST_CLIENT_SECRET_THAT_IS_NOT_SET",
	}); err == nil {
		t.Error("an unset client-secret variable was accepted")
	}
}

// TestAuthProfileListingNeverCarriesACredential proves the read path of the
// credential ledger returns pointers, not tokens.
func TestAuthProfileListingNeverCarriesACredential(t *testing.T) {
	env := authTestEnv(t)
	const token = "sk-list-canary-99"
	seedAuthProfile(t, env, "github", "prof_github", token)

	profiles, err := auth.ListProfiles(context.Background(), env.db)
	if err != nil {
		t.Fatalf("ListProfiles: %v", err)
	}
	if len(profiles) != 1 {
		t.Fatalf("ListProfiles returned %d profiles, want 1", len(profiles))
	}
	if profiles[0].SecretRef != "secret:oauth/github" {
		t.Errorf("the profile carries %q, want the reference %q", profiles[0].SecretRef, "secret:oauth/github")
	}
	encoded, err := json.Marshal(profiles[0])
	if err != nil {
		t.Fatalf("marshal the profile: %v", err)
	}
	if strings.Contains(string(encoded), token) {
		t.Errorf("the serialized profile carries the token: %s", encoded)
	}
	_ = os.Getenv("PATH")
}
