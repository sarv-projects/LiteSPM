const KIND_IDS = new Map([
  ["mcp", 0],
  ["skill", 1],
  ["plugin", 2],
]);
const KIND_ORDER = ["mcp", "skill", "plugin"];
const INSTALLABLE_STATES = new Set(["metadata_verified", "runtime_verified", "litespm_tested"]);
const nameCollator = new Intl.Collator();

function browseScore(row, featuredIds) {
  let score = featuredIds.has(row.id) ? 100 : 0;
  if (row.category === "Official Skills by") score += 4;
  if (row.publisher?.verified) score += 2;

  if (row.kind === "plugin") {
    if (row.artifact?.type === "git-tree" && row.artifact.pinned) score += 1;
  } else if (
    INSTALLABLE_STATES.has(row.installability) &&
    (row.kind !== "mcp" || Boolean(row.transport))
  ) {
    score += 1;
  }
  return score;
}

/**
 * Match the marketplace's existing curated order at build time. The result is
 * a compact row-id sequence, so browser filters preserve the same first page
 * without sorting or constructing every listing object on the main thread.
 */
function curatedBrowseOrder(rows, featuredIds) {
  const byKind = new Map(KIND_ORDER.map((kind) => [kind, []]));
  const decorated = rows.map((row, index) => ({
    row,
    index,
    kindRank: KIND_ORDER.indexOf(row.kind),
    score: browseScore(row, featuredIds),
    name: (row.name ?? "").replace(/^[^0-9A-Za-z]+/, "") || row.name || "",
  }));

  decorated.sort(
    (a, b) =>
      a.kindRank - b.kindRank ||
      b.score - a.score ||
      nameCollator.compare(a.name, b.name),
  );
  for (const entry of decorated) byKind.get(entry.row.kind)?.push(entry.index);

  const order = [];
  const longest = Math.max(0, ...[...byKind.values()].map((rowsForKind) => rowsForKind.length));
  for (let index = 0; index < longest; index += 1) {
    for (const kind of KIND_ORDER) {
      const rowId = byKind.get(kind)?.[index];
      if (rowId !== undefined) order.push(rowId);
    }
  }
  return order;
}

/**
 * Build a compact row-aligned filter table. Each display/search result can be
 * filtered by index before its display shard is fetched; Explore never needs
 * to create 69k row objects just to answer a kind or category filter.
 */
export function buildSearchFacets(rows, featuredIds = []) {
  const categories = [...new Set(rows.map((row) => String(row.category ?? "")))];
  const categoryIds = new Map(categories.map((category, index) => [category, index]));
  if (categories.length > 0xffff) throw new RangeError("too many catalog categories");

  const kindIds = new Array(rows.length);
  const categoryRows = new Array(rows.length);
  for (let index = 0; index < rows.length; index += 1) {
    kindIds[index] = KIND_IDS.get(rows[index]?.kind) ?? 255;
    categoryRows[index] = categoryIds.get(String(rows[index]?.category ?? "")) ?? 0;
  }

  return {
    schema: "litespm-search-facets/v1",
    rowCount: rows.length,
    categories,
    kindIds,
    categoryIds: categoryRows,
    browseOrder: curatedBrowseOrder(rows, new Set(featuredIds)),
  };
}

/** Keep the search index's ranking while narrowing its row ids by known facets. */
export function filterSearchIndices(indices, facets, filters = {}, options = {}) {
  if (
    !facets ||
    !Array.isArray(facets.kindIds) ||
    !Array.isArray(facets.categoryIds)
  ) {
    throw new TypeError("search facets are missing row-aligned kind/category indexes");
  }
  const wantedKind = filters.kind ? KIND_IDS.get(filters.kind) : undefined;
  const wantedCategory =
    filters.category && Array.isArray(facets.categories)
      ? facets.categories.indexOf(filters.category)
      : -1;
  if (filters.category && wantedCategory < 0) return [];

  const out = [];
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= facets.rowCount) continue;
    if (wantedKind !== undefined && facets.kindIds[index] !== wantedKind) continue;
    if (wantedCategory >= 0 && facets.categoryIds[index] !== wantedCategory) continue;
    out.push(index);
  }

  if (!options.rankBrowse || !Array.isArray(facets.browseOrder)) return out;
  const selected = new Set(out);
  return facets.browseOrder.filter((index) => selected.has(index));
}

/** Validate a fetched artifact before its row ids are trusted. */
export function isSearchFacets(value, rowCount) {
  return Boolean(
    value &&
      value.schema === "litespm-search-facets/v1" &&
      Number.isInteger(value.rowCount) &&
      value.rowCount > 0 &&
      (rowCount === undefined || value.rowCount === rowCount) &&
      Array.isArray(value.categories) &&
      Array.isArray(value.kindIds) &&
      Array.isArray(value.categoryIds) &&
      value.kindIds.length === value.rowCount &&
      value.categoryIds.length === value.rowCount &&
      Array.isArray(value.browseOrder) &&
      value.browseOrder.length === value.rowCount,
  );
}
