// An accessibility audit of the built site.
//
// `axe-core` against real pages in a real browser: the rules that need a
// layout (a scrollable region nobody can reach from the keyboard, a contrast
// ratio, a name that no assistive technology can read) are not decidable from
// the source. The static gates in `npm run lint` cover what can be read from
// the source; this one covers what cannot.
//
// It needs a server that serves the export:
//
//   npx next build && node tests/serve.mjs &   # or any static server
//   npm run audit:a11y
//
// The routes default to the ones a reader lands on. Pass others as arguments:
//
//   npm run audit:a11y -- /explore/ /agents/claude-code/ /package/
//
// The exit code is non-zero when a violation is found, so it can be a CI step
// on a machine that can run the server.

import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const ORIGIN = process.env.A11Y_ORIGIN || "http://127.0.0.1:8788";
const DEFAULT_ROUTES = [
  "/",
  "/explore/",
  "/agents/",
  "/agents/claude-code/",
  "/categories/",
  "/compare/",
  "/insights/",
  "/package/",
  "/how-it-works/",
  "/get-started/",
  "/status/",
  "/security/",
  "/support/",
];
const routes = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const targets = routes.length ? routes : DEFAULT_ROUTES;

// The tags axe uses for WCAG 2 A/AA, 2.1 A/AA and 2.2 AA.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const browser = await chromium.launch();
let violations = 0;

try {
  for (const route of targets) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${ORIGIN}${route}`, { waitUntil: "networkidle" });
    // The same settle the browser suite uses: fonts ready and two animation
    // frames painted. Auditing a page mid-hydration measures the swap, not
    // the site.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    });
    const axeSource = readFileSync(join(root, "node_modules/axe-core/axe.min.js"), "utf8");
    await page.addScriptTag({ content: axeSource });
    const result = await page.evaluate(
      async (tags) =>
        await window.axe.run(document, { runOnly: { type: "tag", values: tags } }),
      TAGS
    );

    if (result.violations.length === 0) {
      console.log(`  ok  ${route}`);
    } else {
      console.log(`  XX  ${route}`);
      for (const violation of result.violations) {
        violations += 1;
        console.log(
          `      ${violation.id} (${violation.impact}) — ${violation.help} [${violation.nodes.length} node(s)]`
        );
        for (const node of violation.nodes.slice(0, 3)) {
          console.log(`        ${node.target.join(" ")}`);
          const summary = (node.failureSummary || "").split("\n").slice(0, 2).join(" / ");
          if (summary) console.log(`          ${summary}`);
        }
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (violations > 0) {
  console.error(`\n${violations} accessibility violation(s) found.`);
  process.exit(1);
}
console.log("\nNo accessibility violations on the routes checked.");
