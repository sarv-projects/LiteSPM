import React from "react";
import type { Listing } from "../../lib/telemetry";
import { availabilityOf } from "../../lib/availability";
import { isRemoteTransport } from "../../lib/hosts";
import { hostsNamedBy } from "../../lib/hostIdentity";
import { categoryLabel } from "../../app/categories/categoryLabel";
import type { PackageTabId } from "./PackageTabs";
import { Absent } from "./Absent";

/**
 * The plain layer of the package page: the five questions a non-developer
 * arrives with, answered in ordinary words before any technical field is
 * shown — what it is, what it does, who publishes it, whether LiteSPM can
 * install it, and which agents it works with — plus the version, which a
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
 *   * compatibility is declared by kind or by the publisher, never a test
 *     result;
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
    "An agent skill — a SKILL.md instruction file your agent loads when a task matches it. Nothing runs until the agent applies it.",
  plugin:
    "A plugin — a bundle of components your agent host installs.",
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

      <dl className="mt-3 grid gap-x-10 gap-y-4 border-b border-rule pb-4 md:grid-cols-2">
        <Fact term="What it is" detail={detailLink("overview", "details: Overview →")}>
          {KIND_PLAIN[item.kind]}{" "}
          <span className="text-ink-3">
            Filed under {categoryLabel(item.category) || "an unnamed category"}.
          </span>
        </Fact>

        <Fact term="What it does" detail={detailLink("overview", "details: Overview →")}>
          {item.summary?.trim() ? (
            item.summary.trim()
          ) : (
            <>
              <Absent /> — the publisher didn&rsquo;t provide a description.
            </>
          )}
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
                ? " — from the publisher's own manifest. Not audited by LiteSPM."
                : " — from a third-party list, not the publisher's own manifest. Not audited by LiteSPM."}
            </>
          ) : (
            <>
              <Absent /> — this listing doesn&rsquo;t name a publisher.
            </>
          )}
        </Fact>

        <Fact term="Can LiteSPM install it?" detail={detailLink("security", "details: Security →")}>
          {avail.installable ? (
            <>
              <strong className="font-medium text-ink">Yes</strong> — {avail.plain}
            </>
          ) : (
            <>
              <strong className="font-medium text-ink">No</strong> — {avail.plain}
            </>
          )}
        </Fact>

        <Fact
          term="Which agents it works with"
          detail={detailLink("compatibility", "details: Compatibility →")}
        >
          {hosts.length === 0 ? (
            <>
              <Absent /> — no hosts are listed for this entry.
            </>
          ) : item.kind === "plugin" ? (
            <>
              {hosts.length} host{hosts.length === 1 ? "" : "s"} — the publisher&rsquo;s own
              declared list.
            </>
          ) : (
            <>
              {hosts.length} of {hostTotal} agent hosts in this catalog — every host{" "}
              {item.kind === "mcp"
                ? isRemoteTransport(item.transport)
                  ? "LiteSPM can add a remote server to."
                  : "LiteSPM can set up."
                : "with a skills directory LiteSPM can write to."}
            </>
          )}
        </Fact>

        <Fact term="Version" detail={detailLink("versions", "details: Versions →")}>
          {item.version ? (
            <span className="t-mono text-[12.5px]!">{item.version}</span>
          ) : (
            <>
              <Absent /> — no version is published for this entry.
            </>
          )}
        </Fact>
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
