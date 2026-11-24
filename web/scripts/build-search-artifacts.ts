/**
 * Offline generator: no dev server, same loaders and BM25 implementation as runtime.
 * Preserve the committed compact projection unless --refresh-catalog is requested
 * (catalog publication should use --refresh-catalog). Each file is atomically replaced;
 * release, projection and ordered row-content digest reject mixed generations.
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import path from "node:path";
import { buildCompactDataset, getCompactDataset, getDataset } from "../src/server/litespm/dataset";
import { buildSearchIndex, serializeSearchIndex, searchRowDigest } from "../src/server/litespm/bm25";
import type { Listing } from "../src/server/litespm/types";

const dir = path.join(process.cwd(), "data");
const check = process.argv.includes("--check");
const refresh = process.argv.includes("--refresh-catalog");
function write(name: string, data: unknown) {
  const target = path.join(dir, name);
  const tmp = target + ".tmp";
  const compressed = gzipSync(JSON.stringify(data), { level: 6 });
  writeFileSync(tmp, compressed);
  renameSync(tmp, target);
  console.log(name, compressed.length, "bytes");
}
const full = await getDataset();
const fresh = refresh ? await buildCompactDataset() : null;
const compact = fresh ? { ...fresh, rows: fresh.rows as Listing[] } : await getCompactDataset();
const specs = [
  { projection: "full" as const, name: "search-index.json.gz", dataset: full },
  { projection: "compact" as const, name: "search-index-compact.json.gz", dataset: compact },
];
if (check && refresh) throw new Error("--check and --refresh-catalog are mutually exclusive");
for (const spec of specs) {
  const { rows, release } = spec.dataset;
  if (check) {
    const saved = JSON.parse(gunzipSync(readFileSync(path.join(dir, spec.name))).toString("utf8"));
    if (saved.version !== 2 || saved.projection !== spec.projection || saved.releaseId !== release.releaseId ||
        saved.rowDigest !== searchRowDigest(rows) || saved.n !== rows.length ||
        saved.docs.length !== rows.length || !saved.docs.every((doc: [string], i: number) => doc[0] === rows[i]?.id)) {
      throw new Error("Incompatible index: " + spec.name);
    }
    console.log("Verified", spec.name, rows.length, "rows");
  } else {
    const index = buildSearchIndex(rows, release.releaseId);
    write(spec.name, serializeSearchIndex(index, rows, spec.projection));
  }
}
if (fresh) write("search-catalog.json.gz", fresh);
