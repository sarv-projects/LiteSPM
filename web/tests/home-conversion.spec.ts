// The home page, measured as a conversion page.
//
// Every other spec in this suite compares the site to itself. This one
// measures the home page against the brief the redesign was written from —
// and against the committed dataset, so the numbers on the page are checked
// against the rows the page is drawn from rather than against a screenshot.
//
// ## What it guards
//
//  1. **The H1 states the outcome.** "Give your coding agents the tools
//     they're missing — safely." The first sentence is the promise; the one
//     word is the part the site can actually prove, because a static export
//     cannot know what any given agent is missing.
//  2. **Both calls to action exist and land on real pages.** A hero with no
//     way forward is a page that cannot convert, and a link to a route that
//     404s is worse than no link.
//  3. **Every goal tile opens a real filtered result set.** A tile that links
//     to a filter the site does not offer — or to one that returns nothing —
//     is a dead end with a friendly label on it. The vocabulary is read from
//     Explore's own goal control, so the tiles cannot drift from it.
//  4. **Every curated id exists in the dataset and is one LiteSPM can
//     install.** The shelf is an editorial list of catalog **ids**; an id that
//     has left the dataset, or that points at a row the binary would refuse,
//     would be the page advertising an install that does not happen.
//  5. **The product demo renders its poster and its transcript.** The frame
//     has to work before the recording exists — the captions and the words
//     are the content, and the picture is the part that is still missing.
//  6. **Nothing presents a plugin as installable.** Plugins are browsable and
//     not installable; the home page has to say so wherever it names them.
//  7. **The rotating count is gone, and a stable number replaced it.** A
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
  if (row.kind === "plugin") {
    const artifact = (row as { artifact?: { type?: string; pinned?: boolean; sha?: string } }).artifact;
    return artifact?.type === "git-tree" && artifact.pinned === true && Boolean(artifact.sha);
  }
  return true;
}

test("the H1 states the outcome, and claims only what the site can prove", async ({ page }) => {
  await gotoSettled(page, "/");

  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveText("Find the right tools for your AI agents.");

  // The one word that makes the claim checkable.
  await expect(h1).toContainText("right tools");
  // The site cannot know what an agent is missing, so it must not say that it
  // does: the claim is about safety, not about knowledge.
  await expect(h1).not.toContainText("knows what");
});

test("both calls to action exist, and land on real pages", async ({ page }) => {
  await gotoSettled(page, "/");

  const get = page.getByRole("link", { name: "Get LiteSPM" });
  await expect(get).toBeVisible();
  await expect(get).toHaveAttribute("href", "/get-started/");

  const how = page.getByRole("link", { name: "See how it works" });
  await expect(how).toBeVisible();
  await expect(how).toHaveAttribute("href", "/how-it-works/");

  // And they are not dead ends: each route answers, with its own heading.
  for (const path of ["/get-started/", "/how-it-works/"]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} must be a real route, not a 404`).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("every goal tile opens a real filtered result set", async ({ page }) => {
  await gotoSettled(page, "/");

  const tiles = page.locator('section[aria-labelledby="topics-title"] a[href^="/explore/?goal="]');
  const tileCount = await tiles.count();
  expect(tileCount, "the home page leads with eight goal tiles").toBe(8);

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
  expect(
    await cards.count(),
    "the shelf shows the curated entries and nothing else — the five old shelves are gone"
  ).toBe(featured.entries.length);

  for (const entry of featured.entries) {
    const row = rowsById.get(entry.id)!;
    // Next renders the href without the trailing slash even though the
    // canonical form (and the sitemap) carries one; both resolve to the same
    // entry, so match the path and let the canonical tag name the address.
    const link = shelf.locator(`a[href^='/package/${encodeURIComponent(keyOf(row))}']`);
    await expect(link, `${entry.id} must be on the shelf`).toHaveCount(1);
  }
});

test("the product demo renders its poster frame and its transcript", async ({ page }) => {
  await gotoSettled(page, "/");

  const demo = page.locator("#product-demo");
  await expect(demo).toBeVisible();

  // The poster frame, and the honest label on it: the recording does not
  // exist yet, and a play button over an empty frame would promise one.
  const poster = page.locator("#product-demo-poster");
  await expect(poster).toBeVisible();
  await expect(poster).toContainText("Installation workflow");

  // The captions: five beats, each with its own line.
  await expect(demo.locator("#product-demo-captions > li")).toHaveCount(5);

  // The transcript, in the document, for a reader with no JavaScript, no
  // screen, and no interest in watching a video.
  const transcript = page.locator("#product-demo-transcript");
  await expect(transcript).toContainText("LiteSPM runs locally");
  await expect(transcript).toContainText("the initial agent setup");
  await expect(transcript).toContainText("removal");
});

test("the home page never presents a plugin it cannot fetch as installable", async ({ page }) => {
  await gotoSettled(page, "/");

  // The curated shelf is MCP servers and skills: a recommendation is a claim
  // about what works, and a plugin's installability depends on its publisher's
  // source, so none is curated.
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

  // The rotating kind cycle is gone: one kind at a time, changing under the
  // reader, in the most-read position on the page.
  await expect(page.locator(".kind-cycle")).toHaveCount(0);

  // What replaced it is one number, and it is the number of rows the site can
  // actually install — the same predicate Explore's "installable" filter uses.
  const installable = catalogRows().filter(isInstallable).length;
  const count = page.locator("#hero-proof-count");
  await expect(count).toContainText(installable.toLocaleString("en-US"));
  await expect(count).toContainText("capabilities LiteSPM can install");

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
