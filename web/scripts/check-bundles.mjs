#!/usr/bin/env node
// Gate: every item in data/bundles.json is a real, installable listing.
//
// A bundle is a promise: "run these commands and you have this set". It breaks
// quietly when a catalog refresh drops a row, when the dedupe keeps a different
// twin, or when a row stops being installable. This gate resolves each item
// against the SAME rules the site uses - the dedupe in
// src/server/litespm/discovery.ts and the install rule in
// src/server/litespm/availability.ts, transpiled and run as they are - so a
// bundle cannot list something `litespm install` would refuse.
//
// Usage: node scripts/check-bundles.mjs

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);

function loadModule(rel) {
  const source = readFileSync(path.join(webRoot, rel), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    fileName: rel,
  });
  const dir = mkdtempSync(path.join(tmpdir(), "litespm-bundles-"));
  const file = path.join(dir, "module.mjs");
  writeFileSync(file, outputText);
  return import(pathToFileURL(file).href);
}

const failures = [];
const fail = (message) => failures.push(message);

const DIFFICULTIES = new Set(["Beginner", "Intermediate", "Advanced"]);

const { uniqueListings, normalizeListing } = await loadModule("src/server/litespm/discovery.ts");
const { availabilityOf } = await loadModule("src/server/litespm/availability.ts");

const catalog = JSON.parse(readFileSync(path.join(webRoot, "data", "catalog.json"), "utf8"));
const byId = new Map(uniqueListings(catalog.map(normalizeListing)).map((row) => [row.id, row]));

const file = JSON.parse(readFileSync(path.join(webRoot, "data", "bundles.json"), "utf8"));
const bundles = Array.isArray(file.bundles) ? file.bundles : [];

if (bundles.length < 8 || bundles.length > 16) {
  fail(`expected 8-16 bundles, found ${bundles.length}`);
}

const seenBundleIds = new Set();
for (const bundle of bundles) {
  const where = `bundle "${bundle?.id}"`;
  if (!bundle || typeof bundle.id !== "string" || !/^[a-z0-9-]+$/.test(bundle.id)) {
    fail(`${where}: id must be kebab-case`);
    continue;
  }
  if (seenBundleIds.has(bundle.id)) fail(`${where}: duplicate bundle id`);
  seenBundleIds.add(bundle.id);
  for (const field of ["title", "blurb", "audience"]) {
    if (typeof bundle[field] !== "string" || bundle[field].trim() === "") fail(`${where}: missing ${field}`);
  }
  if (!DIFFICULTIES.has(bundle.difficulty)) {
    fail(`${where}: difficulty must be Beginner, Intermediate or Advanced (got ${bundle.difficulty})`);
  }
  const items = Array.isArray(bundle.items) ? bundle.items : [];
  if (items.length < 2) fail(`${where}: a bundle needs at least 2 items`);
  if (new Set(items).size !== items.length) fail(`${where}: lists the same item twice`);
  for (const id of items) {
    const row = byId.get(id);
    if (!row) {
      fail(`${where}: ${id} is not in the catalog (after dedupe)`);
      continue;
    }
    if (!availabilityOf(row).installable) {
      fail(`${where}: ${id} is not installable (${availabilityOf(row).id})`);
    }
  }
}

if (failures.length > 0) {
  console.error("FAIL bundles:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
const itemCount = bundles.reduce((sum, b) => sum + b.items.length, 0);
console.log(`OK bundles: ${bundles.length} bundles, ${itemCount} items, all present and installable`);
