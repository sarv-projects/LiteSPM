import type { PackageViewProps } from "./PackageView";
import PackageRoute from "./PackageRoute";
import { catalogContext } from "../../lib/packageServer";
import type { Metadata } from "next";

/**
 * The route's own title, description and canonical.
 *
 * The bare `/package/` route is the index of the entry route: it resolves an
 * entry from `?slug=` in the browser, so this file is prerendered once and
 * cannot name an entry. The pre-rendered entry pages live at
 * `/package/<key>/` (`app/package/[slug]/page.tsx`) and each carries its own
 * title, description, canonical and structured data; the set that gets one is
 * chosen in `lib/packageEntries.ts` and listed at
 * `/package/entries/sitemap.xml`. An entry outside that set is served by the
 * edge Worker (`worker/index.js`), which injects the same metadata into this
 * shell — so the generic title/description below reach only a request that
 * names no key at all.
 */
export const metadata: Metadata = {
  title: "Find a package",
  description:
    "One entry from the LiteSPM catalog: what it does, which agent targets have a supported install path, and how to add it.",
  alternates: { canonical: "/package/" },
  openGraph: { title: "Find a package · LiteSPM", url: "/package/" },
};

/**
 * Server Component: the index shell plus the first twelve rows. The whole
 * snapshot context is computed once per build in `lib/packageServer.ts` and
 * shared with the entry pages and the sitemap, so this route, the pages it
 * links to and the pages advertised to crawlers all read the same numbers.
 */
export default function PackagePage() {
  const { total, hostTotal, indexRows, siblingCategories, versioned } = catalogContext();

  const props: PackageViewProps = {
    total,
    hostTotal,
    indexRows,
    siblingCategories,
    snapshot: { total, versioned },
  };

  return <PackageRoute {...props} />;
}
