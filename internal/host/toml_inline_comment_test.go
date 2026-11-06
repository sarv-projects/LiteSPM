package host

// toml_inline_comment_test.go — a TOML table header with an inline comment is
// a live header, everywhere a header is matched.
//
// The defect this pins: mergeTOMLEntry, stripTOMLEntryNamed, lookupEntryAt and
// entryStateAt compared the whole trimmed line against the header text, so
//
//	[mcp_servers.demo] # managed by hand
//
// was not recognised. A second demo table was appended (invalid TOML, the host
// rejects the whole file), a collision was not detected, and `host remove`
// reported "not present" while the live bridge table stayed in the config.
// stripTOMLComment already existed for VerifySetup; these tests make it the
// single matcher for every header lookup.

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// inlineCommentedLiveConfig is the shape from the audit: a top-level key, a
// live bridge table with an inline comment, and a sibling table that must
// survive removal.
const inlineCommentedLiveConfig = `model = "gpt-5"

[mcp_servers.litespm] # do not remove
command = "/opt/litespm/litespm"
args = ["bridge", "stdio", "--host", "codex"]

[mcp_servers.other] # left alone
command = "echo"
args = ["hi"]
`

func TestTOMLHeaderMatchersIgnoreInlineComments(t *testing.T) {
	if !tomlHeaderMatches(`[mcp_servers.demo] # managed by hand`, `[mcp_servers.demo]`) {
		t.Error("a header with an inline comment must match its table")
	}
	if tomlHeaderMatches(`#[mcp_servers.demo]`, `[mcp_servers.demo]`) {
		t.Error("a commented-out header must not match")
	}
	if got := tomlHeaderOf(`[mcp_servers.demo] # managed by hand`); got != `[mcp_servers.demo]` {
		t.Errorf("tomlHeaderOf with an inline comment = %q", got)
	}
	if got := tomlHeaderOf(`# [mcp_servers.demo]`); got != "" {
		t.Errorf("tomlHeaderOf on a commented header = %q, want empty", got)
	}
}

func TestTOMLLookupFindsInlineCommentedHeader(t *testing.T) {
	spec := entrySpec{Format: FormatTOML, KeyPath: []string{"mcp_servers"}, HostID: "codex"}
	content := "model = \"gpt-5\"\n\n[mcp_servers.demo] # managed by hand\ncommand = \"echo\"\nargs = [\"hi\"]\n"

	if _, present := lookupServerEntry(spec, content, "demo"); !present {
		t.Fatalf("lookupServerEntry missed an inline-commented header:\n%s", content)
	}
	raw, present, err := entryStateFromContent(spec, content, "demo")
	if err != nil || !present {
		t.Fatalf("entryStateFromContent missed it: present=%v err=%v", present, err)
	}
	if !strings.Contains(raw, `command = "echo"`) {
		t.Fatalf("fingerprint block does not carry the entry's keys: %q", raw)
	}

	entries := tomlServerEntries(spec, content)
	if len(entries) != 1 || entries[0].Name != "demo" || entries[0].Command != "echo" {
		t.Fatalf("tomlServerEntries = %+v, want one demo entry", entries)
	}
}

func TestMergeTOMLEntryReplacesInlineCommentedHeader(t *testing.T) {
	orig := "model = \"gpt-5\"\n\n[mcp_servers.demo] # managed by hand\ncommand = \"old\"\n"
	block := "[mcp_servers.demo]\ncommand = \"/new\"\n"

	out, err := mergeTOMLEntry(orig, "[mcp_servers.demo]", block)
	if err != nil {
		t.Fatal(err)
	}
	if n := strings.Count(out, "[mcp_servers.demo]"); n != 1 {
		t.Fatalf("merged doc has %d demo headers, want exactly 1:\n%s", n, out)
	}
	if !strings.Contains(out, `command = "/new"`) || strings.Contains(out, `command = "old"`) {
		t.Fatalf("old table body not replaced:\n%s", out)
	}
	if !strings.Contains(out, `model = "gpt-5"`) {
		t.Fatalf("unrelated key lost:\n%s", out)
	}
}

func TestStripTOMLEntryNamedRemovesInlineCommentedHeader(t *testing.T) {
	out, removed, err := stripTOMLEntryNamed(inlineCommentedLiveConfig, []string{"mcp_servers"}, litespmServerName)
	if err != nil {
		t.Fatal(err)
	}
	if !removed {
		t.Fatalf("a live inline-commented bridge table was not found:\n%s", inlineCommentedLiveConfig)
	}
	if strings.Contains(out, "[mcp_servers.litespm]") || strings.Contains(out, "/opt/litespm/litespm") {
		t.Fatalf("the bridge table (or its keys) survived removal:\n%s", out)
	}
	for _, want := range []string{`model = "gpt-5"`, "[mcp_servers.other]", `command = "echo"`} {
		if !strings.Contains(out, want) {
			t.Errorf("user content %q was lost:\n%s", want, out)
		}
	}
}

// TestPlanRemovalFindsInlineCommentedBridge is the audited case end to end:
// VerifySetup reports registered, PlanRemoval finds the table, and the applied
// removal deletes it while everything else survives.
func TestPlanRemovalFindsInlineCommentedBridge(t *testing.T) {
	home := useTempHome(t)
	t.Setenv("CODEX_HOME", filepath.Join(home, ".codex"))
	t.Setenv("GROK_HOME", filepath.Join(home, ".grok"))
	ctx := context.Background()
	backups := filepath.Join(home, "backups")

	for _, tc := range tomlTestTargets(t, home) {
		t.Run(tc.name, func(t *testing.T) {
			writeConfig(t, tc.path, inlineCommentedLiveConfig)

			verify, err := tc.adapter.VerifySetup(ctx)
			if err != nil {
				t.Fatalf("VerifySetup: %v", err)
			}
			if !verify.Registered {
				t.Fatalf("the inline-commented live table must verify as registered: %+v", verify)
			}

			plan, result, err := PlanRemoval(ctx, tc.adapter, backups)
			if err != nil {
				t.Fatalf("PlanRemoval: %v", err)
			}
			if plan == nil || result == nil || !result.Removed {
				t.Fatalf("PlanRemoval did not find the inline-commented bridge table: %+v", result)
			}
			if _, err := tc.adapter.ApplySetup(ctx, plan); err != nil {
				t.Fatalf("ApplySetup: %v", err)
			}

			written, err := os.ReadFile(tc.path)
			if err != nil {
				t.Fatal(err)
			}
			got := string(written)
			if strings.Contains(got, "[mcp_servers.litespm]") || strings.Contains(got, "/opt/litespm/litespm") {
				t.Fatalf("the bridge table survived removal:\n%s", got)
			}
			for _, want := range []string{`model = "gpt-5"`, "[mcp_servers.other]", `command = "echo"`} {
				if !strings.Contains(got, want) {
					t.Errorf("user content %q was lost:\n%s", want, got)
				}
			}
		})
	}
}
