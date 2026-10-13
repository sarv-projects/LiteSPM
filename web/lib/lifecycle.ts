// Which agent hosts their own vendors have ended.
//
// This lives apart from `hostNotes.ts` for one reason: every surface that has
// to *act* on it is a client component (the landing-page chooser, the agents
// index), and pulling the whole 50-entry prose file into the browser bundle to
// answer a boolean would be a bad trade. The prose about each product stays in
// `hostNotes.ts`; this is the small, filterable half.
//
// Each `notice` is a self-contained statement of what the vendor said, and
// `source` is the page it was read from. Nothing here is our judgement about a
// product's future — when a vendor says the product is finished, we record it
// and stop offering it as a choice.
//
// Adding an entry here removes the agent from the landing-page "What do you
// use?" chooser, from the agent atlas cards, and from the /agents/ index. Its
// detail page stays reachable, so anyone following an old link still lands on a
// page that tells them the truth instead of a 404.
//
// Audited 2026-10-12 across all fifty hosts: these are the only three whose
// own documentation says the product has ended. The remaining four
// (`codebuddy`, `codestudio`, `cortex`, `deepagents`) were unreachable at
// audit time and are therefore *not* cleared — an unread source is not a live
// product, but it is also not evidence of death.

export interface DiscontinuedHost {
  /** What the vendor says, complete enough to stand on its own. */
  notice: string;
  /** The page the notice was read from. */
  source: string;
}

export const DISCONTINUED: Record<string, DiscontinuedHost> = {
  roo: {
    notice:
      "Roo Code's own docs open with an Extension Shutdown banner: the extension was shut down on May 15th. They point readers at ZooCode, a community fork, and at Cline, from where Roo Code originated.",
    source: "https://docs.roocode.com/",
  },
  "iflow-cli": {
    notice:
      "iFlow CLI's README opens by announcing its shutdown on April 17, 2026 (UTC+8), a date that has now passed, and sends readers to the vendor's own farewell post for migration guidance.",
    source: "https://github.com/iflow-ai/iflow-cli",
  },
  rovodev: {
    notice:
      "Atlassian announces that Rovo Dev is reaching end of life as a standalone product, with its capabilities moving into eligible Jira subscriptions.",
    source: "https://www.atlassian.com/software/rovo-dev",
  },
};

/** True when this vendor has ended the product — do not offer it as a choice. */
export function isDiscontinued(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(DISCONTINUED, id);
}

/** The notice for a discontinued host, or null if it is still going. */
export function discontinuedNotice(id: string): DiscontinuedHost | null {
  return DISCONTINUED[id] ?? null;
}
