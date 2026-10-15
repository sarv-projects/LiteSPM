"use client";

import React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Listing } from "../../lib/telemetry";
import { kindLabel, listingHref } from "../../lib/catalog";
import { availabilityOf } from "../../lib/availability";
import type { AgentChoice } from "../../lib/landing";
import { rowWorksWithAgent } from "../../lib/landing";
import { PublisherTile } from "./PublisherMark";
import { categoryLabel } from "../../app/categories/categoryLabel";
import { DiscoveryCard } from "../ui/DiscoveryCard";

/**
 * One card in a home-page shelf. The anatomy follows mcpmarket.com's shelf
 * cards on purpose — mark, name, one line, a chip or two, and the strongest
 * signal the row actually carries — because that structure, not prose, is
 * what makes a shelf scannable.
 *
 * The signal is `availabilityOf`, the same predicate `litespm install` applies:
 * "Remote endpoint" / "Installs from source" when the row can be installed
 * today, "Discovery only" / "Not installable" when it cannot. The catalog
 * publishes no star, download or install count (the upstream sources expose
 * none), so the strongest true signal is whether the row installs — never a
 * number we do not have.
 */
export interface ShelfCardProps {
  item: Listing;
  /** Chosen in the "What do you use?" strip; renders the Works-with chip. */
  agent?: AgentChoice | null;
}

export function ShelfCard({ item, agent }: ShelfCardProps) {
  const avail = availabilityOf(item);
  const worksWith = rowWorksWithAgent(item, agent ?? null);
  const detail = [
    kindLabel(item.kind),
    item.publisher?.name ? `by ${item.publisher.name}` : "publisher unspecified",
    avail.plain,
    item.summary,
  ]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/\.+$/, ""))
    .join(". ");

  return (
    <DiscoveryCard as="li" interactive className="h-full">
      <div className="flex min-w-0 items-center gap-2.5">
        <PublisherTile name={item.publisher?.name} kind={item.kind} />
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-snug tracking-tight text-ink">
          <Link
            href={listingHref(item)}
            aria-label={`${item.name}. ${detail}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {item.name}
          </Link>
        </h3>
        <span
          className={`inline-flex shrink-0 items-center rounded-chip border px-1.5 py-0.5 text-[10.5px] font-medium ${
            avail.installable
              ? "border-accent/30 bg-accent-wash text-accent-text"
              : "border-dashed border-ink-3 bg-sunken text-ink-3"
          }`}
          title={avail.plain}
        >
          {avail.label}
        </span>
      </div>

      {item.summary && (
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{item.summary}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-3 text-[11.5px] text-ink-3">
        <span className="max-w-[18ch] truncate">{item.publisher?.name || "publisher unspecified"}</span>
        <span aria-hidden="true">·</span>
        <span className="max-w-[18ch] truncate">{categoryLabel(item.category)}</span>
        <span className={`meta-kind meta-kind-${item.kind}`}>{kindLabel(item.kind)}</span>
        {agent && agent.hosts.length > 0 && (
          <span
            className={`inline-flex items-center gap-1 rounded-chip border px-1.5 py-0.5 text-[10.5px] font-medium ${
              worksWith
                ? "border-accent/30 bg-accent-wash text-accent-text"
                : "border-rule bg-sunken text-ink-3"
            }`}
            title={
              worksWith
                ? "Installs into this agent, from the adapter registries or the publisher's own list. Not a test result."
                : "This entry does not declare that agent among its compatible hosts."
            }
          >
            {worksWith && <Check className="h-3 w-3" aria-hidden="true" />}
            {worksWith ? `Works with ${agent.label}` : `Not declared for ${agent.label}`}
          </span>
        )}
      </div>
    </DiscoveryCard>
  );
}
