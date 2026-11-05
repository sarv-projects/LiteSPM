// Cloudflare origin for the catalog release tree.
//
// The website is now a Next.js standalone app deployed on Vercel. The old
// static-export Worker (which rewrote /package/* shell HTML) depended on
// modules that no longer exist and described a build that `next build` does
// not produce. This Worker keeps the one thing this origin still owns — the
// signed /v1 catalog tree under pages-dist/ — and sends every website request
// to the app origin.
//
// Deployment: `scripts/deploy-pages.sh` materializes the catalog tree into
// pages-dist/; `wrangler deploy` uploads it. Set WEB_ORIGIN in wrangler.toml
// (or the dashboard) to the Vercel production origin.

const DEFAULT_WEB_ORIGIN = "https://lite-spm-nine.vercel.app";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The catalog tree is public, immutable release data. Serve it from the
    // asset binding exactly as uploaded; do not proxy it through Vercel.
    if (url.pathname === "/v1" || url.pathname.startsWith("/v1/")) {
      return env.ASSETS.fetch(request);
    }

    const origin = (env.WEB_ORIGIN || DEFAULT_WEB_ORIGIN).replace(/\/+$/, "");
    const target = `${origin}${url.pathname}${url.search}`;
    return Response.redirect(target, 302);
  },
};
