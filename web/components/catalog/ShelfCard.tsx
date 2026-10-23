"use client";

import React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Listing } from "../../lib/telemetry";
import { kindLabel, listingHref, rowSignal } from "../../lib/catalog";
import type { AgentChoice } from "../../lib/landing";
import { rowWorksWithAgent } from "../../lib/landing";
import { PublisherTile } from "./PublisherMark";
import { categoryLabel } from "../../app/categories/categoryLabel";
import { DiscoveryCard } from "../ui/DiscoveryCard";

/**
 * One card in a home-page shelf. The anatomy follows mcpmarket.com's shelf
 * cards on purpose — mark, name, one line, a chip or two, and the strongest
 * signal the row actually carries — because that structure, not prose, is
 * what makes a shelf scannable: an identity, a summary, who published it,
 * what it is for, what kind of thing it is, whether it installs, and the
 * specification fields the publisher itself supplied (transport, runtime,
 * version) where the row carries them.
 *
 * Every card carries its own kind, category and signal chip, and nothing here
 * is suppressed for being constant across a shelf: a heading's claim is not
 * attached to the card a reader is looking at, and availability is the one
 * chip that decides a click. Values that are constant belong in the shelf's
 * own line; they are not *removed* from the card to be implied by it. The
 * accessible name below carries every value too.
 *
 * The signal is `rowSignal` — "Official" for the publisher's own skills, else
 * the same installability predicate `litespm install` applies ("Remote
 * endpoint" / "Installs from source" when the row installs today, "Discovery
 * only" / "Not installable" when it cannot). The catalog publishes no star,
 * download or install count (the upstream sources expose none), so the
 * strongest true signal is what the row itself claims — never a number we do
 * not have.
 *
 * The grid item is a wrapper `li`, not the card: the entrance animation
 * (`.rise-item`) must sit one level above the `.card-lift` element, or its
 * finished `transform` would pin the card's hover lift. See `Shelves`.
 */
export interface ShelfCardProps {
  item: Listing;
  /** Chosen in the "What do you use?" strip; renders the Works-with chip. */
  agent?: AgentChoice | null;
  /** Position in the shelf grid; shifts the entrance's view() window. */
  entranceIndex?: number;
}

export function ShelfCard({ item, agent, entranceIndex = 0 }: ShelfCardProps) {
  const signal = rowSignal(item);
  const worksWith = rowWorksWithAgent(item, agent ?? null);
  const detail = [
    kindLabel(item.kind),
    item.publisher?.name ? `by ${item.publisher.name}` : "community listing",
    signal.note,
    item.summary,
  ]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/\.+$/, ""))
    .join(". ");

  const meta = [item.publisher?.name || "community listing", categoryLabel(item.category)].filter(
    (part): part is string => Boolean(part)
  );

  const showWorks = Boolean(agent && agent.hosts.length > 0);

  return (
    <li
      className="rise-item h-full"
      style={{ "--rise-i": entranceIndex } as React.CSSProperties}
    >
      <DiscoveryCard interactive className="h-full">
        <div className="flex min-w-0 items-start gap-3">
          <span className="card-tile">
            <PublisherTile item={item} size={40} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold leading-snug tracking-tight text-ink">
              <Link
                href={listingHref(item)}
                aria-label={`${item.name}. ${detail}`}
                className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                prefetch={false}
              >
                {item.name}
              </Link>
            </h3>
            {/* Publisher · category, then the row's own specification fields —
                the same transport / runtime / version trio an Explore row
                prints, and printed only when the publisher supplied one. */}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-ink-3">
              <span className="truncate">{meta.join(" · ")}</span>
              {item.transport && <span className="meta-spec">{item.transport}</span>}
              {item.runtime && <span className="meta-spec">{item.runtime}</span>}
              {item.version && <span className="t-mono t-tabular">v{item.version}</span>}
            </p>
          </div>
        </div>

        {/* Fixed to two line-heights whether the summary is one line or two, so
            the card footer sits at the same y in every card of the shelf. */}
        <p className="mt-2.5 line-clamp-2 min-h-[42px] text-[13px] leading-relaxed text-ink-2">
          {item.summary || "Browse setup options and details for this package."}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-3">
          <span className={`meta-kind meta-kind-${item.kind}`}>{kindLabel(item.kind)}</span>
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
          {showWorks && agent && (
            <span
              className={`ml-auto inline-flex min-w-0 items-center gap-1 truncate rounded-chip border px-1.5 py-0.5 text-[10.5px] font-medium ${
                worksWith
                  ? "border-accent/40 bg-accent-wash text-accent-text"
                  : "border-rule bg-sunken text-ink-3"
              }`}
              title={
                worksWith
                  ? item.kind === "plugin"
                    ? "The publisher lists this agent for the plugin."
                    : "Setup is available for this agent."
                  : "Choose another agent to see its setup."
              }
            >
              {worksWith && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
              <span className="truncate">
                {worksWith
                  ? item.kind === "plugin"
                    ? `Listed for ${agent.label}`
                    : `Setup for ${agent.label}`
                  : "Choose another agent"}
              </span>
            </span>
          )}
        </div>
      </DiscoveryCard>
    </li>
  );
}
