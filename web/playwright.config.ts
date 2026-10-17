import { defineConfig, devices } from "@playwright/test";

/**
 * Browser regression suite for the built export.
 *
 * What it serves: `web/out` — the static export `next build` writes — through
 * the real edge Worker (`worker/index.js`) with the same `wrangler.toml`
 * semantics (`run_worker_first = ["/package/*"]`). That is the deployed shape:
 * the pre-rendered entry pages come off the asset server byte-for-byte, every
 * other entry URL is answered by the Worker's rewrite of the shipped shell,
 * and nothing here runs against `next dev`.
 *
 * Why `reducedMotion: "reduce"` by default: the site gates every ambient
 * animation on `prefers-reduced-motion` (the bridge figure's packets, the
 * kind cycle, the scroll-timeline entrance reveals), and a journey test that
 * races an entrance animation is a flake. Reduced motion is a fully supported
 * reading of the site — it is the *documented* still state — so journeys run
 * in it, and `tests/motion.spec.ts` exercises both sides of the gate
 * explicitly, including a positive control that motion does run under
 * `no-preference`.
 *
 * Why no retries: a flaky suite gets ignored. If something is genuinely
 * unreliable, it belongs in the report, not behind a retry.
 */
const PORT = 8788;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // The suite's own server: the built export through the real Worker on the
    // runtime it ships to (see `tests/serve.mjs` for why this is Miniflare
    // rather than `wrangler dev`).
    command: `node tests/serve.mjs`,
    url: `${BASE_URL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      LITESPM_TEST_PORT: String(PORT),
    },
  },
});
