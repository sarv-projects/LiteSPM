package main

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/state"
)

func TestResolveRemoveIDAcceptsListingID(t *testing.T) {
	db, err := state.Open(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	rec := &domain.InstallRecord{
		InstallID: "inst_user_demo_abc123",
		ListingID: "mcp:example:demo",
		Kind:      domain.KindMCP,
		Version:   "1.0.0",
		Scope:     domain.ScopeUser,
		InstalledAt: time.Now(),
	}
	if err := db.SaveInstall(ctx, rec); err != nil {
		t.Fatal(err)
	}

	got, err := resolveRemoveID(ctx, db, "mcp:example:demo")
	if err != nil {
		t.Fatalf("listing id must resolve: %v", err)
	}
	if got != rec.InstallID {
		t.Fatalf("got %q want %q", got, rec.InstallID)
	}
	if got, err := resolveRemoveID(ctx, db, rec.InstallID); err != nil || got != rec.InstallID {
		t.Fatalf("install id must resolve: %q %v", got, err)
	}
	if _, err := resolveRemoveID(ctx, db, "mcp:example:missing"); err == nil {
		t.Fatal("unknown listing must be refused")
	}
}
