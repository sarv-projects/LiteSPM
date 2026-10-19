package discover

// auth.go — the remote half of the credential lifecycle.
//
// A remote (URL) MCP provider is the only kind that authenticates over the
// wire, and it authenticates with a bearer token that lives in the platform
// vault. The row that describes the provider names a PROFILE, never a token:
// the token is read from the vault at dial time and exists only in the
// request that carries it.
//
// The rule that shapes this file is the one an endpoint's 401 hides: a
// provider that names a profile and cannot use it is REFUSED. The request is
// never made anonymously, because an anonymous request to an endpoint that
// expects a credential is a different request — and its 401 reads like a
// broken endpoint, which sends the operator debugging a network that is fine.

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/sarv-projects/litespm/internal/auth"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/secrets"
	"github.com/sarv-projects/litespm/internal/state"
)

// Remote credential failure codes. domain has no remote-credential code
// today and internal/domain belongs to another lane, so the codes are minted
// here through domain.NewError (which derives the category from the code).
// Both satisfy schemas/errors.schema.json's ^LPSM-[A-Z]+-[A-Z0-9_-]+$
// pattern.
const (
	// CodeAuthProfileMissing is a provider that names a credential profile
	// which is not in the state database. The request is refused: it is
	// never made anonymously, because an anonymous call to an endpoint that
	// expects a credential is a different request, not the same one without
	// a header.
	CodeAuthProfileMissing = "LPSM-AUTH-PROFILE-MISSING"
	// CodeAuthProfileRevoked is a provider that names a credential profile
	// which exists but cannot supply a usable credential: it is revoked or
	// expired, or the vault no longer holds the token behind it. The request
	// is refused, not downgraded to an anonymous one.
	CodeAuthProfileRevoked = "LPSM-AUTH-PROFILE-REVOKED"
)

// remoteAuthHeaders resolves the credential a remote provider authenticates
// with and returns the request headers that carry it.
//
// A provider that names NO profile expects no credential: the request goes out
// exactly as it did before, with no Authorization header. A provider that
// names a profile is a provider that expects one, so a profile that is
// missing, revoked, expired or unreadable is a REFUSAL.
//
// The token lives in the returned header map for the life of the call. It is
// never written to a row, a plan, a log or a receipt.
func remoteAuthHeaders(ctx context.Context, db *state.DB, spec ProviderSpec, o *options) (map[string]string, error) {
	profileID := strings.TrimSpace(spec.AuthProfileID)
	if profileID == "" {
		return nil, nil
	}
	details := map[string]any{
		"component":  spec.ComponentName,
		"profileId":  profileID,
		"endpoint":   strings.TrimSpace(spec.Endpoint),
		"providerId": spec.InstallID,
	}
	prof, err := db.GetAuthProfile(ctx, profileID)
	if err != nil {
		e := domain.NewError(CodeAuthProfileMissing,
			fmt.Sprintf("provider %q authenticates with profile %q, which is not recorded; the request was refused rather than made anonymously",
				spec.ComponentName, profileID), details)
		e.Cause = err
		return nil, e
	}
	if prof.Status != "valid" {
		e := domain.NewError(CodeAuthProfileRevoked,
			fmt.Sprintf("provider %q authenticates with profile %q, whose status is %q; the request was refused rather than made anonymously",
				spec.ComponentName, profileID, prof.Status), details)
		return nil, e
	}
	if o == nil || o.secrets == nil {
		e := domain.NewError(CodeAuthProfileRevoked,
			fmt.Sprintf("provider %q authenticates with profile %q, but no credential vault is available; the request was refused rather than made anonymously",
				spec.ComponentName, profileID), details)
		return nil, e
	}
	ref, err := secrets.ParseSecretRef(prof.SecretRef)
	if err != nil {
		e := domain.NewError(CodeAuthProfileRevoked,
			fmt.Sprintf("profile %q names a credential that cannot be read; the request was refused rather than made anonymously", profileID), details)
		e.Cause = err
		return nil, e
	}
	raw, err := o.secrets.Get(ctx, *ref)
	if err != nil {
		e := domain.NewError(CodeAuthProfileRevoked,
			fmt.Sprintf("the credential for profile %q could not be read; the request was refused rather than made anonymously", profileID), details)
		e.Cause = err
		return nil, e
	}
	var token auth.TokenResponse
	if err := json.Unmarshal(raw, &token); err != nil {
		e := domain.NewError(CodeAuthProfileRevoked,
			fmt.Sprintf("the credential for profile %q is not a readable token document; the request was refused rather than made anonymously", profileID), details)
		e.Cause = err
		return nil, e
	}
	if strings.TrimSpace(token.AccessToken) == "" {
		e := domain.NewError(CodeAuthProfileRevoked,
			fmt.Sprintf("the credential for profile %q carries no access token; the request was refused rather than made anonymously", profileID), details)
		return nil, e
	}
	return map[string]string{"Authorization": "Bearer " + token.AccessToken}, nil
}
