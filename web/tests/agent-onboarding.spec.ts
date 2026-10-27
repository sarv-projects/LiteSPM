import { expect, test } from "./support/site";
import { gotoSettled } from "./support/site";

test("the agent directory opens with a searchable grid and clearly named counts", async ({ page }) => {
  await gotoSettled(page, "/agents/");

  await expect(page.getByRole("heading", { name: "Agent directory" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search agent profiles" })).toBeVisible();
  const directory = page.getByRole("region", { name: "Agent profiles" });
  await expect(directory).toBeVisible();
  await expect(directory).toHaveClass(/agent-directory-grid/);
  await expect(page.getByText(/profiles with MCP setup/i)).toBeVisible();
  await expect(page.getByText(/profiles with a skills destination/i)).toBeVisible();
  await expect(page.getByText(/These profile counts do not measure the number of installable catalog entries/)).toBeVisible();
  await expect(page.getByText(/Each profile includes sourced product details and a practical setup guide/)).toBeVisible();
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

  await expect(page.getByRole("heading", { name: "Find tools for Claude Code CLI" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Start with LiteSPM" })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="agent-works-title"]')).toContainText(
    /packages and skills to explore for Claude Code CLI/i
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


test("agent profiles distinguish products from shared skill destinations", async ({ page }) => {
  await gotoSettled(page, "/agents/adal/");
  await expect(page.getByRole("heading", { level: 1, name: "AdaL" })).toBeVisible();
  await expect(page.getByText(/Sylph’s AI agent for coding and computer tasks/)).toBeVisible();
  await expect(page.getByRole("link", { name: "docs.sylph.ai" })).toHaveAttribute("href", "https://docs.sylph.ai/");

  await gotoSettled(page, "/agents/universal/");
  await expect(page.getByText("Shared project skills folder", { exact: true })).toBeVisible();
  await expect(page.getByText(/\.agents\/skills/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Find skills for the shared folder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Setup details" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse skills for the shared folder", exact: true }).first()).toHaveAttribute(
    "href",
    /\/explore\/\?host=/
  );
});

test("category browsing uses task and topic language", async ({ page }) => {
  await gotoSettled(page, "/categories/");
  await expect(page.getByRole("heading", { name: "Browse by task" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Browse all topics" })).toBeVisible();
  await expect(page.getByText(/source categories|source labels/i)).toHaveCount(0);
});

test("a task category opens Explore with that same goal selected", async ({ page }) => {
  await gotoSettled(page, "/categories/");
  const firstTask = page.locator('a[href^="/explore/?goal="]').first();
  const href = await firstTask.getAttribute("href");
  expect(href).toBeTruthy();
  const goal = new URL(href!, "https://example.invalid").searchParams.get("goal");
  expect(goal).toBeTruthy();

  await firstTask.click();
  await expect(page).toHaveURL(new RegExp(`/explore/\\?goal=${encodeURIComponent(goal!)}`));
  await expect(page.locator("#explore-goal")).toHaveValue(goal!);
});

test("Explore groups only destinations with catalog listings", async ({ page }) => {
  await gotoSettled(page, "/explore/");
  await expect(page.locator('#explore-host optgroup[label^="Agents with MCP setup"]')).toHaveCount(1);
  await expect(page.locator('#explore-host optgroup[label^="Skills destinations"]')).toHaveCount(1);
  await expect(page.locator('#explore-host option[title*="no MCP config"]')).toHaveCount(0);
  await expect(page.locator('#explore-host option[value="Universal"]')).toHaveAttribute(
    "title",
    /shared folder/
  );
  await expect(page.locator('#explore-host option[value="Eve"]')).toHaveCount(0);
});
