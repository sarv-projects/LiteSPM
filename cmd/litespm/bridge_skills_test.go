package main

// bridge_skills_test.go — the bridge must see the same skills the CLI sees.
//
// `litespm skills add` writes the skills ledger and no install record. Before
// this test, skills.list/load_body/read_resource walked install_records only,
// so a ledger-only skill was invisible to /marketplace while `litespm list`
// showed it. The test plants a ledger row and a real SKILL.md, then drives the
// same IPC methods the bridge tools call.

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sarv-projects/litespm/internal/skills"
)

func TestBridgeSkillToolsSeeLedgerOnlySkill(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	dir := filepath.Join(h.paths.DataRoot, "skills", "pdf")
	if err := os.MkdirAll(filepath.Join(dir, "references"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(
		"---\nname: pdf\ndescription: Work with PDF files\n---\n\nRead the PDF before answering.\n",
	), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "references", "guide.md"), []byte("guide body"), 0o600); err != nil {
		t.Fatal(err)
	}

	ledger, err := skills.OpenLedger(skills.LedgerPath(h.paths.DataRoot))
	if err != nil {
		t.Fatal(err)
	}
	if err := ledger.Add([]skills.LedgerEntry{{
		SkillName: "pdf",
		AgentID:   "opencode",
		HostLabel: "OpenCode",
		DestDir:   dir,
		Source:    "local",
		Scope:     "global",
	}}); err != nil {
		t.Fatal(err)
	}

	t.Run("skills.list", func(t *testing.T) {
		var resp struct {
			Skills []struct {
				ID    string `json:"id"`
				Name  string `json:"name"`
				Scope string `json:"scope"`
			} `json:"skills"`
		}
		if err := h.client.Call(ctx, "skills.list", nil, &resp); err != nil {
			t.Fatalf("skills.list: %v", err)
		}
		if len(resp.Skills) != 1 {
			t.Fatalf("expected one ledger skill, got %+v", resp.Skills)
		}
		if resp.Skills[0].ID != "skill:pdf" || resp.Skills[0].Name != "pdf" || resp.Skills[0].Scope != "user" {
			t.Errorf("unexpected ledger skill summary: %+v", resp.Skills[0])
		}
	})

	t.Run("skills.load_body", func(t *testing.T) {
		var resp struct {
			Instructions string `json:"instructions"`
		}
		if err := h.client.Call(ctx, "skills.load_body", map[string]any{"skillId": "skill:pdf"}, &resp); err != nil {
			t.Fatalf("skills.load_body: %v", err)
		}
		if !strings.Contains(resp.Instructions, "Read the PDF before answering") {
			t.Errorf("instructions did not come from the ledger tree: %q", resp.Instructions)
		}
	})

	t.Run("skills.read_resource", func(t *testing.T) {
		var resp struct {
			Content string `json:"content"`
		}
		if err := h.client.Call(ctx, "skills.read_resource", map[string]any{
			"skillId": "skill:pdf",
			"path":    "references/guide.md",
		}, &resp); err != nil {
			t.Fatalf("skills.read_resource: %v", err)
		}
		if resp.Content != "guide body" {
			t.Errorf("resource content = %q", resp.Content)
		}
	})

	t.Run("traversal is refused", func(t *testing.T) {
		err := h.client.Call(ctx, "skills.read_resource", map[string]any{
			"skillId": "skill:pdf",
			"path":    "../secret.txt",
		}, &struct{}{})
		if err == nil || !strings.Contains(err.Error(), "path traversal") {
			t.Fatalf("expected path traversal denial, got %v", err)
		}
	})

	t.Run("tools.list includes the ledger skill", func(t *testing.T) {
		var resp struct {
			Installs []struct {
				ID   string `json:"id"`
				Kind string `json:"kind"`
			} `json:"installs"`
		}
		if err := h.client.Call(ctx, "tools.list", map[string]any{}, &resp); err != nil {
			t.Fatalf("tools.list: %v", err)
		}
		for _, item := range resp.Installs {
			if item.ID == "skill:pdf" && item.Kind == "skill" {
				return
			}
		}
		t.Fatalf("tools.list did not include skill:pdf: %+v", resp.Installs)
	})
}
