package main

// workspace_scope_test.go pins the workspace wiring end to end: prepare_plan
// refuses to invent a project, seals the workspace it was given, the install
// records carry it, and the read tools resolve project-scope work only when
// the caller names that project.

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/ipc"
	"github.com/sarv-projects/litespm/internal/skills"
)

// TestPreparePlanProjectScopeWorkspace pins the IPC write-path rule: a project
// install must name its project, a root that is not a directory is refused, a
// user-scope request that names a root is a contradiction, and a valid root is
// sealed into the plan (and therefore into its hash) as both the project root
// and its derived workspace id.
func TestPreparePlanProjectScopeWorkspace(t *testing.T) {
	pinHostScanHome(t)
	h := newHarness(t)
	ctx := context.Background()
	project := t.TempDir()

	t.Run("project scope without a project root is refused", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{
			"id": testListingID, "version": "1.0.0", "scope": "project",
		}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Fatalf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
		if !strings.Contains(err.Error(), "must name its project") || !strings.Contains(err.Error(), "--workspace") {
			t.Errorf("refusal must name the fix, got: %v", err)
		}
	})

	t.Run("unresolvable project root is refused", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{
			"id": testListingID, "version": "1.0.0", "scope": "project",
			"projectRoot": filepath.Join(project, "does-not-exist"),
		}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Fatalf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
		if !strings.Contains(err.Error(), "does not resolve to a directory") {
			t.Errorf("refusal must say the root is unusable, got: %v", err)
		}
	})

	t.Run("user scope with a project root is refused", func(t *testing.T) {
		var raw json.RawMessage
		err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{
			"id": testListingID, "version": "1.0.0", "projectRoot": project,
		}, &raw)
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Fatalf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
		if !strings.Contains(err.Error(), "only meaningful for scope=project") {
			t.Errorf("refusal must explain the contradiction, got: %v", err)
		}
	})

	t.Run("project scope with a root seals the workspace", func(t *testing.T) {
		var plan domain.InstallPlan
		if err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{
			"id": testListingID, "version": "1.0.0", "scope": "project", "projectRoot": project,
		}, &plan); err != nil {
			t.Fatalf("prepare_plan failed: %v", err)
		}
		if plan.Request.TargetScope != domain.ScopeProject {
			t.Errorf("target scope = %q, want project", plan.Request.TargetScope)
		}
		if want := filepath.Clean(project); plan.Request.ProjectRoot != want {
			t.Errorf("request projectRoot = %q, want %q", plan.Request.ProjectRoot, want)
		}
		if want := domain.WorkspaceIDForProjectRoot(project); plan.Request.WorkspaceID != want {
			t.Errorf("request workspaceId = %q, want %q", plan.Request.WorkspaceID, want)
		}
		// The workspace is inside the plan hash, so the approval binds it.
		recomputed, err := domain.ComputePlanHash(&plan)
		if err != nil {
			t.Fatalf("ComputePlanHash failed: %v", err)
		}
		if recomputed != plan.PlanHash {
			t.Errorf("planHash %q does not match recomputation %q", plan.PlanHash, recomputed)
		}
		stored, err := h.db.GetPlan(ctx, plan.PlanID)
		if err != nil {
			t.Fatalf("GetPlan failed: %v", err)
		}
		if stored.Request.WorkspaceID != plan.Request.WorkspaceID || stored.Request.ProjectRoot != plan.Request.ProjectRoot {
			t.Errorf("stored plan lost the workspace: %+v", stored.Request)
		}
	})

	t.Run("user scope keeps both workspace fields empty", func(t *testing.T) {
		var plan domain.InstallPlan
		if err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{
			"id": testListingID, "version": "1.0.0",
		}, &plan); err != nil {
			t.Fatalf("prepare_plan failed: %v", err)
		}
		if plan.Request.WorkspaceID != "" || plan.Request.ProjectRoot != "" {
			t.Errorf("user-scope plan carries a workspace: %+v", plan.Request)
		}
	})
}

// TestInstallMCPProjectScopeRecordsWorkspace pins the write half of the
// contract: a project-scope MCP install stamps the derived workspace id and the
// project root on the install row, and the workspace id on the host
// registration it writes. It uses `cursor` because a data-driven target needs
// no adapter work to have a project file; a host without one is refused rather
// than written into its user config (TestProjectScopeRefusesHostsWithoutAProjectPath
// in internal/host pins that refusal, and internal/host/codex_grok_project_scope_test.go
// covers a bespoke adapter that opted in through host.ProjectConfigPather).
func TestInstallMCPProjectScopeRecordsWorkspace(t *testing.T) {
	db := openTestState(t)
	dataRoot := t.TempDir()
	homeWithBridge(t)
	project := t.TempDir()

	outcome, err := installMCPFromListing(authorizedTestContext(), db, dataRoot,
		mcpListing("mcp:example:demo-mcp", "demo-mcp"), "1.0.0", domain.ScopeProject, project,
		[]string{"cursor"}, false, stdioRuntime(), nil)
	if err != nil {
		t.Fatalf("install: %v", err)
	}

	wantWorkspace := domain.WorkspaceIDForProjectRoot(project)
	if wantWorkspace == "" {
		t.Fatal("test project root produced no workspace id")
	}
	ctx := context.Background()
	rec, err := db.GetInstall(ctx, outcome.InstallID)
	if err != nil {
		t.Fatalf("GetInstall: %v", err)
	}
	if rec.Scope != domain.ScopeProject {
		t.Errorf("install scope = %q, want project", rec.Scope)
	}
	if rec.WorkspaceID != wantWorkspace {
		t.Errorf("install workspaceId = %q, want %q", rec.WorkspaceID, wantWorkspace)
	}
	if rec.ProjectRoot != filepath.Clean(project) {
		t.Errorf("install projectRoot = %q, want %q", rec.ProjectRoot, filepath.Clean(project))
	}

	regs, err := db.ListHostRegistrationsForEntry(ctx, domain.ScopeProject, "demo-mcp")
	if err != nil {
		t.Fatalf("ListHostRegistrationsForEntry: %v", err)
	}
	if len(regs) != 1 {
		t.Fatalf("expected one host registration, got %+v", regs)
	}
	if regs[0].WorkspaceID != wantWorkspace {
		t.Errorf("host registration workspaceId = %q, want %q", regs[0].WorkspaceID, wantWorkspace)
	}
}

// seedSkillTree writes a readable skill tree into the CAS at the digest a
// seeded InstallRecord points at, mirroring what the daemon's skills.* handlers
// read through installEngine.TreePath.
func seedSkillTree(t *testing.T, casRoot, digest, name, body string) {
	t.Helper()
	hex := strings.TrimPrefix(digest, "sha256:")
	if len(hex) != 64 {
		t.Fatalf("test digest %q is not sha256:<64-hex>", digest)
	}
	writeTestSkill(t, filepath.Join(casRoot, "trees", "sha256", hex), name, body)
}

// TestInstallSkillUserScopeRecordsNoWorkspace pins the guard on the other side:
// a user-scope skill install never claims a project, even when a project root
// was supplied to locate the agents' directories during planning. Both
// workspace fields stay empty.
func TestInstallSkillUserScopeRecordsNoWorkspace(t *testing.T) {
	db := openTestState(t)
	dataRoot := t.TempDir()
	project := t.TempDir()
	home := t.TempDir()

	skillDir := filepath.Join(t.TempDir(), "demo-skill")
	writeTestSkill(t, skillDir, "demo-skill", "a demo skill")
	listing := skillListingFor("skill:example:demo-skill", "demo-skill", skillDir)

	outcome, err := installSkillFromListing(authorizedTestContext(), db, dataRoot, project, home,
		listing, "1.0.0", domain.ScopeUser, []string{"cursor"},
		skillPlanForTest(t, listing, domain.ScopeUser, project, home, []string{"cursor"}))
	if err != nil {
		t.Fatalf("install: %v", err)
	}
	rec, err := db.GetInstall(context.Background(), outcome.InstallID)
	if err != nil {
		t.Fatalf("install record not persisted: %v", err)
	}
	if rec.Scope != domain.ScopeUser {
		t.Errorf("install scope = %q, want user", rec.Scope)
	}
	if rec.WorkspaceID != "" || rec.ProjectRoot != "" {
		t.Errorf("a user-scope install claimed a workspace: workspaceId=%q projectRoot=%q", rec.WorkspaceID, rec.ProjectRoot)
	}
}

// TestInstallExecuteProjectScopeRecordsWorkspace is the daemon path end to
// end: a project-scope plan is prepared with a project root, approved, and
// executed; the install lands in that project and its row carries the sealed
// workspace, re-derived from the plan rather than from a fresh request field.
func TestInstallExecuteProjectScopeRecordsWorkspace(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	for _, a := range skills.AgentTargets() {
		if a.EnvVar != "" {
			t.Setenv(a.EnvVar, "")
		}
	}
	// Make exactly one agent detectable: cursor's home-relative marker.
	if err := os.MkdirAll(filepath.Join(home, ".cursor"), 0o755); err != nil {
		t.Fatal(err)
	}
	project := t.TempDir()
	skillDir := filepath.Join(t.TempDir(), "demo-skill")
	writeTestSkill(t, skillDir, "demo-skill", "project-scope daemon install")
	listing := skillListingFor("skill:test:demo-skill", "demo-skill", skillDir)

	h := newHarnessWith(t, []*domain.Listing{listing})
	ctx := context.Background()

	var plan domain.InstallPlan
	// No version is requested: this fixture publishes none, and the resolver
	// refuses a real constraint against a version-less listing by design
	// (LPSM-RESOLVE-CONFLICT). It pins the release's implicit version instead,
	// which is the path a discovery-only catalog row takes.
	if err := h.client.Call(ctx, "resolver.prepare_plan", map[string]any{
		"id": listing.ID, "scope": "project", "projectRoot": project,
	}, &plan); err != nil {
		t.Fatalf("prepare_plan failed: %v", err)
	}
	wantWorkspace := domain.WorkspaceIDForProjectRoot(project)
	if plan.Request.WorkspaceID != wantWorkspace {
		t.Fatalf("plan workspaceId = %q, want %q", plan.Request.WorkspaceID, wantWorkspace)
	}

	var result map[string]any
	approvalID := approvePlanAsHuman(t, h.db, &plan)
	if err := h.client.Call(ctx, "install.execute", map[string]any{
		"planId": plan.PlanID, "approvalToken": approvalID,
	}, &result); err != nil {
		t.Fatalf("install.execute failed: %v", err)
	}
	installID, _ := result["installId"].(string)
	if installID == "" {
		t.Fatalf("install.execute returned no installId: %#v", result)
	}
	rec, err := h.db.GetInstall(ctx, installID)
	if err != nil {
		t.Fatalf("GetInstall: %v", err)
	}
	if rec.Scope != domain.ScopeProject {
		t.Errorf("install scope = %q, want project", rec.Scope)
	}
	if rec.WorkspaceID != wantWorkspace {
		t.Errorf("install workspaceId = %q, want %q", rec.WorkspaceID, wantWorkspace)
	}
	if rec.ProjectRoot != filepath.Clean(project) {
		t.Errorf("install projectRoot = %q, want %q", rec.ProjectRoot, filepath.Clean(project))
	}
}

// TestApprovalPromptNamesProjectWorkspace pins that a project-scope plan's
// approval prompt names the project and its workspace id (what the approval
// binds), while a user-scope plan prints no such line.
func TestApprovalPromptNamesProjectWorkspace(t *testing.T) {
	project := t.TempDir()
	workspace := domain.WorkspaceIDForProjectRoot(project)

	projectPlan := approvalPromptFixture(time.Now().UTC().Add(time.Minute),
		mcpInstallPlanValueJSON(&mcpInstallBinding{
			Hosts:   []string{"codex"},
			Runtime: &domain.RuntimeDescriptor{Type: "stdio", Command: "npx"},
		}))
	projectPlan.Request.TargetScope = domain.ScopeProject
	projectPlan.Request.ProjectRoot = project
	projectPlan.Request.WorkspaceID = workspace

	var buf bytes.Buffer
	writeApprovalPrompt(&buf, projectPlan)
	if want := "  project : " + project + " (" + workspace + ")\n"; !strings.Contains(buf.String(), want) {
		t.Errorf("project approval prompt did not name the workspace; want line %q in:\n%s", want, buf.String())
	}

	userPlan := approvalPromptFixture(time.Now().UTC().Add(time.Minute),
		mcpInstallPlanValueJSON(&mcpInstallBinding{
			Hosts:   []string{"codex"},
			Runtime: &domain.RuntimeDescriptor{Type: "stdio", Command: "npx"},
		}))
	buf.Reset()
	writeApprovalPrompt(&buf, userPlan)
	if strings.Contains(buf.String(), "  project : ") {
		t.Errorf("user-scope approval prompt claimed a project:\n%s", buf.String())
	}
}

// TestSkillsReadProjectScopeWithRoot pins the skill read path: a project-scope
// skill is invisible until the caller names its project, resolves once it does,
// keeps the path-traversal refusals, and yields to a user-scope skill of the
// same name (the documented precedence rule).
func TestSkillsReadProjectScopeWithRoot(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	h := newHarness(t)
	ctx := context.Background()

	const listingID = "skill:example:demo-skill"
	projectDigest := "sha256:" + strings.Repeat("ab", 32)
	userDigest := "sha256:" + strings.Repeat("cd", 32)
	project := t.TempDir()
	other := t.TempDir()

	seedSkillTree(t, h.paths.CASPath(), projectDigest, "demo-skill", "PROJECT INSTRUCTIONS")
	seedSkillTree(t, h.paths.CASPath(), userDigest, "demo-skill", "USER INSTRUCTIONS")
	if err := os.WriteFile(filepath.Join(h.paths.CASPath(), "trees", "sha256", strings.Repeat("ab", 32), "notes.txt"),
		[]byte("project notes"), 0o644); err != nil {
		t.Fatal(err)
	}

	now := time.Now().UTC()
	save := func(id, digest string, scope domain.InstallScope, ws, root string) {
		t.Helper()
		if err := h.db.SaveInstall(ctx, &domain.InstallRecord{
			InstallID: id, ListingID: listingID, Kind: domain.KindSkill, Version: "1.0.0",
			TreeDigest: digest, Scope: scope, WorkspaceID: ws, ProjectRoot: root,
			Status: domain.InstallActive, InstalledAt: now, UpdatedAt: now,
		}); err != nil {
			t.Fatalf("SaveInstall %s: %v", id, err)
		}
	}
	save("inst_proj_demo_skill", projectDigest, domain.ScopeProject, domain.WorkspaceIDForProjectRoot(project), project)

	load := func(t *testing.T, projectRoot string) (string, error) {
		t.Helper()
		params := map[string]any{"skillId": listingID}
		if projectRoot != "" {
			params["projectRoot"] = projectRoot
		}
		var resp struct {
			Instructions string `json:"instructions"`
		}
		err := h.client.Call(ctx, "skills.load_body", params, &resp)
		return resp.Instructions, err
	}

	t.Run("invisible without a project root", func(t *testing.T) {
		_, err := load(t, "")
		if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
			t.Fatalf("code=%d, want %d (err=%v)", code, ipc.CodeInvalidParams, err)
		}
		if !strings.Contains(err.Error(), "not installed") {
			t.Errorf("unexpected refusal: %v", err)
		}
	})

	t.Run("invisible for another project root", func(t *testing.T) {
		if _, err := load(t, other); err == nil {
			t.Fatal("another project's skill was visible")
		}
	})

	t.Run("resolves with the matching project root", func(t *testing.T) {
		instructions, err := load(t, project)
		if err != nil {
			t.Fatalf("skills.load_body: %v", err)
		}
		if !strings.Contains(instructions, "PROJECT INSTRUCTIONS") {
			t.Errorf("instructions = %q, want the project body", instructions)
		}
	})

	t.Run("read_resource resolves and keeps the traversal guards", func(t *testing.T) {
		var resp struct {
			Content string `json:"content"`
		}
		if err := h.client.Call(ctx, "skills.read_resource", map[string]any{
			"skillId": listingID, "path": "notes.txt", "projectRoot": project,
		}, &resp); err != nil {
			t.Fatalf("skills.read_resource: %v", err)
		}
		if resp.Content != "project notes" {
			t.Errorf("content = %q, want project notes", resp.Content)
		}

		for _, bad := range []string{"../outside", "/etc/passwd"} {
			var raw json.RawMessage
			err := h.client.Call(ctx, "skills.read_resource", map[string]any{
				"skillId": listingID, "path": bad, "projectRoot": project,
			}, &raw)
			if code := rpcCode(t, err); code != ipc.CodeInvalidParams {
				t.Fatalf("path %q: code=%d, want %d (err=%v)", bad, code, ipc.CodeInvalidParams, err)
			}
			if !strings.Contains(err.Error(), "path traversal denied") {
				t.Errorf("path %q: unexpected refusal %v", bad, err)
			}
		}
	})

	t.Run("a user-scope skill wins the name collision", func(t *testing.T) {
		save("inst_user_demo_skill", userDigest, domain.ScopeUser, "", "")
		instructions, err := load(t, project)
		if err != nil {
			t.Fatalf("skills.load_body: %v", err)
		}
		if !strings.Contains(instructions, "USER INSTRUCTIONS") {
			t.Errorf("instructions = %q, want the user body to win the collision", instructions)
		}
	})
}
