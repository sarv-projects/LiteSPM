import { expect, test } from "./support/site";
import { SOURCE_LABELS, sourceLabel } from "../lib/catalog";

test("public source labels name source families without exposing feed names", () => {
  expect(sourceLabel("feed:skills-sh")).toBe("Skills directory");
  expect(sourceLabel("feed:mcpservers-org")).toBe("MCP server directory");
  expect(sourceLabel("feed:punkpeye-awesome-mcp-servers")).toBe("Community MCP server list");
  expect(sourceLabel("feed:voltagent-awesome-agent-skills")).toBe("Community skills list");

  const labels = Object.values(SOURCE_LABELS).join(" ");
  expect(labels).not.toMatch(/skills\.sh|mcpservers\.org|mcp market|awesome-mcp-servers|awesome-agent-skills/i);
});

test("an unknown source ID does not become a public label", () => {
  expect(sourceLabel("future:private-feed-name")).toBe("Catalog source");
  expect(sourceLabel(null)).toBe("");
});
