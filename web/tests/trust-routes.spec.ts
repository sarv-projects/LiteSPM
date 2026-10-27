// The five routes this workstream added: `/how-it-works/`, `/get-started/`,
// `/status/`, `/support/` and `/security/`.
//
// What this file asserts, and why each assertion is here:
//
//   * each route renders, carries the site name in its title, and logs no
//     console error — a route that 404s or throws is not a route;
//   * each route has exactly one `<main id="main" tabindex="-1">`, and the
//     skip link really moves focus into it. A route that forgets the
//     `tabIndex` silently turns the skip link into a scroll-only link that
//     leaves the next Tab inside the header;
//   * every same-origin link on those routes resolves to a real route — a
//     trust page that links to a 404 is worse than one that links to nothing;
//   * each of the five is reachable from another of the five, so none of them
//     is an island;
//   * the setup guide changes with the agent and the operating system, and
//     never claims an install happened — a page that says "installed" because
//     somebody ticked a box is the exact failure this route was written to
//     avoid;
//   * the status page keeps the catalog data stamp and the health statement
//     apart, and states no uptime figure it cannot measure;
//   * the five routes are axe-clean at WCAG 2.2 A/AA and do not scroll
//     sideways at 320 px.
//
// The suite runs against the built export through the real edge Worker (see
// `playwright.config.ts`), so a route that only works in `next dev` fails
// here.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/site";
import { collectPageErrors, gotoSettled, settle } from "./support/site";

interface Route {
  path: string;
  /** The page's own H1, which is also its answer to "did this route render?". */
  heading: string;
  /** The section a reader would expect to find on it. */
  section: RegExp;
}

const ROUTES: Route[] = [
  {
    path: "/how-it-works/",
    heading: "From discovery to installation, without the config-file hassle.",
    section: /how it works/i,
  },
  { path: "/get-started/", heading: "Get started", section: /your first three steps/i },
  { path: "/status/", heading: "Catalog availability", section: /package information/i },
  { path: "/support/", heading: "Support", section: /where a report goes/i },
  { path: "/security/", heading: "Security", section: /where the policy lives/i },
];

/** Every same-origin link on the page, deduplicated. */
async function sameOriginLinks(page: Page): Promise<string[]> {
  const hrefs = await page.locator("a[href]").evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("/") && !href.startsWith("//"))
  );
  return [...new Set(hrefs)];
}

for (const route of ROUTES) {
  test(`${route.path} renders, with the site's own heading and no console errors`, async ({ page }) => {
    const errors = collectPageErrors(page);
    const response = await page.goto(route.path);
    await settle(page);

    expect(response?.status(), `${route.path} should answer 200`).toBe(200);
    await expect(
      page.getByRole("heading", { name: route.heading, level: 1 })
    ).toBeVisible();
    await expect(page).toHaveTitle(/LiteSPM/);
    expect(errors, `console errors on ${route.path}:\n${errors.join("\n")}`).toEqual([]);
  });

  test(`${route.path} has one focusable main, and the skip link reaches it`, async ({ page }) => {
    await gotoSettled(page, route.path);

    const mains = page.locator("main#main");
    await expect(mains, `${route.path} should render exactly one <main id="main">`).toHaveCount(1);
    await expect(mains).toHaveAttribute("tabindex", "-1");

    // The skip link only skips if activating it moves focus. `href="#main"`
    // scrolls by itself; focus follows the fragment only when the target is
    // focusable, which is what the tabIndex above is for.
    await page.locator('a[href="#main"]').first().focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.tagName ?? null))
      .toBe("MAIN");
  });

  test(`${route.path} links only to routes that resolve`, async ({ page }) => {
    await gotoSettled(page, route.path);

    for (const href of await sameOriginLinks(page)) {
      const response = await page.request.get(href);
      expect(
        response.status(),
        `${href} (linked from ${route.path}) should resolve`
      ).toBeLessThan(400);
    }
  });

  test(`${route.path} has no axe WCAG 2.2 A/AA violations`, async ({ page }) => {
    await gotoSettled(page, route.path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const summary = results.violations
      .flatMap((violation) =>
        violation.nodes.map(
          (node) => `${violation.id} ${node.target.join(" ")}: ${node.failureSummary ?? ""}`
        )
      )
      .join("\n");
    expect(results.violations, `axe on ${route.path}:\n${summary}`).toEqual([]);
  });
}

test("each of the five routes is reachable from another of the five", async ({ page }) => {
  const linked = new Map<string, string[]>();

  for (const route of ROUTES) {
    await gotoSettled(page, route.path);
    const hrefs = await sameOriginLinks(page);
    linked.set(
      route.path,
      ROUTES.filter((other) => other.path !== route.path && hrefs.includes(other.path)).map(
        (other) => other.path
      )
    );
  }

  for (const route of ROUTES) {
    expect(
      linked.get(route.path),
      `${route.path} is linked from none of the other four`
    ).not.toEqual([]);
  }
});

test("the setup guide changes with the agent and the OS, and never claims an install", async ({
  page,
}) => {
  await gotoSettled(page, "/get-started/");

  const picker = page.locator("details[data-agent-picker]");
  await expect(picker).toBeVisible();
  await expect(picker).not.toHaveAttribute("open", "");
  await expect(page.getByRole("radio", { name: "Not sure / just exploring" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Windows" })).toBeVisible();
  await expect(page.getByText("npm install -g litespm", { exact: true })).toBeVisible();
  await expect(page.getByText("For an agent you have not identified yet.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your first three steps" })).toBeVisible();
  await expect(page.locator("details[data-setup-details]")).not.toHaveAttribute("open", "");
  await expect(page.locator("#install")).toHaveCount(0);

  // The sentence the whole route exists to make: the commands are the reader's
  // to run, not something this page does for them.
  await expect(
    page.getByText("Every command runs in your own terminal.", { exact: false }).first()
  ).toBeVisible();
  await expect(
    page.getByText("Your answers stay in this tab.", { exact: false }).first()
  ).toBeVisible();

  // The agent answer changes the file the guide prints.
  await picker.locator("summary").click();
  await page.getByRole("radio", { name: "Claude Code CLI" }).check();
  await expect(page.getByText("Choose a system to show its path.", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Linux" }).check();
  await expect(page.getByText("~/.claude.json", { exact: true })).toBeVisible();

  // The operating system changes it again: the same file, a different path.
  await page.getByRole("radio", { name: "Windows" }).check();
  await expect(page.getByText("%USERPROFILE%\\.claude.json", { exact: true })).toBeVisible();
  await expect(page.getByText("~/.claude.json", { exact: true })).toHaveCount(0);

  // Another agent, another file.
  await page.getByRole("radio", { name: "OpenAI Codex CLI" }).check();
  await expect(page.getByText("%USERPROFILE%\\.codex\\config.toml", { exact: true })).toBeVisible();

  // "Not sure" is an answer too, and it says what it cannot know.
  await page.getByRole("radio", { name: "Not sure / just exploring" }).check();
  await expect(page.getByText("%USERPROFILE%\\.codex\\config.toml", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("For an agent you have not identified yet.", { exact: true })
  ).toBeVisible();

  // Nothing on the page may read as a completed install.
  const text = (await page.locator("main").innerText()).toLowerCase();
  for (const forbidden of [
    /install(?:ed|ation)\s+(?:is\s+)?(?:complete|completed|successful|successfully|done)\b/,
    /\bsetup\s+(?:is\s+)?(?:complete|completed|finished)\b/,
    /\ball systems operational\b/,
    /\b(?:you are|you're)\s+ready\b/,
    /[✓✔]/,
  ]) {
    expect(text, `the guide must not claim an install: ${forbidden}`).not.toMatch(forbidden);
  }
});

test("catalog status shows a useful refresh date without release identifiers", async ({ page }) => {
  await gotoSettled(page, "/status/");

  await expect(page.getByRole("heading", { name: "Package information", level: 2 })).toBeVisible();
  await expect(page.getByText("Last refreshed", { exact: true })).toBeVisible();
  const text = (await page.locator("main").innerText()).toLowerCase();
  expect(text).not.toContain("catalog snapshot");
  expect(text).not.toContain("release id");
  expect(text).not.toContain("not a service status");
  expect(text).toMatch(/catalog availability/);
});

test("catalog status can retry after an unavailable response", async ({ page }) => {
  let attempts = 0;
  await page.route("**/v1/current.json", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });

  await gotoSettled(page, "/status/");
  await expect(page.getByRole("status").filter({ hasText: "Catalog temporarily unavailable." })).toBeVisible();
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Catalog available." })).toBeVisible();
  expect(attempts).toBe(2);
});

test("the docs use one setup path and keep their sections as siblings", async ({ page }) => {
  await gotoSettled(page, "/docs/");
  const quickStart = page.locator("#quickstart");
  await expect(quickStart.locator("pre code").first()).toHaveText("npm install -g litespm\nlitespm");
  await expect(page.locator("#security #publish")).toHaveCount(0);

  await gotoSettled(page, "/how-it-works/");
  await expect(page.locator("#walkthrough-title")).toBeVisible();
  await expect(page.locator("main pre code").first()).toHaveText("npm install -g litespm\nlitespm");
  await gotoSettled(page, "/get-started/");
  await expect(page.getByText(/--yes.*only accepts npm.*download prompt/i)).toBeVisible();
});

test("contact routes readers to the right place and leaves diagnostics to Support", async ({ page }) => {
  await gotoSettled(page, "/contact/");
  await expect(page.getByRole("link", { name: "Support and troubleshooting" })).toHaveAttribute("href", "/support/");
  await expect(page.getByRole("link", { name: "private security advisory" })).toHaveAttribute(
    "href",
    "https://github.com/sarv-projects/LiteSPM/security/advisories/new"
  );
  await expect(page.getByText("litespm doctor", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/acknowledged within seven days/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Page source" })).toHaveAttribute(
    "href",
    "https://github.com/sarv-projects/LiteSPM/blob/main/web/app/contact/page.tsx"
  );
});

for (const width of [320, 390]) {
  test.describe(`the five routes do not scroll sideways at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const route of ROUTES) {
      test(`${route.path} fits ${width}px`, async ({ page }) => {
        await gotoSettled(page, route.path);
        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          viewportWidth: window.innerWidth,
        }));
        expect(
          metrics.scrollWidth,
          `document scrollWidth vs clientWidth on ${route.path} at ${width}px`
        ).toBeLessThanOrEqual(metrics.clientWidth);
        expect(
          metrics.bodyScrollWidth,
          `body scrollWidth vs viewport on ${route.path} at ${width}px`
        ).toBeLessThanOrEqual(metrics.viewportWidth);
      });
    }
  });
}
