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
  // `--host`, not `--agent`: npx runs the PUBLISHED release, whose install
  // verb takes `--host`. This CLI takes both (its help calls `--host` the
  // older spelling of `--agent`), so one spelling is correct on either.
  expect(websiteInstallCommandFor({ id, kind: "mcp" }, "codex").command)
    .toBe("npx --yes litespm@latest install mcp:builtin:example --host codex");
  expect(websiteInstallCommandFor({ id: "plugin:example", kind: "plugin" }, "claude-code").command)
    .toBe("npx --yes litespm@latest install plugin:example --host claude-code");
  // A skill takes --host too: the catalog installer seals the destination in
  // the plan, so the named agent is the only one written.
  expect(websiteInstallCommandFor({ id: "skill:example", kind: "skill" }, "codex").command)
    .toBe("npx --yes litespm@latest install skill:example --host codex");
  // No agent chosen: the command stays BARE, because `npx litespm@latest` runs
  // the published release and a flag only newer releases know makes the page
  // print a command that fails with "unknown flag". A bare install is valid
  // everywhere: the CLI resolves the targets itself, and a release that would
  // fan a skill out to two or more detected agents stops and names both
  // remedies rather than guessing — which is what the entry page says next to
  // the command.
  expect(websiteInstallCommandFor({ id: "skill:example", kind: "skill" }).command)
    .toBe("npx --yes litespm@latest install skill:example");
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

test("a package page links its install command to the first-time setup flow", async ({ page }) => {
  const entry = preRenderedEntry();
  await gotoSettled(page, entry.href);
  const install = page.getByRole("region", { name: "Install with LiteSPM" });
  await expect(install).toBeVisible();
  await expect(install.locator("code")).toHaveText(websiteInstallCommandFor(entry.row).command);
  await expect(install.getByRole("button", { name: "Copy install command" })).toBeVisible();
  await expect(install.getByRole("link", { name: "Setup help" })).toHaveAttribute("href", "/get-started/");

  const flow = page.getByRole("region", { name: "How do I add it?" });
  await expect(flow.getByRole("heading", { name: "Connect your agent with LiteSPM" })).toBeVisible();
  await expect(flow.getByRole("heading", { name: "Download the capability catalog" })).toBeVisible();
  await expect(flow.getByText(WEBSITE_SETUP_COMMAND, { exact: true })).toBeVisible();
  await expect(flow.getByText(WEBSITE_CATALOG_SYNC_COMMAND, { exact: true })).toBeVisible();
  await expect(flow).toContainText("Sync it once before the install command.");
});

test("every flag the website prints is one the published install verb takes", () => {
  // The registry's own answer about what `@latest` is, recorded in
  // `data/published-cli.json` and re-checked against npm by
  // `scripts/check-install-command.mjs`. This is the contract that broke: the
  // site published `--agent` and `--all-detected` while the binary a reader
  // installs answered `unknown flag`.
  const publishedInstallFlags = new Set(["--help", "--version", "--scope", "--workspace", "--host", "--env", "--force", "--frozen"]);
  const rows = [
    { id: "mcp:builtin:example", kind: "mcp" },
    { id: "skill:example", kind: "skill" },
    { id: "plugin:example", kind: "plugin" },
  ] as const;
  for (const row of rows) {
    for (const chosen of [null, "codex"]) {
      const { command } = websiteInstallCommandFor(row, chosen);
      // Past the binary's own name: `npx --yes …` carries npx's flags, and
      // `--yes` is not one the CLI could ever accept.
      const own = command.slice(command.indexOf("litespm") + "litespm".length);
      for (const flag of own.matchAll(/\s(--[a-z][a-z0-9-]*)/g)) {
        expect(publishedInstallFlags.has(flag[1]), `published CLI does not take ${flag[1]} in "${command}"`).toBe(true);
      }
    }
  }
});
