package scan

import "testing"

func TestScanFiresTheRulesItShould(t *testing.T) {
	cases := []struct {
		name string
		row  Row
		rule string
		sev  Severity
	}{
		{
			name: "a discovery-only row with a command",
			row:  Row{ID: "mcp:x:y", Kind: "mcp", Installability: "discovery_only", Command: "npx"},
			rule: RuleLaunchLineWithoutProvenance,
			sev:  SeverityError,
		},
		{
			name: "a discovery-only row with an endpoint",
			row:  Row{ID: "mcp:x:y", Kind: "mcp", Installability: "discovery_only", URL: "https://mcp.example.com/mcp"},
			rule: RuleLaunchLineWithoutProvenance,
			sev:  SeverityError,
		},
		{
			name: "a plugin with no artifact",
			row:  Row{ID: "plugin:x:y", Kind: "plugin", Installability: "metadata_verified"},
			rule: RulePluginWithoutSource,
			sev:  SeverityWarning,
		},
		{
			name: "a plugin with a local directory",
			row:  Row{ID: "plugin:x:y", Kind: "plugin", Artifact: &Artifact{Type: "local-dir"}},
			rule: RulePluginWithoutSource,
			sev:  SeverityWarning,
		},
		{
			name: "a plugin with an unpinned tree",
			row:  Row{ID: "plugin:x:y", Kind: "plugin", Artifact: &Artifact{Type: "git-tree", Repo: "https://github.com/a/b.git", Ref: "main"}},
			rule: RuleUnpinnedSource,
			sev:  SeverityWarning,
		},
		{
			name: "an internal skill published",
			row:  Row{ID: "skill:x:y", Kind: "skill", Installability: "metadata_verified", Metadata: map[string]any{"internal": true}},
			rule: RuleInternalSkillPublished,
			sev:  SeverityError,
		},
		{
			name: "a credential in the url",
			row:  Row{ID: "mcp:x:y", Kind: "mcp", Installability: "metadata_verified", URL: "https://user:hunter2@mcp.example.com/mcp"},
			rule: RuleCredentialInURL,
			sev:  SeverityError,
		},
		{
			name: "an api key in the url",
			row:  Row{ID: "mcp:x:y", Kind: "mcp", Installability: "metadata_verified", URL: "https://mcp.example.com/mcp?api_key=abcd1234"},
			rule: RuleCredentialInURL,
			sev:  SeverityError,
		},
		{
			name: "a version with no source",
			row:  Row{ID: "mcp:x:y", Kind: "mcp", Installability: "metadata_verified", Version: "1.2.3"},
			rule: RuleVersionWithoutSource,
			sev:  SeverityNote,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			findings := Scan(tc.row)
			if len(findings) == 0 {
				t.Fatalf("the rule %q did not fire", tc.rule)
			}
			found := false
			for _, f := range findings {
				if f.Rule == tc.rule {
					found = true
					if f.Severity != tc.sev {
						t.Errorf("severity = %q, want %q", f.Severity, tc.sev)
					}
					if f.ListingID != tc.row.ID {
						t.Errorf("the finding names %q, want %q", f.ListingID, tc.row.ID)
					}
					if f.Message == "" {
						t.Error("the finding carries no message")
					}
				}
			}
			if !found {
				t.Fatalf("the rule %q did not fire; findings: %+v", tc.rule, findings)
			}
		})
	}
}

func TestScanIsQuietOnARowThatIsFine(t *testing.T) {
	row := Row{
		ID:             "mcp:builtin:mcp-registry:io.github.example",
		Kind:           "mcp",
		Installability: "metadata_verified",
		Source:         "builtin:mcp-registry",
		URL:            "https://mcp.example.com/mcp",
		Transport:      "streamable-http",
	}
	if findings := Scan(row); len(findings) != 0 {
		t.Fatalf("a sound row produced findings: %+v", findings)
	}
}

func TestScanAcceptsAPluginWithAPinnedTree(t *testing.T) {
	row := Row{
		ID:             "plugin:claude-official:demo",
		Kind:           "plugin",
		Installability: "metadata_verified",
		Source:         "git:claude-plugins-official",
		Artifact: &Artifact{
			Type:   "git-tree",
			Repo:   "https://github.com/example/plugins.git",
			Path:   "plugins/demo",
			Ref:    "v1.0.0",
			SHA:    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			Pinned: true,
		},
	}
	if findings := Scan(row); len(findings) != 0 {
		t.Fatalf("a pinned plugin produced findings: %+v", findings)
	}
}

func TestAPlaceholderIsNotACredential(t *testing.T) {
	// The publisher substitutes it; the catalogue publishes the template.
	row := Row{
		ID:             "mcp:x:y",
		Kind:           "mcp",
		Installability: "metadata_verified",
		URL:            "https://mcp.example.com/mcp?key={api_key}",
	}
	if findings := Scan(row); len(findings) != 0 {
		t.Fatalf("a placeholder produced findings: %+v", findings)
	}
}

func TestScanRowsIsDeterministic(t *testing.T) {
	rows := []Row{
		{ID: "b", Kind: "mcp", Installability: "discovery_only", Command: "npx"},
		{ID: "a", Kind: "mcp", Installability: "discovery_only", Command: "npx"},
	}
	first := ScanRows(rows)
	second := ScanRows([]Row{rows[1], rows[0]})
	if len(first) != len(second) {
		t.Fatalf("the scan is not deterministic: %d findings, then %d", len(first), len(second))
	}
	for i := range first {
		if first[i] != second[i] {
			t.Fatalf("finding %d differs between runs: %+v vs %+v", i, first[i], second[i])
		}
	}
	if first[0].ListingID > first[1].ListingID {
		t.Errorf("the findings are not sorted by listing id: %+v", first)
	}
}
