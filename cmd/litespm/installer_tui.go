package main

// installer_tui.go — the interactive installer surface.
//
// The reference installer (vercel-labs/skills) treats selection as a first
// class workflow: one searchable list, a fixed detail pane, selectable groups,
// a select-all row, a locked section for destinations that are always
// included, and a selected summary. This file is the same idea in Bubble Tea,
// used by `litespm skills add`, the wizard's catalog picker and any future
// installer step.
//
// The model is deliberately pure: filtering, grouping, toggling and the
// view are functions of state, so the tests can drive keys without a TTY.

import (
	"fmt"
	"io"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

// --- palette ---------------------------------------------------------------

var (
	uiAccent = lipgloss.AdaptiveColor{Light: "#1e66f5", Dark: "#89b4fa"}
	uiPurple = lipgloss.AdaptiveColor{Light: "#8839ef", Dark: "#cba6f7"}
	uiGreen  = lipgloss.AdaptiveColor{Light: "#40a02b", Dark: "#a6e3a1"}
	uiYellow = lipgloss.AdaptiveColor{Light: "#df8e1d", Dark: "#f9e2af"}
	uiRed    = lipgloss.AdaptiveColor{Light: "#d20f39", Dark: "#f38ba8"}
	uiMuted  = lipgloss.AdaptiveColor{Light: "#6c6f85", Dark: "#6c7086"}
	uiText   = lipgloss.AdaptiveColor{Light: "#4c4f69", Dark: "#cdd6f4"}
)

var (
	uiBold    = lipgloss.NewStyle().Bold(true).Foreground(uiText)
	uiTitle   = lipgloss.NewStyle().Bold(true).Foreground(uiText)
	uiDim     = lipgloss.NewStyle().Foreground(uiMuted)
	uiAccentS = lipgloss.NewStyle().Foreground(uiAccent)
	uiGreenS  = lipgloss.NewStyle().Foreground(uiGreen)
	uiYellowS = lipgloss.NewStyle().Foreground(uiYellow)
	uiRedS    = lipgloss.NewStyle().Foreground(uiRed)
	uiTextS   = lipgloss.NewStyle().Foreground(uiText)
	uiBar     = lipgloss.NewStyle().Foreground(uiMuted).Render("│")
	uiRail    = lipgloss.NewStyle().Foreground(uiMuted).Render("├")
	uiCorner  = lipgloss.NewStyle().Foreground(uiMuted).Render("└")
	uiCursor  = lipgloss.NewStyle().Foreground(uiAccent).Bold(true).Render("❯")
)

// --- installer banner ------------------------------------------------------

var bannerLines = []string{
	"██╗     ██╗████████╗███████╗███████╗██████╗ ███╗   ███╗",
	"██║     ██║╚══██╔══╝██╔════╝██╔════╝██╔══██╗████╗ ████║",
	"██║     ██║   ██║   █████╗  ███████╗██████╔╝██╔████╔██║",
	"██║     ██║   ██║   ██╔══╝  ╚════██║██╔═══╝ ██║╚██╔╝██║",
	"███████╗██║   ██║   ███████╗███████║██║     ██║ ╚═╝ ██║",
	"╚══════╝╚═╝   ╚═╝   ╚══════╝╚══════╝╚═╝     ╚═╝     ╚═╝",
}

var bannerPalette = []lipgloss.Color{
	lipgloss.Color("#89b4fa"),
	lipgloss.Color("#8fb8fb"),
	lipgloss.Color("#a3aefb"),
	lipgloss.Color("#b8a4f9"),
	lipgloss.Color("#cba6f7"),
	lipgloss.Color("#dcb0f2"),
}

// renderWordmarkBanner returns the wordmark with a per-line gradient. It is
// static text: the animation lives in the spinners and the live prompt, so a
// piped invocation never pays for frames it cannot show.
func renderWordmarkBanner(subtitle, blurb string) string {
	var b strings.Builder
	for i, line := range bannerLines {
		style := lipgloss.NewStyle().Bold(true).Foreground(bannerPalette[i%len(bannerPalette)])
		b.WriteString("  ")
		b.WriteString(style.Render(line))
		b.WriteString("\n")
	}
	b.WriteString("\n  ")
	b.WriteString(uiBold.Render("LiteSPM"))
	b.WriteString(uiDim.Render("  ·  " + subtitle))
	b.WriteString("\n  ")
	b.WriteString(uiDim.Render(blurb))
	b.WriteString("\n")
	return b.String()
}

func renderInstallerBanner() string {
	return renderWordmarkBanner(
		"agent skills installer",
		"Discover a source, choose what you need, copy it into your agents.",
	)
}

// installerStep prints one clack-style step line. These are the static
// counterpart to the live prompt and spinner; non-TTY output uses the same
// vocabulary so a transcript reads the same way it looked in a terminal.
func installerStep(out io.Writer, symbol, message string) {
	icon := uiAccentS.Render(symbol)
	fmt.Fprintf(out, "%s  %s\n", icon, message)
}

func installerStepDone(out io.Writer, message string) {
	installerStep(out, "◇", message)
}

func installerStepInfo(out io.Writer, message string) {
	fmt.Fprintf(out, "%s  %s\n", uiBar, uiDim.Render(message))
}

func installerStepWarn(out io.Writer, message string) {
	installerStep(out, "▲", uiYellowS.Render(message))
}

func installerStepError(out io.Writer, message string) {
	installerStep(out, "■", uiRedS.Render(message))
}

// renderInstallSummaryBox renders the pre-install summary as a rounded box
// whose rows already carry their own styling.
func renderInstallSummaryBox(title string, lines []string) string {
	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(uiMuted).
		Padding(0, 1)
	return box.Render(uiBold.Render(title) + "\n\n" + strings.Join(lines, "\n"))
}

// renderCompletionBox renders the post-install result. Successes are green,
// failures red, and the footer never claims more than the ledger recorded.
func renderCompletionBox(title string, lines []string, footer string) string {
	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(uiGreen).
		Padding(0, 1)
	body := uiGreenS.Bold(true).Render(title) + "\n\n" + strings.Join(lines, "\n")
	if footer != "" {
		body += "\n\n" + uiDim.Render(footer)
	}
	return box.Render(body)
}

// --- searchable multi-select ----------------------------------------------

type promptItem struct {
	ID     string
	Label  string
	Hint   string
	Detail string
	Group  string
}

type searchPromptOptions struct {
	Title       string
	Description string
	Items       []promptItem
	// Locked items are always returned and cannot be toggled. The reference
	// uses this for the universal skills tree.
	Locked      []promptItem
	Preselected []string
	Single      bool
	Required    bool
	Searchable  bool
	SelectAll   bool
	ShowDetail  bool
	DetailLines int
	MaxVisible  int
}

type searchPromptResult struct {
	Selected  []string
	Cancelled bool
}

type promptEntry struct {
	group string
	item  promptItem
}

type searchPromptModel struct {
	opts        searchPromptOptions
	items       []promptItem
	selected    map[string]bool
	locked      map[string]bool
	query       string
	cursor      int
	collapsed   map[string]bool
	width       int
	height      int
	done        bool
	cancelled   bool
	result      []string
	flash       string
	showAll     bool
	initialized bool
}

func newSearchPromptModel(opts searchPromptOptions) *searchPromptModel {
	if opts.DetailLines <= 0 {
		opts.DetailLines = 2
	}
	if opts.MaxVisible <= 0 {
		opts.MaxVisible = 12
	}
	m := &searchPromptModel{
		opts:      opts,
		items:     opts.Items,
		selected:  map[string]bool{},
		locked:    map[string]bool{},
		collapsed: map[string]bool{},
		width:     100,
		height:    30,
	}
	for _, id := range opts.Preselected {
		m.selected[id] = true
	}
	for _, item := range opts.Locked {
		m.locked[item.ID] = true
	}
	if m.opts.Single {
		m.resetCursor()
	}
	return m
}

// moveCursor walks one row in `delta` direction and, for a single-select
// prompt, skips group headings so Enter always has an item to choose.
func (m *searchPromptModel) moveCursor(delta int) {
	entries := m.entries()
	if len(entries) == 0 {
		return
	}
	cur := m.cursor
	for i := 0; i < len(entries); i++ {
		cur = (cur + delta + len(entries)) % len(entries)
		if !m.opts.Single || entries[cur].group == "" {
			m.cursor = cur
			return
		}
	}
	m.cursor = cur
}

func (m *searchPromptModel) resetCursor() {
	m.cursor = 0
	if !m.opts.Single {
		return
	}
	for i, entry := range m.entries() {
		if entry.group == "" {
			m.cursor = i
			return
		}
	}
}

func (m *searchPromptModel) Init() tea.Cmd { return nil }

func (m *searchPromptModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil
	case tea.KeyMsg:
		return m.handleKey(msg)
	}
	return m, nil
}

func (m *searchPromptModel) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c", "esc":
		m.cancelled = true
		m.done = true
		return m, tea.Quit
	case "enter":
		return m.submit()
	case "up", "k", "ctrl+p":
		m.moveCursor(-1)
		m.flash = ""
		return m, nil
	case "down", "j", "ctrl+n":
		m.moveCursor(1)
		m.flash = ""
		return m, nil
	case "home":
		m.cursor = 0
		if m.opts.Single {
			m.resetCursor()
		}
		return m, nil
	case "end":
		if entries := m.entries(); len(entries) > 0 {
			m.cursor = len(entries) - 1
			if m.opts.Single {
				for i := len(entries) - 1; i >= 0; i-- {
					if entries[i].group == "" {
						m.cursor = i
						break
					}
				}
			}
		}
		return m, nil
	case " ":
		if m.opts.Single {
			return m.submit()
		}
		entry, ok := m.currentEntry()
		if !ok {
			return m, nil
		}
		if entry.group != "" {
			m.toggleGroup(entry.group)
			return m, nil
		}
		if entry.item.ID == selectAllID {
			m.toggleAll()
			return m, nil
		}
		if m.locked[entry.item.ID] {
			m.flash = "This destination is always included."
			return m, nil
		}
		if m.selected[entry.item.ID] {
			delete(m.selected, entry.item.ID)
		} else {
			m.selected[entry.item.ID] = true
		}
		return m, nil
	case "ctrl+a":
		if m.opts.Single || !m.opts.SelectAll {
			return m, nil
		}
		m.toggleAll()
		return m, nil
	case "left", "h":
		if entry, ok := m.currentEntry(); ok {
			group := entry.group
			if group == "" {
				group = entry.item.Group
			}
			if group != "" {
				m.collapsed[group] = true
				m.resetCursor()
			}
		}
		return m, nil
	case "right", "l":
		if entry, ok := m.currentEntry(); ok {
			group := entry.group
			if group == "" {
				group = entry.item.Group
			}
			if group != "" {
				delete(m.collapsed, group)
			}
		}
		return m, nil
	case "backspace", "ctrl+h":
		if m.opts.Searchable && m.query != "" {
			r := []rune(m.query)
			m.query = string(r[:len(r)-1])
			m.resetCursor()
		}
		return m, nil
	case "ctrl+u":
		m.query = ""
		m.resetCursor()
		return m, nil
	}
	if m.opts.Searchable {
		if r := msg.Runes; len(r) > 0 {
			m.query += string(r)
			m.resetCursor()
			m.flash = ""
		}
	}
	return m, nil
}

func (m *searchPromptModel) submit() (tea.Model, tea.Cmd) {
	if m.opts.Single {
		entry, ok := m.currentEntry()
		if !ok || entry.group != "" || entry.item.ID == selectAllID {
			return m, nil
		}
		m.result = []string{entry.item.ID}
		m.done = true
		return m, tea.Quit
	}
	values := m.selectedValues()
	if m.opts.Required && len(values) == 0 {
		m.flash = "Select at least one item before continuing."
		return m, nil
	}
	m.result = values
	m.done = true
	return m, tea.Quit
}

func (m *searchPromptModel) selectedValues() []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(m.selected)+len(m.locked))
	for _, item := range m.opts.Locked {
		if !seen[item.ID] {
			seen[item.ID] = true
			out = append(out, item.ID)
		}
	}
	for _, item := range m.items {
		if m.selected[item.ID] && !seen[item.ID] {
			seen[item.ID] = true
			out = append(out, item.ID)
		}
	}
	return out
}

func (m *searchPromptModel) currentEntry() (promptEntry, bool) {
	entries := m.entries()
	if m.cursor < 0 || m.cursor >= len(entries) {
		return promptEntry{}, false
	}
	return entries[m.cursor], true
}

func (m *searchPromptModel) filtered() []promptItem {
	if strings.TrimSpace(m.query) == "" {
		return m.items
	}
	q := strings.ToLower(strings.TrimSpace(m.query))
	out := make([]promptItem, 0, len(m.items))
	for _, item := range m.items {
		haystack := strings.ToLower(strings.Join([]string{item.Label, item.Hint, item.Detail, item.Group, item.ID}, "\n"))
		if strings.Contains(haystack, q) {
			out = append(out, item)
		}
	}
	return out
}

// entries flattens the visible items into navigable rows. Group headings are
// rows themselves when grouping is on, so the reference's "toggle a whole
// group" gesture works here too.
func (m *searchPromptModel) entries() []promptEntry {
	filtered := m.filtered()
	var out []promptEntry
	useGroups := false
	for _, item := range filtered {
		if item.Group != "" {
			useGroups = true
			break
		}
	}
	// Items are emitted group by group, groups in first-seen order and items in
	// their given order within a group. Emitting a header whenever the group
	// changed instead repeated a heading as soon as a caller's ordering
	// interleaved groups: the wizard's alphabetical agent list showed
	// "Other agents", then "Detected on this machine", then "Other agents"
	// again, with the toggle-a-group gesture only reaching the first run.
	if useGroups {
		var order []string
		byGroup := map[string][]promptItem{}
		for _, item := range filtered {
			if _, seen := byGroup[item.Group]; !seen {
				order = append(order, item.Group)
			}
			byGroup[item.Group] = append(byGroup[item.Group], item)
		}
		regrouped := make([]promptItem, 0, len(filtered))
		for _, group := range order {
			regrouped = append(regrouped, byGroup[group]...)
		}
		filtered = regrouped
	}
	lastGroup := ""
	for i, item := range filtered {
		if useGroups {
			if i == 0 || item.Group != lastGroup {
				lastGroup = item.Group
				out = append(out, promptEntry{group: item.Group})
			}
			if m.collapsed[item.Group] {
				continue
			}
		}
		out = append(out, promptEntry{item: item})
	}
	// The select-all row is a synthetic first entry. It is never part of the
	// filtered list: it acts on what is visible, exactly like ctrl+a.
	if !m.opts.Single && m.opts.SelectAll && len(filtered) > 0 {
		out = append([]promptEntry{{item: promptItem{ID: selectAllID, Label: "Select all"}}}, out...)
	}
	return out
}

const selectAllID = "\x00select-all"

func (m *searchPromptModel) toggleAll() {
	filtered := m.filtered()
	all := len(filtered) > 0
	for _, item := range filtered {
		if m.locked[item.ID] || !m.selected[item.ID] {
			all = false
			break
		}
	}
	for _, item := range filtered {
		if m.locked[item.ID] {
			continue
		}
		if all {
			delete(m.selected, item.ID)
		} else {
			m.selected[item.ID] = true
		}
	}
}

func (m *searchPromptModel) toggleGroup(group string) {
	var groupItems []promptItem
	for _, item := range m.filtered() {
		if item.Group == group && !m.locked[item.ID] {
			groupItems = append(groupItems, item)
		}
	}
	all := len(groupItems) > 0
	for _, item := range groupItems {
		if !m.selected[item.ID] {
			all = false
			break
		}
	}
	for _, item := range groupItems {
		if all {
			delete(m.selected, item.ID)
		} else {
			m.selected[item.ID] = true
		}
	}
}

// --- view ------------------------------------------------------------------

func (m *searchPromptModel) View() string {
	if m.done {
		return m.finalView()
	}
	width := m.width
	if width <= 0 {
		width = 100
	}
	inner := width - 4
	if inner < 30 {
		inner = 30
	}
	var b strings.Builder

	// Header.
	b.WriteString(uiAccentS.Bold(true).Render("◆"))
	b.WriteString("  ")
	b.WriteString(uiTitle.Render(m.opts.Title))
	b.WriteString("\n")
	if m.opts.Description != "" {
		b.WriteString(uiBar)
		b.WriteString("  ")
		for i, line := range strings.Split(wrapText(m.opts.Description, inner), "\n") {
			if i > 0 {
				b.WriteString("\n" + uiBar + "  ")
			}
			b.WriteString(uiDim.Render(line))
		}
		b.WriteString("\n")
	}
	b.WriteString(uiBar + "\n")

	// Locked section.
	if len(m.opts.Locked) > 0 {
		b.WriteString(uiBar + "  ")
		b.WriteString(uiGreenS.Bold(true).Render("Shared destinations"))
		b.WriteString(uiDim.Render("  ·  always included"))
		b.WriteString("\n")
		max := 4
		for i, item := range m.opts.Locked {
			if i >= max {
				b.WriteString(uiBar + "    ")
				b.WriteString(uiDim.Render(fmt.Sprintf("…and %d more", len(m.opts.Locked)-max)))
				b.WriteString("\n")
				break
			}
			b.WriteString(uiBar + "    ")
			b.WriteString(uiGreenS.Render("✓"))
			b.WriteString(" ")
			b.WriteString(uiBold.Render(item.Label))
			if item.Hint != "" {
				b.WriteString(uiDim.Render("  " + item.Hint))
			}
			b.WriteString("\n")
		}
		b.WriteString(uiBar + "\n")
	}

	// Search line.
	if m.opts.Searchable {
		b.WriteString(uiBar + "  ")
		b.WriteString(uiDim.Render("Search:"))
		b.WriteString(" ")
		if m.query == "" {
			b.WriteString(uiDim.Render("type to filter"))
		} else {
			b.WriteString(uiTextS.Render(m.query))
		}
		b.WriteString(uiAccentS.Render("█"))
		b.WriteString("\n")
	}
	b.WriteString(uiBar + "  ")
	if m.opts.Single {
		b.WriteString(uiDim.Render("↑↓ move · enter select · esc cancel"))
	} else {
		b.WriteString(uiDim.Render("↑↓ move · space toggle · ctrl+a all · enter install · esc cancel"))
	}
	b.WriteString("\n")
	b.WriteString(uiBar + "\n")

	// Rows.
	entries := m.entries()
	if len(entries) == 0 {
		b.WriteString(uiBar + "  ")
		b.WriteString(uiDim.Render("No matches. Backspace to widen the search."))
		b.WriteString("\n")
	}
	visible := m.visibleLimit()
	start, end := windowFor(len(entries), m.cursor, visible)
	for i := start; i < end; i++ {
		entry := entries[i]
		isCursor := i == m.cursor
		prefix := " "
		if isCursor {
			prefix = uiCursor
		}
		b.WriteString(uiBar + " ")
		b.WriteString(prefix)
		b.WriteString(" ")
		if entry.group != "" {
			b.WriteString(uiDim.Render(disclosure(m.collapsed[entry.group])))
			b.WriteString(" ")
			b.WriteString(m.groupState(entry.group))
			b.WriteString(" ")
			b.WriteString(uiBold.Render(entry.group))
		} else if entry.item.ID == selectAllID {
			b.WriteString(m.selectAllState())
			b.WriteString(" ")
			b.WriteString(uiBold.Render("Select all"))
			b.WriteString(uiDim.Render(fmt.Sprintf("  (%d/%d visible)", m.visibleSelectedCount(), len(m.filtered()))))
		} else {
			locked := m.locked[entry.item.ID]
			checked := locked || m.selected[entry.item.ID]
			if checked {
				b.WriteString(uiGreenS.Render("✓"))
			} else {
				b.WriteString(uiDim.Render("○"))
			}
			b.WriteString(" ")
			label := entry.item.Label
			if isCursor {
				b.WriteString(uiBold.Underline(true).Render(label))
			} else {
				b.WriteString(uiTextS.Render(label))
			}
			if entry.item.Hint != "" {
				b.WriteString(uiDim.Render("  " + entry.item.Hint))
			}
		}
		b.WriteString("\n")
	}
	if start > 0 || end < len(entries) {
		var parts []string
		if start > 0 {
			parts = append(parts, fmt.Sprintf("↑ %d more", start))
		}
		if end < len(entries) {
			parts = append(parts, fmt.Sprintf("↓ %d more", len(entries)-end))
		}
		b.WriteString(uiBar + "  ")
		b.WriteString(uiDim.Render(strings.Join(parts, "  ")))
		b.WriteString("\n")
	}

	// Detail pane for the highlighted row.
	if m.opts.ShowDetail && m.opts.DetailLines > 0 {
		entry, ok := m.currentEntry()
		detail := ""
		if ok {
			if entry.group != "" {
				detail = fmt.Sprintf("Toggle every item in %s.", entry.group)
			} else if entry.item.ID == selectAllID {
				detail = fmt.Sprintf("Select or clear all %d visible items.", len(m.filtered()))
			} else {
				detail = entry.item.Detail
			}
		}
		if strings.TrimSpace(detail) != "" {
			b.WriteString(uiBar + "\n")
			b.WriteString(uiBar + "  ")
			b.WriteString(uiDim.Render("Description"))
			b.WriteString("\n")
			for _, line := range wrapLines(detail, inner, m.opts.DetailLines) {
				b.WriteString(uiBar + "  ")
				b.WriteString(uiDim.Render(line))
				b.WriteString("\n")
			}
		}
	}

	if m.flash != "" {
		b.WriteString(uiBar + "  ")
		b.WriteString(uiYellowS.Render(m.flash))
		b.WriteString("\n")
	}

	// Selected summary (locked items included).
	if !m.opts.Single {
		b.WriteString(uiBar + "\n")
		b.WriteString(uiBar + "  ")
		labels := m.selectedLabels()
		if len(labels) == 0 {
			b.WriteString(uiDim.Render("Selected: none"))
		} else {
			shown := labels
			suffix := ""
			if len(shown) > 4 {
				shown = shown[:4]
				suffix = fmt.Sprintf(" +%d more", len(labels)-4)
			}
			b.WriteString(uiGreenS.Render("Selected: "))
			b.WriteString(uiTextS.Render(strings.Join(shown, ", ") + suffix))
		}
		b.WriteString("\n")
	}
	b.WriteString(uiCorner)
	b.WriteString("  ")
	if m.opts.Required {
		b.WriteString(uiDim.Render("enter confirms · esc cancels"))
	} else {
		b.WriteString(uiDim.Render("enter confirms · esc cancels"))
	}
	b.WriteString("\n")
	return b.String()
}

func (m *searchPromptModel) finalView() string {
	labels := m.selectedLabels()
	if m.opts.Single {
		for _, item := range m.items {
			if len(m.result) == 1 && item.ID == m.result[0] {
				labels = []string{item.Label}
			}
		}
	}
	if m.cancelled {
		return uiRedS.Render("■") + "  " + uiTitle.Render(m.opts.Title) + "\n" +
			uiBar + "  " + uiDim.Render("Cancelled") + "\n"
	}
	summary := strings.Join(labels, ", ")
	if summary == "" {
		summary = "(none)"
	}
	return uiGreenS.Render("◇") + "  " + uiTitle.Render(m.opts.Title) + "\n" +
		uiBar + "  " + uiTextS.Render(summary) + "\n"
}

func (m *searchPromptModel) selectedLabels() []string {
	var out []string
	seen := map[string]bool{}
	for _, item := range m.opts.Locked {
		if !seen[item.ID] {
			seen[item.ID] = true
			out = append(out, item.Label)
		}
	}
	for _, item := range m.items {
		if m.selected[item.ID] && !seen[item.ID] {
			seen[item.ID] = true
			out = append(out, item.Label)
		}
	}
	return out
}

func (m *searchPromptModel) visibleLimit() int {
	limit := m.opts.MaxVisible
	if limit <= 0 {
		limit = 12
	}
	// Reserve rows for the header, locked section, search line, detail pane
	// and summary. A short terminal shrinks the list instead of pushing the
	// controls off the bottom of the screen.
	if m.height > 0 {
		byHeight := m.height - 16
		if byHeight < limit {
			limit = byHeight
		}
	}
	if limit < 3 {
		limit = 3
	}
	if limit > 18 {
		limit = 18
	}
	return limit
}

func (m *searchPromptModel) visibleSelectedCount() int {
	n := 0
	for _, item := range m.filtered() {
		if m.selected[item.ID] || m.locked[item.ID] {
			n++
		}
	}
	return n
}

func (m *searchPromptModel) selectAllState() string {
	n := m.visibleSelectedCount()
	total := len(m.filtered())
	switch {
	case total > 0 && n == total:
		return uiGreenS.Render("●")
	case n > 0:
		return uiYellowS.Render("◐")
	default:
		return uiDim.Render("○")
	}
}

func (m *searchPromptModel) groupState(group string) string {
	total, selected := 0, 0
	for _, item := range m.filtered() {
		if item.Group != group {
			continue
		}
		total++
		if m.selected[item.ID] || m.locked[item.ID] {
			selected++
		}
	}
	switch {
	case total > 0 && selected == total:
		return uiGreenS.Render("●")
	case selected > 0:
		return uiYellowS.Render("◐")
	default:
		return uiDim.Render("○")
	}
}

func disclosure(collapsed bool) string {
	if collapsed {
		return "▸"
	}
	return "▾"
}

func windowFor(total, cursor, limit int) (int, int) {
	if limit <= 0 || total <= limit {
		return 0, total
	}
	start := cursor - limit/2
	if start < 0 {
		start = 0
	}
	if start+limit > total {
		start = total - limit
	}
	return start, start + limit
}

func wrapText(s string, width int) string {
	return strings.Join(wrapLines(s, width, 3), "\n")
}

func wrapLines(s string, width, maxLines int) []string {
	words := strings.Fields(strings.TrimSpace(s))
	if len(words) == 0 {
		return []string{""}
	}
	var lines []string
	line := ""
	for _, word := range words {
		candidate := word
		if line != "" {
			candidate = line + " " + word
		}
		if ansi.StringWidth(candidate) <= width {
			line = candidate
			continue
		}
		if line != "" {
			lines = append(lines, line)
		}
		line = word
		if len(lines) == maxLines {
			break
		}
	}
	if len(lines) < maxLines && line != "" {
		lines = append(lines, line)
	}
	for len(lines) < maxLines {
		lines = append(lines, "")
	}
	if len(lines) == maxLines {
		last := lines[len(lines)-1]
		if ansi.StringWidth(last) > width {
			last = ansi.Truncate(last, width, "…")
			lines[len(lines)-1] = last
		}
	}
	return lines
}

// runSearchPrompt runs the interactive prompt. It returns Cancelled when the
// input stream ends or the user presses Esc; callers must handle that as a
// deliberate stop, never as an empty successful selection.
func runSearchPrompt(in io.Reader, out io.Writer, opts searchPromptOptions) (searchPromptResult, error) {
	if !terminalUIAvailable(in, out) {
		return searchPromptResult{}, fmt.Errorf("no terminal available for the installer prompt")
	}
	model := newSearchPromptModel(opts)
	program := tea.NewProgram(model, tea.WithInput(in), tea.WithOutput(out), tea.WithoutSignalHandler())
	final, err := program.Run()
	if err != nil {
		return searchPromptResult{}, err
	}
	m, ok := final.(*searchPromptModel)
	if !ok {
		return searchPromptResult{}, fmt.Errorf("unexpected prompt state")
	}
	if m.cancelled {
		return searchPromptResult{Cancelled: true}, nil
	}
	return searchPromptResult{Selected: m.result}, nil
}
