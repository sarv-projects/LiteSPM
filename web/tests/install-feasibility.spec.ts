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
//
// The second half of this file asserts the module that projects the CLI's
// gates onto the site (`lib/installFeasibility.ts`) against the same
// committed files the binary reads:
//
//   4. the eight adapters with a verified remote (URL) entry spelling are
//      exactly the hosts the module calls `supported` for a remote MCP row,
//      and the 42 it says nothing about are never called `supported`;
//   5. the transport the entry publishes decides the host set — only Claude
//      Code, Cline and Cursor document `sse`, and the binary refuses the
//      other five by name (LPSM-HOST-REMOTE-UNSUPPORTED);
//   6. a local MCP row reaches every adapter, and a project-scope install is
//      refused for the seven adapters that document only a user-scope config;
//   7. a skill is copied into a skills directory: user scope refuses the two
//      targets that document no user-level directory, project scope takes
//      them;
//   8. a plugin is `unsupported` and a discovery-only row is
//      `discovery-only`, never `supported`;
//   9. the counts the site prints (the availability chips) equal the counts
//      the module computes, row for row and in total.

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
import { availabilityCounts, availabilityOf } from "../lib/availability";
import { feasibilityCounts, feasibilityFor } from "../lib/installFeasibility";
import type { Listing as CatalogListing } from "../lib/telemetry";

interface HostRow {
  id: string;
  name: string;
  /** Present and true only for adapters with a verified remote entry spelling. */
  remote?: boolean;
  /** True when `install --scope project` can write this host. */
  projectScope?: boolean;
  /** True when the host documents only a repo-local config file. */
  projectOnly?: boolean;
}

interface SkillTargetRow {
  id: string;
  displayName: string;
  universal?: boolean;
  hasGlobal: boolean;
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

/* ------------------------------------------------------------------ *
 * The module: the site's projection of the CLI's install gates
 * ------------------------------------------------------------------ */

const SKILL_TARGET_ROWS: SkillTargetRow[] = JSON.parse(
  readFileSync(join(WEB_ROOT, "data", "skill-targets.json"), "utf8")
) as SkillTargetRow[];

/** A synthetic row for the module's gates, with every required field. */
function moduleRow(
  overrides: Partial<CatalogListing> & Pick<CatalogListing, "kind">
): CatalogListing {
  return {
    id: "mcp:test:demo",
    name: "Demo",
    slug: "demo",
    summary: "A synthetic row for the module's install gates.",
    category: "Demo",
    publisher: { name: "Test", verified: true },
    stars: null,
    version: "1.0.0",
    ...overrides,
  } as CatalogListing;
}

/** A remote MCP row: the shape every installable MCP row in this release has. */
const REMOTE_HTTP_ROW = moduleRow({
  id: "mcp:test:remote-http",
  kind: "mcp",
  transport: "streamable-http",
  url: "https://example.com/mcp",
  installability: "metadata_verified",
});

/** The same row on the `sse` transport. */
const REMOTE_SSE_ROW = moduleRow({
  id: "mcp:test:remote-sse",
  kind: "mcp",
  transport: "sse",
  url: "https://example.com/sse",
  installability: "metadata_verified",
});

/** A local MCP row: a launch line, no endpoint. */
const LOCAL_MCP_ROW = moduleRow({
  id: "mcp:test:local",
  kind: "mcp",
  transport: "stdio",
  installability: "metadata_verified",
});

/** A skill: files copied through the skills ledger. */
const SKILL_ROW = moduleRow({
  id: "skill:test:demo",
  kind: "skill",
  installability: "metadata_verified",
  skillSource: "https://github.com/example/skills",
});

test("the registry's remote capability is exactly the module's remote verdict", () => {
  const capable = HOST_ROWS.filter((host) => host.remote === true);
  const silent = HOST_ROWS.filter((host) => host.remote !== true);

  expect(capable.length, "the Go registry ships eight remote entry spellings").toBe(8);
  expect(silent.length, "and forty-two hosts it says nothing about").toBe(42);

  const verdict = feasibilityFor(REMOTE_HTTP_ROW);
  expect(
    [...verdict.supportedHostIds].sort(),
    "the module's supported set is exactly the hosts with a verified remote entry spelling"
  ).toEqual(capable.map((host) => host.id).sort());

  for (const host of capable) {
    expect(
      feasibilityFor(REMOTE_HTTP_ROW, host.id).state,
      `${host.id} has a verified remote entry spelling, so a remote row is supported there`
    ).toBe("supported");
  }
  for (const host of silent) {
    expect(
      feasibilityFor(REMOTE_HTTP_ROW, host.id).state,
      `${host.id} records no remote capability, so it must never be claimed as supported`
    ).not.toBe("supported");
  }
});

test("a remote MCP row is supported for a capable host and refused for an incapable one", () => {
  const capable = feasibilityFor(REMOTE_HTTP_ROW, "claude-code");
  expect(capable.state).toBe("supported");
  expect(capable.mode).toBe("mcp-remote");
  expect(capable.supportedHostIds).toContain("claude-code");
  expect(
    capable.limitations,
    "a supported verdict must not promise the publisher's runtime works"
  ).toContain("the publisher's runtime is not tested by LiteSPM");

  const incapable = HOST_ROWS.find((host) => host.remote !== true);
  expect(incapable, "the registry has hosts without a remote spelling").toBeTruthy();
  const refused = feasibilityFor(REMOTE_HTTP_ROW, incapable!.id);
  expect(refused.state).not.toBe("supported");
  expect(
    refused.reasons.join(" "),
    "a refusal or an open question must say why"
  ).not.toBe("");
});

test("the transport the entry publishes decides the host set", () => {
  // The registry records that only Claude Code, Cline and Cursor document the
  // sse transport for a URL entry; the binary refuses the other five by name
  // (LPSM-HOST-REMOTE-UNSUPPORTED).
  expect([...feasibilityFor(REMOTE_SSE_ROW).supportedHostIds].sort()).toEqual([
    "claude-code",
    "cline",
    "cursor",
  ]);
  expect(feasibilityFor(REMOTE_SSE_ROW, "opencode").state).toBe("unsupported");
  expect(feasibilityFor(REMOTE_SSE_ROW, "claude-code").state).toBe("supported");
});

test("a local MCP row reaches every adapter, and project scope refuses the user-scope-only ones", () => {
  const local = feasibilityFor(LOCAL_MCP_ROW);
  expect(local.state).toBe("supported");
  expect(local.mode).toBe("mcp-local");
  expect(local.supportedHostIds.length).toBe(HOST_ROWS.length);

  const userScopeOnly = HOST_ROWS.filter((host) => !host.projectScope);
  expect(userScopeOnly.length, "seven adapters document only a user-scope config").toBe(7);
  for (const host of userScopeOnly) {
    expect(
      feasibilityFor(LOCAL_MCP_ROW, host.id, "project").state,
      `${host.id} documents no project config, so a project-scope install is refused there`
    ).toBe("unsupported");
  }

  // The three agents that document only a repo-local config: the install
  // lands inside the project it is run from, so it needs setup first.
  const repoLocalOnly = HOST_ROWS.filter((host) => host.projectOnly);
  expect(repoLocalOnly.length).toBe(3);
  for (const host of repoLocalOnly) {
    expect(
      feasibilityFor(LOCAL_MCP_ROW, host.id, "user").state,
      `${host.id} has no user-scope config, so the install needs a project to land in`
    ).toBe("requires-setup");
  }
});

test("a skill needs a skills directory, and the scope decides whether the target has one", () => {
  const skill = feasibilityFor(SKILL_ROW);
  expect(skill.state).toBe("supported");
  expect(skill.mode).toBe("skill");

  const withoutGlobal = SKILL_TARGET_ROWS.filter((target) => !target.hasGlobal).map((t) => t.id);
  expect(withoutGlobal.sort(), "two skill targets document no user-level directory").toEqual([
    "eve",
    "promptscript",
  ]);
  for (const id of withoutGlobal) {
    expect(
      feasibilityFor(SKILL_ROW, id, "user").state,
      `${id} documents no user-level skills directory, so a user-scope install is refused there`
    ).toBe("unsupported");
    expect(
      feasibilityFor(SKILL_ROW, id, "project").state,
      `${id} does document a project skills directory, so a project-scope install works`
    ).toBe("supported");
  }
});

test("a plugin with no fetchable source is unsupported, and a discovery-only row is discovery-only", () => {
  // The plugin install path exists (2026-10-19): a plugin that publishes a
  // PINNED git tree installs - the tree is fetched at that commit and the MCP
  // servers the plugin's own manifest declares are registered in the host. A
  // plugin with no fetchable source is refused, and the reason says which.
  const plugin = feasibilityFor(PLUGIN.row as unknown as CatalogListing);
  expect(plugin.state).toBe("unsupported");
  expect(plugin.mode).toBe("plugin");
  expect(plugin.reasons.length, "the refusal names the reason").toBeGreaterThan(0);
  expect(plugin.supportedHostIds, "a plugin LiteSPM cannot fetch is installable nowhere").toEqual([]);

  // The pinned plugin IS installable, and the hosts that can take a server
  // entry are named.
  const pinned = feasibilityFor(
    {
      ...(PLUGIN.row as unknown as CatalogListing),
      artifact: {
        type: "git-tree",
        repo: "https://github.com/example/plugins.git",
        path: "plugins/demo",
        ref: "v1.0.0",
        sha: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        pinned: true,
      },
    },
    undefined
  );
  expect(pinned.state, "a pinned plugin installs").toBe("supported");
  expect(pinned.supportedHostIds.length, "the hosts that can take a server entry are named").toBeGreaterThan(0);

  const discovery = feasibilityFor(DISCOVERY_MCP.row as unknown as CatalogListing);
  expect(discovery.state).toBe("discovery-only");
  expect(discovery.reasons).toContain("the publisher published no launch line");
  expect(discovery.supportedHostIds).toEqual([]);
});

test("the counts the site prints equal the counts the module computes", () => {
  const rows = catalogRows() as unknown as CatalogListing[];
  const printed = availabilityCounts(rows);
  const computed = feasibilityCounts(rows);

  // The three installable buckets: remote MCP rows, skills, and the plugins
  // that publish a pinned git tree. `printed.plugin` is that third bucket, not
  // a fourth state — `availabilityOf` classifies a plugin by whether the
  // installer can fetch it.
  expect(
    printed.remote + printed.source + printed.plugin,
    "the site prints 26,555 installable rows"
  ).toBe(26555);
  expect(printed.plugin, "390 of them are plugins with a pinned source").toBe(390);
  expect(printed.discovery, "and 42,573 discovery-only rows").toBe(42573);
  expect(printed.unsupported, "and 248 plugins it cannot fetch a pinned source for").toBe(248);

  expect(computed.supported).toBe(printed.remote + printed.source + printed.plugin);
  expect(computed["discovery-only"]).toBe(printed.discovery);
  expect(computed.unsupported).toBe(printed.unsupported);
  expect(computed.unknown, "no row in this release leaves the host axis open").toBe(0);
  expect(computed["requires-setup"], "a setup step is never a row-level fact").toBe(0);
  expect(
    Object.values(computed).reduce((sum, value) => sum + value, 0),
    "every row is counted exactly once"
  ).toBe(rows.length);
});

test("the module never contradicts the predicate the site already publishes", () => {
  // Row for row: a row the site calls installable is `supported`, a row it
  // calls discovery-only is `discovery-only`, and a plugin is `unsupported`.
  // The host axis may narrow where an entry lands; it may not change whether
  // it can be installed at all.
  const mismatches: string[] = [];
  for (const row of catalogRows() as unknown as CatalogListing[]) {
    const verdict = feasibilityFor(row);
    // The site's published predicate is `availabilityOf` — the badge and the
    // chip on every row — and the three availability states map one to one:
    // remote/source/plugin install, discovery-only is listed and not
    // installable, unsupported is refused for a reason the row itself carries
    // (a plugin with no fetchable source). The host axis may narrow where an
    // entry lands; it may not change whether it can be installed at all.
    const availability = availabilityOf(row).id;
    const expected =
      availability === "discovery"
        ? "discovery-only"
        : availability === "unsupported"
          ? "unsupported"
          : "supported";
    if (verdict.state !== expected) {
      mismatches.push(`${row.id}: module says ${verdict.state}, the site's predicate implies ${expected}`);
    }
    if (expected === "supported" && verdict.supportedHostIds.length === 0) {
      mismatches.push(`${row.id}: installable, but the module names no host that can take it`);
    }
  }
  expect(
    mismatches.slice(0, 5),
    `${mismatches.length} of 69,376 rows disagree with the site's own installability predicate`
  ).toEqual([]);
});
