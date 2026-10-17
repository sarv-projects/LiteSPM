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
 * a spacious hero. On narrow screens, navigation gets its own row rather than
 * being clipped between the wordmark and utility controls. `--stack-top`
 * follows that responsive height so sticky filter bars remain below the header.
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
      <div className="shell grid h-[92px] grid-cols-[auto_minmax(0,1fr)] grid-rows-[48px_44px] items-center gap-x-3 md:flex md:h-12 md:gap-4">
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
            single-line layout at desktop widths. Links keep 44px touch targets. */}
        <nav
          className="no-scrollbar col-span-2 row-start-2 -mb-px flex w-full min-w-0 items-stretch self-stretch overflow-x-auto md:col-auto md:row-auto md:w-auto md:flex-1"
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
                className={`flex shrink-0 items-center border-b-2 px-2 text-[13px] font-medium transition-colors duration-state ease-out md:px-2.5 ${
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
