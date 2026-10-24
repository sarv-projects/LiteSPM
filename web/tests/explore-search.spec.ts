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
  worksWithSelect,
} from "./support/site";

test("the default catalog page introduces MCP servers, skills and plugins together", async ({ page }) => {
  await gotoSettled(page, "/explore/");
  const kinds = await page.locator("main a[data-kind]").evaluateAll((rows) =>
    rows.slice(0, 48).map((row) => row.getAttribute("data-kind"))
  );
  const counts = Object.fromEntries(
    ["mcp", "skill", "plugin"].map((kind) => [kind, kinds.filter((value) => value === kind).length])
  );

  expect(counts, "the first browse page contains 16 listings of each package type").toEqual({
    mcp: 16,
    skill: 16,
    plugin: 16,
  });
  const sortNote = page.locator("details").filter({ hasText: "How results are sorted" });
  await sortNote.locator("summary").click();
  await expect(sortNote.getByText(/featured picks first/i)).toBeVisible();
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

  // The ordering evidence is below the rows, not in front of them.
  const explanation = page.locator("details", { hasText: "Why these results?" });
  await expect(explanation).toBeAttached();
  const explanationTop = await explanation.evaluate((el) => el.getBoundingClientRect().top);
  expect(explanationTop).toBeGreaterThan(top);
});

test("the grid count never prints a figure before the search measured one", async ({ page }) => {
  // Hold the search index so the unsettled window is deterministic instead of
  // a race. Until it resolves, `filtered` is empty — and the count must read
  // "searching…", not print that emptiness as "0 entries". That was the
  // defect: a figure for a search that had not run. The heading renders only
  // once the full row set is in hand, so at the first assertion the grid is on
  // screen and only the search itself is outstanding.
  await page.route("**/data/catalog-search-index.bin.gz*", async (route) => {
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

  // The row's link is its title, so the link's own text is the name.
  const names = await page.locator("main a[data-kind]").evaluateAll((rows) =>
    rows.slice(0, 6).map((row) => row.textContent?.trim() ?? "")
  );
  expect(names.length).toBeGreaterThan(1);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  expect(names).toEqual(sorted);
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

  const select = worksWithSelect(page);
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
