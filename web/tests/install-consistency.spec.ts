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
import { catalogRows, entryFixture, FLAGSHIP_ID } from "./support/catalog";

interface Row {
  name: string;
  badge: string;
  href: string;
}

async function listingRows(page: import("@playwright/test").Page): Promise<Row[]> {
  // The row's link is its title, so the name is the link's text; the badge
  // belongs to the row around it, not to the link.
  return page.locator("main a[data-kind]").evaluateAll((links) =>
    links.map((link) => {
      const row = link.closest("[data-row]") ?? link.parentElement;
      return {
        name: link.textContent?.trim() ?? "",
        badge: row?.querySelector("span.rounded-chip")?.textContent?.trim() ?? "",
        href: link.getAttribute("href") ?? "",
      };
    })
  );
}

const AVAILABILITY_BADGES = new Set([
  "Remote endpoint",
  "Installs from source",
  "Listed only",
  "Not installable",
]);

test("a search listing's badge is the entry page's availability, both directions", async ({
  page,
}) => {
  await gotoSettled(page, "/explore/?q=postgres");
  await waitForSearchGrid(page, "postgres");
  const rows = await listingRows(page);

  const installable = rows.find((row) => AVAILABILITY_BADGES.has(row.badge) && row.badge !== "Listed only" && row.badge !== "Not installable");
  const notInstallable = rows.find((row) => row.badge === "Listed only");
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

    if (sample.badge === "Listed only" || sample.badge === "Not installable") {
      // Both affordances must agree: the install band and the AddSteps panel.
      const unavailable = page.getByRole("button", { name: "Install unavailable" });
      await expect(unavailable.first()).toBeDisabled();
      await expect(unavailable.last()).toBeDisabled();
    } else {
      await expect(
        page.locator("code").filter({ hasText: /litespm(?:@latest)? install / }).first()
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
  // A plugin row reads by what it publishes: a plugin with a pinned git tree
  // installs (the path exists since 2026-10-19), and one without a fetchable
  // source does not. The badge must say which, and must agree with the entry
  // page it links to.
  const plugin =
    rows.find((row) => row.badge === "Installs a plugin") ??
    rows.find((row) => row.badge === "Not installable");
  expect(plugin, "every plugin row reads its installability").toBeTruthy();

  await page.goto(plugin!.href);
  await settle(page);
  await expect(page.locator("#pkg-title")).toHaveText(plugin!.name);

  // The badge decides which page this is. A plugin that publishes a pinned
  // tree installs (path added 2026-10-19), so its entry page offers the
  // command; one with no fetchable source is refused, so both affordances are
  // disabled. Asserting "unavailable" for every plugin was the pre-install-path
  // assumption, and it failed the moment a pinned plugin row existed.
  const chip = await page.locator("[data-testid='installability']").first().innerText();
  expect(chip.trim(), "the entry page and the badge must agree").toBe(plugin!.badge);

  if (plugin!.badge === "Not installable") {
    const unavailable = page.getByRole("button", { name: "Install unavailable" });
    await expect(unavailable.first()).toBeDisabled();
    await expect(unavailable.last()).toBeDisabled();
    return;
  }

  await expect(
    page.locator("code").filter({ hasText: /litespm(?:@latest)? install / }).first(),
    "an installable plugin's entry page must print the install command"
  ).toBeVisible();
});

test("an agent choice cannot label a transport-incompatible entry as supported", async ({ page }) => {
  const sseEntry = catalogRows().find(
    (row) =>
      row.kind === "mcp" &&
      row.transport === "sse" &&
      ["metadata_verified", "runtime_verified", "litespm_tested"].includes(row.installability ?? "") &&
      row.id !== FLAGSHIP_ID
  );
  expect(sseEntry, "the snapshot contains a verified SSE server for this compatibility check").toBeTruthy();

  await gotoSettled(page, entryFixture(sseEntry!).href);
  await page.getByRole("button", { name: "Choose an agent target" }).click();
  await page.getByRole("button", { name: "Codex", exact: true }).click();

  await expect(page.getByRole("button", { name: "Install unavailable" }).first()).toBeDisabled();
  await expect(page.getByText("Unsupported for Codex")).toBeVisible();
  await expect(page.getByText("Works with Codex")).toHaveCount(0);
});
