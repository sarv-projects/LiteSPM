"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Search, SquareTerminal } from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";

/**
 * One header for every route: logo, the primary rail, a search affordance, the
 * theme toggle and the install CTA.
 *
 * The rail only lists routes that exist (`/explore`, `/agents`, `/compare`,
 * `/categories`, `/insights`) — Docs and Tour are not links until they are
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
 * The rail is a scroller at every width, and a scroller that hides a
 * destination is a broken navigation: at 320px "Coverage" sat at x=313–385,
 * off the screen entirely, with nothing to hint at it. So the rail keeps its
 * destinations in the DOM (no drawer, no hamburger — the no-JS contract is a
 * product promise), fades the edge that has more past it, and carries two
 * chevrons that scroll it. The chevrons are buttons, so they are in the tab
 * order and announced; the fades are the visual half of the same fact.
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
  { href: "/explore/", label: "Marketplace" },
  { href: "/agents/", label: "Agents" },
  { href: "/compare/", label: "Compare" },
  { href: "/how-it-works/", label: "How it works" },
  { href: "/categories/", label: "Categories" },
  {
    href: "/insights/",
    label: "Insights",
    // The route used to be `/trending/`, a name that promised a trending list
    // the catalog cannot publish. The tooltip says what the page is instead:
    // a census of everything the catalog holds.
    title: "The catalog counted by kind, host, category and publisher — not a trending list",
  },
];

export function Header({ onNavigate }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const searchRef = React.useRef<HTMLAnchorElement>(null);

  /**
   * Whether the primary rail has links beyond either of its edges right now.
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
  const [moreLeft, setMoreLeft] = React.useState(false);

  /** The mobile menu, and whether it is open. */
  const menuRef = React.useRef<HTMLDetailsElement | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);

  /**
   * The menu closes on an outside click and on Escape.
   *
   * A native <details> does neither, and a menu that stays open over the page
   * after the reader has moved on is worse than no menu. Both are the
   * behaviour a reader expects from a menu; both are additions to what the
   * disclosure already does without scripting.
   */
  React.useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (!menu) return;
      if (event.target instanceof Node && menu.contains(event.target)) return;
      menu.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const menu = menuRef.current;
      if (!menu) return;
      menu.open = false;
      const summary = menu.querySelector("summary");
      if (summary instanceof HTMLElement) summary.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  React.useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => {
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      const left = el.scrollLeft > 1;
      setMoreRight((prev) => (prev === right ? prev : right));
      setMoreLeft((prev) => (prev === left ? prev : left));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener("resize", measure);
    // The links' widths change when the webfont arrives, and the nav's own box
    // does not, so the observer above never fires for that reflow. Measure once
    // more when the fonts settle, or a rail that overflowed only in the real
    // face shows no fade and no chevron.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  /**
   * Scroll the rail one screenful.
   *
   * The rail is a scroller, and a scroller with no sign that it scrolls hides
   * a destination: at 320px "Coverage" sat at x=313–385, entirely off a 320px
   * screen, with nothing to say so. The fade says "there is more" and this
   * says "go there" — and it is a button, so it is reachable by keyboard and
   * announced, which a CSS scroll-snap hint is not.
   *
   * The destinations are NOT hidden behind a menu: the no-JS contract is a
   * product promise, and a drawer would take it away from the reader whose
   * JavaScript did not run (and from the crawler). The rail stays a rail; it
   * just admits that it scrolls.
   */
  const scrollRail = React.useCallback((direction: 1 | -1) => {
    const el = navRef.current;
    if (!el) return;
    const step = Math.max(160, Math.floor(el.clientWidth * 0.8));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * step, behavior: reduce ? "auto" : "smooth" });
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
        <Link href="/" className="col-start-1 row-start-1 flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-2" aria-label="LiteSPM marketplace home">
          {/* The logo tile is one of the six places the brand indigo is allowed. */}
          <span className="flex h-7 w-7 items-center justify-center rounded-chip bg-accent">
            <SquareTerminal className="h-4 w-4 text-white" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight text-ink sm:inline">
            LiteSPM
          </span>
        </Link>

        {/* The rail gets a full-width mobile row, then returns to the header's
            single-line layout at desktop widths. Links keep 44px touch targets.
            The row is a scroller, not a clipping box: the wrapper measures it
            and fades the edge while there is more to reach, and the two
            chevrons scroll it — so a destination off the right edge is
            announced, visible as a fade, and one click away. */}
        {/* The menu, below 768px. The rail becomes a scroller there, which
            works — but a swipe hides the shape of the site, and a reader who
            cannot swipe has no way to know there is more. A menu says what
            the site has.

            It is a <details>, not a script: the links are in the document and
            the disclosure opens without JavaScript, so the no-JS contract
            holds. The script only adds what a native disclosure cannot do —
            closing on an outside click and on Escape. */}
        <details
          ref={menuRef}
          className="group/menu relative col-span-2 row-start-2 -mb-px md:hidden"
          onToggle={(event) => {
            if (event.currentTarget.open) setMenuOpen(true);
            else setMenuOpen(false);
          }}
        >
          <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-1 text-[13px] font-medium text-ink-2 hover:text-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
            <span>Menu</span>
            <ChevronDown
              className="h-4 w-4 transition-transform duration-state ease-out group-open/menu:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ul className="absolute left-0 right-0 top-full z-50 mt-px border-b border-rule bg-surface py-1 shadow-[0_12px_24px_-12px_rgba(16,24,40,0.28)]">
            {PRIMARY_NAV.map((item) => {
              const active = pathname?.startsWith(item.href.replace(/\/$/, ""));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    title={item.title}
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      if (menuRef.current) menuRef.current.open = false;
                      onNavigate?.();
                    }}
                    className={`flex min-h-[44px] items-center px-2 text-[14px] font-medium transition-colors duration-state ease-out ${
                      active ? "text-accent-text" : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>

        <div className="relative col-span-2 row-start-2 -mb-px hidden min-w-0 items-stretch self-stretch md:flex lg:col-auto lg:row-auto lg:w-auto lg:flex-1">
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
                  // Not prefetched: see the request budget in tests/budgets.
                  prefetch={false}
                  title={item.title}
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

          {/* The fades: the edge of the rail says there is more past it. They
              are decoration — the chevrons below are the control. */}
          {moreLeft && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 top-0 w-8 bg-gradient-to-r from-surface via-surface/80 to-transparent"
            />
          )}
          {moreRight && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 top-0 w-10 bg-gradient-to-l from-surface via-surface/80 to-transparent"
            />
          )}

          {/*
            The chevrons. 24px is the WCAG 2.2 AA target-size floor and these
            are 28px, so the control is usable with a thumb as well as a
            mouse; they are buttons, so they are in the tab order and the
            screen reader announces what they do. They appear only when there
            is somewhere to scroll to, so a rail that fits shows nothing.
          */}
          {moreLeft && (
            <button
              type="button"
              onClick={() => scrollRail(-1)}
              aria-label="Scroll the navigation back"
              className="absolute bottom-0 left-0 top-0 flex w-7 items-center justify-center text-ink-2 hover:text-ink"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {moreRight && (
            <button
              type="button"
              onClick={() => scrollRail(1)}
              aria-label="Scroll the navigation forward"
              className="absolute bottom-0 right-0 top-0 flex w-7 items-center justify-center text-ink-2 hover:text-ink"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-1.5 sm:gap-2">
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
          {/*
            The CTA keeps its whole label at every width.
            It used to swap "Install LiteSPM" for "Install" below 640px, which
            is the one place the header says what the product is — and the
            truncation was the only cue (the two words were also rendered at
            different sizes, which is why axe flagged the pair). Below `sm` the
            label is one size and the padding is tighter, so the whole phrase
            fits beside the logo, the search control and the theme toggle on a
            320px screen: 288px of shell, and the label needs about 115px.
          */}
          <Link
            href="/#install"
            onClick={onInstallClick}
            className="btn btn-solid btn-lg whitespace-nowrap px-2.5! text-[13px]! sm:px-[18px]! sm:text-[14px]!"
          >
            Install LiteSPM
          </Link>
        </div>
      </div>

      {/* Portals itself to `document.body`; rendered here so the palette's
          `returnFocusRef` and open state live with the control that owns them. */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} returnFocusRef={searchRef} />
    </header>
  );
}
