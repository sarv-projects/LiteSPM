// Try-it prompts: what to paste into your agent once an entry is installed.
//
// The dataset carries no tool list for any row — `tools`, `effects` and
// `readme` are present on 0 of 69,376 rows (measured 2026-10-15) — so an
// example cannot be derived from what the entry actually exposes. What the
// dataset does carry is the publisher's own one-line description, and that is
// the only thing an example may be built from here:
//
//   * **The example prompt** quotes the publisher's first sentence, unchanged,
//     and only when that sentence opens with an imperative verb from the list
//     below. "Quote and build unsigned buy/sell transactions…" becomes "Use
//     $$AI on HyperEVM to quote and build unsigned buy/sell transactions…".
//     A description that opens with a noun phrase ("NIST Randomness Beacon
//     MCP"), a proper name, or a truncation marker supports no example, and
//     none is invented — the UI says so instead.
//   * **The first-look prompt** works for any installed entry and asks the
//     agent to enumerate what it now has. It demonstrates nothing on its own,
//     but it cannot fail and it is the honest first step when no example
//     exists.
//
// The cap on inventing: the example is the publisher's claim, not this site's.
// The UI must always print that beside the prompt — this site does not run what
// it lists, and the verb gate exists so the sentence is a capability the
// publisher stated, not one assembled from parts.

import type { Listing } from "./telemetry";
import { availabilityOf } from "./availability";

export interface TryPrompt {
  id: "example" | "first-look";
  /** Short heading for the prompt card. */
  label: string;
  /** The exact text the reader copies. */
  prompt: string;
  /** Where this came from, printed beside the card. Never a claim about tests. */
  basis: string;
}

/**
 * Imperative verbs an example may be built from. Deliberately an allow-list:
 * a word outside it (a noun, a proper name, a third-person verb like "Checks")
 * yields no prompt rather than a sentence that misreads when pasted. Curated
 * against the first word of every candidate summary in the 2026-10-11 snapshot.
 */
const IMPERATIVE_VERBS = new Set([
  "access", "add", "analyze", "answer", "assess", "audit", "automate", "book", "browse",
  "build", "buy", "calculate", "capture", "check", "choose", "classify", "compare",
  "compose", "compute", "connect", "control", "convert", "count", "crawl", "create",
  "decode", "deploy", "design", "detect", "discover", "draft", "drive", "edit", "email",
  "enable", "evaluate", "explore", "extract", "fetch", "find", "forecast", "generate",
  "get", "give", "greet", "hire", "host", "import", "inspect", "integrate", "launch",
  "let", "list", "log", "look", "make", "manage", "map", "market", "match", "merge",
  "monetize", "monitor", "normalize", "operate", "optimize", "order", "organize",
  "parse", "paste", "pay", "plan", "prepare", "price", "provide", "publish", "put",
  "query", "quote", "rank", "read", "record", "register", "render", "research",
  "resolve", "review", "run", "save", "scan", "schedule", "score", "scrape", "screen",
  "search", "see", "select", "send", "set", "share", "show", "split", "start", "stop",
  "submit", "summarize", "sync", "talk", "test", "track", "transcribe", "translate",
  "turn", "update", "use", "validate", "verify", "visualize", "watch", "write",
]);

/** Summaries that are not a statement of capability: truncations, placeholders,
 *  and registry junk rows ("GitHub release tag URL shape, path discarded"). */
const NOT_A_CAPABILITY =
  /…|\.\.\.|value discarded|WiP|TBD|TODO|placeholder|XXX|\bundefined\b|^[^A-Za-z]*$/i;

/** The publisher's first sentence, normalised to one line, without its full
 *  stop. Sentence one only: the rest may be caveats or contact details. */
function firstSentence(text: string): string {
  const line = text.trim().replace(/\s+/g, " ");
  const match = line.match(/^(.+?[.!?])(?:\s|$)/);
  return (match ? match[1] : line).replace(/[.!?]+$/, "").trim();
}

function firstWord(sentence: string): string {
  return sentence.split(/\s+/)[0]?.replace(/[^A-Za-z']/g, "").toLowerCase() ?? "";
}

/**
 * One example, or null. Null is a first-class answer: it means this record
 * does not describe a specific task in its own words, so the page shows no
 * example rather than one this site assembled.
 */
export function examplePrompt(item: Listing): TryPrompt | null {
  const summary = item.summary?.trim();
  if (!summary) return null;

  const sentence = firstSentence(summary);
  if (sentence.length < 15 || sentence.length > 160) return null;
  if (NOT_A_CAPABILITY.test(sentence)) return null;
  if (!IMPERATIVE_VERBS.has(firstWord(sentence))) return null;

  const lower = sentence.charAt(0).toLowerCase() + sentence.slice(1);
  return {
    id: "example",
    label: "An example to try",
    prompt: `Use ${item.name} to ${lower}.`,
    basis:
      "From the publisher's own description of this entry. LiteSPM hasn't run it.",
  };
}

/** The prompt that works for any installed entry, regardless of description. */
export function firstLookPrompt(item: Listing): TryPrompt | null {
  if (item.kind === "mcp") {
    return {
      id: "first-look",
      label: "First look",
      prompt: `List the tools ${item.name} gives you, and what each one is for.`,
      basis:
        "Works for any installed MCP server — it asks your agent what it now has.",
    };
  }
  if (item.kind === "skill") {
    return {
      id: "first-look",
      label: "First look",
      prompt: `Load the ${item.name} skill and tell me what it covers.`,
      basis:
        "Works for any installed skill — it asks your agent to describe what it loaded.",
    };
  }
  return null;
}

/**
 * The small set of prompts for one entry. Empty when the entry cannot be
 * installed (there is nothing to try), so callers never need to special-case
 * the kind — `availabilityOf` is the same gate the install panel uses.
 */
export function tryPrompts(item: Listing): TryPrompt[] {
  if (!availabilityOf(item).installable) return [];
  return [examplePrompt(item), firstLookPrompt(item)].filter(
    (p): p is TryPrompt => p !== null
  );
}
