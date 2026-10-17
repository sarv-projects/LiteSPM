// The badge a listing shows must be what its entry page says.
//
// The row badge and the entry page's chip are two renderings of
// `availabilityOf`; the detail page once stated installability only indirectly
// ("installability status" in a section note), so a reader arriving from a
// search result lost the field that decided whether they could act. The test
// follows real listings from `/explore/` into their entry pages and compares
// the badge with the entry header chip and with the install affordance.

import { expect, test } from "./support/site";
import { gotoSettled, resultCount, settle, waitForSearchGrid } from "./support/site";

interface Row {
  name: string;
  badge: string;
  href: string;
}

async function listingRows(page: import("@playwright/test").Page): Promise<Row[]> {
  return page.locator("main a[data-kind]").evaluateAll((rows) =>
    rows.map((row) => ({
      name: row.querySelector("span.truncate")?.textContent?.trim() ?? "",
      badge: row.querySelector("span.rounded-chip")?.textContent?.trim() ?? "",
      href: row.getAttribute("href") ?? "",
    }))
  );
}

const AVAILABILITY_BADGES = new Set([
  "Remote endpoint",
  "Installs from source",
  "Discovery only",
  "Not installable",
]);

test("a search listing's badge is the entry page's availability, both directions", async ({
  page,
}) => {
  await gotoSettled(page, "/explore/?q=postgres");
  await waitForSearchGrid(page, "postgres");
  const rows = await listingRows(page);

  const installable = rows.find((row) => AVAILABILITY_BADGES.has(row.badge) && row.badge !== "Discovery only" && row.badge !== "Not installable");
  const notInstallable = rows.find((row) => row.badge === "Discovery only");
  expect(installable, "expected an installable listing in the results").toBeTruthy();
  expect(notInstallable, "expected a discovery-only listing in the results").toBeTruthy();

  for (const sample of [installable!, notInstallable!]) {
    await page.goto(sample.href);
    await settle(page);
    await expect(page.locator("#pkg-title")).toHaveText(sample.name);

    const header = page.locator('header[aria-labelledby="pkg-title"]');
    await expect(
      header.locator("span.rounded-chip").filter({ hasText: sample.badge }).first(),
      `${sample.name}: entry header should carry the "${sample.badge}" chip`
    ).toBeVisible();

    if (sample.badge === "Discovery only" || sample.badge === "Not installable") {
      // Both affordances must agree: the install band and the AddSteps panel.
      const unavailable = page.getByRole("button", { name: "Install unavailable" });
      await expect(unavailable.first()).toBeDisabled();
      await expect(unavailable.last()).toBeDisabled();
    } else {
      await expect(
        page.locator("code").filter({ hasText: /litespm install / }).first()
      ).toBeVisible();
    }
  }
});

test("a plugin listing's badge agrees with the plugin entry page", async ({ page }) => {
  await gotoSettled(page, "/explore/?kind=plugin");
  // The pressed kind button proves hydration applied the filter; in the same
  // commit the grid unmounts for its skeleton, so waiting for the count after
  // this is waiting for the filtered rows.
  await expect(page.getByRole("button", { name: /Plugin/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(resultCount(page)).toBeVisible();
  await settle(page);
  const rows = await listingRows(page);
  expect(rows.length).toBeGreaterThan(0);
  const plugin = rows.find((row) => row.badge === "Not installable");
  expect(plugin, "every plugin row should read Not installable").toBeTruthy();

  await page.goto(plugin!.href);
  await settle(page);
  await expect(page.locator("#pkg-title")).toHaveText(plugin!.name);
  const unavailable = page.getByRole("button", { name: "Install unavailable" });
  await expect(unavailable.first()).toBeDisabled();
  await expect(unavailable.last()).toBeDisabled();
  await expect(page.getByText("Plugin installs are not supported yet.").first()).toBeVisible();
});
