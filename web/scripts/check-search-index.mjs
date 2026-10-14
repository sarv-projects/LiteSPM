#!/usr/bin/env node
// Gate: the emitted search index reproduces `matchesQuery`, byte-stably.
//
// The claim `lib/query.ts` makes — "one matcher, two callers" — used to be an
// assertion in a comment, and it was false: the build-time topic counts used
// substring matching, the runtime worker used MiniSearch with prefix+fuzzy
// (which returns rows that do not contain the query at all) and the no-worker
// fallback used substring matching again. A landing-page chip could say one
// number and `/explore` show another.
//
// This script is the proof. It runs the real exported matcher — `matchesQuery`
// from `lib/query.ts`, transpiled with the TypeScript compiler API (already a
// devDependency, exactly as the other gates do) — over every row of the real
// dataset and asserts that the emitted index's row set is *equal* for a query
// corpus that includes the cases where the old implementations diverged:
//
//   * a single token, a multi-token query, a prefix;
//   * a token that appears only mid-word (`sign` must not match `design` or
//     `codesign`, which a substring matcher would answer yes to);
//   * an empty query (browse: every row), a query with no matches;
//   * a CJK query (Unicode tokenization, not `[a-z0-9]`).
//
// It also asserts the artifacts are deterministic (build and encode twice,
// byte-identical) and stay under size budgets set from the measured sizes, and
// — when `public/data/` already holds them — that the served bytes are exactly
// what a fresh build produces, so a stale artifact cannot ship beside a new
// dataset.
//
// Usage: node scripts/check-search-index.mjs [--root <dir>]

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import ts from "typescript";
import {
  buildDisplayRows,
  buildSearchIndex,
  decodeContainer,
  decodeSearchIndex,
  encodeContainer,
  encodeDisplayRows,
  encodeSearchIndex,
  listingText,
  querySearchIndex,
  tokenizeText,
  SECTION_INDEX,
  SECTION_ROWS,
} from "../lib/searchFormat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv.indexOf("--root");
const webRoot = rootArg === -1 ? path.dirname(here) : path.resolve(process.argv[rootArg + 1]);

const MiB = (bytes) => bytes / 1024 / 1024;
const fmt = (bytes) => `${MiB(bytes).toFixed(2)} MiB`;

// Budgets set from the measured artifact, with a few percent of headroom. The
// gate exists so the index cannot silently regress past these: a change that
// doubles the postings should fail here, not on a user's phone.
const INDEX_RAW_BUDGET = 4.5 * 1024 * 1024; // measured 4.19 MiB
const INDEX_GZ_BUDGET = 3.0 * 1024 * 1024; // measured 2.68 MiB
const ROWS_RAW_BUDGET = 14.0 * 1024 * 1024; // measured 13.34 MiB
const ROWS_GZ_BUDGET = 5.5 * 1024 * 1024; // measured 4.98 MiB

const QUERIES = [
  "playwright", // single token
  "github mcp", // multi-token: every token must match
  "play", // prefix
  "sign", // mid-word: must NOT match `design` / `codesign`
  "", // browse
  "zzz-no-such-thing", // no matches
  "数据库", // CJK
  "台灣",
  "context7",
  "figma",
  "CODESIGN", // case folding
  "streamable-http", // punctuation splits into two tokens
];

function fail(message) {
  console.error(`FAIL search index — ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The real matcher, transpiled from TypeScript so this gate cannot pass by
// testing a re-implementation. `query.ts` imports only the shared format
// module, whose specifier is rewritten to an absolute file URL so the data:
// module can resolve it.
// ---------------------------------------------------------------------------
async function loadMatcher() {
  const queryPath = path.join(webRoot, "lib", "query.ts");
  const formatPath = path.join(webRoot, "lib", "searchFormat.mjs");
  const transpiled = ts.transpileModule(readFileSync(queryPath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: queryPath,
  }).outputText;
  const rewritten = transpiled.replace(
    /from "\.\/searchFormat\.mjs"/,
    `from ${JSON.stringify(pathToFileURL(formatPath).href)}`
  );
  const url = `data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`;
  const module = await import(url);
  if (typeof module.matchesQuery !== "function") {
    fail("lib/query.ts did not export matchesQuery");
  }
  return module.matchesQuery;
}

/** One full build of both artifacts, exactly as the emitter performs it. */
function buildArtifacts(rows) {
  const index = buildSearchIndex(rows);
  const indexRaw = encodeContainer([{ kind: SECTION_INDEX, payload: encodeSearchIndex(index) }]);
  const display = buildDisplayRows(rows);
  const rowsRaw = encodeContainer([{ kind: SECTION_ROWS, payload: encodeDisplayRows(display) }]);
  return {
    index,
    indexRaw,
    indexGz: gzipSync(indexRaw, { level: 9 }),
    rowsRaw,
    rowsGz: gzipSync(rowsRaw, { level: 9 }),
  };
}

async function main() {
  const rows = JSON.parse(readFileSync(path.join(webRoot, "data", "catalog.json"), "utf8"));
  if (!Array.isArray(rows) || rows.length === 0) {
    fail(`data/catalog.json did not parse to a non-empty array`);
  }
  const matchesQuery = await loadMatcher();

  // -- 1. Agreement ---------------------------------------------------------
  const first = buildArtifacts(rows);
  const decoded = decodeSearchIndex(decodeContainer(first.indexRaw, SECTION_INDEX));
  if (decoded.rowCount !== rows.length) {
    fail(`index rowCount ${decoded.rowCount} != dataset ${rows.length}`);
  }

  const disagreements = [];
  for (const query of QUERIES) {
    const fromIndex = new Set(querySearchIndex(decoded, query));
    const fromMatcher = new Set();
    for (let i = 0; i < rows.length; i += 1) {
      if (matchesQuery(rows[i], query)) fromMatcher.add(i);
    }
    if (fromIndex.size !== fromMatcher.size) {
      disagreements.push(
        `${JSON.stringify(query)}: index ${fromIndex.size}, matcher ${fromMatcher.size}`
      );
      continue;
    }
    for (const row of fromIndex) {
      if (!fromMatcher.has(row)) {
        disagreements.push(`${JSON.stringify(query)}: row ${row} in index, not in matcher`);
        break;
      }
    }
  }
  if (disagreements.length > 0) {
    console.error(`FAIL search index — index and matchesQuery disagree on ${disagreements.length} quer${disagreements.length === 1 ? "y" : "ies"}:`);
    for (const line of disagreements) console.error(`  - ${line}`);
    console.error(
      "\nThe build-time topic counts and the runtime search are supposed to be the same\n" +
        "function over the same rows. They are not. Fix the emitter or the matcher — not\n" +
        "the comment."
    );
    process.exit(1);
  }

  // The semantics the corpus is there to pin, stated as facts rather than
  // implied by the equality check (which two equally-wrong sides would pass).
  const midWordRow = rows.findIndex((row) => {
    const text = listingText(row);
    if (!/design/i.test(text)) return false;
    return !tokenizeText(text).some((token) => token.startsWith("sign"));
  });
  if (midWordRow === -1) {
    fail("no `design` row without a `sign*` token was found — the corpus cannot pin mid-word matching");
  }
  if (matchesQuery(rows[midWordRow], "sign")) {
    fail("`sign` matched a `design` row: the matcher is not token-prefix");
  }
  if (!matchesQuery(rows[0], "")) fail("an empty query must match every row");
  const cjkMatches = querySearchIndex(decoded, "数据库").length;
  if (cjkMatches === 0) fail("the CJK query `数据库` matched nothing — tokenization dropped it");

  // -- 2. Determinism -------------------------------------------------------
  const second = buildArtifacts(rows);
  const sameIndex = Buffer.from(first.indexRaw).equals(Buffer.from(second.indexRaw));
  const sameRows = Buffer.from(first.rowsRaw).equals(Buffer.from(second.rowsRaw));
  const sameIndexGz = first.indexGz.equals(second.indexGz);
  const sameRowsGz = first.rowsGz.equals(second.rowsGz);
  if (!sameIndex || !sameRows || !sameIndexGz || !sameRowsGz) {
    fail(
      `a second build differs (index raw ${sameIndex ? "ok" : "DIFFERS"}, ` +
        `rows raw ${sameRows ? "ok" : "DIFFERS"}, index gz ${sameIndexGz ? "ok" : "DIFFERS"}, ` +
        `rows gz ${sameRowsGz ? "ok" : "DIFFERS"})`
    );
  }

  // -- 3. Budgets -----------------------------------------------------------
  const overBudget = [];
  const budgets = [
    ["index raw", first.indexRaw.length, INDEX_RAW_BUDGET],
    ["index gzip", first.indexGz.length, INDEX_GZ_BUDGET],
    ["rows raw", first.rowsRaw.length, ROWS_RAW_BUDGET],
    ["rows gzip", first.rowsGz.length, ROWS_GZ_BUDGET],
  ];
  for (const [name, actual, budget] of budgets) {
    if (actual > budget) overBudget.push(`${name} is ${fmt(actual)}, budget ${fmt(budget)}`);
  }
  if (overBudget.length > 0) {
    console.error(`FAIL search index — ${overBudget.length} size budget(s) exceeded:`);
    for (const line of overBudget) console.error(`  - ${line}`);
    process.exit(1);
  }

  // -- 4. Served bytes match a fresh build ----------------------------------
  // public/data/ is gitignored and emitted by predev/prebuild, so it may not
  // exist when this gate runs; when it does, a byte difference means the bytes
  // on the CDN would not be the bytes this dataset produces.
  const stale = [];
  for (const [name, expected] of [
    ["catalog-search-index.bin.gz", first.indexGz],
    ["catalog-search-rows.bin.gz", first.rowsGz],
  ]) {
    const file = path.join(webRoot, "public", "data", name);
    if (!existsSync(file)) continue;
    if (!readFileSync(file).equals(expected)) stale.push(name);
  }
  if (stale.length > 0) {
    console.error(`FAIL search index — served artifact(s) are stale: ${stale.join(", ")}`);
    console.error("Re-run the emitter (`npm run prebuild` or `npm run predev`) against the current dataset.");
    process.exit(1);
  }

  console.log(
    `OK search index — ${first.index.tokens.length.toLocaleString("en-US")} tokens, ` +
      `${first.index.postingsCount.toLocaleString("en-US")} postings; ` +
      `index ${fmt(first.indexRaw.length)} raw / ${fmt(first.indexGz.length)} gzip, ` +
      `rows ${fmt(first.rowsRaw.length)} raw / ${fmt(first.rowsGz.length)} gzip; ` +
      `${QUERIES.length} queries agree with matchesQuery over all ` +
      `${rows.length.toLocaleString("en-US")} rows; a second build is byte-identical`
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
