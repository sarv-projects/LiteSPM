import { expect, test } from "./support/site";
import { gotoSettled } from "./support/site";

test("MCP and brand roles remain distinct and the hero glow stays on-brand", async ({ page }) => {
  await gotoSettled(page, "/");

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((choice) => {
      document.documentElement.dataset.theme = choice;
    }, theme);

    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const parse = (value: string) => {
        const match = value.trim().match(/^#([0-9a-f]{6})$/i);
        if (!match) throw new Error(`expected a six-digit color token, got ${value}`);
        const hex = match[1];
        return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
      };
      const hue = (color: number[]) => {
        const [r, g, b] = color;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        if (delta === 0) return 0;
        let degrees =
          max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
        degrees *= 60;
        return degrees < 0 ? degrees + 360 : degrees;
      };
      const luminance = (color: number[]) => {
        const [r, g, b] = color.map((channel) =>
          channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
        );
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const mcp = parse(style.getPropertyValue("--mcp"));
      const accent = parse(style.getPropertyValue("--accent-text"));
      const wash = parse(style.getPropertyValue("--mcp-wash"));
      const delta = Math.abs(hue(mcp) - hue(accent));
      const hueDistance = Math.min(delta, 360 - delta);
      const [high, low] = [luminance(mcp), luminance(wash)].sort((a, b) => b - a);
      return { hueDistance, contrast: (high + 0.05) / (low + 0.05) };
    });

    expect(tokens.hueDistance, `${theme} MCP should not read as the brand indigo`).toBeGreaterThanOrEqual(25);
    expect(tokens.contrast, `${theme} MCP text must clear 4.5:1 on its wash`).toBeGreaterThanOrEqual(4.5);
  }

  await expect(page.locator(".home-hero-window")).toBeVisible();
  await expect(page.locator(".home-hero-note")).toContainText("Less configuration hunting.");
});

test("submit-page explanatory copy is at least 14px on desktop and mobile", async ({ page }) => {
  await gotoSettled(page, "/submit/");
  const lede = page.locator(".submit-hero-summary");

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const fontSize = await lede.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize, `submit lede at ${width}px`).toBeGreaterThanOrEqual(14);
  }
});

test("how-it-works explanatory copy is at least 14px on desktop and mobile", async ({ page }) => {
  await gotoSettled(page, "/how-it-works/");
  const description = page.locator("main ol li p").first();
  const capabilityDescription = page
    .locator('section[aria-labelledby="capability-types-title"] ul p')
    .first();

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const fontSize = await description.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const capabilityFontSize = await capabilityDescription.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize)
    );
    expect(fontSize, `how-it-works description at ${width}px`).toBeGreaterThanOrEqual(14);
    expect(capabilityFontSize, `capability description at ${width}px`).toBeGreaterThanOrEqual(14);
  }
});
