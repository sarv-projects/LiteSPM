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
// One more rule is asserted here, because it is a rule about what a row's
// address may contribute: the host segment of an address (`io.github.` in the
// registry's ids) says where the entry is served from, not what it is, so it is
// not searchable. The gate pins both halves — the named row that carries the
// word only in its host does not match, and the word's match set stays inside
// the measured share of the catalog.
//
// Usage: node scripts/check-search-index.mjs [--root <dir>]

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import ts from "typescript";
import {
  buildDisplayRows,
  buildDisplayShards,
  buildSearchIndex,
  decodeContainer,
  decodeDisplayRows,
  decodeSearchIndex,
  encodeContainer,
  encodeDisplayRows,
  encodeSearchIndex,
  listingText,
  querySearchIndex,
  searchShardRange,
  tokenizeText,
  SEARCH_RESULT_WINDOW,
  SEARCH_SHARD_ROWS,
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
const INDEX_RAW_BUDGET = 4.5 * 1024 * 1024; // measured 3.90 MiB
const INDEX_GZ_BUDGET = 3.0 * 1024 * 1024; // measured 2.40 MiB
const ROWS_RAW_BUDGET = 14.0 * 1024 * 1024; // measured 13.47 MiB
const ROWS_GZ_BUDGET = 5.5 * 1024 * 1024; // measured 4.99 MiB
// The sharded projection is the search path's transport; its total size only
// matters when a fallback loads everything, so the budget is loose — the
// window budget below is the one the reader feels.
const SHARD_GZ_BUDGET = 6.5 * 1024 * 1024; // measured 5.93 MiB across 1,021 shards
const SHARD_MAX_BUDGET = 32 * 1024; // measured largest ~10 KiB
// The first window is what a first search costs on top of the index. Measured
// over the corpus below: the worst case is `context7` at 103,978 B (0.0992 MiB)
// spread over 16 shards, because 23 matches scattered across 16 shards cost
// more than 200 matches packed into four. This is the regression the whole
// layout exists to prevent — if a change ever makes the first search fetch the
// full projection again, it fails here. The budget is the plan's 0.10 MiB;
// the measured value sits 0.8% under it.
const WINDOW_GZ_BUDGET = Math.round(0.1 * 1024 * 1024);
const WINDOW_SHARD_BUDGET = 64;

const QUERIES = [
  "playwright", // single token
  "github mcp", // multi-token: every token must match
  "github", // the address's host: a wide match set that must stay wide-but-honest
  "notion", // the narrowest common brand query
  "postgres", // the query the layout was measured on
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
  // The two heaviest first-window queries measured over a wider corpus (they
  // scatter body-only matches across the most shards), so the window budget
  // below is pinned by the worst case, not by the friendliest query.
  "weather",
  "memory",
];

/**
 * The address's host is not searchable.
 *
 * 25,903 of the 69,376 rows are filed under the single registry namespace
 * `io.github`, so before format v4 the query `github` matched 26,864 rows —
 * 38.7% of the catalog — and 16,044 of them carried the word nowhere except
 * in the address that says where the entry is served from.
 *
 * The rule is pinned here rather than left to a comment: a row whose only
 * mention of the word is its address's host must not match, and the match set
 * for the word must stay a set of rows that actually say it. The measured
 * number is 10,820 rows (15.6%); the budget below is that measurement with a
 * small margin, so a change that widens the set again fails here.
 */
const HOST_MATCH_BUDGET_RATIO = 0.16;

/** The row the rule is stated on: `github` in its address host and nowhere else. */
const HOST_PROBE_ID = "mcp:builtin:mcp-registry:io.github.nirholas-three-token-mcp";

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
  const shardsRaw = buildDisplayShards(rows);
  return {
    index,
    indexRaw,
    indexGz: gzipSync(indexRaw, { level: 9 }),
    rowsRaw,
    rowsGz: gzipSync(rowsRaw, { level: 9 }),
    shardsRaw,
    shardsGz: shardsRaw.map((raw) => gzipSync(raw, { level: 9 })),
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

  // The sharded projection must be the full projection, in pieces: same rows,
  // same order, same link keys. A shard that resolved slug ambiguity locally
  // would send a card to the wrong entry, which no size budget would catch.
  const fullDisplay = decodeDisplayRows(decodeContainer(first.rowsRaw, SECTION_ROWS));
  // Host compatibility for remote MCP entries depends on the exact endpoint
  // transport and whether a URL was published. The browser's hydrated rows
  // must retain endpoint presence, or remote SSE rows look like local entries.
  for (let i = 0; i < rows.length; i += 1) {
    if (Boolean(rows[i].url) !== Boolean(fullDisplay.rowAt(i).hasUrl)) {
      fail(`display projection row ${i} lost published endpoint presence`);
    }
  }
  const shardCount = first.shardsRaw.length;
  if (shardCount !== Math.ceil(rows.length / SEARCH_SHARD_ROWS)) {
    fail(`expected ${Math.ceil(rows.length / SEARCH_SHARD_ROWS)} shards, built ${shardCount}`);
  }
  for (let shard = 0; shard < shardCount; shard += 1) {
    const [start, end] = searchShardRange(rows.length, shard);
    const decodedShard = decodeDisplayRows(decodeContainer(first.shardsRaw[shard], SECTION_ROWS));
    if (decodedShard.rowCount !== end - start) {
      fail(`shard ${shard} holds ${decodedShard.rowCount} rows, expected ${end - start}`);
    }
    for (let local = 0; local < decodedShard.rowCount; local += 1) {
      const fromShard = JSON.stringify(decodedShard.rowAt(local));
      const fromFull = JSON.stringify(fullDisplay.rowAt(start + local));
      if (fromShard !== fromFull) {
        fail(`shard ${shard} row ${local} (global ${start + local}) differs from the full projection`);
      }
    }
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

  // -- 1b. The address's host is not searchable -------------------------------
  // The rule format v4 introduced, stated as a fact rather than left to a
  // comment: a row whose address carries the word and whose own fields do not
  // must not match the word, and the word's match set must not grow back to
  // the share of the catalog it used to cover.
  const hostProbe = rows.findIndex((row) => row.id === HOST_PROBE_ID);
  if (hostProbe === -1) {
    fail(`the host probe row ${HOST_PROBE_ID} is not in the dataset`);
  }
  if (matchesQuery(rows[hostProbe], "github")) {
    fail(
      "`github` matched a row that carries it only in its address's host " +
        "(`io.github.`) — the host segment is not searchable"
    );
  }
  const hostMatches = querySearchIndex(decoded, "github").length;
  const hostRatio = hostMatches / rows.length;
  if (hostRatio > HOST_MATCH_BUDGET_RATIO) {
    fail(
      `the query \`github\` matches ${hostMatches} of ${rows.length} rows ` +
        `(${(hostRatio * 100).toFixed(1)}%), over the ${(HOST_MATCH_BUDGET_RATIO * 100).toFixed(0)}% budget — ` +
        "the address's host is searchable again"
    );
  }

  // -- 2. Determinism -------------------------------------------------------
  const second = buildArtifacts(rows);
  const sameIndex = Buffer.from(first.indexRaw).equals(Buffer.from(second.indexRaw));
  const sameRows = Buffer.from(first.rowsRaw).equals(Buffer.from(second.rowsRaw));
  const sameIndexGz = first.indexGz.equals(second.indexGz);
  const sameRowsGz = first.rowsGz.equals(second.rowsGz);
  const sameShards =
    first.shardsRaw.length === second.shardsRaw.length &&
    first.shardsRaw.every((raw, i) => Buffer.from(raw).equals(Buffer.from(second.shardsRaw[i])));
  const sameShardsGz =
    first.shardsGz.length === second.shardsGz.length &&
    first.shardsGz.every((gz, i) => gz.equals(second.shardsGz[i]));
  if (!sameIndex || !sameRows || !sameIndexGz || !sameRowsGz || !sameShards || !sameShardsGz) {
    fail(
      `a second build differs (index raw ${sameIndex ? "ok" : "DIFFERS"}, ` +
        `rows raw ${sameRows ? "ok" : "DIFFERS"}, index gz ${sameIndexGz ? "ok" : "DIFFERS"}, ` +
        `rows gz ${sameRowsGz ? "ok" : "DIFFERS"}, shards raw ${sameShards ? "ok" : "DIFFERS"}, ` +
        `shards gz ${sameShardsGz ? "ok" : "DIFFERS"})`
    );
  }

  // -- 3. Budgets -----------------------------------------------------------
  const shardGzTotal = first.shardsGz.reduce((sum, gz) => sum + gz.length, 0);
  const shardGzMax = first.shardsGz.reduce((max, gz) => Math.max(max, gz.length), 0);
  const overBudget = [];
  const budgets = [
    ["index raw", first.indexRaw.length, INDEX_RAW_BUDGET],
    ["index gzip", first.indexGz.length, INDEX_GZ_BUDGET],
    ["rows raw", first.rowsRaw.length, ROWS_RAW_BUDGET],
    ["rows gzip", first.rowsGz.length, ROWS_GZ_BUDGET],
    ["shards gzip total", shardGzTotal, SHARD_GZ_BUDGET],
    ["largest shard gzip", shardGzMax, SHARD_MAX_BUDGET],
  ];
  for (const [name, actual, budget] of budgets) {
    if (actual > budget) overBudget.push(`${name} is ${fmt(actual)}, budget ${fmt(budget)}`);
  }
  if (overBudget.length > 0) {
    console.error(`FAIL search index — ${overBudget.length} size budget(s) exceeded:`);
    for (const line of overBudget) console.error(`  - ${line}`);
    process.exit(1);
  }

  // -- 3b. First-window wire cost -------------------------------------------
  // What a first search fetches on top of the index: the shards holding the
  // first `SEARCH_RESULT_WINDOW` matches. This is the number the reader feels
  // on a slow connection, so it is budgeted directly, over the corpus.
  const shardGzSizes = first.shardsGz.map((gz) => gz.length);
  let worstWindow = { query: "", bytes: 0, shards: 0 };
  for (const query of QUERIES) {
    if (query === "") continue;
    const indices = querySearchIndex(decoded, query);
    if (indices.length === 0) continue;
    const shards = new Set();
    for (const index of indices.slice(0, SEARCH_RESULT_WINDOW)) {
      shards.add(Math.floor(index / SEARCH_SHARD_ROWS));
    }
    const bytes = [...shards].reduce((sum, shard) => sum + shardGzSizes[shard], 0);
    if (bytes > worstWindow.bytes) {
      worstWindow = { query, bytes, shards: shards.size };
    }
  }
  if (worstWindow.bytes > WINDOW_GZ_BUDGET) {
    fail(
      `the first window costs ${fmt(worstWindow.bytes)} for ${JSON.stringify(worstWindow.query)}, ` +
        `budget ${fmt(WINDOW_GZ_BUDGET)} — the search path is paying for rows it does not render`
    );
  }
  if (worstWindow.shards > WINDOW_SHARD_BUDGET) {
    fail(
      `the first window spans ${worstWindow.shards} shards for ${JSON.stringify(worstWindow.query)}, ` +
        `budget ${WINDOW_SHARD_BUDGET}`
    );
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
  const shardDir = path.join(
    webRoot,
    "public",
    "data",
    "search-shards",
    `r${SEARCH_SHARD_ROWS}`
  );
  if (existsSync(shardDir)) {
    for (let shard = 0; shard < first.shardsGz.length; shard += 1) {
      const name = `search-shards/r${SEARCH_SHARD_ROWS}/${String(shard).padStart(4, "0")}.bin.gz`;
      const file = path.join(webRoot, "public", "data", name);
      if (!existsSync(file) || !readFileSync(file).equals(first.shardsGz[shard])) {
        stale.push(name);
        if (stale.length > 8) break;
      }
    }
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
      `rows ${fmt(first.rowsRaw.length)} raw / ${fmt(first.rowsGz.length)} gzip, ` +
      `${first.shardsGz.length.toLocaleString("en-US")} shards ${fmt(shardGzTotal)} gzip ` +
      `(largest ${(shardGzMax / 1024).toFixed(1)} KiB); ` +
      `first window (${SEARCH_RESULT_WINDOW} rows) worst ${fmt(worstWindow.bytes)} in ` +
      `${worstWindow.shards} shard(s) for ${JSON.stringify(worstWindow.query)}; ` +
      `\`github\` matches ${hostMatches.toLocaleString("en-US")} rows ` +
      `(${(hostRatio * 100).toFixed(1)}% — the address's host is not searchable); ` +
      `${QUERIES.length} queries agree with matchesQuery over all ` +
      `${rows.length.toLocaleString("en-US")} rows; a second build is byte-identical`
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
