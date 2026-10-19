// The publisher filter's one rule.
//
// It lives in its own module, with no imports, because two sides have to
// agree about it and a rule that lives in a component cannot be checked:
// the Explore filter, and the count printed beside a publisher's name on the
// Coverage board and in the Publisher control.
//
// ## Why it is exact
//
// The rule is case-folded and exact. A prefix or contains fallback looks
// friendlier — `?publisher=anthropic` finds "Anthropic" — but it breaks the
// one rule this site cannot break: **a count printed next to a name must be
// the count that name's filter returns.**
//
// "Anthropic" shipped 443 entries and "anthropics" shipped 416. A prefix
// match for "Anthropic" returns 861, so the Coverage board would print 443
// and open 861. The same happens for "github" (310 → 324), "servers" (256 →
// 270) and "nvidia" (249 → 251) — four of the board's fifteen rows, each a
// number that is right about one thing and wrong about the thing it names.
//
// A case-folded exact match answers the natural input (`?publisher=anthropic`
// finds "Anthropic") and keeps every published count equal to the filter's
// own result. The Publisher control on Explore offers the names, so a reader
// never has to type one.
//
// The gate `scripts/check-publisher-counts.mjs` holds the two sides together
// over the real dataset.

/**
 * Does this row's publisher match the filter?
 *
 * @param name the row's publisher name
 * @param wanted the name the reader filtered by; empty means "no filter"
 */
export function publisherMatches(
  name: string | null | undefined,
  wanted: string | null | undefined
): boolean {
  const w = String(wanted ?? "").trim().toLowerCase();
  if (w === "") return true;
  return String(name ?? "").trim().toLowerCase() === w;
}
