import type { MetadataRoute } from "next";
import release from "../../../data/release.json";
import { catalogContext } from "../../../lib/packageServer";
import { staticEntryHref } from "../../../lib/packageEntries";
import { SITE_URL } from "../../../lib/site";

/**
 * `/package/entries/sitemap.xml` — exactly the entry pages this build wrote.
 *
 * The root sitemap (`app/sitemap.ts`) deliberately lists no package URLs: it
 * names the routes the export emits, and the entry pages are a bounded set of
 * that export rather than a route. This nested sitemap is the honest list of
 * that set — it reads the same `selectStaticEntries` rule
 * `generateStaticParams` used, so every URL here has a pre-rendered page. The
 * post-build materializer writes `remaining-sitemap.xml` and its URL shards
 * for the rest of the catalog, which the edge Worker serves with per-entry
 * metadata but does not pre-render as individual files.
 *
 * The path is `/package/entries/sitemap.xml`, not `/package/sitemap.xml`,
 * because the edge Worker claims the one-segment `/package/<key>` form (it
 * serves the entry shell for a key, and an unknown key with `noindex`); the
 * sitemap must live at a path that is not an entry address, or crawlers would
 * receive HTML instead of XML.
 *
 * `lastmod` is the catalog release's own creation time: all rows come from
 * that one snapshot, and no per-entry date exists in the data to publish
 * instead.
 */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(release.createdAt);
  return catalogContext().staticEntries.map((item) => ({
    url: `${SITE_URL}${staticEntryHref(item)}`,
    lastModified,
  }));
}
