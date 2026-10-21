// Accessibility: keyboard reachability, focus visibility, and contrast.
//
// What this covers, and what it does not:
//
//   * `@axe-core/playwright` with the `color-contrast` rule only, on the main
//     routes. Axe's contrast check cannot see through gradients, images,
//     pseudo-element text or overlapping layers, and it does not judge whether
//     a *focus indicator* exists at all — hence the separate checks below.
//   * Keyboard-only reachability of the primary controls, and a computed-style
//     check that every stop paints a focus indicator (outline or shadow, not
//     transparent).
//
// Not covered here: screen-reader announcement order, zoom/reflow beyond
// 390px, motion sensitivity beyond `tests/motion.spec.ts`, and the parts of
// axe's ruleset that are not contrast. A clean run is evidence about these
// specific properties, not a statement that the site is accessible.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./support/site";
import { gotoSettled } from "./support/site";
import { flagshipEntry, nonPreRenderedEntry, preRenderedEntry } from "./support/catalog";

const preRendered = preRenderedEntry();
const nonPreRendered = nonPreRenderedEntry();
const flagship = flagshipEntry();

const CONTRAST_ROUTES = [
  "/",
  "/explore/",
  "/agents/",
  "/agents/claude-code/",
  "/categories/",
  "/compare/",
  "/insights/",
  "/package/",
  "/privacy/",
  "/contact/",
  "/terms/",
  preRendered.href,
  nonPreRendered.href,
  flagship.href,
];

for (const path of CONTRAST_ROUTES) {
  test(`contrast: ${path} has no color-contrast violations`, async ({ page }) => {
    await gotoSettled(page, path);
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    const summary = results.violations
      .flatMap((violation) =>
        violation.nodes.map(
          (node) => `${violation.id} ${node.target.join(" ")}: ${node.failureSummary ?? ""}`
        )
      )
      .join("\n");
    expect(results.violations, `axe color-contrast on ${path}:\n${summary}`).toEqual([]);
  });
}

test.describe("dark theme contrast", () => {
  test.use({ colorScheme: "dark" });

  for (const path of ["/", "/explore/", "/package/00widget/", "/privacy/"]) {
    test(`contrast: ${path} in the dark palette has no color-contrast violations`, async ({
      page,
    }) => {
      await gotoSettled(page, path);
      // The theme script pins `data-theme="system"`; the dark palette applies
      // through `prefers-color-scheme`, so prove the emulation took effect
      // before judging contrast against it.
      await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
      const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(paper, "the dark palette should be active").toBe("rgb(11, 14, 20)");
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      const summary = results.violations
        .flatMap((violation) =>
          violation.nodes.map(
            (node) => `${violation.id} ${node.target.join(" ")}: ${node.failureSummary ?? ""}`
          )
        )
        .join("\n");
      expect(results.violations, `axe color-contrast (dark) on ${path}:\n${summary}`).toEqual([]);
    });
  }
});

test("keyboard: every tab stop paints a visible focus indicator, and the primary controls are reachable", async ({
  page,
}) => {
  await gotoSettled(page, "/");

  const stops: Array<{ label: string; visible: boolean }> = [];
  for (let press = 0; press < 14; press += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const alpha = (color: string): number => {
        const match = /rgba?\(([^)]+)\)/.exec(color);
        if (!match) return 1;
        const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
        return parts.length === 4 ? parts[3] : 1;
      };
      const outlinePainted = (node: Element): boolean => {
        const style = getComputedStyle(node);
        return (
          style.outlineStyle !== "none" &&
          Number.parseFloat(style.outlineWidth) >= 1 &&
          alpha(style.outlineColor) > 0
        );
      };
      // The focused element may paint the ring itself, or a wrapper may paint
      // it with `:focus-within` (the search field does — its ring is an
      // outline on the bordered wrapper). Ancestors are accepted for outlines
      // only: a card's decorative box-shadow is not a focus indicator.
      let visible = outlinePainted(el) || getComputedStyle(el).boxShadow !== "none";
      let node: Element | null = el.parentElement;
      for (let depth = 0; node && depth < 3 && !visible; depth += 1, node = node.parentElement) {
        visible = outlinePainted(node);
      }
      return {
        label: (
          el.getAttribute("aria-label") ||
          el.getAttribute("placeholder") ||
          el.textContent ||
          el.tagName
        )
          .trim()
          .slice(0, 48),
        visible,
      };
    });
    expect(stop, "a tab stop should focus an element").not.toBeNull();
    stops.push(stop!);
  }

  // The skip link is the first stop, as the layout intends.
  expect(stops[0].label).toBe("Skip to content");
  for (const stop of stops) {
    expect(stop.visible, `no focus indicator on stop "${stop.label}"`).toBe(true);
  }

  const labels = stops.map((stop) => stop.label).join(" | ");
  for (const expected of ["Search the catalog", "Install LiteSPM", "Explore"]) {
    expect(labels, `expected "${expected}" among the first 14 stops`).toContain(expected);
  }
});

/**
 * The skip link only skips if activating it moves focus. `href="#main"` scrolls
 * the viewport by itself, but focus follows the fragment only when the target
 * is focusable — and every route renders its own `<main id="main">`, so one new
 * route that forgets `tabIndex={-1}` silently reverts this to a scroll-only
 * link that leaves the next Tab inside the header. Checking the attribute on
 * every route is the part that catches a new route; pressing Enter on one route
 * is the part that proves the attribute does what the comment claims.
 */
const SKIP_LINK_ROUTES = [
  "/",
  "/explore/",
  "/agents/",
  "/agents/claude-code/",
  "/categories/",
  "/compare/",
  "/insights/",
  "/package/",
  "/privacy/",
  "/contact/",
  "/terms/",
  preRendered.href,
  nonPreRendered.href,
  "/no-such-route/",
];

test("keyboard: the skip link's target is focusable on every route", async ({ page }) => {
  for (const path of SKIP_LINK_ROUTES) {
    await gotoSettled(page, path);
    await expect(
      page.locator("main#main"),
      `${path} renders a <main id="main"> without tabIndex={-1}`
    ).toHaveAttribute("tabindex", "-1");
  }
});

test("keyboard: Enter on the skip link moves focus into #main, not just the viewport", async ({
  page,
}) => {
  await gotoSettled(page, "/");
  await page.locator('a[href="#main"]').focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName ?? null))
    .toBe("MAIN");
  // Focus is *inside* the main region: the next Tab leaves the header behind.
  const next = await page.evaluate(async () => {
    const el = document.activeElement as HTMLElement;
    return el.closest("main") !== null;
  });
  expect(next, "focus should land on the main region").toBe(true);
});

test("narrow screens: the navigation is a menu; wider headers show a rail that fits", async ({
  page,
}) => {
  const rail = page.locator('nav[aria-label="Primary"]');
  const read = () =>
    rail.evaluate((el) => {
      const fadeEl = el.parentElement?.querySelector(
        'div[aria-hidden="true"]'
      ) as HTMLElement | null;
      return {
        overflows: el.scrollWidth > el.clientWidth + 1,
        faded: !!fadeEl && fadeEl.className.includes("from-surface"),
        painted: !!fadeEl && getComputedStyle(fadeEl).display !== "none",
      };
    });

  // Below 768px the rail is a menu: every destination is one tap away and
  // nothing is clipped, so there is no edge to fade.
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 720 });
    await gotoSettled(page, "/");
    const menu = page.locator("details").filter({
      has: page.getByText("Menu", { exact: true }),
    });
    await expect(menu, `the navigation menu is missing at ${width}px`).toBeVisible();
    await menu.locator("summary").click();
    // Four destinations since the rail was cut to Explore / Works with / How
    // it works / Docs; the menu must carry every one of them.
    await expect(menu.locator("a"), `the menu is empty at ${width}px`).toHaveCount(4);
    const narrow = await read();
    expect(narrow.overflows, `the rail is not on the screen at ${width}px`).toBe(false);
    expect(narrow.faded, `nothing is past the edge at ${width}px, so nothing should fade`).toBe(false);
  }

  // From 768px up the rail is back, on its own row until the header goes
  // single-line, and it fits: nothing is past its edge, so nothing fades.
  for (const width of [768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await gotoSettled(page, "/");
    const wide = await read();
    expect(wide.overflows, `the rail should fit a ${width}px header`).toBe(false);
    expect(wide.faded, `nothing is past the edge at ${width}px, so nothing should fade`).toBe(false);
  }
});

test("keyboard: the theme toggle is operable and the / shortcut focuses search", async ({ page }) => {
  await gotoSettled(page, "/");

  const toggle = page.getByRole("button", { name: /Theme:/ });
  await toggle.focus();
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .not.toBe(before);

  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("/");
  await expect(page.locator('input[name="q"]')).toBeFocused();
});

test("keyboard: an entry page's copy button is reachable by Tab alone", async ({ page }) => {
  await gotoSettled(page, preRendered.href);
  let reached = false;
  for (let press = 0; press < 40 && !reached; press += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute("aria-label") === "Copy install command";
    });
  }
  expect(reached, "the install copy button should be reachable with Tab alone").toBe(true);
  const indicator = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);
    return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) >= 1;
  });
  expect(indicator, "the focused copy button should paint an outline").toBe(true);
});
