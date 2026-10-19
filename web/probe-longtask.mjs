import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:8788/explore/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  window.__tasks = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__tasks.push({ name: e.name, dur: Math.round(e.duration), start: Math.round(e.startTime) });
  }).observe({ entryTypes: ["longtask"] });
});
const t0 = Date.now();
await page.selectOption("#explore-category", { index: 1 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="result-count"]');
  return el && /[1-9]/.test(el.textContent || "");
}, null, { timeout: 30000 });
console.log("settled in", Date.now() - t0, "ms");
await page.waitForTimeout(500);
const tasks = await page.evaluate(() => window.__tasks);
console.log("long tasks:", JSON.stringify(tasks));
// second filter
await page.evaluate(() => { window.__tasks = []; });
const t1 = Date.now();
await page.selectOption("#explore-category", { index: 2 });
await page.waitForTimeout(1500);
console.log("second filter elapsed", Date.now() - t1, "ms");
const tasks2 = await page.evaluate(() => window.__tasks);
console.log("long tasks 2:", JSON.stringify(tasks2));
await browser.close();
