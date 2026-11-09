package host

// marketplace_command.go — the CommandRegistrar: what each agent gets so the
// user can open the LiteSPM marketplace from inside it.
//
// MCP alone cannot open a window: a prompt is text the MODEL reads. So for
// every agent whose own extension API can draw UI, LiteSPM writes a small,
// thin renderer in that agent's language (Pi extension, OpenCode TUI plugin,
// Claude Code mod, Copilot CLI extension, Amp plugin). Every renderer reads
// the same view model (`litespm marketplace rows --json`) and acts through the
// same verbs (`litespm install …`), so no agent re-implements the marketplace.
//
// For agents with no UI extension point, LiteSPM writes the agent's own
// custom-command file instead (Gemini TOML, Qwen/Kiro/Cursor markdown, skill
// folders …). That command hands the model the marketplace instructions and
// the model drives LiteSPM's MCP tools: a text workflow, stated as one.
//
// Ownership. Every file is either inside a directory LiteSPM created and
// marked (ownedRoot + .litespm-owned), or carries the marker string in its
// text. A file at a target path that is neither is the user's and is never
// overwritten or removed — it is reported as skipped. Upgrades rewrite owned
// files in place; removal deletes only owned files.

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/sarv-projects/litespm/internal/domain"
)

//go:embed marketplace_assets
var marketplaceAssets embed.FS

// MarketplaceCommandMarker appears in every file the registrar writes.
const MarketplaceCommandMarker = "litespm-marketplace-command"

// MarketplaceCommandVersion is bumped whenever a renderer changes, so a setup
// re-run upgrades what an older LiteSPM wrote.
const MarketplaceCommandVersion = 2

const ownedMarkerFile = ".litespm-owned"

// MarketplaceCommandKind says what the user gets.
type MarketplaceCommandKind string

const (
	// CommandPopup draws an interactive panel inside the agent; no model turn.
	CommandPopup MarketplaceCommandKind = "popup"
	// CommandPrompt is a custom command that hands the model the
	// marketplace instructions; the model drives LiteSPM's MCP tools.
	CommandPrompt MarketplaceCommandKind = "prompt"
)

// MarketplaceCommandInfo describes the command an agent gets.
type MarketplaceCommandInfo struct {
	HostID    string                 `json:"hostId"`
	Kind      MarketplaceCommandKind `json:"kind"`
	Invoke    string                 `json:"invoke"`    // what the user types
	Mechanism string                 `json:"mechanism"` // the agent's own extension point
	// Verified is false for a renderer written against the vendor's
	// documentation but not yet run against a real install.
	Verified bool   `json:"verified"`
	Note     string `json:"note,omitempty"`
}

// MarketplaceCommandResult reports one install or removal.
type MarketplaceCommandResult struct {
	MarketplaceCommandInfo
	Written []string `json:"written,omitempty"`
	Removed []string `json:"removed,omitempty"`
	Skipped []string `json:"skipped,omitempty"` // a user file at a target path
	Notes   []string `json:"notes,omitempty"`
}

// MarketplaceCommandOptions are the inputs a renderer needs.
type MarketplaceCommandOptions struct {
	// Binary is the litespm executable the renderer runs (absolute path).
	Binary string
}

type commandFile struct {
	path    string
	content string
}

type marketplaceCommandSpec struct {
	info MarketplaceCommandInfo
	// root is a directory LiteSPM owns outright ("" when the files sit in a
	// directory the agent shares with the user).
	root func(home string) (string, error)
	// files lists what to write. home is the resolved home directory.
	files func(home string, opts MarketplaceCommandOptions) ([]commandFile, error)
	// activate runs after the files are written (e.g. enable a plugin in the
	// agent's settings). It must be idempotent.
	activate   func(home string, files []commandFile) ([]string, error)
	deactivate func(home string) ([]string, error)
}

var marketplaceCommandSpecs = map[string]marketplaceCommandSpec{}

func registerMarketplaceCommand(hostID string, spec marketplaceCommandSpec) {
	spec.info.HostID = hostID
	marketplaceCommandSpecs[hostID] = spec
}

// MarketplaceCommandFor reports the command an agent gets, if any.
func MarketplaceCommandFor(hostID string) (MarketplaceCommandInfo, bool) {
	spec, ok := marketplaceCommandSpecs[hostID]
	return spec.info, ok
}

// MarketplaceCommands lists every registered command, sorted by host.
func MarketplaceCommands() []MarketplaceCommandInfo {
	out := make([]MarketplaceCommandInfo, 0, len(marketplaceCommandSpecs))
	for _, spec := range marketplaceCommandSpecs {
		out = append(out, spec.info)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].HostID < out[j].HostID })
	return out
}

// InstallMarketplaceCommand writes (or upgrades) the agent's marketplace
// command. A host with no registered command returns (nil, nil).
func InstallMarketplaceCommand(ctx context.Context, hostID string, opts MarketplaceCommandOptions) (*MarketplaceCommandResult, error) {
	spec, ok := marketplaceCommandSpecs[hostID]
	if !ok {
		return nil, nil
	}
	home := resolveHomeDir()
	res := &MarketplaceCommandResult{MarketplaceCommandInfo: spec.info}
	files, err := spec.files(home, opts)
	if err != nil {
		return res, err
	}
	root := ""
	if spec.root != nil {
		if root, err = spec.root(home); err != nil {
			return res, err
		}
		if err := claimOwnedRoot(root); err != nil {
			res.Skipped = append(res.Skipped, root)
			res.Notes = append(res.Notes, err.Error())
			return res, nil
		}
	}
	var written []commandFile
	for _, f := range files {
		owned := root != "" && pathWithin(root, f.path)
		if !owned && !strings.Contains(f.content, MarketplaceCommandMarker) {
			return res, fmt.Errorf("internal: %s carries no ownership marker", f.path)
		}
		if existing, rerr := os.ReadFile(f.path); rerr == nil {
			if string(existing) == f.content {
				written = append(written, f)
				continue
			}
			if !owned && !strings.Contains(string(existing), MarketplaceCommandMarker) {
				res.Skipped = append(res.Skipped, f.path)
				continue
			}
		}
		if err := writeOwnedFile(f.path, f.content); err != nil {
			return res, err
		}
		res.Written = append(res.Written, f.path)
		written = append(written, f)
	}
	if spec.activate != nil && len(res.Skipped) == 0 {
		notes, aerr := spec.activate(home, written)
		res.Notes = append(res.Notes, notes...)
		if aerr != nil {
			return res, aerr
		}
	}
	return res, nil
}

// RemoveMarketplaceCommand deletes what InstallMarketplaceCommand wrote.
// Files without the ownership marker are left alone.
func RemoveMarketplaceCommand(ctx context.Context, hostID string) (*MarketplaceCommandResult, error) {
	spec, ok := marketplaceCommandSpecs[hostID]
	if !ok {
		return nil, nil
	}
	home := resolveHomeDir()
	res := &MarketplaceCommandResult{MarketplaceCommandInfo: spec.info}
	if spec.deactivate != nil {
		notes, err := spec.deactivate(home)
		res.Notes = append(res.Notes, notes...)
		if err != nil {
			return res, err
		}
	}
	files, err := spec.files(home, MarketplaceCommandOptions{Binary: "litespm"})
	if err != nil {
		return res, err
	}
	root := ""
	if spec.root != nil {
		if root, err = spec.root(home); err != nil {
			return res, err
		}
	}
	for _, f := range files {
		if root != "" && pathWithin(root, f.path) {
			continue // removed with the root below
		}
		data, rerr := os.ReadFile(f.path)
		if rerr != nil {
			continue
		}
		if !strings.Contains(string(data), MarketplaceCommandMarker) {
			res.Skipped = append(res.Skipped, f.path)
			continue
		}
		if err := os.Remove(f.path); err != nil {
			return res, err
		}
		res.Removed = append(res.Removed, f.path)
		removeEmptyParents(filepath.Dir(f.path), 2)
	}
	if root != "" {
		if _, serr := os.Stat(filepath.Join(root, ownedMarkerFile)); serr == nil {
			if err := os.RemoveAll(root); err != nil {
				return res, err
			}
			res.Removed = append(res.Removed, root)
		}
	}
	return res, nil
}

// claimOwnedRoot creates root and its ownership marker, refusing a directory
// that already exists with content and no marker (the user's own).
func claimOwnedRoot(root string) error {
	marker := filepath.Join(root, ownedMarkerFile)
	if _, err := os.Stat(marker); err == nil {
		return nil
	}
	if entries, err := os.ReadDir(root); err == nil && len(entries) > 0 {
		return fmt.Errorf("%s already exists and was not created by LiteSPM; left it as it is", root)
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return err
	}
	return os.WriteFile(marker, []byte("Created by LiteSPM ("+MarketplaceCommandMarker+"). `litespm host remove` deletes this directory.\n"), 0o644)
}

func writeOwnedFile(path, content string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".litespm-tmp"
	if err := os.WriteFile(tmp, []byte(content), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// removeEmptyParents removes up to depth now-empty parent directories, so a
// command directory LiteSPM created (e.g. ~/.gemini/commands) does not linger.
func removeEmptyParents(dir string, depth int) {
	for i := 0; i < depth; i++ {
		entries, err := os.ReadDir(dir)
		if err != nil || len(entries) > 0 {
			return
		}
		if os.Remove(dir) != nil {
			return
		}
		dir = filepath.Dir(dir)
	}
}

func pathWithin(root, p string) bool {
	rel, err := filepath.Rel(root, p)
	if err != nil {
		return false
	}
	return rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func asset(name string) string {
	data, err := marketplaceAssets.ReadFile("marketplace_assets/" + name)
	if err != nil {
		panic("missing embedded marketplace asset " + name + ": " + err.Error())
	}
	return string(data)
}

// render fills the placeholders every renderer template uses.
func render(template string, opts MarketplaceCommandOptions) string {
	bin := opts.Binary
	if strings.TrimSpace(bin) == "" {
		bin = "litespm"
	}
	quoted, _ := json.Marshal(filepath.ToSlash(bin))
	r := strings.NewReplacer(
		`"__LITESPM_BIN__"`, string(quoted),
		`'__LITESPM_BIN__'`, string(quoted),
		"__LITESPM_VERSION__", fmt.Sprintf("v%d", MarketplaceCommandVersion),
		"__MARKER__", MarketplaceCommandMarker,
	)
	return r.Replace(template)
}

// detectedConfigDir is the directory of an adapter's user-scope config file,
// so a command file follows every relocation the adapter already honours
// (GEMINI_*, GROK_HOME, CODEX_HOME, XDG_CONFIG_HOME …).
func detectedConfigDir(hostID string) (string, error) {
	adapter, err := GetAdapter(hostID)
	if err != nil {
		return "", err
	}
	path, err := adapter.DetectConfig(context.Background(), domain.ScopeUser)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(path) == "" {
		return "", errors.New(hostID + ": no configuration path is known")
	}
	return filepath.Dir(path), nil
}

func init() {
	// ---- popups -----------------------------------------------------------

	registerMarketplaceCommand("pi-agent", marketplaceCommandSpec{
		info: MarketplaceCommandInfo{Kind: CommandPopup, Invoke: "/marketplace", Mechanism: "Pi extension (ctx.ui.custom overlay)", Verified: true},
		files: func(home string, opts MarketplaceCommandOptions) ([]commandFile, error) {
			return []commandFile{{path: (&PiAgentAdapter{}).ExtensionPath(), content: render(piExtensionCode, opts)}}, nil
		},
	})

	registerMarketplaceCommand("opencode", marketplaceCommandSpec{
		info: MarketplaceCommandInfo{Kind: CommandPopup, Invoke: "/litespm-marketplace", Mechanism: "OpenCode TUI plugin (ui.dialog.select)", Verified: true,
			Note: "OpenCode 2.0 or later; restart OpenCode after setup."},
		root: func(home string) (string, error) {
			dir, err := openCodeConfigDir()
			if err != nil {
				return "", err
			}
			return filepath.Join(dir, "plugins", "litespm-marketplace"), nil
		},
		files: func(home string, opts MarketplaceCommandOptions) ([]commandFile, error) {
			dir, err := openCodeConfigDir()
			if err != nil {
				return nil, err
			}
			return []commandFile{{path: filepath.Join(dir, "plugins", "litespm-marketplace", "tui.js"), content: render(asset("opencode/tui.js"), opts)}}, nil
		},
	})

	registerMarketplaceCommand("claude-code", marketplaceCommandSpec{
		info: MarketplaceCommandInfo{Kind: CommandPopup, Invoke: "/litespm-marketplace", Mechanism: "Claude Code mod (pane)", Verified: true,
			Note: "Claude Code 2.1.287 or later (mods). Run /reload-plugins or restart Claude Code after setup."},
		root:       claudeMarketplaceRoot,
		files:      claudeMarketplaceFiles,
		activate:   claudeActivateMarketplace,
		deactivate: claudeDeactivateMarketplace,
	})

	registerMarketplaceCommand("github-copilot", marketplaceCommandSpec{
		info: MarketplaceCommandInfo{Kind: CommandPopup, Invoke: "/litespm-marketplace", Mechanism: "Copilot CLI extension (session.ui.select)", Verified: true,
			Note: "Copilot CLI extensions are experimental: start Copilot with --experimental (or run /experimental on)."},
		root: func(home string) (string, error) {
			dir, err := copilotHome(home)
			return filepath.Join(dir, "extensions", "litespm-marketplace"), err
		},
		files: func(home string, opts MarketplaceCommandOptions) ([]commandFile, error) {
			dir, err := copilotHome(home)
			if err != nil {
				return nil, err
			}
			return []commandFile{{path: filepath.Join(dir, "extensions", "litespm-marketplace", "extension.mjs"), content: render(asset("github-copilot/extension.mjs"), opts)}}, nil
		},
	})

	registerMarketplaceCommand("amp", marketplaceCommandSpec{
		info: MarketplaceCommandInfo{Kind: CommandPopup, Invoke: "command palette: LiteSPM: Marketplace", Mechanism: "Amp plugin (ctx.ui.select)", Verified: false,
			Note: "Written against Amp's plugin API documentation; not yet run against a real Amp install. Run `plugins: reload` in Amp."},
		files: func(home string, opts MarketplaceCommandOptions) ([]commandFile, error) {
			base := os.Getenv("XDG_CONFIG_HOME")
			if base == "" {
				base = filepath.Join(home, ".config")
			}
			return []commandFile{{path: filepath.Join(base, "amp", "plugins", "litespm-marketplace.ts"), content: render(asset("amp/litespm.ts"), opts)}}, nil
		},
	})

	// ---- prompt commands (the model drives LiteSPM's MCP tools) ------------

	promptMD := func(hostID, invoke, mechanism string, path func(home string) (string, error), withFrontmatter bool) {
		registerMarketplaceCommand(hostID, marketplaceCommandSpec{
			info: MarketplaceCommandInfo{Kind: CommandPrompt, Invoke: invoke, Mechanism: mechanism, Verified: false},
			files: func(home string, opts MarketplaceCommandOptions) ([]commandFile, error) {
				p, err := path(home)
				if err != nil {
					return nil, err
				}
				return []commandFile{{path: p, content: promptMarkdown(withFrontmatter, "$ARGUMENTS")}}, nil
			},
		})
	}
	inConfigDir := func(hostID string, rel ...string) func(string) (string, error) {
		return func(string) (string, error) {
			dir, err := detectedConfigDir(hostID)
			if err != nil {
				return "", err
			}
			return filepath.Join(append([]string{dir}, rel...)...), nil
		}
	}
	inHome := func(rel ...string) func(string) (string, error) {
		return func(home string) (string, error) { return filepath.Join(append([]string{home}, rel...)...), nil }
	}

	registerMarketplaceCommand("gemini-cli", marketplaceCommandSpec{
		info: MarketplaceCommandInfo{Kind: CommandPrompt, Invoke: "/litespm-marketplace", Mechanism: "Gemini CLI custom command (commands/*.toml)", Verified: true},
		files: func(home string, opts MarketplaceCommandOptions) ([]commandFile, error) {
			dir, err := detectedConfigDir("gemini-cli")
			if err != nil {
				return nil, err
			}
			return []commandFile{{path: filepath.Join(dir, "commands", "litespm-marketplace.toml"), content: promptTOML("{{args}}")}}, nil
		},
	})
	promptMD("qwen-code", "/litespm-marketplace", "Qwen Code custom command (commands/*.md)", inConfigDir("qwen-code", "commands", "litespm-marketplace.md"), true)
	promptMD("kiro-cli", "/litespm-marketplace", "Kiro CLI prompt (~/.kiro/prompts)", inHome(".kiro", "prompts", "litespm-marketplace.md"), false)
	promptMD("cursor", "/litespm-marketplace", "Cursor command (~/.cursor/commands)", inConfigDir("cursor", "commands", "litespm-marketplace.md"), false)
	promptMD("augment", "/litespm-marketplace", "Auggie custom command (~/.augment/commands)", inConfigDir("augment", "commands", "litespm-marketplace.md"), true)
	promptMD("roo", "/litespm-marketplace", "Roo Code command (~/.roo/commands)", inHome(".roo", "commands", "litespm-marketplace.md"), true)
	promptMD("droid", "/litespm-marketplace", "Factory Droid command (~/.factory/commands)", inConfigDir("droid", "commands", "litespm-marketplace.md"), true)
	promptMD("kilo", "/litespm-marketplace", "Kilo command (command/*.md)", inConfigDir("kilo", "command", "litespm-marketplace.md"), true)
	promptMD("cline", "/litespm-marketplace.md", "Cline workflow (Documents/Cline/Workflows)", inHome("Documents", "Cline", "Workflows", "litespm-marketplace.md"), false)

	promptSkill := func(hostID, invoke, mechanism string, dir func(home string) (string, error)) {
		registerMarketplaceCommand(hostID, marketplaceCommandSpec{
			info: MarketplaceCommandInfo{Kind: CommandPrompt, Invoke: invoke, Mechanism: mechanism, Verified: false},
			files: func(home string, opts MarketplaceCommandOptions) ([]commandFile, error) {
				d, err := dir(home)
				if err != nil {
					return nil, err
				}
				return []commandFile{{path: filepath.Join(d, "litespm-marketplace", "SKILL.md"), content: promptSkillMarkdown()}}, nil
			},
		})
	}
	promptSkill("grok-build", "/litespm-marketplace", "Grok Build user-invocable skill", inConfigDir("grok-build", "skills"))
	promptSkill("codex", "$litespm-marketplace", "Codex skill (~/.agents/skills)", inHome(".agents", "skills"))
	promptSkill("crush", "Ctrl+P → user:litespm-marketplace", "Crush user-invocable skill", inConfigDir("crush", "skills"))
}

func openCodeConfigDir() (string, error) {
	if v := os.Getenv("OPENCODE_CONFIG_DIR"); v != "" {
		return v, nil
	}
	return filepath.Join(xdgConfigDir(resolveHomeDir()), "opencode"), nil
}

func copilotHome(home string) (string, error) {
	if v := os.Getenv("COPILOT_HOME"); v != "" {
		return v, nil
	}
	return filepath.Join(home, ".copilot"), nil
}

// ---- Claude Code ----------------------------------------------------------

const claudeLocalMarketplace = "litespm-local"
const claudePluginName = "litespm-marketplace"

func claudeConfigDir(home string) string {
	if v := os.Getenv("CLAUDE_CONFIG_DIR"); v != "" {
		return v
	}
	return filepath.Join(home, ".claude")
}

func claudeMarketplaceRoot(home string) (string, error) {
	return filepath.Join(claudeConfigDir(home), "litespm-marketplace"), nil
}

func claudeMarketplaceFiles(home string, opts MarketplaceCommandOptions) ([]commandFile, error) {
	root, _ := claudeMarketplaceRoot(home)
	plugin := filepath.Join(root, "plugins", claudePluginName)
	return []commandFile{
		{path: filepath.Join(root, ".claude-plugin", "marketplace.json"), content: render(asset("claude-code/marketplace.json"), opts)},
		{path: filepath.Join(plugin, ".claude-plugin", "plugin.json"), content: render(asset("claude-code/plugin.json"), opts)},
		{path: filepath.Join(plugin, "hooks", "hooks.json"), content: render(asset("claude-code/hooks.json"), opts)},
		{path: filepath.Join(plugin, "hooks", "register.js"), content: render(asset("claude-code/register.js"), opts)},
	}, nil
}

// claudeActivateMarketplace enables the plugin the way `claude plugin
// marketplace add` + `claude plugin install` record it: a directory
// marketplace in extraKnownMarketplaces and the plugin in enabledPlugins of
// the user settings file. The splice is surgical, so the rest of the file is
// untouched.
func claudeActivateMarketplace(home string, _ []commandFile) ([]string, error) {
	root, _ := claudeMarketplaceRoot(home)
	settings := filepath.Join(claudeConfigDir(home), "settings.json")
	raw := "{}"
	if data, err := os.ReadFile(settings); err == nil && strings.TrimSpace(string(data)) != "" {
		raw = string(data)
	}
	out, err := mergeJSONEntrySurgicalNamed(raw, []string{"extraKnownMarketplaces"}, claudeLocalMarketplace,
		map[string]any{"source": map[string]any{"source": "directory", "path": root}})
	if err != nil {
		return nil, fmt.Errorf("enable the LiteSPM pane in %s: %w", settings, err)
	}
	out, err = mergeJSONEntrySurgicalNamed(out, []string{"enabledPlugins"}, claudePluginName+"@"+claudeLocalMarketplace, true)
	if err != nil {
		return nil, fmt.Errorf("enable the LiteSPM pane in %s: %w", settings, err)
	}
	if out == raw {
		return nil, nil
	}
	if err := writeOwnedFile(settings, out); err != nil {
		return nil, err
	}
	return []string{"Enabled " + claudePluginName + "@" + claudeLocalMarketplace + " in " + settings}, nil
}

func claudeDeactivateMarketplace(home string) ([]string, error) {
	settings := filepath.Join(claudeConfigDir(home), "settings.json")
	data, err := os.ReadFile(settings)
	if err != nil {
		return nil, nil
	}
	out := string(data)
	changed := false
	for _, step := range []struct{ path []string }{
		{[]string{"enabledPlugins", claudePluginName + "@" + claudeLocalMarketplace}},
		{[]string{"extraKnownMarketplaces", claudeLocalMarketplace}},
	} {
		next, removed, rerr := stripJSONEntryNamed(out, step.path[:len(step.path)-1], step.path[len(step.path)-1])
		if rerr != nil {
			return nil, fmt.Errorf("disable the LiteSPM pane in %s: %w", settings, rerr)
		}
		if removed {
			out, changed = next, true
		}
	}
	if !changed {
		return nil, nil
	}
	if err := writeOwnedFile(settings, out); err != nil {
		return nil, err
	}
	return []string{"Disabled the LiteSPM pane in " + settings}, nil
}

// ---- prompt bodies ----------------------------------------------------------

// marketplacePromptBody is what the model reads when a prompt command runs.
// It mirrors the bridge's MCP `marketplace` prompt: LiteSPM's MCP tools only,
// and nothing is installed without the user approving the exact plan.
func marketplacePromptBody(argsToken string) string {
	return "Open the LiteSPM marketplace for the user. Use ONLY the tools of the `litespm` MCP server.\n\n" +
		"Search terms (may be empty): " + argsToken + "\n\n" +
		"1. If search terms were given, call search_catalog with them. Otherwise call list_installed once and ask what the user wants to find.\n" +
		"2. Show the results as a short numbered list: name, kind (MCP server, skill or plugin), publisher, one-line summary, and whether it is installed. Mark rows LiteSPM cannot install as \"manual setup\" and do not offer to install them.\n" +
		"3. When the user picks one, call get_extension for details, then prepare_install, and show the plan: what will be written and where.\n" +
		"4. Install only after the user approves that exact plan, by calling request_install with the plan id and approval token. Never claim success until the tool confirms it.\n" +
		"5. To remove something, tell the user the exact command: `litespm install remove <installId>`.\n\n" +
		"Do not open a browser for this. For a visual catalog the user can run `litespm marketplace` in a terminal.\n"
}

func promptMarkdown(withFrontmatter bool, argsToken string) string {
	var b strings.Builder
	if withFrontmatter {
		b.WriteString("---\ndescription: Browse, install and remove MCP servers, skills and plugins with LiteSPM\nargument-hint: [search terms]\n---\n")
	}
	b.WriteString("<!-- " + MarketplaceCommandMarker + " " + fmt.Sprintf("v%d", MarketplaceCommandVersion) + ": written by `litespm host setup`; `litespm host remove` deletes it. -->\n\n")
	b.WriteString(marketplacePromptBody(argsToken))
	return b.String()
}

func promptTOML(argsToken string) string {
	body := marketplacePromptBody(argsToken)
	return "# " + MarketplaceCommandMarker + fmt.Sprintf(" v%d", MarketplaceCommandVersion) + ": written by `litespm host setup`; `litespm host remove` deletes it.\n" +
		"description = \"Browse, install and remove MCP servers, skills and plugins with LiteSPM\"\n" +
		"prompt = \"\"\"\n" + strings.ReplaceAll(body, `"""`, `\"\"\"`) + "\"\"\"\n"
}

func promptSkillMarkdown() string {
	return "---\nname: litespm-marketplace\ndescription: Browse, install and remove MCP servers, skills and plugins with LiteSPM. Use when the user asks for the LiteSPM marketplace or wants to find or install an MCP server, skill or plugin.\nuser-invocable: true\ndisable-model-invocation: true\n---\n\n" +
		"<!-- " + MarketplaceCommandMarker + fmt.Sprintf(" v%d", MarketplaceCommandVersion) + ": written by `litespm host setup`; `litespm host remove` deletes it. -->\n\n" +
		marketplacePromptBody("the text after the command, if any")
}
