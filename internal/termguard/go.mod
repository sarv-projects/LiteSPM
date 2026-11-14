// termguard is a nested module on purpose: its import path must sort before
// github.com/charmbracelet/bubbletea so Go (1.21+: packages whose imports are
// ready initialise in import-path order) runs its init first. See doc.go.
module github.com/a-litespm/termguard

go 1.26.0

require github.com/charmbracelet/lipgloss v1.1.0
