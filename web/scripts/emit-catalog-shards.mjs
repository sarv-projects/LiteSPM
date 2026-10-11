#!/usr/bin/env node
// Emits the browser-served catalog shards into `web/public/data/`.
//
// The served dataset outgrew Cloudflare's hard 25 MiB per-file limit, so the
// single `/data/catalog.json` document is replaced by a small index plus an
// ordered list of shard files, each a complete JSON array of rows. The build
// generates them from `web/data/catalog.json` (the same file the Server
// Components import at build time), so the rows the reader fetches on demand
// are the rows the HTML was rendered from.
//
// Determinism is a requirement: the same source must produce byte-identical
// output, so every output is a pure function of the parsed rows and the source
// bytes (JSON.stringify key order is insertion order, and every document is
// built in a fixed order here). The index carries the sha256 of each shard so
// the deploy audit can verify them without a second source of truth.
//
// No dependencies: node + stdlib only.

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourcePath = path.join(webRoot, "data", "catalog.json");
const outDir = path.join(webRoot, "public", "data");

// Headroom under Cloudflare's 25 MiB per-file cap: a shard is split at ROW
// boundaries (never mid-row), and the budget is enforced on the exact bytes
// written, so no emitted file can approach the cap.
const MAX_SHARD_BYTES = 20 * 1024 * 1024;
const INDEX_FILE = "catalog.json";
const SCHEMA = "litespm-web-shards/v1";

const sha256 = (buf) => `sha256:${createHash("sha256").update(buf).digest("hex")}`;

const source = readFileSync(sourcePath);
const rows = JSON.parse(source.toString("utf8"));
if (!Array.isArray(rows)) {
  console.error(`✖ ${sourcePath} is not a JSON array`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// Remove previously generated files so a row-count change cannot leave
// stale higher-numbered shards next to a fresh index.
for (const name of readdirSync(outDir)) {
  if (/^catalog(-\d{4})?\.json$/.test(name)) {
    rmSync(path.join(outDir, name));
  }
}

const shards = [];
let parts = [];
let bytes = 3; // the enclosing `[`, `]` and trailing `\n`
let index = 0;

const flush = () => {
  if (parts.length === 0) return;
  const body = `[${parts.join(",")}]\n`;
  const file = `catalog-${String(index).padStart(4, "0")}.json`;
  const buf = Buffer.from(body, "utf8");
  writeFileSync(path.join(outDir, file), buf);
  shards.push({ digest: sha256(buf), file, size: buf.length });
  index += 1;
  parts = [];
  bytes = 3;
};

for (const row of rows) {
  const part = JSON.stringify(row);
  const partBytes = Buffer.byteLength(part, "utf8");
  // Close the current shard before adding a row that would reach the budget.
  if (parts.length > 0 && bytes + 1 + partBytes >= MAX_SHARD_BYTES) flush();
  if (parts.length > 0) bytes += 1; // the separating comma
  bytes += partBytes;
  parts.push(part);
}
flush();

// Keys in sorted order; two-space indent; trailing newline.
const indexDoc = {
  datasetDigest: sha256(source),
  rowCount: rows.length,
  schema: SCHEMA,
  shards,
};
writeFileSync(
  path.join(outDir, INDEX_FILE),
  `${JSON.stringify(indexDoc, null, 2)}\n`,
);

const largest = shards.reduce((m, s) => Math.max(m, s.size), 0);
console.log(
  `✔ catalog shards: ${shards.length} shard(s), ${rows.length} rows, ` +
    `largest ${(largest / 1024 / 1024).toFixed(2)} MiB → ${path.relative(process.cwd(), outDir)}`,
);
