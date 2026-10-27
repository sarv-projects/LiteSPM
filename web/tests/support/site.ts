// Shared Playwright fixtures for the browser suite.
//
// Two rules every spec inherits:
//
// 1. **Hermetic transport.** The site's publisher marks load from GitHub's
//    avatar hosts and Google's favicon service. Those are real, documented
//    third-party fetches — the suite does not pretend otherwise — but a test
//    must not depend on someone else's uptime or latency. Every non-test-origin
//    request is fulfilled locally: images with a 64×64 PNG (large enough that
//    the tile accepts it rather than stepping to its next candidate), anything
//    else with an empty 204. Same-origin requests are untouched.
// 2. **Settle before asserting.** `networkidle` plus an explicit wait for
//    fonts and two animation frames. This project's history is explicit about
//    why: three "missing logo" bug reports were screenshots taken before lazy
//    images settled.

import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

/** A flat 64×64 PNG — the tile's acceptance threshold is >16px. */
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAmElEQVR4nO3QMQ0AIBDAwPdvlYQFASDjBjrc3nTWPvdnowO0BugArQE6QGuADtAaoAO0BugArQE6QGuADtAaoAO0BugArQE6QGuADtAaoAO0BugArQE6QGuADtAaoAO0BugArQE6QGuADtAaoAO0BugArQE6QGuADtAaoAO0BugArQE6QGuADtAaoAO0BugArQE6QGuADtAeepqzhf8q0QoAAAAASUVORK5CYII=",
  "base64"
);

export async function installHermeticRouting(context: BrowserContext): Promise<void> {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return route.continue();
    }
    if (route.request().resourceType() === "image") {
      return route.fulfill({ status: 200, contentType: "image/png", body: PLACEHOLDER_PNG });
    }
    return route.fulfill({ status: 204, body: "" });
  });
}

/**
 * Serve every image request from the local placeholder.
 *
 * A test that walks tens of real pages in one browser context pays for every
 * brand mark on every load; on the 8 GB runner the host-identity walk crashed
 * its target doing exactly that. The images are not what those tests assert on.
 * It takes a page or a whole context, so a walk that gives each chunk its own
 * context stubs them all the same way.
 * `fallback()` rather than `continue()`: page routes run before the context's
 * hermetic route, and this one has to hand anything that is not an image back
 * to it.
 */
export async function stubImages(target: Page | BrowserContext): Promise<void> {
  await target.route("**/*", (route) => {
    if (route.request().resourceType() === "image") {
      return route.fulfill({ status: 200, contentType: "image/png", body: PLACEHOLDER_PNG });
    }
    return route.fallback();
  });
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await installHermeticRouting(context);
    await use(context);
  },
});

export { expect };

/**
 * The explicit settle: the load has gone quiet, fonts are ready, and two
 * animation frames have been painted. Callers that need more (a fetch, a
 * hydration effect) should wait for the thing itself on top of this.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}

/** Navigate and settle. */
export async function gotoSettled(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await settle(page);
}

/**
 * Collect console errors and uncaught page errors from now on. Chromium logs
 * failed resource loads as console errors too, which is why the suite runs
 * hermetically: a flaky third-party icon must not be able to fail the
 * "zero console errors" gate.
 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/** Requests the page made under `/data/` — the dataset, never a passive load. */
export function collectDataRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/data/")) requests.push(path);
  });
  return requests;
}

/**
 * The result count on Explore (`ExtensionGrid`'s polite count). The hook is a
 * `data-testid` added for this suite; it is the one place a test needed one.
 */
export function resultCount(page: Page) {
  return page.getByTestId("result-count");
}

/**
 * Wait until Explore is showing the *measured* grid for a query: the heading
 * only renders once the row set is in hand (the skeleton has no heading), and
 * the first row only renders once the index search has settled — until then
 * the grid count and the SearchBar both read "searching…". Waiting for a row
 * is the settled signal.
 */
export async function waitForSearchGrid(page: Page, query: string): Promise<void> {
  await expect(
    page.locator("main h2").filter({ hasText: `Results for “${query}”` })
  ).toBeVisible();
  await expect(page.locator("main a[data-kind]").first()).toBeVisible({ timeout: 60_000 });
  await expect(resultCount(page)).toBeVisible();
  await expect(resultCount(page)).not.toHaveText("searching…", { timeout: 60_000 });
}

/**
 * The agent filter on Explore.
 *
 * `getByLabel` is not usable here: the control is wrapped by its `<label>`, and
 * Playwright's label-text algorithm folds the select's own options into the
 * label text, so neither a loose nor an exact name is stable. The wrapping
 * label element is.
 */
export function agentFilterSelect(page: Page) {
  return page.locator("#explore-host");
}

/**
 * Wait until Explore's grid is rendered for a deep-linked filter (no query).
 *
 * The filter control and result header stay visible while the full row set is
 * requested. The count must leave its loading label before the test reads it.
 */
export async function waitForFilteredGrid(
  page: Page,
  filter: { host?: string; publisher?: string } = {}
): Promise<void> {
  if (filter.host) {
    await expect(agentFilterSelect(page)).toHaveValue(filter.host);
  }
  if (filter.publisher) {
    await expect(
      page.getByRole("button", { name: `Clear the ${filter.publisher} publisher filter` })
    ).toBeVisible();
  }
  await expect(resultCount(page)).toBeVisible();
  await expect(resultCount(page)).not.toHaveText("searching…");
  const count = parseCount(await resultCount(page).textContent());
  if (count > 0) {
    // A settled count can precede the full row request for advanced filters
    // and explicit sorts. Do not let callers read the prerendered/windowed
    // order while the rows for the selected filter are still arriving.
    await expect(page.locator("main a[data-kind]").first()).toBeVisible();
  } else {
    await expect(page.locator("main a[data-kind]")).toHaveCount(0);
  }
}

/** The plain number a count element shows: "2,365 entries" → 2365. */
export function parseCount(text: string | null): number {
  if (!text) throw new Error("no count text");
  const digits = text.replace(/[^\d]/g, "");
  if (digits === "") throw new Error(`no digits in count text: ${text}`);
  return Number.parseInt(digits, 10);
}
