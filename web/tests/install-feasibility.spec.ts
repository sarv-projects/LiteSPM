// The install promise, measured against the committed dataset instead of
// against the site.
//
// Every other spec in this suite compares the site to itself: the host page's
// figure against its `/agents/` row, a badge against its entry page. That is
// how a compatibility claim covering the 25,401 remote-only MCP rows survived
// 98 green tests — the site agreed with itself and disagreed with
// `data/hosts.json`, whose 42 rows without a `remote` spelling are exactly the
// hosts where the binary refuses a remote install. Consistency is not truth.
//
// This file re-derives the expected answer from the same committed files the
// binary reads and measures the rendered page against it, so the site can only
// be wrong in one place at a time.
//
// What it asserts:
//
//   1. an MCP row that reaches its server over a URL lists exactly the hosts
//      whose adapter has a verified remote entry spelling — `remote: true` in
//      `data/hosts.json` — because that is the set `litespm install` will not
//      refuse. The gate has to be exact in both directions: a superset promises
//      installs that fail, a subset hides installs that work;
//   2. the denominator beside that figure ("N of M hosts") is one number for
//      the whole catalog, not one per entry.
//
// The assertions a reader would expect next — that a row LiteSPM cannot
// install lists no host at all — are pending the `hostsFor` change that makes
// the compatibility list agree with `lib/availability`. Today a discovery-only
// row prints "50 of 79 agent hosts in this catalog" on the same page as
// "Install unavailable", and this file would fail if it asserted otherwise.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./support/site";
import { gotoSettled } from "./support/site";
import {
  WEB_ROOT,
  catalogRows,
  entryFixture,
  keyOf,
  preRenderedKeys,
  type EntryFixture,
  type Listing,
} from "./support/catalog";

interface HostRow {
  id: string;
  name: string;
  /** Present and true only for adapters with a verified remote entry spelling. */
  remote?: boolean;
}

const HOST_ROWS: HostRow[] = JSON.parse(
  readFileSync(join(WEB_ROOT, "data", "hosts.json"), "utf8")
) as HostRow[];

const REMOTE_HOSTS = HOST_ROWS.filter((host) => host.remote === true);

/**
 * The rule `lib/hosts.ts` applies, restated here rather than imported: a row
 * that states no transport has no launch line either, so it is not remote.
 */
function isRemote(transport?: string | null): boolean {
  return Boolean(transport) && transport !== "stdio";
}

/**
 * The first MCP row of its class in plain string order, so the pick is
 * deterministic and the same entry is under test on every run.
 */
function pickRow(what: string, predicate: (row: Listing) => boolean): EntryFixture {
  const sorted = catalogRows()
    .filter(predicate)
    .sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  const row = sorted[0];
  if (!row) throw new Error(`no entry in data/catalog.json is ${what}`);
  return entryFixture(row);
}

const REMOTE_MCP = pickRow("an MCP row with a remote transport", (row) => {
  return row.kind === "mcp" && isRemote(row.transport);
});

const DISCOVERY_MCP = pickRow("an MCP row with no transport", (row) => {
  return row.kind === "mcp" && !isRemote(row.transport) && Boolean(row.summary?.trim());
});

/** The first integer in "8 of 79 hosts" — `parseCount` would read 8,79 as 879. */
function firstInt(text: string | null, what: string): number {
  const match = /(\d[\d,]*)/.exec(text ?? "");
  if (!match) throw new Error(`no number in ${what}: ${JSON.stringify(text)}`);
  return Number.parseInt(match[1].replace(/,/g, ""), 10);
}

/** The "N of M" the compatibility section states, and the M. */
async function hostFigures(
  page: import("@playwright/test").Page
): Promise<{ listed: number; universe: number }> {
  const note = page.locator("#will-it-work .section-note");
  await expect(note).toBeVisible();
  const text = await note.textContent();
  const numbers = (text ?? "").match(/\d[\d,]*/g) ?? [];
  if (numbers.length !== 2) {
    throw new Error(`expected "N of M hosts", got ${JSON.stringify(text)}`);
  }
  return {
    listed: Number.parseInt(numbers[0].replace(/,/g, ""), 10),
    universe: Number.parseInt(numbers[1].replace(/,/g, ""), 10),
  };
}

test("the fixture rows are the two classes the catalog actually has", () => {
  // Guards the picks above: if the catalog ever gains stdio rows, or loses its
  // remote ones, this suite would keep passing while covering nothing.
  expect(
    REMOTE_HOSTS.length,
    "data/hosts.json must mark some hosts remote and leave others without it, or this file cannot tell the two classes apart"
  ).toBeGreaterThan(0);
  expect(REMOTE_HOSTS.length).toBeLessThan(HOST_ROWS.length);

  expect(isRemote(REMOTE_MCP.row.transport)).toBe(true);
  expect(isRemote(DISCOVERY_MCP.row.transport)).toBe(false);
  expect(REMOTE_MCP.row.kind).toBe("mcp");
  expect(DISCOVERY_MCP.row.kind).toBe("mcp");
});

test("a remote MCP entry lists exactly the hosts that can reach it", async ({ page }) => {
  await gotoSettled(page, REMOTE_MCP.href);

  const figures = await hostFigures(page);
  expect(
    figures.listed,
    `${REMOTE_MCP.key} is reached over ${REMOTE_MCP.row.transport}, so it can only be listed for the ${REMOTE_HOSTS.length} hosts with a verified remote entry spelling (${REMOTE_HOSTS.map((h) => h.id).join(", ")})`
  ).toBe(REMOTE_HOSTS.length);

  // The same figure in words, in the plain summary above the tabs. Both render
  // one measurement; a page that disagrees with itself is the defect this
  // asserts against.
  const fact = page.locator("dt", { hasText: "Which agents it works with" });
  await expect(fact).toBeVisible();
  const stated = firstInt(
    await fact.locator("xpath=following-sibling::dd[1]").textContent(),
    "the plain summary's compatibility fact"
  );
  expect(stated).toBe(figures.listed);
});

test("every entry page counts its hosts against one denominator", async ({ page }) => {
  await gotoSettled(page, REMOTE_MCP.href);
  const remote = await hostFigures(page);

  await gotoSettled(page, DISCOVERY_MCP.href);
  const discovery = await hostFigures(page);

  expect(
    discovery.universe,
    `${DISCOVERY_MCP.key} and ${REMOTE_MCP.key} must divide by the same host universe`
  ).toBe(remote.universe);
});
