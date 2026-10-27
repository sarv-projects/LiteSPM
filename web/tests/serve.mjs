// The test server: `web/out` served through the real edge Worker.
//
// Why not `wrangler dev`: it wraps workerd in a file watcher and a live-reload
// proxy, and against this export (14,872 files, 781 MB) it dropped its asset
// manifest mid-run under load and began answering 404 for every path. The
// browser suite needs a server that watches nothing: the export is fixed
// before the suite starts.
//
// This starts Miniflare directly — the same runtime wrangler embeds — and
// configures it through `convertV4MiniflareOptions`, the same translation
// wrangler itself calls. The routing semantics are read from `wrangler.toml`
// rather than retyped here, so a change to the deployed config cannot leave
// the test server describing a different site:
//
//   * `main` — the entry Worker under test is the shipped `worker/index.js`;
//   * `compatibility_date` — the runtime's behaviour flags match production;
//   * `[assets]` — `binding`, `not_found_handling` and `run_worker_first` are
//     taken verbatim, so `/package/*` runs the Worker ahead of the asset
//     server exactly as in production and an unknown path answers with the
//     export's own 404 document.
//
// The one value that deliberately differs is the asset directory: production
// deploys `pages-dist` (`out/` plus the Go-materialized release tree); the
// suite asserts on the export the build actually wrote, `web/out`, per the
// project's "assert on the built export" rule.
//
// This is deliberately not a hand-rolled Node server: the `/package/` rewrite
// is part of what is under test, so it must be the shipped `worker/index.js`
// running on the runtime it ships to, not a reimplementation.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

/**
 * Just enough TOML for the fields this server needs: top-level `key = value`
 * pairs and one `[section]` table, with strings, booleans and arrays of
 * strings. A value it cannot parse is a hard failure, never a default — the
 * test server must not silently describe a different site than `wrangler.toml`.
 */
function parseTomlSubset(text, source) {
  const root = {};
  let section = root;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/(^|\s)#.*$/, "").trim();
    if (line === "") continue;
    const table = /^\[([A-Za-z0-9_.-]+)\]$/.exec(line);
    if (table) {
      section = root[table[1]] ??= {};
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!pair) throw new Error(`${source}: cannot parse line: ${rawLine}`);
    const [, key, raw] = pair;
    const value = raw.trim();
    if (value.startsWith('"')) {
      const match = /^"([^"]*)"$/.exec(value);
      if (!match) throw new Error(`${source}: cannot parse string value for ${key}: ${raw}`);
      section[key] = match[1];
    } else if (value.startsWith("[")) {
      const match = /^\[(.*)\]$/.exec(value);
      if (!match) throw new Error(`${source}: cannot parse array value for ${key}: ${raw}`);
      section[key] = match[1]
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .map((part) => {
          const item = /^"([^"]*)"$/.exec(part);
          if (!item) throw new Error(`${source}: cannot parse array item for ${key}: ${part}`);
          return item[1];
        });
    } else if (value === "true" || value === "false") {
      section[key] = value === "true";
    } else {
      throw new Error(`${source}: unsupported value for ${key}: ${raw}`);
    }
  }
  return root;
}

const hostArg = process.argv.indexOf("--host");
const host = hostArg >= 0 ? process.argv[hostArg + 1] : "127.0.0.1";
const portArg = process.argv.indexOf("--port");
const port = Number(process.env.LITESPM_TEST_PORT ?? (portArg >= 0 ? process.argv[portArg + 1] : 8788));
const webRoot = new URL("../", import.meta.url);
const repoRoot = new URL("..", webRoot);
const configPath = fileURLToPath(new URL("wrangler.toml", repoRoot));
const config = parseTomlSubset(readFileSync(configPath, "utf8"), "wrangler.toml");
const assetsConfig = config.assets ?? {};

for (const required of ["main", "compatibility_date"]) {
  if (typeof config[required] !== "string") {
    throw new Error(`wrangler.toml is missing the ${required} key this test server needs`);
  }
}
for (const required of ["binding", "not_found_handling"]) {
  if (typeof assetsConfig[required] !== "string") {
    throw new Error(`wrangler.toml [assets] is missing the ${required} key this test server needs`);
  }
}
if (!Array.isArray(assetsConfig.run_worker_first)) {
  throw new Error("wrangler.toml [assets] needs a run_worker_first array for this test server");
}

const mf = new Miniflare(
  convertV4MiniflareOptions({
    // Workerd refuses module paths that climb out of its root; the repository
    // root contains both the Worker and the export.
    rootPath: fileURLToPath(repoRoot),
    host,
    port,
    modules: [
      { type: "ESModule", path: fileURLToPath(new URL(config.main, repoRoot)) },
      { type: "ESModule", path: fileURLToPath(new URL("web/lib/discovery.mjs", repoRoot)) },
      { type: "ESModule", path: fileURLToPath(new URL("web/lib/listingSummary.mjs", repoRoot)) },
    ],
    compatibilityDate: config.compatibility_date,
    assets: {
      directory: fileURLToPath(new URL("out/", webRoot)),
      binding: assetsConfig.binding,
      run_worker_first: assetsConfig.run_worker_first,
      // `run_worker_first` routes requests to a user worker; the router has to
      // be told one exists (wrangler's own assets.ts sets the same flag from
      // `main !== undefined`).
      routerConfig: { has_user_worker: true },
      assetConfig: { not_found_handling: assetsConfig.not_found_handling },
    },
  })
);

await mf.ready;
console.log(`litespm test server ready on http://127.0.0.1:${port}`);

let disposing = false;
const shutdown = async () => {
  if (disposing) return;
  disposing = true;
  await mf.dispose();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
