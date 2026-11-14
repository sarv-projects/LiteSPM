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
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/huh"
	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/deployment"
	"github.com/sarv-projects/litespm/internal/doctor"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/scan"
	"github.com/sarv-projects/litespm/internal/secrets"
	"github.com/sarv-projects/litespm/internal/skills"
	"github.com/sarv-projects/litespm/internal/state"
)

// errInputEnded reports that the input stream ended before an answer was read.
// It is a normal stop with guidance, not a crash: see finishInput.
var errInputEnded = errors.New("input ended before an answer was read")
var errSetupSkipped = errors.New("agent setup skipped")

// Wizard handles interactive setup and management of agent host integration.
type Wizard struct {
	in     io.Reader
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
	// launchSkillInstaller re-enters the existing skills installer with a
	// source chosen in this wizard. Tests inject a recorder; production keeps
	// the installer's own interactive prompts and approval path.
	launchSkillInstaller func(ctx context.Context, source string) error
	// setupLog collects what the current setup pass wrote, for the summary card.
	setupLog []setupRecord
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
		in:     in,
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
	configured, err := w.configuredHosts(ctx)
	// The wordmark is for the first run only; a machine that is already set up
	// gets the one-line header, so a management session does not open with six
	// rows of banner every time.
	w.printBanner(err != nil || len(configured) == 0)
	w.printRuntimeSummary()
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
	var line strings.Builder
	var one [1]byte
	for {
		n, err := w.in.Read(one[:])
		if n > 0 {
			if one[0] == '\n' {
				return strings.TrimSpace(line.String()), nil
			}
			if one[0] != '\r' {
				line.WriteByte(one[0])
			}
		}
		if err != nil {
			if line.Len() == 0 {
				return "", errInputEnded
			}
			// A final line without a trailing newline is still an answer; the
			// next read reports the end of input.
			return strings.TrimSpace(line.String()), nil
		}
	}
}

func (w *Wizard) printBanner(firstRun bool) {
	fmt.Fprintln(w.out, "")
	if terminalUIAvailable(w.in, w.out) {
		if !firstRun {
			fmt.Fprintln(w.out, uiCompactHeader("agent capability manager"))
			return
		}
		fmt.Fprint(w.out, renderWordmarkBanner(
			"agent capability manager",
			"Discover and manage MCP servers, skills and plugins across your agents.",
		))
		fmt.Fprintln(w.out, "  "+uiDim.Render("──────────────────────────────────────────────────────────────────────"))
		fmt.Fprintln(w.out, "")
		return
	}
	fmt.Fprintln(w.out, "┌────────────────────────────────────────────────────────────────────────┐")
	fmt.Fprintln(w.out, "│                LiteSPM — setup and capability manager                  │")
	fmt.Fprintln(w.out, "│                     for your AI coding agent                           │")
	fmt.Fprintln(w.out, "└────────────────────────────────────────────────────────────────────────┘")
	fmt.Fprintln(w.out, "")
}

// printRuntimeSummary states the one fact the wizard knows before it inspects
// anything: how many agent hosts this build supports, derived from the adapter
// registry. It claims no runtime check, and it no longer repeats "nothing has
// changed yet" on every run — the configured summary and each action's own
// report say what did or did not change.
func (w *Wizard) printRuntimeSummary() {
	if terminalUIAvailable(w.in, w.out) {
		return // the agent picker already says "N detected of M supported"
	}
	fmt.Fprintf(w.out, "LiteSPM can connect to %d agent hosts.\n\n", len(host.ListAdapters()))
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

// printConfiguredSummary is deliberately compact: one line naming the count
// and the agents, not every configuration path on every run. `litespm host
// detect` owns the full paths, so a management session stays short and the
// paths have a single place that prints them.
func (w *Wizard) printConfiguredSummary(configured []host.HostVerification) {
	names := make([]string, 0, len(configured))
	for _, v := range configured {
		names = append(names, hostDisplayName(v.HostID))
	}
	shown, extra := names, ""
	if len(shown) > 8 {
		shown, extra = shown[:8], fmt.Sprintf(" (+%d more)", len(names)-8)
	}
	if terminalUIAvailable(w.in, w.out) {
		uiOK(w.out, "Connected to %d agent%s: %s%s", len(names), plural(len(names)), strings.Join(shown, ", "), extra)
		uiHint(w.out, "Nothing was changed. `litespm host detect` lists every configuration path.")
		fmt.Fprintln(w.out, "")
		return
	}
	fmt.Fprintf(w.out, "LiteSPM is already set up for %d agent%s: %s%s\n",
		len(names), plural(len(names)), strings.Join(shown, ", "), extra)
	fmt.Fprintln(w.out, "Nothing was changed. Run `litespm host detect` to see every configuration path.")
	fmt.Fprintln(w.out, "")
}

// runSetup runs agent selection → configuration resolution → bridge write.
// cancelled reports that the user chose to stop. A failed plan or write is
// reported and returns cancelled=false: the action menu that follows is where
// the user can retry or print the manual snippet.
//
// The TUI path is a multi-select: a person who uses several agents can connect
// them in one pass, and every selected host still gets its own preview and
// approval. Nothing is written until each host's file is confirmed.
func (w *Wizard) runSetup(ctx context.Context) (bool, error) {
	tty := terminalUIAvailable(w.in, w.out)
	w.setupLog = nil
	if tty {
		uiStepHeader(w.out, 1, 3, "Choose agents")
	}
	adapters, err := w.promptAgentSelectionMany(ctx)
	if err != nil {
		if errors.Is(err, errSetupSkipped) {
			fmt.Fprintln(w.out, "Agent connection skipped. You can set it up later from the manager menu.")
			return false, nil
		}
		return false, err
	}
	if len(adapters) == 0 {
		return true, nil
	}

	configured := 0
	attempted := 0
	if tty {
		uiStepHeader(w.out, 2, 3, fmt.Sprintf("Review and connect (%d agent%s)", len(adapters), plural(len(adapters))))
	}
	for _, adapter := range adapters {
		configPath, ok, err := w.resolveAgentConfig(ctx, adapter)
		if err != nil {
			return false, err
		}
		if !ok {
			continue
		}
		attempted++
		if err := w.applyAgentIntegration(ctx, adapter, configPath); err != nil {
			if errors.Is(err, errInputEnded) {
				return false, err
			}
			if tty {
				fmt.Fprintln(w.out, "")
				uiErr(w.out, "Setup did not finish for %s: %v", adapter.Descriptor().DisplayName, err)
				uiHint(w.out, "Nothing was written to a file you did not name.")
			} else {
				fmt.Fprintf(w.out, "\nSetup did not finish for %s: %v\n", adapter.Descriptor().DisplayName, err)
				fmt.Fprintln(w.out, "Nothing was written to a file you did not name.")
			}
			continue
		}
		configured++
	}

	if configured > 0 {
		if tty {
			w.printSetupCard(configured, len(adapters))
		} else {
			fmt.Fprintf(w.out, "\nConnected %d of %d selected agent(s).\n", configured, len(adapters))
		}
	} else if tty && attempted > 0 {
		uiStepHeader(w.out, 3, 3, "Done")
		uiWarn(w.out, "Nothing was written.")
	}
	if configured == 0 && attempted == 0 {
		return true, nil
	}
	return false, nil
}

// setupRecord is one successful bridge registration, kept for the summary card.
type setupRecord struct {
	agent   string
	file    string
	backup  string
	trigger string
}

// printSetupCard is step 3: what was written where, and what to do next.
func (w *Wizard) printSetupCard(configured, selected int) {
	uiStepHeader(w.out, 3, 3, "Done")
	lines := []string{}
	for _, r := range w.setupLog {
		lines = append(lines, uiGreenS.Bold(true).Render("✓ ")+uiBold.Render(r.agent))
		lines = append(lines, "  "+uiKV("wrote", shortHome(r.file, userHome())))
		if r.backup != "" {
			lines = append(lines, "  "+uiKV("backup", shortHome(r.backup, userHome())))
		}
	}
	next := "Next: start your agent and run its LiteSPM marketplace command."
	if len(w.setupLog) == 1 && w.setupLog[0].trigger != "" {
		next = fmt.Sprintf("Next: start %s and type %s to browse and install.", w.setupLog[0].agent, w.setupLog[0].trigger)
	}
	title := fmt.Sprintf("Connected %d of %d selected agent%s", configured, selected, plural(selected))
	fmt.Fprintln(w.out, uiCard(w.out, "ok", title, lines, next)+"\n")
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

// promptAgentSelectionMany is the setup path: the TUI can select several
// agents in one pass, while a plain line-based terminal keeps the original
// one-at-a-time flow. It returns an empty slice when the person chose to stop.
func (w *Wizard) promptAgentSelectionMany(ctx context.Context) ([]host.HostAdapter, error) {
	rows := w.agentMenuRows(ctx)
	var detected []agentMenuRow
	for _, r := range rows {
		if r.exists {
			detected = append(detected, r)
		}
	}
	if terminalUIAvailable(w.in, w.out) {
		return w.promptAgentMultiSelectTUI(rows, detected)
	}
	adapter, err := w.promptAgentSelectionText(rows, detected)
	if err != nil || adapter == nil {
		return nil, err
	}
	return []host.HostAdapter{adapter}, nil
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
	if terminalUIAvailable(w.in, w.out) {
		adapters, err := w.promptAgentMultiSelectTUI(rows, detected)
		if err != nil || len(adapters) == 0 {
			return nil, err
		}
		return adapters[0], nil
	}
	return w.promptAgentSelectionText(rows, detected)
}

func (w *Wizard) promptAgentSelectionText(rows, detected []agentMenuRow) (host.HostAdapter, error) {
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
	fmt.Fprintln(w.out, "  [s] Continue without connecting an agent")
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
		if strings.EqualFold(line, "s") {
			return nil, errSetupSkipped
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

func (w *Wizard) promptAgentMultiSelectTUI(rows, detected []agentMenuRow) ([]host.HostAdapter, error) {
	detectedIDs := make([]string, 0, len(detected))
	for _, row := range detected {
		detectedIDs = append(detectedIDs, row.descriptor.HostID)
	}
	items := make([]promptItem, 0, len(rows))
	// Detected agents first: they are preselected and the likeliest answer, and
	// the "Detected" group should lead rather than land wherever the
	// alphabet puts its first member.
	ordered := make([]agentMenuRow, 0, len(rows))
	for _, row := range rows {
		if row.exists {
			ordered = append(ordered, row)
		}
	}
	for _, row := range rows {
		if !row.exists {
			ordered = append(ordered, row)
		}
	}
	for _, row := range ordered {
		group := "Other agents"
		if row.exists {
			group = "Detected on this machine"
		}
		detail := row.descriptor.DisplayName
		if row.configPath != "" {
			if row.exists {
				detail += "\nConfig file: " + row.configPath + "\nLiteSPM adds one entry and keeps a backup."
			} else {
				detail += "\nNo config file yet; LiteSPM will create:\n" + row.configPath
			}
		} else {
			detail += "\nNo configuration path is known for this host."
		}
		items = append(items, promptItem{
			ID:     row.descriptor.HostID,
			Label:  row.descriptor.DisplayName,
			Hint:   truncate(row.configPath, 44),
			Detail: detail,
			Group:  group,
		})
	}

	result, err := runSearchPrompt(w.in, w.out, searchPromptOptions{
		Title:       fmt.Sprintf("Connect AI coding agents  ·  %d detected of %d supported", len(detected), len(rows)),
		Description: "Detected configurations are preselected. Each host is previewed and backed up separately.",
		Items:       items,
		Preselected: detectedIDs,
		Required:    true,
		Searchable:  true,
		SelectAll:   true,
		ShowDetail:  true,
		DetailLines: 3,
		MaxVisible:  11,
	})
	if err != nil {
		return nil, err
	}
	if result.Cancelled || len(result.Selected) == 0 {
		return nil, nil
	}

	adapters := make([]host.HostAdapter, 0, len(result.Selected))
	for _, id := range result.Selected {
		adapter, err := host.GetAdapter(id)
		if err != nil {
			return nil, fmt.Errorf("selected agent %q is not a registered host: %w", id, err)
		}
		adapters = append(adapters, adapter)
	}
	return adapters, nil
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
		// Two short lines rather than one 120-column sentence: a terminal wraps
		// a long line wherever the column runs out, mid-word ("backup copy i /
		// s saved first").
		return fmt.Sprintf(
			"Found your existing configuration file:\n  %s\nLiteSPM will add one entry to this file. Everything else in it is left as it is,\nand a backup copy is saved first.",
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
	if terminalUIAvailable(w.in, w.out) {
		return w.resolveAgentConfigTTY(ctx, adapter)
	}
	name := adapter.Descriptor().DisplayName
	fmt.Fprintf(w.out, "\nLooking for %s's configuration file...\n", name)

	candidate, detectErr := adapter.DetectConfig(ctx, domain.ScopeUser)
	if detectErr == nil && candidate != "" {
		fmt.Fprintln(w.out, describeConfigTarget(name, candidate))
		use, err := w.askYesNo("Use this file?", true)
		if err != nil {
			return "", false, err
		}
		if use {
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
			custom = normalizeTypedPath(custom)
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
			use, err := w.askYesNo("Use this file?", true)
			if err != nil {
				return "", false, err
			}
			if use {
				return retry, true, nil
			}

		case "q", "Q":
			return "", false, nil

		default:
			fmt.Fprintln(w.out, "Please enter 1, 2, 3 or q.")
		}
	}
}

// resolveAgentConfigTTY is resolveAgentConfig on a real terminal: one
// arrow-key menu instead of a question followed by a numbered list. The
// invariant is unchanged: the returned path is the one the person chose, and
// nothing is written here.
func (w *Wizard) resolveAgentConfigTTY(ctx context.Context, adapter host.HostAdapter) (string, bool, error) {
	name := adapter.Descriptor().DisplayName
	home := userHome()
	candidate, detectErr := adapter.DetectConfig(ctx, domain.ScopeUser)
	for {
		have := detectErr == nil && candidate != ""
		var options []choiceOption
		desc := fmt.Sprintf("Could not work out where %s keeps its configuration file.", name)
		def := "path"
		if have {
			def = "use"
			if fileExists(candidate) {
				desc = "Found your existing file. LiteSPM adds one entry, leaves the rest alone and saves a backup first."
				options = append(options, choiceOption{ID: "use", Label: "Use " + shortHome(candidate, home)})
			} else {
				desc = "No file exists yet. LiteSPM will create it."
				options = append(options, choiceOption{ID: "use", Label: "Create " + shortHome(candidate, home)})
			}
		}
		options = append(options,
			choiceOption{ID: "path", Label: "Choose a different file", Hint: "type or paste a path"},
			choiceOption{ID: "snippet", Label: "Show a snippet to paste myself", Hint: "nothing is written"},
			choiceOption{ID: "retry", Label: "Look for the file again"},
			choiceOption{ID: "cancel", Label: "Skip this agent"},
		)
		fmt.Fprintln(w.out, "")
		choice, ok, err := uiSelectOne(w.in, w.out, name+" · configuration file", desc, options, def)
		if err != nil {
			return "", false, err
		}
		if !ok {
			return "", false, nil
		}
		switch choice {
		case "use":
			return candidate, true, nil
		case "path":
			typed, ok, err := uiInputText(w.in, w.out, "Full path of the configuration file", "Quotes and ~ are fine.", "~/.config/agent/mcp.json")
			if err != nil {
				return "", false, err
			}
			custom := normalizeTypedPath(typed)
			if !ok || custom == "" {
				uiWarn(w.out, "No path was entered.")
				continue
			}
			uiHint(w.out, "%s", strings.ReplaceAll(describeConfigTarget(name, custom), "\n", " "))
			return custom, true, nil
		case "snippet":
			fmt.Fprintf(w.out, "\nPaste this into the configuration file of %s:\n", name)
			fmt.Fprintln(w.out, adapter.RenderManualSetup(w.binary))
		case "retry":
			candidate, detectErr = adapter.DetectConfig(ctx, domain.ScopeUser)
			if detectErr != nil || candidate == "" {
				uiWarn(w.out, "Still could not work out where %s keeps its configuration file.", name)
			}
		default:
			return "", false, nil
		}
	}
}

// normalizeTypedPath cleans a path a person typed or pasted. Windows "Copy as
// path" wraps it in double quotes and shells teach single quotes, so a pasted
// path arrived as `"C:\Users\me\.claude.json"` and was planned as a file whose
// name starts with a quote. A leading `~` is expanded to the home directory,
// which the shell would have done had the path been an argument.
func normalizeTypedPath(p string) string {
	p = strings.TrimSpace(p)
	if len(p) >= 2 {
		if (p[0] == '"' && p[len(p)-1] == '"') || (p[0] == '\'' && p[len(p)-1] == '\'') {
			p = strings.TrimSpace(p[1 : len(p)-1])
		}
	}
	if p == "~" || strings.HasPrefix(p, "~/") || strings.HasPrefix(p, `~\`) {
		if home, err := os.UserHomeDir(); err == nil && home != "" {
			p = filepath.Join(home, p[1:])
		}
	}
	return p
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

	tty := terminalUIAvailable(w.in, w.out)
	if tty {
		fmt.Fprintf(w.out, "\n%s\n\n", uiBold.Render("About to change "+shortHome(plan.ConfigPath, userHome())))
	} else {
		fmt.Fprintf(w.out, "\nAbout to make one change to %s:\n\n", plan.ConfigPath)
	}
	preview, hidden := changePreview(plan.OriginalContent, plan.ProposedContent, 40)
	if tty {
		fit := uiWidth(w.out) - 6
		for i := range preview {
			preview[i] = uiFit(preview[i], fit)
		}
		fmt.Fprintln(w.out, renderDiffPreview(preview, hidden))
	} else {
		for _, l := range preview {
			fmt.Fprintln(w.out, "  "+l)
		}
		if hidden > 0 {
			fmt.Fprintf(w.out, "  … and %d more changed line(s)\n", hidden)
		}
	}
	if tty {
		uiHint(w.out, "Everything else in the file is left as it is. A backup is saved first.")
	} else {
		fmt.Fprintln(w.out, "\nEverything else in the file is left as it is.")
	}
	write, err := w.askYesNo("Write this change?", true)
	if err != nil {
		return err
	}
	if !write {
		if tty {
			uiWarn(w.out, "Nothing was written.")
		} else {
			fmt.Fprintln(w.out, "Nothing was written.")
		}
		return nil
	}

	result, err := adapter.ApplySetup(ctx, plan)
	if err != nil {
		return fmt.Errorf("could not write %s: %w", configPath, err)
	}

	if tty {
		trigger := adapter.Descriptor().SlashCommandTrigger
		if trigger == "" {
			trigger = "/marketplace"
		}
		if info, ok := host.MarketplaceCommandFor(adapter.Descriptor().HostID); ok {
			trigger = info.Invoke
		}
		w.setupLog = append(w.setupLog, setupRecord{
			agent: adapter.Descriptor().DisplayName, file: result.ConfigPath,
			backup: result.BackupPath, trigger: trigger,
		})
		uiOK(w.out, "Registered with %s", adapter.Descriptor().DisplayName)
		installMarketplaceCommand(ctx, w.out, adapter.Descriptor().HostID, w.binary)
		if preExisting, _ := adapter.DetectPreExistingComponents(ctx); len(preExisting) > 0 {
			uiHint(w.out, "%d other MCP server(s) already in this file were left untouched.", len(preExisting))
		}
		return nil
	}
	fmt.Fprintf(w.out, "✓ Done. LiteSPM is registered with %s.\n", adapter.Descriptor().DisplayName)
	if result.BackupPath != "" {
		fmt.Fprintf(w.out, "  • Backup of the previous file: %s\n", result.BackupPath)
	}
	fmt.Fprintf(w.out, "  • File written: %s\n", result.ConfigPath)
	installMarketplaceCommand(ctx, w.out, adapter.Descriptor().HostID, w.binary)

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
	// The registrar knows the command this agent actually got.
	if info, ok := host.MarketplaceCommandFor(d.HostID); ok {
		trigger = info.Invoke
	}
	fmt.Fprintln(w.out, "")
	fmt.Fprintln(w.out, "Next:")
	fmt.Fprintf(w.out, "  • Start %s and type %s to browse and install capabilities.\n", d.DisplayName, trigger)
	fmt.Fprintln(w.out, "  • Or stay here: this wizard can update the catalog, install and remove things too.")
}

// --- the "what next" action menu -----------------------------------------

// actionMenuItems describes the manager menu as prompt rows. The ids are the
// same ones the numbered fallback accepts, so the two menus cannot drift: an
// action is listed in both or in neither.
func (w *Wizard) actionMenuItems() []promptItem {
	catalogEmpty := true
	if c := w.catalog(); c != nil {
		catalogEmpty = c.Count() == 0
	}
	catalogHint := "refresh the capability index"
	catalogDetail := "Download the latest published list of MCP servers, skills and plugins. This is the only action here that uses the network, and it installs nothing."
	if catalogEmpty {
		catalogHint = "download the capability index"
		catalogDetail = "The local catalog is empty, so searching finds nothing yet. Download the published list of MCP servers, skills and plugins. It installs nothing."
	}
	return []promptItem{
		{ID: "1", Label: "Update catalog", Hint: catalogHint, Detail: catalogDetail, Group: "Catalog"},
		{ID: "2", Label: "Find and install", Hint: "search the local catalog", Group: "Catalog",
			Detail: "Search the catalog this machine already has, preview a row, and install it through the same plan and approval gate `litespm install` uses."},
		{ID: "3", Label: "Remove an install", Hint: "review destinations first", Group: "Manage",
			Detail: "Show what LiteSPM installed, with every destination, and remove the chosen one. Only the parts LiteSPM wrote are deleted."},
		{ID: "4", Label: "View installed capabilities", Group: "Manage",
			Detail: "The same inventory as `litespm list`: install records, the skills ledger, and the agent configurations on this machine."},
		{ID: "5", Label: "Connect or repair an agent", Group: "Agents",
			Detail: "Write the LiteSPM bridge into an agent's configuration file, with a preview, a backup and a confirmation."},
		{ID: "6", Label: "Install a skill", Hint: "GitHub, URL, or local folder", Group: "Agents",
			Detail: "Opens the same interactive installer as `litespm skills add`, with discovery and per-agent approval."},
		{ID: "7", Label: "Open the browser marketplace", Hint: "Skills, Plugins, MCP, Installed", Group: "Agents",
			Detail: "Open the four-tab marketplace page in the default browser. The Installed tab reads this machine when the page is served locally."},
		{ID: "8", Label: "Doctor & Diagnostics", Hint: "check system health and auto-repair", Group: "Manage",
			Detail: "Run system diagnostics: checks SQLite DB, sockets, agent configuration integrity, Sigstore trust roots, and repairs issues."},
		{ID: "9", Label: "Audit security & trust", Hint: "fail-closed policy checks", Group: "Manage",
			Detail: "Perform a security audit of installed skills, MCP tools, permissions, and credential stores."},
		{ID: "10", Label: "Detect & list agent hosts", Hint: "scan for 52 supported agents", Group: "Agents",
			Detail: "Scan local filesystem for installed agent configs (Claude, Cursor, Windsurf, Cline, OpenCode, Codex, etc.)."},
		{ID: "q", Label: "Finish", Group: "Session", Detail: "Close the manager. Nothing more is changed."},
	}
}

// runActionMenu is reachable both after a fresh setup and on a machine that is
// already configured (a second bare `litespm` run). Every entry performs a real
// action; nothing here leads to a refusal.
func (w *Wizard) runActionMenu(ctx context.Context) error {
	var db *state.DB
	var closeDB func()
	ensureDB := func() bool {
		if db != nil {
			return true
		}
		opened, close, err := w.openStateDB()
		if err != nil {
			fmt.Fprintf(w.out, "\nLiteSPM's local state could not be opened: %v\n", err)
			fmt.Fprintln(w.out, "Catalog updates, direct skill source installs, and agent setup are still available here.")
			return false
		}
		db, closeDB = opened, close
		return true
	}
	defer func() {
		if closeDB != nil {
			closeDB()
		}
	}()

	for {
		choice := ""
		fromPrompt := false
		if terminalUIAvailable(w.in, w.out) {
			picked, err := runSearchPrompt(w.in, w.out, searchPromptOptions{
				Title:       "LiteSPM Manager",
				Description: "Choose an action. Type to filter by name; the detail pane describes the highlighted action.",
				Items:       w.actionMenuItems(),
				Single:      true,
				Searchable:  true,
				ShowDetail:  true,
				DetailLines: 3,
				MaxVisible:  12,
			})
			switch {
			case err != nil:
				// runSearchPrompt refuses when the streams are not a terminal
				// (and can fail if one is lost mid-session). Fall through to the
				// numbered menu below, which reads the same input stream.
			case picked.Cancelled || len(picked.Selected) == 0:
				// Esc or Ctrl-C at the menu is a deliberate stop, exactly as
				// aborting the previous form was.
				return nil
			default:
				choice = picked.Selected[0]
				fromPrompt = true
			}
		}
		if !fromPrompt {
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
			fmt.Fprintln(w.out, "  [6] Install skills from GitHub, a URL, or a folder")
			fmt.Fprintln(w.out, "  [7] Open the browser marketplace (Skills, Plugins, MCP, Installed)")
			fmt.Fprintln(w.out, "  [8] Run doctor & diagnostics (check and repair system health)")
			fmt.Fprintln(w.out, "  [9] Run security audit (verify trust and fail-closed policies)")
			fmt.Fprintln(w.out, "  [10] Detect agent hosts on this machine")
			fmt.Fprintln(w.out, "  [q] Finish")
			fmt.Fprint(w.out, "Enter choice [1-10, q]: ")
			line, err := w.readLine()
			if err != nil {
				return err
			}
			choice = line
		}

		var actionErr error
		switch choice {
		case "1":
			actionErr = w.actionSyncCatalog(ctx)
		case "2":
			if ensureDB() {
				actionErr = w.actionFindAndInstall(ctx, db)
			}
		case "3":
			if ensureDB() {
				actionErr = w.actionRemove(ctx, db)
			}
		case "4":
			actionErr = w.actionListInstalled()
		case "5":
			_, actionErr = w.runSetup(ctx)
		case "6":
			actionErr = w.actionInstallSkillFromSource(ctx)
		case "7":
			actionErr = w.actionOpenMarketplace()
		case "8":
			actionErr = w.actionRunDoctor(ctx)
		case "9":
			actionErr = w.actionRunAudit(ctx)
		case "10":
			actionErr = w.actionDetectAgents(ctx)
		case "q", "Q":
			return nil
		default:
			fmt.Fprintln(w.out, "Please enter 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 or q.")
		}
		if actionErr != nil {
			return actionErr
		}
	}
}

func (w *Wizard) actionRunDoctor(ctx context.Context) error {
	fmt.Fprintln(w.out, "\nRunning LiteSPM Doctor & System Diagnostics...")
	var db *state.DB
	if pdb, err := state.Open(w.paths.StateDBPath()); err == nil {
		db = pdb
		defer db.Close()
	}
	secretStore, _ := secrets.OpenSecretStore()
	eng := doctor.NewEngine(w.paths, db, secretStore)
	report := eng.RunChecks(ctx)
	if terminalUIAvailable(w.in, w.out) {
		printDoctorReportTTY(w.out, report)
	} else {
		fmt.Fprintln(w.out, "\nLiteSPM Diagnostic Health Report")
		fmt.Fprintln(w.out, strings.Repeat("=", 60))
		for _, c := range report.Checks {
			var statusIcon string
			switch c.Status {
			case doctor.StatusPass:
				statusIcon = "✓ [PASS]"
			case doctor.StatusWarn:
				statusIcon = "⚠ [WARN]"
			case doctor.StatusFail:
				statusIcon = "✗ [FAIL]"
			}
			fmt.Fprintf(w.out, "%-9s %-32s: %s\n", statusIcon, c.Name, c.Message)
			if c.DurationMs > 0 {
				fmt.Fprintf(w.out, "          · %s\n", doctorDuration(c.DurationMs))
			}
			if c.Recommendation != "" {
				fmt.Fprintf(w.out, "          ➜ Recommendation: %s\n", c.Recommendation)
			}
		}
		fmt.Fprintln(w.out, strings.Repeat("-", 60))
		fmt.Fprintf(w.out, "Summary: %d Passed, %d Warnings, %d Failures (Overall: %s) in %d ms\n",
			report.PassedCount, report.WarnCount, report.FailCount, report.OverallStatus, report.DurationMs)
	}
	return nil
}

func (w *Wizard) actionRunAudit(ctx context.Context) error {
	fmt.Fprintln(w.out, "\nRunning LiteSPM Security & Policy Audit...")
	rows, source, err := auditCatalogueRows(ctx, w.paths, "")
	if err != nil {
		fmt.Fprintf(w.out, "read the catalogue: %v\n", err)
		return nil
	}
	findings := scan.ScanRows(rows)
	if chainErr := auditReceiptChain(w.paths); chainErr != nil {
		findings = append(findings, scan.Finding{
			Rule:      "receipt-chain-broken",
			Severity:  scan.SeverityError,
			ListingID: "",
			Message:   chainErr.Error(),
		})
	}
	counts := scan.Counts(findings)
	fmt.Fprintf(w.out, "Audited %d row(s) from %s\n", len(rows), source)
	if len(findings) == 0 {
		fmt.Fprintln(w.out, "Nothing that must not ship was found.")
	} else {
		for _, f := range findings {
			where := f.ListingID
			if where == "" {
				where = "the local ledger"
			}
			fmt.Fprintf(w.out, "  [%s] %s: %s\n     %s\n", strings.ToUpper(string(f.Severity)), f.Rule, where, f.Message)
		}
		fmt.Fprintf(w.out, "\n%d error(s), %d warning(s), %d note(s) across %d rule(s).\n",
			counts[scan.SeverityError], counts[scan.SeverityWarning], counts[scan.SeverityNote], len(scan.Rules))
	}
	return nil
}

func (w *Wizard) actionDetectAgents(ctx context.Context) error {
	fmt.Fprintln(w.out, "\nScanning this machine for supported AI agent hosts...")
	cwd, _ := os.Getwd()
	renderHostDetect(ctx, w.out, cwd)
	return nil
}

// actionOpenMarketplace is the wizard's door to the browser surface. It opens
// the same four-tab page `litespm marketplace` does and never blocks the menu:
// a machine with no browser still gets the URL printed.
func (w *Wizard) actionOpenMarketplace() error {
	target := marketplaceURL()
	fmt.Fprintf(w.out, "\nOpening the LiteSPM marketplace:\n  %s\n", target)
	if err := openBrowser(target); err != nil {
		fmt.Fprintf(w.out, "Could not open a browser automatically: %v\nOpen the URL above in your browser.\n", err)
		return nil
	}
	fmt.Fprintln(w.out, "Opened in your default browser. The Installed tab reads this machine's ledger when the page is served locally.")
	return nil
}

// actionInstallSkillFromSource opens the same interactive source installer
// exposed by `litespm skills add`. Keeping it in a subprocess preserves that
// installer's discovery, agent/scope selection, consent, and ledger behavior.
func (w *Wizard) actionInstallSkillFromSource(ctx context.Context) error {
	fmt.Fprintln(w.out, "\nInstall a skill from a source")
	fmt.Fprintln(w.out, "Paste a GitHub owner/repo, Git URL, direct SKILL.md/archive URL, or local folder.")
	fmt.Fprintln(w.out, "This opens the same installer as `litespm skills add`.")
	source := ""
	if terminalUIAvailable(w.in, w.out) {
		field := huh.NewInput().
			Title("Skill source").
			Description("GitHub owner/repo, Git URL, direct skill/archive URL, or local folder.").
			Placeholder("owner/repo or https://github.com/owner/repo").
			Value(&source)
		if err := runTerminalForm(w.in, w.out, field); err != nil {
			if errors.Is(err, huh.ErrUserAborted) {
				return nil
			}
			return err
		}
	} else {
		fmt.Fprint(w.out, "Enter a source (or press Enter to go back): ")
		var err error
		source, err = w.readLine()
		if err != nil {
			return err
		}
	}
	if source == "" {
		fmt.Fprintln(w.out, "No source entered. Back to the menu.")
		return nil
	}

	launch := w.launchSkillInstaller
	if launch == nil {
		launch = func(ctx context.Context, source string) error {
			cmd := exec.CommandContext(ctx, w.binary, "skills", "add", source)
			cmd.Stdin = os.Stdin
			cmd.Stdout = w.out
			cmd.Stderr = w.out
			if err := cmd.Run(); err != nil {
				var exitErr *exec.ExitError
				if errors.As(err, &exitErr) {
					return fmt.Errorf("skills add exited with status %d", exitErr.ExitCode())
				}
				return fmt.Errorf("could not start skills add: %w", err)
			}
			return nil
		}
	}
	if err := launch(ctx, source); err != nil {
		fmt.Fprintf(w.out, "Skill installer stopped: %v\n", err)
		return nil
	}
	return nil
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

// syncCatalog is catalog() for the one action that downloads the whole release
// tree: its per-request timeout is the sync budget, not the 30s a search uses.
func (w *Wizard) syncCatalog() *catalog.Client {
	if w.catalogClient != nil {
		return w.catalogClient()
	}
	cfg, _ := config.LoadCurrentConfig()
	return catalog.NewClientWithTimeout(registryURLOf(cfg), w.paths.DataRoot, catalogSyncTimeout(cfg), nil)
}

// actionSyncCatalog is the one step that must touch the network, so it is an
// explicit opt-in that says what it fetches — and a failure says so instead of
// printing a success line.
func (w *Wizard) actionSyncCatalog(ctx context.Context) error {
	catClient := w.syncCatalog()
	cfg, _ := config.LoadCurrentConfig()
	regURL := registryURLOf(cfg)

	empty := catClient.Count() == 0
	if terminalUIAvailable(w.in, w.out) {
		fmt.Fprintln(w.out, "")
		local := "empty"
		if !empty {
			local = fmt.Sprintf("%d capabilities", catClient.Count())
		}
		fmt.Fprintln(w.out, uiCard(w.out, "", "Update the capability catalog", []string{
			uiKV("from", regURL),
			uiKV("local copy", local),
		}, "Downloads the published list of MCP servers, skills and plugins. Installs nothing."))
	} else {
		fmt.Fprintln(w.out, "")
		fmt.Fprintf(w.out, "LiteSPM will download the capability catalog from:\n  %s\n", regURL)
		fmt.Fprintln(w.out, "This is the list of MCP servers and skills the catalog publishes. It installs nothing and changes nothing on your machine.")
		if empty {
			fmt.Fprintln(w.out, "The local catalog is empty right now, so searching finds nothing until this succeeds.")
		} else {
			fmt.Fprintf(w.out, "The local copy currently holds %d capabilities; this replaces it with the latest published list.\n", catClient.Count())
		}
	}
	download, err := w.askYesNo("Download it now?", true)
	if err != nil {
		return err
	}
	if !download {
		fmt.Fprintln(w.out, "Not downloaded.")
		return nil
	}

	syncCtx, cancel := context.WithTimeout(ctx, catalogSyncTimeout(cfg))
	defer cancel()
	started := time.Now()
	res, err := runWithSpinner(syncCtx, w.in, w.out, "Updating capability catalog", func() (*catalog.SyncResult, error) {
		return catClient.Sync(syncCtx)
	})
	if tty := terminalUIAvailable(w.in, w.out); tty {
		took := uiElapsed(time.Since(started))
		if err != nil {
			uiErr(w.out, "Could not update the catalog: %v", err)
			if empty {
				uiHint(w.out, "The local catalog is still empty. Nothing was changed.")
			} else {
				uiHint(w.out, "Nothing was changed; the previous local copy is still there.")
			}
			uiHint(w.out, "Try again with: litespm catalog sync")
			return nil
		}
		verb := "Catalog updated"
		if !res.Updated {
			verb = "Catalog already up to date"
		}
		uiOK(w.out, "%s · %d capabilities · release %s · %s", verb, res.ItemCount, res.ReleaseID, took)
		return nil
	}
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

// pickCatalogResult is the shared result picker for the wizard. On a terminal
// it is a filterable list (type "/" and the label text narrows the rows, as the
// reference `skills` CLI does) with a detail block after selection. On a pipe
// or a dumb terminal it keeps the numbered prompt, so scripted tests and
// accessibility tools see the same catalog without needing a TTY.
func (w *Wizard) pickCatalogResult(results []*catalog.SearchResult, query string) (*domain.Listing, error) {
	if terminalUIAvailable(w.in, w.out) {
		items := make([]promptItem, 0, len(results)+1)
		for _, res := range results {
			l := res.Listing
			if l == nil {
				continue
			}
			detail := l.Name
			if l.PublisherClaim.Name != "" {
				detail += "\nPublisher: " + l.PublisherClaim.Name
			}
			detail += "\nProvenance: " + string(l.Installability.Effective())
			detail += "\nID: " + l.ID
			if l.Summary != "" {
				detail += "\n" + l.Summary
			}
			if !l.IsInstallable() {
				detail += "\nCatalog metadata only: no verified source or launch line."
			}
			hint := l.PublisherClaim.Name
			if hint == "" {
				hint = string(l.Installability.Effective())
			}
			items = append(items, promptItem{
				ID:     l.ID,
				Label:  l.Name,
				Hint:   hint,
				Detail: detail,
				Group:  kindLabel(l.Kind),
			})
		}
		items = append(items, promptItem{
			ID:     "",
			Label:  "← Back to the menu",
			Detail: "Return without installing anything.",
			Group:  "Navigation",
		})

		picked, err := runSearchPrompt(w.in, w.out, searchPromptOptions{
			Title:       fmt.Sprintf("%d capabilities match %q", len(results), query),
			Description: "Type to filter by name, kind or publisher. The detail pane previews the highlighted row.",
			Items:       items,
			Single:      true,
			Searchable:  true,
			ShowDetail:  true,
			DetailLines: 4,
			MaxVisible:  12,
		})
		if err != nil {
			return nil, err
		}
		if picked.Cancelled || len(picked.Selected) == 0 || picked.Selected[0] == "" {
			return nil, nil
		}
		chosen := picked.Selected[0]
		for _, res := range results {
			if res.Listing != nil && res.Listing.ID == chosen {
				w.printListingDetail(res.Listing)
				return res.Listing, nil
			}
		}
		return nil, fmt.Errorf("the selected listing %q is no longer in the result set", chosen)
	}

	fmt.Fprintf(w.out, "\nFound %d capabilities matching %q:\n\n", len(results), query)
	for i, res := range results {
		l := res.Listing
		if l == nil {
			continue
		}
		fmt.Fprintf(w.out, "  [%d] %-30s %-11s %s\n", i+1, truncate(l.Name, 30), kindLabel(l.Kind), truncate(l.Summary, 60))
		fmt.Fprintf(w.out, "      id: %s\n", l.ID)
	}
	fmt.Fprint(w.out, "\nEnter the number to install (or press Enter to go back): ")
	line, err := w.readLine()
	if err != nil {
		return nil, err
	}
	if line == "" {
		return nil, nil
	}
	n, nerr := strconv.Atoi(line)
	if nerr != nil || n < 1 || n > len(results) || results[n-1].Listing == nil {
		fmt.Fprintln(w.out, "That is not one of the numbers shown.")
		return nil, nil
	}
	return results[n-1].Listing, nil
}

// printListingDetail is the preview shown before any install question. It
// prints recorded fields only; a transport or launch line the catalog does not
// carry is not guessed here.
func (w *Wizard) printListingDetail(l *domain.Listing) {
	if terminalUIAvailable(w.in, w.out) {
		lines := []string{uiKV("id", l.ID)}
		if l.PublisherClaim.Name != "" {
			lines = append(lines, uiKV("publisher", l.PublisherClaim.Name))
		}
		lines = append(lines, uiKV("provenance", string(l.Installability.Effective())))
		if l.Summary != "" {
			lines = append(lines, uiKV("summary", truncate(l.Summary, 90)))
		}
		tone, footer := "", ""
		if !l.IsInstallable() {
			tone, footer = "warn", "Catalog metadata only: no verified source or launch line, so it cannot be installed."
		}
		fmt.Fprintf(w.out, "\n%s\n", uiCard(w.out, tone, l.Name+"  ·  "+kindLabel(l.Kind), lines, footer))
		return
	}
	fmt.Fprintf(w.out, "\n%s  %s\n", renderStatusPill(kindLabel(l.Kind)), l.Name)
	fmt.Fprintf(w.out, "  id:         %s\n", l.ID)
	if l.PublisherClaim.Name != "" {
		fmt.Fprintf(w.out, "  publisher:  %s\n", l.PublisherClaim.Name)
	}
	fmt.Fprintf(w.out, "  provenance: %s\n", string(l.Installability.Effective()))
	if l.Summary != "" {
		fmt.Fprintf(w.out, "  summary:    %s\n", l.Summary)
	}
	if !l.IsInstallable() {
		fmt.Fprintln(w.out, "  note:       catalog metadata only — this row has no verified source or launch line.")
	}
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

	query, err := w.promptCatalogQuery()
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
	listing, err := w.pickCatalogResult(results, query)
	if err != nil {
		return err
	}
	if listing == nil {
		return nil
	}
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

	scopeChoice, chooseScope, err := w.promptInstallScope(listing)
	if err != nil {
		return err
	}
	if !chooseScope {
		fmt.Fprintln(w.out, "No scope was chosen. Nothing was installed.")
		return nil
	}
	// The prompt's ids are the scope names; the numbered fallback answers with
	// its own numbers, and both map through the same function, so the two
	// menus cannot disagree about which scope an answer selects.
	scope, scopeKnown := installScopeFromPromptID(scopeChoice)
	if !scopeKnown {
		scope = domain.ScopeUser
	}
	projectRoot := ""
	if scope == domain.ScopeProject {
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
		projectRoot = abs
	}

	// Fail-closed invariant: the kind gate above admits only the kinds that
	// have an install path — skill, mcp and plugin. Reaching the other branch
	// means the two lists disagree; refusing beats proceeding into machinery
	// that cannot finish.
	if listing.Kind != domain.KindSkill && listing.Kind != domain.KindMCP && listing.Kind != domain.KindPlugin {
		fmt.Fprintf(w.out, "\nLiteSPM cannot install %s: kind %q is marked install-wired but no install path handles it.\n", listing.Name, listing.Kind)
		fmt.Fprintln(w.out, "Nothing was changed.")
		return nil
	}

	// An MCP server is registered in every agent that has the LiteSPM bridge.
	// The target set is captured here, before the plan is sealed, exactly as
	// `litespm install` captures it. conflictNote records what the collision
	// preflight found, for the pre-install summary: an entry name that already
	// exists in some agent is a question that was answered here, and the
	// answer belongs in front of the person approving the write.
	conflictNote := ""
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

		// An entry name the user already has in some agents is a QUESTION, not an
		// abort: the installer's collision preflight (LPSM-NAME-CONFLICT) refuses
		// the whole install when ANY target already carries the name, which in the
		// field killed an install for every agent because one of eleven already
		// had the server. The answer adjusts the target set and the force flag
		// BEFORE authorizeHumanInstall, because the plan hash seals both —
		// filtering hosts after approval would invalidate the plan, and silently
		// replacing an existing entry without consent would not be a choice at
		// all.
		entryName, nameErr := serverEntryNameFor(listing)
		if nameErr != nil {
			fmt.Fprintf(w.out, "Cannot install %s: %v\n", listing.Name, nameErr)
			return nil
		}
		if conflicts := mcpConflictHosts(ctx, mcpBinding.Hosts, entryName, scope, projectRoot); len(conflicts) > 0 {
			choice, ok, rerr := w.resolveMCPConflicts(entryName, mcpBinding.Hosts, conflicts)
			if rerr != nil {
				return rerr
			}
			if !ok {
				fmt.Fprintln(w.out, "Not installed. Nothing was changed.")
				return nil
			}
			mcpBinding.Hosts = choice.hosts
			mcpBinding.Force = choice.force
			if choice.force {
				conflictNote = fmt.Sprintf("Replacing the existing entry named %q in %s; each replaced config is backed up first.",
					entryName, strings.Join(hostDisplayNames(conflicts), ", "))
			} else {
				conflictNote = fmt.Sprintf("Leaving the existing entry named %q untouched in %s.",
					entryName, strings.Join(hostDisplayNames(conflicts), ", "))
			}
		} else {
			conflictNote = fmt.Sprintf("No target agent already registers an entry named %q.", entryName)
		}
	}

	// A plugin is installed like an MCP server: the pinned tree is fetched,
	// its manifest is read, the servers it declares are registered in the
	// target hosts' configs and its skills are copied into their skills trees.
	// It needs the same target set, and it has no runtime of its own — the
	// launch lines come out of the manifest inside the pinned tree.
	if listing.Kind == domain.KindPlugin {
		targetHosts := host.RegisteredBridgeHosts(ctx, scope)
		if len(targetHosts) == 0 {
			fmt.Fprintln(w.out, "Cannot install a plugin yet: no agent has the LiteSPM bridge set up for this scope.")
			fmt.Fprintln(w.out, "Choose [5] to set up an agent, or run: litespm host setup <host-id>")
			return nil
		}
		mcpBinding = &mcpInstallBinding{Hosts: uniqueHostIDs(targetHosts)}
	}

	// The wizard resolves a skill's targets exactly as the CLI does — the
	// detected set — and the plan seals them, so the writes below are the ones
	// the reader was shown before answering yes. A future agent on this machine
	// cannot widen this install.
	var skillBinding *skillInstallBinding
	if listing.Kind == domain.KindSkill {
		skillBinding = &skillInstallBinding{AllDetected: true}
	}

	grant, droppedHosts, gerr := authorizeHumanInstall(ctx, db, catClient, listing, "", scope, projectRoot, mcpBinding, skillBinding, nil)
	if gerr != nil {
		fmt.Fprintf(w.out, "Install refused before anything was changed: %v\n", gerr)
		return nil
	}
	for _, d := range droppedHosts {
		fmt.Fprintf(w.out, "Note: %s will not receive this server: %s\n", d.HostID, d.Reason)
	}
	grantCtx := grant.context(ctx)

	// The pre-install summary is built from the plan the approval sealed, so
	// every row it shows is a value that will actually be written; the final
	// confirmation answers that summary, never the other way round. A declined
	// install refunds the approval so no consent is spent on nothing.
	fmt.Fprintln(w.out, w.installSummaryBox(listing, grant, conflictNote))
	fmt.Fprintln(w.out)

	confirmed, confirmErr := w.confirmInstall(listing, grant.Scope)
	if confirmErr != nil {
		grant.refund(grantCtx, db)
		return confirmErr
	}
	if !confirmed {
		grant.refund(grantCtx, db)
		fmt.Fprintln(w.out, "Not installed. Nothing was changed.")
		return nil
	}

	if listing.Kind == domain.KindSkill {
		home, _ := os.UserHomeDir()
		agents, aerr := skillAgentsFromPlan(grant.Plan)
		if aerr != nil {
			grant.refund(grantCtx, db)
			printInstallFailure(w.out, aerr)
			fmt.Fprintln(w.out, "Nothing was changed.")
			return nil
		}
		outcome, ierr := installSkillFromListing(grantCtx, db, w.paths.DataRoot, projectRoot, home,
			listing, versionOrLatest(""), scope, agents, grant.Plan)
		if ierr != nil {
			grant.refund(grantCtx, db)
			printInstallFailure(w.out, ierr)
			fmt.Fprintln(w.out, "Nothing was left behind: any partial write was rolled back.")
			return nil
		}
		fmt.Fprintln(w.out, skillInstallCompletionBox(outcome))
		fmt.Fprintln(w.out)
		return nil
	}

	// A plugin installs through the same plan, approval and transaction as
	// every other kind. A plugin that declares components this build has no
	// adapter for (commands, hooks, subagents, LSP servers) is a CONSENT
	// question rather than a failure: the artifact was found and the hosts
	// can take it, but part of what the plugin declares would be lost. The
	// refusal names the classes, so the person can decide with the list in
	// front of them. The acknowledgement is sealed into a NEW plan, because
	// the plan hash is what the approval covers.
	if listing.Kind == domain.KindPlugin {
		pluginBinding, berr := pluginInstallBindingFromPlan(grantCtx, grant.Plan, listing, scope)
		if berr != nil {
			grant.refund(grantCtx, db)
			printInstallFailure(w.out, berr)
			fmt.Fprintln(w.out, "Nothing was left behind: any partial write was rolled back.")
			return nil
		}
		outcome, ierr := installPluginFromListing(grantCtx, db, w.paths.DataRoot, listing, grant.Version, scope, projectRoot, pluginBinding)
		if ierr != nil {
			if domain.ErrorCode(ierr) == "LPSM-INSTALL-PARTIAL" {
				grant.refund(grantCtx, db)
				fmt.Fprintf(w.out, "\n%s\n", ierr)
				partialOK, aerr := w.askYesNo("Install the parts LiteSPM can install, and leave the rest out?", false)
				if aerr != nil {
					return aerr
				}
				if !partialOK {
					fmt.Fprintln(w.out, "Not installed. Nothing was changed.")
					return nil
				}
				// Re-plan with the acknowledgement sealed in, and get a
				// fresh approval for that plan.
				partialBinding := &mcpInstallBinding{
					Hosts:        uniqueHostIDs(host.RegisteredBridgeHosts(ctx, scope)),
					AllowPartial: true,
				}
				partialGrant, _, perr := authorizeHumanInstall(ctx, db, catClient, listing, "", scope, projectRoot, partialBinding, nil, nil)
				if perr != nil {
					fmt.Fprintf(w.out, "Install refused before anything was changed: %v\n", perr)
					return nil
				}
				partialCtx := partialGrant.context(ctx)
				partialPlan, pberr := pluginInstallBindingFromPlan(partialCtx, partialGrant.Plan, listing, scope)
				if pberr != nil {
					partialGrant.refund(partialCtx, db)
					printInstallFailure(w.out, pberr)
					fmt.Fprintln(w.out, "Nothing was left behind: any partial write was rolled back.")
					return nil
				}
				outcome, ierr = installPluginFromListing(partialCtx, db, w.paths.DataRoot, listing, partialGrant.Version, scope, projectRoot, partialPlan)
				if ierr != nil {
					partialGrant.refund(partialCtx, db)
					printInstallFailure(w.out, ierr)
					fmt.Fprintln(w.out, "Nothing was left behind: any partial write was rolled back.")
					return nil
				}
				w.printPluginInstallSummary(listing, outcome)
				return nil
			}
			grant.refund(grantCtx, db)
			printInstallFailure(w.out, ierr)
			fmt.Fprintln(w.out, "Nothing was left behind: any partial write was rolled back.")
			return nil
		}
		w.printPluginInstallSummary(listing, outcome)
		return nil
	}

	plannedBinding, berr := mcpInstallBindingFromPlan(grantCtx, grant.Plan, listing, scope)
	if berr != nil {
		grant.refund(grantCtx, db)
		printInstallFailure(w.out, berr)
		fmt.Fprintln(w.out, "Nothing was left behind: any partial write was rolled back.")
		return nil
	}
	outcome, ierr := installMCPFromListing(grantCtx, db, w.paths.DataRoot, listing, grant.Version, scope, projectRoot,
		plannedBinding.Hosts, plannedBinding.Force, plannedBinding.Runtime, plannedBinding.EnvNames)
	if ierr != nil {
		grant.refund(grantCtx, db)
		printInstallFailure(w.out, ierr)
		fmt.Fprintln(w.out, "Nothing was left behind: any partial write was rolled back.")
		return nil
	}
	fmt.Fprintln(w.out, mcpInstallCompletionBox(outcome))
	fmt.Fprintln(w.out)
	return nil
}

// --- install prompts, the pre-install summary and the completion boxes -----

// promptCatalogQuery asks what to search for. A terminal gets a styled input;
// a pipe keeps the single-line prompt the scripted runs answer.
func (w *Wizard) promptCatalogQuery() (string, error) {
	if terminalUIAvailable(w.in, w.out) {
		query := ""
		field := huh.NewInput().
			Title("What are you looking for?").
			Description("Searches the catalog on this machine by name, kind or publisher. Searching downloads nothing.").
			Placeholder("github, postgres, pdf").
			Value(&query)
		if err := runTerminalForm(w.in, w.out, field); err != nil {
			if errors.Is(err, huh.ErrUserAborted) {
				return "", nil
			}
			return "", err
		}
		return strings.TrimSpace(query), nil
	}
	fmt.Fprint(w.out, "\nWhat are you looking for? (for example: github, postgres, pdf) ")
	return w.readLine()
}

// installScopePromptItems describes the two install scopes for the searchable
// prompt.
func installScopePromptItems() []promptItem {
	return []promptItem{
		{
			ID:     "user",
			Label:  "All my agents on this machine",
			Hint:   "this machine, every project",
			Detail: "Writes into your user-level agent configuration or skills folders, so every project on this machine can use it.",
		},
		{
			ID:     "project",
			Label:  "Only this project",
			Hint:   "the directory this wizard was started in",
			Detail: "Writes into this project's own agent configuration or skills folders, so teammates who check out the project get it with it.",
		},
	}
}

// installScopeFromPromptID maps a scope answer onto the install scope. The
// prompt answers with the scope names and the numbered fallback with "1"/"2";
// both land here, so the two surfaces cannot disagree.
func installScopeFromPromptID(id string) (domain.InstallScope, bool) {
	switch strings.TrimSpace(id) {
	case "project", "2":
		return domain.ScopeProject, true
	case "", "user", "1":
		return domain.ScopeUser, true
	}
	return "", false
}

// promptInstallScope asks where the install should land. ok=false means the
// person cancelled: the caller writes nothing and returns to the menu.
func (w *Wizard) promptInstallScope(listing *domain.Listing) (string, bool, error) {
	if terminalUIAvailable(w.in, w.out) {
		picked, err := runSearchPrompt(w.in, w.out, searchPromptOptions{
			Title:       "Installation scope",
			Description: fmt.Sprintf("Choose where LiteSPM should install %s (%s).", listing.Name, kindLabel(listing.Kind)),
			Items:       installScopePromptItems(),
			Single:      true,
			ShowDetail:  true,
			DetailLines: 3,
			Preselected: []string{"user"},
		})
		if err != nil {
			return "", false, err
		}
		if picked.Cancelled || len(picked.Selected) == 0 {
			return "", false, nil
		}
		return picked.Selected[0], true, nil
	}
	// Only an explicit answer selects a scope. Any other text used to fall
	// through to "all agents", so a typo such as "3" or "q" silently chose the
	// widest scope. Enter keeps the documented default; q cancels.
	for {
		fmt.Fprint(w.out, "\nInstall for all your agents on this machine [1], or only for this project [2]? (q cancels) [1]: ")
		line, err := w.readLine()
		if err != nil {
			return "", false, err
		}
		switch strings.ToLower(strings.TrimSpace(line)) {
		case "", "1":
			return "1", true, nil
		case "2":
			return "project", true, nil
		case "q", "quit", "cancel":
			return "", false, nil
		}
		fmt.Fprintln(w.out, "Please enter 1, 2 or q.")
	}
}

// askYesNo is the one yes/no question the wizard asks everywhere. On a
// terminal it is the same styled confirm the install step uses, so arrow keys
// move a selection instead of echoing `^[[B` into a half-typed answer; on a
// pipe it stays the one-line prompt the scripted tests and screen readers
// answer. defaultYes picks the answer Enter gives on the pipe path and the
// preselected button on the terminal path. An ended input stream is still
// reported as errInputEnded, never as "no".
func (w *Wizard) askYesNo(prompt string, defaultYes bool) (bool, error) {
	if terminalUIAvailable(w.in, w.out) {
		answer := defaultYes
		field := huh.NewConfirm().
			Title(strings.TrimSpace(prompt)).
			Affirmative("Yes").
			Negative("No").
			Value(&answer)
		if err := runTerminalForm(w.in, w.out, field); err != nil {
			if errors.Is(err, huh.ErrUserAborted) {
				return false, nil
			}
			return false, err
		}
		return answer, nil
	}
	hint := "[Y/n]"
	if !defaultYes {
		hint = "[y/N]"
	}
	fmt.Fprintf(w.out, "%s %s: ", strings.TrimSpace(prompt), hint)
	line, err := w.readLine()
	if err != nil {
		return false, err
	}
	switch strings.ToLower(line) {
	case "":
		return defaultYes, nil
	case "y", "yes":
		return true, nil
	}
	return false, nil
}

// confirmInstall is the final question before a write: a styled confirm on a
// terminal, the one-line [Y/n] prompt on a pipe. It is asked after the plan is
// sealed and its summary printed, so the answer covers what was shown.
func (w *Wizard) confirmInstall(listing *domain.Listing, scope domain.InstallScope) (bool, error) {
	if terminalUIAvailable(w.in, w.out) {
		confirmed := false
		field := huh.NewConfirm().
			Title(fmt.Sprintf("Install %s?", listing.Name)).
			Description(fmt.Sprintf("%s · %s. Nothing has been written yet.", kindLabel(listing.Kind), installScopeLabel(scope))).
			Affirmative("Install").
			Negative("Cancel").
			Value(&confirmed)
		if err := runTerminalForm(w.in, w.out, field); err != nil {
			if errors.Is(err, huh.ErrUserAborted) {
				return false, nil
			}
			return false, err
		}
		return confirmed, nil
	}
	fmt.Fprintf(w.out, "Install %s (%s) for %s? [Y/n]: ", listing.Name, kindLabel(listing.Kind), installScopeLabel(scope))
	line, err := w.readLine()
	if err != nil {
		return false, err
	}
	switch strings.ToLower(line) {
	case "", "y", "yes":
		return true, nil
	}
	return false, nil
}

// --- what the person reads before and after a write -------------------------

// installSummaryBox is the pre-install summary: what the sealed plan will
// write, where, and the effects it declares. It is built from the approved
// plan, never from a re-resolved machine, so the summary and the approval
// cannot describe different installs.
func (w *Wizard) installSummaryBox(listing *domain.Listing, grant *installGrant, conflictNote string) string {
	if listing == nil || grant == nil || grant.Plan == nil {
		return ""
	}
	var lines []string
	switch listing.Kind {
	case domain.KindMCP:
		lines = mcpInstallSummaryLines(listing, grant.Plan, conflictNote, w.backupNote())
	case domain.KindSkill:
		lines = skillInstallSummaryLines(listing, grant.Plan)
	case domain.KindPlugin:
		lines = pluginInstallSummaryLines(listing, grant.Plan, w.backupNote())
	}
	if len(lines) == 0 {
		return ""
	}
	return renderInstallSummaryBox("Install summary", lines)
}

// backupNote says, once, where a replaced config file is copied before the
// write. DataRoot is the directory the installers use for their backups.
func (w *Wizard) backupNote() string {
	if w.paths != nil {
		if dir := w.paths.BackupsPath(); dir != "" {
			return "Each existing configuration file is backed up into " + dir + " before it is edited."
		}
	}
	return "Each existing configuration file is backed up before it is edited."
}

// planScopeOf reads the scope a plan targets, defaulting the way the plan
// builder does when the field is empty.
func planScopeOf(plan *domain.InstallPlan) domain.InstallScope {
	if plan == nil || plan.Request.TargetScope == "" {
		return domain.ScopeUser
	}
	return plan.Request.TargetScope
}

// mcpInstallRuntimeFromPlan returns the launch line the plan sealed: the
// command line or the endpoint with its transport. A plan that carries neither
// is impossible (the plan gate refuses it), so an unreadable value prints
// nothing rather than a guess.
func mcpInstallRuntimeFromPlan(plan *domain.InstallPlan) (mcpInstallPlanValue, bool) {
	if plan == nil {
		return mcpInstallPlanValue{}, false
	}
	for _, change := range plan.HostChanges {
		if change.ValueJSON == "" {
			continue
		}
		var value mcpInstallPlanValue
		if err := json.Unmarshal([]byte(change.ValueJSON), &value); err != nil {
			continue
		}
		if strings.TrimSpace(value.Runtime.Command) != "" || strings.TrimSpace(value.Runtime.Endpoint) != "" {
			return value, true
		}
	}
	return mcpInstallPlanValue{}, false
}

// pluginArtifactFromPlan returns the pinned artifact a plugin plan sealed.
func pluginArtifactFromPlan(plan *domain.InstallPlan) (pluginArtifact, bool) {
	if plan == nil {
		return pluginArtifact{}, false
	}
	for _, change := range plan.HostChanges {
		if change.ValueJSON == "" {
			continue
		}
		var value pluginInstallPlanValue
		if err := json.Unmarshal([]byte(change.ValueJSON), &value); err != nil {
			continue
		}
		if value.Artifact.Commit != "" {
			return value.Artifact, true
		}
	}
	return pluginArtifact{}, false
}

// planTargetRows renders the config writes a plan sealed, one row per target
// host, with the agent's display name and the file it will be written to.
func planTargetRows(changes []domain.HostChange, action string) []string {
	var rows []string
	for _, change := range changes {
		if change.Action != action {
			continue
		}
		row := "  " + uiGreenS.Render("→") + " " + uiBold.Render(hostDisplayName(change.HostID))
		if change.ConfigPath != "" {
			row += uiDim.Render("  " + change.ConfigPath)
		}
		rows = append(rows, row)
	}
	return rows
}

// mcpInstallSummaryLines is the sealed facts of an MCP registration.
func mcpInstallSummaryLines(listing *domain.Listing, plan *domain.InstallPlan, conflictNote, backupNote string) []string {
	entryName, _ := serverEntryNameFor(listing)
	lines := []string{
		uiDim.Render("entry") + "    " + uiBold.Render(firstNonEmpty(entryName, listing.Name)),
		uiDim.Render("listing") + "  " + listing.ID,
		uiDim.Render("version") + "  " + firstNonEmpty(plan.Resolved.Version, plan.Request.RequestedVersion, "latest"),
		uiDim.Render("scope") + "    " + installScopeLabel(planScopeOf(plan)),
	}
	if plan.Request.ProjectRoot != "" {
		lines = append(lines, uiDim.Render("project")+"  "+plan.Request.ProjectRoot)
	}
	if value, ok := mcpInstallRuntimeFromPlan(plan); ok {
		switch {
		case strings.TrimSpace(value.Runtime.Command) != "":
			command := append([]string{value.Runtime.Command}, value.Runtime.Args...)
			lines = append(lines, uiDim.Render("command")+"  "+strings.Join(command, " "))
		default:
			lines = append(lines, uiDim.Render("endpoint")+" "+value.Runtime.Endpoint+
				uiDim.Render(" ("+entryTransportLabel(host.ServerEntry{
					Endpoint:  value.Runtime.Endpoint,
					Transport: host.RegistryRemoteTransport(value.Runtime.Type),
				})+")"))
		}
		if len(value.EnvNames) > 0 {
			lines = append(lines, uiDim.Render("env")+"      "+strings.Join(value.EnvNames, ", ")+
				uiDim.Render("  (names only; no value is written)"))
		}
	}
	if len(plan.Effects) > 0 {
		lines = append(lines, uiDim.Render("effects")+"  "+strings.Join(plan.Effects, ", "))
	}
	rows := planTargetRows(plan.HostChanges, "register_command")
	lines = append(lines, "", fmt.Sprintf("%s  %d agent%s", uiDim.Render("targets"), len(rows), plural(len(rows))))
	lines = append(lines, rows...)
	if conflictNote != "" {
		lines = append(lines, "", uiDim.Render(conflictNote))
	}
	if backupNote != "" {
		lines = append(lines, uiDim.Render(backupNote))
	}
	return lines
}

// skillInstallSummaryLines is the sealed facts of a catalog skill install:
// every destination directory the plan approved, by agent.
func skillInstallSummaryLines(listing *domain.Listing, plan *domain.InstallPlan) []string {
	lines := []string{
		uiDim.Render("skill") + "    " + uiBold.Render(listing.Name),
		uiDim.Render("listing") + "  " + listing.ID,
		uiDim.Render("version") + "  " + firstNonEmpty(plan.Resolved.Version, plan.Request.RequestedVersion, "latest"),
		uiDim.Render("scope") + "    " + installScopeLabel(planScopeOf(plan)),
	}
	if plan.Request.ProjectRoot != "" {
		lines = append(lines, uiDim.Render("project")+"  "+plan.Request.ProjectRoot)
	}
	if len(plan.Effects) > 0 {
		lines = append(lines, uiDim.Render("effects")+"  "+strings.Join(plan.Effects, ", "))
	}
	dests, err := skillDestinationsFromPlan(plan)
	if err != nil {
		return append(lines, "", uiYellowS.Render("No destination could be read from the plan: "+err.Error()))
	}
	rows := make([]string, 0, len(dests))
	for _, dest := range dests {
		rows = append(rows, "  "+uiGreenS.Render("→")+" "+uiBold.Render(skillAgentLabel(dest.AgentID))+uiDim.Render("  "+dest.Root))
	}
	lines = append(lines, "", fmt.Sprintf("%s  %d destination%s", uiDim.Render("writes"), len(rows), plural(len(rows))))
	lines = append(lines, rows...)
	lines = append(lines, "", uiDim.Render("Nothing existing is overwritten: the install stops if a skill directory is already there."))
	return lines
}

// pluginInstallSummaryLines is the sealed facts of a plugin install: the
// pinned artifact, the target agents, and where the entry list itself comes
// from — the plugin's manifest lives inside the pinned tree, so the commit is
// what the approval binds.
func pluginInstallSummaryLines(listing *domain.Listing, plan *domain.InstallPlan, backupNote string) []string {
	lines := []string{
		uiDim.Render("plugin") + "   " + uiBold.Render(listing.Name),
		uiDim.Render("listing") + "  " + listing.ID,
		uiDim.Render("version") + "  " + firstNonEmpty(plan.Resolved.Version, plan.Request.RequestedVersion, "latest"),
		uiDim.Render("scope") + "    " + installScopeLabel(planScopeOf(plan)),
	}
	if plan.Request.ProjectRoot != "" {
		lines = append(lines, uiDim.Render("project")+"  "+plan.Request.ProjectRoot)
	}
	if artifact, ok := pluginArtifactFromPlan(plan); ok {
		lines = append(lines, uiDim.Render("artifact")+" "+artifact.Repo+"@"+artifact.Commit)
	}
	if len(plan.Effects) > 0 {
		lines = append(lines, uiDim.Render("effects")+"  "+strings.Join(plan.Effects, ", "))
	}
	rows := planTargetRows(plan.HostChanges, "register_command")
	lines = append(lines, "", fmt.Sprintf("%s  %d agent%s", uiDim.Render("targets"), len(rows), plural(len(rows))))
	lines = append(lines, rows...)
	lines = append(lines, "", uiDim.Render("The MCP servers and skills the plugin declares are read from its manifest inside that pinned tree; this plan seals the tree and the agents."))
	if backupNote != "" {
		lines = append(lines, uiDim.Render(backupNote))
	}
	return lines
}

// skillAgentLabel names a skill target the way its own registry does, falling
// back to the MCP host registry and then to the id. The ledger's own label is
// the id for some agents, so the display name is preferred when there is one.
func skillAgentLabel(id string) string {
	if strings.TrimSpace(id) == "" {
		return ""
	}
	for _, target := range skills.AgentTargets() {
		if target.ID == id {
			return target.DisplayName
		}
	}
	return hostDisplayName(id)
}

// hostDisplayNames renders host ids the way the person knows them.
func hostDisplayNames(hostIDs []string) []string {
	out := make([]string, 0, len(hostIDs))
	for _, id := range hostIDs {
		out = append(out, hostDisplayName(id))
	}
	return out
}

// hostWriteRow renders one host config write: the agent, the file, and what
// happened to it.
func hostWriteRow(h *host.EntryInstallResult) string {
	if h == nil {
		return "  " + uiDim.Render("(no host write was recorded)")
	}
	verb := "entry written"
	switch {
	case h.Replaced:
		verb = "entry replaced · a backup was kept"
	case h.Created:
		verb = "file created"
	}
	return "  " + uiGreenS.Render("✓") + " " + uiBold.Render(hostDisplayName(h.HostID)) + uiDim.Render("  "+h.ConfigPath+"  ("+verb+")")
}

// mcpInstallCompletionBox reports a finished MCP registration: the entry and
// every agent config that now carries it.
func mcpInstallCompletionBox(outcome *mcpInstallOutcome) string {
	entry := outcome.Entry
	var lines []string
	switch {
	case strings.TrimSpace(entry.Endpoint) != "":
		lines = append(lines, uiDim.Render("endpoint")+" "+entry.Endpoint+uiDim.Render(" ("+entryTransportLabel(entry)+")"))
	case strings.TrimSpace(entry.Command) != "":
		lines = append(lines, uiDim.Render("command")+"  "+strings.Join(append([]string{entry.Command}, entry.Args...), " "))
	}
	for _, h := range outcome.Hosts {
		lines = append(lines, hostWriteRow(h))
	}
	footer := "Nothing else was changed: no other file was touched. Remove it later from this menu, or with `litespm install remove " + entry.Name + "`."
	return renderCompletionBox("✓ Registered MCP server "+entry.Name, lines, footer)
}

// skillInstallCompletionBox reports a finished skill install: every agent tree
// that received a copy.
func skillInstallCompletionBox(outcome *skillInstallOutcome) string {
	var lines []string
	for i, dest := range outcome.Destinations {
		agent := ""
		if i < len(outcome.LedgerEntries) {
			entry := outcome.LedgerEntries[i]
			agent = firstNonEmpty(skillAgentLabel(entry.AgentID), entry.HostLabel)
		}
		row := "  " + uiGreenS.Render("✓") + " "
		if agent != "" {
			row += uiBold.Render(agent) + " "
		}
		row += uiDim.Render(shortHome(dest, userHome()))
		lines = append(lines, row)
	}
	if len(lines) == 0 {
		lines = append(lines, uiDim.Render("No directory was written."))
	}
	footer := "Nothing else was changed: no other file was touched. Manage it with `litespm skills list`, `litespm skills update` and `litespm skills remove`."
	return renderCompletionBox("✓ Installed skill "+outcome.SkillName, lines, footer)
}

// pluginInstallCompletionBox reports a finished plugin install in the same
// shape, including the partial-install wording when the plugin declares
// components this build cannot project.
func pluginInstallCompletionBox(listing *domain.Listing, outcome *pluginInstallOutcome) string {
	name := outcome.ListingID
	if listing != nil && strings.TrimSpace(listing.Name) != "" {
		name = listing.Name
	}
	lines := []string{
		uiDim.Render("id") + "      " + outcome.ListingID,
		uiDim.Render("version") + "  " + firstNonEmpty(outcome.Version, "latest"),
	}
	if outcome.Artifact.Commit != "" {
		lines = append(lines, uiDim.Render("commit")+"   "+outcome.Artifact.Repo+"@"+outcome.Artifact.Commit)
	}
	for _, server := range outcome.Servers {
		row := "  " + uiGreenS.Render("✓") + " " + uiBold.Render(server.Name) + "  "
		if strings.TrimSpace(server.Endpoint) != "" {
			row += server.Endpoint + uiDim.Render(" ("+entryTransportLabel(host.ServerEntry{Endpoint: server.Endpoint, Transport: server.Transport})+")")
		} else {
			row += server.Command + " " + strings.Join(server.Args, " ")
		}
		lines = append(lines, strings.TrimRight(row, " "))
	}
	for _, h := range outcome.Hosts {
		lines = append(lines, hostWriteRow(h))
	}
	for _, sk := range outcome.Skills {
		lines = append(lines, "  "+uiGreenS.Render("✓")+" skill "+uiBold.Render(sk.SkillName)+uiDim.Render("  "+strings.Join(sk.Destinations, ", ")))
	}
	if len(outcome.Skipped) > 0 {
		parts := make([]string, 0, len(outcome.Skipped))
		for _, skipped := range outcome.Skipped {
			parts = append(parts, fmt.Sprintf("%d %s", skipped.Count, skipped.Kind))
		}
		acknowledged := ""
		if outcome.AllowPartial {
			acknowledged = " (acknowledged with --allow-partial)"
		}
		lines = append(lines, "", uiYellowS.Render(fmt.Sprintf(
			"PARTIAL install%s — the plugin also declares %s; LiteSPM installs a plugin's MCP servers and skills, and the host-specific extras have no adapter here.",
			acknowledged, strings.Join(parts, ", "))))
	}
	for _, warning := range outcome.Warnings {
		lines = append(lines, uiDim.Render("note  "+warning))
	}
	footer := "Nothing else was changed: no other file was touched. Remove it later from this menu, or with `litespm install remove " + outcome.ListingID + "`."
	return renderCompletionBox("✓ Installed plugin "+name, lines, footer)
}

// printPluginInstallSummary prints the plugin completion box on the wizard's
// writer. The CLI keeps printPluginInstallTo for `litespm install`.
func (w *Wizard) printPluginInstallSummary(listing *domain.Listing, outcome *pluginInstallOutcome) {
	fmt.Fprintln(w.out, pluginInstallCompletionBox(listing, outcome))
	fmt.Fprintln(w.out)
}

// mcpConflictChoice is the resolved answer to "some target agents already
// register this entry name": the target set to plan for, and whether an
// existing entry may be replaced. authorizeHumanInstall seals both into the
// plan hash, so this decision has to be taken before the approval, not after.
type mcpConflictChoice struct {
	hosts []string
	force bool
}

// resolveMCPConflicts asks what to do about the agents that already carry
// entryName and returns the adjusted target set. ok=false means the user chose
// to leave everything as it is (or to cancel): nothing is written.
//
// Skipping is the default because replacing an existing entry is the
// destructive answer, and a replace always keeps the per-write backup
// InstallServerEntry takes before it edits the file.
func (w *Wizard) resolveMCPConflicts(entryName string, hosts, conflicts []string) (mcpConflictChoice, bool, error) {
	conflictSet := make(map[string]bool, len(conflicts))
	fmt.Fprintf(w.out, "\nA server named %q is already registered in:\n", entryName)
	for _, hostID := range conflicts {
		conflictSet[hostID] = true
		fmt.Fprintf(w.out, "  • %s\n", hostDisplayName(hostID))
	}
	remaining := make([]string, 0, len(hosts))
	for _, hostID := range hosts {
		if !conflictSet[hostID] {
			remaining = append(remaining, hostID)
		}
	}

	keepLabel := "Leave it exactly as it is (nothing to do)"
	if len(remaining) == 1 {
		keepLabel = "Install into the other agent and leave the existing entry alone"
	} else if len(remaining) > 1 {
		keepLabel = fmt.Sprintf("Install into the other %d agents and leave the existing entry alone", len(remaining))
	}
	replaceLabel := "Replace the existing entry there (a backup is kept)"

	choice := "skip"
	if terminalUIAvailable(w.in, w.out) {
		field := huh.NewSelect[string]().
			Title(fmt.Sprintf("%q is already registered somewhere", entryName)).
			Description("Nothing has been written yet. This answer is sealed into the install plan you approve next.").
			Options(
				huh.NewOption(keepLabel, "skip"),
				huh.NewOption(replaceLabel, "replace"),
				huh.NewOption("Cancel", "cancel"),
			).
			Value(&choice).
			WithHeight(6)
		if err := runTerminalForm(w.in, w.out, field); err != nil {
			if errors.Is(err, huh.ErrUserAborted) {
				return mcpConflictChoice{}, false, nil
			}
			return mcpConflictChoice{}, false, err
		}
	} else {
		fmt.Fprintln(w.out, "")
		fmt.Fprintf(w.out, "  [1] %s\n", keepLabel)
		fmt.Fprintf(w.out, "  [2] %s\n", replaceLabel)
		fmt.Fprintln(w.out, "  [3] Cancel")
		fmt.Fprint(w.out, "Choose [1]: ")
		line, err := w.readLine()
		if err != nil {
			return mcpConflictChoice{}, false, err
		}
		switch strings.TrimSpace(line) {
		case "", "1":
			choice = "skip"
		case "2":
			choice = "replace"
		default:
			choice = "cancel"
		}
	}

	switch choice {
	case "replace":
		return mcpConflictChoice{hosts: hosts, force: true}, true, nil
	case "skip":
		if len(remaining) == 0 {
			return mcpConflictChoice{}, false, nil
		}
		return mcpConflictChoice{hosts: remaining}, true, nil
	default:
		return mcpConflictChoice{}, false, nil
	}
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

	var item removableItem
	if terminalUIAvailable(w.in, w.out) {
		prompts := make([]promptItem, 0, len(items)+1)
		for i, it := range items {
			prompts = append(prompts, promptItem{
				ID:     strconv.Itoa(i),
				Label:  it.label,
				Detail: "Would delete:\n" + strings.Join(it.dests, "\n"),
				Group:  "Installed by LiteSPM",
			})
		}
		prompts = append(prompts, promptItem{ID: "back", Label: "← Back to the menu", Detail: "Remove nothing.", Group: "Navigation"})
		picked, perr := runSearchPrompt(w.in, w.out, searchPromptOptions{
			Title:       fmt.Sprintf("Remove an install  ·  %d installed", len(items)),
			Description: "Pick one to review. Nothing is deleted until you confirm on the next screen.",
			Items:       prompts,
			Single:      true,
			Searchable:  true,
			ShowDetail:  true,
			DetailLines: 4,
			MaxVisible:  10,
		})
		if perr != nil {
			return perr
		}
		if picked.Cancelled || len(picked.Selected) == 0 || picked.Selected[0] == "back" {
			return nil
		}
		idx, _ := strconv.Atoi(picked.Selected[0])
		if idx < 0 || idx >= len(items) {
			return nil
		}
		item = items[idx]
		fmt.Fprintf(w.out, "\n%s\n", uiBold.Render("This will delete:"))
		for _, dest := range item.dests {
			fmt.Fprintf(w.out, "  %s\n", uiFit(dest, uiWidth(w.out)-4))
		}
		uiHint(w.out, "Only the parts LiteSPM wrote are removed; anything you edited or added is kept.")
		ok, cerr := uiConfirm(w.in, w.out, "Remove this install?", item.label, "Remove", "Keep it", false)
		if cerr != nil {
			return cerr
		}
		if !ok {
			uiWarn(w.out, "Nothing was removed.")
			return nil
		}
	} else {
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
		item = items[n-1]

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
