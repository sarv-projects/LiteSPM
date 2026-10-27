import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, gotoSettled, test } from "./support/site";

test("plugin copy explains supported components and partial-install consent", async ({ page }) => {
  await gotoSettled(page, "/how-it-works/");
  const plugins = page.locator('section[aria-labelledby="capability-types-title"] li').nth(2);

  await expect(plugins.getByRole("heading", { name: "Group related agent capabilities" })).toBeVisible();
  await expect(plugins.getByText(/publisher's collection of tools and workflows/i)).toBeVisible();
  await expect(plugins.getByText(/host-specific extras|pinned source|explicit consent/i)).toHaveCount(0);
  await expect(page.getByText(/all three install with the same command.*same undo/i)).toHaveCount(0);
});

test("security copy limits approval to the installation plan", async ({ page }) => {
  await gotoSettled(page, "/security/");

  await expect(page.getByText(/You approve the installation plan before LiteSPM writes it/)).toBeVisible();
  await expect(page.getByText(/Installed capabilities are not sandboxed and may run with your permissions/)).toBeVisible();
  await expect(page.getByText(/Nothing runs that you did not approve/)).toHaveCount(0);
});

test("developer docs give the first search and package install commands", async ({ page }) => {
  await gotoSettled(page, "/docs/");

  await expect(page.getByRole("heading", { name: "Quick start" })).toBeVisible();
  await expect(page.locator("main pre code").filter({ hasText: "litespm catalog sync" }).first()).toBeVisible();
  await expect(
    page.locator("main pre code").filter({ hasText: "npx --yes litespm@latest install <catalog-id> --host codex" }).first()
  ).toBeVisible();
});

test("setup guide names the published npm Node.js engine range", async ({ page }) => {
  await gotoSettled(page, "/get-started/");

  await expect(page.getByText(/Node\.js 22\.22\.2\+ on 22\.x, 24\.15\.0\+ on 24\.x, or 26\+/)).toBeVisible();
  await page.locator("details[data-setup-details] summary").click();
  await expect(page.getByRole("link", { name: "GitHub release binaries", exact: true })).toHaveAttribute(
    "href",
    "https://github.com/sarv-projects/LiteSPM/releases/latest"
  );
  await expect(page.getByText(/install without Node\.js/)).toBeVisible();
  await expect(page.getByText(/Node\.js 18 or newer/)).toHaveCount(0);
});

test("listing page provides an accessible source-and-setup request form", async ({ page }) => {
  await gotoSettled(page, "/submit/");

  await expect(page.getByRole("heading", { name: "Bring your agent project to LiteSPM" })).toBeVisible();
  await expect(page.getByRole("group", { name: "What are you submitting?" })).toBeVisible();
  await expect(page.getByLabel("Project name")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Project or publisher URL")).toHaveAttribute("type", "url");
  await expect(page.getByLabel("Setup or install details")).toHaveAttribute("required", "");
  await expect(page.getByRole("button", { name: "Continue to GitHub" })).toBeVisible();
  await expect(page.getByText(/the LiteSPM team reviews the publisher source/i)).toBeVisible();
});


test("footer stays focused on product links rather than release metadata", async ({ page }) => {
  await gotoSettled(page, "/");
  const footer = await page.locator("footer").innerText();
  expect(footer).not.toMatch(/catalog snapshot|catalog updated|rel-\d{4}/i);
  expect(footer).not.toMatch(/\d[\d,]*\s+(?:capabilities|MCP|skills|plugins)/i);
  await expect(page.locator("footer").getByRole("link", { name: "Developer docs" })).toHaveAttribute("href", "/docs/");
});

test("web README reports the committed catalog release, not a superseded one", () => {
  const releasePath = path.resolve(process.cwd(), "data/release.json");
  const readmePath = path.resolve(process.cwd(), "README.md");
  const release = JSON.parse(readFileSync(releasePath, "utf8")) as {
    releaseId: string;
    sequence: number;
    itemCount: number;
  };
  const readme = readFileSync(readmePath, "utf8");

  expect(readme).toContain(release.releaseId);
  expect(readme).toContain(`sequence ${release.sequence}`);
  expect(readme).toContain(`${release.itemCount.toLocaleString("en-US")} items`);
  expect(readme).not.toContain("rel-2026-10-17-01");
});
