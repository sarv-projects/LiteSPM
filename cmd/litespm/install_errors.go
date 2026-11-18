package main

// install_errors.go — how an install failure reads to a person.
//
// domain.LPSMError.Error() is a diagnostic string for logs and tests: it ends
// in "(category: …, details: map[…])", which is the Go map printed verbatim.
// That text is right for a log line and wrong for a terminal. The structured
// code, category and details stay on the error (the JSON and RPC paths marshal
// them); only the human CLI renders differently, through this file.

import (
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"

	"github.com/sarv-projects/litespm/internal/domain"
)

// installFailureText renders err for a terminal. A not-installable refusal
// becomes a sentence plus a "Try:" line; any other typed error keeps its
// message and code but drops the category and the details map; an untyped
// error is printed as it is.
func installFailureText(err error, unicode bool) string {
	var lerr *domain.LPSMError
	if !errors.As(err, &lerr) || lerr == nil {
		return fmt.Sprintf("Install failed: %v\n", err)
	}
	if lerr.Code == "LPSM-NOT-INSTALLABLE" {
		id, _ := lerr.Details["listingId"].(string)
		mark := "x"
		if unicode {
			mark = "✗"
		}
		if id == "" {
			return fmt.Sprintf("%s This listing can't be installed: it has no verified launch line (%s).\n  Try: litespm search <query> to inspect the listing and its source\n", mark, lerr.Code)
		}
		return fmt.Sprintf("%s %s can't be installed: it is discovery-only metadata with no verified launch line (%s).\n  Try: litespm search %s to inspect the listing, or litespm marketplace to browse installable alternatives\n",
			mark, id, lerr.Code, searchTermForListingID(id))
	}
	if lerr.Code == "LPSM-INSTALL-PARTIAL" {
		return fmt.Sprintf("Install failed: %s (%s)\n  Try: Re-run with --allow-partial to install portable components while skipping non-portable host extras.\n", lerr.Message, lerr.Code)
	}
	if lerr.Code == "LPSM-HOST-REMOTE-UNSUPPORTED" {
		return fmt.Sprintf("Install failed: %s (%s)\n  Try: Target a host that supports remote MCP transports (e.g. claude, codex, grok, opencode), or choose a local stdio capability.\n", lerr.Message, lerr.Code)
	}
	if lerr.Code == "LPSM-LOCK-DRIFT" {
		return fmt.Sprintf("Install failed: %s (%s)\n  Try: Run 'litespm lock update' to re-synchronize your litespm.lock file.\n", lerr.Message, lerr.Code)
	}
	return fmt.Sprintf("Install failed: %s (%s)\n", lerr.Message, lerr.Code)
}

// searchTermForListingID picks the word to suggest searching for: the last
// segment of a "kind:publisher:name" id.
func searchTermForListingID(id string) string {
	if i := strings.LastIndex(id, ":"); i >= 0 && i+1 < len(id) {
		return id[i+1:]
	}
	return id
}

// printInstallFailure writes installFailureText to w.
func printInstallFailure(w io.Writer, err error) {
	fmt.Fprint(w, installFailureText(err, searchGlyphsUnicode(os.Getenv, runtime.GOOS)))
}
