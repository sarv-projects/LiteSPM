// Copy buttons actually write to the clipboard.
//
// The site's install command is the product's one action, and a copy button
// that silently fails is worse than no button. Chromium grants clipboard
// access to `127.0.0.1` (a secure context) under Playwright's `clipboard-read`
// and `clipboard-write` permissions, so the assertion is on the clipboard
// itself, not on the button's label.

import { expect, test } from "./support/site";
import { gotoSettled } from "./support/site";
import { preRenderedEntry } from "./support/catalog";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const preRendered = preRenderedEntry();

test("the entry page's copy button writes the exact install command", async ({ page }) => {
  await gotoSettled(page, preRendered.href);
  const expected = `npx --yes litespm@latest install ${preRendered.row.id}`;

  const button = page.getByRole("button", { name: "Copy install command" }).first();
  await expect(button).toBeVisible();
  await button.click();

  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(expected);
});

test("the get-started page's quickstart command is copyable", async ({ page }) => {
  // The command list moved to /get-started with the rest of the reference
  // material: the home page is the search and the install now.
  await gotoSettled(page, "/get-started/");
  // The button names the command it copies, which is more use to a reader
  // than a generic "Copy the install command".
  const button = page.getByRole("button", { name: "Copy: npm install -g litespm" });
  await expect(button).toBeVisible();
  await button.click();

  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe("npm install -g litespm");
});

test("the agent page's bridge-entry copy button writes the entry the page shows", async ({
  page,
}) => {
  await gotoSettled(page, "/agents/claude-code/");
  const button = page.getByRole("button", { name: "Copy the bridge entry" });
  await expect(button).toBeVisible();
  // The page prints the same snippet in a <pre>; the clipboard must equal it.
  const shown = (await page.locator("pre").first().textContent())?.trim();
  expect(shown).toBeTruthy();

  await button.click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.trim()).toBe(shown);
});
