"use client";

import Link from "next/link";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { CategoryFacet, kindLabel } from "../../lib/catalog";
import type { GoalFacet, TaxonomyIndex } from "../../lib/taxonomy";
import { formatCount } from "../../lib/format";
import { categoryLabel } from "./categoryLabel";
import { DiscoveryCard } from "../../components/ui/DiscoveryCard";

const KIND_ORDER = ["mcp", "skill", "plugin"] as const;

/**
 * Two browse axes, in the order they are useful.
 *
 *   1. **Goals** — LiteSPM's editorial grouping (lib/taxonomy.ts). The
 *      sources' own labels put 65.4% of this catalog in one bucket
 *      ("Developer Tools") and the next-largest in a format ("Agent Skills"),
 *      so the source vocabulary is a poor front door. The goal cards lead.
 *   2. **Source categories** — the upstream labels, kept verbatim as
 *      provenance. They still link into Explore, still appear on every entry,
 *      and the table is unchanged apart from its heading.
 *
 * Everything on this page is derived at build time from `data/catalog.json` by
 * `app/categories/page.tsx`; the route never fetches the row set in the
 * browser.
 */
export interface CategoriesViewProps {
  total: number;
  categories: CategoryFacet[];
  taxonomy: TaxonomyIndex;
}

function KindMix({ facet }: { facet: GoalFacet }) {
  return (
    <span className="flex items-center gap-2">
      {KIND_ORDER.map((kind) =>
        facet.byKind[kind] > 0 ? (
          <span
            key={kind}
            className="flex items-center gap-1"
            title={`${formatCount(facet.byKind[kind])} ${kindLabel(kind).toLowerCase()}${facet.byKind[kind] === 1 ? "" : "s"}`}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-[3px] rounded-[1px]"
              style={{ backgroundColor: `var(--${kind})` }}
            />
            <span className="t-mono t-tabular text-[11px] text-ink-3">
              <span className="sr-only">{kindLabel(kind)}: </span>
              {formatCount(facet.byKind[kind])}
            </span>
          </span>
        ) : null
      )}
    </span>
  );
}

export default function CategoriesPage({ total, categories, taxonomy }: CategoriesViewProps) {
  const { facets, coverage } = taxonomy;
  const goals = facets.filter((facet) => facet.id !== "other");
  const other = facets.find((facet) => facet.id === "other");

  return (
    <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
      <Header />

      <main id="main" className="shell flex-1 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Categories</h1>
          <p className="t-mono text-[11px] text-ink-3">
            {formatCount(goals.length)} goals · {formatCount(categories.length)} source categories ·{" "}
            {formatCount(total)} entries
          </p>
        </div>

        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
          Two ways to browse: <strong className="font-medium text-ink">goals</strong> group entries
          by what they help you do;{" "}
          <strong className="font-medium text-ink">source categories</strong> are the labels the
          sources themselves publish.
        </p>

        <h2 className="mt-8 band-title">Browse by goal</h2>
        <p className="band-sub mt-2">Each card opens Explore filtered to that goal.</p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((facet) => (
            <li key={facet.id}>
              <DiscoveryCard href={`/explore/?goal=${encodeURIComponent(facet.id)}`} className="h-full">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[15px] font-semibold tracking-tight text-ink">{facet.label}</h3>
                  <span className="t-mono t-tabular shrink-0 text-[12px] text-ink-3">
                    {formatCount(facet.count)}
                  </span>
                </div>

                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{facet.blurb}</p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <KindMix facet={facet} />
                  <span className="t-mono t-tabular text-[10.5px] text-ink-3">
                    {Math.round(facet.share * 100)}% of catalog
                  </span>
                </div>

                {facet.topCategories.length > 0 && (
                  <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
                    Mostly from{" "}
                    {facet.topCategories
                      .map((category) => `${categoryLabel(category.name)} (${formatCount(category.count)})`)
                      .join(", ")}
                  </p>
                )}
              </DiscoveryCard>
            </li>
          ))}

          {/* The remainder is shown as a card of its own, dashed and last: it
              is a reported fact, not a goal, and hiding it would make the
              coverage claim unverifiable. */}
          {other && other.count > 0 && (
            <li key="other">
              <DiscoveryCard
                href="/explore/?goal=other"
                plane="sunken"
                className="h-full"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                    {other.label}
                  </h3>
                  <span className="t-mono t-tabular shrink-0 text-[12px] text-ink-3">
                    {formatCount(other.count)}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{other.blurb}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <KindMix facet={other} />
                  <span className="t-mono t-tabular text-[10.5px] text-ink-3">
                    {Math.round(other.share * 100)}% of catalog
                  </span>
                </div>
              </DiscoveryCard>
            </li>
          )}
        </ul>

        <p className="mt-4 max-w-prose text-[12.5px] leading-relaxed text-ink-3">
          Goals place{" "}
          <span className="t-mono t-tabular text-ink-2">{formatCount(coverage.mapped)}</span> of{" "}
          <span className="t-mono t-tabular text-ink-2">{formatCount(total)}</span> entries (
          {Math.round(coverage.coverage * 100)}%); the rest stay in Other.
        </p>

        <div className="mt-10 border-b border-ink pb-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="band-title">Source categories</h2>
            <p className="t-mono text-[11px] text-ink-3">
              {formatCount(categories.length)} source labels
            </p>
          </div>
          <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
            The labels the sources themselves publish. A few name a language or a collection
            rather than a domain.
          </p>
        </div>

        {/* Column headers are a real table header, not an ALL-CAPS eyebrow. */}
        <div className="mt-5 border-b border-ink pb-2">
          <h3 className="sr-only">All source categories with entry counts</h3>
          <div className="t-mono grid grid-cols-[minmax(0,1fr)_56px] items-center gap-4 text-[10px] text-ink-3 md:grid-cols-[260px_64px_170px_minmax(120px,1fr)]">
            <span>Category</span>
            <span className="text-right">Entries</span>
            <span className="hidden md:block">Kind mix</span>
            <span className="hidden md:block">Share of the largest category</span>
          </div>
        </div>

        <ul>
          {categories.map((cat) => (
            <li key={cat.name}>
              <Link
                href={`/explore/?category=${encodeURIComponent(cat.name)}`}
                className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-4 border-b border-rule py-2.5 transition-colors hover:bg-hover md:grid-cols-[260px_64px_170px_minmax(120px,1fr)]"
              >
                <span className="t-cond truncate text-[14px] font-medium text-ink">
                  {categoryLabel(cat.name)}
                </span>

                <span className="t-mono t-tabular text-right text-[12px] text-ink-2">
                  {formatCount(cat.count)}
                </span>

                <span className="hidden items-center gap-2 md:flex">
                  {KIND_ORDER.map((kind) =>
                    cat.byKind[kind] > 0 ? (
                      <span
                        key={kind}
                        className="flex items-center gap-1"
                        title={`${formatCount(cat.byKind[kind])} ${kindLabel(kind).toLowerCase()}${cat.byKind[kind] === 1 ? "" : "s"}`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-[3px] rounded-[1px]"
                          style={{ backgroundColor: `var(--${kind})` }}
                        />
                        <span className="t-mono t-tabular text-[11px] text-ink-3">
                          <span className="sr-only">{kindLabel(kind)}: </span>
                          {formatCount(cat.byKind[kind])}
                        </span>
                      </span>
                    ) : null
                  )}
                </span>

                {/* The bar is a magnitude read, not decoration: it is scaled to
                    the largest category, so 100% means "Developer Tools". */}
                <span className="hidden items-center gap-2 md:flex">
                  <span className="block h-1.5 min-w-0 flex-1 bg-sunken-2">
                    <span
                      className="block h-full bg-ink-3"
                      style={{ width: `${Math.max(1.5, cat.share * 100)}%` }}
                    />
                  </span>
                  <span className="t-mono t-tabular w-9 shrink-0 text-right text-[10px] text-ink-3">
                    <span className="sr-only">share of the largest category: </span>
                    {Math.round(cat.share * 100)}%
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <SiteFooter />
    </div>
  );
}
