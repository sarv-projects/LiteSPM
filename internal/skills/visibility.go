package skills

// visibility.go — the metadata.internal policy.
//
// A skill whose frontmatter carries `metadata.internal: true` is intended for
// the source maintainer's own use: the reference installer hides it from
// listing and refuses it for install unless INSTALL_INTERNAL_SKILLS=1|true.
// The capability lives here so every surface (listing, install, update)
// consults one predicate instead of re-implementing the environment check.

import (
	"os"
	"strings"
)

// InternalSkillsEnvVar is the opt-in variable, named exactly as the reference
// installer names it so existing shell profiles keep working.
const InternalSkillsEnvVar = "INSTALL_INTERNAL_SKILLS"

// InternalSkillsAllowed reports whether INSTALL_INTERNAL_SKILLS opts in to
// internal skills. The accepted values are the reference installer's exact
// ones: "1" and "true" (surrounding whitespace is ignored; everything else,
// including "0", "false" and "yes", is not an opt-in).
func InternalSkillsAllowed() bool {
	v := strings.TrimSpace(os.Getenv(InternalSkillsEnvVar))
	return v == "1" || v == "true"
}

// SkillVisible reports whether a parsed skill may be listed or installed.
// Internal skills are hidden unless the environment opts in; a nil package is
// not visible.
func SkillVisible(pkg *SkillPackage) bool {
	if pkg == nil {
		return false
	}
	return !pkg.Internal || InternalSkillsAllowed()
}

// FilterVisibleSkills splits discovered skills into the visible and the hidden
// (internal, not opted in) ones. Hidden skills are returned rather than
// dropped so a caller can tell the user that a skill exists but is hidden —
// silently dropping one makes a by-name install look broken.
func FilterVisibleSkills(found []DiscoveredSkill) (visible, hidden []DiscoveredSkill) {
	for _, sk := range found {
		if !SkillVisible(sk.Pkg) {
			hidden = append(hidden, sk)
			continue
		}
		visible = append(visible, sk)
	}
	return visible, hidden
}
