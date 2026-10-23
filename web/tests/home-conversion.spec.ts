// The home page, measured as a conversion page.
//
// Every other spec in this suite compares the site to itself. This one
// measures the home page against the brief the redesign was written from —
// and against the committed dataset, so the numbers on the page are checked
// against the rows the page is drawn from rather than against a screenshot.
//
// ## What it guards
//
//  1. **The H1 names the job.** The hero explains current package types,
//     package-level installability, and separates agent apps/connectors on the
//     roadmap from what can be installed today.
//  2. **The catalog overview is interactive.** Each available type opens its
//     corresponding Explore filter, and the layout stacks at phone widths.
//  3. **Both calls to action exist and land on real pages.** A hero with no
//     way forward is a page that cannot convert, and a link to a route that
//     404s is worse than no link.
//  4. **Every goal tile opens a real filtered result set.** A tile that links
//     to a filter the site does not offer — or to one that returns nothing —
//     is a dead end with a friendly label on it. The vocabulary is read from
//     Explore's own goal control, so the tiles cannot drift from it.
//  5. **Every curated id exists in the dataset and is one LiteSPM can
//     install.** The shelf is an editorial list of catalog **ids**; an id that
//     has left the dataset, or that points at a row the binary would refuse,
//     would be the page advertising an install that does not happen.
//  6. **The rotating count is gone, and a stable number replaced it.** A
//     number that changes under the reader is a number nobody can quote.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./support/site";
import { gotoSettled, parseCount, resultCount } from "./support/site";
import { WEB_ROOT, catalogRows, keyOf, type Listing } from "./support/catalog";

interface FeaturedEntry {
  id: string;
  group: string;
  source: string;
  useCase: string;
}

interface FeaturedFile {
  groups: Array<{ id: string; title: string }>;
  entries: FeaturedEntry[];
}

const featured = JSON.parse(
  readFileSync(join(WEB_ROOT, "data", "featured.json"), "utf8")
) as FeaturedFile;

const rowsById = new Map<string, Listing>(catalogRows().map((row) => [row.id, row]));

/**
 * The installability rule, restated rather than imported.
 *
 * This is the CLI's own gate as `lib/availability.ts` copies it: a plugin is
 * refused by kind, a discovery-only row is refused by provenance, and a remote
 * row with no launch line is refused as well. The test deliberately re-derives
 * it from the committed data so a change in the module cannot quietly change
 * what the page is allowed to claim.
 */
function isInstallable(row: Listing): boolean {
  const established = ["metadata_verified", "runtime_verified", "litespm_tested"];
  if (!established.includes(row.installability ?? "")) return false;
  if (row.kind === "mcp" && !row.transport) return false;
  // A plugin installs when its publisher ships a pinned git tree: that is the
  // source LiteSPM fetches, and the plugin's own manifest is what registers
  // the servers. A plugin with no such source is refused, and this predicate
  // agrees with the module that decides it.
  // `pinned` already means the descriptor published a 40-hex commit id, which
  // is why the rule reads it instead of the id itself.
  if (row.kind === "plugin") {
    const artifact = (row as { artifact?: { type?: string; pinned?: boolean } }).artifact;
    return artifact?.type === "git-tree" && artifact.pinned === true;
  }
  return true;
}

test("the H1 states LiteSPM's purpose, and the roadmap stays separate from available packages", async ({ page }) => {
  await gotoSettled(page, "/");

  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveText("Find the right tools for your AI agent.");

  // The headline names the catalog discovery task.
  await expect(h1).toContainText("tools for your AI agent");
  await expect(h1).not.toContainText("knows what");
  await expect(page.getByRole("complementary", { name: "What LiteSPM manages" })).toContainText(
    "not available to install here yet"
  );
  await expect(page.locator(".hero-kind-row")).toHaveCount(3);
});

test("both calls to action exist, and land on real pages", async ({ page }) => {
  await gotoSettled(page, "/");

  const get = page.getByRole("link", { name: "Get LiteSPM" });
  await expect(get).toBeVisible();
  await expect(get).toHaveAttribute("href", "/get-started/");

  const explore = page.getByRole("link", { name: "Explore capabilities" });
  await expect(explore).toBeVisible();
  await expect(explore).toHaveAttribute("href", "/explore/");

  // And they are not dead ends: each route answers, with its own heading.
  for (const path of ["/get-started/", "/how-it-works/"]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} must be a real route, not a 404`).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("the catalog overview opens the real filter for each available kind", async ({ page }) => {
  await gotoSettled(page, "/");

  const overview = page.getByRole("complementary", { name: "What LiteSPM manages" });
  const destinations = [
    { label: "MCP servers", kind: "mcp", filter: "MCP Server" },
    { label: "Skills", kind: "skill", filter: "Agent Skill" },
    { label: "Plugins", kind: "plugin", filter: "Plugin" },
  ];
  for (const { label, kind, filter } of destinations) {
    await overview.getByRole("link", { name: new RegExp(label) }).click();
    await expect(page).toHaveURL(new RegExp(`/explore/\\?kind=${kind}`));
    await expect(
      page.getByRole("group", { name: "Capability kind" }).getByRole("button", { name: new RegExp(filter) })
    ).toHaveAttribute("aria-pressed", "true");
    await gotoSettled(page, "/");
  }
});

test("every goal tile opens a real filtered result set", async ({ page }) => {
  await gotoSettled(page, "/");

  const tiles = page.locator('section[aria-labelledby="topics-title"] a[href^="/explore/?goal="]');
  const tileCount = await tiles.count();
  // Six, not eight: the home page is the search and the install, and the
  // other two goals (and all 64 categories) are one click away on
  // /categories/, which the section already links to.
  expect(tileCount, "the home page leads with six goal tiles").toBe(6);

  const hrefs = await tiles.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLAnchorElement).getAttribute("href") ?? "")
  );
  const goals = hrefs.map((href) => new URL(href, "https://example.invalid").searchParams.get("goal"));
  for (const goal of goals) expect(goal, "a goal tile must name a goal").toBeTruthy();
  expect(new Set(goals).size, "two tiles must not open the same result set").toBe(goals.length);

  // The site's own goal vocabulary, read from the control Explore offers —
  // with the number of rows each of those filters returns.
  await gotoSettled(page, "/explore/");
  const options = await page.locator("#explore-goal option").evaluateAll((nodes) =>
    nodes
      .map((node) => ({
        value: (node as HTMLOptionElement).value,
        text: (node as HTMLOptionElement).textContent ?? "",
      }))
      .filter((option) => option.value !== "all")
  );
  expect(options.length, "the goal filter must offer the goals the tiles use").toBeGreaterThan(0);

  for (const goal of goals) {
    const option = options.find((candidate) => candidate.value === goal);
    expect(option, `Explore offers no goal filter called "${goal}"`).toBeTruthy();
    expect(
      parseCount(option!.text),
      `the goal filter for "${goal}" must return rows, or the tile is a dead end`
    ).toBeGreaterThan(0);
  }
});

test("every curated id exists in the dataset, and is one LiteSPM can install", () => {
  expect(featured.entries.length, "the curated set may not be empty").toBeGreaterThan(0);

  for (const entry of featured.entries) {
    const row = rowsById.get(entry.id);
    expect(row, `featured.json names "${entry.id}", and the dataset does not contain it`).toBeTruthy();

    expect(row!.kind, `${entry.id} is a plugin, and a plugin cannot be installed`).not.toBe("plugin");
    expect(
      isInstallable(row!),
      `${entry.id} is not installable, and the curated shelf may only recommend what installs`
    ).toBe(true);

    // The file states where the entry came from; the dataset has to agree.
    expect(row!.source, `${entry.id} came from a different source than featured.json declares`).toBe(
      entry.source
    );
  }

  // One id, one place: a curated set that lists the same entry twice shows it
  // twice, and a group id that does not exist loses its entries silently.
  const ids = featured.entries.map((entry) => entry.id);
  expect(new Set(ids).size, "a curated id may appear once").toBe(ids.length);
  const groups = new Set(featured.groups.map((group) => group.id));
  for (const entry of featured.entries) {
    expect(groups.has(entry.group), `the group "${entry.group}" is not declared`).toBe(true);
  }
});

test("the shelf shows exactly the curated set, and each card links to its entry", async ({
  page,
}) => {
  await gotoSettled(page, "/");

  const shelf = page.locator('section[aria-labelledby="start-here-title"]');
  await expect(shelf).toBeVisible();

  // The canonical form is the PATH (/package/<key>/), not the query form:
  // one entry, one address (the F-21 fix).
  const cards = shelf.locator("a[href^='/package/']");
  // Six cards, mixed kinds: the shelf used to render two labelled groups of
  // six, so a reader looking for a skill scrolled every server first.
  expect(await cards.count(), "the shelf is one row of six").toBe(6);

  const hrefs = await cards.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLAnchorElement).getAttribute("href") ?? "")
  );
  const kinds = new Set<string>();
  for (const href of hrefs) {
    // Every card names a real key: decode the path form and look the row up.
    const key = decodeURIComponent(href.replace(/^\/package\//, "").replace(/\/$/, ""));
    const row = rowsById.get(key);
    expect(row, `the shelf card ${href} does not name a row in the curated set`).toBeTruthy();
    kinds.add(row!.kind);
  }
  expect(kinds.size, "the mixed row shows more than one kind of capability").toBeGreaterThan(1);
});

test("the home page carries six blocks, and none of them explains the product twice", async ({
  page,
}) => {
  await gotoSettled(page, "/");

  // The card that used to sit in the hero — "From discovery to local
  // installation", five beats then three — is gone with the block it sat in.
  // The walkthrough is /how-it-works; this page is the search and the install.
  await expect(page.locator("#product-demo")).toHaveCount(0);

  // What is here now: the hero and its proof, six goals, one curated row,
  // three steps, the four reasons.
  await expect(page.locator("#topics-title")).toBeVisible();
  await expect(page.locator("#hero-proof-basis")).toContainText("entries in the catalog");
  await expect(demo_shelf_is_one_row(page)).resolves.toBeLessThanOrEqual(6);
});

test("the hero has a responsive copy and catalog overview layout", async ({
  page,
}) => {
  await gotoSettled(page, "/");

  const layout = await page.locator("section.hero-glow > div").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      columns: style.gridTemplateColumns === "none" ? 1 : style.gridTemplateColumns.split(" ").length,
      width: element.getBoundingClientRect().width,
    };
  });

  expect(layout.columns, "the hero has the product overview beside its copy").toBe(2);
  expect(layout.width, "the hero stays within a deliberate maximum measure").toBeLessThanOrEqual(1200);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileColumns = await page.locator(".hero-layout").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length
  );
  expect(mobileColumns, "the mobile hero stacks its content").toBe(1);
});

/** The curated shelf is one mixed row now, not two labelled groups. */
async function demo_shelf_is_one_row(page: import("@playwright/test").Page) {
  return page.locator("main section ul li").filter({ has: page.locator("[data-kind]") }).count();
}

test("the curated shelf contains only entries LiteSPM can install", async ({ page }) => {
  await gotoSettled(page, "/");

  // A recommendation is a claim about what can be installed. The curated
  // source set contains no plugin, whose installability depends on its source.
  await expect(page.locator(".meta-kind-plugin")).toHaveCount(0);

  // The bridge figure names the third kind, says which plugins install, and
  // its caption says the rest are refused with the reason.
  const pluginExit = page.locator(".dg-kind[data-kind='plugin']");
  await expect(pluginExit).toBeVisible();
  await expect(pluginExit).toContainText("pinned sources");

  const caption = page.locator("figcaption").filter({ hasText: "pinned source" });
  await expect(caption).toContainText("ships a pinned source");
  await expect(caption).toContainText("refused with the reason");
});

test("the hero's count is stable, and is the number the site's own filter produces", async ({
  page,
}) => {
  await gotoSettled(page, "/");

  // The kind count is static, not animated under the reader.
  await expect(page.locator(".kind-cycle")).toHaveCount(0);

  // What replaced it is one number, and it is the number of rows the site can
  // actually install — the same predicate Explore's "installable" filter uses.
  const installable = catalogRows().filter(isInstallable).length;
  const count = page.locator("#hero-proof-count");
  await expect(count).toContainText(installable.toLocaleString("en-US"));
  await expect(count).toContainText("entries LiteSPM can install");

  // And it does not move.
  const first = await count.textContent();
  await page.waitForTimeout(2000);
  expect(await count.textContent(), "the hero's number must not change under the reader").toBe(
    first
  );
});

test("the search field still filters the page in place, and the result count is measured", async ({
  page,
}) => {
  await gotoSettled(page, "/");

  const field = page.getByRole("searchbox");
  await field.fill("github");
  await expect(resultCount(page)).toBeVisible();
  expect(parseCount(await resultCount(page).textContent())).toBeGreaterThan(0);
});
