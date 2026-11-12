package host

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func projectOnlyAdapter(t *testing.T, id string) *GenericAdapter {
	t.Helper()
	a, err := GetAdapter(id)
	if err != nil {
		t.Fatal(err)
	}
	g, ok := a.(*GenericAdapter)
	if !ok || g.Target.UserPath != nil || g.Target.ProjectPath == nil {
		t.Fatalf("%s is not a project-only generic adapter", id)
	}
	return g
}

func TestDescribeConfigLocation_ProjectOnlyShowsPattern(t *testing.T) {
	loc := DescribeConfigLocation(context.Background(), projectOnlyAdapter(t, "roo"))
	if !loc.ProjectOnly || loc.Path != "" {
		t.Fatalf("roo must be project-only with no user path: %+v", loc)
	}
	if loc.ProjectPattern != "<project>/.roo/mcp.json" {
		t.Fatalf("pattern = %q", loc.ProjectPattern)
	}
}

func TestDescribeConfigLocation_UserPathIsRealFile(t *testing.T) {
	a, _ := GetAdapter("cursor")
	loc := DescribeConfigLocation(context.Background(), a)
	if loc.ProjectOnly || !strings.HasSuffix(filepath.ToSlash(loc.Path), ".cursor/mcp.json") {
		t.Fatalf("cursor location = %+v", loc)
	}
}

func TestHomeRelative(t *testing.T) {
	home := t.TempDir()
	t.Setenv("USERPROFILE", home)
	t.Setenv("HOME", home)
	got := HomeRelative(filepath.Join(home, ".cursor", "mcp.json"))
	want := "~" + string(filepath.Separator) + filepath.Join(".cursor", "mcp.json")
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	other := filepath.Join(t.TempDir(), "x.json")
	if HomeRelative(other) != other {
		t.Fatalf("path outside home must be unchanged")
	}
}

func TestProjectOnlyRow_NotAProjectShowsNoBogusPath(t *testing.T) {
	g := projectOnlyAdapter(t, "roo")
	cwd := t.TempDir() // no .git, no .roo
	row := projectOnlyRow(DetectRow{HostID: "roo", Path: filepath.Join(cwd, ".roo", "mcp.json")}, g, cwd)
	if row.Path != "" || row.Note != ProjectOnlyNote || row.Project {
		t.Fatalf("row = %+v", row)
	}
}

func TestProjectOnlyRow_GitDirIsAProject(t *testing.T) {
	g := projectOnlyAdapter(t, "roo")
	cwd := t.TempDir()
	if err := os.Mkdir(filepath.Join(cwd, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	row := projectOnlyRow(DetectRow{HostID: "roo"}, g, cwd)
	if !row.Project || row.Note != "" || row.Path != filepath.Join(cwd, ".roo", "mcp.json") {
		t.Fatalf("row = %+v", row)
	}
}

func TestProjectOnlyRow_HostFileMakesItAProject(t *testing.T) {
	g := projectOnlyAdapter(t, "roo")
	cwd := t.TempDir()
	p := filepath.Join(cwd, ".roo", "mcp.json")
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	row := projectOnlyRow(DetectRow{HostID: "roo"}, g, cwd)
	if !row.Project || row.Path != p {
		t.Fatalf("row = %+v", row)
	}
}

// Setup must keep resolving project-only hosts against the working directory.
func TestGenericDetectConfig_ProjectOnlyStillUsesCwdForSetup(t *testing.T) {
	g := projectOnlyAdapter(t, "roo")
	cwd := t.TempDir()
	t.Chdir(cwd)
	got, err := g.DetectConfig(context.Background(), "user")
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.EvalSymlinks(cwd)
	gotDir, _ := filepath.EvalSymlinks(filepath.Dir(filepath.Dir(got)))
	if gotDir != want {
		t.Fatalf("setup path changed: %s", got)
	}
}

func TestDescribeDetection_Order(t *testing.T) {
	rows, err := DescribeDetection(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for i := 1; i < len(rows); i++ {
		a, b := rows[i-1], rows[i]
		if detectRank(a) > detectRank(b) || (detectRank(a) == detectRank(b) && a.HostID > b.HostID) {
			t.Fatalf("rows out of order at %d: %+v then %+v", i, a, b)
		}
	}
}
