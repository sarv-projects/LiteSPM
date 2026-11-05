#!/usr/bin/env node
// Build the committed search artifacts the runtime loads on a cold start.
//
// The exporter routes exist only in development. Start `npm run dev`, then:
//   npm run build:search-index
//
// Two files are produced:
//   data/search-index.json.gz    BM25F postings, document lengths and df
//   data/search-catalog.json.gz  the compact Listing projection search reads
//
// Both are release-gated at load time; a stale file falls back to the full
// catalog instead of serving a row that no longer exists.

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const base = process.env.LITESPM_SEARCH_URL || "http://localhost:3010/api/litespm";
const artifacts = [
  { name: "search-index", file: "search-index.json.gz", validate: (v) => Array.isArray(v.docs) },
  { name: "search-catalog", file: "search-catalog.json.gz", validate: (v) => Array.isArray(v.rows) },
];

async function fetchJson(name) {
  const url = `${base}/${name}`;
  console.log(`fetching ${url} ...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const dataDir = path.join(root, "data");
  for (const artifact of artifacts) {
    const rawPath = path.join(dataDir, `${artifact.name}.json`);
    const raw = existsSync(rawPath) ? readFileSync(rawPath) : await fetchJson(artifact.name);
    const parsed = JSON.parse(raw.toString("utf8"));
    if (!parsed.releaseId || !artifact.validate(parsed)) {
      throw new Error(`${artifact.name} is not a valid LiteSPM search artifact`);
    }
    const compressed = gzipSync(raw, { level: 9 });
    const target = path.join(dataDir, artifact.file);
    writeFileSync(target, compressed);
    console.log(
      `wrote ${target} (${(compressed.length / 1024 / 1024).toFixed(1)} MB gzip, ${(
        raw.length /
        1024 /
        1024
      ).toFixed(1)} MB raw, release ${parsed.releaseId})`,
    );
    if (existsSync(rawPath)) {
      unlinkSync(rawPath);
      console.log(`removed ${rawPath}`);
    }
  }
}

main().catch((error) => {
  console.error(`[search-data] ${error.message}`);
  process.exit(1);
});
