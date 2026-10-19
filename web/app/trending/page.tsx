import type { Metadata } from "next";
import TrendingRedirect from "./TrendingRedirect";

/**
 * The old `/trending/` address.
 *
 * The page it used to serve is a census of the catalog, not a trending list:
 * no source publishes usage data, so nothing on it is ranked by popularity
 * and nothing on it moves. The route was renamed `/insights/` (F-24) and this
 * address now redirects there.
 *
 * A static export has no server to answer with a 301, so the redirect is
 * rendered: the client replaces the address on arrival, a meta refresh does
 * the same for a reader without JavaScript, and the page itself says where
 * the content went — so nothing here is a dead end.
 *
 * The page is `noindex`: it is the same content as `/insights/`, and a
 * crawler should index the canonical address, not this one.
 */
export const metadata: Metadata = {
  title: "Insights",
  description:
    "The coverage boards moved to /insights/ — the catalog counted by capability kind, agent host, category and publisher.",
  alternates: { canonical: "/insights/" },
  robots: { index: false, follow: true },
};

export default function TrendingPage() {
  return <TrendingRedirect />;
}
