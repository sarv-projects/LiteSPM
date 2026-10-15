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
 * `generateStaticParams` used, so a URL can never appear here without a page
 * behind it, and no page can exist without appearing here.
 *
 * The path is `/package/entries/sitemap.xml`, not `/package/sitemap.xml`,
 * because the deployment's `_redirects` proxy claims the one-segment
 * `/package/<slug>` form (a 200 proxy to the shell); the sitemap must live at a
 * path the proxy cannot match, or crawlers would receive HTML instead of XML.
 *
 * `lastmod` is the catalog release's own creation time, the same date the root
 * sitemap publishes for every page: the rows all come from that one snapshot,
 * and no per-entry date exists in the data to publish instead.
 */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(release.createdAt);
  return catalogContext().staticEntries.map((item) => ({
    url: `${SITE_URL}${staticEntryHref(item)}`,
    lastModified,
  }));
}
