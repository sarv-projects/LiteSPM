// Explore's filter panel (F-07, F-15, F-17, F-18, F-25, F-26).
//
// The defect this file guards: three of the ten filters the site links to —
// category, publisher and source — existed only as URL parameters. A reader
// on `/explore/` could not reach them at all, and the site itself linked to
// them from the shelves, the boards and the deep links.
//
// The controls now exist, and each one has to behave like the filter it
// stands for:
//
//   * it writes its URL parameter;
//   * it reads it back, so a reload keeps the filter;
//   * the count beside it is the count that filter returns;
//   * the active filter is visible and can be removed.
//
// The rest of the file guards the smaller findings in the same panel: the
// form fields that had no `id` or `name`, the checkboxes under the WCAG
// 2.2 target-size floor, the sort options whose names said nothing, the
// "Works with" list that showed 71 identical counts, and the missing
// page-level explanation of what each filter does.

import { expect, test } from "./support/site";
import { gotoSettled, resultCount, settle, waitForFilteredGrid } from "./support/site";
import { parseCount } from "./support/site";

/** The count a filter control's own option carries. */
function optionCount(text: string): number {
  const match = text.match(/\(([\d,]+)\)/);
  if (!match) throw new Error(`no count in option: ${text}`);
  return parseCount(match[1]);
}

test("every filter the site links to has a control", async ({ page }) => {
  await gotoSettled(page, "/explore/");
  for (const [label, id] of [
    ["Goal", "explore-goal"],
    ["Works with", "explore-host"],
    ["Category", "explore-category"],
    ["Source", "explore-source"],
    ["Publisher", "explore-publisher"],
  ] as const) {
    const control = page.locator(`#${id}`);
    await expect(control, `the ${label} filter has no control`).toHaveCount(1);
    // Every form control carries an id and a name (F-17).
    await expect(control).toHaveAttribute("id", id);
    const name = await control.getAttribute("name");
    expect(name, `the ${label} control has no name attribute`).toBeTruthy();
  }
});

test("the category control filters, writes its parameter and reads it back", async ({ page }) => {
  await gotoSettled(page, "/explore/");
  const control = page.locator("#explore-category");
  const options = await control.locator("option").allTextContents();
  expect(options.length, "the category control offers no categories").toBeGreaterThan(10);
  // The first option is the "no filter" one; every other option carries the
  // count its filter returns.
  for (const option of options.slice(1)) {
    expect(optionCount(option), `the option "${option}" carries no count`).toBeGreaterThan(0);
  }

  const wanted = options[1];
  const value = (await control.locator("option").nth(1).getAttribute("value")) ?? "";
  const expected = optionCount(wanted);

  await control.selectOption(value);
  await waitForFilteredGrid(page, {});
  await expect
    .poll(() => new URL(page.url()).searchParams.get("category"))
    .toBe(value);

  // The count the control showed is the count the filter returned.
  const shown = parseCount(await resultCount(page).textContent());
  expect(shown, `the category filter returned ${shown} rows, the control said ${expected}`).toBe(
    expected
  );

  // A reload keeps the filter: the parameter is read back.
  await page.reload();
  await settle(page);
  await expect(page.locator("#explore-category")).toHaveValue(value);
});

test("the source control filters, writes its parameter and reads it back", async ({ page }) => {
  await gotoSettled(page, "/explore/");
  const control = page.locator("#explore-source");
  const options = await control.locator("option").allTextContents();
  expect(options.length, "the source control offers no sources").toBeGreaterThan(2);

  const value = (await control.locator("option").nth(1).getAttribute("value")) ?? "";
  const expected = optionCount(options[1]);

  await control.selectOption(value);
  await waitForFilteredGrid(page, {});
  await expect.poll(() => new URL(page.url()).searchParams.get("source")).toBe(value);

  const shown = parseCount(await resultCount(page).textContent());
  expect(shown, `the source filter returned ${shown} rows, the control said ${expected}`).toBe(
    expected
  );

  await page.reload();
  await settle(page);
  await expect(page.locator("#explore-source")).toHaveValue(value);
});

test("the publisher control offers the publishers and their counts, and filters on one", async ({
  page,
}) => {
  await gotoSettled(page, "/explore/");
  const control = page.locator("#explore-publisher");

  // The list is fetched when the control is opened, so a passive visit fetches
  // nothing under /data/. Opening it is the interaction that asks for it.
  await control.focus();
  await expect
    .poll(
      async () => (await control.locator("option").allTextContents()).length,
      { message: "the publisher list should load when the control is opened" }
    )
    .toBeGreaterThan(1);

  const options = await control.locator("option").allTextContents();
  const first = options[1];
  const expected = optionCount(first);
  const value = (await control.locator("option").nth(1).getAttribute("value")) ?? "";

  await control.selectOption(value);
  await waitForFilteredGrid(page, {});
  await expect.poll(() => new URL(page.url()).searchParams.get("publisher")).toBe(value);

  const shown = parseCount(await resultCount(page).textContent());
  expect(
    shown,
    `the publisher filter returned ${shown} rows, the control said ${expected}`
  ).toBe(expected);
});

test("the active filters are visible and can be removed", async ({ page }) => {
  await gotoSettled(page, "/explore/?kind=skill&source=feed%3Askills-sh");
  await waitForFilteredGrid(page, {});
  await expect(page.getByRole("button", { name: /Clear the .* source filter/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Reset$/ })).toBeVisible();

  // The page-level "why" (F-26): one line saying what each filter does. It is
  // a disclosure under the bar rather than a paragraph in front of the rows,
  // so the test opens it.
  const filterWhy = page
    .locator("details")
    .filter({ has: page.getByText("What each filter does") });
  await filterWhy.locator("summary").click();
  await expect(
    filterWhy.getByText("Every filter narrows the same list.", { exact: false })
  ).toBeVisible();
});

test("the two checkboxes are at least 24px across (WCAG 2.2 SC 2.5.8)", async ({ page }) => {
  await gotoSettled(page, "/explore/");
  for (const id of ["explore-verified", "explore-installable"]) {
    const box = await page.locator(`#${id}`).boundingBox();
    expect(box, `the ${id} checkbox has no box`).not.toBeNull();
    expect(box!.width, `the ${id} checkbox is ${box!.width}px wide`).toBeGreaterThanOrEqual(24);
    expect(box!.height, `the ${id} checkbox is ${box!.height}px tall`).toBeGreaterThanOrEqual(24);
  }
});

test("every sort option says what it does, and the control shows the order in force", async ({
  page,
}) => {
  await gotoSettled(page, "/explore/");
  const control = page.locator("#explore-sort");
  const options = await control.locator("option").allTextContents();
  for (const option of options) {
    expect(option.length, `the sort option "${option}" says nothing`).toBeGreaterThan(6);
  }
  // The default browse order is the curated one, and the control says so.
  await expect(control).toHaveValue("curated");
  // The rule is stated below the rows it orders, in a disclosure: the
  // ordering evidence follows the result set, never precedes it. The reader
  // opens it; the test opens it too.
  const ordering = page.locator("details").filter({
    has: page.getByText("How these rows are ordered"),
  });
  await expect(ordering, "the order in force is never explained").toBeVisible();
  await ordering.locator("summary").click();
  await expect(
    ordering.getByText("Official skills first, then entries from the publisher's own manifest", {
      exact: false,
    })
  ).toBeVisible();
});

test("the Works with list groups the hosts that take MCP servers from the skills-only ones", async ({
  page,
}) => {
  await gotoSettled(page, "/explore/");
  const groups = page.locator("#explore-host optgroup");
  const count = await groups.count();
  expect(count, "the Works with list is one flat list again").toBeGreaterThan(1);
  const groupLabels = await page
    .locator("#explore-host optgroup")
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptGroupElement).label));
  expect(
    groupLabels.some((label) => /MCP servers and skills/.test(label)),
    `no managed group in ${JSON.stringify(groupLabels)}`
  ).toBe(true);
  expect(
    groupLabels.some((label) => /Skills only/.test(label)),
    `no skills-only group in ${JSON.stringify(groupLabels)}`
  ).toBe(true);
});
