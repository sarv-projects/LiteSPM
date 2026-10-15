// The category-sibling rule, in one place for the two sides that must agree.
//
// `scripts/emit-catalog-shards.mjs` writes one `public/data/pkg/cat/<slug>.json`
// per category small enough for an "also in <category>" list to mean
// something. The product page wants that same list, so it has to know which
// files the build actually wrote — asking for a file that was never emitted is
// a guaranteed 404 on a static host, and the two sides agreeing by construction
// beats a page that discovers the gap one failed request at a time.
//
// Who imports this file:
//
//   * `scripts/emit-catalog-shards.mjs` — decides which files to write.
//   * `app/package/page.tsx` — computes the set the product page is given,
//     from the same rows and the same rule, at build time.
//   * `lib/catalogData.ts` — refuses to fetch a sibling file that is not in
//     the set, so the "too large for siblings" case costs no request at all.
//
// Plain `.mjs` rather than `.ts` on purpose: the Node build scripts cannot
// import TypeScript, and `allowJs` is on in `tsconfig.json`, so the TypeScript
// callers still get types from the JSDoc.

/**
 * Categories above this row count get no sibling file. The two largest in this
 * catalog hold 45,373 and 19,209 rows: twelve arbitrary entries out of tens of
 * thousands is noise, and the "see all" link is the honest answer there.
 */
export const SIBLING_CATEGORY_MAX = 500;

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
  for (const [name, count] of counts) {
    if (count > SIBLING_CATEGORY_MAX) continue;
    const slug = categorySlug(name);
    if (slug) slugs.push(slug);
  }
  return slugs;
}
