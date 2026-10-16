// The category-sibling rule, in one place for the two sides that must agree.
//
// `scripts/emit-catalog-shards.mjs` writes one `public/data/pkg/cat/<slug>.json`
// per category, holding the rows the entry page's "Also in <category>" rail
// draws from. The product page wants that same list, so it has to know which
// files the build actually wrote — asking for a file that was never emitted is
// a guaranteed 404 on a static host, and the two sides agreeing by construction
// beats a page that discovers the gap one failed request at a time.
//
// Since the rail is now part of every entry page (not just the categories small
// enough to browse), every category gets a file. A category above
// `SIBLING_CATEGORY_MAX` gets a bounded slice of its rows in catalog order: the
// rail shows six, so the file only needs a deterministic sample — writing all
// 45,373 rows of the largest category would be a multi-megabyte fetch to pick
// six items from. The slice is the *same* slice for every entry of that
// category, ordered the catalog orders it (verified publishers first, then
// kind, then name), and the "see all" link beside the rail is the complete
// list.
//
// Who imports this file:
//
//   * `scripts/emit-catalog-shards.mjs` — decides which files to write.
//   * `app/package/page.tsx` — computes the set the product page is given,
//     from the same rows and the same rule, at build time.
//   * `lib/catalogData.ts` — refuses to fetch a sibling file that is not in
//     the set.
//
// Plain `.mjs` rather than `.ts` on purpose: the Node build scripts cannot
// import TypeScript, and `allowJs` is on in `tsconfig.json`, so the TypeScript
// callers still get types from the JSDoc.

/**
 * Categories above this row count are written as a bounded slice rather than
 * in full. The two largest in this catalog hold 45,373 and 19,209 rows; the
 * slice keeps each file at about the size of a small category's.
 */
export const SIBLING_CATEGORY_MAX = 500;

/** Rows a category above the cap is sliced to, in catalog order. */
export const SIBLING_SLICE_ROWS = 48;

/** `Developer Tools` → `developer-tools`; the emitted filename stem. */
export function categorySlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The slugs `pkg/cat/` is written for, from the dataset itself. A category
 * whose slug is empty is skipped, exactly as the emitter skips it.
 *
 * @param {Array<{ category?: string }>} rows
 * @returns {string[]}
 */
export function categorySiblingSlugs(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = row.category || "";
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const slugs = [];
  for (const name of counts.keys()) {
    const slug = categorySlug(name);
    if (slug) slugs.push(slug);
  }
  return slugs;
}
