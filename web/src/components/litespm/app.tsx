"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig, motion } from "framer-motion";
import { GitCompareArrows, X } from "lucide-react";

import dynamic from "next/dynamic";

import { useApp, compareHash, type Route } from "@/lib/litespm/router";
import type { PackageDetailData } from "@/lib/litespm/types";
import { Header, AnnouncementBar } from "./header";
import { Footer } from "./footer";
import { HomeView } from "./views/home";
import { MarketplaceView } from "./views/marketplace";

/**
 * Code splitting: the first load carries the shell, Home and Marketplace.
 * Every other view, the Ask AI panel (60 KB of source) and the command palette
 * are separate chunks fetched when first needed. Views still render on the
 * server (default `ssr`), so a deep link gets its HTML in the first response.
 */
const viewLoading = () => <div className="min-h-[60vh]" aria-busy="true" />;
const PackageView = dynamic(() => import("./views/package-detail").then((m) => m.PackageView), { loading: viewLoading });
const AgentsView = dynamic(() => import("./views/agents").then((m) => m.AgentsView), { loading: viewLoading });
const AgentDetailView = dynamic(() => import("./views/agent-detail").then((m) => m.AgentDetailView), { loading: viewLoading });
const DocsView = dynamic(() => import("./views/docs").then((m) => m.DocsView), { loading: viewLoading });
const PublishView = dynamic(() => import("./views/publish").then((m) => m.PublishView), { loading: viewLoading });
const InsightsView = dynamic(() => import("./views/insights").then((m) => m.InsightsView), { loading: viewLoading });
const BundlesView = dynamic(() => import("./views/bundles").then((m) => m.BundlesView), { loading: viewLoading });
const CompareView = dynamic(() => import("./views/compare").then((m) => m.CompareView), { loading: viewLoading });
const Assistant = dynamic(() => import("./assistant").then((m) => m.Assistant), { ssr: false });
const CommandPalette = dynamic(() => import("./command-palette").then((m) => m.CommandPalette), { ssr: false });

/**
 * Remount key. It must NOT include query-string state: the catalog search box
 * lives inside the keyed subtree, so keying on the query remounted it on every
 * debounced keystroke and dropped input focus.
 */
function routeKey(route: ReturnType<typeof useApp.getState>["route"]): string {
  switch (route.view) {
    case "package":
      return `package-${route.key}`;
    case "agent":
      return `agent-${route.id}`;
    case "docs":
      return `docs-${route.section}`;
    case "compare":
      return `compare-${route.keys.join(",")}`;
    default:
      return route.view;
  }
}

/** What counts as "a new page" for scroll-to-top: not a search or filter refinement. */
function scrollKey(route: ReturnType<typeof useApp.getState>["route"]): string {
  if (route.view === "marketplace") return `marketplace-${route.tab}-${route.query.page ?? 1}`;
  return routeKey(route);
}

const BASE_TITLE = "LiteSPM - The package manager for AI agents";

function titleFor(route: ReturnType<typeof useApp.getState>["route"]): string {
  switch (route.view) {
    case "marketplace":
      return route.tab === "installed" ? "Installed - LiteSPM Marketplace" : "Marketplace - LiteSPM";
    case "package":
      return "Package - LiteSPM";
    case "agents":
      return "Agents - LiteSPM";
    case "agent":
      return "Agent profile - LiteSPM";
    case "docs":
      return "Docs - LiteSPM";
    case "publish":
      return "Publish - LiteSPM";
    case "insights":
      return "Insights - LiteSPM";
    case "bundles":
      return "Bundles - LiteSPM";
    case "compare":
      return "Compare - LiteSPM";
    case "notfound":
      return "Page not found - LiteSPM";
    default:
      return BASE_TITLE;
  }
}

function NotFoundView({ path }: { path: string }) {
  const navigate = useApp((s) => s.navigate);
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">We could not find that page.</h1>
      <p className="break-all text-sm leading-relaxed text-muted-foreground">
        <code className="font-mono">{path}</code> is not a LiteSPM page. The link may be outdated.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => navigate("/marketplace")}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
        >
          Browse the marketplace
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
        >
          Home
        </button>
      </div>
    </div>
  );
}
/** The floating compare tray — visible whenever packages are staged. */
function CompareTray() {
  const compareKeys = useApp((s) => s.compareKeys);
  const clearCompare = useApp((s) => s.clearCompare);
  const navigate = useApp((s) => s.navigate);
  const route = useApp((s) => s.route);
  if (compareKeys.length === 0 || route.view === "compare") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-brand/40 bg-popover/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur">
        <GitCompareArrows className="h-4 w-4 text-brand" aria-hidden="true" />
        <p className="text-[13px] font-medium">
          {compareKeys.length} package{compareKeys.length === 1 ? "" : "s"} staged
        </p>
        <button
          type="button"
          onClick={() => navigate(compareHash(compareKeys))}
          disabled={compareKeys.length < 2}
          title={
            compareKeys.length < 2 ? "Stage at least two packages to compare" : "Open comparison"
          }
          className="rounded-full bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Compare
        </button>
        <button
          type="button"
          onClick={clearCompare}
          aria-label="Clear staged packages"
          className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * `initialRoute` is what the server resolved from the URL, so the first HTML
 * already holds the right page (it used to be Home for every URL). Until the
 * client has synced from `location`, render that; afterwards the store owns it.
 */
export function LiteSPMApp({
  initialRoute,
  initialPackage,
}: {
  initialRoute?: Route;
  /** The package row the server already resolved for a /package/<key> URL. */
  initialPackage?: PackageDetailData;
}) {
  const storeRoute = useApp((s) => s.route);
  const [synced, setSynced] = React.useState(false);
  const route = synced || !initialRoute ? storeRoute : initialRoute;
  const syncFromHash = useApp((s) => s.syncFromHash);
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 60_000 } },
      }),
  );

  React.useEffect(() => {
    syncFromHash();
    setSynced(true);
    const onLocationChange = () => syncFromHash();
    window.addEventListener("popstate", onLocationChange);
    window.addEventListener("hashchange", onLocationChange);
    return () => {
      window.removeEventListener("popstate", onLocationChange);
      window.removeEventListener("hashchange", onLocationChange);
    };
  }, [syncFromHash]);

  const mainRef = React.useRef<HTMLElement | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const previousScrollKey = React.useRef<string | null>(null);
  const currentScrollKey = scrollKey(route);

  React.useEffect(() => {
    // PackageView owns its title once the row loads; a generic overwrite here
    // would erase the server-rendered package metadata on first paint.
    if (route.view !== "package") document.title = titleFor(route);

    // A refinement of the same page (typing, facet clicks) keeps scroll and
    // focus. A real page change scrolls to top, moves focus to <main> and
    // announces the new page to screen readers.
    if (previousScrollKey.current === currentScrollKey) return;
    const first = previousScrollKey.current === null;
    previousScrollKey.current = currentScrollKey;
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    if (!first) {
      mainRef.current?.focus({ preventScroll: true });
      setAnnouncement(titleFor(route).replace(" - LiteSPM", ""));
    }
  }, [route, currentScrollKey]);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-brand-foreground"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen flex-col">
        <AnnouncementBar />
        <Header />
        <motion.main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          key={routeKey(route)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.21, 0.6, 0.35, 1] }}
          className="flex-1 outline-none"
        >
          {route.view === "home" && <HomeView />}
          {route.view === "marketplace" && (
            <MarketplaceView tab={route.tab} query={route.query} />
          )}
          {route.view === "notfound" && <NotFoundView path={route.path} />}
          {route.view === "package" && (
            <PackageView
              linkKey={route.key}
              // Only for the URL the server resolved; later in-app navigation fetches.
              initial={
                initialRoute?.view === "package" && initialRoute.key === route.key ? initialPackage : undefined
              }
            />
          )}
          {route.view === "agents" && <AgentsView />}
          {route.view === "agent" && <AgentDetailView id={route.id} />}
          {route.view === "docs" && <DocsView section={route.section} />}
          {route.view === "publish" && <PublishView />}
          {route.view === "insights" && <InsightsView />}
          {route.view === "bundles" && <BundlesView />}
          {route.view === "compare" && <CompareView keys={route.keys} />}
        </motion.main>
        <Footer />
        <CommandPalette />
        <Assistant />
        <CompareTray />
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </div>
      </MotionConfig>
    </QueryClientProvider>
  );
}
