// Readers without JavaScript.
//
// Every route is pre-rendered, but Next's static export parks the HTML inside a
// hidden streaming shell (`<div hidden id="S:0">`) and a bootstrap script
// swaps it into place — so with scripting off the page was blank except for
// the skip link. The layout ships a `<noscript>` stylesheet that performs the
// swap and a note saying what genuinely needs scripting. These tests hold both
// halves: the content is visible, and the hero's freshness chip reads
// "bundled snapshot" instead of a loading state that can never resolve (the
// historical defect: "checking the catalog…" forever).

import { test, expect, installHermeticRouting } from "./support/site";
import { flagshipEntry, nonPreRenderedEntry, preRenderedEntry } from "./support/catalog";

const preRendered = preRenderedEntry();
const nonPreRendered = nonPreRenderedEntry();
const flagship = flagshipEntry();

const ROUTES: Array<{ path: string; heading?: string; text?: string }> = [
  { path: "/", heading: "Give your coding agents the tools they’re missing." },
  { path: "/explore/", heading: "Explore" },
  { path: "/agents/", heading: "Agent hosts" },
  { path: "/agents/claude-code/", heading: "Claude Code" },
  { path: "/categories/", heading: "Categories" },
  { path: "/compare/", heading: "Compare agent hosts" },
  { path: "/trending/", heading: "Coverage" },
  { path: "/package/", heading: "Find a package" },
  { path: preRendered.href, heading: preRendered.row.name },
];

for (const { path, heading, text } of ROUTES) {
  test(`${path} renders with JavaScript disabled`, async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1440, height: 900 },
    });
    await installHermeticRouting(context);
    const page = await context.newPage();
    await page.goto(path, { waitUntil: "domcontentloaded" });

    // The noscript stylesheet unhides the streaming shell.
    await expect(page.locator('div[id^="S:"]').first()).toBeVisible();
    if (heading) {
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
    if (text) {
      await expect(page.getByText(text).first()).toBeVisible();
    }
    await context.close();
  });
}

test("the hero's freshness chip is truthful without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await installHermeticRouting(context);
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // "snapshot" is true in every state the server can render. `exact` so a
  // regression back to the old "bundled snapshot" wording fails here.
  await expect(page.getByText("snapshot", { exact: true }).first()).toBeVisible();
  // And it must not claim a check that cannot have run.
  await expect(page.getByText("catalog is current")).toHaveCount(0);
  await expect(page.getByText("checking the catalog", { exact: false })).toHaveCount(0);
  await context.close();
});

for (const { label, entry } of [
  { label: "non-pre-rendered entry", entry: nonPreRendered },
  { label: "colon-bearing flagship", entry: flagship },
]) {
  test(`${label}: the Worker's no-JS block names the entry`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await installHermeticRouting(context);
    const page = await context.newPage();
    await page.goto(entry.href, { waitUntil: "domcontentloaded" });
    // Name and summary are in the served HTML inside the layout's noscript
    // block. "Open this entry" is the block's own link, so scoping to it keeps
    // the assertion on the Worker's output rather than on any other mention.
    const block = page.getByRole("link", { name: "Open this entry" }).locator("xpath=../..");
    await expect(block).toContainText(entry.row.name);
    if (entry.row.summary) {
      await expect(block).toContainText(entry.row.summary.slice(0, 40));
    }
    await context.close();
  });
}
