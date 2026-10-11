"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { AgentDetailViewProps } from "./AgentDetailView";

/**
 * Client half of the route — see `app/HomeRoute.tsx` for why it exists. The
 * server page derives everything from the catalog and the host registries;
 * this wrapper owns the `next/dynamic` import so the view itself stays in an
 * async chunk and the route's First Load JS stays at the framework + layout
 * baseline. `ssr: true` keeps the real page in the prerendered HTML.
 */
const AgentDetailView = dynamic(() => import("./AgentDetailView"), { ssr: true });

export default function AgentDetailRoute(props: AgentDetailViewProps) {
  return (
    <Suspense fallback={null}>
      <AgentDetailView {...props} />
    </Suspense>
  );
}
