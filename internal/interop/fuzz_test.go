package interop

// fuzz_test.go — native fuzzing for the untrusted-input boundary.
//
// Every importer reads a file the user named, and the file's content comes
// from a stranger's repository. The contract these targets pin is narrow and
// is exactly what the parsers promise: a document either parses or returns a
// typed error. It never panics, never runs code, and never reads outside the
// bytes it was given.
//
// The seeds are real shapes, not random bytes: a fuzz corpus that starts from
// valid documents explores the interesting branches (an entry that is a
// string where an object was expected, a source that is a local path, a depth
// boundary) far sooner than one that starts from noise.

import "testing"

func FuzzParse(f *testing.F) {
	f.Add([]byte(`{"version":1,"skills":{"pdf":{"source":"anthropics/skills","sourceType":"github","computedHash":"abc"}}}`))
	f.Add([]byte(`{"name":"io.github.acme/demo","version":"1.0.0","packages":[{"registryType":"npm","identifier":"@acme/demo","version":"1.0.0"}]}`))
	f.Add([]byte(`{"name":"acme","owner":{"name":"acme"},"plugins":[{"name":"demo","source":"./demo"}]}`))
	f.Add([]byte(`{"name":"acme","plugins":[{"name":"demo","source":{"source":"github","repo":"acme/demo"}}]}`))
	f.Add([]byte(`{"name":"demo","version":"1.0.0","mcpServers":"./mcp.json"}`))
	f.Add([]byte(`[]`))
	f.Add([]byte(`null`))
	f.Add([]byte(``))
	f.Add([]byte(`{"a":`))

	f.Fuzz(func(t *testing.T, data []byte) {
		// MaxImportBytes is the parser's own gate; feeding more would only
		// test the allocator, and the gate is covered by a unit test.
		if len(data) > MaxImportBytes {
			t.Skip()
		}
		for _, format := range AllFormats {
			doc, err := Parse(format, data)
			if err == nil && doc == nil {
				t.Fatalf("format %q returned neither a document nor an error", format)
			}
		}
	})
}
