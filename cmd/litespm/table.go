package main

import (
	"fmt"
	"io"
	"strings"
	"unicode/utf8"
)

// writeTable prints a header, a rule and rows with every column but the last
// padded to the widest cell in that column (measured in runes), so a long host
// id or display name widens its column instead of shoving the rest sideways.
// indent is written before every line; gap is the space between columns.
func writeTable(w io.Writer, indent string, header []string, rows [][]string) {
	writeTableOpt(w, indent, header, rows, true)
}

// writeTableNoRule is writeTable without the dashed rule under the header.
func writeTableNoRule(w io.Writer, indent string, header []string, rows [][]string) {
	writeTableOpt(w, indent, header, rows, false)
}

func writeTableOpt(w io.Writer, indent string, header []string, rows [][]string, rule bool) {
	widths := make([]int, len(header))
	for i, h := range header {
		widths[i] = utf8.RuneCountInString(h)
	}
	for _, r := range rows {
		for i := 0; i < len(r) && i < len(widths); i++ {
			if n := utf8.RuneCountInString(r[i]); n > widths[i] {
				widths[i] = n
			}
		}
	}
	line := func(cells []string) {
		var b strings.Builder
		b.WriteString(indent)
		for i, c := range cells {
			if i == len(cells)-1 {
				b.WriteString(c)
				break
			}
			b.WriteString(c)
			if pad := widths[i] - utf8.RuneCountInString(c); pad > 0 {
				b.WriteString(strings.Repeat(" ", pad))
			}
			b.WriteString("  ")
		}
		fmt.Fprintln(w, strings.TrimRight(b.String(), " "))
	}
	line(header)
	if rule {
		total := 0
		for i, wd := range widths {
			total += wd
			if i < len(widths)-1 {
				total += 2
			}
		}
		// The last column is unpadded; give the rule a sensible reach.
		if last := widths[len(widths)-1]; last > 60 {
			total -= last - 60
		}
		fmt.Fprintln(w, indent+strings.Repeat("-", total))
	}
	for _, r := range rows {
		line(r)
	}
}
