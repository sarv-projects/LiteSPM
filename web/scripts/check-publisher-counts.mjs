#!/usr/bin/env node
// Gate: the count printed beside a publisher's name is the count its filter
// returns.
//
// The Coverage board and the Publisher control both print a number next to a
// publisher's name, and both link a filter that selects that publisher's
// entries. If the two disagree, the site is publishing a number that is right
// about one thing and wrong about the thing it names — the failure the whole
// catalogue is built to avoid.
//
// The rule is `lib/publisherFilter.ts` (case-folded, exact). This script
// checks it against the real dataset, and checks the emitted facet list
// against the dataset as well, so a stale artifact cannot ship beside a new
// dataset.
//
// Usage: node scripts/check-publisher-counts.mjs [--root <dir>]

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv.indexOf("--root");
const webRoot = rootArg === -1 ? path.dirname(here) : path.resolve(process.argv[rootArg + 1]);

function fail(message) {
  console.error(`FAIL publisher counts — ${message}`);
  process.exit(1);
}

function normalizedPublisher(name) {
  return String(name ?? "").trim().toLowerCase();
}

function checkFilterContract(publisherMatches) {
  const cases = [
    [" Publisher ", "publisher", true],
    ["Publisher", "publisher-plus", false],
    ["publisher-plus", "Publisher", false],
    [null, "publisher", false],
    ["Publisher", "", true],
  ];

  for (const [name, wanted, expected] of cases) {
    if (publisherMatches(name, wanted) !== expected) {
      fail(
        `lib/publisherFilter.ts no longer follows its case-folded exact-match contract ` +
          `(name=${JSON.stringify(name)}, wanted=${JSON.stringify(wanted)})`
      );
    }
  }
}

/** The site's own rule, transpiled from TypeScript. */
async function loadRule() {
  const modulePath = path.join(webRoot, "lib", "publisherFilter.ts");
  const transpiled = ts.transpileModule(readFileSync(modulePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: modulePath,
  }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
  const module = await import(url);
  if (typeof module.publisherMatches !== "function") {
    fail("lib/publisherFilter.ts did not export publisherMatches");
  }
  return module.publisherMatches;
}

function main() {
  const rows = JSON.parse(readFileSync(path.join(webRoot, "data", "catalog.json"), "utf8"));
  if (!Array.isArray(rows) || rows.length === 0) {
    fail("data/catalog.json did not parse to a non-empty array");
  }

  return loadRule().then((publisherMatches) => {
    checkFilterContract(publisherMatches);

    // Group once by the same case-folded exact key the filter uses. The
    // previous implementation rescanned all 69K rows for every publisher;
    // with 30K distinct publishers that meant over two billion comparisons.
    const exact = new Map();
    for (const row of rows) {
      const key = normalizedPublisher(row.publisher?.name);
      if (!key) continue;
      exact.set(key, (exact.get(key) ?? 0) + 1);
    }

    // Check the production matcher against every real row name and each
    // distinct key. Under the contract above, the grouped counts are exactly
    // the rows each publisher filter returns.
    const mismatches = [];
    for (const row of rows) {
      const name = row.publisher?.name;
      const key = normalizedPublisher(name);
      if (key && !publisherMatches(name, key)) {
        mismatches.push(`${key}: the filter does not match one of its own publisher names`);
      }
    }
    for (const key of exact.keys()) {
      if (
        publisherMatches(`${key} extra`, key) ||
        publisherMatches(`extra ${key}`, key)
      ) {
        mismatches.push(`${key}: the filter matches a non-exact publisher name`);
      }
    }
    if (mismatches.length > 0) {
      console.error(
        `FAIL publisher counts — ${mismatches.length} publisher(s) whose published count is not ` +
          "the count its own filter returns:"
      );
      for (const line of mismatches.slice(0, 10)) console.error(`  - ${line}`);
      process.exit(1);
    }

    // The emitted facet list, when the build has written it: the same counts,
    // over the same rows.
    const facetPath = path.join(webRoot, "public", "data", "catalog-publishers.json");
    if (existsSync(facetPath)) {
      const doc = JSON.parse(readFileSync(facetPath, "utf8"));
      if (!Array.isArray(doc.publishers)) {
        fail("public/data/catalog-publishers.json carries no publisher list");
      }
      if (doc.publisherCount !== exact.size) {
        fail(
          `the emitted facet list says ${doc.publisherCount} publishers, the dataset has ` +
            `${exact.size} — re-run the emitter (npm run prebuild)`
        );
      }
      const stale = [];
      for (const facet of doc.publishers) {
        const key = String(facet.name ?? "").trim().toLowerCase();
        const expected = exact.get(key);
        if (expected === undefined) {
          stale.push(`${facet.name}: not in the dataset`);
        } else if (expected !== facet.count) {
          stale.push(`${facet.name}: the list says ${facet.count}, the dataset has ${expected}`);
        }
      }
      if (stale.length > 0) {
        fail(
          `the emitted facet list disagrees with the dataset in ${stale.length} place(s) — ` +
            "re-run the emitter (npm run prebuild)"
        );
      }
    }

    console.log(
      `OK publisher counts — ${exact.size.toLocaleString("en-US")} publisher(s); every ` +
        "published count is the count its own filter returns"
    );
  });
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
