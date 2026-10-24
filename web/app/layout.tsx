import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ToastViewport } from "../components/ui/Toast";
import { DOCS_URL, SITE_NAME, SITE_TITLE, SITE_URL } from "../lib/site";

/**
 * IBM Plex: an engineered grotesque with squared terminals, which reads as
 * infrastructure software rather than startup. The condensed cut carries table
 * row names so 63-character capability names stay legible in a narrow column.
 * Mono is reserved for content that is genuinely machine-readable.
 */
// Vendored latin woff2 files (web/fonts/, SIL OFL 1.1 — license alongside).
// next/font/local keeps the rest of the pipeline identical to the former
// next/font/google call — self-hosted URLs, swap display, metric-adjusted
// fallback computed from the font file — but drops the build-time fetch to
// fonts.googleapis.com, which twice took the CI static export down when the
// runner could not reach Google. The Sans file is variable, so the three
// weight faces share one file exactly as Google's own CSS served them.
const sans = localFont({
  src: [
    { path: "../fonts/IBMPlexSans-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexSans-latin.woff2", weight: "500", style: "normal" },
    { path: "../fonts/IBMPlexSans-latin.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

const cond = localFont({
  src: [{ path: "../fonts/IBMPlexSansCondensed-600-latin.woff2", weight: "600", style: "normal" }],
  variable: "--font-cond",
  display: "swap",
});

const mono = localFont({
  src: [
    { path: "../fonts/IBMPlexMono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexMono-500-latin.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · LiteSPM",
  },
  description:
    "A package manager for AI agents. Discover MCP servers, skills and plugins, check package-level host support, then install and manage supported packages locally.",
  applicationName: SITE_NAME,
  keywords: [
    "MCP",
    "Model Context Protocol",
    "agent skills",
    "SKILL.md",
    "plugins",
    "LiteSPM",
    "capability registry",
    "Claude Code",
    "Codex",
    "OpenCode",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description:
      "A package manager for AI agents. Discover MCP servers, skills and plugins, check package-level host support, then install and manage supported packages locally.",
    url: SITE_URL,
  },
  twitter: {
    // The card upgrades to the large image only because an image now exists;
    // a `summary` card would letterbox the 1200×630 asset.
    card: "summary_large_image",
    title: SITE_TITLE,
    description: "A package manager for AI agents. Discover MCP servers, skills and plugins, check package-level host support, then install and manage supported packages locally.",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
  // The SVG is the icon every current browser uses. The .ico beside it answers
  // the bare /favicon.ico request that older browsers, feed readers and
  // bookmark tools still make — which used to 404 because only the SVG existed.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "16x16 32x32", type: "image/x-icon" },
    ],
    // The home-screen icon. Without it iOS screenshots the page and uses the
    // result, so the mark a user pinned to their home screen was whichever
    // corner of a product page happened to be visible. `app/apple-icon.png`
    // is generated from the same mark and palette as the favicon and the
    // social card (`npm run gen:og`), and `scripts/check-og-image.mjs` fails
    // the build if it is missing or the wrong size.
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8ecf4" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e14" },
  ],
};

/**
 * Theme resolution, run before first paint so the page never flashes the wrong
 * surface. It only ever writes `data-theme` on <html>: "system" (the default,
 * and what an unset attribute means) is resolved by CSS through
 * `prefers-color-scheme`, "light" and "dark" pin it. The choice itself lives
 * in `localStorage["litespm-theme"]` — no cookie, no server, no dependency.
 *
 * Kept as a plain string rather than an imported module so it is inlined in the
 * HTML: a deferred script would run after the first frame and defeat it.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem("litespm-theme");document.documentElement.dataset.theme=(t==="light"||t==="dark")?t:"system";}catch(e){document.documentElement.dataset.theme="system";}})();`;

/**
 * Site-level structured data. This lives in the layout rather than on the
 * package page because `/package/` resolves its entry from `?slug=` in the
 * browser, so anything keyed to one entry cannot be prerendered. Stating the
 * site once, truthfully, is what a crawler can actually verify.
 */
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description:
    "MCP servers, agent skills and plugins for AI coding agents.",
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/explore/?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // `suppressHydrationWarning` because the theme script below writes
    // `data-theme` before React hydrates; that attribute is deliberately not
    // rendered on the server, which has no localStorage to read.
    <html
      lang="en"
      className={`${sans.variable} ${cond.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-paper text-ink">
        {/*
         * The social image, rendered rather than declared. Next merges
         * metadata per top-level key, so every page that names its own
         * `openGraph` block (`/agents/[id]`, `/explore`, `/package`, …)
         * replaces the layout's whole `openGraph` — including `images` — and
         * a page-level declaration here would not reach them. React 19 hoists
         * a rendered <meta> into <head> regardless, so this one tag is what
         * makes the card universal. `twitter.images` above covers the other
         * card, and no page overrides `twitter`.
         */}
        <meta property="og:image" content={`${SITE_URL}/og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content={SITE_TITLE}
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT + `if(location.pathname.startsWith("/explore") && [...new URLSearchParams(location.search).keys()].some(k => ["q","kind","goal","category","host","publisher","source","verified","installable","sort"].includes(k))) document.documentElement.classList.add("query-pending");` }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
        />
        {/* Skip link: the header is 12rem of tab stops before the first
            content on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-ctl focus:bg-ink focus:px-3 focus:py-3 focus:text-[13px] focus:text-surface"
        >
          Skip to content
        </a>
        {/*
         * Readers without JavaScript. Every route is fully prerendered, but
         * Next's static export parks that HTML inside a hidden streaming shell
         * (`<div hidden id="S:0">`) and a bootstrap script swaps it into place
         * — so with scripting off the page is blank except for the skip link.
         * The stylesheet below does that swap for them, scoped to `<noscript>`
         * so it cannot apply (and cannot flash content mid-hydration) when
         * scripting is on. The note then says what genuinely needs scripting:
         * search, filters, sorting, the theme toggle, and the interactive
         * parts of an entry page. Every entry is *named* in the served HTML —
         * the bounded pre-rendered set (`/package/<key>/`, see
         * `lib/packageEntries.ts`) carries the whole record, and the edge
         * Worker (`worker/index.js`) injects the name, publisher and summary
         * into the shell for every other key — so the note says that instead
         * of claiming an entry cannot be read without scripting. Nothing here
         * claims the site does more than it does.
         */}
        <noscript>
          {/*
           * `@layer base` because Tailwind v4's preflight parks
           * `[hidden]{display:none!important}` there, and a layered
           * `!important` beats an unlayered one — the rule has to join the
           * same layer to outrank it, where the extra specificity wins.
           */}
          <style>{`@layer base{div[id^="S:"][hidden]{display:block!important}}`}</style>
          <div className="border-b border-rule bg-sunken px-4 py-2.5 text-center text-[12.5px] leading-relaxed text-ink-2">
            JavaScript is off. Everything on this page still reads; search, filters and an
            entry&rsquo;s interactive parts need it. Install steps are in the{" "}
            <a href={DOCS_URL} className="link">
              Developer docs
            </a>
            .
          </div>
        </noscript>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
