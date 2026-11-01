"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { GitCompareArrows, X } from "lucide-react";

import { useApp, compareHash } from "@/lib/litespm/router";
import { Header, AnnouncementBar } from "./header";
import { Footer } from "./footer";
import { CommandPalette } from "./command-palette";
import { Assistant } from "./assistant";
import { HomeView } from "./views/home";
import { ExploreView } from "./views/explore";
import { PackageView } from "./views/package-detail";
import { AgentsView } from "./views/agents";
import { AgentDetailView } from "./views/agent-detail";
import { DocsView } from "./views/docs";
import { PublishView } from "./views/publish";
import { InsightsView } from "./views/insights";
import { CompareView } from "./views/compare";

function routeKey(route: ReturnType<typeof useApp.getState>["route"]): string {
  switch (route.view) {
    case "explore":
      return `explore-${JSON.stringify(route.query)}`;
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

const BASE_TITLE = "LiteSPM — The package manager for AI agents";

function titleFor(route: ReturnType<typeof useApp.getState>["route"]): string {
  switch (route.view) {
    case "explore":
      return "Explore the catalog · LiteSPM";
    case "package":
      return "Package · LiteSPM";
    case "agents":
      return "Agents · LiteSPM";
    case "agent":
      return "Agent profile · LiteSPM";
    case "docs":
      return "Docs · LiteSPM";
    case "publish":
      return "Publish · LiteSPM";
    case "insights":
      return "Insights · LiteSPM";
    case "compare":
      return "Compare · LiteSPM";
    default:
      return BASE_TITLE;
  }
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

export function LiteSPMApp() {
  const route = useApp((s) => s.route);
  const syncFromHash = useApp((s) => s.syncFromHash);
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 60_000 } },
      }),
  );

  React.useEffect(() => {
    syncFromHash();
    const onHash = () => syncFromHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [syncFromHash]);

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    document.title = titleFor(route);
  }, [route]);

  return (
    <QueryClientProvider client={queryClient}>
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
          key={routeKey(route)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.21, 0.6, 0.35, 1] }}
          className="flex-1"
        >
          {route.view === "home" && <HomeView />}
          {route.view === "explore" && <ExploreView query={route.query} />}
          {route.view === "package" && <PackageView linkKey={route.key} />}
          {route.view === "agents" && <AgentsView />}
          {route.view === "agent" && <AgentDetailView id={route.id} />}
          {route.view === "docs" && <DocsView section={route.section} />}
          {route.view === "publish" && <PublishView />}
          {route.view === "insights" && <InsightsView />}
          {route.view === "compare" && <CompareView keys={route.keys} />}
        </motion.main>
        <Footer />
        <CommandPalette />
        <Assistant />
        <CompareTray />
      </div>
    </QueryClientProvider>
  );
}
