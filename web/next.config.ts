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
      { source: "/installed", destination: "/marketplace?tab=installed", permanent: true },
    ];
  },
  // Baseline security response headers, including strict Content-Security-Policy.
  async headers() {
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
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
