import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, gotoSettled, test } from "./support/site";

test("listing form carries a reviewed skill request into the GitHub issue form", async ({ page }) => {
  await gotoSettled(page, "/submit/");
  await page.context().route("https://github.com/sarv-projects/LiteSPM/issues/new**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "GitHub request ready." })
  );

  await page.getByRole("radio", { name: "Agent skill" }).check();
  await page.getByLabel("Project name").fill("Meeting Notes");
  await page.getByLabel("Project or publisher URL").fill("https://github.com/acme/meeting-notes");
  await page.getByLabel("What does it help an agent do?").fill("Turn a meeting transcript into a concise, searchable summary.");
  await page.getByLabel("Setup or install details").fill("Install the meeting-notes skill from the repository path skills/meeting-notes/SKILL.md.");
  await page.getByLabel("Version or pinned revision").fill("a".repeat(40));
  await page.getByLabel("Known agent hosts or requirements").fill("Codex and Claude Code");
  await page.getByLabel("Anything else to help the review?").fill("Publisher documentation: https://example.com/docs");

  const destinationPromise = page.context().waitForEvent("page");
  await page.getByRole("button", { name: "Continue to GitHub" }).click();
  const destination = await destinationPromise;
  await expect(destination).toHaveURL(/github\.com\/sarv-projects\/LiteSPM\/issues\/new/);

  const params = new URL(destination.url()).searchParams;
  expect(params.get("template")).toBe("new-listing.yml");
  expect(params.get("title")).toBe("[Listing] Meeting Notes");
  expect(params.get("listing-type")).toBe("Agent skill");
  expect(params.get("listing-name")).toBe("Meeting Notes");
  expect(params.get("source-url")).toBe("https://github.com/acme/meeting-notes");
  expect(params.get("listing-summary")).toBe("Turn a meeting transcript into a concise, searchable summary.");
  expect(params.get("install-verification-details")).toContain("skills/meeting-notes/SKILL.md");
  expect(params.get("version-or-revision")).toBe("a".repeat(40));
  expect(params.get("compatibility")).toBe("Codex and Claude Code");
  expect(params.get("additional-context")).toContain("https://example.com/docs");
});

test("listing form uses native required fields before opening GitHub", async ({ page }) => {
  await gotoSettled(page, "/submit/");
  await page.getByRole("button", { name: "Continue to GitHub" }).click();
  await expect(page.getByLabel("Project name")).toBeFocused();
  await expect(page).toHaveURL(/submit/);
});

test("new-listing issue form collects the fields needed for each install type", () => {
  const templatePath = path.resolve(process.cwd(), "../.github/ISSUE_TEMPLATE/new-listing.yml");
  const template = readFileSync(templatePath, "utf8");
  for (const field of [
    "name: New listing",
    "id: listing-type",
    "id: listing-name",
    "id: listing-summary",
    "id: source-url",
    "id: version-or-revision",
    "id: install-verification-details",
    "id: compatibility",
    "id: additional-context",
    "MCP server",
    "Agent skill",
    "Plugin",
    "SKILL.md",
  ]) {
    expect(template, "issue form includes " + field).toContain(field);
  }
});
