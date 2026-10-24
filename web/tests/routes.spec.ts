// Every top-level route loads clean: its own heading, the site name in its
// title, and zero console errors. The site currently measures zero; this file
// keeps it there.
//
// Console errors include Chromium's own "Failed to load resource" messages,
// so a broken asset or a 404 image fails this gate — and the suite's hermetic
// routing means a third-party icon host being down cannot.

import { expect, test } from "./support/site";
import { collectPageErrors, gotoSettled, settle } from "./support/site";
import { flagshipEntry, nonPreRenderedEntry, preRenderedEntry } from "./support/catalog";

const preRendered = preRenderedEntry();
const nonPreRendered = nonPreRenderedEntry();
const flagship = flagshipEntry();

const ROUTES: Array<{ path: string; heading?: string }> = [
  { path: "/", heading: "Give your agents more possibilities." },
  { path: "/explore/", heading: "Find what your agent needs" },
  { path: "/agents/", heading: "Choose your agent." },
  { path: "/agents/claude-code/", heading: "Claude Code" },
  { path: "/categories/", heading: "Categories" },
  { path: "/compare/", heading: "Compare agent hosts" },
  { path: "/insights/", heading: "Catalog coverage" },
  { path: "/package/", heading: "Find a package" },
  { path: "/privacy/", heading: "Privacy" },
  { path: "/contact/", heading: "Contact" },
  { path: "/terms/", heading: "Terms" },
  { path: preRendered.href, heading: preRendered.row.name },
  { path: nonPreRendered.href, heading: nonPreRendered.row.name },
  { path: flagship.href, heading: flagship.row.name },
  { path: flagship.queryHref, heading: flagship.row.name },
];

for (const { path, heading } of ROUTES) {
  test(`${path} loads with zero console errors`, async ({ page }) => {
    const errors = collectPageErrors(page);
    await gotoSettled(page, path);

    if (heading) {
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
    // Every route carries the site name; entry pages are asserted exactly in
    // `entry-pages.spec.ts`, where the entry's own name is the point.
    await expect(page).toHaveTitle(/LiteSPM/);
    expect(errors, `console errors on ${path}:\n${errors.join("\n")}`).toEqual([]);
  });
}

test("an unknown route answers 404 with the site's own 404 document", async ({ page }) => {
  // No console-error assertion here: Chromium logs the document's own 404
  // response as a console error ("Failed to load resource … 404"), which is
  // the correct outcome for this URL. Uncaught page errors still fail.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(`pageerror: ${error.message}`));
  const response = await page.goto("/no-such-route-at-all/");
  expect(response?.status()).toBe(404);
  await settle(page);
  await expect(page.getByRole("heading", { name: "Page not found." })).toBeVisible();
  expect(pageErrors, `uncaught errors on the 404 route:\n${pageErrors.join("\n")}`).toEqual([]);
});
