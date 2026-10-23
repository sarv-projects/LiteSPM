import { expect, test } from "./support/site";
import { gotoSettled } from "./support/site";

test("agent directory distinguishes agent profiles from installable packages", async ({ page }) => {
  await gotoSettled(page, "/agents/");

  await expect(page.getByRole("heading", { name: "Browse agent hosts" })).toBeVisible();
  await expect(page.getByText(/These profiles explain how LiteSPM works with each agent host/i)).toBeVisible();
  await expect(page.getByText(/does not install agent applications themselves/i)).toBeVisible();
  await expect(page.getByText(/Agent apps and connectors are part of the product direction/i)).toBeVisible();
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
  await expect(start).toContainText("use it from your computer");
  await expect(start).toContainText("This website does not install anything on your machine");
});

test("agent detail counts distinguish catalog listings from installable entries", async ({ page }) => {
  await gotoSettled(page, "/agents/claude-code/");

  await expect(page.getByRole("heading", { name: "Catalog entries for this agent" })).toBeVisible();
  await expect(page.locator('dt:text-is("Catalog entries") + dd')).toContainText(
    "entries shown for this agent"
  );
  await expect(page.getByText(/Some plugin entries are discovery-only/i)).toBeVisible();
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
