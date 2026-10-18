"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, SquareTerminal } from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";

/**
 * One header for every route: logo, the primary rail, a search affordance, the
 * theme toggle and the install CTA.
 *
 * The rail only lists routes that exist (`/explore`, `/agents`, `/compare`,
 * `/categories`, `/trending`) — Docs and Tour are not links until they are
 * pages. The kind tabs that used to sit on a second row are gone: filtering by
 * kind is what `/explore` is for, and the discover surface traded that row for
 * a spacious hero. `--stack-top` follows the responsive height so sticky
 * filter bars remain below the header.
 *
 * Navigation keeps its own full-width row until `lg`, not until `md`. The five
 * links need 387px and the one-line arrangement leaves the rail whatever the
 * wordmark, search, theme toggle and install CTA do not use — 315px at 768px
 * (portrait iPad, and the widest tablet), where "Coverage" was cut to "Cov"
 * against the search button with no sign anything was missing. Below `lg` the
 * rail is the full shell width again (720px at 768px) and fits comfortably.
 * `--site-header-height` moves with it: 92px below `lg`, 48px at and above.
 *
 * The search affordance opens the command palette (LPSM-J009) on a plain
 * click, which is what it now advertises (⌘K on its tooltip and the palette's
 * own footer); holding ⌘/Ctrl/Shift or middle-clicking keeps the browser's
 * behavior, and the `/explore/?focus=search` href stays on the anchor because
 * with JavaScript off the palette does not exist and this link is then the
 * working search entry point.
 */
interface HeaderProps {
  /** Fired when a rail link is followed; the home route uses it to reset. */
  onNavigate?: () => void;
}

const PRIMARY_NAV = [
  { href: "/explore/", label: "Explore" },
  { href: "/agents/", label: "Agent hosts" },
  { href: "/compare/", label: "Compare" },
  { href: "/categories/", label: "Categories" },
  { href: "/trending/", label: "Coverage" },
];

export function Header({ onNavigate }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const searchRef = React.useRef<HTMLAnchorElement>(null);

  /**
   * Whether the primary rail has links beyond its right edge right now.
   *
   * The rail is a scroller at every width. It fits wherever it has the shell
   * to itself, but the five links need 367px and a 320px viewport leaves 278px,
   * so on the smallest phones "Categories" and "Coverage" sit off the end —
   * and `no-scrollbar` removes the only native sign a scroller has. This is the
   * same signal `ui/TabList` uses for the same defect: measure the scroller and
   * fade the edge there is still more to reach. It is measurement-driven rather
   * than breakpoint-driven on purpose: an earlier version hid the fade above
   * `md`, which is exactly where a 768px header turned out to clip.
   */
  const navRef = React.useRef<HTMLElement | null>(null);
  const [moreRight, setMoreRight] = React.useState(false);

  React.useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => {
      const more = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMoreRight((prev) => (prev === more ? prev : more));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  /**
   * Scroll to the home page's install section once it exists.
   *
   * The section lives in the home page's dynamically imported view, so on a
   * cross-route `/#install` navigation the App Router's own scroll attempt
   * runs before the target has mounted and finds nothing — the reader lands at
   * the top of the page (measured: scrollY 0 against a target 5,583px down).
   * Polling for the element closes that window without guessing at a delay.
   */
  const scrollToInstall = React.useCallback(() => {
    let tries = 0;
    const tick = () => {
      const el = document.getElementById("install");
      if (el) {
        el.scrollIntoView({ block: "start" });
        return;
      }
      if (tries < 60) {
        tries += 1;
        window.setTimeout(tick, 50);
      }
    };
    tick();
  }, []);

  // A full page load straight onto `/#install` (or a back/forward to it) also
  // needs the wait: the target is not in the static HTML.
  React.useEffect(() => {
    if (pathname === "/" && window.location.hash === "#install") scrollToInstall();
  }, [pathname, scrollToInstall]);

  const onInstallClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // The anchor keeps its href for no-JS and middle-click; a plain click is
    // handled here so the scroll can wait for the target to mount.
    event.preventDefault();
    if (pathname === "/") {
      window.history.replaceState(null, "", "/#install");
    } else {
      router.push("/#install");
    }
    scrollToInstall();
  };

  /**
   * The search control's own action: open the palette. Modified clicks are left
   * to the browser so the anchor's href still works as a link (that href is
   * also the entire no-JS story for this control).
   */
  const onSearchClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setPaletteOpen(true);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-surface">
      {/* The header is opaque, not glassy. A blur layer over a ruled table
          costs paint on every scroll frame and buys nothing here. */}
      <div className="shell grid h-[92px] grid-cols-[auto_minmax(0,1fr)] grid-rows-[48px_44px] items-center gap-x-3 lg:flex lg:h-12 lg:gap-4">
        <Link href="/" className="col-start-1 row-start-1 flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-2" aria-label="LiteSPM Market home">
          {/* The logo tile is one of the six places the brand indigo is allowed. */}
          <span className="flex h-7 w-7 items-center justify-center rounded-chip bg-accent">
            <SquareTerminal className="h-4 w-4 text-white" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight text-ink sm:inline">
            LiteSPM Market
          </span>
        </Link>

        {/* The rail gets a full-width mobile row, then returns to the header's
            single-line layout at desktop widths. Links keep 44px touch targets.
            The row is a scroller, not a clipping box: the wrapper measures it
            and fades the right edge while there is more to reach. */}
        <div className="relative col-span-2 row-start-2 -mb-px flex min-w-0 items-stretch self-stretch lg:col-auto lg:row-auto lg:w-auto lg:flex-1">
          <nav
            ref={navRef}
            className="no-scrollbar flex w-full min-w-0 items-stretch overflow-x-auto lg:w-auto lg:flex-1"
            aria-label="Primary"
          >
            {PRIMARY_NAV.map((item) => {
              const active = pathname?.startsWith(item.href.replace(/\/$/, ""));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={`flex shrink-0 items-center border-b-2 px-2 text-[13px] font-medium transition-colors duration-state ease-out lg:px-2.5 ${
                    active
                      ? "border-accent text-ink"
                      : "border-transparent text-ink-2 hover:border-rule-2 hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {moreRight && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 top-0 w-10 bg-gradient-to-l from-surface via-surface/80 to-transparent"
            />
          )}
        </div>

        <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-2">
          <Link
            ref={searchRef}
            href="/explore/?focus=search"
            onClick={onSearchClick}
            className="btn btn-icon"
            aria-label="Search the catalog"
            aria-haspopup="dialog"
            aria-keyshortcuts="Meta+K Control+K"
            title="Search the catalog — ⌘K"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </Link>
          <ThemeToggle />
          <Link href="/#install" onClick={onInstallClick} className="btn btn-solid btn-lg whitespace-nowrap">
            <span className="hidden sm:inline">Install LiteSPM</span>
            <span className="sm:hidden">Install</span>
          </Link>
        </div>
      </div>

      {/* Portals itself to `document.body`; rendered here so the palette's
          `returnFocusRef` and open state live with the control that owns them. */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} returnFocusRef={searchRef} />
    </header>
  );
}
