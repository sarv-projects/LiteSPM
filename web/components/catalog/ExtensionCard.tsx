"use client";

import React from "react";
import Link from "next/link";
import { Listing } from "../../lib/telemetry";
import { kindLabel, listingHref } from "../../lib/catalog";
import { PublisherTile, VerifiedMark } from "./PublisherMark";
import { availabilityOf } from "../../lib/availability";
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
 * The primary listing unit: a ruled, 0-radius table row. Every row is a single
 * link to the package page, so the whole row is keyboard reachable.
 *
 * The row carries the description visibly. It used to appear only in the
 * aria-label, which meant a sighted reader learned nothing about what a
 * capability does without opening it.
 *
 * There is no star column: the catalog publishes no popularity figures (the
 * upstream sources do not expose them), so a column that said "not published"
 * on every one of 5,814 rows was noise.
 */
export function ExtensionCard({ item }: ExtensionCardProps) {
  const avail = availabilityOf(item);
  const detail = [
    kindLabel(item.kind),
    item.publisher?.name ? `by ${item.publisher.name}` : "publisher unspecified",
    // Stated in the accessible name as well as the chip, because a `title`
    // tooltip is unreachable on touch and this is the field that decides
    // whether the page behind the link can install anything.
    avail.plain,
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
      className="row"
    >
      <span className="row-spine" aria-hidden="true" />
      <PublisherTile name={item.publisher?.name} kind={item.kind} />

      <span className="min-w-0 py-0.5">
        <span className="row-name">{item.name}</span>
        {item.summary && <span className="row-summary">{item.summary}</span>}
        <span className="row-meta">
          <span className="meta-publisher">{item.publisher?.name || "unspecified"}</span>
          {item.publisher?.verified && <VerifiedMark />}
          <span className={`meta-kind meta-kind-${item.kind}`}>{KIND_TAG[item.kind]}</span>
          {item.transport && <span className="meta-spec">{item.transport}</span>}
          {item.runtime && <span className="meta-spec">{item.runtime}</span>}
          <span className="meta-category truncate">{categoryLabel(item.category)}</span>
        </span>
      </span>

      {/* The reason to open this row rather than the next one, in the one
          place the eye lands when scanning a list: the same installability
          predicate `litespm install` applies. The host-coverage chip that sat
          here printed a constant for MCP rows ("any bridge host") and a
          single "1 host" for plugins — a column of identical values trains
          the eye to skip it, so it was removed rather than padded. */}
      <span className="row-side">
        <span
          className={`meta-avail meta-avail-${avail.installable ? "installable" : "blocked"}`}
          title={avail.plain}
        >
          {avail.label}
        </span>
      </span>
    </Link>
  );
}
