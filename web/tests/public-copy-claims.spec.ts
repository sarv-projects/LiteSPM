import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, gotoSettled, test } from "./support/site";

test("plugin copy explains supported components and partial-install consent", async ({ page }) => {
  await gotoSettled(page, "/how-it-works/");
  const plugins = page.locator('section[aria-labelledby="capability-types-title"] li').nth(2);

  await expect(plugins.getByRole("heading", { name: "Install supported components from a pinned source" })).toBeVisible();
  await expect(plugins.getByText(/MCP servers and skills/)).toBeVisible();
  await expect(plugins.getByText(/host-specific extras are not installed/)).toBeVisible();
  await expect(plugins.getByText(/explicit consent/)).toBeVisible();
  await expect(page.getByText(/all three install with the same command.*same undo/i)).toHaveCount(0);
});

test("security copy limits approval to the installation plan", async ({ page }) => {
  await gotoSettled(page, "/security/");

  await expect(page.getByText(/You approve the installation plan before LiteSPM writes it/)).toBeVisible();
  await expect(page.getByText(/Installed capabilities are not sandboxed and may run with your permissions/)).toBeVisible();
  await expect(page.getByText(/Nothing runs that you did not approve/)).toHaveCount(0);
});

test("first-install guide clearly requires catalog sync", async ({ page }) => {
  await gotoSettled(page, "/how-it-works/");
  const installStep = page.locator("main ol li").nth(1);

  await expect(installStep.getByText(/Before your first catalog install/)).toBeVisible();
  await expect(installStep.getByText(/npx --yes litespm@latest catalog sync/)).toBeVisible();
  await expect(page.getByText(/first install fetches the verified catalog/i)).toHaveCount(0);
});

test("setup guide names the published npm Node.js engine range", async ({ page }) => {
  await gotoSettled(page, "/get-started/");

  await expect(page.getByText(/Node\.js 22\.22\.2\+ \(22\.x\), 24\.15\.0\+ \(24\.x\), or 26\+/)).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub releases", exact: true })).toHaveAttribute(
    "href",
    "https://github.com/sarv-projects/LiteSPM/releases/latest"
  );
  await expect(page.getByText(/without installing Node\.js/)).toBeVisible();
  await expect(page.getByText(/Node\.js 18 or newer/)).toHaveCount(0);
});

test("listing submission does not promise automatic pickup", async ({ page }) => {
  await gotoSettled(page, "/submit/");

  await expect(page.getByText(/If the source is accepted and included in the catalog's ingestion process/)).toBeVisible();
  await expect(page.getByText(/a later manually run catalog build may publish it/)).toBeVisible();
  await expect(page.getByText(/The next catalog build picks it up from that source/)).toHaveCount(0);
});

test("footer identifies the catalog snapshot behind its counts", async ({ page }) => {
  await gotoSettled(page, "/");
  const snapshot = page.locator("footer").getByRole("link", { name: "rel-2026-10-21-01" });

  await expect(snapshot).toHaveAttribute("href", "/status/");
  await expect(page.locator("footer").getByText(/Catalog snapshot/)).toBeVisible();
  await expect(page.locator("footer").getByText(/2026-10-21/)).toBeVisible();
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
