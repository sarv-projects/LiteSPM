import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai", "localhost", "127.0.0.1"],
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
    ];
  },
  // Baseline response headers. A full CSP is deliberately not set here: Next
  // inlines bootstrap scripts, so a strict CSP needs per-request nonces (see
  // AUDIT-WEBSITE-2026-11.md, "What remains").
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/**/*"],
    "/*": ["./data/**/*"],
  },
};

export default nextConfig;
