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
  /**
   * One build worker, not one per CPU.
   *
   * The export prerenders 4,101 pages, and each worker holds the page graph
   * plus the 54 MB dataset in memory. On a machine with a few cores and 8 GB
   * of RAM the default worker count is what kills the build: the Next worker
   * is terminated mid-run with no error message, which looks like a code
   * failure and is not one. (Measured here: two workers finish the type
   * check and die in the page-generation phase; one worker completes the
   * whole build.) The cost is wall-clock time, and it is paid by CI rather
   * than by a contributor's laptop — raise it on a machine with more RAM.
   */
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
