"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { relatedListings, listingIdentity } from "../../lib/discovery.mjs";
import type { Listing } from "../../lib/telemetry";
import { availabilityOf } from "../../lib/availability";
import { classifyListing } from "../../lib/taxonomy";
import { listingHref } from "../../lib/catalog";
import {
  fetchCategorySiblings,
  fetchPublisherSiblings,
} from "../../lib/catalogData";
import { categoryLabel } from "../../app/categories/categoryLabel";
import { listingSummary } from "../../lib/listingSummary.mjs";

/** Items per group, with the full set one click away. */
const RAIL_SIZE = 6;
const RELATED_STOP_WORDS = new Set([
  "agent", "agents", "with", "from", "your", "this", "that", "their", "into",
  "through", "using", "use", "tool", "tools", "server", "servers", "mcp",
  "skill", "skills", "plugin", "plugins", "for", "and", "the",
]);

interface RailGroup {
  id: string;
  title: string;
  href: string;
  rows: Listing[];
}

function terms(item: Listing): Set<string> {
  const words = `${item.name} ${listingSummary(item)}`.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length >= 4 && !RELATED_STOP_WORDS.has(word)));
}

function relevance(item: Listing, goal: string, itemTerms: Set<string>, candidate: Listing): number {
  let score = 0;
  if (candidate.kind === item.kind) score += 3;
  if (goal !== "other" && classifyListing(candidate) === goal) score += 4;
  for (const word of terms(candidate)) {
    if (itemTerms.has(word)) score += 1;
  }
  return score;
}

/**
 * The rail uses signals that help a visitor choose another package: shared
 * task, package type and terms from the listing. It omits broad source-feed
 * lists, which mixed unrelated projects into the recommendations. Listings
 * without a supported LiteSPM install path stay in Explore, where their own
 * status is visible, rather than being promoted as a next step here.
 *
 * Results are ranked deterministically from catalog metadata, never popularity
 * figures. The rail mounts near the bottom of the page and loads at most two
 * sibling files, after the visitor has already viewed the listing.
 */
export function RelatedRail({
  item,
  siblingCategories,
}: {
  item: Listing;
  /** Category slugs this build wrote a sibling file for (`lib/categoryFiles.mjs`). */
  siblingCategories: string[];
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [reached, setReached] = useState(false);

  useEffect(() => {
    if (reached) return;
    const el = anchorRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setReached(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setReached(true);
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reached]);

  const publisherName = item.publisher?.name ?? "";
  const askPublisher = Boolean(item.publisherGroup) && publisherName !== "";
  const [categoryRows, setCategoryRows] = useState<Listing[] | null>(null);
  const [publisherRows, setPublisherRows] = useState<Listing[] | null>(null);

  useEffect(() => {
    if (!reached) return;
    let alive = true;
    fetchCategorySiblings(item.category, siblingCategories)
      .then((rows) => alive && setCategoryRows(rows ?? []))
      .catch(() => alive && setCategoryRows([]));
    if (askPublisher) {
      fetchPublisherSiblings(publisherName)
        .then((rows) => alive && setPublisherRows(rows ?? []))
        .catch(() => alive && setPublisherRows([]));
    }
    return () => {
      alive = false;
    };
  }, [reached, item.category, siblingCategories, askPublisher, publisherName]);

  const groups = useMemo(() => {
    const shown = new Set<string>([listingIdentity(item)]);
    const itemGoal = classifyListing(item);
    const itemTerms = terms(item);
    const take = (rows: Listing[] | null): Listing[] => {
      if (!rows) return [];
      const relatedRows = relatedListings(item, rows) as Listing[];
      const ranked = relatedRows
        .filter((row: Listing) => availabilityOf(row).installable)
        .sort(
          (a: Listing, b: Listing) =>
            relevance(item, itemGoal, itemTerms, b) -
              relevance(item, itemGoal, itemTerms, a) ||
            a.name.localeCompare(b.name)
        );
      const out: Listing[] = [];
      for (const row of ranked) {
        if (shown.has(listingIdentity(row))) continue;
        shown.add(listingIdentity(row));
        out.push(row);
        if (out.length >= RAIL_SIZE) break;
      }
      return out;
    };

    const out: RailGroup[] = [];
    const categoryGroup = take(categoryRows);
    if (categoryGroup.length > 0) {
      out.push({
        id: "category",
        title: `More in ${categoryLabel(item.category)}`,
        href: `/explore/?category=${encodeURIComponent(item.category)}`,
        rows: categoryGroup,
      });
    }
    const publisherGroup = take(publisherRows);
    if (publisherGroup.length > 0) {
      out.push({
        id: "publisher",
        title: `More from ${publisherName}`,
        href: `/explore/?publisher=${encodeURIComponent(publisherName)}`,
        rows: publisherGroup,
      });
    }
    return out;
  }, [
    item.id,
    item.name,
    item.summary,
    item.kind,
    item.category,
    categoryRows,
    publisherRows,
    publisherName,
  ]);

  if (groups.length === 0) {
    return <div ref={anchorRef} className="h-px" aria-hidden="true" />;
  }

  return (
    <section ref={anchorRef} aria-label="Related entries" className="mt-9 space-y-7">
      {groups.map((group) => (
        <div key={group.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-2 pb-1.5">
            <h2 className="t-cond text-[15px] font-semibold tracking-tight text-ink">
              {group.title}
            </h2>
            <Link
              href={group.href}
              className="t-mono shrink-0 text-[11px] text-ink-3 transition-colors duration-state ease-out hover:text-ink hover:underline"
            >
              see all
            </Link>
          </div>
          <ul>
            {group.rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={listingHref(row)}
                  className="grid grid-cols-[3px_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2.5 transition-colors hover:bg-hover"
                  prefetch={false}
                >
                  <span
                    aria-hidden="true"
                    className="h-7 w-[3px] rounded-[1px]"
                    style={{ backgroundColor: `var(--${row.kind})` }}
                  />
                  <span className="min-w-0">
                    <span className="t-cond block truncate text-[14px] font-medium text-ink">
                      {row.name}
                    </span>
                    <span className="row-meta">
                      <span className="meta-publisher">{row.publisher?.name || "unspecified"}</span>
                      {listingSummary(row) && <span className="truncate text-ink-3">{listingSummary(row)}</span>}
                    </span>
                  </span>
                  <span className="t-mono t-tabular shrink-0 text-[11px] text-ink-3">
                    {row.kind}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
