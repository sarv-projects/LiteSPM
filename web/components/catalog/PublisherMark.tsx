"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Listing } from "../../lib/telemetry";
import { publisherMark } from "../../lib/catalog";

/**
 * The identity tile every discovery surface stamps on a row.
 *
 * It renders the real mark `publisherMark` derives — a GitHub account's avatar
 * or the publisher's own site icon — and falls back to a letter only when the
 * row's record names neither, or when every image candidate fails to load.
 *
 * Shape decisions, all deliberate:
 *
 * 1. **A white plate, in both themes.** Vendor marks are drawn for light
 *    backgrounds far more often than not, so a dark plate quietly destroys
 *    them (the same reason `AgentLogo` pins its tile to white). A hairline
 *    border keeps the plate visible on the paper background.
 * 2. **The image sits on the letter.** The letter is always rendered
 *    underneath; the image fades in on top once it loads. A slow or missing
 *    image therefore degrades to the letter in place — no empty box, no
 *    layout shift, no broken-image glyph. Two failure modes count as missing:
 *    a request that errors, and a 16×16 body from the favicon service, which
 *    is how that service says "this domain publishes no icon" — it serves the
 *    placeholder *with* a 404, which a browser renders anyway, so the size is
 *    the only signal and the tile checks it.
 * 3. **Decorative to assistive tech.** The row always prints the publisher's
 *    name in text, so the tile is `aria-hidden`; the `title` explains to a
 *    mouse reader exactly which account or host the mark belongs to.
 * 4. **`object-contain`, not `cover`.** A favicon or a non-square avatar is
 *    scaled to fit rather than cropped to a square it was never drawn for.
 */
export interface PublisherTileProps {
  item: Listing;
  /** Tile edge in px. 32 on shelf cards, 28 in Explore rows. */
  size?: number;
  /** Extra classes (the hover gesture hook `.card-tile` rides here). */
  className?: string;
}

export function PublisherTile({ item, size = 28, className = "" }: PublisherTileProps) {
  const mark = useMemo(() => publisherMark(item), [item]);
  const key = mark ? mark.srcs.join("|") : "";
  const [candidate, setCandidate] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // A new row (or a row that gained a URL) restarts the ladder.
  useEffect(() => {
    setCandidate(0);
    setLoaded(false);
  }, [key]);

  /**
   * The image failed, or was not an image at all. Step to the next candidate;
   * `-1` is the end of the ladder, which renders the letter.
   */
  const next = useCallback(() => {
    setLoaded(false);
    setCandidate((c) => (mark && c + 1 < mark.srcs.length ? c + 1 : -1));
  }, [mark]);

  const src = mark?.srcs[candidate];
  const imgRef = useRef<HTMLImageElement | null>(null);

  /**
   * Judge an image that is *already* loaded.
   *
   * On a prerendered page the favicon usually finishes before hydration, and
   * React attaches `onLoad` during hydration — the event has already fired and
   * never fires again, so a 16×16 "no icon" answer would sit on the tile as a
   * globe. Reading the element's own state once after mount closes that window;
   * on a client-rendered row the image is normally not complete yet and the
   * handler above still does the work.
   */
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !src || !el.complete) return;
    if (el.naturalWidth === 0 || (el.naturalWidth <= 16 && el.naturalHeight <= 16)) {
      next();
      return;
    }
    setLoaded(true);
  }, [src, next]);

  const initial = (item.publisher?.name || item.name || "?").trim().charAt(0).toUpperCase();
  /**
   * The title names the host the *rendered* image belongs to, not just the one
   * the record names: when a subdomain publishes no icon the tile may fall
   * back to its registrable parent (`mcp.figma.com` → `figma.com`), and the
   * tooltip has to say so rather than credit the subdomain with a mark it does
   * not serve.
   */
  const shownHost =
    mark?.kind === "site" && src
      ? (() => {
          try {
            return decodeURIComponent(new URL(src).searchParams.get("domain") ?? "");
          } catch {
            return null;
          }
        })()
      : null;
  const title = mark
    ? mark.kind === "github"
      ? `Mark: the github.com/${mark.label} account this entry's own link names.`
      : shownHost && shownHost !== mark.label
        ? `Mark: the icon of ${shownHost}, the root domain of ${mark.label} — the site this entry's own record names, which serves no icon of its own.`
        : `Mark: ${mark.label} — the site this entry's own record names.`
    : "No mark is published for this entry's publisher.";

  return (
    <span
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-[6px] border border-rule bg-white ${className}`}
      style={{ width: size, height: size }}
      title={title}
      aria-hidden="true"
    >
      <span
        className="t-mono font-semibold leading-none text-ink-2"
        style={{ fontSize: Math.max(11, Math.round(size * 0.42)) }}
      >
        {initial}
      </span>
      {src && (
        <img
          key={src}
          ref={imgRef}
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onLoad={(e) => {
            // Google's favicon endpoint answers a domain with no icon with a
            // fixed 16x16 PNG served *with* a 404 status, and a browser renders
            // that body anyway (`onError` never fires). A 16px answer to a 64px
            // request therefore means "no icon", not "a tiny logo": the tile
            // steps on to its letter rather than showing the service's globe.
            if (e.currentTarget.naturalWidth <= 16 && e.currentTarget.naturalHeight <= 16) {
              next();
              return;
            }
            setLoaded(true);
          }}
          onError={next}
          className={`absolute inset-0 h-full w-full object-contain p-[3px] transition-opacity duration-state ease-out ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          style={{ backgroundColor: "white" }}
        />
      )}
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
      className="inline-flex items-center rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-3"
      title="Read from the publisher's own manifest. LiteSPM has not audited the publisher."
    >
      from publisher manifest
    </span>
  );
}
