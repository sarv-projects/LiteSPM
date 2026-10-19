// Budgets — asserted, not reported.
//
// The site's measured position is strong (CLS 0, 30-odd same-origin requests
// for the home page, ~104 KiB of First Load JS). This file fails the suite
// when a future change gives that away. Every number below is the measured
// value with a small, stated margin; the measurement itself is printed so a
// failure says what it saw.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test } from "./support/site";
import { collectPageErrors, gotoSettled } from "./support/site";
import { WEB_ROOT, flagshipEntry, nonPreRenderedEntry, preRenderedEntry } from "./support/catalog";

const preRendered = preRenderedEntry();
const nonPreRendered = nonPreRenderedEntry();
const flagship = flagshipEntry();

/**
 * Cumulative Layout Shift on a cold load. The project's bar is zero: the hero
 * CLS flake (0 vs 0.25) came from an uncontained element, and the entry page's
 * reserved note slot exists because the mount→resolved transition measured
 * 0.0132. The budget leaves room for sub-pixel noise only.
 */
const CLS_BUDGET = 0.01;

/** Same-origin requests for a cold `/` load. Measured 34; see the report. */
const HOME_REQUEST_BUDGET = 36;

/** First Load JS for `/`, the way `next build` reports it (gzipped chunks). */
const FIRST_LOAD_JS_BUDGET = 108 * 1024; // measured 106,503 B = 104.0 KiB

async function measureCls(
  page: import("@playwright/test").Page,
  path: string
): Promise<number> {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) {
          (window as unknown as { __cls: number }).__cls += entry.value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await gotoSettled(page, path);
  // Give lazy images and the client-only mount→resolved transitions time to
  // land; a shift that happens after the observer's window is not measured.
  await page.waitForTimeout(1500);
  return page.evaluate(() => (window as unknown as { __cls: number }).__cls);
}

for (const { label, path } of [
  { label: "home", path: "/" },
  { label: "explore", path: "/explore/" },
  { label: "pre-rendered entry", path: preRendered.href },
  { label: "colon-bearing entry (query form)", path: flagship.queryHref },
]) {
  test(`CLS: ${label} stays under ${CLS_BUDGET}`, async ({ page }) => {
    const errors = collectPageErrors(page);
    const cls = await measureCls(page, path);
    console.log(`CLS ${label} (${path}): ${cls}`);
    expect(cls, `CLS on ${path}`).toBeLessThan(CLS_BUDGET);
    expect(errors, `console errors on ${path}:\n${errors.join("\n")}`).toEqual([]);
  });
}

test(`cold-load requests: / stays at or under ${HOME_REQUEST_BUDGET} same-origin requests`, async ({
  page,
}) => {
  const sameOrigin: string[] = [];
  const all: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    all.push(url.href);
    if (url.hostname === "127.0.0.1") sameOrigin.push(url.pathname);
  });
  await gotoSettled(page, "/");
  await page.waitForTimeout(1500);
  console.log(
    `cold-load /: ${sameOrigin.length} same-origin of ${all.length} total requests\n` +
      sameOrigin.map((path) => `  ${path}`).join("\n")
  );
  expect(sameOrigin.length, "same-origin requests for a cold / load").toBeLessThanOrEqual(
    HOME_REQUEST_BUDGET
  );
});

test(`First Load JS for / stays under ${FIRST_LOAD_JS_BUDGET} bytes`, () => {
  const manifestPath = join(WEB_ROOT, ".next", "app-build-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      "missing .next/app-build-manifest.json — the budget is measured from the build; run `npm run build` first"
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    pages: Record<string, string[]>;
  };
  const pageChunks = manifest.pages["/page"];
  const layoutChunks = (manifest.pages["/layout"] ?? []).filter((file) => file.endsWith(".js"));
  if (!pageChunks || pageChunks.length === 0) {
    throw new Error("app-build-manifest.json has no /page entry — is this the right build?");
  }
  const files = [...new Set([...pageChunks, ...layoutChunks])];
  let bytes = 0;
  for (const file of files) {
    const filePath = join(WEB_ROOT, ".next", file);
    if (!existsSync(filePath)) throw new Error(`build chunk missing: ${file}`);
    bytes += gzipSync(readFileSync(filePath)).length;
  }
  console.log(`First Load JS for /: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KiB)`);
  expect(bytes, "First Load JS for the home route").toBeLessThanOrEqual(FIRST_LOAD_JS_BUDGET);
});

const OVERFLOW_ROUTES = [
  "/",
  "/explore/",
  "/agents/",
  "/agents/claude-code/",
  "/categories/",
  "/compare/",
  "/trending/",
  "/package/",
  preRendered.href,
  nonPreRendered.href,
  flagship.href,
  flagship.queryHref,
];

/**
 * A page must not scroll sideways: `scrollWidth` may not exceed the viewport.
 *
 * The 320 px width is here because 390 px is not the narrowest phone there
 * is, and the gap between them is where a grid with no explicit column count
 * shows up: an `auto` track takes its floor from the content's min-content
 * width, so a card that cannot shrink overflows the page instead of wrapping.
 * The home page's agent strip was 338 px wide inside a 278 px column at
 * 320 px — invisible at 390, a 34 px sideways scroll on a real phone.
 */
for (const width of [320, 390]) {
  test.describe(`no horizontal overflow at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const path of OVERFLOW_ROUTES) {
      test(`${path} does not scroll sideways`, async ({ page }) => {
        await gotoSettled(page, path);
        const metrics = await page.evaluate(() => ({
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          viewportWidth: window.innerWidth,
        }));
        console.log(`overflow ${width}px ${path}:`, metrics);
        expect(
          metrics.documentScrollWidth,
          `document scrollWidth vs clientWidth on ${path} at ${width}px`
        ).toBeLessThanOrEqual(metrics.documentClientWidth);
        expect(
          metrics.bodyScrollWidth,
          `body scrollWidth vs viewport on ${path} at ${width}px`
        ).toBeLessThanOrEqual(metrics.viewportWidth);
      });
    }
  });
}
