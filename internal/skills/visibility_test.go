package skills

import "testing"

// TestParseSkillMDMetadataInternal pins the frontmatter parsing that used to
// drop the `metadata` mapping: metadata.internal carries the hidden-by-default
// flag, and sibling scalar entries are preserved.
func TestParseSkillMDMetadataInternal(t *testing.T) {
	pkg, err := ParseSkillMD([]byte(`---
name: internal-skill
description: An internal skill
metadata:
  internal: true
  owner: platform-team
---

# Internal Skill
`))
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if !pkg.Internal {
		t.Error("metadata.internal: true was not carried onto the package")
	}
	if pkg.Metadata["owner"] != "platform-team" {
		t.Errorf("metadata sibling lost: %#v", pkg.Metadata)
	}

	// The inline flow-map form parses too.
	pkg, err = ParseSkillMD([]byte(`---
name: inline-internal
description: d
metadata: {internal: true}
---
`))
	if err != nil {
		t.Fatalf("inline parse failed: %v", err)
	}
	if !pkg.Internal {
		t.Error("inline metadata {internal: true} was not carried onto the package")
	}

	// A false value (and no metadata at all) stays visible.
	for _, doc := range []string{
		"---\nname: x\ndescription: d\nmetadata:\n  internal: false\n---\n",
		"---\nname: x\ndescription: d\n---\n",
	} {
		pkg, err = ParseSkillMD([]byte(doc))
		if err != nil {
			t.Fatalf("parse failed: %v", err)
		}
		if pkg.Internal {
			t.Errorf("document should not be internal: %q", doc)
		}
	}
}

// TestInternalSkillsVisibility pins the gate: hidden by default, visible only
// for INSTALL_INTERNAL_SKILLS=1 or =true (the reference installer's exact
// values; "0", "false" and "yes" are not opt-ins).
func TestInternalSkillsVisibility(t *testing.T) {
	internalPkg := &SkillPackage{Name: "hidden", Description: "d", Internal: true}
	publicPkg := &SkillPackage{Name: "public", Description: "d"}

	t.Setenv(InternalSkillsEnvVar, "")
	if InternalSkillsAllowed() || SkillVisible(internalPkg) {
		t.Error("internal skills must be hidden when the variable is unset")
	}
	for _, value := range []string{"0", "false", "yes", "TRUE", "2"} {
		t.Setenv(InternalSkillsEnvVar, value)
		if InternalSkillsAllowed() || SkillVisible(internalPkg) {
			t.Errorf("INSTALL_INTERNAL_SKILLS=%q must not opt in", value)
		}
	}
	for _, value := range []string{"1", "true"} {
		t.Setenv(InternalSkillsEnvVar, value)
		if !InternalSkillsAllowed() || !SkillVisible(internalPkg) {
			t.Errorf("INSTALL_INTERNAL_SKILLS=%q must opt in", value)
		}
	}
	// Non-internal skills are visible under every setting, and a nil package
	// is never treated as visible.
	t.Setenv(InternalSkillsEnvVar, "")
	if !SkillVisible(publicPkg) || SkillVisible(nil) {
		t.Error("non-internal visibility wrong")
	}
}

// TestFilterVisibleSkills keeps hidden skills addressable: they are returned
// rather than dropped, so the caller can explain why a by-name lookup failed.
func TestFilterVisibleSkills(t *testing.T) {
	found := []DiscoveredSkill{
		{Dir: "/a", Pkg: &SkillPackage{Name: "public"}},
		{Dir: "/b", Pkg: &SkillPackage{Name: "hidden", Internal: true}},
	}

	t.Setenv(InternalSkillsEnvVar, "")
	visible, hidden := FilterVisibleSkills(found)
	if len(visible) != 1 || visible[0].Pkg.Name != "public" {
		t.Errorf("visible = %+v", visible)
	}
	if len(hidden) != 1 || hidden[0].Pkg.Name != "hidden" {
		t.Errorf("hidden = %+v", hidden)
	}

	t.Setenv(InternalSkillsEnvVar, "1")
	visible, hidden = FilterVisibleSkills(found)
	if len(visible) != 2 || len(hidden) != 0 {
		t.Errorf("opt-in should make everything visible: %d/%d", len(visible), len(hidden))
	}
}
