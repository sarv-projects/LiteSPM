// Board figures agree with what their links open.
//
// The historical contradiction: `/insights/` linked each publisher to
// `/explore/?q=<name>` — a text search — while showing a publisher count. Two
// measurements presented as one: `mcp-dir 1,113` opened a page reading 1,801.
// The link is now `/explore/?publisher=<name>`, the same comparison
// `publisherFacets` counts with, and this file follows every row.
//
// The agent-host table is checked as a chain: its "Entries" figure must equal
// the count the host's own page shows, which must equal the count the Explore
// filter opens. (The earlier ranked host board printed the same near-total
// figure on eleven of its fifteen rows because compatibility follows from
// kind; the table now carries the total beside the facts that differ, and the
// figure still has to agree with its own link.)

import { expect, test } from "./support/site";
import { gotoSettled, parseCount, resultCount, waitForFilteredGrid } from "./support/site";

interface BoardRow {
  label: string;
  count: string;
  href: string | null;
}

async function readBoard(
  page: import("@playwright/test").Page,
  title: string
): Promise<{ rows: BoardRow[]; note: string | null }> {
  const section = page
    .locator("main section")
    .filter({ has: page.getByRole("heading", { name: title }) });
  await expect(section).toBeVisible();
  const rows = await section.locator("ol li").evaluateAll((items) =>
    items.map((item) => {
      const spans = item.querySelectorAll("span.t-mono.t-tabular");
      return {
        label: item.querySelector("span.t-cond")?.textContent?.trim() ?? "",
        count: spans[spans.length - 1]?.textContent?.trim() ?? "",
        href: item.querySelector("a")?.getAttribute("href") ?? null,
      };
    })
  );
  const note = await section
    .locator("p", { hasText: /Showing the top \d+ of/ })
    .first()
    .textContent()
    .catch(() => null);
  return { rows, note };
}

/** The `/insights/` host table: name, the agent page it opens, its figure. */
async function readHostTable(
  page: import("@playwright/test").Page
): Promise<Array<{ label: string; href: string; entries: string }>> {
  const section = page
    .locator("main section")
    .filter({ has: page.getByRole("heading", { name: "Agents by configuration" }) });
  await expect(section).toBeVisible();
  return section.locator("ul li").evaluateAll((items) =>
    items.map((item) => ({
      label: item.querySelector("a")?.textContent?.trim() ?? "",
      href: item.querySelector("a")?.getAttribute("href") ?? "",
      entries:
        item.querySelector("span.t-mono.t-tabular.text-right")?.textContent?.trim() ?? "",
    }))
  );
}

test("the publisher board: every figure matches the page its link opens", async ({ page }) => {
  test.setTimeout(180_000);
  await gotoSettled(page, "/insights/");
  const { rows, note } = await readBoard(page, "Publishers by entries shipped");

  expect(rows.length).toBe(15);
  expect(note, "the board renders 15 rows and must say so").toMatch(
    /Showing the top 15 of [\d,]+\./
  );
  for (const row of rows) {
    expect(row.href, `publisher row ${row.label} should link to Explore`).toBe(
      `/explore/?publisher=${encodeURIComponent(row.label)}`
    );
  }

  for (const row of rows) {
    await page.locator(`main a[href="${row.href}"]`).first().click();
    await waitForFilteredGrid(page, { publisher: row.label });
    const shown = parseCount(await resultCount(page).textContent());
    expect(shown, `publisher ${row.label}: board says ${row.count}`).toBe(parseCount(row.count));
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Catalog coverage", level: 1 })).toBeVisible();
  }
});

test("the agent-host table: the figure, the host page and Explore all agree", async ({ page }) => {
  test.setTimeout(180_000);
  await gotoSettled(page, "/insights/");
  const rows = (await readHostTable(page)).filter(
    (row) => row.href.startsWith("/agents/") && /^[\d,]+$/.test(row.entries)
  );
  expect(rows.length, "the host table should list hosts with entry figures").toBeGreaterThan(10);

  // Five samples: first, two in the middle, last, and the smallest figure —
  // the tail is where a wrong join (one host's count shown for another) hides.
  const byCount = [...rows].sort((a, b) => parseCount(a.entries) - parseCount(b.entries));
  const samples = [
    rows[0],
    rows[Math.floor(rows.length / 3)],
    rows[Math.floor((2 * rows.length) / 3)],
    rows[rows.length - 1],
    byCount[0],
  ];
  const seen = new Set<string>();
  for (const row of samples) {
    if (seen.has(row.href)) continue;
    seen.add(row.href);

    await page.goto(row.href);
    // The host page's own catalog-entry count.
    const hostCountText = await page.locator('section[aria-labelledby="agent-works-title"] span.t-tabular').textContent();
    const hostCount = parseCount(hostCountText);
    expect(
      hostCount,
      `host page ${row.href}: table says ${row.entries}, page shows ${hostCount}`
    ).toBe(parseCount(row.entries));

    // …and the page's own Explore link opens that count.
    const browse = page.locator('section[aria-labelledby="agent-works-title"] a[href^="/explore/?host="]');
    const browseHref = await browse.getAttribute("href");
    const host = new URL(browseHref ?? "", "http://localhost").searchParams.get("host") ?? "";
    expect(host, `the Browse link on ${row.href} should name a host filter`).not.toBe("");
    await browse.click();
    await waitForFilteredGrid(page, { host });
    const exploreCount = parseCount(await resultCount(page).textContent());
    expect(
      exploreCount,
      `Explore for ${row.href}: host page says ${hostCount}, Explore shows ${exploreCount}`
    ).toBe(hostCount);
  }
});

test("the category board links to the category filter and its figure matches", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoSettled(page, "/insights/");
  const { rows } = await readBoard(page, "Categories by entry count");
  expect(rows.length).toBeGreaterThan(0);
  // Three samples: the largest, a middle row, the last.
  const samples = [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]];
  for (const row of samples) {
    expect(row.href, `category ${row.label} should link to the category filter`).toMatch(
      /^\/explore\/\?category=/
    );
    await page.goto(row.href!);
    // The chip names the category the way the board displays it; its presence
    // is the hydration signal and the count follows the rows.
    await expect(
      page.getByRole("button", { name: `Clear the ${row.label} category filter` })
    ).toBeVisible();
    await expect(resultCount(page)).toBeVisible();
    await expect(resultCount(page)).not.toHaveText("searching…");
    const shown = parseCount(await resultCount(page).textContent());
    expect(shown, `category ${row.label}: board says ${row.count}`).toBe(parseCount(row.count));
  }
});
