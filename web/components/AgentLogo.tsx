"use client";

import { useState } from "react";
import { brandLogo } from "../lib/brandLogos";

interface AgentLogoProps {
  /** Registry id — the key `data/brand-logos.json` is keyed by. */
  id: string;
  /** The agent's display name. The fallback mark shows its first letter. */
  name: string;
  /** Tile edge in px. */
  size?: number;
  className?: string;
}

/**
 * An agent's own mark in a favicon-style tile, with a neutral letter mark
 * when we have no logo for it.
 *
 * Three deliberate choices:
 *
 * 1. **The tile stays white in dark mode.** Vendor marks are drawn for light
 *    backgrounds more often than not, so putting one on the page's own dark
 *    surface quietly destroys it. A fixed light plate with a hairline border
 *    keeps every logo the vendor shipped legible in either theme.
 * 2. **Decorative to assistive tech.** The agent's name is always rendered
 *    beside this, so the image carries `alt=""` inside an `aria-hidden` tile —
 *    a screen reader says "Cursor" once, not "image Cursor".
 * 3. **`null` is a real state.** `brandLogo()` returns null when no mark is
 *    vendored, and an image that 404s anyway falls back through `onError`.
 *    Either way the reader sees a letter, never a broken-image glyph. We do
 *    not substitute a logo we cannot attribute.
 */
export function AgentLogo({ id, name, size = 28, className = "" }: AgentLogoProps) {
  const logo = brandLogo(id);
  const [failed, setFailed] = useState(false);
  const letter = (name.trim().charAt(0) || "?").toUpperCase();

  // A wordmark we *do* have still doesn't go in a tile: at 28px an asset like
  // 1687×217 renders as a stripe of unreadable text, which looks broken rather
  // than branded. Letter mark until a square mark is vendored for the id.
  const useImage = Boolean(logo?.src) && Boolean(logo?.square) && !failed;

  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-chip border border-rule bg-white ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {useImage ? (
        <img
          src={logo!.src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="t-cond font-semibold leading-none text-ink-2"
          style={{ fontSize: Math.max(10, Math.round(size * 0.44)) }}
        >
          {letter}
        </span>
      )}
    </span>
  );
}
