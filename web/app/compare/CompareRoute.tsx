"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { CompareViewProps } from "./CompareView";

/**
 * Client half of the route — see `app/HomeRoute.tsx` for why it exists.
 *
 * `/compare` was first written as a Server Component rendering `Header`
 * directly, and `next build` priced it at **131 kB** First Load JS against the
 * 104 kB every other route reports: a server component's client children
 * (Header → CommandPalette → `lib/palette.ts` → `lib/hosts.ts`) are pulled into
 * the route's first load, while the same graph reached through `dynamic()` is
 * deferred exactly as it is on `/agents` and `/explore`. The browser downloads
 * the same bytes either way; the route just stops reporting a regression the
 * site's own budget (LPSM-J001: ≤110 kB) does not allow.
 */
const CompareView = dynamic(() => import("./CompareView"), { ssr: true });

export default function CompareRoute(props: CompareViewProps) {
  return (
    <Suspense fallback={null}>
      <CompareView {...props} />
    </Suspense>
  );
}
