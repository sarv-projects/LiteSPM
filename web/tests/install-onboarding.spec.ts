// Website-only install onboarding must describe capabilities the published
// CLI actually implements. These tests do not pretend npx performs local
// setup, catalog sync, and install in one invocation.
import { expect, test } from "./support/site";
import { gotoSettled } from "./support/site";
import { preRenderedEntry } from "./support/catalog";
import {
  WEBSITE_CATALOG_SYNC_COMMAND,
  WEBSITE_SETUP_COMMAND,
  safeCatalogId,
  websiteInstallCommandFor,
} from "../lib/installCommand";

test("published-CLI website command names the chosen agent for every kind", () => {
  const id = "mcp:builtin:example";
  expect(websiteInstallCommandFor({ id, kind: "mcp" }, "codex").command)
    .toBe("npx --yes litespm@latest install mcp:builtin:example --agent codex");
  expect(websiteInstallCommandFor({ id: "plugin:example", kind: "plugin" }, "claude-code").command)
    .toBe("npx --yes litespm@latest install plugin:example --agent claude-code");
  // A skill takes --agent too: the catalog installer seals the destination in
  // the plan, so the named agent is the only one written.
  expect(websiteInstallCommandFor({ id: "skill:example", kind: "skill" }, "codex").command)
    .toBe("npx --yes litespm@latest install skill:example --agent codex");
  // No agent chosen: the CLI refuses a multi-agent skill fan-out unless the
  // command says `--all-detected`, so the page prints the flag rather than a
  // command that would stop and ask.
  expect(websiteInstallCommandFor({ id: "skill:example", kind: "skill" }).command)
    .toBe("npx --yes litespm@latest install skill:example --all-detected");
  // An MCP server keeps its documented default: every bridge-registered host.
  expect(websiteInstallCommandFor({ id, kind: "mcp" }).command)
    .toBe("npx --yes litespm@latest install mcp:builtin:example");
  expect(WEBSITE_SETUP_COMMAND).toBe("npx --yes litespm@latest setup");
  expect(WEBSITE_CATALOG_SYNC_COMMAND).toBe("npx --yes litespm@latest catalog sync");
});

test("untrusted package ids and agent ids never enter a shell command", () => {
  expect(safeCatalogId("mcp:builtin:safe-name")).toBe(true);
  expect(safeCatalogId("foo;echo unsafe")).toBe(false);
  expect(() => websiteInstallCommandFor({ id: "foo;echo unsafe", kind: "mcp" })).toThrow();
  expect(() => websiteInstallCommandFor({ id: "mcp:ok", kind: "mcp" }, "codex;echo")).toThrow();
});

test("a package page exposes honest, copyable first-time npx steps", async ({ page }) => {
  const entry = preRenderedEntry();
  await gotoSettled(page, entry.href);
  const region = page.getByRole("region", { name: "Install with LiteSPM" });
  await expect(region).toBeVisible();
  await region.getByText("First time using LiteSPM?", { exact: false }).click();
  await expect(region.getByText(WEBSITE_SETUP_COMMAND, { exact: true })).toBeVisible();
  await expect(region.getByText(WEBSITE_CATALOG_SYNC_COMMAND, { exact: true })).toBeVisible();
  await expect(region).toContainText("does not yet combine bootstrap");
});
