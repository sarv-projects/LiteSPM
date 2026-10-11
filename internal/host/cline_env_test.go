package host

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

// clearClineEnvOverrides blanks every Cline path override so a test's outcome
// depends only on what the test sets. t.Setenv restores the ambient values
// afterwards, and os.Getenv("") behaves like an unset variable in DetectConfig.
func clearClineEnvOverrides(t *testing.T) {
	t.Helper()
	t.Setenv("CLINE_MCP_SETTINGS_PATH", "")
	t.Setenv("CLINE_DATA_DIR", "")
	t.Setenv("CLINE_DIR", "")
}

// TestClineDetectConfigCLINEDir pins CLINE_DIR, which replaces ~/.cline/ wholesale:
// with it set the MCP settings file is $CLINE_DIR/data/settings/cline_mcp_settings.json.
func TestClineDetectConfigCLINEDir(t *testing.T) {
	home := useTempHome(t)
	clearClineEnvOverrides(t)
	clineDir := filepath.Join(home, "custom-cline")
	t.Setenv("CLINE_DIR", clineDir)
	want := filepath.Join(clineDir, "data", "settings", "cline_mcp_settings.json")

	adapter := &ClineAdapter{}

	t.Run("existing file", func(t *testing.T) {
		writeConfig(t, want, `{"mcpServers":{}}`)
		got, err := adapter.DetectConfig(context.Background(), domain.ScopeUser)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("CLINE_DIR ignored: got %s, want %s", got, want)
		}
	})

	t.Run("creation fallback names CLINE_DIR path", func(t *testing.T) {
		// Nothing exists anywhere: the file we would create must be under
		// CLINE_DIR, not the default ~/.cline path.
		clearClineEnvOverrides(t)
		t.Setenv("CLINE_DIR", clineDir)
		got, err := adapter.DetectConfig(context.Background(), domain.ScopeUser)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("CLINE_DIR creation path: got %s, want %s", got, want)
		}
	})
}

// TestClineEnvPrecedence pins the documented-most-specific-wins order among the
// three overrides: CLINE_MCP_SETTINGS_PATH > CLINE_DATA_DIR > CLINE_DIR.
func TestClineEnvPrecedence(t *testing.T) {
	home := useTempHome(t)
	settingsPath := filepath.Join(home, "overrides", "mcp.json")
	dataDir := filepath.Join(home, "overrides", "data")
	clineDir := filepath.Join(home, "overrides", "cline")

	setAll := func(t *testing.T) {
		clearClineEnvOverrides(t)
		t.Setenv("CLINE_MCP_SETTINGS_PATH", settingsPath)
		t.Setenv("CLINE_DATA_DIR", dataDir)
		t.Setenv("CLINE_DIR", clineDir)
	}

	adapter := &ClineAdapter{}

	t.Run("settings path wins over both", func(t *testing.T) {
		setAll(t)
		// Every candidate exists, so only the ordering can decide.
		writeConfig(t, settingsPath, `{"mcpServers":{}}`)
		writeConfig(t, filepath.Join(dataDir, "settings", "cline_mcp_settings.json"), `{"mcpServers":{}}`)
		writeConfig(t, filepath.Join(clineDir, "data", "settings", "cline_mcp_settings.json"), `{"mcpServers":{}}`)
		got, err := adapter.DetectConfig(context.Background(), domain.ScopeUser)
		if err != nil {
			t.Fatal(err)
		}
		if got != settingsPath {
			t.Errorf("precedence broken: got %s, want %s", got, settingsPath)
		}
	})

	t.Run("settings path wins when only it would be created", func(t *testing.T) {
		setAll(t)
		got, err := adapter.DetectConfig(context.Background(), domain.ScopeUser)
		if err != nil {
			t.Fatal(err)
		}
		if got != settingsPath {
			t.Errorf("creation precedence broken: got %s, want %s", got, settingsPath)
		}
	})

	t.Run("data dir wins over CLINE_DIR", func(t *testing.T) {
		clearClineEnvOverrides(t)
		t.Setenv("CLINE_DATA_DIR", dataDir)
		t.Setenv("CLINE_DIR", clineDir)
		want := filepath.Join(dataDir, "settings", "cline_mcp_settings.json")
		writeConfig(t, want, `{"mcpServers":{}}`)
		writeConfig(t, filepath.Join(clineDir, "data", "settings", "cline_mcp_settings.json"), `{"mcpServers":{}}`)
		got, err := adapter.DetectConfig(context.Background(), domain.ScopeUser)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("data dir must beat CLINE_DIR: got %s, want %s", got, want)
		}
	})
}

// TestClineDefaultPathUnchanged pins the no-override default byte-for-byte:
// $HOME/.cline/data/settings/cline_mcp_settings.json, both when the file
// exists and when DetectConfig would create it.
func TestClineDefaultPathUnchanged(t *testing.T) {
	home := useTempHome(t)
	clearClineEnvOverrides(t)
	want := filepath.Join(home, ".cline", "data", "settings", "cline_mcp_settings.json")

	adapter := &ClineAdapter{}

	t.Run("existing file", func(t *testing.T) {
		writeConfig(t, want, `{"mcpServers":{}}`)
		got, err := adapter.DetectConfig(context.Background(), domain.ScopeUser)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("default path drifted: got %s, want %s", got, want)
		}
	})

	t.Run("creation fallback", func(t *testing.T) {
		got, err := adapter.DetectConfig(context.Background(), domain.ScopeUser)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("default creation path drifted: got %s, want %s", got, want)
		}
	})
}
