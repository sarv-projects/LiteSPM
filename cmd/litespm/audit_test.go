package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/config"
)

// A dataset that contradicts a promise must fail the audit, and the report
// must say which rule fired.
func TestAuditFailsOnADatasetThatContradictsThePromises(t *testing.T) {
	dir := t.TempDir()
	dataset := filepath.Join(dir, "catalog.json")
	rows := `[
	  {"id":"mcp:x:good","kind":"mcp","installability":"metadata_verified","source":"builtin:mcp-registry","url":"https://mcp.example.com/mcp"},
	  {"id":"mcp:x:bad","kind":"mcp","installability":"discovery_only","command":"npx","source":"builtin:mcp-registry"}
	]`
	if err := os.WriteFile(dataset, []byte(rows), 0o600); err != nil {
		t.Fatal(err)
	}

	if code := runAudit([]string{"--dataset", dataset}); code != 1 {
		t.Fatalf("the audit exit code = %d, want 1: a discovery-only row with a launch line must fail", code)
	}
}

// A sound dataset passes, and says so.
func TestAuditPassesOnASoundDataset(t *testing.T) {
	dir := t.TempDir()
	dataset := filepath.Join(dir, "catalog.json")
	rows := `[
	  {"id":"mcp:x:good","kind":"mcp","installability":"metadata_verified","source":"builtin:mcp-registry","url":"https://mcp.example.com/mcp"},
	  {"id":"plugin:x:pinned","kind":"plugin","installability":"metadata_verified","source":"git:claude-plugins-official",
	   "artifact":{"type":"git-tree","repo":"https://github.com/a/b.git","path":"plugins/x","ref":"v1","sha":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","pinned":true}}
	]`
	if err := os.WriteFile(dataset, []byte(rows), 0o600); err != nil {
		t.Fatal(err)
	}
	if code := runAudit([]string{"--dataset", dataset}); code != 0 {
		t.Fatalf("the audit exit code = %d, want 0: a sound dataset must pass", code)
	}
}

// The SARIF report is what a CI consumer reads: one run, one driver, a rule
// per scanner rule, and one result per finding.
func TestAuditWritesSARIF(t *testing.T) {
	dir := t.TempDir()
	dataset := filepath.Join(dir, "catalog.json")
	rows := `[{"id":"mcp:x:bad","kind":"mcp","installability":"discovery_only","command":"npx","source":"builtin:mcp-registry"}]`
	if err := os.WriteFile(dataset, []byte(rows), 0o600); err != nil {
		t.Fatal(err)
	}
	report := filepath.Join(dir, "audit.sarif")
	runAudit([]string{"--dataset", dataset, "--sarif", report})

	data, err := os.ReadFile(report)
	if err != nil {
		t.Fatalf("the SARIF report was not written: %v", err)
	}
	var doc struct {
		Version string `json:"version"`
		Runs    []struct {
			Tool struct {
				Driver struct {
					Name  string `json:"name"`
					Rules []struct {
						ID string `json:"id"`
					} `json:"rules"`
				} `json:"driver"`
			} `json:"tool"`
			Results []struct {
				RuleID  string `json:"ruleId"`
				Level   string `json:"level"`
				Message struct {
					Text string `json:"text"`
				} `json:"message"`
			} `json:"results"`
		} `json:"runs"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatalf("the SARIF report is not JSON: %v", err)
	}
	if doc.Version != "2.1.0" {
		t.Errorf("the SARIF version = %q, want 2.1.0", doc.Version)
	}
	if len(doc.Runs) != 1 {
		t.Fatalf("the report carries %d runs, want 1", len(doc.Runs))
	}
	run := doc.Runs[0]
	if run.Tool.Driver.Name != "litespm" {
		t.Errorf("the driver is named %q, want litespm", run.Tool.Driver.Name)
	}
	if len(run.Results) != 1 {
		t.Fatalf("the report carries %d results, want 1", len(run.Results))
	}
	if run.Results[0].RuleID != "launch-line-without-provenance" {
		t.Errorf("the result names the rule %q", run.Results[0].RuleID)
	}
	if run.Results[0].Level != "error" {
		t.Errorf("the result level = %q, want error", run.Results[0].Level)
	}
	// Every rule the scanner knows is DECLARED, so a consumer can tell
	// "checked and clean" from "not checked".
	if len(run.Tool.Driver.Rules) < 6 {
		t.Errorf("the report declares %d rule(s); every scanner rule must be declared", len(run.Tool.Driver.Rules))
	}
}

// An unknown argument is a usage error, not a finding.
func TestAuditRejectsAnUnknownArgument(t *testing.T) {
	if code := runAudit([]string{"--nonsense"}); code != 2 {
		t.Fatalf("the audit exit code = %d, want 2 for a usage error", code)
	}
}

// The dataset is read from the cache the origin served, so the audit checks
// what is published.
func TestAuditReadsTheCachedRelease(t *testing.T) {
	dir := t.TempDir()
	release := filepath.Join(dir, "v1", "releases", "rel-test-1")
	if err := os.MkdirAll(release, 0o755); err != nil {
		t.Fatal(err)
	}
	pointer := `{"releaseId":"rel-test-1","sequence":1}`
	if err := os.WriteFile(filepath.Join(dir, "v1", "current.json"), []byte(pointer), 0o600); err != nil {
		t.Fatal(err)
	}
	shard := `[{"id":"mcp:x:bad","kind":"mcp","installability":"discovery_only","command":"npx","source":"builtin:mcp-registry"}]`
	if err := os.WriteFile(filepath.Join(release, "listings-0000.json"), []byte(shard), 0o600); err != nil {
		t.Fatal(err)
	}
	manifest := `{"files":{"listings-0000.json":{"size":` + strconv.Itoa(len(shard)) + `,"digest":"sha256:x"}}}`
	if err := os.WriteFile(filepath.Join(release, "manifest.json"), []byte(manifest), 0o600); err != nil {
		t.Fatal(err)
	}

	paths := &config.PlatformPaths{DataRoot: dir, ConfigRoot: filepath.Join(dir, "config"), RuntimeRoot: filepath.Join(dir, "run")}
	rows, source, err := auditCatalogueRows(context.Background(), paths, "")
	if err != nil {
		t.Fatalf("read the cached release: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("the audit read %d row(s), want 1", len(rows))
	}
	if !strings.Contains(source, "rel-test-1") {
		t.Errorf("the source does not name the release: %q", source)
	}
}
