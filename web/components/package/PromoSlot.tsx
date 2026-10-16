import React from "react";

/**
 * The reserved promotional placement.
 *
 * Every comparable entry page sells the same slot: mcpservers.org renders a
 * "Sponsored" box inside its details sidebar, and mcp.so puts a sponsor's
 * card at the top of its sidebar on every server page. This build has no
 * sponsor program live, so the slot is rendered as what it actually is — a
 * stable, named, deliberately empty placement — rather than either a gap that
 * reads as a broken layout or a fabricated advertiser.
 *
 * What it must never contain, and therefore never does: a sponsor name, a
 * logo, a price, a partner mark, an "Advertise here" link that goes nowhere,
 * or any claim about who pays for what. The copy states the slot's contract
 * in the only two facts this build can support: nothing on the page is
 * sponsored today, and a placement here would be labelled as one.
 *
 * It is a fixed part of the sidebar on every entry page, so removing the
 * reservation for a build that does place advertising is a content change,
 * not a layout change.
 */
export function PromoSlot() {
  return (
    <aside aria-label="Reserved promotion slot" className="border border-rule-2 bg-sunken p-4">
      <p className="kicker">Reserved</p>
      <p className="mt-1.5 text-[13px] font-medium text-ink">Sponsor placement</p>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
        This slot is kept for a sponsor. Nothing on this page is sponsored today — a placement here
        would be labelled as one.
      </p>
    </aside>
  );
}
