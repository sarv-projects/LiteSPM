import React from "react";
import type { Listing } from "../../lib/telemetry";
import { kindLabel, sourceLabel } from "../../lib/catalog";
import { availabilityOf } from "../../lib/availability";
import { VerifiedMark } from "../catalog/PublisherMark";
import { categoryLabel } from "../../app/categories/categoryLabel";

/**
 * The entry's specifications, as the sidebar card every competitor detail
 * page carries (mcpservers.org puts a "MCP server details" aside beside the
 * title; mcp.so does the same). It states only fields this snapshot actually
 * holds, and **omits a row entirely when the field is absent** rather than
 * printing a `—` or `Unknown` placeholder: a specification list that has to
 * pad itself is advertising how little it knows.
 *
 * Which rows can appear, and the field each reads:
 *
 *   Kind          kind                     always present
 *   Category      category                 always present
 *   Publisher     publisher.name / .url    always present (link when the record
 *                                          carries a usable http(s) URL)
 *   Version       version                  40,097 of 69,376 rows
 *   Transport     transport                25,400 rows (MCP servers)
 *   Runtime       runtime                  4,079 rows
 *   Endpoint      url                      25,400 rows, linked
 *   Source        source                   every row; shown as its display name
 *   Install       installability + kind    derived by `availabilityOf`, the
 *                                          same predicate the CLI applies
 *   Works with    compatibleHosts          638 rows (plugins only)
 *
 * A Licence row is deliberately absent as a *row rule*, not a per-entry
 * omission: no row in this dataset carries licence data, so the card must
 * never imply the question was asked. (`Listing.stars` is null on every row
 * for the same reason, and no popularity figure appears here at all.)
 */
export function SpecCard({ item }: { item: Listing }) {
  const avail = availabilityOf(item);
  const publisherUrl =
    item.publisher?.url && /^https?:\/\//i.test(item.publisher.url) ? item.publisher.url : null;
  const endpoint =
    item.url && /^https?:\/\//i.test(item.url) ? item.url : null;

  return (
    <section aria-labelledby="pkg-spec-title" className="border border-rule-2 bg-surface p-4">
      <h2 id="pkg-spec-title" className="kicker">
        Specifications
      </h2>
      <dl className="spec-list mt-1">
        <Row label="Kind">{kindLabel(item.kind)}</Row>
        <Row label="Category">{categoryLabel(item.category)}</Row>
        {item.publisher?.name && (
          <Row label={item.publisher?.provenance === "source-owner" ? "Source owner" : "Publisher"}>
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {publisherUrl ? (
                <a href={publisherUrl} target="_blank" rel="noopener noreferrer" className="link">
                  {item.publisher.name}
                </a>
              ) : (
                <span>{item.publisher.name}</span>
              )}
              {item.publisher.verified && <VerifiedMark />}
            </span>
          </Row>
        )}
        {item.version && (
          <Row label="Version" mono>
            {item.version}
          </Row>
        )}
        {item.transport && (
          <Row label="Transport" mono>
            {item.transport}
          </Row>
        )}
        {item.runtime && (
          <Row label="Runtime" mono>
            {item.runtime}
          </Row>
        )}
        {endpoint && (
          <Row label="Endpoint" mono>
            <a href={endpoint} target="_blank" rel="noopener noreferrer" className="link break-all">
              {endpoint}
            </a>
          </Row>
        )}
        {item.source && <Row label="Source">{sourceLabel(item.source)}</Row>}
        <Row label="Install">
          <span title={avail.plain}>{avail.label}</span>
        </Row>
        {item.kind === "plugin" && item.compatibleHosts && item.compatibleHosts.length > 0 && (
          <Row label="Works with">{item.compatibleHosts.join(", ")}</Row>
        )}
      </dl>
    </section>
  );
}

/** One key/value line. The caller decides whether it renders — no "missing"
 *  state exists here by design. */
function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "t-mono text-[12px]!" : undefined}>{children}</dd>
    </div>
  );
}
