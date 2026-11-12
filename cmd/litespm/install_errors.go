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
			return fmt.Sprintf("%s This listing can't be installed: the catalog has no verified source for it (%s).\n  Try: litespm search <query> --installable\n", mark, lerr.Code)
		}
		return fmt.Sprintf("%s %s can't be installed: the catalog has no verified source for it (%s).\n  Try: litespm search %s --installable\n",
			mark, id, lerr.Code, searchTermForListingID(id))
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
