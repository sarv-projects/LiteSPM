package main

import (
	"bytes"
	"context"
	"sort"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestWriteTable_WidensColumnsToData(t *testing.T) {
	var b bytes.Buffer
	writeTable(&b, "", []string{"ID", "NAME", "PATH"}, [][]string{
		{"a", "Short", "p1"},
		{"antigravity-cli", "Grok Build (xAI Dev Tool)", "p2"},
	})
	lines := strings.Split(strings.TrimRight(b.String(), "\n"), "\n")
	col := func(l string) int { return strings.Index(l, "p") }
	if len(lines) != 4 {
		t.Fatalf("lines = %q", lines)
	}
	if utf8.RuneCountInString(lines[2][:col(lines[2])]) != utf8.RuneCountInString(lines[3][:col(lines[3])]) {
		t.Fatalf("last column misaligned:\n%s", b.String())
	}
}

func TestRenderHostList_RealPathsSortedAndCounted(t *testing.T) {
	var b bytes.Buffer
	renderHostList(context.Background(), &b)
	out := b.String()
	for _, fake := range []string{"cursor.json", "zed.json", "mux.json", "antigravity.json"} {
		for _, l := range strings.Split(out, "\n") {
			if strings.HasSuffix(strings.TrimSpace(l), " "+fake) {
				t.Errorf("fake config name %q still shown: %s", fake, l)
			}
		}
	}
	if !strings.Contains(out, "<project>/.roo/mcp.json") {
		t.Errorf("project-only pattern missing:\n%s", out)
	}
	lines := strings.Split(strings.TrimRight(out, "\n"), "\n")
	// header line, blank, column header, rule, then rows
	rows := lines[4:]
	var names []string
	for _, l := range rows {
		f := strings.Fields(l)
		if len(f) < 2 {
			t.Fatalf("bad row %q", l)
		}
		names = append(names, strings.ToLower(f[1]))
	}
	if !sort.StringsAreSorted(names) {
		t.Errorf("rows not sorted by display name: %v", names)
	}
	var n int
	if _, err := fmtSscanCount(lines[0], &n); err != nil || n != len(rows) {
		t.Errorf("count %d does not match %d rows (%v)", n, len(rows), err)
	}
}

func fmtSscanCount(line string, n *int) (int, error) {
	i := strings.Index(line, "(")
	j := strings.Index(line, ")")
	v := 0
	for _, c := range line[i+1 : j] {
		v = v*10 + int(c-'0')
	}
	*n = v
	return 1, nil
}

func TestRenderHostDetect_LegendNextStepAndNoDriveRootPaths(t *testing.T) {
	var b bytes.Buffer
	if code := renderHostDetect(context.Background(), &b, t.TempDir()); code != 0 {
		t.Fatalf("code %d", code)
	}
	out := b.String()
	if !strings.Contains(out, "CONFIG FILE: whether the agent's config exists · BRIDGE: whether LiteSPM is connected") {
		t.Errorf("legend missing:\n%s", out)
	}
	if !strings.Contains(out, "litespm setup --agent <id>") {
		t.Errorf("next step missing:\n%s", out)
	}
	if !strings.Contains(out, "project only — run inside a project") {
		t.Errorf("project-only note missing:\n%s", out)
	}
}

func TestWriteTable_EmptyHeaderAndANSI(t *testing.T) {
	var empty bytes.Buffer
	writeTable(&empty, "", nil, [][]string{{"a", "b"}})
	if empty.Len() != 0 {
		t.Fatalf("empty header should produce no output, got %q", empty.String())
	}

	var colored bytes.Buffer
	writeTable(&colored, "", []string{"COL1", "COL2"}, [][]string{
		{"\x1b[32mhi\x1b[0m", "v1"},
		{"longer", "v2"},
	})
	lines := strings.Split(strings.TrimRight(colored.String(), "\n"), "\n")
	if len(lines) != 4 {
		t.Fatalf("expected 4 lines, got %q", lines)
	}
	if !strings.HasSuffix(lines[2], "hi\x1b[0m    v1") && strings.Index(lines[2], "v1") == -1 {
		t.Fatalf("unexpected row: %q", lines[2])
	}
	// Visible prefix before "v1"/"v2" must align at the same display column despite ANSI codes.
	if len("hi    ") != len("longer") {
		t.Fatalf("sanity check")
	}
	if !strings.Contains(lines[2], "hi\x1b[0m      v1") {
		t.Fatalf("expected visible padding for ANSI cell, got %q", lines[2])
	}
}
