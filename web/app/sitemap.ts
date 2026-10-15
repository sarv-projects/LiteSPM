import type { MetadataRoute } from "next";
import release from "../data/release.json";
import { HOSTS } from "../lib/hosts";
import { SITE_URL } from "../lib/site";

/**
 * `/sitemap.xml`, emitted at build time by the App Router's metadata-route
 * convention. The site is `output: "export"`, so this runs once, during
 * `next build`, and the result is a static file on the CDN — there is no
 * request-time render to go stale.
 *
 * Before this file existed the site served no sitemap at all, so the fifty
 * agent pages — each one a hand-written, sourced note on where that host keeps
 * its MCP config — were reachable only by following links a crawler had no
 * reason to find. Nothing pointed at them.
 *
 * The URL list is exactly the set of routes this export emits: the five index
 * pages plus one page per host in the compiled-in registry (`HOSTS`, the same
 * array `app/agents/[id]/page.tsx` uses for `generateStaticParams`, so the
 * sitemap cannot name a page the build did not produce).
 *
 * `/package/` is deliberately absent. It resolves an entry from `?slug=` in
 * the browser and answers any unknown slug with HTTP 200, so it presents a
 * crawler with an unbounded set of identical pages and no prerendered content
 * to index; `public/robots.txt` disallows it for the same reason.
 *
 * `lastmod` is the catalog release's own creation time from
 * `data/release.json` — the one date this build can honestly claim for every
 * page, because the counts, rows and notes all derive from that snapshot.
 * There are no per-page dates to publish, so none are invented.
 */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(release.createdAt);

  // Trailing slashes match `trailingSlash: true` in next.config.ts, so each
  // URL here is the canonical URL the page itself declares.
  const indexRoutes = ["/", "/agents/", "/categories/", "/explore/", "/trending/"];

  return [
    ...indexRoutes.map((path) => ({ url: `${SITE_URL}${path}`, lastModified })),
    ...HOSTS.map((host) => ({ url: `${SITE_URL}/agents/${host.id}/`, lastModified })),
  ];
}
