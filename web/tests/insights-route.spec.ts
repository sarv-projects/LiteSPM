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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Insights");
});

test("the insights page says it is a census, not a trending list", async ({ page }) => {
  await gotoSettled(page, "/insights/");
  await expect(
    page.getByText("There is no trending list here: no source publishes usage data.", {
      exact: false,
    })
  ).toBeVisible();
});

test("the primary rail names the route it links to", async ({ page }) => {
  await gotoSettled(page, "/");
  const nav = page.locator('nav[aria-label="Primary"]');
  const hrefs = await nav.locator("a").evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? "")
  );
  expect(hrefs, "the rail still links to the old route").not.toContain("/trending/");
  expect(hrefs).toContain("/insights/");
});
