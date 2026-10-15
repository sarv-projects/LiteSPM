import catalogData from "../../data/catalog.json";
import type { Listing } from "../../lib/telemetry";
import { categoryIndex, withLinkKeys } from "../../lib/catalog";
import { taxonomyIndex } from "../../lib/taxonomy";
import type { Metadata } from "next";
import type { CategoriesViewProps } from "./CategoriesView";
import CategoriesRoute from "./CategoriesRoute";

export const metadata: Metadata = {
  title: "Categories",
  description:
    "Browse the catalog by goal — an editorial grouping of task-shaped categories — and by the upstream sources' own category labels, with the number of MCP servers, agent skills and plugins filed under each.",
  alternates: { canonical: "/categories/" },
  openGraph: { title: "Categories · LiteSPM Market", url: "/categories/" },
};

/**
 * Server Component: both category axes are pure aggregation over the full
 * snapshot, computed at build time. The route ships its counts as props and
 * never fetches the dataset in the browser — there is nothing here that a row
 * list would be needed for.
 */
export default function CategoriesPage() {
  const items = withLinkKeys(catalogData as unknown as Listing[]);

  const props: CategoriesViewProps = {
    total: items.length,
    categories: categoryIndex(items),
    taxonomy: taxonomyIndex(items),
  };

  return <CategoriesRoute {...props} />;
}
