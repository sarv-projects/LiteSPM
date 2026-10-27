// `prefers-reduced-motion: reduce` — the gate, and its positive control.
//
// The site's ambient motion (the bridge figure's packets, the scroll-timeline
// entrance reveals) is gated on the media query; under `reduce` the figure is
// the complete still state and `document.getAnimations()` is empty. The second
// test here is what gives the first one teeth: with `no-preference` the same
// figure *does* run, so "no animations" cannot pass because the component is
// dead.
//
// The kind cycle that used to be asserted here is gone: the hero's rotating
// counts were replaced by one stable number, and the bridge figure's verb
// readout is static text rather than a per-word rotation. Neither had a
// positive control worth keeping, and a test for a component that no longer
// exists is a test that fails for the wrong reason.

import { expect, test } from "./support/site";
import { gotoSettled } from "./support/site";

test.describe("prefers-reduced-motion: reduce", () => {
  test("the bridge figure is still, and no animation is running", async ({ page }) => {
    await gotoSettled(page, "/how-it-works/");
    await page.locator(".dg-stage").scrollIntoViewIfNeeded();
    // One explicit window: the IntersectionObserver must have had the chance
    // to (not) start anything before this is asserted.
    await page.waitForTimeout(800);

    await expect(page.locator(".dg-stage[data-live]")).toHaveCount(0);
    // The packets are not rendered at all under reduced motion.
    await expect(page.locator(".dg-packet")).toHaveCount(0);
    // The still figure is complete, not empty: an idle phase, and all three
    // kind exits drawn.
    await expect(page.locator(".dg-stage")).toHaveAttribute("data-phase", "idle");
    await expect(page.locator(".dg-kind")).toHaveCount(3);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

test.describe("prefers-reduced-motion: no-preference", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the same figure does run, so the still state is a gate and not a dead component", async ({
    page,
  }) => {
    await gotoSettled(page, "/how-it-works/");
    await page.locator(".dg-stage").scrollIntoViewIfNeeded();

    await expect(page.locator(".dg-stage[data-live]")).toHaveCount(1);
    await expect(page.locator(".dg-packet")).toHaveCount(2);
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().length), {
        message: "motion is allowed and the figure is in view, so something should be animating",
      })
      .toBeGreaterThan(0);
  });
});
