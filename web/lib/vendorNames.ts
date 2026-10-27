// The name each vendor uses for its own product, where LiteSPM's registry row
// spells it differently.
//
// The registry (`data/hosts.json`) is generated from the config adapters, and a
// row there exists to describe plumbing — which file to write, under which key.
// That makes it a poor place to get a product's name from, and research over all
// current hosts found rows whose registry string is not what the vendor writes:
//
//   registry                          vendor's own documentation
//   "Grok Build (xAI Dev Tool)"   →   Grok Build
//   "Pi (Terminal Agent)"         →   Pi
//   "GitHub Copilot CLI"          →   GitHub Copilot
//   "Augment"                     →   Auggie CLI
//   "Kimchi"                      →   Kimchi Coding
//   "Mux (Xum)"                   →   Xum  (Mux is the retired pre-rename name)
//   "Cortex Code"                 →   CoCo CLI  (Snowflake's own naming)
//   "Deep Agents"                 →   Deep Agents Code
//   "Code Studio"                 →   Syncfusion MCP Server
//
// This lives in its own module rather than in `hostNotes.ts` because the agents
// index is a client component and needs the same answer; pulling fifty entries
// of prose into the browser bundle to get nine strings would be a bad trade.
//
// Display only. Explore's host filter and the catalog's own host strings are
// keyed on the *registry* spelling, so a surface that shows a vendor name must
// still link and count with the registry string.

export const VENDOR_NAMES: Record<string, string> = {
  grok: "Grok CLI",
  "grok-build": "Grok Build",
  pi: "Pi",
  "pi-agent": "Pi Agent",
  "github-copilot": "GitHub Copilot",
  augment: "Auggie CLI",
  kimchi: "Kimchi Coding",
  mux: "Xum",
  cortex: "CoCo CLI",
  deepagents: "Deep Agents Code",
};

/**
 * What to print for this host: the vendor's own name when we have one, and
 * `fallback` (the registry or catalog string) otherwise.
 */
export function vendorName(id: string, fallback: string): string {
  return VENDOR_NAMES[id] ?? fallback;
}
