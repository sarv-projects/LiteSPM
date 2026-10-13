package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/skills"
)

// auditRows returns every audit_events row as (action, targetRef, decision,
// approvalID, outcome) tuples, oldest first.
func auditRows(t *testing.T, h *harness) [][]string {
	t.Helper()
	rows, err := h.db.Raw().Query(
		"SELECT action, target_ref, decision, approval_id, outcome FROM audit_events ORDER BY timestamp, event_id")
	if err != nil {
		t.Fatalf("read audit_events: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var out [][]string
	for rows.Next() {
		var action, target, decision, outcome string
		var approval sqlNullString
		if err := rows.Scan(&action, &target, &decision, &approval, &outcome); err != nil {
			t.Fatalf("scan audit row: %v", err)
		}
		out = append(out, []string{action, target, decision, approval.value(), outcome})
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate audit rows: %v", err)
	}
	return out
}

// sqlNullString is a minimal nullable-string scanner so this file needs no
// database/sql import of the internal nullable type.
type sqlNullString struct {
	Valid bool
	Value string
}

func (s *sqlNullString) Scan(v any) error {
	switch t := v.(type) {
	case nil:
		s.Valid, s.Value = false, ""
	case string:
		s.Valid, s.Value = true, t
	case []byte:
		s.Valid, s.Value = true, string(t)
	default:
		s.Valid, s.Value = false, ""
	}
	return nil
}

func (s *sqlNullString) value() string {
	if !s.Valid {
		return ""
	}
	return s.Value
}

func findAuditRow(rows [][]string, action string) []string {
	for _, r := range rows {
		if r[0] == action {
			return r
		}
	}
	return nil
}

// A completed install writes one audit_events row that names the listing, the
// approval that authorized it, and that it landed. Before RecordAuditEvent was
// wired, this table had no production caller at all: STATUS.md §1/§4 recorded
// audit_events as unwired, which was accurate.
func TestInstallExecuteWritesAuditEvent(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	for _, a := range skills.AgentTargets() {
		if a.EnvVar != "" {
			t.Setenv(a.EnvVar, "")
		}
	}
	if err := os.MkdirAll(filepath.Join(home, ".cursor"), 0o755); err != nil {
		t.Fatal(err)
	}

	skillDir := filepath.Join(t.TempDir(), "audited-skill")
	writeTestSkill(t, skillDir, "audited-skill", "installed through the daemon")
	const listingID = "skill:test:audited-skill"
	h := newHarnessWith(t, []*domain.Listing{{
		SchemaVersion:  2,
		ID:             listingID,
		Kind:           domain.KindSkill,
		Name:           "audited-skill",
		Summary:        "audit fixture",
		Source:         domain.SourceReference{SourceID: "test", UpstreamID: "audited-skill", URL: skillDir},
		Versions:       []domain.VersionSummary{{Version: "1.0.0"}},
		Installability: domain.InstallabilityMetadataVerified,
	}})
	ctx := context.Background()

	if before := auditRows(t, h); len(before) != 0 {
		t.Fatalf("audit log should start empty, found %d rows: %v", len(before), before)
	}

	var plan domain.InstallPlan
	if err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{
		"id": listingID, "version": "1.0.0", "scope": "user",
	}, &plan); err != nil {
		t.Fatalf("prepare_plan failed: %v", err)
	}
	approvalID := approvePlanAsHuman(t, h.db, &plan)

	var result map[string]any
	if err := h.client.Call(ctx, "install.execute",
		map[string]any{"planId": plan.PlanID, "approvalToken": approvalID}, &result); err != nil {
		t.Fatalf("install.execute failed: %v", err)
	}

	row := findAuditRow(auditRows(t, h), "package.install")
	if row == nil {
		t.Fatal("no package.install audit event was written for a completed install")
	}
	if row[1] != listingID {
		t.Errorf("audit target = %q, want %q", row[1], listingID)
	}
	if row[2] != "allow" {
		t.Errorf("audit decision = %q, want %q", row[2], "allow")
	}
	if row[3] != approvalID {
		t.Errorf("audit approval = %q, want the approval that authorized it %q", row[3], approvalID)
	}
	if row[4] != "ok" {
		t.Errorf("audit outcome = %q, want %q", row[4], "ok")
	}
}

// A refused install is audited as a denial, so the log distinguishes "the
// human approved and it landed" from "the gate stopped it" — which is the
// whole point of an audit trail.
func TestInstallExecuteRefusalIsAuditedAsDeny(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	for _, a := range skills.AgentTargets() {
		if a.EnvVar != "" {
			t.Setenv(a.EnvVar, "")
		}
	}
	if err := os.MkdirAll(filepath.Join(home, ".cursor"), 0o755); err != nil {
		t.Fatal(err)
	}

	skillDir := filepath.Join(t.TempDir(), "refused-skill")
	writeTestSkill(t, skillDir, "refused-skill", "never installs")
	const listingID = "skill:test:refused-skill"
	h := newHarnessWith(t, []*domain.Listing{{
		SchemaVersion:  2,
		ID:             listingID,
		Kind:           domain.KindSkill,
		Name:           "refused-skill",
		Summary:        "audit refusal fixture",
		Source:         domain.SourceReference{SourceID: "test", UpstreamID: "refused-skill", URL: skillDir},
		Versions:       []domain.VersionSummary{{Version: "1.0.0"}},
		Installability: domain.InstallabilityMetadataVerified,
	}})
	ctx := context.Background()

	var plan domain.InstallPlan
	if err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{
		"id": listingID, "version": "1.0.0", "scope": "user",
	}, &plan); err != nil {
		t.Fatalf("prepare_plan failed: %v", err)
	}

	// No approval: the agent path must refuse before any effect.
	var raw map[string]any
	if err := h.client.Call(ctx, "install.execute", map[string]any{"planId": plan.PlanID}, &raw); err == nil {
		t.Fatal("install.execute succeeded with no recorded approval; the gate is bypassable")
	}

	row := findAuditRow(auditRows(t, h), "package.install")
	if row == nil {
		t.Fatal("a refused install wrote no audit event")
	}
	if row[2] != "deny" {
		t.Errorf("audit decision = %q, want %q for a refused install", row[2], "deny")
	}
	if row[4] == "ok" {
		t.Errorf("audit outcome = %q; a refused install must not be recorded as ok", row[4])
	}
	if _, err := os.Stat(filepath.Join(home, ".cursor", "skills", "refused-skill")); err == nil {
		t.Error("the refused skill was written to disk anyway")
	}
}
