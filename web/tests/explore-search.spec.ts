// Search, filter, sort, reset — and the address bar agreeing with the screen.
//
// The historical defects this file guards:
//
//   * `/explore/?q=github` buried its first result at y≈600 (competitors:
//     200–480) because the "Why these results?" panel sat above the rows;
//   * Reset cleared the filters but left them in the URL, so a refresh
//     re-applied what the reader had just cleared;
//   * an unknown `?host=` filtered silently while the select read "Any agent".

import { expect, test } from "./support/site";
import {
  collectDataRequests,
  gotoSettled,
  parseCount,
  resultCount,
  settle,
  waitForFilteredGrid,
  waitForSearchGrid,
  agentFilterSelect,
} from "./support/site";

test("the default catalog page introduces MCP servers, skills and plugins together", async ({ page }) => {
  await gotoSettled(page, "/explore/");
  const kinds = await page.locator("main a[data-kind]").evaluateAll((rows) =>
    rows.slice(0, 24).map((row) => row.getAttribute("data-kind"))
  );
  const counts = Object.fromEntries(
    ["mcp", "skill", "plugin"].map((kind) => [kind, kinds.filter((value) => value === kind).length])
  );

  expect(counts, "the first browse window contains 8 listings of each package type").toEqual({
    mcp: 8,
    skill: 8,
    plugin: 8,
  });
  await expect(page.locator("#explore-sort")).toHaveValue("curated");
  await expect(page.getByText(/How results are sorted/i)).toHaveCount(0);
  await expect(page.getByText(/featured picks first/i)).toHaveCount(0);
});

test("a kind deep link pages results without downloading the full display catalog", async ({ page }) => {
  const dataRequests = collectDataRequests(page);
  await gotoSettled(page, "/explore/?kind=mcp");

  await expect(page.getByRole("button", { name: /MCP Server/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator("main h2").filter({ hasText: "MCP Servers" })).toBeVisible();
  await expect(page.locator("main a[data-kind]").first()).toBeVisible();
  await expect(resultCount(page)).toContainText("48,418 listings");
  await expect(resultCount(page)).not.toContainText(/most relevant/i);

  const cardKinds = await page.locator("main a[data-kind]").evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-kind"))
  );
  expect(cardKinds.length).toBeLessThanOrEqual(24);
  expect(new Set(cardKinds)).toEqual(new Set(["mcp"]));
  expect(dataRequests).not.toContain("/data/catalog-search-index.bin.gz");
  expect(dataRequests).toContain("/data/catalog-search-facets.json.gz");
  expect(dataRequests.some((path) => /\/data\/search-shards\/r\d+\//.test(path))).toBe(true);
  expect(dataRequests).not.toContain("/data/catalog-search-rows.bin.gz");
  expect(dataRequests.some((path) => /^\/data\/catalog-\d+\.json$/.test(path))).toBe(false);
});

test("search: results settle, the count is measured, and the first row is above the fold", async ({
  page,
}) => {
  await gotoSettled(page, "/explore/?q=github");
  await waitForSearchGrid(page, "github");

  const text = await resultCount(page).textContent();
  const count = parseCount(text);
  expect(count).toBeGreaterThan(1000);

  // The competitor band is 200–480; the regression that made this a defect put
  // the first row at ~600. Budget: 560, measured ≈424.
  const firstRow = page.locator("main a[data-kind]").first();
  await expect(firstRow).toBeVisible();
  const box = await firstRow.boundingBox();
  expect(box).not.toBeNull();
  const top = (box?.y ?? 0) + (await page.evaluate(() => window.scrollY));
  expect(top, `first result top: ${Math.round(top)}px`).toBeLessThan(560);

  // Ranking internals stay out of the customer-facing result list.
  await expect(page.getByText(/How results are sorted/i)).toHaveCount(0);
  await expect(page.getByText(/publisher manifests|publisher skills/i)).toHaveCount(0);
});

test("the grid count never prints a figure before the search measured one", async ({ page }) => {
  // Hold the worker index request so the unsettled window is deterministic.
  // The result heading remains visible while the count says searching and the
  // cards show a loading state; it must not print a figure before measurement.
  await page.context().route("**/data/catalog-search-index.bin.gz*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.continue();
  });
  await page.goto("/explore/?q=github");
  await expect(
    page.locator("main h2").filter({ hasText: "Results for “github”" })
  ).toBeVisible();
  await expect(resultCount(page)).toHaveText("searching…");

  // Once the index lands, the count is the measured one.
  await waitForSearchGrid(page, "github");
  expect(parseCount(await resultCount(page).textContent())).toBeGreaterThan(1000);
});

test("typing a query and submitting keeps the URL and the grid in step", async ({ page }) => {
  await gotoSettled(page, "/explore/");
  const field = page.locator('input[name="q"]');
  await field.fill("postgres");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/explore\/\?q=postgres$/);
  await waitForSearchGrid(page, "postgres");
  expect(parseCount(await resultCount(page).textContent())).toBeGreaterThan(0);
});

test("filters narrow the list and land in the URL", async ({ page }) => {
  await gotoSettled(page, "/explore/?q=github");
  await waitForSearchGrid(page, "github");
  const allKinds = parseCount(await resultCount(page).textContent());

  await page.getByRole("button", { name: /MCP Server/ }).click();
  await expect(page).toHaveURL(/kind=mcp/);
  await expect(page.getByRole("button", { name: /MCP Server/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  // The kind filter re-runs the search; wait until the visible rows are all
  // MCP (the count renders from the same result array) before reading it.
  await expect
    .poll(async () => {
      const kinds = await page
        .locator("main a[data-kind]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-kind")));
      return kinds.length > 0 && kinds.every((kind) => kind === "mcp");
    })
    .toBe(true);
  const mcpOnly = parseCount(await resultCount(page).textContent());
  expect(mcpOnly).toBeGreaterThan(0);
  expect(mcpOnly).toBeLessThan(allKinds);

  // The kind is part of the search identity, so every visible row is an MCP.
  const kinds = await page.locator("main a[data-kind]").evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-kind"))
  );
  expect(kinds.length).toBeGreaterThan(0);
  expect(new Set(kinds)).toEqual(new Set(["mcp"]));
});

test("sort applies, lands in the URL, and orders the rows", async ({ page }) => {
  await gotoSettled(page, "/explore/?q=github");
  await waitForSearchGrid(page, "github");

  await page.locator("#explore-sort").selectOption("name");
  await expect(page).toHaveURL(/sort=name/);
  await waitForFilteredGrid(page, {});

  // The row's link is its title, so the link's own text is the name.
  const names = await page.locator("main a[data-kind]").evaluateAll((rows) =>
    rows.slice(0, 6).map((row) => row.textContent?.trim() ?? "")
  );
  expect(names.length).toBeGreaterThan(1);
  const folded = names.map((name) => name.toLocaleLowerCase());
  expect(folded).toEqual([...folded].sort((a, b) => a.localeCompare(b)));
});

test("Reset leaves no filters in the URL and a reload shows what the screen showed", async ({
  page,
}) => {
  await gotoSettled(page, "/explore/?q=github&kind=mcp&sort=name");
  await waitForSearchGrid(page, "github");
  const filtered = parseCount(await resultCount(page).textContent());

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page).toHaveURL(/\/explore\/$/);
  expect(new URL(page.url()).search, "Reset must leave no query string behind").toBe("");

  // The screen reset too: no query, no pressed kind, the unfiltered grid.
  await expect(page.locator('input[name="q"]')).toHaveValue("");
  await expect(page.getByRole("button", { name: "All types" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator("main h2").filter({ hasText: "All capabilities" })).toBeVisible();
  const afterReset = parseCount(await resultCount(page).textContent());
  expect(afterReset).toBeGreaterThan(filtered);

  // A reload re-reads the URL — with no filters in it, the screen is the same.
  await page.reload();
  await settle(page);
  expect(new URL(page.url()).search).toBe("");
  await expect(page.locator("main h2").filter({ hasText: "All capabilities" })).toBeVisible();
  expect(parseCount(await resultCount(page).textContent())).toBe(afterReset);
  await expect(page.locator('input[name="q"]')).toHaveValue("");
});

test("an unknown ?host= is shown as applied, not silently dropped beside 'Any agent'", async ({
  page,
}) => {
  await gotoSettled(page, "/explore/?host=not-a-real-host");
  await waitForFilteredGrid(page, { host: "not-a-real-host" });

  const select = agentFilterSelect(page);
  await expect(select).toHaveValue("not-a-real-host");
  const option = select.locator('option[value="not-a-real-host"]');
  await expect(option).toHaveCount(1);
  expect(parseCount(await resultCount(page).textContent())).toBe(0);
});

test("?focus=search focuses the field without fetching the dataset", async ({ page }) => {
  const dataRequests = collectDataRequests(page);
  await gotoSettled(page, "/explore/?focus=search");
  await expect(page.locator('input[name="q"]')).toBeFocused();
  expect(dataRequests, `unexpected dataset fetches: ${dataRequests.join(", ")}`).toEqual([]);
});
