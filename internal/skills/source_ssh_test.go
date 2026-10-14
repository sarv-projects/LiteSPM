package skills

import "testing"

// TestParseSkillSourceSSHForms pins the ssh source forms the reference
// installer documents for private repositories: the scp-like git@host:path
// remote and ssh:// URLs. Both clone verbatim (no rewrite), carry an optional
// @ref pin, and never get ".git" appended by the known-host rule.
func TestParseSkillSourceSSHForms(t *testing.T) {
	cases := []struct {
		raw      string
		cloneURL string
		repoPath string
		pin      string
		display  string
	}{
		{
			raw:      "git@github.com:owner/repo.git",
			cloneURL: "git@github.com:owner/repo.git",
			repoPath: "owner/repo",
			display:  "git@github.com:owner/repo",
		},
		{
			// No .git suffix: the scp form is left exactly as written.
			raw:      "git@github.com:owner/repo",
			cloneURL: "git@github.com:owner/repo",
			repoPath: "owner/repo",
			display:  "git@github.com:owner/repo",
		},
		{
			raw:      "git@gitlab.com:group/subgroup/repo.git",
			cloneURL: "git@gitlab.com:group/subgroup/repo.git",
			display:  "git@gitlab.com:group/subgroup/repo",
		},
		{
			// The ref separator is the @ after the colon: user@host keeps its @.
			raw:      "git@github.com:owner/repo.git@v1.2.3",
			cloneURL: "git@github.com:owner/repo.git",
			repoPath: "owner/repo",
			pin:      "v1.2.3",
			display:  "git@github.com:owner/repo",
		},
		{
			raw:      "ssh://git@github.com/owner/repo.git",
			cloneURL: "ssh://git@github.com/owner/repo.git",
			repoPath: "owner/repo",
			display:  "ssh://git@github.com/owner/repo",
		},
		{
			raw:      "ssh://git@github.example.com:2222/team/repo",
			cloneURL: "ssh://git@github.example.com:2222/team/repo",
			display:  "ssh://git@github.example.com:2222/team/repo",
		},
		{
			raw:      "ssh://git@github.com/owner/repo.git?ref=feature%2Fone",
			cloneURL: "ssh://git@github.com/owner/repo.git",
			repoPath: "owner/repo",
			pin:      "feature/one",
			display:  "ssh://git@github.com/owner/repo",
		},
		{
			raw:      "ssh://git@github.com/owner/repo@feature/one",
			cloneURL: "ssh://git@github.com/owner/repo",
			repoPath: "owner/repo",
			pin:      "feature/one",
			display:  "ssh://git@github.com/owner/repo",
		},
	}
	for _, c := range cases {
		src, err := ParseSkillSource(c.raw)
		if err != nil {
			t.Errorf("%q: unexpected error: %v", c.raw, err)
			continue
		}
		if src.Kind != "url" || !src.Git {
			t.Errorf("%q: got kind=%q git=%v; want kind=url git=true", c.raw, src.Kind, src.Git)
			continue
		}
		if src.CloneURL != c.cloneURL || src.RepoPath != c.repoPath || src.Pin != c.pin || src.Display != c.display {
			t.Errorf("%q: got clone=%q repo=%q pin=%q display=%q; want clone=%q repo=%q pin=%q display=%q",
				c.raw, src.CloneURL, src.RepoPath, src.Pin, src.Display,
				c.cloneURL, c.repoPath, c.pin, c.display)
		}
	}

	// Malformed scp-like forms stay refused rather than cloning something.
	for _, bad := range []string{"git@:owner/repo.git", "git@github.com:", "git@github.com", "git@github.com/owner/repo"} {
		if _, err := ParseSkillSource(bad); err == nil {
			t.Errorf("%q should be rejected", bad)
		}
	}
	// ssh with no host or no remote path is refused.
	for _, bad := range []string{"ssh://git@/owner/repo", "ssh://host"} {
		if _, err := ParseSkillSource(bad); err == nil {
			t.Errorf("%q should be rejected", bad)
		}
	}
}
