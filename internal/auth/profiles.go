package auth

// profiles.go — the read side of the credential ledger.
//
// The auth_profiles table holds POINTERS: a profile names the vault entry
// that carries the credential, and the row carries the profile's status and
// its non-sensitive metadata. A token is never in a row, never in a log, and
// never in an error message — only the reference travels.
//
// The read path lives here rather than in internal/state so the SQL stays with
// the package that owns the vocabulary, and so the CLI can list profiles
// without a second, differently-shaped query.

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/state"
)

// ListProfiles returns every recorded auth profile, oldest first.
//
// It is the read half of `litespm auth status`. The returned rows carry the
// credential REFERENCE and never the credential: nothing here reads the
// vault.
func ListProfiles(ctx context.Context, db *state.DB) ([]*domain.AuthProfile, error) {
	if db == nil {
		return nil, fmt.Errorf("list auth profiles: no state database")
	}
	rows, err := db.Raw().QueryContext(ctx, `
	SELECT profile_id, provider_id, profile_type, secret_ref, status, metadata_json, created_at, updated_at
	FROM auth_profiles ORDER BY created_at, profile_id;`)
	if err != nil {
		return nil, fmt.Errorf("list auth profiles: %w", err)
	}
	defer rows.Close()

	var out []*domain.AuthProfile
	for rows.Next() {
		var prof domain.AuthProfile
		if err := rows.Scan(&prof.ProfileID, &prof.ProviderID, &prof.ProfileType,
			&prof.SecretRef, &prof.Status, &prof.MetadataJSON, &prof.CreatedAt, &prof.UpdatedAt); err != nil {
			return nil, fmt.Errorf("list auth profiles: %w", err)
		}
		out = append(out, &prof)
	}
	return out, rows.Err()
}

// ProfileForProvider returns the profile recorded for one provider.
//
// The broker names profiles `prof_<provider>`, so this is the same lookup
// `GetAuthStatus` performs. A provider with no profile is an explicit
// not-found, never an empty profile with a blank status.
func ProfileForProvider(ctx context.Context, db *state.DB, providerID string) (*domain.AuthProfile, error) {
	if db == nil {
		return nil, fmt.Errorf("look up the auth profile: no state database")
	}
	var prof domain.AuthProfile
	err := db.Raw().QueryRowContext(ctx, `
	SELECT profile_id, provider_id, profile_type, secret_ref, status, metadata_json, created_at, updated_at
	FROM auth_profiles WHERE profile_id = ?;`, ProfileIDFor(providerID)).Scan(
		&prof.ProfileID, &prof.ProviderID, &prof.ProfileType,
		&prof.SecretRef, &prof.Status, &prof.MetadataJSON, &prof.CreatedAt, &prof.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrNotFound("auth_profile", ProfileIDFor(providerID))
		}
		return nil, fmt.Errorf("look up the auth profile: %w", err)
	}
	return &prof, nil
}

// ProfileIDFor is the profile id the broker records for a provider. It is
// exported so the CLI and the broker agree on the name without repeating the
// format in two places.
func ProfileIDFor(providerID string) string {
	return "prof_" + providerID
}

// ProvidersUsingProfile counts the provider rows that name a profile.
//
// `auth logout` needs it: a profile a provider still points at cannot have
// its row deleted (it is a foreign key), and the honest outcome is to keep
// the REVOKED row — which is precisely the state that makes the provider
// refuse to be dialled — rather than to delete the reference and leave a
// provider pointing at nothing.
func ProvidersUsingProfile(ctx context.Context, db *state.DB, profileID string) (int, error) {
	if db == nil {
		return 0, fmt.Errorf("count providers: no state database")
	}
	var n int
	if err := db.Raw().QueryRowContext(ctx,
		`SELECT COUNT(*) FROM providers WHERE auth_profile_id = ?;`, profileID).Scan(&n); err != nil {
		return 0, fmt.Errorf("count providers: %w", err)
	}
	return n, nil
}

// DeleteProfile removes a profile row. It is used only after the credential
// behind it has been purged and only when no provider names it.
func DeleteProfile(ctx context.Context, db *state.DB, profileID string) error {
	if db == nil {
		return fmt.Errorf("delete the auth profile: no state database")
	}
	if _, err := db.Raw().ExecContext(ctx,
		`DELETE FROM auth_profiles WHERE profile_id = ?;`, profileID); err != nil {
		return fmt.Errorf("delete the auth profile: %w", err)
	}
	return nil
}

// ProfileAge is the time since a profile was last touched, for a human
// report. It is a helper rather than a field because the row already carries
// the timestamps.
func ProfileAge(prof *domain.AuthProfile) time.Duration {
	if prof == nil {
		return 0
	}
	return time.Since(prof.UpdatedAt)
}
