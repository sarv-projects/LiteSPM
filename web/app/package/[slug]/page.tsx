import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PackageViewProps } from "../PackageView";
import PackageRoute from "../PackageRoute";
import { catalogContext, staticEntryByKey } from "../../../lib/packageServer";
import {
  entryBreadcrumbJsonLd,
  entryJsonLd,
  entryMetaDescription,
  staticEntryHref,
  staticEntryKey,
} from "../../../lib/packageEntries";
import { SITE_URL } from "../../../lib/site";
import { categoryLabel } from "../../categories/categoryLabel";

/**
 * One real, pre-rendered page per entry in the bounded set.
 *
 * `/package/?slug=…` resolves its entry in the browser, so before this route
 * existed every one of the 69,376 entries was the same generic document to a
 * crawler that runs no JavaScript: one `<title>`, one description, and a
 * canonical pointing at the route index. This route emits a static page per
 * chosen entry — its own title, description, canonical, Open Graph tags and
 * `SoftwareApplication` JSON-LD — and everything outside the set keeps working
 * through the client path unchanged, with the same metadata injected into the
 * shipped shell by the edge Worker (`worker/index.js`).
 *
 * The set is bounded on purpose: a page per entry is 69,376 × 2 files against
 * Cloudflare Pages' 20,000-file free-plan limit. `lib/packageEntries.ts` states
 * the rule and the cap; `generateStaticParams` and the sitemap read the same
 * function, so the pages that exist and the pages that are advertised cannot
 * disagree. The route is only reachable at `/package/<key>/` (trailing slash):
 * the no-slash and query forms are served by the edge Worker with the same
 * shell, so an entry outside the set still resolves in the browser exactly as
 * it did before — and now carries its own metadata there too.
 *
 * The page body is the same view the client route uses, handed the resolved
 * row (`initialItem`). It therefore hydrates into the full interactive page —
 * tabs, install panel, prompts — while its raw HTML already carries the entry's
 * facts for a reader or crawler without scripting.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return catalogContext().staticEntries.map((item) => ({ slug: staticEntryKey(item) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = staticEntryByKey(slug);
  if (!item) return {};

  const description = entryMetaDescription(item);
  const canonical = staticEntryHref(item);

  return {
    // The layout's template appends " · LiteSPM Market".
    title: item.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      // Open Graph titles are used verbatim, so the site name is explicit here.
      title: `${item.name} · LiteSPM Market`,
      description,
      url: canonical,
    },
  };
}

export default async function PackageEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = staticEntryByKey(slug);
  if (!item) notFound();

  const { total, hostTotal, indexRows, siblingCategories, versioned } = catalogContext();

  const categoryText = categoryLabel(item.category);
  const jsonLd = [
    entryJsonLd(item, `${SITE_URL}${staticEntryHref(item)}`, categoryText),
    entryBreadcrumbJsonLd(item, SITE_URL, categoryText),
  ];

  const props: PackageViewProps = {
    total,
    hostTotal,
    indexRows,
    siblingCategories,
    initialItem: item,
    snapshot: { total, versioned },
  };

  return (
    <>
      {/*
        The entry's structured data, in the pre-rendered HTML. The client view
        skips its own copy when `initialItem` is present, so one entry never
        ships two SoftwareApplication blocks.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <PackageRoute {...props} />
    </>
  );
}
