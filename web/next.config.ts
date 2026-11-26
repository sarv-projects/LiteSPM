import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai", "localhost", "127.0.0.1"],
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  // One catalog surface. Query strings are forwarded; the app maps the old
  // `?kind=` spelling onto the tab. `/agents/<id>` was what the sitemap used to
  // emit; the router has always served `/agent/<id>`.
  async redirects() {
    return [
      { source: "/explore", destination: "/marketplace", permanent: true },
      { source: "/agents/:id", destination: "/agent/:id", permanent: true },
      { source: "/installed", destination: "/marketplace?tab=installed", permanent: true },
    ];
  },
  // Baseline security response headers, including tightened Content-Security-Policy (no unsafe-eval)
  // and scoped CORS strictly for public read-only API endpoints.
  async headers() {
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ];

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/api/litespm/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/**/*"],
    "/*": ["./data/**/*"],
  },
  // Keep full data available on catalog consumers (including degraded compact
  // fallback), but do not duplicate it into handlers that never read it.
  outputFileTracingExcludes: {
    "/api/litespm/feedback": ["./data/**/*"],
    "/api/litespm/view": ["./data/**/*"],
    "/api/litespm/installed": ["./data/**/*"],
    "/api/litespm/llm": ["./data/**/*"],
    "/api/litespm/search-index": ["./data/**/*"],
    "/api/litespm/search-catalog": ["./data/**/*"],
    "/robots.txt": ["./data/**/*"],
    "/icon.svg": ["./data/**/*"],
    "/favicon.ico": ["./data/**/*"],
    "/install.sh": ["./data/**/*"],
    "/install.ps1": ["./data/**/*"],
  },
};

export default nextConfig;
