import catalogData from "../../data/catalog.json";
import type { Listing } from "../../lib/telemetry";
import { hostUniverse, sortListings, withLinkKeys } from "../../lib/catalog";
import { categorySiblingSlugs } from "../../lib/categoryFiles.mjs";
import type { PackageViewProps } from "./PackageView";
import PackageRoute from "./PackageRoute";
import type { Metadata } from "next";

/**
 * The route's own title, description and canonical.
 *
 * Every product page used to inherit the layout's metadata, so all 69,376
 * addresses shared one `<title>`, one description and one `og:url`, and none
 * declared a canonical. The entry itself cannot be named here — the slug lives
 * in the URL and this file is prerendered once — so the shell describes the
 * route honestly; the resolved entry's name and summary are written into the
 * document (and its og tags) once the browser has resolved the slug.
 */
export const metadata: Metadata = {
  title: "Entry detail",
  description:
    "One entry from the LiteSPM catalog: what it does, which agent hosts it works with, and how to add it.",
  alternates: { canonical: "/package/" },
  openGraph: { title: "Entry detail · LiteSPM Market", url: "/package/" },
};

/**
 * Server Component: `/package/` prerenders the route index (a described frame
 * plus the first twelve rows) and nothing else — the entry itself is keyed off
 * `?slug=`, which only the browser can read. That is also why this route is
 * the one place the dataset is requested eagerly: resolving a slug needs the
 * rows, so a deep link fetches them on its first client frame, while a bare
 * `/package/` visit fetches nothing.
 */
export default function PackagePage() {
  const items = withLinkKeys(catalogData as unknown as Listing[]);

  const props: PackageViewProps = {
    total: items.length,
    hostTotal: hostUniverse(items).length,
    indexRows: sortListings(items, "index").slice(0, 12),
    // Which categories this build wrote a sibling file for, from the same
    // rows and the same rule the emitter used (`lib/categoryFiles.mjs`). The
    // product page skips the request for every other category — the two
    // largest — instead of paying a guaranteed 404 on each visit.
    siblingCategories: categorySiblingSlugs(items),
  };

  return <PackageRoute {...props} />;
}
