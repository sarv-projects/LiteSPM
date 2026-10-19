// The primary navigation rail (F-06).
//
// The defect this file guards: the rail is a horizontal scroller, and at
// 320 px "Coverage" sat at x=313–385 — entirely off a 320 px screen — with
// nothing to say so. A destination the site names and a reader cannot reach
// is a broken navigation, and the no-JS contract means the fix cannot be a
// drawer: the links have to stay in the DOM.
//
// So the rail keeps every destination, fades the edge that has more past it,
// and carries two chevrons that scroll it. This file asserts all three, at
// the three widths the finding was measured at.
//
// It also guards the header's call to action: it used to truncate from
// "Install LiteSPM" to "Install" below 640 px, and the truncation was the
// only cue the header gave about what the product is.

import { expect, test } from "./support/site";
import { gotoSettled } from "./support/site";

/** Every destination the primary rail names. */
const DESTINATIONS = ["Explore", "Agent hosts", "Compare", "Categories", "Insights"];

const WIDTHS = [320, 375, 412];

async function railState(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]');
    if (!nav) return null;
    const rect = nav.getBoundingClientRect();
    const links = Array.from(nav.querySelectorAll("a")).map((a) => {
      const r = a.getBoundingClientRect();
      return {
        text: (a.textContent ?? "").trim(),
        left: r.left,
        right: r.right,
        visible: r.left >= rect.left - 1 && r.right <= rect.right + 1,
      };
    });
    return {
      scrollWidth: nav.scrollWidth,
      clientWidth: nav.clientWidth,
      overflowX: getComputedStyle(nav).overflowX,
      links,
    };
  });
}

for (const width of WIDTHS) {
  test.describe(`the primary rail at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("every destination is reachable — visible, or scrollable to with a visible affordance", async ({
      page,
    }) => {
      await gotoSettled(page, "/");
      const state = await railState(page);
      expect(state, "the primary rail must exist").not.toBeNull();
      expect(state!.links.map((l) => l.text)).toEqual(DESTINATIONS);

      for (const link of state!.links) {
        // Where the destination is NOW: the loop scrolls the rail, so the
        // snapshot taken before the first click is stale by the time the
        // later destinations are checked.
        const placement = await page.evaluate((text) => {
          const nav = document.querySelector('nav[aria-label="Primary"]');
          const target = Array.from(nav?.querySelectorAll("a") ?? []).find(
            (a) => (a.textContent ?? "").trim() === text
          );
          if (!nav || !target) return null;
          const navRect = nav.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          return {
            visible: rect.left >= navRect.left - 1 && rect.right <= navRect.right + 1,
            // A link that straddles the right edge is to the RIGHT: scrolling
            // forward is what brings it in. Only a link whose left edge is
            // before the rail's own is to the left.
            side: rect.left < navRect.left ? "left" : "right",
          };
        }, link.text);
        if (!placement || placement.visible) continue;

        // Off-screen: the rail has to be a scroller, and it has to say so.
        expect(
          state!.overflowX,
          `${link.text} is off-screen but the rail does not scroll`
        ).toBe("auto");
        expect(
          state!.scrollWidth,
          `${link.text} is off-screen but the rail has nothing to scroll to`
        ).toBeGreaterThan(state!.clientWidth);

        // The affordance is on the side the destination is on. This loop
        // scrolls the rail, so a later destination can be off-screen to the
        // LEFT — and then the right edge has nothing past it and correctly
        // shows no right fade; the left edge is the one that has to say so.
        const fade = page.locator(
          placement.side === "right" ? "header div.bg-gradient-to-l" : "header div.bg-gradient-to-r"
        );
        await expect(fade, `the rail's ${placement.side} edge is not faded`).toBeVisible();

        // The chevron: a control that scrolls the rail toward the
        // destination, reachable by keyboard and named for what it does.
        const next = page.getByRole("button", {
          name:
            placement.side === "right" ? "Scroll the navigation forward" : "Scroll the navigation back",
        });
        await expect(next, "the rail has no scroll control").toBeVisible();

        // And the control works: the destination comes into view.
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const visible = await page.evaluate((text) => {
            const nav = document.querySelector('nav[aria-label="Primary"]');
            const link = Array.from(nav?.querySelectorAll("a") ?? []).find(
              (a) => (a.textContent ?? "").trim() === text
            );
            if (!nav || !link) return false;
            const navRect = nav.getBoundingClientRect();
            const rect = link.getBoundingClientRect();
            return rect.left >= navRect.left - 1 && rect.right <= navRect.right + 1;
          }, link.text);
          if (visible) break;
          await next.click();
          await page.waitForTimeout(400);
        }
        const reached = await page.evaluate((text) => {
          const nav = document.querySelector('nav[aria-label="Primary"]');
          const link = Array.from(nav?.querySelectorAll("a") ?? []).find(
            (a) => (a.textContent ?? "").trim() === text
          );
          if (!nav || !link) return false;
          const navRect = nav.getBoundingClientRect();
          const rect = link.getBoundingClientRect();
          return rect.left >= navRect.left - 1 && rect.right <= navRect.right + 1;
        }, link.text);
        expect(reached, `${link.text} could not be brought into view`).toBe(true);
      }
    });

    test("the call to action keeps its whole label and fits the screen", async ({ page }) => {
      await gotoSettled(page, "/");
      const cta = page.getByRole("link", { name: "Install LiteSPM" });
      await expect(cta).toBeVisible();
      // The whole label, not "Install".
      await expect(cta).toHaveText("Install LiteSPM");

      const box = await cta.boundingBox();
      expect(box, "the call to action has no box").not.toBeNull();
      expect(
        box!.x + box!.width,
        "the call to action runs past the right edge of the viewport"
      ).toBeLessThanOrEqual(width);
      expect(box!.x, "the call to action runs past the left edge").toBeGreaterThanOrEqual(0);
    });
  });
}
