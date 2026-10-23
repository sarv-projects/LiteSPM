import { expect, test } from "./support/site";
import { gotoSettled } from "./support/site";

test("the agent directory makes profiles easy to browse", async ({ page }) => {
  await gotoSettled(page, "/agents/");

  await expect(page.getByRole("heading", { name: "Choose your agent." })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search agent profiles" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Scrollable agent profiles" })).toBeVisible();
  await expect(page.getByText(/Every profile includes a practical setup guide/)).toBeVisible();
  await expect(page.getByText(/not available to install here|catalog relationships, not runtime test/i)).toHaveCount(0);
});

test("agent detail pages give first-time visitors a clear local installation path", async ({ page }) => {
  await gotoSettled(page, "/agents/codex/");

  const start = page.getByRole("region", { name: "Start with LiteSPM" });
  await expect(start).toBeVisible();
  await expect(start.getByRole("link", { name: "Get LiteSPM" })).toHaveAttribute("href", "/get-started/");
  await expect(start.getByRole("link", { name: "Browse packages for OpenAI Codex CLI" })).toHaveAttribute(
    "href",
    /\/explore\/\?host=/
  );
  await expect(start).toContainText("Install the manager once, then use it from your computer.");
  await expect(start).toContainText("Choose this agent, then find tools and skills that fit how you work.");
});

test("agent detail pages show the setup and catalog choices for that agent", async ({ page }) => {
  await gotoSettled(page, "/agents/claude-code/");

  await expect(page.getByRole("heading", { name: "Find tools for Claude Code" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Start with LiteSPM" })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="agent-works-title"]')).toContainText(
    "packages and skills to explore for Claude Code"
  );
  await expect(page.getByText(/Some plugin entries are discovery-only/i)).toHaveCount(0);
});

test("skills-only agent pages do not describe a config connection", async ({ page }) => {
  await gotoSettled(page, "/agents/warp/");

  const start = page.getByRole("region", { name: "Start with LiteSPM" });
  await expect(start.getByText("2. Check the skill path", { exact: true })).toBeVisible();
  await expect(start).toContainText("every detected skills folder");
  await expect(start.getByRole("link", { name: "See the skill command" })).toHaveAttribute(
    "href",
    "#agent-command-title"
  );
  await expect(start.getByText("Connect Warp", { exact: true })).toHaveCount(0);
});
