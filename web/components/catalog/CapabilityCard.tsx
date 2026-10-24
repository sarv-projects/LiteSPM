"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ChevronDown } from "lucide-react";
import { Listing } from "../../lib/telemetry";
import { kindLabel, listingHref } from "../../lib/catalog";
import { hostsNamedBy } from "../../lib/hostIdentity";
import { isRemoteTransport } from "../../lib/hosts";
import type { AgentChoice } from "../../lib/landing";
import { rowWorksWithAgent } from "../../lib/landing";
import { availabilityOf } from "../../lib/availability";
import { PublisherTile, VerifiedMark } from "./PublisherMark";
import { categoryLabel } from "../../app/categories/categoryLabel";
import { DiscoveryCard } from "../ui/DiscoveryCard";
import { formatCount } from "../../lib/format";

/**
 * `CapabilityCard` is the DISCOVERY density — home, ecosystem, collections.
 * `ExtensionCard` (the ruled `CatalogRow` density) stays what Explore uses.
 * The split is the point: a card can afford a plain-language summary, a
 * friendly name in Plex Sans and a hover lift; a result row cannot, because a
 * result row's job is comparison at 60px a line.
 *
 * Two layers, exactly as the review asked for:
 *   1. plain — name, what it does, its kind in words;
 *   2. technical — id, runtime, transport, version, source, host count —
 *      behind a `<details>` disclosure, because a hover-only reveal is not
 *      reachable by keyboard and this site's focus order is not decorative.
 *
 * The card is a link to the package page through a stretched anchor, so the
 * whole card is one target while the disclosure stays independently operable.
 */
interface CapabilityCardProps {
  item: Listing;
  /** Chosen in the "What do you use?" strip; renders the Works-with badge. */
  agent?: AgentChoice | null;
  /** Extra classes for grid placement. */
  className?: string;
}

const KIND_BADGE: Record<Listing["kind"], string> = {
  mcp: "meta-kind meta-kind-mcp",
  skill: "meta-kind meta-kind-skill",
  plugin: "meta-kind meta-kind-plugin",
};

/**
 * One technical field. Absent fields are omitted rather than rendered as
 * "not published".
 *
 * The card used to print a placeholder for every field the publisher did not
 * supply, which on a typical entry was two or three of six — the home page
 * alone carried 39 of them. Six rows of which three say nothing is worse than
 * three rows and a sentence explaining the rule, and the explanation is stated
 * once below the list instead of once per row.
 */
function TechRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule py-1.5 last:border-b-0">
      <dt className="t-mono shrink-0 text-[10.5px] uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="t-mono min-w-0 truncate text-right text-[11.5px] text-ink-2">{value}</dd>
    </div>
  );
}

export function CapabilityCard({ item, agent, className = "" }: CapabilityCardProps) {
  const worksWith = rowWorksWithAgent(item, agent ?? null);
  // One entry per host identity (`lib/hostIdentity`): a skill row's two
  // spellings of the Pi host are one host, and the count beside them is what
  // the same rule counts on the entry page.
  const hosts = hostsNamedBy(item);
  const avail = availabilityOf(item);
  const remoteEndpoint =
    item.kind === "mcp" && isRemoteTransport(item.transport) && Boolean(item.url || item.hasUrl);
  const detail = [
    kindLabel(item.kind),
    item.publisher?.name ? `by ${item.publisher.name}` : "publisher unspecified",
    avail.plain,
    item.summary,
  ]
    // `avail.plain` and summaries may carry their own trailing period; the
    // join supplies one, so strip the part's first.
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/\.+$/, ""))
    .join(". ");
  /**
   * What the "Hosts" value under Technical details is. Host coverage for MCP
   * and skills is derived from the kind — every host LiteSPM can set up — so
   * calling those "declared" would credit the publisher with a list it never
   * wrote. Only a plugin carries a publisher-declared list. The count is over
   * host identities, one per host however many strings name it.
   */
  const hostsValue =
    hosts.length === 0
      ? null
      : item.kind === "plugin"
        ? `${formatCount(hosts.length)} declared by the publisher`
        : `${formatCount(hosts.length)} agent hosts`;
  const provenanceValue = item.publisher?.provenance
    ? item.publisher.provenance === "vendor-manifest"
      ? "From the publisher's manifest"
      : "From a third-party list"
    : null;

  return (
    <DiscoveryCard as="article" interactive className={className}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="card-tile">
          <PublisherTile item={item} size={40} />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="pr-6 text-[15px] font-semibold leading-snug tracking-tight text-ink">
            <Link
              href={listingHref(item)}
              aria-label={`${item.name}. ${detail}`}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              prefetch={false}
            >
              {item.name}
            </Link>
            <ArrowUpRight
              className="card-arrow ml-1 inline h-3.5 w-3.5 align-baseline text-ink-3 opacity-0 group-hover:opacity-100"
              aria-hidden="true"
            />
          </h3>

          {item.summary && (
            <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-ink-2">{item.summary}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={KIND_BADGE[item.kind]}>{kindLabel(item.kind)}</span>
        <span
          className={`inline-flex items-center rounded-chip border px-1.5 py-0.5 text-[10.5px] font-medium ${
            avail.installable
              ? "border-rule-2 bg-surface text-ink-2"
              : "border-dashed border-ink-3 bg-sunken text-ink-3"
          }`}
          title={avail.plain}
        >
          {avail.label}
        </span>
        {item.category && <span className="text-[11.5px] text-ink-3">{categoryLabel(item.category)}</span>}
        {item.publisher?.verified && <VerifiedMark />}
        {agent && agent.hosts.length > 0 && (
          <span
            className={`inline-flex items-center gap-1 rounded-chip border px-1.5 py-0.5 text-[10.5px] font-medium ${
              worksWith
                ? "border-accent/30 bg-accent-wash text-accent-text"
                : "border-rule bg-sunken text-ink-3"
            }`}
            title={
              worksWith
                ? remoteEndpoint
                  ? "LiteSPM has a setup path for this agent and connection type. The publisher provides the service."
                  : "This agent is listed for the package. Its install status appears above."
                : "This agent is not listed for the package."
            }
          >
            {worksWith && <Check className="h-3 w-3" aria-hidden="true" />}
            {worksWith ? `Listed for ${agent.label}` : `Not listed for ${agent.label}`}
          </span>
        )}
      </div>

      <details className="group/tech relative z-10 mt-3 border-t border-rule pt-1">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-[12px] font-medium text-ink-2 transition-colors duration-state ease-out hover:text-ink md:min-h-[36px]">
          Technical details
          <ChevronDown
            className="h-3.5 w-3.5 text-ink-3 transition-transform duration-panel ease-out group-open/tech:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <dl className="mt-1 border-t border-rule pt-1">
          <TechRow label="ID" value={item.id} />
          <TechRow label="Runtime" value={item.runtime} />
          <TechRow label="Transport" value={item.transport} />
          <TechRow label="Version" value={item.version} />
          <TechRow label="Source" value={provenanceValue} />
          <TechRow label="Hosts" value={hostsValue} />
        </dl>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
          Values the entry doesn&rsquo;t carry are left out.
        </p>
      </details>
    </DiscoveryCard>
  );
}
