// The install promise, measured against the committed dataset instead of
// against the site.
//
// Every other spec in this suite compares the site to itself: the host page's
// figure against its `/agents/` row, a badge against its entry page. That is
// how two separate compatibility over-claims survived 98 green tests — the site
// agreed with itself and disagreed with `data/hosts.json` and with
// `lib/availability`:
//
//   - `hostsFor` returned all 50 adapters for every MCP row, including the
//     25,401 remote-only rows whose install the binary refuses on 42 of those
//     adapters (`LPSM-HOST-REMOTE-UNSUPPORTED`), and
//   - it returned every adapter or every skill target for the 42,573
//     discovery-only rows that have no install method at all — while the page
//     directly above the list said "Install unavailable".
//
// Consistency is not truth. This file re-derives the expected answer from the
// committed files the binary reads and measures the rendered page against it,
// so the site can only be wrong in one place at a time.
//
// What it asserts:
//
//   1. an MCP row that reaches its server over a URL lists exactly the hosts
//      whose adapter has a verified remote entry spelling — `remote: true` in
//      `data/hosts.json`. Exact in both directions: a superset promises
//      installs that fail, a subset hides installs that work;
//   2. a row LiteSPM cannot install lists no host at all, and the page says why
//      rather than printing a count of zero;
//   3. a plugin keeps the hosts its publisher declared. That list is the
//      publisher's own data, printed as "Publisher-declared" — it is a fact
//      about the plugin, not a claim about LiteSPM, so the install gate must
//      not silently delete it.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./support/site";
import { gotoSettled } from "./support/site";
import {
  WEB_ROOT,
  catalogRows,
  entryFixture,
  keyOf,
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
 * The first row of its class in plain string order, so the pick is
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
  return row.kind === "mcp" && isRemote(row.transport) && Boolean(row.summary?.trim());
});

const DISCOVERY_MCP = pickRow("an MCP row with no transport", (row) => {
  return row.kind === "mcp" && !isRemote(row.transport) && Boolean(row.summary?.trim());
});

const PLUGIN = pickRow("a plugin with publisher-declared hosts", (row) => {
  return row.kind === "plugin" && (row.compatibleHosts?.length ?? 0) > 0;
});

/** The compatibility section's note: "8 of 79 hosts", or an availability label. */
async function fitNote(page: import("@playwright/test").Page): Promise<string> {
  const note = page.locator("#will-it-work .section-note");
  await expect(note).toBeVisible();
  return (await note.textContent())?.trim() ?? "";
}

/** The "N of M" pair, from a note that is a count. */
function parsePair(text: string): { listed: number; universe: number } {
  const numbers = text.match(/\d[\d,]*/g) ?? [];
  if (numbers.length !== 2) {
    throw new Error(`expected "N of M hosts", got ${JSON.stringify(text)}`);
  }
  return {
    listed: Number.parseInt(numbers[0].replace(/,/g, ""), 10),
    universe: Number.parseInt(numbers[1].replace(/,/g, ""), 10),
  };
}

test("the fixture rows are the classes the catalog actually has", () => {
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
  expect(PLUGIN.row.kind).toBe("plugin");
  expect(PLUGIN.row.compatibleHosts?.length ?? 0).toBeGreaterThan(0);
});

test("a remote MCP entry lists exactly the hosts that can reach it", async ({ page }) => {
  await gotoSettled(page, REMOTE_MCP.href);

  const { listed } = parsePair(await fitNote(page));
  expect(
    listed,
    `${REMOTE_MCP.key} is reached over ${REMOTE_MCP.row.transport}, so it can only be listed for the ${REMOTE_HOSTS.length} hosts with a verified remote entry spelling (${REMOTE_HOSTS.map((h) => h.id).join(", ")})`
  ).toBe(REMOTE_HOSTS.length);

  // The same figure in words, in the plain summary above the tabs. Both render
  // one measurement; a page that disagrees with itself is the defect this
  // asserts against.
  const fact = page.locator("dt", { hasText: "Which agents it works with" });
  await expect(fact).toBeVisible();
  const stated = await fact.locator("xpath=following-sibling::dd[1]").textContent();
  expect(stated).toContain(`${REMOTE_HOSTS.length} of`);
});

test("a row LiteSPM cannot install lists no host at all", async ({ page }) => {
  await gotoSettled(page, DISCOVERY_MCP.href);

  const note = await fitNote(page);
  expect(
    /^\d/.test(note),
    `${DISCOVERY_MCP.key} publishes no install method, so it must not print a host count — the note reads ${JSON.stringify(note)}`
  ).toBe(false);

  // The reason, and not a count of zero. The page above it already says
  // "Install unavailable", so the two statements must agree.
  await expect(page.locator("#will-it-work")).toContainText("Nothing to install");

  const fact = page.locator("dt", { hasText: "Which agents it works with" });
  await expect(fact.locator("xpath=following-sibling::dd[1]")).toContainText(
    "Nothing to install"
  );
});

test("a plugin keeps the hosts its publisher declared", async ({ page }) => {
  await gotoSettled(page, PLUGIN.href);

  const declared = PLUGIN.row.compatibleHosts?.length ?? 0;
  const { listed } = parsePair(await fitNote(page));
  expect(
    listed,
    `${PLUGIN.key} ships a publisher-declared host list, which is the publisher's data and not ours to drop`
  ).toBe(declared);
});

test("every entry page counts its hosts against one denominator", async ({ page }) => {
  await gotoSettled(page, REMOTE_MCP.href);
  const remote = parsePair(await fitNote(page));

  await gotoSettled(page, PLUGIN.href);
  const plugin = parsePair(await fitNote(page));

  expect(
    plugin.universe,
    `${PLUGIN.key} and ${REMOTE_MCP.key} must divide by the same host universe`
  ).toBe(remote.universe);
});
