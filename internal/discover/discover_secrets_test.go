package discover

// discover_secrets_test.go — the secret lifecycle's last rule: a reference is
// resolved at the last possible moment, into the child process's environment
// and nowhere else.
//
// The three facts this file pins:
//
//  1. A `secret:<ns>/<key>` reference in a provider's recorded environment
//     reaches the spawned server as the VALUE.
//  2. The reference itself never reaches the child: a server that printed its
//     environment would show the pointer, not the secret.
//  3. A reference that cannot be resolved fails the launch with a typed error
//     and the provider is NOT started — never started with the reference
//     string, never started with the variable simply absent.

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/secrets"
	"github.com/sarv-projects/litespm/internal/state"
)

// secretCanaryValue is the value the fake vault holds. It is deliberately
// recognisable: if it turns up in a state row, a log line or an error
// message, the test says so.
const secretCanaryValue = "sk-live-canary-4f2a91"

// newSecretStore returns an in-memory vault holding one key.
func newSecretStore(t *testing.T, namespace, key, value string) *secrets.MemorySecretStore {
	t.Helper()
	store, err := secrets.NewMemorySecretStore()
	if err != nil {
		t.Fatalf("NewMemorySecretStore: %v", err)
	}
	if _, err := store.Put(context.Background(), namespace, key, []byte(value)); err != nil {
		t.Fatalf("store the secret: %v", err)
	}
	return store
}

// TestLaunchResolvesSecretReferences proves the resolution happens at launch
// and that the resolved value stays in the child process.
func TestLaunchResolvesSecretReferences(t *testing.T) {
	server := buildStrictMCPServer(t)
	db := openState(t)
	ctx := context.Background()
	installID := "inst_user_mcp_demo_strict_1_0_0"
	seedInstall(t, db, installID)

	store := newSecretStore(t, "acme", "canary", secretCanaryValue)
	const reference = "secret:acme/canary"

	found, err := Discover(ctx, db, ProviderSpec{
		InstallID: installID, ComponentName: "strict", Command: server, Transport: "stdio",
		Env: map[string]string{"LITESPM_DISCOVER_CANARY": reference},
	}, WithSecretStore(store))
	if err != nil {
		t.Fatalf("Discover: %v", err)
	}

	result, err := Invoke(ctx, db, found.Capabilities[0].CapabilityID, json.RawMessage(`{"message":"hi"}`),
		readOnlyOpt(), WithSecretStore(store))
	if err != nil {
		t.Fatalf("Invoke: %v", err)
	}

	// The child received the VALUE.
	if !strings.Contains(result.Output, secretCanaryValue) {
		t.Errorf("the spawned server did not receive the resolved secret; output was %q", result.Output)
	}
	// The child did NOT receive the reference.
	if strings.Contains(result.Output, reference) {
		t.Errorf("the spawned server received the secret REFERENCE %q; output was %q", reference, result.Output)
	}
	// The reference never becomes a value in the output either.
	if strings.Contains(result.Output, "secret:") {
		t.Errorf("the output carries a secret reference: %q", result.Output)
	}

	// The state row records the REFERENCE (it is the durable pointer), never
	// the value. A value in a row is a value in a file.
	provider, err := db.GetProvider(ctx, found.ProviderID)
	if err != nil {
		t.Fatalf("GetProvider: %v", err)
	}
	if strings.Contains(provider.EnvJSON, secretCanaryValue) {
		t.Errorf("the secret VALUE reached the provider row: %s", provider.EnvJSON)
	}
	if !strings.Contains(provider.EnvJSON, reference) {
		t.Errorf("the provider row does not record the reference, so a later Invoke could not resolve it: %s", provider.EnvJSON)
	}
}

// TestLaunchRefusesAnUnresolvableSecretReference proves the fail-closed rule:
// a reference the vault cannot resolve stops the launch, and the provider is
// not started with the reference and not started with the variable absent.
func TestLaunchRefusesAnUnresolvableSecretReference(t *testing.T) {
	server := buildStrictMCPServer(t)
	db := openState(t)
	ctx := context.Background()
	installID := "inst_user_mcp_demo_strict_1_0_0"
	seedInstall(t, db, installID)

	// A vault that holds nothing: the reference names a key that is not there.
	store, err := secrets.NewMemorySecretStore()
	if err != nil {
		t.Fatalf("NewMemorySecretStore: %v", err)
	}

	_, derr := Discover(ctx, db, ProviderSpec{
		InstallID: installID, ComponentName: "strict", Command: server, Transport: "stdio",
		Env: map[string]string{"LITESPM_DISCOVER_CANARY": "secret:acme/missing"},
	}, WithSecretStore(store))
	if derr == nil {
		t.Fatal("Discover started a provider whose secret reference could not be resolved")
	}
	var lerr *domain.LPSMError
	if !errors.As(derr, &lerr) {
		t.Fatalf("expected a typed error, got %T: %v", derr, derr)
	}
	if lerr.Code != CodeSecretUnresolved {
		t.Errorf("error code %q, want %q", lerr.Code, CodeSecretUnresolved)
	}
	// The message names the reference (a pointer) and never a value.
	if strings.Contains(derr.Error(), "secret:acme/missing") == false {
		t.Errorf("the refusal does not name the reference it could not resolve: %v", derr)
	}

	// Nothing was written: a server that never ran has no rows.
	requireZeroRows(t, db)
}

// TestLaunchRefusesASecretReferenceWithoutAStore proves the second fail-closed
// case: no vault at all is a refusal, not a launch with the reference in the
// environment.
func TestLaunchRefusesASecretReferenceWithoutAStore(t *testing.T) {
	server := buildStrictMCPServer(t)
	db := openState(t)
	ctx := context.Background()
	installID := "inst_user_mcp_demo_strict_1_0_0"
	seedInstall(t, db, installID)

	_, derr := Discover(ctx, db, ProviderSpec{
		InstallID: installID, ComponentName: "strict", Command: server, Transport: "stdio",
		Env: map[string]string{"LITESPM_DISCOVER_CANARY": "secret:acme/canary"},
	})
	if derr == nil {
		t.Fatal("Discover started a provider whose secret reference had no vault to resolve it")
	}
	var lerr *domain.LPSMError
	if !errors.As(derr, &lerr) || lerr.Code != CodeSecretUnresolved {
		t.Fatalf("expected %s, got %v", CodeSecretUnresolved, derr)
	}
	requireZeroRows(t, db)
}

// TestSecretValueNeverReachesAnErrorMessage proves the error path does not
// leak: a failed resolution names the reference and never a value.
func TestSecretValueNeverReachesAnErrorMessage(t *testing.T) {
	db := openState(t)
	ctx := context.Background()
	installID := "inst_user_mcp_demo_strict_1_0_0"
	seedInstall(t, db, installID)

	store := newSecretStore(t, "acme", "canary", secretCanaryValue)
	// A dangerous variable name is refused by the vault's own rules, and the
	// refusal must not carry the value either.
	_, derr := Discover(ctx, db, ProviderSpec{
		InstallID: installID, ComponentName: "strict", Command: "true", Transport: "stdio",
		Env: map[string]string{"PATH": "secret:acme/canary"},
	}, WithSecretStore(store))
	if derr == nil {
		t.Fatal("Discover injected a secret into a dangerous environment variable")
	}
	if strings.Contains(derr.Error(), secretCanaryValue) {
		t.Errorf("the error message carries the secret value: %v", derr)
	}
	var _ = state.DB{}
}
