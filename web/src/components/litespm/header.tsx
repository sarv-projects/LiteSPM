"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Github, Menu, Moon, Search, Sparkles, Sun, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApp, type Route } from "@/lib/litespm/router";
import type { CatalogStatsResponse } from "@/lib/litespm/types";
import { formatFull } from "@/lib/litespm/format";
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
  const [dismissed, setDismissed] = React.useState(true);
  const [stats, setStats] = React.useState<CatalogStatsResponse | null>(null);

  React.useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        if (window.localStorage.getItem("litespm-announcement-dismissed") === "true") {
          return;
        }
        const cached = window.sessionStorage.getItem("litespm-stats-cache");
        if (cached) {
          setStats(JSON.parse(cached));
        }
      }
    } catch {}
    setDismissed(false);
  }, []);

  React.useEffect(() => {
    fetch("/api/litespm/stats")
      .then((r) => r.json())
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

  const handleDismiss = () => {
    setDismissed(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("litespm-announcement-dismissed", "true");
      }
    } catch {}
  };

  const isVisible = !dismissed && Boolean(stats);

  return (
    <div
      className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out border-b border-brand/15 bg-brand-soft",
        isVisible ? "max-h-16 opacity-100" : "max-h-0 opacity-0 border-b-0 pointer-events-none"
      )}
      aria-hidden={!isVisible}
    >
      {stats && (
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-1.5 text-center text-[12px] text-foreground/90">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
          <p className="min-w-0 truncate">
            Catalog release{" "}
            <span className="font-mono font-semibold text-brand">{stats.release.releaseId}</span> —{" "}
            {formatFull(stats.counts?.uniqueListings ?? stats.uniqueTotal)} listings, {stats.hosts} agent hosts.{" "}
            <button
              type="button"
              onClick={() => useApp.getState().navigate("/insights")}
              className="font-medium underline decoration-brand/50 underline-offset-2 hover:text-brand"
            >
              See catalog stats →
            </button>
          </p>
          <button
            type="button"
            aria-label="Dismiss announcement"
            onClick={handleDismiss}
            className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
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

  React.useEffect(() => setMobileOpen(false), [route]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <NavLink to="/" className="shrink-0 rounded-md" aria-label="LiteSPM home">
          <Logo />
        </NavLink>

        <nav aria-label="Primary" className="ml-2 hidden items-center gap-0.5 md:flex">
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

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setPalette(true);
            }}
            className="hidden h-9 cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-card pl-3 pr-2 text-[13px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground sm:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="w-28 text-left lg:w-40">Search catalog…</span>
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
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand sm:hidden"
          >
            <Search className="h-4 w-4" />
          </button>

          <Button
            size="sm"
            variant="outline"
            className="hidden h-9 gap-1.5 rounded-lg px-3 text-[12.5px] sm:inline-flex"
            onClick={() => setAssistant(true)}
          >
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            Ask AI
          </Button>

          <ThemeToggle />

          <a
            href="https://github.com/sarv-projects/LiteSPM"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LiteSPM on GitHub"
            className="hidden h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand sm:inline-flex"
          >
            <Github className="h-4 w-4" />
          </a>

          <Button
            size="sm"
            className="h-9 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90"
            onClick={() => navigate("/docs/getting-started")}
          >
            Get started
          </Button>

          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav aria-label="Mobile" className="border-t border-border/60 bg-background md:hidden">
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
