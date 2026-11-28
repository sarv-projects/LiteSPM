"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Github, Menu, Moon, Search, Sparkles, Sun, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApp, type Route } from "@/lib/litespm/router";
import type { CatalogStatsResponse } from "@/lib/litespm/types";
import { formatCompact, formatFull } from "@/lib/litespm/format";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";

const NAV: Array<{ label: string; hash: string; match: Route["view"][] }> = [
  { label: "Marketplace", hash: "/marketplace", match: ["marketplace", "package"] },
  { label: "Bundles", hash: "/bundles", match: ["bundles"] },
  { label: "Agents", hash: "/agents", match: ["agents", "agent"] },
  { label: "Insights", hash: "/insights", match: ["insights"] },
  { label: "Docs", hash: "/docs", match: ["docs"] },
  { label: "Publish", hash: "/publish", match: ["publish"] },
];

export function AnnouncementBar() {
  const [stats, setStats] = React.useState<CatalogStatsResponse | null>(null);

  React.useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const cached = window.sessionStorage.getItem("litespm-stats-cache");
        if (cached) {
          setStats(JSON.parse(cached));
        }
      }
    } catch {}

    fetch("/api/litespm/stats")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: CatalogStatsResponse) => {
        setStats(data);
        try {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("litespm-stats-cache", JSON.stringify(data));
          }
        } catch {}
      })
      .catch(() => {});
  }, []);

  const total = stats?.counts?.uniqueListings ?? stats?.uniqueTotal ?? 68933;
  const hosts = stats?.hosts ?? 52;
  const cliVersion = Array.isArray(stats?.cli) ? stats.cli[0]?.version : undefined;
  const versionLabel = cliVersion ? `v${cliVersion.replace(/^v/, "")}` : "v0.6.0";

  return (
    <div className="border-b border-border/50 bg-muted/40 font-mono text-[11px] text-muted-foreground transition-colors">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3.5 py-1.5 sm:px-6">
        <div className="flex items-center gap-2 overflow-hidden truncate">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          <span className="font-semibold text-brand">INDEX LIVE</span>
          <span className="text-border">·</span>
          <span className="truncate">{formatCompact(total)} Capabilities</span>
          <span className="hidden sm:inline text-border">·</span>
          <span className="hidden sm:inline">{hosts} Agent Hosts</span>
          <span className="hidden md:inline text-border">·</span>
          <span className="hidden md:inline font-semibold text-foreground/80">
            {versionLabel} · {hosts} hosts · Open source
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => useApp.getState().navigate("/docs/security")}
            className="hidden items-center gap-1.5 font-sans transition-colors hover:text-brand sm:inline-flex"
          >
            <span className="inline-block rounded border border-brand/25 bg-brand-soft px-1 py-0.2 text-[9.5px] font-semibold text-brand">GUIDE</span>
            <span>How to vet an agent skill safely →</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
    >
      {mounted && resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}

export function Header() {
  const route = useApp((s) => s.route);
  const setPalette = useApp((s) => s.setPalette);
  const setAssistant = useApp((s) => s.setAssistant);
  const navigate = useApp((s) => s.navigate);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const mobileNavRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => setMobileOpen(false), [route]);

  React.useEffect(() => {
    if (!mobileOpen) return;
    const navEl = mobileNavRef.current;
    if (!navEl) return;
    const focusable = navEl.querySelectorAll<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) {
      focusable[0].focus();
    }
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const elements = navEl.querySelectorAll<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])');
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => window.removeEventListener("keydown", trapFocus);
  }, [mobileOpen]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) {
        e.preventDefault();
        setMobileOpen(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        e.key === "/" &&
        target &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        !target.isContentEditable
      ) {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setPalette, mobileOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <NavLink to="/" className="shrink-0 rounded-md">
          <Logo />
        </NavLink>

        <nav aria-label="Primary" className="ml-2 hidden items-center gap-0.5 xl:flex">
          {NAV.map((item) => {
            const active = item.match.includes(route.view);
            return (
              <NavLink
                key={item.label}
                to={item.hash}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-brand-soft text-brand"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setPalette(true);
            }}
            title="Search catalog (Press ⌘K or / to open)"
            className="hidden h-9 cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-card pl-3 pr-2 text-[13px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground lg:flex"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="w-24 text-left xl:w-36">Search catalog…</span>
            <kbd className="pointer-events-none rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setPalette(true);
            }}
            aria-label="Search catalog"
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand lg:hidden"
          >
            <Search className="h-4 w-4" />
          </button>

          <Button
            size="sm"
            variant="outline"
            className="hidden h-9 shrink-0 gap-1.5 rounded-lg px-3 text-[12.5px] sm:inline-flex"
            onClick={() => setAssistant(true)}
          >
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            Ask AI
          </Button>

          <div className="shrink-0">
            <ThemeToggle />
          </div>

          <a
            href="https://github.com/sarv-projects/LiteSPM"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LiteSPM on GitHub"
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand sm:inline-flex"
          >
            <Github className="h-4 w-4" />
          </a>

          <Button
            size="sm"
            className="h-9 shrink-0 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90"
            onClick={() => navigate("/docs/getting-started")}
          >
            Get started
          </Button>

          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground xl:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          ref={mobileNavRef}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          className="border-t border-border/60 bg-background xl:hidden"
        >
          <div className="mx-auto grid max-w-6xl gap-1 px-4 py-3">
            {NAV.map((item) => (
              <NavLink
                key={item.label}
                to={item.hash}
                aria-current={item.match.includes(route.view) ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-left text-[14px] font-medium transition-colors",
                  item.match.includes(route.view)
                    ? "bg-brand-soft text-brand"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setAssistant(true);
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[14px] font-medium text-brand hover:bg-brand-soft"
            >
              <Sparkles className="h-4 w-4" />
              Ask AI
            </button>
            <a
              href="https://github.com/sarv-projects/LiteSPM"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository (opens in new tab)"
              className="rounded-lg px-3 py-2 text-left text-[14px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              GitHub repository ↗
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
