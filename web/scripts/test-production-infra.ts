import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { getDataset, getCompactDataset } from "../src/server/litespm/dataset";
import { buildSearchIndex, getSearchIndex, serializeSearchIndex } from "../src/server/litespm/bm25";
import { searchCatalog } from "../src/server/litespm/search";
import { databaseConfigured, getDatabase } from "../src/lib/db";
import { GET as trending } from "../src/app/api/litespm/trending/route";
import { POST as view } from "../src/app/api/litespm/view/route";
import { POST as feedback } from "../src/app/api/litespm/feedback/route";
import { GET as exporter } from "../src/app/api/litespm/search-index/route";
import { GET as catalogExporter } from "../src/app/api/litespm/search-catalog/route";
import { GET as sh } from "../src/app/install.sh/route";
import { GET as ps } from "../src/app/install.ps1/route";

const projection = process.argv[2] === "full" ? "full" : "compact";
const digest = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const dataset = projection === "compact" ? await getCompactDataset() : await getDataset();
const again = projection === "compact" ? await getCompactDataset() : await getDataset();
assert.equal(dataset.rows, again.rows);
const messages: string[] = [];
const info = console.info;
console.info = (...args: unknown[]) => { messages.push(args.join(" ")); info(...args); };
if (projection === "compact") {
  await searchCatalog({ compact: true, facets: "only" });
  assert(!messages.some(x => /BM25F/.test(x)), "No-query browse should not load an index");
}
const loaded = getSearchIndex(dataset.rows, dataset.release.releaseId, projection);
assert.equal(loaded, getSearchIndex(dataset.rows, dataset.release.releaseId, projection));
assert(messages.some(x => x.includes("loaded precomputed BM25F")));
assert(!messages.some(x => x.includes("built BM25F")));
console.info = info;
const expected = digest(serializeSearchIndex(loaded, dataset.rows, projection));
const reference = buildSearchIndex(dataset.rows, dataset.release.releaseId);
assert.equal(digest(serializeSearchIndex(reference, dataset.rows, projection)), expected,
  "Precomputed index must exactly match a fresh reference including document lengths, df and ordered postings");
console.log("PASS", projection, "runtime artifact matches fresh index");
if (projection === "compact") {
  process.env.LITESPM_DATABASE_MODE = "fallback";
  assert.equal(databaseConfigured(), false);
  assert.throws(() => getDatabase(), /not configured/);
  const t = await trending();
  assert.equal(t.status, 200);
  const b = await t.json();
  assert(b.items.length > 0 && b.source.includes("verified leaderboard"));
  assert(t.headers.get("cache-control")?.includes("s-maxage"));
  const request = (url: string, body: object) => new NextRequest(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const v = await view(request("http://localhost/api/litespm/view", {linkKey:"sample"}));
  assert.deepEqual(await v.json(), {ok:false,skipped:"database_not_configured"});
  const f = await feedback(request("http://localhost/api/litespm/feedback", {
    name:"Regression Test",email:"private@example.invalid",message:"A local regression check only",kind:"general"
  }));
  const fb = await f.json();
  assert.equal(fb.fallback, true);
  assert(!decodeURIComponent(fb.fallbackUrl).includes("private@example.invalid"));
  assert.equal((await exporter()).status,404);
  assert.equal((await catalogExporter()).status,404);
  for (const [route,file] of [[sh,"install.sh"],[ps,"install.ps1"]] as const) {
    const response = await route();
    assert.equal(response.status,200);
    assert.equal(await response.text(),readFileSync("public/"+file,"utf8"));
  }
  console.log("PASS fallback DB, privacy, production exporter restrictions, installer bytes");
}
