"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Listing } from "../../lib/telemetry";
import { listingHref, sourceLabel } from "../../lib/catalog";
import {
  fetchCategorySiblings,
  fetchPublisherSiblings,
  fetchSourceSiblings,
} from "../../lib/catalogData";

/** Items per group. Six is what the competitor rails show (mcpmarket shows 6
 *  + "View more"); each group's own "see all" is the complete list. */
const RAIL_SIZE = 6;

interface RailGroup {
  id: string;
  title: string;
  href: string;
  rows: Listing[];
}

/**
 * Related entries, from the three signals the catalog genuinely carries:
 * same category, same publisher, same source. Deterministic throughout —
 * the files hold bounded slices in catalog order (`lib/relatedFiles.mjs`),
 * each group takes its first six entries not already on screen, and nothing
 * here ranks by popularity, because no popularity figure exists in the data.
 *
 * The rail mounts lazily, when the reader scrolls near it. That is not a
 * metric trick: it is how the home page already treats below-the-fold
 * discovery (`AgentStrip` and friends mount on `IntersectionObserver`), and
 * a reader who never scrolls past the record should not pay three catalog
 * fetches for a look. `rootMargin` is wide enough that the content exists
 * before it can enter the viewport, so arriving at the rail never shows a
 * shift or a flash of empty space.
 *
 * Groups degrade honestly and independently: a publisher with no sibling file
 * is answered without a request (the row's `publisherGroup` flag), a fetch
 * that fails drops only its group, and a group with nothing left to show
 * renders nothing — never a placeholder count, never a repeated entry.
 */
export function RelatedRail({
  item,
  siblingCategories,
}: {
  item: Listing;
  /** Category slugs this build wrote a sibling file for (`lib/categoryFiles.mjs`). */
  siblingCategories: string[];
}) {
  // The mount anchor. It exists in every state of this component, so the
  // observer has something stable to watch even before any data arrives.
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
  const source = item.source ?? "";
  // A file exists only for publishers with 2+ rows; the flag is stamped by the
  // same predicate that decided to write it, so no speculative 404 is possible.
  const askPublisher = Boolean(item.publisherGroup) && publisherName !== "";

  const [categoryRows, setCategoryRows] = useState<Listing[] | null>(null);
  const [publisherRows, setPublisherRows] = useState<Listing[] | null>(null);
  const [sourceRows, setSourceRows] = useState<Listing[] | null>(null);

  useEffect(() => {
    if (!reached) return;
    let alive = true;
    // Each signal degrades on its own; a failed fetch is an empty group.
    fetchCategorySiblings(item.category, siblingCategories)
      .then((rows) => alive && setCategoryRows(rows ?? []))
      .catch(() => alive && setCategoryRows([]));
    if (askPublisher) {
      fetchPublisherSiblings(publisherName)
        .then((rows) => alive && setPublisherRows(rows ?? []))
        .catch(() => alive && setPublisherRows([]));
    }
    if (source) {
      fetchSourceSiblings(source)
        .then((rows) => alive && setSourceRows(rows ?? []))
        .catch(() => alive && setSourceRows([]));
    }
    return () => {
      alive = false;
    };
  }, [reached, item.category, siblingCategories, askPublisher, publisherName, source]);

  const groups = useMemo(() => {
    // One running "already shown" set across the groups, seeded with the entry
    // itself: category is the widest net, and a row that already appeared in
    // it (or is the entry being read) cannot appear again under publisher or
    // source. Within a group, file order is kept — it is catalog order, the
    // same order every visitor of this entry sees.
    const shown = new Set<string>([item.id]);
    const take = (rows: Listing[] | null): Listing[] => {
      if (!rows) return [];
      const out: Listing[] = [];
      for (const row of rows) {
        if (shown.has(row.id)) continue;
        shown.add(row.id);
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
        title: `Also in ${item.category}`,
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
    const sourceGroup = take(sourceRows);
    if (sourceGroup.length > 0) {
      out.push({
        id: "source",
        title: `More from ${sourceLabel(source)}`,
        href: `/explore/?source=${encodeURIComponent(source)}`,
        rows: sourceGroup,
      });
    }
    return out;
  }, [
    item.id,
    item.category,
    categoryRows,
    publisherRows,
    sourceRows,
    publisherName,
    source,
  ]);

  if (groups.length === 0) {
    // Zero-height while there is nothing to show, so an empty rail costs no
    // space. The content can only appear while the rail is still ~600px below
    // the viewport, and it appears in place of this anchor — the page above it
    // never moves.
    return <div ref={anchorRef} className="h-px" aria-hidden="true" />;
  }

  return (
    <section aria-label="Related entries" className="mt-9 space-y-7">
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
                      <span className="truncate text-ink-3">{row.summary}</span>
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
