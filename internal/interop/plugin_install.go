package interop

// plugin_install.go — the plugin manifest an INSTALL reads.
//
// A plugin ships a manifest in its own tree. That manifest is untrusted
// input: it comes from a stranger's repository, and what it says is what
// LiteSPM is about to write into somebody else's agent config. This file
// parses it under the same rules every other foreign format is parsed under
// (the untrusted-input gate in parse.go: 8 MiB, 64 containers of nesting,
// well-formed JSON, no absolute path, no traversal) and refuses what it does
// not understand.
//
// What "installing a plugin" means here is decided by the manifest and by
// nothing else. Two component classes are portable and are read as typed
// components: MCP servers (registered in each target host's config exactly as
// an MCP server is) and skills (copied into each agent's own skills tree, for
// the hosts that have one). The classes that are host-specific — commands,
// agents, hooks, LSP servers — are COUNTED and REPORTED, never projected: there
// is no adapter for them, and a half-projection is worse than none.
//
// Two rules are worth stating separately:
//
//   - An environment contributes NAMES, never values. A manifest may say
//     "this server wants ACME_TOKEN"; the value in the manifest is
//     validated as a string and then discarded. A credential never passes
//     through LiteSPM, and a manifest cannot smuggle one into a host config.
//   - A `command` source is refused (LPSM-IMPORT-005), never executed. It is
//     the same refusal the marketplace import makes: a source that would
//     have to be run to obtain the package is not a source.
//
// The accepted member set is closed, like the pinned Agent Plugins 1.0.0
// schema this package already enforces for `plugin.json`: an unknown member
// is a refusal, not a warning, because dropping it silently could drop the
// very component that made the plugin worth installing.

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
)

// PluginMCPServer is one MCP server a plugin manifest declares.
type PluginMCPServer struct {
	// Name is the key the server is declared under. It becomes the key the
	// host config stores it under, so the install layer checks it against
	// the hosts' own naming rules.
	Name string
	// Command is the launch line of a stdio server ("" for a remote one).
	Command string
	// Args are the arguments of a stdio server.
	Args []string
	// EnvNames are the variable NAMES the manifest declares. The values are
	// never read: a credential does not pass through LiteSPM.
	EnvNames []string
	// URL is the endpoint of a remote server ("" for a stdio one). An entry
	// is one transport: a server declares a command OR a URL, never both.
	URL string
	// Type is the transport the manifest names ("stdio", "http", "sse"), or
	// "" when it names none.
	Type string
}

// PluginSkill is one skill a plugin bundles: a directory inside the plugin's
// own tree that contains a SKILL.md.
type PluginSkill struct {
	// Name is the skill's directory name, derived from the declared path.
	Name string
	// Path is the skill directory, relative to the plugin tree root. It is
	// inert data: the installer joins it onto the verified tree and refuses
	// anything that leaves it.
	Path string
}

// PluginInstallManifest is what an install needs from a plugin's own
// manifest.
type PluginInstallManifest struct {
	// Name is the plugin's own name, as the manifest declares it.
	Name string
	// Version is the version the manifest declares. It is reported, never
	// used as the installed version: the catalog's version record is the
	// authority for what was resolved.
	Version string
	// Description is the manifest's own description, reported only.
	Description string
	// MCPServers are the servers the manifest declares, sorted by name so
	// the install order is deterministic.
	MCPServers []PluginMCPServer
	// MCPServersRef is a REFERENCE to the file that declares the servers,
	// relative to the plugin's own tree ("mcpServers": "./mcp.json"). The
	// Claude Code plugin format declares its components that way, and the
	// Agent Plugins format declares them inline; both are in the wild.
	//
	// The reference is resolved by the INSTALLER, not here: this parser
	// sees one file, and the referenced file lives inside the pinned,
	// digest-verified tree the installer holds.
	MCPServersRef string
	// Skills are the skill directories the manifest declares
	// ("skills": ["skills/review/SKILL.md", …]). Skills are portable, so
	// they are installed like a standalone skill once the pinned tree is
	// fetched; the manifest only names where inside that tree they live.
	Skills []PluginSkill
	// NotInstalled counts the components the manifest declares that
	// LiteSPM does not install ("commands", "agents", "hooks",
	// "lspServers", "disabled servers"). They are reported so an install
	// never claims a plugin is whole when it is not.
	NotInstalled map[string]int
	// Warnings carries the reported facts about the manifest that are not
	// refusals (a source the manifest declares, a member LiteSPM does not
	// use).
	Warnings []string
}

// pluginInstallMembers is the closed set of top-level members an install
// understands. Everything else is refused.
var pluginInstallMembers = map[string]bool{
	"$schema":     true,
	"name":        true,
	"version":     true,
	"description": true,
	"author":      true,
	"homepage":    true,
	"repository":  true,
	"license":     true,
	"keywords":    true,
	// category is a taxonomy term the Agent Plugins spec defines and real
	// vendor manifests carry (the 42Crunch plugin publishes one). A member
	// the spec defines is not an unknown member, and refusing a manifest for
	// carrying it would refuse a plugin over a field LiteSPM simply does not
	// read.
	"category": true,
	// displayName is the Claude Code plugin manifest's own spelling of a
	// human-facing name; icon and the documentation/support/privacy/terms
	// URLs are the marketplace fields. LiteSPM does not read them, and
	// refusing a vendor manifest for carrying a field the format defines
	// would refuse the plugin over a field LiteSPM simply ignores. (Measured
	// across real manifests: mongodb/agent-skills, pendo-io, SynthFlowAI and
	// Bigdata-com all carry members outside the Agent Plugins 1.0.0 schema.)
	"displayName":       true,
	"icon":              true,
	"documentationUrl":  true,
	"supportUrl":        true,
	"privacyPolicyUrl":  true,
	"termsOfServiceUrl": true,
	"mcpServers":        true,
	"lspServers":        true,
	"commands":          true,
	"agents":            true,
	"hooks":             true,
	"skills":            true,
	"source":            true,
}

// pluginServerMembers is the closed set of members one MCP server
// declaration may carry.
var pluginServerMembers = map[string]bool{
	"command":  true,
	"args":     true,
	"env":      true,
	"url":      true,
	"type":     true,
	"disabled": true,
}

// ParsePluginInstallManifest normalizes the manifest a plugin ships into the
// shape an install consumes.
//
// The rules, in the order they are applied:
//
//  1. the untrusted-input gate (size, depth, well-formed JSON);
//  2. a closed member set: an unknown top-level member is a refusal;
//  3. a supported $schema, when the manifest declares one;
//  4. a name, because a manifest without one does not identify a plugin;
//  5. a `command` source is refused and never executed;
//  6. every declared MCP server is typed strictly: a command XOR a URL, a
//     string command, string arguments, a string-valued environment, and a
//     name.
func ParsePluginInstallManifest(data []byte) (*PluginInstallManifest, error) {
	if err := ValidateInput(data); err != nil {
		return nil, err
	}
	root, err := decodeRoot(data)
	if err != nil {
		return nil, err
	}
	for _, key := range sortedRootKeys(root) {
		if !pluginInstallMembers[key] {
			return nil, errorf(ErrCodeSchema,
				"unknown member %q: LiteSPM installs a plugin's MCP servers and refuses a manifest it does not understand, "+
					"rather than dropping a component it might have needed to install", key)
		}
	}

	doc := &PluginInstallManifest{NotInstalled: map[string]int{}}

	if raw, ok := root["$schema"]; ok {
		var schema string
		if err := decodeStrict(raw, &schema); err != nil {
			return nil, errorf(ErrCodeSchema, "$schema: %s", errDetail(err))
		}
		if !PluginInstallSchemas[schema] {
			return nil, errorf(ErrCodeSchema,
				"unsupported $schema %q (this install supports %s)", schema, PluginInstallSchemaList)
		}
	}

	rawName, ok := root["name"]
	if !ok {
		return nil, errorf(ErrCodeSchema, "name is required: a manifest without a name does not identify a plugin")
	}
	if err := decodeStrict(rawName, &doc.Name); err != nil {
		return nil, errorf(ErrCodeSchema, "name: %s", errDetail(err))
	}
	if strings.TrimSpace(doc.Name) == "" {
		return nil, errorf(ErrCodeSchema, "name is required and must not be empty")
	}
	if err := checkSafeField("name", doc.Name); err != nil {
		return nil, err
	}

	for field, target := range map[string]*string{
		"version":     &doc.Version,
		"description": &doc.Description,
	} {
		raw, ok := root[field]
		if !ok {
			continue
		}
		if err := decodeStrict(raw, target); err != nil {
			return nil, errorf(ErrCodeSchema, "%s: %s", field, errDetail(err))
		}
	}
	if err := checkSafeField("description", doc.Description); err != nil {
		return nil, err
	}
	if err := validatePluginAuthor(root); err != nil {
		return nil, err
	}
	if err := validatePluginKeywords(root); err != nil {
		return nil, err
	}
	for _, field := range []string{"homepage", "repository", "license"} {
		raw, ok := root[field]
		if !ok {
			continue
		}
		var value string
		if err := decodeStrict(raw, &value); err != nil {
			return nil, errorf(ErrCodeSchema, "%s: %s", field, errDetail(err))
		}
	}
	if err := validatePluginSource(root, doc); err != nil {
		return nil, err
	}

	// Skills are portable: the install copies them into each target agent's
	// own skills tree, so they are parsed rather than counted as missing.
	skillComponents, err := parsePluginSkills(root)
	if err != nil {
		return nil, err
	}
	doc.Skills = skillComponents

	// The components LiteSPM does not project are counted, never installed.
	for _, field := range []string{"lspServers", "commands", "agents", "hooks"} {
		raw, ok := root[field]
		if !ok {
			continue
		}
		count, err := countDeclaredMembers(raw)
		if err != nil {
			return nil, errorf(ErrCodeSchema, "%s: %s", field, errDetail(err))
		}
		if count > 0 {
			doc.NotInstalled[field] = count
		}
	}

	servers, err := parsePluginMCPServers(root, doc)
	if err != nil {
		return nil, err
	}
	doc.MCPServers = servers
	return doc, nil
}

// ParsePluginMCPServersDocument parses a standalone MCP server document: the
// file a manifest may point its servers at ("mcpServers": "./mcp.json").
//
// Two shapes are accepted, because the MCP configuration format has both:
// the wrapped one ({"mcpServers": {...}}) and the bare map of servers
// ({"name": {...}}). The file is untrusted input like any other: it goes
// through the same bounds and the same strict member rules.
func ParsePluginMCPServersDocument(data []byte) ([]PluginMCPServer, int, error) {
	if err := ValidateInput(data); err != nil {
		return nil, 0, err
	}
	root, err := decodeRoot(data)
	if err != nil {
		return nil, 0, err
	}
	// The wrapped shape.
	if raw, ok := root["mcpServers"]; ok {
		var members map[string]json.RawMessage
		if err := decodeStrict(raw, &members); err != nil {
			return nil, 0, errorf(ErrCodeSchema, "mcpServers: %s", errDetail(err))
		}
		return parsePluginMCPServerMembers(members)
	}
	// The bare map of servers.
	members := make(map[string]json.RawMessage, len(root))
	for name, raw := range root {
		members[name] = raw
	}
	if len(members) == 0 {
		return nil, 0, errorf(ErrCodeSchema, "the file declares no MCP server")
	}
	return parsePluginMCPServerMembers(members)
}

// parsePluginMCPServerMembers reads a map of server declarations.
func parsePluginMCPServerMembers(members map[string]json.RawMessage) ([]PluginMCPServer, int, error) {
	if members == nil {
		return nil, 0, nil
	}
	names := make([]string, 0, len(members))
	for name := range members {
		names = append(names, name)
	}
	sort.Strings(names)
	servers := make([]PluginMCPServer, 0, len(names))
	disabled := 0
	for _, name := range names {
		server, isDisabled, err := parsePluginMCPServer(name, members[name])
		if err != nil {
			return nil, 0, err
		}
		if isDisabled {
			// A disabled server is declared but not run: it is reported, not
			// installed, and it is never a reason to fail the install.
			disabled++
			continue
		}
		servers = append(servers, server)
	}
	return servers, disabled, nil
}

// parsePluginMCPServers reads the servers the manifest declares.
func parsePluginMCPServers(root map[string]json.RawMessage, doc *PluginInstallManifest) ([]PluginMCPServer, error) {
	raw, ok := root["mcpServers"]
	if !ok {
		return nil, nil
	}
	// A string here is a reference to a file inside the plugin's own tree
	// ("mcpServers": "./mcp.json") - the Claude Code plugin format. It is
	// recorded, not resolved: the file lives in the pinned tree the
	// installer holds, and this parser sees one file.
	var asText string
	if err := decodeStrict(raw, &asText); err == nil {
		ref := strings.TrimSpace(asText)
		if ref == "" {
			return nil, errorf(ErrCodeSchema, "mcpServers: the reference is empty")
		}
		doc.MCPServersRef = ref
		return nil, nil
	}
	var members map[string]json.RawMessage
	if err := decodeStrict(raw, &members); err != nil {
		return nil, errorf(ErrCodeSchema, "mcpServers: %s", errDetail(err))
	}
	if members == nil {
		return nil, nil
	}
	names := make([]string, 0, len(members))
	for name := range members {
		names = append(names, name)
	}
	sort.Strings(names)

	servers := make([]PluginMCPServer, 0, len(names))
	for _, name := range names {
		if strings.TrimSpace(name) == "" {
			return nil, errorf(ErrCodeSchema, "mcpServers: a server name must not be empty")
		}
		if err := checkSafeField("mcpServers."+name, name); err != nil {
			return nil, err
		}
		server, disabled, err := parsePluginMCPServer(name, members[name])
		if err != nil {
			return nil, err
		}
		if disabled {
			// A disabled server is declared but not run: it is reported, not
			// installed, and it is never a reason to fail the install.
			doc.NotInstalled["disabled servers"]++
			continue
		}
		servers = append(servers, server)
	}
	return servers, nil
}

// parsePluginMCPServer reads one server declaration.
func parsePluginMCPServer(name string, raw json.RawMessage) (PluginMCPServer, bool, error) {
	var server PluginMCPServer
	server.Name = name

	var members map[string]json.RawMessage
	if err := decodeStrict(raw, &members); err != nil {
		return server, false, errorf(ErrCodeSchema, "mcpServers.%s: %s", name, errDetail(err))
	}
	if members == nil {
		return server, false, errorf(ErrCodeSchema, "mcpServers.%s: a server declaration must be an object", name)
	}
	for _, key := range sortedRootKeys(members) {
		if !pluginServerMembers[key] {
			return server, false, errorf(ErrCodeSchema,
				"unknown member mcpServers.%s.%s: LiteSPM registers an MCP server, and refuses a declaration it does not understand",
				name, key)
		}
	}

	if raw, ok := members["disabled"]; ok {
		var disabled bool
		if err := decodeStrict(raw, &disabled); err != nil {
			return server, false, errorf(ErrCodeSchema, "mcpServers.%s.disabled: %s", name, errDetail(err))
		}
		if disabled {
			return server, true, nil
		}
	}
	if raw, ok := members["command"]; ok {
		if err := decodeStrict(raw, &server.Command); err != nil {
			return server, false, errorf(ErrCodeSchema, "mcpServers.%s.command: %s", name, errDetail(err))
		}
	}
	if raw, ok := members["url"]; ok {
		if err := decodeStrict(raw, &server.URL); err != nil {
			return server, false, errorf(ErrCodeSchema, "mcpServers.%s.url: %s", name, errDetail(err))
		}
	}
	if raw, ok := members["type"]; ok {
		if err := decodeStrict(raw, &server.Type); err != nil {
			return server, false, errorf(ErrCodeSchema, "mcpServers.%s.type: %s", name, errDetail(err))
		}
	}
	if raw, ok := members["args"]; ok {
		var args []string
		if err := decodeStrict(raw, &args); err != nil {
			return server, false, errorf(ErrCodeSchema, "mcpServers.%s.args: %s", name, errDetail(err))
		}
		server.Args = args
	}
	if raw, ok := members["env"]; ok {
		names, err := parsePluginEnvNames(name, raw)
		if err != nil {
			return server, false, err
		}
		server.EnvNames = names
	}

	command := strings.TrimSpace(server.Command)
	url := strings.TrimSpace(server.URL)
	switch {
	case command == "" && url == "":
		return server, false, errorf(ErrCodeSchema,
			"mcpServers.%s declares neither a command nor a URL, so there is nothing to register", name)
	case command != "" && url != "":
		return server, false, errorf(ErrCodeSchema,
			"mcpServers.%s declares both a command and a URL; an entry is one transport", name)
	}
	server.Command = command
	server.URL = url
	return server, false, nil
}

// parsePluginEnvNames reads the variable NAMES a server declares. The values
// are validated as strings and then discarded: a manifest's environment is
// not a place a credential may travel through LiteSPM.
func parsePluginEnvNames(server string, raw json.RawMessage) ([]string, error) {
	var members map[string]json.RawMessage
	if err := decodeStrict(raw, &members); err != nil {
		return nil, errorf(ErrCodeSchema, "mcpServers.%s.env: %s", server, errDetail(err))
	}
	if members == nil {
		return nil, nil
	}
	names := make([]string, 0, len(members))
	for name := range members {
		var value string
		if err := decodeStrict(members[name], &value); err != nil {
			return nil, errorf(ErrCodeSchema, "mcpServers.%s.env.%s: %s", server, name, errDetail(err))
		}
		if err := checkSafeField("mcpServers."+server+".env."+name, name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

// validatePluginSource reads the manifest's own source descriptor. A command
// source is refused and never executed; any other source is reported, because
// the tree LiteSPM installs is the one the catalog published and pinned, not
// the one the manifest names.
func validatePluginSource(root map[string]json.RawMessage, doc *PluginInstallManifest) error {
	raw, ok := root["source"]
	if !ok {
		return nil
	}
	var members map[string]json.RawMessage
	if err := decodeStrict(raw, &members); err != nil {
		// A string source is a path inside the repository that publishes the
		// manifest: it is reported, not resolved.
		var asString string
		if err2 := decodeStrict(raw, &asString); err2 == nil {
			if err := checkSafeField("source", asString); err != nil {
				return err
			}
			doc.Warnings = append(doc.Warnings,
				"the manifest declares its own source; LiteSPM installs the pinned tree the catalog published, not the manifest's source")
			return nil
		}
		return errorf(ErrCodeSchema, "source: %s", errDetail(err))
	}
	kind := ""
	for _, field := range []string{"source", "type"} {
		if raw, ok := members[field]; ok {
			var value string
			if err := decodeStrict(raw, &value); err != nil {
				return errorf(ErrCodeSchema, "source.%s: %s", field, errDetail(err))
			}
			kind = strings.ToLower(strings.TrimSpace(value))
			break
		}
	}
	if kind == "command" {
		return errorf(ErrCodeCommandSource,
			"the manifest declares a `command` source; command sources are refused and never executed")
	}
	doc.Warnings = append(doc.Warnings,
		"the manifest declares its own source; LiteSPM installs the pinned tree the catalog published, not the manifest's source")
	return nil
}

// validatePluginAuthor checks the author object: a string, or an object with
// optional name/email/url strings.
func validatePluginAuthor(root map[string]json.RawMessage) error {
	raw, ok := root["author"]
	if !ok {
		return nil
	}
	var asString string
	if err := decodeStrict(raw, &asString); err == nil {
		return nil
	}
	var obj map[string]json.RawMessage
	if err := decodeStrict(raw, &obj); err != nil {
		return errorf(ErrCodeSchema, "author: %s", errDetail(err))
	}
	if obj == nil {
		return nil
	}
	for _, key := range sortedRootKeys(obj) {
		switch key {
		case "name", "email", "url":
		default:
			return errorf(ErrCodeSchema, "unknown field author.%q (the accepted fields are name, email and url)", key)
		}
	}
	for _, key := range []string{"name", "email", "url"} {
		if v, ok := obj[key]; ok {
			var s string
			if err := decodeStrict(v, &s); err != nil {
				return errorf(ErrCodeSchema, "author.%s: %s", key, errDetail(err))
			}
		}
	}
	return nil
}

// validatePluginKeywords checks the keyword list.
func validatePluginKeywords(root map[string]json.RawMessage) error {
	raw, ok := root["keywords"]
	if !ok {
		return nil
	}
	var keywords []string
	if err := decodeStrict(raw, &keywords); err != nil {
		return errorf(ErrCodeSchema, "keywords: %s", errDetail(err))
	}
	return nil
}

// parsePluginSkills reads the manifest's `skills` member into typed
// components.
//
// Three shapes are in the wild and all three are accepted: one path, an array
// of paths, or an object of name → path. A path names either the skill
// directory or its SKILL.md, and is always relative to the plugin's own tree;
// a traversal segment or an absolute path is refused here, before anything
// joins it onto a filesystem path. The declaration is inert — the installer
// re-checks containment against the verified tree and requires a SKILL.md.
func parsePluginSkills(root map[string]json.RawMessage) ([]PluginSkill, error) {
	raw, ok := root["skills"]
	if !ok {
		return nil, nil
	}

	var paths []string
	var single string
	var list []string
	var byName map[string]string
	switch {
	case decodeStrict(raw, &single) == nil:
		paths = []string{single}
	case decodeStrict(raw, &list) == nil:
		paths = list
	case decodeStrict(raw, &byName) == nil:
		names := make([]string, 0, len(byName))
		for name := range byName {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			paths = append(paths, byName[name])
		}
	default:
		return nil, errorf(ErrCodeSchema, "skills: expected a path, an array of paths, or an object of name -> path")
	}

	seen := map[string]bool{}
	out := make([]PluginSkill, 0, len(paths))
	for _, entry := range paths {
		path := strings.TrimSpace(entry)
		if path == "" {
			return nil, errorf(ErrCodeSchema, "skills contains an empty path")
		}
		if err := checkSafeField("skills", path); err != nil {
			return nil, err
		}
		path = strings.TrimSuffix(strings.TrimSuffix(path, "/"), string(filepath.Separator))
		dir := path
		if strings.EqualFold(filepath.Base(dir), "SKILL.md") {
			dir = filepath.Dir(dir)
		}
		if dir == "" || dir == "." || dir == ".." {
			return nil, errorf(ErrCodeSchema, "skills path %q does not name a skill directory", entry)
		}
		if seen[dir] {
			continue
		}
		seen[dir] = true
		out = append(out, PluginSkill{Name: filepath.Base(dir), Path: dir})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out, nil
}

// countDeclaredMembers counts the entries of a member LiteSPM reports but
// does not install. An object counts its members, an array its elements, and
// a scalar one.
func countDeclaredMembers(raw json.RawMessage) (int, error) {
	var asObject map[string]json.RawMessage
	if err := decodeStrict(raw, &asObject); err == nil {
		return len(asObject), nil
	}
	var asArray []json.RawMessage
	if err := decodeStrict(raw, &asArray); err == nil {
		return len(asArray), nil
	}
	var asString string
	if err := decodeStrict(raw, &asString); err == nil {
		return 1, nil
	}
	return 0, fmt.Errorf("expected an object, an array or a string")
}
