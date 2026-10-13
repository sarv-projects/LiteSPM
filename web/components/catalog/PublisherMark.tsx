"use client";

import React from "react";
import { Listing } from "../../lib/telemetry";

/** Single-letter stamp. 2px radius: a chip, not a card. */
export function PublisherTile({ name, kind }: { name?: string; kind: Listing["kind"] }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span className="tile" data-kind={kind} aria-hidden="true">
      {initial}
    </span>
  );
}

/**
 * Where a row's metadata came from — provenance, not a safety verdict.
 *
 * This used to render a checkmark in the accent colour beside the words
 * "vendor-listed". A tick on a highlighted chip reads as *vetted* to almost
 * everyone, and the tooltip that corrected the impression is unreachable on
 * touch, where a tap either navigates or does nothing. The words now state the
 * fact and the chip is neutral: `publisher.verified` has only ever meant "this
 * row was parsed from the publisher's own manifest", never "this is safe".
 */
export function VerifiedMark() {
  return (
    <span
      className="inline-flex items-center rounded-[2px] border border-rule bg-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-3"
      title="Read from this publisher's own marketplace manifest. No registry verified the publisher and LiteSPM has not audited it."
    >
      from publisher manifest
    </span>
  );
}
