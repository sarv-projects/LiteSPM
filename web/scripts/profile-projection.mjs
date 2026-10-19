// Where the time goes when the browser hydrates the display projection.
//
// The numbers this prints are the ones the TODO's "Explore filter path" row
// records: the projection is 5 MiB on the wire, inflates to 13.5 MiB, and
// hydrating all 69,376 rows into objects costs a few hundred milliseconds
// (about a second in a browser). Hydrating the 24 rows a reader actually sees
// is free — which is why the structural fix is a facet artifact plus lazy
// hydration, and not a smaller download.
//
// Run: node scripts/profile-projection.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { decodeContainer, decodeDisplayRows, SECTION_ROWS } from "../lib/searchFormat.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, "..", "public", "data", "catalog-search-rows.bin.gz");

const t0 = Date.now();
const gz = readFileSync(path);
const raw = gunzipSync(gz);
const tGunzip = Date.now() - t0;

const t1 = Date.now();
const payload = decodeContainer(new Uint8Array(raw), SECTION_ROWS);
const tContainer = Date.now() - t1;

const t2 = Date.now();
const display = decodeDisplayRows(payload);
const tDecode = Date.now() - t2;

const t3 = Date.now();
const rows = new Array(display.rowCount);
for (let i = 0; i < display.rowCount; i += 1) rows[i] = display.rowAt(i);
const tHydrateAll = Date.now() - t3;

const t4 = Date.now();
for (let i = 0; i < 100; i += 1) display.rowAt(i);
const tHydrate100 = Date.now() - t4;

const t5 = Date.now();
let count = 0;
for (let i = 0; i < display.rowCount; i += 1) {
  if (rows[i].kind === "mcp") count += 1;
}
const tScan = Date.now() - t5;

console.log(`gz on disk        ${(gz.length / 1024 / 1024).toFixed(2)} MiB`);
console.log(`inflated          ${(raw.length / 1024 / 1024).toFixed(2)} MiB`);
console.log(`gunzip            ${tGunzip} ms`);
console.log(`container header  ${tContainer} ms`);
console.log(`decode view       ${tDecode} ms`);
console.log(`hydrate all       ${tHydrateAll} ms  (${display.rowCount} rows)`);
console.log(`hydrate 100       ${tHydrate100} ms`);
console.log(`scan kinds        ${tScan} ms  (${count} mcp rows)`);
