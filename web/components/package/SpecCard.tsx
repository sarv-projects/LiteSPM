import React from "react";
import type { Listing } from "../../lib/telemetry";

/**
 * Technical specifications that do not already appear in the title block.
 * Identity, publisher, category and installability are stated there once;
 * this card keeps only version and connection details. It omits a row entirely
 * when the snapshot has no value rather than padding it with placeholders.
 *
 * Which rows can appear, and the field each reads:
 *
 *   Version       version                  40,097 of 69,376 rows
 *   Transport     transport                25,400 rows (MCP servers)
 *   Runtime       runtime                  4,079 rows
 *   Endpoint      url                      25,400 rows, linked
 *   Works with    compatibleHosts          638 rows (plugins only)
 *
 * A Licence row is deliberately absent as a *row rule*, not a per-entry
 * omission: no row in this dataset carries licence data, so the card must
 * never imply the question was asked. (`Listing.stars` is null on every row
 * for the same reason, and no popularity figure appears here at all.)
 */
export function SpecCard({ item }: { item: Listing }) {
  const endpoint =
    item.url && /^https?:\/\//i.test(item.url) ? item.url : null;
  const hasPublisherHosts = item.kind === "plugin" && Boolean(item.compatibleHosts?.length);
  if (!item.version && !item.transport && !item.runtime && !endpoint && !hasPublisherHosts) {
    return null;
  }

  return (
    <section aria-labelledby="pkg-spec-title" className="border border-rule-2 bg-surface p-4">
      <h2 id="pkg-spec-title" className="kicker">
        Specifications
      </h2>
      <dl className="spec-list mt-1">
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
        {item.kind === "plugin" && item.compatibleHosts && item.compatibleHosts.length > 0 && (
          <Row label="Publisher-listed agent targets">{item.compatibleHosts.join(", ")}</Row>
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
