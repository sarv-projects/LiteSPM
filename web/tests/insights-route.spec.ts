// The route rename (F-24).
//
// The nav item said "Coverage" and the route was `/trending/` — a name that
// promised a trending list the catalog cannot publish, because no source
// reports usage data. The route is now `/insights/`, the old address
// redirects there, and the page says what it is.
//
// The redirect is asserted on the *address bar*, not on the HTTP status: the
// site is a static export with no server to answer with a 301, so the
// redirect is rendered (a client-side replace, a meta refresh, and a visible
// link for a reader without JavaScript).

import { expect, test } from "./support/site";
import { gotoSettled, settle } from "./support/site";

test("/trending/ now redirects to /insights/", async ({ page }) => {
  await gotoSettled(page, "/trending/");
  await expect
    .poll(() => new URL(page.url()).pathname, {
      message: "the old address should land on /insights/",
      timeout: 10_000,
    })
    .toBe("/insights/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Catalog coverage");
});

test("catalog coverage describes available data without unsupported popularity claims", async ({ page }) => {
  await gotoSettled(page, "/insights/");
  await expect(page.getByRole("heading", { name: "Catalog coverage", level: 1 })).toBeVisible();
  await expect(page.getByText(/Explore the catalog across agent hosts, package types, categories and publishers/)).toBeVisible();
  await expect(page.getByText(/no source publishes usage data|this is a census|no trending list/i)).toHaveCount(0);
});

test("coverage uses the current agent name and explains legacy skills-folder names", async ({ page }) => {
  await gotoSettled(page, "/insights/");

  await expect(page.getByRole("link", { name: "Auggie CLI", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Xum", exact: true })).toBeVisible();
  await expect(page.getByText(/folder: Augment/).first()).toBeVisible();
  await expect(page.getByText(/folder: Mux/).first()).toBeVisible();
});

test("the rail and the footer name the route they link to", async ({ page }) => {
  await gotoSettled(page, "/");
  const nav = page.locator('nav[aria-label="Primary"]');
  const hrefs = await nav.locator("a").evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? "")
  );
  expect(hrefs, "the rail still links to the old route").not.toContain("/trending/");
  expect(hrefs, "the rail still links to /insights/").not.toContain("/insights/");

  // Insights moved out of the rail in the 2026-10-20 repositioning: it is a
  // reference surface, not one of the four things a first-time reader needs.
  // The route is still reachable from the footer, and never by its old name.
  const footer = page.locator("footer");
  const footerHrefs = await footer.locator("a").evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? "")
  );
  expect(footerHrefs, "the footer still links to the old route").not.toContain("/trending/");
  expect(footerHrefs).toContain("/insights/");
});
