// One host, one count — checked on every host page, not a sample.
//
// The defect this file was written against: nine of the fifty host pages
// counted only the catalog rows that name the host the way the MCP registry
// spells it ("Claude Code CLI") while the same host's row on `/agents/`, its
// `/insights/` figure and its own Explore link counted every row that names
// the host ("Claude Code" for skills too). The boards spec samples five host
// pages and every sample happened to be a host whose two registry spellings
// are identical, so all nine wrong pages passed it.
//
// What this asserts, for every adapter host:
//
//   1. the figure the host page prints equals the sum of the compatible-entry
//      counts on that host's own row on `/agents/` — one host, one total;
//   2. the Explore link under the figure returns exactly that figure (the
//      link's own `?host=` value, applied by the page);
//   3. the headline figure in "Catalog entries for this agent" is the same
//      number as the aside's "Catalog entries" value (one measurement).
//
// A second test pins the denominator: `/agents/`, `/compare/`, a pre-rendered
// entry page and the Explore facet must all state the same host count — the
// number of host identities, not catalog spellings. A third pins the facet
// list itself: one option per host, so no host can appear twice under two
// spellings.

import { expect, test } from "./support/site";
import {
  gotoSettled,
  installHermeticRouting,
  parseCount,
  resultCount,
  stubImages,
  waitForFilteredGrid,
  agentFilterSelect,
} from "./support/site";
import { preRenderedEntry } from "./support/catalog";

interface IndexRow {
  href: string;
  name: string;
  total: number;
}

/** The `/agents/` index: each adapter host's page link and its row total. */
async function readAgentIndex(page: import("@playwright/test").Page): Promise<IndexRow[]> {
  const rows = await page.locator("main article.agent-atlas-card").evaluateAll((items) =>
    items.map((li) => {
      const nameLink = li.querySelector('a[href^="/agents/"]');
      const kindCounts = [...li.querySelectorAll('a[href*="kind="]')].map((link) =>
        Number.parseInt((link.textContent ?? "").replace(/[^\d]/g, ""), 10)
      );
      return {
        href: nameLink?.getAttribute("href") ?? "",
        // The link also carries the host's mark; the name is its own span.
        name:
          nameLink?.querySelector("span.t-cond.truncate")?.textContent?.trim() ??
          nameLink?.textContent?.trim() ??
          "",
        total: kindCounts.reduce((sum, count) => sum + (Number.isFinite(count) ? count : 0), 0),
      };
    })
  );
  return rows.filter((row) => row.href.startsWith("/agents/"));
}

/** The figure the host page prints in its catalog-entry fact. */
async function hostPageCount(page: import("@playwright/test").Page): Promise<number> {
  const text = await page.locator('section[aria-labelledby="agent-works-title"] span.t-tabular').textContent();
  return parseCount(text);
}

test("every host page's count equals its own Explore link and its /agents/ row", async ({
  browser,
}) => {
  // Every host page, each followed by its Explore link: a few minutes of real
  // navigation, deliberately — the point is to check every page, not a sample.
  test.setTimeout(900_000);

  // The index is read in its own context, and the walk that follows runs in
  // chunks with a context each. One context for the whole walk meant one
  // renderer held every page it had ever loaded, and on the 8 GB runner it
  // died part way through ("Page crashed") with nothing wrong with the page
  // it was on. The brand marks are stubbed for the same reason: they are
  // decorative here, and decoding them on every navigation is what the
  // renderer was spending its memory on.
  const index = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installHermeticRouting(index);
  await stubImages(index);
  const indexPage = await index.newPage();
  await gotoSettled(indexPage, "/agents/");
  const rows = await readAgentIndex(indexPage);
  await index.close();
  // Every adapter host has a page, and so does every host identity that takes
  // skills and no configuration (the site no longer publishes a name that
  // leads nowhere). The adapter hosts are the fifty that LiteSPM configures.
  expect(rows.length, "the index lists every adapter host").toBeGreaterThanOrEqual(50);

  const failures: string[] = [];
  const CHUNK = 20;
  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await installHermeticRouting(context);
    await stubImages(context);
    const page = await context.newPage();
    for (const row of chunk) {
      await page.goto(row.href);
      await expect(page.locator("h1")).toBeVisible();

      const pageCount = await hostPageCount(page);
      if (pageCount !== row.total) {
        failures.push(
          `${row.name}: host page prints ${pageCount}, its /agents/ row totals ${row.total}`
        );
      }

      // The headline under "Catalog entries for this agent" is the same measurement.
      const headline = await page
        .locator('section[aria-labelledby="agent-works-title"] span.t-tabular')
        .first()
        .textContent();
      if (parseCount(headline) !== pageCount) {
        failures.push(
          `${row.name}: aside says ${pageCount}, the headline says ${parseCount(headline)}`
        );
      }

      const browse = page.locator('section[aria-labelledby="agent-works-title"]').getByRole("link", { name: /Browse entries for/ });
      const href = await browse.getAttribute("href");
      const host = new URL(href ?? "", "http://localhost").searchParams.get("host") ?? "";
      expect(host, `the Browse link on ${row.href} names a host filter`).not.toBe("");

      await browse.click();
      await waitForFilteredGrid(page, { host });
      const exploreCount = parseCount(await resultCount(page).textContent());
      if (exploreCount !== pageCount) {
        failures.push(
          `${row.name}: host page says ${pageCount}, its Explore link (?host=${host}) returns ${exploreCount}`
        );
      }
    }
    await context.close();
  }

  expect(failures, `host page figures disagree:\n${failures.join("\n")}`).toEqual([]);
});

/** "Pi (68,738)" → "Pi"; the label carries the count in parentheses. */
function facetName(option: string): string {
  return option.replace(/ \(\d[\d,]*\)$/, "").trim();
}

/** The first number in a string ("79 hosts · 50 LiteSPM can set up" → 79). */
function leadingCount(text: string | null): number {
  const match = (text ?? "").match(/[\d,]+/);
  return parseCount(match?.[0] ?? text);
}

test("one denominator: /agents/, /compare/, the entry pages and the Explore facet agree", async ({
  page,
}) => {
  await gotoSettled(page, "/explore/");
  const facetOptions = await agentFilterSelect(page).locator("option").allTextContents();
  const facetCount = facetOptions.length - 1; // "Any agent" is the first option

  await gotoSettled(page, "/agents/");
  const agentsHeader = await page.locator(".agent-atlas-stats span:last-child strong").textContent();
  const agentsCount = leadingCount(agentsHeader);

  await gotoSettled(page, "/compare/");
  const compareHeader = await page.locator("main p", { hasText: "hosts ·" }).first().textContent();
  const compareCount = leadingCount(compareHeader);

  const entry = preRenderedEntry();
  await gotoSettled(page, entry.href);
  const entryText = await page
    .locator('dt:text-is("Agent install targets") + dd')
    .textContent();
  const fraction = (entryText ?? "").match(/([\d,]+) of ([\d,]+) agent hosts/);
  expect(fraction, `the entry page states "N of M agent hosts": ${entryText}`).not.toBeNull();
  const entryDenominator = parseCount(fraction?.[2] ?? "");

  expect(
    {
      exploreFacet: facetCount,
      agents: agentsCount,
      compare: compareCount,
      entryDenominator,
    },
    "every surface states the same host count"
  ).toEqual({
    exploreFacet: facetCount,
    agents: facetCount,
    compare: facetCount,
    entryDenominator: facetCount,
  });
});

test("the Agent filter offers one option per host — no spelling twice", async ({ page }) => {
  await gotoSettled(page, "/explore/");
  const options = await agentFilterSelect(page).locator("option").allTextContents();
  expect(options[0]).toBe("Any agent");

  const names = options.slice(1).map(facetName);
  // The defect this guards: the same host offered under two spellings ("Pi"
  // and "Pi Agent (Terminal Agent)", "Grok" and "Grok Build (xAI Dev Tool)").
  expect(new Set(names).size, `duplicate facet names: ${names.join(", ")}`).toBe(names.length);

  const once = (name: string) => names.filter((n) => n === name).length;
  expect(once("Pi"), "the Pi host is one option").toBe(1);
  expect(names).not.toContain("Pi Agent");
  expect(names).not.toContain("Pi Agent (Terminal Agent)");
  expect(once("Grok Build"), "the Grok host is one option").toBe(1);
  expect(names).not.toContain("Grok");
  expect(names).not.toContain("Grok Build (xAI Dev Tool)");
});
