// The entry page's details (F-10, F-11, F-16, F-21, F-23) and the agent
// host pages (F-09).
//
// F-10: the entry page never showed a star, a download count or an install
//   count, and never said why. The absence was explained in `/terms/` and on
//   the Coverage boards, and nowhere on the page where a reader arriving
//   from a competitor's listing feels it.
//
// F-11: a skill's Capabilities tab was five consecutive "not published" rows
//   with the one useful fact — the source repository — last.
//
// F-16: the publisher link in the Details → Source block was under the WCAG
//   2.2 AA 24×24 target-size floor, and axe reported it as a serious
//   violation on every entry page.
//
// F-21: the site linked to `/package/?slug=…` and its own sitemap advertised
//   `/package/<key>/` — two URL shapes for one entry.
//
// F-23: the home page said `litespm setup` and the entry page said `litespm`
//   for the same step.
//
// F-09: twenty-nine of the seventy-nine hosts the catalog names had no page:
//   they were listed on `/agents/`, offered in Explore's "Works with" list,
//   and 404'd when a reader followed them.

import { expect, test } from "./support/site";
import { gotoSettled, settle } from "./support/site";
import { flagshipEntry, preRenderedEntry } from "./support/catalog";

const preRendered = preRenderedEntry();
const flagship = flagshipEntry();

test("the entry page explains the absence of a popularity figure", async ({ page }) => {
  await gotoSettled(page, flagship.href);
  await page.getByRole("tab", { name: "Source" }).click();
  await expect(
    page.getByText("No star or download count exists for this entry", { exact: false })
  ).toBeVisible();
});

test("a skill's Capabilities tab leads with its source and collapses the absences", async ({
  page,
}) => {
  await gotoSettled(page, flagship.href);
  await page.getByRole("tab", { name: "Capabilities" }).click();
  const panel = page.locator("#pkg-panel-capabilities");
  await expect(panel).toBeVisible();

  // One sentence for the absences, not five rows of "not published".
  const absent = await panel.getByText("not published", { exact: true }).count();
  expect(absent, "the Capabilities tab is a list of absences again").toBe(0);
  await expect(
    panel.getByText("The catalog publishes no", { exact: false })
  ).toBeVisible();
});

test("every link in the entry page's source block is at least 24px tall (WCAG 2.2 SC 2.5.8)", async ({
  page,
}) => {
  await gotoSettled(page, flagship.href);
  await page.getByRole("tab", { name: "Source" }).click();
  const links = page.locator("#pkg-panel-source a[href]");
  const count = await links.count();
  expect(count, "the source panel carries no links").toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const box = await links.nth(i).boundingBox();
    expect(box, "a source link has no box").not.toBeNull();
    expect(box!.height, `a source link is ${box!.height}px tall`).toBeGreaterThanOrEqual(24);
  }
});

test("the entry page's install command is the one the CLI accepts, and the id is in reach", async ({
  page,
}) => {
  await gotoSettled(page, flagship.href);

  // The command the page prints, and the id it names, are the same id the
  // catalog holds — the site's own gate (`scripts/check-install-command.mjs`)
  // checks the form against the CLI's own flag parser.
  const command = page.locator("code").filter({ hasText: /litespm install/ }).first();
  await expect(command).toBeVisible();
  await expect(command).toHaveText(`litespm install ${flagship.row.id}`);

  // The exact id is always on the page, in copyable form: either the headline
  // command (the id form) or the "Details" disclosure (the short form).
  const ids = page.locator("code").filter({ hasText: flagship.row.id });
  expect(await ids.count(), "the exact id is nowhere on the page").toBeGreaterThan(0);
});

test("one entry, one address: the links use the path form the sitemap advertises", async ({
  page,
}) => {
  await gotoSettled(page, "/explore/");
  const hrefs = await page.locator("main a[data-kind]").evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? "")
  );
  expect(hrefs.length, "the grid rendered no rows").toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href, "a result row links to the legacy query form").toMatch(/^\/package\/[^?]+\/$/);
  }
});

test("the legacy query address still lands on the entry, and ends up canonical", async ({
  page,
}) => {
  await gotoSettled(page, flagship.queryHref);
  await expect(page.locator("#pkg-title")).toHaveText(flagship.row.name);
  await expect
    .poll(() => new URL(page.url()).pathname, { message: "the address bar should carry the path form" })
    .toBe(flagship.href);
});

test("one step, one command: the entry page and the home page agree on setup", async ({
  page,
}) => {
  await gotoSettled(page, flagship.href);
  // The COMMANDS the steps give, not every mention of the binary's name: the
  // manual-setup prose legitimately says "the one `litespm` entry LiteSPM
  // adds". What must not appear is a step whose command is the bare
  // `litespm` - that is a second spelling of the same step, and a reader
  // cannot tell which one to run.
  const steps = await page.locator("#pkg-steps code").allTextContents();
  const setup = steps.filter((text) => text.trim() === "litespm setup");
  expect(setup.length, "the entry page does not print `litespm setup`").toBeGreaterThan(0);
  // The bare wizard invocation is not a second spelling of the same step.
  expect(
    steps.filter((text) => text.trim() === "litespm"),
    "the entry page still prints the bare `litespm` for setup"
  ).toHaveLength(0);
});

test("every host the catalog names has a page", async ({ page }) => {
  await gotoSettled(page, "/agents/");
  const rows = await page.locator("main ul > li").count();
  expect(rows, "the host index lists no hosts").toBeGreaterThan(50);

  // Every host's NAME links to that host's own page. The counts beside the
  // name link to Explore filtered by that host, which is a different thing
  // and is meant to be.
  const hostLinks = await page
    .locator("main ul > li a[href^='/agents/']")
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? ""));
  expect(
    hostLinks.length,
    "some host rows still link somewhere that is not a host page"
  ).toBe(rows);

  // Every one of them answers with the host's own page.
  for (const href of hostLinks) {
    const response = await page.goto(href);
    expect(response?.status(), `${href} does not answer`).toBe(200);
    await settle(page);
    await expect(
      page.getByRole("heading", { level: 1 }),
      `${href} has no host name`
    ).toBeVisible();
  }
});

test("a skills-only host says what LiteSPM does for it", async ({ page }) => {
  // "Warp" has a skills directory and no MCP configuration adapter.
  await gotoSettled(page, "/agents/warp/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Warp");
  await expect(
    page.getByText("LiteSPM installs agent skills into Warp", { exact: false })
  ).toBeVisible();
  // No config file is shown, because there is none to show.
  await expect(page.getByRole("heading", { name: "Config file" })).toHaveCount(0);
});
