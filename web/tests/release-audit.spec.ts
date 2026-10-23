import { test, expect } from '@playwright/test';

// Real navigation and first-response checks, independent of editorial wording.
test('global install opens a working setup path', async ({ page }) => {
  await page.goto('/docs/');
  await page.getByRole('link', { name: 'Install LiteSPM', exact: true }).click();
  await expect(page).toHaveURL(/\/get-started\//);
  await expect(page.locator('main')).toContainText('npm install -g litespm');
});

test('publisher options load through keyboard focus and recover after filtering', async ({ page }) => {
  await page.goto('/explore/');
  const publisher = page.locator('#explore-publisher');
  await publisher.focus();
  await expect.poll(() => publisher.locator('option').count()).toBeGreaterThan(2);
  const value = await publisher.locator('option').nth(1).getAttribute('value');
  await publisher.selectOption(value!);
  await expect(page).toHaveURL(/publisher=/);
});

test('oversized URL queries stay bounded and fit a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore/?q=' + 'a'.repeat(10000));
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
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    const footer = page.locator('footer');
    for (const href of ['/privacy/', '/terms/', '/trust/']) {
      await expect(footer.locator(`a[href="${href}"]`)).toBeVisible();
    }
    await expect(footer.getByRole('link', { name: 'Apache-2.0', exact: true })).toBeVisible();
  });
}
