import React from "react";
import Link from "next/link";

/**
 * The one discovery card.
 *
 * The home page and the catalog grids render this shape in six places, and
 * before this component existed every place wrote its own class string: two
 * padding values, a hand-rolled copy of the same chrome, one card that lifted
 * on hover and was not a link, and a dashed plane only one caller knew the
 * rules for. The variants below are the whole vocabulary — a caller picks a
 * role, never a class list, so the same role always renders the same card and
 * a change to the treatment happens in one file.
 *
 *   density   the card's job. `compact` is a record in a dense discovery grid
 *             (p-4); `roomy` is an entry-point or explainer card (p-5);
 *             `panel` is a full-width control surface, which earns one more
 *             step from `sm` up (p-5 sm:p-6).
 *   plane     `surface` is the raised card; `sunken` is the recessed dashed
 *             plane — the one card that is a route into a different index
 *             rather than a record.
 *   linked    a card is interactive when it has an `href` (the card itself is
 *             the link) or is marked `interactive` (a stretched anchor inside
 *             makes the whole card a target). Interactive cards carry the
 *             shared hover chrome — `.card-lift`, the border and the shadow;
 *             static cards carry none of it, so "looks clickable but is not"
 *             cannot happen by accident.
 *
 * The gestures an interactive card adds — the lift, the publisher tile's
 * scale and the arrow's slide — are defined in globals.css, because the
 * reduced-motion block has to drop the displacement itself, and a Tailwind
 * `group-hover:` utility can only have its duration collapsed.
 */
export type DiscoveryDensity = "compact" | "roomy" | "panel";
export type DiscoveryPlane = "surface" | "sunken";

/** Padding per density. The only place a discovery card's padding is written. */
const DENSITY: Record<DiscoveryDensity, string> = {
  compact: "p-4",
  roomy: "p-5",
  panel: "p-5 sm:p-6",
};

/** The two planes. `sunken` is dashed and recessed; `surface` is raised. */
const PLANE: Record<DiscoveryPlane, string> = {
  surface: "border-rule bg-surface",
  sunken: "border-dashed border-rule-2 bg-sunken",
};

export interface DiscoveryCardProps {
  /** Which grid role the card plays; decides its padding. Default `compact`. */
  density?: DiscoveryDensity;
  /** The card's plane. Default `surface`. */
  plane?: DiscoveryPlane;
  /** When set, the card itself renders as a link to this href. */
  href?: string;
  /** True when a stretched anchor inside the card makes the whole card a target. */
  interactive?: boolean;
  /** Element to render when the card is not itself a link. Default `div`. */
  as?: "article" | "div" | "li";
  /** Layout extras only — never padding, plane or hover chrome. */
  className?: string;
  children: React.ReactNode;
}

export function DiscoveryCard({
  density = "compact",
  plane = "surface",
  href,
  interactive = false,
  as = "div",
  className = "",
  children,
}: DiscoveryCardProps) {
  const linked = Boolean(href) || interactive;
  const classes = [
    "group relative flex flex-col rounded-card border",
    DENSITY[density],
    PLANE[plane],
    linked ? "card-lift hover:border-ink-3 hover:shadow-card focus-within:border-ink-3" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  const Tag = as;
  return <Tag className={classes}>{children}</Tag>;
}
