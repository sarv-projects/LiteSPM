import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const reqs = [];
page.on("requestfinished", async (r) => {
  const res = await r.response().catch(() => null);
  const t = reqs.find((x) => x.url === r.url());
  if (t) t.ms = Math.round(Date.now() - t.start);
});
page.on("request", (r) => reqs.push({ url: r.url(), start: Date.now(), ms: 0, size: 0 }));
await page.goto("http://127.0.0.1:8788/explore/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const t0 = Date.now();
await page.selectOption("#explore-category", { index: 1 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="result-count"]');
  return el && /[1-9]/.test(el.textContent || "");
}, null, { timeout: 30000 });
const elapsed = Date.now() - t0;
console.log("filter -> settled:", elapsed, "ms");
await page.waitForTimeout(1500);
for (const r of reqs.filter((x) => x.url.includes("/data/"))) {
  console.log("  ", r.ms + "ms", r.url.replace("http://127.0.0.1:8788", ""));
}
await browser.close();
