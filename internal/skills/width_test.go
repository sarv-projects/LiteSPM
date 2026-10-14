package skills

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// The prompt's column padding counted bytes, so every non-Latin skill name
// shifted the columns to its right. These tests pin cell measurement, and the
// deliberate approximations in it, so a regression back to len()-style
// padding fails loudly.

func TestDisplayWidth(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want int
	}{
		{name: "empty string", in: "", want: 0},
		{name: "plain ASCII", in: "skill", want: 5},
		{name: "emoji plus ASCII text", in: "🎉 deploy", want: 9}, // 2 + 1 + 6
		{name: "CJK is two cells per character", in: "日本語", want: 6},
		{name: "CJK skill name", in: "文档检索", want: 8},
		{name: "mixed CJK and ASCII", in: "文档检索 docs", want: 13}, // 8 + 1 + 4
		{name: "Hangul syllables", in: "한글", want: 4},
		{name: "fullwidth forms", in: "ＡＢ", want: 4},
		{name: "common emoji", in: "🎉", want: 2},
		{
			name: "ANSI colour escapes occupy no cells",
			in:   "\x1b[31mred\x1b[0m text",
			want: 8, // "red text" — the CSI bytes must not count
		},
		{
			name: "cursor-movement escapes occupy no cells",
			in:   "\x1b[2K\r日本語",
			want: 6,
		},
		{name: "combining marks alone", in: "\u0300\u036f", want: 0},
		{name: "combining mark over a letter", in: "e\u0301", want: 1},
		{name: "variation selector alone", in: "\ufe0f", want: 0},
		{name: "skin-tone modifier adds nothing", in: "👍🏽", want: 2},
		{name: "controls count zero", in: "a\tb\nc", want: 3},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := DisplayWidth(tc.in); got != tc.want {
				t.Errorf("DisplayWidth(%q) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}

	// ZWJ family emoji: an ESTIMATE, not a measurement.
	//
	// 👨‍👩‍👧 is man + ZWJ + woman + ZWJ + girl. A conforming terminal draws the
	// whole cluster in 2 cells; this implementation has no grapheme clustering,
	// so it sums the visible parts (2+2+2) and counts the two joins as 0 —
	// yielding 6. The number is deliberately honest about being wrong for
	// ZWJ sequences rather than pretending to cluster them.
	const family = "👨‍👩‍👧"
	if got := DisplayWidth(family); got != 6 {
		t.Errorf("DisplayWidth(ZWJ family) = %d, want 6 — an ESTIMATE: "+
			"terminals draw the whole cluster in 2 cells; we sum the parts "+
			"minus the joins because we do not cluster", got)
	}
}

func TestPadRight(t *testing.T) {
	// Short ASCII is padded to the cell budget.
	if got, want := PadRight("abc", 6), "abc   "; got != want {
		t.Errorf("PadRight(%q, 6) = %q, want %q", "abc", got, want)
	}
	if got := DisplayWidth(PadRight("abc", 12)); got != 12 {
		t.Errorf("padded width = %d, want 12", got)
	}

	// Exactly-wide input is unchanged, and already-wider input is returned
	// unchanged rather than truncated.
	if got := PadRight("exact", 5); got != "exact" {
		t.Errorf("PadRight(exact, 5) = %q, want unchanged", got)
	}
	const wide = "already far too wide"
	if got := PadRight(wide, 3); got != wide {
		t.Errorf("PadRight(wider-than-budget) = %q, want it unchanged (no truncation)", got)
	}

	// CJK pads by CELLS, not bytes: 日本語 is 9 bytes but 6 cells, so an
	// 8-cell budget gets 2 spaces. %-8s would pad by bytes and add none.
	if got, want := PadRight("日本語", 8), "日本語  "; got != want {
		t.Errorf("PadRight(%q, 8) = %q, want %q", "日本語", got, want)
	}
	if got := DisplayWidth(PadRight("日本語", 8)); got != 8 {
		t.Errorf("padded width = %d, want 8 cells", got)
	}

	// Padding an empty column still fills the budget.
	if got, want := PadRight("", 4), "    "; got != want {
		t.Errorf("PadRight(\"\", 4) = %q, want %q", got, want)
	}
}

func TestTruncateToWidth(t *testing.T) {
	// A string that fits is returned whole, with no ellipsis.
	if got := TruncateToWidth("short", 10); got != "short" {
		t.Errorf("TruncateToWidth(short, 10) = %q, want the whole string back", got)
	}
	// Exactly-fitting CJK also comes back whole — no ellipsis.
	if got := TruncateToWidth("日本語", 6); got != "日本語" {
		t.Errorf("TruncateToWidth(日本語, 6) = %q, want the whole string back", got)
	}

	// Cutting a CJK string at every possible budget must never produce
	// invalid UTF-8 and never exceed the cell budget. The old `desc[:77]`
	// byte slice did exactly this: it split a multi-byte character in half.
	const cjk = "日本語の説明テキスト" // 10 runes, 30 bytes, 20 cells
	for cells := 1; cells < 20; cells++ {
		got := TruncateToWidth(cjk, cells)
		if !utf8.ValidString(got) {
			t.Fatalf("TruncateToWidth(%q, %d) = %q: invalid UTF-8", cjk, cells, got)
		}
		if w := DisplayWidth(got); w > cells {
			t.Errorf("TruncateToWidth(%q, %d) = %q: width %d exceeds budget %d", cjk, cells, got, w, cells)
		}
		if got != cjk && !strings.HasSuffix(got, "…") {
			t.Errorf("TruncateToWidth(%q, %d) = %q: a cut must be marked with an ellipsis", cjk, cells, got)
		}
	}

	// The ellipsis is accounted for: 1 kept cell + 1 ellipsis cell = 2, and
	// the remainder of the CJK string is gone.
	if got := TruncateToWidth("日本語", 5); got != "日本…" {
		t.Errorf("TruncateToWidth(日本語, 5) = %q, want %q", got, "日本…")
	}

	// Emoji cuts on a rune boundary too, and stays within budget.
	emoji := TruncateToWidth("🎉🎉🎉", 3)
	if !utf8.ValidString(emoji) {
		t.Fatalf("TruncateToWidth(emoji) produced invalid UTF-8: %q", emoji)
	}
	if w := DisplayWidth(emoji); w > 3 {
		t.Errorf("emoji truncation width = %d, want <= 3 (%q)", w, emoji)
	}

	// A budget too small even for the ellipsis yields empty, not garbage.
	if got := TruncateToWidth("anything", 0); got != "" {
		t.Errorf("TruncateToWidth(_, 0) = %q, want empty", got)
	}

	// Escapes are stripped before measuring, so a colour-coded description
	// is cut to its VISIBLE width.
	colored := "\x1b[31m日本語の色付き説明\x1b[0m"
	got := TruncateToWidth(colored, 6)
	if strings.ContainsRune(got, 0x1b) {
		t.Errorf("truncated result still carries an escape: %q", got)
	}
	if w := DisplayWidth(got); w > 6 {
		t.Errorf("colored truncation width = %d, want <= 6 (%q)", w, got)
	}
}
