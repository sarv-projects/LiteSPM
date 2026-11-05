#!/usr/bin/env node
// postbuild.mjs — prepare the standalone tree the release workflow archives.
//
// Next's standalone output can copy a local `.env` into the traced tree. That
// file is deployment configuration, not application code; packaging it would
// publish the Turso token or an LLM key inside a release asset. Remove every
// `.env*` entry here, then copy the static assets and verify the tree the
// release expects.

import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.log("postbuild: no .next/standalone (not a standalone build); nothing to do");
  process.exit(0);
}

for (const entry of readdirSync(standalone)) {
  if (entry === ".env" || entry.startsWith(".env.")) {
    rmSync(path.join(standalone, entry), { recursive: true, force: true });
    console.log(`postbuild: removed ${entry} from the standalone tree`);
  }
}

cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
  force: true,
});
cpSync(path.join(root, "public"), path.join(standalone, "public"), {
  recursive: true,
  force: true,
});

const required = [
  path.join(standalone, "server.js"),
  path.join(standalone, "data", "catalog.json"),
  path.join(standalone, ".next", "static"),
  path.join(standalone, "public"),
];
for (const file of required) {
  if (!existsSync(file)) {
    console.error(`postbuild: required standalone path is missing: ${file}`);
    process.exit(1);
  }
}
console.log("postbuild: standalone tree ready");
