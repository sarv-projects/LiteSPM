"use client";

import React from "react";
import Link from "next/link";
import { Listing } from "../../lib/telemetry";
import { kindLabel, listingHref, rowProvenance, rowSignal } from "../../lib/catalog";
import { PublisherTile } from "./PublisherMark";
import { categoryLabel } from "../../app/categories/categoryLabel";

export type ExtensionItem = Listing;

interface ExtensionCardProps {
  item: Listing;
}

const KIND_TAG: Record<Listing["kind"], string> = {
  mcp: "mcp",
  skill: "skill",
  plugin: "plugin",
};

/**
 * The primary listing unit: one ruled row, one link.
 *
 * Its job is "why this row rather than the next one", so the anatomy is fixed
 * and every field is a fact the row carries:
 *
 *   mark     the real publisher mark (`publisherMark`) at 28px — the same
 *            identity the shelf cards carry, not a letter stamp;
 *   name     the strongest type on the row, one line, never wrapped;
 *   line     the summary, clamped to two lines and held at two line-heights
 *            whether it fills them or not, so every row in the list is the
 *            same height and the meta lines line up down the page;
 *   meta     publisher · kind chip · category · transport/runtime;
 *   signal   the strongest true claim the row makes (`rowSignal`: Official /
 *            can be installed now / discovery only), then its provenance
 *            (`rowProvenance`: the publisher's manifest, or the directory the
 *            row was ingested from).
 *
 * There is no star column and no popularity rank: the catalog publishes no
 * star, download or install count (the upstream sources expose none), so a
 * column that said "not published" on every row was noise. Version, transport
 * and runtime are printed where the publisher supplied them, as specification
 * rather than as a score.
 *
 * The row used to be a table of near-equal-weight metadata where the right
 * column printed the same "INSTALLS FROM SOURCE" on row after row — a column
 * of identical values trains the eye to skip the one signal that should decide
 * the click. Now the right rail leads with the row's own claim and names where
 * the record came from, which also distinguishes two rows that install the
 * same way.
 */
export function ExtensionCard({ item }: ExtensionCardProps) {
  const signal = rowSignal(item);
  const provenance = rowProvenance(item);
  const detail = [
    kindLabel(item.kind),
    item.publisher?.name ? `by ${item.publisher.name}` : "publisher unspecified",
    signal.note,
    item.summary,
  ]
    // Each part is its own sentence and may already end in a period; the join
    // supplies one, so strip the part's own first — "locally.. Manage …" is
    // what the accessible name used to read.
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/\.+$/, ""))
    .join(". ");

  return (
    <Link
      href={listingHref(item)}
      data-kind={item.kind}
      aria-label={`${item.name}. ${detail}`}
      className="group relative flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule bg-surface py-3 pl-0 pr-3 transition-colors duration-state ease-out hover:bg-hover focus-visible:bg-hover"
    
      prefetch={false}
>
      {/* Kind spine: 3px, the row's left edge. */}
      <span
        aria-hidden="true"
        className={`self-stretch rounded-[1px] ${
          item.kind === "mcp" ? "bg-mcp" : item.kind === "skill" ? "bg-skill" : "bg-plugin"
        }`}
        style={{ width: 3 }}
      />

      {/* 40px, not 28. Measured against mcpservers.org, whose mark is ~44px on
          a white plate and is the focal point of the card: at 28px a real
          vendor logo reads as decoration rather than identity, which was the
          remaining half of "they have very good logos". */}
      <PublisherTile item={item} size={40} />

      <span className="min-w-0 flex-1 basis-[60%]">
        <span className="block truncate text-[15px] font-semibold leading-snug tracking-tight text-ink underline-offset-2 group-hover:underline">
          {item.name}
        </span>
        {item.summary && (
          <span className="mt-0.5 line-clamp-2 min-h-[42px] max-w-[110ch] text-[13px] leading-relaxed text-ink-2">
            {item.summary}
          </span>
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
          <span className="max-w-[24ch] truncate font-medium text-ink-2">
            {item.publisher?.name || "publisher unspecified"}
          </span>
          <span className={`meta-kind meta-kind-${item.kind}`}>{KIND_TAG[item.kind]}</span>
          <span className="truncate">{categoryLabel(item.category)}</span>
          {item.transport && <span className="meta-spec">{item.transport}</span>}
          {item.runtime && <span className="meta-spec">{item.runtime}</span>}
          {item.version && <span className="t-mono t-tabular">v{item.version}</span>}
        </span>
      </span>

      {/* The right rail: the row's own claim, and where the record came from.
          On narrow viewports it wraps to its own full-width line rather than
          squeezing the name column.

          The left hairline is the fix for a real defect: at 1440px the rail
          floated at the far edge with ~450px of empty paper between it and the
          text it describes, so the row read as two unrelated things. The rule
          gives the whitespace a boundary, which is what makes it read as a
          column instead of a gap. */}
      <span className="flex w-full shrink-0 flex-wrap items-center gap-x-2 gap-y-1 lg:ml-auto lg:w-[240px] lg:flex-col lg:items-end lg:gap-y-1.5 lg:border-l lg:border-rule lg:pl-4 lg:text-right">
        <span
          className={`inline-flex shrink-0 items-center rounded-chip border px-1.5 py-0.5 text-[10.5px] font-medium ${
            signal.tier === "official"
              ? "border-accent/40 bg-accent-wash text-accent-text"
              : signal.tier === "installable"
                ? "border-rule-2 bg-surface text-ink-2"
                : "border-dashed border-ink-3 bg-sunken text-ink-3"
          }`}
          title={signal.note}
        >
          {signal.label}
        </span>
        <span className="t-mono min-w-0 truncate text-[10.5px] text-ink-3" title={provenance}>
          {provenance}
        </span>
      </span>
    </Link>
  );
}
