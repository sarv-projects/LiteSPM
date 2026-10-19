"use client";

import React, { useEffect } from "react";

/**
 * The old `/trending/` address, now a redirect.
 *
 * The route was called "trending" and the page was a census: no source
 * publishes usage data, so nothing on it is ranked by popularity and nothing
 * on it moves. The name promised something the page could not deliver, which
 * is the one thing this site must not do. The route is now `/insights/`, and
 * this page sends the reader there.
 *
 * The redirect is a client-side replace plus a meta refresh, because the site
 * is a static export: there is no server to answer with a 301, and the
 * no-JS contract means the page still has to *read* — so it says where the
 * content went and links to it.
 */
export default function TrendingRedirect() {
  useEffect(() => {
    window.location.replace("/insights/");
  }, []);

  return (
    <>
      <meta httpEquiv="refresh" content="0; url=/insights/" />
      <main id="main" tabIndex={-1} className="shell flex-1 py-20">
        <div className="flex max-w-prose flex-col items-start gap-3">
          <h1 className="t-cond text-[22px] font-semibold tracking-tight text-ink">
            This page has moved to Insights
          </h1>
          <p className="text-[13px] leading-relaxed text-ink-2">
            The coverage boards were served at <code className="t-mono">/trending/</code>, a name
            that promised a trending list the catalog cannot publish — no source reports usage
            data. The same counts are now at <code className="t-mono">/insights/</code>.
          </p>
          <a href="/insights/" className="btn btn-solid mt-2">
            Go to Insights
          </a>
        </div>
      </main>
    </>
  );
}
