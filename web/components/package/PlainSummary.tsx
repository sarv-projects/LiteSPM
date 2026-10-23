import React from "react";
import type { Listing } from "../../lib/telemetry";
import { availabilityOf } from "../../lib/availability";
import { feasibilityFor } from "../../lib/installFeasibility";
import { hostsNamedBy } from "../../lib/hostIdentity";
import { categoryLabel } from "../../app/categories/categoryLabel";
import type { PackageTabId } from "./PackageTabs";

/**
 * The plain layer of the package page: the five questions a non-developer
 * arrives with, answered in ordinary words before any technical field is
 * shown — what it is, what it does, who publishes it, whether LiteSPM can
 * install it, and the agent targets the catalog can support — plus the version, which a
 * non-developer also reads. The existing header keeps its own copy of the
 * entry's facts; nothing here removes or replaces it.
 *
 * Every row is a field the snapshot actually carries. A field the record does
 * not have says "Not published" in place, never nothing: an omitted row reads
 * as an answer that was left out, which is exactly what this layer exists to
 * avoid.
 *
 * The honesty of the rest of the page is load-bearing here, so it is repeated
 * rather than assumed:
 *
 *   * "verified" means the row was read from the publisher's own manifest —
 *     where the data came from — never that anyone audited or tested the entry;
 *   * target support follows LiteSPM's published metadata and config rules,
 *     never a test result;
 *   * the install answer is the same predicate the CLI runs, not a claim that
 *     an install has happened.
 *
 * Each row's "details" link opens the matching technical tab when scripting is
 * on, and falls back to the Details anchor when it is not, so the exact field
 * (transport, version, source, commands) is always one click away.
 */
export interface PlainSummaryProps {
  item: Listing;
  /** The catalog's host universe — the coverage denominator, for context. */
  hostTotal: number;
  /** Opens a technical tab. Without it the link still jumps to Details. */
  onOpenTab?: (tab: PackageTabId) => void;
}

/** What each kind is, said without the vocabulary of the catalog. */
const KIND_PLAIN: Record<Listing["kind"], string> = {
  mcp: "An MCP server — a small program your agent connects to and calls tools on. It runs where your agent runs, or as an endpoint the publisher hosts.",
  skill:
    "An agent skill — a SKILL.md instruction file that gives your agent repeatable guidance for a task.",
  plugin:
    "A plugin — a package that adds a coordinated set of tools or workflows to a supported agent.",
};

function Fact({
  term,
  children,
  detail,
}: {
  term: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div>
      <dt>{term}</dt>
      <dd className="m-0 text-[13.5px] leading-relaxed text-ink-2">
        {children}
        {detail && <div className="mt-1">{detail}</div>}
      </dd>
    </div>
  );
}

export function PlainSummary({ item, hostTotal, onOpenTab }: PlainSummaryProps) {
  const avail = availabilityOf(item);
  const feasibility = feasibilityFor(item);
  // One entry per host identity (`lib/hostIdentity`): the two catalog strings
  // that name the Pi host are one compatible host, and `hostTotal` counts the
  // same identities, so "N of M" is one rule on both sides of the fraction.
  const hosts = hostsNamedBy(item);

  const detailLink = (tab: PackageTabId, text: string) => (
    <a
      href="#pkg-details"
      onClick={
        onOpenTab
          ? (event) => {
              event.preventDefault();
              onOpenTab(tab);
            }
          : undefined
      }
      className="link t-mono text-[11px]"
    >
      {text}
    </a>
  );

  const publisher = item.publisher?.name?.trim();

  return (
    <section id="pkg-plain" aria-labelledby="pkg-plain-title" className="mt-8">
      <div className="section-head">
        <h2 id="pkg-plain-title">The short version</h2>
        <span className="section-note">in plain words</span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-10 gap-y-4 border-b border-rule pb-4 md:grid-cols-2">
        <Fact term="What it is" detail={detailLink("overview", "details: Overview →")}>
          {KIND_PLAIN[item.kind]}{" "}
          <span className="text-ink-3">
            Filed under {categoryLabel(item.category) || "an unnamed category"}.
          </span>
        </Fact>

        <Fact term="What it does" detail={detailLink("overview", "details: Overview →")}>
          {item.summary?.trim() || KIND_PLAIN[item.kind]}
        </Fact>

        <Fact term="Who publishes it" detail={detailLink("source", "details: Source →")}>
          {publisher ? (
            <>
              {item.publisher?.url && /^https?:\/\//i.test(item.publisher.url) ? (
                <a
                  href={item.publisher.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  {publisher}
                </a>
              ) : (
                publisher
              )}
              {item.publisher?.verified
                ? " — publisher listing."
                : " — community listing."}
            </>
          ) : (
            <>Community listing</>
          )}
        </Fact>

        <Fact term="Install setup" detail={detailLink("security", "setup details →")}>
          {avail.installable
            ? "Ready — choose your agent to get the install command."
            : avail.plain}
        </Fact>

        <Fact
          term={item.kind === "plugin" ? "Publisher-declared hosts" : "Agent install targets"}
          detail={detailLink("compatibility", "details: Compatibility →")}
        >
          {item.kind === "plugin" ? hosts.length > 0 ? (
            <>
              {hosts.length} agent host{hosts.length === 1 ? "" : "s"} listed for this plugin. Choose
              yours to see the setup details.
            </>
          ) : (
            <>Choose an agent below to see whether setup details are available.</>
          ) : (
            <>
              {feasibility.supportedHostIds.length > 0
                ? <>Setup is available for {feasibility.supportedHostIds.length} of {hostTotal} agent hosts. Select yours to view its configuration path.</>
                : <>Choose an agent to check whether setup is available.</>}
            </>
          )}
        </Fact>

        {item.version && (
          <Fact term="Version">
            <span className="t-mono text-[12.5px]!">{item.version}</span>
          </Fact>
        )}
      </dl>

      <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-3">
        Transport, runtime, config paths and the raw commands are in{" "}
        <a href="#pkg-details" className="link">
          Details
        </a>{" "}
        below.
      </p>
    </section>
  );
}
