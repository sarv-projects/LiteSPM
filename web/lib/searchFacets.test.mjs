import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchFacets, filterSearchIndices, isSearchFacets } from "./searchFacets.mjs";

test("filters ranked row indices by kind and category without hydrating listings", () => {
  const rows = [
    { kind: "mcp", category: "Developer Tools" },
    { kind: "skill", category: "Agent Skills" },
    { kind: "mcp", category: "Design" },
    { kind: "plugin", category: "Developer Tools" },
  ];
  const facets = buildSearchFacets(rows);

  assert.deepEqual(filterSearchIndices([3, 2, 1, 0], facets, { kind: "mcp" }), [2, 0]);
  assert.deepEqual(
    filterSearchIndices([3, 2, 1, 0], facets, { kind: "mcp", category: "Developer Tools" }),
    [0],
  );
  assert.deepEqual(filterSearchIndices([3, 2, 1, 0], facets, {}), [3, 2, 1, 0]);
});

test("curated browse order survives kind filtering and is reused for each result window", () => {
  const rows = [
    { id: "mcp:other", kind: "mcp", name: "Zulu", category: "Developer Tools" },
    { id: "skill:other", kind: "skill", name: "Alpha", category: "Agent Skills" },
    { id: "mcp:featured", kind: "mcp", name: "Beta", category: "Design" },
  ];
  const facets = buildSearchFacets(rows, ["mcp:featured"]);

  assert.deepEqual(
    filterSearchIndices([0, 1, 2], facets, { kind: "mcp" }, { rankBrowse: true }),
    [2, 0],
  );
});

test("facets can validate themselves for lightweight browse without a search index", () => {
  const facets = buildSearchFacets([
    { id: "mcp:1", kind: "mcp", name: "A", category: "Developer Tools" },
    { id: "skill:1", kind: "skill", name: "B", category: "Agent Skills" },
  ]);

  assert.equal(isSearchFacets(facets), true);
  assert.equal(isSearchFacets(facets, 2), true);
  assert.equal(isSearchFacets(facets, 3), false);
  assert.deepEqual(
    filterSearchIndices(facets.browseOrder, facets, { kind: "mcp" }, { rankBrowse: true }),
    [0],
  );
});
