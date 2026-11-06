package main

// usage_exit_test.go — defect 7: every help page promises exit 2 for a usage
// error, and the dispatch/handler paths must honour it. These paths call
// os.Exit directly, so the only way to observe the code is to run the real
// `main` in a child process and read its exit status.

import (
	"bytes"
	"io"
	"os"
	"os/exec"
	"strings"
	"testing"
)

// TestUsageExitCodes re-executes the test binary as the litespm CLI and checks
// the exit status of every usage error the help pages promise is 2.
func TestUsageExitCodes(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want int
	}{
		{"bare skills", []string{"skills"}, 2},
		{"unknown skills subcommand", []string{"skills", "bogus"}, 2},
		{"skills add parse error", []string{"skills", "add"}, 2},
		{"skills update parse error", []string{"skills", "update", "--bogus"}, 2},
		{"skills remove no names", []string{"skills", "remove"}, 2},
		{"restore unknown flag", []string{"restore", "--bogus"}, 2},
		{"install remove without id", []string{"install", "remove"}, 2},
		{"catalog bad subcommand", []string{"catalog", "bogus"}, 2},
		{"daemon bad subcommand", []string{"daemon", "bogus"}, 2},
		{"host bare", []string{"host"}, 2},
		{"host unknown subcommand", []string{"host", "bogus"}, 2},
		{"host remove without host", []string{"host", "remove"}, 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cmd := exec.Command(os.Args[0], append([]string{"-test.run=^TestUsageExitHelperProcess$", "--"}, tc.args...)...)
			cmd.Stdout = io.Discard
			var stderr bytes.Buffer
			cmd.Stderr = &stderr
			err := cmd.Run()
			code := 0
			if ee, ok := err.(*exec.ExitError); ok {
				code = ee.ExitCode()
			} else if err != nil {
				t.Fatalf("run %v: %v", tc.args, err)
			}
			if code != tc.want {
				t.Fatalf("litespm %v exit = %d, want %d\nstderr:\n%s", tc.args, code, tc.want, stderr.String())
			}
		})
	}
}

// TestSkillsHelpExitsZero pins the dead end where `litespm skills --help`
// printed "Unknown skills subcommand: --help" and exited 2, even though the
// usage line it printed advertises --help. Both spellings must route to the
// usage printer and exit 0.
func TestSkillsHelpExitsZero(t *testing.T) {
	for _, arg := range []string{"--help", "-h"} {
		cmd := exec.Command(os.Args[0], "-test.run=^TestUsageExitHelperProcess$", "--", "skills", arg)
		var out bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = io.Discard
		if err := cmd.Run(); err != nil {
			t.Fatalf("litespm skills %s: %v (output: %s)", arg, err, out.String())
		}
		if !strings.Contains(out.String(), "Usage: litespm skills") {
			t.Fatalf("litespm skills %s printed no usage; stdout:\n%s", arg, out.String())
		}
	}
}

// TestUsageExitHelperProcess runs the real CLI main with the argv after "--".
// It is selected only in the child process (-test.run=^TestUsageExitHelperProcess$)
// and is a no-op when os.Args carries no "--" marker, so a normal `go test` run
// of the package never reaches main().
//
// The `agent` command is deliberately not covered by TestUsageExitCodes: its
// handler fetches the ACP registry BEFORE it looks at the subcommand
// (runAgentCommand), so a bad subcommand cannot be exercised offline without a
// network round trip. Its exit code is changed in source alongside the rest.
func TestUsageExitHelperProcess(t *testing.T) {
	for i, a := range os.Args {
		if a != "--" {
			continue
		}
		os.Args = append([]string{"litespm"}, os.Args[i+1:]...)
		main()
		return
	}
}
