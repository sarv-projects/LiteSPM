package skills

import "testing"

func TestSkillDirectoryURLResolvesRepositoryAndNamedSkill(t *testing.T) {
	for _, host := range []string{"skills.sh", "www.skills.sh"} {
		raw := "https://" + host + "/anthropics/skills/pdf"
		if IsDirectDownloadSource(raw) {
			t.Fatal("directory page must not be downloaded as a skill archive")
		}
		src, err := ParseSkillSource(raw)
		if err != nil {
			t.Fatal(err)
		}
		if !src.Git || src.CloneURL != "https://github.com/anthropics/skills.git" || src.RequestedSkill != "pdf" {
			t.Fatalf("incorrect directory resolution: %+v", src)
		}
	}
}

func TestSkillDirectoryURLRejectsAmbiguousOrUnsafeIdentity(t *testing.T) {
	for _, raw := range []string{
		"https://skills.sh/owner/repo",
		"https://skills.sh/owner/repo/skill/extra",
		"https://skills.sh/owner/repo/..",
		"https://skills.sh/owner/repo/%2Fescape",
		"https://user@skills.sh/owner/repo/skill",
		"https://skills.sh:443/owner/repo/skill",
		"https://skills.sh/owner/repo/skill?source=elsewhere",
	} {
		if _, err := ParseSkillSource(raw); err == nil {
			t.Errorf("accepted ambiguous source %q", raw)
		}
	}
}
