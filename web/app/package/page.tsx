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
 * `/package/entries/sitemap.xml`.
 */
export const metadata: Metadata = {
  title: "Entry detail",
  description:
    "One entry from the LiteSPM catalog: what it does, which agent hosts it works with, and how to add it.",
  alternates: { canonical: "/package/" },
  openGraph: { title: "Entry detail · LiteSPM Market", url: "/package/" },
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
