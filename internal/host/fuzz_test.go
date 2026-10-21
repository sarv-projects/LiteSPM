package host

// fuzz_test.go — native fuzzing for the byte-offset config merge.
//
// mergeJSONEntrySurgicalNamed and mergeTOMLEntry edit a file LiteSPM did not
// write: comments, key order, duplicate-looking keys and truncated documents
// all have to survive or be refused. They are the two functions that touch a
// user's existing agent configuration, so a panic here is a lost config file.
//
// The invariant is: for any bytes, the merge returns either a string or an
// error, and when it returns a string the result is valid JSON/TOML for the
// shapes it accepts. The targets do not assert semantic preservation for
// arbitrary input (that is what the golden tests are for) — they assert that
// hostile input cannot crash the editor.

import (
	"encoding/json"
	"testing"
)

func FuzzMergeJSONEntrySurgical(f *testing.F) {
	f.Add([]byte(`{"mcpServers":{}}`), "litespm")
	f.Add([]byte("{\n  // a comment\n  \"mcpServers\": {\n    \"existing\": {\"command\": \"npx\"}\n  }\n}\n"), "litespm")
	f.Add([]byte(`{"mcpServers":{"a":{}}`), "b") // truncated
	f.Add([]byte(`{}`), "")
	f.Add([]byte(``), "litespm")
	f.Add([]byte(`{"mcpServers":{"litespm":{"command":["old"]}}}`), "litespm")

	f.Fuzz(func(t *testing.T, raw []byte, name string) {
		if len(raw) > 1<<20 {
			t.Skip()
		}
		validIn := json.Valid([]byte(stripJSONComments(string(raw))))
		out, err := mergeJSONEntrySurgicalNamed(string(raw), []string{"mcpServers"}, name, map[string]any{
			"command": []string{"litespm", "bridge", "stdio"},
		})
		if err != nil {
			return
		}
		if out == "" {
			t.Fatal("merge returned an empty document with no error")
		}
		// The splice itself does not validate: both production callers
		// (GenericAdapter.renderConfig and InstallServerEntry) re-parse the
		// result and refuse to write an invalid document. The invariant this
		// target can prove is therefore conditional — if the input parsed,
		// the output must parse too, or those refusal paths are the only
		// thing standing between a user and a corrupt config.
		if validIn && !json.Valid([]byte(stripJSONComments(out))) {
			t.Fatalf("merge turned valid JSON into invalid JSON:\n%s", out)
		}
	})
}

func FuzzMergeTOMLEntry(f *testing.F) {
	f.Add(`[mcp_servers.existing]`+"\n"+`command = "npx"`+"\n", "mcp_servers.litespm", "[mcp_servers.litespm]\ncommand = \"litespm\"\n")
	f.Add("", "mcp_servers.litespm", "[mcp_servers.litespm]\ncommand = \"litespm\"\n")
	f.Add("# comment\n[general]\ntheme = \"dark\"\n", "mcp_servers.litespm", "[mcp_servers.litespm]\ncommand = \"litespm\"\n")
	f.Add("[mcp_servers.litespm]\ncommand = \"old\"\n", "mcp_servers.litespm", "[mcp_servers.litespm]\ncommand = \"new\"\n")

	f.Fuzz(func(t *testing.T, orig, table, block string) {
		if len(orig) > 1<<20 || len(table) > 1<<10 || len(block) > 1<<16 {
			t.Skip()
		}
		// Table names come from BridgeTarget rows, not from users; the fuzzer
		// still gets to vary them to prove the function never panics.
		if _, err := mergeTOMLEntry(orig, table, block); err != nil {
			return
		}
	})
}
