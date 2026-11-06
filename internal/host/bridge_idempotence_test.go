package host

// bridge_idempotence_test.go — installing the bridge twice must not grow the
// user's config: the block replacement must be a fixed point (H6).

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func applyBridgePlan(t *testing.T, plan *HostChangePlan) {
	t.Helper()
	if err := os.WriteFile(plan.ConfigPath, []byte(plan.ProposedContent), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestCodexPlanSetupAtIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.toml")
	backups := filepath.Join(dir, "backups")
	if err := os.WriteFile(path, []byte("model = \"gpt-5\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	adapter := &CodexAdapter{}
	first, err := adapter.PlanSetupAt(context.Background(), "/usr/local/bin/litespm", backups, path)
	if err != nil {
		t.Fatal(err)
	}
	applyBridgePlan(t, first)

	second, err := adapter.PlanSetupAt(context.Background(), "/usr/local/bin/litespm", backups, path)
	if err != nil {
		t.Fatal(err)
	}
	if first.ProposedContent != second.ProposedContent {
		t.Fatalf("a re-run changed the config:\nfirst : %q\nsecond: %q", first.ProposedContent, second.ProposedContent)
	}
	applyBridgePlan(t, second)
	if n := strings.Count(second.ProposedContent, "[mcp_servers.litespm]"); n != 1 {
		t.Fatalf("expected exactly one bridge table, found %d in %q", n, second.ProposedContent)
	}
}

func TestGrokBuildPlanSetupAtIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.toml")
	backups := filepath.Join(dir, "backups")
	// A following table proves the block is replaced in the middle of a file,
	// not just at the end.
	initial := "model = \"grok-4\"\n\n[mcp_servers.litespm]\ncommand = \"/old/litespm\"\nargs = [\"bridge\", \"stdio\", \"--host\", \"grok-build\"]\n\n[marketplace]\nenabled = true\n"
	if err := os.WriteFile(path, []byte(initial), 0o600); err != nil {
		t.Fatal(err)
	}

	adapter := &GrokBuildAdapter{}
	first, err := adapter.PlanSetupAt(context.Background(), "/usr/local/bin/litespm", backups, path)
	if err != nil {
		t.Fatal(err)
	}
	applyBridgePlan(t, first)

	second, err := adapter.PlanSetupAt(context.Background(), "/usr/local/bin/litespm", backups, path)
	if err != nil {
		t.Fatal(err)
	}
	if first.ProposedContent != second.ProposedContent {
		t.Fatalf("a re-run changed the config:\nfirst : %q\nsecond: %q", first.ProposedContent, second.ProposedContent)
	}
	if !strings.Contains(second.ProposedContent, "[marketplace]") {
		t.Fatalf("the following table was lost: %q", second.ProposedContent)
	}
	applyBridgePlan(t, second)
	third, err := adapter.PlanSetupAt(context.Background(), "/usr/local/bin/litespm", backups, path)
	if err != nil {
		t.Fatal(err)
	}
	if third.ProposedContent != second.ProposedContent {
		t.Fatalf("a third run changed the config:\nsecond: %q\nthird : %q", second.ProposedContent, third.ProposedContent)
	}
}
