import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = "data/search-artifacts.manifest.json";
const paths = new Set([
  "data/catalog.json", "data/release.json", "data/hosts.json",
  "data/skill-targets.json", "data/featured.json", "data/published-cli.json",
  "data/search-catalog.json.gz", "data/search-index.json.gz", "data/search-index-compact.json.gz",
  "scripts/build-search-artifacts.ts", "scripts/build-search-index.mjs", "scripts/check-search-artifacts.mjs",
]);
function visit(p) {
  const relative = path.relative(root, p).split(path.sep).join("/");
  if (paths.has(relative)) return;
  paths.add(relative);
  if (!/\.[cm]?tsx?$/.test(p)) return;
  const src = readFileSync(p, "utf8");
  for (const match of src.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
    const spec = match[1];
    if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
    const base = spec.startsWith("@/") ? path.join(root, "src", spec.slice(2)) : path.resolve(path.dirname(p), spec);
    for (const candidate of [base + ".ts", base + ".tsx", base + ".json", path.join(base, "index.ts"), base]) {
      if (existsSync(candidate) && /\.(ts|tsx|json)$/.test(candidate)) { visit(candidate); break; }
    }
  }
}
visit(path.join(root, "src/server/litespm/dataset.ts"));
visit(path.join(root, "src/server/litespm/bm25.ts"));
const files = Object.fromEntries([...paths].sort().map(p => {
  const raw = readFileSync(path.join(root, p));
  // Git checkouts may use CRLF on Windows; normalize text, never gzip bytes.
  const data = p.endsWith(".gz") ? raw : raw.toString("utf8").replace(/\r\n/g, "\n");
  return [p, createHash("sha256").update(data).digest("hex")];
}));
const manifest = { version: 1, files };
if (process.argv.includes("--write")) {
  writeFileSync(file + ".tmp", JSON.stringify(manifest, null, 2) + "\n");
  renameSync(file + ".tmp", file);
} else {
  const saved = JSON.parse(readFileSync(file, "utf8"));
  if (JSON.stringify(saved) !== JSON.stringify(manifest)) {
    const changed = [...new Set([...Object.keys(saved.files ?? {}), ...Object.keys(files)])].filter(p => saved.files?.[p] !== files[p]);
    throw new Error("Stale search artifacts; run npm run build:search-index and commit the generated files. Changed inputs: " + changed.join(", "));
  }
  console.log("Search artifact publication manifest verified");
}
