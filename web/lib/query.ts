// Client-side lexical matching over the fields a listing actually exposes.
//
// Deliberately its own module with no `"use client"` directive and no runtime
// imports beyond the shared format module: `lib/telemetry.ts` re-exports it for
// the search hook, and the build-time Server Components import it directly to
// count what a landing-page topic link will show on `/explore`.
//
// **One matcher, two callers — and now that claim is enforced, not asserted.**
// The build-time count and the runtime search are the same function over the
// same rows: the runtime search asks `querySearchIndex` (a postings index
// emitted from these rows at build time) and
// `scripts/check-search-index.mjs` fails if its row set ever differs from this
// function's over the real dataset. Before that gate, the two paths answered
// differently — the worker used MiniSearch with `prefix: true, fuzzy: 0.2`
// (which returns rows that do not contain the query at all), the fallback used
// substring matching, and the topic counts used substring matching over a
// different field set.
//
// The semantics, stated once:
//
//   * text is tokenized into runs of Unicode letters and digits, lowercased;
//   * a row matches when **every** query token is a prefix of at least one of
//     the row's tokens (`play` matches `playwright`; `sign` does not match
//     `design`);
//   * a query with no tokens (empty, whitespace, punctuation-only) matches
//     every row — the same answer "browse" gets.
//
// Token-prefix is what a search box is expected to do and the only semantics a
// small exact index can reproduce. Substring matching would need an n-gram or
// suffix index many times larger, and it matches `codesign` for `design`,
// which is worse for the reader. Fuzzy matching is deliberately not part of
// this: it returns rows that do not contain the query, and no exact index can
// reproduce it.
//
// No usage, download, install or star data exists in the dataset, so nothing
// here ranks by popularity.

import type { Listing } from "./telemetry";
import { listingText, matchesQueryTokens, tokenizeText } from "./searchFormat.mjs";

/** Client-side lexical search across the fields the catalog actually exposes. */
export function matchesQuery(item: Listing, q: string): boolean {
  return matchesQueryTokens(tokenizeText(listingText(item)), q);
}
