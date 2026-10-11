package main

// lifecycle_wire_test.go — defect 10: hostLocatorFor must derive the owned
// node's address from the host registry (host.EntryLayoutForScope) at the
// install's scope, not from a hardcoded container map with a `mcpServers`
// fallback that could point at a node LiteSPM never wrote.

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
)

// TestHostLocatorForKeepsBespokeHostsByteIdentical pins the eight hosts the old
// hardcoded map covered: the registry-derived locator must be exactly what the
// map produced, so this change cannot move an already-correct address. (One
// address did move with the vendor docs, not with the refactor: OpenCode v2
// documents servers at `mcp.servers.<name>`, so its row is the migrated path.)
func TestHostLocatorForKeepsBespokeHostsByteIdentical(t *testing.T) {
	want := map[string]string{
		"claude-code": "mcpServers.demo",
		"cline":       "mcpServers.demo",
		"pi-agent":    "mcpServers.demo",
		"pi":          "mcpServers.demo",
		"opencode":    "mcp.servers.demo",
		"codex":       "mcp_servers.demo",
		"grok":        "mcp_servers.demo",
		"grok-build":  "mcp_servers.demo",
	}
	for hostID, wantLoc := range want {
		got, err := hostLocatorFor(hostID, "demo", domain.ScopeUser)
		if err != nil {
			t.Errorf("%s: hostLocatorFor: %v", hostID, err)
			continue
		}
		if got != wantLoc {
			t.Errorf("%s locator = %q, want %q", hostID, got, wantLoc)
		}
	}
}

// TestHostLocatorForLocatesTheNodeInstallServerEntryWrote is the defect 10
// round-trip. Pochi is a generic (non-bespoke) target whose container key is
// `mcp`, not the `mcpServers` the old fallback guessed. After installing an
// entry through host.InstallServerEntry, the locator hostLocatorFor derives
// must resolve to exactly that node.
func TestHostLocatorForLocatesTheNodeInstallServerEntryWrote(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))

	res, err := host.InstallServerEntry(context.Background(), "pochi",
		host.ServerEntry{Name: "demo", Command: "demo-bin", Args: []string{"--serve"}},
		host.EntryInstallOptions{Scope: domain.ScopeUser})
	if err != nil {
		t.Fatalf("InstallServerEntry(pochi): %v", err)
	}

	locator, err := hostLocatorFor("pochi", "demo", domain.ScopeUser)
	if err != nil {
		t.Fatalf("hostLocatorFor(pochi): %v", err)
	}
	if locator != "mcp.demo" {
		t.Fatalf("locator = %q, want %q (the registry's real container, not the mcpServers guess)", locator, "mcp.demo")
	}

	raw, err := os.ReadFile(res.ConfigPath)
	if err != nil {
		t.Fatalf("read written config: %v", err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("decode %s: %v", res.ConfigPath, err)
	}
	node := lookupLocator(doc, locator)
	if node == nil {
		t.Fatalf("locator %q does not resolve to any node in the written config:\n%s", locator, raw)
	}
	obj, ok := node.(map[string]any)
	if !ok || obj["command"] != "demo-bin" {
		t.Fatalf("locator %q resolved to the wrong node: %#v", locator, node)
	}
}

// lookupLocator walks a dotted locator through a decoded JSON object. It is the
// same segment-by-segment traversal an in-config address implies.
func lookupLocator(doc map[string]any, locator string) any {
	cur := any(doc)
	for _, seg := range strings.Split(locator, ".") {
		m, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur, ok = m[seg]
		if !ok {
			return nil
		}
	}
	return cur
}

// TestHostLocatorForRefusesInsteadOfGuessing: a host with no registered adapter
// must refuse a locator rather than fall back to a plausible-looking node.
func TestHostLocatorForRefusesInsteadOfGuessing(t *testing.T) {
	if _, err := hostLocatorFor("no-such-host-xyz", "demo", domain.ScopeUser); err == nil {
		t.Fatal("an unknown host must refuse a locator, not guess one")
	}
}
