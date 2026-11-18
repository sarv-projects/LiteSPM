package main

import (
	"testing"

	"github.com/sarv-projects/litespm/internal/domain"
)

func TestSkillForceSealedInPlanAndReadBack(t *testing.T) {
	listing := &domain.Listing{ID: "skill:acme:demo", Name: "Demo", Kind: domain.KindSkill}
	dests := []skillDestination{{AgentID: "claude-code", Root: "/tmp/skills"}}

	strict := skillHostChanges(listing, dests, false)
	if got := skillForceFromPlan(&domain.InstallPlan{HostChanges: strict}); got {
		t.Fatal("a plan without --force must stay strict")
	}
	forced := skillHostChanges(listing, dests, true)
	plan := &domain.InstallPlan{HostChanges: forced}
	if got := skillForceFromPlan(plan); !got {
		t.Fatal("--force sealed into the plan must be read back at execution")
	}
	// Binding drives the plan, so the CLI flag and the approved document agree.
	binding := &skillInstallBinding{Force: true}
	if !binding.Force || !skillForceFromPlan(&domain.InstallPlan{HostChanges: skillHostChanges(listing, dests, binding.Force)}) {
		t.Fatal("skill binding must carry --force into the sealed plan")
	}
}
