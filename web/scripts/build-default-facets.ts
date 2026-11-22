import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchCatalog } from "../src/server/litespm/search";

async function main() {
  console.log("[facets] Pre-computing default static facets for marketplace LCP optimization...");
  const t0 = performance.now();
  const res = await searchCatalog({ facets: "only" });
  const ms = Math.round(performance.now() - t0);
  console.log(`[facets] Computed facets in ${ms}ms. Total pool: ${res.total}`);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outPath = path.join(root, "src", "lib", "litespm", "default-facets.json");
  writeFileSync(outPath, JSON.stringify(res.facets, null, 2), "utf8");
  console.log(`[facets] Written pre-computed static facets to ${outPath}`);
}

main().catch(console.error);
