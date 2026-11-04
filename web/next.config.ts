import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai", "localhost", "127.0.0.1"],
  turbopack: {
    root: __dirname,
  },
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/**/*"],
    "/*": ["./data/**/*"],
  },
};

export default nextConfig;
