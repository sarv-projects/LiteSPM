package host

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func registrarHome(t *testing.T) string {
	t.Helper()
	home := useTempHome(t)
	// Never call a real `claude` CLI from a test.
	prev := claudeCLIPath
	claudeCLIPath = func() (string, error) { return "", errors.New("no claude in tests") }
	t.Cleanup(func() { claudeCLIPath = prev })
	for _, k := range []string{"XDG_CONFIG_HOME", "OPENCODE_CONFIG_DIR", "OPENCODE_CONFIG", "CLAUDE_CONFIG_DIR", "COPILOT_HOME", "PI_CODING_AGENT_DIR", "CODEX_HOME", "GROK_HOME"} {
		t.Setenv(k, "")
	}
	return home
}

// Every registered command installs, carries the marker (or sits in an owned
// root), fills its placeholders, is idempotent, and removes cleanly.
func TestMarketplaceCommandsInstallUpgradeAndRemove(t *testing.T) {
	for _, info := range MarketplaceCommands() {
		info := info
		t.Run(info.HostID, func(t *testing.T) {
			registrarHome(t)
			ctx := context.Background()
			res, err := InstallMarketplaceCommand(ctx, info.HostID, MarketplaceCommandOptions{Binary: "/opt/litespm/bin/litespm"})
			if err != nil {
				t.Fatalf("install: %v", err)
			}
			if len(res.Written) == 0 {
				t.Fatalf("nothing written: %+v", res)
			}
			for _, p := range res.Written {
				data, err := os.ReadFile(p)
				if err != nil {
					t.Fatalf("read %s: %v", p, err)
				}
				text := string(data)
				for _, placeholder := range []string{"__LITESPM_BIN__", "__MARKER__", "__LITESPM_VERSION__"} {
					if strings.Contains(text, placeholder) {
						t.Errorf("%s still contains %s", p, placeholder)
					}
				}
				if strings.HasSuffix(p, ".json") {
					var v any
					if err := json.Unmarshal(data, &v); err != nil {
						t.Errorf("%s is not valid JSON: %v", p, err)
					}
				}
			}
			// A second install changes nothing.
			again, err := InstallMarketplaceCommand(ctx, info.HostID, MarketplaceCommandOptions{Binary: "/opt/litespm/bin/litespm"})
			if err != nil || len(again.Written) != 0 {
				t.Fatalf("second install rewrote files: %+v err=%v", again, err)
			}
			rm, err := RemoveMarketplaceCommand(ctx, info.HostID)
			if err != nil {
				t.Fatalf("remove: %v", err)
			}
			for _, p := range res.Written {
				if _, err := os.Stat(p); err == nil {
					t.Errorf("%s survived removal (removed: %v)", p, rm.Removed)
				}
			}
		})
	}
}

// A file the user wrote at a target path is never overwritten or removed.
func TestMarketplaceCommandNeverTouchesAUserFile(t *testing.T) {
	home := registrarHome(t)
	ctx := context.Background()
	path := filepath.Join(home, ".kiro", "prompts", "litespm-marketplace.md")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("my own prompt\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := InstallMarketplaceCommand(ctx, "kiro-cli", MarketplaceCommandOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Skipped) != 1 || len(res.Written) != 0 {
		t.Fatalf("user file not reported as skipped: %+v", res)
	}
	if _, err := RemoveMarketplaceCommand(ctx, "kiro-cli"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "my own prompt\n" {
		t.Fatalf("user file changed: %q err=%v", data, err)
	}
}

// An older LiteSPM's file (marker present, different content) is upgraded.
func TestMarketplaceCommandUpgradesItsOwnFile(t *testing.T) {
	home := registrarHome(t)
	path := filepath.Join(home, ".kiro", "prompts", "litespm-marketplace.md")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("<!-- "+MarketplaceCommandMarker+" v1 -->\nold\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := InstallMarketplaceCommand(context.Background(), "kiro-cli", MarketplaceCommandOptions{})
	if err != nil || len(res.Written) != 1 {
		t.Fatalf("own file not upgraded: %+v err=%v", res, err)
	}
	data, _ := os.ReadFile(path)
	if !strings.Contains(string(data), "search_catalog") {
		t.Fatalf("upgrade did not write the current body:\n%s", data)
	}
}

// Claude Code: the pane is enabled in settings.json without disturbing the
// user's other settings, and disabled again on removal.
func TestClaudeMarketplaceActivationIsSurgical(t *testing.T) {
	home := registrarHome(t)
	ctx := context.Background()
	settings := filepath.Join(home, ".claude", "settings.json")
	if err := os.MkdirAll(filepath.Dir(settings), 0o755); err != nil {
		t.Fatal(err)
	}
	orig := "{\n  // my theme\n  \"theme\": \"dark\",\n  \"enabledPlugins\": { \"other@x\": true }\n}\n"
	if err := os.WriteFile(settings, []byte(orig), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := InstallMarketplaceCommand(ctx, "claude-code", MarketplaceCommandOptions{Binary: "litespm"}); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(settings)
	text := string(data)
	for _, want := range []string{"// my theme", `"theme": "dark"`, `"other@x": true`, `"litespm-marketplace@litespm-local": true`, `"directory"`} {
		if !strings.Contains(text, want) {
			t.Errorf("settings.json lost or lacks %q:\n%s", want, text)
		}
	}
	if _, err := RemoveMarketplaceCommand(ctx, "claude-code"); err != nil {
		t.Fatal(err)
	}
	data, _ = os.ReadFile(settings)
	text = string(data)
	if strings.Contains(text, "litespm-local") {
		t.Errorf("removal left the LiteSPM entries behind:\n%s", text)
	}
	for _, want := range []string{"// my theme", `"other@x": true`} {
		if !strings.Contains(text, want) {
			t.Errorf("removal lost %q:\n%s", want, text)
		}
	}
	if _, err := os.Stat(filepath.Join(home, ".claude", "litespm-marketplace")); err == nil {
		t.Errorf("the owned plugin directory survived removal")
	}
}
