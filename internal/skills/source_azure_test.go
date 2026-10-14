package skills

import "testing"

// TestParseSkillSourceAzureRepos pins the Azure Repos forms. The bare
// /_git/<repo> URL is a clone target; the web UI adds query parameters that
// must be interpreted, not cloned:
//
//   - version=GBmain / GTv1.2 pins the branch/tag ("GB" is Azure's git-branch
//     marker, not part of the ref name — cloning GBmain fails);
//   - path=/skills/x is the in-repo subpath;
//   - version=GC<sha> is ignored because `git clone --branch` cannot check out
//     a commit.
func TestParseSkillSourceAzureRepos(t *testing.T) {
	cases := []struct {
		raw      string
		cloneURL string
		pin      string
		subpath  string
	}{
		{
			raw:      "https://dev.azure.com/org/project/_git/repo",
			cloneURL: "https://dev.azure.com/org/project/_git/repo.git",
		},
		{
			raw:      "https://dev.azure.com/org/project/_git/repo?path=/skills/web-design&version=GBmain",
			cloneURL: "https://dev.azure.com/org/project/_git/repo.git",
			pin:      "main",
			subpath:  "skills/web-design",
		},
		{
			raw:      "https://dev.azure.com/org/project/_git/repo?version=GTv1.2",
			cloneURL: "https://dev.azure.com/org/project/_git/repo.git",
			pin:      "v1.2",
		},
		{
			// GC is a commit: no branch can check it out, so no pin is invented.
			raw:      "https://dev.azure.com/org/project/_git/repo?version=GC0f1e2d3a4b5c6d7e8f9a",
			cloneURL: "https://dev.azure.com/org/project/_git/repo.git",
		},
		{
			// Percent-encoded query values decode before parsing.
			raw:      "https://dev.azure.com/org/project/_git/repo?path=%2Fskills%2Fcat%2Fname&version=GBrelease%2Fv1",
			cloneURL: "https://dev.azure.com/org/project/_git/repo.git",
			pin:      "release/v1",
			subpath:  "skills/cat/name",
		},
		{
			// The GB prefix is matched case-insensitively.
			raw:      "https://dev.azure.com/org/project/_git/repo?version=gbmain",
			cloneURL: "https://dev.azure.com/org/project/_git/repo.git",
			pin:      "main",
		},
		{
			// A path without a version still yields the subpath.
			raw:      "https://dev.azure.com/org/project/_git/repo?path=skills/web-design",
			cloneURL: "https://dev.azure.com/org/project/_git/repo.git",
			subpath:  "skills/web-design",
		},
		{
			// A .git suffix on the repo segment is not doubled.
			raw:      "https://dev.azure.com/org/project/_git/repo.git",
			cloneURL: "https://dev.azure.com/org/project/_git/repo.git",
		},
	}
	for _, c := range cases {
		src, err := ParseSkillSource(c.raw)
		if err != nil {
			t.Errorf("%q: unexpected error: %v", c.raw, err)
			continue
		}
		if !src.Git || src.Kind != "url" {
			t.Errorf("%q: got kind=%q git=%v; want a git url", c.raw, src.Kind, src.Git)
			continue
		}
		if src.CloneURL != c.cloneURL || src.Pin != c.pin || src.Subpath != c.subpath {
			t.Errorf("%q: got clone=%q pin=%q subpath=%q; want clone=%q pin=%q subpath=%q",
				c.raw, src.CloneURL, src.Pin, src.Subpath, c.cloneURL, c.pin, c.subpath)
		}
	}
}

// TestParseSkillSourceAzureUnsafePathRejected keeps a traversal in the Azure
// path query from escaping the checkout.
func TestParseSkillSourceAzureUnsafePathRejected(t *testing.T) {
	for _, raw := range []string{
		"https://dev.azure.com/org/project/_git/repo?path=/../../etc",
		"https://dev.azure.com/org/project/_git/repo?path=%2Fskills%2F..%2F..%2Fetc",
	} {
		if _, err := ParseSkillSource(raw); err == nil {
			t.Errorf("%q should be rejected", raw)
		}
	}
}
