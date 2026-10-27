import { test, expect, gotoSettled, waitForSearchGrid } from './support/site';

// Real navigation and first-response checks, independent of editorial wording.
test('global install opens a working setup path', async ({ page }) => {
  await gotoSettled(page, '/docs/');
  await page.getByRole('link', { name: 'Install LiteSPM', exact: true }).click();
  await expect(page).toHaveURL(/\/get-started\//);
  await expect(page.locator('main')).toContainText('npm install -g litespm');
});

test('publisher options load through keyboard focus and recover after filtering', async ({ page }) => {
  await gotoSettled(page, '/explore/');
  await page.locator('details.market-advanced-filters > summary').click();
  const publisher = page.locator('#explore-publisher');
  await publisher.focus();
  await expect.poll(() => publisher.locator('option').count()).toBeGreaterThan(2);
  const value = await publisher.locator('option').nth(1).getAttribute('value');
  await publisher.selectOption(value!);
  await expect(page).toHaveURL(/publisher=/);
});

test('oversized URL queries stay bounded and fit a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSettled(page, '/explore/?q=' + 'a'.repeat(10000));
  await expect.poll(async () => (await page.locator('input[name="q"]').inputValue()).length).toBe(256);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('an edge-resolved package serves its own visible identity before JavaScript', async ({ request }) => {
  const response = await request.get('/package/claude-42crunch-api-security-testing/');
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  const h1 = html.match(/<h1\b[^>]*>(.*?)<\/h1>/s)?.[1] ?? '';
  expect(h1.toLowerCase()).toContain('42crunch');
  expect(h1).not.toContain('Find a package');
});

for (const route of ['/trust/', '/about/', '/roadmap/', '/changelog/']) {
  test(`${route} has a reachable main and shared legal links`, async ({ page }) => {
    await gotoSettled(page, route);
    await expect(page.locator('main h1')).toBeVisible();
    const footer = page.locator('footer');
    for (const href of ['/privacy/', '/terms/', '/trust/']) {
      await expect(footer.locator(`a[href="${href}"]`)).toBeVisible();
    }
    await expect(footer.getByRole('link', { name: 'Apache-2.0', exact: true })).toBeVisible();
  });
}

// Retained screenshots make successful desktop/mobile states reviewable.
for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark']) {
    for (const route of ['/', '/explore/', '/agents/', '/get-started/']) {
      test(`release screenshot ${route} ${width}px ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(value => localStorage.setItem('litespm-theme', value), theme);
        await gotoSettled(page, route);
        await expect(page.locator('main h1')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const file = `${route.replace(/\//g, '') || 'home'}-${width}-${theme}.png`;
        const path = testInfo.outputPath(file);
        await page.screenshot({ path, fullPage: true });
        await testInfo.attach(file, { path, contentType: 'image/png' });
      });
    }
  }
}

test('the same pinned plugin appears once after interactive catalog loading', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    (window as unknown as { __workerDebug: unknown[] }).__workerDebug = [];
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event) => {
          (window as unknown as { __workerDebug: unknown[] }).__workerDebug.push({ direction: "from", data: event.data });
        });
      }
      postMessage(message: unknown, transfer?: Transferable[]) {
        (window as unknown as { __workerDebug: unknown[] }).__workerDebug.push({ direction: "to", data: message });
        return super.postMessage(message, transfer ?? []);
      }
    };
  });
  await gotoSettled(page, '/explore/?q=activecampaign&kind=plugin');
  await page.waitForTimeout(8000);
  console.log("ACTIVE CAMPAIGN WORKER", JSON.stringify(await page.evaluate(() => ({
    debug: (window as unknown as { __workerDebug: unknown[] }).__workerDebug,
    count: document.querySelector('[data-testid="result-count"]')?.textContent,
    rows: document.querySelectorAll("main a[data-kind]").length,
  }))));
  await waitForSearchGrid(page, 'activecampaign');
  const rows = page.locator('main a[data-kind="plugin"]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('ActiveCampaign');
});
