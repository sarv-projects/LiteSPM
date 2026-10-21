package main

// wizard.go — the interactive setup and management flow behind `litespm` and
// `litespm setup`.
//
// The wizard is a first-class surface: a non-developer can wire an agent,
// update the catalog, find and install a capability, remove one, and see what
// is installed without memorising a single command. Every action delegates to
// the same shared implementation the command line uses —
// host.PlanSetupAt + adapter.ApplySetup for the bridge, catalog.Client.Sync
// and Search for the catalog, authorizeHumanInstall + installSkillFromListing
// / installMCPFromListing for installs, removeInstalledPackage and
// executeSkillsRemove for removal, runListTo for the inventory — so the wizard
// never grows a second installer, remover, search or policy gate.
//
// Two invariants this file holds to:
//
//   - the path written is the path the user agreed to, or nothing is written
//     (enforced by internal/host.PlanSetupAt);
//   - every prompt checks its read error, so an input stream that ends stops
//     the wizard with one guidance line instead of looping forever.

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/deployment"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/state"
)

// errInputEnded reports that the input stream ended before an answer was read.
// It is a normal stop with guidance, not a crash: see finishInput.
var errInputEnded = errors.New("input ended before an answer was read")

// Wizard handles interactive setup and management of agent host integration.
type Wizard struct {
	in     *bufio.Reader
	out    io.Writer
	paths  *config.PlatformPaths
	binary string

	// registeredHosts reports, read-only, which agent hosts already carry the
	// LiteSPM bridge. A second bare `litespm` run uses it to reach the action
	// menu instead of silently re-applying setup. Tests inject a hermetic
	// implementation; nil means host.DetectInstalledHosts.
	registeredHosts func(ctx context.Context) ([]host.HostVerification, error)
	// catalogClient builds the catalog client the menu's sync, search and
	// install actions use. Tests inject a fixture-backed client; nil means the
	// same configured client `litespm search`, `litespm install` and
	// `litespm catalog sync` build.
	catalogClient func() *catalog.Client
	// openState opens the state database the menu actions read and write.
	// Tests inject the database they assert against; nil means opening
	// paths.StateDBPath().
	openState func() (*state.DB, error)
}

// NewWizard initializes an interactive wizard.
func NewWizard(in io.Reader, out io.Writer, paths *config.PlatformPaths) *Wizard {
	execPath, err := os.Executable()
	if err != nil {
		execPath = "litespm"
	}

	return &Wizard{
		in:     bufio.NewReader(in),
		out:    out,
		paths:  paths,
		binary: execPath,
	}
}

// Run executes the setup sequence (when needed) and then the "what next" menu.
//
// A machine that already has a LiteSPM bridge registered does not re-apply
// anything: it is told what is configured and goes straight to the menu, so a
// second bare `litespm` run is a management session, not a silent rewrite.
func (w *Wizard) Run(ctx context.Context) error {
	w.printBanner()
	w.printRuntimeSummary()

	configured, err := w.configuredHosts(ctx)
	if err != nil {
		fmt.Fprintf(w.out, "Could not check for existing LiteSPM setups: %v\n", err)
		configured = nil
	}

	if len(configured) == 0 {
		cancelled, serr := w.runSetup(ctx)
		if serr != nil {
			return w.finishInput(serr)
		}
		if cancelled {
			fmt.Fprintln(w.out, "\nSetup cancelled.")
			return nil
		}
	} else {
		w.printConfiguredSummary(configured)
	}

	return w.finishInput(w.runActionMenu(ctx))
}

// finishInput turns an ended input stream into one guidance line and a clean
// stop. Any other error is returned unchanged.
func (w *Wizard) finishInput(err error) error {
	if errors.Is(err, errInputEnded) {
		fmt.Fprintln(w.out, "")
		fmt.Fprintln(w.out, "No more input could be read (the input ended), so LiteSPM stopped.")
		fmt.Fprintln(w.out, "Nothing further was changed. Re-run `litespm` in a terminal to continue.")
		return nil
	}
	return err
}

// readLine reads one trimmed line of user input. An ended stream (EOF, a
// closed pipe, Ctrl-D) is reported as errInputEnded; it is never mistaken for
// an empty answer, which is how the old menu turned Ctrl-D into an endless
// "Invalid option." loop.
func (w *Wizard) readLine() (string, error) {
	line, err := w.in.ReadString('\n')
	if err != nil {
		if line == "" {
			return "", errInputEnded
		}
		// A final line without a trailing newline is still an answer; the next
		// read reports the end of input.
		return strings.TrimSpace(line), nil
	}
	return strings.TrimSpace(line), nil
}

func (w *Wizard) printBanner() {
	fmt.Fprintln(w.out, "")
	fmt.Fprintln(w.out, "┌────────────────────────────────────────────────────────────────────────┐")
	fmt.Fprintln(w.out, "│                LiteSPM — setup and capability manager                  │")
	fmt.Fprintln(w.out, "│                     for your AI coding agent                           │")
	fmt.Fprintln(w.out, "└────────────────────────────────────────────────────────────────────────┘")
	fmt.Fprintln(w.out, "")
}

// printRuntimeSummary says what LiteSPM is and how many agents it supports,
// derived from the adapter registry. It claims no runtime check: nothing on
// this machine has been inspected yet.
func (w *Wizard) printRuntimeSummary() {
	adapters := host.ListAdapters()
	fmt.Fprintf(w.out, "LiteSPM can connect to %d different agent hosts.\n", len(adapters))
	fmt.Fprintln(w.out, "This run has not changed anything yet.")
	fmt.Fprintln(w.out, "")
}

// configuredHosts lists the hosts whose LiteSPM bridge already verifies.
func (w *Wizard) configuredHosts(ctx context.Context) ([]host.HostVerification, error) {
	fn := w.registeredHosts
	if fn == nil {
		fn = host.DetectInstalledHosts
	}
	verifs, err := fn(ctx)
	if err != nil {
		return nil, err
	}
	configured := make([]host.HostVerification, 0, len(verifs))
	for _, v := range verifs {
		if v.Registered || v.Status == "ready" {
			configured = append(configured, v)
		}
	}
	sort.Slice(configured, func(i, j int) bool { return configured[i].HostID < configured[j].HostID })
	return configured, nil
}

func (w *Wizard) printConfiguredSummary(configured []host.HostVerification) {
	fmt.Fprintln(w.out, "LiteSPM is already set up for:")
	for _, v := range configured {
		name := v.HostID
		if a, err := host.GetAdapter(v.HostID); err == nil {
			name = a.Descriptor().DisplayName
		}
		path := v.ConfigPath
		if path == "" {
			path = "(no configuration file was reported)"
		}
		fmt.Fprintf(w.out, "  • %s\n    %s\n", name, path)
	}
	fmt.Fprintln(w.out, "Nothing was changed.")
	fmt.Fprintln(w.out, "")
}

// runSetup runs agent selection → configuration resolution → bridge write.
// cancelled reports that the user chose to stop. A failed plan or write is
// reported and returns cancelled=false: the action menu that follows is where
// the user can retry or print the manual snippet.
func (w *Wizard) runSetup(ctx context.Context) (bool, error) {
	adapter, err := w.promptAgentSelection(ctx)
	if err != nil {
		return false, err
	}
	if adapter == nil {
		return true, nil
	}

	configPath, ok, err := w.resolveAgentConfig(ctx, adapter)
	if err != nil {
		return false, err
	}
	if !ok {
		return true, nil
	}

	if err := w.applyAgentIntegration(ctx, adapter, configPath); err != nil {
		if errors.Is(err, errInputEnded) {
			return false, err
		}
		fmt.Fprintf(w.out, "\nSetup did not finish: %v\n", err)
		fmt.Fprintln(w.out, "Nothing was written to a file you did not name.")
		return false, nil
	}
	return false, nil
}

// agentMenuRow is one selectable agent, built from the adapter registry rather
// than a hand-maintained list. The old list had six rows and had already
// drifted (it advertised a Pi config file no Pi release reads); deriving the
// rows makes that class of drift impossible.
type agentMenuRow struct {
	adapter    host.HostAdapter
	descriptor host.HostDescriptor
	configPath string
	exists     bool
}

// agentMenuRows returns every registered adapter, sorted for a stable menu,
// with the config path the adapter itself resolves and whether a file is
// already there.
func (w *Wizard) agentMenuRows(ctx context.Context) []agentMenuRow {
	adapters := host.ListAdapters()
	rows := make([]agentMenuRow, 0, len(adapters))
	for _, adapter := range adapters {
		d := adapter.Descriptor()
		path, err := adapter.DetectConfig(ctx, domain.ScopeUser)
		if err != nil {
			path = ""
		}
		rows = append(rows, agentMenuRow{
			adapter:    adapter,
			descriptor: d,
			configPath: path,
			exists:     path != "" && fileExists(path),
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].descriptor.DisplayName != rows[j].descriptor.DisplayName {
			return rows[i].descriptor.DisplayName < rows[j].descriptor.DisplayName
		}
		return rows[i].descriptor.HostID < rows[j].descriptor.HostID
	})
	return rows
}

// promptAgentSelection shows the agents detected on this machine first, with
// an explicit way to see every supported agent. No row names a config file the
// adapter itself did not resolve.
func (w *Wizard) promptAgentSelection(ctx context.Context) (host.HostAdapter, error) {
	rows := w.agentMenuRows(ctx)
	var detected []agentMenuRow
	for _, r := range rows {
		if r.exists {
			detected = append(detected, r)
		}
	}

	fmt.Fprintln(w.out, "Which AI coding agent do you use?")
	fmt.Fprintln(w.out, "")
	if len(detected) > 0 {
		fmt.Fprintf(w.out, "Found on this machine (%d):\n", len(detected))
		w.printAgentRows(detected)
		fmt.Fprintf(w.out, "  [a] Show all %d supported agents\n", len(rows))
	} else {
		fmt.Fprintln(w.out, "No agent configuration file was found on this machine yet.")
		fmt.Fprintf(w.out, "  [a] Show all %d supported agents\n", len(rows))
	}
	fmt.Fprintln(w.out, "  [q] Quit")
	fmt.Fprintln(w.out, "")

	showAll := false
	for {
		fmt.Fprint(w.out, "Enter a number, an agent name, or 'a' [q]: ")
		line, err := w.readLine()
		if err != nil {
			return nil, err
		}
		if line == "" || strings.EqualFold(line, "q") {
			return nil, nil
		}
		if strings.EqualFold(line, "a") {
			if !showAll {
				showAll = true
				fmt.Fprintf(w.out, "\nAll %d supported agents:\n", len(rows))
				w.printAgentRows(rows)
				fmt.Fprintln(w.out, "")
			}
			continue
		}
		pool := detected
		if showAll {
			pool = rows
		}
		if n, nerr := strconv.Atoi(line); nerr == nil {
			if n >= 1 && n <= len(pool) {
				return pool[n-1].adapter, nil
			}
			fmt.Fprintf(w.out, "There is no agent %d in the list shown. Enter 'a' to see all %d supported agents.\n", n, len(rows))
			continue
		}
		for _, r := range rows {
			if strings.EqualFold(r.descriptor.HostID, line) || strings.EqualFold(r.descriptor.DisplayName, line) {
				return r.adapter, nil
			}
		}
		fmt.Fprintln(w.out, "Not recognised. Enter the number next to your agent, its name, or 'a' for the full list.")
	}
}

func (w *Wizard) printAgentRows(rows []agentMenuRow) {
	for i, r := range rows {
		where := "no configuration file is known for this agent"
		switch {
		case r.exists:
			where = r.configPath
		case r.configPath != "":
			where = "no file yet — would create " + r.configPath
		}
		fmt.Fprintf(w.out, "  [%d] %-30s %s\n", i+1, r.descriptor.DisplayName, where)
	}
}

// describeConfigTarget tells the user, in plain words, whether an existing file
// will be edited or a new one created. The old wording called the would-be path
// of a file that does not exist "Detected", which contradicted `litespm host
// detect` and made "edit my file" indistinguishable from "create one".
func describeConfigTarget(name, path string) string {
	if fileExists(path) {
		return fmt.Sprintf(
			"Found your existing configuration file:\n  %s\nLiteSPM will add one entry to this file. Everything else in it is left as it is, and a backup copy is saved first.",
			path)
	}
	return fmt.Sprintf(
		"No configuration file exists yet for %s. LiteSPM will create:\n  %s",
		name, path)
}

// resolveAgentConfig resolves the file the user agrees to write. The returned
// path is exactly the path that will be written: a manual path is honoured by
// internal/host.PlanSetupAt, and a setup that cannot write there is refused —
// never redirected to the adapter's own default.
func (w *Wizard) resolveAgentConfig(ctx context.Context, adapter host.HostAdapter) (string, bool, error) {
	name := adapter.Descriptor().DisplayName
	fmt.Fprintf(w.out, "\nLooking for %s's configuration file...\n", name)

	candidate, detectErr := adapter.DetectConfig(ctx, domain.ScopeUser)
	if detectErr == nil && candidate != "" {
		fmt.Fprintln(w.out, describeConfigTarget(name, candidate))
		fmt.Fprint(w.out, "Use this file? [Y/n]: ")
		line, err := w.readLine()
		if err != nil {
			return "", false, err
		}
		switch strings.ToLower(line) {
		case "", "y", "yes":
			return candidate, true, nil
		}
	} else {
		fmt.Fprintf(w.out, "Could not work out where %s keeps its configuration file.\n", name)
	}

	for {
		fmt.Fprintln(w.out, "")
		fmt.Fprintln(w.out, "What would you like to do?")
		fmt.Fprintln(w.out, "  [1] Type the full path of the configuration file")
		fmt.Fprintln(w.out, "  [2] Print a snippet to paste into the file yourself")
		fmt.Fprintln(w.out, "  [3] Look for the file again")
		fmt.Fprintln(w.out, "  [q] Cancel setup")
		fmt.Fprint(w.out, "Enter choice [1-3, q]: ")
		choice, err := w.readLine()
		if err != nil {
			return "", false, err
		}

		switch choice {
		case "1":
			fmt.Fprint(w.out, "Full path: ")
			custom, err := w.readLine()
			if err != nil {
				return "", false, err
			}
			if custom == "" {
				fmt.Fprintln(w.out, "No path was entered.")
				continue
			}
			fmt.Fprintln(w.out, describeConfigTarget(name, custom))
			return custom, true, nil

		case "2":
			fmt.Fprintf(w.out, "\n--- Paste this into %s's configuration file ---\n", name)
			fmt.Fprintln(w.out, adapter.RenderManualSetup(w.binary))
			fmt.Fprintln(w.out, "-------------------------------------------")

		case "3":
			retry, rerr := adapter.DetectConfig(ctx, domain.ScopeUser)
			if rerr != nil || retry == "" {
				fmt.Fprintf(w.out, "Still could not work out where %s keeps its configuration file.\n", name)
				continue
			}
			fmt.Fprintln(w.out, describeConfigTarget(name, retry))
			fmt.Fprint(w.out, "Use this file? [Y/n]: ")
			line, err := w.readLine()
			if err != nil {
				return "", false, err
			}
			switch strings.ToLower(line) {
			case "", "y", "yes":
				return retry, true, nil
			}

		case "q", "Q":
			return "", false, nil

		default:
			fmt.Fprintln(w.out, "Please enter 1, 2, 3 or q.")
		}
	}
}

// applyAgentIntegration plans the bridge write against the agreed path, shows
// exactly what will change, and writes only after the user says yes. The plan
// is built by host.PlanSetupAt, so plan.ConfigPath is the agreed path — and
// adapter.ApplySetup writes that path or fails.
func (w *Wizard) applyAgentIntegration(ctx context.Context, adapter host.HostAdapter, configPath string) error {
	backupDir := w.paths.BackupsPath()
	if err := os.MkdirAll(backupDir, 0700); err != nil {
		return fmt.Errorf("could not create the backups directory %s: %w", backupDir, err)
	}

	plan, err := host.PlanSetupAt(ctx, adapter, w.binary, backupDir, configPath)
	if err != nil {
		return err
	}
	if plan.ProposedContent == "" {
		return fmt.Errorf("cannot write %s: the adapter proposed an empty file, refusing to touch it", configPath)
	}

	fmt.Fprintf(w.out, "\nAbout to make one change to %s:\n\n", plan.ConfigPath)
	preview, hidden := changePreview(plan.OriginalContent, plan.ProposedContent, 40)
	for _, l := range preview {
		fmt.Fprintln(w.out, "  "+l)
	}
	if hidden > 0 {
		fmt.Fprintf(w.out, "  … and %d more changed line(s)\n", hidden)
	}
	fmt.Fprintln(w.out, "\nEverything else in the file is left as it is.")
	fmt.Fprint(w.out, "Write this change? [Y/n]: ")
	line, err := w.readLine()
	if err != nil {
		return err
	}
	switch strings.ToLower(line) {
	case "", "y", "yes":
	default:
		fmt.Fprintln(w.out, "Nothing was written.")
		return nil
	}

	result, err := adapter.ApplySetup(ctx, plan)
	if err != nil {
		return fmt.Errorf("could not write %s: %w", configPath, err)
	}

	fmt.Fprintf(w.out, "✓ Done. LiteSPM is registered with %s.\n", adapter.Descriptor().DisplayName)
	if result.BackupPath != "" {
		fmt.Fprintf(w.out, "  • Backup of the previous file: %s\n", result.BackupPath)
	}
	fmt.Fprintf(w.out, "  • File written: %s\n", result.ConfigPath)

	preExisting, _ := adapter.DetectPreExistingComponents(ctx)
	if len(preExisting) > 0 {
		fmt.Fprintf(w.out, "\nFound %d other MCP server(s) already in this file:\n", len(preExisting))
		for _, comp := range preExisting {
			fmt.Fprintf(w.out, "  - %s (%s)\n", comp.Name, comp.Kind)
		}
		fmt.Fprintln(w.out, "LiteSPM did not write these and will not change them.")
	}

	w.printNextStep(adapter)
	return nil
}

// changePreview renders the changed lines between two file contents, trimming
// the common prefix and suffix so only the touched region(s) are shown, and
// reports how many changed lines were not printed. It is presentation only:
// the write itself is the adapter's surgical merge.
func changePreview(original, proposed string, maxLines int) ([]string, int) {
	if maxLines < 1 {
		maxLines = 1
	}
	var a []string
	if original != "" {
		a = strings.Split(original, "\n")
	}
	b := strings.Split(proposed, "\n")
	prefix := 0
	for prefix < len(a) && prefix < len(b) && a[prefix] == b[prefix] {
		prefix++
	}
	suffix := 0
	for suffix < len(a)-prefix && suffix < len(b)-prefix && a[len(a)-1-suffix] == b[len(b)-1-suffix] {
		suffix++
	}

	var out []string
	changed := 0
	add := func(marker, line string) {
		changed++
		if len(out) < maxLines {
			out = append(out, marker+" "+truncate(line, 160))
		}
	}
	for _, l := range a[prefix : len(a)-suffix] {
		add("-", l)
	}
	for _, l := range b[prefix : len(b)-suffix] {
		add("+", l)
	}
	return out, changed - len(out)
}

// printNextStep names what the user can do in the agent, from the adapter's own
// descriptor. The per-host hardcoded next steps are gone: they were a second,
// drift-prone copy of the registry.
func (w *Wizard) printNextStep(adapter host.HostAdapter) {
	d := adapter.Descriptor()
	trigger := d.SlashCommandTrigger
	if trigger == "" {
		trigger = "/marketplace"
	}
	fmt.Fprintln(w.out, "")
	fmt.Fprintln(w.out, "Next:")
	fmt.Fprintf(w.out, "  • Start %s and type %s to browse and install capabilities.\n", d.DisplayName, trigger)
	fmt.Fprintln(w.out, "  • Or stay here: this wizard can update the catalog, install and remove things too.")
}

// --- the "what next" action menu -----------------------------------------

// runActionMenu is reachable both after a fresh setup and on a machine that is
// already configured (a second bare `litespm` run). Every entry performs a real
// action; nothing here leads to a refusal.
func (w *Wizard) runActionMenu(ctx context.Context) error {
	db, closeDB, err := w.openStateDB()
	if err != nil {
		fmt.Fprintf(w.out, "\nLiteSPM's local state could not be opened: %v\n", err)
		fmt.Fprintln(w.out, "Installing and removing need it. You can still run:")
		fmt.Fprintln(w.out, "  litespm catalog sync     download the capability catalog")
		fmt.Fprintln(w.out, "  litespm search <text>    look for capabilities")
		fmt.Fprintln(w.out, "  litespm install <id>     install one by its id")
		return nil
	}
	defer closeDB()

	for {
		fmt.Fprintln(w.out, "")
		fmt.Fprintln(w.out, "What would you like to do?")
		if c := w.catalog(); c != nil && c.Count() == 0 {
			fmt.Fprintln(w.out, "  [1] Update the capability catalog (needed before you can search)")
		} else {
			fmt.Fprintln(w.out, "  [1] Update the capability catalog")
		}
		fmt.Fprintln(w.out, "  [2] Find and install a capability")
		fmt.Fprintln(w.out, "  [3] Remove something LiteSPM installed")
		fmt.Fprintln(w.out, "  [4] See what is installed")
		fmt.Fprintln(w.out, "  [5] Set up or repair an agent connection")
		fmt.Fprintln(w.out, "  [q] Finish")
		fmt.Fprint(w.out, "Enter choice [1-5, q]: ")
		choice, err := w.readLine()
		if err != nil {
			return err
		}

		var actionErr error
		switch choice {
		case "1":
			actionErr = w.actionSyncCatalog(ctx)
		case "2":
			actionErr = w.actionFindAndInstall(ctx, db)
		case "3":
			actionErr = w.actionRemove(ctx, db)
		case "4":
			actionErr = w.actionListInstalled()
		case "5":
			_, actionErr = w.runSetup(ctx)
		case "q", "Q":
			return nil
		default:
			fmt.Fprintln(w.out, "Please enter 1, 2, 3, 4, 5 or q.")
		}
		if actionErr != nil {
			return actionErr
		}
	}
}

// openStateDB opens the state database for the menu actions. The returned
// close function is a no-op when the database was injected (tests own it).
func (w *Wizard) openStateDB() (*state.DB, func(), error) {
	if w.openState != nil {
		db, err := w.openState()
		if err != nil {
			return nil, func() {}, err
		}
		return db, func() {}, nil
	}
	if err := w.paths.EnsureDirectories(); err != nil {
		return nil, func() {}, fmt.Errorf("prepare LiteSPM's storage directories: %w", err)
	}
	db, err := state.Open(w.paths.StateDBPath())
	if err != nil {
		return nil, func() {}, err
	}
	return db, func() { _ = db.Close() }, nil
}

// catalog returns the catalog client every menu action uses. It is the same
// configured client the CLI commands build, so the wizard sees the same index
// they do.
func (w *Wizard) catalog() *catalog.Client {
	if w.catalogClient != nil {
		return w.catalogClient()
	}
	cfg, _ := config.LoadCurrentConfig()
	return catalog.NewClientWithTimeout(registryURLOf(cfg), w.paths.DataRoot, catalogTimeoutOf(cfg), nil)
}

// actionSyncCatalog is the one step that must touch the network, so it is an
// explicit opt-in that says what it fetches — and a failure says so instead of
// printing a success line.
func (w *Wizard) actionSyncCatalog(ctx context.Context) error {
	catClient := w.catalog()
	cfg, _ := config.LoadCurrentConfig()
	regURL := registryURLOf(cfg)

	fmt.Fprintln(w.out, "")
	fmt.Fprintf(w.out, "LiteSPM will download the capability catalog from:\n  %s\n", regURL)
	fmt.Fprintln(w.out, "This is the list of MCP servers and skills the catalog publishes. It installs nothing and changes nothing on your machine.")
	empty := catClient.Count() == 0
	if empty {
		fmt.Fprintln(w.out, "The local catalog is empty right now, so searching finds nothing until this succeeds.")
	} else {
		fmt.Fprintf(w.out, "The local copy currently holds %d capabilities; this replaces it with the latest published list.\n", catClient.Count())
	}
	fmt.Fprint(w.out, "Download it now? [Y/n]: ")
	line, err := w.readLine()
	if err != nil {
		return err
	}
	switch strings.ToLower(line) {
	case "", "y", "yes":
	default:
		fmt.Fprintln(w.out, "Not downloaded.")
		return nil
	}

	syncCtx, cancel := context.WithTimeout(ctx, catalogSyncTimeout(cfg))
	defer cancel()
	res, err := catClient.Sync(syncCtx)
	if err != nil {
		fmt.Fprintf(w.out, "✗ Could not update the catalog: %v\n", err)
		if empty {
			fmt.Fprintln(w.out, "  The local catalog is still empty. Nothing was changed.")
		} else {
			fmt.Fprintln(w.out, "  Nothing was changed; the previous local copy is still there.")
		}
		fmt.Fprintln(w.out, "  Try again with: litespm catalog sync")
		if empty {
			fmt.Fprintln(w.out, "  If it keeps failing, this copy of LiteSPM may be too old for the published")
			fmt.Fprintln(w.out, "  catalog format; update it with: npm install -g litespm")
		}
		return nil
	}
	if res.Updated {
		fmt.Fprintf(w.out, "✓ Catalog updated: %d capabilities indexed (release %s).\n", res.ItemCount, res.ReleaseID)
	} else {
		fmt.Fprintf(w.out, "✓ Catalog is already up to date: %d capabilities (release %s).\n", res.ItemCount, res.ReleaseID)
	}
	return nil
}

// actionFindAndInstall searches the local catalog, shows the matches, and
// installs the chosen one through the SAME gate the CLI uses:
// authorizeHumanInstall (plan + human approval + policy) and then
// installSkillFromListing / installMCPFromListing.
func (w *Wizard) actionFindAndInstall(ctx context.Context, db *state.DB) error {
	catClient := w.catalog()
	if catClient.Count() == 0 {
		fmt.Fprintln(w.out, "\nThe catalog is empty: there is nothing to search yet.")
		fmt.Fprintln(w.out, "Choose [1] first to download it, or run: litespm catalog sync")
		return nil
	}

	fmt.Fprint(w.out, "\nWhat are you looking for? (for example: github, postgres, pdf) ")
	query, err := w.readLine()
	if err != nil {
		return err
	}
	if query == "" {
		fmt.Fprintln(w.out, "No search text was entered.")
		return nil
	}

	results := catClient.Search(query, catalog.SearchOptions{Limit: 25})
	if len(results) == 0 {
		fmt.Fprintf(w.out, "Nothing in the catalog matches %q.\n", query)
		return nil
	}
	fmt.Fprintf(w.out, "\nFound %d capabilities matching %q:\n\n", len(results), query)
	for i, res := range results {
		l := res.Listing
		fmt.Fprintf(w.out, "  [%d] %-30s %-11s %s\n", i+1, truncate(l.Name, 30), kindLabel(l.Kind), truncate(l.Summary, 60))
		fmt.Fprintf(w.out, "      id: %s\n", l.ID)
	}
	fmt.Fprint(w.out, "\nEnter the number to install (or press Enter to go back): ")
	line, err := w.readLine()
	if err != nil {
		return err
	}
	if line == "" {
		return nil
	}
	n, nerr := strconv.Atoi(line)
	if nerr != nil || n < 1 || n > len(results) {
		fmt.Fprintln(w.out, "That is not one of the numbers shown.")
		return nil
	}
	listing := results[n-1].Listing
	// Kind gate first: a plugin is refused before the scope and consent
	// questions, because the install cannot be performed whatever the answers
	// would be — asking first and refusing after is a question that was never
	// the user's to answer.
	if refusal := installKindRefusal(listing); refusal != nil {
		fmt.Fprintf(w.out, "\nLiteSPM cannot install %s yet: %v\n", listing.Name, refusal)
		fmt.Fprintln(w.out, "Nothing was changed.")
		return nil
	}
	if !listing.IsInstallable() {
		fmt.Fprintf(w.out, "\n%s is catalog metadata only: it has no verified source, so LiteSPM cannot install it.\n", listing.Name)
		return nil
	}

	fmt.Fprint(w.out, "\nInstall for all your agents on this machine [1], or only for this project [2]? [1]: ")
	scopeChoice, err := w.readLine()
	if err != nil {
		return err
	}
	scope := domain.ScopeUser
	projectRoot := ""
	if scopeChoice == "2" {
		cwd, cerr := os.Getwd()
		if cerr != nil {
			fmt.Fprintf(w.out, "Could not find the current directory: %v\n", cerr)
			return nil
		}
		abs, perr := resolveProjectDir(cwd)
		if perr != nil {
			fmt.Fprintf(w.out, "The current directory cannot be used as a project: %v\n", perr)
			return nil
		}
		scope = domain.ScopeProject
		projectRoot = abs
	}

	fmt.Fprintf(w.out, "Install %s (%s) for %s? [Y/n]: ", listing.Name, kindLabel(listing.Kind), installScopeLabel(scope))
	confirm, err := w.readLine()
	if err != nil {
		return err
	}
	switch strings.ToLower(confirm) {
	case "", "y", "yes":
	default:
		fmt.Fprintln(w.out, "Not installed.")
		return nil
	}

	// Fail-closed invariant: the kind gate above admits only skill and mcp.
	// Reaching the other branch means the two lists disagree; refusing beats
	// proceeding into machinery that cannot finish.
	if listing.Kind != domain.KindSkill && listing.Kind != domain.KindMCP {
		fmt.Fprintf(w.out, "\nLiteSPM cannot install %s: kind %q is marked install-wired but no install path handles it.\n", listing.Name, listing.Kind)
		fmt.Fprintln(w.out, "Nothing was changed.")
		return nil
	}

	// An MCP server is registered in every agent that has the LiteSPM bridge.
	// The target set is captured here, before the plan is sealed, exactly as
	// `litespm install` captures it.
	var mcpBinding *mcpInstallBinding
	if listing.Kind == domain.KindMCP {
		runtime, rerr := catClient.RuntimeForListing(listing.ID, "latest")
		if rerr != nil {
			fmt.Fprintf(w.out, "Cannot install %s: %v\n", listing.Name, domain.ErrArtifactUnavailable(listing.ID, rerr.Error()))
			return nil
		}
		targetHosts := host.RegisteredBridgeHosts(ctx, scope)
		if len(targetHosts) == 0 {
			fmt.Fprintln(w.out, "Cannot install an MCP server yet: no agent has the LiteSPM bridge set up for this scope.")
			fmt.Fprintln(w.out, "Choose [5] to set up an agent, or run: litespm host setup <host-id>")
			return nil
		}
		mcpBinding = &mcpInstallBinding{Hosts: uniqueHostIDs(targetHosts), Runtime: runtime}
	}

	// The wizard resolves a skill's targets exactly as the CLI does — the
	// detected set — and the plan seals them, so the writes below are the ones
	// the reader was shown before answering yes. A future agent on this machine
	// cannot widen this install.
	var skillBinding *skillInstallBinding
	if listing.Kind == domain.KindSkill {
		skillBinding = &skillInstallBinding{AllDetected: true}
	}

	grant, droppedHosts, gerr := authorizeHumanInstall(ctx, db, catClient, listing, "", scope, projectRoot, mcpBinding, skillBinding)
	if gerr != nil {
		fmt.Fprintf(w.out, "Install refused before anything was changed: %v\n", gerr)
		return nil
	}
	for _, d := range droppedHosts {
		fmt.Fprintf(w.out, "Note: %s will not receive this server: %s\n", d.HostID, d.Reason)
	}
	grantCtx := grant.context(ctx)

	if listing.Kind == domain.KindSkill {
		home, _ := os.UserHomeDir()
		agents, aerr := skillAgentsFromPlan(grant.Plan)
		if aerr != nil {
			grant.refund(grantCtx, db)
			fmt.Fprintf(w.out, "Install failed: %v\n", aerr)
			fmt.Fprintln(w.out, "Nothing was changed.")
			return nil
		}
		outcome, ierr := installSkillFromListing(grantCtx, db, w.paths.DataRoot, projectRoot, home,
			listing, versionOrLatest(""), scope, agents)
		if ierr != nil {
			grant.refund(grantCtx, db)
			fmt.Fprintf(w.out, "Install failed: %v\n", ierr)
			fmt.Fprintln(w.out, "Nothing was left behind: any partial write was rolled back.")
			return nil
		}
		fmt.Fprintf(w.out, "✓ Installed skill %s\n", outcome.SkillName)
		for _, dest := range outcome.Destinations {
			fmt.Fprintf(w.out, "  • Written to: %s\n", dest)
		}
		return nil
	}

	plannedBinding, berr := mcpInstallBindingFromPlan(grantCtx, grant.Plan, listing, scope)
	if berr != nil {
		grant.refund(grantCtx, db)
		fmt.Fprintf(w.out, "Install failed: %v\n", berr)
		fmt.Fprintln(w.out, "Nothing was left behind: any partial write was rolled back.")
		return nil
	}
	outcome, ierr := installMCPFromListing(grantCtx, db, w.paths.DataRoot, listing, grant.Version, scope, projectRoot,
		plannedBinding.Hosts, plannedBinding.Force, plannedBinding.Runtime, plannedBinding.EnvNames)
	if ierr != nil {
		grant.refund(grantCtx, db)
		fmt.Fprintf(w.out, "Install failed: %v\n", ierr)
		fmt.Fprintln(w.out, "Nothing was left behind: any partial write was rolled back.")
		return nil
	}
	fmt.Fprintf(w.out, "✓ Registered MCP server %s\n", outcome.Entry.Name)
	for _, h := range outcome.Hosts {
		fmt.Fprintf(w.out, "  • %s: entry written in %s\n", h.HostID, h.ConfigPath)
	}
	return nil
}

// removableItem is one thing the user can remove: an install LiteSPM recorded
// (removed through removeInstalledPackage, which reconciles the deployment
// ledger) or a skill directory the skills ledger names with no install record
// (removed through executeSkillsRemove).
type removableItem struct {
	label      string
	dests      []string
	installID  string
	skillName  string
	skillScope string
}

// removableItems lists what can be removed, with the destinations each removal
// would delete. It reads the same sources `litespm list` does: install rows,
// the deployment ledger and the skills ledger.
func (w *Wizard) removableItems(ctx context.Context, db *state.DB) ([]removableItem, error) {
	projectRoot := w.projectRoot()
	installs, err := installsForProjectRoot(ctx, db, projectRoot)
	if err != nil {
		return nil, err
	}
	installRows := make(map[string]*domain.InstallRecord, len(installs))
	for _, rec := range installs {
		installRows[rec.InstallID] = rec
	}

	ledger := deployment.NewLedger(db.Raw())
	covered := map[string]bool{} // skill directories an install record owns
	var items []removableItem
	for _, rec := range installs {
		if rec.Status == domain.InstallRemoved {
			continue
		}
		name := installComponentName(ctx, db, rec.InstallID)
		if name == "" {
			name = rec.ListingID
		}
		var dests []string
		if muts, merr := ledger.MutationsForInstall(ctx, rec.InstallID); merr == nil {
			for _, m := range muts {
				if m.Detached {
					continue
				}
				if m.StructureType == "skill-dir" {
					covered[m.FilePath] = true
				}
				if m.FilePath != "" {
					dests = append(dests, m.FilePath)
				}
			}
		}
		if len(dests) == 0 && rec.InstallPath != "" {
			dests = append(dests, rec.InstallPath)
		}
		items = append(items, removableItem{
			label: fmt.Sprintf("%s — %s (installed for %s, id %s)",
				name, kindLabel(rec.Kind), installScopeLabel(rec.Scope), rec.InstallID),
			dests:     uniqueStrings(dests),
			installID: rec.InstallID,
		})
	}

	// Skills the ledger names but no install record covers (`skills add`).
	entries, lerr := loadSkillLedgerEntries(w.paths)
	if lerr != nil {
		return items, nil
	}
	for _, e := range entries {
		if covered[e.DestDir] {
			continue
		}
		if installIDForPath(installRows, e.DestDir) != "" {
			continue
		}
		items = append(items, removableItem{
			label:      fmt.Sprintf("%s — skill (installed for %s)", e.SkillName, installScopeLabel(mutationScope(e.Scope))),
			dests:      []string{e.DestDir},
			skillName:  e.SkillName,
			skillScope: e.Scope,
		})
	}
	return items, nil
}

// actionRemove shows what LiteSPM installed and removes the chosen item through
// the shared removal engines, keeping every guard: only what the ledger names
// is deleted, user-added files are kept, and the scope is respected.
func (w *Wizard) actionRemove(ctx context.Context, db *state.DB) error {
	items, err := w.removableItems(ctx, db)
	if err != nil {
		fmt.Fprintf(w.out, "Could not read what is installed: %v\n", err)
		return nil
	}
	if len(items) == 0 {
		fmt.Fprintln(w.out, "\nNothing that LiteSPM installed was found, so there is nothing to remove.")
		return nil
	}

	fmt.Fprintln(w.out, "\nLiteSPM installed these. Choose one to remove:")
	fmt.Fprintln(w.out, "")
	for i, it := range items {
		fmt.Fprintf(w.out, "  [%d] %s\n", i+1, it.label)
		for _, dest := range it.dests {
			fmt.Fprintf(w.out, "      %s\n", dest)
		}
	}
	fmt.Fprint(w.out, "\nEnter the number to remove (or press Enter to go back): ")
	line, err := w.readLine()
	if err != nil {
		return err
	}
	if line == "" {
		return nil
	}
	n, nerr := strconv.Atoi(line)
	if nerr != nil || n < 1 || n > len(items) {
		fmt.Fprintln(w.out, "That is not one of the numbers shown.")
		return nil
	}
	item := items[n-1]

	fmt.Fprintln(w.out, "\nThis will delete:")
	for _, dest := range item.dests {
		fmt.Fprintf(w.out, "  • %s\n", dest)
	}
	fmt.Fprintln(w.out, "Only the parts LiteSPM wrote are removed; anything you edited or added is kept.")
	fmt.Fprint(w.out, "Remove it? [y/N]: ")
	confirm, err := w.readLine()
	if err != nil {
		return err
	}
	if !strings.EqualFold(confirm, "y") && !strings.EqualFold(confirm, "yes") {
		fmt.Fprintln(w.out, "Nothing was removed.")
		return nil
	}

	if item.installID != "" {
		if err := removeInstalledPackage(ctx, db, w.paths.DataRoot, item.installID); err != nil {
			fmt.Fprintf(w.out, "Remove failed: %v\n", err)
			fmt.Fprintln(w.out, "Nothing was removed.")
			return nil
		}
		fmt.Fprintf(w.out, "✓ Removed %s\n", item.label)
		return nil
	}

	outcomes, rerr := executeSkillsRemove(skillsRemoveOptions{
		names:      []string{item.skillName},
		scope:      item.skillScope,
		scopeGiven: true,
		yes:        true,
	}, w.paths)
	if rerr != nil {
		fmt.Fprintf(w.out, "Remove failed: %v\n", rerr)
		fmt.Fprintln(w.out, "Nothing was removed.")
		return nil
	}
	removed, kept := 0, 0
	for _, o := range outcomes {
		if o.Removed {
			removed++
			continue
		}
		kept++
		fmt.Fprintf(w.out, "  • %s left in place: %s\n", o.Entry.DestDir, o.Reason)
	}
	fmt.Fprintf(w.out, "✓ Removed %d director%s; %d left in place.\n", removed, pluralY(removed), kept)
	return nil
}

// actionListInstalled prints the shared `litespm list` inventory: the install
// ledger, the skills ledger and the agent configs, in one view.
func (w *Wizard) actionListInstalled() error {
	fmt.Fprintln(w.out, "\nThis is the same list as `litespm list`:")
	fmt.Fprintln(w.out, "")
	if code := runListTo(w.out, w.out, nil, false); code != 0 {
		fmt.Fprintln(w.out, "The list could not be produced; run `litespm list` for details.")
	}
	return nil
}

// projectRoot resolves the directory the wizard is running in as a project, so
// project-scope installs are visible and removable here. An unusable working
// directory selects no project rather than failing.
func (w *Wizard) projectRoot() string {
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}
	abs, err := resolveProjectDir(cwd)
	if err != nil {
		return ""
	}
	return abs
}

func kindLabel(k domain.ListingKind) string {
	switch k {
	case domain.KindSkill:
		return "skill"
	case domain.KindMCP:
		return "MCP server"
	case domain.KindPlugin:
		return "plugin"
	default:
		return string(k)
	}
}

func installScopeLabel(scope domain.InstallScope) string {
	if scope == domain.ScopeProject {
		return "this project"
	}
	return "this machine"
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	out := make([]string, 0, len(values))
	for _, v := range values {
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}
