import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, gotoSettled, test } from "./support/site";

test(
  "submit page offers a prefilled listing review issue without promising placement",
  async ({ page }) => {
    await gotoSettled(page, "/submit/");

    const newListing = page.getByRole("link", { name: "New listing" });
    await expect(newListing).toHaveAttribute(
      "href",
      "https://github.com/sarv-projects/LiteSPM/issues/new?template=new-listing.yml"
    );
    await expect(
      page.getByText("An issue requests review; it does not add a listing automatically.")
    ).toBeVisible();
    await expect(
      page.getByText(
        "LiteSPM does not sell placement or verification. A listing is not an endorsement."
      )
    ).toBeVisible();
    await expect(page.getByText(/a listing cannot be added by asking/i)).toHaveCount(0);
    await expect(
      page.getByText(/an issue can ask us to review a published source/i)
    ).toBeVisible();
  }
);

test("new-listing issue form collects the fields needed for each install type", () => {
  const templatePath = path.resolve(
    process.cwd(),
    "../.github/ISSUE_TEMPLATE/new-listing.yml"
  );
  const exists = existsSync(templatePath);
  expect(exists, "GitHub issue-form template exists").toBe(true);
  if (!exists) return;

  const template = readFileSync(templatePath, "utf8");
  for (const field of [
    "name: New listing",
    "label: Listing type",
    "label: Listing name",
    "label: Source URL",
    "label: Install and verification details",
    "MCP server",
    "Agent skill",
    "Plugin",
    "pinned",
    "SKILL.md",
  ]) {
    expect(template, `issue form includes ${field}`).toContain(field);
  }

  expect(template).toContain("does not sell placement or verification");
  expect(template).toContain("not an endorsement");

  const fields = template
    .split(/\n  - type: /)
    .slice(1)
    .map((field) => `  - type: ${field}`);
  for (const [id, type, label] of [
    ["listing-type", "dropdown", "Listing type"],
    ["listing-name", "input", "Listing name"],
    ["source-url", "input", "Source URL"],
    ["install-verification-details", "textarea", "Install and verification details"],
  ]) {
    const field = fields.find((candidate) => candidate.includes(`    id: ${id}\n`));
    expect(field, `issue form defines ${id}`).toBeDefined();
    expect(field).toContain(`- type: ${type}`);
    expect(field).toContain(`label: ${label}`);
    expect(field).toContain("required: true");
  }
});
