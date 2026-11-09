package main

// marketplace.go — open the browser marketplace (Skills / Plugins / MCP /
// Installed) from the terminal.
//
// The agent-side `/marketplace` prompt is text-only: MCP has no portable
// "open a window" call, and a host that does not implement a rich panel
// cannot render one. This command is the portable window: it opens the same
// 4-tab marketplace the site serves, and accepts --url for a local build.

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

const marketplaceUsage = `Usage: litespm marketplace [--url <url>] [--no-open]

Open the LiteSPM marketplace in the default browser. The page has four tabs:
Skills, Plugins, MCP Servers and Installed, with a live search bar over the
catalog. The Installed tab reads the local LiteSPM ledger when the page is
served from this machine.

Flags:
  --url <url>   Open a specific marketplace URL (default: $LITESPM_WEB_URL or
                https://lite-spm-nine.vercel.app/marketplace).
  --no-open     Print the URL instead of opening a browser.
  -h, --help    Show this help.

The agent-side /marketplace prompt is text-only: MCP prompts are text-only and
no portable window API exists, so this command opens the page a host cannot.
`

func marketplaceURL() string {
	if raw := strings.TrimSpace(os.Getenv("LITESPM_WEB_URL")); raw != "" {
		raw = strings.TrimRight(raw, "/")
		if strings.HasSuffix(raw, "/marketplace") {
			return raw
		}
		return raw + "/marketplace"
	}
	return "https://lite-spm-nine.vercel.app/marketplace"
}

func runMarketplace(args []string) {
	if len(args) > 0 && args[0] == "rows" {
		os.Exit(runMarketplaceRows(args[1:]))
	}
	target := marketplaceURL()
	open := true
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-h", "--help":
			fmt.Print(marketplaceUsage)
			return
		case "--no-open":
			open = false
		case "--url":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Usage error: --url needs a value")
				os.Exit(2)
			}
			i++
			target = args[i]
		default:
			fmt.Fprintf(os.Stderr, "Usage error: unknown argument %q\n\n%s", args[i], marketplaceUsage)
			os.Exit(2)
		}
	}
	if parsed, err := url.Parse(target); err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		fmt.Fprintf(os.Stderr, "Usage error: marketplace URL must be http(s): %q\n", target)
		os.Exit(2)
	}

	fmt.Printf("LiteSPM Marketplace\n  %s\n\n", target)
	if !open {
		return
	}
	if err := openBrowser(target); err != nil {
		fmt.Fprintf(os.Stderr, "Could not open a browser automatically: %v\nOpen the URL above in your browser.\n", err)
		return
	}
	fmt.Println("Opened in your default browser. The Installed tab is wired to the local ledger when the page is served locally.")
}

func openBrowser(target string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", target)
	case "darwin":
		cmd = exec.Command("open", target)
	default:
		cmd = exec.Command("xdg-open", target)
	}
	return cmd.Start()
}
