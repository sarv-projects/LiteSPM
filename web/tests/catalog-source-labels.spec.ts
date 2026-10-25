import { expect, test } from "./support/site";
import { SOURCE_LABELS, sourceLabel, publisherDisplayName, displayListingName, rowSignal, OFFICIAL_SKILLS_CATEGORY } from "../lib/catalog";
import { categoryLabel } from "../app/categories/categoryLabel";
import type { Listing } from "../lib/telemetry";

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


test("publisher display names read like brands without changing unknown IDs", () => {
  expect(publisherDisplayName("com.cloudflare.mcp")).toBe("Cloudflare");
  expect(publisherDisplayName("io.github.upstash-context7")).toBe("Upstash Context7");
  expect(publisherDisplayName("1password")).toBe("1Password");
  expect(publisherDisplayName("publisher.example.org")).toBe("publisher.example.org");
  expect(displayListingName({
    name: "com.cloudflare.mcp/mcp",
    kind: "mcp",
    publisher: { name: "com.cloudflare.mcp" },
  })).toBe("Cloudflare MCP Server");
});

test("source collection wording never presents a directory category as verification", () => {
  expect(categoryLabel(OFFICIAL_SKILLS_CATEGORY)).toBe("Skills by publisher");
  const signal = rowSignal({
    id: "skill:fixture",
    name: "Fixture",
    slug: "fixture",
    kind: "skill",
    category: OFFICIAL_SKILLS_CATEGORY,
    publisher: { name: "example", verified: false },
    summary: "",
  } as Listing);
  expect(signal.label).toBe("Publisher skill");
  expect(signal.note).not.toMatch(/official|verified/i);
});
