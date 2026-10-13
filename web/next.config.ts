import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pin Next's workspace root to this package.
 *
 * A `pnpm-lock.yaml` in the parent directory (`business_Dev/`, outside this
 * repository) made Next infer the workspace root one level up, so every build
 * warned that it was tracing a tree that contains other projects — and then
 * did exactly that. Naming the root here is the fix the warning asks for; the
 * stray lockfile belongs to the surrounding workspace and is not ours to
 * delete.
 */
const webRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: webRoot,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
