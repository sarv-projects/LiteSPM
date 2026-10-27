// The ⌘K command palette (LPSM-J009).
//
// Its documented acceptance criterion is that a passive load fetches nothing
// under `/data/` — the dataset is requested by the first interaction, never by
// the page merely being open. That criterion is asserted here, with a positive
// control so the zero cannot pass vacuously: opening the palette must fetch
// the category facets, and typing must fetch the search index.

import { expect, test } from "./support/site";
import { collectDataRequests, gotoSettled, waitForSearchGrid } from "./support/site";

const DIALOG = '[role="dialog"][aria-label="Command palette"]';

test("a passive home load fetches nothing under /data/; opening and typing do", async ({
  page,
}) => {
  const dataRequests = collectDataRequests(page);
  await gotoSettled(page, "/");
  // Give any deferred fetch a window to fire before calling it absent.
  await page.waitForTimeout(1500);
  expect(
    dataRequests,
    `a passive load must not fetch the dataset, saw: ${dataRequests.join(", ")}`
  ).toEqual([]);

  // Positive control 1: opening the palette fetches the category facets.
  await page.getByRole("link", { name: "Search the catalog" }).click();
  await expect(page.locator(DIALOG)).toBeVisible();
  await expect
    .poll(() => dataRequests.filter((path) => path.endsWith("catalog-categories.json")).length, {
      message: "opening the palette should fetch the category facets",
    })
    .toBeGreaterThan(0);

  // Positive control 2: the first keystroke fetches the search index.
  await page.locator(`${DIALOG} input[role="combobox"]`).fill("github");
  await expect
    .poll(() => dataRequests.filter((path) => path.includes("catalog-search-index")).length, {
      message: "typing should fetch the search index",
    })
    .toBeGreaterThan(0);
});

test("opens from the header control and from Ctrl+K", async ({ page }) => {
  await gotoSettled(page, "/");

  await page.getByRole("link", { name: "Search the catalog" }).click();
  await expect(page.locator(DIALOG)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(DIALOG)).toBeHidden();

  // The key handler attaches with hydration; settle() has waited for that,
  // and the poll retries the keystroke rather than racing it.
  await expect
    .poll(
      async () => {
        if (await page.locator(DIALOG).isVisible()) return true;
        await page.keyboard.press("Control+k");
        return page.locator(DIALOG).isVisible();
      },
      { message: "Ctrl+K should open the palette" }
    )
    .toBe(true);
});

test("the Install LiteSPM palette destination reaches the setup guide", async ({ page }) => {
  await gotoSettled(page, "/");
  await page.getByRole("link", { name: "Search the catalog" }).click();
  const dialog = page.locator(DIALOG);
  await expect(dialog).toBeVisible();
  await dialog.locator('input[role="combobox"]').fill("Install LiteSPM");
  const destination = dialog.getByRole("option", { name: /Install LiteSPM/ });
  await expect(destination).toBeVisible();
  await destination.press("Enter");
  await expect(page).toHaveURL(/\/get-started\//);
  await expect(page.getByRole("heading", { name: "Get started", level: 1 })).toBeVisible();
});

test("Escape closes the palette and returns focus to the header control", async ({ page }) => {
  await gotoSettled(page, "/");
  const opener = page.getByRole("link", { name: "Search the catalog" });
  await opener.click();
  await expect(page.locator(DIALOG)).toBeVisible();
  await expect(page.locator(`${DIALOG} input[role="combobox"]`)).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator(DIALOG)).toBeHidden();
  await expect(opener).toBeFocused();
});

test("Tab is trapped inside the dialog", async ({ page }) => {
  await gotoSettled(page, "/");
  await page.getByRole("link", { name: "Search the catalog" }).click();
  await expect(page.locator(DIALOG)).toBeVisible();

  const focusedIsInside = () =>
    page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Command palette"]');
      return dialog !== null && dialog.contains(document.activeElement);
    });

  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press("Tab");
    expect(await focusedIsInside(), `Tab press ${press + 1} left the dialog`).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await focusedIsInside(), "Shift+Tab left the dialog").toBe(true);
});

test("arrow keys move the active row while focus stays in the field", async ({ page }) => {
  await gotoSettled(page, "/");
  await page.getByRole("link", { name: "Search the catalog" }).click();
  const dialog = page.locator(DIALOG);
  await expect(dialog).toBeVisible();

  const input = page.locator(`${DIALOG} input[role="combobox"]`);
  await input.fill("github");
  await expect(page.locator(`${DIALOG} [role="status"]`)).toContainText(
    /capabilit(y|ies) match this query/,
    { timeout: 30_000 }
  );

  const before = await input.getAttribute("aria-activedescendant");
  await page.keyboard.press("ArrowDown");
  const after = await input.getAttribute("aria-activedescendant");
  expect(after).not.toBe(before);
  await expect(input).toBeFocused();

  await page.keyboard.press("ArrowUp");
  expect(await input.getAttribute("aria-activedescendant")).toBe(before);
});

test("a settled query's first row navigates to that entry", async ({ page }) => {
  await gotoSettled(page, "/");
  await page.getByRole("link", { name: "Search the catalog" }).click();
  const dialog = page.locator(DIALOG);
  await expect(dialog).toBeVisible();

  await page.locator(`${DIALOG} input[role="combobox"]`).fill("github");
  // The status region is the settled measurement, not a timeout.
  await expect(page.locator(`${DIALOG} [role="status"]`)).toContainText(
    /capabilit(y|ies) match this query/,
    { timeout: 30_000 }
  );

  const firstRow = page.locator(`${DIALOG} [role="option"]`).first();
  await expect(firstRow).toBeVisible();
  const label = (await firstRow.locator("span.truncate").first().textContent())?.trim();
  expect(label).toBeTruthy();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/package\//);
  await expect(page.locator(DIALOG)).toBeHidden();
  await expect(page.locator("#pkg-title")).toHaveText(label!);
});

test("the palette's rows are Explore's ranking for the same query", async ({ page }) => {
  await gotoSettled(page, "/explore/?q=github");
  await waitForSearchGrid(page, "github");
  // The Explore row's link is its title, so the link's own text is the name.
  const exploreFirst = await page.locator("main a[data-kind]").first().textContent();

  await page.keyboard.press("Control+k");
  const dialog = page.locator(DIALOG);
  await expect(dialog).toBeVisible();
  await page.locator(`${DIALOG} input[role="combobox"]`).fill("github");
  await expect(page.locator(`${DIALOG} [role="status"]`)).toContainText(
    /capabilit(y|ies) match this query/,
    { timeout: 30_000 }
  );
  const paletteFirst = await page
    .locator(`${DIALOG} [role="option"]`)
    .first()
    .locator("span.truncate")
    .first()
    .textContent();

  expect(paletteFirst?.trim()).toBe(exploreFirst?.trim());
});
