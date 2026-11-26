import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Standard Cloudflare Workers ISR/SSR handling.
  // Large catalog & assistant knowledge assets are served from R2/ASSETS
  // rather than bundled into the Worker to stay under the 3 MiB free-tier limit.
});
