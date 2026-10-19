import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const timings = [];
page.on("response", async (r) => {
  if (r.url().includes("/data/catalog-search-rows")) {
    const h = r.headers();
    timings.push({ url: r.url().split("/").pop(), encoding: h["content-encoding"] || "none", length: h["content-length"] });
  }
});
await page.goto("http://127.0.0.1:8788/explore/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const t0 = Date.now();
await page.selectOption("#explore-category", { index: 1 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="result-count"]');
  return el && /[1-9]/.test(el.textContent || "");
}, null, { timeout: 30000 });
console.log("filter -> settled:", Date.now() - t0, "ms");
console.log("response:", JSON.stringify(timings));
// now the second filter (rows already hydrated)
const t1 = Date.now();
await page.selectOption("#explore-category", { index: 2 });
await page.waitForTimeout(800);
console.log("second filter (rows warm):", Date.now() - t1, "ms");
await browser.close();
