#!/usr/bin/env node
// Gate: installable listings lead the default (relevance and rank) result
// order, and a discovery-only twin never displaces an installable one.
//
// The rank score gives installability at most 15 of 100 points, so a
// discovery-only row with a better name or publisher used to outrank an
// installable one. search.ts now applies `installableFirst` (ranking.ts) as a
// stable partition after the relevance and rank sorts. This gate:
//   1. runs the real function on fixed rows (order, stability, no row lost);
//   2. asserts search.ts applies it to exactly those two sorts and leaves the
//      name, kind and publisher sorts alone.
//
// Usage: node scripts/check-installable-first.mjs

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(webRoot, rel), "utf8");

const { outputText } = ts.transpileModule(read("src/server/litespm/ranking.ts"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  fileName: "ranking.ts",
});
const dir = mkdtempSync(path.join(tmpdir(), "litespm-installable-first-"));
writeFileSync(path.join(dir, "ranking.mjs"), outputText);
const { installableFirst } = await import(pathToFileURL(path.join(dir, "ranking.mjs")).href);

const failures = [];
const fail = (message) => failures.push(message);

// Sorted best-first by score; "d" rows are discovery-only.
const sorted = [
  { n: "a-discovery-top", ok: false },
  { n: "b-installable", ok: true },
  { n: "c-discovery", ok: false },
  { n: "d-installable", ok: true },
  { n: "e-installable", ok: true },
];
const out = installableFirst(sorted, (r) => r.ok).map((r) => r.n);
const want = ["b-installable", "d-installable", "e-installable", "a-discovery-top", "c-discovery"];
if (JSON.stringify(out) !== JSON.stringify(want)) {
  fail(`order: expected ${want.join(",")} got ${out.join(",")}`);
}
if (out.length !== sorted.length) fail("a non-installable row was dropped");

// Twin collapse keeps the first row per name: the installable twin must come first.
const twins = installableFirst(
  [
    { n: "postgres", pub: "community", ok: false },
    { n: "postgres", pub: "vendor", ok: true },
  ],
  (r) => r.ok,
);
if (twins[0].pub !== "vendor") fail("an installable twin must precede a discovery-only twin");

// All one class: returned untouched.
const all = [{ ok: true }, { ok: true }];
if (installableFirst(all, (r) => r.ok) !== all) fail("an all-installable list must be returned as is");
if (installableFirst([], () => true).length !== 0) fail("empty input must stay empty");

// Wiring in search.ts.
const search = read("src/server/litespm/search.ts");
const wiring = [
  /case "relevance":[\s\S]*?installableFirst\(sorted[\s\S]*?break;/,
  /case "rank":[\s\S]*?installableFirst\(sorted[\s\S]*?break;/,
];
for (const pattern of wiring) {
  if (!pattern.test(search)) fail(`search.ts: installableFirst is not applied after ${pattern.source.slice(0, 20)}`);
}
for (const sortCase of ["publisher", "kind"]) {
  const block = new RegExp(`case "${sortCase}":[\\s\\S]*?break;`).exec(search)?.[0] ?? "";
  if (block.includes("installableFirst")) fail(`search.ts: the explicit "${sortCase}" sort must not be reordered`);
}
const tail = /default:[\s\S]*?\n  }\n/.exec(search)?.[0] ?? "";
if (tail.includes("installableFirst")) fail('search.ts: the explicit "name" sort must not be reordered');

// The methodology page prints the score components; they must match the code.
const ranking = await import(pathToFileURL(path.join(dir, "ranking.mjs")).href);
const breakdown = ranking.rankScoreBreakdown({ name: "x", kind: "mcp", publisher: { name: "x" } });
const codeMax = {
  "Editorial recognition": breakdown.recognition.max,
  "Vendor authority": breakdown.vendorAuthority.max,
  "Proven installability": breakdown.installability.max,
  "Record quality": breakdown.recordQuality.max,
  "Description substance": breakdown.description.max,
  "GitHub stars": breakdown.stars.max,
};
if (Object.values(codeMax).reduce((a, b) => a + b, 0) !== 100) fail("ranking.ts score maximums no longer sum to 100");
const docs = read("src/components/litespm/views/docs.tsx");
for (const [part, max] of Object.entries(codeMax)) {
  if (!new RegExp(`part: "${part}", max: ${max},`).test(docs)) {
    fail(`docs.tsx: methodology table row "${part}" does not show the code maximum ${max}`);
  }
}

if (failures.length > 0) {
  console.error("FAIL installable-first:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.log("OK installable-first: partition is stable, twins prefer installable, explicit sorts untouched");
