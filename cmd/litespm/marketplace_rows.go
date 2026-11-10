package main

// marketplace_rows.go — the one view model every in-agent marketplace renders.
//
// Each agent that can draw a popup (Pi, OpenCode, Claude Code, Copilot CLI,
// Amp ...) renders it with that agent's own UI toolkit, because the agent owns
// the terminal and LiteSPM cannot draw inside it. What they must not each do
// is re-implement the marketplace: merging the catalog with what is installed,
// deciding what can be installed, ranking, grouping into tabs. That logic lives
// here, once, and every renderer reads the same document:
//
//	litespm marketplace rows --json [--query <q>] [--host <id>] [--kind <tab>]
//
// Actions stay on the existing verbs (`litespm install <id> --host <id>` and
// `litespm install remove <installId>`), so a popup goes through the same plan,
// policy gate and ledger as the CLI.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/state"
)

const marketplaceRowsSchema = "litespm.marketplace.rows/v1"

// marketplaceTabs are the tabs every renderer shows, in this order.
var marketplaceTabs = []string{"mcp", "skill", "plugin", "installed"}

// marketplaceRow is one row a renderer draws.
type marketplaceRow struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`      // mcp | skill | plugin
	KindLabel string `json:"kindLabel"` // "MCP server" | "Skill" | "Plugin"
	Publisher string `json:"publisher"`
	Summary   string `json:"summary"`
	Version   string `json:"version,omitempty"`
	// Installable is whether `litespm install <id>` can complete for this
	// listing. A renderer must not offer Install when it is false; Reason
	// says why, in words a person can act on.
	Installable bool   `json:"installable"`
	Reason      string `json:"reason,omitempty"`
	// Installed is true when LiteSPM manages a deployment of this listing on
	// this machine; InstalledHere narrows that to the --host agent.
	Installed     bool     `json:"installed"`
	InstalledHere bool     `json:"installedHere"`
	InstallID     string   `json:"installId,omitempty"`
	Agents        []string `json:"agents,omitempty"`
	// State is the inventory lifecycle word for installed rows: managed,
	// observed (found in an agent's own config, read-only), drifted, broken.
	State string `json:"state,omitempty"`
	// Removable is whether `litespm install remove <installId>` applies.
	Removable bool `json:"removable"`
}

// marketplaceRowsDoc is the whole document.
type marketplaceRowsDoc struct {
	Schema       string           `json:"schema"`
	Query        string           `json:"query"`
	Host         string           `json:"host"`
	Kind         string           `json:"kind"`
	CatalogCount int              `json:"catalogCount"`
	Counts       map[string]int   `json:"counts"`
	Total        int              `json:"total"`
	Truncated    bool             `json:"truncated"`
	Notice       string           `json:"notice,omitempty"`
	Tabs         []string         `json:"tabs"`
	Rows         []marketplaceRow `json:"rows"`
	// Installed is every LiteSPM-known deployment (the Installed tab), always
	// present so a renderer needs one call, not two: each call loads the
	// whole catalog.
	Installed []marketplaceRow `json:"installed"`
	// Commands are the exact verbs a renderer runs; spelled out here so a
	// renderer never has to know LiteSPM's CLI grammar.
	Commands marketplaceCommands `json:"commands"`
}

type marketplaceCommands struct {
	Install []string `json:"install"` // append the row id
	Remove  []string `json:"remove"`  // append the row installId
	Sync    []string `json:"sync"`
}

type marketplaceRowsOptions struct {
	query      string
	host       string
	kind       string // "" (all catalog kinds) | mcp | skill | plugin | installed
	limit      int
	jsonOut    bool
	installOnl bool
}

const marketplaceRowsUsage = `Usage: litespm marketplace rows [<query>] [--query <q>] [--host <id>]
                                [--kind mcp|skill|plugin|installed] [--limit <n>]
                                [--installable] [--json]

The view model every in-agent marketplace popup renders: catalog search merged
with what is installed, installable rows first, grouped into tabs. Renderers
read --json; without it a table is printed.`

func parseMarketplaceRowsArgs(args []string) (marketplaceRowsOptions, error) {
	o := marketplaceRowsOptions{limit: 200}
	var positional []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		value := func() (string, error) {
			if i+1 >= len(args) {
				return "", fmt.Errorf("%s needs a value", a)
			}
			i++
			return args[i], nil
		}
		switch a {
		case "--json":
			o.jsonOut = true
		case "--installable":
			o.installOnl = true
		case "--query", "-q":
			v, err := value()
			if err != nil {
				return o, err
			}
			o.query = v
		case "--host", "--agent", "-a":
			v, err := value()
			if err != nil {
				return o, err
			}
			o.host = strings.TrimSpace(v)
		case "--kind", "--tab":
			v, err := value()
			if err != nil {
				return o, err
			}
			k, ok := normalizeMarketplaceKind(v)
			if !ok {
				return o, fmt.Errorf("unknown --kind %q (want mcp, skill, plugin, installed or all)", v)
			}
			o.kind = k
		case "--limit", "-n":
			v, err := value()
			if err != nil {
				return o, err
			}
			n, err := strconv.Atoi(v)
			if err != nil || n <= 0 || n > 5000 {
				return o, fmt.Errorf("--limit must be a number between 1 and 5000")
			}
			o.limit = n
		case "-h", "--help":
			return o, errShowHelp
		default:
			if strings.HasPrefix(a, "-") {
				return o, fmt.Errorf("unknown flag %q", a)
			}
			positional = append(positional, a)
		}
	}
	if len(positional) > 0 {
		if o.query != "" {
			return o, fmt.Errorf("give the query once: either as a word or with --query")
		}
		o.query = strings.Join(positional, " ")
	}
	o.query = strings.TrimSpace(o.query)
	if len(o.query) > 200 {
		o.query = o.query[:200]
	}
	return o, nil
}

var errShowHelp = fmt.Errorf("help requested")

func normalizeMarketplaceKind(raw string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "all", "*":
		return "", true
	case "mcp", "mcps", "server", "servers", "mcp-servers":
		return "mcp", true
	case "skill", "skills":
		return "skill", true
	case "plugin", "plugins":
		return "plugin", true
	case "installed", "local":
		return "installed", true
	}
	return "", false
}

func runMarketplaceRows(args []string) int {
	return runMarketplaceRowsTo(os.Stdout, os.Stderr, args)
}

func runMarketplaceRowsTo(out, errOut io.Writer, args []string) int {
	opts, err := parseMarketplaceRowsArgs(args)
	if err == errShowHelp {
		fmt.Fprintln(out, marketplaceRowsUsage)
		return 0
	}
	if err != nil {
		fmt.Fprintf(errOut, "marketplace rows: %v\n\n%s\n", err, marketplaceRowsUsage)
		return 2
	}
	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		fmt.Fprintf(errOut, "marketplace rows: %v\n", err)
		return 1
	}
	cfg, _ := config.LoadCurrentConfig()
	catClient := catalog.NewClientWithTimeout(registryURLOf(cfg), paths.DataRoot, catalogTimeoutOf(cfg), nil)

	// The inventory is best-effort: a marketplace with no installed view is
	// still a marketplace, so a state read failure becomes a notice.
	var records []inventoryRecord
	notice := ""
	if db, derr := state.Open(paths.StateDBPath()); derr == nil {
		report, ierr := gatherInventory(context.Background(), db, paths.DataRoot, listFlags{})
		_ = db.Close()
		if ierr == nil && report != nil {
			records = report.Records
		} else if ierr != nil {
			notice = "The installed view could not be read: " + ierr.Error()
		}
	} else {
		notice = "The installed view could not be read: " + derr.Error()
	}

	doc := buildMarketplaceRows(catClient, records, opts)
	if doc.Notice == "" {
		doc.Notice = notice
	}

	if opts.jsonOut {
		enc := json.NewEncoder(out)
		enc.SetEscapeHTML(false)
		enc.SetIndent("", "  ")
		if err := enc.Encode(doc); err != nil {
			fmt.Fprintf(errOut, "marketplace rows: %v\n", err)
			return 1
		}
		return 0
	}
	renderMarketplaceRowsTable(out, doc)
	return 0
}

// marketplaceSearcher is the part of the catalog client the view model reads,
// so the ranking is testable without a synced catalog.
type marketplaceSearcher interface {
	Search(query string, opts catalog.SearchOptions) []*catalog.SearchResult
	Count() int
	GetListing(id string) (*domain.Listing, error)
}

// buildMarketplaceRows merges catalog search with the inventory.
func buildMarketplaceRows(cat marketplaceSearcher, records []inventoryRecord, opts marketplaceRowsOptions) *marketplaceRowsDoc {
	doc := &marketplaceRowsDoc{
		Schema:       marketplaceRowsSchema,
		Query:        opts.query,
		Host:         opts.host,
		Kind:         opts.kind,
		CatalogCount: cat.Count(),
		Counts:       map[string]int{},
		Tabs:         marketplaceTabs,
		Commands: marketplaceCommands{
			Install: []string{"install"},
			Remove:  []string{"install", "remove"},
			Sync:    []string{"catalog", "sync"},
		},
	}
	if opts.host != "" {
		doc.Commands.Install = []string{"install", "--host", opts.host}
	}

	installed := installedRowsByID(records, opts.host)

	var rows []marketplaceRow
	if opts.kind == "installed" {
		rows = installedOnlyRows(cat, installed)
	} else {
		if doc.CatalogCount == 0 {
			doc.Notice = "The local catalog is empty. Run `litespm catalog sync` once to download it."
		}
		// Search wide, rank here, cut last: the catalog's own order puts a
		// metadata-only directory row above an installable one with the same
		// name, and a popup that leads with "not installable" rows is useless.
		searchLimit := 4000
		var kind domain.ListingKind
		if opts.kind != "" {
			kind = domain.ListingKind(opts.kind)
		}
		results := cat.Search(opts.query, catalog.SearchOptions{Kind: kind, Limit: searchLimit})
		for _, res := range results {
			if res == nil || res.Listing == nil {
				continue
			}
			row := catalogRow(res.Listing)
			if inst, ok := installed[row.ID]; ok {
				mergeInstalled(&row, inst)
			}
			if opts.installOnl && !row.Installable && !row.Installed {
				continue
			}
			rows = append(rows, row)
		}
		if opts.query == "" {
			// No query: what is installed leads, then the curated picks the
			// site's home page shows, then other installable rows. Sixty
			// thousand alphabetical rows ("$AI on HyperEVM" first) are not a
			// starting point.
			featured := map[string]int{}
			for i, id := range marketplaceFeaturedIDs {
				featured[id] = i
			}
			filtered := rows[:0]
			for _, r := range rows {
				if r.Installed || r.Installable {
					filtered = append(filtered, r)
				}
			}
			rows = filtered
			present := map[string]bool{}
			for _, r := range rows {
				present[r.ID] = true
			}
			var picks []marketplaceRow
			// Everything installed belongs in the starting view even when the
			// catalog's empty-query window did not reach it.
			for _, r := range installedOnlyRows(cat, installed) {
				if !present[r.ID] && (opts.kind == "" || r.Kind == opts.kind) {
					present[r.ID] = true
					picks = append(picks, r)
				}
			}
			for _, id := range marketplaceFeaturedIDs {
				if present[id] {
					continue
				}
				if l, err := cat.GetListing(id); err == nil && l != nil && (opts.kind == "" || string(l.Kind) == opts.kind) {
					row := catalogRow(l)
					if inst, ok := installed[row.ID]; ok {
						mergeInstalled(&row, inst)
					}
					picks = append(picks, row)
				}
			}
			rows = append(picks, rows...)
			sort.SliceStable(rows, func(i, j int) bool {
				fi, iok := featured[rows[i].ID]
				fj, jok := featured[rows[j].ID]
				if iok != jok {
					return iok
				}
				return iok && fi < fj
			})
		}
		sort.SliceStable(rows, func(i, j int) bool {
			return marketplaceRowPriority(rows[i]) < marketplaceRowPriority(rows[j])
		})
	}

	for _, r := range rows {
		doc.Counts[r.Kind]++
		if r.Installed {
			doc.Counts["installed"]++
		}
	}
	doc.Total = len(rows)
	if opts.limit > 0 && len(rows) > opts.limit {
		rows = rows[:opts.limit]
		doc.Truncated = true
	}
	if rows == nil {
		rows = []marketplaceRow{}
	}
	doc.Rows = rows
	doc.Installed = []marketplaceRow{}
	for _, r := range installedOnlyRows(cat, installed) {
		if opts.kind == "" || opts.kind == "installed" || r.Kind == opts.kind {
			doc.Installed = append(doc.Installed, r)
		}
	}
	return doc
}

// marketplaceRowPriority orders rows: installed here, installable, the rest.
// The sort is stable, so the catalog's relevance order holds within a band.
func marketplaceRowPriority(r marketplaceRow) int {
	switch {
	case r.InstalledHere:
		return 0
	case r.Installed:
		return 1
	case r.Installable:
		return 2
	}
	return 3
}

func catalogRow(l *domain.Listing) marketplaceRow {
	row := marketplaceRow{
		ID:          l.ID,
		Name:        strings.TrimSpace(l.Name),
		Kind:        string(l.Kind),
		KindLabel:   marketplaceKindLabel(string(l.Kind)),
		Publisher:   l.PublisherClaim.Name,
		Summary:     strings.TrimSpace(l.Summary),
		Installable: l.IsInstallable(),
	}
	if row.Name == "" {
		row.Name = l.ID
	}
	if row.Publisher == "" {
		row.Publisher = "community"
	}
	if len(l.Versions) > 0 {
		row.Version = l.Versions[0].Version
	}
	if !row.Installable {
		row.Reason = notInstallableReason(l)
	}
	return row
}

// notInstallableReason says, in a person's words, why Install is unavailable.
func notInstallableReason(l *domain.Listing) string {
	if !l.Kind.InstallWired() {
		return "LiteSPM cannot install this kind of capability yet."
	}
	return "Listed in the catalog without a verified source or launch command, so LiteSPM will not install it. Open its page to set it up by hand."
}

type installedEntry struct {
	installID string
	agents    []string
	here      bool
	state     string
	kind      string
	name      string
}

// installedRowsByID folds inventory records into one entry per listing id.
// Only catalog-origin records with an install id are removable; observed
// entries (found in an agent's own config) are shown, never offered for
// removal.
func installedRowsByID(records []inventoryRecord, host string) map[string]*installedEntry {
	out := map[string]*installedEntry{}
	for _, rec := range records {
		if rec.ID == "" {
			continue
		}
		e := out[rec.ID]
		if e == nil {
			e = &installedEntry{kind: rec.Kind, name: rec.Name, state: rec.State}
			out[rec.ID] = e
		}
		if rec.InstallID != "" && e.installID == "" {
			e.installID = rec.InstallID
		}
		if rec.Agent != "" && !containsString(e.agents, rec.Agent) {
			e.agents = append(e.agents, rec.Agent)
		}
		if host == "" || rec.Agent == host {
			e.here = true
		}
		// A managed deployment wins the label over an observed one.
		if rec.State == "managed" || e.state == "" {
			e.state = rec.State
		}
	}
	return out
}

func mergeInstalled(row *marketplaceRow, e *installedEntry) {
	row.Installed = true
	row.InstalledHere = e.here
	row.InstallID = e.installID
	row.Agents = append([]string(nil), e.agents...)
	sort.Strings(row.Agents)
	row.State = e.state
	row.Removable = e.installID != ""
	if row.Installable || row.Removable {
		row.Reason = ""
	}
}

// installedOnlyRows is the Installed tab: every inventory entry, with catalog
// metadata when the listing is known.
func installedOnlyRows(cat marketplaceSearcher, installed map[string]*installedEntry) []marketplaceRow {
	ids := make([]string, 0, len(installed))
	for id := range installed {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	rows := make([]marketplaceRow, 0, len(ids))
	for _, id := range ids {
		e := installed[id]
		var row marketplaceRow
		if l, lerr := cat.GetListing(id); lerr == nil && l != nil {
			row = catalogRow(l)
		} else {
			kind := normalizeInventoryKind(e.kind)
			row = marketplaceRow{
				ID:        id,
				Name:      firstNonEmpty(e.name, id),
				Kind:      kind,
				KindLabel: marketplaceKindLabel(kind),
				Publisher: "local",
			}
		}
		mergeInstalled(&row, e)
		if !row.Removable && row.State == "observed" {
			row.Reason = "Found in the agent's own configuration. LiteSPM shows it but does not change it."
		}
		rows = append(rows, row)
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if marketplaceRowPriority(rows[i]) != marketplaceRowPriority(rows[j]) {
			return marketplaceRowPriority(rows[i]) < marketplaceRowPriority(rows[j])
		}
		return strings.ToLower(rows[i].Name) < strings.ToLower(rows[j].Name)
	})
	return rows
}

func normalizeInventoryKind(k string) string {
	switch strings.ToLower(k) {
	case "skill", "skills":
		return "skill"
	case "plugin", "plugins":
		return "plugin"
	default:
		return "mcp"
	}
}

func renderMarketplaceRowsTable(out io.Writer, doc *marketplaceRowsDoc) {
	if doc.Notice != "" {
		fmt.Fprintln(out, doc.Notice)
		fmt.Fprintln(out)
	}
	if len(doc.Rows) == 0 {
		fmt.Fprintln(out, "Nothing to show.")
		return
	}
	fmt.Fprintf(out, "%-30s %-10s %-11s %s\n", "NAME", "KIND", "STATUS", "ID")
	for _, r := range doc.Rows {
		status := "metadata"
		switch {
		case r.Installed:
			status = "installed"
		case r.Installable:
			status = "available"
		}
		fmt.Fprintf(out, "%-30s %-10s %-11s %s\n", truncate(r.Name, 30), r.KindLabel, status, r.ID)
	}
	if doc.Truncated {
		fmt.Fprintf(out, "\n%d of %d shown. Narrow the search or raise --limit.\n", len(doc.Rows), doc.Total)
	}
}

// marketplaceKindLabel is the label a popup shows for a row's kind.
func marketplaceKindLabel(kind string) string {
	switch kind {
	case "skill":
		return "Skill"
	case "plugin":
		return "Plugin"
	case "mcp":
		return "MCP server"
	}
	return kind
}

// marketplaceFeaturedIDs is the curated starting view of every popup: the same
// twelve rows the site's home page shelf shows (web/data/featured.json, which
// a test keeps this list equal to). The site build checks each one is in the
// catalog and installable.
var marketplaceFeaturedIDs = []string{
	"mcp:builtin:mcp-registry:io.github.github-github-mcp-server",
	"mcp:builtin:mcp-registry:io.github.upstash-context7",
	"mcp:builtin:mcp-registry:com.figma.mcp-mcp",
	"mcp:builtin:mcp-registry:com.notion-mcp",
	"mcp:builtin:mcp-registry:com.cloudflare.mcp-mcp",
	"mcp:builtin:mcp-registry:com.neon-mcp",
	"skill:anthropics:pdf",
	"skill:anthropics:docx",
	"skill:anthropics:xlsx",
	"skill:anthropics:pptx",
	"skill:anthropics:frontend-design",
	"skill:anthropics:webapp-testing",
}
