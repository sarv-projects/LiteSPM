package main

import (
	"strings"
	"testing"
)

func TestMarketplaceURL(t *testing.T) {
	t.Setenv("LITESPM_WEB_URL", "")
	if got := marketplaceURL(); got != "https://lite-spm-nine.vercel.app/marketplace" {
		t.Fatalf("default marketplaceURL = %q", got)
	}

	t.Setenv("LITESPM_WEB_URL", "http://localhost:3000/")
	if got := marketplaceURL(); got != "http://localhost:3000/marketplace" {
		t.Fatalf("base marketplaceURL = %q", got)
	}

	t.Setenv("LITESPM_WEB_URL", "http://localhost:3000/marketplace")
	if got := marketplaceURL(); got != "http://localhost:3000/marketplace" {
		t.Fatalf("explicit marketplaceURL = %q", got)
	}
}

func TestMarketplaceHelpNamesTheTabsAndTheLimit(t *testing.T) {
	for _, want := range []string{"Skills", "Plugins", "MCP Servers", "Installed", "MCP prompts are text-only"} {
		if !strings.Contains(marketplaceUsage, want) {
			t.Errorf("marketplace usage does not mention %q", want)
		}
	}
}
