package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/sarv-projects/litespm/internal/skills"
)

func testPromptItems() []promptItem {
	return []promptItem{
		{ID: "pdf", Label: "PDF", Group: "Documents", Detail: "Read and write PDF files."},
		{ID: "docx", Label: "DOCX", Group: "Documents", Detail: "Read and write Word files."},
		{ID: "react", Label: "React", Group: "Frontend", Detail: "React conventions."},
		{ID: "go", Label: "Go", Group: "Backend", Detail: "Go conventions."},
	}
}

func TestSearchPromptFiltersLabelHintAndDetail(t *testing.T) {
	m := newSearchPromptModel(searchPromptOptions{Title: "Pick", Items: testPromptItems(), Searchable: true})
	m.query = "word"
	got := m.filtered()
	if len(got) != 1 || got[0].ID != "docx" {
		t.Fatalf("detail filter = %+v, want docx", got)
	}
	m.query = "front"
	got = m.filtered()
	if len(got) != 1 || got[0].ID != "react" {
		t.Fatalf("group filter = %+v, want react", got)
	}
}

func TestSearchPromptTogglesItemsAndGroups(t *testing.T) {
	m := newSearchPromptModel(searchPromptOptions{Title: "Pick", Items: testPromptItems(), SelectAll: true})
	m.toggleGroup("Documents")
	if !m.selected["pdf"] || !m.selected["docx"] {
		t.Fatalf("group toggle selected %+v", m.selected)
	}
	m.toggleGroup("Documents")
	if m.selected["pdf"] || m.selected["docx"] {
		t.Fatalf("group toggle did not clear: %+v", m.selected)
	}
	m.toggleAll()
	if len(m.selectedValues()) != len(testPromptItems()) {
		t.Fatalf("select all selected %v", m.selectedValues())
	}
	m.toggleAll()
	if len(m.selectedValues()) != 0 {
		t.Fatalf("select all did not clear: %v", m.selectedValues())
	}
}

func TestSearchPromptLockedItemsAlwaysReturnedAndCannotBeToggled(t *testing.T) {
	locked := []promptItem{{ID: "shared", Label: "Shared .agents/skills"}}
	m := newSearchPromptModel(searchPromptOptions{
		Title:  "Pick",
		Items:  testPromptItems(),
		Locked: locked,
	})
	m.selected["pdf"] = true
	values := m.selectedValues()
	if len(values) != 2 || values[0] != "shared" || values[1] != "pdf" {
		t.Fatalf("selectedValues = %v, want locked first then pdf", values)
	}
	m.toggleGroup("Documents")
	if !m.locked["shared"] {
		t.Fatal("locked item was removed from the locked set")
	}
}

func TestSearchPromptRequiredRefusesEmptySubmit(t *testing.T) {
	m := newSearchPromptModel(searchPromptOptions{Title: "Pick", Items: testPromptItems(), Required: true})
	_, cmd := m.submit()
	if cmd != nil || m.done {
		t.Fatalf("empty required submit completed: done=%v cmd=%v", m.done, cmd)
	}
	if !strings.Contains(m.flash, "at least one") {
		t.Fatalf("flash = %q", m.flash)
	}
}

func TestSearchPromptSingleSelectReturnsHighlightedItem(t *testing.T) {
	m := newSearchPromptModel(searchPromptOptions{Title: "Pick", Items: testPromptItems(), Single: true})
	for i, entry := range m.entries() {
		if entry.item.ID == "react" {
			m.cursor = i
		}
	}
	_, cmd := m.submit()
	if cmd == nil || !m.done {
		t.Fatalf("single submit did not complete: done=%v cmd=%v", m.done, cmd)
	}
	if len(m.result) != 1 || m.result[0] != "react" {
		t.Fatalf("result = %v, want react", m.result)
	}
}

func TestSearchPromptTypingAndBackspace(t *testing.T) {
	m := newSearchPromptModel(searchPromptOptions{Title: "Pick", Items: testPromptItems(), Searchable: true})
	m.handleKey(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("pdf")})
	if m.query != "pdf" {
		t.Fatalf("query = %q", m.query)
	}
	if len(m.filtered()) != 1 || m.filtered()[0].ID != "pdf" {
		t.Fatalf("filtered = %+v", m.filtered())
	}
	m.handleKey(tea.KeyMsg{Type: tea.KeyBackspace})
	if m.query != "pd" {
		t.Fatalf("query after backspace = %q", m.query)
	}
}

func TestSearchPromptEscCancels(t *testing.T) {
	m := newSearchPromptModel(searchPromptOptions{Title: "Pick", Items: testPromptItems()})
	_, _ = m.handleKey(tea.KeyMsg{Type: tea.KeyEsc})
	if !m.cancelled || !m.done {
		t.Fatalf("esc did not cancel: cancelled=%v done=%v", m.cancelled, m.done)
	}
}

func TestSkillPromptItemsGroupByTopFolder(t *testing.T) {
	found := []skills.DiscoveredSkill{
		{Pkg: &skills.SkillPackage{Name: "pdf", Description: "PDF"}, Rel: "skills/pdf"},
		{Pkg: &skills.SkillPackage{Name: "review", Description: "Review"}, Rel: "skills/review"},
		{Pkg: &skills.SkillPackage{Name: "root", Description: "Root"}, Rel: "."},
	}
	items := skillPromptItems(found)
	groups := map[string]string{}
	for _, item := range items {
		groups[item.Label] = item.Group
	}
	if groups["pdf"] != "Skills" || groups["review"] != "Skills" || groups["root"] != "General" {
		t.Fatalf("groups = %+v", groups)
	}
}

func TestExistingDestinationsCountsOnlyPresentPaths(t *testing.T) {
	dir := t.TempDir()
	present := filepath.Join(dir, "present")
	if err := os.MkdirAll(present, 0o755); err != nil {
		t.Fatal(err)
	}
	ops := []skills.InstallOp{
		{SkillName: "present", ToDir: present},
		{SkillName: "absent", ToDir: filepath.Join(dir, "absent")},
	}
	if got := existingDestinations(ops); got != 1 {
		t.Fatalf("existingDestinations = %d, want 1", got)
	}
}

func TestSearchPromptViewRendersDetailGroupsAndLockedSection(t *testing.T) {
	m := newSearchPromptModel(searchPromptOptions{
		Title:       "Choose skills",
		Description: "Type to filter.",
		Items:       testPromptItems(),
		Locked:      []promptItem{{ID: "shared", Label: "Shared .agents/skills"}},
		SelectAll:   true,
		ShowDetail:  true,
		MaxVisible:  4,
	})
	view := m.View()
	for _, want := range []string{
		"Choose skills",
		"Shared destinations",
		"Select all",
		"Documents",
		"Description",
		"Selected:",
	} {
		if !strings.Contains(view, want) {
			t.Errorf("view is missing %q:\n%s", want, view)
		}
	}
}

func TestWindowForKeepsCursorVisible(t *testing.T) {
	start, end := windowFor(100, 50, 10)
	if start > 50 || end <= 50 || end-start != 10 {
		t.Fatalf("window = %d..%d, cursor 50", start, end)
	}
	start, end = windowFor(5, 2, 10)
	if start != 0 || end != 5 {
		t.Fatalf("small window = %d..%d", start, end)
	}
}
